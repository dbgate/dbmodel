const _ = require('lodash');
const fs = require('fs');
const toposort = require('toposort');
const JSONNormalize = require('json-normalize');

async function executeAndLog(options, log, command, logSql = true) {
  if (_.isArray(command)) {
    if (log) {
      console.log(log);
    }
    for (const cmd of command) {
      await executeAndLog(options, null, cmd, logSql);
    }
  } else {
    if (log) {
      console.log(log);
    }
    if (logSql) {
      console.log(command);
    }

    const { mssqlPool } = options;
    await mssqlPool.request().query(command);
  }
}

function getColumnDefinitionSql(tabledef, column, allowDefault = false) {
  const dataType = column.type && column.type.toLowerCase() == 'json' ? 'nvarchar(max)' : column.type;
  return (
    `[${column.name}] ${dataType}${column.length ? '(' + (column.length < 0 ? 'MAX' : column.length) + ')' : ''} ` +
    `${column.autoIncrement ? 'IDENTITY' : ''} ${column.notNull ? 'NOT NULL' : 'NULL'}` +
    (allowDefault && column.default !== undefined
      ? ` CONSTRAINT [DF_${tabledef.name}_${column.name}] DEFAULT ${column.default} `
      : '')
  );
}

function getCreateTableSql(tabledef) {
  if (!tabledef.primaryKey) {
    throw new Error(`Missing primary key in table ${tabledef.name}`);
  }

  const deflines = [
    ...tabledef.columns.map(column => getColumnDefinitionSql(tabledef, column, true)),
    `CONSTRAINT PK_${tabledef.name} PRIMARY KEY (${tabledef.primaryKey.map(x => `[${x}]`).join(',')})`,
  ];
  return `CREATE TABLE [${tabledef.name}] (\n${deflines.map(x => '  ' + x).join(',\n')}\n);\n`;
}

function getCreateColumnSql(tabledef, column) {
  if (column.notNull && column.default !== undefined) {
    const nullColumn = { ...column, notNull: false };
    return [
      `ALTER TABLE [${tabledef.name}] ADD ${getColumnDefinitionSql(tabledef, nullColumn)}`,
      `ALTER TABLE [${tabledef.name}] ADD CONSTRAINT [DF_${tabledef.name}_${column.name}] DEFAULT` +
        ` ${column.default} FOR [${column.name}]`,
      `UPDATE [${tabledef.name}] SET [${column.name}]=${column.default}`,
      `ALTER TABLE [${tabledef.name}] ALTER COLUMN ${getColumnDefinitionSql(tabledef, column)}`,
    ];
  }
  return `ALTER TABLE [${tabledef.name}] ADD ${getColumnDefinitionSql(tabledef, column)}`;
}

function getCreateFkSql(tabledef, column, projectTables) {
  const references = column.references;
  const idcol = (projectTables[references] && projectTables[references].primaryKey[0]) || 'id';
  return `ALTER TABLE [${tabledef.name}] ADD CONSTRAINT [FK_${tabledef.name}_${column.name}] FOREIGN KEY ([${column.name}]) REFERENCES [${references}]([${idcol}])`;
}

async function processAddedTables(options) {
  const dbTables = options.databaseStructure.mssqlModel.tables;
  const projectTables = options.projectStructure.tables;
  const adding = _.difference(Object.keys(projectTables), Object.keys(dbTables));
  await Promise.all(
    adding.map(async table => {
      const createSql = getCreateTableSql(projectTables[table]);
      await executeAndLog(options, `Adding table ${table}`, createSql);
    })
  );
}

async function processTableData(options) {
  const projectTables = options.projectStructure.tables;

  for (const table of _.values(projectTables)) {
    const keyCols = table.insertKey || table.primaryKey;
    if (!keyCols) continue;
    if (!table.data) continue;
    const sql = table.data
      .map(row => {
        const keyCond = keyCols.map(col => `[${table.name}].[${col}]='${row[col]}'`).join(' AND ');
        const rowCols = Object.keys(row);
        const notKeyCols = _.difference(rowCols, keyCols);
        const updateCmd = notKeyCols.map(col => `[${col}]='${row[col]}'`).join(',');
        const rowColsCmd = rowCols.map(col => `[${col}]`).join(',');
        const rowValuesCmd = rowCols.map(col => `'${row[col]}'`).join(',');
        const cmd =
          `IF (EXISTS(SELECT * FROM [${table.name}]` +
          ` WHERE ${keyCond})) UPDATE [${table.name}]` +
          ` SET ${updateCmd} WHERE ${keyCond}` +
          ` ELSE INSERT INTO [${table.name}]` +
          ` (${rowColsCmd}) VALUES (${rowValuesCmd});\n`;
        return cmd;
      })
      .join('');
    if (!sql) continue;

    const identityColumn = table.columns.find(col => col.autoIncrement);
    const sqlWithSetup =
      identityColumn && keyCols.includes(identityColumn.name)
        ? `SET IDENTITY_INSERT [${table.name}] ON;\n${sql}SET IDENTITY_INSERT [${table.name}] OFF;`
        : sql;

    await executeAndLog(options, `Filling table ${table.name}`, sqlWithSetup, false);
  }
}

async function processAddedColumns(options) {
  const dbTables = options.databaseStructure.mssqlModel.tables;
  const projectTables = options.projectStructure.tables;

  const both = _.intersection(Object.keys(projectTables), Object.keys(dbTables));
  await Promise.all(
    both.map(async table => {
      const dbTable = dbTables[table];
      const projectTable = projectTables[table];
      const adding = _.difference(
        projectTable.columns.map(x => x.name),
        dbTable.map(x => x.columnName)
      );
      await Promise.all(
        adding.map(async column => {
          const createSql = getCreateColumnSql(
            projectTable,
            projectTable.columns.find(x => x.name == column)
          );
          await executeAndLog(options, `Adding column ${column}`, createSql);
        })
      );
    })
  );
}

function normalizeDefaultValue(value) {
  if (value == null) return null;
  let svalue = value.toString();
  while (svalue.startsWith('(') && svalue.endsWith(')')) {
    svalue = svalue.substring(1, svalue.length - 1);
  }
  return svalue;
}

async function processColumnTypeUpdate(options) {
  const dbTables = options.databaseStructure.mssqlModel.tables;
  const projectTables = options.projectStructure.tables;
  const { suggestions } = options;

  const bothTables = _.intersection(Object.keys(projectTables), Object.keys(dbTables));
  await Promise.all(
    bothTables.map(async table => {
      const dbTable = dbTables[table];
      const projectTable = projectTables[table];
      const bothColumns = _.intersection(
        projectTable.columns.map(x => x.name),
        dbTable.map(x => x.columnName)
      );
      for (const column of bothColumns) {
        const projectCol = projectTable.columns.filter(x => x.name == column)[0];
        const dbCol = dbTable.filter(x => x.columnName == column)[0];

        if ((!dbCol.isNullable) != (projectCol.notNull || false)) {
          const sql = `ALTER TABLE [${table}] ALTER COLUMN ${getColumnDefinitionSql(projectTable, projectCol)};`;
          const message = `Changing column notNull flag ${table}.${column} from ${!dbCol.isNullable} to ${projectCol.notNull}`;
          suggestions.push({ sql, message });
          // await executeAndLog(options, message, sql);
        }

        if (dbCol.columnDefault == null && projectCol.default != null) {
          const sql = `ALTER TABLE [${table}] ADD CONSTRAINT [DF_${table}_${column}] DEFAULT ${projectCol.default} FOR [${column}]`;
          const message = `Creating default value for column ${column} from table ${table}, ${projectCol.default}`;
          suggestions.push({ sql, message });
        }

        if (dbCol.columnDefault != null && projectCol.default == null) {
          const sql = `ALTER TABLE [${table}] DROP CONSTRAINT [DF_${table}_${column}]`;
          const message = `Drop default value for column ${column} from table ${table}`;
          suggestions.push({ sql, message });
        }

        if (
          dbCol.columnDefault != null &&
          projectCol.default != null &&
          normalizeDefaultValue(projectCol.default) != normalizeDefaultValue(dbCol.columnDefault)
        ) {
          const sql = `ALTER TABLE [${table}] DROP CONSTRAINT [DF_${table}_${column}];ALTER TABLE [${table}] ADD CONSTRAINT [DF_${table}_${column}] DEFAULT ${projectCol.default} FOR [${column}]`;
          const message = `Changing default value for column ${column} from table ${table}, ${projectCol.default}`;
          suggestions.push({ sql, message });
        }
      }
    })
  );
}

async function addMissingReferences(options) {
  const projectTables = options.projectStructure.tables;
  const dbReferences = options.databaseStructure.mssqlModel.references;

  await Promise.all(
    Object.keys(projectTables).map(async table => {
      await Promise.all(
        projectTables[table].columns
          .filter(x => x.references)
          .filter(x => !dbReferences.find(y => table == y.fkTable && x.name == y.fkColumn))
          .map(async column => {
            const createSql = getCreateFkSql(projectTables[table], column, projectTables);
            await executeAndLog(options, `Adding foreign key ${table}.${column.name}`, createSql);
          })
      );
    })
  );
}

function getProjectIndexes(options) {
  const projectTables = options.projectStructure.tables;

  const projectIndexArray = _.flatten(
    _.values(
      _.mapValues(projectTables, table =>
        (table.indexes || []).map(index => ({
          indexName: index.name,
          isUnique: index.unique || false,
          filterDefinition: index.filter,
          continueOnError: index.continueOnError,
          tableName: table.name,
          columns: index.columns.map(col => ({
            columnName: col,
            isIncludedColumn: false,
          })),
        }))
      )
    )
  );
  return projectIndexArray;
}

function jsonNormalizeIndex(index) {
  const indexCopy = { ...index };
  if (!indexCopy.filterDefinition) delete indexCopy.filterDefinition;
  delete indexCopy.continueOnError;
  if (indexCopy.filterDefinition) {
    indexCopy.filterDefinition = indexCopy.filterDefinition
      .replace(/\s/g, '')
      .replace(/\(/g, '')
      .replace(/\)/g, '')
      .replace(/\[/g, '')
      .replace(/\]/g, '');
  }
  return JSONNormalize.stringifySync(indexCopy);
}

async function processIndexes(options) {
  const dbIndexes = options.databaseStructure.mssqlModel.indexes;
  const projectTables = options.projectStructure.tables;
  const { suggestions } = options;

  const dbIndexArray = _.flatten(_.values(dbIndexes).map(it => _.values(it)));
  const projectIndexArray = getProjectIndexes(options, projectTables);

  for (const dbIndex of dbIndexArray) {
    const prjIndex = projectIndexArray.find(
      x => x.tableName === dbIndex.tableName && x.indexName === dbIndex.indexName
    );
    if (prjIndex != null && (prjIndex == null || jsonNormalizeIndex(prjIndex) != jsonNormalizeIndex(dbIndex))) {
      await executeAndLog(
        options,
        `Removing index ${dbIndex.indexName} on ${dbIndex.tableName}`,
        `DROP INDEX [${dbIndex.indexName}] ON [${dbIndex.tableName}]`
      );
    }

    if (prjIndex == null) {
      suggestions.push({
        message: `Index ${dbIndex.indexName} on ${dbIndex.tableName} not found in project`,
        sql: `DROP INDEX [${dbIndex.indexName}] ON [${dbIndex.tableName}];`,
      });
    }
  }

  // eslint-disable-next-line require-atomic-updates
  for (const prjIndex of projectIndexArray) {
    const dbIndex = dbIndexArray.find(x => x.tableName === prjIndex.tableName && x.indexName === prjIndex.indexName);
    if (dbIndex == null || jsonNormalizeIndex(prjIndex) != jsonNormalizeIndex(dbIndex)) {
      try {
        await executeAndLog(
          options,
          `Creating index ${prjIndex.indexName} on ${prjIndex.tableName}`,
          `CREATE ${prjIndex.isUnique ? 'UNIQUE' : ''} INDEX [${prjIndex.indexName}] ON [${
            prjIndex.tableName
          }] (${prjIndex.columns.map(x => `[${x.columnName}]`).join(',')}) ${
            prjIndex.filterDefinition ? `WHERE ${prjIndex.filterDefinition}` : ''
          }`
        );
      } catch (e) {
        if (prjIndex.continueOnError) {
          console.log(`FAILED creating index ${prjIndex.indexName}: ${e.message}`);
          console.log('Continue becase of continueOnError');
        } else {
          throw e;
        }
      }
    }
  }
}

async function detectTablesOnlyInDb(options) {
  const projectTables = options.projectStructure.tables;
  const dbTables = options.databaseStructure.mssqlModel.tables;
  const { suggestions } = options;

  const removed = _.difference(Object.keys(dbTables), Object.keys(projectTables));
  removed.forEach(table => {
    suggestions.push({
      message: `Table ${table} is only in DB (missing in project)`,
      sql: `DROP TABLE [${table}];`,
    });
  });
}

async function detectColumnsOnlyInDb(options) {
  const projectTables = options.projectStructure.tables;
  const dbTables = options.databaseStructure.mssqlModel.tables;
  const { suggestions } = options;

  const bothTables = _.intersection(Object.keys(projectTables), Object.keys(dbTables));
  for (const tableName of bothTables) {
    const dbTable = dbTables[tableName];
    const projectTable = projectTables[tableName];

    const removed = _.difference(
      dbTable.map(x => x.columnName),
      projectTable.columns.map(x => x.name)
    );
    suggestions.push(
      ...removed.map(col => ({
        message: `Column ${col} from table ${tableName} is only in DB (missing in project)`,
        sql: `ALTER TABLE [${tableName}] DROP COLUMN [${col}];`,
      }))
    );
  }
}

async function processObjects(
  options,
  dbObjects,
  projectObjects,
  objectTypeName,
  createRegex,
  alterCommand,
  sortObjects
) {
  const addedObjects = _.difference(Object.keys(projectObjects), Object.keys(dbObjects));
  const bothObjects = _.intersection(Object.keys(projectObjects), Object.keys(dbObjects));

  const addedSorted = sortObjects ? sortObjects(addedObjects, projectObjects) : addedObjects;

  for (const addedObject of addedSorted) {
    await executeAndLog(options, `Creating ${objectTypeName} ${addedObject}`, projectObjects[addedObject]);
  }
  for (const objectName of bothObjects) {
    if (dbObjects[objectName] == projectObjects[objectName]) continue;
    const sql = projectObjects[objectName].replace(createRegex, alterCommand);
    await executeAndLog(options, `Altering ${objectTypeName} ${objectName}`, sql);
  }
}

function sortViewsByDependency(viewNames, viewDict) {
  const edges = [];
  for (const viewName of viewNames) {
    edges.push([viewName, null]);
    const viewText = viewDict[viewName];
    for (const otherView of viewNames) {
      if (otherView === viewName) continue;
      if ((' ' + viewText + ' ').match('[\\W]' + otherView + '[\\W]')) {
        edges.push([otherView, viewName]);
      }
    }
  }
  return toposort(edges).filter(x => x);
}

async function deploy(options) {
  options.suggestions = [];

  await processAddedTables(options);
  await processAddedColumns(options);
  await processTableData(options);
  await processColumnTypeUpdate(options);
  await addMissingReferences(options);
  await processIndexes(options);
  await detectTablesOnlyInDb(options);
  await detectColumnsOnlyInDb(options);
  await processObjects(
    options,
    options.databaseStructure.views,
    options.projectStructure.views,
    'view',
    /create\s+view/i,
    'ALTER VIEW',
    sortViewsByDependency
  );
  await processObjects(
    options,
    options.databaseStructure.procedures,
    options.projectStructure.procedures,
    'procedure',
    /create\s+procedure/i,
    'ALTER PROCEDURE'
  );
  await processObjects(
    options,
    options.databaseStructure.functions,
    options.projectStructure.functions,
    'function',
    /create\s+function/i,
    'ALTER FUNCTION'
  );

  if (options.suggestions.length > 0) {
    console.log(`Suggestions: ${options.suggestions.length}`);
    for (const { message } of options.suggestions) {
      console.log(message);
    }

    console.log('-------------------------------------------------------------');
    for (const { sql } of options.suggestions) {
      console.log(sql);
      console.log('GO');
    }
  }

  return options;
}

module.exports = deploy;

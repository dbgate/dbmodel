const _ = require('lodash');
const toposort = require('toposort');

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

function getCreateIndexSql(prjIndex) {
  return `CREATE ${prjIndex.isUnique ? 'UNIQUE' : ''} INDEX [${prjIndex.indexName}] ON [${
    prjIndex.tableName
  }] (${prjIndex.columns.map(x => `[${x.columnName}]`).join(',')}) ${
    prjIndex.filterDefinition ? `WHERE ${prjIndex.filterDefinition}` : ''
  }`;
}

function getProjectIndexesAsDatabase(projectTables) {
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
  return _.compact(toposort(edges));
}

function getSqlExpression(data) {
  if (data == null) return 'NULL';
  if (data === false) return '0';
  if (data === true) return '1';
  if (_.isNumber(data)) return data.toString();
  return `'${data.replace(/'/g, "''")}'`;
}

function getFillTableSql(table) {
  const keyCols = table.insertKey || table.primaryKey;
  if (!keyCols) return null;
  if (!table.data) return null;
  const sql = table.data
    .map(row => {
      const keyCond = keyCols.map(col => `[${table.name}].[${col}]=${getSqlExpression(row[col])}`).join(' AND ');
      const rowCols = Object.keys(row);
      const notKeyCols = _.difference(rowCols, keyCols);
      const updateCmd = notKeyCols.map(col => `[${col}]=${getSqlExpression(row[col])}`).join(',');
      const rowColsCmd = rowCols.map(col => `[${col}]`).join(',');
      const rowValuesCmd = rowCols.map(col => `${getSqlExpression(row[col])}`).join(',');
      const cmd =
        `IF (EXISTS(SELECT * FROM [${table.name}]` +
        ` WHERE ${keyCond})) UPDATE [${table.name}]` +
        ` SET ${updateCmd} WHERE ${keyCond}` +
        ` ELSE INSERT INTO [${table.name}]` +
        ` (${rowColsCmd}) VALUES (${rowValuesCmd});\n`;
      return cmd;
    })
    .join('');
  if (!sql) return null;

  const identityColumn = table.columns.find(col => col.autoIncrement);
  const sqlWithSetup =
    identityColumn && keyCols.includes(identityColumn.name)
      ? `SET IDENTITY_INSERT [${table.name}] ON;\n${sql}SET IDENTITY_INSERT [${table.name}] OFF;`
      : sql;

  return sqlWithSetup;
}

module.exports = {
  getColumnDefinitionSql,
  getCreateTableSql,
  getCreateColumnSql,
  getCreateFkSql,
  getCreateIndexSql,
  getProjectIndexesAsDatabase,
  getFillTableSql,
  sortViewsByDependency,
};

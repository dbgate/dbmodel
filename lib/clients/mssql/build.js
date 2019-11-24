const _ = require('lodash');
const fs = require('fs');
const endOfLine = require('os').EOL;
const {
  getCreateTableSql,
  getCreateColumnSql,
  getCreateFkSql,
  getCreateIndexSql,
  getProjectIndexesAsDatabase,
  sortViewsByDependency,
} = require('./getsql');

function writeLine(options, data) {
  fs.writeSync(options.outputDescriptor, data);
  fs.writeSync(options.outputDescriptor, endOfLine);
}

function buildTables(options) {
  const tables = options.projectStructure.tables;

  for (const tableName of _.keys(tables)) {
    const table = tables[tableName];
    writeLine(options, `IF (NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='${tableName}'))`);
    writeLine(options, 'BEGIN');
    writeLine(options, `PRINT 'Creating table ${tableName}'`);
    writeLine(options, getCreateTableSql(table));
    writeLine(options, 'END');
    writeLine(options, 'ELSE');
    writeLine(options, 'BEGIN');
    writeLine(options, `PRINT 'Table ${tableName} already exists'`);
    writeLine(options, 'END');
    writeLine(options, 'GO');

    for (const column of table.columns) {
      writeLine(
        options,
        `IF (NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='${tableName}' AND COLUMN_NAME='${column.name}'))`
      );
      writeLine(options, 'BEGIN');
      writeLine(options, `PRINT 'Creating column ${tableName}.${column.name}'`);
      writeLine(options, getCreateColumnSql(table, column));
      writeLine(options, 'END');
      writeLine(options, 'GO');
    }
  }

  for (const tableName of _.keys(tables)) {
    const table = tables[tableName];
    for (const column of table.columns) {
      if (column.references) {
        writeLine(
          options,
          `IF (NOT EXISTS(
            SELECT *
            FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS C
            INNER JOIN INFORMATION_SCHEMA.TABLE_CONSTRAINTS FK 
              ON C.CONSTRAINT_NAME = FK.CONSTRAINT_NAME AND c.CONSTRAINT_SCHEMA = FK.CONSTRAINT_SCHEMA
            LEFT JOIN INFORMATION_SCHEMA.TABLE_CONSTRAINTS PK 
              ON C.UNIQUE_CONSTRAINT_NAME = PK.CONSTRAINT_NAME AND c.UNIQUE_CONSTRAINT_SCHEMA = PK.CONSTRAINT_SCHEMA
            LEFT JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE CU 
              ON C.CONSTRAINT_NAME = CU.CONSTRAINT_NAME AND C.CONSTRAINT_SCHEMA = CU.CONSTRAINT_SCHEMA
            WHERE c.CONSTRAINT_SCHEMA = 'dbo' 
              AND FK.TABLE_NAME='${tableName}'
              AND PK.TABLE_NAME='${column.references}'
              AND CU.COLUMN_NAME = '${column.name}'
            ))
            `
        );
        writeLine(options, 'BEGIN');
        writeLine(options, `PRINT 'Creating foreign key on ${tableName}.${column.name}'`);
        writeLine(options, getCreateFkSql(table, column, tables));
        writeLine(options, 'END');
        writeLine(options, 'GO');
      }
    }
  }

  const projectIndexArray = getProjectIndexesAsDatabase(tables);

  for (const index of projectIndexArray) {
    writeLine(
      options,
      `IF (NOT EXISTS(
      SELECT *
      FROM sys.indexes i
      inner join sys.objects o ON o.object_id = i.object_id
      WHERE i.name='${index.indexName}' and o.name='${index.tableName}'
      and i.is_primary_key=0
      and i.is_hypothetical=0 and indexproperty(i.object_id, i.name, 'IsStatistics') = 0
      and objectproperty(i.object_id, 'IsUserTable') = 1
      and i.index_id between 1 and 254
      ))`
    );
    writeLine(options, 'BEGIN');
    writeLine(options, `PRINT 'Creating index ${index.indexName} on ${index.tableName}'`);
    writeLine(options, getCreateIndexSql(index));
    writeLine(options, 'END');
    writeLine(options, 'GO');
  }
}

function buildObjects(
  options,
  projectObjects,
  objectTypeName,
  createRegex,
  createCommand,
  alterCommand,
  info_schema,
  info_schema_column,
  sortObjects
) {
  const sortedList = sortObjects ? sortObjects(_.keys(projectObjects), projectObjects) : _.keys(projectObjects);

  for (const objectName of sortedList) {
    const objectSql = projectObjects[objectName];
    writeLine(options, `DECLARE @sql NVARCHAR(MAX) = '';`);

    writeLine(
      options,
      `IF (NOT EXISTS(
      SELECT * FROM INFORMATION_SCHEMA.${info_schema} WHERE ${info_schema_column}='${objectName}'
      ))`
    );
    writeLine(options, 'BEGIN');
    writeLine(options, `PRINT 'Creating ${objectTypeName} ${objectName}'`);
    writeLine(options, `SET @sql = '${createCommand}';`);
    writeLine(options, 'END');
    writeLine(options, `ELSE`);
    writeLine(options, 'BEGIN');
    writeLine(options, `PRINT 'Altering ${objectTypeName} ${objectName}'`);
    writeLine(options, `SET @sql = '${alterCommand}';`);
    writeLine(options, 'END');

    writeLine(options, `SET @sql = @sql + ' ' + '${objectSql.replace(createRegex, '').replace(/'/g, "''")}';`);
    writeLine(options, `EXEC sp_executesql @sql;`);
    writeLine(options, 'GO');
  }
}

async function build(options) {
  buildTables(options);

  buildObjects(
    options,
    options.projectStructure.views,
    'view',
    /create\s+view/i,
    'CREATE VIEW',
    'ALTER VIEW',
    'VIEWS',
    'TABLE_NAME',
    sortViewsByDependency
  );
  buildObjects(
    options,
    options.projectStructure.procedures,
    'procedure',
    /create\s+procedure/i,
    'CREATE PROCEDURE',
    'ALTER PROCEDURE',
    'ROUTINES',
    'ROUTINE_NAME'
  );
  buildObjects(
    options,
    options.projectStructure.functions,
    'function',
    /create\s+function/i,
    'CREATE FUNCTION',
    'ALTER FUNCTION',
    'ROUTINES',
    'ROUTINE_NAME'
  );
}

module.exports = build;

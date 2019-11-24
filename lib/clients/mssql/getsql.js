const _ = require('lodash');

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

module.exports = {
  getColumnDefinitionSql,
  getCreateTableSql,
  getCreateColumnSql,
  getCreateFkSql,
  getCreateIndexSql,
  getProjectIndexesAsDatabase,
};

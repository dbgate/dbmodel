const _ = require('lodash');

function extractCamelCaseResult(result) {
  return result.recordset.map(x => _.mapKeys(x, (v, k) => _.camelCase(k)));
}

async function loadColumnsByTablesFromDatabase({ mssqlPool }) {
  const result = await mssqlPool.request().query(`
  select c.name as column_name, t.name as type_name, c.object_id, c.is_identity,
	c.max_length, c.precision, c.scale, c.is_nullable,
	d.definition as default_value, d.name as default_constraint,
  m.definition as computed_expression, m.is_persisted, c.column_id,
  o.name as table_name, ic.character_maximum_length
from sys.columns c
inner join sys.types t on c.system_type_id = t.system_type_id and c.user_type_id = t.user_type_id
inner join sys.objects o on c.object_id = o.object_id
inner join sys.schemas u on u.schema_id = o.schema_id
left join sys.default_constraints d on c.default_object_id = d.object_id
left join sys.computed_columns m on m.object_id = c.object_id and m.column_id = c.column_id
inner join information_schema.columns ic on ic.table_name = o.name and ic.column_name = c.name and ic.table_schema='dbo'
where o.type = 'U' and u.name = 'dbo'
order by c.column_id
`);
  const columns = extractCamelCaseResult(result);
  return _.groupBy(columns, 'tableName');
}

async function loadIndexesByTablesFromDatabase({ mssqlPool }) {
  const result = await mssqlPool.request().query(`select 
  i.object_id, 
  i.name as index_name, 
  i.type_desc, 
  i.is_unique,
  i.index_id, 
  i.is_unique_constraint, 
  i.filter_definition,
  c.name as column_name,
  ic.key_ordinal,
  ic.is_included_column,
  o.name as table_name
from sys.indexes i
inner join sys.index_columns ic on i.index_id = ic.index_id and i.object_id = ic.object_id
inner join sys.columns c ON c.object_id = i.object_id and c.column_id = ic.column_id
inner join sys.objects o ON o.object_id = i.object_id
where i.is_primary_key=0
and i.is_hypothetical=0 and indexproperty(i.object_id, i.name, 'IsStatistics') = 0
and objectproperty(i.object_id, 'IsUserTable') = 1
and i.index_id between 1 and 254
order by ic.key_ordinal`);
  const columns = extractCamelCaseResult(result);
  const columnsByTable = _.groupBy(columns, 'tableName');
  const indexesByTable = _.mapValues(columnsByTable, cols => _.groupBy(cols, 'indexName'));
  const indexesByTable2 = _.mapValues(indexesByTable, tableIndexes =>
    _.mapValues(tableIndexes, columns => ({
      ..._.pick(columns[0], ['tableName', 'indexName', 'isUnique', 'filterDefinition']),
      columns: columns.map(x => _.pick(x, ['columnName', 'isIncludedColumn'])),
    }))
  );
  return indexesByTable2;
}

async function loadViewsFromDatabase({ mssqlPool }) {
  const result = await mssqlPool.request().query(`select * from information_schema.views where TABLE_SCHEMA = 'dbo'`);
  return _.mapValues(_.keyBy(extractCamelCaseResult(result), 'tableName'), 'viewDefinition');
}

async function loadRoutinesFromDatabase({ mssqlPool }) {
  const result = await mssqlPool.request()
    .query(`select s.name as ROUTINE_NAME, u.name as ROUTINE_SCHEMA, c.text AS ROUTINE_DEFINITION, LTRIM(RTRIM(s.type)) AS ROUTINE_TYPE
  from sys.objects s
  inner join sys.syscomments c on s.object_id = c.id
  inner join sys.schemas u on u.schema_id = s.schema_id
  where u.name='dbo'
  order by u.name, s.name, c.colid
  `);
  const camelCaseResult = extractCamelCaseResult(result);
  const functionsArray = camelCaseResult.filter(
    x => x.routineType == 'IF' || x.routineType == 'FN' || x.routineType == 'TF'
  );
  const proceduresArray = camelCaseResult.filter(x => x.routineType == 'P');
  return {
    functions: _.mapValues(_.groupBy(functionsArray, 'routineName'), x => x.map(y => y.routineDefinition).join('')),
    procedures: _.mapValues(_.groupBy(proceduresArray, 'routineName'), x => x.map(y => y.routineDefinition).join('')),
  };
}

async function loadReferencesFromDatabase({ mssqlPool }) {
  const result = await mssqlPool.request().query(`SELECT
  fkSchema = FK.TABLE_SCHEMA,
  fkTable = FK.TABLE_NAME,
  fkColumn = CU.COLUMN_NAME,
  
  pkSchema = PK.TABLE_SCHEMA,
  pkTable = PK.TABLE_NAME,
  
  constraintName = C.CONSTRAINT_NAME
  
  FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS C
  INNER JOIN INFORMATION_SCHEMA.TABLE_CONSTRAINTS FK 
    ON C.CONSTRAINT_NAME = FK.CONSTRAINT_NAME AND c.CONSTRAINT_SCHEMA = FK.CONSTRAINT_SCHEMA
  LEFT JOIN INFORMATION_SCHEMA.TABLE_CONSTRAINTS PK 
    ON C.UNIQUE_CONSTRAINT_NAME = PK.CONSTRAINT_NAME AND c.UNIQUE_CONSTRAINT_SCHEMA = PK.CONSTRAINT_SCHEMA
  LEFT JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE CU 
    ON C.CONSTRAINT_NAME = CU.CONSTRAINT_NAME AND C.CONSTRAINT_SCHEMA = CU.CONSTRAINT_SCHEMA
  WHERE c.CONSTRAINT_SCHEMA = 'dbo'
  `);
  return result.recordset;
}

async function loadPrimaryKeysFromDatabase({ mssqlPool }) {
  const result = await mssqlPool.request()
    .query(`select key_column_usage.table_name, key_column_usage.column_name from information_schema.table_constraints
  inner join information_schema.key_column_usage on key_column_usage.constraint_name = table_constraints.constraint_name and key_column_usage.constraint_schema = table_constraints.constraint_schema
  where constraint_type = 'PRIMARY KEY' and table_constraints.constraint_schema = 'dbo'
  order by ordinal_position
  `);
  return _(result.recordset)
    .groupBy('table_name')
    .mapValues(x => _.map(x, 'column_name'))
    .value();
}

function parseLogicalModel({ tables, primaryKeys, references, views, procedures, functions, indexes }) {
  const resTables = {};
  for (const table of Object.keys(tables)) {
    let columns = tables[table];
    const resTable = { name: table, columns: [] };
    resTables[table] = resTable;
    for (const column of columns) {
      const resColumn = {
        name: column.columnName,
        type: column.typeName,
      };
      if (column.characterMaximumLength) resColumn.length = column.characterMaximumLength;
      if (column.isIdentity) resColumn.autoIncrement = true;
      if (!column.isNullable) resColumn.notNull = true;

      const refColumn = references.find(x => x.fkTable == table && x.fkColumn == column.columnName);
      if (refColumn) {
        resColumn.references = refColumn.pkTable;
      }
      resTable.columns.push(resColumn);
    }
    if (table in primaryKeys) {
      resTable.primaryKey = primaryKeys[table];
    }
    if (table in indexes) {
      resTable.indexes = [];

      for (const { indexName, isUnique, columns } of Object.values(indexes[table])) {
        const resIndex = {
          name: indexName,
          unique: isUnique,
          columns: columns.map(x => x.columnName),
        };
        resTable.indexes.push(resIndex);
      }
    }
  }

  return {
    tables: resTables,
    views,
    procedures,
    functions,
  };
}

async function load(options) {
  const tables = await loadColumnsByTablesFromDatabase(options);
  console.log(`Loaded ${Object.keys(tables).length} tables`);
  const primaryKeys = await loadPrimaryKeysFromDatabase(options);
  console.log(`Loaded ${Object.keys(primaryKeys).length} primary keys`);
  const references = await loadReferencesFromDatabase(options);
  console.log(`Loaded ${references.length} references`);
  const views = await loadViewsFromDatabase(options);
  console.log(`Loaded ${Object.keys(views).length} views`);
  const { procedures, functions } = await loadRoutinesFromDatabase(options);
  console.log(`Loaded ${Object.keys(procedures).length} procedures and ${Object.keys(functions).length} functions`);
  const indexes = await loadIndexesByTablesFromDatabase(options);
  console.log(`Loaded indexes for ${Object.keys(indexes).length} tables`);

  const mssqlModel = {
    tables,
    primaryKeys,
    references,
    views,
    procedures,
    functions,
    indexes,
  };
  const logicalModel = parseLogicalModel(mssqlModel);
  return { ...logicalModel, mssqlModel };
}

module.exports = load;

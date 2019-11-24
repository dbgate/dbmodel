const _ = require('lodash');
const connect = require('./connect');
const query = require('./query');

async function load(options) {
  await connect(options);
  const { client } = options;
  const loadFunc = require(`./clients/${client}/load`);
  options.databaseStructure = await loadFunc(options);
  if (options.loadDataCondition) {
    const { tables } = options.databaseStructure;
    for (const tableName of _.keys(tables)) {
      const table = tables[tableName];
      if (!options.loadDataCondition(table)) continue;
      const data = await query(options, `SELECT * FROM [${tableName}]`);
      table.data = data;
    }
  }
  return options;
}

module.exports = load;

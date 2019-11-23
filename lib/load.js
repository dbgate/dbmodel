const connect = require('./connect');

async function load(options) {
  await connect(options);
  const { client } = options;
  const loadFunc = require(`./clients/${client}/load`);
  options.databaseStructure = await loadFunc(options);
  return options;
}

module.exports = load;

async function query(options, sql) {
  const { client } = options;
  const queryFunc = require(`./clients/${client}/query`);
  return await queryFunc(options, sql);
}

module.exports = query;

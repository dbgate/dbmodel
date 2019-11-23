const mssql = require('mssql');

async function connect(options) {
  if (options.mssqlPool) return options; // already connected
  const { connection } = options;
  options.mssqlPool = await mssql.connect(connection);
}

module.exports = connect;

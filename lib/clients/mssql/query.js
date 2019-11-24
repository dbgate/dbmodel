async function query({ mssqlPool }, sql) {
  const result = await mssqlPool.request().query(sql);
  return result.recordset;
}

module.exports = query;

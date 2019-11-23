const dbmodel = require('../../lib');

dbmodel.runAndExit(dbmodel.dump({
  client: 'mssql',
  connection: {
    server: '127.0.0.1',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: 'Chinook',
  },
  outputDir: 'output',
}));

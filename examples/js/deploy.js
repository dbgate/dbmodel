const dbmodel = require('../../lib');

dbmodel.runAndExit(
  dbmodel.deploy({
    client: 'mssql',
    connection: {
      server: '127.0.0.1',
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: 'Chinook_Model',
    },
    hooks: [dbmodel.hooks.autoIndexForeignKeys],
    projectDir: 'model',
  })
);

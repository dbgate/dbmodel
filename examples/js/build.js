const dbmodel = require('../../lib');

dbmodel.runAndExit(dbmodel.build({
  client: 'mssql',
  outputFile: 'database.sql',
  hooks: [dbmodel.hooks.autoIndexForeignKeys],
  projectDir: 'model',
}));

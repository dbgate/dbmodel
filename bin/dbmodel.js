#!/usr/bin/env node

const program = require('commander');
const dbmodel = require('../lib');

program
  .option('-s, --server <server>', 'server host')
  .option('-u, --user <user>', 'user name')
  .option('-p, --password <password>', 'password')
  .option('-d, --database <database>', 'database name')
  .option('--auto-index-foreign-keys', 'automatically adds indexes to all foreign keys')
  .option(
    '--load-data-condition <condition>',
    'regex, which table data will be loaded and stored in model (in load command)'
  )
  .requiredOption('-c, --client <client>', 'client name, must be mssql');

program
  .command('deploy <projectDir>')
  .description('Deploys model to database')
  .action(projectDir => {
    const { client, server, user, password, database } = program;
    const hooks = [];
    if (program.autoIndexForeignKeys) hooks.push(dbmodel.hooks.autoIndexForeignKeys);
    dbmodel.runAndExit(
      dbmodel.deploy({
        client,
        connection: {
          server,
          user,
          password,
          database,
        },
        hooks,
        projectDir,
      })
    );
  });

program
  .command('load <outputDir>')
  .description('Loads model from database')
  .action(outputDir => {
    const { client, server, user, password, database } = program;
    const loadDataCondition = program.loadDataCondition
      ? table => table.name.match(new RegExp(program.loadDataCondition, 'i'))
      : null;
    const hooks = [];
    dbmodel.runAndExit(
      dbmodel.dump({
        client,
        connection: {
          server,
          user,
          password,
          database,
        },
        hooks,
        outputDir,
        loadDataCondition,
      })
    );
  });

program.parse(process.argv);

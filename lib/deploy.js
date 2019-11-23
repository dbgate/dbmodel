const read = require('./read');
const load = require('./load');
const connect = require('./connect');
const runHooks = require('./hooks/runHooks');

async function deploy(options) {
  const { client } = options;

  options = await connect(options);
  options = await read(options);
  options = await load(options);

  const deployFunc = require(`./clients/${client}/deploy`);

  runHooks(options, 'before-deploy');
  await deployFunc(options);
  runHooks(options, 'after-deploy');

  return options;
}

module.exports = deploy;

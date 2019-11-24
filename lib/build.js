var fs = require('fs');
const read = require('./read');
const runHooks = require('./hooks/runHooks');

async function build(options) {
  const { client } = options;
  await read(options);

  const { outputFile } = options;
  options.outputDescriptor = fs.openSync(outputFile, 'w');

  runHooks(options, 'before-build');

  const buildFunc = require(`./clients/${client}/build`);
  await buildFunc(options);

  runHooks(options, 'after-build');

  fs.close(options.outputDescriptor);

  return options;
}

module.exports = build;

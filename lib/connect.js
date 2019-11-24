async function connect(options) {
  const { client } = options;
  const connectFunc = require(`./clients/${client}/connect`);
  await connectFunc(options);
  return options;
}

module.exports = connect;

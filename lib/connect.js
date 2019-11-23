async function connect(options) {
  const { client } = options;
  const connectFunc = require(`./clients/${client}/connect`);
  const res = await connectFunc(options);
  return {
    ...options,
    ...res,
  };
}

module.exports = connect;

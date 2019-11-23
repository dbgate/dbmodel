const load = require('./load');
const connect = require('./connect');
const dump = require('./dump');
const deploy = require('./deploy');
const hooks = require('./hooks');
const runAndExit = require('./runAndExit');

module.exports = {
  load,
  connect,
  dump,
  deploy,
  hooks,
  runAndExit,
};

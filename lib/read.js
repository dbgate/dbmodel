const _ = require('lodash');
const readdirSyncRecursive = require('fs-readdir-recursive');
const yaml = require('js-yaml');
const path = require('path');
const fs = require('fs');

function readTablesFromDirectory(directory) {
  const files = readdirSyncRecursive(directory);
  const tables = _.keyBy(
    files
      .filter(x => x.endsWith('.table.yaml'))
      .map(file => yaml.safeLoad(fs.readFileSync(path.join(directory, file)))),
    'name'
  );
  return tables;
}

function escapeRegExp(str) {
  return str.replace(/([.*+?^=!:${}()|[\]/\\])/g, '\\$1');
}

function processReplacements(value, replacements) {
  if (!replacements) return value;
  return Object.keys(replacements).reduce(
    (acc, key) => acc.replace(new RegExp(escapeRegExp(key), 'g'), replacements[key]),
    value
  );
}

function readObjectsFromDirectory(directory, extension, replacements) {
  const files = readdirSyncRecursive(directory).filter(x => x.endsWith(extension));
  const views = files.map(file =>
    processReplacements(fs.readFileSync(path.join(directory, file)).toString(), replacements)
  );
  return _.zipObject(
    files.map(name => {
      const res = name.slice(0, -extension.length);
      const max = Math.max(res.lastIndexOf('/'), res.lastIndexOf('\\'));
      if (max > 0) return res.substring(max + 1);
      return res;
    }),
    views
  );
}

async function read(options) {
  const { projectDir, replacements } = options;
  const tables = readTablesFromDirectory(projectDir);
  const views = readObjectsFromDirectory(projectDir, '.view.sql', replacements);
  const procedures = readObjectsFromDirectory(projectDir, '.proc.sql', replacements);
  const functions = readObjectsFromDirectory(projectDir, '.func.sql', replacements);
  options.projectStructure = {
    tables,
    views,
    procedures,
    functions,
  };
  return options;
}

module.exports = read;

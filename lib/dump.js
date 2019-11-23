const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const load = require('./load');

async function dump(options) {
  try {
    const { outputDir } = options;
    const { databaseStructure } = await load(options);
    const { tables, views, procedures, functions } = databaseStructure;

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir);
    }

    for (const table of Object.keys(tables)) {
      const content = yaml.dump(tables[table]);
      fs.writeFileSync(path.join(outputDir, table + '.table.yaml'), content);
    }

    for (const view of Object.keys(views)) {
      fs.writeFileSync(path.join(outputDir, view + '.view.sql'), views[view]);
    }

    for (const procedure of Object.keys(procedures)) {
      fs.writeFileSync(path.join(outputDir, procedure + '.proc.sql'), procedures[procedure]);
    }

    for (const func of Object.keys(functions)) {
      fs.writeFileSync(path.join(outputDir, func + '.func.sql'), functions[func]);
    }
  } catch (err) {
    console.log('dbmodel error: ', err);
  }
}

module.exports = dump;

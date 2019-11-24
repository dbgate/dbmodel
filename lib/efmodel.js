// generate EntityFramework Core model

const _ = require('lodash');
const fs = require('fs');
const read = require('./read');

function getDotNetType(type) {
  if (!type) return null;
  if (type.includes('char')) return 'string';
  if (type.includes('bigint')) return 'long';
  if (type.includes('int')) return 'int';
  if (type.includes('date')) return 'DateTime';
  if (type.includes('decimal')) return 'decimal';
  if (type.includes('bit')) return 'bool';
  if (type === 'json') return 'string';
  return null;
}

function getDotNetName(name) {
  if (name === 'params') return '@params';
  return name;
}

async function efmodel(options) {
  const { outputFile } = options;
  const { projectStructure, namespaceName, contextClassName } = await read(options);

  const { tables } = projectStructure;

  let s = '';
  s += 'using System;\n';
  s += 'using Microsoft.EntityFrameworkCore;\n';
  s += 'using System.ComponentModel.DataAnnotations.Schema;\n';
  s += 'using System.Collections.Generic;\n';
  s += 'using Newtonsoft.Json;\n';

  s += `namespace ${namespaceName} {\n`;
  s += `    partial class ${contextClassName} { \n`;
  for (const tableName of Object.keys(tables)) {
    s += `        public DbSet<Db${tableName}> ${tableName} { get; set; }\n`;
  }

  s += '        protected override void OnModelCreating(ModelBuilder modelBuilder)\n';
  s += '        {\n';
  for (const tableName of Object.keys(tables)) {
    const table = tables[tableName];
    s += `            modelBuilder.Entity<Db${tableName}>().HasKey(o=>new {${table.primaryKey
      .map(t => `o.${t}`)
      .join(', ')} });\n`;
  }
  s += '        }\n';
  s += '    }\n';

  for (const tableName of Object.keys(tables)) {
    const table = tables[tableName];
    const { columns, data } = table;

    const bases = [];
    const enumDef = table['enum'];

    if (options.getEntityBaseClass) {
      const optionBase = options.getEntityBaseClass(table);
      if (_.isString(optionBase)) bases.push(optionBase);
      else if (_.isArray(optionBase)) bases.push(...optionBase);
    }
    s += `    public partial class Db${tableName} ${bases.length > 0 ? ':' : ''}  ${bases.join(',')} {\n`;

    if (enumDef) {
      for (const dataRow of data) {
        s += `        public const int ${_.camelCase(dataRow[enumDef.name])} = ${dataRow[enumDef.value]};\n`;
      }
      s += `         public static Dictionary<string, int> keyToInt = new Dictionary<string, int>();\n`;
      s += `         public static Dictionary<int, string> intToKey = new Dictionary<int, string>();\n`;
    }

    s += `        static Db${tableName}() {\n`;
    if (enumDef) {
      for (const dataRow of data) {
        s += `            keyToInt["${dataRow[enumDef.name]}"] = ${dataRow[enumDef.value]};\n`;
        s += `            intToKey[${dataRow[enumDef.value]}] = "${dataRow[enumDef.name]}";\n`;
      }
    }
    s += `        }\n`;

    s += `        public Db${tableName} Duplicate() {\n`;
    s += `            var res = new Db${tableName}();\n`;
    for (const column of columns) {
      const { name } = column;
      if (options.getEntityDuplicateColumnFilter == null || options.getEntityDuplicateColumnFilter(name)) {
        s += `            res.${getDotNetName(name)} = ${getDotNetName(name)};\n`;
      }
    }
    s += `            return res;\n`;
    s += `        }\n`;

    for (const column of columns) {
      const { type, notNull, name: colname, references } = column;
      let defaultValue = column['default'];
      const dotNetType = getDotNetType(type);
      if (dotNetType === 'bool' && defaultValue != null) defaultValue = defaultValue ? 'true' : 'false';

      if (dotNetType) {
        s += `        public ${dotNetType}${notNull ? '' : '?'} ${getDotNetName(colname)} {get; set; }`;
        if (defaultValue) s += ` = ${defaultValue};`;
        s += '\n';
      }
      if (references) {
        s += `        [ForeignKey("${colname}")]\n`;
        s += `        [JsonIgnore]\n`;
        s += `        public Db${references}${notNull ? '' : '?'} ${colname}Ref {get; set; }\n`;
      }
    }

    for (const otherTableName of Object.keys(tables)) {
      const otherTable = tables[otherTableName];
      const { columns: otherColumns } = otherTable;
      for (const otherColumn of otherColumns) {
        if (otherColumn.references === tableName) {
          s += `        [InverseProperty("${otherColumn.name}Ref")]\n`;
          s += `        [JsonIgnore]\n`;
          s += `        public List<Db${otherTableName}> ${otherColumn.name}${otherTableName}List {get; set; }\n`;
        }
      }
    }

    s += '    }\n';
  }
  s += '}\n';
  fs.writeFileSync(outputFile, s);
}

module.exports = efmodel;

async function autoIndexForeignKeys(options, event) {
  if (event !== 'before-deploy') return;

  const { projectStructure } = options;
  if (!projectStructure) return;
  const { tables } = projectStructure;
  if (!tables) return;

  for (const tableName of Object.keys(tables)) {
    const table = tables[tableName];
    for (const column of table.columns) {
      if (column.references) {
        if (!table.indexes) table.indexes = [];
        table.indexes.push({
          name: `IX_FK_${tableName}_${column.name}`,
          columns: [column.name],
        });
      }
    }
  }
}

module.exports = autoIndexForeignKeys;

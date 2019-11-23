async function runHooks(options, event) {
  const { hooks } = options;
  if (hooks) {
    for (const hook of hooks) {
      await hook(options, event);
    }
  }
}

module.exports = runHooks;

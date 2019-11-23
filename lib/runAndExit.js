async function runAndExit(promise) {
  try {
    await promise;
    console.log('SUCCESS');
    process.exit();
  } catch (e) {
    console.log('ERROR');
    console.log(e);
    process.exit(1);
  }
}

module.exports = runAndExit;

// Runs every test file. No dependencies: node tests/run.js

const fs = require('fs');
const path = require('path');

const files = fs.readdirSync(__dirname).filter((f) => f.endsWith('.test.js')).sort();
let failed = 0;
let passed = 0;

for (const file of files) {
  const tests = require(path.join(__dirname, file));
  for (const [name, fn] of Object.entries(tests)) {
    try {
      fn();
      passed++;
    } catch (error) {
      failed++;
      console.error(`FAIL  ${file} — ${name}`);
      console.error(`      ${error.message.split('\n')[0]}`);
    }
  }
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

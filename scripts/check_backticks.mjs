import fs from 'fs';
const content = fs.readFileSync('src/dashboard-ui.mjs', 'utf8');
const lines = content.split('\n');
console.log('Total lines:', lines.length);
let found = 0;
lines.forEach((line, idx) => {
  const lineNum = idx + 1;
  // Look only inside the script body: between start of HTML template literal (around line 19) and end (around line 8415)
  if (lineNum > 20 && lineNum < lines.length - 2) {
    // Check if line contains unescaped backtick
    // In template literal, any backtick that is not escaped as \` will break out of the string!
    let i = 0;
    while (i < line.length) {
      if (line[i] === '`') {
        if (i === 0 || line[i - 1] !== '\\') {
          console.log(`Unescaped backtick at line ${lineNum}: ${line.trim()}`);
          found++;
        }
      }
      i++;
    }
  }
});
console.log('Total unescaped backticks found:', found);

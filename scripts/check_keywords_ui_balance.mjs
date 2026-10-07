import fs from 'fs';

const content = fs.readFileSync('src/keywords-ui.mjs', 'utf8');

function checkTags(tag) {
  const openRegex = new RegExp(`<${tag}[\\s>]`, 'g');
  const closeRegex = new RegExp(`</${tag}>`, 'g');
  const opens = (content.match(openRegex) || []).length;
  const closes = (content.match(closeRegex) || []).length;
  console.log(`${tag}: open=${opens}, close=${closes}, diff=${opens - closes}`);
}

console.log('--- HTML TAG BALANCE ---');
['div', 'template', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'button', 'select'].forEach(checkTags);

console.log('\n--- BACKTICK CHECK ---');
const lines = content.split('\n');
console.log('Total lines:', lines.length);
let found = 0;
lines.forEach((line, idx) => {
  const lineNum = idx + 1;
  if (lineNum > 10 && lineNum < lines.length - 2) {
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
console.log('Total unescaped backticks found in template body:', found);

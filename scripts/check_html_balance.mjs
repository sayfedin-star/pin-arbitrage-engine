import fs from 'fs';
const content = fs.readFileSync('src/dashboard-ui.mjs', 'utf8');

function checkTags(tag) {
  const openRegex = new RegExp(`<${tag}[\\s>]`, 'g');
  const closeRegex = new RegExp(`</${tag}>`, 'g');
  const opens = (content.match(openRegex) || []).length;
  const closes = (content.match(closeRegex) || []).length;
  console.log(`${tag}: open=${opens}, close=${closes}, diff=${opens - closes}`);
}

['div', 'template', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'button', 'select'].forEach(checkTags);

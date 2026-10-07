import { neon } from '@neondatabase/serverless';
import fs from 'fs';
import { calculateFolderCrossover } from '../src/modules/keywords/folders-service.mjs';

const env = fs.readFileSync('.env', 'utf8');
let dbUrl = '';
for (const line of env.split('\n')) {
  if (line.startsWith('DATABASE_URL=')) {
    dbUrl = line.split('=')[1].trim().replace(/^["']|["']$/g, '');
  }
}
const sql = neon(dbUrl);

async function main() {
  const folders = await sql`SELECT * FROM keyword_folders;`;
  console.log('Folders in DB:');
  console.log(folders);

  const keywords = await sql`SELECT id, keyword, category, last_crawled_at FROM tracked_keywords;`;
  console.log('Tracked keywords:');
  console.log(keywords);

  if (folders.length > 0) {
    const crossover = await calculateFolderCrossover(sql, folders[0].id);
    console.log('Seasonality peak months:', crossover.seasonality.peak_months);
    console.log('Seasonality launch window:', crossover.seasonality.recommended_launch_window);
    console.log('Rolling months (12):', crossover.seasonality.rolling_months);
    console.log('Wave length:', crossover.seasonality.composite_wave.length);
    console.log('Sample week data (first 2):', crossover.seasonality.composite_wave.slice(0, 2));
    console.log('Wave scores (all 52):', JSON.stringify(crossover.seasonality.composite_wave.map(w => w.score)));
  }
}

main().catch(console.error);

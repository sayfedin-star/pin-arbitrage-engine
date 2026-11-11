import { createSqlClient as neon } from '../src/db/client.mjs';
import { getPruningCandidates, listFolderCreatorsWithDiscovery } from '../src/modules/keywords/folders-service.mjs';

const sql = neon(process.env.DATABASE_URL);

async function main() {
  console.log('Testing live DB connection with updated folders-service.mjs...');
  
  console.log('\n--- 1. Testing getPruningCandidates on Folder 5 ---');
  const candidates = await getPruningCandidates(sql, 5, { scope: 'displaced', minPinAgeDays: 30, maxSaves: 5 });
  console.log('Real candidate count returned for Folder #5:', candidates.length);
  if (candidates.length > 0) {
    console.log('Sample candidate pin:', {
      pin_id: candidates[0].pin_id,
      title: candidates[0].title,
      save_count: candidates[0].save_count,
      keyword: candidates[0].keyword
    });
  }

  console.log('\n--- 2. Testing listFolderCreatorsWithDiscovery on Folder 5 ---');
  const creatorsRes = await listFolderCreatorsWithDiscovery(sql, 5);
  console.log('totals.combined_audience:', creatorsRes.totals.combined_audience);
  console.log('totals.delta_24h:', creatorsRes.totals.delta_24h);
  console.log('totals.delta_reach_24h:', creatorsRes.totals.delta_reach_24h);
  console.log('totals.delta_impressions_24h:', creatorsRes.totals.delta_impressions_24h);
  console.log('totals.delta_pins_24h:', creatorsRes.totals.delta_pins_24h);

  const calculatedAudienceSum = creatorsRes.all_creators.reduce((sum, r) => sum + Math.max(0, Number(r.delta_reach_24h || 0)), 0);
  console.log('Calculated sum of delta_reach_24h from all_creators:', calculatedAudienceSum);
  console.log('Matches totals.delta_24h?:', calculatedAudienceSum === creatorsRes.totals.delta_24h);
}

main().catch(console.error);

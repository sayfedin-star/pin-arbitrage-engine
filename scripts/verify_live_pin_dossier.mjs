import { neon } from '@neondatabase/serverless';
import { fetchUniversalPinDossier } from '../src/modules/sharding/fleet-router.mjs';

if (typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(); } catch (_) {}
}

const sql = neon(process.env.DATABASE_URL);

async function check() {
  for (const pinId of ['844493677058317', '1125968743130862']) {
    console.log(`\n================= VERIFYING PIN ${pinId} =================`);
    const dossier = await fetchUniversalPinDossier({ hubSql: sql, pinId });
    console.log('Success:', dossier.success);
    console.log('Shard ID:', dossier.shard_id);
    console.log('Title:', dossier.creative.title);
    console.log('Alt-Text:', dossier.creative.alt_text);
    console.log('Description:', dossier.creative.description?.slice(0, 80) + '...');
    console.log('Visual Tags (' + dossier.creative.visual_annotations?.length + '):', dossier.creative.visual_annotations);
    console.log('Daily Trajectory (' + dossier.daily_trajectory?.length + '):', dossier.daily_trajectory);
    console.log('Snapshots (' + dossier.snapshots?.length + '):', dossier.snapshots.map(s => ({
      date: s.snapshot_date,
      keyword: s.keyword_name,
      rank: s.rank_position,
      saves: s.save_count,
      vel: s.daily_save_velocity
    })));
  }
}

check().catch(console.error);

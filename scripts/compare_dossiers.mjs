import { neon } from '@neondatabase/serverless';
if (typeof process.loadEnvFile === 'function') process.loadEnvFile();
import { getPinDeepDossier } from '../src/modules/keywords/service.mjs';

const sql = neon(process.env.DATABASE_URL);

async function check() {
  console.log('--- DOSSIER FOR 68750397103 (Sesame Chicken) ---');
  const d9 = await getPinDeepDossier(sql, '68750397103', 51);
  console.log('Pin 68750397103 Dossier:', {
    pin_id: d9.pin_id,
    title: d9.title,
    domain: d9.domain,
    creator: d9.creator_username,
    kpis: d9.kpis,
    annotations: d9.annotations?.slice(0, 3)
  });

  console.log('\n--- DOSSIER FOR 237213105369080124 (Sweet Potato) ---');
  const d6 = await getPinDeepDossier(sql, '237213105369080124', 51);
  console.log('Pin 237213105369080124 Dossier:', {
    pin_id: d6.pin_id,
    title: d6.title,
    domain: d6.domain,
    creator: d6.creator_username,
    kpis: d6.kpis,
    annotations: d6.annotations?.slice(0, 3)
  });
}

check().catch(console.error);

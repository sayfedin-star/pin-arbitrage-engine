import { neon } from '@neondatabase/serverless';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const lines = env.split('\n');
let dbUrl = '';
for (const line of lines) {
  if (line.startsWith('DATABASE_URL=')) {
    dbUrl = line.split('=')[1].trim().replace(/^["']|["']$/g, '');
  }
}

if (!dbUrl) {
  console.error('DATABASE_URL not found in .env');
  process.exit(1);
}

const sql = neon(dbUrl);

async function run() {
  console.log('[*] Step 1: Identifying synthetic duplicate boards across competitor_boards...');
  
  const toDelete = await sql`
    SELECT competitor_id, board_id, name 
    FROM competitor_boards
    WHERE board_id LIKE 'cb-%'
      AND EXISTS (
        SELECT 1 FROM competitor_boards auth
        WHERE auth.competitor_id = competitor_boards.competitor_id
          AND auth.board_id NOT LIKE 'cb-%'
          AND LOWER(TRIM(auth.name)) = LOWER(TRIM(competitor_boards.name))
      );
  `;

  console.log(`[*] Found ${toDelete.length} synthetic duplicate board(s):`);
  for (const row of toDelete) {
    console.log(`   - Competitor #${row.competitor_id}: "${row.name}" (synthetic id: ${row.board_id})`);
  }

  if (toDelete.length > 0) {
    const deleted = await sql`
      DELETE FROM competitor_boards
      WHERE board_id LIKE 'cb-%'
        AND EXISTS (
          SELECT 1 FROM competitor_boards auth
          WHERE auth.competitor_id = competitor_boards.competitor_id
            AND auth.board_id NOT LIKE 'cb-%'
            AND LOWER(TRIM(auth.name)) = LOWER(TRIM(competitor_boards.name))
        )
      RETURNING competitor_id, board_id, name;
    `;
    console.log(`[+] Successfully deleted ${deleted.length} synthetic duplicate board records.`);
  } else {
    console.log('[-] No synthetic duplicate boards found.');
  }

  console.log('[*] Step 2: Recalculating and synchronizing total_boards across all competitor_profiles...');
  const updatedProfiles = await sql`
    UPDATE competitor_profiles cp
    SET total_boards = (
      SELECT count(DISTINCT LOWER(TRIM(name)))::int 
      FROM competitor_boards cb 
      WHERE cb.competitor_id = cp.id
    ),
    updated_at = NOW()
    WHERE EXISTS (SELECT 1 FROM competitor_boards WHERE competitor_id = cp.id)
    RETURNING id, username, total_boards;
  `;
  console.log(`[+] Synchronized total_boards for ${updatedProfiles.length} profiles:`);
  for (const p of updatedProfiles) {
    console.log(`   - #${p.id} @${p.username}: ${p.total_boards} distinct boards`);
  }

  console.log('[*] Step 3: Verification of zero remaining duplicates...');
  const remainingDuplicates = await sql`
    SELECT competitor_id, LOWER(TRIM(name)) as norm_name, count(*) as cnt
    FROM competitor_boards
    WHERE board_id LIKE 'cb-%' AND EXISTS (
      SELECT 1 FROM competitor_boards auth
      WHERE auth.competitor_id = competitor_boards.competitor_id
        AND auth.board_id NOT LIKE 'cb-%'
        AND LOWER(TRIM(auth.name)) = LOWER(TRIM(competitor_boards.name))
    )
    GROUP BY competitor_id, LOWER(TRIM(name));
  `;

  if (remainingDuplicates.length === 0) {
    console.log('[SUCCESS] Verified: 0 duplicate boards remaining between synthetic and authentic!');
  } else {
    console.error('[ERROR] Duplicates still found:', remainingDuplicates);
    process.exit(1);
  }
}

run().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});

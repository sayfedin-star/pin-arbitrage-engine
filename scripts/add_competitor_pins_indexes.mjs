import fs from 'fs';
import { neon } from '@neondatabase/serverless';

const env = fs.readFileSync('.env', 'utf-8');
const dbUrl = env.match(/DATABASE_URL="?([^"\r\n]+)"?/)[1];
const sql = neon(dbUrl);

async function run() {
  await sql`CREATE INDEX IF NOT EXISTS idx_competitor_pins_comp_saves ON competitor_pins(competitor_id, save_count DESC);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_competitor_pins_comp_board ON competitor_pins(competitor_id, board_name);`;
  console.log('Hub indexes created.');

  const [shard01] = await sql`SELECT database_url FROM neon_projects_registry WHERE project_name LIKE '%shard-01' LIMIT 1;`;
  if (shard01) {
    const shardSql = neon(shard01.database_url);
    await shardSql`CREATE INDEX IF NOT EXISTS idx_competitor_pins_comp_saves ON competitor_pins(competitor_id, save_count DESC);`;
    await shardSql`CREATE INDEX IF NOT EXISTS idx_competitor_pins_comp_board ON competitor_pins(competitor_id, board_name);`;
    console.log('Shard-01 indexes created.');
  }

  // Also backfill the 9 pins currently in pa_pins into competitor_pins on Shard-01
  if (shard01) {
    const shardSql = neon(shard01.database_url);
    const [c] = await shardSql`SELECT id FROM competitor_profiles WHERE username = 'wifesrecipesbyme' LIMIT 1;`;
    if (c) {
      await shardSql`
        INSERT INTO competitor_pins (
          competitor_id,
          pin_id,
          title,
          description,
          link_domain,
          destination_url,
          board_name,
          image_url,
          save_count,
          repin_count,
          comment_count,
          created_at_pinterest,
          first_seen_at,
          last_seen_at
        )
        SELECT 
          ${c.id},
          p.pin_id,
          p.title,
          p.description,
          p.domain,
          p.link,
          p.board_name,
          p.image_url,
          p.saves,
          p.repins,
          p.comments,
          p.created_at_pinterest,
          p.first_seen_at,
          NOW()
        FROM pa_pins p
        WHERE p.account_username ILIKE '%wifesrecipesbyme%'
        ON CONFLICT (competitor_id, pin_id) DO NOTHING;
      `;
      const [cnt] = await shardSql`SELECT COUNT(*)::int as c FROM competitor_pins WHERE competitor_id = ${c.id};`;
      console.log('Shard-01 competitor_pins for Judith after backfill:', cnt.c);
    }
  }
}

run().catch(console.error);

import { neon } from '@neondatabase/serverless';
if (typeof process.loadEnvFile === 'function') process.loadEnvFile();
import { fetchPinFromPinterest } from './lib/pinterest.mjs';

const sql = neon(process.env.DATABASE_URL);

async function remediate() {
  console.log('=== Remediating Target Pins in Neon DB ===');
  const targetPinIds = [
    '211174979106117',
    '70437491132581',
    '1407443631364366',
    '2392606049541052',
    '140806235363975'
  ];

  const [kw] = await sql`SELECT id, keyword FROM tracked_keywords WHERE keyword ILIKE '%lazy dinner%';`;
  if (!kw) {
    console.error('Keyword lazy dinners not found');
    return;
  }
  console.log(`Keyword: ${kw.keyword} (ID: ${kw.id})`);

  for (const pinId of targetPinIds) {
    console.log(`\nFetching live closeup for Pin #${pinId}...`);
    const live = await fetchPinFromPinterest(pinId);
    if (!live?.ok || !live.pin) {
      console.warn(`[-] Failed to fetch Pin #${pinId}:`, live?.error || live?.status);
      continue;
    }

    const p = live.pin;
    console.log(`[+] Pin #${pinId} fetched:`, {
      title: p.title?.slice(0, 40),
      saves: p.saves,
      repins: p.repins,
      method: p.method,
      board: p.board_name,
      created_at_pinterest: p.created_at_pinterest
    });

    const saves = Number(p.saves || 0);
    const repins = Number(p.repins || 0);
    const comments = Number(p.comments || 0);
    const shares = Number(p.share_count || 0);
    const method = p.method || 'button';
    const board = p.board_name || '';
    const created = p.created_at_pinterest ? new Date(p.created_at_pinterest).toISOString() : null;
    const title = p.title || '';

    // 1. Update keyword_displaced_pins
    const dispRes = await sql`
      UPDATE keyword_displaced_pins
      SET
        current_saves = GREATEST(current_saves, ${saves}::bigint),
        current_repins = GREATEST(current_repins, ${repins}::bigint),
        current_comments = GREATEST(current_comments, ${comments}::int),
        current_shares = GREATEST(current_shares, ${shares}::int),
        board_name = CASE WHEN ${board}::text <> '' THEN ${board}::text ELSE board_name END,
        creation_method = ${method},
        created_at_pinterest = CASE WHEN ${created}::timestamptz IS NOT NULL THEN ${created}::timestamptz ELSE created_at_pinterest END,
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
          'method', ${method}::text,
          'creation_method', ${method}::text,
          'board_name', ${board}::text,
          'created_at_pinterest', ${created || ''}::text
        ),
        updated_at = NOW()
      WHERE pin_id = ${pinId} AND keyword_id = ${kw.id}
      RETURNING pin_id, current_saves, current_repins, board_name, creation_method, created_at_pinterest;
    `;
    if (dispRes.length > 0) {
      console.log(`  Updated keyword_displaced_pins for #${pinId}:`, dispRes[0]);
    }

    // 2. Update keyword_serp_current
    const serpRes = await sql`
      UPDATE keyword_serp_current
      SET
        save_count = GREATEST(save_count, ${saves}::bigint),
        repin_count = GREATEST(repin_count, ${repins}::int),
        board_name = CASE WHEN ${board}::text <> '' THEN ${board}::text ELSE board_name END,
        creation_method = ${method},
        created_at_pinterest = CASE WHEN ${created}::timestamptz IS NOT NULL THEN ${created}::timestamptz ELSE created_at_pinterest END,
        crawled_at = NOW()
      WHERE pin_id = ${pinId} AND keyword_id = ${kw.id}
      RETURNING pin_id, save_count, repin_count, board_name, creation_method, created_at_pinterest;
    `;
    if (serpRes.length > 0) {
      console.log(`  Updated keyword_serp_current for #${pinId}:`, serpRes[0]);
    }

    // 3. Update latest keyword_pins_snapshots
    const snapRes = await sql`
      UPDATE keyword_pins_snapshots
      SET
        save_count = GREATEST(save_count, ${saves}::bigint),
        repin_count = GREATEST(repin_count, ${repins}::int),
        comment_count = GREATEST(comment_count, ${comments}::int),
        share_count = GREATEST(COALESCE(share_count, 0), ${shares}::int),
        created_at_pinterest = CASE WHEN ${created}::timestamptz IS NOT NULL THEN ${created}::timestamptz ELSE created_at_pinterest END,
        creation_method = ${method},
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
          'board_name', ${board}::text,
          'method', ${method}::text,
          'creation_method', ${method}::text,
          'created_at_pinterest', ${created || ''}::text
        )
      WHERE pin_id = ${pinId} AND keyword_id = ${kw.id}
      RETURNING pin_id, save_count, repin_count, created_at_pinterest, creation_method, metadata->>'board_name' as meta_board;
    `;
    if (snapRes.length > 0) {
      console.log(`  Updated keyword_pins_snapshots for #${pinId} (${snapRes.length} snapshots)`);
    }

    // Rate-limiting jitter between Pinterest requests
    await new Promise(r => setTimeout(r, 1200));
  }

  console.log('\n✅ Remediation complete!');
}

remediate().catch(console.error);

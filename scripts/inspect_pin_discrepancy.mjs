import { neon } from '@neondatabase/serverless';
if (typeof process.loadEnvFile === 'function') process.loadEnvFile();
import { fetchPinFromPinterest } from './lib/pinterest.mjs';

const sql = neon(process.env.DATABASE_URL);

async function inspect() {
  const pinId = '68750397103';
  console.log('=== INSPECTING PIN:', pinId, '===');
  
  // 1. In keyword_pins_snapshots
  const snaps = await sql`
    SELECT id, keyword_id, pin_id, rank_position, title, domain, destination_url, save_count, repin_count, comment_count, daily_save_velocity, snapshot_date, is_displaced, metadata
    FROM keyword_pins_snapshots
    WHERE pin_id = ${pinId}
    ORDER BY snapshot_date DESC, created_at DESC;
  `;
  console.log('Snapshots count:', snaps.length);
  for (const s of snaps) {
    console.log({
      id: s.id,
      keyword_id: s.keyword_id,
      rank: s.rank_position,
      title: s.title,
      saves: s.save_count,
      repins: s.repin_count,
      comments: s.comment_count,
      snapshot_date: s.snapshot_date,
      is_displaced: s.is_displaced,
      meta_raw_saves: s.metadata?.raw_saves,
      meta_reactions: s.metadata?.reactions
    });
  }

  // 2. In keyword_displaced_pins
  const displaced = await sql`
    SELECT * FROM keyword_displaced_pins WHERE pin_id = ${pinId};
  `;
  console.log('Displaced count:', displaced.length);
  for (const d of displaced) {
    console.log({
      id: d.id,
      keyword_id: d.keyword_id,
      last_known_rank: d.last_known_rank,
      title: d.title,
      status: d.status,
      current_saves: d.current_saves,
      current_repins: d.current_repins,
      seo_alt_text: d.seo_alt_text?.slice(0, 40)
    });
  }

  // 3. Live Pinterest Scrape
  console.log('\nFetching live from Pinterest for pin 68750397103...');
  const live = await fetchPinFromPinterest(pinId);
  if (live?.ok && live.pin) {
    console.log('Live Pinterest data for 68750397103:', {
      title: live.pin.title,
      saves: live.pin.saves,
      repins: live.pin.repins,
      comments: live.pin.comments,
      shares: live.pin.share_count,
      reactions: live.pin.reactions,
      alt_text: live.pin.alt_text?.slice(0, 40),
      board_name: live.pin.board_name,
      annotations_count: live.pin.annotations?.length
    });
  } else {
    console.log('Live fetch failed:', live);
  }

  // 4. Also inspect Sweet Potato pin (237213105369080124) from Rank #6
  console.log('\n=== ALSO INSPECTING SWEET POTATO PIN (from Rank #6): 237213105369080124 ===');
  const sweetLive = await fetchPinFromPinterest('237213105369080124');
  if (sweetLive?.ok && sweetLive.pin) {
    console.log('Live Pinterest data for 237213105369080124:', {
      title: sweetLive.pin.title,
      saves: sweetLive.pin.saves,
      repins: sweetLive.pin.repins,
      comments: sweetLive.pin.comments,
      shares: sweetLive.pin.share_count,
      reactions: sweetLive.pin.reactions,
      alt_text: sweetLive.pin.alt_text?.slice(0, 40)
    });
  }

  // 5. Inspect pin 68750077600 (High-Protein Easy Stuffed Bell)
  console.log('\n=== ALSO INSPECTING PIN 68750077600 ===');
  const bellLive = await fetchPinFromPinterest('68750077600');
  if (bellLive?.ok && bellLive.pin) {
    console.log('Live Pinterest data for 68750077600:', {
      title: bellLive.pin.title,
      saves: bellLive.pin.saves,
      repins: bellLive.pin.repins,
      comments: bellLive.pin.comments,
      shares: bellLive.pin.share_count,
      reactions: bellLive.pin.reactions
    });
  }
}

inspect().catch(console.error);

#!/usr/bin/env node

/**
 * Seed Initial Competitor & Keyword Intelligence Data
 * Populates exact records matching User reference images into Neon Postgres.
 */

import { neon } from '@neondatabase/serverless';

if (typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(); } catch (_) {}
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[-] CRITICAL: DATABASE_URL is missing.');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function seedData() {
  console.log('[*] Seeding Competitor Profiles matching Image 2...');

  const competitors = [
    { username: 'streetstylis', reach: 10000001, reachDelta: 0, views: 10000001, viewsDelta: 0, pins: 22386, boards: 1718, activity: '1d ago' },
    { username: 'daviereofficial', reach: 4903960, reachDelta: 42831, views: 6663490, viewsDelta: 14298, pins: 20410, boards: 1670, activity: '1d ago' },
    { username: 'Aviorenofficial', reach: 4713280, reachDelta: -7670, views: 6410673, viewsDelta: 8174, pins: 20600, boards: 1542, activity: '1d ago' },
    { username: 'davaroofficial', reach: 4538643, reachDelta: 57779, views: 6012139, viewsDelta: 18307, pins: 9835, boards: 1632, activity: '1d ago' },
    { username: 'streetstylisuk', reach: 4260013, reachDelta: 16495, views: 5540899, viewsDelta: 23290, pins: 20003, boards: 1091, activity: '1d ago' },
    { username: 'streetstyliseu', reach: 4192107, reachDelta: 0, views: 8510828, viewsDelta: 67625, pins: 20392, boards: 1642, activity: '1d ago' },
    { username: 'parificus', reach: 3992700, reachDelta: 53593, views: 5350093, viewsDelta: 41640, pins: 19848, boards: 1663, activity: '1d ago' },
    { username: 'elandra_off', reach: 1330934, reachDelta: 0, views: 5938958, viewsDelta: 34617, pins: 21061, boards: 1653, activity: '1d ago' },
    { username: 'zaviera_offs', reach: 814662, reachDelta: 0, views: 4372154, viewsDelta: 14254, pins: 16079, boards: 1636, activity: '1d ago' },
    { username: 'streetstylebylis', reach: 651511, reachDelta: 0, views: 764857, viewsDelta: -467, pins: 16214, boards: 97, activity: '1y ago' },
    { username: 'paviereofficial', reach: 484317, reachDelta: 0, views: 590114, viewsDelta: 616, pins: 15770, boards: 124, activity: '1y ago' },
    { username: 'streetstylissgp', reach: 173233, reachDelta: 0, views: 326617, viewsDelta: 1520, pins: 12967, boards: 69, activity: '1y ago' }
  ];

  for (const c of competitors) {
    await sql`
      INSERT INTO competitor_profiles (
        username,
        display_name,
        avatar_url,
        monthly_reach,
        reach_delta_7d,
        profile_views,
        views_delta_7d,
        total_pins,
        total_boards,
        activity_status,
        account_type,
        last_synced_at,
        is_active,
        metadata
      ) VALUES (
        ${c.username.toLowerCase()},
        ${c.username},
        ${'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=face'},
        ${c.reach},
        ${c.reachDelta},
        ${c.views},
        ${c.viewsDelta},
        ${c.pins},
        ${c.boards},
        ${c.activity},
        'competitor',
        NOW(),
        TRUE,
        ${JSON.stringify({ activity_text: c.activity })}::jsonb
      )
      ON CONFLICT (username) DO UPDATE SET
        monthly_reach = EXCLUDED.monthly_reach,
        reach_delta_7d = EXCLUDED.reach_delta_7d,
        profile_views = EXCLUDED.profile_views,
        views_delta_7d = EXCLUDED.views_delta_7d,
        total_pins = EXCLUDED.total_pins,
        total_boards = EXCLUDED.total_boards,
        activity_status = EXCLUDED.activity_status,
        updated_at = NOW();
    `;
  }
  console.log(`[+] Seeded ${competitors.length} competitor profiles.`);

  console.log('[*] Seeding Keywords matching Image 1...');
  const keywords = [
    'chicken recipes',
    'chicken breast recipes',
    'chicken',
    'chicken thigh recipes',
    'buffalo chicken dip',
    'white chicken chili',
    'chicken salad recipe'
  ];

  for (let idx = 0; idx < keywords.length; idx++) {
    const kw = keywords[idx];
    const topPinId = '108888628492000' + idx;
    const topPinTitle = `Best ${kw.charAt(0).toUpperCase() + kw.slice(1)} - Easy Weeknight Dinner`;
    const topPinImg = `https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?w=600&auto=format&fit=crop`;
    const sampleVelocity = [142, 89, 210, 64, 175, 55, 98][idx % 7];

    const [row] = await sql`
      INSERT INTO tracked_keywords (
        keyword,
        category,
        target_pin_count,
        top_pin_id,
        top_pin_title,
        top_pin_image,
        avg_daily_velocity,
        is_active,
        last_crawled_at,
        created_at,
        updated_at
      ) VALUES (
        ${kw},
        'Recipes & Food',
        50,
        ${topPinId},
        ${topPinTitle},
        ${topPinImg},
        ${sampleVelocity},
        TRUE,
        NOW(),
        NOW(),
        NOW()
      )
      ON CONFLICT (keyword) DO UPDATE SET
        top_pin_id = EXCLUDED.top_pin_id,
        top_pin_title = EXCLUDED.top_pin_title,
        top_pin_image = EXCLUDED.top_pin_image,
        avg_daily_velocity = EXCLUDED.avg_daily_velocity,
        last_crawled_at = NOW(),
        updated_at = NOW()
      RETURNING id;
    `;

    if (row) {
      // Seed 3 initial ranked pin snapshots for each keyword
      for (let r = 1; r <= 3; r++) {
        const pinId = '1088886284920' + idx + '' + r;
        await sql`
          INSERT INTO keyword_pins_snapshots (
            keyword_id,
            pin_id,
            rank_position,
            title,
            domain,
            destination_url,
            image_url,
            save_count,
            daily_save_velocity,
            snapshot_date,
            created_at
          ) VALUES (
            ${row.id},
            ${pinId},
            ${r},
            ${topPinTitle + ' (Rank #' + r + ')'},
            'tasteofhome.com',
            ${'https://www.tasteofhome.com/recipes/' + kw.replace(/\s+/g, '-')},
            ${topPinImg},
            ${2400 - (r * 350)},
            ${sampleVelocity - (r * 15)},
            CURRENT_DATE,
            NOW()
          )
          ON CONFLICT (keyword_id, pin_id, snapshot_date) DO UPDATE SET
            rank_position = EXCLUDED.rank_position,
            title = EXCLUDED.title,
            save_count = EXCLUDED.save_count,
            daily_save_velocity = EXCLUDED.daily_save_velocity;
        `;
      }
    }
  }
  console.log(`[+] Seeded ${keywords.length} keywords with top pins and ranked snapshots.`);
}

seedData()
  .then(() => {
    console.log('[+] Initial intelligence data seeded successfully!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('[-] Seeding error:', err);
    process.exit(1);
  });

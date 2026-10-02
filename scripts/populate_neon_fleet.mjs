#!/usr/bin/env node

/**
 * Populate Neon Fleet Registry with all 100 Neon Serverless Projects
 * Inserts 99 Shards + 1 Hub into neon_projects_registry
 */

import { neon } from '@neondatabase/serverless';

if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile();
  } catch (_) {}
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[-] CRITICAL: DATABASE_URL is not set.');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

const shards = [
  { shard: 1, id: 'lingering-queen-63181356', url: 'postgresql://neondb_owner:npg_sdXJar4R1GlY@ep-blue-dew-b57i5te6-pooler.c-7.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 2, id: 'nameless-math-08100352', url: 'postgresql://neondb_owner:npg_PdKxRwNyS67I@ep-odd-shape-b4mq2e4q-pooler.c-6.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 3, id: 'autumn-field-01697278', url: 'postgresql://neondb_owner:npg_89WZVfKbgkap@ep-soft-frog-b5f6e0m1-pooler.c-7.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 4, id: 'patient-hill-01069075', url: 'postgresql://neondb_owner:npg_ixIhOZRk9EG6@ep-flat-snow-b4f2vee6-pooler.c-6.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 5, id: 'frosty-recipe-48331498', url: 'postgresql://neondb_owner:npg_gVXO3iAIwhC6@ep-broad-cloud-b5vrdivh-pooler.c-7.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 6, id: 'weathered-cherry-54012370', url: 'postgresql://neondb_owner:npg_mGNjdki80upF@ep-steep-moon-b5wu6i35-pooler.c-7.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 7, id: 'curly-credit-38452317', url: 'postgresql://neondb_owner:npg_Ic4dmlZU3xev@ep-young-leaf-b4ad8nxo-pooler.c-6.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 8, id: 'snowy-lab-09565389', url: 'postgresql://neondb_owner:npg_YldLueFWo6r0@ep-dawn-block-b4f2z53i-pooler.c-6.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 9, id: 'holy-fire-11535176', url: 'postgresql://neondb_owner:npg_u8xMwavRoS1Z@ep-fragrant-heart-b5zdkv9m-pooler.c-7.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 10, id: 'fancy-frost-76025072', url: 'postgresql://neondb_owner:npg_4dtzMqovfaK7@ep-lively-dew-b4qk628o-pooler.c-6.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 11, id: 'round-frost-99750725', url: 'postgresql://neondb_owner:npg_P6Udgc5AEXQT@ep-lively-truth-b5pgeqvm-pooler.c-7.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 12, id: 'long-scene-43411598', url: 'postgresql://neondb_owner:npg_tvsMDgU43Fhn@ep-young-leaf-b49szb58-pooler.c-6.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 13, id: 'empty-butterfly-70775927', url: 'postgresql://neondb_owner:npg_sJTmf14HrGqp@ep-noisy-darkness-b5ntsln7-pooler.c-7.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 14, id: 'red-wave-00560646', url: 'postgresql://neondb_owner:npg_wqZPnvbD3Kk4@ep-cold-star-b4tjxjd0-pooler.c-6.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 15, id: 'ancient-boat-21068037', url: 'postgresql://neondb_owner:npg_GQ71iEwzrjec@ep-plain-lake-b5w8t1yf-pooler.c-7.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 16, id: 'noisy-salad-21120874', url: 'postgresql://neondb_owner:npg_ys7kOPba4FBV@ep-morning-king-b4cyokrd-pooler.c-6.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 17, id: 'gentle-cloud-99747020', url: 'postgresql://neondb_owner:npg_AIwEc3S9mfCg@ep-ancient-breeze-b5j7fa4r-pooler.c-7.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 18, id: 'royal-waterfall-49285015', url: 'postgresql://neondb_owner:npg_6cMbOykEeQ1T@ep-aged-waterfall-b5go1ngd-pooler.c-7.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 19, id: 'raspy-scene-47764272', url: 'postgresql://neondb_owner:npg_d7cu3qBLsPmG@ep-square-poetry-b4tmu06h-pooler.c-6.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 20, id: 'jolly-field-13369445', url: 'postgresql://neondb_owner:npg_qx95JLQtmCDb@ep-fancy-cloud-b56t4c72-pooler.c-7.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 21, id: 'solitary-dust-62096436', url: 'postgresql://neondb_owner:npg_A8njL9OfZaPd@ep-quiet-hat-b5vi9e0v-pooler.c-7.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 22, id: 'rough-forest-94300608', url: 'postgresql://neondb_owner:npg_L56usUkSWhIM@ep-frosty-block-b581wfgd-pooler.c-7.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 23, id: 'royal-surf-09622776', url: 'postgresql://neondb_owner:npg_I6zb0GucsQdD@ep-rapid-hall-b4rnzgvn-pooler.c-6.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 24, id: 'little-pond-26702464', url: 'postgresql://neondb_owner:npg_qwrAVZb57YdN@ep-autumn-cake-b4bww8po-pooler.c-6.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 25, id: 'fragrant-art-05614499', url: 'postgresql://neondb_owner:npg_MVT9ZUFWb5xg@ep-spring-term-b5pjmzot-pooler.c-7.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 26, id: 'summer-meadow-74899769', url: 'postgresql://neondb_owner:npg_TXL3vzY4JeBG@ep-wild-bird-b41ousks-pooler.c-6.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 27, id: 'long-darkness-52796515', url: 'postgresql://neondb_owner:npg_PFWXK8v7oMga@ep-lingering-heart-b5kjwtyb-pooler.c-7.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 28, id: 'orange-cell-33966177', url: 'postgresql://neondb_owner:npg_8kpBjgRyo4VL@ep-wandering-voice-b4t0xsgl-pooler.c-6.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 29, id: 'tiny-resonance-25602173', url: 'postgresql://neondb_owner:npg_OsArhL9Bf6op@ep-cool-lab-b4ygd5o0-pooler.c-6.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 30, id: 'lingering-paper-99805467', url: 'postgresql://neondb_owner:npg_PRs9LNO2cdyw@ep-ancient-mountain-b4k06qjh-pooler.c-6.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 31, id: 'ancient-thunder-03412800', url: 'postgresql://neondb_owner:npg_zPVqSU2smHK4@ep-summer-mouse-b5xoi7fh-pooler.c-7.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 32, id: 'bitter-hat-39425325', url: 'postgresql://neondb_owner:npg_msA8zBZ3rVfb@ep-dark-mode-b547mtxu-pooler.c-7.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 33, id: 'rapid-mode-39658598', url: 'postgresql://neondb_owner:npg_9ZyTbWQfwzJ0@ep-shiny-lake-b4agmc4z-pooler.c-6.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 34, id: 'little-pond-32885625', url: 'postgresql://neondb_owner:npg_A1BPKljprMT6@ep-red-cherry-b4c5qcj4-pooler.c-6.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 35, id: 'morning-voice-35806617', url: 'postgresql://neondb_owner:npg_AvOgj8oY5rqT@ep-dawn-cake-b5qqiydz-pooler.c-7.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 36, id: 'steep-bread-38820023', url: 'postgresql://neondb_owner:npg_C5Py8wYJpLSH@ep-cold-cloud-b5sgdcil-pooler.c-7.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 37, id: 'empty-mode-95596748', url: 'postgresql://neondb_owner:npg_oy5q0DMunUNx@ep-falling-river-b5d8gf69-pooler.c-7.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 38, id: 'steep-recipe-51485552', url: 'postgresql://neondb_owner:npg_1rR5sMOydvUo@ep-curly-math-b43ahq2j-pooler.c-6.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 39, id: 'little-haze-57319479', url: 'postgresql://neondb_owner:npg_Ix7SzkBJZ9oK@ep-rough-sunset-b4mar2aj-pooler.c-6.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 40, id: 'ancient-field-78391803', url: 'postgresql://neondb_owner:npg_zf9cBlh0DTEy@ep-noisy-shape-b5ub1bi1-pooler.c-7.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 41, id: 'restless-rain-60445811', url: 'postgresql://neondb_owner:npg_SROEus3pdP4j@ep-lively-shadow-b5ab9wc8-pooler.c-7.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 42, id: 'blue-star-99915102', url: 'postgresql://neondb_owner:npg_XQ9Bfd4jhSwZ@ep-young-fire-b4n6x7t0-pooler.c-6.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 43, id: 'purple-recipe-70344324', url: 'postgresql://neondb_owner:npg_8FRXvTfrY1Aj@ep-tiny-sun-b4z7y7c0-pooler.c-6.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 44, id: 'flat-shape-03571647', url: 'postgresql://neondb_owner:npg_ezyBs4aR6SDq@ep-fragrant-mud-b57467yb-pooler.c-7.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 45, id: 'jolly-queen-17244956', url: 'postgresql://neondb_owner:npg_eQ28afdmYgnM@ep-restless-fire-b5z5laio-pooler.c-7.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 46, id: 'royal-waterfall-37636797', url: 'postgresql://neondb_owner:npg_IuMRgHyD9fk8@ep-young-boat-b4y9jxnc-pooler.c-6.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 47, id: 'dawn-river-69617820', url: 'postgresql://neondb_owner:npg_4OafBrjveG2U@ep-falling-sun-b5llbpep-pooler.c-7.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 48, id: 'shy-salad-58349708', url: 'postgresql://neondb_owner:npg_HZKNh41JlFmL@ep-purple-river-b42wlsko-pooler.c-6.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 49, id: 'withered-unit-58206051', url: 'postgresql://neondb_owner:npg_NwRc8TIM9sSZ@ep-jolly-sun-b5md6ncs-pooler.c-7.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 50, id: 'round-king-81809794', url: 'postgresql://neondb_owner:npg_RewxXtdJA25K@ep-hidden-lake-b57wzg4g-pooler.c-7.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 51, id: 'empty-rice-41159566', url: 'postgresql://neondb_owner:npg_VeBbT75zsgym@ep-hidden-firefly-b41icham-pooler.c-6.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 52, id: 'spring-pine-29100779', url: 'postgresql://neondb_owner:npg_wXf3M5vYyBjS@ep-muddy-lab-b4hpo81b-pooler.c-6.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 53, id: 'lucky-feather-90467306', url: 'postgresql://neondb_owner:npg_4dqKptS9rJYk@ep-cool-lab-b5k9tmdn-pooler.c-7.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 54, id: 'solitary-lake-70005038', url: 'postgresql://neondb_owner:npg_O1AjFDKIgmB0@ep-bold-frost-b4kfhb2s-pooler.c-6.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 55, id: 'steep-breeze-59761029', url: 'postgresql://neondb_owner:npg_fCItUlSO6n1J@ep-steep-truth-b5ri8wkn-pooler.c-7.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 56, id: 'late-boat-16685514', url: 'postgresql://neondb_owner:npg_VKN5rcDfs7Rw@ep-empty-mud-b5ec69iu-pooler.c-7.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 57, id: 'muddy-flower-54009283', url: 'postgresql://neondb_owner:npg_KN6duvJfZGx2@ep-noisy-star-b5eturid-pooler.c-7.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 58, id: 'frosty-forest-21958143', url: 'postgresql://neondb_owner:npg_JF56qNrjuWfX@ep-long-band-b4z2jud1-pooler.c-6.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 59, id: 'fancy-river-23936830', url: 'postgresql://neondb_owner:npg_fG2YjvFKMsR8@ep-rapid-frost-b4ii2dko-pooler.c-6.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 60, id: 'curly-field-96654905', url: 'postgresql://neondb_owner:npg_0fNi1DBlPZgW@ep-raspy-bar-b5qobgbn-pooler.c-7.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 61, id: 'shiny-glade-39393182', url: 'postgresql://neondb_owner:npg_8GnFpa6CxHcX@ep-tiny-rain-b50vboav-pooler.c-7.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 62, id: 'bitter-mud-60230678', url: 'postgresql://neondb_owner:npg_6WxQYFrM0Zhi@ep-gentle-bar-b4zqwnve-pooler.c-6.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 63, id: 'gentle-thunder-10066578', url: 'postgresql://neondb_owner:npg_dj0zbWcS5emq@ep-crimson-cake-b4albe2a-pooler.c-6.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 64, id: 'orange-base-54621862', url: 'postgresql://neondb_owner:npg_w6ngJTB1jlkv@ep-damp-bread-b4mmwjjf-pooler.c-6.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 65, id: 'square-water-72315332', url: 'postgresql://neondb_owner:npg_ZIBDQa9uJ0Yg@ep-sweet-water-b52kwvqm-pooler.c-7.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 66, id: 'restless-smoke-89146904', url: 'postgresql://neondb_owner:npg_heSBv76jWKzg@ep-spring-hall-b5e94wlr-pooler.c-7.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 67, id: 'bold-lake-28793383', url: 'postgresql://neondb_owner:npg_hdAwQYju71Wq@ep-proud-darkness-b51j0bgc-pooler.c-7.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 68, id: 'lucky-glade-07431517', url: 'postgresql://neondb_owner:npg_0zBtbEkFXuc3@ep-wild-meadow-b5pva8wf-pooler.c-7.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 69, id: 'dark-shape-84251091', url: 'postgresql://neondb_owner:npg_lMni6Zp5kYgx@ep-icy-recipe-b58tyrk7-pooler.c-7.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 70, id: 'cool-thunder-41008992', url: 'postgresql://neondb_owner:npg_XYTInVGE4y6s@ep-ancient-hill-b5ddgsmq-pooler.c-7.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 71, id: 'green-rain-25421505', url: 'postgresql://neondb_owner:npg_Ogam4S1CIxtn@ep-rough-math-b4v9s3st-pooler.c-6.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 72, id: 'round-cloud-11719463', url: 'postgresql://neondb_owner:npg_A3UQHsSj1Eap@ep-tiny-leaf-b5k8di18-pooler.c-7.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 73, id: 'cold-brook-09164865', url: 'postgresql://neondb_owner:npg_8iJXKmy2gtwj@ep-bitter-grass-b5fjtv5v-pooler.c-7.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 74, id: 'bitter-sun-40097609', url: 'postgresql://neondb_owner:npg_e5aMKuE2GNLW@ep-crimson-sound-b5c19dkb-pooler.c-7.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 75, id: 'aged-wind-45543531', url: 'postgresql://neondb_owner:npg_oGaIXRtP8qg4@ep-divine-hall-b4ek9fjy-pooler.c-6.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 76, id: 'still-paper-16816878', url: 'postgresql://neondb_owner:npg_JPUd5Mhk4wAt@ep-cool-hall-b4t7h1gk-pooler.c-6.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 77, id: 'dark-forest-83459836', url: 'postgresql://neondb_owner:npg_IRgGbfMOhS28@ep-little-resonance-b42fnocz-pooler.c-6.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 78, id: 'long-salad-40696358', url: 'postgresql://neondb_owner:npg_wmaXz4Uy7SWD@ep-delicate-resonance-b5nvdvx2-pooler.c-7.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 79, id: 'crimson-scene-58649590', url: 'postgresql://neondb_owner:npg_5DThsgzoGV7N@ep-nameless-king-b42q7tz8-pooler.c-6.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 80, id: 'royal-wind-31998812', url: 'postgresql://neondb_owner:npg_c5M1erzJGUgY@ep-proud-cherry-b5be2vx0-pooler.c-7.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 81, id: 'snowy-cake-45936989', url: 'postgresql://neondb_owner:npg_XcQAO5h7WPEt@ep-patient-art-b5njlla6-pooler.c-7.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 82, id: 'orange-grass-55028429', url: 'postgresql://neondb_owner:npg_ofU6zRkLuQt1@ep-soft-dust-b5kqnlhy-pooler.c-7.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 83, id: 'noisy-resonance-25410629', url: 'postgresql://neondb_owner:npg_YRx7ZsEn9FvX@ep-red-hat-b44qog7k-pooler.c-6.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 84, id: 'muddy-king-58267816', url: 'postgresql://neondb_owner:npg_08qpgvCeLOEK@ep-mute-mountain-b5yeqm4e-pooler.c-7.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 85, id: 'polished-smoke-02142756', url: 'postgresql://neondb_owner:npg_hok4FwYS5eMd@ep-mute-rice-b5eulol7-pooler.c-7.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 86, id: 'rough-pine-44913446', url: 'postgresql://neondb_owner:npg_zcKlEUkB16nt@ep-icy-hat-b4kgp6as-pooler.c-6.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 87, id: 'solitary-dawn-13584105', url: 'postgresql://neondb_owner:npg_zNp5vd6jsxFm@ep-jolly-boat-b5cj4q7j-pooler.c-7.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 88, id: 'broad-lab-59771071', url: 'postgresql://neondb_owner:npg_ifOz1mFoNhj7@ep-royal-bar-b4ur5q2f-pooler.c-6.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 89, id: 'red-wind-93678329', url: 'postgresql://neondb_owner:npg_mfJbthUWe01G@ep-square-grass-b4r21qop-pooler.c-6.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 90, id: 'snowy-thunder-32781812', url: 'postgresql://neondb_owner:npg_1HDFY9OTUEom@ep-calm-smoke-b5h1kduw-pooler.c-7.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 91, id: 'morning-rain-15655370', url: 'postgresql://neondb_owner:npg_uawGUChi93JI@ep-wild-band-b470ab5q-pooler.c-6.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 92, id: 'cold-wind-04554807', url: 'postgresql://neondb_owner:npg_O6bi2VoCgeUH@ep-snowy-poetry-b428xzmu-pooler.c-6.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 93, id: 'late-bonus-64725929', url: 'postgresql://neondb_owner:npg_OxYG3IK9pbLS@ep-muddy-hall-b5km56vk-pooler.c-7.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 94, id: 'nameless-term-53416584', url: 'postgresql://neondb_owner:npg_gN7pzK0FdjLn@ep-morning-thunder-b47vntk0-pooler.c-6.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 95, id: 'orange-scene-94265611', url: 'postgresql://neondb_owner:npg_RTHWCoLwtn63@ep-morning-surf-b5fhenh1-pooler.c-7.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 96, id: 'winter-river-52412378', url: 'postgresql://neondb_owner:npg_6rG2OYcqQRZh@ep-quiet-king-b5m4qfr7-pooler.c-7.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 97, id: 'sweet-lake-82765211', url: 'postgresql://neondb_owner:npg_rzjvAw5ODC0e@ep-cold-credit-b5qzbpxh-pooler.c-7.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 98, id: 'lively-mud-66446444', url: 'postgresql://neondb_owner:npg_GUW9Tgq1jswE@ep-fragrant-darkness-b42nnro8-pooler.c-6.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  { shard: 99, id: 'dawn-boat-53206994', url: 'postgresql://neondb_owner:npg_nifU7eJG5saC@ep-bitter-bar-b5rqy7qm-pooler.c-7.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require' }
];

async function main() {
  console.log(`[*] Connecting to Central Hub database...`);
  
  // 1. Ensure table exists
  await sql`
    CREATE TABLE IF NOT EXISTS neon_projects_registry (
      id SERIAL PRIMARY KEY,
      project_id VARCHAR(64) UNIQUE NOT NULL,
      project_name VARCHAR(128) NOT NULL,
      region_id VARCHAR(64) DEFAULT 'aws-us-east-2',
      database_url TEXT NOT NULL,
      status VARCHAR(32) DEFAULT 'active',
      is_hub BOOLEAN DEFAULT FALSE,
      assigned_shards INT[] DEFAULT '{}',
      stats JSONB DEFAULT '{"seeds": 0, "candidates": 0, "competitors": 0, "keywords": 0, "storage_mb": 0}'::jsonb,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_neon_projects_status ON neon_projects_registry(status);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_neon_projects_is_hub ON neon_projects_registry(is_hub);`;

  // 2. Ensure Hub is registered
  const hubId = 'weathered-band-34334459';
  await sql`
    INSERT INTO neon_projects_registry (
      project_id, project_name, region_id, database_url, status, is_hub, stats, updated_at
    ) VALUES (
      ${hubId}, 'pin-arbitrage-engine (Hub)', 'aws-us-east-2', ${DATABASE_URL}, 'active', TRUE,
      '{"seeds": 0, "candidates": 0, "competitors": 0, "keywords": 0, "storage_mb": 42}'::jsonb, NOW()
    )
    ON CONFLICT (project_id) DO UPDATE SET
      database_url = EXCLUDED.database_url,
      is_hub = TRUE,
      status = 'active',
      updated_at = NOW();
  `;
  console.log(`[+] Registered Hub project: ${hubId}`);

  // 3. Register all 99 shards in batches
  console.log(`[*] Registering 99 shards in neon_projects_registry...`);
  let registered = 0;
  for (const s of shards) {
    const shardNum = s.shard.toString().padStart(2, '0');
    const name = `pin-arbitrage-shard-${shardNum}`;
    await sql`
      INSERT INTO neon_projects_registry (
        project_id, project_name, region_id, database_url, status, is_hub, assigned_shards, stats, updated_at
      ) VALUES (
        ${s.id}, ${name}, 'aws-us-east-2', ${s.url}, 'active', FALSE, ARRAY[${s.shard}]::INT[],
        '{"seeds": 0, "candidates": 0, "competitors": 0, "keywords": 0, "storage_mb": 0}'::jsonb, NOW()
      )
      ON CONFLICT (project_id) DO UPDATE SET
        project_name = EXCLUDED.project_name,
        database_url = EXCLUDED.database_url,
        assigned_shards = EXCLUDED.assigned_shards,
        status = 'active',
        updated_at = NOW();
    `;
    registered++;
    if (registered % 20 === 0 || registered === shards.length) {
      console.log(`  -> Registered ${registered}/99 shards...`);
    }
  }

  // 4. Verify total count in DB
  const [countRow] = await sql`SELECT count(*)::INT as total, count(*) FILTER (WHERE is_hub) as hubs, count(*) FILTER (WHERE NOT is_hub) as shards FROM neon_projects_registry;`;
  console.log(`\n========================================`);
  console.log(`[+] SUCCESS: Fleet Registry fully populated!`);
  console.log(`[+] Total Projects in Database: ${countRow.total}`);
  console.log(`[+] Hub Projects: ${countRow.hubs}`);
  console.log(`[+] Shard Projects: ${countRow.shards}`);
  console.log(`========================================\n`);
}

main().catch(err => {
  console.error('[-] Error populating fleet:', err);
  process.exit(1);
});

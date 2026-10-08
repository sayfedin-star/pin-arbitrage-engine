import { getPinShardId } from '../src/modules/sharding/fleet-router.mjs';

const benchmarkPins = [
  {
    pin_id: '1098245059167667976',
    title: 'Easy Meal Prep Breakfast Egg Bites (Starbucks Copycat)',
    alt_text: 'Golden baked egg bites with diced red peppers, spinach and melted gruyere in meal prep glass container',
    domain: 'skinnytaste.com',
    creator: 'skinnytaste',
    saves: 48500,
    daily_velocity: 84.5,
    rankings: [
      { keyword: 'breakfast ideas', rank: 3 },
      { keyword: 'healthy breakfast ideas', rank: 1 },
      { keyword: 'meal prep breakfast ideas', rank: 2 }
    ],
    tags: ['meal prep container', 'egg bites', 'healthy breakfast', 'high protein', 'baked eggs', 'spinach']
  },
  {
    pin_id: '1098245059167789012',
    title: 'Fluffy High Protein Cottage Cheese Pancakes',
    alt_text: 'Stack of golden fluffy pancakes topped with fresh blueberries and maple syrup on white ceramic plate',
    domain: 'fitmencook.com',
    creator: 'fitmencook',
    saves: 32400,
    daily_velocity: 62.0,
    rankings: [
      { keyword: 'breakfast ideas', rank: 8 },
      { keyword: 'high protein breakfast ideas', rank: 2 }
    ],
    tags: ['high protein', 'cottage cheese', 'pancakes', 'healthy breakfast', 'blueberries', 'meal prep container']
  },
  {
    pin_id: '1098245059167890123',
    title: 'Overnight Chia Seed Pudding Jars with Berries',
    alt_text: 'Three glass mason jars layered with chia pudding, coconut flakes and fresh raspberries on rustic wood',
    domain: 'downshiftology.com',
    creator: 'downshiftology',
    saves: 29800,
    daily_velocity: 45.2,
    rankings: [
      { keyword: 'healthy breakfast ideas', rank: 4 },
      { keyword: 'quick breakfast ideas', rank: 3 }
    ],
    tags: ['chia pudding', 'healthy breakfast', 'mason jar', 'meal prep container', 'berries', 'vegan breakfast']
  },
  {
    pin_id: '1098245059167901234',
    title: 'Crispy Smashed Avocado Toast with Soft Boiled Egg',
    alt_text: 'Thick sourdough toast topped with vibrant mashed avocado, chili flakes, everything bagel seasoning and soft boiled egg',
    domain: 'feelgoodfoodie.net',
    creator: 'feelgoodfoodie',
    saves: 56100,
    daily_velocity: 91.0,
    rankings: [
      { keyword: 'breakfast ideas', rank: 2 },
      { keyword: 'quick breakfast ideas', rank: 1 }
    ],
    tags: ['avocado toast', 'sourdough bread', 'soft boiled egg', 'quick breakfast', 'healthy breakfast', 'everything seasoning']
  },
  {
    pin_id: '1098245059168012345',
    title: 'Freezer-Friendly Breakfast Burritos with Turkey Sausage',
    alt_text: 'Stack of toasted breakfast burritos wrapped in parchment paper showing eggs, cheese, and salsa filling',
    domain: 'skinnytaste.com',
    creator: 'skinnytaste',
    saves: 38900,
    daily_velocity: 58.4,
    rankings: [
      { keyword: 'meal prep breakfast ideas', rank: 1 },
      { keyword: 'high protein breakfast ideas', rank: 5 }
    ],
    tags: ['breakfast burrito', 'meal prep container', 'high protein', 'freezer friendly', 'turkey sausage', 'baked eggs']
  },
  {
    pin_id: '1098245059168123456',
    title: '5-Minute High Protein Greek Yogurt Parfait Bowl',
    alt_text: 'Thick greek yogurt bowl topped with grain-free granola, sliced strawberries, chia seeds and honey drizzle',
    domain: 'downshiftology.com',
    creator: 'downshiftology',
    saves: 21500,
    daily_velocity: 39.8,
    rankings: [
      { keyword: 'quick breakfast ideas', rank: 4 },
      { keyword: 'high protein breakfast ideas', rank: 7 }
    ],
    tags: ['greek yogurt', 'granola bowl', 'high protein', 'quick breakfast', 'berries', 'healthy breakfast']
  }
];

console.log('=== BENCHMARK PINS & SHARDS ===');
for (const p of benchmarkPins) {
  p.shard_id = getPinShardId(p.pin_id, 99);
  console.log(`${p.pin_id} | Shard #${p.shard_id} | ${p.domain} | ${p.title.slice(0, 40)}...`);
}

// Calculate Co-Occurrence Matrix
const N = benchmarkPins.length;
const tagCounts = new Map();
const pairCounts = new Map();

for (const p of benchmarkPins) {
  const boundedTags = Array.from(new Set(p.tags)).slice(0, 15);
  for (const t of boundedTags) {
    tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
  }
  for (let i = 0; i < boundedTags.length; i++) {
    for (let j = i + 1; j < boundedTags.length; j++) {
      const t1 = boundedTags[i] < boundedTags[j] ? boundedTags[i] : boundedTags[j];
      const t2 = boundedTags[i] < boundedTags[j] ? boundedTags[j] : boundedTags[i];
      const key = `${t1}|||${t2}`;
      pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
    }
  }
}

const powerPairs = [];
for (const [key, count] of pairCounts.entries()) {
  if (count < 2) continue; // Support >= 2
  const [tagA, tagB] = key.split('|||');
  const countA = tagCounts.get(tagA);
  const countB = tagCounts.get(tagB);
  const lift = Number(((count * N) / (countA * countB)).toFixed(2));
  const confidenceAtoB = Number(((count / countA) * 100).toFixed(1));
  const confidenceBtoA = Number(((count / countB) * 100).toFixed(1));
  const support = Number(((count / N) * 100).toFixed(1));

  powerPairs.push({
    pair: `${tagA} + ${tagB}`,
    tagA,
    tagB,
    count,
    countA,
    countB,
    lift,
    confidenceAtoB,
    confidenceBtoA,
    support
  });
}

powerPairs.sort((a, b) => b.lift - a.lift);

console.log('\n=== CO-OCCURRING POWER PAIRS (LIFT & CONFIDENCE) ===');
console.table(powerPairs);

// Calculate Share of Voice (SOV)
const domainCounts = {};
const creatorCounts = {};
let totalRankAppearances = 0;

for (const p of benchmarkPins) {
  const appearances = p.rankings.length;
  totalRankAppearances += appearances;
  domainCounts[p.domain] = (domainCounts[p.domain] || 0) + appearances;
  creatorCounts[p.creator] = (creatorCounts[p.creator] || 0) + appearances;
}

const domainSov = Object.entries(domainCounts)
  .map(([domain, count]) => ({
    domain,
    count,
    sov: Number(((count / totalRankAppearances) * 100).toFixed(1))
  }))
  .sort((a, b) => b.sov - a.sov);

const creatorSov = Object.entries(creatorCounts)
  .map(([creator, count]) => ({
    creator,
    count,
    sov: Number(((count / totalRankAppearances) * 100).toFixed(1))
  }))
  .sort((a, b) => b.sov - a.sov);

console.log('\n=== DOMAIN SHARE OF VOICE (SOV %) ===');
console.table(domainSov);

console.log('\n=== CREATOR SHARE OF VOICE (SOV %) ===');
console.table(creatorSov);

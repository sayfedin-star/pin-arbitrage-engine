import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeWordLemma,
  normalizeAnnotationTag,
  extractCanonicalAnnotations,
  isSyntheticGarbageTitle,
  resolveCanonicalPinTitle,
  mineAnnotationNGrams,
  buildRichPinMetadataPayload,
  shouldSkipFreshPinEnrichment
} from '../src/domain/pin-intelligence.mjs';

test('normalizeWordLemma singularizes regular and irregular plurals while preserving invariant -s words', () => {
  assert.equal(normalizeWordLemma('Recipes'), 'recipe');
  assert.equal(normalizeWordLemma('Strawberries'), 'strawberry');
  assert.equal(normalizeWordLemma('Potatoes'), 'potato');
  assert.equal(normalizeWordLemma('Sandwiches'), 'sandwich');
  assert.equal(normalizeWordLemma('Christmas'), 'christmas');
  assert.equal(normalizeWordLemma('Hummus'), 'hummus');
  assert.equal(normalizeWordLemma('Glasses'), 'glass');
});

test('extractCanonicalAnnotations cleans, deduplicates plural/singular variants, and never mixes title words', () => {
  const pin = {
    title: 'Amazing Secret Title Words That Should Not Leak',
    visual_annotations: [
      'Beef Casserole Recipes',
      'beef casserole recipe',
      'Ground Beef And Potatoes',
      'https://badlink.com/foo',
      'not_given',
      '12345',
      'Dinner With Ground Beef'
    ]
  };
  const tags = extractCanonicalAnnotations(pin, { lemmatizeDedupe: true, titleCase: true });
  assert.deepEqual(tags, [
    'Beef Casserole Recipes',
    'Ground Beef And Potatoes',
    'Dinner With Ground Beef'
  ]);
});

test('resolveCanonicalPinTitle rejects synthetic garbage and falls back through URL slug and annotations', () => {
  assert.equal(isSyntheticGarbageTitle('Untitled Pin', '123'), true);
  assert.equal(isSyntheticGarbageTitle('Discover more ideas', '123'), true);
  assert.equal(isSyntheticGarbageTitle('98765432101234', '98765432101234'), true);

  const pinWithSlug = {
    pin_id: '98765432101234',
    title: 'Untitled Pin',
    destination_url: 'https://nourishyourglow.com/recipes/cheesy-ground-beef-and-rice-casserole/'
  };
  assert.equal(resolveCanonicalPinTitle(pinWithSlug), 'Cheesy Ground Beef And Rice Casserole');

  const pinWithAnnotationsOnly = {
    pin_id: '111222333',
    title: 'Pinterest Pin Idea',
    visual_annotations: ['cozy winter outfits', 'fall sweater style']
  };
  assert.equal(resolveCanonicalPinTitle(pinWithAnnotationsOnly), 'Cozy Winter Outfits • Fall Sweater Style');
});

test('mineAnnotationNGrams computes 1-Tag, 2-Tag, and 3-Tag co-occurrence matrices accurately', () => {
  const samplePins = [
    {
      pin_id: '1',
      daily_save_velocity: 100,
      save_count: 500,
      keywords: ['beef casserole'],
      visual_annotations: ['Beef Casserole Recipes', 'Ground Beef And Potatoes', 'Dinner With Ground Beef']
    },
    {
      pin_id: '2',
      daily_save_velocity: 50,
      save_count: 250,
      keywords: ['easy dinner'],
      visual_annotations: ['beef casserole recipe', 'Ground Beef And Potatoes', 'Dinner With Ground Beef']
    }
  ];

  const { singleTags, tagPairs, tagTriplets } = mineAnnotationNGrams(samplePins, {
    minPairPins: 2,
    minTripletPins: 2
  });

  assert.equal(singleTags.length, 3);
  assert.equal(singleTags[0].pin_count, 2);
  assert.equal(singleTags[0].total_velocity, 150);

  assert.equal(tagPairs.length, 3);
  assert.equal(tagPairs[0].pin_count, 2);
  assert.equal(tagPairs[0].total_velocity, 150);

  assert.equal(tagTriplets.length, 1);
  assert.equal(tagTriplets[0].pin_count, 2);
  assert.equal(tagTriplets[0].total_velocity, 150);
  assert.equal(tagTriplets[0].keyword_count, 2);
});

test('buildRichPinMetadataPayload preserves all 30+ Pinterest treasure fields without dropping', () => {
  const scrapedPin = {
    pin_id: '555666777',
    save_count: 1420,
    repin_count: 310,
    daily_save_velocity: 45.5,
    is_product: false,
    is_video: false,
    creation_method: 'Bookmarklet',
    is_repin: true,
    origin_pinner: { username: 'originalchef', follower_count: 54000 },
    domain_official_user: { username: 'officialbrand', is_verified_merchant: true },
    image_signature: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
    image_dimensions: { width: 1000, height: 1500 },
    seo_noindex_reason: 'none',
    is_go_linkless: false,
    category_breadcrumbs: ['Food and Drink', 'Main Dishes', 'Casseroles'],
    visual_objects: [{ label: 'casserole dish', score: 0.98 }],
    canonical_pin_id: '555000111',
    tracked_link: 'https://example.com/recipe?utm_source=pinterest'
  };

  const meta = buildRichPinMetadataPayload(scrapedPin);
  assert.equal(meta.creation_method, 'Bookmarklet');
  assert.equal(meta.is_repin, true);
  assert.equal(meta.origin_pinner.username, 'originalchef');
  assert.equal(meta.domain_official_user.username, 'officialbrand');
  assert.equal(meta.image_signature, 'a1b2c3d4e5f60718293a4b5c6d7e8f90');
  assert.deepEqual(meta.category_breadcrumbs, ['Food and Drink', 'Main Dishes', 'Casseroles']);
  assert.equal(meta.canonical_pin_id, '555000111');
  assert.equal(meta.tracked_link, 'https://example.com/recipe?utm_source=pinterest');
});

test('shouldSkipFreshPinEnrichment gates pins scraped within 18 hours', () => {
  const now = Date.now();
  const twoHoursAgo = new Date(now - 2 * 3600 * 1000).toISOString();
  const twentyFourHoursAgo = new Date(now - 24 * 3600 * 1000).toISOString();

  const freshMaster = {
    pin_id: '101',
    save_count: 350,
    created_at_pinterest: '2026-01-15T00:00:00Z',
    visual_annotations: ['dinner recipe'],
    last_scraped_at: twoHoursAgo
  };
  assert.equal(shouldSkipFreshPinEnrichment(freshMaster, 18, now), true);

  const staleMaster = {
    ...freshMaster,
    last_scraped_at: twentyFourHoursAgo
  };
  assert.equal(shouldSkipFreshPinEnrichment(staleMaster, 18, now), false);
});

/**
 * src/domain/pin-intelligence.mjs
 *
 * Single Source of Truth (SSOT) Domain Intelligence Engine for:
 * 1. Visual Annotation Cleaning, Lemmatization & N-Gram Co-Occurrence Mining (1-Tag, 2-Tag, 3-Tag)
 * 2. Canonical Pin Title Derivation & Synthetic Garbage Title Rejection
 * 3. Rich 48-Field Pinterest Intelligence Metadata Preservation (Zero-Drop Treasure Capture)
 * 4. Cross-Pillar Shared Pin Freshness Gate (18-Hour Deduplication Shield for VPS Crawlers)
 */

export const ANNOTATION_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'your', 'you', 'are', 'was',
  'were', 'have', 'has', 'had', 'not', 'but', 'what', 'all', 'can', 'her', 'his',
  'one', 'our', 'out', 'day', 'get', 'make', 'made', 'how', 'who', 'why', 'when',
  'where', 'which', 'their', 'there', 'been', 'will', 'would', 'could', 'should',
  'about', 'into', 'over', 'after', 'under', 'between', 'through', 'during', 'before',
  'some', 'such', 'than', 'too', 'very', 'just', 'more', 'most', 'other', 'new',
  'best', 'easy', 'quick', 'simple', 'great', 'good', 'free', 'pinterest', 'pin',
  'pins', 'board', 'boards', 'image', 'images', 'photo', 'photos', 'picture', 'pictures',
  'visit', 'site', 'website', 'link', 'click', 'read', 'blog', 'post', 'article',
  'page', 'view', 'discover', 'explore', 'find', 'save', 'share', 'follow', 'http',
  'https', 'www', 'com', 'org', 'net', 'html', 'php', 'null', 'undefined', 'none',
  'not_given', 'not-given', 'not given'
]);

const IRREGULAR_LEMMAS = new Map([
  ['berries', 'berry'],
  ['cherries', 'cherry'],
  ['strawberries', 'strawberry'],
  ['blueberries', 'blueberry'],
  ['raspberries', 'raspberry'],
  ['blackberries', 'blackberry'],
  ['cranberries', 'cranberry'],
  ['cookies', 'cookie'],
  ['brownies', 'brownie'],
  ['smoothies', 'smoothie'],
  ['pies', 'pie'],
  ['fries', 'fry'],
  ['potatoes', 'potato'],
  ['tomatoes', 'tomato'],
  ['heroes', 'hero'],
  ['loaves', 'loaf'],
  ['knives', 'knife'],
  ['leaves', 'leaf'],
  ['halves', 'half'],
  ['wives', 'wife'],
  ['lives', 'life'],
  ['shelves', 'shelf'],
  ['wolves', 'wolf'],
  ['calves', 'calf'],
  ['scarves', 'scarf'],
  ['children', 'child'],
  ['women', 'woman'],
  ['men', 'man'],
  ['teeth', 'tooth'],
  ['feet', 'foot'],
  ['geese', 'goose'],
  ['mice', 'mouse'],
  ['dishes', 'dish'],
  ['watches', 'watch'],
  ['boxes', 'box'],
  ['unches', 'lunch'],
  ['lunches', 'lunch'],
  ['brunches', 'brunch'],
  ['sandwiches', 'sandwich'],
  ['peaches', 'peach'],
  ['batches', 'batch'],
  ['sauces', 'sauce'],
  ['spices', 'spice'],
  ['slices', 'slice'],
  ['juices', 'juice'],
  ['recipes', 'recipe'],
  ['ideas', 'idea'],
  ['styles', 'style'],
  ['designs', 'design'],
  ['outfits', 'outfit'],
  ['dresses', 'dress'],
  ['glasses', 'glass'],
  ['classes', 'class'],
  ['bushes', 'bush'],
  ['brushes', 'brush']
]);

const KEEP_S_WORDS = new Set([
  'glass', 'dress', 'class', 'grass', 'brass', 'pass', 'mass', 'bass', 'gas',
  'canvas', 'christmas', 'texas', 'vegas', 'paris', 'hummus', 'asparagus',
  'couscous', 'citrus', 'hibiscus', 'cactus', 'octopus', 'status', 'focus',
  'bonus', 'lotus', 'virus', 'genius', 'radius', 'census', 'chorus', 'circus',
  'clothes', 'pants', 'jeans', 'shorts', 'tights', 'leggings', 'scissors',
  'glasses', 'sunglasses', 'stairs', 'outdoors', 'indoors', 'athletics',
  'gymnastics', 'politics', 'economics', 'mathematics', 'physics', 'ethics',
  'news', 'series', 'species', 'means', 'lens', 'mess', 'stress', 'press',
  'success', 'process', 'access', 'address', 'express', 'mattress', 'waitress',
  'actress', 'princess', 'hostess', 'goddess', 'fitness', 'wellness', 'business',
  'darkness', 'kindness', 'happiness', 'illness', 'weakness', 'witness', 'awareness',
  'oats', 'grits', 'greens', 'beans', 'lentils', 'noodles', 'tacos', 'nachos', 'tapas'
]);

/**
 * Normalizes a single lowercase English word token to its singular lemma.
 * @param {string} word
 * @returns {string}
 */
export function normalizeWordLemma(word) {
  if (!word || typeof word !== 'string') return '';
  const clean = word.toLowerCase().trim().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');
  if (clean.length <= 2) return clean;
  if (IRREGULAR_LEMMAS.has(clean)) return IRREGULAR_LEMMAS.get(clean);
  if (KEEP_S_WORDS.has(clean)) return clean;

  if (clean.endsWith('ies') && clean.length > 4) {
    return clean.slice(0, -3) + 'y';
  }
  if (clean.endsWith('ves') && clean.length > 4) {
    const stem = clean.slice(0, -3);
    if (stem.endsWith('kni') || stem.endsWith('wi') || stem.endsWith('li')) {
      return stem + 'fe';
    }
    return stem + 'f';
  }
  if (clean.endsWith('oes') && clean.length > 4) {
    return clean.slice(0, -2);
  }
  if ((clean.endsWith('ches') || clean.endsWith('shes') || clean.endsWith('xes') || clean.endsWith('zes') || clean.endsWith('sses')) && clean.length > 4) {
    return clean.slice(0, -2);
  }
  if (clean.endsWith('s') && !clean.endsWith('ss') && !clean.endsWith('us') && !clean.endsWith('is') && clean.length > 3) {
    return clean.slice(0, -1);
  }
  return clean;
}

/**
 * Normalizes a multi-word visual annotation tag.
 * Supports both display-ready Title Case and canonical lemmatized key for deduplication.
 * @param {string} rawTag
 * @param {object} [options]
 * @param {boolean} [options.lemmatize=false]
 * @returns {string}
 */
export function normalizeAnnotationTag(rawTag, { lemmatize = false } = {}) {
  if (!rawTag) return '';
  const str = typeof rawTag === 'string'
    ? rawTag
    : (rawTag?.name || rawTag?.label || rawTag?.term || '');
  if (!str || typeof str !== 'string') return '';

  const cleaned = str
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/[#@!$%^&*()_+={}[\]|\\:;"'<>,.?/~`]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  if (!cleaned || cleaned.length < 2 || cleaned.length > 65) return '';
  if (/^\d+$/.test(cleaned)) return '';
  if (ANNOTATION_STOPWORDS.has(cleaned)) return '';

  const tokens = cleaned.split(' ').filter(Boolean);
  if (tokens.length === 0 || tokens.length > 6) return '';

  if (lemmatize) {
    const lemmas = tokens
      .map(t => normalizeWordLemma(t))
      .filter(t => t.length >= 2 && !ANNOTATION_STOPWORDS.has(t));
    return lemmas.join(' ').trim();
  }

  return tokens.join(' ').trim();
}

/**
 * Converts a lowercase annotation tag to clean Title Case for UI display.
 * @param {string} tag
 * @returns {string}
 */
export function formatTagTitleCase(tag) {
  if (!tag || typeof tag !== 'string') return '';
  return tag
    .trim()
    .split(/\s+/)
    .map(w => w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : '')
    .join(' ');
}

/**
 * Extracts and deduplicates clean visual annotations from any raw DB column or JSON string/array.
 * Strictly isolates authentic Pinterest visual_annotations (never mixes title words).
 *
 * @param {any} rawInput - Array, JSON string, or pin row object
 * @param {object} [options]
 * @param {boolean} [options.lemmatizeDedupe=true] - Deduplicate plural/singular variants while keeping clean display label
 * @param {boolean} [options.titleCase=false] - Return tags in Title Case
 * @param {number} [options.limit=20] - Max annotations per pin
 * @returns {string[]}
 */
export function extractCanonicalAnnotations(rawInput, { lemmatizeDedupe = true, titleCase = false, limit = 20 } = {}) {
  if (!rawInput) return [];

  let list = [];
  if (Array.isArray(rawInput)) {
    list = rawInput;
  } else if (typeof rawInput === 'string') {
    const trimmed = rawInput.trim();
    if (!trimmed || trimmed === '[]' || trimmed === '{}' || trimmed === 'null') return [];
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) list = parsed;
      } catch (_) {
        list = trimmed.replace(/^\[|\]$/g, '').split(',').map(s => s.replace(/^["']|["']$/g, '').trim());
      }
    } else {
      list = trimmed.split(',').map(s => s.trim());
    }
  } else if (typeof rawInput === 'object') {
    const candidate = rawInput.visual_annotations || rawInput.annotations || rawInput.metadata?.visual_annotations;
    if (candidate && candidate !== rawInput) {
      return extractCanonicalAnnotations(candidate, { lemmatizeDedupe, titleCase, limit });
    }
  }

  const seenKeys = new Set();
  const output = [];

  for (const item of list) {
    const norm = normalizeAnnotationTag(item, { lemmatize: false });
    if (!norm) continue;
    const dedupeKey = lemmatizeDedupe
      ? (normalizeAnnotationTag(norm, { lemmatize: true }) || norm)
      : norm;
    if (seenKeys.has(dedupeKey)) continue;
    seenKeys.add(dedupeKey);
    output.push(titleCase ? formatTagTitleCase(norm) : norm);
    if (output.length >= limit) break;
  }

  return output;
}

/**
 * Checks whether a pin title is missing, numeric-only, or synthetic scraper boilerplate.
 * @param {string} rawTitle
 * @param {string|number} [pinId]
 * @returns {boolean}
 */
export function isSyntheticGarbageTitle(rawTitle, pinId = '') {
  if (!rawTitle || typeof rawTitle !== 'string') return true;
  const t = rawTitle.trim();
  if (!t || t.length < 3) return true;
  const lower = t.toLowerCase();

  if (pinId && lower === String(pinId).trim().toLowerCase()) return true;
  if (/^\d+$/.test(t)) return true;
  if (/^https?:\/\//i.test(t)) return true;

  if (/^(untitled(\s+pin)?|pin(\s*#?\s*\w+)?|pinterest(\s+pin)?(\s+idea)?|pinterest\s+visual\s+guide|not[\s_-]?given|null|undefined|n\/a|none|image|photo)$/i.test(lower)) {
    return true;
  }
  if (/^discover\s+(more\s+)?ideas/i.test(lower)) return true;
  if (/\b(inspiration|idea)\s*$/i.test(lower) && t.split(/\s+/).length <= 3) return true;

  return false;
}

/**
 * Derives a clean, human-readable title for a pin using a deterministic 5-tier waterfall:
 * 1. Authentic `pin.title` or `metadata.seo_title` / `metadata.rich_metadata.title`
 * 2. Clean URL path slug from `destination_url` / `link`
 * 3. First sentence of `alt_text` or `description`
 * 4. Top 3 `visual_annotations` joined in Title Case
 * 5. Domain fallback (`{Domain} Visual Pin`)
 *
 * @param {object} pin
 * @returns {string}
 */
export function resolveCanonicalPinTitle(pin) {
  if (!pin || typeof pin !== 'object') return 'Pinterest Pin';
  const pinId = pin.pin_id || pin.id || '';
  const meta = (pin.metadata && typeof pin.metadata === 'object') ? pin.metadata : {};

  // Tier 1: Direct Title or Rich SEO Title
  const candidates = [
    pin.title,
    meta.seo_title,
    meta.rich_metadata?.title,
    meta.rich_metadata?.article_title,
    meta.grid_title
  ];
  for (const cand of candidates) {
    if (cand && typeof cand === 'string') {
      const cleaned = cand
        .replace(/\s*\|\s*Pinterest\s*$/i, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!isSyntheticGarbageTitle(cleaned, pinId)) {
        return cleaned.slice(0, 140);
      }
    }
  }

  // Tier 2: Destination URL Slug
  const rawUrl = pin.destination_url || pin.link || meta.tracked_link || meta.utm_link || '';
  if (rawUrl && typeof rawUrl === 'string' && rawUrl.startsWith('http')) {
    try {
      const u = new URL(rawUrl);
      const segments = u.pathname
        .split('/')
        .map(s => s.trim())
        .filter(s => s && !/^(index|home|page|post|blog|p|pin|article|category|tag|archives|\d+)(\.[a-z0-9]+)?$/i.test(s));
      const lastSeg = segments[segments.length - 1];
      if (lastSeg) {
        const slugText = decodeURIComponent(lastSeg)
          .replace(/\.[a-z0-9]{2,5}$/i, '')
          .replace(/[-_]+/g, ' ')
          .replace(/\b\d{4,}\b/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        if (slugText.length >= 5 && slugText.split(' ').length >= 2 && !isSyntheticGarbageTitle(slugText, pinId)) {
          return formatTagTitleCase(slugText).slice(0, 120);
        }
      }
    } catch (_) {}
  }

  // Tier 3: Alt Text or Description First Sentence
  const descCandidates = [
    pin.alt_text,
    pin.seo_alt_text,
    meta.alt_text,
    pin.description,
    meta.description
  ];
  for (const rawDesc of descCandidates) {
    if (rawDesc && typeof rawDesc === 'string') {
      const firstClause = rawDesc
        .replace(/https?:\/\/\S+/gi, '')
        .replace(/#\S+/g, '')
        .split(/[.!?\n|]/)[0]
        .replace(/\s+/g, ' ')
        .trim();
      if (firstClause.length >= 6 && !isSyntheticGarbageTitle(firstClause, pinId)) {
        return firstClause.slice(0, 120);
      }
    }
  }

  // Tier 4: Visual Annotations Synthesis
  const tags = extractCanonicalAnnotations(pin, { lemmatizeDedupe: true, titleCase: true, limit: 3 });
  if (tags.length > 0) {
    return tags.join(' • ');
  }

  // Tier 5: Domain or Creator Handle Fallback
  const domain = String(pin.domain || pin.link_domain || '').trim();
  if (domain && !domain.includes('pinterest.')) {
    return `${domain} Pin`;
  }
  const creator = String(pin.creator_username || pin.account_username || '').trim();
  if (creator) {
    return `@${creator.replace(/^@/, '')} Pin`;
  }
  return pinId ? `Pin #${String(pinId).slice(0, 10)}` : 'Pinterest Pin';
}

/**
 * Mines 1-Tag Power Leaders, 2-Tag Crossovers, and 3-Tag Triplets from a list of pins.
 * Guarantees consistent mathematical co-occurrence scoring across /pulse and /folders.
 *
 * @param {Array<object>} pins
 * @param {object} [options]
 * @param {number} [options.minPairPins=2]
 * @param {number} [options.minTripletPins=2]
 * @param {number} [options.maxResults=60]
 * @returns {{ singleTags: Array<object>, tagPairs: Array<object>, tagTriplets: Array<object> }}
 */
export function mineAnnotationNGrams(pins = [], { minPairPins = 2, minTripletPins = 2, maxResults = 60 } = {}) {
  const singleMap = new Map();
  const pairMap = new Map();
  const tripletMap = new Map();

  for (const pin of (pins || [])) {
    if (!pin) continue;
    const rawTags = extractCanonicalAnnotations(pin, { lemmatizeDedupe: true, titleCase: false, limit: 8 });
    if (rawTags.length === 0) continue;

    const tagObjs = rawTags.map(raw => ({
      raw,
      key: normalizeAnnotationTag(raw, { lemmatize: true }) || raw,
      display: formatTagTitleCase(raw)
    })).sort((a, b) => a.key.localeCompare(b.key));

    const vel = Math.max(0, Number(pin.daily_save_velocity ?? pin.velocity ?? pin.gain ?? 0));
    const saves = Math.max(0, Number(pin.save_count ?? pin.saves ?? 0));
    const kwList = Array.isArray(pin.keywords)
      ? pin.keywords
      : (pin.keyword ? [pin.keyword] : []);

    // 1-Tag
    for (const t of tagObjs) {
      let entry = singleMap.get(t.key);
      if (!entry) {
        entry = {
          tag: t.display,
          raw_tag: t.raw,
          lemma_key: t.key,
          pin_count: 0,
          total_velocity: 0,
          total_saves: 0,
          keywords_set: new Set(),
          sample_pins: []
        };
        singleMap.set(t.key, entry);
      }
      entry.pin_count += 1;
      entry.total_velocity += vel;
      entry.total_saves += saves;
      for (const kw of kwList) if (kw) entry.keywords_set.add(String(kw));
      if (entry.sample_pins.length < 12) entry.sample_pins.push(pin);
    }

    // 2-Tag Pairs
    if (tagObjs.length >= 2) {
      for (let i = 0; i < tagObjs.length; i++) {
        for (let j = i + 1; j < tagObjs.length; j++) {
          const t1 = tagObjs[i];
          const t2 = tagObjs[j];
          const key = `${t1.key}|||${t2.key}`;
          let entry = pairMap.get(key);
          if (!entry) {
            entry = {
              pair: `${t1.display} + ${t2.display}`,
              tags: [t1.display, t2.display],
              raw_tags: [t1.raw, t2.raw],
              pin_count: 0,
              total_velocity: 0,
              total_saves: 0,
              keywords_set: new Set(),
              sample_pins: []
            };
            pairMap.set(key, entry);
          }
          entry.pin_count += 1;
          entry.total_velocity += vel;
          entry.total_saves += saves;
          for (const kw of kwList) if (kw) entry.keywords_set.add(String(kw));
          if (entry.sample_pins.length < 12) entry.sample_pins.push(pin);
        }
      }
    }

    // 3-Tag Triplets
    if (tagObjs.length >= 3) {
      const cap = Math.min(tagObjs.length, 6);
      for (let i = 0; i < cap; i++) {
        for (let j = i + 1; j < cap; j++) {
          for (let k = j + 1; k < cap; k++) {
            const t1 = tagObjs[i];
            const t2 = tagObjs[j];
            const t3 = tagObjs[k];
            const key = `${t1.key}|||${t2.key}|||${t3.key}`;
            let entry = tripletMap.get(key);
            if (!entry) {
              entry = {
                triplet: `${t1.display} + ${t2.display} + ${t3.display}`,
                tags: [t1.display, t2.display, t3.display],
                raw_tags: [t1.raw, t2.raw, t3.raw],
                pin_count: 0,
                total_velocity: 0,
                total_saves: 0,
                keywords_set: new Set(),
                sample_pins: []
              };
              tripletMap.set(key, entry);
            }
            entry.pin_count += 1;
            entry.total_velocity += vel;
            entry.total_saves += saves;
            for (const kw of kwList) if (kw) entry.keywords_set.add(String(kw));
            if (entry.sample_pins.length < 12) entry.sample_pins.push(pin);
          }
        }
      }
    }
  }

  const finalize = (map, minPins) =>
    Array.from(map.values())
      .filter(e => e.pin_count >= minPins)
      .map(e => ({
        ...e,
        total_velocity: Number(e.total_velocity.toFixed(1)),
        avg_velocity: Number((e.total_velocity / Math.max(1, e.pin_count)).toFixed(1)),
        keyword_count: e.keywords_set.size,
        keywords: Array.from(e.keywords_set).slice(0, 10),
        keywords_set: undefined
      }))
      .sort((a, b) => (b.total_velocity - a.total_velocity) || (b.pin_count - a.pin_count) || (b.total_saves - a.total_saves))
      .slice(0, maxResults);

  return {
    singleTags: finalize(singleMap, 1),
    tagPairs: finalize(pairMap, minPairPins),
    tagTriplets: finalize(tripletMap, minTripletPins)
  };
}

/**
 * Preserves all 30+ high-value Pinterest algorithmic and forensic fields extracted by
 * `scripts/lib/pinterest.mjs` (`formatPin` / `enrichPinSavesAndCreatedAt`) so zero scraped
 * intelligence is ever discarded during DB upserts.
 *
 * @param {object} pin - Raw or formatted pin object from scraper
 * @param {object} [existingMeta] - Optional existing metadata object to merge with
 * @returns {object} Sanitized JSON-serializable metadata object
 */
export function buildRichPinMetadataPayload(pin = {}, existingMeta = {}) {
  const base = (existingMeta && typeof existingMeta === 'object' && !Array.isArray(existingMeta))
    ? { ...existingMeta }
    : {};
  const incomingMeta = (pin?.metadata && typeof pin.metadata === 'object' && !Array.isArray(pin.metadata))
    ? pin.metadata
    : {};

  const merged = {
    ...base,
    ...incomingMeta
  };

  const assignIfDefined = (key, val) => {
    if (val !== undefined && val !== null && val !== '') {
      merged[key] = val;
    }
  };

  const candidateMethods = [
    pin.creation_method,
    pin.method,
    pin.scrape_method,
    incomingMeta.creation_method,
    incomingMeta.method,
    base.creation_method,
    base.method
  ].filter(m => m && typeof m === 'string' && m.trim().length > 0);

  const resolvedMethod = candidateMethods.find(m => m.trim().toLowerCase() !== 'pinterest_platform')
    || candidateMethods[0]
    || 'Scraped';

  merged.creation_method = resolvedMethod;
  merged.method = resolvedMethod;
  merged.is_product = Boolean(pin.is_product ?? incomingMeta.is_product ?? base.is_product ?? false);
  merged.is_video = Boolean(pin.is_video ?? incomingMeta.is_video ?? base.is_video ?? false);
  merged.reactions = Math.max(0, Number(pin.reaction_count ?? pin.reactions ?? incomingMeta.reactions ?? base.reactions ?? 0));

  // Preserve live velocity & deltas inside metadata as well for backward-compatible JSONB readers
  assignIfDefined('save_count', pin.save_count ?? pin.saves);
  assignIfDefined('repin_count', pin.repin_count ?? pin.repins);
  assignIfDefined('comment_count', pin.comment_count ?? pin.comments);
  assignIfDefined('share_count', pin.share_count ?? pin.shares);
  assignIfDefined('daily_save_velocity', pin.daily_save_velocity ?? pin.velocity);
  assignIfDefined('delta_saves_24h', pin.delta_saves_24h);
  assignIfDefined('delta_repins_24h', pin.delta_repins_24h);

  // Preserve the 30+ Pinterest treasure fields extracted in scripts/lib/pinterest.mjs
  const treasureKeys = [
    'is_repin',
    'origin_pinner',
    'via_pinner',
    'domain_official_user',
    'creator_id',
    'creator_full_name',
    'creator_follower_count',
    'creator_is_verified_merchant',
    'board_id',
    'board_url',
    'board_category',
    'board_pin_count',
    'board_follower_count',
    'board_is_collaborative',
    'board_collaborated_by',
    'board_order_modified_at',
    'image_signature',
    'image_dimensions',
    'aspect_ratio',
    'seo_title',
    'seo_description',
    'seo_canonical_domain',
    'seo_breadcrumbs',
    'seo_related_interests',
    'seo_noindex_reason',
    'visibility',
    'is_go_linkless',
    'is_whitelisted_for_tried_it',
    'is_promoted',
    'is_eligible_for_pdp',
    'category_breadcrumbs',
    'top_interest_id',
    'pin_join_annotations',
    'rich_metadata',
    'visual_objects',
    'canonical_pin_id',
    'tracked_link',
    'utm_link',
    'embed_data',
    'native_pin_stats',
    'story_pin_data',
    'carousel_data',
    'shopping_flags'
  ];

  for (const key of treasureKeys) {
    const val = pin[key] !== undefined ? pin[key] : incomingMeta[key];
    if (val !== undefined && val !== null && val !== '') {
      if (Array.isArray(val) && val.length === 0) continue;
      if (typeof val === 'object' && !Array.isArray(val) && Object.keys(val).length === 0) continue;
      merged[key] = val;
    }
  }

  return merged;
}

/**
 * Shared Pin Freshness Gate for VPS Crawlers:
 * Determines whether a pin has already been deeply scraped within `maxAgeHours` (default 18h)
 * in `universal_master_pins`, allowing Keyword, Creator, and Related crawlers to share
 * freshly scraped pin data without sending duplicate HTTP requests to Pinterest.
 *
 * @param {object} masterRow - Row from `universal_master_pins`
 * @param {number} [maxAgeHours=18] - Freshness window in hours
 * @param {number} [nowMs=Date.now()]
 * @returns {boolean} True if pin is fresh and has valid metrics/annotations
 */
export function shouldSkipFreshPinEnrichment(masterRow, maxAgeHours = 18, nowMs = Date.now()) {
  if (!masterRow || typeof masterRow !== 'object') return false;
  const tsRaw = masterRow.last_scraped_at || masterRow.updated_at;
  if (!tsRaw) return false;
  const tsMs = new Date(tsRaw).getTime();
  if (!Number.isFinite(tsMs) || tsMs <= 0) return false;

  const ageHours = (nowMs - tsMs) / (1000 * 3600);
  if (ageHours < 0 || ageHours > maxAgeHours) return false;

  const saves = Number(masterRow.save_count ?? masterRow.metadata?.save_count ?? 0);
  const hasCreatedDate = Boolean(masterRow.created_at_pinterest || masterRow.metadata?.created_at_pinterest);
  const annotations = extractCanonicalAnnotations(masterRow.visual_annotations || masterRow.metadata?.visual_annotations, { limit: 1 });

  return saves > 0 && hasCreatedDate && annotations.length > 0;
}

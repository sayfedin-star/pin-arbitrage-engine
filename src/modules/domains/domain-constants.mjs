/**
 * src/modules/domains/domain-constants.mjs
 *
 * Leaf constants and thin option-preset alias delegating to the canonical
 * domain normalizer in `src/domain/pin-intelligence.mjs`.
 */

import {
  IGNORED_INTERNAL_DOMAINS,
  BLOCKED_TLD_SUFFIXES,
  normalizeCleanDomain as canonicalNormalizeCleanDomain
} from '../../domain/pin-intelligence.mjs';

export { IGNORED_INTERNAL_DOMAINS, BLOCKED_TLD_SUFFIXES };

export const ECOMMERCE_AND_SOCIAL_DOMAINS = [
  // Marketplaces & Ecommerce Giants
  'etsy.com',
  'amazon.com',
  'amazon.co.uk',
  'amzn.to',
  'walmart.com',
  'target.com',
  'ebay.com',
  'aliexpress.com',
  'temu.com',
  'shein.com',
  // Influencer / Affiliate Shorteners
  'ltks.co',
  'liketoknow.it',
  'shopltk.com',
  'rstyle.me',
  'shopstyle.it',
  // Social Platforms & Forums
  'youtube.com',
  'youtu.be',
  'instagram.com',
  'tiktok.com',
  'facebook.com',
  'twitter.com',
  'x.com',
  'reddit.com',
  'threads.net',
  'linkedin.com',
  'quora.com',
  'tumblr.com',
  'medium.com',
  'wikipedia.org',
  // Google System / Cloud / Share URLs
  'google.com',
  'share.google',
  'drive.google.com',
  'docs.google.com',
  'storage.googleapis.com',
  'blogger.googleusercontent.com'
];

/**
 * Preset alias for Domain Intelligence Studio (`strictFqdn: true, excludeInternal: true`).
 */
export function normalizeCleanDomain(rawInput, options = {}) {
  return canonicalNormalizeCleanDomain(rawInput, {
    strictFqdn: true,
    excludeInternal: true,
    ...options
  });
}

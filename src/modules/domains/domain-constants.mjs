/**
 * src/modules/domains/domain-constants.mjs
 *
 * Leaf constants and domain normalization helper shared between domains/service.mjs
 * and domains/ad-network-service.mjs without circular ES module imports.
 */

import { normalizeCleanDomain as canonicalNormalizeCleanDomain } from '../../domain/pin-intelligence.mjs';

export const IGNORED_INTERNAL_DOMAINS = [
  'pinterest.com',
  'www.pinterest.com',
  'pin.it',
  'uploaded by user',
  'localhost'
];

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

export const BLOCKED_TLD_SUFFIXES = [
  '.local',
  '.internal',
  '.lan',
  '.home',
  '.corp',
  '.test',
  '.example',
  '.invalid',
  '.arpa',
  '.onion',
  '.localhost'
];

/**
 * Normalizes any domain or URL into a clean lowercase root host without 'www.'
 * For Domain Intelligence Studio: enforces strict FQDN and filters internal / blocked domains.
 */
export function normalizeCleanDomain(rawInput, options = {}) {
  const cleaned = canonicalNormalizeCleanDomain(rawInput, { strictFqdn: true, ...options });
  if (!cleaned || IGNORED_INTERNAL_DOMAINS.includes(cleaned) || IGNORED_INTERNAL_DOMAINS.some(d => cleaned.endsWith('.' + d))) {
    return '';
  }
  if (BLOCKED_TLD_SUFFIXES.some(suffix => cleaned === suffix.slice(1) || cleaned.endsWith(suffix))) {
    return '';
  }
  if (!/^[a-z0-9][a-z0-9.-]*[a-z0-9]\.[a-z]{2,}$/.test(cleaned)) {
    return '';
  }
  const parts = cleaned.split('.');
  if (parts.some(p => !p || p.startsWith('-') || p.endsWith('-'))) {
    return '';
  }
  return cleaned;
}

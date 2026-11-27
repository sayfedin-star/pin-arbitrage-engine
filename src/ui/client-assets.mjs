/**
 * Content-Hashed Static Client JS Asset Registry (src/ui/client-assets.mjs)
 *
 * Extracts heavy client studio scripts and the Command Palette runtime out of
 * SSR HTML documents into immutable, SHA-256 ETag-cached `/assets/js/<name>.js?v=<sha12>`
 * in-memory buffers with pre-compressed Brotli & Gzip representations.
 */

import crypto from 'node:crypto';
import { precompressStaticBuffer } from '../http/compression.mjs';
import { getAppSidebarClientScriptCode } from './command-palette-client-app.mjs';
import { getDashboardClientAppScript } from './dashboard/dashboard-client-app.mjs';
import { getKeywordsClientAppScript } from './keywords/keywords-client-app.mjs';
import { getFoldersClientAppScript } from './folders/folders-client-app.mjs';
import { getNewbornClientAppScript } from './newborn/newborn-client-app.mjs';
import { getDomainsClientAppScript } from './domains/domains-client-app.mjs';
import { getPinDetailsClientAppScripts } from './pin-details/client-app.mjs';
import { getPulseClientAppScript } from './pulse/pulse-client-app.mjs';
import { getRadarClientAppScript } from './radar/radar-client-app.mjs';
import { getWatchlistClientAppJs } from './watchlist/watchlist-client-app.mjs';
import { getSettingsClientAppJs } from './settings/settings-client-app.mjs';

/**
 * Safely serializes arbitrary JSON for embedding inside an inline `<script>` block
 * without allowing `</script>`, HTML comments, or JS line-separator breakout.
 */
export function serializeSafeJsonForInlineScript(value) {
  return JSON.stringify(value ?? {})
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/**
 * Emits a minimal inline JSON bootstrap script setting `window.__PAE_PAGE_DATA__`.
 */
export function renderPageBootstrapScript(data = {}) {
  const safeJson = serializeSafeJsonForInlineScript(data);
  return `  <script>window.__PAE_PAGE_DATA__ = ${safeJson};</script>`;
}

/**
 * Extracts pure JavaScript source from either a raw JS string or `<script>...</script>` HTML markup.
 */
export function extractScriptBodies(raw) {
  const input = String(raw || '');
  if (!/<script\b/i.test(input)) {
    return input.trim() + '\n';
  }
  const blocks = [];
  const regex = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = regex.exec(input)) !== null) {
    const attrs = match[1] || '';
    if (/\bsrc\s*=/i.test(attrs)) continue;
    const body = (match[2] || '').trim();
    if (body) blocks.push(body);
  }
  return blocks.join('\n;\n') + '\n';
}

const ASSET_PROVIDERS = new Map([
  ['command-palette', () => getAppSidebarClientScriptCode()],
  ['dashboard', () => getDashboardClientAppScript()],
  ['keywords', () => getKeywordsClientAppScript()],
  ['folders', () => getFoldersClientAppScript()],
  ['newborn', () => getNewbornClientAppScript()],
  ['domains', () => getDomainsClientAppScript()],
  ['pin-details', () => getPinDetailsClientAppScripts()],
  ['pulse', () => getPulseClientAppScript()],
  ['radar', () => getRadarClientAppScript()],
  ['watchlist', () => getWatchlistClientAppJs()],
  ['settings', () => getSettingsClientAppJs()]
]);

const assetCache = new Map();

export const CLIENT_JS_ASSET_NAMES = Array.from(ASSET_PROVIDERS.keys());

/**
 * Lazily builds, hashes (SHA-256), pre-compresses (br + gzip), and caches a named client JS asset.
 */
export function getClientJsAsset(name) {
  const cleanName = String(name || '').trim().toLowerCase();
  if (!ASSET_PROVIDERS.has(cleanName)) return null;

  if (assetCache.has(cleanName)) {
    return assetCache.get(cleanName);
  }

  const provider = ASSET_PROVIDERS.get(cleanName);
  const code = extractScriptBodies(provider());
  const buf = Buffer.from(code, 'utf8');
  const hash = crypto.createHash('sha256').update(buf).digest('hex');
  const etag = `"${hash}"`;
  const version = hash.slice(0, 12);
  const url = `/assets/js/${cleanName}.js?v=${version}`;

  precompressStaticBuffer(buf);

  const descriptor = {
    name: cleanName,
    code,
    buf,
    byteLength: buf.length,
    hash,
    etag,
    version,
    url
  };
  assetCache.set(cleanName, descriptor);
  return descriptor;
}

/**
 * Returns all registered client JS asset descriptors (materializing any unbuilt entries).
 */
export function listClientJsAssets() {
  return CLIENT_JS_ASSET_NAMES.map((name) => getClientJsAsset(name));
}

/**
 * Returns the content-hashed URL `/assets/js/<name>.js?v=<sha12>` for a registered bundle.
 */
export function getClientJsAssetUrl(name) {
  const asset = getClientJsAsset(name);
  if (!asset) {
    throw new Error(`[client-assets] Unknown client JS asset: "${name}"`);
  }
  return asset.url;
}

/**
 * Renders the external `<script src="/assets/js/<name>.js?v=<sha12>"></script>` tag.
 * Intentionally synchronous (non-deferred) so Alpine store factories are defined before
 * `<script defer src="...alpinejs...">` initializes.
 */
export function renderClientJsScriptTag(name) {
  return `  <script src="${getClientJsAssetUrl(name)}"></script>`;
}

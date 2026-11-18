/**
 * src/lib/net-guard.mjs
 *
 * Socket-Level Pinned-IP SSRF Guard (`node:net` BlockList + Undici DNS IP Pinning).
 *
 * Eliminates DNS Rebinding (TOCTOU) vulnerabilities across HTTP/HTTPS external fetches
 * (`ads.txt`, RDAP, `crt.sh`, `domainee`) and raw TCP port-43 WHOIS sockets by:
 * 1. Blocking all private, loopback, link-local, multicast, CGNAT, benchmark,
 *    documentation, broadcast, IPv4-mapped IPv6, ULA, NAT64, 6to4, and Teredo ranges
 *    via split `node:net` `BlockList` instances (avoiding Node's IPv4-to-`::ffff:` cross-match).
 * 2. Resolving DNS once per hop, validating ALL returned A/AAAA addresses, and pinning
 *    the outbound socket directly to the verified IP via `undici.Agent` custom `connect.lookup`
 *    (or direct IP connection in `connectSafeTcpSocket`).
 */

import net from 'node:net';
import dns from 'node:dns/promises';
import { AsyncLocalStorage } from 'node:async_hooks';
import { Agent, fetch as undiciFetch } from 'undici';

export class SsrfBlockedError extends Error {
  constructor(message, { host = '', address = '', reason = 'SSRF_BLOCKED' } = {}) {
    super(message);
    this.name = 'SsrfBlockedError';
    this.code = 'SSRF_BLOCKED';
    this.reason = reason;
    this.host = host;
    this.address = address;
  }
}

// Separate IPv4 and IPv6 BlockLists so `::ffff:0:0/96` blocks all IPv4-mapped IPv6
// literals without causing Node's BlockList.check(ipv4, 'ipv4') to reject public IPv4s.
export const IPV4_BLOCKLIST = new net.BlockList();
IPV4_BLOCKLIST.addSubnet('0.0.0.0', 8, 'ipv4');         // "This" network (RFC 1122)
IPV4_BLOCKLIST.addSubnet('10.0.0.0', 8, 'ipv4');        // Private-Use (RFC 1918)
IPV4_BLOCKLIST.addSubnet('100.64.0.0', 10, 'ipv4');     // CGNAT Shared Space (RFC 6598)
IPV4_BLOCKLIST.addSubnet('127.0.0.0', 8, 'ipv4');       // Loopback (RFC 1122)
IPV4_BLOCKLIST.addSubnet('169.254.0.0', 16, 'ipv4');    // Link-Local & Cloud Metadata (RFC 3927)
IPV4_BLOCKLIST.addSubnet('172.16.0.0', 12, 'ipv4');     // Private-Use (RFC 1918)
IPV4_BLOCKLIST.addSubnet('192.0.0.0', 24, 'ipv4');      // IETF Protocol Assignments (RFC 6890)
IPV4_BLOCKLIST.addSubnet('192.0.2.0', 24, 'ipv4');      // TEST-NET-1 Documentation (RFC 5737)
IPV4_BLOCKLIST.addSubnet('192.88.99.0', 24, 'ipv4');    // 6to4 Relay Anycast (RFC 7526)
IPV4_BLOCKLIST.addSubnet('192.168.0.0', 16, 'ipv4');    // Private-Use (RFC 1918)
IPV4_BLOCKLIST.addSubnet('198.18.0.0', 15, 'ipv4');     // Benchmarking (RFC 2544)
IPV4_BLOCKLIST.addSubnet('198.51.100.0', 24, 'ipv4');   // TEST-NET-2 Documentation (RFC 5737)
IPV4_BLOCKLIST.addSubnet('203.0.113.0', 24, 'ipv4');    // TEST-NET-3 Documentation (RFC 5737)
IPV4_BLOCKLIST.addSubnet('224.0.0.0', 4, 'ipv4');       // Multicast (RFC 5771)
IPV4_BLOCKLIST.addSubnet('240.0.0.0', 4, 'ipv4');       // Reserved & Broadcast 255.255.255.255

export const IPV6_BLOCKLIST = new net.BlockList();
IPV6_BLOCKLIST.addAddress('::', 'ipv6');                // Unspecified (RFC 4291)
IPV6_BLOCKLIST.addAddress('::1', 'ipv6');               // Loopback (RFC 4291)
IPV6_BLOCKLIST.addSubnet('::', 96, 'ipv6');             // Deprecated IPv4-compatible IPv6
IPV6_BLOCKLIST.addSubnet('::ffff:0:0', 96, 'ipv6');     // IPv4-mapped IPv6 (RFC 4291)
IPV6_BLOCKLIST.addSubnet('::ffff:0:0:0', 96, 'ipv6');   // SIIT IPv4-translated IPv6 (RFC 2765)
IPV6_BLOCKLIST.addSubnet('64:ff9b::', 96, 'ipv6');      // NAT64 Well-Known Prefix (RFC 6052)
IPV6_BLOCKLIST.addSubnet('64:ff9b:1::', 48, 'ipv6');    // NAT64 Local-Use Prefix (RFC 8215)
IPV6_BLOCKLIST.addSubnet('100::', 64, 'ipv6');          // Discard-Only Prefix (RFC 6666)
IPV6_BLOCKLIST.addSubnet('2001::', 32, 'ipv6');         // Teredo Tunneling (RFC 4380)
IPV6_BLOCKLIST.addSubnet('2001:2::', 48, 'ipv6');       // Benchmarking (RFC 5180)
IPV6_BLOCKLIST.addSubnet('2001:10::', 28, 'ipv6');      // ORCHID (RFC 4843)
IPV6_BLOCKLIST.addSubnet('2001:20::', 28, 'ipv6');      // ORCHIDv2 (RFC 7343)
IPV6_BLOCKLIST.addSubnet('2001:db8::', 32, 'ipv6');     // Documentation (RFC 3849)
IPV6_BLOCKLIST.addSubnet('2002::', 16, 'ipv6');         // 6to4 Tunneling (RFC 3056)
IPV6_BLOCKLIST.addSubnet('fc00::', 7, 'ipv6');          // Unique Local Address ULA (RFC 4193)
IPV6_BLOCKLIST.addSubnet('fe80::', 10, 'ipv6');         // Link-Local Unicast (RFC 4291)
IPV6_BLOCKLIST.addSubnet('fec0::', 10, 'ipv6');         // Deprecated Site-Local
IPV6_BLOCKLIST.addSubnet('ff00::', 8, 'ipv6');          // Multicast (RFC 4291)

const BLOCKED_EXACT_HOSTS = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'metadata',
  'metadata.google.internal',
  'instance-data',
  'wpad'
]);

const BLOCKED_HOST_SUFFIXES = [
  '.localhost',
  '.local',
  '.localdomain',
  '.internal',
  '.lan',
  '.home',
  '.corp',
  '.arpa',
  '.onion',
  '.invalid',
  '.test',
  '.example'
];

export function normalizeHostLiteral(rawHost) {
  if (!rawHost || typeof rawHost !== 'string') return '';
  return rawHost.trim().replace(/^\[|\]$/g, '').replace(/\.+$/, '').toLowerCase();
}

/**
 * Checks whether an IPv4 or IPv6 literal is private, loopback, link-local, CGNAT,
 * NAT64, 6to4, Teredo, IPv4-mapped IPv6, multicast, reserved, or malformed.
 */
export function isBlockedIp(rawIp) {
  if (!rawIp || typeof rawIp !== 'string') return true;
  const cleaned = rawIp.trim().replace(/^\[|\]$/g, '').split('%')[0].toLowerCase();
  if (!cleaned) return true;

  const ipVersion = net.isIP(cleaned);
  if (ipVersion === 4) {
    return IPV4_BLOCKLIST.check(cleaned, 'ipv4');
  }
  if (ipVersion === 6) {
    return IPV6_BLOCKLIST.check(cleaned, 'ipv6') || IPV4_BLOCKLIST.check(cleaned, 'ipv6');
  }
  return true;
}

/**
 * Checks whether a hostname is internal, single-label, or uses a blocked local/reserved TLD.
 */
export function isBlockedHostname(rawHost) {
  const host = normalizeHostLiteral(rawHost);
  if (!host) return true;

  const ipVer = net.isIP(host.split('%')[0]);
  if (ipVer !== 0) {
    return isBlockedIp(host);
  }

  if (BLOCKED_EXACT_HOSTS.has(host)) return true;
  if (!host.includes('.')) return true;
  for (const suffix of BLOCKED_HOST_SUFFIXES) {
    if (host.endsWith(suffix)) return true;
  }
  // Reject non-standard octal/hex/integer IPv4 encodings (e.g. 0x7f000001, 2130706433, 0177.0.0.1)
  if (/^(?:0x[0-9a-f]+|\d+)$/i.test(host)) return true;
  const labels = host.split('.');
  if (labels.every((lbl) => /^(?:0x[0-9a-f]+|\d+)$/i.test(lbl))) return true;

  return false;
}

/**
 * Validates URL syntax, scheme (`http:` / `https:`), absence of credentials, and safe hostname.
 */
export function validateSafeExternalUrl(rawUrl) {
  let parsed;
  try {
    parsed = rawUrl instanceof URL ? new URL(rawUrl.toString()) : new URL(String(rawUrl || ''));
  } catch (_) {
    return { safe: false, reason: 'Invalid URL' };
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { safe: false, reason: 'Unsupported protocol' };
  }
  if (parsed.username || parsed.password) {
    return { safe: false, reason: 'Embedded credentials rejected' };
  }

  const host = normalizeHostLiteral(parsed.hostname);
  if (!host) {
    return { safe: false, reason: 'Empty hostname' };
  }
  if (net.isIP(host.split('%')[0]) !== 0) {
    if (isBlockedIp(host)) {
      return { safe: false, reason: 'Private or reserved IP rejected', host };
    }
    return { safe: true, url: parsed.toString(), parsed, host, isIpLiteral: true };
  }

  if (isBlockedHostname(host)) {
    return { safe: false, reason: 'Internal or reserved hostname rejected', host };
  }

  return { safe: true, url: parsed.toString(), parsed, host, isIpLiteral: false };
}

/**
 * Resolves DNS via `lookupFn` (`dns.lookup` by default) and validates EVERY returned address
 * against `isBlockedIp`. Rejects with `SsrfBlockedError` if any A/AAAA record is unsafe.
 */
export async function resolveAndValidateHost(rawHost, { lookupFn = dns.lookup } = {}) {
  const host = normalizeHostLiteral(rawHost);
  if (!host) {
    throw new SsrfBlockedError('Empty target hostname', { host, reason: 'EMPTY_HOST' });
  }

  const ipVer = net.isIP(host.split('%')[0]);
  if (ipVer !== 0) {
    if (isBlockedIp(host)) {
      throw new SsrfBlockedError(`Blocked unsafe IP literal: ${host}`, {
        host,
        address: host,
        reason: 'BLOCKED_IP_LITERAL'
      });
    }
    return [{ address: host.split('%')[0], family: ipVer }];
  }

  if (isBlockedHostname(host)) {
    throw new SsrfBlockedError(`Blocked internal or reserved hostname: ${host}`, {
      host,
      reason: 'BLOCKED_HOSTNAME'
    });
  }

  let rawRecords;
  try {
    rawRecords = await lookupFn(host, { all: true, verbatim: true });
  } catch (err) {
    if (err instanceof SsrfBlockedError) throw err;
    throw new SsrfBlockedError(`DNS lookup failed for ${host}: ${err?.message || err}`, {
      host,
      reason: 'DNS_LOOKUP_FAILED'
    });
  }

  const records = Array.isArray(rawRecords)
    ? rawRecords
    : (rawRecords && typeof rawRecords === 'object' && rawRecords.address
      ? [rawRecords]
      : (typeof rawRecords === 'string' ? [{ address: rawRecords, family: net.isIP(rawRecords) || 4 }] : []));

  if (records.length === 0) {
    throw new SsrfBlockedError(`DNS resolution returned zero records for ${host}`, {
      host,
      reason: 'EMPTY_DNS_RECORDS'
    });
  }

  const validated = [];
  for (const rec of records) {
    const address = String(rec?.address || '').trim();
    const family = rec?.family === 6 || net.isIP(address) === 6 ? 6 : 4;
    if (!address || isBlockedIp(address)) {
      throw new SsrfBlockedError(`Hostname ${host} resolved to blocked IP ${address || 'invalid'}`, {
        host,
        address,
        reason: 'RESOLVED_TO_BLOCKED_IP'
      });
    }
    validated.push({ address, family });
  }

  return validated;
}

const SENSITIVE_REDIRECT_HEADERS = ['authorization', 'cookie', 'proxy-authorization', 'x-api-key'];

function stripCrossOriginRedirectHeaders(headersInit, prevOrigin, nextOrigin) {
  if (!headersInit || prevOrigin === nextOrigin) return headersInit;
  const out = {};
  if (typeof headersInit.entries === 'function') {
    for (const [k, v] of headersInit.entries()) {
      if (!SENSITIVE_REDIRECT_HEADERS.includes(k.toLowerCase())) {
        out[k] = v;
      }
    }
    return out;
  }
  for (const [k, v] of Object.entries(headersInit)) {
    if (!SENSITIVE_REDIRECT_HEADERS.includes(k.toLowerCase())) {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Creates a DNS-pinned SSRF-safe `fetch` function backed by an `undici.Agent` whose
 * `connect.lookup` callback strictly serves the pre-validated IP(s) resolved for each hop.
 */
export function createPinnedSafeFetch({
  lookupFn = dns.lookup,
  defaultMaxRedirects = 5,
  connectTimeoutMs = 6000,
  keepAliveTimeoutMs = 10_000
} = {}) {
  const pinnedHopContext = new AsyncLocalStorage();

  const pinnedLookup = (hostname, opts, callback) => {
    const cb = typeof opts === 'function' ? opts : callback;
    const lookupOpts = typeof opts === 'object' && opts !== null ? opts : {};
    const cleanHost = normalizeHostLiteral(hostname);
    const store = pinnedHopContext.getStore();

    const deliver = (records) => {
      const familyFilter = lookupOpts.family === 4 || lookupOpts.family === 6 ? lookupOpts.family : 0;
      const matching = familyFilter
        ? records.filter((r) => r.family === familyFilter)
        : records;
      const chosen = matching.length > 0 ? matching : records;
      if (lookupOpts.all) {
        return cb(null, chosen);
      }
      return cb(null, chosen[0].address, chosen[0].family);
    };

    if (store && store.host === cleanHost && Array.isArray(store.records) && store.records.length > 0) {
      return deliver(store.records);
    }

    // Defense-in-depth fallback if socket pool dials outside immediate hop store
    resolveAndValidateHost(cleanHost, { lookupFn: store?.lookupFn || lookupFn })
      .then((records) => deliver(records))
      .catch((err) => cb(err));
  };

  const agent = new Agent({
    connect: {
      timeout: connectTimeoutMs,
      lookup: pinnedLookup
    },
    keepAliveTimeout: keepAliveTimeoutMs,
    keepAliveMaxTimeout: keepAliveTimeoutMs * 2
  });

  async function pinnedSafeFetch(rawUrl, options = {}) {
    const {
      maxRedirects = defaultMaxRedirects,
      timeoutMs = 0,
      followRedirects = options.redirect !== 'manual',
      lookupFn: perCallLookupFn = null,
      ...fetchInit
    } = options;

    const effectiveLookupFn = perCallLookupFn || lookupFn;
    let currentUrl = rawUrl instanceof URL ? rawUrl.toString() : String(rawUrl || '');
    let currentHeaders = fetchInit.headers;
    let currentMethod = String(fetchInit.method || 'GET').toUpperCase();
    let currentBody = fetchInit.body;

    const parsedMaxRedirects = Number(maxRedirects);
    const hopLimit = followRedirects
      ? Math.max(0, Number.isFinite(parsedMaxRedirects) ? Math.trunc(parsedMaxRedirects) : defaultMaxRedirects)
      : 0;

    for (let hop = 0; hop <= hopLimit; hop++) {
      const check = validateSafeExternalUrl(currentUrl);
      if (!check.safe) {
        throw new SsrfBlockedError(`Blocked unsafe URL (${check.reason})`, {
          host: check.host || '',
          reason: check.reason
        });
      }

      const verifiedRecords = await resolveAndValidateHost(check.host, { lookupFn: effectiveLookupFn });

      let signal = fetchInit.signal;
      if (!signal && timeoutMs > 0) {
        signal = AbortSignal.timeout(timeoutMs);
      }

      const res = await pinnedHopContext.run(
        { host: check.host, records: verifiedRecords, lookupFn: effectiveLookupFn },
        () => undiciFetch(check.url, {
          ...fetchInit,
          method: currentMethod,
          headers: currentHeaders,
          body: currentBody,
          signal,
          redirect: 'manual',
          dispatcher: agent
        })
      );

      if (!followRedirects || res.status < 300 || res.status >= 400) {
        return res;
      }

      const location = res.headers.get('location');
      try {
        if (res.body && !res.bodyUsed) await res.body.cancel();
      } catch (_) {}

      if (!location) {
        throw new Error(`Redirect HTTP ${res.status} missing Location header`);
      }
      if (hop >= hopLimit) {
        throw new Error(`Maximum safe redirect hops (${hopLimit}) exceeded`);
      }

      const nextUrlObj = new URL(location, check.url);
      currentHeaders = stripCrossOriginRedirectHeaders(currentHeaders, check.parsed.origin, nextUrlObj.origin);
      if (res.status === 303 || ((res.status === 301 || res.status === 302) && currentMethod === 'POST')) {
        currentMethod = 'GET';
        currentBody = undefined;
      }
      currentUrl = nextUrlObj.toString();
    }

    throw new Error('Unreachable safeExternalFetch redirect state');
  }

  pinnedSafeFetch.close = () => agent.close();
  pinnedSafeFetch.agent = agent;
  return pinnedSafeFetch;
}

const defaultSafeFetchInstance = createPinnedSafeFetch();

/**
 * Default shared SSRF-safe external HTTP/HTTPS fetch with DNS IP pinning and safe redirect hops.
 */
export async function safeExternalFetch(url, options = {}) {
  return await defaultSafeFetchInstance(url, options);
}

/**
 * Resolves `host`, validates ALL returned IPs against the SSRF `BlockList`, and opens a
 * `node:net` TCP socket directly to the verified IP literal so DNS rebinding is impossible.
 */
export async function connectSafeTcpSocket({
  host,
  port = 43,
  timeoutMs = 3500,
  lookupFn = dns.lookup,
  createConnectionFn = net.createConnection
} = {}) {
  const numericPort = Number(port);
  if (!Number.isInteger(numericPort) || numericPort < 1 || numericPort > 65535) {
    throw new SsrfBlockedError(`Invalid TCP port: ${port}`, { host: String(host || ''), reason: 'INVALID_PORT' });
  }

  const verifiedRecords = await resolveAndValidateHost(host, { lookupFn });
  const primary = verifiedRecords[0];

  return await new Promise((resolve, reject) => {
    let settled = false;
    let timer = null;
    let socket = null;

    const fail = (err) => {
      if (settled) return;
      settled = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (socket) {
        try {
          socket.removeAllListeners();
          socket.destroy();
        } catch (_) {}
      }
      reject(err);
    };

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        const timeoutErr = new Error(`TCP connect timeout after ${timeoutMs}ms`);
        timeoutErr.code = 'ETIMEDOUT';
        fail(timeoutErr);
      }, timeoutMs);
      timer?.unref?.();
    }

    try {
      socket = createConnectionFn({
        host: primary.address,
        port: numericPort,
        family: primary.family
      });

      socket.once('connect', () => {
        if (settled) return;
        settled = true;
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        resolve(socket);
      });

      socket.once('error', (err) => {
        fail(err);
      });
    } catch (err) {
      fail(err);
    }
  });
}

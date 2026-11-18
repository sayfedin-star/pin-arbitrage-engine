/**
 * src/lib/ttl-cache.mjs
 *
 * Canonical Bounded LRU + Epoch-Invalidatable Singleflight & SWR Cache.
 *
 * Guarantees:
 * 1. Bounded `maxEntries` capacity with true LRU recency eviction.
 * 2. Monotonic invalidation epochs (global, prefix, and exact-key) so pre-invalidation
 *    in-flight fetches or background SWR revalidations NEVER write stale data back.
 * 3. Singleflight request coalescing for concurrent foreground cache misses.
 * 4. Optional Stale-While-Revalidate (SWR) with isolated `swrInflight` promises so
 *    background SWR errors NEVER reject or resolve foreground `forceRefresh` callers to `undefined`.
 */

export class TtlSingleflightCache {
  /**
   * @param {object} [options]
   * @param {number} [options.maxEntries=512]
   * @param {number} [options.defaultTtlMs=60000]
   * @param {number} [options.defaultStaleMs=0]
   */
  constructor({ maxEntries = 512, defaultTtlMs = 60_000, defaultStaleMs = 0, defaultSwrMs, nowFn = Date.now } = {}) {
    this.maxEntries = Math.max(1, Number(maxEntries) || 512);
    this.defaultTtlMs = Math.max(1, Number(defaultTtlMs) || 60_000);
    this.defaultStaleMs = Math.max(0, Number(defaultSwrMs ?? defaultStaleMs) || 0);
    this.nowFn = typeof nowFn === 'function' ? nowFn : Date.now;

    this.store = new Map();
    this.inflight = new Map();
    this.swrInflight = new Map();

    this.epoch = 0;
    this.globalClearEpoch = 0;
    this.prefixEpochs = new Map();
    this.keyEpochs = new Map();
  }

  _normKey(key) {
    return String(key);
  }

  get size() {
    return this.store.size;
  }

  keys() {
    return this.store.keys();
  }

  entries() {
    return this.store.entries();
  }

  values() {
    return this.store.values();
  }

  isWriteValid(key, startEpoch) {
    const k = this._normKey(key);
    if (this.globalClearEpoch > startEpoch) return false;
    const keyEp = this.keyEpochs.get(k);
    if (keyEp !== undefined && keyEp > startEpoch) return false;
    for (const [pfx, ep] of this.prefixEpochs.entries()) {
      if (ep > startEpoch && k.startsWith(pfx)) return false;
    }
    return true;
  }

  _pruneEpochMapsIfNeeded() {
    if (this.prefixEpochs.size > 512) {
      const oldest = this.prefixEpochs.keys().next().value;
      if (oldest !== undefined) this.prefixEpochs.delete(oldest);
    }
    if (this.keyEpochs.size > 1024) {
      const oldest = this.keyEpochs.keys().next().value;
      if (oldest !== undefined) this.keyEpochs.delete(oldest);
    }
  }

  has(key, now = this.nowFn()) {
    const k = this._normKey(key);
    const entry = this.store.get(k);
    if (!entry) return false;
    if (now >= entry.expiresAt) {
      if (now >= entry.staleUntil) {
        this.store.delete(k);
      }
      return false;
    }
    return true;
  }

  get(key, now = this.nowFn()) {
    const k = this._normKey(key);
    const entry = this.store.get(k);
    if (!entry) return undefined;
    if (now >= entry.expiresAt) {
      if (now >= entry.staleUntil) {
        this.store.delete(k);
      }
      return undefined;
    }
    // Refresh LRU order on fresh hit
    this.store.delete(k);
    this.store.set(k, entry);
    return entry.value;
  }

  set(key, value, { ttlMs = this.defaultTtlMs, staleMs, swrMs, now = this.nowFn() } = {}) {
    const k = this._normKey(key);
    const effTtl = Math.max(1, Number(ttlMs) || this.defaultTtlMs);
    const effStale = Math.max(0, Number(staleMs ?? swrMs ?? this.defaultStaleMs) || 0);

    if (this.store.has(k)) {
      this.store.delete(k);
    } else {
      while (this.store.size >= this.maxEntries) {
        const oldestKey = this.store.keys().next().value;
        if (oldestKey === undefined) break;
        this.store.delete(oldestKey);
      }
    }

    const entry = {
      value,
      data: value,
      timestamp: now,
      expiresAt: now + effTtl,
      staleUntil: now + effTtl + effStale
    };
    this.store.set(k, entry);
    return entry;
  }

  delete(key) {
    const k = this._normKey(key);
    this._pruneEpochMapsIfNeeded();
    this.keyEpochs.set(k, ++this.epoch);
    this.inflight.delete(k);
    this.swrInflight.delete(k);
    return this.store.delete(k);
  }

  clear() {
    this.invalidate('');
  }

  /**
   * Invalidates either the entire cache (`prefix === ''`) or all entries matching `prefix`.
   * Advances invalidation epoch so any pre-invalidation in-flight work cannot write stale values.
   */
  invalidate(prefix = '') {
    const nextEpoch = ++this.epoch;
    if (!prefix) {
      this.globalClearEpoch = nextEpoch;
      this.prefixEpochs.clear();
      this.keyEpochs.clear();
      this.store.clear();
      this.inflight.clear();
      this.swrInflight.clear();
      return;
    }

    const pfx = String(prefix);
    this._pruneEpochMapsIfNeeded();
    this.prefixEpochs.set(pfx, nextEpoch);
    for (const k of this.store.keys()) {
      if (k.startsWith(pfx)) {
        this.store.delete(k);
      }
    }
    for (const k of this.inflight.keys()) {
      if (k.startsWith(pfx)) {
        this.inflight.delete(k);
      }
    }
    for (const k of this.swrInflight.keys()) {
      if (k.startsWith(pfx)) {
        this.swrInflight.delete(k);
      }
    }
  }

  async _runWithOptionalTimeout(key, fetcher, timeoutMs) {
    const effTimeout = Number(timeoutMs) || 0;
    if (effTimeout <= 0) {
      return await fetcher();
    }
    let timerId = null;
    const fetchTask = Promise.resolve().then(() => fetcher());
    fetchTask.catch(() => {});
    const timeoutPromise = new Promise((_, reject) => {
      timerId = setTimeout(() => reject(new Error(`Timeout fetching ${key}`)), effTimeout);
      timerId?.unref?.();
    });
    return await Promise.race([fetchTask, timeoutPromise]).finally(() => {
      if (timerId) clearTimeout(timerId);
    });
  }

  /**
   * Coalesces concurrent async operations by key without storing results directly.
   * Useful for multi-key batch loaders that populate individual keys inside `fn`.
   */
  async runSingleflight(key, fn) {
    const k = this._normKey(key);
    if (this.inflight.has(k)) {
      return await this.inflight.get(k);
    }
    const promise = Promise.resolve()
      .then(() => fn())
      .finally(() => {
        if (this.inflight.get(k) === promise) {
          this.inflight.delete(k);
        }
      });
    this.inflight.set(k, promise);
    return await promise;
  }

  /**
   * Fetches from cache or executes `fetcher` with singleflight coalescing, optional SWR,
   * and epoch-guarded write-back. Returns `{ value, cached }`.
   */
  async getOrFetchWithMeta(
    key,
    fetcher,
    {
      ttlMs = this.defaultTtlMs,
      staleMs,
      swrMs,
      forceRefresh = false,
      timeoutMs = 0,
      shouldCache = (val) => val !== undefined && val !== null,
      onSwrError = null,
      onBackgroundPromise = null
    } = {}
  ) {
    const k = this._normKey(key);
    const effTtlMs = Math.max(1, Number(ttlMs) || this.defaultTtlMs);
    const effStaleMs = Math.max(0, Number(staleMs ?? swrMs ?? this.defaultStaleMs) || 0);
    const now = this.nowFn();
    const entry = this.store.get(k);

    if (!forceRefresh && entry) {
      if (now < entry.expiresAt) {
        this.store.delete(k);
        this.store.set(k, entry);
        return { value: entry.value, cached: true, stale: false };
      }

      if (effStaleMs > 0 && now < entry.staleUntil) {
        if (!this.swrInflight.has(k) && !this.inflight.has(k)) {
          const revalEpoch = this.epoch;
          const swrPromise = (async () => {
            try {
              const fresh = await this._runWithOptionalTimeout(k, fetcher, timeoutMs);
              if (shouldCache(fresh) && this.isWriteValid(k, revalEpoch)) {
                this.set(k, fresh, { ttlMs: effTtlMs, staleMs: effStaleMs });
              }
              return fresh;
            } catch (swrErr) {
              if (typeof onSwrError === 'function') {
                onSwrError(swrErr, k);
              }
            } finally {
              if (this.swrInflight.get(k) === swrPromise) {
                this.swrInflight.delete(k);
              }
            }
          })();
          this.swrInflight.set(k, swrPromise);
          if (typeof onBackgroundPromise === 'function') {
            onBackgroundPromise(swrPromise, k);
          }
        }
        return { value: entry.value, cached: true, stale: true };
      }

      this.store.delete(k);
    }

    if (!forceRefresh && this.inflight.has(k)) {
      const coalesced = await this.inflight.get(k);
      return { value: coalesced, cached: false, stale: false };
    }

    const fetchEpoch = this.epoch;
    const promise = (async () => {
      try {
        const fresh = await this._runWithOptionalTimeout(k, fetcher, timeoutMs);
        if (shouldCache(fresh) && this.isWriteValid(k, fetchEpoch)) {
          this.set(k, fresh, { ttlMs: effTtlMs, staleMs: effStaleMs });
        }
        return fresh;
      } finally {
        if (this.inflight.get(k) === promise) {
          this.inflight.delete(k);
        }
      }
    })();

    this.inflight.set(k, promise);
    const freshValue = await promise;
    return { value: freshValue, cached: false, stale: false };
  }

  async getOrFetch(key, fetcher, options = {}) {
    const { value } = await this.getOrFetchWithMeta(key, fetcher, options);
    return value;
  }
}

export default TtlSingleflightCache;

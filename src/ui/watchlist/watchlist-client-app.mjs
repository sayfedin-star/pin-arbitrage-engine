/**
 * src/ui/watchlist/watchlist-client-app.mjs
 *
 * Leaf Alpine.js client controller for the dedicated Workspace Watchlist page (/watchlist).
 * 0 imports — guaranteed cycle-free.
 * Supports:
 * - 3 workspace-isolated tabs: Creators, Domains, Saved Pins
 * - Manual + Add Creator (with Metrics Only vs Metrics + Full Catalog mode) & + Add Domain
 * - Per-creator Tracking Mode toggle (`metrics_only` <-> `metrics_full_catalog`)
 * - Full Catalog Sync trigger (`POST /api/creators/deep-harvest`)
 * - Inline Creator Catalog Pin Explorer with instant client-side filters (Saves >= 300, Re-pins, Max Age)
 */

export function getWatchlistClientAppJs() {
  return `
function decodeHtmlEntitiesClient(str) {
  if (!str || typeof str !== 'string') return '';
  if (!str.includes('&')) return str;
  const el = document.createElement('textarea');
  el.innerHTML = str;
  return el.value;
}

window.watchlistApp = function watchlistApp() {
  const boot = window.__PAE_PAGE_DATA__ || window.__PAE_PAGE_BOOTSTRAP__ || {};
  const tabMap = { creator: 'creator', creators: 'creator', domain: 'domain', domains: 'domain', pin: 'pin', pins: 'pin' };
  let rawTab = String(boot.initialTab || '').trim().toLowerCase();
  try {
    const qsTab = new URLSearchParams(window.location.search).get('tab');
    if (qsTab) rawTab = String(qsTab).trim().toLowerCase();
  } catch (_) {}
  const initTab = tabMap[rawTab] || 'creator';

  return {
    isDark: false,
    isSidebarCollapsed: false,
    isMobileMenuOpen: false,

    activeTab: initTab,
    isLoading: false,
    errorMessage: '',
    toastMsg: '',
    _toastTimer: null,

    items: [],
    counts: { all: 0, creator: 0, domain: 0, pin: 0 },
    searchQuery: '',

    // Add Creator Form
    showAddCreatorModal: false,
    newCreatorInput: '',
    newCreatorMode: 'metrics_only',
    newCreatorNotes: '',
    isSubmittingCreator: false,

    // Add Domain Form
    showAddDomainModal: false,
    newDomainInput: '',
    newDomainNotes: '',
    isSubmittingDomain: false,

    // Per-row syncing / toggling states
    togglingModeIds: {},
    syncingCreatorKeys: {},
    removingIds: {},
    isImportingFromRadar: false,

    // Inline Creator Catalog Explorer (Instant Client-Side Filtering)
    selectedCreatorKey: '',
    selectedCreatorName: '',
    catalogPins: [],
    catalogTotal: 0,
    catalogOfficialTotal: 0,
    catalogCuratorTotal: 0,
    catalogLoading: false,
    catalogError: '',
    pinFilterMinSaves: 0,
    pinFilterMinRepins: 0,
    pinFilterMaxAgeDays: 0,
    pinFilterSearch: '',
    pinSortBy: 'saves_desc',

    // Saved Pin Campaign Assignment Modal
    showPinCampaignModal: false,
    pinCampaignTarget: null,
    workspaceFolders: [],
    pinCampaignFoldersLoading: false,
    pinCampaignBusy: false,

    async init() {
      this.isDark = document.documentElement.classList.contains('dark');
      try {
        this.isSidebarCollapsed = (
          localStorage.getItem('pae_sidebar_collapsed') === 'true' ||
          localStorage.getItem('pa_sidebar_collapsed') === 'true'
        );
      } catch (_) {}

      await this.loadWatchlist();
      const refreshIcons = () => {
        this.$nextTick(() => {
          if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
          }
        });
      };
      refreshIcons();
      if (typeof this.$watch === 'function') {
        this.$watch('activeTab', refreshIcons);
        this.$watch('showAddCreatorModal', refreshIcons);
        this.$watch('showAddDomainModal', refreshIcons);
      }
    },

    _reqFetch(url, opts) {
      return (typeof window !== 'undefined' && typeof window.apiFetch === 'function')
        ? window.apiFetch(url, opts)
        : fetch(url, opts);
    },

    toggleTheme() {
      if (typeof window !== 'undefined' && window.PAE && typeof window.PAE.toggleTheme === 'function') {
        this.isDark = window.PAE.toggleTheme();
      } else {
        this.isDark = !this.isDark;
        document.documentElement.classList.toggle('dark', this.isDark);
        try { localStorage.setItem('pa_theme', this.isDark ? 'dark' : 'light'); } catch (_) {}
      }
      this.$nextTick(() => {
        if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons();
      });
    },

    toggleSidebar() {
      if (typeof window !== 'undefined' && window.PAE && typeof window.PAE.toggleSidebar === 'function') {
        this.isSidebarCollapsed = window.PAE.toggleSidebar();
        return;
      }
      this.isSidebarCollapsed = !this.isSidebarCollapsed;
      try { localStorage.setItem('pae_sidebar_collapsed', String(this.isSidebarCollapsed)); } catch (_) {}
    },

    showToast(msg) {
      this.toastMsg = String(msg || '');
      if (this._toastTimer) clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => { this.toastMsg = ''; }, 3400);
    },

    fmtNum(n) {
      const v = Number(n || 0);
      if (!Number.isFinite(v)) return '0';
      if (Math.abs(v) >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
      if (Math.abs(v) >= 1_000) return (v / 1_000).toFixed(1) + 'K';
      return Math.round(v).toLocaleString('en-US');
    },

    safeImg(url) {
      if (!url || typeof url !== 'string') return '';
      const clean = url.trim();
      return /^https?:\\/\\//i.test(clean) ? clean : '';
    },

    decodeTitle(t) {
      return decodeHtmlEntitiesClient(t || '');
    },

    savedPinVelocity(item) {
      if (!item) return 0;
      const d24 = Number(item.pin_delta_saves_24h);
      if (Number.isFinite(d24) && d24 !== 0) return Math.round(d24);
      const v = Number(item.pin_daily_save_velocity);
      return Number.isFinite(v) ? Math.round(v) : 0;
    },

    savedPinRepinDelta(item) {
      if (!item) return 0;
      const d24 = Number(item.pin_delta_repins_24h);
      if (Number.isFinite(d24) && d24 !== 0) return Math.round(d24);
      const v = Number(item.pin_daily_repin_velocity);
      return Number.isFinite(v) ? Math.round(v) : 0;
    },

    catalogPinVelocity(pin) {
      if (!pin) return 0;
      const d24 = Number(pin.delta_saves_24h);
      if (Number.isFinite(d24) && d24 !== 0) return Math.round(d24);
      const v = Number(pin.velocity ?? pin.daily_save_velocity);
      return Number.isFinite(v) ? Math.round(v) : 0;
    },

    formatVelocityPill(v) {
      const n = Number(v || 0);
      if (!Number.isFinite(n) || n === 0) return '—';
      return (n > 0 ? '+' : '') + this.fmtNum(n) + '/d';
    },

    get catalogSummaryText() {
      const shown = this.filteredCatalogPins.length;
      const loaded = this.catalogPins.length;
      const official = Number(this.catalogOfficialTotal || 0);
      const community = Number(this.catalogCuratorTotal || 0);
      const base = 'Showing ' + shown + ' of ' + loaded + ' loaded pins';
      if (community > 0 && official > 0) {
        return base + ' (' + official + ' official · ' + community + ' community)';
      }
      if (this.catalogTotal > loaded) {
        return base + ' (Total indexed: ' + this.catalogTotal + ')';
      }
      return base;
    },

    isSavedPinInFolder(item, folderId) {
      if (!item || !Array.isArray(item.campaigns)) return false;
      const fid = Number(folderId);
      return item.campaigns.some((c) => Number(c.folder_id) === fid);
    },

    async openPinCampaignModal(item) {
      if (!item) return;
      this.pinCampaignTarget = item;
      this.showPinCampaignModal = true;
      this.pinCampaignFoldersLoading = true;
      try {
        const res = await this._reqFetch('/api/folders?lite=true', { headers: { Accept: 'application/json' } });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
        this.workspaceFolders = Array.isArray(data.folders) ? data.folders : [];
      } catch (err) {
        this.showToast(err.message || 'Failed to load workspace campaigns');
      } finally {
        this.pinCampaignFoldersLoading = false;
      }
    },

    closePinCampaignModal() {
      this.showPinCampaignModal = false;
      this.pinCampaignTarget = null;
    },

    async assignSavedPinToFolder(item, folder) {
      if (!item || !folder || this.pinCampaignBusy) return;
      this.pinCampaignBusy = true;
      try {
        const res = await this._reqFetch('/api/folders/' + encodeURIComponent(folder.id) + '/tracked-pins', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ pin_ids: [String(item.entity_key)], source_type: 'related', source_ref: 'watchlist' })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.success === false) {
          throw new Error(data.error || 'Failed to assign pin to campaign');
        }
        if (!Array.isArray(item.campaigns)) item.campaigns = [];
        if (!item.campaigns.some((c) => Number(c.folder_id) === Number(folder.id))) {
          item.campaigns = [...item.campaigns, {
            folder_id: Number(folder.id),
            folder_name: folder.name || ('Campaign #' + folder.id),
            folder_color: folder.color || null,
            source_type: 'related'
          }];
        }
        this.showToast('Added Pin #' + item.entity_key + ' to ' + (folder.name || ('Campaign #' + folder.id)));
      } catch (err) {
        this.showToast(err.message || 'Could not assign pin to campaign');
      } finally {
        this.pinCampaignBusy = false;
      }
    },

    async removeSavedPinFromFolder(item, folder) {
      if (!item || !folder || this.pinCampaignBusy) return;
      this.pinCampaignBusy = true;
      try {
        const res = await this._reqFetch('/api/folders/' + encodeURIComponent(folder.id) + '/tracked-pins/' + encodeURIComponent(String(item.entity_key)), {
          method: 'DELETE',
          headers: { Accept: 'application/json' }
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.success === false) {
          throw new Error(data.error || 'Failed to remove pin from campaign');
        }
        if (Array.isArray(item.campaigns)) {
          item.campaigns = item.campaigns.filter((c) => Number(c.folder_id) !== Number(folder.id));
        }
        this.showToast('Removed Pin #' + item.entity_key + ' from ' + (folder.name || ('Campaign #' + folder.id)));
      } catch (err) {
        this.showToast(err.message || 'Could not remove pin from campaign');
      } finally {
        this.pinCampaignBusy = false;
      }
    },

    async loadWatchlist() {
      this.isLoading = true;
      this.errorMessage = '';
      try {
        const res = await this._reqFetch('/api/watchlist?limit=500', { headers: { Accept: 'application/json' } });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.success === false) {
          throw new Error(data.error || data.message || ('HTTP ' + res.status));
        }
        this.items = Array.isArray(data.items) ? data.items : [];
        this.counts = data.counts || { all: this.items.length, creator: 0, domain: 0, pin: 0 };
      } catch (err) {
        this.errorMessage = err.message || 'Failed to load workspace watchlist.';
      } finally {
        this.isLoading = false;
        this.$nextTick(() => {
          if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons();
        });
      }
    },

    get filteredCreators() {
      const q = String(this.searchQuery || '').trim().toLowerCase();
      return this.items.filter((item) => {
        if (item.entity_type !== 'creator') return false;
        if (!q) return true;
        return String(item.entity_key || '').toLowerCase().includes(q)
          || String(item.display_label || '').toLowerCase().includes(q)
          || String(item.notes || '').toLowerCase().includes(q);
      });
    },

    get filteredDomains() {
      const q = String(this.searchQuery || '').trim().toLowerCase();
      return this.items.filter((item) => {
        if (item.entity_type !== 'domain') return false;
        if (!q) return true;
        return String(item.entity_key || '').toLowerCase().includes(q)
          || String(item.notes || '').toLowerCase().includes(q);
      });
    },

    get filteredPins() {
      const q = String(this.searchQuery || '').trim().toLowerCase();
      return this.items.filter((item) => {
        if (item.entity_type !== 'pin') return false;
        if (!q) return true;
        return String(item.entity_key || '').toLowerCase().includes(q)
          || String(item.pin_title || '').toLowerCase().includes(q)
          || String(item.pin_domain || '').toLowerCase().includes(q);
      });
    },

    async submitAddCreator() {
      const raw = String(this.newCreatorInput || '').trim();
      if (!raw || this.isSubmittingCreator) return;
      this.isSubmittingCreator = true;
      try {
        const res = await this._reqFetch('/api/watchlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            entity_type: 'creator',
            entity_key: raw,
            creator_tracking_mode: this.newCreatorMode,
            notes: String(this.newCreatorNotes || '').trim()
          })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.success === false) {
          throw new Error(data.error || 'Failed to add creator to watchlist');
        }
        const cleanKey = data.item?.entity_key || raw.replace(/^@+/, '').trim();
        // Ensure creator profile exists in competitor_profiles before returning so Sync Full Catalog cannot race
        await this._reqFetch('/api/creators', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            username: cleanKey,
            tracking_mode: this.newCreatorMode === 'metrics_full_catalog' ? 'full' : 'pulse_only'
          })
        }).catch(() => {});

        this.newCreatorInput = '';
        this.newCreatorNotes = '';
        this.showAddCreatorModal = false;
        this.activeTab = 'creator';
        await this.loadWatchlist();
        this.showToast('Added @' + cleanKey + ' to Watchlist');
      } catch (err) {
        this.showToast(err.message || 'Could not add creator');
      } finally {
        this.isSubmittingCreator = false;
      }
    },

    async submitAddDomain() {
      const raw = String(this.newDomainInput || '').trim();
      if (!raw || this.isSubmittingDomain) return;
      this.isSubmittingDomain = true;
      try {
        const res = await this._reqFetch('/api/watchlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            entity_type: 'domain',
            entity_key: raw,
            notes: String(this.newDomainNotes || '').trim()
          })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.success === false) {
          throw new Error(data.error || 'Failed to add domain to watchlist');
        }
        const cleanKey = data.item?.entity_key || raw;
        this.newDomainInput = '';
        this.newDomainNotes = '';
        this.showAddDomainModal = false;
        this.activeTab = 'domain';
        await this.loadWatchlist();
        this.showToast('Added ' + cleanKey + ' to Watchlist');
      } catch (err) {
        this.showToast(err.message || 'Could not add domain');
      } finally {
        this.isSubmittingDomain = false;
      }
    },

    async importTopFromRadar(entityType) {
      if (this.isImportingFromRadar) return;
      const isCreator = entityType === 'creator';
      this.isImportingFromRadar = true;
      let imported = 0;
      let skipped = 0;
      let failed = 0;
      let lastErr = '';
      try {
        const endpoint = isCreator
          ? '/api/creators?limit=10&workspace_scope=1'
          : '/api/domains?limit=10&sort=velocity&workspace_scope=1';
        const res = await this._reqFetch(endpoint, { headers: { Accept: 'application/json' } });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
        const rows = isCreator
          ? (Array.isArray(data.creators) ? data.creators : (Array.isArray(data.competitors) ? data.competitors : []))
          : (Array.isArray(data.domains) ? data.domains : (Array.isArray(data.data) ? data.data : []));
        const top = rows.slice(0, 10);
        if (top.length === 0) {
          this.showToast('No ' + (isCreator ? 'creators' : 'domains') + ' found in Radar to import');
          return;
        }
        const existingKeys = new Set(
          (this.items || [])
            .filter((it) => it && it.entity_type === (isCreator ? 'creator' : 'domain'))
            .map((it) => String(it.entity_key || '').trim().toLowerCase())
            .filter(Boolean)
        );
        for (let i = 0; i < top.length; i++) {
          const row = top[i];
          const key = isCreator
            ? String(row?.username || '').replace(/^@+/, '').trim()
            : String(row?.domain || row?.clean_domain || '').trim();
          if (!key) continue;
          const normKey = key.toLowerCase();
          if (existingKeys.has(normKey)) {
            skipped++;
            continue;
          }
          const payload = isCreator
            ? { entity_type: 'creator', entity_key: key, creator_tracking_mode: 'metrics_only', notes: String(row?.display_name || '').trim() }
            : { entity_type: 'domain', entity_key: key };
          try {
            const addRes = await this._reqFetch('/api/watchlist', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
              body: JSON.stringify(payload)
            });
            if (addRes.ok) {
              imported++;
              existingKeys.add(normKey);
            } else {
              failed++;
              const errBody = await addRes.json().catch(() => ({}));
              lastErr = errBody.error || errBody.message || ('HTTP ' + addRes.status);
            }
          } catch (itemErr) {
            failed++;
            lastErr = itemErr?.message || 'Network error';
          }
        }
        const label = isCreator ? 'creator(s)' : 'domain(s)';
        if (imported > 0) {
          const extras = [];
          if (skipped > 0) extras.push(skipped + ' already watched');
          if (failed > 0) extras.push(failed + ' failed');
          this.showToast('Imported ' + imported + ' ' + label + ' from Radar' + (extras.length ? ' (' + extras.join(', ') + ')' : ''));
        } else if (failed > 0) {
          this.showToast('Import failed (' + failed + ' error' + (failed > 1 ? 's' : '') + (lastErr ? ': ' + lastErr : '') + ')');
        } else if (skipped > 0) {
          this.showToast('All ' + skipped + ' top ' + label + ' are already in Watchlist');
        }
      } catch (err) {
        this.showToast(err.message || 'Import from Radar failed');
      } finally {
        if (imported > 0) {
          await this.loadWatchlist();
        }
        this.isImportingFromRadar = false;
      }
    },

    async toggleCreatorMode(item) {
      if (!item || !item.id || this.togglingModeIds[item.id]) return;
      const nextMode = item.creator_tracking_mode === 'metrics_full_catalog'
        ? 'metrics_only'
        : 'metrics_full_catalog';
      this.togglingModeIds[item.id] = true;
      try {
        const res = await this._reqFetch('/api/watchlist/' + encodeURIComponent(item.id), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ creator_tracking_mode: nextMode })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.success === false) {
          throw new Error(data.error || 'Failed to update tracking mode');
        }
        item.creator_tracking_mode = nextMode;
        this.showToast(
          '@' + item.entity_key + ' set to ' + (nextMode === 'metrics_full_catalog' ? 'Metrics + Full Catalog' : 'Metrics Only')
        );
      } catch (err) {
        this.showToast(err.message || 'Failed to switch mode');
      } finally {
        this.togglingModeIds[item.id] = false;
      }
    },

    async syncCreatorFullCatalog(item) {
      const username = String(item?.entity_key || '').trim();
      if (!username || this.syncingCreatorKeys[username]) return;
      this.syncingCreatorKeys[username] = true;
      try {
        const res = await this._reqFetch('/api/creators/deep-harvest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ username })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.success === false) {
          throw new Error(data.error || 'Full catalog sync failed');
        }
        const ingested = Number(data.total_pins_ingested || data.new_pins_discovered || 0);
        const boards = Number(data.boards_crawled || data.boards_synced || 0);
        this.showToast('Synced @' + username + ': ' + ingested + ' pins across ' + boards + ' boards');
        await this.loadWatchlist();
        if (this.selectedCreatorKey === username) {
          await this.openCreatorCatalog(item);
        }
      } catch (err) {
        this.showToast(err.message || 'Catalog sync failed');
      } finally {
        this.syncingCreatorKeys[username] = false;
      }
    },

    async removeWatchlistItem(item) {
      if (!item || !item.id || this.removingIds[item.id]) return;
      this.removingIds[item.id] = true;
      try {
        const res = await this._reqFetch('/api/watchlist/' + encodeURIComponent(item.id), {
          method: 'DELETE',
          headers: { Accept: 'application/json' }
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.success === false) {
          throw new Error(data.error || 'Failed to remove item');
        }
        if (this.selectedCreatorKey && item.entity_type === 'creator' && this.selectedCreatorKey === item.entity_key) {
          this.selectedCreatorKey = '';
          this.catalogPins = [];
        }
        await this.loadWatchlist();
        this.showToast('Removed from Watchlist');
      } catch (err) {
        this.showToast(err.message || 'Could not remove item');
      } finally {
        this.removingIds[item.id] = false;
      }
    },

    async openCreatorCatalog(item) {
      const username = String(item?.entity_key || '').trim();
      if (!username) return;
      this.selectedCreatorKey = username;
      this.selectedCreatorName = item.display_label || ('@' + username);
      this.catalogLoading = true;
      this.catalogError = '';
      this.catalogPins = [];
      try {
        const res = await this._reqFetch('/api/creators/all-pins?username=' + encodeURIComponent(username) + '&scope=all&limit=500&sort=saves_desc', {
          headers: { Accept: 'application/json' }
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || ('HTTP ' + res.status));
        }
        this.catalogPins = Array.isArray(data.pins) ? data.pins : [];
        this.catalogTotal = Number(data.scope_total ?? data.total ?? data.ecosystem_catalog_total ?? this.catalogPins.length);
        this.catalogOfficialTotal = Number(data.catalog_total ?? 0);
        this.catalogCuratorTotal = Number(data.curator_pins_total ?? 0);
      } catch (err) {
        this.catalogError = err.message || 'Failed to load creator catalog pins.';
      } finally {
        this.catalogLoading = false;
        this.$nextTick(() => {
          if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons();
        });
      }
    },

    closeCreatorCatalog() {
      this.selectedCreatorKey = '';
      this.selectedCreatorName = '';
      this.catalogPins = [];
      this.catalogError = '';
    },

    applySaves300Preset() {
      this.pinFilterMinSaves = Number(this.pinFilterMinSaves) === 300 ? 0 : 300;
    },

    resetCatalogFilters() {
      this.pinFilterMinSaves = 0;
      this.pinFilterMinRepins = 0;
      this.pinFilterMaxAgeDays = 0;
      this.pinFilterSearch = '';
      this.pinSortBy = 'saves_desc';
    },

    get filteredCatalogPins() {
      const minSaves = Math.max(0, Number(this.pinFilterMinSaves) || 0);
      const minRepins = Math.max(0, Number(this.pinFilterMinRepins) || 0);
      const maxAge = Math.max(0, Number(this.pinFilterMaxAgeDays) || 0);
      const q = String(this.pinFilterSearch || '').trim().toLowerCase();

      const out = this.catalogPins.filter((p) => {
        const saves = Number(p.saves ?? p.save_count ?? 0);
        const repins = Number(p.repins ?? p.repin_count ?? 0);
        const ageDays = Number(p.age_days ?? 0);
        if (minSaves > 0 && saves < minSaves) return false;
        if (minRepins > 0 && repins < minRepins) return false;
        if (maxAge > 0 && ageDays > maxAge) return false;
        if (q) {
          const hay = (
            String(p.title || '') + ' ' +
            String(p.board_name || '') + ' ' +
            String(p.link_domain || '') + ' ' +
            String(p.pin_id || '')
          ).toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });

      const sortBy = this.pinSortBy;
      return out.slice().sort((a, b) => {
        if (sortBy === 'repins_desc') return Number(b.repins ?? b.repin_count ?? 0) - Number(a.repins ?? a.repin_count ?? 0);
        if (sortBy === 'newest') return Number(a.age_days ?? 99999) - Number(b.age_days ?? 99999);
        if (sortBy === 'velocity_desc') return Number(b.velocity ?? 0) - Number(a.velocity ?? 0);
        return Number(b.saves ?? b.save_count ?? 0) - Number(a.saves ?? a.save_count ?? 0);
      });
    }
  };
};
`;
}

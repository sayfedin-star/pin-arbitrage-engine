/**
 * Domains Client Application Script (Alpine.js domainsApp)
 */
export function getDomainsClientAppScript() {
  return `  <script>
    function domainsApp(initialDomain = '', scopedFolderId = '') {
      return {
        scopedFolderId: scopedFolderId || '',
        activeFolderId: scopedFolderId || '',
        activeFolder: null,
        crossoverData: null,
        actionsOpen: false,
        pinnedDomains: new Set(),
        pinnedOnly: false,
        isSidebarCollapsed: (() => {
          try {
            return typeof localStorage !== 'undefined' ? localStorage.getItem('pae_sidebar_collapsed') === 'true' : false;
          } catch (_) { return false; }
        })(),
        isMobileMenuOpen: false,
        toggleSidebar() {
          this.isSidebarCollapsed = !this.isSidebarCollapsed;
          try {
            if (typeof localStorage !== 'undefined') {
              localStorage.setItem('pae_sidebar_collapsed', this.isSidebarCollapsed ? 'true' : 'false');
            }
          } catch (_) {}
          this.$nextTick(() => {
            if (window.lucide) window.lucide.createIcons();
          });
        },
        isDark: (() => {
          try {
            return typeof localStorage !== 'undefined' ? localStorage.getItem('pa_theme') !== 'light' : false;
          } catch (_) { return false; }
        })(),
        darkMode: (() => {
          try {
            return typeof localStorage !== 'undefined' ? localStorage.getItem('pa_theme') !== 'light' : false;
          } catch (_) { return false; }
        })(),
        loading: false,
        refreshingRollup: false,
        domains: [],
        overview: {
          total_domains: 0,
          top5_monopoly_pct: 0,
          baby_giants_count: 0,
          multi_account_count: 0,
          avg_pins_per_url: 1.0
        },
        folders: [],
        totalDomains: 0,
        currentPage: 1,
        totalPages: 1,
        limit: 50,

        // Filters
        searchQuery: '',
        selectedFolderId: scopedFolderId || '',
        selectedPillar: 'all',
        activePreset: 'all',
        selectedAdNetwork: 'all',
        ageFilter: 'all',
        rankFilter: 'all',
        savesFilter: 'all',
        sizeFilter: 'all',
        logicMode: 'and',
        sortBy: 'visibility',
        excludeMarketplaces: true,

        // Deep Dossier Studio State (Dedicated Full-Page Route /domains/:domain)
        isDossierOpen: Boolean(initialDomain),
        dossierDomain: initialDomain || '',
        dossierLoading: false,
        dossierData: null,
        dossierTab: 'urls', // 'urls' | 'pins' | 'keywords' | 'accounts' | 'visual_dna'
        dossierSearch: '',
        dossierSort: 'saves',
        dossierStatusFilter: 'all', // 'all' | 'active' | 'displaced'
        dossierPinsPage: 1,
        dossierPinsPerPage: 25,
        dossierArticlesPage: 1,
        dossierArticlesPerPage: 10,
        currentDisplacedLimit: 30,
        dossierLoadingMore: false,
        _dossierReqSeq: 0,

        // Arbitrage Attack Blueprint Modal State (Pillar 6)
        isBlueprintModalOpen: false,
        blueprintLoading: false,
        blueprintData: null,

        // Age & Ad Verification & Batch Progress State
        enrichingDomains: {},
        enrichingAds: {},
        batchEnriching: false,
        batchProgress: { done: 0, total: 0 },
        globalEnriching: false,
        globalStats: {
          total_domains: 0,
          checked_domains: 0,
          resolved_domains: 0,
          failed_domains: 0,
          unchecked_domains: 0,
          percent_complete: 0
        },
        globalAdsEnriching: false,
        globalAdsStats: {
          total_domains: 0,
          checked_domains: 0,
          total_checked: 0,
          unchecked_domains: 0,
          percent_complete: 0,
          raptive_count: 0,
          mediavine_count: 0,
          journey_count: 0,
          ezoic_count: 0,
          hbagency_count: 0,
          monumetric_count: 0,
          shemedia_count: 0,
          freestar_count: 0,
          playwire_count: 0,
          snigel_count: 0,
          adsense_count: 0,
          affiliate_count: 0,
          protected_count: 0,
          failed_count: 0,
          switched_count: 0
        },
        batchAdsEnriching: false,
        batchAdsProgress: { done: 0, total: 0 },

        toasts: [],
        loadError: null,
        _loadDomainsAbortController: null,
        _loadReqSeq: 0,

        init() {
          if (typeof window !== 'undefined') {
            window.addEventListener('keydown', (e) => {
              if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
                const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
                if (activeTag !== 'input' && activeTag !== 'textarea') {
                  e.preventDefault();
                  this.toggleSidebar();
                }
              }
            });

            // Parse URL parameters for deep-linking from Pin Dossier (LND-814)
            if (window.location?.search) {
              try {
                const urlParams = new URLSearchParams(window.location.search);
                const qParam = urlParams.get('q') || urlParams.get('domain') || urlParams.get('search');
                if (qParam && qParam.trim()) {
                  this.searchQuery = qParam.trim();
                }
                const folderParam = urlParams.get('folder_id');
                if (folderParam && !this.selectedFolderId) {
                  this.selectedFolderId = String(folderParam);
                }
              } catch (_) {}
            }
          }
          if (this.scopedFolderId) {
            this.selectedFolderId = String(this.scopedFolderId);
            this.fetchPinnedDomains();
            (async () => {
              try {
                const res = await (window.safeApiFetch || fetch)('/api/folders/' + encodeURIComponent(this.scopedFolderId));
                if (res.ok) {
                  const data = await res.json();
                  if (data?.folder) this.activeFolder = data.folder;
                  else if (data?.id) this.activeFolder = data;
                }
              } catch (_) {}
            })();
          }
          this.fetchFolders();
          this.loadDomains();
          // Defer heavy database-wide aggregations to background idle so leaderboard query gets 100% database priority
          setTimeout(() => {
            this.fetchGlobalEnrichStatus();
            this.fetchGlobalAdsStatus();
          }, 1500);

          // Sync Dedicated Full-Page Route & Browser History
          // [INVARIANT: FOLDER-SCOPED-POPSTATE-PRESERVATION]
          if (typeof window !== 'undefined') {
            window.addEventListener('popstate', (e) => {
              const stateDomain = e.state?.domain;
              const pathMatch = window.location.pathname.match(/(?:\\/folders\\/[^/]+)?\\/(?:keywords\\/)?domains\\/([^/?#]+)/);
              const urlDomain = pathMatch ? decodeURIComponent(pathMatch[1]) : '';
              const target = stateDomain || urlDomain;
              if (target) {
                this.openDossier(target, false);
              } else {
                this.closeDossier(false);
              }
            });

            if (this.dossierDomain) {
              this.openDossier(this.dossierDomain, false);
            } else {
              const pathMatch = window.location.pathname.match(/(?:\\/folders\\/[^/]+)?\\/(?:keywords\\/)?domains\\/([^/?#]+)/);
              if (pathMatch && pathMatch[1]) {
                this.openDossier(decodeURIComponent(pathMatch[1]), false);
              }
            }
          }
        },

        toggleTheme() {
          this.darkMode = !this.darkMode;
          this.isDark = this.darkMode;
          try {
            if (this.darkMode) {
              if (typeof document !== 'undefined' && document.documentElement) {
                document.documentElement.classList.add('dark');
              }
              if (typeof localStorage !== 'undefined') {
                localStorage.setItem('pa_theme', 'dark');
                localStorage.setItem('pin_theme', 'dark');
              }
            } else {
              if (typeof document !== 'undefined' && document.documentElement) {
                document.documentElement.classList.remove('dark');
              }
              if (typeof localStorage !== 'undefined') {
                localStorage.setItem('pa_theme', 'light');
                localStorage.setItem('pin_theme', 'light');
              }
            }
          } catch (_) {}
        },

        toggleDarkMode() {
          this.toggleTheme();
        },

        showToast(message, type = 'info') {
          const id = Date.now() + Math.random();
          this.toasts.push({ id, message, type });
          setTimeout(() => this.removeToast(id), 4000);
        },

        removeToast(id) {
          this.toasts = this.toasts.filter(t => t.id !== id);
        },

        safeUrl(url) {
          if (!url) return '#';
          const s = String(url).trim();
          if (/^https?:\\/\\//i.test(s) || s.startsWith('/')) return s;
          return '#';
        },

        sanitizeCsvCell(val) {
          let str = String(val == null ? '' : val);
          const code = str.charCodeAt(0);
          if (code === 61 || code === 43 || code === 45 || code === 64 || code === 9 || code === 10 || code === 13) {
            str = "'" + str;
          }
          return '"' + str.replace(/"/g, '""') + '"';
        },

        formatNumber(num) {
          if (num === null || num === undefined) return '0';
          const n = Number(num);
          if (isNaN(n)) return '0';
          return n.toLocaleString();
        },

        async fetchFolders() {
          try {
            const res = await (window.safeApiFetch || fetch)('/api/folders');
            if (res.ok) {
              const data = await res.json();
              this.folders = Array.isArray(data.folders) ? data.folders : (Array.isArray(data) ? data : []);
              if (this.scopedFolderId) {
                this.selectedFolderId = String(this.scopedFolderId);
                const matched = this.folders.find(f => String(f.id) === String(this.scopedFolderId));
                if (matched) this.activeFolder = this.activeFolder ? { ...matched, ...this.activeFolder } : matched;
              }
            }
          } catch (_) {}
        },

        async loadDomains(resetPage = false, forceRefresh = false) {
          if (resetPage) this.currentPage = 1;
          this.loading = true;
          this.loadError = null;

          if (this._loadDomainsAbortController) {
            this._loadDomainsAbortController.abort();
          }
          this._loadDomainsAbortController = new AbortController();
          const signal = this._loadDomainsAbortController.signal;
          const reqSeq = ++this._loadReqSeq;

          const params = new URLSearchParams({
            page: String(this.currentPage),
            limit: String(this.limit),
            sort: this.sortBy,
            preset: this.activePreset,
            pillar: this.selectedPillar,
            exclude_marketplaces: String(this.excludeMarketplaces)
          });

          // [INVARIANT: CACHE-BUSTED-DOMAIN-LOAD] Guarantee fresh reads on manual refreshes
          if (forceRefresh) {
            params.set('refresh', 'true');
            params.set('_t', Date.now().toString());
          }

          if (this.searchQuery.trim()) {
            params.set('search', this.searchQuery.trim());
          }
          if (this.selectedFolderId) {
            params.set('folder_id', this.selectedFolderId);
          }
          if (this.pinnedOnly) {
            params.set('pinned_only', 'true');
          }
          if (this.selectedAdNetwork && this.selectedAdNetwork !== 'all') {
            params.set('ad_network', this.selectedAdNetwork);
          }
          if (this.ageFilter && this.ageFilter !== 'all') {
            params.set('age_filter', this.ageFilter);
          }
          if (this.rankFilter && this.rankFilter !== 'all') {
            params.set('rank_filter', this.rankFilter);
          }
          if (this.savesFilter && this.savesFilter !== 'all') {
            params.set('saves_filter', this.savesFilter);
          }
          if (this.sizeFilter && this.sizeFilter !== 'all') {
            params.set('size_filter', this.sizeFilter);
          }
          if (this.logicMode) {
            params.set('logic_mode', this.logicMode);
          }

          try {
            const fetchFn = window.safeApiFetch || fetch;
            const res = await fetchFn('/api/domains?' + params.toString(), {
              signal,
              timeout: 18000,
              cache: forceRefresh ? 'no-store' : 'default',
              headers: { 'Accept': 'application/json' }
            });
            if (reqSeq !== this._loadReqSeq) return;
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            if (reqSeq !== this._loadReqSeq) return;
            if (data.success === false) throw new Error(data.error || 'Server error');

            let rawDomains = Array.isArray(data.domains) ? data.domains : [];
            if (this.pinnedOnly && this.pinnedDomains.size > 0) {
              rawDomains = rawDomains.filter(d => this.pinnedDomains.has((d.domain || '').toLowerCase()));
            }
            this.domains = rawDomains;
            this.overview = data.overview || this.overview;
            this.totalDomains = data.total || (data.overview?.total_domains || 0);
            this.totalPages = data.total_pages || Math.max(1, Math.ceil(this.totalDomains / this.limit));
          } catch (err) {
            if (err.name === 'AbortError') return;
            if (reqSeq !== this._loadReqSeq) return;
            console.error('[DomainRadar] loadDomains error:', err);
            this.loadError = err.message || 'Failed to connect to domain intelligence';
            this.showToast('Failed to load domains: ' + err.message, 'error');
          } finally {
            if (reqSeq === this._loadReqSeq) {
              this.loading = false;
            }
          }
        },

        async refreshDomains() {
          if (this.refreshingRollup) return;
          this.refreshingRollup = true;
          this.showToast('Re-aggregating domain intelligence from live rankings...', 'info');
          try {
            const fetchFn = window.safeApiFetch || fetch;
            const res = await fetchFn('/api/domains/refresh-rollup', {
              method: 'POST',
              headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }
            }).catch(() => null);
            if (res && !res.ok) {
              console.warn('[DomainRadar] refresh-rollup returned HTTP ' + res.status);
            }
            await this.loadDomains(true, true);
            this.showToast('Domain intelligence refreshed successfully!', 'success');
          } catch (e) {
            console.error('[DomainRadar] refreshDomains error:', e);
            await this.loadDomains(true, true);
          } finally {
            this.refreshingRollup = false;
          }
        },

        setPreset(preset) {
          this.activePreset = preset;
          if (preset === 'all') {
            this.ageFilter = 'all';
            this.rankFilter = 'all';
            this.savesFilter = 'all';
            this.sizeFilter = 'all';
          }
          this.loadDomains(true);
        },

        setLogicMode(mode) {
          this.logicMode = mode === 'or' ? 'or' : 'and';
          this.loadDomains(true);
        },

        applyModularFilter() {
          // If the user customizes modular filters, release any conflicting preset lock so modular AND/OR rules govern freely
          if (this.activePreset !== 'all') {
            this.activePreset = 'all';
          }
          this.loadDomains(true);
        },

        hasActiveFilters() {
          return (
            this.activePreset !== 'all' ||
            this.pinnedOnly ||
            this.ageFilter !== 'all' ||
            this.rankFilter !== 'all' ||
            this.savesFilter !== 'all' ||
            this.sizeFilter !== 'all' ||
            this.selectedAdNetwork !== 'all' ||
            this.selectedPillar !== 'all' ||
            Boolean(this.selectedFolderId && this.selectedFolderId !== this.scopedFolderId) ||
            Boolean(this.searchQuery && this.searchQuery.trim())
          );
        },

        toggleSortColumn(col) {
          if (col === 'age_asc') {
            this.sortBy = this.sortBy === 'age_asc' ? 'age_desc' : 'age_asc';
          } else {
            this.sortBy = col;
          }
          this.loadDomains(true);
        },

        applySearch() {
          this.loadDomains(true);
        },

        resetFilters() {
          this.searchQuery = '';
          this.selectedFolderId = this.scopedFolderId || '';
          this.pinnedOnly = false;
          this.selectedPillar = 'all';
          this.activePreset = 'all';
          this.selectedAdNetwork = 'all';
          this.ageFilter = 'all';
          this.rankFilter = 'all';
          this.savesFilter = 'all';
          this.sizeFilter = 'all';
          this.logicMode = 'and';
          this.sortBy = 'visibility';
          this.excludeMarketplaces = true;
          this.loadDomains(true);
        },

        changePage(p) {
          if (p < 1 || p > this.totalPages) return;
          this.currentPage = p;
          this.loadDomains();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        },

        async enrichAge(domain, force = false) {
          if (!domain || this.enrichingDomains[domain]) return;
          this.enrichingDomains[domain] = true;
          this.enrichingDomains = { ...this.enrichingDomains };
          try {
            const res = await (window.safeApiFetch || fetch)('/api/domains/enrich-age', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ domain, force })
            });
            if (res.ok) {
              const data = await res.json();
              if (data.age_info) {
                const target = this.domains.find(d => d.domain === domain);
                if (target) {
                  target.age_years = data.age_info.age_years;
                  target.age_days = data.age_info.age_days;
                  target.domain_created_at = data.age_info.registered_at;
                  target.age_status = data.age_info.lookup_status;
                  target.lookup_source = data.age_info.lookup_source;
                }
                if (this.dossierData && this.dossierDomain === domain) {
                  this.dossierData.age_info = data.age_info;
                }
                const ageLabel = data.age_info.age_years != null ? data.age_info.age_years + 'y' : 'Checked';
                this.showToast('Resolved ' + domain + ': ' + ageLabel + ' (' + (data.age_info.lookup_source || 'whois') + ')', 'success');
              }
            } else {
              throw new Error('HTTP ' + res.status);
            }
          } catch (err) {
            this.showToast('Failed to check age for ' + domain + ': ' + err.message, 'error');
          } finally {
            delete this.enrichingDomains[domain];
            this.enrichingDomains = { ...this.enrichingDomains };
          }
        },

        async batchEnrichVisible() {
          const unchecked = this.domains.filter(d => (!d.age_status || d.age_status === 'unchecked') && !this.enrichingDomains[d.domain]);
          if (unchecked.length === 0) {
            this.showToast('All visible domains on this page are already checked (resolved or privacy-shielded)!', 'info');
            return;
          }
          this.batchEnriching = true;
          this.batchProgress = { done: 0, total: unchecked.length };
          this.showToast('Verifying ' + unchecked.length + ' visible domains in batch...', 'info');

          // Chunk into batches of 8 with safe jitter
          const chunks = [];
          for (let i = 0; i < unchecked.length; i += 8) {
            chunks.push(unchecked.slice(i, i + 8).map(d => d.domain));
          }

          for (const chunk of chunks) {
            chunk.forEach(d => { this.enrichingDomains[d] = true; });
            this.enrichingDomains = { ...this.enrichingDomains };
            try {
              const res = await (window.safeApiFetch || fetch)('/api/domains/enrich-age', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ domains: chunk })
              });
              if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data.results)) {
                  for (const r of data.results) {
                    const target = this.domains.find(d => d.domain === r.domain);
                    if (target) {
                      target.age_years = r.age_years;
                      target.age_days = r.age_days;
                      target.domain_created_at = r.registered_at;
                      target.age_status = r.lookup_status;
                      target.lookup_source = r.lookup_source;
                    }
                  }
                }
              }
            } catch (_) {}
            chunk.forEach(d => { delete this.enrichingDomains[d]; });
            this.batchProgress.done = Math.min(this.batchProgress.total, this.batchProgress.done + chunk.length);
            this.enrichingDomains = { ...this.enrichingDomains };
          }

          this.batchEnriching = false;
          this.fetchGlobalEnrichStatus();
          this.showToast('Batch verification complete! Updated ' + this.batchProgress.done + ' domains.', 'success');
        },

        async fetchGlobalEnrichStatus() {
          try {
            const res = await (window.safeApiFetch || fetch)('/api/domains/enrich-status');
            if (res.ok) {
              const data = await res.json();
              if (data.stats) {
                this.globalStats = data.stats;
              }
            }
          } catch (_) {}
        },

        toggleGlobalEnrichment() {
          if (this.globalEnriching) {
            this.stopGlobalEnrichment();
          } else {
            this.startGlobalEnrichment();
          }
        },

        async startGlobalEnrichment() {
          if (this.globalEnriching) return;
          this.globalEnriching = true;
          this.showToast('Starting automated database verification...', 'info');

          try {
            await this.fetchGlobalEnrichStatus();
            if (this.globalStats.unchecked_domains === 0) {
              this.showToast('All domains in the database are already verified!', 'success');
              this.globalEnriching = false;
              return;
            }

            while (this.globalEnriching) {
              const res = await (window.safeApiFetch || fetch)('/api/domains/enrich-all', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ batch_size: 25, concurrency: 4 })
              });

              if (!res.ok) {
                throw new Error('HTTP ' + res.status);
              }

              const data = await res.json();
              if (data.stats) {
                this.globalStats = data.stats;
              }

              // Update any currently visible rows on screen in real time
              if (Array.isArray(data.results)) {
                for (const r of data.results) {
                  const target = this.domains.find(d => d.domain === r.domain);
                  if (target) {
                    target.age_years = r.age_years;
                    target.age_days = r.age_days;
                    target.domain_created_at = r.registered_at;
                    target.age_status = r.lookup_status;
                    target.lookup_source = r.lookup_source;
                  }
                }
              }

              if (data.is_complete || (this.globalStats.unchecked_domains === 0)) {
                this.globalEnriching = false;
                this.showToast('🎉 All domains in database are fully verified!', 'success');
                break;
              }

              // Small delay between batches to respect rate limits
              await new Promise(r => setTimeout(r, 600));
            }
          } catch (err) {
            this.globalEnriching = false;
            this.showToast('Global verification paused: ' + err.message, 'error');
          }
        },

        stopGlobalEnrichment() {
          this.globalEnriching = false;
          this.showToast('Global verification paused. You can resume anytime.', 'info');
        },

        // [INVARIANT: FOLDER-SCOPED-POPSTATE-PRESERVATION]
        getBaseStudioPath() {
          if (this.scopedFolderId) {
            return '/folders/' + encodeURIComponent(this.scopedFolderId) + '/domains';
          }
          return '/domains';
        },

        // [INVARIANT: STRICT-TIME-FORMATTING-SSOT]
        formatDomainAge(days) {
          if (days == null || days === '' || isNaN(days)) return '—';
          const numDays = Math.max(0, Math.floor(Number(days)));
          if (numDays >= 365) {
            const years = (numDays / 365.25).toFixed(1);
            return years + 'y';
          }
          return numDays + 'd';
        },

        formatAgeFromIso(isoStr) {
          if (!isoStr) return '—';
          try {
            const d = new Date(isoStr);
            if (isNaN(d.getTime())) return '—';
            const diffDays = Math.max(0, Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24)));
            if (diffDays >= 365) {
              const years = (diffDays / 365.25).toFixed(1);
              return years + 'y';
            }
            return diffDays + 'd';
          } catch (_) {
            return '—';
          }
        },

        async fetchPinnedDomains() {
          if (!this.scopedFolderId) return;
          try {
            const res = await (window.safeApiFetch || fetch)('/api/folders/' + encodeURIComponent(this.scopedFolderId) + '/domains');
            if (res.ok) {
              const data = await res.json();
              const list = data.pinned_domains || data.domains || [];
              this.pinnedDomains = new Set(list.map(p => (typeof p === 'string' ? p : (p.domain || '')).toLowerCase()));
            }
          } catch (_) {}
        },

        async togglePinDomain(domain) {
          if (!domain) return;
          const cleanDomain = domain.toLowerCase().trim();
          const targetFolderId = this.scopedFolderId || this.selectedFolderId;
          if (!targetFolderId) {
            this.showToast('Select a Campaign Folder to pin target domains', 'warning');
            return;
          }
          const isPinned = this.pinnedDomains.has(cleanDomain);
          const method = isPinned ? 'DELETE' : 'POST';
          const url = isPinned
            ? '/api/folders/' + encodeURIComponent(targetFolderId) + '/domains/' + encodeURIComponent(cleanDomain)
            : '/api/folders/' + encodeURIComponent(targetFolderId) + '/domains';

          try {
            const res = await (window.safeApiFetch || fetch)(url, {
              method,
              headers: { 'Content-Type': 'application/json' },
              body: isPinned ? undefined : JSON.stringify({ domain: cleanDomain })
            });
            if (res.ok) {
              if (isPinned) {
                this.pinnedDomains.delete(cleanDomain);
                this.showToast('Unpinned ' + cleanDomain + ' from folder', 'info');
              } else {
                this.pinnedDomains.add(cleanDomain);
                this.showToast('Pinned ' + cleanDomain + ' to folder', 'success');
              }
              this.pinnedDomains = new Set(this.pinnedDomains);
            } else {
              const errData = await res.json().catch(() => ({}));
              throw new Error(errData.error || 'HTTP ' + res.status);
            }
          } catch (err) {
            this.showToast('Failed to update domain pin: ' + err.message, 'error');
          }
        },

        async openDossier(domain, pushState = true, forceRefresh = false) {
          if (!domain) return;
          const reqSeq = ++this._dossierReqSeq;
          this.dossierDomain = domain;
          this.isDossierOpen = true;
          this.dossierLoading = true;
          this.dossierData = null;
          this.dossierTab = (domain && domain.toLowerCase() === 'uploaded by user') ? 'pins' : 'urls';
          this.currentDisplacedLimit = 30;
          this.dossierSearch = '';
          this.dossierSort = 'saves';
          this.dossierPinsPage = 1;
          this.dossierArticlesPage = 1;
          this.dossierStatusFilter = 'all';

          if (pushState && typeof window !== 'undefined' && window.history && window.history.pushState) {
            const basePath = this.getBaseStudioPath();
            const targetPath = basePath + '/' + encodeURIComponent(domain);
            if (window.location.pathname !== targetPath) {
              window.history.pushState({ domain, folderId: this.scopedFolderId }, '', targetPath);
            }
          }

          try {
            const activeFid = this.scopedFolderId || this.selectedFolderId || '';
            const folderParam = activeFid ? '&folder_id=' + encodeURIComponent(activeFid) : '';
            const apiUrl = '/api/domains/dossier?domain=' + encodeURIComponent(domain) + folderParam + (forceRefresh ? '&refresh=true' : '');
            const res = await (window.safeApiFetch || fetch)(apiUrl, { timeout: 28000 });
            if (reqSeq !== this._dossierReqSeq) return;
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            if (reqSeq !== this._dossierReqSeq) return;
            this.dossierData = data;
            if (Array.isArray(this.dossierData?.top_articles) && this.dossierData.top_articles.length > 0) {
              const sampleUrls = this.dossierData.top_articles.map(a => a.sample_url).filter(Boolean).slice(0, 15);
              if (sampleUrls.length > 0) {
                (async () => {
                  try {
                    const batchRes = await (window.safeApiFetch || fetch)('/api/urls/batch-global-saves', {
                      method: 'POST',
                      credentials: 'same-origin',
                      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
                      body: JSON.stringify({ urls: sampleUrls })
                    });
                    if (batchRes.ok) {
                      const batchData = await batchRes.json();
                      const results = batchData.results || batchData.data || [];
                      const countMap = new Map();
                      for (const r of results) {
                        if (r.url) countMap.set(r.url, Number(r.count || r.global_saves || 0));
                      }
                      if (reqSeq !== this._dossierReqSeq) return;
                      for (const art of (this.dossierData?.top_articles || [])) {
                        if (art.sample_url && countMap.has(art.sample_url)) {
                          art.url_global_saves = countMap.get(art.sample_url);
                        }
                      }
                    }
                  } catch (_) {}
                })();
              }
            }
          } catch (err) {
            if (reqSeq !== this._dossierReqSeq) return;
            this.showToast('Failed to load dossier: ' + err.message, 'error');
          } finally {
            if (reqSeq === this._dossierReqSeq) {
              this.dossierLoading = false;
            }
          }
        },

        async loadMoreDisplaced() {
          if (!this.dossierDomain || this.dossierLoadingMore) return;
          this.currentDisplacedLimit += 50;
          this.dossierLoadingMore = true;
          try {
            const activeFid = this.scopedFolderId || this.selectedFolderId || '';
            const folderParam = activeFid ? '&folder_id=' + encodeURIComponent(activeFid) : '';
            const apiUrl = '/api/domains/dossier?domain=' + encodeURIComponent(this.dossierDomain) + folderParam + '&displaced_limit=' + this.currentDisplacedLimit;
            const res = await (window.safeApiFetch || fetch)(apiUrl, { timeout: 28000 });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            if (data?.ranked_pins) {
              this.dossierData.ranked_pins = data.ranked_pins;
              this.dossierData.summary = data.summary;
              this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
              this.showToast('Loaded ' + data.ranked_pins.length + ' visual pins!', 'success');
            }
          } catch (err) {
            this.showToast('Failed to load more displaced pins: ' + err.message, 'error');
          } finally {
            this.dossierLoadingMore = false;
          }
        },

        closeDossier(pushState = true) {
          // [INVARIANT: PRESERVE-LEADERBOARD-TELEMETRY]
          // Only WHOIS age and Ads.txt enrichments sync back; core table metrics remain 100% INVARIANT!
          const domainToSync = this.dossierDomain || this.selectedDomain;
          if (domainToSync && this.dossierData && Array.isArray(this.domains) && this.domains.length > 0) {
            const target = this.domains.find(d => d.domain === domainToSync);
            if (target) {
              if (this.dossierData.age_info?.age_days != null) target.age_days = this.dossierData.age_info.age_days;
              if (this.dossierData.age_info?.created_date || this.dossierData.age_info?.registered_at) {
                target.domain_created_at = this.dossierData.age_info.created_date || this.dossierData.age_info.registered_at;
              }
              if (this.dossierData.age_info?.lookup_status) target.age_status = this.dossierData.age_info.lookup_status;
              if (this.dossierData.ad_info?.current_ad_network || this.dossierData.ad_info?.ad_network) {
                target.ad_network = this.dossierData.ad_info.current_ad_network || this.dossierData.ad_info.ad_network;
              }
              if (this.dossierData.ad_info?.ad_manager_domain) target.ad_manager_domain = this.dossierData.ad_info.ad_manager_domain;
              if (this.dossierData.ad_info?.previous_ad_network) target.previous_ad_network = this.dossierData.ad_info.previous_ad_network;
            }
          }
          this.isDossierOpen = false;
          this.dossierData = null;
          this.dossierDomain = '';
          this.selectedDomain = null;
          this.dossierSearch = '';
          if (pushState && typeof window !== 'undefined' && window.history && window.history.pushState) {
            const basePath = this.getBaseStudioPath();
            if (window.location.pathname !== basePath) {
              window.history.pushState({ folderId: this.scopedFolderId }, '', basePath);
            }
          }
        },

        getPinAgeBadge(dateStr) {
          if (!dateStr) return null;
          const d = new Date(dateStr);
          if (isNaN(d.getTime())) return null;
          const diffDays = Math.max(0, Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24)));
          if (diffDays < 30) {
            return {
              label: '🌱 ' + diffDays + 'd',
              title: 'Fresh Pin: Created ' + diffDays + ' days ago',
              class: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
            };
          } else if (diffDays <= 180) {
            return {
              label: '⚡ ' + diffDays + 'd',
              title: 'Velocity Active: Created ' + diffDays + ' days ago',
              class: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30'
            };
          } else {
            const years = (diffDays / 365).toFixed(1);
            const text = diffDays >= 365 ? '🦖 ' + years + 'y' : '🦖 ' + diffDays + 'd';
            return {
              label: text,
              title: 'Evergreen Pin: Created ' + diffDays + ' days ago',
              class: 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30'
            };
          }
        },

        filterToKeyword(kw) {
          if (!kw) return;
          this.dossierTab = 'keywords';
          this.dossierSearch = kw;
        },

        filterToArticle(urlOrSlug) {
          if (!urlOrSlug) return;
          this.dossierTab = 'urls';
          this.dossierSearch = urlOrSlug;
        },

        filterToArticleKeywords(art) {
          const kws = art?.target_keywords || art?.keywords || [];
          if (!kws || kws.length === 0) return;
          this.dossierTab = 'keywords';
          this.dossierSearch = kws[0];
        },

        copyAllKeywords() {
          if (!this.dossierData?.keyword_monopoly?.length) {
            this.showToast('No keywords available to copy', 'warning');
            return;
          }
          const list = this.dossierData.keyword_monopoly.map(k => k.keyword_name).filter(Boolean).join('\\n');
          this.copyToClipboard(list, 'Copied ' + this.dossierData.keyword_monopoly.length + ' keywords to clipboard!');
        },

        filteredDossierPins() {
          let list = this.dossierStatusFilter === 'catalog'
            ? (Array.isArray(this.dossierData?.catalog_pins) ? [...this.dossierData.catalog_pins] : [])
            : (Array.isArray(this.dossierData?.ranked_pins) ? [...this.dossierData.ranked_pins] : []);

          // [INVARIANT: STRICT-VISUAL-PIN-FIDELITY] Every displayed pin must have an authentic image
          list = list.filter(p => Boolean(p.image_url && p.image_url.trim()));

          // Status filter: all | active | displaced | catalog
          if (this.dossierStatusFilter === 'active') {
            list = list.filter(p => !p.is_displaced && p.best_rank !== null);
          } else if (this.dossierStatusFilter === 'displaced') {
            list = list.filter(p => Boolean(p.is_displaced));
          }

          const q = (this.dossierSearch || '').toLowerCase().trim();
          if (q) {
            list = list.filter(p => {
              return (p.title && p.title.toLowerCase().includes(q)) ||
                     (p.pin_id && String(p.pin_id).includes(q)) ||
                     (p.creator_username && p.creator_username.toLowerCase().includes(q)) ||
                     (Array.isArray(p.serp_appearances) && p.serp_appearances.some(a => a.keyword_name && a.keyword_name.toLowerCase().includes(q)));
            });
          }
          const getPinTime = (p) => {
            if (!p?.created_at_pinterest) return null;
            const t = new Date(p.created_at_pinterest).getTime();
            return isFinite(t) ? t : null;
          };
          const sort = this.dossierSort || 'saves';
          if (sort === 'saves') {
            list.sort((a, b) => (Number(b.saves) || 0) - (Number(a.saves) || 0));
          } else if (sort === 'age_asc') {
            list.sort((a, b) => {
              const aT = getPinTime(a);
              const bT = getPinTime(b);
              if (aT === null && bT === null) return 0;
              if (aT === null) return 1;
              if (bT === null) return -1;
              return bT - aT;
            });
          } else if (sort === 'age_desc') {
            list.sort((a, b) => {
              const aT = getPinTime(a);
              const bT = getPinTime(b);
              if (aT === null && bT === null) return 0;
              if (aT === null) return 1;
              if (bT === null) return -1;
              return aT - bT;
            });
          } else if (sort === 'multiplier') {
            list.sort((a, b) => (b.serp_appearances?.length || 0) - (a.serp_appearances?.length || 0));
          } else if (sort === 'rank') {
            list.sort((a, b) => (Number(a.best_rank) || 999) - (Number(b.best_rank) || 999));
          }
          return list;
        },

        paginatedDossierPins() {
          const list = this.filteredDossierPins();
          const start = (this.dossierPinsPage - 1) * this.dossierPinsPerPage;
          return list.slice(start, start + this.dossierPinsPerPage);
        },

        totalDossierPinsPages() {
          return Math.max(1, Math.ceil(this.filteredDossierPins().length / this.dossierPinsPerPage));
        },

        prevDossierPinsPage() {
          if (this.dossierPinsPage > 1) this.dossierPinsPage--;
        },

        nextDossierPinsPage() {
          if (this.dossierPinsPage < this.totalDossierPinsPages()) this.dossierPinsPage++;
        },

        filteredDossierArticles() {
          let list = Array.isArray(this.dossierData?.money_urls) ? [...this.dossierData.money_urls] : [];

          // [INVARIANT: CLEAN-MONEY-ARTICLES] Exclude root domain '/' dump from Money Articles
          list = list.filter(art => art.clean_slug && art.clean_slug !== '/');

          // Ensure pins inside each article only contain valid image pins
          list = list.map(art => {
            const validPins = (art.pins || []).filter(p => Boolean(p.image_url && p.image_url.trim()));
            return {
              ...art,
              pins: validPins,
              pins_count: validPins.length
            };
          }).filter(art => art.pins.length > 0);

          if (this.dossierStatusFilter === 'active') {
            list = list.filter(art => art.pins.some(p => !p.is_displaced));
          } else if (this.dossierStatusFilter === 'displaced') {
            list = list.filter(art => art.pins.some(p => Boolean(p.is_displaced)));
          }

          const q = (this.dossierSearch || '').toLowerCase().trim();
          if (q) {
            list = list.filter(art => {
              const kws = art.target_keywords || art.keywords || [];
              return (art.clean_slug && art.clean_slug.toLowerCase().includes(q)) ||
                     (art.sample_url && art.sample_url.toLowerCase().includes(q)) ||
                     (Array.isArray(art.angles_targeted) && art.angles_targeted.some(ang => ang.toLowerCase().includes(q))) ||
                     (Array.isArray(kws) && kws.some(kw => kw && kw.toLowerCase().includes(q))) ||
                     (Array.isArray(art.pins) && art.pins.some(p => p.title && p.title.toLowerCase().includes(q)));
            });
          }
          const getArticleNewestTime = (art) => {
            if (art.newest_pin_date || art.created_at_pinterest) {
              const t = new Date(art.newest_pin_date || art.created_at_pinterest).getTime();
              if (isFinite(t)) return t;
            }
            const times = (art.pins || [])
              .map(p => p.created_at_pinterest ? new Date(p.created_at_pinterest).getTime() : null)
              .filter(t => t !== null && isFinite(t));
            return times.length > 0 ? Math.max(...times) : null;
          };
          const getArticleOldestTime = (art) => {
            if (art.oldest_pin_date) {
              const t = new Date(art.oldest_pin_date).getTime();
              if (isFinite(t)) return t;
            }
            const times = (art.pins || [])
              .map(p => p.created_at_pinterest ? new Date(p.created_at_pinterest).getTime() : null)
              .filter(t => t !== null && isFinite(t));
            return times.length > 0 ? Math.min(...times) : null;
          };
          const sort = this.dossierSort || 'saves';
          if (sort === 'saves') {
            list.sort((a, b) => (Number(b.total_saves) || 0) - (Number(a.total_saves) || 0));
          } else if (sort === 'multiplier') {
            list.sort((a, b) => (Number(b.pins_count) || 0) - (Number(a.pins_count) || 0));
          } else if (sort === 'rank') {
            list.sort((a, b) => (Number(a.best_rank) || 999) - (Number(b.best_rank) || 999));
          } else if (sort === 'age_asc') {
            list.sort((a, b) => {
              const aT = getArticleNewestTime(a);
              const bT = getArticleNewestTime(b);
              if (aT === null && bT === null) return 0;
              if (aT === null) return 1;
              if (bT === null) return -1;
              return bT - aT;
            });
          } else if (sort === 'age_desc') {
            list.sort((a, b) => {
              const aT = getArticleOldestTime(a);
              const bT = getArticleOldestTime(b);
              if (aT === null && bT === null) return 0;
              if (aT === null) return 1;
              if (bT === null) return -1;
              return aT - bT;
            });
          }
          return list;
        },

        paginatedDossierArticles() {
          const list = this.filteredDossierArticles();
          const start = (this.dossierArticlesPage - 1) * this.dossierArticlesPerPage;
          return list.slice(start, start + this.dossierArticlesPerPage);
        },

        totalDossierArticlesPages() {
          return Math.max(1, Math.ceil(this.filteredDossierArticles().length / this.dossierArticlesPerPage));
        },

        prevDossierArticlesPage() {
          if (this.dossierArticlesPage > 1) this.dossierArticlesPage--;
        },

        nextDossierArticlesPage() {
          if (this.dossierArticlesPage < this.totalDossierArticlesPages()) this.dossierArticlesPage++;
        },

        filteredDossierKeywords() {
          let list = Array.isArray(this.dossierData?.keyword_monopoly) ? [...this.dossierData.keyword_monopoly] : [];
          const q = (this.dossierSearch || '').toLowerCase().trim();
          if (q) {
            list = list.filter(kw => {
              return (kw.keyword_name && kw.keyword_name.toLowerCase().includes(q)) ||
                     (kw.strategy && kw.strategy.toLowerCase().includes(q)) ||
                     (kw.top_slot_attribution?.title && kw.top_slot_attribution.title.toLowerCase().includes(q));
            });
          }
          const getKeywordNewestTime = (kw) => {
            const times = (kw.slots_detail || kw.slots || [])
              .map(s => s.created_at_pinterest ? new Date(s.created_at_pinterest).getTime() : null)
              .filter(t => t !== null && isFinite(t));
            return times.length > 0 ? Math.max(...times) : null;
          };
          const getKeywordOldestTime = (kw) => {
            const times = (kw.slots_detail || kw.slots || [])
              .map(s => s.created_at_pinterest ? new Date(s.created_at_pinterest).getTime() : null)
              .filter(t => t !== null && isFinite(t));
            return times.length > 0 ? Math.min(...times) : null;
          };
          const sort = this.dossierSort || 'saves';
          if (sort === 'saves') {
            list.sort((a, b) => (Number(b.total_saves) || 0) - (Number(a.total_saves) || 0));
          } else if (sort === 'multiplier') {
            // Sort by Pins per Keyword / Monopoly slots
            list.sort((a, b) => (Number(b.active_slots) || 0) - (Number(a.active_slots) || 0) || (Number(b.unique_urls_count) || 0) - (Number(a.unique_urls_count) || 0));
          } else if (sort === 'rank') {
            // Best rank: Rank #1 first!
            list.sort((a, b) => (Number(a.best_rank) || 999) - (Number(b.best_rank) || 999));
          } else if (sort === 'age_asc') {
            list.sort((a, b) => {
              const aT = getKeywordNewestTime(a);
              const bT = getKeywordNewestTime(b);
              if (aT === null && bT === null) return 0;
              if (aT === null) return 1;
              if (bT === null) return -1;
              return bT - aT;
            });
          } else if (sort === 'age_desc') {
            list.sort((a, b) => {
              const aT = getKeywordOldestTime(a);
              const bT = getKeywordOldestTime(b);
              if (aT === null && bT === null) return 0;
              if (aT === null) return 1;
              if (bT === null) return -1;
              return aT - bT;
            });
          }
          return list;
        },

        async openBlueprintModal(domain) {
          if (!domain) return;
          this.blueprintLoading = true;
          this.isBlueprintModalOpen = true;
          this.blueprintData = null;

          try {
            const activeFid = this.scopedFolderId || this.selectedFolderId || '';
            const folderParam = activeFid ? '&folder_id=' + encodeURIComponent(activeFid) : '';
            const res = await (window.safeApiFetch || fetch)('/api/domains/blueprint?domain=' + encodeURIComponent(domain) + folderParam, { timeout: 18000 });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            this.blueprintData = await res.json();
          } catch (err) {
            this.showToast('Failed to generate Attack Blueprint: ' + err.message, 'error');
          } finally {
            this.blueprintLoading = false;
          }
        },

        closeBlueprintModal() {
          this.isBlueprintModalOpen = false;
          this.blueprintData = null;
        },

        copyBlueprintMarkdown() {
          if (!this.blueprintData?.markdown_blueprint) return;
          navigator.clipboard.writeText(this.blueprintData.markdown_blueprint).then(() => {
            this.showToast('📋 Attack Blueprint copied to clipboard in Markdown format!', 'success');
          }).catch(() => {
            this.showToast('Failed to copy to clipboard', 'error');
          });
        },

        exportBlueprintJson() {
          if (!this.blueprintData) return;
          const jsonStr = JSON.stringify(this.blueprintData, null, 2);
          const blob = new Blob([jsonStr], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'blueprint_' + (this.blueprintData.domain || 'attack') + '.json';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          this.showToast('📥 Downloaded Blueprint JSON!', 'success');
        },

        async recheckAgeForDossier() {
          if (!this.dossierDomain) return;
          await this.enrichAge(this.dossierDomain, true);
        },

        async enrichAd(domain, force = false) {
          if (!domain || this.enrichingAds[domain]) return;
          this.enrichingAds[domain] = true;
          this.enrichingAds = { ...this.enrichingAds };
          try {
            const res = await (window.safeApiFetch || fetch)('/api/domains/enrich-ads', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ domain, force })
            });
            if (res.ok) {
              const data = await res.json();
              const adInfo = data.ad_info || (Array.isArray(data.results) ? data.results[0] : null);
              if (adInfo) {
                const target = this.domains.find(d => d.domain === domain);
                if (target) {
                  target.ad_network = adInfo.current_ad_network || adInfo.ad_network;
                  target.ad_manager_domain = adInfo.ad_manager_domain;
                  target.primary_pub_id = adInfo.primary_pub_id;
                  target.previous_ad_network = adInfo.previous_ad_network;
                  target.ad_switched_at = adInfo.switched_at || adInfo.ad_switched_at;
                  target.ads_txt_status = adInfo.ads_txt_status;
                  target.ad_network_history = adInfo.network_history || adInfo.ad_network_history;
                }
                if (this.dossierData && this.dossierDomain === domain) {
                  this.dossierData.ad_info = {
                    ...(this.dossierData.ad_info || {}),
                    ...adInfo,
                    current_ad_network: adInfo.current_ad_network || adInfo.ad_network
                  };
                }
                const netLabel = this.getAdNetworkBadgeText(adInfo.current_ad_network || adInfo.ad_network);
                this.showToast('Resolved monetization for ' + domain + ': ' + netLabel, 'success');
              }
            } else {
              throw new Error('HTTP ' + res.status);
            }
          } catch (err) {
            this.showToast('Failed to check ads for ' + domain + ': ' + err.message, 'error');
          } finally {
            delete this.enrichingAds[domain];
            this.enrichingAds = { ...this.enrichingAds };
          }
        },

        async recheckAdsForDossier() {
          if (!this.dossierDomain) return;
          await this.enrichAd(this.dossierDomain, true);
        },

        async batchEnrichAdsVisible() {
          const unchecked = this.domains.filter(d => (!d.ad_network || d.ad_network === 'unchecked') && !this.enrichingAds[d.domain]);
          if (unchecked.length === 0) {
            this.showToast('All visible domains on this page already have ads.txt monetization status!', 'info');
            return;
          }
          this.batchAdsEnriching = true;
          this.batchAdsProgress = { done: 0, total: unchecked.length };
          this.showToast('Verifying ads.txt for ' + unchecked.length + ' visible domains in batch...', 'info');

          // Chunk into batches of 6 with safe concurrency
          const chunks = [];
          for (let i = 0; i < unchecked.length; i += 6) {
            chunks.push(unchecked.slice(i, i + 6).map(d => d.domain));
          }

          for (const chunk of chunks) {
            chunk.forEach(d => { this.enrichingAds[d] = true; });
            this.enrichingAds = { ...this.enrichingAds };
            try {
              const res = await (window.safeApiFetch || fetch)('/api/domains/enrich-ads', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ domains: chunk })
              });
              if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data.results)) {
                  for (const r of data.results) {
                    const target = this.domains.find(d => d.domain === r.domain);
                    if (target) {
                      target.ad_network = r.current_ad_network || r.ad_network;
                      target.ad_manager_domain = r.ad_manager_domain;
                      target.primary_pub_id = r.primary_pub_id;
                      target.previous_ad_network = r.previous_ad_network;
                      target.ad_switched_at = r.switched_at || r.ad_switched_at;
                      target.ads_txt_status = r.ads_txt_status;
                      target.ad_network_history = r.network_history || r.ad_network_history;
                    }
                  }
                }
              }
            } catch (_) {}
            chunk.forEach(d => { delete this.enrichingAds[d]; });
            this.batchAdsProgress.done = Math.min(this.batchAdsProgress.total, this.batchAdsProgress.done + chunk.length);
            this.enrichingAds = { ...this.enrichingAds };
          }

          this.batchAdsEnriching = false;
          this.fetchGlobalAdsStatus();
          this.showToast('Batch ads verification complete! Updated ' + this.batchAdsProgress.done + ' domains.', 'success');
        },

        async fetchGlobalAdsStatus() {
          try {
            const res = await (window.safeApiFetch || fetch)('/api/domains/ads-status');
            if (res.ok) {
              const data = await res.json();
              if (data.stats) {
                this.globalAdsStats = data.stats;
              }
            }
          } catch (_) {}
        },

        toggleGlobalAdsEnrichment() {
          if (this.globalAdsEnriching) {
            this.stopGlobalAdsEnrichment();
          } else {
            this.startGlobalAdsEnrichment();
          }
        },

        async startGlobalAdsEnrichment() {
          if (this.globalAdsEnriching) return;
          this.globalAdsEnriching = true;
          this.showToast('Starting automated ads.txt verification...', 'info');

          try {
            await this.fetchGlobalAdsStatus();
            if (this.globalAdsStats.unchecked_domains === 0) {
              this.showToast('All domains in the database already have ads.txt verified!', 'success');
              this.globalAdsEnriching = false;
              return;
            }

            while (this.globalAdsEnriching) {
              const res = await (window.safeApiFetch || fetch)('/api/domains/enrich-ads-all', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ batch_size: 15, concurrency: 3 })
              });

              if (!res.ok) {
                throw new Error('HTTP ' + res.status);
              }

              const data = await res.json();
              if (data.stats) {
                this.globalAdsStats = data.stats;
              }

              // Update any currently visible rows on screen in real time
              if (Array.isArray(data.results)) {
                for (const r of data.results) {
                  const target = this.domains.find(d => d.domain === r.domain);
                  if (target) {
                    target.ad_network = r.current_ad_network || r.ad_network;
                    target.ad_manager_domain = r.ad_manager_domain;
                    target.primary_pub_id = r.primary_pub_id;
                    target.previous_ad_network = r.previous_ad_network;
                    target.ad_switched_at = r.switched_at || r.ad_switched_at;
                    target.ads_txt_status = r.ads_txt_status;
                    target.ad_network_history = r.network_history || r.ad_network_history;
                  }
                }
              }

              if (data.is_complete || (this.globalAdsStats.unchecked_domains === 0)) {
                this.globalAdsEnriching = false;
                this.showToast('🎉 All domains in database have ads.txt monetization verified!', 'success');
                break;
              }

              // Delay between batches to respect target servers and rate limits
              await new Promise(r => setTimeout(r, 800));
            }
          } catch (err) {
            this.globalAdsEnriching = false;
            this.showToast('Global ads verification paused: ' + err.message, 'error');
          }
        },

        stopGlobalAdsEnrichment() {
          this.globalAdsEnriching = false;
          this.showToast('Global ads verification paused. You can resume anytime.', 'info');
        },

        capitalize(str) {
          if (!str) return '';
          return str.charAt(0).toUpperCase() + str.slice(1);
        },

        getAdNetworkBadgeText(net) {
          if (!net || net === 'unchecked') return '⏳ Unchecked';
          switch (net) {
            case 'raptive': return '💎 Raptive';
            case 'mediavine': return '🍇 Mediavine';
            case 'journey': return '🚀 Journey';
            case 'ezoic': return '⚡ Ezoic';
            case 'hbagency': return '⚡ HBAgency';
            case 'monumetric': return '📈 Monumetric';
            case 'shemedia': return '🌸 SheMedia';
            case 'freestar': return '⭐ Freestar';
            case 'playwire': return '🎮 Playwire';
            case 'snigel': return '🛡️ Snigel';
            case 'adsense': return '🟡 AdSense';
            case 'affiliate_only': return '🛒 Affiliate Only';
            case 'unmonetized': return '⚪ Direct / None';
            case 'protected': return '🛡️ Bot Protected';
            case 'failed': return '❌ Unreachable';
            default: return this.capitalize(net);
          }
        },

        getAdNetworkBadgeClasses(net) {
          if (!net || net === 'unchecked') {
            return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700';
          }
          switch (net) {
            case 'raptive':
              return 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 border border-purple-300 dark:border-purple-700';
            case 'mediavine':
              return 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300 border border-rose-300 dark:border-rose-700';
            case 'journey':
              return 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300 border border-sky-300 dark:border-sky-700';
            case 'ezoic':
              return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700';
            case 'hbagency':
              return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700';
            case 'monumetric':
              return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-700';
            case 'shemedia':
              return 'bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300 border border-pink-300 dark:border-pink-700';
            case 'freestar':
              return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-300 dark:border-amber-700';
            case 'playwire':
              return 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300 border border-violet-300 dark:border-violet-700';
            case 'snigel':
              return 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300 border border-teal-300 dark:border-teal-700';
            case 'adsense':
              return 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-300 dark:border-amber-800';
            case 'affiliate_only':
              return 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-300 dark:border-blue-700';
            case 'unmonetized':
              return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-700';
            case 'protected':
              return 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800';
            case 'failed':
              return 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400 border border-rose-200 dark:border-rose-800';
            default:
              return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700';
          }
        },

        copyToClipboard(text, msg = 'Copied to clipboard!') {
          if (!text) return;
          if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => {
              this.showToast(msg, 'success');
            }).catch(() => {
              this.fallbackCopy(text, msg);
            });
          } else {
            this.fallbackCopy(text, msg);
          }
        },

        fallbackCopy(text, msg = 'Copied to clipboard!') {
          try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            this.showToast(msg, 'success');
          } catch (_) {
            this.showToast('Could not copy to clipboard', 'warning');
          }
        },

        copyAllArticleUrls() {
          if (!this.dossierData?.money_urls?.length) {
            this.showToast('No articles available to copy', 'warning');
            return;
          }
          const urls = this.dossierData.money_urls.map(u => u.sample_url || ('https://' + this.dossierDomain + u.clean_slug)).join('\\n');
          this.copyToClipboard(urls, 'Copied ' + this.dossierData.money_urls.length + ' article URLs to clipboard!');
        },

        downloadDomainsCsv() {
          if (!this.domains || this.domains.length === 0) {
            this.showToast('No domains available to export', 'warning');
            return;
          }

          const headers = [
            'domain',
            'ad_network',
            'ad_manager_domain',
            'previous_ad_network',
            'age_years',
            'age_days',
            'domain_created_at',
            'total_pins',
            'unique_urls',
            'pins_per_url',
            'active_serp_pins',
            'top3_pins',
            'top10_pins',
            'displaced_pins',
            'decay_rate_pct',
            'visibility_score',
            'arbitrage_score',
            'total_saves',
            'avg_velocity',
            'accounts_count'
          ];

          const csvContent = [
            headers.map(h => this.sanitizeCsvCell(h)).join(','),
            ...this.domains.map(d => headers.map(h => this.sanitizeCsvCell(d[h])).join(','))
          ].join('\\r\\n');

          const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'domain_intelligence_' + new Date().toISOString().slice(0, 10) + '.csv';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          this.showToast('Exported domains CSV!', 'success');
        }
      };
    }
    if (typeof document !== 'undefined') {
      const initLucide = () => {
        if (typeof window !== 'undefined' && window.lucide && typeof window.lucide.createIcons === 'function') {
          window.lucide.createIcons();
        }
      };
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initLucide);
      } else {
        initLucide();
      }
    }
  </script>`;
}

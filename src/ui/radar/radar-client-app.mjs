/**
 * src/ui/radar/radar-client-app.mjs
 *
 * Client Alpine controller for the unified Workspace Radar page (/radar, /, /pulse).
 * Combines 24h Pulse + Creator Hub + Domain Radar strictly scoped to the active Workspace.
 * Leaf module (zero imports) to preserve the strictly acyclic src/ui/ module graph.
 */

export function getRadarClientAppScript() {
  return `
  <script>
    (function() {
      var HTML_NAMED_ENTITIES = {
        amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' '
      };

      function decodeHtmlEntities(raw) {
        var str = String(raw || '');
        if (!str || str.indexOf('&') === -1) return str;
        return str.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, function(full, body) {
          var lower = String(body || '').toLowerCase();
          if (lower.startsWith('#x')) {
            var hexCode = parseInt(lower.slice(2), 16);
            if (isFinite(hexCode) && hexCode > 0 && hexCode <= 0x10ffff) {
              try { return String.fromCodePoint(hexCode); } catch (_) { return full; }
            }
            return full;
          }
          if (lower.startsWith('#')) {
            var decCode = parseInt(lower.slice(1), 10);
            if (isFinite(decCode) && decCode > 0 && decCode <= 0x10ffff) {
              try { return String.fromCodePoint(decCode); } catch (_) { return full; }
            }
            return full;
          }
          return Object.prototype.hasOwnProperty.call(HTML_NAMED_ENTITIES, lower)
            ? HTML_NAMED_ENTITIES[lower]
            : full;
        });
      }

      function formatCompact(val) {
        var n = Number(val || 0);
        if (!isFinite(n)) return '0';
        var abs = Math.abs(n);
        if (abs >= 1000000) return (n / 1000000).toFixed(1).replace(/[.]0$/, '') + 'M';
        if (abs >= 1000) return (n / 1000).toFixed(1).replace(/[.]0$/, '') + 'K';
        return String(Math.round(n));
      }

      function safeImgUrl(url) {
        if (!url || typeof url !== 'string') return '';
        var s = url.trim();
        return /^https?:[/][/]/i.test(s) ? s : '';
      }

      window.radarApp = function() {
        var pageData = (typeof window !== 'undefined' && window.__PAE_PAGE_DATA__) || {};
        var initialTab = String(pageData.initialTab || 'pulse').toLowerCase();
        if (initialTab !== 'pulse' && initialTab !== 'creators' && initialTab !== 'domains') {
          initialTab = 'pulse';
        }

        return {
          isDark: (typeof document !== 'undefined' && document.documentElement)
            ? document.documentElement.classList.contains('dark')
            : false,
          isMobileMenuOpen: false,
          isSidebarCollapsed: (typeof localStorage !== 'undefined' && (localStorage.getItem('pae_sidebar_collapsed') === 'true' || localStorage.getItem('pa_sidebar_collapsed') === 'true')),

          activeTab: initialTab,
          timeframe: '24h',
          searchQuery: '',
          isLoading: false,
          errorMessage: '',
          toastMsg: '',
          toastTimer: null,

          pulsePins: [],
          pulseSummary: { total_pins: 0, total_gain: 0, hot_pins: 0 },
          creators: [],
          creatorsSummary: { tracked_profiles: 0, total_pins: 0, total_audience: 0, avg_monthly_views: 0 },
          domains: [],
          domainsSummary: { total_domains: 0, total_pins: 0 },
          watchlistKeys: {},

          init() {
            var self = this;
            if (typeof window !== 'undefined') {
              window.addEventListener('pae:theme-changed', function(ev) {
                self.isDark = Boolean(ev && ev.detail && ev.detail.isDark);
              });
            }
            this.loadAll();
          },

          toggleTheme() {
            if (typeof window !== 'undefined' && window.PAE && typeof window.PAE.toggleTheme === 'function') {
              this.isDark = window.PAE.toggleTheme();
              return;
            }
            this.isDark = !this.isDark;
            if (typeof document !== 'undefined' && document.documentElement) {
              document.documentElement.classList.toggle('dark', this.isDark);
            }
            try { localStorage.setItem('pa_theme', this.isDark ? 'dark' : 'light'); } catch (_) {}
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
            var self = this;
            this.toastMsg = String(msg || '');
            if (this.toastTimer) clearTimeout(this.toastTimer);
            this.toastTimer = setTimeout(function() { self.toastMsg = ''; }, 3200);
          },

          decodeTitle(str) {
            return decodeHtmlEntities(str || '');
          },

          fmtNum(n) {
            return formatCompact(n);
          },

          safeImg(url) {
            return safeImgUrl(url);
          },

          pinGain(pin) {
            if (!pin) return 0;
            var base24 = Number(
              pin.repins_delta_24h ??
              pin.saves_delta_24h ??
              pin.daily_save_velocity ??
              pin.effective_24h_momentum ??
              pin.gain_24h ??
              pin.repin_gain_24h ??
              pin.saves_gain_24h ??
              0
            );
            if (this.timeframe === '5d') return Number(pin.gain_5d ?? pin.repin_gain_5d ?? pin.saves_gain_5d ?? base24);
            if (this.timeframe === '7d') return Number(pin.gain_7d ?? pin.repin_gain_7d ?? pin.saves_gain_7d ?? pin.saves_delta_7d ?? base24);
            if (this.timeframe === '10d') return Number(pin.gain_10d ?? pin.repin_gain_10d ?? pin.gain_7d ?? base24);
            if (this.timeframe === '15d') return Number(pin.gain_15d ?? pin.repin_gain_15d ?? pin.gain_7d ?? base24);
            return base24;
          },

          setTimeframe(tf) {
            if (this.timeframe === tf) return;
            this.timeframe = tf;
            this.loadPulse();
          },

          async loadAll() {
            this.isLoading = true;
            this.errorMessage = '';
            try {
              await Promise.all([
                this.loadPulse(),
                this.loadCreators(),
                this.loadDomains(),
                this.loadWatchlistIndex()
              ]);
            } catch (err) {
              this.errorMessage = String((err && err.message) || 'Failed to load workspace radar data');
            } finally {
              this.isLoading = false;
              this.$nextTick(function() {
                if (typeof lucide !== 'undefined' && typeof lucide.createIcons === 'function') {
                  lucide.createIcons();
                }
              });
            }
          },

          async loadPulse() {
            try {
              var reqFn = (typeof window !== 'undefined' && typeof window.apiFetch === 'function') ? window.apiFetch : fetch;
              var res = await reqFn('/api/pulse/24h?window=' + encodeURIComponent(this.timeframe), { credentials: 'same-origin' });
              if (!res.ok) return;
              var data = await res.json();
              var rows = Array.isArray(data.breakout_pins)
                ? data.breakout_pins
                : (Array.isArray(data.pins) ? data.pins : (Array.isArray(data.data) ? data.data : []));
              this.pulsePins = rows.slice(0, 60);
              var gainSum = 0;
              var hotCount = 0;
              for (var i = 0; i < this.pulsePins.length; i++) {
                var g = this.pinGain(this.pulsePins[i]);
                gainSum += g;
                if (g >= 10) hotCount++;
              }
              var kpis = data.kpis || {};
              this.pulseSummary = {
                total_pins: Number(kpis.total_active_pins ?? data.total_count ?? data.total ?? rows.length),
                total_gain: Number(kpis.total_saves_velocity ?? kpis.total_repins_delta ?? gainSum),
                hot_pins: Number(kpis.pins_gaining_count ?? hotCount)
              };
            } catch (_) {}
          },

          async loadCreators() {
            try {
              var reqFn = (typeof window !== 'undefined' && typeof window.apiFetch === 'function') ? window.apiFetch : fetch;
              var res = await reqFn('/api/creators?limit=60&workspace_scope=1', { credentials: 'same-origin' });
              if (!res.ok) return;
              var data = await res.json();
              var rows = Array.isArray(data.creators) ? data.creators : (Array.isArray(data.competitors) ? data.competitors : (Array.isArray(data.data) ? data.data : []));
              this.creators = rows;
              var ov = data.overview || {};
              this.creatorsSummary = {
                tracked_profiles: Number(ov.tracked_profiles ?? rows.length),
                total_pins: Number(ov.pins_tracked ?? ov.total_pins ?? 0),
                total_audience: Number(ov.total_audience ?? 0),
                avg_monthly_views: Number(ov.avg_monthly_views ?? ov.total_impressions ?? 0)
              };
            } catch (_) {}
          },

          async loadDomains() {
            try {
              var reqFn = (typeof window !== 'undefined' && typeof window.apiFetch === 'function') ? window.apiFetch : fetch;
              var res = await reqFn('/api/domains?limit=60&sort=velocity&workspace_scope=1', { credentials: 'same-origin' });
              if (!res.ok) return;
              var data = await res.json();
              var rows = Array.isArray(data.domains) ? data.domains : (Array.isArray(data.data) ? data.data : []);
              this.domains = rows;
              var totalPins = 0;
              for (var i = 0; i < rows.length; i++) {
                totalPins += Number(rows[i].pin_count ?? rows[i].total_pins ?? 0);
              }
              this.domainsSummary = {
                total_domains: Number(data.total_domains ?? data.total_count ?? data.total ?? rows.length),
                total_pins: totalPins
              };
            } catch (_) {}
          },

          async loadWatchlistIndex() {
            try {
              var reqFn = (typeof window !== 'undefined' && typeof window.apiFetch === 'function') ? window.apiFetch : fetch;
              var res = await reqFn('/api/watchlist?limit=500', { credentials: 'same-origin' });
              if (!res.ok) return;
              var data = await res.json();
              var items = Array.isArray(data.items) ? data.items : [];
              var map = {};
              for (var i = 0; i < items.length; i++) {
                var it = items[i];
                map[String(it.entity_type) + ':' + String(it.entity_key).toLowerCase()] = true;
              }
              this.watchlistKeys = map;
            } catch (_) {}
          },

          isWatched(entityType, entityKey) {
            return Boolean(this.watchlistKeys[String(entityType) + ':' + String(entityKey || '').toLowerCase()]);
          },

          async addToWatchlist(entityType, entityKey, displayName, trackingMode) {
            if (!entityKey) return;
            try {
              var reqFn = (typeof window !== 'undefined' && typeof window.apiFetch === 'function') ? window.apiFetch : fetch;
              var payload = {
                entity_type: entityType,
                entity_key: String(entityKey),
                creator_tracking_mode: trackingMode || 'metrics_only'
              };
              if (displayName && String(displayName).trim() && String(displayName).trim() !== String(entityKey).trim()) {
                payload.notes = String(displayName).trim();
              }
              var res = await reqFn('/api/watchlist', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
              });
              if (res.ok) {
                this.watchlistKeys = Object.assign({}, this.watchlistKeys, {
                  [String(entityType) + ':' + String(entityKey).toLowerCase()]: true
                });
                this.showToast('Added to Workspace Watchlist');
              } else {
                var err = await res.json().catch(function() { return {}; });
                this.showToast(err.message || err.error || 'Could not add to Watchlist');
              }
            } catch (_) {
              this.showToast('Network error adding to Watchlist');
            }
          },

          get filteredPulse() {
            var q = String(this.searchQuery || '').trim().toLowerCase();
            if (!q) return this.pulsePins;
            var self = this;
            return this.pulsePins.filter(function(p) {
              var hay = (self.decodeTitle(p.title || '') + ' ' + String(p.domain || p.clean_domain || '') + ' ' + String(p.keyword || '') + ' ' + String(p.pin_id || '')).toLowerCase();
              return hay.indexOf(q) !== -1;
            });
          },

          get filteredCreators() {
            var q = String(this.searchQuery || '').trim().toLowerCase();
            if (!q) return this.creators;
            return this.creators.filter(function(c) {
              var hay = (String(c.username || '') + ' ' + String(c.full_name || '') + ' ' + String(c.domain || '')).toLowerCase();
              return hay.indexOf(q) !== -1;
            });
          },

          get filteredDomains() {
            var q = String(this.searchQuery || '').trim().toLowerCase();
            if (!q) return this.domains;
            return this.domains.filter(function(d) {
              return String(d.domain || d.clean_domain || '').toLowerCase().indexOf(q) !== -1;
            });
          }
        };
      };
    })();
  </script>
  `;
}

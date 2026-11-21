/**
 * src/ui/pulse/pulse-client-app.mjs
 *
 * Client-side Alpine.js controller (pulseStudioApp) for the 24-Hour Algorithmic Pulse & Crossover Studio.
 */

export function getPulseClientAppScript() {
  return `  <script>
    function pulseStudioApp(initialFolderId) {
      return {
        // [INVARIANT: HEADLESS-NODE-SHIELD] Browser environment guards
        isDark: (typeof localStorage !== 'undefined') ? (localStorage.getItem('pa_theme') === 'dark') : false,
        darkMode: (typeof localStorage !== 'undefined') ? (localStorage.getItem('pa_theme') === 'dark') : false,
        isSidebarCollapsed: (typeof localStorage !== 'undefined') ? (localStorage.getItem('pae_sidebar_collapsed') === 'true') : false,
        isMobileMenuOpen: false,
        scopedFolderId: initialFolderId || '',
        activeFolderId: initialFolderId || '',
        activeFolder: null,
        foldersList: [],

        // 3-Room Navigation State
        currentRoom: 'radar', // 'radar' | 'matrix' | 'creators_vacuums'
        activeTab: 'breakouts', // Backward compatibility alias

        // Room 1: Radar State
        radarFilter: 'all', // 'all' | 'fresh' | 'bridges' | 'domainless' | 'vault'
        breakoutSubFilter: 'all', // Backward compatibility alias
        activeTagFilter: '', // Active visual annotation or capsule filter chip
        searchQuery: '',

        // Room 2: Matrix State
        matrixSubFilter: 'pairs', // 'pairs' | 'triplets' | 'single' | 'capsules' | 'colors'
        annotationSubFilter: 'pairs', // Backward compatibility alias
        matrixSortMode: 'gain',
        selectedMatrixItem: null,

        // Room 3: Breakout Creators & Vacuums State
        creatorSubFilter: 'all', // 'all' | 'david'

        // Persistent Slide-Over Drawer State
        isBlueprintModalOpen: false,
        activeBlueprintPin: null,
        isDossierHydrating: false,
        blueprintCopied: false,
        promptCopied: false,

        // Networking & Stampede Defense [INVARIANT: MONOTONIC-REQUEST-SEQUENCING]
        isLoading: false,
        isRefreshing: false,
        selectedWindow: '24h',
        _pulseReqSeq: 0,

        // Windowed Pagination Caps [INVARIANT: WINDOWED-DOM-PAGINATION]
        displayLimits: {
          radar: 50,
          breakouts: 50,
          matrix: 50,
          annotations: 50,
          capsules: 50,
          creators: 50,
          domainless: 50,
          vacuums: 50,
          bridges: 50,
          gems: 50
        },

        // Ingested Telemetry Containers
        kpis: {},
        breakout_pins: {
          top_breakouts: [],
          fresh_rockets: [],
          vault_surge_pins: [],
          pinarchive_winners: []
        },
        annotation_crossovers: {
          single_annotations: [],
          pair_crossovers: [],
          triplet_crossovers: []
        },
        guided_capsule_crossovers: [],
        creator_breakouts: [],
        keyword_vacuums_and_bridges: {
          bridge_pins: [],
          keyword_vacuum_opportunities: []
        },
        hidden_gems_telemetry: {
          winning_boards: [],
          vacuum_hijack_pins: [],
          domainless_viral_pins: [],
          creation_method_breakdown: [],
          dominant_color_palette: [],
          top_arbitrage_domains: []
        },

        toasts: [],

        init: function() {
          if (this.scopedFolderId) {
            this.loadFolderInfo();
          }
          this.fetchPulseData(false);

          if (typeof document !== 'undefined') {
            document.addEventListener('DOMContentLoaded', function() {
              if (typeof lucide !== 'undefined' && lucide.createIcons) {
                lucide.createIcons();
              }
            });
          }
        },

        loadFolderInfo: async function() {
          try {
            if (!this.scopedFolderId) return;
            const res = await window.apiFetch('/api/folders');
            if (!res.ok) return;
            const data = await res.json();
            if (data && Array.isArray(data.folders)) {
              this.foldersList = data.folders;
              const found = data.folders.find(f => String(f.id) === String(this.scopedFolderId));
              if (found) {
                this.activeFolder = found;
              }
            }
          } catch (_) {}
        },

        setRoom: function(room) {
          this.currentRoom = room;
          if (room === 'radar') this.activeTab = 'breakouts';
          else if (room === 'matrix') this.activeTab = 'annotations';
          else if (room === 'creators_vacuums') this.activeTab = 'creators';
          this.$nextTick(function() {
            if (typeof lucide !== 'undefined' && lucide.createIcons) {
              lucide.createIcons();
            }
          });
        },

        setRadarFilter: function(filter) {
          this.radarFilter = filter;
          this.breakoutSubFilter = filter;
          this.displayLimits.radar = 50;
          this.$nextTick(function() {
            if (typeof lucide !== 'undefined' && lucide.createIcons) {
              lucide.createIcons();
            }
          });
        },

        setTagFilter: function(tag) {
          if (!tag) return;
          this.activeTagFilter = String(tag).trim();
          this.currentRoom = 'radar';
          this.activeTab = 'breakouts';
          this.displayLimits.radar = 50;
          this.showToast('Filtering 24h Radar by tag: "' + this.activeTagFilter + '"', 'info');
          this.$nextTick(function() {
            if (typeof lucide !== 'undefined' && lucide.createIcons) {
              lucide.createIcons();
            }
          });
        },

        clearTagFilter: function() {
          this.activeTagFilter = '';
          this.showToast('Cleared tag filter', 'info');
          this.$nextTick(function() {
            if (typeof lucide !== 'undefined' && lucide.createIcons) {
              lucide.createIcons();
            }
          });
        },

        setMatrixSubFilter: function(sub) {
          this.matrixSubFilter = sub;
          this.annotationSubFilter = sub;
          this.displayLimits.matrix = 50;
          this.selectedMatrixItem = null;
          var entities = this.getMatrixEntities();
          if (entities && entities.length > 0) {
            this.selectedMatrixItem = entities[0];
          }
          this.$nextTick(function() {
            if (typeof lucide !== 'undefined' && lucide.createIcons) {
              lucide.createIcons();
            }
          });
        },

        selectMatrixItem: function(item) {
          this.selectedMatrixItem = item;
          this.$nextTick(function() {
            if (typeof lucide !== 'undefined' && lucide.createIcons) {
              lucide.createIcons();
            }
          });
        },

        isMatrixItemSelected: function(item) {
          if (!this.selectedMatrixItem || !item) return false;
          var sub = this.matrixSubFilter;
          if (sub === 'pairs') {
            return (item.pair || item.label) === (this.selectedMatrixItem.pair || this.selectedMatrixItem.label);
          }
          if (sub === 'triplets') {
            return (item.triplet || item.label) === (this.selectedMatrixItem.triplet || this.selectedMatrixItem.label);
          }
          if (sub === 'single') {
            return (item.norm || item.display || item.label) === (this.selectedMatrixItem.norm || this.selectedMatrixItem.display || this.selectedMatrixItem.label);
          }
          if (sub === 'capsules') {
            return (item.id && item.id === this.selectedMatrixItem.id) || (item.display_label === this.selectedMatrixItem.display_label);
          }
          if (sub === 'colors') {
            return (item.color || item.dominant_color) === (this.selectedMatrixItem.color || this.selectedMatrixItem.dominant_color);
          }
          if (sub === 'domains') {
            return (item.domain || item.label) === (this.selectedMatrixItem.domain || this.selectedMatrixItem.label);
          }
          return false;
        },

        getMatrixItemTag: function(item) {
          if (!item) return '';
          return item.domain || item.display_label || item.term || item.display || item.norm || item.label || item.pair || item.triplet || item.color || '';
        },

        setCreatorSubFilter: function(sub) {
          this.creatorSubFilter = sub;
          this.displayLimits.creators = 50;
          this.$nextTick(function() {
            if (typeof lucide !== 'undefined' && lucide.createIcons) {
              lucide.createIcons();
            }
          });
        },

        toggleSidebar: function() {
          this.isSidebarCollapsed = !this.isSidebarCollapsed;
          try {
            localStorage.setItem('pae_sidebar_collapsed', String(this.isSidebarCollapsed));
          } catch (_) {}
          this.$nextTick(function() {
            if (typeof lucide !== 'undefined' && lucide.createIcons) {
              lucide.createIcons();
            }
          });
        },

        toggleTheme: function() {
          this.isDark = !this.isDark;
          this.darkMode = this.isDark;
          try {
            localStorage.setItem('pa_theme', this.isDark ? 'dark' : 'light');
          } catch (_) {}
          if (this.isDark) {
            document.documentElement.classList.add('dark');
          } else {
            document.documentElement.classList.remove('dark');
          }
        },

        showToast: function(message, type) {
          type = type || 'info';
          var id = Date.now() + Math.random();
          this.toasts.push({ id: id, message: message, type: type });
          var self = this;
          setTimeout(function() {
            self.removeToast(id);
          }, 3500);
        },

        removeToast: function(id) {
          this.toasts = this.toasts.filter(function(t) { return t.id !== id; });
        },

        getKeywordUrl: function(kwTextOrSlug, kwId) {
          if (kwTextOrSlug && typeof kwTextOrSlug === 'string' && kwTextOrSlug.trim()) {
            var slug = kwTextOrSlug.trim().toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-+|-+$/g, '');
            if (slug) return '/keywords/' + encodeURIComponent(slug);
          }
          if (kwId) {
            return '/keywords/' + encodeURIComponent(String(kwId));
          }
          return '/keywords';
        },

        setWindow: function(win) {
          this.selectedWindow = win;
          this.fetchPulseData(false);
        },

        refreshPulse: function(force) {
          this.fetchPulseData(Boolean(force));
        },

        fetchPulseData: async function(forceRefresh) {
          var seq = ++this._pulseReqSeq;
          this.isLoading = true;
          if (forceRefresh) this.isRefreshing = true;

          try {
            var params = new URLSearchParams();
            if (this.scopedFolderId) params.set('folder_id', this.scopedFolderId);
            params.set('window', this.selectedWindow || '24h');
            if (forceRefresh) params.set('force', 'true');

            var url = '/api/pulse/24h?' + params.toString();
            var res = await window.apiFetch(url, {
              headers: { 'Accept': 'application/json' },
              retries: 1,
              retryDelay: 1200
            });

            if (seq !== this._pulseReqSeq) return; // Discard stale race responses

            if (!res.ok) {
              var errData = null;
              try { errData = await res.json(); } catch (_) {}
              var msg = (errData && errData.message) ? errData.message : ('Server returned HTTP ' + res.status);
              throw new Error(msg);
            }

            var data = await res.json();
            if (seq !== this._pulseReqSeq) return;
            if (data && data.success === false) {
              throw new Error(data.message || data.error || 'Pulse telemetry request failed');
            }

            this.kpis = data.kpis || {};
            this.breakout_pins = {
              top_breakouts: Array.isArray(data.breakout_pins) ? data.breakout_pins : (data.breakout_pins?.top_breakouts || []),
              fresh_rockets: Array.isArray(data.fresh_rocket_pins) ? data.fresh_rocket_pins : (data.breakout_pins?.fresh_rockets || []),
              vault_surge_pins: Array.isArray(data.vault_surge_pins) ? data.vault_surge_pins : (data.breakout_pins?.vault_surge_pins || []),
              pinarchive_winners: Array.isArray(data.pinarchive_winners) ? data.pinarchive_winners : (data.breakout_pins?.pinarchive_winners || [])
            };
            this.annotation_crossovers = data.annotation_crossovers || {};
            this.guided_capsule_crossovers = data.guided_capsule_crossovers || [];
            this.creator_breakouts = data.creator_breakouts || [];
            this.keyword_vacuums_and_bridges = data.keyword_vacuums_and_bridges || {};
            this.hidden_gems_telemetry = data.hidden_gems_telemetry || {};

            // Sync selectedMatrixItem with fresh payload entities
            var entities = this.getMatrixEntities();
            if (entities && entities.length > 0) {
              var currentLabel = this.selectedMatrixItem ? this.getMatrixItemTag(this.selectedMatrixItem) : '';
              var matchedEntity = currentLabel
                ? entities.find(function(e) { return (e.display_label || e.term || e.display || e.norm || e.label || e.pair || e.triplet || e.color || '') === currentLabel; })
                : null;
              this.selectedMatrixItem = matchedEntity || entities[0];
            } else {
              this.selectedMatrixItem = null;
            }

            if (forceRefresh) {
              this.showToast('24h Pulse telemetry refreshed cleanly!', 'success');
            }
          } catch (err) {
            if (seq === this._pulseReqSeq) {
              console.error('Pulse fetch error:', err);
              this.showToast('Failed to load Pulse data: ' + (err.message || 'Network error'), 'error');
            }
          } finally {
            if (seq === this._pulseReqSeq) {
              this.isLoading = false;
              this.isRefreshing = false;
              this.$nextTick(function() {
                if (typeof lucide !== 'undefined' && lucide.createIcons) {
                  lucide.createIcons();
                }
              });
            }
          }
        },

        getFilteredRadarPins: function() {
          var list = (this.breakout_pins.top_breakouts && this.breakout_pins.top_breakouts.length)
            ? this.breakout_pins.top_breakouts.slice()
            : [];

          // Fallback if top_breakouts is empty: pool from other breakout lists
          if (!list.length) {
            var seen = new Set();
            var pools = [
              this.breakout_pins.fresh_rockets,
              this.breakout_pins.vault_surge_pins,
              this.breakout_pins.pinarchive_winners
            ];
            for (var pidx = 0; pidx < pools.length; pidx++) {
              var pool = pools[pidx] || [];
              for (var j = 0; j < pool.length; j++) {
                var pin = pool[j];
                if (pin && pin.pin_id && !seen.has(pin.pin_id)) {
                  seen.add(pin.pin_id);
                  list.push(pin);
                }
              }
            }

            // Filter out unhydrated skeleton pins lacking both image and valid title
            list = list.filter(function(p) {
              return !(!p.image_url && (!p.title || p.title === 'Untitled Pin'));
            });
          }

          // 1. Radar Filter Pills — Merge dedicated backend pools with any matching pins in top_breakouts (deduplicated by pin_id)
          var rf = this.radarFilter;
          var mergeUnique = function(primaryPool, secondaryMatched) {
            var merged = [];
            var seenIds = new Set();
            var a = primaryPool || [];
            var b = secondaryMatched || [];
            for (var i = 0; i < a.length; i++) {
              if (a[i] && a[i].pin_id && !seenIds.has(a[i].pin_id)) {
                seenIds.add(a[i].pin_id);
                merged.push(a[i]);
              }
            }
            for (var k = 0; k < b.length; k++) {
              if (b[k] && b[k].pin_id && !seenIds.has(b[k].pin_id)) {
                seenIds.add(b[k].pin_id);
                merged.push(b[k]);
              }
            }
            return merged;
          };
          if (rf === 'fresh') {
            var matchedFresh = list.filter(function(p) {
              return Boolean(p.is_fresh_14d || p.is_fresh_breakout || (p.pin_age_days !== null && p.pin_age_days !== undefined && p.pin_age_days !== '' && Number(p.pin_age_days) >= 0 && Number(p.pin_age_days) <= 14));
            });
            list = mergeUnique(this.breakout_pins.fresh_rockets, matchedFresh);
          } else if (rf === 'bridges') {
            var matchedBridges = list.filter(function(p) {
              return Boolean((p.overlap_count > 1) || (p.keywords && p.keywords.length > 1) || (p.keyword_count > 1));
            });
            list = mergeUnique(this.keyword_vacuums_and_bridges.bridge_pins, matchedBridges);
          } else if (rf === 'domainless') {
            var matchedDomainless = list.filter(function(p) {
              return !p.domain || p.domain === 'Uploaded by user' || p.domain.includes('pinterest.') || !p.destination_url;
            });
            list = mergeUnique(this.hidden_gems_telemetry.domainless_viral_pins, matchedDomainless);
          } else if (rf === 'vault') {
            var matchedVault = list.filter(function(p) { return Boolean(p.is_vault_surge || p.is_displaced); });
            list = mergeUnique(this.breakout_pins.vault_surge_pins, matchedVault);
          }

          // 2. Active Tag Filter (Clickable Tag Banner)
          if (this.activeTagFilter) {
            var tagQuery = this.activeTagFilter.toLowerCase();
            list = list.filter(function(p) {
              var tags = (p.visual_annotations || p.annotations || []).map(function(t) {
                return (typeof t === 'string' ? t : (t.norm || t.display || t.tag || '')).toLowerCase();
              });
              var text = ((p.title || '') + ' ' + (p.keyword_text || '') + ' ' + (p.domain || '')).toLowerCase();
              return tags.some(function(t) { return t.includes(tagQuery) || tagQuery.includes(t); }) || text.includes(tagQuery);
            });
          }

          // 3. Search Query Filter
          var q = (this.searchQuery || '').trim().toLowerCase();
          if (q) {
            list = list.filter(function(p) {
              var tags = (p.visual_annotations || p.annotations || []).map(function(t) {
                return (typeof t === 'string' ? t : (t.norm || t.display || t.tag || '')).toLowerCase();
              });
              return (p.title || '').toLowerCase().includes(q) ||
                     (p.domain || '').toLowerCase().includes(q) ||
                     (p.creator_username || '').toLowerCase().includes(q) ||
                     (p.keyword_text || '').toLowerCase().includes(q) ||
                     tags.some(function(t) { return t.includes(q); });
            });
          }

          // Sort by effective momentum descending (prioritizing hydrated pins with images)
          list.sort(function(a, b) {
            var aHyd = Boolean(a.image_url && a.title && a.title !== 'Untitled Pin');
            var bHyd = Boolean(b.image_url && b.title && b.title !== 'Untitled Pin');
            if (aHyd !== bHyd) return aHyd ? -1 : 1;

            var gainA = Math.max(Number(a.daily_save_velocity) || 0, Number(a.delta_saves_24h) || 0, Number(a.delta_repins_24h) || 0);
            var gainB = Math.max(Number(b.daily_save_velocity) || 0, Number(b.delta_saves_24h) || 0, Number(b.delta_repins_24h) || 0);
            return gainB - gainA;
          });

          return list;
        },

        getMatrixEntities: function() {
          var sub = this.matrixSubFilter;
          var list = [];
          if (sub === 'pairs') {
            list = (this.annotation_crossovers.pair_crossovers || []).filter(function(item) {
              var cnt = Number(item.pin_count || item.count || item.frequency || 0);
              return cnt >= 2;
            });
          } else if (sub === 'triplets') {
            list = (this.annotation_crossovers.triplet_crossovers || []).filter(function(item) {
              var cnt = Number(item.pin_count || item.count || item.frequency || 0);
              return cnt >= 2;
            });
          } else if (sub === 'single') {
            list = this.annotation_crossovers.single_annotations || [];
          } else if (sub === 'capsules') {
            list = this.guided_capsule_crossovers || [];
          } else if (sub === 'colors') {
            list = this.hidden_gems_telemetry.dominant_color_palette || [];
          } else if (sub === 'domains') {
            list = this.hidden_gems_telemetry.top_arbitrage_domains || [];
          }

          var q = (this.searchQuery || '').trim().toLowerCase();
          if (q) {
            list = list.filter(function(item) {
              var label = String(item.domain || item.label || item.pair || item.triplet || item.display || item.display_label || item.term || item.color || item.dominant_color || '').toLowerCase();
              return label.includes(q);
            });
          }

          return list;
        },

        // Helper: Color Swatch Count Resolver (satisfies col.pin_count || col.count parity)
        getColorCount: function(col) {
          if (!col) return 0;
          return col.pin_count || col.count || col.frequency || 0;
        },

        getSelectedMatrixPins: function() {
          var item = this.selectedMatrixItem;
          if (!item) {
            var entities = this.getMatrixEntities();
            if (entities && entities.length > 0) {
              item = entities[0];
            }
          }
          if (!item) return [];

          // Priority 1: Use backend matching_pins if populated
          if (Array.isArray(item.matching_pins) && item.matching_pins.length > 0) {
            return item.matching_pins.filter(function(p) { return Boolean(p && p.image_url); });
          }

          // Priority 2: In-memory client fallback scanning breakout_pins
          var allPins = [];
          var seenIds = new Set();
          var pools = [
            this.breakout_pins.top_breakouts,
            this.breakout_pins.fresh_rockets,
            this.breakout_pins.vault_surge_pins,
            this.breakout_pins.pinarchive_winners
          ];
          for (var i = 0; i < pools.length; i++) {
            var pool = pools[i] || [];
            for (var j = 0; j < pool.length; j++) {
              var p = pool[j];
              if (p && p.pin_id && !seenIds.has(p.pin_id)) {
                seenIds.add(p.pin_id);
                allPins.push(p);
              }
            }
          }

          var sub = this.matrixSubFilter;
          var matched = [];

          if (sub === 'pairs') {
            var pairStr = String(item.pair || item.label || item.display || '').toLowerCase();
            var pairTags = pairStr.split(/[+,/]/).map(function(s) { return s.trim(); }).filter(Boolean);
            matched = allPins.filter(function(p) {
              var pinTags = (p.visual_annotations || p.annotations || []).map(function(t) {
                return (typeof t === 'string' ? t : (t.norm || t.display || t.tag || '')).toLowerCase();
              });
              var pinText = ((p.title || '') + ' ' + (p.keyword_text || '')).toLowerCase();
              return pairTags.every(function(tag) {
                return pinTags.some(function(pt) { return pt.includes(tag) || tag.includes(pt); }) || pinText.includes(tag);
              });
            });
          } else if (sub === 'triplets') {
            var tripStr = String(item.triplet || item.label || item.display || '').toLowerCase();
            var tripTags = tripStr.split(/[+,/]/).map(function(s) { return s.trim(); }).filter(Boolean);
            matched = allPins.filter(function(p) {
              var pinTags = (p.visual_annotations || p.annotations || []).map(function(t) {
                return (typeof t === 'string' ? t : (t.norm || t.display || t.tag || '')).toLowerCase();
              });
              var pinText = ((p.title || '') + ' ' + (p.keyword_text || '')).toLowerCase();
              return tripTags.every(function(tag) {
                return pinTags.some(function(pt) { return pt.includes(tag) || tag.includes(pt); }) || pinText.includes(tag);
              });
            });
          } else if (sub === 'single') {
            var targetTag = String(item.norm || item.label || item.display || item.tag || '').toLowerCase();
            matched = allPins.filter(function(p) {
              var pinTags = (p.visual_annotations || p.annotations || []).map(function(t) {
                return (typeof t === 'string' ? t : (t.norm || t.display || t.tag || '')).toLowerCase();
              });
              var pinText = ((p.title || '') + ' ' + (p.keyword_text || '')).toLowerCase();
              return pinTags.some(function(pt) { return pt.includes(targetTag) || targetTag.includes(pt); }) || pinText.includes(targetTag);
            });
          } else if (sub === 'capsules') {
            var capTerm = String(item.term || item.display_label || '').toLowerCase();
            matched = allPins.filter(function(p) {
              var pinTags = (p.visual_annotations || p.annotations || []).map(function(t) {
                return (typeof t === 'string' ? t : (t.norm || t.display || t.tag || '')).toLowerCase();
              });
              var pinText = ((p.title || '') + ' ' + (p.keyword_text || '')).toLowerCase();
              return pinTags.some(function(pt) { return pt.includes(capTerm); }) || pinText.includes(capTerm);
            });
          } else if (sub === 'colors') {
            var targetColor = String(item.color || item.dominant_color || '').toLowerCase();
            matched = allPins.filter(function(p) {
              return Boolean(p.image_url) && (p.dominant_color || '').toLowerCase() === targetColor;
            });
          } else if (sub === 'domains') {
            var targetDomain = String(item.domain || item.label || '').toLowerCase();
            matched = allPins.filter(function(p) {
              return Boolean(p.image_url) && (p.domain || '').toLowerCase() === targetDomain;
            });
          }

          // Sort matched pins by 24h momentum descending
          matched.sort(function(a, b) {
            var gainA = Math.max(Number(a.daily_save_velocity) || 0, Number(a.delta_saves_24h) || 0, Number(a.delta_repins_24h) || 0);
            var gainB = Math.max(Number(b.daily_save_velocity) || 0, Number(b.delta_saves_24h) || 0, Number(b.delta_repins_24h) || 0);
            return gainB - gainA;
          });

          return matched.slice(0, 12);
        },

        getFilteredCreators: function() {
          var list = this.creator_breakouts || [];
          // Filter for positive growth only
          list = list.filter(function(c) {
            return (Number(c.effective_delta_reach_24h) > 0 ||
                    Number(c.effective_delta_views_24h) > 0 ||
                    Number(c.delta_reach_24h) > 0 ||
                    Number(c.delta_views_24h) > 0 ||
                    Number(c.max_pin_velocity) > 0);
          });

          if (this.creatorSubFilter === 'david') {
            list = list.filter(function(c) {
              return Boolean(c.is_david_breakout || c.is_david_account || (Number(c.total_pins || 0) <= 250 && Number(c.monthly_reach || 0) <= 500000 && (Number(c.effective_delta_reach_24h || 0) > 0 || Number(c.delta_reach_24h || 0) > 0)));
            });
          }

          var q = (this.searchQuery || '').trim().toLowerCase();
          if (q) {
            list = list.filter(function(c) {
              return (c.username || '').toLowerCase().includes(q) ||
                     (c.display_name || '').toLowerCase().includes(q);
            });
          }

          return list;
        },

        getDomainlessViralPins: function() {
          var list = [];
          var seen = new Set();
          var candidates = (this.hidden_gems_telemetry.domainless_viral_pins || [])
            .concat(this.hidden_gems_telemetry.vacuum_hijack_pins || [])
            .concat(this.breakout_pins.top_breakouts || []);
          for (var i = 0; i < candidates.length; i++) {
            var p = candidates[i];
            if (p && p.pin_id && !seen.has(p.pin_id)) {
              seen.add(p.pin_id);
              var isDomainless = Boolean(p.is_domainless_viral || (!p.domain || p.domain === 'Uploaded by user' || p.domain.includes('pinterest.') || !p.destination_url));
              if (isDomainless) {
                list.push(p);
              }
            }
          }

          var q = (this.searchQuery || '').trim().toLowerCase();
          if (q) {
            list = list.filter(function(p) {
              return (p.title || '').toLowerCase().includes(q) || (p.creator_username || '').toLowerCase().includes(q);
            });
          }

          list.sort(function(a, b) {
            var gainA = Number(a.effective_24h_gain || a.daily_save_velocity || a.delta_saves_24h || 0);
            var gainB = Number(b.effective_24h_gain || b.daily_save_velocity || b.delta_saves_24h || 0);
            if (gainB !== gainA) return gainB - gainA;
            return (Number(b.save_count) || 0) - (Number(a.save_count) || 0);
          });

          return list.slice(0, 50);
        },

        getKeywordVacuums: function() {
          var list = this.keyword_vacuums_and_bridges.keyword_vacuum_opportunities || [];
          var q = (this.searchQuery || '').trim().toLowerCase();
          if (q) {
            list = list.filter(function(v) {
              return (v.keyword_text || v.keyword || '').toLowerCase().includes(q);
            });
          }
          return list.slice(0, 50);
        },

        // Backward compatibility helpers
        getFilteredBreakouts: function() {
          return this.getFilteredRadarPins();
        },

        getFilteredAnnotations: function() {
          return this.getMatrixEntities();
        },

        getFilteredCapsules: function() {
          var list = this.guided_capsule_crossovers || [];
          var q = (this.searchQuery || '').trim().toLowerCase();
          if (!q) return list;
          return list.filter(function(c) {
            return (c.display_label || '').toLowerCase().includes(q) ||
                   (c.term || '').toLowerCase().includes(q) ||
                   (c.keyword_text || '').toLowerCase().includes(q);
          });
        },

        openBlueprintModal: function(pin) {
          if (!pin) return;
          this.activeBlueprintPin = Object.assign({}, pin);
          this.blueprintCopied = false;
          this.promptCopied = false;
          this.isBlueprintModalOpen = true;
          this.isDossierHydrating = true;

          var self = this;
          var targetPinId = pin.pin_id;

          // Non-blocking live /api/pins/:id hydration
          window.apiFetch('/api/pins/' + encodeURIComponent(targetPinId), {
            headers: { 'Accept': 'application/json' },
            timeout: 8000
          })
          .then(function(res) { return res.ok ? res.json() : null; })
          .then(function(data) {
            if (data && self.activeBlueprintPin && self.activeBlueprintPin.pin_id === targetPinId) {
              var c = data.creative || data.pin || data;
              var creatorCtx = data.pillar_1_creator_context || {};
              var kwCtx = data.pillar_2_keywords_context || {};
              var algoCtx = data.algorithmic_intelligence || {};

              var desc = c.description || algoCtx.seo_description || '';
              if (desc && !self.activeBlueprintPin.description) {
                self.activeBlueprintPin.description = desc;
              }
              var alt = c.alt_text || '';
              if (alt && !self.activeBlueprintPin.alt_text) {
                self.activeBlueprintPin.alt_text = alt;
              }
              var board = creatorCtx.board_name || c.board_name || '';
              if (board && (!self.activeBlueprintPin.board_name || self.activeBlueprintPin.board_name === 'General Inspiration')) {
                self.activeBlueprintPin.board_name = board;
              }
              var annotations = (c.visual_annotations && c.visual_annotations.length)
                ? c.visual_annotations
                : (c.annotations && c.annotations.length ? c.annotations : null);
              if (annotations && (!self.activeBlueprintPin.visual_annotations || !self.activeBlueprintPin.visual_annotations.length)) {
                self.activeBlueprintPin.visual_annotations = annotations;
                self.activeBlueprintPin.annotations = annotations;
              }
              if (c.title && (!self.activeBlueprintPin.title || self.activeBlueprintPin.title === 'Untitled Pin')) {
                self.activeBlueprintPin.title = c.title;
              }
              if (c.image_url && !self.activeBlueprintPin.image_url) {
                self.activeBlueprintPin.image_url = c.image_url;
              }
              if (c.destination_url && !self.activeBlueprintPin.destination_url) {
                self.activeBlueprintPin.destination_url = c.destination_url;
              }
              if (c.domain && (!self.activeBlueprintPin.domain || self.activeBlueprintPin.domain === 'pinterest.com')) {
                self.activeBlueprintPin.domain = c.domain;
              }
              if (Array.isArray(kwCtx.ranking_keywords) && kwCtx.ranking_keywords.length > 0) {
                if (!self.activeBlueprintPin.keywords || self.activeBlueprintPin.keywords.length <= 1) {
                  self.activeBlueprintPin.keywords = kwCtx.ranking_keywords.map(function(rk) {
                    return {
                      keyword_id: rk.keyword_id,
                      keyword: rk.keyword,
                      keyword_text: rk.keyword,
                      rank: rk.rank || rk.rank_position || rk.last_known_rank || 1,
                      folder_name: rk.folder_name || 'Global'
                    };
                  });
                }
              }
            }
          })
          .catch(function(err) {
            console.warn('[Pulse UI] Non-blocking dossier hydration skipped:', err);
          })
          .finally(function() {
            if (self.activeBlueprintPin && self.activeBlueprintPin.pin_id === targetPinId) {
              self.isDossierHydrating = false;
              self.$nextTick(function() {
                if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
              });
            }
          });

          this.$nextTick(function() {
            if (typeof lucide !== 'undefined' && lucide.createIcons) {
              lucide.createIcons();
            }
          });
        },

        closeBlueprintModal: function() {
          this.isBlueprintModalOpen = false;
          this.activeBlueprintPin = null;
          this.isDossierHydrating = false;
        },

        isAggregatedClusterPin: function(pin) {
          if (!pin || typeof pin !== 'object') return false;
          if (pin.is_aggregated_cluster === true) return true;
          var vel = Number(pin.daily_save_velocity != null ? pin.daily_save_velocity : (pin.delta_saves_24h || 0));
          if (!isFinite(vel) || vel < 50) return false;
          var deltaRepins = Math.max(0, Number(pin.delta_repins_24h || 0) || 0);
          if ((deltaRepins / vel) >= 0.10) return false;
          var rawSaveCount = (pin.save_count !== undefined && pin.save_count !== null && pin.save_count !== '')
            ? pin.save_count
            : pin.saves;
          var saveCount = Number(rawSaveCount || 0);
          if (!isFinite(saveCount) || saveCount <= 0) return false;
          var rawRepinCount = (pin.repin_count !== undefined && pin.repin_count !== null && pin.repin_count !== '')
            ? pin.repin_count
            : pin.repins;
          if (rawRepinCount === null || rawRepinCount === undefined || rawRepinCount === '') return false;
          var repinCount = Number(rawRepinCount);
          if (!isFinite(repinCount) || repinCount < 0) return false;
          return (repinCount / saveCount) < 0.25;
        },

        copyText: async function(text, label) {
          if (!text) return;
          try {
            if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
              await navigator.clipboard.writeText(text);
              this.showToast((label || 'Text') + ' copied to clipboard!', 'success');
            } else {
              this.showToast('Clipboard access not available', 'warning');
            }
          } catch (e) {
            this.showToast('Failed to copy to clipboard', 'error');
          }
        },

        copyAiPrompt: async function(p) {
          var prompt = this.generateAiPrompt(p);
          if (!prompt) return;
          try {
            if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
              await navigator.clipboard.writeText(prompt);
              this.promptCopied = true;
              this.showToast('AI Visual Generation Prompt copied!', 'success');
            } else {
              this.showToast('Clipboard access not available', 'warning');
            }
          } catch (e) {
            this.showToast('Failed to copy prompt', 'error');
          }
        },

        copyBlueprintMarkdown: async function() {
          var p = this.activeBlueprintPin;
          if (!p) return;

          var tags = (p.visual_annotations || p.annotations || []);
          var tagLines = tags.length
            ? tags.map(function(a) { return '- ' + (a.display || a.norm || a); }).join('\\n')
            : '- Standard extraction';

          var md = [
            '# PAE SCIENTIFIC PIN BLUEPRINT: ' + (p.title || 'Untitled'),
            '**Pin ID:** ' + (p.pin_id || 'N/A'),
            '**Target Board:** ' + (p.board_name || 'General Inspiration'),
            '**Dominant Color:** ' + (p.dominant_color || '#888888'),
            '**Arbitrage Domain:** ' + (p.domain || 'N/A'),
            '**Destination URL:** ' + (p.destination_url || 'N/A'),
            '**Pin Age:** ' + (p.pin_age_days != null ? p.pin_age_days + 'd' : 'N/A'),
            '**Daily Save Velocity:** ' + (p.daily_save_velocity || 0),
            '**24h Repins Delta:** ' + (p.delta_repins_24h || 0),
            '',
            '---',
            '',
            '## 1. PinText Semantic Architecture',
            '- **Title Formula:** ' + (p.title || 'Untitled'),
            '- **Creation Method:** ' + (p.creation_method || 'pinterest_platform'),
            '- **Dominant Color Centroid:** ' + (p.dominant_color || '#888888'),
            '',
            '---',
            '',
            '## 2. Visual Annotations (Co-Occurrence Tags)',
            tagLines,
            '',
            '---',
            '',
            '## 3. 5-Source Search Relevance Integrity',
            '- **Source 1 (Title):** ' + (p.title ? '100% Present' : 'Missing'),
            '- **Source 2 (Description):** ' + (p.description ? 'Enriched from Unified PostgreSQL' : 'Pending Deep Hydration'),
            '- **Source 3 (Visual Annotations):** ' + (tags.length ? tags.length + ' Tags Detected' : 'Standard Crawl Extraction'),
            '- **Source 4 (Board Placement):** ' + (p.board_name || 'Curated Board'),
            '- **Source 5 (Destination URL):** ' + (p.destination_url ? 'Outbound Verified' : 'Uploaded (Vacuum Target)'),
            '',
            '---',
            '',
            '## 4. AI Visual Generation Prompt (Midjourney / Ideogram)',
            String.fromCharCode(96, 96, 96),
            this.generateAiPrompt(p),
            String.fromCharCode(96, 96, 96),
            '',
            '*Generated by Pin Arbitrage Engine (PAE) 24h Algorithmic Pulse Studio*'
          ].join('\\n');

          try {
            if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
              await navigator.clipboard.writeText(md);
              this.blueprintCopied = true;
              this.showToast('Scientific Pin Blueprint copied to clipboard!', 'success');
            } else {
              this.showToast('Clipboard access not available', 'warning');
            }
          } catch (e) {
            this.showToast('Failed to copy to clipboard', 'error');
          }
        },

        generateAiPrompt: function(p) {
          if (!p) return '';
          var title = p.title || 'Pinterest viral aesthetic';
          var tags = (p.visual_annotations || p.annotations || []).map(function(t) { return t.display || t.norm || t; }).slice(0, 5).join(', ');
          var color = p.dominant_color || '#E11D48';
          var board = p.board_name || 'Lifestyle Inspiration';
          return '/imagine prompt: High-converting editorial Pinterest pin photography for "' + title + '", featuring ' + (tags || title) + ', cinematic lighting, authentic styling, curated for "' + board + '", color harmony inspired by hex ' + color + ', ultra-detailed, professional food and lifestyle photography, clean composition, high depth of field --ar 2:3 --v 6.0 --style raw';
        },

        generateRecommendedAltText: function(p) {
          if (!p) return '';
          var title = p.title || 'Pinterest pin';
          var tags = (p.visual_annotations || p.annotations || []).map(function(t) { return t.display || t.norm || t; }).slice(0, 3).join(' and ');
          var board = p.board_name ? ' on ' + p.board_name : '';
          return 'Close-up editorial photo of ' + title + (tags ? ', highlighting ' + tags : '') + board + ' - Pinterest viral trending idea';
        },

        formatNumber: function(val) {
          if (typeof window !== 'undefined' && window.PAEFormatters && typeof window.PAEFormatters.formatNumber === 'function') {
            return window.PAEFormatters.formatNumber(val);
          }
          // @deprecated VM fallback when shared-head formatters are absent
          var num = Number(val || 0);
          if (!isFinite(num)) return '0';
          return num.toLocaleString();
        },

        formatVelocity: function(vel) {
          var num = Number(vel || 0);
          if (!isFinite(num) || num <= 0) return '0/d';
          if (num >= 100) return Math.round(num).toLocaleString() + '/d';
          return num.toFixed(1) + '/d';
        },

        // Rule 31 Universal Strict Time Formatting Rule
        formatAge: function(days) {
          if (typeof window !== 'undefined' && window.PAEFormatters && typeof window.PAEFormatters.formatAge === 'function') {
            return window.PAEFormatters.formatAge(days);
          }
          // @deprecated VM fallback when shared-head formatters are absent
          var num = Number(days || 0);
          if (!isFinite(num) || num < 0) return '0d';
          if (num >= 365) {
            return (num / 365.25).toFixed(1) + 'y';
          }
          return Math.round(num) + 'd';
        },

        safeUrl: function(url) {
          if (typeof window !== 'undefined' && window.PAEFormatters && typeof window.PAEFormatters.safeUrl === 'function') {
            return window.PAEFormatters.safeUrl(url);
          }
          // @deprecated VM fallback when shared-head formatters are absent
          if (!url) return '#';
          var s = String(url).trim();
          if (/^https?:\\/\\//i.test(s) || (s.startsWith('/') && !s.startsWith('//'))) return s;
          return '#';
        },

        safeColor: function(color, fallback) {
          fallback = fallback || '#cbd5e1';
          if (typeof window !== 'undefined' && window.PAEFormatters && typeof window.PAEFormatters.safeColor === 'function') {
            return window.PAEFormatters.safeColor(color, fallback);
          }
          // @deprecated VM fallback when shared-head formatters are absent
          if (!color) return fallback;
          var s = String(color).trim();
          return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(s) ? s : fallback;
        }
      };
    }
  </script>`;
}

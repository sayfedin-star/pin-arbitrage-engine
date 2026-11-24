/**
 * src/ui/command-palette-client-app.mjs
 *
 * Leaf client-script provider for the Global Command Palette (⌘K / ⌘F)
 * and App Sidebar Lucide/Ctrl+B bootstrapper. Zero imports to keep the
 * src/ui/ module graph strictly acyclic.
 */

export function getAppSidebarClientScriptCode() {
  return `
  <script>
    (function() {
      var STATIC_STUDIO_ITEMS = [
        { groupKey: 'exec', groupTitle: 'Core Workspaces', uid: 'static-radar', kind: 'static', title: 'Radar', metric: '/radar', badgeClass: 'text-rose-500 font-semibold', iconGlyph: 'R', iconClass: 'bg-rose-500/10 text-rose-500 border border-rose-500/20', url: '/radar' },
        { groupKey: 'exec', groupTitle: 'Core Workspaces', uid: 'static-discover', kind: 'static', title: 'Discover', metric: '/discover', badgeClass: 'text-rose-600 dark:text-rose-400 font-semibold', iconGlyph: 'D', iconClass: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20', url: '/discover' },
        { groupKey: 'exec', groupTitle: 'Core Workspaces', uid: 'static-campaigns', kind: 'static', title: 'Campaigns', metric: '/campaigns', iconGlyph: 'C', iconClass: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20', url: '/campaigns' },
        { groupKey: 'exec', groupTitle: 'Core Workspaces', uid: 'static-watchlist', kind: 'static', title: 'Watchlist', metric: '/watchlist', iconGlyph: 'W', iconClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20', url: '/watchlist' },
        { groupKey: 'exec', groupTitle: 'Core Workspaces', uid: 'static-settings', kind: 'static', title: 'Settings', metric: '/settings', iconGlyph: 'S', iconClass: 'bg-slate-100 dark:bg-[#18181B] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-[#27272A]', url: '/settings' },
        { groupKey: 'intel', groupTitle: 'Deep Studios', uid: 'static-accounts', kind: 'static', title: 'Creator Hub Ledger', metric: '/accounts', iconGlyph: '@', iconClass: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20', url: '/accounts' },
        { groupKey: 'intel', groupTitle: 'Deep Studios', uid: 'static-keywords', kind: 'static', title: 'Keywords SERP Fleet', metric: '/keywords', iconGlyph: 'K', iconClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20', url: '/keywords' },
        { groupKey: 'intel', groupTitle: 'Deep Studios', uid: 'static-domains', kind: 'static', title: 'Domain Radar', metric: '/domains', iconGlyph: 'G', iconClass: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20', url: '/domains' },
        { groupKey: 'intel', groupTitle: 'Deep Studios', uid: 'static-related', kind: 'static', title: 'Related Pins Graph', metric: '/related-pins', iconGlyph: 'P', iconClass: 'bg-slate-100 dark:bg-[#18181B] text-slate-500 border border-slate-200 dark:border-[#27272A]', url: '/related-pins' }
      ];

      function formatCompactNum(val) {
        var n = Number(val || 0);
        if (!isFinite(n) || n <= 0) return '0';
        if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/[.]0$/, '') + 'M';
        if (n >= 1000) return (n / 1000).toFixed(1).replace(/[.]0$/, '') + 'K';
        return String(Math.round(n));
      }

      if (typeof window !== 'undefined' && typeof window.paeCommandPalette !== 'function') {
        window.paeCommandPalette = function() {
          return {
            isCommandOpen: false,
            cmdQuery: '',
            cmdLoading: false,
            cmdHasQueried: false,
            cmdError: '',
            cmdActiveIndex: 0,
            cmdResults: { keywords: [], creators: [], folders: [], domains: [] },
            _cmdTimer: null,
            _cmdAbort: null,
            _cmdSeq: 0,
            _cmdCache: new Map(),

            get cmdTrimmed() {
              return String(this.cmdQuery || '').trim();
            },

            get cmdTotalMatches() {
              var r = this.cmdResults || {};
              return (r.keywords ? r.keywords.length : 0) +
                (r.creators ? r.creators.length : 0) +
                (r.folders ? r.folders.length : 0) +
                (r.domains ? r.domains.length : 0);
            },

            cmdSafeUrl(url) {
              if (!url || typeof url !== 'string') return '#';
              var s = url.trim();
              if (s.startsWith('/') && !s.startsWith('//') && s.charCodeAt(1) !== 92) {
                return s;
              }
              return '#';
            },

            safeAvatarUrl(url) {
              if (!url || typeof url !== 'string') return '';
              var s = url.trim();
              if (/^https?:[/][/]/i.test(s)) return s;
              return '';
            },

            safeFolderColor(color) {
              if (!color || typeof color !== 'string') return '#6366f1';
              var s = color.trim();
              return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(s) ? s : '#6366f1';
            },

            get staticCmdSections() {
              var execItems = [];
              var intelItems = [];
              for (var i = 0; i < STATIC_STUDIO_ITEMS.length; i++) {
                var item = Object.assign({}, STATIC_STUDIO_ITEMS[i], { idx: i });
                if (item.groupKey === 'exec') execItems.push(item);
                else intelItems.push(item);
              }
              return [
                { key: 'exec', title: 'Executive Studios', items: execItems },
                { key: 'intel', title: 'Intelligence Fleet', items: intelItems }
              ];
            },

            get groupedCmdSections() {
              var q = this.cmdTrimmed;
              if (!q) return [];
              var idx = 0;
              var sections = [];
              var res = this.cmdResults || { keywords: [], creators: [], folders: [], domains: [] };

              // 1. Direct Smart Jump (Pin ID or Domain literal)
              var directItems = [];
              if (/^[0-9]{10,30}$/.test(q)) {
                directItems.push({
                  uid: 'direct-pin-' + q,
                  idx: idx++,
                  kind: 'action',
                  title: 'Inspect Pin #' + q,
                  subtitle: 'Open Pin Dossier Studio',
                  metric: 'Pin ID',
                  iconGlyph: '#',
                  iconClass: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30',
                  url: '/pin/' + encodeURIComponent(q)
                });
              } else if (q.indexOf('.') !== -1 && q.indexOf(' ') === -1) {
                var qLowerDom = q.toLowerCase().replace(/^https?:[/][/]/i, '').replace(/^www[.]/i, '').split('/')[0];
                var hasExactDom = (res.domains || []).some(function(d) { return String(d.domain || '').toLowerCase() === qLowerDom; });
                if (!hasExactDom && qLowerDom.indexOf('.') !== -1) {
                  directItems.push({
                    uid: 'direct-domain-' + qLowerDom,
                    idx: idx++,
                    kind: 'action',
                    title: 'Open Domain Dossier: ' + qLowerDom,
                    subtitle: 'Direct domain intelligence lookup',
                    metric: 'Domain',
                    iconGlyph: 'D',
                    iconClass: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30',
                    url: '/domains/' + encodeURIComponent(qLowerDom)
                  });
                }
              }
              if (directItems.length > 0) {
                sections.push({
                  key: 'direct',
                  title: 'Direct Jump',
                  badge: '',
                  headerClass: 'text-rose-600 dark:text-rose-400',
                  items: directItems
                });
              }

              // 2. Keywords
              if (Array.isArray(res.keywords) && res.keywords.length > 0) {
                var kwItems = res.keywords.map(function(k) {
                  var vel = Number(k.avg_daily_velocity || 0);
                  var pins = Number(k.active_pin_count || 0);
                  return {
                    uid: 'kw-' + k.id,
                    idx: idx++,
                    kind: 'keyword',
                    isActive: k.is_active !== false,
                    title: k.keyword,
                    subtitle: (k.category || 'General') + (vel > 0 ? (' · ' + vel.toFixed(0) + '/d vel') : ''),
                    metric: pins + ' pins',
                    iconGlyph: 'K',
                    iconClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
                    url: k.url
                  };
                });
                sections.push({
                  key: 'keywords',
                  title: 'Keywords',
                  badge: kwItems.length + ' match' + (kwItems.length === 1 ? '' : 'es'),
                  headerClass: 'text-emerald-600 dark:text-emerald-400',
                  items: kwItems
                });
              }

              // 3. Creators & Accounts
              if (Array.isArray(res.creators) && res.creators.length > 0) {
                var crItems = res.creators.map(function(c) {
                  var reach = Number(c.monthly_reach || 0);
                  return {
                    uid: 'cr-' + c.id,
                    idx: idx++,
                    kind: 'creator',
                    avatarUrl: c.avatar_url || '',
                    title: c.display_name || ('@' + c.username),
                    subtitle: '@' + c.username + (c.total_pins ? (' · ' + formatCompactNum(c.total_pins) + ' pins') : ''),
                    metric: reach > 0 ? (formatCompactNum(reach) + ' reach') : 'Creator',
                    iconGlyph: '@',
                    iconClass: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30',
                    url: c.url
                  };
                });
                sections.push({
                  key: 'creators',
                  title: 'Creators & Accounts',
                  badge: crItems.length + ' match' + (crItems.length === 1 ? '' : 'es'),
                  headerClass: 'text-purple-600 dark:text-purple-400',
                  items: crItems
                });
              }

              // 4. Campaign Folders
              if (Array.isArray(res.folders) && res.folders.length > 0) {
                var flItems = res.folders.map(function(f) {
                  return {
                    uid: 'fl-' + f.id,
                    idx: idx++,
                    kind: 'folder',
                    color: f.color || '#6366f1',
                    title: f.name,
                    subtitle: f.description || 'Campaign cluster workspace',
                    metric: (f.keyword_count || 0) + ' kw',
                    iconGlyph: 'F',
                    iconClass: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30',
                    url: f.url
                  };
                });
                sections.push({
                  key: 'folders',
                  title: 'Campaign Folders',
                  badge: flItems.length + ' match' + (flItems.length === 1 ? '' : 'es'),
                  headerClass: 'text-indigo-600 dark:text-indigo-400',
                  items: flItems
                });
              }

              // 5. Domains
              if (Array.isArray(res.domains) && res.domains.length > 0) {
                var domItems = res.domains.map(function(d) {
                  var adBadge = d.ad_network && d.ad_network !== 'unchecked' ? d.ad_network : '';
                  var ageText = d.age_years != null ? (Number(d.age_years).toFixed(1) + 'y') : '';
                  var subParts = [d.total_pins + ' pins'];
                  if (adBadge) subParts.push(adBadge);
                  if (ageText) subParts.push(ageText);
                  return {
                    uid: 'dom-' + d.domain,
                    idx: idx++,
                    kind: 'domain',
                    title: d.domain,
                    subtitle: subParts.join(' · '),
                    metric: formatCompactNum(d.total_saves) + ' saves',
                    iconGlyph: 'G',
                    iconClass: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30',
                    url: d.url
                  };
                });
                sections.push({
                  key: 'domains',
                  title: 'Domains',
                  badge: domItems.length + ' match' + (domItems.length === 1 ? '' : 'es'),
                  headerClass: 'text-sky-600 dark:text-sky-400',
                  items: domItems
                });
              }

              // 6. Search-in-Studio Fallbacks
              if (q.length >= 2) {
                var enc = encodeURIComponent(q);
                var encCreator = encodeURIComponent(q.replace(/^@+/, ''));
                sections.push({
                  key: 'fallbacks',
                  title: 'Filter In Studio',
                  badge: '',
                  headerClass: 'text-slate-400 dark:text-[#71717A]',
                  items: [
                    {
                      uid: 'fb-newborn',
                      idx: idx++,
                      kind: 'action',
                      title: 'Hunt or Filter Newborn Studio for "' + q + '"',
                      subtitle: '/newborn?search=' + enc,
                      metric: 'Newborn',
                      iconGlyph: 'N',
                      iconClass: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
                      url: '/newborn?search=' + enc
                    },
                    {
                      uid: 'fb-keywords',
                      idx: idx++,
                      kind: 'action',
                      title: 'Filter Keywords Fleet for "' + q + '"',
                      subtitle: '/keywords?search=' + enc,
                      metric: 'Keywords',
                      iconGlyph: 'K',
                      iconClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
                      url: '/keywords?search=' + enc
                    },
                    {
                      uid: 'fb-creators',
                      idx: idx++,
                      kind: 'action',
                      title: 'Filter Creator Hub for "' + q + '"',
                      subtitle: '/accounts?search=' + encCreator,
                      metric: 'Creators',
                      iconGlyph: '@',
                      iconClass: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
                      url: '/accounts?search=' + encCreator
                    },
                    {
                      uid: 'fb-domains',
                      idx: idx++,
                      kind: 'action',
                      title: 'Filter Domain Radar for "' + q + '"',
                      subtitle: '/domains?search=' + enc,
                      metric: 'Domains',
                      iconGlyph: 'D',
                      iconClass: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20',
                      url: '/domains?search=' + enc
                    },
                    {
                      uid: 'fb-folders',
                      idx: idx++,
                      kind: 'action',
                      title: 'Filter Campaign Folders for "' + q + '"',
                      subtitle: '/folders?search=' + enc,
                      metric: 'Folders',
                      iconGlyph: 'F',
                      iconClass: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
                      url: '/folders?search=' + enc
                    }
                  ]
                });
              }

              return sections;
            },

            get flatCmdItems() {
              var sections = this.cmdTrimmed.length > 0 ? this.groupedCmdSections : this.staticCmdSections;
              var flat = [];
              for (var i = 0; i < sections.length; i++) {
                var items = sections[i].items || [];
                for (var j = 0; j < items.length; j++) {
                  flat.push(items[j]);
                }
              }
              return flat;
            },

            openCmd() {
              this.isCommandOpen = true;
              this.cmdQuery = '';
              this.cmdLoading = false;
              this.cmdHasQueried = false;
              this.cmdError = '';
              this.cmdActiveIndex = 0;
              this.cmdResults = { keywords: [], creators: [], folders: [], domains: [] };
              this.$nextTick(function() {
                var el = document.getElementById('pae-global-cmd-input');
                if (el) el.focus();
                if (typeof window !== 'undefined' && window.lucide && typeof window.lucide.createIcons === 'function') {
                  window.lucide.createIcons();
                }
              });
            },

            closeCmd() {
              this.isCommandOpen = false;
              this.cmdQuery = '';
              this.cmdLoading = false;
              this.cmdHasQueried = false;
              this.cmdError = '';
              this.cmdActiveIndex = 0;
              this.cmdResults = { keywords: [], creators: [], folders: [], domains: [] };
              if (this._cmdTimer) {
                clearTimeout(this._cmdTimer);
                this._cmdTimer = null;
              }
              if (this._cmdAbort) {
                try { this._cmdAbort.abort(); } catch (_) {}
                this._cmdAbort = null;
              }
            },

            clearCmdQuery() {
              this.cmdQuery = '';
              this.onCmdInput();
              this.$nextTick(function() {
                var el = document.getElementById('pae-global-cmd-input');
                if (el) el.focus();
              });
            },

            onCmdInput() {
              var self = this;
              var q = this.cmdTrimmed;
              this.cmdError = '';
              this.cmdActiveIndex = 0;
              if (this._cmdTimer) {
                clearTimeout(this._cmdTimer);
                this._cmdTimer = null;
              }
              if (this._cmdAbort) {
                try { this._cmdAbort.abort(); } catch (_) {}
                this._cmdAbort = null;
              }

              var effectiveLen = q.indexOf('@') === 0 ? q.replace(/^@+/, '').trim().length : q.length;
              if (!q || effectiveLen < 2 || /^[0-9]{10,30}$/.test(q)) {
                this.cmdLoading = false;
                this.cmdHasQueried = false;
                this.cmdResults = { keywords: [], creators: [], folders: [], domains: [] };
                return;
              }

              var cacheKey = q.toLowerCase();
              var cached = this._cmdCache.get(cacheKey);
              if (cached && (Date.now() - cached.ts) < 30000) {
                this.cmdLoading = false;
                this.cmdHasQueried = true;
                this.cmdResults = cached.entities;
                this.cmdActiveIndex = 0;
                if (typeof this.$nextTick === 'function') {
                  this.$nextTick(function() {
                    if (typeof window !== 'undefined' && window.PAE && typeof window.PAE.refreshIcons === 'function') {
                      window.PAE.refreshIcons();
                    }
                  });
                }
                return;
              }

              this.cmdLoading = true;
              var seq = ++this._cmdSeq;
              this._cmdTimer = setTimeout(function() {
                self.fetchCmdSuggestions(q, seq);
              }, 180);
            },

            async fetchCmdSuggestions(q, seq) {
              var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
              this._cmdAbort = controller;
              try {
                var fetchOpts = { headers: { 'Accept': 'application/json' } };
                if (controller) fetchOpts.signal = controller.signal;
                var res = await (window.apiFetch || fetch)('/api/search/autocomplete?q=' + encodeURIComponent(q) + '&limit=5', fetchOpts);
                if (!res.ok) throw new Error('HTTP ' + res.status);
                var data = await res.json();
                if (seq !== this._cmdSeq || this.cmdTrimmed.toLowerCase() !== q.toLowerCase()) return;
                var entities = (data && data.entities) ? data.entities : {
                  keywords: Array.isArray(data?.results) ? data.results.map(function(r) {
                    return { id: r.id || r.keyword, keyword: r.keyword, url: r.url || ('/keywords/' + encodeURIComponent(String(r.keyword || '').toLowerCase().trim().split(' ').filter(Boolean).join('-'))), active_pin_count: r.active_pin_count ?? r.pin_count ?? 0, avg_daily_velocity: r.avg_daily_velocity ?? 0, is_active: r.is_active !== false };
                  }) : [],
                  creators: [],
                  folders: [],
                  domains: []
                };
                if (this._cmdCache.size >= 50) {
                  var firstKey = this._cmdCache.keys().next().value;
                  if (firstKey !== undefined) this._cmdCache.delete(firstKey);
                }
                this._cmdCache.set(q.toLowerCase(), { ts: Date.now(), entities: entities });
                this.cmdResults = entities;
                this.cmdHasQueried = true;
                this.cmdActiveIndex = 0;
                if (typeof this.$nextTick === 'function') {
                  this.$nextTick(function() {
                    if (typeof window !== 'undefined' && window.PAE && typeof window.PAE.refreshIcons === 'function') {
                      window.PAE.refreshIcons();
                    }
                  });
                }
              } catch (err) {
                if (err && err.name === 'AbortError') return;
                if (seq !== this._cmdSeq) return;
                this.cmdError = 'Live search unavailable — use studio filter links below.';
              } finally {
                if (seq === this._cmdSeq) {
                  this.cmdLoading = false;
                }
              }
            },

            moveCmdSelection(delta) {
              var items = this.flatCmdItems;
              if (!items || items.length === 0) return;
              var next = (this.cmdActiveIndex + delta + items.length) % items.length;
              this.cmdActiveIndex = next;
              this.$nextTick(function() {
                if (typeof document !== 'undefined') {
                  var el = document.querySelector('[data-cmd-idx="' + next + '"]');
                  if (el && typeof el.scrollIntoView === 'function') {
                    el.scrollIntoView({ block: 'nearest' });
                  }
                }
              });
            },

            navigateToCmdUrl(url) {
              var safe = this.cmdSafeUrl(url);
              if (safe && safe !== '#') {
                this.closeCmd();
                if (typeof window !== 'undefined') {
                  window.location.href = safe;
                }
              }
            },

            handleCmdSubmit() {
              var items = this.flatCmdItems;
              if (items && items.length > 0 && items[this.cmdActiveIndex]) {
                this.navigateToCmdUrl(items[this.cmdActiveIndex].url);
                return;
              }
              var q = this.cmdTrimmed;
              if (!q) return;
              if (/^[0-9]{10,30}$/.test(q)) {
                this.navigateToCmdUrl('/pin/' + encodeURIComponent(q));
              } else if (q.indexOf('.') !== -1 && q.indexOf(' ') === -1) {
                this.navigateToCmdUrl('/domains/' + encodeURIComponent(q));
              } else {
                this.navigateToCmdUrl('/keywords?search=' + encodeURIComponent(q));
              }
            }
          };
        };
      }
    })();
  </script>

  <script>
    (function() {
      var _iconTimer = null;
      var _iconRaf = null;
      var _lastIconRunTs = 0;

      function runLucidePass() {
        _iconTimer = null;
        _iconRaf = null;
        if (typeof window === 'undefined' || !window.lucide || typeof window.lucide.createIcons !== 'function') {
          return;
        }
        if (typeof document !== 'undefined' && typeof document.querySelector === 'function') {
          var pendingIcon = document.querySelector('i[data-lucide], [data-lucide]:not(svg)');
          if (!pendingIcon) return;
        }
        _lastIconRunTs = Date.now();
        window.lucide.createIcons();
      }

      function refreshAppSidebarIcons() {
        if (typeof window === 'undefined') return;
        if (_iconTimer !== null && typeof clearTimeout === 'function') {
          clearTimeout(_iconTimer);
          _iconTimer = null;
        }
        if (_iconRaf !== null && typeof cancelAnimationFrame === 'function') {
          cancelAnimationFrame(_iconRaf);
          _iconRaf = null;
        }
        var now = Date.now();
        var elapsed = now - _lastIconRunTs;
        if (elapsed >= 60 && typeof requestAnimationFrame === 'function') {
          _iconRaf = requestAnimationFrame(runLucidePass);
        } else if (typeof setTimeout === 'function') {
          _iconTimer = setTimeout(runLucidePass, 60);
        } else {
          runLucidePass();
        }
      }

      if (typeof window !== 'undefined' && typeof window.paeWorkspaceSwitcher !== 'function') {
        window.paeWorkspaceSwitcher = function paeWorkspaceSwitcher() {
          return {
            open: false,
            creating: false,
            saving: false,
            errorMsg: '',
            newWorkspaceName: '',
            activeWorkspaceId: 1,
            workspaces: [{ id: 1, name: 'Default Workspace', slug: 'default', is_default: true, campaign_count: 0 }],
            init: async function() {
              try {
                var apiFetch = window.safeApiFetch || fetch;
                var res = await apiFetch('/api/workspaces', { credentials: 'same-origin' });
                if (!res.ok) return;
                var data = await res.json();
                if (data && Array.isArray(data.workspaces) && data.workspaces.length > 0) {
                  this.workspaces = data.workspaces;
                  this.activeWorkspaceId = Number(data.active_workspace_id || data.workspaces[0].id || 1);
                }
              } catch (_) {}
            },
            activeWorkspaceName: function() {
              for (var i = 0; i < this.workspaces.length; i++) {
                if (Number(this.workspaces[i].id) === Number(this.activeWorkspaceId)) {
                  return this.workspaces[i].name || 'Default Workspace';
                }
              }
              return 'Default Workspace';
            },
            switchWorkspace: async function(id) {
              var targetId = Number(id);
              if (!targetId || targetId === Number(this.activeWorkspaceId)) {
                this.open = false;
                return;
              }
              this.errorMsg = '';
              try {
                var apiFetch = window.safeApiFetch || fetch;
                var res = await apiFetch('/api/workspaces/switch', {
                  method: 'POST',
                  credentials: 'same-origin',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ workspace_id: targetId })
                });
                if (!res.ok) {
                  this.errorMsg = 'Failed to switch workspace.';
                  return;
                }
                this.activeWorkspaceId = targetId;
                this.open = false;
                window.location.reload();
              } catch (_) {
                this.errorMsg = 'Network error while switching workspace.';
              }
            },
            createNewWorkspace: async function() {
              var clean = String(this.newWorkspaceName || '').trim();
              if (!clean || this.saving) return;
              this.saving = true;
              this.errorMsg = '';
              try {
                var apiFetch = window.safeApiFetch || fetch;
                var res = await apiFetch('/api/workspaces', {
                  method: 'POST',
                  credentials: 'same-origin',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ name: clean })
                });
                var data = await res.json().catch(function() { return {}; });
                if (!res.ok || !data.workspace) {
                  this.errorMsg = data.message || data.error || 'Could not create workspace.';
                  return;
                }
                this.workspaces.push(data.workspace);
                this.newWorkspaceName = '';
                this.creating = false;
                await this.switchWorkspace(data.workspace.id);
              } catch (_) {
                this.errorMsg = 'Network error while creating workspace.';
              } finally {
                this.saving = false;
              }
            }
          };
        };
      }

      if (typeof window !== 'undefined') {
        if (window.PAE && !window.PAE.refreshIcons) {
          window.PAE.refreshIcons = refreshAppSidebarIcons;
        }
        if (window.__paeSidebarBootstrapped) {
          refreshAppSidebarIcons();
          return;
        }
        window.__paeSidebarBootstrapped = true;
      }

      if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', refreshAppSidebarIcons, { once: true });
        } else {
          refreshAppSidebarIcons();
        }
        if (typeof window !== 'undefined') {
          window.addEventListener('load', refreshAppSidebarIcons, { once: true });
          window.addEventListener('keydown', function(e) {
            if ((e.metaKey || e.ctrlKey) && (e.key === 'b' || e.key === 'B')) {
              var activeEl = document.activeElement;
              var tag = activeEl && activeEl.tagName ? String(activeEl.tagName).toUpperCase() : '';
              if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (activeEl && activeEl.isContentEditable)) {
                return;
              }
              e.preventDefault();
              if (window.Alpine && typeof window.Alpine.$data === 'function') {
                var el = document.querySelector('[x-data]');
                if (el) {
                  var data = window.Alpine.$data(el);
                  if (data && typeof data.toggleSidebar === 'function') {
                    data.toggleSidebar();
                  }
                }
              }
            }
          });
        }
        document.addEventListener('alpine:initialized', refreshAppSidebarIcons, { once: true });
      }
    })();
  </script>
`;
}

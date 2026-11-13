/**
 * Pin Details UI Client Scripts & Alpine.js Controller
 * Extracted from src/pin-details-ui.mjs
 */

export function getPinDetailsHeadScripts() {
  return `
  <script>
    (function() {
      try {
        var saved = localStorage.getItem('pa_theme') || localStorage.getItem('pin_theme');
        if (saved === 'light') {
          document.documentElement.classList.remove('dark');
          document.documentElement.classList.add('light');
        } else {
          document.documentElement.classList.add('dark');
          document.documentElement.classList.remove('light');
        }
      } catch (_) {}
    })();
  </script>
  <script>
(function() {
  if (typeof window === 'undefined' || window.__paeAuthInterceptorInstalled) return;
  window.__paeAuthInterceptorInstalled = true;
  const origFetch = window.fetch.bind(window);
  window.fetch = async function(input, init) {
    const urlStr = typeof input === 'string' ? input : (input && input.url ? input.url : '');
    const isApiCall = urlStr.startsWith('/api/') || urlStr.includes('/api/');
    let savedKey = '';
    try { savedKey = localStorage.getItem('pae_admin_api_key') || ''; } catch (_) {}
    if (isApiCall && savedKey) {
      init = Object.assign({}, init);
      const headers = new Headers(init.headers || (typeof input === 'object' && input.headers ? input.headers : undefined));
      if (!headers.has('x-api-key') && !headers.has('Authorization')) {
        headers.set('x-api-key', savedKey);
      }
      init.headers = headers;
    }
    let res = await origFetch(input, init);
    return res;
  };
})();
  </script>
  <script>
    (function() {
      if (typeof window === 'undefined') return;
      var SVG_PLACEHOLDER = "data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2260%22 height=%2290%22 viewBox=%220 0 60 90%22><rect width=%2260%22 height=%2290%22 rx=%224%22 fill=%22%2318181b%22/><text x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%2371717a%22 font-family=%22monospace%22 font-size=%2210%22>PIN</text></svg>";

      window.resolvePinImageUrl = function(url, tier) {
        tier = tier || '236x';
        if (!url || typeof url !== 'string') return SVG_PLACEHOLDER;
        if (!url.includes('pinimg.com')) return url;
        return url.replace(new RegExp('/(236x|474x|564x|736x|1200x|originals)/'), '/' + tier + '/');
      };

      window.handlePinImgError = function(img) {
        if (!img) return;
        var currentSrc = img.src || '';
        img._errStep = (img._errStep || 0) + 1;
        if (img._errStep > 4 || !currentSrc.includes('pinimg.com')) {
          img.onerror = null;
          img.src = SVG_PLACEHOLDER;
          return;
        }
        if (currentSrc.includes('/236x/')) {
          img.src = currentSrc.replace('/236x/', '/474x/');
        } else if (currentSrc.includes('/474x/')) {
          img.src = currentSrc.replace('/474x/', '/736x/');
        } else if (currentSrc.includes('/736x/')) {
          img.src = currentSrc.replace('/736x/', '/originals/');
        } else {
          img.onerror = null;
          img.src = SVG_PLACEHOLDER;
        }
      };
    })();
  </script>
  `;
}

export function getPinDetailsClientAppScripts() {
  return `
  <script>
    function pinDetailApp(pinId) {
      return {
        pinId,
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
          if (typeof this.$nextTick === 'function') {
            this.$nextTick(() => {
              if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons();
            });
          }
        },
        loading: true,
        isDbBusy: false,
        isSilentRefreshing: false,
        dossier: null,
        activeTab: 'ledger',
        // [INVARIANT-LOCK: DO NOT REMOVE - ENFORCED BY verify_regression_locks.mjs] Lock 2: Pin Dossier Timeframe & SERP Badge
        chartTimeframe: '7d',
        chartMetric: 'saves',
        isDark: true,
        hoveredChartPoint: null,
        realWidth: 0,
        realHeight: 0,
        deleteModalOpen: false,
        deleteType: 'DAY',
        itemToDelete: null,
        snapshotToDelete: null,
        isDeleting: false,
        isSyncing: false,
        isTrackingCreator: false,
        selectedKeywordFilter: 'ALL',
        expandedDays: {},
        searchKeywordInput: '',
        _cachedDateMap: null,
        toast: {
          show: false,
          message: '',
          type: 'success'
        },
        toastTimeout: null,
        originSource: '',
        originCreator: '',
        originBoard: '',
        originKeywordId: null,
        originKeyword: '',
        originFolderId: null,
        originFolderName: '',
        originDomain: '',
        originReturnUrl: '',

        onImageLoad(event) {
          if (event && event.target) {
            this.realWidth = event.target.naturalWidth || 0;
            this.realHeight = event.target.naturalHeight || 0;
          }
        },

        getResolutionRatioText() {
          if (this.realWidth && this.realHeight) {
            const ratio = (this.realWidth / this.realHeight).toFixed(2);
            const ratioLabel = (ratio > 0.64 && ratio < 0.69) ? '2:3' : ((ratio > 0.95 && ratio < 1.05) ? '1:1' : (ratio + ':1'));
            return this.realWidth + ' × ' + this.realHeight + ' (' + ratioLabel + ')';
          }
          return '2:3 (Standard)';
        },

        getMediaFormatLabel() {
          if (this.dossier?.algorithmic_intelligence?.is_video) return 'Video Pin';
          if (this.dossier?.algorithmic_intelligence?.is_product) return 'Product Pin';
          const m = String(this.dossier?.algorithmic_intelligence?.creation_method || '').toLowerCase();
          if (m.includes('carousel')) return 'Carousel';
          return 'Standard Image';
        },

        getCreationMethodBadgeClass() {
          const m = String(this.dossier?.algorithmic_intelligence?.creation_method || '').toLowerCase();
          if (m.includes('carousel')) return 'bg-purple-950/60 text-purple-300 border-purple-800';
          if (m.includes('browser') || m.includes('extension')) return 'bg-amber-950/60 text-amber-300 border-amber-800';
          if (m.includes('api')) return 'bg-sky-950/60 text-sky-300 border-sky-800';
          return 'bg-[#18181B] text-slate-300 border-[#27272A]';
        },

        formatCreationMethodLabel() {
          const m = String(this.dossier?.algorithmic_intelligence?.creation_method || 'pinterest_platform');
          return m.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        },

        formatStrictUniversalAge() {
          const raw = this.dossier?.creative?.created_at_pinterest || this.dossier?.creative?.created_at;
          if (!raw) return 'Unknown';
          const t = new Date(raw).getTime();
          if (isNaN(t)) return 'Unknown';
          const diffDays = Math.max(0, Math.floor((Date.now() - t) / 86400000));
          if (diffDays >= 365) {
            return (diffDays / 365).toFixed(1) + 'y';
          }
          return diffDays + 'd';
        },

        computeTrue24hWindowDelta() {
          const traj = (this.dossier?.daily_trajectory && this.dossier.daily_trajectory.length > 0)
            ? this.dossier.daily_trajectory
            : (this.dossier?.snapshots || []);
          if (!traj.length) return 0;
          const head = traj[0];
          if (head?.window_24h_delta !== undefined && head?.window_24h_delta !== null) {
            return Number(head.window_24h_delta);
          }
          const headDate = head?.snapshot_date ? String(head.snapshot_date).slice(0, 10) : '';
          const priorDaySnap = traj.find(s => {
            const d = s?.snapshot_date ? String(s.snapshot_date).slice(0, 10) : '';
            return d && d !== headDate;
          });
          if (!priorDaySnap) return this.computeDeltaUnified(0, 'save_count');
          if (this.isHydrationJump(head, priorDaySnap)) return null;
          return (Number(head.save_count) || 0) - (Number(priorDaySnap.save_count) || 0);
        },

        formatLive24hVelocity() {
          const head = this.dossier?.daily_trajectory?.[0];
          if (head?.window_24h_velocity !== undefined && head?.window_24h_velocity !== null && Number(head.window_24h_velocity) > 0) {
            const wVel = Number(head.window_24h_velocity);
            return '+' + (Number.isInteger(wVel) ? wVel : wVel.toFixed(1)) + '/d';
          }
          const liveDelta = this.computeTrue24hWindowDelta();
          if (liveDelta !== undefined && liveDelta !== null && liveDelta !== 0) {
            return (liveDelta >= 0 ? '+' : '') + liveDelta + '/d';
          }
          const trajVel = Number(this.dossier?.creative?.daily_save_velocity ?? head?.daily_save_velocity);
          if (Number.isFinite(trajVel) && trajVel > 0) {
            return '+' + (Number.isInteger(trajVel) ? trajVel : trajVel.toFixed(1)) + '/d';
          }
          return '+0/d';
        },

        formatLifetimeVelocityCaption() {
          const rawVel = Number(this.dossier?.creative?.daily_save_velocity || this.dossier?.daily_trajectory?.[0]?.daily_save_velocity || 0);
          const saves = Number(this.dossier?.creative?.save_count || 0);
          const rawDate = this.dossier?.creative?.created_at_pinterest || this.dossier?.creative?.created_at;
          if (rawDate) {
            const t = new Date(rawDate).getTime();
            if (!isNaN(t)) {
              const diffDays = Math.max(1, Math.floor((Date.now() - t) / 86400000));
              const amortized = (saves / diffDays).toFixed(2);
              const ageStr = diffDays >= 365 ? (diffDays / 365).toFixed(1) + 'y' : diffDays + 'd';
              return 'Lifetime: ' + amortized + '/d (' + ageStr + ')';
            }
          }
          return 'Lifetime: ' + rawVel.toFixed(1) + '/d';
        },

        format24hSaveDelta() {
          const delta = this.computeTrue24hWindowDelta();
          if (delta === null) {
            return '0 today (Hydrated Baseline)';
          }
          const traj = (this.dossier?.daily_trajectory && this.dossier.daily_trajectory.length > 0)
            ? this.dossier.daily_trajectory
            : (this.dossier?.snapshots || []);
          const head = traj[0];
          let elapsedDays = Number(head?.window_elapsed_days || 0);
          if (!elapsedDays && head?.snapshot_date && traj.length > 1) {
            const headDate = String(head.snapshot_date).slice(0, 10);
            const priorDaySnap = traj.find(s => {
              const d = s?.snapshot_date ? String(s.snapshot_date).slice(0, 10) : '';
              return d && d < headDate;
            });
            if (priorDaySnap?.snapshot_date) {
              elapsedDays = Math.max(1, Math.round((new Date(headDate) - new Date(String(priorDaySnap.snapshot_date).slice(0, 10))) / 86400000));
            }
          }
          const windowSuffix = elapsedDays > 1 ? (' (' + elapsedDays + 'd)') : ' today';
          if (delta > 0) return '+' + this.formatNumber(delta) + windowSuffix;
          if (delta < 0) return this.formatNumber(delta) + windowSuffix;
          return '0 today (Steady)';
        },

        formatViralityRatio() {
          const saves = Number(this.dossier?.creative?.save_count || 0);
          const repins = Number(this.dossier?.creative?.repin_count || 0);
          if (saves > 0) {
            const pct = ((repins / saves) * 100).toFixed(1);
            return pct + '% virality ratio';
          }
          return '0% virality ratio';
        },

        getBestRankDisplay() {
          const highest = this.dossier?.pillar_2_keywords_context?.highest_rank;
          if (highest && highest < 999) return '#' + highest;
          return '--';
        },

        getSerpFootprintSummary() {
          const kws = this.dossier?.pillar_2_keywords_context?.ranking_keywords || [];
          const active = kws.filter(k => !k.is_displaced).length;
          const displaced = kws.filter(k => k.is_displaced).length;
          return 'Active: ' + active + ' | Displaced: ' + displaced;
        },

        getFilteredKeywordsPortfolio() {
          let list = this.dossier?.pillar_2_keywords_context?.ranking_keywords || [];
          if (this.searchKeywordInput && this.searchKeywordInput.trim()) {
            const q = this.searchKeywordInput.trim().toLowerCase();
            list = list.filter(k => (k.keyword || '').toLowerCase().includes(q));
          }
          return list;
        },

        isCreatorContext() {
          return this.originSource === 'creator' && Boolean(this.originCreator);
        },

        getBoardSlug(name) {
          if (!name) return '';
          return String(name).toLowerCase().replace(/[^\\p{L}\\p{N}]+/gu, '-').replace(/^-|-$/g, '');
        },

        getBackUrl() {
          if (this.originReturnUrl) return this.originReturnUrl;
          if (this.originSource === 'pulse') {
            return this.originFolderId ? ('/folders/' + encodeURIComponent(this.originFolderId) + '/pulse') : '/pulse';
          }
          if (this.originSource === 'folder' && this.originFolderId) {
            return '/folders/' + encodeURIComponent(this.originFolderId);
          }
          if (this.originSource === 'domain' && this.originDomain) {
            return '/domains/' + encodeURIComponent(this.originDomain);
          }
          if (this.originSource === 'creator' && this.originCreator) {
            const cleanUser = String(this.originCreator).replace(/^@+/, '').trim();
            const bSlug = this.getBoardSlug(this.originBoard);
            return '/' + encodeURIComponent(cleanUser) + (bSlug ? '/' + encodeURIComponent(bSlug) : '');
          }
          if (this.originKeyword) {
            return '/keywords?q=' + encodeURIComponent(this.originKeyword);
          }
          return '/keywords';
        },

        getBackButtonLabel() {
          if (this.originSource === 'pulse') {
            return '24h Pulse Radar';
          }
          if (this.originSource === 'folder') {
            return this.originFolderName || (this.originFolderId ? ('Folder #' + this.originFolderId) : 'Folders');
          }
          if (this.originSource === 'domain' && this.originDomain) {
            return this.originDomain;
          }
          if (this.isCreatorContext() && this.originCreator) {
            return '@' + this.originCreator;
          }
          if (this.originKeyword) {
            return this.originKeyword;
          }
          return 'Radar';
        },

        getBackButtonTitle() {
          if (this.originSource === 'pulse') {
            return 'Back to 24h Pulse & Crossover Studio';
          }
          if (this.originSource === 'folder') {
            return 'Back to ' + (this.originFolderName || ('Folder #' + this.originFolderId));
          }
          if (this.originSource === 'domain' && this.originDomain) {
            return 'Back to ' + this.originDomain;
          }
          if (this.isCreatorContext() && this.originCreator) {
            return 'Back to @' + this.originCreator;
          }
          if (this.originKeyword) {
            return 'Back to ' + this.originKeyword;
          }
          return 'Back to Radar';
        },

        async init() {
          this.initTheme();
          if (typeof this.$nextTick === 'function') {
            this.$nextTick(() => {
              if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons();
            });
          }
          if (typeof setTimeout === 'function') {
            setTimeout(() => {
              if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons();
            }, 300);
          }
          let hasUrlContext = false;
          // Tier 1: URL Query Parameters
          if (typeof window !== 'undefined' && window.location && window.location.search) {
            const params = new URLSearchParams(window.location.search);
            const creatorParam = params.get('creator') || params.get('account') || '';
            const boardParam = params.get('board') || '';
            const kwParam = params.get('keyword') || params.get('q') || '';
            const kidParam = params.get('keyword_id') || '';
            const fidParam = params.get('folder_id') || '';
            const fNameParam = params.get('folder') || '';
            const domainParam = params.get('domain') || '';
            const returnUrlParam = params.get('return_url') || '';

            if (creatorParam) {
              this.originCreator = creatorParam.replace(/^@+/, '').trim();
              this.originBoard = boardParam.trim();
              this.originSource = 'creator';
              hasUrlContext = true;
            }
            if (kwParam) {
              this.originKeyword = kwParam.trim();
              this.originKeywordId = kidParam.trim() || null;
              if (!this.originSource) this.originSource = 'keyword';
              hasUrlContext = true;
            }
            if (fidParam) {
              this.originFolderId = fidParam.trim();
              this.originFolderName = fNameParam.trim();
              if (!this.originSource || this.originSource === 'keyword') this.originSource = 'folder';
              hasUrlContext = true;
            }
            if (domainParam) {
              this.originDomain = domainParam.trim();
              if (!this.originSource) this.originSource = 'domain';
              hasUrlContext = true;
            }
            if (returnUrlParam) {
              this.originReturnUrl = returnUrlParam.trim();
              hasUrlContext = true;
            }

            if (hasUrlContext && typeof window !== 'undefined' && window.sessionStorage) {
              try {
                sessionStorage.setItem('pae_pin_breadcrumb_ctx', JSON.stringify({
                  source: this.originSource,
                  pinId: this.pinId,
                  creator: this.originCreator,
                  board: this.originBoard,
                  keyword: this.originKeyword,
                  keywordId: this.originKeywordId,
                  folderId: this.originFolderId,
                  folderName: this.originFolderName,
                  domain: this.originDomain,
                  returnUrl: this.originReturnUrl,
                  ts: Date.now()
                }));
              } catch (_) {}
            }

            if (hasUrlContext && typeof window !== 'undefined' && window.history && typeof window.history.replaceState === 'function') {
              try {
                window.history.replaceState(null, '', '/pin/' + encodeURIComponent(this.pinId));
              } catch (_) {}
            }
          }

          // Tier 2: sessionStorage ('pae_pin_breadcrumb_ctx')
          if (!this.originCreator && !this.originKeyword && !this.originFolderId && !this.originDomain && !this.originReturnUrl && typeof window !== 'undefined' && window.sessionStorage) {
            try {
              const rawCtx = sessionStorage.getItem('pae_pin_breadcrumb_ctx');
              if (rawCtx) {
                const saved = JSON.parse(rawCtx);
                const isFresh = saved?.ts && (Date.now() - saved.ts < 3600000);
                const matchesPin = !saved.pinId || saved.pinId === this.pinId;
                if (isFresh && matchesPin) {
                  if (saved.source === 'creator' || saved.creator) {
                    this.originSource = 'creator';
                    this.originCreator = (saved.creator || '').replace(/^@+/, '').trim();
                    this.originBoard = saved.board || '';
                    this.originReturnUrl = this.originReturnUrl || saved.returnUrl || '';
                  } else if (saved.source === 'folder' || saved.folderId) {
                    this.originSource = 'folder';
                    this.originFolderId = saved.folderId || null;
                    this.originFolderName = saved.folderName || '';
                    this.originReturnUrl = this.originReturnUrl || saved.returnUrl || '';
                  } else if (saved.source === 'domain' || saved.domain) {
                    this.originSource = 'domain';
                    this.originDomain = saved.domain || '';
                    this.originReturnUrl = this.originReturnUrl || saved.returnUrl || '';
                  } else if (saved.source === 'pulse') {
                    this.originSource = 'pulse';
                    this.originFolderId = saved.folderId || null;
                    this.originFolderName = saved.folderName || '';
                    this.originReturnUrl = this.originReturnUrl || saved.returnUrl || '/pulse';
                  } else if (saved.source === 'keyword' || saved.keyword) {
                    this.originSource = 'keyword';
                    this.originKeyword = saved.keyword || '';
                    this.originKeywordId = saved.keywordId || null;
                    this.originFolderId = saved.folderId || null;
                    this.originFolderName = saved.folderName || '';
                    this.originReturnUrl = this.originReturnUrl || saved.returnUrl || '';
                  }
                }
              }
            } catch (_) {}
          }

          // Tier 3: Same-Origin document.referrer Inspection
          // [INVARIANT-LOCK: DO NOT REMOVE - ENFORCED BY verify_regression_locks.mjs] Lock 5: Folder Context Referrer Check
          if (!this.originCreator && !this.originKeyword && !this.originFolderId && !this.originDomain && !this.originReturnUrl && typeof document !== 'undefined' && document.referrer) {
            try {
              const refUrl = new URL(document.referrer);
              if (typeof window !== 'undefined' && refUrl.origin === window.location.origin) {
                if (refUrl.pathname.startsWith('/pulse') || refUrl.pathname.startsWith('/24h')) {
                  this.originSource = 'pulse';
                  this.originReturnUrl = this.originReturnUrl || (refUrl.pathname + refUrl.search);
                  const qFolderId = refUrl.searchParams.get('id') || refUrl.searchParams.get('folder_id');
                  if (qFolderId) this.originFolderId = qFolderId;
                } else if (refUrl.pathname.startsWith('/folders')) {
                  const fSegs = refUrl.pathname.split('/').filter(Boolean);
                  if (fSegs.length >= 3 && fSegs[2] === 'pulse') {
                    this.originSource = 'pulse';
                    this.originFolderId = fSegs[1];
                  } else {
                    this.originSource = 'folder';
                    if (fSegs.length > 1) this.originFolderId = fSegs[1];
                  }
                  this.originReturnUrl = this.originReturnUrl || (refUrl.pathname + refUrl.search);
                  const qFolderId = refUrl.searchParams.get('id') || refUrl.searchParams.get('folder_id');
                  if (qFolderId) this.originFolderId = qFolderId;
                } else if (refUrl.pathname.startsWith('/domains')) {
                  this.originSource = 'domain';
                  this.originReturnUrl = this.originReturnUrl || (refUrl.pathname + refUrl.search);
                  const dSegs = refUrl.pathname.split('/').filter(Boolean);
                  if (dSegs.length > 1) this.originDomain = dSegs[1];
                  const qDomain = refUrl.searchParams.get('domain');
                  if (qDomain) this.originDomain = qDomain;
                } else if (refUrl.pathname.startsWith('/keywords')) {
                  this.originSource = 'keyword';
                  this.originReturnUrl = this.originReturnUrl || (refUrl.pathname + refUrl.search);
                  const refKw = refUrl.searchParams.get('q') || refUrl.searchParams.get('keyword');
                  if (refKw) this.originKeyword = refKw.trim();
                  const refKid = refUrl.searchParams.get('keyword_id');
                  if (refKid) this.originKeywordId = refKid.trim();
                } else if (refUrl.pathname !== '/' && !refUrl.pathname.startsWith('/api') && !refUrl.pathname.startsWith('/pin')) {
                  const pathParts = refUrl.pathname.split('/').filter(Boolean);
                  const RESERVED_ROOT_SLUGS = new Set(['keywords', 'discovery', 'folders', 'domains', 'api', 'pin', 'pulse', '24h', 'accounts', 'clusters']);
                  const RESERVED_CREATOR_TABS = new Set(['all-pins', 'winning-pins', 'links', 'boards', 'topics', 'related-pins', 'pin']);

                  if (pathParts.length === 1 && !RESERVED_ROOT_SLUGS.has(pathParts[0].toLowerCase())) {
                    this.originSource = 'creator';
                    this.originCreator = pathParts[0].replace(/^@+/, '').trim();
                    this.originReturnUrl = this.originReturnUrl || (refUrl.pathname + refUrl.search);
                  } else if (pathParts.length === 2 && !RESERVED_ROOT_SLUGS.has(pathParts[0].toLowerCase())) {
                    const secondSlug = pathParts[1].toLowerCase();
                    if (secondSlug !== 'pin') {
                      this.originSource = 'creator';
                      this.originCreator = pathParts[0].replace(/^@+/, '').trim();
                      this.originReturnUrl = this.originReturnUrl || (refUrl.pathname + refUrl.search);
                      if (!RESERVED_CREATOR_TABS.has(secondSlug)) {
                        this.originBoard = decodeURIComponent(pathParts[1]).replace(/-/g, ' ');
                      }
                    }
                  }
                }
              }
            } catch (_) {}
          }

          if (!this.pinId) {
            this.loading = false;
            return;
          }
          await this.loadDossier();

          // Tier 4: Fallback from Pin Dossier Metadata (Only for tracked competitors)
          // [INVARIANT-LOCK: DO NOT REMOVE - ENFORCED BY verify_regression_locks.mjs] Lock 5: Untracked Creator Shield
          if (!this.originCreator && !this.originKeyword && !this.originFolderId && !this.originDomain && !this.originReturnUrl) {
            const creatorCtx = this.dossier?.pillar_1_creator_context;
            if (creatorCtx?.is_tracked_competitor) {
              const creatorUser = creatorCtx?.creator_username || this.dossier?.creative?.creator_username;
              if (creatorUser) {
                this.originCreator = String(creatorUser).replace(/^@+/, '').trim();
                this.originBoard = this.originBoard || creatorCtx?.board_name || '';
                this.originSource = 'creator';
              }
            }
          }
          if (this.dossier?.pillar_1_creator_context?.board_name) {
            this.originBoard = this.originBoard || this.dossier.pillar_1_creator_context.board_name;
          }

          // Persist hydrated breadcrumb context to sessionStorage so F5 refreshes retain Tier 3 / Tier 4 context
          if (typeof window !== 'undefined' && window.sessionStorage && (this.originCreator || this.originKeyword || this.originFolderId || this.originDomain || this.originReturnUrl)) {
            try {
              sessionStorage.setItem('pae_pin_breadcrumb_ctx', JSON.stringify({
                source: this.originSource,
                pinId: this.pinId,
                creator: this.originCreator,
                board: this.originBoard,
                keyword: this.originKeyword,
                keywordId: this.originKeywordId,
                folderId: this.originFolderId,
                folderName: this.originFolderName,
                domain: this.originDomain,
                returnUrl: this.originReturnUrl,
                ts: Date.now()
              }));
            } catch (_) {}
          }
        },

        showToast(message, type = 'success') {
          this.toast.message = message;
          this.toast.type = type;
          this.toast.show = true;
          if (this.toastTimeout) clearTimeout(this.toastTimeout);
          this.toastTimeout = setTimeout(() => {
            this.toast.show = false;
          }, 3500);
        },

        async loadDossier(forceRefresh = false, silent = false) {
          if (!silent) this.loading = true;
          if (silent) this.isSilentRefreshing = true;
          try {
            const fetcher = typeof window !== 'undefined' ? (window.safeApiFetch || fetch) : fetch;
            if (!fetcher) return;
            const qs = forceRefresh ? ('?refresh=true&_ts=' + Date.now()) : ('?_ts=' + Date.now());
            const res = await fetcher('/api/pins/' + encodeURIComponent(this.pinId) + qs, {
              cache: 'no-store',
              headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
              signal: (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') ? AbortSignal.timeout(12000) : undefined
            });
            if (res.ok) {
              const data = await res.json();
              this.dossier = data;
              this.isDbBusy = Boolean(data?.is_degraded);
              this.rebuildDateMapCache();
              const days = this.filteredDays();
              if (days.length > 0 && Object.keys(this.expandedDays).length === 0) {
                this.expandedDays = { [days[0].snapshot_date]: true };
              }

              // Non-Disruptive Background Healing
              const isIncompleteFallback = Boolean(data?.is_degraded);
              if (isIncompleteFallback) {
                this._autoRefreshAttempts = (this._autoRefreshAttempts || 0) + 1;
                if (this._autoRefreshAttempts <= 3) {
                  const delayMs = this._autoRefreshAttempts === 1 ? 1200 : (this._autoRefreshAttempts === 2 ? 3000 : 5000);
                  setTimeout(() => {
                    this.loadDossier(true, true);
                  }, delayMs);
                }
              } else {
                this._autoRefreshAttempts = 0;
              }
              if (this.dossier?.creative?.destination_url && this.dossier.creative.url_global_saves == null) {
                this.hydrateUrlGlobalSaves(this.dossier.creative.destination_url);
              }
            } else {
              this.isDbBusy = (res.status === 503);
              if (!silent) {
                this.dossier = null;
                this.showToast(res.status === 503 ? 'Database is temporarily busy. Please retry.' : 'Pin not found.', 'error');
              }
            }
          } catch (e) {
            console.error('Error fetching pin dossier:', e);
            if (!silent) {
              this.dossier = null;
              this.isDbBusy = false;
              this.showToast('Network error loading pin dossier', 'error');
            }
          } finally {
            if (!silent) this.loading = false;
            this.isSilentRefreshing = false;
          }
        },

        resolveHdImageUrl(url) {
          if (!url || typeof url !== 'string') return '';
          return url.replace(/[/](236x|474x|564x|736x)[/]/, '/1200x/');
        },

        resolveLosslessImageUrl(url) {
          if (!url || typeof url !== 'string') return '';
          return url.replace(/[/](236x|474x|564x|736x|1200x)[/]/, '/originals/');
        },

        async downloadHdAsset(url, pinId) {
          if (!url) return;
          const originalUrl = this.resolveLosslessImageUrl(url);
          const hdUrl = this.resolveHdImageUrl(url);
          try {
            const a = document.createElement('a');
            a.href = originalUrl;
            a.download = 'pin_' + (pinId || 'hd') + '_asset.jpg';
            a.target = '_blank';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
          } catch (_) {
            window.open(hdUrl, '_blank');
          }
        },

        computeViralityRatio() {
          const globalSaves = Number(this.dossier?.creative?.url_global_saves ?? this.dossier?.url_global_saves ?? 0);
          const pinSaves = Math.max(1, Number(this.dossier?.creative?.save_count ?? this.dossier?.save_count ?? 0));
          return (globalSaves / pinSaves).toFixed(1);
        },

        async hydrateUrlGlobalSaves(url) {
          if (!url) return;
          try {
            const res = await (window.safeApiFetch || fetch)('/api/urls/global-saves?url=' + encodeURIComponent(url));
            if (res.ok) {
              const data = await res.json();
              if (data && data.global_saves !== undefined) {
                if (this.dossier?.creative) {
                  this.dossier.creative.url_global_saves = Number(data.global_saves || 0);
                } else if (this.dossier) {
                  this.dossier.url_global_saves = Number(data.global_saves || 0);
                }
              }
            }
          } catch (_) {}
        },

        async trackCreatorPulse(username) {
          if (!username || this.isTrackingCreator) return;
          this.isTrackingCreator = true;
          try {
            const cleanUser = String(username).replace(/^@+/, '').trim();
            const res = await (window.safeApiFetch || fetch)('/api/competitors', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                username: cleanUser,
                tracking_mode: 'pulse_only',
                ingest_interval: 'daily',
                is_active: true
              })
            });
            if (res.ok) {
              if (this.dossier?.pillar_1_creator_context) {
                this.dossier.pillar_1_creator_context.is_tracked_competitor = true;
              }
              this.showToast('⚡ Creator @' + cleanUser + ' added with 24h Pulse tracking!', 'success');
            } else {
              const err = await res.json().catch(() => ({}));
              this.showToast('Failed to track creator: ' + (err.error || res.statusText), 'error');
            }
          } catch (err) {
            this.showToast('Network error: ' + err.message, 'error');
          } finally {
            this.isTrackingCreator = false;
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        initTheme() {
          if (typeof localStorage !== 'undefined') {
            const saved = localStorage.getItem('pa_theme') || localStorage.getItem('pin_theme');
            if (saved === 'light') {
              this.isDark = false;
              if (typeof document !== 'undefined') {
                document.documentElement.classList.remove('dark');
                document.documentElement.classList.add('light');
              }
            } else {
              this.isDark = true;
              if (typeof document !== 'undefined') {
                document.documentElement.classList.add('dark');
                document.documentElement.classList.remove('light');
              }
            }
          }
        },

        toggleTheme() {
          this.isDark = !this.isDark;
          const nextTheme = this.isDark ? 'dark' : 'light';
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('pa_theme', nextTheme);
            localStorage.setItem('pin_theme', nextTheme);
          }
          if (typeof document !== 'undefined') {
            if (this.isDark) {
              document.documentElement.classList.add('dark');
              document.documentElement.classList.remove('light');
            } else {
              document.documentElement.classList.remove('dark');
              document.documentElement.classList.add('light');
            }
          }
        },

        formatOriginPinner() {
          const op = this.dossier?.algorithmic_intelligence?.origin_pinner;
          if (!op) return '100% Original Creator';
          if (typeof op === 'string') return op;
          const username = op.username || op.user_name || op.full_name || '';
          const followers = op.follower_count || op.followers;
          if (username && followers) {
            return '@' + username + ' (' + this.formatNumber(followers) + ' followers)';
          }
          if (username) return '@' + username;
          return op.name || op.title || 'Original Creator';
        },

        formatInterestName(interest) {
          if (!interest) return '';
          if (typeof interest === 'string') return interest;
          if (typeof interest === 'object') {
            return interest.name || interest.title || interest.term || interest.label || '';
          }
          return String(interest);
        },

        formatCategoryCrumb(crumb) {
          if (!crumb) return '';
          if (typeof crumb === 'string') return crumb;
          if (typeof crumb === 'object') {
            return crumb.name || crumb.title || crumb.label || '';
          }
          return String(crumb);
        },

        formatVisualObject(obj) {
          if (!obj) return '';
          if (typeof obj === 'string') return obj;
          if (typeof obj === 'object') {
            return obj.label || obj.name || obj.title || obj.tag || JSON.stringify(obj);
          }
          return String(obj);
        },

        getReactionCount(type) {
          const rx = this.dossier?.algorithmic_intelligence?.reactions;
          if (rx && typeof rx === 'object') {
            if (type === 'love') return this.formatNumber(rx['1'] || rx.love || 0);
            if (type === 'idea') return this.formatNumber(rx['12'] || rx.idea || 0);
            if (type === 'haha') return this.formatNumber(rx['2'] || rx.haha || 0);
            if (type === 'wow') return this.formatNumber(rx['3'] || rx.wow || 0);
            if (type === 'good_try') return this.formatNumber(rx['7'] || rx.good_try || 0);
          }
          return '0';
        },

        safeColor(c) {
          if (!c) return '#888888';
          const s = String(c).trim();
          if (/^#([0-9a-fA-F]{3,8})$/.test(s) || /^[a-zA-Z]{3,20}$/.test(s)) return s;
          return '#888888';
        },

        safeUrl(url) {
          if (!url) return '';
          const s = String(url).trim();
          const lower = s.toLowerCase();
          if (lower.startsWith('javascript:') || lower.startsWith('data:text/html') || lower.startsWith('vbscript:')) {
            return '#';
          }
          return s;
        },

        copyAltText() {
          const text = this.dossier?.creative?.alt_text || '';
          if (typeof navigator === 'undefined' || !navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
            this.showToast('Clipboard not available in this environment', 'error');
            return;
          }
          navigator.clipboard.writeText(text)
            .then(() => this.showToast('Alt-Text copied to clipboard!'))
            .catch((err) => {
              this.showToast('Clipboard error: ' + (err?.message || 'Access denied'), 'error');
            });
        },

        copyText(text, label = 'Text') {
          if (!text) return;
          if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            navigator.clipboard.writeText(text)
              .then(() => this.showToast(label + ' copied to clipboard!'))
              .catch(() => this.showToast('Failed to copy ' + label, 'error'));
          } else {
            this.showToast('Clipboard not available in this environment', 'error');
          }
        },

        copyUrl(url) {
          this.copyText(url, 'Destination URL');
        },

        formatNumber(n) {
          const num = Number(n);
          if (!Number.isFinite(num)) return '0';
          return num.toLocaleString('en-US');
        },

        activeLiveTags() {
          const list = this.dossier?.creative?.visual_annotations_detailed;
          if (Array.isArray(list) && list.length > 0) {
            return list.filter(t => t.is_live);
          }
          return (this.dossier?.creative?.visual_annotations || []).map(t => ({
            name: typeof t === 'object' && t !== null ? (t.name || t.tag || t.label || t.term || '') : t,
            is_live: true
          }));
        },

        latestSnapshot() {
          return this.dossier?.snapshots?.[0] || null;
        },

        chronologicalSnapshots() {
          const rawDays = (this.dossier?.daily_trajectory && this.dossier.daily_trajectory.length > 0)
            ? this.dossier.daily_trajectory
            : (this.dossier?.snapshots || []);
          const dayMap = new Map();
          for (const s of rawDays) {
            const d = s.snapshot_date ? String(s.snapshot_date).slice(0, 10) : '';
            if (d && !dayMap.has(d)) dayMap.set(d, s);
          }
          let days = Array.from(dayMap.values()).sort((a, b) => String(a.snapshot_date).localeCompare(String(b.snapshot_date)));
          if (this.chartTimeframe === '7d') days = days.slice(-7);
          else if (this.chartTimeframe === '15d') days = days.slice(-15);
          else if (this.chartTimeframe === '30d') days = days.slice(-30);
          return days;
        },

        computeChartPoints() {
          let snaps = this.chronologicalSnapshots();
          const isVel = this.chartMetric === 'velocity';

          if (!isVel) {
            const firstPosIdx = snaps.findIndex(s => Number(s?.save_count || 0) > 0);
            if (firstPosIdx > 0 && (snaps.length - firstPosIdx) >= 2) {
              snaps = snaps.slice(firstPosIdx);
            }
          }
          if (snaps.length < 2) return [];

          const values = snaps.map(s => {
            if (isVel) {
              const v = Number(s?.daily_save_velocity);
              return Number.isFinite(v) ? v : 0;
            }
            const rawVal = Number(s?.save_count);
            return Number.isFinite(rawVal) ? Math.max(0, rawVal) : 0;
          });
          const minY = Math.min(...values);
          const maxY = Math.max(...values);
          const rangeY = (maxY - minY) || 1;

          const width = 800;
          const height = 180;
          const padX = 40;
          const padY = 30;

          return snaps.map((s, i) => {
            const x = padX + (i / (snaps.length - 1)) * (width - 2 * padX);
            const rawVal = isVel ? Number(s?.daily_save_velocity) : Number(s?.save_count);
            const val = Number.isFinite(rawVal) ? (isVel ? rawVal : Math.max(0, rawVal)) : 0;
            const y = (maxY === minY)
              ? (height / 2)
              : ((height - padY) - ((val - minY) / rangeY) * (height - 2 * padY));
            return {
              x: Number.isFinite(x) ? Number(x.toFixed(2)) : padX,
              y: Number.isFinite(y) ? Number(y.toFixed(2)) : 90,
              snapshot: s,
              value: val
            };
          });
        },

        buildSvgLinePath() {
          const points = this.computeChartPoints();
          if (!points.length) return '';
          return points.reduce((acc, p, i) => {
            const xStr = Number.isFinite(p.x) ? p.x.toFixed(1) : '0.0';
            const yStr = Number.isFinite(p.y) ? p.y.toFixed(1) : '90.0';
            return i === 0 ? ('M ' + xStr + ' ' + yStr) : (acc + ' L ' + xStr + ' ' + yStr);
          }, '');
        },

        buildSvgAreaPath() {
          const points = this.computeChartPoints();
          if (!points.length) return '';
          const lineD = this.buildSvgLinePath();
          const lastPoint = points[points.length - 1];
          const firstPoint = points[0];
          const bottomY = 150;
          const lastX = Number.isFinite(lastPoint.x) ? lastPoint.x.toFixed(1) : '0.0';
          const firstX = Number.isFinite(firstPoint.x) ? firstPoint.x.toFixed(1) : '0.0';
          return lineD + ' L ' + lastX + ' ' + bottomY.toFixed(1) + ' L ' + firstX + ' ' + bottomY.toFixed(1) + ' Z';
        },

        computeDelta(currentIdx, field = 'save_count') {
          return this.computeDeltaUnified(currentIdx, field);
        },

        isHydrationJump(curr, prev) {
          if (!curr) return false;
          if (curr.is_hydration_jump || curr.isHydrationJump) return true;
          if (!prev) return false;
          const currSaves = Number(curr.save_count || 0);
          const currRepins = Number(curr.repin_count || 0);
          const prevSaves = Number(prev.save_count || 0);
          const prevRepins = Number(prev.repin_count || 0);

          if (prevSaves <= 0 && currSaves > 0) return true;

          // [DEPRECATED LANDMINE: Removed - Authentic Pinterest pins can genuinely have repin_count > save_count]
          if (prevRepins > 0 && prevSaves === prevRepins && currSaves > currRepins * 1.35) return true;
          if (prevRepins === 0 && currRepins >= 25 && currSaves >= prevSaves * 2.5) return true;
          if (prevSaves > 0 && (currSaves / prevSaves) >= 4.0 && (currSaves - prevSaves) >= 2500) return true;
          if (prevSaves === 0 && currSaves >= 50) return true;
          return false;
        },

        computeDeltaUnified(currentIdxOrCurr, fieldOrPrev = 'save_count') {
          let curr = null;
          let prev = null;
          let field = 'save_count';

          if (typeof currentIdxOrCurr === 'object' && currentIdxOrCurr !== null) {
            curr = currentIdxOrCurr;
            prev = (typeof fieldOrPrev === 'object' && fieldOrPrev !== null) ? fieldOrPrev : null;
          } else {
            const currentIdx = typeof currentIdxOrCurr === 'number' ? currentIdxOrCurr : 0;
            field = typeof fieldOrPrev === 'string' ? fieldOrPrev : 'save_count';
            const snaps = this.dossier?.snapshots || [];
            const traj = this.dossier?.daily_trajectory || [];
            const list = (traj.length > 0) ? traj : snaps;
            if (list.length > currentIdx) curr = list[currentIdx];
            if (list.length > currentIdx + 1) prev = list[currentIdx + 1];
          }

          if (!curr || !prev) return 0;

          if (field === 'save_count' && this.isHydrationJump(curr, prev)) {
            return null;
          }

          const currVal = Number(curr[field] ?? 0);
          const prevVal = Number(prev[field] ?? 0);
          return currVal - prevVal;
        },

        getDayRowKey(day) {
          if (!day) return '';
          if (day.row_key) return String(day.row_key);
          if (day.is_intraday_checkpoint && day.snapshot_id) return String(day.snapshot_id);
          const d = day.snapshot_date ? String(day.snapshot_date).slice(0, 10) : '';
          const rec = day.recorded_at || day.updated_at || day.crawled_at || '';
          return rec ? (d + '__' + rec) : d;
        },

        formatSnapshotTime(day) {
          if (!day) return '';
          const rawTs = day.recorded_at || day.updated_at || day.crawled_at;
          if (!rawTs) return '';
          const str = String(rawTs).trim();
          const isoMatch = str.match(/T([0-9]{2}:[0-9]{2})/);
          if (isoMatch && isoMatch[1] && isoMatch[1] !== '00:00') {
            return isoMatch[1] + ' UTC';
          }
          const spaceMatch = str.match(/ ([0-9]{2}:[0-9]{2})/);
          if (spaceMatch && spaceMatch[1] && spaceMatch[1] !== '00:00') {
            return spaceMatch[1] + ' UTC';
          }
          const parsed = new Date(str);
          if (!isNaN(parsed.getTime())) {
            const hh = String(parsed.getUTCHours()).padStart(2, '0');
            const mm = String(parsed.getUTCMinutes()).padStart(2, '0');
            if (hh !== '00' || mm !== '00') return hh + ':' + mm + ' UTC';
          }
          return '';
        },

        _buildOrderedAuditRows() {
          const rawDays = (this.dossier?.daily_trajectory && this.dossier.daily_trajectory.length > 0)
            ? this.dossier.daily_trajectory
            : (this.dossier?.snapshots || []);
          const rowMap = new Map();
          for (const s of rawDays) {
            const key = this.getDayRowKey(s);
            if (key && !rowMap.has(key)) rowMap.set(key, s);
          }
          return Array.from(rowMap.values()).sort((a, b) => {
            const da = a.snapshot_date ? String(a.snapshot_date).slice(0, 10) : '';
            const db = b.snapshot_date ? String(b.snapshot_date).slice(0, 10) : '';
            if (da !== db) return db.localeCompare(da);
            const ta = String(a.recorded_at || a.updated_at || '');
            const tb = String(b.recorded_at || b.updated_at || '');
            return tb.localeCompare(ta);
          });
        },

        rebuildDateMapCache() {
          const map = new Map();
          const days = this._buildOrderedAuditRows();
          for (let i = 0; i < days.length; i++) {
            const rowKey = this.getDayRowKey(days[i]);
            const fullDate = days[i].snapshot_date;
            const shortDate = fullDate ? String(fullDate).slice(0, 10) : '';
            const entry = {
              current: days[i],
              previous: days[i + 1] || null
            };
            if (rowKey) map.set(rowKey, entry);
            if (fullDate && !map.has(fullDate)) map.set(fullDate, entry);
            if (shortDate && !map.has(shortDate)) map.set(shortDate, entry);
          }
          this._cachedDateMap = map;
        },

        totalUnfilteredDaysCount() {
          const days = this._buildOrderedAuditRows();
          return days.length || 0;
        },

        filteredDays() {
          let days = this._buildOrderedAuditRows();
          if (this.selectedKeywordFilter && this.selectedKeywordFilter !== 'ALL') {
            days = days.filter(d => (d.ranking_keywords || []).some(k => k.keyword === this.selectedKeywordFilter));
          }
          if (this.chartTimeframe === '7d') return days.slice(0, 7);
          if (this.chartTimeframe === '15d') return days.slice(0, 15);
          if (this.chartTimeframe === '30d') return days.slice(0, 30);
          return days;
        },

        formatAuditLogSummaryCount() {
          const rows = this.filteredDays();
          const uniqueDates = new Set(rows.map(r => r?.snapshot_date ? String(r.snapshot_date).slice(0, 10) : '').filter(Boolean));
          const calDays = uniqueDates.size || rows.length;
          const extraCheckpoints = Math.max(0, rows.length - calDays);
          if (extraCheckpoints > 0) {
            return calDays + (calDays === 1 ? ' day' : ' days') + ' (' + rows.length + ' snapshots)';
          }
          return calDays + (calDays === 1 ? ' day' : ' days');
        },

        formatDayDelta(day, idx) {
          if (!day) return '+0 (Baseline)';
          if (!this._cachedDateMap) this.rebuildDateMapCache();
          const rowKey = this.getDayRowKey(day);
          const dStr = day.snapshot_date ? String(day.snapshot_date).slice(0, 10) : '';
          const entry = (rowKey ? this._cachedDateMap?.get(rowKey) : null)
            || this._cachedDateMap?.get(day.snapshot_date)
            || (dStr ? this._cachedDateMap?.get(dStr) : null);
          const prev = entry ? entry.previous : null;

          if (!prev) return '+0 (Baseline)';

          if (this.isHydrationJump(day, prev)) {
            return 'Hydrated Baseline';
          }

          const delta = (Number(day.save_count) || 0) - (Number(prev.save_count) || 0);
          const prevDate = prev.snapshot_date ? String(prev.snapshot_date).slice(0, 10) : '';
          let suffix = ' 24h';
          if (dStr && prevDate) {
            if (dStr === prevDate) {
              suffix = ' step';
            } else {
              const gapDays = Math.max(1, Math.round((new Date(dStr) - new Date(prevDate)) / 86400000));
              if (gapDays > 1) suffix = ' (' + gapDays + 'd)';
            }
          }
          if (delta > 0) return '+' + this.formatNumber(delta) + suffix;
          if (delta < 0) return this.formatNumber(delta) + suffix;
          return '0' + suffix;
        },

        // [INVARIANT-LOCK: DO NOT REMOVE - ENFORCED BY verify_regression_locks.mjs] Lock 2: Displaced / Unranked SERP Badge Guard
        isKeywordDisplacedOrUnranked(kw) {
          if (!kw) return true;
          if (kw.is_displaced) return true;
          const rankNum = Number(kw.live_serp_rank || kw.rank);
          return !(rankNum > 0);
        },

        formatKeywordRankBadge(kw, isAccordion = false) {
          if (!kw) return isAccordion ? '#?' : '[Vault #?]';
          if (this.isKeywordDisplacedOrUnranked(kw)) {
            const vaultRank = kw.vault_rank || kw.last_known_rank || kw.rank || '?';
            return '[Vault #' + vaultRank + ']';
          }
          const rank = kw.live_serp_rank || kw.rank;
          return isAccordion ? ('#' + rank) : ('[SERP #' + rank + ']');
        },

        toggleDayExpanded(dateOrKey) {
          if (!dateOrKey) return;
          this.expandedDays[dateOrKey] = !this.expandedDays[dateOrKey];
        },

        isDayExpanded(dateOrKey) {
          return Boolean(this.expandedDays[dateOrKey]);
        },

        expandAllDays() {
          const next = {};
          for (const d of this.filteredDays()) {
            const k = this.getDayRowKey(d);
            if (k) next[k] = true;
          }
          this.expandedDays = next;
        },

        collapseAllDays() {
          this.expandedDays = {};
        },

        filteredKeywordsForDay(day) {
          let list = Array.isArray(day?.ranking_keywords) ? day.ranking_keywords : [];
          if (this.selectedKeywordFilter && this.selectedKeywordFilter !== 'ALL') {
            list = list.filter(k => k.keyword === this.selectedKeywordFilter);
          }
          return list;
        },

        keywordRankMovement(dayDate, kw) {
          if (!this._cachedDateMap) this.rebuildDateMapCache();
          const entry = this._cachedDateMap?.get(dayDate);
          if (!entry || !entry.previous) return { delta: 0, status: 'steady' };
          const prev = (entry.previous.ranking_keywords || []).find(p => p.keyword === kw.keyword || (kw.keyword_id && p.keyword_id === kw.keyword_id));
          if (!prev) return { delta: 0, status: 'new' };
          if (kw.is_displaced && prev.is_displaced) return { delta: 0, status: 'steady' };
          if (kw.is_displaced && !prev.is_displaced) return { delta: 0, status: 'down' };
          if (!kw.is_displaced && prev.is_displaced) return { delta: 0, status: 'up' };
          const currRank = Number(kw.live_serp_rank || kw.rank || 999);
          const prevRank = Number(prev.live_serp_rank || prev.rank || 999);
          const diff = prevRank - currRank;
          if (diff > 0) return { delta: diff, status: 'up' };
          if (diff < 0) return { delta: Math.abs(diff), status: 'down' };
          return { delta: 0, status: 'steady' };
        },

        getKeywordTierLabel(kw) {
          if (kw.is_displaced) return 'Displaced Vault';
          const r = Number(kw.live_serp_rank || kw.rank || 999);
          if (r <= 3) return 'Top 3 (Prime)';
          if (r <= 10) return 'Top 10 (Page 1)';
          if (r <= 50) return 'Ranks 11-50';
          if (r <= 100) return 'Ranks 51-100';
          return 'Vault';
        },

        getKeywordTierClass(kw) {
          if (kw.is_displaced) return 'bg-amber-950/50 text-amber-300 border border-amber-800';
          const r = Number(kw.live_serp_rank || kw.rank || 999);
          if (r <= 3) return 'bg-emerald-950/50 text-emerald-300 border border-emerald-800';
          if (r <= 10) return 'bg-sky-950/50 text-sky-300 border border-sky-800';
          if (r <= 50) return 'bg-indigo-950/50 text-indigo-300 border border-indigo-800';
          return 'bg-[#18181B] text-slate-400 border border-[#27272A]';
        },

        totalShares() {
          const s = this.latestSnapshot();
          return Number(s?.share_count || this.dossier?.creative?.share_count || 0);
        },

        totalReactions() {
          const s = this.latestSnapshot();
          return Number(s?.reaction_count || this.dossier?.creative?.reaction_count || 0);
        },

        totalEngagementScore() {
          const s = this.latestSnapshot();
          const snapC = Number(s?.comment_count || this.dossier?.creative?.comment_count || 0);
          const snapR = Number(s?.reaction_count || this.dossier?.creative?.reaction_count || 0);
          const snapSh = Number(s?.share_count || this.dossier?.creative?.share_count || 0);
          return snapC + snapR + snapSh;
        },

        isCanonicalRoot() {
          const ai = this.dossier?.algorithmic_intelligence;
          const cr = this.dossier?.creative;
          if (ai?.is_canonical_root !== undefined) return Boolean(ai.is_canonical_root);
          if (cr?.is_canonical_root !== undefined) return Boolean(cr.is_canonical_root);
          if (ai?.canonical_pin_id) return String(ai.canonical_pin_id) === String(this.pinId);
          return true;
        },

        canonicalPinId() {
          return this.dossier?.algorithmic_intelligence?.canonical_pin_id || this.dossier?.creative?.canonical_pin_id || null;
        },

        async triggerLiveDeepSync() {
          if (this.isSyncing) return;
          this.isSyncing = true;
          this.showToast('Triggering live Pinterest deep scrape (no cookies)...');
          try {
            const res = await (window.safeApiFetch || fetch)('/api/pins/' + encodeURIComponent(this.pinId) + '/sync', {
              method: 'POST'
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data?.success) {
              this.showToast('Pin synchronized across all 4 pillars successfully!');
              await this.loadDossier(true);
            } else {
              this.showToast(data?.message || data?.error || 'Deep sync failed', 'error');
            }
          } catch (err) {
            this.showToast('Deep sync error: ' + err.message, 'error');
          } finally {
            this.isSyncing = false;
          }
        },

        requestDeleteSnapshot(id) {
          this.deleteType = 'SNAPSHOT';
          this.itemToDelete = { snapshotId: id };
          this.snapshotToDelete = id;
          this.deleteModalOpen = true;
        },

        async executeDeleteSnapshot() {
          if (!this.snapshotToDelete || this.isDeleting) return;
          this.isDeleting = true;
          try {
            const fetcher = typeof window !== 'undefined' ? (window.safeApiFetch || fetch) : fetch;
            if (!fetcher) return;
            const res = await fetcher('/api/pins/' + encodeURIComponent(this.pinId) + '/snapshots/' + encodeURIComponent(this.snapshotToDelete), {
              method: 'DELETE'
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data?.success) {
              if (Array.isArray(this.dossier?.snapshots)) {
                this.dossier.snapshots = this.dossier.snapshots.filter(s => s.id !== this.snapshotToDelete);
              }
              this.showToast('Snapshot #' + this.snapshotToDelete + ' deleted successfully');
              this.deleteModalOpen = false;
              this.snapshotToDelete = null;
            } else {
              this.showToast(data?.message || data?.error || 'Error deleting snapshot', 'error');
            }
          } catch (err) {
            this.showToast('Error: ' + err.message, 'error');
          } finally {
            this.isDeleting = false;
          }
        },

        requestDeleteSerpBadge(kw, date) {
          this.deleteType = 'SERP_BADGE';
          this.itemToDelete = { keywordId: kw.keyword_id, keywordName: kw.keyword, date };
          this.deleteModalOpen = true;
        },

        requestDeleteDay(date) {
          this.deleteType = 'DAY';
          this.itemToDelete = { date };
          this.deleteModalOpen = true;
        },

        requestPurgePin() {
          this.deleteType = 'PIN';
          this.itemToDelete = { pinId: this.pinId };
          this.deleteModalOpen = true;
        },

        async confirmDelete() {
          if (this.isDeleting || !this.itemToDelete) return;
          this.isDeleting = true;
          try {
            if (this.deleteType === 'SERP_BADGE') {
              const { keywordId, keywordName, date } = this.itemToDelete;
              const res = await (window.safeApiFetch || fetch)('/api/pins/' + encodeURIComponent(this.pinId) + '/serp-positions', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ keyword_id: keywordId, snapshot_date: date })
              });
              const data = await res.json().catch(() => ({}));
              if (res.ok && data?.success) {
                this.showToast('Keyword rank "' + keywordName + '" removed for ' + date);
                this.deleteModalOpen = false;
                await this.loadDossier(true);
              } else {
                this.showToast(data?.message || data?.error || 'Error removing rank', 'error');
              }
            } else if (this.deleteType === 'DAY') {
              const { date } = this.itemToDelete;
              const res = await (window.safeApiFetch || fetch)('/api/pins/' + encodeURIComponent(this.pinId) + '/daily-metrics/' + encodeURIComponent(date), {
                method: 'DELETE'
              });
              const data = await res.json().catch(() => ({}));
              if (res.ok && data?.success) {
                this.showToast('All data for ' + date + ' deleted successfully');
                this.deleteModalOpen = false;
                await this.loadDossier(true);
              } else {
                this.showToast(data?.message || data?.error || 'Error deleting day', 'error');
              }
            } else if (this.deleteType === 'SNAPSHOT') {
              await this.executeDeleteSnapshot();
            } else if (this.deleteType === 'PIN') {
              const res = await (window.safeApiFetch || fetch)('/api/pins/' + encodeURIComponent(this.pinId), {
                method: 'DELETE'
              });
              const data = await res.json().catch(() => ({}));
              if (res.ok && data?.success) {
                this.showToast('Pin #' + this.pinId + ' permanently purged from PostgreSQL');
                this.deleteModalOpen = false;
                if (typeof window !== 'undefined') {
                  setTimeout(() => {
                    window.location.href = this.getBackUrl();
                  }, 1000);
                }
              } else {
                this.showToast(data?.message || data?.error || 'Error purging pin', 'error');
              }
            }
          } catch (err) {
            this.showToast('Deletion error: ' + err.message, 'error');
          } finally {
            this.isDeleting = false;
          }
        }
      };
    }
  </script>
  <script>
    const initLucide = () => {
      if (typeof window !== 'undefined' && window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
      }
    };
    if (typeof document !== 'undefined') {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initLucide);
      } else {
        initLucide();
      }
    }
  </script>
  `;
}

/**
 * Pin Details UI Client Scripts & Alpine.js Controller
 * Extracted from src/pin-details-ui.mjs
 */

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
        errorMessage: '',
        isSilentRefreshing: false,
        dossier: null,
        activeTab: 'ledger',
        // [INVARIANT-LOCK: DO NOT REMOVE - ENFORCED BY verify_regression_locks.mjs] Lock 2: Pin Dossier Timeframe & SERP Badge
        chartTimeframe: '7d',
        chartMetric: 'saves',
        isDark: (typeof localStorage !== 'undefined') ? (localStorage.getItem('pa_theme') || localStorage.getItem('pin_theme')) === 'dark' : false,
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
        v4WatchlistBusy: false,
        isWatchlisted: false,
        watchlistItemId: null,
        v4CampaignModalOpen: false,
        v4CampaignActionBusy: false,
        v4CampaignFolders: [],
        v4SelectedFolderId: '',
        trackedCampaigns: [],
        annotationsIntelOpen: false,
        annotationsIntelLoading: false,
        annotationsIntelError: '',
        annotationsIntelData: null,
        annotationsIntelPinId: null,
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
          if (m.includes('carousel')) return 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800';
          if (m.includes('browser') || m.includes('extension')) return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800';
          if (m.includes('api')) return 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800';
          return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-[#18181B] dark:text-slate-300 dark:border-[#27272A]';
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

        isSingleDayBaseline() {
          if (this.dossier?.creative?.is_day1_baseline === true) return true;
          const traj = this.dossier?.daily_trajectory;
          if (!Array.isArray(traj) || traj.length === 0) return true;
          const distinctDays = new Set(traj.map(s => String(s?.snapshot_date || '').slice(0, 10)).filter(Boolean));
          return distinctDays.size <= 1;
        },

        formatLive24hVelocity() {
          if (this.isSingleDayBaseline()) {
            return '—';
          }
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
          if (this.isSingleDayBaseline()) {
            return 'Day 1 Baseline (awaiting next UTC pulse)';
          }
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

        sanitizeReturnUrl(raw) {
          if (!raw || typeof raw !== 'string') return '';
          const trimmed = raw.trim();
          if (!trimmed) return '';
          for (let i = 0; i < trimmed.length; i++) {
            const code = trimmed.charCodeAt(i);
            if (code <= 0x1f || code === 0x7f || code === 92) return '';
          }
          if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
            return trimmed;
          }
          if (typeof window !== 'undefined' && window.location && window.location.origin) {
            try {
              const parsed = new URL(trimmed, window.location.origin);
              if ((parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.origin === window.location.origin) {
                return (parsed.pathname || '/') + (parsed.search || '') + (parsed.hash || '');
              }
            } catch (_) {}
          }
          return '';
        },

        getBackUrl() {
          const safeReturn = this.sanitizeReturnUrl(this.originReturnUrl);
          if (safeReturn) return safeReturn;
          if (this.originSource === 'newborn') {
            return this.originFolderId ? ('/folders/' + encodeURIComponent(this.originFolderId) + '/newborn') : '/newborn';
          }
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
          if (this.originSource === 'newborn') {
            return 'Newborn Hunter';
          }
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
          if (this.originSource === 'newborn') {
            return 'Back to Newborn Pin Hunter';
          }
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
            const sourceParam = (params.get('source') || '').trim().toLowerCase();
            const returnUrlParam = params.get('return_url') || '';

            if (sourceParam === 'newborn' || sourceParam === 'pulse') {
              this.originSource = sourceParam;
              hasUrlContext = true;
            }
            if (creatorParam) {
              this.originCreator = creatorParam.replace(/^@+/, '').trim();
              this.originBoard = boardParam.trim();
              if (!this.originSource) this.originSource = 'creator';
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
            const safeReturnParam = this.sanitizeReturnUrl(returnUrlParam);
            if (safeReturnParam) {
              this.originReturnUrl = safeReturnParam;
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
                  const safeSavedReturn = this.sanitizeReturnUrl(saved.returnUrl);
                  if (saved.source === 'creator' || saved.creator) {
                    this.originSource = 'creator';
                    this.originCreator = (saved.creator || '').replace(/^@+/, '').trim();
                    this.originBoard = saved.board || '';
                    this.originReturnUrl = this.originReturnUrl || safeSavedReturn || '';
                  } else if (saved.source === 'folder' || saved.folderId) {
                    this.originSource = 'folder';
                    this.originFolderId = saved.folderId || null;
                    this.originFolderName = saved.folderName || '';
                    this.originReturnUrl = this.originReturnUrl || safeSavedReturn || '';
                  } else if (saved.source === 'domain' || saved.domain) {
                    this.originSource = 'domain';
                    this.originDomain = saved.domain || '';
                    this.originReturnUrl = this.originReturnUrl || safeSavedReturn || '';
                  } else if (saved.source === 'newborn') {
                    this.originSource = 'newborn';
                    this.originFolderId = saved.folderId || null;
                    this.originFolderName = saved.folderName || '';
                    this.originReturnUrl = this.originReturnUrl || safeSavedReturn || '/newborn';
                  } else if (saved.source === 'pulse') {
                    this.originSource = 'pulse';
                    this.originFolderId = saved.folderId || null;
                    this.originFolderName = saved.folderName || '';
                    this.originReturnUrl = this.originReturnUrl || safeSavedReturn || '/pulse';
                  } else if (saved.source === 'keyword' || saved.keyword) {
                    this.originSource = 'keyword';
                    this.originKeyword = saved.keyword || '';
                    this.originKeywordId = saved.keywordId || null;
                    this.originFolderId = saved.folderId || null;
                    this.originFolderName = saved.folderName || '';
                    this.originReturnUrl = this.originReturnUrl || safeSavedReturn || '';
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
                if (refUrl.pathname.startsWith('/newborn')) {
                  this.originSource = 'newborn';
                  this.originReturnUrl = this.originReturnUrl || (refUrl.pathname + refUrl.search);
                  const qFolderId = refUrl.searchParams.get('id') || refUrl.searchParams.get('folder_id');
                  if (qFolderId) this.originFolderId = qFolderId;
                } else if (refUrl.pathname.startsWith('/pulse') || refUrl.pathname.startsWith('/24h')) {
                  this.originSource = 'pulse';
                  this.originReturnUrl = this.originReturnUrl || (refUrl.pathname + refUrl.search);
                  const qFolderId = refUrl.searchParams.get('id') || refUrl.searchParams.get('folder_id');
                  if (qFolderId) this.originFolderId = qFolderId;
                } else if (refUrl.pathname.startsWith('/folders')) {
                  const fSegs = refUrl.pathname.split('/').filter(Boolean);
                  if (fSegs.length >= 3 && fSegs[2] === 'newborn') {
                    this.originSource = 'newborn';
                    this.originFolderId = fSegs[1];
                  } else if (fSegs.length >= 3 && fSegs[2] === 'pulse') {
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
                  const RESERVED_ROOT_SLUGS = new Set(['keywords', 'discovery', 'folders', 'domains', 'api', 'pin', 'pulse', '24h', 'accounts', 'clusters', 'newborn']);
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
            if (creatorCtx?.is_tracked_competitor || creatorCtx?.competitor_tracked) {
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

        isTrackedCreator() {
          const ctx = this.dossier?.pillar_1_creator_context;
          return Boolean(ctx?.is_tracked_competitor || ctx?.competitor_tracked || ctx?.competitor_profile?.id);
        },

        isCreatorCeilingMetric(val) {
          const n = Number(val);
          return Number.isFinite(n) && n >= 10000001;
        },

        formatCreatorMetric(val) {
          if (val === null || val === undefined || val === '') return '--';
          const n = Number(val);
          if (!Number.isFinite(n)) return '--';
          if (n >= 10000001) return '10M+';
          return this.formatNumber(n);
        },

        getCreatorDbMetrics() {
          const ctx = this.dossier?.pillar_1_creator_context || {};
          const cp = ctx.competitor_profile || null;
          const nb = this.dossier?.newborn_context || null;
          const ai = this.dossier?.algorithmic_intelligence || {};

          const pickNum = (...vals) => {
            for (const v of vals) {
              if (v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v))) {
                return Number(v);
              }
            }
            return null;
          };

          const totalAudience = pickNum(cp?.total_audience, cp?.monthly_reach, nb?.creator_monthly_reach);
          const impressions = pickNum(cp?.impressions, cp?.profile_views, nb?.creator_profile_views);
          const totalPins = pickNum(cp?.total_pins, nb?.creator_pin_count);
          const totalBoards = pickNum(cp?.total_boards);
          const followers = pickNum(cp?.follower_count, cp?.followers, ai?.origin_pinner_followers, nb?.effective_creator_followers);
          const isTracked = this.isTrackedCreator();
          const isSynced = Boolean(cp?.is_synced || cp?.last_synced_at);

          const hasMetrics = Boolean(
            (totalAudience !== null && totalAudience > 0) ||
            (impressions !== null && impressions > 0) ||
            (totalPins !== null && totalPins > 0) ||
            (isTracked && isSynced && (totalAudience !== null || impressions !== null || totalPins !== null))
          );

          return {
            hasMetrics,
            isTracked,
            isSynced,
            totalAudience,
            impressions,
            totalPins,
            totalBoards,
            followers,
            deltaReach24h: Number(cp?.delta_reach_24h || 0),
            deltaViews24h: Number(cp?.delta_views_24h || 0),
            trackingMode: cp?.tracking_mode || 'pulse_only',
            lastSyncedAt: cp?.last_synced_at || null,
            displayName: cp?.display_name || null
          };
        },

        async loadDossier(forceRefresh = false, silent = false) {
          if (!silent) {
            this.loading = true;
            this.errorMessage = '';
          }
          if (silent) this.isSilentRefreshing = true;
          const requestPinId = this.pinId;
          try {
            const fetcher = typeof window !== 'undefined' ? (window.safeApiFetch || fetch) : fetch;
            if (!fetcher) return;
            const qs = forceRefresh ? ('?refresh=true&_ts=' + Date.now()) : ('?_ts=' + Date.now());
            const res = await fetcher('/api/pins/' + encodeURIComponent(requestPinId) + qs, {
              cache: 'no-store',
              headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
              signal: (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') ? AbortSignal.timeout(12000) : undefined
            });
            if (requestPinId !== this.pinId) return;
            if (res.ok) {
              const data = await res.json().catch(() => null);
              if (!data || data.success === false) {
                this.isDbBusy = Boolean(data?.error === 'DB_UNAVAILABLE');
                this.errorMessage = data?.message || data?.error || 'Failed to parse pin dossier response.';
                if (!silent) {
                  this.dossier = null;
                  this.showToast(this.errorMessage, 'error');
                }
                return;
              }
              this.dossier = data;
              this.errorMessage = '';
              this.isWatchlisted = Boolean(data?.is_watchlisted || data?.watchlist?.is_watchlisted);
              this.watchlistItemId = data?.watchlist_item_id ?? data?.watchlist?.item_id ?? null;
              this.trackedCampaigns = Array.isArray(data?.campaigns)
                ? data.campaigns
                : (Array.isArray(data?.tracked_campaigns) ? data.tracked_campaigns : []);
              this.isDbBusy = Boolean(data?.is_degraded);
              this.rebuildDateMapCache();

              // Non-Disruptive Background Healing
              const isIncompleteFallback = Boolean(data?.is_degraded);
              if (isIncompleteFallback) {
                this._autoRefreshAttempts = (this._autoRefreshAttempts || 0) + 1;
                if (this._autoRefreshAttempts <= 3) {
                  const delayMs = this._autoRefreshAttempts === 1 ? 1200 : (this._autoRefreshAttempts === 2 ? 3000 : 5000);
                  setTimeout(() => {
                    if (this.pinId === requestPinId) {
                      this.loadDossier(true, true);
                    }
                  }, delayMs);
                }
              } else {
                this._autoRefreshAttempts = 0;
              }
              if (this.dossier?.creative?.destination_url && this.dossier.creative.url_global_saves == null) {
                this.hydrateUrlGlobalSaves(this.dossier.creative.destination_url, requestPinId);
              }
            } else {
              const errData = await res.json().catch(() => ({}));
              this.isDbBusy = (res.status === 503);
              const defaultMsg = res.status === 503
                ? 'Database is temporarily busy. Please retry.'
                : (res.status === 404
                  ? ('Pin #' + requestPinId + ' was not found in any intelligence pillar.')
                  : ('Failed to load pin dossier (HTTP ' + res.status + ').'));
              this.errorMessage = errData?.message || errData?.error || defaultMsg;
              if (!silent) {
                this.dossier = null;
                this.showToast(this.errorMessage, 'error');
              }
            }
          } catch (e) {
            console.error('Error fetching pin dossier:', e);
            if (!silent) {
              this.dossier = null;
              this.isDbBusy = false;
              this.errorMessage = e?.message || 'Network error loading pin dossier.';
              this.showToast('Network error loading pin dossier', 'error');
            }
          } finally {
            if (!silent) this.loading = false;
            this.isSilentRefreshing = false;
          }
        },

        resolveHdImageUrl(url) {
          if (typeof window !== 'undefined' && window.PAE && typeof window.PAE.resolveHdImageUrl === 'function') {
            return window.PAE.resolveHdImageUrl(url);
          }
          if (!url || typeof url !== 'string') return '';
          return url.replace(/[/](236x|474x|564x|736x)[/]/, '/1200x/');
        },

        resolveLosslessImageUrl(url) {
          if (typeof window !== 'undefined' && window.PAE && typeof window.PAE.resolveLosslessImageUrl === 'function') {
            return window.PAE.resolveLosslessImageUrl(url);
          }
          if (!url || typeof url !== 'string') return '';
          return url.replace(/[/](236x|474x|564x|736x|1200x)[/]/, '/originals/');
        },

        async downloadHdAsset(url, pinId) {
          if (!url) {
            this.showToast('No image asset URL available for this pin.', 'error');
            return;
          }
          const originalUrl = this.safeUrl(this.resolveLosslessImageUrl(url));
          const hdUrl = this.safeUrl(this.resolveHdImageUrl(url));
          const targetUrl = (originalUrl && originalUrl !== '#') ? originalUrl : hdUrl;
          if (!targetUrl || targetUrl === '#') {
            this.showToast('Asset URL is invalid or unsafe to download.', 'error');
            return;
          }
          try {
            const a = document.createElement('a');
            a.href = targetUrl;
            a.download = 'pin_' + (pinId || 'hd') + '_asset.jpg';
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
          } catch (err) {
            console.warn('[PinDossier] Primary HD download fallback triggered:', err?.message || err);
            if (hdUrl && hdUrl !== '#') {
              const fallbackLink = document.createElement('a');
              fallbackLink.href = hdUrl;
              fallbackLink.target = '_blank';
              fallbackLink.rel = 'noopener noreferrer';
              document.body.appendChild(fallbackLink);
              fallbackLink.click();
              document.body.removeChild(fallbackLink);
            } else {
              this.showToast('Could not trigger HD asset download.', 'error');
            }
          }
        },

        computeViralityRatio() {
          const globalSaves = Number(this.dossier?.creative?.url_global_saves ?? this.dossier?.url_global_saves ?? 0);
          const pinSaves = Math.max(1, Number(this.dossier?.creative?.save_count ?? this.dossier?.save_count ?? 0));
          return (globalSaves / pinSaves).toFixed(1);
        },

        async hydrateUrlGlobalSaves(url, expectedPinId = null) {
          if (!url) return;
          const targetPinId = expectedPinId || this.pinId;
          try {
            const fetcher = typeof window !== 'undefined' ? (window.safeApiFetch || fetch) : fetch;
            if (!fetcher) return;
            const res = await fetcher('/api/urls/global-saves?url=' + encodeURIComponent(url));
            if (targetPinId !== this.pinId) return;
            if (!res.ok) {
              console.warn('[PinDossier] Global URL saves lookup returned HTTP ' + res.status);
              return;
            }
            const data = await res.json().catch(() => null);
            if (data && data.global_saves !== undefined) {
              if (this.dossier?.creative) {
                this.dossier.creative.url_global_saves = Number(data.global_saves || 0);
              } else if (this.dossier) {
                this.dossier.url_global_saves = Number(data.global_saves || 0);
              }
            }
          } catch (err) {
            console.warn('[PinDossier] Global URL saves lookup failed:', err?.message || err);
          }
        },

        async trackCreatorPulse(username) {
          if (!username || this.isTrackingCreator) return;
          this.isTrackingCreator = true;
          try {
            const cleanUser = String(username).replace(/^@+/, '').trim();
            const fetcher = typeof window !== 'undefined' ? (window.safeApiFetch || fetch) : fetch;
            if (!fetcher) return;
            const res = await fetcher('/api/creators', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                username: cleanUser,
                tracking_mode: 'pulse_only',
                ingest_interval: 'daily',
                is_active: true
              })
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data?.success !== false) {
              if (this.dossier?.pillar_1_creator_context) {
                this.dossier.pillar_1_creator_context.is_tracked_competitor = true;
                this.dossier.pillar_1_creator_context.competitor_tracked = true;
                if (data?.competitor) {
                  this.dossier.pillar_1_creator_context.competitor_profile = {
                    ...(this.dossier.pillar_1_creator_context.competitor_profile || {}),
                    ...data.competitor,
                    total_audience: data.competitor.monthly_reach ?? null,
                    impressions: data.competitor.profile_views ?? null,
                    followers: data.competitor.follower_count ?? null,
                    is_synced: Boolean(data.competitor.last_synced_at)
                  };
                }
              }
              this.showToast('Creator @' + cleanUser + ' added with 24h Pulse tracking!', 'success');
              await this.loadDossier(true, true);
            } else {
              this.showToast('Failed to track creator: ' + (data?.message || data?.error || res.statusText || ('HTTP ' + res.status)), 'error');
            }
          } catch (err) {
            this.showToast('Network error: ' + err.message, 'error');
          } finally {
            this.isTrackingCreator = false;
            if (typeof this.$nextTick === 'function') {
              this.$nextTick(() => {
                if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons();
              });
            }
          }
        },

        initTheme() {
          const saved = typeof localStorage !== 'undefined'
            ? (localStorage.getItem('pa_theme') || localStorage.getItem('pin_theme'))
            : null;
          this.isDark = saved === 'dark';
          if (typeof document !== 'undefined' && document.documentElement) {
            if (this.isDark) {
              document.documentElement.classList.add('dark');
              document.documentElement.classList.remove('light');
            } else {
              document.documentElement.classList.remove('dark');
              document.documentElement.classList.add('light');
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
          if (typeof window !== 'undefined' && window.PAEFormatters && typeof window.PAEFormatters.safeColor === 'function') {
            return window.PAEFormatters.safeColor(c, '#888888');
          }
          // @deprecated VM fallback when shared-head formatters are absent
          if (!c) return '#888888';
          const s = String(c).trim();
          if (/^#([0-9a-fA-F]{3,8})$/.test(s) || /^[a-zA-Z]{3,20}$/.test(s)) return s;
          return '#888888';
        },

        safeUrl(url) {
          if (!url) return '';
          if (typeof window !== 'undefined' && window.PAEFormatters && typeof window.PAEFormatters.safeUrl === 'function') {
            return window.PAEFormatters.safeUrl(String(url));
          }
          // @deprecated VM fallback when shared-head formatters are absent
          const s = String(url).replace(/[\\u0000-\\u001F\\u007F]/g, '').trim();
          if (/^https?:\\/\\//i.test(s) || (s.startsWith('/') && !s.startsWith('//') && !s.startsWith('/\\\\'))) return s;
          return '#';
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
          if (typeof window !== 'undefined' && window.PAEFormatters && typeof window.PAEFormatters.formatNumber === 'function') {
            return window.PAEFormatters.formatNumber(n);
          }
          // @deprecated VM fallback when shared-head formatters are absent
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

        async toggleAnnotationsIntel() {
          this.annotationsIntelOpen = !this.annotationsIntelOpen;
          if (this.annotationsIntelOpen) {
            const hasCachedForPin = Boolean(this.annotationsIntelData && this.annotationsIntelPinId === this.pinId);
            if (!hasCachedForPin && !this.annotationsIntelLoading) {
              await this.loadAnnotationsIntel(false);
            }
          }
        },

        async loadAnnotationsIntel(forceRefresh = false) {
          if (!this.pinId || this.annotationsIntelLoading) return;
          this.annotationsIntelLoading = true;
          this.annotationsIntelError = '';
          try {
            const fetcher = typeof window !== 'undefined' ? (window.safeApiFetch || fetch) : fetch;
            if (!fetcher) return;
            const qs = forceRefresh ? ('?refresh=true&_ts=' + Date.now()) : '';
            const res = await fetcher('/api/pins/' + encodeURIComponent(this.pinId) + '/annotations-intel' + qs, {
              cache: 'no-store',
              headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
              signal: (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') ? AbortSignal.timeout(20000) : undefined
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data && data.success) {
              this.annotationsIntelData = data;
              this.annotationsIntelPinId = this.pinId;
            } else {
              this.annotationsIntelError = data?.message || data?.error || ('Failed to inspect annotations (HTTP ' + res.status + ')');
            }
          } catch (err) {
            this.annotationsIntelError = err?.message || 'Network error while loading annotations intelligence';
          } finally {
            this.annotationsIntelLoading = false;
          }
        },

        annotationsIntelRows() {
          return Array.isArray(this.annotationsIntelData?.annotations) ? this.annotationsIntelData.annotations : [];
        },

        formatAnnotationDate(rawDate, fallbackLabel) {
          if (fallbackLabel && typeof fallbackLabel === 'string') return fallbackLabel;
          if (!rawDate) return '—';
          const str = String(rawDate).trim();
          if (!str || str.includes('1970')) return '—';
          const d = /^\\d{10}$/.test(str)
            ? new Date(Number(str) * 1000)
            : (/^\\d{13}$/.test(str) ? new Date(Number(str)) : new Date(str));
          if (isNaN(d.getTime()) || d.getUTCFullYear() <= 1970) return '—';
          return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
        },

        copyAnnotationId(id) {
          if (!id) return;
          this.copyText(String(id), 'Annotation ID');
        },

        copyAllAnnotations() {
          const rows = this.annotationsIntelRows();
          const names = rows.length > 0
            ? rows.map(r => r?.annotation).filter(Boolean)
            : this.activeLiveTags().map(t => t?.name).filter(Boolean);
          if (!names.length) {
            this.showToast('No annotations available to copy', 'error');
            return;
          }
          this.copyText(names.join('\\n'), names.length + ' Annotations');
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
          if (kw.is_displaced) return 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800';
          const r = Number(kw.live_serp_rank || kw.rank || 999);
          if (r <= 3) return 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800';
          if (r <= 10) return 'bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:border-sky-800';
          if (r <= 50) return 'bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800';
          return 'bg-slate-100 text-slate-700 border border-slate-200 dark:bg-[#18181B] dark:text-slate-400 dark:border-[#27272A]';
        },

        totalComments() {
          const s = this.latestSnapshot();
          return Number(s?.comment_count ?? this.dossier?.creative?.comment_count ?? 0);
        },

        totalShares() {
          const s = this.latestSnapshot();
          return Number(s?.share_count ?? this.dossier?.creative?.share_count ?? 0);
        },

        totalReactions() {
          const s = this.latestSnapshot();
          return Number(s?.reaction_count ?? this.dossier?.creative?.reaction_count ?? 0);
        },

        totalEngagementScore() {
          return this.totalComments() + this.totalReactions() + this.totalShares();
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
              this.annotationsIntelData = null;
              this.annotationsIntelPinId = null;
              this.annotationsIntelError = '';
              await this.loadDossier(true);
              if (this.annotationsIntelOpen) {
                await this.loadAnnotationsIntel(true);
              }
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

        async executeDeleteSnapshot(options = {}) {
          const skipLockCheck = Boolean(options?.skipLockCheck);
          const targetSnapshotId = this.snapshotToDelete ?? this.itemToDelete?.snapshotId;
          if (!targetSnapshotId || (!skipLockCheck && this.isDeleting)) return;
          if (!skipLockCheck) this.isDeleting = true;
          try {
            const fetcher = typeof window !== 'undefined' ? (window.safeApiFetch || fetch) : fetch;
            if (!fetcher) return;
            const res = await fetcher('/api/pins/' + encodeURIComponent(this.pinId) + '/snapshots/' + encodeURIComponent(targetSnapshotId), {
              method: 'DELETE'
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data?.success) {
              if (Array.isArray(this.dossier?.snapshots)) {
                this.dossier.snapshots = this.dossier.snapshots.filter(s => String(s.id) !== String(targetSnapshotId));
              }
              this.showToast('Snapshot #' + targetSnapshotId + ' deleted successfully');
              this.deleteModalOpen = false;
              this.snapshotToDelete = null;
              await this.loadDossier(true);
            } else {
              this.showToast(data?.message || data?.error || 'Error deleting snapshot', 'error');
            }
          } catch (err) {
            this.showToast('Error: ' + err.message, 'error');
          } finally {
            if (!skipLockCheck) this.isDeleting = false;
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
            const fetcher = typeof window !== 'undefined' ? (window.safeApiFetch || fetch) : fetch;
            if (!fetcher) return;
            if (this.deleteType === 'SERP_BADGE') {
              const { keywordId, keywordName, date } = this.itemToDelete;
              const res = await fetcher('/api/pins/' + encodeURIComponent(this.pinId) + '/serp-positions', {
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
              const res = await fetcher('/api/pins/' + encodeURIComponent(this.pinId) + '/daily-metrics/' + encodeURIComponent(date), {
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
              await this.executeDeleteSnapshot({ skipLockCheck: true });
            } else if (this.deleteType === 'PIN') {
              const res = await fetcher('/api/pins/' + encodeURIComponent(this.pinId), {
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
        },

        async savePinToWatchlist() {
          if (this.v4WatchlistBusy || !this.pinId) return;
          this.v4WatchlistBusy = true;
          const fetcher = typeof window !== 'undefined' ? (window.safeApiFetch || fetch) : fetch;
          if (!fetcher) {
            this.v4WatchlistBusy = false;
            return;
          }
          try {
            if (this.isWatchlisted) {
              let itemId = this.watchlistItemId;
              if (!itemId) {
                const listRes = await fetcher('/api/watchlist?entity_type=pin', { headers: { Accept: 'application/json' } });
                if (!listRes.ok) {
                  const errBody = await listRes.json().catch(() => ({}));
                  this.showToast(errBody?.message || errBody?.error || ('Failed to resolve watchlist entry (HTTP ' + listRes.status + ')'), 'error');
                  return;
                }
                const listData = await listRes.json().catch(() => ({}));
                const found = (listData?.items || []).find((it) => String(it?.entity_key || '') === String(this.pinId));
                if (found?.id != null) itemId = found.id;
              }
              if (!itemId) {
                this.isWatchlisted = false;
                this.watchlistItemId = null;
                this.showToast('Pin #' + this.pinId + ' is no longer in Workspace Watchlist');
                return;
              }
              const delRes = await fetcher('/api/watchlist/' + encodeURIComponent(String(itemId)), {
                method: 'DELETE',
                headers: { Accept: 'application/json' }
              });
              const delData = await delRes.json().catch(() => ({}));
              if (delRes.ok && delData?.success !== false) {
                this.isWatchlisted = false;
                this.watchlistItemId = null;
                if (this.dossier) {
                  this.dossier.is_watchlisted = false;
                  this.dossier.watchlist_item_id = null;
                  if (this.dossier.watchlist) {
                    this.dossier.watchlist.is_watchlisted = false;
                    this.dossier.watchlist.item_id = null;
                  }
                }
                this.showToast('Pin #' + this.pinId + ' removed from Workspace Watchlist');
              } else {
                this.showToast(delData?.error || 'Could not remove pin from Watchlist', 'error');
              }
              return;
            }

            const res = await fetcher('/api/watchlist', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
              body: JSON.stringify({
                entity_type: 'pin',
                entity_key: String(this.pinId),
                notes: this.dossier?.creative?.title ? String(this.dossier.creative.title).slice(0, 140) : ''
              })
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data?.success !== false) {
              const savedId = data?.item?.id ?? data?.id ?? null;
              this.isWatchlisted = true;
              this.watchlistItemId = savedId != null ? Number(savedId) : this.watchlistItemId;
              if (this.dossier) {
                this.dossier.is_watchlisted = true;
                this.dossier.watchlist_item_id = this.watchlistItemId;
                this.dossier.watchlist = {
                  ...(this.dossier.watchlist || {}),
                  is_watchlisted: true,
                  item_id: this.watchlistItemId
                };
              }
              this.showToast('Pin #' + this.pinId + ' saved to Workspace Watchlist');
            } else {
              this.showToast(data?.error || 'Could not save pin to Watchlist', 'error');
            }
          } catch (err) {
            this.showToast('Watchlist error: ' + err.message, 'error');
          } finally {
            this.v4WatchlistBusy = false;
          }
        },

        async openV4CampaignModal() {
          this.v4CampaignModalOpen = true;
          if (!this.v4SelectedFolderId && this.originFolderId) {
            this.v4SelectedFolderId = String(this.originFolderId);
          }
          try {
            const res = await (window.safeApiFetch || fetch)('/api/folders?lite=true', { headers: { Accept: 'application/json' } });
            if (res.ok) {
              const data = await res.json().catch(() => ({}));
              this.v4CampaignFolders = Array.isArray(data.folders) ? data.folders : [];
              if (!this.v4SelectedFolderId && this.v4CampaignFolders.length > 0) {
                this.v4SelectedFolderId = String(this.v4CampaignFolders[0].id);
              }
            } else {
              const errData = await res.json().catch(() => ({}));
              this.showToast(errData?.error || 'Failed to load Campaigns list', 'error');
            }
          } catch (err) {
            if (!err || err.name !== 'AbortError') {
              this.showToast('Failed to load Campaigns list: ' + (err?.message || 'network error'), 'error');
            }
          }
          if (typeof this.$nextTick === 'function') {
            this.$nextTick(() => {
              if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons();
            });
          }
        },

        get uniqueTrackedCampaigns() {
          const list = Array.isArray(this.trackedCampaigns) ? this.trackedCampaigns : [];
          const seen = new Map();
          for (const item of list) {
            const fid = Number(item?.folder_id);
            if (!Number.isInteger(fid) || fid <= 0) continue;
            if (!seen.has(fid)) seen.set(fid, item);
          }
          return Array.from(seen.values());
        },

        get isInCampaign() {
          return this.uniqueTrackedCampaigns.length > 0;
        },

        get campaignButtonLabel() {
          const unique = this.uniqueTrackedCampaigns;
          if (unique.length === 0) return '+ Add to Campaign';
          const firstName = String(unique[0].folder_name || ('Campaign #' + unique[0].folder_id)).trim();
          if (unique.length === 1) {
            return 'In Campaign: ' + firstName;
          }
          return 'In ' + unique.length + ' Campaigns (' + firstName + ', +' + (unique.length - 1) + ')';
        },

        isFolderAssigned(folderId) {
          const fid = Number(folderId);
          if (!Number.isInteger(fid) || fid <= 0) return false;
          return this.uniqueTrackedCampaigns.some((tc) => Number(tc.folder_id) === fid);
        },

        getFolderMembership(folderId) {
          const fid = Number(folderId);
          if (!Number.isInteger(fid) || fid <= 0) return null;
          return (this.trackedCampaigns || []).find((tc) => Number(tc.folder_id) === fid) || null;
        },

        formatCampaignSourceBadge(tc) {
          if (!tc) return 'tracked';
          const src = String(tc.source_type || 'tracked').trim().toLowerCase();
          const kwCount = Number(tc.keyword_count || 0);
          const bestRank = Number(tc.best_rank || 0);
          if (kwCount > 0) {
            const kwLabel = kwCount + ' ' + (kwCount === 1 ? 'kw' : 'kws');
            return bestRank > 0 ? (src + ' · ' + kwLabel + ' · #' + bestRank) : (src + ' · ' + kwLabel);
          }
          return src;
        },

        formatCampaignSelectOption(folder) {
          if (!folder) return '';
          const fid = Number(folder.id);
          const name = String(folder.name || ('Campaign #' + fid));
          const existing = (this.trackedCampaigns || []).find((tc) => Number(tc.folder_id) === fid);
          if (!existing) return name;
          return existing.can_remove === false ? (name + ' (In Cluster)') : (name + ' (Tracked)');
        },

        async addPinToSpecificCampaign(folderId) {
          const fid = Number(folderId);
          if (!Number.isInteger(fid) || fid <= 0 || this.v4CampaignActionBusy) return;
          this.v4SelectedFolderId = String(fid);
          await this.addPinToCampaignTracked();
        },

        async addPinToCampaignTracked() {
          if (!this.v4SelectedFolderId || this.v4CampaignActionBusy) return;
          this.v4CampaignActionBusy = true;
          try {
            const fid = Number(this.v4SelectedFolderId);
            const res = await (window.safeApiFetch || fetch)('/api/folders/' + encodeURIComponent(this.v4SelectedFolderId) + '/tracked-pins', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
              body: JSON.stringify({ pin_ids: [String(this.pinId)], source_type: 'related', source_ref: 'pin_dossier' })
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data?.success) {
              const matchedFolder = (this.v4CampaignFolders || []).find((f) => Number(f.id) === fid);
              const folderName = matchedFolder?.name || ('Campaign #' + fid);
              const folderColor = matchedFolder?.color || null;
              const exists = (this.trackedCampaigns || []).some((tc) => Number(tc.folder_id) === fid && String(tc.source_type || '') === 'related');
              if (!exists && Number.isInteger(fid) && fid > 0) {
                const clusterRow = (this.trackedCampaigns || []).find((tc) => Number(tc.folder_id) === fid && tc.can_remove === false);
                const entry = {
                  folder_id: fid,
                  folder_name: folderName,
                  folder_color: folderColor,
                  source_type: 'related',
                  source_query: null,
                  seed_query: null,
                  added_at: new Date().toISOString(),
                  notes: null,
                  membership_type: 'tracked',
                  can_remove: true,
                  keyword_count: clusterRow ? Number(clusterRow.keyword_count || 0) : 0,
                  best_rank: clusterRow ? (clusterRow.best_rank ?? null) : null
                };
                const remaining = (this.trackedCampaigns || []).filter((tc) => !(Number(tc.folder_id) === fid && tc.can_remove === false));
                this.trackedCampaigns = [...remaining, entry];
                if (this.dossier) {
                  this.dossier.tracked_campaigns = [...this.trackedCampaigns];
                  this.dossier.campaigns = [...this.trackedCampaigns];
                }
              }
              this.showToast('Pin #' + this.pinId + ' added to ' + folderName);
            } else {
              this.showToast(data?.error || 'Failed to add pin to Campaign', 'error');
            }
          } catch (err) {
            this.showToast('Campaign tracking error: ' + err.message, 'error');
          } finally {
            this.v4CampaignActionBusy = false;
          }
        },

        async removePinFromCampaign(folderId, sourceType = null) {
          const fid = Number(folderId);
          if (!Number.isInteger(fid) || fid <= 0 || this.v4CampaignActionBusy) return;
          this.v4CampaignActionBusy = true;
          try {
            const qs = sourceType ? ('?source_type=' + encodeURIComponent(sourceType)) : '';
            const res = await (window.safeApiFetch || fetch)('/api/folders/' + encodeURIComponent(fid) + '/tracked-pins/' + encodeURIComponent(String(this.pinId)) + qs, {
              method: 'DELETE',
              headers: { Accept: 'application/json' }
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data?.success !== false) {
              this.trackedCampaigns = (this.trackedCampaigns || []).filter((tc) => {
                if (Number(tc.folder_id) !== fid) return true;
                if (sourceType && String(tc.source_type || '') !== String(sourceType)) return true;
                return false;
              });
              if (this.dossier) {
                this.dossier.tracked_campaigns = [...this.trackedCampaigns];
                this.dossier.campaigns = [...this.trackedCampaigns];
                if (this.dossier.newborn_context && Number(this.dossier.newborn_context.folder_id) === fid) {
                  if (!sourceType || String(sourceType) === 'newborn') {
                    this.dossier.newborn_context.folder_id = null;
                    this.dossier.newborn_context.folder_name = null;
                    this.dossier.newborn_context.folder_color = null;
                  }
                }
              }
              this.showToast('Removed Pin #' + this.pinId + ' from campaign');
            } else {
              this.showToast(data?.error || 'Failed to remove pin from Campaign', 'error');
            }
          } catch (err) {
            this.showToast('Campaign removal error: ' + err.message, 'error');
          } finally {
            this.v4CampaignActionBusy = false;
          }
        },

        async queuePinAsGraphSeed() {
          if (!this.v4SelectedFolderId || this.v4CampaignActionBusy) return;
          this.v4CampaignActionBusy = true;
          try {
            const res = await (window.safeApiFetch || fetch)('/api/folders/' + encodeURIComponent(this.v4SelectedFolderId) + '/pin-graph-seeds', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
              body: JSON.stringify({ pin_ids: [String(this.pinId)], source_type: 'manual' })
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data?.success) {
              this.showToast('Queued Pin #' + this.pinId + ' as Campaign Pin Graph Seed');
              this.v4CampaignModalOpen = false;
            } else {
              this.showToast(data?.error || 'Failed to queue Pin Graph Seed', 'error');
            }
          } catch (err) {
            this.showToast('Seed queue error: ' + err.message, 'error');
          } finally {
            this.v4CampaignActionBusy = false;
          }
        }
      };
    }
  </script>
  <script>
    (function() {
      var initLucide = function() {
        if (typeof window !== 'undefined' && window.lucide && typeof window.lucide.createIcons === 'function') {
          window.lucide.createIcons();
        }
      };
      if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', initLucide, { once: true });
        } else {
          initLucide();
        }
      }
    })();
  </script>
  `;
}

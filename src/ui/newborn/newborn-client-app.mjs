/**
 * src/ui/newborn/newborn-client-app.mjs
 *
 * Wave 6D Client-Side Alpine.js Controller for `/newborn`:
 * - Pure 3-Filter Hunt Card (`Max Pin Age`, `Min Re-pins`, Optional `Min Saves` with 0 = ignored)
 * - Per-Path Deep-Scroll Targets (`Search` up to 5,000, `Boards` up to 50 + Find More Ideas,
 *   `Idea Page` up to 2,000, `Home Feed` up to 2,000, `Related Pins` up to 1,000)
 * - Automatic Official `Idea Page` Intelligence (`GET /api/newborn/idea-intelligence`)
 * - Instant HTTP 202 Accepted launch + 1.5s Live Funnel Polling (`GET /api/newborn/runs/:id`)
 * - Annotations Crossover Panel (overlap, avg Re-pins, optional volume lookup, click-to-filter, copy)
 * - On-Demand Zero-Cookie Account Reach (`POST /api/newborn/candidates/:pin_id/fetch-account`)
 * - Strictly Opt-In Daily Tracking (`Track Daily` modal) + Formula-Safe CSV Export
 */

export function getNewbornClientAppScript() {
  return `  <script>
    function newbornStudioApp(scopedFolderId = '', initialMode = 'hunt') {
      const DEFAULT_SETTINGS_DRAFT = {
        discovery: {
          country: 'US',
          default_l1_interest: 'all',
          max_board_age_days: 90,
          max_queries_per_run: 25,
          surfaces: {
            growing_trends: { enabled: false, max_pages: 1, limit: 50 },
            zero_query_popular: { enabled: false, max_pages: 1 },
            pin_serp_capsules: { enabled: true, max_pages: 10, page_size: 50, target_pins: 500 },
            fresh_boards: { enabled: true, max_pages: 2, max_boards: 10, target_pins_per_board: 100 },
            board_feed: { enabled: false, max_pages: 2, page_size: 100, target_pins_per_board: 100 },
            board_more_ideas: { enabled: true, max_pages: 4, page_size: 25, target_pins_per_board: 100, max_boards: 10 },
            ideas_feeds: { enabled: true, max_pages: 5, target_pins: 250, max_interests_per_run: 3 },
            home_feed: { enabled: false, max_pages: 5, page_size: 50, target_pins: 250 },
            related_pin_snowball: { enabled: false, max_pages: 8, page_size: 25, target_pins: 200 }
          },
          snowball: { enabled: false, max_hops: 1, seed_cap: 10, min_seed_golden_score: 65 },
          hydration: { enable_pidgets_pretriage: true, max_pin_hydrations_per_run: 500, max_user_hydrations_per_run: 50, auto_fetch_accounts: true }
        },
        qualification: {
          age_window_preset: '30d',
          min_age_days: 0,
          max_age_days: 30,
          min_repin_count: 20,
          min_save_count: 0,
          min_repin_per_day: 0,
          min_save_per_day: 0,
          max_creator_followers: 25000,
          enforce_max_followers_filter: false,
          resolve_root_pin: false,
          provenance: {
            allowed_sources: ['SHARE_EXTENSION_IOS', 'SHARE_EXTENSION_ANDROID', 'UPLOADED', 'ORGANIC_PIN', 'CAROUSEL', 'VIDEO', 'IDEA_PIN', 'BOOKMARKLET', 'UNKNOWN'],
            excluded_sources: [],
            ai_disclosure_policy: 'include',
            exclude_products: false,
            exclude_videos: false
          },
          linkless_vacuum: { mode: 'boost', linkless_vacuum_only: false, score_boost: 12 }
        },
        automation: {
          auto_track_enabled: false,
          schedule: {
            cadence: 'every_6h',
            interval_minutes: 360,
            watchlist_poll_interval_minutes: 720,
            target_window_utc: { start_hour: 0, end_hour: 23 },
            cooldown_minutes: 60
          }
        }
      };

      const cloneJson = (obj) => JSON.parse(JSON.stringify(obj));

      return {
        scopedFolderId: scopedFolderId || '',
        activeFolder: null,
        isSidebarCollapsed: false,
        isMobileMenuOpen: false,
        isDark: false,
        activeView: initialMode === 'cluster' ? 'cluster' : (initialMode === 'watchlist' ? 'watchlist' : (initialMode === 'history' ? 'history' : 'hunt')),
        isLoading: false,

        // Hero Hunt & Idea Page Intelligence State
        huntInput: '',
        selectedProfileId: '',
        isSubmittingHunt: false,
        ideaPageInfo: null,
        isLookingUpIdeaPage: false,
        _ideaLookupSeq: 0,

        // Pure 3-Filter Qualification Controls
        huntOptionsExpanded: false,
        workspaceHuntDefaults: null,
        _autoRefreshedLaunchpadKeys: {},
        huntFilters: {
          maxAgeDays: 30,
          minRepins: 20,
          minSaves: 0
        },

        // Per-Path Deep-Scroll Extraction Controls (Boards = Find more ideas ONLY)
        huntPaths: {
          search: { enabled: true, target_pins: 500 },
          boards: { enabled: true, max_boards: 10, target_pins_per_board: 100 },
          idea_page: { enabled: true, target_pins: 250 },
          home_feed: { enabled: false, target_pins: 250 },
          related: { target_pins: 200 }
        },

        // Wave 6E Newborn Keyword Cluster Explorer State
        clusterForm: {
          seed_keyword: '',
          l1_interest: 'all',
          country: 'US',
          exclude_terms: ''
        },
        activeCluster: null,
        recentClusters: [],
        selectedClusterKeywords: [],
        clusterFilters: {
          q: '',
          source: 'all',
          taxonomyOnly: false,
          minVolume: 0,
          sort: 'score'
        },
        isBuildingCluster: false,
        isEnrichingCluster: false,
        enrichStopRequested: false,
        enrichProgressDone: 0,
        enrichProgressTotal: 0,
        retryingClusterKeyword: '',
        isLaunchingClusterHunt: false,

        // Full Pinterest Trends Panel (50-100 Trends + All 8 Filters)
        showTrendsDrawer: initialMode === 'launchpad',
        showAnnotationsCrossover: false,
        isRefreshingLaunchpad: false,
        launchpadCountry: 'US',
        launchpadTrendType: 'growing',
        launchpadInterest: 'all',
        launchpadMoments: '',
        launchpadAge: '',
        launchpadGender: '',
        launchpadIncludeTerms: '',
        launchpadExcludeTerms: '',
        launchpadLimit: 50,
        launchpadTrends: [],
        launchpadPopularTerms: [],
        launchpadIdeasForYou: [],
        l1InterestsCatalog: [],
        supportedCountries: [{ code: 'US', label: 'United States (US)' }],

        // V4 Wave 3 Cluster Basket & Campaign Modal State
        clusterBasket: [],
        basketManualInput: '',
        basketCampaignModalOpen: false,
        isSubmittingBasketCampaign: false,
        isLaunchingBasketHunt: false,
        basketCampaignForm: {
          mode: 'new',
          newName: '',
          existingFolderId: '',
          serpTopN: 30,
          trackTopNDaily: true,
          runNewbornDeepHunt: false
        },

        // Wave 6F Execution Mode & Live Run Control State (20-Runner Fleet default)
        executionMode: 'fleet',
        fleetShards: 20,
        pollReconnectingNotice: '',
        cancellingRun: false,

        // Live 202 Run Polling State
        activeRunId: null,
        _abortControllers: {},
        _nextAbortSignal(slot) {
          if (typeof AbortController === 'undefined') return undefined;
          if (!this._abortControllers) this._abortControllers = {};
          const prev = this._abortControllers[slot];
          if (prev) {
            try { prev.abort(); } catch (_) {}
          }
          const next = new AbortController();
          this._abortControllers[slot] = next;
          return next.signal;
        },
        _abortSlots() {
          if (!this._abortControllers) return;
          for (let i = 0; i < arguments.length; i++) {
            const slot = arguments[i];
            const ctrl = this._abortControllers[slot];
            if (ctrl) {
              try { ctrl.abort(); } catch (_) {}
              delete this._abortControllers[slot];
            }
          }
        },
        _isAbortError(err, signal) {
          return Boolean((signal && signal.aborted) || (err && (err.name === 'AbortError' || err.code === 20)));
        },
        activeRun: null,
        isPollingRun: false,
        showRunCompleteBanner: false,
        pollTimerId: null,
        _pollInFlight: false,
        _pollConsecutiveFailures: 0,
        _pollTargetRunId: null,
        _visibilityBound: null,
        _teardownBound: null,

        // Core Data Collections
        overview: null,
        candidates: [],
        candidatesTotal: 0,
        candidatesPageSize: 100,
        candidatesOffset: 0,
        isExportingCsv: false,
        selectedPinIds: [],
        filters: {
          linkFilter: 'all',
          linklessOnly: false,
          surface: '',
          creationMethod: '',
          repinFilter: '',
          annotation: '',
          search: '',
          sort: 'repins'
        },

        // Annotations Crossover & On-Demand Account Reach
        crossoverClusters: [],
        annotationVolumeMap: {},
        expandedPinAnnotations: {},
        isCheckingAnnotationVolumes: false,
        pullingAccountPins: {},
        isPullingBulkAccounts: false,

        // Past Hunts
        runs: [],
        selectedRunIds: [],
        confirmBulkDeleteRuns: false,
        isBulkDeletingRuns: false,
        deletingRunId: null,
        confirmDeleteRunId: null,
        isClearingRuns: false,

        // Settings Draft & Modals
        settingsTab: 'filters',
        settingsDraft: cloneJson(DEFAULT_SETTINGS_DRAFT),
        scheduleStatus: null,
        cookieStatus: { has_cookie: false, preview: '', mode: 'guest_only' },
        surfacesCatalog: [],
        profiles: [],
        cookieInput: '',
        isSavingCookie: false,
        isSavingSettings: false,

        // Pin Dossier Slide-Over
        dossierOpen: false,
        dossierData: null,
        isLoadingDossier: false,

        // Track Daily Modal
        promoteModalOpen: false,
        promotePinIds: [],
        promoteForm: {
          promoteToDailySsot: true,
          promoteKeyword: false,
          promoteClusterSeeds: false,
          folderId: scopedFolderId || ''
        },
        foldersList: [],
        isPromoting: false,
        targetCampaignFolderId: scopedFolderId || '',
        isSendingToCampaign: false,
        quickCampaignModalOpen: false,
        quickCampaignName: '',
        quickCampaignTarget: 'target',
        quickCampaignPrevValue: '',
        isCreatingQuickCampaign: false,

        get activeIdeaPage() {
          if (this.ideaPageInfo && this.ideaPageInfo.found) return this.ideaPageInfo;
          const runIdea = this.activeRun && this.activeRun.telemetry && this.activeRun.telemetry.idea_page;
          if (runIdea && runIdea.found) return runIdea;
          return null;
        },

        async init() {
          try {
            if (typeof window !== 'undefined' && window.localStorage) {
              this.isSidebarCollapsed = window.localStorage.getItem('pae_sidebar_collapsed') === 'true';
              const savedTheme = window.localStorage.getItem('pa_theme');
              this.isDark = savedTheme === 'dark';
              if (typeof document !== 'undefined' && document.documentElement) {
                document.documentElement.classList.toggle('dark', this.isDark);
              }
            }
            if (typeof window !== 'undefined' && window.location && window.location.search) {
              const qp = new URLSearchParams(window.location.search);
              const qSeed = (qp.get('search') || qp.get('q') || '').trim();
              if (qSeed) this.huntInput = qSeed;
              const qFolderId = (qp.get('folder_id') || '').trim();
              if (qFolderId && !this.targetCampaignFolderId) {
                this.targetCampaignFolderId = qFolderId;
              }
            }
          } catch (_) {}

          if (typeof window !== 'undefined' && typeof window.addEventListener === 'function' && !this._teardownBound) {
            this._teardownBound = () => this.stopPollingRun();
            window.addEventListener('pagehide', this._teardownBound);
            window.addEventListener('beforeunload', this._teardownBound);
          }

          await Promise.all([
            this.loadSettingsAndProfiles(),
            this.loadOverviewAndRuns(),
            this.loadFoldersList(),
            this.loadRecentClusters()
          ]);

          if (this.scopedFolderId && Array.isArray(this.foldersList)) {
            this.activeFolder = this.foldersList.find((f) => String(f.id) === String(this.scopedFolderId)) || null;
          }

          // Auto-scope "This Hunt" to the most recent run if present
          if (!this.activeRunId && this.runs.length > 0) {
            const latest = this.runs[0];
            this.activeRunId = Number(latest.id);
            this.activeRun = latest;
            if (this.isRunActiveStatus(latest.status)) {
              this.startPollingRun(this.activeRunId);
            }
          }

          if (this.huntInput && this.huntInput.trim().length >= 2) {
            this.lookupIdeaPage(this.huntInput);
          }

          if (this.activeView === 'cluster') {
            if (this.huntInput && this.huntInput.trim()) {
              this.clusterForm.seed_keyword = this.huntInput.trim();
            }
          } else {
            await Promise.all([this.loadCandidates(), this.loadCrossoverForActiveHunt()]);
          }

          if (this.showTrendsDrawer) {
            await this.loadLaunchpadFeed();
          }

          this.refreshIcons();
        },

        toggleSidebar() {
          this.isSidebarCollapsed = !this.isSidebarCollapsed;
          try {
            if (typeof window !== 'undefined' && window.localStorage) {
              window.localStorage.setItem('pae_sidebar_collapsed', String(this.isSidebarCollapsed));
            }
          } catch (_) {}
        },

        toggleTheme() {
          this.isDark = !this.isDark;
          try {
            if (typeof document !== 'undefined' && document.documentElement) {
              document.documentElement.classList.toggle('dark', this.isDark);
            }
            if (typeof window !== 'undefined' && window.localStorage) {
              window.localStorage.setItem('pa_theme', this.isDark ? 'dark' : 'light');
            }
          } catch (_) {}
          this.refreshIcons();
        },

        destroy() {
          this.stopPollingRun();
          if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function' && this._teardownBound) {
            window.removeEventListener('pagehide', this._teardownBound);
            window.removeEventListener('beforeunload', this._teardownBound);
            this._teardownBound = null;
          }
        },

        refreshIcons() {
          if (typeof this.$nextTick === 'function') {
            this.$nextTick(() => {
              if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons();
            });
          }
        },

        toast(message, type = 'info') {
          if (typeof window !== 'undefined' && window.PAE) {
            if (typeof window.PAE.toast === 'function') {
              window.PAE.toast(message, type);
            } else if (typeof window.PAE.showToast === 'function') {
              window.PAE.showToast(message, type);
            }
          }
        },

        getAuthHeaders(extra = {}) {
          const headers = { 'Content-Type': 'application/json', ...extra };
          try {
            if (typeof window !== 'undefined' && window.localStorage) {
              const apiKey = window.localStorage.getItem('pae_admin_api_key') || window.localStorage.getItem('pae_api_key');
              if (apiKey) headers['x-api-key'] = apiKey;
            }
          } catch (_) {}
          return headers;
        },

        async apiJson(url, options = {}) {
          const fetcher = (typeof window !== 'undefined' && (window.safeApiFetch || window.apiFetch)) || fetch;
          const res = await fetcher(url, {
            ...options,
            headers: this.getAuthHeaders(options.headers || {})
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            const msg = data?.message || data?.error || ('HTTP ' + res.status);
            throw new Error(msg);
          }
          return { status: res.status, data };
        },

        handleEscapeKey() {
          if (this.quickCampaignModalOpen) { this.closeQuickCampaignModal(); return; }
          if (this.basketCampaignModalOpen) { this.basketCampaignModalOpen = false; return; }
          if (this.promoteModalOpen) { this.promoteModalOpen = false; return; }
          if (this.dossierOpen) { this.dossierOpen = false; return; }
        },

        isRunActiveStatus(status) {
          const s = String(status || '').toLowerCase();
          return s === 'queued' || s === 'running';
        },

        maxClusterSelectableKeywords() {
          return Math.max((this.activeCluster?.keywords || []).length, 10000);
        },

        setExecutionMode(mode) {
          const m = ['auto', 'direct', 'fleet'].includes(String(mode || '').toLowerCase())
            ? String(mode).toLowerCase()
            : 'fleet';
          this.executionMode = m;
        },

        estimateScrollBudget() {
          let total = 0;
          if (this.huntPaths.search.enabled) total += Number(this.huntPaths.search.target_pins || 0);
          if (this.huntPaths.boards.enabled) {
            total += Number(this.huntPaths.boards.max_boards || 0) * Number(this.huntPaths.boards.target_pins_per_board || 0);
          }
          if (this.huntPaths.idea_page.enabled) total += Number(this.huntPaths.idea_page.target_pins || 0);
          if (this.huntPaths.home_feed.enabled) total += Number(this.huntPaths.home_feed.target_pins || 0);
          return total;
        },

        estimateClusterTotalBudget() {
          const count = Math.max(0, this.selectedClusterKeywords.length || 0);
          return this.estimateScrollBudget() * Math.max(1, count);
        },

        async lookupIdeaPage(rawTerm) {
          const clean = String(rawTerm || '').trim();
          const words = clean ? clean.split(/\\s+/).filter(Boolean) : [];
          if (
            !clean ||
            clean.length < 2 ||
            clean.length > 120 ||
            /[\\r\\n]/.test(clean) ||
            words.length > 12 ||
            /^\\d{10,30}$/.test(clean) ||
            /^https?:\\/\\//i.test(clean) ||
            /pinterest\\./i.test(clean)
          ) {
            this.ideaPageInfo = null;
            this.isLookingUpIdeaPage = false;
            return null;
          }
          const seq = ++this._ideaLookupSeq;
          this.isLookingUpIdeaPage = true;
          try {
            const params = new URLSearchParams({
              q: clean,
              country: this.launchpadCountry || 'US'
            });
            const { data } = await this.apiJson('/api/newborn/idea-intelligence?' + params.toString());
            if (seq === this._ideaLookupSeq) {
              this.ideaPageInfo = data && data.found ? data : null;
            }
            return data;
          } catch (_) {
            if (seq === this._ideaLookupSeq) this.ideaPageInfo = null;
            return null;
          } finally {
            if (seq === this._ideaLookupSeq) {
              this.isLookingUpIdeaPage = false;
              this.refreshIcons();
            }
          }
        },

        async refreshWorkspace(force = false) {
          await Promise.all([
            this.loadOverviewAndRuns(),
            this.loadCandidates(),
            this.loadCrossoverForActiveHunt()
          ]);
          if (force) this.toast('Workspace refreshed', 'success');
          this.refreshIcons();
        },

        syncSettingsToHeroControls(settings) {
          if (!settings) return;
          const q = settings.qualification || {};
          const d = settings.discovery || {};
          const s = d.surfaces || {};
          this.launchpadCountry = d.country || 'US';
          this.clusterForm.country = d.country || 'US';
          this.huntFilters.maxAgeDays = Number(q.max_age_days || 30);
          this.huntFilters.minRepins = Number(q.min_repin_count ?? 20);
          this.huntFilters.minSaves = Number(q.min_save_count ?? 0);

          if (s.pin_serp_capsules) {
            this.huntPaths.search.enabled = s.pin_serp_capsules.enabled !== false;
            this.huntPaths.search.target_pins = Number(s.pin_serp_capsules.target_pins || 500);
          }
          if (s.fresh_boards) {
            this.huntPaths.boards.enabled = s.fresh_boards.enabled !== false;
            this.huntPaths.boards.max_boards = Number(s.fresh_boards.max_boards || 10);
            this.huntPaths.boards.target_pins_per_board = Number(
              s.board_more_ideas?.target_pins_per_board || s.fresh_boards.target_pins_per_board || 100
            );
          }
          if (s.ideas_feeds) {
            this.huntPaths.idea_page.enabled = s.ideas_feeds.enabled !== false;
            this.huntPaths.idea_page.target_pins = Number(s.ideas_feeds.target_pins || 250);
          }
          if (s.home_feed) {
            this.huntPaths.home_feed.enabled = s.home_feed.enabled === true;
            this.huntPaths.home_feed.target_pins = Number(s.home_feed.target_pins || 250);
          }
          if (s.related_pin_snowball) {
            this.huntPaths.related.target_pins = Number(s.related_pin_snowball.target_pins || 200);
          }
        },

        applyWorkspaceDefaultsToHeroControls(wsSettings) {
          if (!wsSettings || typeof wsSettings !== 'object') return;
          if (wsSettings.max_pin_age_days != null && Number.isFinite(Number(wsSettings.max_pin_age_days))) {
            this.huntFilters.maxAgeDays = Math.max(1, Math.min(365, Number(wsSettings.max_pin_age_days)));
          }
          if (wsSettings.min_repin_count != null && Number.isFinite(Number(wsSettings.min_repin_count))) {
            this.huntFilters.minRepins = Math.max(0, Number(wsSettings.min_repin_count));
          }
          if (wsSettings.min_save_count != null && Number.isFinite(Number(wsSettings.min_save_count))) {
            this.huntFilters.minSaves = Math.max(0, Number(wsSettings.min_save_count));
          }
          if (wsSettings.execution_mode && ['auto', 'direct', 'fleet'].includes(String(wsSettings.execution_mode).toLowerCase())) {
            this.executionMode = String(wsSettings.execution_mode).toLowerCase();
          }
          const et = wsSettings.extraction_targets && typeof wsSettings.extraction_targets === 'object'
            ? wsSettings.extraction_targets
            : null;
          if (et) {
            if (et.search && typeof et.search === 'object') {
              if (typeof et.search.enabled === 'boolean') this.huntPaths.search.enabled = et.search.enabled;
              if (et.search.target_pins != null && Number.isFinite(Number(et.search.target_pins))) {
                this.huntPaths.search.target_pins = Number(et.search.target_pins);
              }
            }
            if (et.boards && typeof et.boards === 'object') {
              if (typeof et.boards.enabled === 'boolean') this.huntPaths.boards.enabled = et.boards.enabled;
              if (et.boards.max_boards != null && Number.isFinite(Number(et.boards.max_boards))) {
                this.huntPaths.boards.max_boards = Number(et.boards.max_boards);
              }
              if (et.boards.target_pins_per_board != null && Number.isFinite(Number(et.boards.target_pins_per_board))) {
                this.huntPaths.boards.target_pins_per_board = Number(et.boards.target_pins_per_board);
              }
            }
            if (et.idea_page && typeof et.idea_page === 'object') {
              if (typeof et.idea_page.enabled === 'boolean') this.huntPaths.idea_page.enabled = et.idea_page.enabled;
              if (et.idea_page.target_pins != null && Number.isFinite(Number(et.idea_page.target_pins))) {
                this.huntPaths.idea_page.target_pins = Number(et.idea_page.target_pins);
              }
            }
            if (et.home_feed && typeof et.home_feed === 'object') {
              if (typeof et.home_feed.enabled === 'boolean') this.huntPaths.home_feed.enabled = et.home_feed.enabled;
              if (et.home_feed.target_pins != null && Number.isFinite(Number(et.home_feed.target_pins))) {
                this.huntPaths.home_feed.target_pins = Number(et.home_feed.target_pins);
              }
            }
            const rel = et.related_pins || et.related;
            if (rel && typeof rel === 'object' && rel.target_pins != null && Number.isFinite(Number(rel.target_pins))) {
              this.huntPaths.related.target_pins = Number(rel.target_pins);
            }
          }
        },

        snapshotCurrentHuntControls() {
          return {
            huntFilters: cloneJson(this.huntFilters),
            huntPaths: cloneJson(this.huntPaths),
            executionMode: String(this.executionMode || 'fleet')
          };
        },

        hasHuntOverrides() {
          if (!this.workspaceHuntDefaults) return false;
          const d = this.workspaceHuntDefaults;
          const f = this.huntFilters;
          const p = this.huntPaths;
          return (
            Number(f.maxAgeDays) !== Number(d.huntFilters.maxAgeDays) ||
            Number(f.minRepins) !== Number(d.huntFilters.minRepins) ||
            Number(f.minSaves) !== Number(d.huntFilters.minSaves) ||
            Boolean(p.search.enabled) !== Boolean(d.huntPaths.search.enabled) ||
            Number(p.search.target_pins) !== Number(d.huntPaths.search.target_pins) ||
            Boolean(p.boards.enabled) !== Boolean(d.huntPaths.boards.enabled) ||
            Number(p.boards.max_boards) !== Number(d.huntPaths.boards.max_boards) ||
            Number(p.boards.target_pins_per_board) !== Number(d.huntPaths.boards.target_pins_per_board) ||
            Boolean(p.idea_page.enabled) !== Boolean(d.huntPaths.idea_page.enabled) ||
            Number(p.idea_page.target_pins) !== Number(d.huntPaths.idea_page.target_pins) ||
            Boolean(p.home_feed.enabled) !== Boolean(d.huntPaths.home_feed.enabled) ||
            Number(p.home_feed.target_pins) !== Number(d.huntPaths.home_feed.target_pins) ||
            Number(p.related.target_pins) !== Number(d.huntPaths.related.target_pins) ||
            String(this.executionMode || 'fleet') !== String(d.executionMode || 'fleet')
          );
        },

        resetHuntOverrides() {
          if (!this.workspaceHuntDefaults) return;
          this.huntFilters = cloneJson(this.workspaceHuntDefaults.huntFilters);
          this.huntPaths = cloneJson(this.workspaceHuntDefaults.huntPaths);
          this.executionMode = String(this.workspaceHuntDefaults.executionMode || 'fleet');
          this.refreshIcons();
        },

        buildExplicitHuntOverrides() {
          if (!this.workspaceHuntDefaults || !this.hasHuntOverrides()) return {};
          const d = this.workspaceHuntDefaults;
          const f = this.huntFilters;
          const p = this.huntPaths;
          const out = {};

          const filters = {};
          if (Number(f.maxAgeDays) !== Number(d.huntFilters.maxAgeDays)) {
            filters.max_age_days = Math.max(1, Math.min(365, Number(f.maxAgeDays) || 30));
          }
          if (Number(f.minRepins) !== Number(d.huntFilters.minRepins)) {
            const mr = Number(f.minRepins);
            filters.min_repin_count = Number.isFinite(mr) ? Math.max(0, mr) : 0;
          }
          if (Number(f.minSaves) !== Number(d.huntFilters.minSaves)) {
            const ms = Number(f.minSaves);
            filters.min_save_count = Number.isFinite(ms) ? Math.max(0, ms) : 0;
          }
          if (Object.keys(filters).length > 0) out.filters = filters;

          const paths = {};
          if (
            Boolean(p.search.enabled) !== Boolean(d.huntPaths.search.enabled) ||
            Number(p.search.target_pins) !== Number(d.huntPaths.search.target_pins)
          ) {
            paths.search = {
              enabled: Boolean(p.search.enabled),
              target_pins: Number(p.search.target_pins) || 500
            };
          }
          if (
            Boolean(p.boards.enabled) !== Boolean(d.huntPaths.boards.enabled) ||
            Number(p.boards.max_boards) !== Number(d.huntPaths.boards.max_boards) ||
            Number(p.boards.target_pins_per_board) !== Number(d.huntPaths.boards.target_pins_per_board)
          ) {
            paths.boards = {
              enabled: Boolean(p.boards.enabled),
              max_boards: Number(p.boards.max_boards) || 10,
              target_pins_per_board: Number(p.boards.target_pins_per_board) || 100
            };
          }
          if (
            Boolean(p.idea_page.enabled) !== Boolean(d.huntPaths.idea_page.enabled) ||
            Number(p.idea_page.target_pins) !== Number(d.huntPaths.idea_page.target_pins)
          ) {
            paths.idea_page = {
              enabled: Boolean(p.idea_page.enabled),
              target_pins: Number(p.idea_page.target_pins) || 250
            };
          }
          if (
            Boolean(p.home_feed.enabled) !== Boolean(d.huntPaths.home_feed.enabled) ||
            Number(p.home_feed.target_pins) !== Number(d.huntPaths.home_feed.target_pins)
          ) {
            paths.home_feed = {
              enabled: Boolean(p.home_feed.enabled),
              target_pins: Number(p.home_feed.target_pins) || 250
            };
          }
          if (Number(p.related.target_pins) !== Number(d.huntPaths.related.target_pins)) {
            paths.related = {
              target_pins: Number(p.related.target_pins) || 200
            };
          }
          if (Object.keys(paths).length > 0) out.paths = paths;
          return out;
        },

        activeHuntSummaryText() {
          const parts = [
            '<= ' + (Number(this.huntFilters.maxAgeDays) || 30) + 'd',
            '>= ' + (Number(this.huntFilters.minRepins) || 0) + ' rp'
          ];
          if (Number(this.huntFilters.minSaves) > 0) {
            parts.push('>= ' + Number(this.huntFilters.minSaves) + ' saves');
          }
          const paths = [];
          if (this.huntPaths.search.enabled) paths.push('Search ' + (Number(this.huntPaths.search.target_pins) || 500));
          if (this.huntPaths.boards.enabled) {
            paths.push('Boards ' + (Number(this.huntPaths.boards.max_boards) || 10) + 'x' + (Number(this.huntPaths.boards.target_pins_per_board) || 100));
          }
          if (this.huntPaths.idea_page.enabled) paths.push('Ideas ' + (Number(this.huntPaths.idea_page.target_pins) || 250));
          if (this.huntPaths.home_feed.enabled) paths.push('Home ' + (Number(this.huntPaths.home_feed.target_pins) || 250));
          if (paths.length > 0) parts.push(paths.join(', '));
          const modeLabel = this.executionMode === 'fleet' ? 'Fleet' : (this.executionMode === 'direct' ? 'Direct' : 'Auto');
          parts.push(modeLabel);
          return parts.join(' · ');
        },

        async loadSettingsAndProfiles() {
          try {
            const [nbRes, wsRes] = await Promise.all([
              this.apiJson('/api/newborn/settings'),
              this.apiJson('/api/workspaces/settings').catch(() => ({ data: null }))
            ]);
            const data = nbRes?.data || {};
            if (data.settings) {
              this.settingsDraft = cloneJson(data.settings);
              this.syncSettingsToHeroControls(data.settings);
            }
            const wsSettings = wsRes?.data?.settings || (wsRes?.data && wsRes.data.max_pin_age_days != null ? wsRes.data : null);
            if (wsSettings) {
              this.applyWorkspaceDefaultsToHeroControls(wsSettings);
            }
            this.workspaceHuntDefaults = this.snapshotCurrentHuntControls();
            if (data.schedule) this.scheduleStatus = data.schedule;
            if (data.cookie_status) this.cookieStatus = data.cookie_status;
            if (Array.isArray(data.surfaces_catalog)) this.surfacesCatalog = data.surfaces_catalog;
            if (Array.isArray(data.l1_interests_catalog)) this.l1InterestsCatalog = data.l1_interests_catalog;
            if (Array.isArray(data.supported_countries)) this.supportedCountries = data.supported_countries;
            if (Array.isArray(data.profiles)) this.profiles = data.profiles;
          } catch (_) {}
        },

        async loadOverviewAndRuns() {
          try {
            const overviewUrl = this.scopedFolderId
              ? ('/api/newborn/overview?folder_id=' + encodeURIComponent(this.scopedFolderId))
              : '/api/newborn/overview';
            const runsUrl = this.scopedFolderId
              ? ('/api/newborn/runs?limit=30&folder_id=' + encodeURIComponent(this.scopedFolderId))
              : '/api/newborn/runs?limit=30';
            const [ovRes, runsRes] = await Promise.all([
              this.apiJson(overviewUrl),
              this.apiJson(runsUrl)
            ]);
            this.overview = ovRes.data;
            if (ovRes.data?.cookie_status) this.cookieStatus = ovRes.data.cookie_status;
            if (ovRes.data?.automation_schedule) this.scheduleStatus = ovRes.data.automation_schedule;
            this.runs = Array.isArray(runsRes.data?.runs) ? runsRes.data.runs : [];
          } catch (_) {}
        },

        async loadFoldersList() {
          try {
            const { data } = await this.apiJson('/api/folders');
            this.foldersList = Array.isArray(data?.folders) ? data.folders : (Array.isArray(data) ? data : []);
            if (!this.targetCampaignFolderId && this.foldersList.length > 0) {
              this.targetCampaignFolderId = String(this.scopedFolderId || this.foldersList[0].id);
            }
          } catch (_) {}
        },

        handleCampaignDropdownChange(target, value) {
          if (value !== '__create_new__') return;
          this.quickCampaignTarget = target === 'promote' ? 'promote' : 'target';
          const fallbackId = this.foldersList.length > 0 ? String(this.foldersList[0].id) : '';
          if (this.quickCampaignTarget === 'promote') {
            this.quickCampaignPrevValue = this.promoteForm.folderId === '__create_new__' ? '' : (this.promoteForm.folderId || '');
            this.promoteForm.folderId = this.quickCampaignPrevValue;
          } else {
            this.quickCampaignPrevValue = this.targetCampaignFolderId === '__create_new__' ? fallbackId : (this.targetCampaignFolderId || fallbackId);
            this.targetCampaignFolderId = this.quickCampaignPrevValue;
          }
          this.quickCampaignName = '';
          this.quickCampaignModalOpen = true;
          this.refreshIcons();
        },

        closeQuickCampaignModal() {
          this.quickCampaignModalOpen = false;
          this.quickCampaignName = '';
        },

        async submitQuickCreateCampaign() {
          const name = String(this.quickCampaignName || '').trim();
          if (!name || this.isCreatingQuickCampaign) return;
          this.isCreatingQuickCampaign = true;
          try {
            const { data } = await this.apiJson('/api/folders', {
              method: 'POST',
              body: JSON.stringify({ name })
            });
            const created = data?.folder || data;
            const newId = created?.id ? String(created.id) : '';
            await this.loadFoldersList();
            if (newId) {
              this.targetCampaignFolderId = newId;
              if (this.quickCampaignTarget === 'promote' || this.promoteModalOpen) {
                this.promoteForm.folderId = newId;
              }
            }
            this.closeQuickCampaignModal();
            this.toast('Created campaign "' + name + '"', 'success');
          } catch (err) {
            this.toast('Create campaign failed: ' + err.message, 'error');
          } finally {
            this.isCreatingQuickCampaign = false;
            this.refreshIcons();
          }
        },

        async sendSelectedNewbornPinsToCampaign(pinIdsOverride = null) {
          const targetId = Number(this.targetCampaignFolderId || this.scopedFolderId || 0);
          if (!Number.isFinite(targetId) || targetId <= 0) {
            this.toast('Select a target campaign first', 'warning');
            return;
          }
          const pinIds = Array.isArray(pinIdsOverride) && pinIdsOverride.length > 0
            ? pinIdsOverride.map(String).filter(Boolean)
            : (this.selectedPinIds || []).map(String).filter(Boolean);
          if (pinIds.length === 0) {
            this.toast('Select at least one pin first', 'warning');
            return;
          }
          this.isSendingToCampaign = true;
          try {
            const { data } = await this.apiJson('/api/folders/' + encodeURIComponent(targetId) + '/tracked-pins', {
              method: 'POST',
              body: JSON.stringify({
                pin_ids: pinIds,
                source_type: 'newborn',
                source_ref: this.activeRunId ? ('run:' + this.activeRunId) : 'newborn_hunt'
              })
            });
            const campaignName = (this.foldersList || []).find((f) => Number(f.id) === targetId)?.name || ('Campaign #' + targetId);
            this.toast('Sent ' + (data?.added ?? data?.added_count ?? pinIds.length) + ' pin(s) to "' + campaignName + '" for daily tracking', 'success');
            this.selectedPinIds = [];
            await Promise.all([this.loadCandidates(), this.loadFoldersList()]);
          } catch (err) {
            this.toast('Send to campaign failed: ' + err.message, 'error');
          } finally {
            this.isSendingToCampaign = false;
            this.refreshIcons();
          }
        },

        async addClusterKeywordsToCampaign(keywordsOverride = null) {
          const targetId = Number(this.targetCampaignFolderId || this.scopedFolderId || 0);
          if (!Number.isFinite(targetId) || targetId <= 0) {
            this.toast('Select a target campaign first', 'warning');
            return;
          }
          const rawList = Array.isArray(keywordsOverride) && keywordsOverride.length > 0
            ? keywordsOverride
            : (this.selectedClusterKeywords || []);
          const cleanKeywords = Array.from(new Set(rawList.map((k) => String(k || '').trim()).filter(Boolean)));
          if (cleanKeywords.length === 0) {
            this.toast('Select at least one keyword first', 'warning');
            return;
          }
          this.isSendingToCampaign = true;
          try {
            const { data } = await this.apiJson('/api/folders/' + encodeURIComponent(targetId) + '/items', {
              method: 'POST',
              body: JSON.stringify({ keywords: cleanKeywords })
            });
            const campaignName = (this.foldersList || []).find((f) => Number(f.id) === targetId)?.name || ('Campaign #' + targetId);
            this.toast('Added ' + (data?.added_count ?? cleanKeywords.length) + ' keyword(s) to "' + campaignName + '"', 'success');
          } catch (err) {
            this.toast('Add to campaign failed: ' + err.message, 'error');
          } finally {
            this.isSendingToCampaign = false;
            this.refreshIcons();
          }
        },

        async switchView(view) {
          this._abortSlots('candidates', 'crossover', 'clusters');
          this.activeView = view;
          this.refreshIcons();
          try {
            if (view === 'hunt') {
              await Promise.all([this.loadCandidates(), this.loadCrossoverForActiveHunt()]);
            } else if (view === 'cluster') {
              await this.loadRecentClusters();
            } else if (view === 'history') {
              await this.loadOverviewAndRuns();
            }
          } finally {
            this.refreshIcons();
          }
        },

        // ---- Wave 6E Keyword Cluster Explorer Methods ----
        openClusterExplorerFromHero() {
          const seed = String(this.huntInput || '').trim();
          if (seed && !/^\\d{10,30}$/.test(seed) && !/^https?:\\/\\//i.test(seed)) {
            this.clusterForm.seed_keyword = seed;
          }
          this.switchView('cluster');
        },

        async loadRecentClusters() {
          try {
            const url = this.scopedFolderId
              ? ('/api/newborn/clusters?limit=15&folder_id=' + encodeURIComponent(this.scopedFolderId))
              : '/api/newborn/clusters?limit=15';
            const { data } = await this.apiJson(url);
            this.recentClusters = Array.isArray(data?.clusters) ? data.clusters : [];
          } catch (_) {}
        },

        async openSavedCluster(clusterId) {
          if (!clusterId) return;
          this.isBuildingCluster = true;
          try {
            const { data } = await this.apiJson('/api/newborn/clusters/' + encodeURIComponent(clusterId));
            if (data?.cluster) {
              this.activeCluster = data.cluster;
              this.clusterForm.seed_keyword = data.cluster.seed_keyword || '';
              this.clusterForm.country = data.cluster.country || 'US';
              this.clusterForm.l1_interest = data.cluster.l1_interest || 'all';
              this.selectedClusterKeywords = [];
              this.selectTopClusterKeywords(15);
            }
          } catch (err) {
            this.toast('Failed to load cluster: ' + err.message, 'error');
          } finally {
            this.isBuildingCluster = false;
            this.refreshIcons();
          }
        },

        async buildClusterNow() {
          const seed = String(this.clusterForm.seed_keyword || '').trim();
          if (!seed) return;
          this.isBuildingCluster = true;
          try {
            const excludeList = String(this.clusterForm.exclude_terms || '')
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);
            const { data } = await this.apiJson('/api/newborn/cluster/build', {
              method: 'POST',
              body: JSON.stringify({
                seed_keyword: seed,
                country: this.clusterForm.country || 'US',
                l1_interest: this.clusterForm.l1_interest || 'all',
                exclude_terms: excludeList,
                enrich_limit: 20
              })
            });
            const cluster = data?.cluster || data;
            this.activeCluster = cluster;
            this.selectedClusterKeywords = [];
            this.selectTopClusterKeywords(15);
            await this.loadRecentClusters();
            this.toast('Built cluster for "' + seed + '" (' + (cluster?.keyword_count || (cluster?.keywords || []).length) + ' keywords)', 'success');
          } catch (err) {
            this.toast('Cluster build failed: ' + err.message, 'error');
          } finally {
            this.isBuildingCluster = false;
            this.refreshIcons();
          }
        },

        getClusterPendingVolumeCount() {
          const list = Array.isArray(this.activeCluster?.keywords) ? this.activeCluster.keywords : [];
          return list.filter((k) =>
            (!k.volume_enriched && !k.volume_error) ||
            (k.volume_enriched && (!k.volume || Number(k.volume) <= 0) && !k.volume_rechecked_v2)
          ).length;
        },

        getClusterFailedVolumeCount() {
          const list = Array.isArray(this.activeCluster?.keywords) ? this.activeCluster.keywords : [];
          return list.filter((k) => Boolean(k.volume_error) && !k.volume_enriched).length;
        },

        stopEnrichingCluster() {
          this.enrichStopRequested = true;
        },

        async enrichClusterVolumesNow() {
          if (!this.activeCluster || !this.activeCluster.id || this.isEnrichingCluster) return;
          const initialPending = this.getClusterPendingVolumeCount();
          if (initialPending === 0) return;

          this.isEnrichingCluster = true;
          this.enrichStopRequested = false;
          this.enrichProgressDone = 0;
          this.enrichProgressTotal = initialPending;

          let totalEnriched = 0;
          let stoppedReason = '';
          try {
            while (!this.enrichStopRequested) {
              const pendingNow = this.getClusterPendingVolumeCount();
              if (pendingNow <= 0) break;

              const { data } = await this.apiJson('/api/newborn/cluster/enrich', {
                method: 'POST',
                body: JSON.stringify({
                  cluster_id: this.activeCluster.id,
                  batch_limit: 40
                })
              });
              const updated = data?.cluster || data;
              if (updated?.keywords) {
                this.activeCluster = { ...this.activeCluster, ...updated };
              }
              const newlyProcessed = Number(updated?.newly_enriched_count || 0);
              totalEnriched += newlyProcessed;
              const remainingNow = this.getClusterPendingVolumeCount();
              this.enrichProgressDone = Math.min(this.enrichProgressTotal, Math.max(this.enrichProgressDone + newlyProcessed, this.enrichProgressTotal - remainingNow));
              this.refreshIcons();

              if (updated?.rate_limited) {
                stoppedReason = 'rate_limited';
                break;
              }
              if (remainingNow >= pendingNow) {
                break;
              }
            }

            if (stoppedReason === 'rate_limited') {
              this.toast('Paused on Pinterest rate limit after enriching ' + totalEnriched + ' keywords. Click Retry Failed when ready.', 'warning');
            } else if (this.enrichStopRequested) {
              this.toast('Stopped after enriching ' + totalEnriched + ' keywords.', 'info');
            } else {
              const failed = this.getClusterFailedVolumeCount();
              this.toast(
                'Finished enriching ' + totalEnriched + ' keyword volumes' + (failed > 0 ? (' (' + failed + ' failed — retry available)') : ''),
                failed > 0 ? 'warning' : 'success'
              );
            }
          } catch (err) {
            this.toast('Volume enrichment stopped: ' + err.message, 'error');
          } finally {
            this.isEnrichingCluster = false;
            this.enrichStopRequested = false;
            this.refreshIcons();
          }
        },

        async retryClusterVolume(keyword) {
          const clean = String(keyword || '').trim();
          if (!clean || !this.activeCluster || !this.activeCluster.id || this.isEnrichingCluster) return;
          this.retryingClusterKeyword = clean;
          try {
            const { data } = await this.apiJson('/api/newborn/cluster/enrich', {
              method: 'POST',
              body: JSON.stringify({
                cluster_id: this.activeCluster.id,
                retry_keywords: [clean],
                batch_limit: 1
              })
            });
            const updated = data?.cluster || data;
            if (updated?.keywords) {
              this.activeCluster = { ...this.activeCluster, ...updated };
            }
            const row = (this.activeCluster?.keywords || []).find((k) => String(k.keyword || '').toLowerCase() === clean.toLowerCase());
            if (row?.volume_error) {
              this.toast('Retry failed for "' + clean + '": ' + (row.volume_error_reason || 'Network error'), 'warning');
            } else {
              this.toast('Refreshed volume for "' + clean + '"', 'success');
            }
          } catch (err) {
            this.toast('Retry failed: ' + err.message, 'error');
          } finally {
            this.retryingClusterKeyword = '';
            this.refreshIcons();
          }
        },

        async retryFailedClusterVolumes() {
          if (!this.activeCluster || !this.activeCluster.id || this.isEnrichingCluster) return;
          const initialFailed = this.getClusterFailedVolumeCount();
          if (initialFailed === 0) return;

          this.isEnrichingCluster = true;
          this.enrichStopRequested = false;
          this.enrichProgressDone = 0;
          this.enrichProgressTotal = initialFailed;

          let recovered = 0;
          try {
            const failedTerms = (this.activeCluster.keywords || [])
              .filter((k) => Boolean(k.volume_error) && !k.volume_enriched)
              .map((k) => k.keyword);
            for (let i = 0; i < failedTerms.length && !this.enrichStopRequested; i += 40) {
              const chunk = failedTerms.slice(i, i + 40);
              const { data } = await this.apiJson('/api/newborn/cluster/enrich', {
                method: 'POST',
                body: JSON.stringify({
                  cluster_id: this.activeCluster.id,
                  retry_keywords: chunk,
                  batch_limit: chunk.length
                })
              });
              const updated = data?.cluster || data;
              if (updated?.keywords) {
                this.activeCluster = { ...this.activeCluster, ...updated };
              }
              recovered += Number(updated?.newly_enriched_count || 0);
              this.enrichProgressDone = Math.min(this.enrichProgressTotal, i + chunk.length);
              if (updated?.rate_limited) break;
            }
            this.toast('Retried failed volumes — recovered ' + recovered + ' keyword(s)', recovered > 0 ? 'success' : 'warning');
          } catch (err) {
            this.toast('Retry failed volumes error: ' + err.message, 'error');
          } finally {
            this.isEnrichingCluster = false;
            this.enrichStopRequested = false;
            this.refreshIcons();
          }
        },

        countClusterBySource(group) {
          const list = Array.isArray(this.activeCluster?.keywords) ? this.activeCluster.keywords : [];
          return list.filter((kw) => {
            const srcs = Array.isArray(kw.sources) ? kw.sources : [];
            if (group === 'trends') return srcs.includes('trends');
            if (group === 'typeahead') return srcs.includes('typeahead');
            if (group === 'idea_page') return srcs.includes('related_interest') || srcs.includes('idea_pivot') || Boolean(kw.is_related_interest);
            return false;
          }).length;
        },

        getClusterRowSourceBadges(kw) {
          const out = [];
          const tabs = Array.isArray(kw?.trend_tabs) ? kw.trend_tabs : [];
          for (const t of tabs) {
            out.push(t.charAt(0).toUpperCase() + t.slice(1));
          }
          const srcs = Array.isArray(kw?.sources) ? kw.sources : [];
          if (srcs.includes('typeahead')) out.push('Typeahead');
          if (srcs.includes('related_interest') || srcs.includes('idea_pivot')) out.push('Idea Page');
          if (out.length === 0 && srcs.includes('seed')) out.push('Seed');
          return Array.from(new Set(out));
        },

        getFilteredClusterKeywords() {
          const raw = Array.isArray(this.activeCluster?.keywords) ? this.activeCluster.keywords : [];
          const q = String(this.clusterFilters.q || '').trim().toLowerCase();
          const src = String(this.clusterFilters.source || 'all');
          const taxOnly = Boolean(this.clusterFilters.taxonomyOnly);
          const minVol = Number(this.clusterFilters.minVolume || 0);

          const filtered = raw.filter((kw) => {
            if (q && !String(kw.keyword || '').toLowerCase().includes(q)) return false;
            if (taxOnly && !kw.has_taxonomy) return false;
            if (minVol > 0 && Number(kw.volume || 0) < minVol) return false;
            const srcs = Array.isArray(kw.sources) ? kw.sources : [];
            if (src === 'trends' && !srcs.includes('trends')) return false;
            if (src === 'typeahead' && !srcs.includes('typeahead')) return false;
            if (src === 'idea_page' && !srcs.includes('related_interest') && !srcs.includes('idea_pivot') && !kw.is_related_interest) return false;
            return true;
          });

          const sortBy = String(this.clusterFilters.sort || 'score');
          return [...filtered].sort((a, b) => {
            if (sortBy === 'volume') return Number(b.volume ?? -1) - Number(a.volume ?? -1);
            if (sortBy === 'monthly') return Number(b.monthly_change ?? -9999) - Number(a.monthly_change ?? -9999);
            if (sortBy === 'weekly') return Number(b.weekly_change ?? -9999) - Number(a.weekly_change ?? -9999);
            return Number(b.cluster_score ?? 0) - Number(a.cluster_score ?? 0);
          });
        },

        toggleClusterKeyword(term) {
          const clean = String(term || '').trim();
          if (!clean) return;
          const lower = clean.toLowerCase();
          if (this.selectedClusterKeywords.some((t) => String(t || '').toLowerCase() === lower)) {
            this.selectedClusterKeywords = this.selectedClusterKeywords.filter((t) => String(t || '').toLowerCase() !== lower);
            this.clusterBasket = (this.clusterBasket || []).filter((k) => String(k || '').trim().toLowerCase() !== lower);
          } else {
            this.selectedClusterKeywords = [...this.selectedClusterKeywords, clean];
            this.addKeywordsToBasket([clean]);
          }
        },

        _syncClusterSelectionToBasket(nextSelected) {
          const activeClusterTermsLower = new Set(
            (Array.isArray(this.activeCluster?.keywords) ? this.activeCluster.keywords : [])
              .map((k) => String(k?.keyword || '').trim().toLowerCase())
              .filter(Boolean)
          );
          const preservedExternal = (this.clusterBasket || []).filter(
            (k) => !activeClusterTermsLower.has(String(k || '').trim().toLowerCase())
          );
          const merged = [];
          const seen = new Set();
          for (const item of [...preservedExternal, ...nextSelected]) {
            const clean = String(item || '').trim();
            if (!clean) continue;
            const lower = clean.toLowerCase();
            if (seen.has(lower)) continue;
            seen.add(lower);
            merged.push(clean);
          }
          this.selectedClusterKeywords = [...nextSelected];
          this.clusterBasket = merged;
          this.refreshIcons();
        },

        selectTopClusterKeywords(n = 15) {
          const cap = Math.max(1, Number(n) || 15);
          const picked = this.getFilteredClusterKeywords().slice(0, cap).map((k) => k.keyword);
          this._syncClusterSelectionToBasket(picked);
        },

        selectAllClusterKeywords() {
          const picked = this.getFilteredClusterKeywords().map((k) => k.keyword);
          this._syncClusterSelectionToBasket(picked);
        },

        clearClusterSelection() {
          this._syncClusterSelectionToBasket([]);
        },

        // --- Cluster Basket Helpers (Two-Way Synced with Cluster Explorer & Trends) ---
        isInBasket(term) {
          const norm = String(term || '').trim().toLowerCase();
          if (!norm) return false;
          return (this.clusterBasket || []).some((k) => String(k || '').trim().toLowerCase() === norm);
        },

        toggleBasketKeyword(term) {
          const clean = String(term || '').trim();
          if (!clean) return;
          if (this.isInBasket(clean)) {
            this.removeFromBasket(clean);
          } else {
            this.addKeywordsToBasket([clean]);
          }
        },

        addKeywordsToBasket(terms) {
          const list = Array.isArray(terms) ? terms : [terms];
          const existingLower = new Set((this.clusterBasket || []).map((k) => String(k || '').trim().toLowerCase()));
          const next = [...(this.clusterBasket || [])];
          const clusterMap = new Map(
            (Array.isArray(this.activeCluster?.keywords) ? this.activeCluster.keywords : [])
              .map((k) => [String(k?.keyword || '').trim().toLowerCase(), k.keyword])
          );
          const selectedLower = new Set((this.selectedClusterKeywords || []).map((k) => String(k || '').trim().toLowerCase()));
          const nextSelected = [...(this.selectedClusterKeywords || [])];

          for (const raw of list) {
            const clean = String(raw || '').trim();
            if (!clean) continue;
            const lower = clean.toLowerCase();
            if (!existingLower.has(lower)) {
              existingLower.add(lower);
              next.push(clean);
            }
            if (clusterMap.has(lower) && !selectedLower.has(lower)) {
              selectedLower.add(lower);
              nextSelected.push(clusterMap.get(lower));
            }
          }
          this.clusterBasket = next;
          this.selectedClusterKeywords = nextSelected;
          this.refreshIcons();
        },

        removeFromBasket(term) {
          const norm = String(term || '').trim().toLowerCase();
          this.clusterBasket = (this.clusterBasket || []).filter((k) => String(k || '').trim().toLowerCase() !== norm);
          this.selectedClusterKeywords = (this.selectedClusterKeywords || []).filter((k) => String(k || '').trim().toLowerCase() !== norm);
        },

        clearBasket() {
          this.clusterBasket = [];
          this.selectedClusterKeywords = [];
        },

        addManualBasketKeyword() {
          const raw = String(this.basketManualInput || '').trim();
          if (!raw) return;
          const parts = raw.split(/[,\\n]+/).map((s) => s.trim()).filter(Boolean);
          this.addKeywordsToBasket(parts);
          this.basketManualInput = '';
        },

        openBasketCampaignModal() {
          if (!this.clusterBasket || this.clusterBasket.length === 0) return;
          if (!this.basketCampaignForm.newName) {
            const seed = String(this.huntInput || this.clusterBasket[0] || 'New Campaign').trim();
            this.basketCampaignForm.newName = seed.slice(0, 60);
          }
          if (!this.basketCampaignForm.existingFolderId && Array.isArray(this.foldersList) && this.foldersList.length > 0) {
            this.basketCampaignForm.existingFolderId = this.foldersList[0].id;
          }
          this.basketCampaignModalOpen = true;
          this.refreshIcons();
        },

        openSingleKeywordCampaignModal(rawTerm) {
          const clean = String(rawTerm || '').trim();
          if (!clean) return;
          const exists = (this.clusterBasket || []).some((k) => String(k || '').trim().toLowerCase() === clean.toLowerCase());
          if (!exists) {
            this.clusterBasket.push(clean);
          }
          this.openBasketCampaignModal();
        },

        async launchBasketQuickHunt() {
          if (!this.clusterBasket || this.clusterBasket.length === 0) return;
          this.isLaunchingBasketHunt = true;
          try {
            const picked = Array.from(new Set(this.clusterBasket.map((k) => String(k || '').trim()).filter(Boolean)));
            const payload = {
              keywords: picked,
              cluster_id: this.activeCluster?.id || null,
              folder_id: this.scopedFolderId || undefined,
              execution_mode: this.executionMode || 'fleet',
              shards: Math.max(1, Math.min(20, Number(this.fleetShards) || 20)),
              ...this.buildExplicitHuntOverrides()
            };
            const { data } = await this.apiJson('/api/newborn/cluster/hunt', {
              method: 'POST',
              body: JSON.stringify(payload)
            });
            const runId = data?.run_id || data?.run?.id || null;
            this.activeView = 'hunt';
            if (runId) {
              this.activeRunId = runId;
              this.activeRun = data.run || { id: runId, status: 'queued', progress_pct: 5 };
              this.startPollingRun(runId);
            }
            await Promise.all([this.loadOverviewAndRuns(), this.loadCandidates(true)]);
            this.toast('Launched Quick Newborn Hunt for ' + picked.length + ' basket keywords', 'success');
          } catch (err) {
            this.toast('Quick Hunt failed: ' + err.message, 'error');
          } finally {
            this.isLaunchingBasketHunt = false;
            this.refreshIcons();
          }
        },

        async submitBasketToCampaign() {
          if (!this.clusterBasket || this.clusterBasket.length === 0) return;
          const keywords = Array.from(new Set(
            this.clusterBasket
              .map((kw) => String(kw || '').trim())
              .filter(Boolean)
          ));
          if (keywords.length === 0) {
            this.toast('Add at least one valid keyword to the Cluster Basket first.', 'warning');
            return;
          }

          this.isSubmittingBasketCampaign = true;
          try {
            const topN = Math.max(5, Math.min(100, Number(this.basketCampaignForm.serpTopN) || 30));
            let targetFolderId = this.basketCampaignForm.existingFolderId;

            if (this.basketCampaignForm.mode === 'new') {
              const name = String(this.basketCampaignForm.newName || '').trim();
              if (!name) {
                this.toast('Enter a Campaign Name first.', 'warning');
                return;
              }
              const { data: created } = await this.apiJson('/api/folders', {
                method: 'POST',
                body: JSON.stringify({ name, serp_top_n: topN })
              });
              targetFolderId = created?.folder?.id || created?.id || null;
              if (!targetFolderId) throw new Error('Failed to create campaign folder');
              // Reuse newly created campaign if a subsequent step fails and user retries
              this.basketCampaignForm.mode = 'existing';
              this.basketCampaignForm.existingFolderId = String(targetFolderId);
              await this.loadFoldersList();
              this.targetCampaignFolderId = String(targetFolderId);
            } else {
              if (!targetFolderId) {
                this.toast('Select an existing campaign.', 'warning');
                return;
              }
              await this.apiJson('/api/folders/' + encodeURIComponent(targetFolderId), {
                method: 'PATCH',
                body: JSON.stringify({ serp_top_n: topN })
              });
            }

            // Add all basket keywords to the target campaign (matching POST /api/folders/:id/items { keywords })
            await this.apiJson('/api/folders/' + encodeURIComponent(targetFolderId) + '/items', {
              method: 'POST',
              body: JSON.stringify({ keywords })
            });

            if (this.basketCampaignForm.trackTopNDaily) {
              try {
                await this.apiJson('/api/folders/' + encodeURIComponent(targetFolderId) + '/tracked-pins/sync-top-n', {
                  method: 'POST',
                  body: JSON.stringify({ top_n: topN })
                });
              } catch (syncErr) {
                this.toast('Campaign saved, but Top ' + topN + ' daily sync failed: ' + (syncErr?.message || 'unknown error'), 'warning');
              }
            }

            if (this.basketCampaignForm.runNewbornDeepHunt) {
              const { data: huntData } = await this.apiJson('/api/newborn/cluster/hunt', {
                method: 'POST',
                body: JSON.stringify({
                  keywords,
                  folder_id: targetFolderId,
                  execution_mode: this.executionMode || 'fleet',
                  shards: Math.max(1, Math.min(20, Number(this.fleetShards) || 20)),
                  ...this.buildExplicitHuntOverrides()
                })
              });
              const runId = huntData?.run_id || huntData?.run?.id || null;
              if (runId) {
                this.activeRunId = runId;
                this.activeRun = huntData.run || { id: runId, status: 'queued', progress_pct: 5 };
                this.startPollingRun(runId);
              }
            }

            this.basketCampaignModalOpen = false;
            this.clearBasket();
            await this.loadFoldersList();
            this.toast('Saved ' + keywords.length + ' keywords to Campaign (Top ' + topN + ' Daily)', 'success');
          } catch (err) {
            this.toast('Campaign save failed: ' + err.message, 'error');
          } finally {
            this.isSubmittingBasketCampaign = false;
            this.refreshIcons();
          }
        },

        async huntSingleClusterKeyword(term) {
          const clean = String(term || '').trim();
          if (!clean) return;
          this.huntInput = clean;
          this.lookupIdeaPage(clean);
          await this.runFocusedHunt(clean);
        },

        async launchClusterHunt() {
          const picked = Array.from(new Set((this.selectedClusterKeywords || []).map((k) => String(k || '').trim()).filter(Boolean)));
          if (picked.length === 0) return;
          const hasAnyPath = this.huntPaths.search.enabled || this.huntPaths.boards.enabled || this.huntPaths.idea_page.enabled || this.huntPaths.home_feed.enabled;
          if (!hasAnyPath) {
            this.toast('Enable at least one extraction path above before launching a cluster hunt.', 'warning');
            return;
          }

          this.isLaunchingClusterHunt = true;
          try {
            const payload = {
              cluster_id: this.activeCluster?.id || null,
              keywords: picked,
              execution_mode: this.executionMode || 'fleet',
              shards: Math.max(1, Math.min(20, Number(this.fleetShards) || 20)),
              profile_id: this.selectedProfileId || null,
              folder_id: this.scopedFolderId ? Number(this.scopedFolderId) : null,
              ...this.buildExplicitHuntOverrides()
            };
            const { data } = await this.apiJson('/api/newborn/cluster/hunt', {
              method: 'POST',
              body: JSON.stringify(payload)
            });

            if (data?.run_id) {
              const mode = data.execution_mode || data.run?.execution_mode || 'direct';
              this.activeRunId = Number(data.run_id);
              this.activeRun = data.run || {
                id: this.activeRunId,
                run_type: 'discovery',
                execution_mode: mode,
                status: mode === 'fleet' ? 'queued' : 'running',
                progress_stage: 'queued',
                progress_detail: mode === 'fleet'
                  ? ('Queued on GitHub Actions Fleet (' + (data.shards_total || this.fleetShards) + ' shards) for ' + picked.length + ' keywords...')
                  : ('Queued — hunting ' + picked.length + ' cluster keywords...'),
                progress_pct: 5,
                shards_total: Number(data.shards_total || (mode === 'fleet' ? this.fleetShards : 1)),
                shards_completed: 0,
                shards_failed: 0,
                seed_queries: picked
              };
              this.activeView = 'hunt';
              this.showRunCompleteBanner = false;
              this.selectedPinIds = [];
              this.filters.annotation = '';
              this.startPollingRun(this.activeRunId);
              this.toast(
                (mode === 'fleet' ? 'Fleet Cluster Hunt #' : 'Cluster Hunt #') + this.activeRunId + ' launched for ' + picked.length + ' keywords',
                'success'
              );
            }
          } catch (err) {
            this.toast('Cluster hunt failed: ' + err.message, 'error');
          } finally {
            this.isLaunchingClusterHunt = false;
            this.refreshIcons();
          }
        },

        async selectPastRun(run) {
          if (!run || !run.id) return;
          this.activeRunId = Number(run.id);
          this.activeRun = run;
          this.showRunCompleteBanner = false;
          this.activeView = 'hunt';
          this.selectedPinIds = [];
          this.filters.annotation = '';
          if (this.isRunActiveStatus(run.status)) {
            this.startPollingRun(this.activeRunId);
          }
          await Promise.all([this.loadCandidates(true), this.loadCrossoverForActiveHunt()]);
          this.refreshIcons();
        },

        async reconnectToRun(run) {
          if (!run || !run.id) return;
          this.activeRunId = Number(run.id);
          this.activeRun = run;
          this.showRunCompleteBanner = false;
          this.activeView = 'hunt';
          this.startPollingRun(this.activeRunId);
          this.toast('Reconnected to Hunt #' + this.activeRunId, 'info');
          this.refreshIcons();
        },

        async cancelActiveRun() {
          if (!this.activeRun || !this.activeRun.id || this.cancellingRun) return;
          const runId = Number(this.activeRun.id);
          this.cancellingRun = true;
          try {
            const { data } = await this.apiJson('/api/newborn/runs/' + encodeURIComponent(runId) + '/cancel', {
              method: 'POST',
              body: JSON.stringify({})
            });
            const cancelPatch = data?.run || (data?.status ? {
              status: data.status,
              progress_stage: data.status,
              cancel_requested_at: data.cancel_requested_at || new Date().toISOString()
            } : null);
            if (cancelPatch) {
              this.activeRun = {
                ...this.activeRun,
                ...cancelPatch
              };
            }
            if (!this.isRunActiveStatus(this.activeRun?.status)) {
              this.stopPollingRun();
              this.showRunCompleteBanner = true;
              await Promise.all([this.loadOverviewAndRuns(), this.loadCandidates(), this.loadCrossoverForActiveHunt()]);
            }
            this.toast('Cancellation requested for Hunt #' + runId, 'info');
          } catch (err) {
            this.toast('Cancel failed: ' + err.message, 'error');
          } finally {
            this.cancellingRun = false;
            this.refreshIcons();
          }
        },

        async clearRunScope() {
          this.activeRunId = null;
          this.selectedPinIds = [];
          this.filters.annotation = '';
          await Promise.all([this.loadCandidates(true), this.loadCrossoverForActiveHunt()]);
          this.refreshIcons();
        },

        setLinkFilter(mode) {
          const clean = (mode === 'linkless' || mode === 'linked') ? mode : 'all';
          if (this.filters.linkFilter === clean) return;
          this.filters.linkFilter = clean;
          this.filters.linklessOnly = clean === 'linkless';
          this.onCandidateFilterChange();
        },

        failedOrEmptyRunsCount() {
          return (this.runs || []).filter((r) => {
            if (!r || this.isRunActiveStatus(r.status)) return false;
            const st = String(r.status || '').toLowerCase();
            if (st === 'failed' || st === 'cancelled' || st === 'error') return true;
            const funnel = this.getRunFunnel(r);
            return Number(funnel?.verifiedWinners || 0) === 0 && Number(r.candidates_qualified || 0) === 0;
          }).length;
        },

        isRunSelected(runId) {
          const id = Number(runId);
          return Number.isInteger(id) && (this.selectedRunIds || []).includes(id);
        },

        toggleRunSelection(runId) {
          const id = Number(runId);
          if (!Number.isInteger(id) || id <= 0) return;
          this.confirmBulkDeleteRuns = false;
          if ((this.selectedRunIds || []).includes(id)) {
            this.selectedRunIds = (this.selectedRunIds || []).filter((x) => x !== id);
          } else {
            this.selectedRunIds = [...(this.selectedRunIds || []), id];
          }
        },

        areAllVisibleRunsSelected() {
          const deletable = (this.runs || []).filter((r) => r && r.id && !this.isRunActiveStatus(r.status)).map((r) => Number(r.id));
          if (deletable.length === 0) return false;
          return deletable.every((id) => (this.selectedRunIds || []).includes(id));
        },

        toggleSelectAllRuns() {
          this.confirmBulkDeleteRuns = false;
          const deletable = (this.runs || []).filter((r) => r && r.id && !this.isRunActiveStatus(r.status)).map((r) => Number(r.id));
          if (this.areAllVisibleRunsSelected()) {
            this.selectedRunIds = [];
          } else {
            this.selectedRunIds = deletable;
          }
        },

        async deleteSelectedRuns() {
          const ids = Array.from(new Set((this.selectedRunIds || []).map(Number).filter((n) => Number.isInteger(n) && n > 0)));
          if (ids.length === 0 || this.isBulkDeletingRuns) return;
          if (!this.confirmBulkDeleteRuns) {
            this.confirmBulkDeleteRuns = true;
            return;
          }
          this.isBulkDeletingRuns = true;
          try {
            const { data } = await this.apiJson('/api/newborn/runs/bulk-delete', {
              method: 'POST',
              body: JSON.stringify({ run_ids: ids })
            });
            const deletedIds = Array.isArray(data?.deleted_run_ids) ? data.deleted_run_ids.map(Number) : ids;
            const deletedCount = Number(data?.deleted_runs ?? deletedIds.length);
            const pruned = Number(data?.orphans_pruned || 0);
            this.selectedRunIds = [];
            this.confirmBulkDeleteRuns = false;
            if (this.activeRunId && deletedIds.includes(Number(this.activeRunId))) {
              this.activeRunId = null;
              this.activeRun = null;
            }
            this.toast('Deleted ' + deletedCount + ' selected hunt' + (deletedCount === 1 ? '' : 's') + (pruned > 0 ? (' (' + pruned + ' orphan pins cleaned)') : ''), 'success');
            await Promise.all([this.loadOverviewAndRuns(), this.loadCandidates(true), this.loadCrossoverForActiveHunt()]);
          } catch (err) {
            this.toast('Bulk delete failed: ' + err.message, 'error');
          } finally {
            this.isBulkDeletingRuns = false;
            this.refreshIcons();
          }
        },

        async deletePastRun(run) {
          if (!run || !run.id || this.isRunActiveStatus(run.status)) return;
          const runId = Number(run.id);
          if (this.confirmDeleteRunId !== runId) {
            this.confirmDeleteRunId = runId;
            return;
          }
          this.deletingRunId = runId;
          try {
            const { data } = await this.apiJson('/api/newborn/runs/' + encodeURIComponent(runId), {
              method: 'DELETE'
            });
            this.confirmDeleteRunId = null;
            this.selectedRunIds = (this.selectedRunIds || []).filter((id) => id !== runId);
            if (Number(this.activeRunId) === runId) {
              this.activeRunId = null;
              this.activeRun = null;
            }
            const pruned = Number(data?.orphans_pruned || 0);
            this.toast('Deleted Hunt #' + runId + (pruned > 0 ? (' (' + pruned + ' orphan pins cleaned)') : ''), 'success');
            await Promise.all([this.loadOverviewAndRuns(), this.loadCandidates(true), this.loadCrossoverForActiveHunt()]);
          } catch (err) {
            this.toast('Delete failed: ' + err.message, 'error');
          } finally {
            this.deletingRunId = null;
            this.refreshIcons();
          }
        },

        async clearFailedAndEmptyRuns() {
          if (this.isClearingRuns) return;
          this.isClearingRuns = true;
          try {
            const { data } = await this.apiJson('/api/newborn/runs/clear-empty', {
              method: 'POST',
              body: JSON.stringify({
                folder_id: this.scopedFolderId || null
              })
            });
            const deletedRuns = Number(data?.deleted_runs || 0);
            const deletedIds = Array.isArray(data?.deleted_run_ids) ? data.deleted_run_ids.map(Number) : [];
            if (this.activeRunId && deletedIds.includes(Number(this.activeRunId))) {
              this.activeRunId = null;
              this.activeRun = null;
            }
            this.confirmDeleteRunId = null;
            this.toast(
              deletedRuns > 0
                ? ('Cleared ' + deletedRuns + ' failed/empty hunt' + (deletedRuns === 1 ? '' : 's'))
                : 'No failed or empty hunts to clear.',
              deletedRuns > 0 ? 'success' : 'info'
            );
            await Promise.all([this.loadOverviewAndRuns(), this.loadCandidates(true), this.loadCrossoverForActiveHunt()]);
          } catch (err) {
            this.toast('Clear hunts failed: ' + err.message, 'error');
          } finally {
            this.isClearingRuns = false;
            this.refreshIcons();
          }
        },

        toggleFilterFlag(key) {
          this.filters[key] = !this.filters[key];
          if (key === 'linklessOnly') {
            this.filters.linkFilter = this.filters.linklessOnly ? 'linkless' : 'all';
          }
          this.onCandidateFilterChange();
        },

        onCandidateFilterChange() {
          return Promise.all([
            this.loadCandidates(true),
            this.loadCrossoverForActiveHunt()
          ]);
        },

        selectAnnotationFilter(tag) {
          const clean = String(tag || '').trim();
          if (!clean) return;
          if (this.filters.annotation && this.filters.annotation.toLowerCase() === clean.toLowerCase()) {
            this.filters.annotation = '';
          } else {
            this.filters.annotation = clean;
          }
          this.loadCandidates(true);
        },

        toggleAnnotationsCrossover() {
          this.showAnnotationsCrossover = !this.showAnnotationsCrossover;
          this.refreshIcons();
        },

        toggleColumnSort(column) {
          const current = String(this.filters.sort || 'repins');
          if (column === 'age') {
            this.filters.sort = current === 'fresh' ? 'age_desc' : 'fresh';
          } else if (column === 'repins') {
            this.filters.sort = current === 'repins' ? 'repins_asc' : 'repins';
          }
          this.loadCandidates(true);
        },

        isColumnSortActive(column) {
          const s = String(this.filters.sort || 'repins');
          if (column === 'age') return s === 'fresh' || s === 'age_desc';
          if (column === 'repins') return s === 'repins' || s === 'repins_asc';
          return false;
        },

        getColumnSortDirection(column) {
          const s = String(this.filters.sort || 'repins');
          if (column === 'age') return s === 'age_desc' ? 'desc' : (s === 'fresh' ? 'asc' : '');
          if (column === 'repins') return s === 'repins_asc' ? 'asc' : (s === 'repins' ? 'desc' : '');
          return '';
        },

        isPinAnnotationsExpanded(pinId) {
          return Boolean(pinId && this.expandedPinAnnotations[pinId]);
        },

        togglePinAnnotations(pinId) {
          if (!pinId) return;
          this.expandedPinAnnotations = {
            ...this.expandedPinAnnotations,
            [pinId]: !this.expandedPinAnnotations[pinId]
          };
        },

        getVisiblePinAnnotationNames(pin, cap = 3) {
          const all = this.extractPinAnnotationNames(pin);
          if (this.isPinAnnotationsExpanded(pin?.pin_id)) return all;
          return all.slice(0, cap);
        },

        getHiddenPinAnnotationCount(pin, cap = 3) {
          const all = this.extractPinAnnotationNames(pin);
          return Math.max(0, all.length - cap);
        },

        buildCandidateFilterParams({ limit = null, offset = null } = {}) {
          const params = new URLSearchParams();
          if (this.activeRunId) params.set('run_id', String(this.activeRunId));
          if (this.scopedFolderId && !this.activeRunId) params.set('folder_id', String(this.scopedFolderId));
          if (this.filters.linkFilter && this.filters.linkFilter !== 'all') {
            params.set('link_filter', String(this.filters.linkFilter));
          } else if (this.filters.linklessOnly) {
            params.set('link_filter', 'linkless');
          }
          if (this.filters.surface) params.set('surface', String(this.filters.surface));
          if (this.filters.creationMethod) params.set('creation_method', String(this.filters.creationMethod));
          if (this.filters.repinFilter) params.set('repin_filter', String(this.filters.repinFilter));
          if (this.filters.annotation && this.filters.annotation.trim()) params.set('annotation', this.filters.annotation.trim());
          if (this.filters.search && this.filters.search.trim()) params.set('search', this.filters.search.trim());
          params.set('sort', this.filters.sort || 'repins');
          const effLimit = Math.min(500, Math.max(1, Number(limit ?? this.candidatesPageSize) || 100));
          const effOffset = Math.max(0, Number(offset ?? this.candidatesOffset) || 0);
          params.set('limit', String(effLimit));
          params.set('offset', String(effOffset));
          return params;
        },

        candidatesRangeStart() {
          return this.candidatesTotal > 0 ? (Number(this.candidatesOffset || 0) + 1) : 0;
        },

        candidatesRangeEnd() {
          return Math.min(Number(this.candidatesTotal || 0), Number(this.candidatesOffset || 0) + this.candidates.length);
        },

        hasPrevCandidatesPage() {
          return Number(this.candidatesOffset || 0) > 0;
        },

        hasNextCandidatesPage() {
          return (Number(this.candidatesOffset || 0) + Number(this.candidatesPageSize || 100)) < Number(this.candidatesTotal || 0);
        },

        prevCandidatesPage() {
          if (!this.hasPrevCandidatesPage()) return;
          this.candidatesOffset = Math.max(0, Number(this.candidatesOffset || 0) - Number(this.candidatesPageSize || 100));
          this.selectedPinIds = [];
          return this.loadCandidates(false);
        },

        nextCandidatesPage() {
          if (!this.hasNextCandidatesPage()) return;
          this.candidatesOffset = Number(this.candidatesOffset || 0) + Number(this.candidatesPageSize || 100);
          this.selectedPinIds = [];
          return this.loadCandidates(false);
        },

        changeCandidatesPageSize(nextSize = null) {
          if (nextSize != null) this.candidatesPageSize = Number(nextSize) || 100;
          this.candidatesPageSize = Math.min(500, Math.max(10, Number(this.candidatesPageSize) || 100));
          this.selectedPinIds = [];
          return this.loadCandidates(true);
        },

        async loadCandidates(resetPage = false) {
          if (resetPage === true) {
            this.candidatesOffset = 0;
            this.selectedPinIds = [];
          }
          const signal = this._nextAbortSignal('candidates');
          this.isLoading = true;
          try {
            const params = this.buildCandidateFilterParams();
            const { data } = await this.apiJson('/api/newborn/candidates?' + params.toString(), signal ? { signal } : {});
            if (signal && signal.aborted) return;
            this.candidates = Array.isArray(data?.candidates) ? data.candidates : [];
            this.candidatesTotal = Number(data?.total ?? this.candidates.length);
            if (this.candidates.length === 0 && this.candidatesOffset > 0 && this.candidatesTotal > 0) {
              const pageSize = Math.max(1, Number(this.candidatesPageSize) || 100);
              const clampedOffset = Math.max(0, Math.floor((this.candidatesTotal - 1) / pageSize) * pageSize);
              if (clampedOffset !== this.candidatesOffset) {
                this.candidatesOffset = clampedOffset;
                const retryParams = this.buildCandidateFilterParams();
                const retryRes = await this.apiJson('/api/newborn/candidates?' + retryParams.toString(), signal ? { signal } : {});
                if (signal && signal.aborted) return;
                this.candidates = Array.isArray(retryRes?.data?.candidates) ? retryRes.data.candidates : [];
                this.candidatesTotal = Number(retryRes?.data?.total ?? this.candidates.length);
              }
            }
          } catch (err) {
            if (this._isAbortError(err, signal)) return;
            this.toast('Failed to load Golden Pins: ' + err.message, 'error');
          } finally {
            if (!signal || !signal.aborted) {
              this.isLoading = false;
              this.refreshIcons();
            }
          }
        },

        async loadCrossoverForActiveHunt() {
          const signal = this._nextAbortSignal('crossover');
          try {
            const params = new URLSearchParams({ limit: '30' });
            if (this.activeRunId) params.set('run_id', String(this.activeRunId));
            if (this.scopedFolderId && !this.activeRunId) params.set('folder_id', String(this.scopedFolderId));
            if (this.filters.linkFilter && this.filters.linkFilter !== 'all') {
              params.set('link_filter', String(this.filters.linkFilter));
            } else if (this.filters.linklessOnly) {
              params.set('link_filter', 'linkless');
            }
            if (this.filters.surface) params.set('surface', String(this.filters.surface));
            if (this.filters.creationMethod) params.set('creation_method', String(this.filters.creationMethod));
            if (this.filters.repinFilter) params.set('repin_filter', String(this.filters.repinFilter));
            if (this.filters.search && this.filters.search.trim()) params.set('search', this.filters.search.trim());
            const { data } = await this.apiJson('/api/newborn/crossover?' + params.toString(), signal ? { signal } : {});
            if (signal && signal.aborted) return;
            this.crossoverClusters = Array.isArray(data?.clusters) ? data.clusters : [];
          } catch (err) {
            if (this._isAbortError(err, signal)) return;
            this.crossoverClusters = [];
          }
        },

        annotationsCrossoverList() {
          if (Array.isArray(this.crossoverClusters) && this.crossoverClusters.length > 0) {
            return this.crossoverClusters;
          }
          const totalPins = Math.max(this.candidates.length, Number(this.candidatesTotal || 0));
          if (totalPins === 0) return [];
          const map = new Map();
          for (const pin of this.candidates) {
            const tags = this.extractPinAnnotationNames(pin);
            const seen = new Set();
            for (const tag of tags) {
              const key = tag.toLowerCase();
              if (seen.has(key)) continue;
              seen.add(key);
              if (!map.has(key)) {
                map.set(key, { annotation: tag, pin_count: 0, repins_sum: 0 });
              }
              const entry = map.get(key);
              entry.pin_count += 1;
              entry.repins_sum += Number(pin.repin_count || 0);
            }
          }
          return Array.from(map.values())
            .map((e) => ({
              annotation: e.annotation,
              pin_count: e.pin_count,
              overlap_pct: Math.round((e.pin_count / totalPins) * 100),
              avg_repins: e.pin_count > 0 ? Math.round(e.repins_sum / e.pin_count) : 0
            }))
            .sort((a, b) => (b.pin_count - a.pin_count) || (b.avg_repins - a.avg_repins));
        },

        async checkAnnotationVolumes() {
          this.showAnnotationsCrossover = true;
          const list = this.annotationsCrossoverList().slice(0, 24);
          if (list.length === 0) return;
          this.isCheckingAnnotationVolumes = true;
          try {
            const toFetch = list.filter((it) => !this.annotationVolumeMap[it.annotation.toLowerCase()]);
            for (let i = 0; i < toFetch.length; i += 4) {
              const chunk = toFetch.slice(i, i + 4);
              await Promise.all(chunk.map(async (it) => {
                try {
                  const params = new URLSearchParams({ q: it.annotation, country: this.launchpadCountry || 'US' });
                  const { data } = await this.apiJson('/api/newborn/idea-intelligence?' + params.toString());
                  this.annotationVolumeMap = {
                    ...this.annotationVolumeMap,
                    [it.annotation.toLowerCase()]: data
                  };
                } catch (_) {}
              }));
            }
            this.toast('Checked Idea Page search volume for top Annotations', 'success');
          } finally {
            this.isCheckingAnnotationVolumes = false;
            this.refreshIcons();
          }
        },

        async copyAnnotationTags() {
          const tags = this.annotationsCrossoverList().slice(0, 30).map((it) => it.annotation);
          if (tags.length === 0) return;
          const text = tags.join(', ');
          try {
            if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
              await navigator.clipboard.writeText(text);
            }
            this.toast('Copied ' + tags.length + ' Annotation tags', 'success');
          } catch (_) {
            this.toast('Tags: ' + text.slice(0, 80), 'info');
          }
        },

        async pullAccountReach(pinIds = [], refreshDossier = false) {
          const clean = Array.from(new Set((Array.isArray(pinIds) ? pinIds : [pinIds]).filter(Boolean)));
          if (clean.length === 0) return;
          const nextFlags = { ...this.pullingAccountPins };
          for (const id of clean) nextFlags[id] = true;
          this.pullingAccountPins = nextFlags;
          if (clean.length > 1) this.isPullingBulkAccounts = true;

          try {
            const url = clean.length === 1
              ? ('/api/newborn/candidates/' + encodeURIComponent(clean[0]) + '/fetch-account')
              : '/api/newborn/candidates/fetch-accounts';
            const body = clean.length === 1 ? {} : { pin_ids: clean };
            const { data } = await this.apiJson(url, {
              method: 'POST',
              body: JSON.stringify(body)
            });

            const results = Array.isArray(data?.results) ? data.results : [];
            const resMap = new Map(results.map((r) => [String(r.pin_id), r]));

            this.candidates = this.candidates.map((c) => {
              const r = resMap.get(String(c.pin_id));
              if (!r || (!r.fetched && !r.is_hydrated)) return c;
              return {
                ...c,
                effective_creator_username: r.username || c.effective_creator_username,
                effective_creator_followers: r.fetched ? r.effective_creator_followers : c.effective_creator_followers,
                creator_monthly_reach: r.fetched ? r.creator_monthly_reach : c.creator_monthly_reach,
                creator_profile_views: r.fetched ? r.creator_profile_views : c.creator_profile_views,
                creator_pin_count: r.fetched ? r.creator_pin_count : c.creator_pin_count,
                title: r.title || c.title,
                board_name: r.board_name || c.board_name,
                share_count: r.share_count != null ? r.share_count : c.share_count,
                raw_creation_method: r.raw_creation_method || c.raw_creation_method,
                is_repin: typeof r.is_repin === 'boolean' ? (Boolean(c.is_repin) || r.is_repin) : c.is_repin,
                is_hydrated: Boolean(c.is_hydrated || r.is_hydrated),
                visual_annotations: Array.isArray(r.visual_annotations) && r.visual_annotations.length > 0 ? r.visual_annotations : c.visual_annotations
              };
            });

            if (refreshDossier && this.dossierData && this.dossierData.candidate) {
              const dr = resMap.get(String(this.dossierData.candidate.pin_id));
              if (dr && (dr.fetched || dr.is_hydrated)) {
                const dc = this.dossierData.candidate;
                this.dossierData = {
                  ...this.dossierData,
                  candidate: {
                    ...dc,
                    effective_creator_username: dr.username || dc.effective_creator_username,
                    effective_creator_followers: dr.fetched ? dr.effective_creator_followers : dc.effective_creator_followers,
                    creator_monthly_reach: dr.fetched ? dr.creator_monthly_reach : dc.creator_monthly_reach,
                    creator_profile_views: dr.fetched ? dr.creator_profile_views : dc.creator_profile_views,
                    creator_pin_count: dr.fetched ? dr.creator_pin_count : dc.creator_pin_count,
                    title: dr.title || dc.title,
                    board_name: dr.board_name || dc.board_name,
                    share_count: dr.share_count != null ? dr.share_count : dc.share_count,
                    raw_creation_method: dr.raw_creation_method || dc.raw_creation_method,
                    is_repin: typeof dr.is_repin === 'boolean' ? (Boolean(dc.is_repin) || dr.is_repin) : dc.is_repin,
                    is_hydrated: Boolean(dc.is_hydrated || dr.is_hydrated),
                    visual_annotations: Array.isArray(dr.visual_annotations) && dr.visual_annotations.length > 0 ? dr.visual_annotations : dc.visual_annotations
                  }
                };
              }
            }

            this.toast('Pulled Account Reach for ' + Number(data?.fetched_count || 0) + ' pin(s)', 'success');
          } catch (err) {
            this.toast('Pull Account Reach failed: ' + err.message, 'error');
          } finally {
            const cleared = { ...this.pullingAccountPins };
            for (const id of clean) delete cleared[id];
            this.pullingAccountPins = cleared;
            this.isPullingBulkAccounts = false;
            this.refreshIcons();
          }
        },

        async toggleTrendsDrawer() {
          this.showTrendsDrawer = !this.showTrendsDrawer;
          if (this.showTrendsDrawer && this.launchpadTrends.length === 0) {
            await this.loadLaunchpadFeed();
          }
          this.refreshIcons();
        },

        async loadLaunchpadFeed() {
          try {
            const params = new URLSearchParams({
              country: this.launchpadCountry || 'US',
              trend_type: this.launchpadTrendType || 'growing',
              l1_interest: this.launchpadInterest || 'all',
              limit: String(this.launchpadLimit || 50)
            });
            if (this.launchpadMoments) params.set('moments', this.launchpadMoments);
            if (this.launchpadAge) params.set('age', this.launchpadAge);
            if (this.launchpadGender) params.set('gender', this.launchpadGender);
            if (this.launchpadIncludeTerms && this.launchpadIncludeTerms.trim()) params.set('include_terms', this.launchpadIncludeTerms.trim());
            if (this.launchpadExcludeTerms && this.launchpadExcludeTerms.trim()) params.set('exclude_terms', this.launchpadExcludeTerms.trim());
            const { data } = await this.apiJson('/api/newborn/launchpad?' + params.toString());
            this.launchpadTrends = Array.isArray(data?.trends) ? data.trends : [];
            this.launchpadPopularTerms = Array.isArray(data?.popular_terms) ? data.popular_terms : [];
            this.launchpadIdeasForYou = Array.isArray(data?.ideas_for_you_terms) ? data.ideas_for_you_terms : [];

            const filterKey = [
              this.launchpadCountry || 'US',
              this.launchpadTrendType || 'growing',
              this.launchpadInterest || 'all',
              this.launchpadMoments || '',
              this.launchpadAge || '',
              this.launchpadGender || '',
              (this.launchpadIncludeTerms || '').trim().toLowerCase(),
              (this.launchpadExcludeTerms || '').trim().toLowerCase()
            ].join('|');
            if (data?.cache_insufficient === true && !this.isRefreshingLaunchpad && !this._autoRefreshedLaunchpadKeys[filterKey]) {
              this._autoRefreshedLaunchpadKeys[filterKey] = true;
              await this.refreshLaunchpadLive();
              return;
            }
          } catch (_) {}
          this.refreshIcons();
        },

        async refreshLaunchpadLive() {
          this.isRefreshingLaunchpad = true;
          try {
            const { data } = await this.apiJson('/api/newborn/launchpad', {
              method: 'POST',
              body: JSON.stringify({
                country: this.launchpadCountry || 'US',
                trend_type: this.launchpadTrendType || 'growing',
                l1_interest: this.launchpadInterest || 'all',
                moments: this.launchpadMoments || '',
                age: this.launchpadAge || '',
                gender: this.launchpadGender || '',
                include_terms: (this.launchpadIncludeTerms || '').trim(),
                exclude_terms: (this.launchpadExcludeTerms || '').trim(),
                limit: Math.max(50, Math.min(100, Number(this.launchpadLimit) || 50))
              })
            });
            this.launchpadTrends = Array.isArray(data?.trends) ? data.trends : [];
            this.launchpadPopularTerms = Array.isArray(data?.popular_terms) ? data.popular_terms : [];
            this.launchpadIdeasForYou = Array.isArray(data?.ideas_for_you_terms) ? data.ideas_for_you_terms : [];
            this.toast('Loaded ' + this.launchpadTrends.length + ' Pinterest trends', 'success');
          } catch (err) {
            this.toast('Trends refresh failed: ' + err.message, 'error');
          } finally {
            this.isRefreshingLaunchpad = false;
            this.refreshIcons();
          }
        },

        async selectTrendAndHunt(term) {
          const clean = String(term || '').trim();
          if (!clean) return;
          this.huntInput = clean;
          this.showTrendsDrawer = false;
          this.lookupIdeaPage(clean);
          await this.runFocusedHunt(clean);
        },

        async runFocusedHunt(explicitSeed = null) {
          const rawSeed = String(explicitSeed !== null ? explicitSeed : this.huntInput || '').trim();
          const hasAnyPath = this.huntPaths.search.enabled || this.huntPaths.boards.enabled || this.huntPaths.idea_page.enabled || this.huntPaths.home_feed.enabled;
          if (!hasAnyPath) {
            this.toast('Enable at least one extraction path (Search, Boards, Idea Page, or Home Feed).', 'warning');
            return;
          }
          if (!rawSeed && !this.huntPaths.home_feed.enabled) {
            this.toast('Enter a keyword, board URL, or pin ID — or enable Home Feed.', 'warning');
            return;
          }

          if (rawSeed && (!this.ideaPageInfo || this.ideaPageInfo.term !== rawSeed.toLowerCase())) {
            this.lookupIdeaPage(rawSeed);
          }

          this.isSubmittingHunt = true;
          try {
            const payload = {
              query: rawSeed,
              execution_mode: this.executionMode || 'fleet',
              shards: Math.max(1, Math.min(20, Number(this.fleetShards) || 20)),
              profile_id: this.selectedProfileId || null,
              folder_id: this.scopedFolderId ? Number(this.scopedFolderId) : null,
              ...this.buildExplicitHuntOverrides()
            };
            const { data } = await this.apiJson('/api/newborn/discover', {
              method: 'POST',
              body: JSON.stringify(payload)
            });

            if (data?.run_id) {
              const mode = data.execution_mode || data.run?.execution_mode || 'direct';
              this.activeRunId = Number(data.run_id);
              this.activeRun = data.run || {
                id: this.activeRunId,
                run_type: 'discovery',
                execution_mode: mode,
                status: mode === 'fleet' ? 'queued' : 'running',
                progress_stage: 'queued',
                progress_detail: mode === 'fleet'
                  ? ('Queued on GitHub Actions Fleet (' + (data.shards_total || this.fleetShards) + ' shards)...')
                  : 'Queued — starting deep-scroll Golden Pin hunt...',
                progress_pct: 5,
                shards_total: Number(data.shards_total || 1),
                shards_completed: 0,
                shards_failed: 0,
                seed_queries: rawSeed ? [rawSeed] : ['home_feed']
              };
              this.activeView = 'hunt';
              this.showRunCompleteBanner = false;
              this.selectedPinIds = [];
              this.filters.annotation = '';
              this.startPollingRun(this.activeRunId);
              this.toast(
                data.deduplicated
                  ? ('Attached to live Hunt #' + this.activeRunId)
                  : ((mode === 'fleet' ? 'Fleet Hunt #' : 'Hunt #') + this.activeRunId + ' started'),
                'info'
              );
            }
          } catch (err) {
            this.toast('Failed to start hunt: ' + err.message, 'error');
          } finally {
            this.isSubmittingHunt = false;
            this.refreshIcons();
          }
        },

        async scrollRelatedPins(pinIds = []) {
          const cleanIds = Array.isArray(pinIds) ? pinIds.filter(Boolean) : [];
          if (cleanIds.length === 0) return;
          try {
            const { data } = await this.apiJson('/api/newborn/snowball', {
              method: 'POST',
              body: JSON.stringify({
                seed_pin_ids: cleanIds,
                target_pins: Number(this.huntPaths.related.target_pins) || 200,
                execution_mode: this.huntExecutionMode || 'auto',
                shards: Math.max(1, Math.min(20, Number(this.fleetShards) || 20)),
                filters: {
                  max_age_days: Math.max(1, Math.min(365, Number(this.huntFilters.maxAgeDays) || 30)),
                  min_repin_count: Math.max(0, Number(this.huntFilters.minRepins) || 0),
                  min_save_count: Math.max(0, Number(this.huntFilters.minSaves) || 0),
                  resolve_root_pin: Boolean(this.settingsDraft?.qualification?.resolve_root_pin)
                },
                profile_id: this.selectedProfileId || null,
                folder_id: this.scopedFolderId ? Number(this.scopedFolderId) : null
              })
            });
            if (data?.run_id) {
              const execMode = data.execution_mode || data.run?.execution_mode || 'direct';
              const shardsTotal = Math.max(1, Number(data.shards_total || data.run?.shards_total || 1));
              this.activeRunId = Number(data.run_id);
              this.activeRun = data.run || {
                id: this.activeRunId,
                run_type: 'snowball',
                execution_mode: execMode,
                shards_total: shardsTotal,
                shards_completed: 0,
                shards_failed: 0,
                status: execMode === 'fleet' ? 'queued' : 'running',
                progress_stage: 'queued',
                progress_detail: execMode === 'fleet'
                  ? ('Queued — dispatching ' + shardsTotal + ' GitHub Actions Fleet runner' + (shardsTotal === 1 ? '' : 's') + '…')
                  : 'Queued — scrolling Related Pins...',
                progress_pct: 5
              };
              this.activeView = 'hunt';
              this.selectedPinIds = [];
              this.filters.annotation = '';
              this.startPollingRun(this.activeRunId);
              this.toast(
                execMode === 'fleet'
                  ? ('Fleet Snowball dispatched (Hunt #' + this.activeRunId + ', ' + shardsTotal + ' runner' + (shardsTotal === 1 ? '' : 's') + ')')
                  : 'Scrolling Related Pins (Hunt #' + this.activeRunId + ')',
                'info'
              );
            }
          } catch (err) {
            this.toast('Related Pins scroll failed: ' + err.message, 'error');
          }
        },

        async snowballPins(pinIds = []) {
          return this.scrollRelatedPins(pinIds);
        },

        stopPollingRun() {
          if (this.pollTimerId !== null) {
            clearTimeout(this.pollTimerId);
            this.pollTimerId = null;
          }
          if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function' && this._visibilityBound) {
            document.removeEventListener('visibilitychange', this._visibilityBound);
            this._visibilityBound = null;
          }
          this.isPollingRun = false;
          this._pollInFlight = false;
          this._pollConsecutiveFailures = 0;
          this._pollTargetRunId = null;
          this.pollReconnectingNotice = '';
        },

        _scheduleNextPoll(runId, delayMs) {
          if (!this.isPollingRun || this._pollTargetRunId !== runId) return;
          if (this.pollTimerId !== null) {
            clearTimeout(this.pollTimerId);
            this.pollTimerId = null;
          }
          this.pollTimerId = setTimeout(() => {
            this.pollTimerId = null;
            if (!this.isPollingRun || this._pollTargetRunId !== runId) return;
            if (typeof document !== 'undefined' && document.hidden) {
              this._scheduleNextPoll(runId, 2000);
              return;
            }
            this.pollRunOnce(runId);
          }, Math.max(500, Number(delayMs) || 1500));
        },

        startPollingRun(runId) {
          this.stopPollingRun();
          const targetId = Number(runId);
          if (!Number.isInteger(targetId) || targetId <= 0) return;
          this.isPollingRun = true;
          this._pollTargetRunId = targetId;
          this._pollConsecutiveFailures = 0;
          this._pollInFlight = false;
          this.pollReconnectingNotice = '';

          if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
            this._visibilityBound = () => {
              if (!document.hidden && this.isPollingRun && this._pollTargetRunId === targetId) {
                this.pollRunOnce(targetId);
              }
            };
            document.addEventListener('visibilitychange', this._visibilityBound);
          }

          if (typeof document === 'undefined' || !document.hidden) {
            this.pollRunOnce(targetId);
          } else {
            this._scheduleNextPoll(targetId, 1500);
          }
        },

        async pollRunOnce(runId) {
          if (this._pollInFlight) return;
          if (typeof document !== 'undefined' && document.hidden) {
            if (this.isPollingRun && this._pollTargetRunId === runId) {
              this._scheduleNextPoll(runId, 2000);
            }
            return;
          }
          this._pollInFlight = true;
          let shouldReschedule = false;
          let nextDelayMs = (this.activeRun && this.activeRun.execution_mode === 'fleet') ? 3500 : 1500;
          try {
            const { data } = await this.apiJson('/api/newborn/runs/' + encodeURIComponent(runId) + '?lite=1');
            this._pollConsecutiveFailures = 0;
            this.pollReconnectingNotice = '';
            const run = data?.run;
            if (!run) {
              shouldReschedule = true;
              return;
            }

            const prev = this.activeRun && Number(this.activeRun.id) === Number(run.id) ? this.activeRun : {};
            const mergedRun = {
              ...prev,
              ...run,
              seed_queries: (Array.isArray(run.seed_queries) && run.seed_queries.length > 0)
                ? run.seed_queries
                : (prev.seed_queries || []),
              telemetry: {
                ...(prev.telemetry || {}),
                ...(run.telemetry || {}),
                funnel: {
                  ...((prev.telemetry && prev.telemetry.funnel) || {}),
                  ...((run.telemetry && run.telemetry.funnel) || {})
                }
              }
            };
            this.activeRun = mergedRun;
            nextDelayMs = mergedRun.execution_mode === 'fleet' ? 3500 : 1500;

            if (mergedRun.telemetry && mergedRun.telemetry.idea_page && mergedRun.telemetry.idea_page.found) {
              this.ideaPageInfo = mergedRun.telemetry.idea_page;
            }

            if (!this.isRunActiveStatus(mergedRun.status)) {
              this.stopPollingRun();
              this.showRunCompleteBanner = true;
              await this.loadOverviewAndRuns();

              this.activeRunId = Number(mergedRun.id);
              await Promise.all([this.loadCandidates(true), this.loadCrossoverForActiveHunt()]);

              const f = this.getRunFunnel(mergedRun);
              if (mergedRun.status === 'failed') {
                this.toast('Hunt #' + mergedRun.id + ' failed: ' + (mergedRun.error_message || 'Unknown error'), 'error');
              } else if (mergedRun.status === 'cancelled') {
                this.toast('Hunt #' + mergedRun.id + ' cancelled (' + f.verifiedWinners + ' winners saved)', 'info');
              } else if (mergedRun.status === 'partial_rate_limited') {
                this.toast('Hunt #' + mergedRun.id + ' paused on Pinterest rate limit — salvaged ' + f.verifiedWinners + ' Golden Pin winners', 'warning');
              } else if (mergedRun.status === 'partial') {
                this.toast('Hunt #' + mergedRun.id + ' partially completed: ' + f.verifiedWinners + ' Golden Pin winners', 'warning');
              } else {
                this.toast('Hunt #' + mergedRun.id + ' complete: ' + f.verifiedWinners + ' Golden Pin winners', 'success');
              }
              this.refreshIcons();
            } else {
              shouldReschedule = true;
            }
          } catch (err) {
            this._pollConsecutiveFailures = (this._pollConsecutiveFailures || 0) + 1;
            const backoffSchedule = [1500, 3000, 6000, 12000, 15000];
            if (this._pollConsecutiveFailures >= 5) {
              this.stopPollingRun();
              this.toast('Stopped polling Hunt #' + runId + ' after 5 consecutive errors: ' + (err?.message || 'Network error'), 'error');
            } else {
              this.pollReconnectingNotice = 'Reconnecting to live run (retry ' + this._pollConsecutiveFailures + '/5)...';
              nextDelayMs = backoffSchedule[Math.min(backoffSchedule.length - 1, this._pollConsecutiveFailures - 1)];
              shouldReschedule = true;
            }
          } finally {
            this._pollInFlight = false;
            if (shouldReschedule && this.isPollingRun && this._pollTargetRunId === runId) {
              this._scheduleNextPoll(runId, nextDelayMs);
            }
          }
        },

        togglePinSelection(pinId) {
          if (this.selectedPinIds.includes(pinId)) {
            this.selectedPinIds = this.selectedPinIds.filter((id) => id !== pinId);
          } else {
            this.selectedPinIds = [...this.selectedPinIds, pinId];
          }
        },

        toggleSelectAllPins(checked) {
          if (checked) {
            this.selectedPinIds = this.candidates.map((c) => c.pin_id);
          } else {
            this.selectedPinIds = [];
          }
        },

        sanitizeCsvCell(val) {
          const str = String(val === null || val === undefined ? '' : val);
          const safe = /^[=+\\-@\\t\\r]/.test(str) ? ("'" + str) : str;
          return '"' + safe.replace(/"/g, '""') + '"';
        },

        exportCsv(rowsOverride = null) {
          const list = Array.isArray(rowsOverride) ? rowsOverride : this.candidates;
          if (!Array.isArray(list) || list.length === 0) return;
          const isLegacyRoot = Boolean(this.settingsDraft?.qualification?.resolve_root_pin);
          const headers = [
            'Pin ID', 'Title', 'Pinterest URL', 'Destination Domain', 'No Link',
            isLegacyRoot ? 'Root Age (Days)' : 'Pin Age (Days)',
            isLegacyRoot ? 'Root Created UTC' : 'Pin Created UTC',
            'Re-pins', 'Re-pins/day', 'Saves', 'Shares',
            'Creation Method', 'Is Repin',
            'Pin Annotations', 'Discovery Source', 'All Discovery Sources', 'Matched Queries', 'Discovery Board', 'Pin Board',
            'Account Username', 'Total Audience', 'Impressions'
          ];
          const rows = [headers.map((h) => this.sanitizeCsvCell(h)).join(',')];
          for (const p of list) {
            const tags = this.extractPinAnnotationNames(p).join('; ');
            const mq = Array.isArray(p.matched_queries) ? p.matched_queries.join('; ') : '';
            const primarySurface = this.formatSurfaceLabel(p.run_surface || p.first_surface);
            const surfLabels = this.getPinDisplaySurfaces(p).map((s) => this.formatSurfaceLabel(s)).join('; ');
            rows.push([
              p.pin_id,
              p.title || '',
              'https://www.pinterest.com/pin/' + p.pin_id + '/',
              p.is_linkless ? '' : (p.clean_domain || ''),
              p.is_linkless ? 'YES' : 'NO',
              p.age_days != null ? Math.round(Number(p.age_days)) : '',
              p.created_at_pinterest || '',
              p.repin_count != null ? p.repin_count : '',
              p.repin_per_day != null ? p.repin_per_day : '',
              p.save_count != null ? p.save_count : '',
              p.share_count != null ? p.share_count : '',
              p.raw_creation_method || '',
              p.is_repin ? 'YES' : 'NO',
              tags,
              primarySurface,
              surfLabels,
              mq,
              p.discovery_board_name || '',
              p.pin_board_name || p.board_name || '',
              p.effective_creator_username ? ('@' + p.effective_creator_username) : '',
              p.creator_monthly_reach != null ? p.creator_monthly_reach : '',
              p.creator_profile_views != null ? p.creator_profile_views : ''
            ].map((v) => this.sanitizeCsvCell(v)).join(','));
          }
          const csvContent = rows.join('\\n');
          if (typeof Blob !== 'undefined' && typeof URL !== 'undefined' && typeof document !== 'undefined') {
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'golden-pins-hunt-' + (this.activeRunId || 'all') + '.csv';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }
          this.toast('Exported ' + list.length + ' Golden Pins to CSV', 'success');
          return csvContent;
        },

        async exportAllCsv() {
          if (this.isExportingCsv) return;
          const total = Number(this.candidatesTotal || this.candidates.length || 0);
          if (total === 0) return;
          if (total <= this.candidates.length) {
            return this.exportCsv();
          }
          const signal = this._nextAbortSignal('csv_export');
          this.isExportingCsv = true;
          try {
            const cap = Math.min(total, 10000);
            const allRows = [];
            for (let offset = 0; offset < cap; offset += 500) {
              const params = this.buildCandidateFilterParams({ limit: 500, offset });
              const { data } = await this.apiJson('/api/newborn/candidates?' + params.toString(), signal ? { signal } : {});
              if (signal && signal.aborted) return;
              const batch = Array.isArray(data?.candidates) ? data.candidates : [];
              allRows.push(...batch);
              if (batch.length < 500) break;
            }
            if (allRows.length > 0) {
              return this.exportCsv(allRows);
            }
          } catch (err) {
            if (this._isAbortError(err, signal)) return;
            this.toast('Export failed: ' + err.message, 'error');
          } finally {
            if (!signal || !signal.aborted) {
              this.isExportingCsv = false;
            }
          }
        },

        async stagePins(pinIds, nextStage) {
          const clean = Array.isArray(pinIds) ? pinIds.filter(Boolean) : [];
          if (clean.length === 0) return;
          try {
            await this.apiJson('/api/newborn/candidates/stage', {
              method: 'POST',
              body: JSON.stringify({ pin_ids: clean, stage: nextStage })
            });
            this.selectedPinIds = [];
            await Promise.all([
              this.loadOverviewAndRuns(),
              this.loadCandidates()
            ]);
            this.toast('Updated ' + clean.length + ' pin(s) to ' + nextStage, 'success');
          } catch (err) {
            this.toast('Stage update failed: ' + err.message, 'error');
          }
        },

        openPromoteModal(pinIds) {
          this.promotePinIds = Array.isArray(pinIds) ? [...pinIds] : [pinIds];
          this.promoteForm = {
            promoteToDailySsot: true,
            promoteKeyword: false,
            promoteClusterSeeds: false,
            folderId: this.scopedFolderId || ''
          };
          this.promoteModalOpen = true;
          this.refreshIcons();
        },

        async submitPromotePins() {
          if (this.promotePinIds.length === 0) return;
          this.isPromoting = true;
          try {
            const { data } = await this.apiJson('/api/newborn/promote', {
              method: 'POST',
              body: JSON.stringify({
                pin_ids: this.promotePinIds,
                destinations: {
                  promote_to_daily_ssot: Boolean(this.promoteForm.promoteToDailySsot),
                  promote_to_campaign_folder_id: this.promoteForm.folderId ? Number(this.promoteForm.folderId) : null,
                  promote_top_annotation_as_keyword: Boolean(this.promoteForm.promoteKeyword),
                  promote_to_cluster_seeds: Boolean(this.promoteForm.promoteClusterSeeds)
                }
              })
            });
            this.promoteModalOpen = false;
            this.selectedPinIds = [];
            await Promise.all([
              this.loadOverviewAndRuns(),
              this.loadCandidates(),
              this.loadFoldersList()
            ]);
            this.toast('Enrolled ' + (data?.pins?.promoted_count || this.promotePinIds.length) + ' pin(s) in Daily Tracking', 'success');
          } catch (err) {
            this.toast('Track Daily failed: ' + err.message, 'error');
          } finally {
            this.isPromoting = false;
          }
        },

        async openDossier(pinId) {
          const signal = this._nextAbortSignal('dossier');
          this.dossierOpen = true;
          this.isLoadingDossier = true;
          this.dossierData = null;
          try {
            const { data } = await this.apiJson('/api/newborn/candidates/' + encodeURIComponent(pinId), signal ? { signal } : {});
            if (signal && signal.aborted) return;
            this.dossierData = data;
          } catch (err) {
            if (this._isAbortError(err, signal)) return;
            this.toast('Failed to load dossier: ' + err.message, 'error');
            this.dossierOpen = false;
          } finally {
            if (!signal || !signal.aborted) {
              this.isLoadingDossier = false;
              this.refreshIcons();
            }
          }
        },

        applyAgePreset(preset) {
          this.settingsDraft.qualification.age_window_preset = preset;
          const map = { '7d': 7, '14d': 14, '30d': 30, '60d': 60, '90d': 90 };
          if (map[preset]) {
            this.settingsDraft.qualification.max_age_days = map[preset];
            this.settingsDraft.qualification.min_age_days = 0;
          }
        },

        toggleSurfaceEnabled(surfId, checked) {
          if (!this.settingsDraft.discovery.surfaces[surfId]) {
            this.settingsDraft.discovery.surfaces[surfId] = { enabled: Boolean(checked) };
          } else {
            this.settingsDraft.discovery.surfaces[surfId].enabled = Boolean(checked);
          }
        },

        async saveSettings() {
          this.isSavingSettings = true;
          try {
            const { data } = await this.apiJson('/api/newborn/settings', {
              method: 'PATCH',
              body: JSON.stringify(this.settingsDraft)
            });
            if (data?.settings) {
              this.settingsDraft = cloneJson(data.settings);
              this.syncSettingsToHeroControls(data.settings);
            }
            if (data?.schedule) this.scheduleStatus = data.schedule;
            this.toast('Settings saved', 'success');
          } catch (err) {
            this.toast('Save failed: ' + err.message, 'error');
          } finally {
            this.isSavingSettings = false;
          }
        },

        async resetSettingsToDefaults() {
          try {
            const { data } = await this.apiJson('/api/newborn/settings/reset', { method: 'POST' });
            if (data?.settings) {
              this.settingsDraft = cloneJson(data.settings);
              this.syncSettingsToHeroControls(data.settings);
            }
            if (data?.schedule) this.scheduleStatus = data.schedule;
            this.toast('Settings reset to defaults', 'success');
          } catch (err) {
            this.toast('Reset failed: ' + err.message, 'error');
          }
        },

        async saveCookie() {
          if (!this.cookieInput.trim()) return;
          this.isSavingCookie = true;
          try {
            const { data } = await this.apiJson('/api/newborn/cookie', {
              method: 'POST',
              body: JSON.stringify({ cookie: this.cookieInput.trim() })
            });
            this.cookieStatus = data;
            this.cookieInput = '';
            this.toast('Pinterest session cookie saved securely', 'success');
          } catch (err) {
            this.toast('Cookie save failed: ' + err.message, 'error');
          } finally {
            this.isSavingCookie = false;
          }
        },

        async clearCookie() {
          try {
            const { data } = await this.apiJson('/api/newborn/cookie', { method: 'DELETE' });
            this.cookieStatus = data;
            this.toast('Stored cookie cleared', 'info');
          } catch (err) {
            this.toast('Clear cookie failed: ' + err.message, 'error');
          }
        },

        async runAutoCycleNow() {
          try {
            const { data } = await this.apiJson('/api/newborn/auto-run', {
              method: 'POST',
              body: JSON.stringify({ force: true, profile_id: this.selectedProfileId || null })
            });
            if (data?.run_id) {
              this.activeRunId = Number(data.run_id);
              this.activeRun = data.run;
              this.startPollingRun(data.run_id);
              this.toast('Auto-cycle started (Run #' + data.run_id + ')', 'info');
            }
          } catch (err) {
            this.toast('Auto-cycle failed: ' + err.message, 'error');
          }
        },

        async dispatchFleetWorkflow() {
          try {
            await this.apiJson('/api/newborn/fleet-dispatch', {
              method: 'POST',
              body: JSON.stringify({ mode: 'auto_cycle', force: true })
            });
            this.toast('Dispatched GitHub Actions Newborn Fleet', 'success');
          } catch (err) {
            this.toast('Fleet dispatch failed: ' + err.message, 'error');
          }
        },

        // ---- Pure Formatting Helpers ----
        getRunFunnel(run) {
          const f = (run && run.telemetry && run.telemetry.funnel) || {};
          return {
            scrolled: Number(f.scrolled_pins ?? run?.candidates_discovered ?? 0),
            matchedRepins: Number(f.matched_repins ?? f.hydrated_pins ?? run?.candidates_qualified ?? 0),
            verifiedWinners: Number(f.verified_winners ?? run?.golden_pins_count ?? run?.candidates_qualified ?? 0)
          };
        },

        extractPinAnnotationNames(pin) {
          const raw = pin && Array.isArray(pin.visual_annotations) ? pin.visual_annotations : [];
          const out = [];
          const seen = new Set();
          for (const item of raw) {
            const name = typeof item === 'string' ? item.trim() : String(item?.name || '').trim();
            if (!name) continue;
            const key = name.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(name);
          }
          return out;
        },

        getPinDisplaySurfaces(pin) {
          if (!pin || typeof pin !== 'object') return [];
          const candidates = [
            ...(Array.isArray(pin.run_surfaces) ? pin.run_surfaces : []),
            ...(Array.isArray(pin.discovered_surfaces) ? pin.discovered_surfaces : []),
            ...(pin.run_surface ? [pin.run_surface] : []),
            ...(pin.first_surface ? [pin.first_surface] : [])
          ];
          const out = [];
          const seen = new Set();
          for (const raw of candidates) {
            const s = String(raw || '').trim();
            const lower = s.toLowerCase();
            if (!s || lower === 'pin_resource' || seen.has(lower)) continue;
            seen.add(lower);
            out.push(s);
          }
          return out.length > 0 ? out : ['unknown'];
        },

        formatSurfaceLabel(surface) {
          const map = {
            pin_serp_capsules: 'Search',
            fresh_boards: 'Board',
            board_feed: 'Board',
            board_more_ideas: 'Find More Ideas',
            ideas_feeds: 'Idea Page',
            home_feed: 'Home Feed',
            related_pin_snowball: 'Related Pins',
            growing_trends: 'Trends',
            zero_query_popular: 'Popular'
          };
          const clean = String(surface || '').trim();
          const lower = clean.toLowerCase();
          if (!clean || lower === 'pin_resource') return 'Unknown';
          return map[lower] || clean;
        },

        formatCreationMethodLabel(method) {
          const clean = String(method || '').trim().toLowerCase();
          if (!clean) return '';
          const map = {
            share_extension_ios: 'iOS Share',
            share_extension_android: 'Android Share',
            photos: 'Photos',
            pin_scheduling: 'Scheduled',
            uploaded: 'Uploaded',
            pinterest_platform: 'Pinterest Platform',
            organic_pin: 'Pinterest Platform',
            in_app_browser: 'In-App Browser',
            idea_pin: 'Idea Pin',
            carousel: 'Carousel',
            extension: 'Browser Extension',
            instagram_api: 'Instagram',
            shuffles_composer: 'Shuffles',
            csv_importer: 'CSV Import',
            bookmarklet: 'Bookmarklet'
          };
          if (map[clean]) return map[clean];
          return clean.split('_').filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        },

        formatRunSeedLabel(run) {
          if (!run) return '';
          const seeds = Array.isArray(run.seed_queries) ? run.seed_queries : [];
          if (seeds.length > 0) return seeds.slice(0, 2).join(', ');
          if (run.run_type === 'watchlist_poll') return 'Watchlist Refresh';
          if (run.run_type === 'snowball') return 'Related Pins Scroll';
          return 'Deep-Scroll Hunt';
        },

        getRunStatusLabel(status) {
          const map = {
            queued: 'Queued',
            running: 'Running',
            completed: 'Completed',
            partial: 'Partial',
            partial_rate_limited: 'Salvaged (Rate Limit)',
            cancelled: 'Cancelled',
            failed: 'Failed'
          };
          return map[String(status || '').toLowerCase()] || String(status || 'unknown');
        },

        getRunStatusBadgeClass(status) {
          const s = String(status || '').toLowerCase();
          if (s === 'completed') return 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300';
          if (s === 'queued') return 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300';
          if (s === 'running') return 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300';
          if (s === 'partial_rate_limited' || s === 'partial') return 'bg-amber-100/80 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300';
          if (s === 'cancelled') return 'bg-slate-100 dark:bg-[#27272A] text-slate-600 dark:text-[#A1A1AA]';
          return 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300';
        },

        getHumanProgressStep(stage) {
          const ageLabel = this.settingsDraft?.qualification?.resolve_root_pin ? 'Root Age' : 'Pin Age';
          const map = {
            queued: 'Queued — preparing deep-scroll hunt...',
            running: 'Running across active workers...',
            harvesting: '1. Deep-scrolling selected paths...',
            pretriage: '2. Filtering Re-pins via 50x Zero-Cookie Pidgets...',
            hydrating_pins: '3. Verifying ' + ageLabel + ' & Pin Annotations...',
            snowballing: '3. Scrolling Related Pins...',
            hydrating_creators: '3. Finalizing Golden Pin winners...',
            persisting: '3. Saving verified Golden Pin winners...',
            partial_rate_limited: 'Paused on Pinterest rate limit — salvaged verified winners',
            partial: 'Partially completed',
            cancelled: 'Cancelled by operator',
            completed: 'Hunt complete',
            failed: 'Hunt failed'
          };
          return map[String(stage || '').toLowerCase()] || 'Running Golden Pin hunt...';
        },

        getProgressStepIndex(stage) {
          const s = String(stage || '').toLowerCase();
          if (s === 'hydrating_pins' || s === 'hydrating_creators' || s === 'persisting' || s === 'completed' || s === 'partial_rate_limited' || s === 'partial') return 3;
          if (s === 'pretriage' || s === 'snowballing') return 2;
          return 1;
        },

        formatRootAge(ageDays) {
          if (ageDays === null || ageDays === undefined || ageDays === '') return '—';
          const n = Number(ageDays);
          if (!Number.isFinite(n) || n < 0) return '—';
          if (n < 1) return Math.max(1, Math.round(n * 24)) + 'h';
          if (n >= 365) return (n / 365).toFixed(1) + 'y';
          return Math.round(n) + 'd';
        },

        formatUtcDateOnly(iso) {
          if (!iso) return '';
          try {
            const d = new Date(iso);
            if (Number.isNaN(d.getTime())) return '';
            return d.toISOString().slice(0, 10);
          } catch (_) {
            return '';
          }
        },

        formatNullableCount(val) {
          if (val === null || val === undefined || val === '') return '—';
          const n = Number(val);
          if (!Number.isFinite(n)) return '—';
          return n.toLocaleString();
        },

        formatVelocity(val) {
          if (val === null || val === undefined || val === '') return '—';
          const n = Number(val);
          if (!Number.isFinite(n)) return '—';
          return '+' + (n >= 10 ? Math.round(n) : n.toFixed(1)) + '/day';
        },

        formatCompact(val) {
          if (val === null || val === undefined || val === '') return '—';
          const n = Number(val);
          if (!Number.isFinite(n)) return '—';
          if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
          if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
          return String(Math.round(n));
        },

        formatReach(val) {
          if (val === null || val === undefined || val === '') return '—';
          const n = Number(val);
          if (!Number.isFinite(n)) return '—';
          if (n >= 10_000_001) return '10M+';
          return this.formatCompact(n);
        },

        formatBoardUrl(rawUrl) {
          const str = String(rawUrl || '').trim();
          if (!str || /^(?:javascript|data|vbscript):/i.test(str)) return '';
          if (/^https?:\\/\\//i.test(str)) return str;
          if (str.startsWith('//')) return 'https:' + str;
          return 'https://www.pinterest.com' + (str.startsWith('/') ? str : ('/' + str));
        },

        formatShortTimestamp(iso) {
          if (!iso) return '—';
          try {
            const d = new Date(iso);
            if (Number.isNaN(d.getTime())) return '—';
            return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
          } catch (_) {
            return '—';
          }
        },

        buildPinDetailsHref(pinId) {
          const returnUrl = this.scopedFolderId
            ? ('/folders/' + encodeURIComponent(this.scopedFolderId) + '/newborn')
            : '/newborn';
          const params = new URLSearchParams({ source: 'newborn', return_url: returnUrl });
          if (this.scopedFolderId) params.set('folder_id', this.scopedFolderId);
          return '/pin/' + encodeURIComponent(pinId) + '?' + params.toString();
        }
      };
    }
  </script>`;
}

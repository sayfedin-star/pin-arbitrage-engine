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
          max_board_age_days: 30,
          surfaces: {
            growing_trends: { enabled: false, max_pages: 1, limit: 25 },
            zero_query_popular: { enabled: false, max_pages: 1 },
            pin_serp_capsules: { enabled: true, max_pages: 10, page_size: 50, target_pins: 500 },
            fresh_boards: { enabled: true, max_pages: 2, max_boards: 10, target_pins_per_board: 100 },
            board_feed: { enabled: true, max_pages: 2, page_size: 100, target_pins_per_board: 100 },
            board_more_ideas: { enabled: true, max_pages: 2, page_size: 25, max_boards: 8 },
            ideas_feeds: { enabled: true, max_pages: 5, target_pins: 250, max_interests_per_run: 3 },
            home_feed: { enabled: false, max_pages: 5, page_size: 50, target_pins: 250 },
            related_pin_snowball: { enabled: false, max_pages: 8, page_size: 25, target_pins: 200 }
          },
          snowball: { enabled: false, max_hops: 1, seed_cap: 10, min_seed_golden_score: 65 },
          hydration: { enable_pidgets_pretriage: true, max_pin_hydrations_per_run: 500, max_user_hydrations_per_run: 0, auto_fetch_accounts: false }
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
          provenance: {
            allowed_sources: ['SHARE_EXTENSION_IOS', 'SHARE_EXTENSION_ANDROID', 'UPLOADED', 'ORGANIC_PIN', 'CAROUSEL', 'VIDEO', 'IDEA_PIN', 'BOOKMARKLET', 'UNKNOWN'],
            excluded_sources: [],
            ai_disclosure_policy: 'exclude',
            exclude_products: true,
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
        activeView: initialMode === 'watchlist' ? 'watchlist' : (initialMode === 'history' ? 'history' : 'hunt'),
        isLoading: false,

        // Hero Hunt & Idea Page Intelligence State
        huntInput: '',
        selectedProfileId: '',
        isSubmittingHunt: false,
        ideaPageInfo: null,
        isLookingUpIdeaPage: false,
        _ideaLookupSeq: 0,

        // Pure 3-Filter Qualification Controls
        huntFilters: {
          maxAgeDays: 30,
          minRepins: 20,
          minSaves: 0
        },

        // Per-Path Deep-Scroll Extraction Controls
        huntPaths: {
          search: { enabled: true, target_pins: 500 },
          boards: { enabled: true, max_boards: 10, target_pins_per_board: 100, find_more_ideas: true },
          idea_page: { enabled: true, target_pins: 250 },
          home_feed: { enabled: false, target_pins: 250 },
          related: { target_pins: 200 }
        },

        // Rising Trends Drawer
        showTrendsDrawer: initialMode === 'launchpad',
        isRefreshingLaunchpad: false,
        launchpadCountry: 'US',
        launchpadTrendType: 'growing',
        launchpadInterest: 'all',
        launchpadTrends: [],
        launchpadPopularTerms: [],
        launchpadIdeasForYou: [],
        l1InterestsCatalog: [],
        supportedCountries: [{ code: 'US', label: 'United States (US)' }],

        // Live 202 Run Polling State
        activeRunId: null,
        activeRun: null,
        isPollingRun: false,
        showRunCompleteBanner: false,
        pollTimerId: null,
        _teardownBound: null,

        // Core Data Collections
        overview: null,
        candidates: [],
        candidatesTotal: 0,
        selectedPinIds: [],
        filters: {
          linklessOnly: false,
          annotation: '',
          search: '',
          sort: 'repins'
        },

        // Annotations Crossover & On-Demand Account Reach
        crossoverClusters: [],
        annotationVolumeMap: {},
        isCheckingAnnotationVolumes: false,
        pullingAccountPins: {},
        isPullingBulkAccounts: false,

        // Tracked / Watchlist & Past Hunts
        watchlistSubView: 'anchors',
        watchlistCandidates: [],
        dailyAnchors: [],
        isSubmittingWatchlistPoll: false,
        runs: [],

        // Slide-Over Settings Drawer & Modals
        settingsDrawerOpen: initialMode === 'settings',
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

        // Rule Profile Modal
        profileModalOpen: false,
        isSavingProfile: false,
        profileForm: {
          id: null,
          name: '',
          description: '',
          maxAgeDays: 30,
          minRepins: 20,
          minSaves: 0,
          linklessOnly: false,
          isDefault: false
        },

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
            this.loadFoldersList()
          ]);

          if (this.scopedFolderId && Array.isArray(this.foldersList)) {
            this.activeFolder = this.foldersList.find((f) => String(f.id) === String(this.scopedFolderId)) || null;
          }

          // Auto-scope "This Hunt" to the most recent run if present
          if (!this.activeRunId && this.runs.length > 0) {
            const latest = this.runs[0];
            this.activeRunId = Number(latest.id);
            this.activeRun = latest;
            if (latest.status === 'running') {
              this.startPollingRun(this.activeRunId);
            }
          }

          if (this.huntInput && this.huntInput.trim().length >= 2) {
            this.lookupIdeaPage(this.huntInput);
          }

          if (this.activeView === 'watchlist') {
            await Promise.all([this.loadWatchlist(), this.loadDailyAnchors()]);
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
          const res = await fetch(url, {
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
          if (this.profileModalOpen) { this.profileModalOpen = false; return; }
          if (this.promoteModalOpen) { this.promoteModalOpen = false; return; }
          if (this.dossierOpen) { this.dossierOpen = false; return; }
          if (this.settingsDrawerOpen) { this.closeSettingsDrawer(); }
        },

        openSettingsDrawer(tab = 'filters') {
          this.settingsTab = tab || 'filters';
          this.settingsDrawerOpen = true;
          this.refreshIcons();
        },

        closeSettingsDrawer() {
          this.settingsDrawerOpen = false;
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

        async lookupIdeaPage(rawTerm) {
          const clean = String(rawTerm || '').trim();
          if (!clean || clean.length < 2 || /^\\d{10,30}$/.test(clean) || /^https?:\\/\\//i.test(clean)) {
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
            this.activeView === 'watchlist'
              ? Promise.all([this.loadWatchlist(), this.loadDailyAnchors()])
              : Promise.all([this.loadCandidates(), this.loadCrossoverForActiveHunt()])
          ]);
          if (force) this.toast('Workspace refreshed', 'success');
          this.refreshIcons();
        },

        async loadSettingsAndProfiles() {
          try {
            const { data } = await this.apiJson('/api/newborn/settings');
            if (data.settings) {
              this.settingsDraft = cloneJson(data.settings);
              this.launchpadCountry = data.settings?.discovery?.country || 'US';
              // Sync Hunt Card 3-Filter defaults from saved settings
              const q = data.settings.qualification || {};
              this.huntFilters.maxAgeDays = Number(q.max_age_days || 30);
              this.huntFilters.minRepins = Number(q.min_repin_count ?? 20);
              this.huntFilters.minSaves = Number(q.min_save_count ?? 0);
            }
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
            const runsUrl = this.scopedFolderId
              ? ('/api/newborn/runs?limit=30&folder_id=' + encodeURIComponent(this.scopedFolderId))
              : '/api/newborn/runs?limit=30';
            const [ovRes, runsRes] = await Promise.all([
              this.apiJson('/api/newborn/overview'),
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
          } catch (_) {}
        },

        async switchView(view) {
          this.activeView = view;
          if (view === 'hunt') {
            await Promise.all([this.loadCandidates(), this.loadCrossoverForActiveHunt()]);
          } else if (view === 'watchlist') {
            await Promise.all([this.loadWatchlist(), this.loadDailyAnchors()]);
          } else if (view === 'history') {
            await this.loadOverviewAndRuns();
          }
          this.refreshIcons();
        },

        async selectPastRun(run) {
          if (!run || !run.id) return;
          this.activeRunId = Number(run.id);
          this.activeRun = run;
          this.showRunCompleteBanner = false;
          this.activeView = 'hunt';
          this.selectedPinIds = [];
          this.filters.annotation = '';
          if (run.status === 'running') {
            this.startPollingRun(this.activeRunId);
          }
          await Promise.all([this.loadCandidates(), this.loadCrossoverForActiveHunt()]);
          this.refreshIcons();
        },

        async clearRunScope() {
          this.activeRunId = null;
          this.selectedPinIds = [];
          this.filters.annotation = '';
          await Promise.all([this.loadCandidates(), this.loadCrossoverForActiveHunt()]);
          this.refreshIcons();
        },

        toggleFilterFlag(key) {
          this.filters[key] = !this.filters[key];
          this.loadCandidates();
        },

        selectAnnotationFilter(tag) {
          const clean = String(tag || '').trim();
          if (!clean) return;
          if (this.filters.annotation && this.filters.annotation.toLowerCase() === clean.toLowerCase()) {
            this.filters.annotation = '';
          } else {
            this.filters.annotation = clean;
          }
          this.loadCandidates();
        },

        async loadCandidates() {
          this.isLoading = true;
          try {
            const params = new URLSearchParams();
            if (this.activeRunId) params.set('run_id', String(this.activeRunId));
            if (this.scopedFolderId && !this.activeRunId) params.set('folder_id', String(this.scopedFolderId));
            if (this.filters.linklessOnly) params.set('linkless_only', 'true');
            if (this.filters.annotation && this.filters.annotation.trim()) params.set('annotation', this.filters.annotation.trim());
            if (this.filters.search && this.filters.search.trim()) params.set('search', this.filters.search.trim());
            params.set('sort', this.filters.sort || 'repins');
            params.set('limit', '200');

            const { data } = await this.apiJson('/api/newborn/candidates?' + params.toString());
            this.candidates = Array.isArray(data?.candidates) ? data.candidates : [];
            this.candidatesTotal = Number(data?.total ?? this.candidates.length);
          } catch (err) {
            this.toast('Failed to load Golden Pins: ' + err.message, 'error');
          } finally {
            this.isLoading = false;
            this.refreshIcons();
          }
        },

        async loadCrossoverForActiveHunt() {
          try {
            const qs = this.activeRunId ? ('?run_id=' + encodeURIComponent(this.activeRunId) + '&limit=30') : '?limit=30';
            const { data } = await this.apiJson('/api/newborn/crossover' + qs);
            this.crossoverClusters = Array.isArray(data?.clusters) ? data.clusters : [];
          } catch (_) {
            this.crossoverClusters = [];
          }
        },

        annotationsCrossoverList() {
          if (Array.isArray(this.crossoverClusters) && this.crossoverClusters.length > 0) {
            return this.crossoverClusters;
          }
          const totalPins = this.candidates.length;
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
          const list = this.annotationsCrossoverList().slice(0, 10);
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
              if (!r || !r.fetched) return c;
              return {
                ...c,
                effective_creator_username: r.username || c.effective_creator_username,
                effective_creator_followers: r.effective_creator_followers,
                creator_monthly_reach: r.creator_monthly_reach,
                creator_profile_views: r.creator_profile_views,
                creator_pin_count: r.creator_pin_count
              };
            });

            if (refreshDossier && this.dossierData && this.dossierData.candidate) {
              const dr = resMap.get(String(this.dossierData.candidate.pin_id));
              if (dr && dr.fetched) {
                this.dossierData = {
                  ...this.dossierData,
                  candidate: {
                    ...this.dossierData.candidate,
                    effective_creator_username: dr.username || this.dossierData.candidate.effective_creator_username,
                    effective_creator_followers: dr.effective_creator_followers,
                    creator_monthly_reach: dr.creator_monthly_reach,
                    creator_profile_views: dr.creator_profile_views,
                    creator_pin_count: dr.creator_pin_count
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
              l1_interest: this.launchpadInterest || 'all'
            });
            const { data } = await this.apiJson('/api/newborn/launchpad?' + params.toString());
            this.launchpadTrends = Array.isArray(data?.trends) ? data.trends : [];
            this.launchpadPopularTerms = Array.isArray(data?.popular_terms) ? data.popular_terms : [];
            this.launchpadIdeasForYou = Array.isArray(data?.ideas_for_you_terms) ? data.ideas_for_you_terms : [];
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
                limit: 25
              })
            });
            this.launchpadTrends = Array.isArray(data?.trends) ? data.trends : [];
            this.launchpadPopularTerms = Array.isArray(data?.popular_terms) ? data.popular_terms : [];
            this.launchpadIdeasForYou = Array.isArray(data?.ideas_for_you_terms) ? data.ideas_for_you_terms : [];
            this.toast('Loaded ' + this.launchpadTrends.length + ' rising Pinterest trends', 'success');
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
              profile_id: this.selectedProfileId || null,
              folder_id: this.scopedFolderId ? Number(this.scopedFolderId) : null,
              filters: {
                max_age_days: Math.max(1, Math.min(365, Number(this.huntFilters.maxAgeDays) || 30)),
                min_repin_count: Math.max(0, Number(this.huntFilters.minRepins) || 0),
                min_save_count: Math.max(0, Number(this.huntFilters.minSaves) || 0)
              },
              paths: {
                search: {
                  enabled: Boolean(this.huntPaths.search.enabled),
                  target_pins: Number(this.huntPaths.search.target_pins) || 500
                },
                boards: {
                  enabled: Boolean(this.huntPaths.boards.enabled),
                  max_boards: Number(this.huntPaths.boards.max_boards) || 10,
                  target_pins_per_board: Number(this.huntPaths.boards.target_pins_per_board) || 100,
                  find_more_ideas: Boolean(this.huntPaths.boards.find_more_ideas)
                },
                idea_page: {
                  enabled: Boolean(this.huntPaths.idea_page.enabled),
                  target_pins: Number(this.huntPaths.idea_page.target_pins) || 250
                },
                home_feed: {
                  enabled: Boolean(this.huntPaths.home_feed.enabled),
                  target_pins: Number(this.huntPaths.home_feed.target_pins) || 250
                }
              }
            };
            const { data } = await this.apiJson('/api/newborn/discover', {
              method: 'POST',
              body: JSON.stringify(payload)
            });

            if (data?.run_id) {
              this.activeRunId = Number(data.run_id);
              this.activeRun = data.run || {
                id: this.activeRunId,
                run_type: 'discovery',
                status: 'running',
                progress_stage: 'queued',
                progress_detail: 'Queued — starting deep-scroll Golden Pin hunt...',
                progress_pct: 5,
                seed_queries: rawSeed ? [rawSeed] : ['home_feed']
              };
              this.activeView = 'hunt';
              this.showRunCompleteBanner = false;
              this.selectedPinIds = [];
              this.filters.annotation = '';
              this.startPollingRun(this.activeRunId);
              this.toast(data.deduplicated ? ('Attached to live Hunt #' + this.activeRunId) : ('Hunt #' + this.activeRunId + ' started'), 'info');
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
                filters: {
                  max_age_days: Math.max(1, Math.min(365, Number(this.huntFilters.maxAgeDays) || 30)),
                  min_repin_count: Math.max(0, Number(this.huntFilters.minRepins) || 0),
                  min_save_count: Math.max(0, Number(this.huntFilters.minSaves) || 0)
                },
                profile_id: this.selectedProfileId || null,
                folder_id: this.scopedFolderId ? Number(this.scopedFolderId) : null
              })
            });
            if (data?.run_id) {
              this.activeRunId = Number(data.run_id);
              this.activeRun = data.run || {
                id: this.activeRunId,
                run_type: 'snowball',
                status: 'running',
                progress_stage: 'queued',
                progress_detail: 'Queued — scrolling Related Pins...',
                progress_pct: 5
              };
              this.activeView = 'hunt';
              this.selectedPinIds = [];
              this.filters.annotation = '';
              this.startPollingRun(this.activeRunId);
              this.toast('Scrolling Related Pins (Hunt #' + this.activeRunId + ')', 'info');
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
            clearInterval(this.pollTimerId);
            this.pollTimerId = null;
          }
          this.isPollingRun = false;
        },

        startPollingRun(runId) {
          this.stopPollingRun();
          const targetId = Number(runId);
          if (!Number.isInteger(targetId) || targetId <= 0) return;
          this.isPollingRun = true;
          this.pollTimerId = setInterval(() => {
            this.pollRunOnce(targetId);
          }, 1500);
          this.pollRunOnce(targetId);
        },

        async pollRunOnce(runId) {
          try {
            const { data } = await this.apiJson('/api/newborn/runs/' + encodeURIComponent(runId));
            const run = data?.run;
            if (!run) return;
            this.activeRun = run;

            if (run.telemetry && run.telemetry.idea_page && run.telemetry.idea_page.found) {
              this.ideaPageInfo = run.telemetry.idea_page;
            }

            if (run.status !== 'running') {
              this.stopPollingRun();
              this.showRunCompleteBanner = true;
              await this.loadOverviewAndRuns();

              if (run.run_type === 'watchlist_poll') {
                await Promise.all([this.loadWatchlist(), this.loadDailyAnchors()]);
              } else {
                this.activeRunId = Number(run.id);
                await Promise.all([this.loadCandidates(), this.loadCrossoverForActiveHunt()]);
              }

              if (run.status === 'failed') {
                this.toast('Hunt #' + run.id + ' failed: ' + (run.error_message || 'Unknown error'), 'error');
              } else {
                const f = this.getRunFunnel(run);
                this.toast('Hunt #' + run.id + ' complete: ' + f.verifiedWinners + ' Golden Pin winners', 'success');
              }
              this.refreshIcons();
            }
          } catch (_) {}
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

        exportCsv() {
          if (!Array.isArray(this.candidates) || this.candidates.length === 0) return;
          const headers = [
            'Pin ID', 'Title', 'Pinterest URL', 'Destination Domain', 'No Link',
            'Root Age (Days)', 'Root Created UTC', 'Re-pins', 'Re-pins/day', 'Saves',
            'Pin Annotations', 'Discovery Source', 'Board Name',
            'Account Username', 'Total Audience', 'Impressions'
          ];
          const rows = [headers.map((h) => this.sanitizeCsvCell(h)).join(',')];
          for (const p of this.candidates) {
            const tags = this.extractPinAnnotationNames(p).join('; ');
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
              tags,
              this.formatSurfaceLabel(p.first_surface),
              p.board_name || '',
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
          this.toast('Exported ' + this.candidates.length + ' Golden Pins to CSV', 'success');
          return csvContent;
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
              this.activeView === 'watchlist' ? this.loadWatchlist() : this.loadCandidates()
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
              this.loadWatchlist(),
              this.loadDailyAnchors()
            ]);
            this.toast('Enrolled ' + (data?.pins?.promoted_count || this.promotePinIds.length) + ' pin(s) in Daily Tracking', 'success');
          } catch (err) {
            this.toast('Track Daily failed: ' + err.message, 'error');
          } finally {
            this.isPromoting = false;
          }
        },

        async loadWatchlist() {
          try {
            const { data } = await this.apiJson('/api/newborn/candidates?stage=watchlist&limit=200&sort=repins');
            this.watchlistCandidates = Array.isArray(data?.candidates) ? data.candidates : [];
          } catch (_) {}
        },

        async loadDailyAnchors() {
          try {
            const { data } = await this.apiJson('/api/newborn/anchors?active_only=true&limit=200');
            this.dailyAnchors = Array.isArray(data?.anchors) ? data.anchors : [];
          } catch (_) {}
        },

        async pollWatchlistNow() {
          this.isSubmittingWatchlistPoll = true;
          try {
            const { data } = await this.apiJson('/api/newborn/watchlist/poll', {
              method: 'POST',
              body: JSON.stringify({
                profile_id: this.selectedProfileId || null,
                folder_id: this.scopedFolderId ? Number(this.scopedFolderId) : null
              })
            });
            if (data?.run_id) {
              this.activeRun = data.run || {
                id: Number(data.run_id),
                run_type: 'watchlist_poll',
                status: 'running',
                progress_stage: 'queued',
                progress_detail: 'Polling watchlisted pins on Pinterest...',
                progress_pct: 5
              };
              this.startPollingRun(data.run_id);
              this.toast('Watchlist poll started (Run #' + data.run_id + ')', 'info');
            }
          } catch (err) {
            this.toast('Watchlist poll failed: ' + err.message, 'error');
          } finally {
            this.isSubmittingWatchlistPoll = false;
          }
        },

        async openDossier(pinId) {
          this.dossierOpen = true;
          this.isLoadingDossier = true;
          this.dossierData = null;
          try {
            const { data } = await this.apiJson('/api/newborn/candidates/' + encodeURIComponent(pinId));
            this.dossierData = data;
          } catch (err) {
            this.toast('Failed to load dossier: ' + err.message, 'error');
            this.dossierOpen = false;
          } finally {
            this.isLoadingDossier = false;
            this.refreshIcons();
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
              this.huntFilters.maxAgeDays = Number(data.settings.qualification?.max_age_days || 30);
              this.huntFilters.minRepins = Number(data.settings.qualification?.min_repin_count ?? 20);
              this.huntFilters.minSaves = Number(data.settings.qualification?.min_save_count ?? 0);
            }
            if (data?.schedule) this.scheduleStatus = data.schedule;
            this.toast('Settings saved', 'success');
            this.closeSettingsDrawer();
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
              this.huntFilters.maxAgeDays = Number(data.settings.qualification?.max_age_days || 30);
              this.huntFilters.minRepins = Number(data.settings.qualification?.min_repin_count ?? 20);
              this.huntFilters.minSaves = Number(data.settings.qualification?.min_save_count ?? 0);
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
              this.closeSettingsDrawer();
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

        openProfileModal(prof = null) {
          if (prof) {
            const q = prof.qualification_config || {};
            this.profileForm = {
              id: prof.id,
              name: prof.name || '',
              description: prof.description || '',
              maxAgeDays: Number(q.max_age_days || 30),
              minRepins: Number(q.min_repin_count ?? 20),
              minSaves: Number(q.min_save_count ?? 0),
              linklessOnly: Boolean(q.linkless_vacuum?.linkless_vacuum_only || q.linkless_vacuum?.mode === 'only'),
              isDefault: Boolean(prof.is_default)
            };
          } else {
            this.profileForm = {
              id: null,
              name: '',
              description: '',
              maxAgeDays: 14,
              minRepins: 20,
              minSaves: 0,
              linklessOnly: false,
              isDefault: false
            };
          }
          this.profileModalOpen = true;
          this.refreshIcons();
        },

        async saveProfile() {
          if (!this.profileForm.name.trim()) return;
          this.isSavingProfile = true;
          try {
            const payload = {
              name: this.profileForm.name.trim(),
              description: this.profileForm.description.trim(),
              is_default: Boolean(this.profileForm.isDefault),
              folder_id: this.scopedFolderId ? Number(this.scopedFolderId) : null,
              surfaces_config: {},
              qualification_config: {
                age_window_preset: [7, 14, 30, 60, 90].includes(Number(this.profileForm.maxAgeDays)) ? (this.profileForm.maxAgeDays + 'd') : 'custom',
                max_age_days: Number(this.profileForm.maxAgeDays || 30),
                min_repin_count: Number(this.profileForm.minRepins ?? 20),
                min_save_count: Number(this.profileForm.minSaves ?? 0),
                linkless_vacuum: {
                  mode: this.profileForm.linklessOnly ? 'only' : 'boost',
                  linkless_vacuum_only: Boolean(this.profileForm.linklessOnly)
                }
              },
              automation_config: {}
            };

            if (this.profileForm.id) {
              await this.apiJson('/api/newborn/rules/' + encodeURIComponent(this.profileForm.id), {
                method: 'PUT',
                body: JSON.stringify(payload)
              });
            } else {
              await this.apiJson('/api/newborn/rules', {
                method: 'POST',
                body: JSON.stringify(payload)
              });
            }
            this.profileModalOpen = false;
            await this.loadSettingsAndProfiles();
            this.toast('Rule profile saved', 'success');
          } catch (err) {
            this.toast('Profile save failed: ' + err.message, 'error');
          } finally {
            this.isSavingProfile = false;
          }
        },

        async deleteProfile(prof) {
          if (!prof || !prof.id || prof.is_default) return;
          try {
            await this.apiJson('/api/newborn/rules/' + encodeURIComponent(prof.id), { method: 'DELETE' });
            await this.loadSettingsAndProfiles();
            this.toast('Deleted profile "' + prof.name + '"', 'success');
          } catch (err) {
            this.toast('Delete failed: ' + err.message, 'error');
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

        formatSurfaceLabel(surface) {
          const map = {
            pin_serp_capsules: 'Search',
            fresh_boards: 'Board',
            board_feed: 'Board',
            board_more_ideas: 'Find More Ideas',
            ideas_feeds: 'Idea Page',
            home_feed: 'Home Feed',
            related_pin_snowball: 'Related',
            growing_trends: 'Trends',
            zero_query_popular: 'Popular'
          };
          return map[String(surface || '').toLowerCase()] || 'Search';
        },

        formatRunSeedLabel(run) {
          if (!run) return '';
          const seeds = Array.isArray(run.seed_queries) ? run.seed_queries : [];
          if (seeds.length > 0) return seeds.slice(0, 2).join(', ');
          if (run.run_type === 'watchlist_poll') return 'Watchlist Refresh';
          if (run.run_type === 'snowball') return 'Related Pins Scroll';
          return 'Deep-Scroll Hunt';
        },

        getHumanProgressStep(stage) {
          const map = {
            queued: 'Queued — preparing deep-scroll hunt...',
            harvesting: '1. Deep-scrolling selected paths...',
            pretriage: '2. Filtering Re-pins via 50x Zero-Cookie Pidgets...',
            hydrating_pins: '3. Verifying root Age & Pin Annotations...',
            snowballing: '3. Scrolling Related Pins...',
            hydrating_creators: '3. Finalizing Golden Pin winners...',
            persisting: '3. Saving verified Golden Pin winners...',
            completed: 'Hunt complete',
            failed: 'Hunt failed'
          };
          return map[String(stage || '').toLowerCase()] || 'Running Golden Pin hunt...';
        },

        getProgressStepIndex(stage) {
          const s = String(stage || '').toLowerCase();
          if (s === 'hydrating_pins' || s === 'hydrating_creators' || s === 'persisting' || s === 'completed') return 3;
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
          if (!str) return '';
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

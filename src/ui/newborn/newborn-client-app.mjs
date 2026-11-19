/**
 * src/ui/newborn/newborn-client-app.mjs
 *
 * Client-Side Alpine.js Studio Controller for `/newborn` 3-Second Studio:
 * - Instant HTTP 202 Accepted launch + 1.5s live progress polling (`GET /api/newborn/runs/:id`)
 * - Strict `activeRunId` result scoping (`This Hunt` | `Watchlist` | `Past Hunts`)
 * - Slide-over Settings & Automation Drawer (opens cleanly on `/newborn/settings`)
 * - Exact backend JSON contract alignment (`surfaces_config`, `qualification_config`,
 *   `automation_config`, `cookieStatus.preview`, `schedule.watchlist_poll_due`)
 * - Clean timer teardown on terminal run status and `pagehide` / `beforeunload`
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
            growing_trends: { enabled: true, max_pages: 1, limit: 25 },
            zero_query_popular: { enabled: true, max_pages: 1 },
            pin_serp_capsules: { enabled: true, max_pages: 2, page_size: 50 },
            fresh_boards: { enabled: true, max_pages: 1, max_boards_to_expand: 8 },
            board_feed: { enabled: true, max_pages: 2, page_size: 50 },
            board_more_ideas: { enabled: true, max_pages: 2, page_size: 25 },
            ideas_feeds: { enabled: true, max_pages: 2, max_interests_per_run: 6 },
            related_pin_snowball: { enabled: true, max_pages: 2, page_size: 24 }
          },
          snowball: { enabled: true, max_hops: 2, seed_cap: 10, min_seed_golden_score: 65 },
          hydration: { enable_pidgets_pretriage: true, max_pin_hydrations_per_run: 150, max_user_hydrations_per_run: 50 }
        },
        qualification: {
          age_window_preset: '30d',
          min_age_days: 0,
          max_age_days: 30,
          min_repin_count: 0,
          min_save_count: 15,
          min_repin_per_day: 0,
          min_save_per_day: 2.0,
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

        // Hero Hunt & Trends State
        huntInput: '',
        selectedProfileId: '',
        isSubmittingHunt: false,
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
          goldenOnly: false,
          linklessOnly: false,
          rookieOnly: false,
          search: '',
          sort: 'golden_score'
        },

        // Collapsible Hunt Insights (Strictly Scoped to activeRunId)
        showHuntInsights: false,
        crossoverClusters: [],
        rookies: [],

        // Watchlist & History
        watchlistSubView: 'staged',
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

        // Track / Promote Modal
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
          minSavePerDay: 2,
          linklessOnly: false,
          isDefault: false
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

          if (this.activeView === 'watchlist') {
            await Promise.all([this.loadWatchlist(), this.loadDailyAnchors()]);
          } else {
            await this.loadCandidates();
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

        async refreshWorkspace(force = false) {
          await Promise.all([
            this.loadOverviewAndRuns(),
            this.activeView === 'watchlist'
              ? Promise.all([this.loadWatchlist(), this.loadDailyAnchors()])
              : this.loadCandidates()
          ]);
          if (this.showHuntInsights) {
            await this.loadHuntInsights();
          }
          if (force) this.toast('Workspace refreshed', 'success');
          this.refreshIcons();
        },

        async loadSettingsAndProfiles() {
          try {
            const { data } = await this.apiJson('/api/newborn/settings');
            if (data.settings) {
              this.settingsDraft = cloneJson(data.settings);
              this.launchpadCountry = data.settings?.discovery?.country || 'US';
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
            await this.loadCandidates();
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
          if (run.status === 'running') {
            this.startPollingRun(this.activeRunId);
          }
          await this.loadCandidates();
          if (this.showHuntInsights) {
            await this.loadHuntInsights();
          }
          this.refreshIcons();
        },

        async clearRunScope() {
          this.activeRunId = null;
          this.selectedPinIds = [];
          await this.loadCandidates();
          if (this.showHuntInsights) {
            await this.loadHuntInsights();
          }
          this.refreshIcons();
        },

        toggleFilterFlag(key) {
          this.filters[key] = !this.filters[key];
          this.loadCandidates();
        },

        async loadCandidates() {
          this.isLoading = true;
          try {
            const params = new URLSearchParams();
            if (this.activeRunId) params.set('run_id', String(this.activeRunId));
            if (this.scopedFolderId && !this.activeRunId) params.set('folder_id', String(this.scopedFolderId));
            if (this.filters.goldenOnly) params.set('golden_only', 'true');
            if (this.filters.linklessOnly) params.set('linkless_only', 'true');
            if (this.filters.rookieOnly) params.set('rookie_only', 'true');
            if (this.filters.search && this.filters.search.trim()) params.set('search', this.filters.search.trim());
            params.set('sort', this.filters.sort || 'golden_score');
            params.set('limit', '100');

            const { data } = await this.apiJson('/api/newborn/candidates?' + params.toString());
            this.candidates = Array.isArray(data?.candidates) ? data.candidates : [];
            this.candidatesTotal = Number(data?.total ?? this.candidates.length);
          } catch (err) {
            this.toast('Failed to load candidates: ' + err.message, 'error');
          } finally {
            this.isLoading = false;
            this.refreshIcons();
          }
        },

        async toggleHuntInsights() {
          this.showHuntInsights = !this.showHuntInsights;
          if (this.showHuntInsights) {
            await this.loadHuntInsights();
          }
          this.refreshIcons();
        },

        async loadHuntInsights() {
          try {
            const qs = this.activeRunId ? ('?run_id=' + encodeURIComponent(this.activeRunId)) : '';
            const [cxRes, rkRes] = await Promise.all([
              this.apiJson('/api/newborn/crossover' + qs),
              this.apiJson('/api/newborn/rookies' + qs)
            ]);
            this.crossoverClusters = Array.isArray(cxRes.data?.clusters) ? cxRes.data.clusters : [];
            this.rookies = Array.isArray(rkRes.data?.rookies) ? rkRes.data.rookies : [];
          } catch (_) {}
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
          await this.runFocusedHunt(clean);
        },

        async runFocusedHunt(explicitSeed = null) {
          const rawSeed = String(explicitSeed !== null ? explicitSeed : this.huntInput || '').trim();
          if (!rawSeed) {
            this.toast('Enter a keyword, board URL, or pin ID to hunt.', 'warning');
            return;
          }
          this.isSubmittingHunt = true;
          try {
            const payload = {
              query: rawSeed,
              profile_id: this.selectedProfileId || null,
              folder_id: this.scopedFolderId ? Number(this.scopedFolderId) : null
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
                progress_detail: 'Queued — starting Newborn hunt...',
                progress_pct: 5,
                seed_queries: [rawSeed]
              };
              this.activeView = 'hunt';
              this.showRunCompleteBanner = false;
              this.selectedPinIds = [];
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

        async snowballPins(pinIds = []) {
          const cleanIds = Array.isArray(pinIds) ? pinIds.filter(Boolean) : [];
          if (cleanIds.length === 0) return;
          try {
            const { data } = await this.apiJson('/api/newborn/snowball', {
              method: 'POST',
              body: JSON.stringify({
                seed_pin_ids: cleanIds,
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
                progress_detail: 'Queued — finding related newborn pins...',
                progress_pct: 5
              };
              this.activeView = 'hunt';
              this.selectedPinIds = [];
              this.startPollingRun(this.activeRunId);
              this.toast('Finding related newborns (Hunt #' + this.activeRunId + ')', 'info');
            }
          } catch (err) {
            this.toast('Snowball launch failed: ' + err.message, 'error');
          }
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
          // Also perform an immediate quick check
          this.pollRunOnce(targetId);
        },

        async pollRunOnce(runId) {
          try {
            const { data } = await this.apiJson('/api/newborn/runs/' + encodeURIComponent(runId));
            const run = data?.run;
            if (!run) return;
            this.activeRun = run;

            if (run.status !== 'running') {
              this.stopPollingRun();
              this.showRunCompleteBanner = true;
              await this.loadOverviewAndRuns();

              if (run.run_type === 'watchlist_poll') {
                await Promise.all([this.loadWatchlist(), this.loadDailyAnchors()]);
              } else {
                this.activeRunId = Number(run.id);
                await this.loadCandidates();
                if (this.showHuntInsights) {
                  await this.loadHuntInsights();
                }
              }

              if (run.status === 'failed') {
                this.toast('Hunt #' + run.id + ' failed: ' + (run.error_message || 'Unknown error'), 'error');
              } else {
                this.toast('Hunt #' + run.id + ' complete: ' + (run.candidates_qualified || 0) + ' verified newborns', 'success');
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
            this.toast('Promoted ' + (data?.pins?.promoted_count || this.promotePinIds.length) + ' pin(s) to daily tracking', 'success');
          } catch (err) {
            this.toast('Promotion failed: ' + err.message, 'error');
          } finally {
            this.isPromoting = false;
          }
        },

        async promoteRookieCreator(username) {
          if (!username) return;
          try {
            await this.apiJson('/api/newborn/promote', {
              method: 'POST',
              body: JSON.stringify({
                usernames: [username],
                tracking_mode: 'pulse_only',
                folder_id: this.scopedFolderId ? Number(this.scopedFolderId) : null
              })
            });
            await this.loadHuntInsights();
            this.toast('Tracking @' + username + ' in Creator Hub', 'success');
          } catch (err) {
            this.toast('Creator promotion failed: ' + err.message, 'error');
          }
        },

        async loadWatchlist() {
          try {
            const { data } = await this.apiJson('/api/newborn/candidates?stage=watchlist&limit=200');
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
          const map = { '7d': 7, '14d': 14, '30d': 30, '90d': 90 };
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
            if (data?.settings) this.settingsDraft = cloneJson(data.settings);
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
            if (data?.settings) this.settingsDraft = cloneJson(data.settings);
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
            this.toast('Stored cookie cleared (Guest Mode active)', 'info');
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
              minSavePerDay: Number(q.min_save_per_day ?? 2),
              linklessOnly: Boolean(q.linkless_vacuum?.linkless_vacuum_only || q.linkless_vacuum?.mode === 'only'),
              isDefault: Boolean(prof.is_default)
            };
          } else {
            this.profileForm = {
              id: null,
              name: '',
              description: '',
              maxAgeDays: 14,
              minSavePerDay: 2,
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
                age_window_preset: [7, 14, 30, 90].includes(Number(this.profileForm.maxAgeDays)) ? (this.profileForm.maxAgeDays + 'd') : 'custom',
                max_age_days: Number(this.profileForm.maxAgeDays || 30),
                min_save_per_day: Number(this.profileForm.minSavePerDay ?? 2),
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
        formatRunSeedLabel(run) {
          if (!run) return '';
          const seeds = Array.isArray(run.seed_queries) ? run.seed_queries : [];
          if (seeds.length > 0) return seeds.slice(0, 2).join(', ');
          if (run.run_type === 'watchlist_poll') return 'Watchlist Refresh';
          if (run.run_type === 'snowball') return 'Related Newborn Expansion';
          return 'Discovery Sweep';
        },

        getHumanProgressStep(stage) {
          const map = {
            queued: 'Queued — preparing Newborn hunt...',
            harvesting: '1. Harvesting search & fresh boards...',
            hydrating_pins: '2. Verifying root creation dates on Pinterest...',
            snowballing: '2b. Expanding related newborn pins...',
            hydrating_creators: '3. Ranking verified newborn winners...',
            persisting: '3. Saving verified newborn winners...',
            completed: 'Hunt complete',
            failed: 'Hunt failed'
          };
          return map[String(stage || '').toLowerCase()] || 'Running Newborn hunt...';
        },

        getProgressStepIndex(stage) {
          const s = String(stage || '').toLowerCase();
          if (s === 'hydrating_creators' || s === 'persisting' || s === 'completed') return 3;
          if (s === 'hydrating_pins' || s === 'snowballing') return 2;
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

        formatProvenanceLabel(code) {
          const map = {
            SHARE_EXTENSION_IOS: 'iOS App',
            SHARE_EXTENSION_ANDROID: 'Android App',
            UPLOADED: 'Web Upload',
            ORGANIC_PIN: 'Organic Pin',
            CAROUSEL: 'Carousel',
            VIDEO: 'Video Pin',
            IDEA_PIN: 'Idea Pin',
            BOOKMARKLET: 'Browser Save',
            UNKNOWN: 'Standard Pin'
          };
          return map[String(code || '').toUpperCase()] || 'Standard Pin';
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

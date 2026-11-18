/**
 * src/ui/newborn/newborn-client-app.mjs
 *
 * Client-side Alpine.js controller (`newbornStudioApp`) for `/newborn` & `/folders/:id/newborn`:
 * - Binds dynamically to `/api/newborn/settings`, `/api/newborn/settings/reset`,
 *   `/api/newborn/profiles`, `/api/newborn/cookie` (strictly redacted), `/api/newborn/overview`,
 *   `/api/newborn/launchpad`, `/api/newborn/candidates`, `/api/newborn/rookies`,
 *   `/api/newborn/crossover`, `/api/newborn/anchors`, `/api/newborn/runs`,
 *   `/api/newborn/discover`, `/api/newborn/snowball`, `/api/newborn/watchlist/poll`,
 *   `/api/newborn/auto-run`, `/api/newborn/promote`, and `/api/newborn/fleet-dispatch`.
 * - Enforces Headless Node safety (`typeof window !== 'undefined'`), Light-Mode Bento theme
 *   toggling strictly on `document.documentElement`, `10M+` ceiling formatting, `null` unhydrated
 *   metric preservation, `safeUrl`, and `sanitizeCsvCell`.
 */

export function getNewbornClientAppScript() {
  return `  <script>
    function createDefaultNewbornSettingsDraft() {
      return {
        schema_version: 1,
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
          snowball: {
            enabled: true,
            max_hops: 2,
            seed_cap: 10,
            min_seed_golden_score: 65
          },
          hydration: {
            enable_pidgets_pretriage: true,
            max_pin_hydrations_per_run: 150,
            max_user_hydrations_per_run: 50
          }
        },
        qualification: {
          age_window_preset: '30d',
          min_age_days: 0,
          max_age_days: 30,
          min_repin_count: 5,
          min_save_count: 10,
          min_repin_per_day: 1.5,
          min_save_per_day: 2.0,
          min_shares: 0,
          min_comments: 0,
          min_reactions: 0,
          max_creator_followers: 25000,
          enforce_max_followers_filter: false,
          provenance: {
            allowed_sources: [
              'SHARE_EXTENSION_IOS',
              'SHARE_EXTENSION_ANDROID',
              'UPLOADED',
              'ORGANIC_PIN',
              'CAROUSEL',
              'VIDEO',
              'IDEA_PIN',
              'BOOKMARKLET',
              'UNKNOWN'
            ],
            excluded_sources: [],
            ai_disclosure_policy: 'exclude',
            exclude_products: true,
            exclude_videos: false
          },
          linkless_vacuum: {
            mode: 'boost',
            linkless_vacuum_only: false,
            score_boost: 12
          }
        },
        automation: {
          auto_track_enabled: false,
          schedule: {
            cadence: 'every_6h',
            interval_minutes: 360,
            watchlist_poll_interval_minutes: 720,
            target_window_utc: { start_hour: 0, end_hour: 23 },
            cooldown_minutes: 60,
            last_discovery_run_at: null,
            last_watchlist_poll_at: null
          },
          pin_promotion_rules: {
            watchlist_thresholds: {
              min_repins: 5,
              min_saves: 0,
              min_repin_per_day: 1.5,
              max_age_days: 30,
              min_golden_score: 55
            },
            promote_thresholds: {
              min_repins: 25,
              min_saves: 40,
              min_repin_per_day: 4.0,
              max_age_days: 30,
              min_golden_score: 75,
              min_consecutive_days: 2
            },
            destinations: {
              stage_to_watchlist: true,
              promote_to_daily_ssot: true,
              promote_to_campaign_folder_id: '',
              promote_top_annotation_as_keyword: false,
              promote_to_cluster_seeds: false
            }
          },
          rookie_promotion_rules: {
            enabled: true,
            max_followers: 10000,
            min_monthly_reach: 50000,
            min_golden_pins: 2,
            min_rookie_score: 70,
            min_consecutive_days: 2,
            destination_tracking_mode: 'pulse_only',
            destination_folder_id: null
          }
        }
      };
    }

    function mergeNewbornSettingsDraft(incoming) {
      var base = createDefaultNewbornSettingsDraft();
      if (!incoming || typeof incoming !== 'object') return base;

      var incDisc = incoming.discovery || {};
      var incSurf = incDisc.surfaces || {};
      var surfKeys = Object.keys(base.discovery.surfaces);
      for (var i = 0; i < surfKeys.length; i++) {
        var sk = surfKeys[i];
        if (incSurf[sk] && typeof incSurf[sk] === 'object') {
          base.discovery.surfaces[sk] = Object.assign({}, base.discovery.surfaces[sk], incSurf[sk]);
        }
      }
      base.discovery.country = incDisc.country || base.discovery.country;
      base.discovery.default_l1_interest = incDisc.default_l1_interest || base.discovery.default_l1_interest;
      if (incDisc.max_board_age_days !== undefined) base.discovery.max_board_age_days = Number(incDisc.max_board_age_days);
      if (incDisc.snowball && typeof incDisc.snowball === 'object') {
        base.discovery.snowball = Object.assign({}, base.discovery.snowball, incDisc.snowball);
      }
      if (incDisc.hydration && typeof incDisc.hydration === 'object') {
        base.discovery.hydration = Object.assign({}, base.discovery.hydration, incDisc.hydration);
      }

      var incQual = incoming.qualification || {};
      base.qualification = Object.assign({}, base.qualification, incQual, {
        provenance: Object.assign({}, base.qualification.provenance, incQual.provenance || {}),
        linkless_vacuum: Object.assign({}, base.qualification.linkless_vacuum, incQual.linkless_vacuum || {})
      });
      if (!Array.isArray(base.qualification.provenance.allowed_sources)) {
        base.qualification.provenance.allowed_sources = ['SHARE_EXTENSION_IOS', 'SHARE_EXTENSION_ANDROID', 'UPLOADED', 'ORGANIC_PIN', 'UNKNOWN'];
      }

      var incAuto = incoming.automation || {};
      var incSched = incAuto.schedule || {};
      var incPinRules = incAuto.pin_promotion_rules || {};
      var incDest = incPinRules.destinations || {};
      base.automation.auto_track_enabled = Boolean(incAuto.auto_track_enabled);
      base.automation.schedule = Object.assign({}, base.automation.schedule, incSched, {
        target_window_utc: Object.assign({}, base.automation.schedule.target_window_utc, incSched.target_window_utc || {})
      });
      base.automation.pin_promotion_rules = {
        watchlist_thresholds: Object.assign({}, base.automation.pin_promotion_rules.watchlist_thresholds, incPinRules.watchlist_thresholds || {}),
        promote_thresholds: Object.assign({}, base.automation.pin_promotion_rules.promote_thresholds, incPinRules.promote_thresholds || {}),
        destinations: Object.assign({}, base.automation.pin_promotion_rules.destinations, incDest, {
          promote_to_campaign_folder_id: incDest.promote_to_campaign_folder_id != null && incDest.promote_to_campaign_folder_id !== ''
            ? String(incDest.promote_to_campaign_folder_id)
            : ''
        })
      };
      base.automation.rookie_promotion_rules = Object.assign(
        {},
        base.automation.rookie_promotion_rules,
        incAuto.rookie_promotion_rules || {}
      );

      return base;
    }

    function serializeNewbornSettingsForApi(draft) {
      var copy = JSON.parse(JSON.stringify(draft || createDefaultNewbornSettingsDraft()));
      var rawFolder = copy.automation &&
        copy.automation.pin_promotion_rules &&
        copy.automation.pin_promotion_rules.destinations
        ? copy.automation.pin_promotion_rules.destinations.promote_to_campaign_folder_id
        : null;
      if (copy.automation && copy.automation.pin_promotion_rules && copy.automation.pin_promotion_rules.destinations) {
        var parsedId = rawFolder !== null && rawFolder !== '' ? Number(rawFolder) : null;
        copy.automation.pin_promotion_rules.destinations.promote_to_campaign_folder_id =
          (parsedId && Number.isFinite(parsedId) && parsedId > 0) ? parsedId : null;
      }
      if (copy.qualification && copy.qualification.linkless_vacuum) {
        copy.qualification.linkless_vacuum.linkless_vacuum_only =
          copy.qualification.linkless_vacuum.mode === 'only';
      }
      return copy;
    }

    function newbornStudioApp(initialFolderId, initialRoom) {
      var validRooms = ['candidates', 'launchpad', 'rookies', 'crossover', 'watchlist', 'settings'];
      var startRoom = validRooms.indexOf(initialRoom) !== -1 ? initialRoom : 'candidates';

      return {
        // Shell & Campaign Folder Scope State [INVARIANT: HEADLESS-NODE-SHIELD]
        isDark: (typeof localStorage !== 'undefined') ? (localStorage.getItem('pa_theme') === 'dark') : false,
        darkMode: (typeof localStorage !== 'undefined') ? (localStorage.getItem('pa_theme') === 'dark') : false,
        isSidebarCollapsed: (typeof localStorage !== 'undefined') ? (localStorage.getItem('pae_sidebar_collapsed') === 'true') : false,
        isMobileMenuOpen: false,
        scopedFolderId: initialFolderId || '',
        activeFolderId: initialFolderId || '',
        activeFolder: null,
        foldersList: [],

        // 6-Room Navigation & Loading State
        currentRoom: startRoom,
        watchlistSubTab: 'queue',
        isLoading: false,
        isLoadingCandidates: false,
        isHunting: false,
        isSnowballing: false,
        isAutoRunning: false,
        isRefreshingLaunchpad: false,
        isPollingWatchlist: false,
        isSavingSettings: false,
        isSavingCookie: false,
        isPromoting: false,
        isSavingProfile: false,
        isDispatchingFleet: false,
        _candReqSeq: 0,

        // Telemetry Ribbon & Catalogs
        overviewCounts: {
          total_candidates: 0,
          discovered_count: 0,
          watchlist_count: 0,
          promoted_count: 0,
          discarded_count: 0,
          golden_pins_count: 0,
          linkless_vacuum_count: 0,
          rookie_outliers_count: 0,
          avg_golden_score: 0,
          rookie_accounts_count: 0,
          rookie_watchlist_count: 0,
          rookie_promoted_count: 0,
          active_daily_anchors_count: 0,
          active_profiles_count: 0
        },
        cookieStatus: {
          has_cookie: false,
          source: 'none',
          redacted_preview: null,
          zone_routing_mode: 'guest_only'
        },
        automationSchedule: {
          auto_track_enabled: false,
          cadence: 'every_6h',
          discovery_due: false,
          watchlist_due: false
        },
        surfacesCatalog: [
          { id: 'growing_trends', label: 'Growing Trends (90d Forecast)', cookie_zone: 'zero_cookie' },
          { id: 'zero_query_popular', label: 'Zero-Query Popular / Ideas for You', cookie_zone: 'auth_session' },
          { id: 'pin_serp_capsules', label: 'Pin SERP + Guided Capsules', cookie_zone: 'auth_session' },
          { id: 'fresh_boards', label: 'Fresh Boards Search', cookie_zone: 'zero_cookie' },
          { id: 'board_feed', label: 'Fresh Board Pin Feeds', cookie_zone: 'auth_session' },
          { id: 'board_more_ideas', label: 'Board "Find more ideas"', cookie_zone: 'auth_session' },
          { id: 'ideas_feeds', label: '/ideas/ Taxonomy Feeds', cookie_zone: 'auth_session' },
          { id: 'related_pin_snowball', label: 'Related Pin Snowball', cookie_zone: 'auth_session' }
        ],
        validProvenances: [
          'SHARE_EXTENSION_IOS',
          'SHARE_EXTENSION_ANDROID',
          'UPLOADED',
          'ORGANIC_PIN',
          'CAROUSEL',
          'VIDEO',
          'IDEA_PIN',
          'BOOKMARKLET',
          'UNKNOWN'
        ],
        l1InterestsCatalog: [
          { id: 'animals', slug: 'animals', label: 'Animals' },
          { id: 'architecture', slug: 'architecture', label: 'Architecture' },
          { id: 'art', slug: 'art', label: 'Art' },
          { id: 'beauty', slug: 'beauty', label: 'Beauty' },
          { id: 'design', slug: 'design', label: 'Design' },
          { id: 'diy-and-crafts', slug: 'diy-and-crafts', label: 'DIY & Crafts' },
          { id: 'education', slug: 'education', label: 'Education' },
          { id: 'entertainment', slug: 'entertainment', label: 'Entertainment' },
          { id: 'event-planning', slug: 'event-planning', label: 'Event Planning' },
          { id: 'finance', slug: 'finance', label: 'Finance' },
          { id: 'food-and-drink', slug: 'food-and-drink', label: 'Food & Drink' },
          { id: 'gardening', slug: 'gardening', label: 'Gardening' },
          { id: 'health', slug: 'health', label: 'Health' },
          { id: 'home-decor', slug: 'home-decor', label: 'Home Decor' },
          { id: 'mens-fashion', slug: 'mens-fashion', label: "Men's Fashion" },
          { id: 'parenting', slug: 'parenting', label: 'Parenting' },
          { id: 'quotes', slug: 'quotes', label: 'Quotes' },
          { id: 'sport', slug: 'sport', label: 'Sports' },
          { id: 'travel', slug: 'travel', label: 'Travel' },
          { id: 'vehicles', slug: 'vehicles', label: 'Vehicles' },
          { id: 'weddings', slug: 'weddings', label: 'Weddings' },
          { id: 'womens-fashion', slug: 'womens-fashion', label: "Women's Fashion" }
        ],
        supportedCountries: [
          { code: 'US', label: 'United States (US)' },
          { code: 'GB', label: 'United Kingdom (GB)' },
          { code: 'CA', label: 'Canada (CA)' },
          { code: 'AU', label: 'Australia (AU)' },
          { code: 'DE', label: 'Germany (DE)' },
          { code: 'FR', label: 'France (FR)' },
          { code: 'ES', label: 'Spain (ES)' },
          { code: 'IT', label: 'Italy (IT)' },
          { code: 'BR', label: 'Brazil (BR)' },
          { code: 'MX', label: 'Mexico (MX)' },
          { code: 'JP', label: 'Japan (JP)' },
          { code: 'IN', label: 'India (IN)' }
        ],
        profiles: [],
        selectedProfileSlug: '',
        huntQueryInput: '',
        latestRunSummary: null,

        // Room: Launchpad
        launchpadFilter: {
          country: 'US',
          trendType: 'growing',
          l1Interest: 'all'
        },
        launchpadData: {
          trends: [],
          popular_terms: [],
          ideas_for_you_terms: [],
          zero_query_used_guest_fallback: false,
          recent_seeds: [],
          cached_at: null
        },

        // Room: Golden Candidates
        candidateFilters: {
          stage: '',
          surface: '',
          provenance: '',
          goldenOnly: false,
          rookieOnly: false,
          linklessOnly: false,
          maxAgeDays: '',
          minGoldenScore: '',
          sort: 'golden_score',
          search: '',
          limit: 50,
          offset: 0
        },
        candidates: [],
        candidatesTotal: 0,
        selectedPinIds: [],

        // Room: Rookie Accounts Radar
        rookieFilters: {
          stage: '',
          search: '',
          limit: 50,
          offset: 0
        },
        rookies: [],
        rookiesTotal: 0,

        // Room: Semantic Crossover & Blueprints
        crossoverGoldenOnly: false,
        crossoverClusters: [],

        // Room: Watchlist, Anchors & Runs
        watchlistPins: [],
        dailyAnchors: [],
        runHistory: [],

        // Room: Settings, Rule Profiles & Cookie Vault
        settingsDraft: createDefaultNewbornSettingsDraft(),
        cookieDraftInput: '',
        alsoUpdateSharedCookie: true,

        // Modals & Slide-Over Dossier
        isPromoteModalOpen: false,
        promoteForm: {
          pinIds: [],
          promoteToDailySsot: true,
          folderId: initialFolderId || '',
          promoteKeyword: false,
          keyword: '',
          promoteClusterSeeds: true,
          availableUsernames: [],
          alsoPromoteCreators: false,
          notes: ''
        },
        isProfileModalOpen: false,
        profileForm: {
          id: null,
          slug: '',
          name: '',
          description: '',
          is_default: false,
          snapshotCurrentSettings: true
        },
        isDossierOpen: false,
        activeDossier: null,

        get blueprintShowcasePins() {
          var pool = Array.isArray(this.candidates) ? this.candidates : [];
          return pool
            .filter(function(p) { return Boolean(p && (p.crossover_blueprint || p.title)); })
            .slice(0, 12);
        },

        init: async function() {
          if (typeof window !== 'undefined' && window.location && window.location.search) {
            try {
              var sp = new URLSearchParams(window.location.search);
              var qParam = sp.get('search') || sp.get('q') || '';
              if (qParam) {
                this.candidateFilters.search = qParam;
                this.huntQueryInput = qParam;
              }
              var roomParam = (sp.get('room') || '').toLowerCase();
              if (!initialRoom && validRooms.indexOf(roomParam) !== -1) {
                this.currentRoom = roomParam;
              }
            } catch (_) {}
          }

          await Promise.all([
            this.loadFoldersCatalog(),
            this.loadSettingsAndProfiles(),
            this.loadOverview()
          ]);

          await this.loadCandidates(true);
          if (this.currentRoom !== 'candidates') {
            await this.refreshActiveRoom(false);
          }

          this.refreshIcons();
        },

        refreshIcons: function() {
          var run = function() {
            if (typeof lucide !== 'undefined' && lucide && typeof lucide.createIcons === 'function') {
              lucide.createIcons();
            }
          };
          if (typeof this.$nextTick === 'function') {
            this.$nextTick(run);
          } else {
            run();
          }
        },

        notify: function(message, kind) {
          if (typeof window !== 'undefined' && window.PAE && typeof window.PAE.toast === 'function') {
            window.PAE.toast(message, kind || 'info');
          }
        },

        askConfirm: function(message, options) {
          if (typeof window !== 'undefined' && window.PAE && typeof window.PAE.confirm === 'function') {
            return window.PAE.confirm(message, options || {});
          }
          return Promise.resolve(true);
        },

        callApi: async function(url, options) {
          if (typeof window !== 'undefined' && typeof window.apiFetch === 'function') {
            return window.apiFetch(url, options);
          }
          var res = await fetch(url, options);
          var data = await res.json().catch(function() { return {}; });
          return { ok: res.ok, status: res.status, data: data, json: async function() { return data; } };
        },

        toggleTheme: function() {
          this.isDark = !this.isDark;
          this.darkMode = this.isDark;
          if (typeof document !== 'undefined' && document.documentElement && document.documentElement.classList) {
            document.documentElement.classList.toggle('dark', this.isDark);
          }
          if (typeof localStorage !== 'undefined') {
            try {
              localStorage.setItem('pa_theme', this.isDark ? 'dark' : 'light');
            } catch (_) {}
          }
          if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
            try {
              window.dispatchEvent(new CustomEvent('pae:theme-changed', { detail: { theme: this.isDark ? 'dark' : 'light' } }));
            } catch (_) {}
          }
        },

        toggleSidebar: function() {
          this.isSidebarCollapsed = !this.isSidebarCollapsed;
          if (typeof localStorage !== 'undefined') {
            try {
              localStorage.setItem('pae_sidebar_collapsed', this.isSidebarCollapsed ? 'true' : 'false');
            } catch (_) {}
          }
        },

        handleEscapeKey: function() {
          if (this.isDossierOpen) {
            this.isDossierOpen = false;
          } else if (this.isPromoteModalOpen) {
            this.isPromoteModalOpen = false;
          } else if (this.isProfileModalOpen) {
            this.isProfileModalOpen = false;
          } else if (this.isMobileMenuOpen) {
            this.isMobileMenuOpen = false;
          }
        },

        confirmDeleteFolder: function(folderId) {
          if (typeof window !== 'undefined' && window.PAE && typeof window.PAE.confirmDeleteFolder === 'function') {
            return window.PAE.confirmDeleteFolder(folderId);
          }
          return Promise.resolve(false);
        },

        refreshWorkspace: function() {
          return this.refreshActiveRoom(true);
        },

        setRoom: async function(room) {
          if (validRooms.indexOf(room) === -1) return;
          this.currentRoom = room;
          await this.refreshActiveRoom(false);
          this.refreshIcons();
        },

        refreshActiveRoom: async function(forceOverview) {
          this.isLoading = true;
          try {
            if (forceOverview) {
              await Promise.all([this.loadOverview(), this.loadSettingsAndProfiles()]);
            }
            if (this.currentRoom === 'candidates') {
              await this.loadCandidates(false);
            } else if (this.currentRoom === 'launchpad') {
              await this.loadLaunchpad(false);
            } else if (this.currentRoom === 'rookies') {
              await this.loadRookies();
            } else if (this.currentRoom === 'crossover') {
              await this.loadCrossover();
              if (this.candidates.length === 0) await this.loadCandidates(false);
            } else if (this.currentRoom === 'watchlist') {
              await this.loadWatchlistRoom();
            } else if (this.currentRoom === 'settings') {
              await this.loadSettingsAndProfiles();
            }
          } finally {
            this.isLoading = false;
            this.refreshIcons();
          }
        },

        loadFoldersCatalog: async function() {
          try {
            var res = await this.callApi('/api/folders');
            var data = res.data || (await res.json());
            if (data && Array.isArray(data.folders)) {
              this.foldersList = data.folders;
              if (this.scopedFolderId) {
                var selfId = String(this.scopedFolderId);
                var found = data.folders.find(function(f) { return String(f.id) === selfId; });
                if (found) this.activeFolder = found;
              }
            }
          } catch (_) {}
        },

        loadOverview: async function() {
          try {
            var res = await this.callApi('/api/newborn/overview');
            var data = res.data || (await res.json());
            if (!res.ok || !data) return;
            if (data.counts) {
              this.overviewCounts = Object.assign({}, this.overviewCounts, data.counts);
            }
            if (data.cookie_status) {
              this.cookieStatus = Object.assign({}, this.cookieStatus, data.cookie_status);
            }
            if (data.automation_schedule) {
              this.automationSchedule = Object.assign({}, this.automationSchedule, data.automation_schedule);
            }
            if (Array.isArray(data.surfaces_catalog) && data.surfaces_catalog.length > 0) {
              this.surfacesCatalog = data.surfaces_catalog;
            }
            if (Array.isArray(data.l1_interests_catalog) && data.l1_interests_catalog.length > 0) {
              this.l1InterestsCatalog = data.l1_interests_catalog;
            }
            if (Array.isArray(data.recent_runs) && data.recent_runs.length > 0) {
              this.runHistory = data.recent_runs;
              var topOverviewRun = data.recent_runs[0];
              if (!this.latestRunSummary || Number(topOverviewRun.id || 0) >= Number(this.latestRunSummary.id || 0)) {
                this.latestRunSummary = topOverviewRun;
              }
            }
            if (Array.isArray(data.crossover_highlights) && this.crossoverClusters.length === 0) {
              this.crossoverClusters = data.crossover_highlights;
            }
          } catch (_) {}
        },

        loadSettingsAndProfiles: async function() {
          try {
            var res = await this.callApi('/api/newborn/settings');
            var data = res.data || (await res.json());
            if (!res.ok || !data) return;
            if (data.settings) {
              this.settingsDraft = mergeNewbornSettingsDraft(data.settings);
              this.launchpadFilter.country = this.settingsDraft.discovery.country || 'US';
              if (this.settingsDraft.discovery.default_l1_interest) {
                this.launchpadFilter.l1Interest = this.settingsDraft.discovery.default_l1_interest;
              }
            }
            if (data.schedule) {
              this.automationSchedule = Object.assign({}, this.automationSchedule, data.schedule);
            }
            if (data.cookie_status) {
              this.cookieStatus = Object.assign({}, this.cookieStatus, data.cookie_status);
            }
            if (Array.isArray(data.surfaces_catalog) && data.surfaces_catalog.length > 0) {
              this.surfacesCatalog = data.surfaces_catalog;
            }
            if (Array.isArray(data.valid_upload_provenance) && data.valid_upload_provenance.length > 0) {
              this.validProvenances = data.valid_upload_provenance;
            }
            if (Array.isArray(data.l1_interests_catalog) && data.l1_interests_catalog.length > 0) {
              this.l1InterestsCatalog = data.l1_interests_catalog;
            }
            if (Array.isArray(data.supported_countries) && data.supported_countries.length > 0) {
              this.supportedCountries = data.supported_countries;
            }
            if (Array.isArray(data.profiles)) {
              this.profiles = data.profiles;
              if (!this.selectedProfileSlug) {
                var defProf = data.profiles.find(function(p) { return Boolean(p.is_default); });
                if (defProf) this.selectedProfileSlug = defProf.slug;
              }
            }
          } catch (_) {}
        },

        // ====================================================================
        // LAUNCHPAD: GROWING / SEASONAL / MONTHLY / YEARLY + ZERO-QUERY
        // ====================================================================
        loadLaunchpad: async function() {
          try {
            var qs = new URLSearchParams({
              country: this.launchpadFilter.country || 'US',
              trend_type: this.launchpadFilter.trendType || 'growing',
              l1_interest: this.launchpadFilter.l1Interest || 'all'
            });
            var res = await this.callApi('/api/newborn/launchpad?' + qs.toString());
            var data = res.data || (await res.json());
            if (res.ok && data) {
              this.launchpadData = {
                trends: Array.isArray(data.trends) ? data.trends : [],
                popular_terms: Array.isArray(data.popular_terms) ? data.popular_terms : [],
                ideas_for_you_terms: Array.isArray(data.ideas_for_you_terms) ? data.ideas_for_you_terms : [],
                zero_query_used_guest_fallback: Boolean(data.zero_query_used_guest_fallback),
                recent_seeds: Array.isArray(data.recent_seeds) ? data.recent_seeds : [],
                cached_at: data.cached_at || null
              };
            }
          } catch (_) {}
          this.refreshIcons();
        },

        refreshLaunchpadLive: async function() {
          if (this.isRefreshingLaunchpad) return;
          this.isRefreshingLaunchpad = true;
          try {
            var res = await this.callApi('/api/newborn/launchpad', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              timeout: 45000,
              body: JSON.stringify({
                country: this.launchpadFilter.country || 'US',
                trend_type: this.launchpadFilter.trendType || 'growing',
                l1_interest: this.launchpadFilter.l1Interest || 'all',
                limit: 30
              })
            });
            var data = res.data || (await res.json());
            if (!res.ok || data.success === false) {
              this.notify((data && data.message) || 'Failed to refresh live Pinterest Trends.', 'error');
              return;
            }
            this.launchpadData = Object.assign({}, this.launchpadData, {
              trends: Array.isArray(data.trends) ? data.trends : [],
              popular_terms: Array.isArray(data.popular_terms) ? data.popular_terms : [],
              ideas_for_you_terms: Array.isArray(data.ideas_for_you_terms) ? data.ideas_for_you_terms : [],
              zero_query_used_guest_fallback: Boolean(data.zero_query_used_guest_fallback),
              cached_at: data.cached_at || null
            });
            this.notify('Live Trends & Zero-Query capsules refreshed.', 'success');
          } catch (err) {
            this.notify((err && err.message) || 'Network error refreshing Trends.', 'error');
          } finally {
            this.isRefreshingLaunchpad = false;
            this.refreshIcons();
          }
        },

        // ====================================================================
        // GOLDEN CANDIDATES WORKSPACE
        // ====================================================================
        loadCandidates: async function(resetSelection) {
          var seq = ++this._candReqSeq;
          this.isLoadingCandidates = true;
          if (resetSelection) this.selectedPinIds = [];
          try {
            var qs = new URLSearchParams();
            if (this.candidateFilters.stage) qs.set('stage', this.candidateFilters.stage);
            if (this.candidateFilters.surface) qs.set('surface', this.candidateFilters.surface);
            if (this.candidateFilters.provenance) qs.set('provenance', this.candidateFilters.provenance);
            if (this.candidateFilters.goldenOnly) qs.set('golden_only', 'true');
            if (this.candidateFilters.rookieOnly) qs.set('rookie_only', 'true');
            if (this.candidateFilters.linklessOnly) qs.set('linkless_only', 'true');
            if (this.candidateFilters.maxAgeDays) qs.set('max_age_days', String(this.candidateFilters.maxAgeDays));
            if (this.candidateFilters.minGoldenScore) qs.set('min_golden_score', String(this.candidateFilters.minGoldenScore));
            if (this.candidateFilters.search && this.candidateFilters.search.trim()) {
              qs.set('search', this.candidateFilters.search.trim());
            }
            qs.set('sort', this.candidateFilters.sort || 'golden_score');
            qs.set('limit', String(this.candidateFilters.limit || 50));
            qs.set('offset', String(this.candidateFilters.offset || 0));

            var res = await this.callApi('/api/newborn/candidates?' + qs.toString());
            if (seq !== this._candReqSeq) return;
            var data = res.data || (await res.json());
            if (res.ok && data) {
              this.candidates = Array.isArray(data.candidates) ? data.candidates : [];
              this.candidatesTotal = Number(data.total || 0);
            }
          } catch (_) {
          } finally {
            if (seq === this._candReqSeq) {
              this.isLoadingCandidates = false;
              this.refreshIcons();
            }
          }
        },

        changeCandidatesPage: function(dir) {
          var step = Number(this.candidateFilters.limit || 50);
          var next = Math.max(0, Number(this.candidateFilters.offset || 0) + (dir * step));
          if (next >= this.candidatesTotal && dir > 0) return;
          this.candidateFilters.offset = next;
          this.loadCandidates(true);
        },

        toggleSelectAllCandidates: function(checked) {
          if (checked) {
            this.selectedPinIds = this.candidates.map(function(p) { return String(p.pin_id); });
          } else {
            this.selectedPinIds = [];
          }
        },

        toggleSelectPin: function(pinId) {
          var id = String(pinId);
          var idx = this.selectedPinIds.indexOf(id);
          if (idx === -1) {
            this.selectedPinIds.push(id);
          } else {
            this.selectedPinIds.splice(idx, 1);
          }
        },

        bulkSetCandidateStage: async function(pinIds, nextStage) {
          var ids = Array.isArray(pinIds) ? pinIds.slice() : [];
          if (ids.length === 0) return;
          try {
            var res = await this.callApi('/api/newborn/candidates/stage', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ pin_ids: ids, stage: nextStage })
            });
            var data = res.data || (await res.json());
            if (!res.ok || data.success === false) {
              this.notify((data && data.message) || 'Failed to update candidate stage.', 'error');
              return;
            }
            this.notify('Updated ' + (data.updated || ids.length) + ' pin(s) to ' + nextStage + '.', 'success');
            this.selectedPinIds = [];
            await Promise.all([
              this.loadOverview(),
              this.loadCandidates(false),
              this.currentRoom === 'watchlist' ? this.loadWatchlistRoom() : Promise.resolve()
            ]);
          } catch (err) {
            this.notify((err && err.message) || 'Failed to update candidate stage.', 'error');
          }
        },

        exportCandidatesCsv: function() {
          if (!Array.isArray(this.candidates) || this.candidates.length === 0) return;
          var sanitize = (typeof window !== 'undefined' && window.PAE && typeof window.PAE.sanitizeCsvCell === 'function')
            ? window.PAE.sanitizeCsvCell
            : function(v) {
                var s = String(v == null ? '' : v);
                if (/^[=+\\-@\\t\\r\\n]/.test(s)) s = "'" + s;
                return '"' + s.replace(/"/g, '""') + '"';
              };

          var headers = [
            'pin_id',
            'title',
            'stage',
            'golden_score',
            'age_days',
            'repin_per_day',
            'save_count',
            'repin_count',
            'share_count',
            'comment_count',
            'reaction_count',
            'origin_creator_username',
            'pinner_username',
            'is_repin',
            'is_linkless',
            'clean_domain',
            'board_name',
            'board_pin_count',
            'board_follower_count',
            'upload_provenance'
          ];

          var lines = [headers.map(sanitize).join(',')];
          for (var i = 0; i < this.candidates.length; i++) {
            var p = this.candidates[i];
            var row = [
              p.pin_id,
              p.title || '',
              p.stage || '',
              p.golden_score != null ? Number(p.golden_score).toFixed(1) : '0',
              p.age_days != null ? Number(p.age_days).toFixed(1) : '',
              p.repin_per_day != null ? Number(p.repin_per_day).toFixed(2) : '',
              p.save_count != null ? p.save_count : '',
              p.repin_count != null ? p.repin_count : '',
              p.share_count != null ? p.share_count : '',
              p.comment_count != null ? p.comment_count : '',
              p.reaction_count != null ? p.reaction_count : '',
              p.origin_creator_username || p.effective_creator_username || '',
              p.pinner_username || '',
              p.is_repin ? 'true' : 'false',
              p.is_linkless ? 'true' : 'false',
              p.clean_domain || '',
              p.board_name || '',
              p.board_pin_count != null ? p.board_pin_count : '',
              p.board_follower_count != null ? p.board_follower_count : '',
              p.upload_provenance || 'UNKNOWN'
            ];
            lines.push(row.map(sanitize).join(','));
          }

          var csvContent = lines.join('\\r\\n');
          if (typeof document !== 'undefined' && typeof Blob !== 'undefined' && typeof URL !== 'undefined' && URL.createObjectURL) {
            var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            var dlUrl = URL.createObjectURL(blob);
            var link = document.createElement('a');
            link.href = dlUrl;
            link.setAttribute('download', 'newborn-candidates-' + new Date().toISOString().slice(0, 10) + '.csv');
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(function() { URL.revokeObjectURL(dlUrl); }, 1000);
          }
          this.notify('Exported ' + this.candidates.length + ' Newborn candidates to CSV.', 'success');
          return csvContent;
        },

        // ====================================================================
        // MULTI-SURFACE DISCOVERY HUNT, SNOWBALL & AUTO-CYCLE
        // ====================================================================
        launchDiscoveryHunt: async function(explicitSeed) {
          if (this.isHunting) return;
          this.isHunting = true;
          var seedRaw = explicitSeed !== undefined ? String(explicitSeed || '').trim() : String(this.huntQueryInput || '').trim();
          var queries = seedRaw
            ? seedRaw.split(',').map(function(s) { return s.trim(); }).filter(Boolean)
            : [];

          try {
            var res = await this.callApi('/api/newborn/discover', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              timeout: 90000,
              body: JSON.stringify({
                seed_queries: queries,
                profile_id: this.selectedProfileSlug || null
              })
            });
            var data = res.data || (await res.json());
            if (!res.ok || data.success === false) {
              this.notify((data && data.message) || 'Newborn discovery hunt failed.', 'error');
              return;
            }
            if (data.run_id) {
              this.latestRunSummary = {
                id: data.run_id,
                run_type: 'discovery',
                status: 'completed',
                cookie_mode: data.cookie_mode || 'guest_only',
                candidates_discovered: data.candidates_discovered || 0,
                golden_pins_count: data.golden_pins_count || 0,
                rookie_creators_count: data.rookie_creators_count || 0,
                snowball_hops_executed: data.snowball_hops_executed || 0
              };
            }
            this.notify(
              'Hunt complete: ' + (data.candidates_discovered || 0) + ' candidates (' + (data.golden_pins_count || 0) + ' Golden).',
              'success'
            );
            this.currentRoom = 'candidates';
            this.candidateFilters.offset = 0;
            await Promise.all([this.loadOverview(), this.loadCandidates(true)]);
          } catch (err) {
            this.notify((err && err.message) || 'Network error during 8-surface hunt.', 'error');
          } finally {
            this.isHunting = false;
            this.refreshIcons();
          }
        },

        huntSingleSeed: function(seed) {
          this.huntQueryInput = String(seed || '');
          return this.launchDiscoveryHunt(this.huntQueryInput);
        },

        triggerSnowballOnSelectedOrTop: function() {
          if (this.selectedPinIds.length > 0) {
            return this.snowballPinIds(this.selectedPinIds);
          }
          var goldenSeeds = this.candidates
            .filter(function(p) { return Boolean(p.is_golden_pin); })
            .slice(0, 8)
            .map(function(p) { return String(p.pin_id); });
          return this.snowballPinIds(goldenSeeds);
        },

        snowballPinIds: async function(pinIds) {
          if (this.isSnowballing) return;
          this.isSnowballing = true;
          try {
            var res = await this.callApi('/api/newborn/snowball', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              timeout: 60000,
              body: JSON.stringify({
                seed_pin_ids: Array.isArray(pinIds) ? pinIds : [],
                profile_id: this.selectedProfileSlug || null
              })
            });
            var data = res.data || (await res.json());
            if (!res.ok || data.success === false) {
              this.notify((data && data.message) || 'RelatedModulesResource snowball failed.', 'error');
              return;
            }
            this.notify(
              'Snowball complete: ' + (data.candidates_discovered || 0) + ' related pins (' + (data.golden_pins_count || 0) + ' Golden).',
              'success'
            );
            await Promise.all([this.loadOverview(), this.loadCandidates(false)]);
          } catch (err) {
            this.notify((err && err.message) || 'Network error during Snowball expansion.', 'error');
          } finally {
            this.isSnowballing = false;
            this.refreshIcons();
          }
        },

        runAutoCycleNow: async function() {
          if (this.isAutoRunning) return;
          this.isAutoRunning = true;
          try {
            var res = await this.callApi('/api/newborn/auto-run', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              timeout: 90000,
              body: JSON.stringify({
                force: true,
                profile_id: this.selectedProfileSlug || null
              })
            });
            var data = res.data || (await res.json());
            if (!res.ok || data.success === false) {
              this.notify((data && data.message) || 'Autonomous cycle failed.', 'error');
              return;
            }
            this.notify('Autonomous Discovery + Watchlist Cycle completed.', 'success');
            await Promise.all([this.loadOverview(), this.loadCandidates(false)]);
          } catch (err) {
            this.notify((err && err.message) || 'Network error running autonomous cycle.', 'error');
          } finally {
            this.isAutoRunning = false;
            this.refreshIcons();
          }
        },

        dispatchGitHubNewbornFleet: async function() {
          if (this.isDispatchingFleet) return;
          this.isDispatchingFleet = true;
          try {
            var res = await this.callApi('/api/newborn/fleet-dispatch', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                mode: 'auto_cycle',
                profile: this.selectedProfileSlug || '',
                query: this.huntQueryInput || '',
                shards: '4',
                force: true
              })
            });
            var data = res.data || (await res.json());
            if (!res.ok || data.success === false) {
              this.notify((data && data.message) || 'Failed to dispatch GitHub Actions fleet.', 'error');
              return;
            }
            this.notify('Dispatched newborn-hunter.yml workflow on GitHub Actions.', 'success');
          } catch (err) {
            this.notify((err && err.message) || 'Network error dispatching GitHub fleet.', 'error');
          } finally {
            this.isDispatchingFleet = false;
          }
        },

        // ====================================================================
        // ROOKIES, CROSSOVER, WATCHLIST & ANCHORS
        // ====================================================================
        loadRookies: async function() {
          try {
            var qs = new URLSearchParams();
            if (this.rookieFilters.stage) qs.set('stage', this.rookieFilters.stage);
            if (this.rookieFilters.search && this.rookieFilters.search.trim()) {
              qs.set('search', this.rookieFilters.search.trim());
            }
            qs.set('limit', String(this.rookieFilters.limit || 50));
            qs.set('offset', String(this.rookieFilters.offset || 0));

            var res = await this.callApi('/api/newborn/rookies?' + qs.toString());
            var data = res.data || (await res.json());
            if (res.ok && data) {
              this.rookies = Array.isArray(data.rookies) ? data.rookies : [];
              this.rookiesTotal = Number(data.total || 0);
            }
          } catch (_) {}
          this.refreshIcons();
        },

        promoteRookieAccount: async function(username, trackingMode) {
          if (!username) return;
          try {
            var res = await this.callApi('/api/newborn/promote', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                usernames: [username],
                tracking_mode: trackingMode || 'pulse_only',
                folder_id: this.scopedFolderId ? Number(this.scopedFolderId) : null
              })
            });
            var data = res.data || (await res.json());
            if (!res.ok || data.success === false) {
              this.notify((data && data.message) || 'Failed to promote rookie creator.', 'error');
              return;
            }
            this.notify('Creator @' + username + ' tracked in Creator Hub.', 'success');
            await Promise.all([this.loadRookies(), this.loadOverview()]);
          } catch (err) {
            this.notify((err && err.message) || 'Failed to promote rookie creator.', 'error');
          }
        },

        loadCrossover: async function() {
          try {
            var qs = new URLSearchParams({
              golden_only: this.crossoverGoldenOnly ? 'true' : 'false',
              limit: '40'
            });
            var res = await this.callApi('/api/newborn/crossover?' + qs.toString());
            var data = res.data || (await res.json());
            if (res.ok && data && Array.isArray(data.clusters)) {
              this.crossoverClusters = data.clusters;
            }
          } catch (_) {}
          this.refreshIcons();
        },

        trackKeywordDirectly: async function(term) {
          var clean = String(term || '').trim();
          if (!clean) return;
          try {
            var res = await this.callApi('/api/keywords', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                keyword: clean,
                category: 'Newborn Crossover',
                folder_id: this.scopedFolderId ? Number(this.scopedFolderId) : undefined
              })
            });
            var data = res.data || (await res.json());
            if (!res.ok || data.success === false) {
              this.notify((data && data.message) || 'Failed to track keyword.', 'error');
              return;
            }
            this.notify('Tracked "' + clean + '" in Keywords Fleet.', 'success');
          } catch (err) {
            this.notify((err && err.message) || 'Failed to track keyword.', 'error');
          }
        },

        loadWatchlistRoom: async function() {
          try {
            var results = await Promise.all([
              this.callApi('/api/newborn/candidates?stage=watchlist&limit=100'),
              this.callApi('/api/newborn/anchors?active_only=true&limit=100'),
              this.callApi('/api/newborn/runs?limit=30')
            ]);
            var wlData = results[0].data || (await results[0].json());
            var ancData = results[1].data || (await results[1].json());
            var runData = results[2].data || (await results[2].json());

            if (results[0].ok && wlData) this.watchlistPins = Array.isArray(wlData.candidates) ? wlData.candidates : [];
            if (results[1].ok && ancData) this.dailyAnchors = Array.isArray(ancData.anchors) ? ancData.anchors : [];
            if (results[2].ok && runData) {
              this.runHistory = Array.isArray(runData.runs) ? runData.runs : [];
              if (this.runHistory.length > 0) this.latestRunSummary = this.runHistory[0];
            }
          } catch (_) {}
          this.refreshIcons();
        },

        pollWatchlistNow: async function() {
          if (this.isPollingWatchlist) return;
          this.isPollingWatchlist = true;
          try {
            var res = await this.callApi('/api/newborn/watchlist/poll', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              timeout: 60000,
              body: JSON.stringify({
                profile_id: this.selectedProfileSlug || null
              })
            });
            var data = res.data || (await res.json());
            if (!res.ok || data.success === false) {
              this.notify((data && data.message) || 'Watchlist poll failed.', 'error');
              return;
            }
            this.notify(
              'Polled ' + (data.polled_count || 0) + ' watchlist pin(s) • ' + (data.auto_promoted_count || 0) + ' auto-promoted.',
              'success'
            );
            await Promise.all([this.loadOverview(), this.loadWatchlistRoom()]);
          } catch (err) {
            this.notify((err && err.message) || 'Network error polling watchlist.', 'error');
          } finally {
            this.isPollingWatchlist = false;
            this.refreshIcons();
          }
        },

        // ====================================================================
        // SETTINGS, RULE PROFILES & REDACTED COOKIE VAULT
        // ====================================================================
        onSelectActiveProfile: async function() {
          if (!this.selectedProfileSlug) {
            await this.loadSettingsAndProfiles();
            return;
          }
          await this.loadProfileIntoDraft(this.selectedProfileSlug);
        },

        loadProfileIntoDraft: async function(slug) {
          if (!slug) return;
          try {
            var res = await this.callApi('/api/newborn/profiles/' + encodeURIComponent(slug));
            var data = res.data || (await res.json());
            if (!res.ok || !data) {
              this.notify('Failed to load rule profile.', 'error');
              return;
            }
            this.selectedProfileSlug = slug;
            if (data.effective_settings) {
              this.settingsDraft = mergeNewbornSettingsDraft(data.effective_settings);
            }
            this.notify('Loaded profile "' + (data.profile ? data.profile.name : slug) + '" into Control Center.', 'info');
          } catch (err) {
            this.notify((err && err.message) || 'Failed to load profile.', 'error');
          }
        },

        applyAgePreset: function(preset) {
          this.settingsDraft.qualification.age_window_preset = preset;
          var map = { '7d': 7, '14d': 14, '30d': 30, '90d': 90 };
          if (map[preset]) {
            this.settingsDraft.qualification.min_age_days = 0;
            this.settingsDraft.qualification.max_age_days = map[preset];
          }
        },

        toggleAllowedProvenance: function(prov) {
          var arr = this.settingsDraft.qualification.provenance.allowed_sources;
          var idx = arr.indexOf(prov);
          if (idx === -1) {
            arr.push(prov);
          } else if (arr.length > 1) {
            arr.splice(idx, 1);
          } else {
            this.notify('At least one upload provenance source must remain enabled.', 'warning');
          }
        },

        saveGlobalSettings: async function() {
          if (this.isSavingSettings) return;
          this.isSavingSettings = true;
          try {
            var payload = serializeNewbornSettingsForApi(this.settingsDraft);
            var res = await this.callApi('/api/newborn/settings', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ settings: payload })
            });
            var data = res.data || (await res.json());
            if (!res.ok || data.success === false) {
              this.notify((data && data.message) || 'Failed to save Newborn settings.', 'error');
              return;
            }
            if (data.settings) this.settingsDraft = mergeNewbornSettingsDraft(data.settings);
            if (data.schedule) this.automationSchedule = Object.assign({}, this.automationSchedule, data.schedule);
            this.notify('Global Newborn settings & schedule saved.', 'success');
          } catch (err) {
            this.notify((err && err.message) || 'Failed to save Newborn settings.', 'error');
          } finally {
            this.isSavingSettings = false;
          }
        },

        resetSettingsToDefaults: async function() {
          var ok = await this.askConfirm(
            'Reset all Newborn qualification, 8-surface depth, and automation settings back to factory defaults?',
            { title: 'Reset Factory Defaults', confirmLabel: 'Reset Settings', cancelLabel: 'Keep Current', danger: true }
          );
          if (!ok) return;
          this.isSavingSettings = true;
          try {
            var res = await this.callApi('/api/newborn/settings/reset', { method: 'POST' });
            var data = res.data || (await res.json());
            if (!res.ok || data.success === false) {
              this.notify((data && data.message) || 'Failed to reset settings.', 'error');
              return;
            }
            if (data.settings) this.settingsDraft = mergeNewbornSettingsDraft(data.settings);
            if (data.schedule) this.automationSchedule = Object.assign({}, this.automationSchedule, data.schedule);
            this.notify('Newborn settings restored to factory defaults.', 'success');
          } catch (err) {
            this.notify((err && err.message) || 'Failed to reset settings.', 'error');
          } finally {
            this.isSavingSettings = false;
          }
        },

        saveCookieToVault: async function() {
          var raw = String(this.cookieDraftInput || '').trim();
          if (!raw || this.isSavingCookie) return;
          this.isSavingCookie = true;
          try {
            var res = await this.callApi('/api/newborn/cookie', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                cookie: raw,
                also_update_shared: Boolean(this.alsoUpdateSharedCookie)
              })
            });
            var data = res.data || (await res.json());
            if (!res.ok || data.success === false) {
              this.notify((data && data.message) || 'Failed to save session cookie.', 'error');
              return;
            }
            this.cookieDraftInput = '';
            this.cookieStatus = Object.assign({}, this.cookieStatus, data);
            this.notify('Zone-A session cookie stored in encrypted server vault.', 'success');
          } catch (err) {
            this.notify((err && err.message) || 'Failed to save session cookie.', 'error');
          } finally {
            this.isSavingCookie = false;
          }
        },

        clearCookieFromVault: async function() {
          var ok = await this.askConfirm(
            'Remove newborn_pinterest_cookie from the server vault and revert to Guest Zero-Cookie mode?',
            { title: 'Clear Session Cookie', confirmLabel: 'Clear Cookie', cancelLabel: 'Cancel', danger: true }
          );
          if (!ok) return;
          this.isSavingCookie = true;
          try {
            var res = await this.callApi('/api/newborn/cookie', { method: 'DELETE' });
            var data = res.data || (await res.json());
            if (!res.ok || data.success === false) {
              this.notify((data && data.message) || 'Failed to clear session cookie.', 'error');
              return;
            }
            this.cookieDraftInput = '';
            this.cookieStatus = Object.assign({}, this.cookieStatus, data);
            this.notify('Session cookie cleared from vault.', 'success');
          } catch (err) {
            this.notify((err && err.message) || 'Failed to clear session cookie.', 'error');
          } finally {
            this.isSavingCookie = false;
          }
        },

        openProfileModal: function(prof) {
          if (prof && prof.id) {
            this.profileForm = {
              id: prof.id,
              slug: prof.slug || '',
              name: prof.name || '',
              description: prof.description || '',
              is_default: Boolean(prof.is_default),
              snapshotCurrentSettings: false
            };
          } else {
            this.profileForm = {
              id: null,
              slug: '',
              name: '',
              description: '',
              is_default: false,
              snapshotCurrentSettings: true
            };
          }
          this.isProfileModalOpen = true;
          this.refreshIcons();
        },

        submitProfileModal: async function() {
          var cleanName = String(this.profileForm.name || '').trim();
          if (!cleanName) {
            this.notify('Profile name is required.', 'warning');
            return;
          }
          if (this.isSavingProfile) return;
          this.isSavingProfile = true;

          try {
            var body = {
              name: cleanName,
              description: String(this.profileForm.description || '').trim(),
              is_default: Boolean(this.profileForm.is_default),
              folder_id: this.scopedFolderId ? Number(this.scopedFolderId) : null
            };
            if (!this.profileForm.id || this.profileForm.snapshotCurrentSettings) {
              var snap = serializeNewbornSettingsForApi(this.settingsDraft);
              body.surface_config = snap.discovery;
              body.qualification_rules = snap.qualification;
              body.automation_rules = snap.automation;
            }

            var isEdit = Boolean(this.profileForm.id);
            var endpoint = isEdit
              ? ('/api/newborn/profiles/' + encodeURIComponent(this.profileForm.id))
              : '/api/newborn/profiles';

            var res = await this.callApi(endpoint, {
              method: isEdit ? 'PUT' : 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body)
            });
            var data = res.data || (await res.json());
            if (!res.ok || data.success === false) {
              this.notify((data && data.message) || 'Failed to save rule profile.', 'error');
              return;
            }
            if (data.profile && data.profile.slug) {
              this.selectedProfileSlug = data.profile.slug;
            }
            this.isProfileModalOpen = false;
            this.notify(isEdit ? 'Rule profile updated.' : 'New rule profile created.', 'success');
            await this.loadSettingsAndProfiles();
          } catch (err) {
            this.notify((err && err.message) || 'Failed to save rule profile.', 'error');
          } finally {
            this.isSavingProfile = false;
          }
        },

        deleteRuleProfile: async function(prof) {
          if (!prof || !prof.id) return;
          var ok = await this.askConfirm(
            'Delete rule profile "' + prof.name + '"?',
            { title: 'Delete Rule Profile', confirmLabel: 'Delete Profile', cancelLabel: 'Keep Profile', danger: true }
          );
          if (!ok) return;
          try {
            var res = await this.callApi('/api/newborn/profiles/' + encodeURIComponent(prof.id), {
              method: 'DELETE'
            });
            var data = res.data || (await res.json());
            if (!res.ok || data.success === false) {
              this.notify((data && data.message) || 'Failed to delete rule profile.', 'error');
              return;
            }
            if (this.selectedProfileSlug === prof.slug) {
              this.selectedProfileSlug = '';
            }
            this.notify('Rule profile deleted.', 'success');
            await this.loadSettingsAndProfiles();
          } catch (err) {
            this.notify((err && err.message) || 'Failed to delete rule profile.', 'error');
          }
        },

        // ====================================================================
        // MULTI-PILLAR PROMOTE MODAL & DOSSIER DRAWER
        // ====================================================================
        openPromoteModal: function(pins) {
          var list = Array.isArray(pins) ? pins : [];
          var ids = [];
          var creators = [];
          for (var i = 0; i < list.length; i++) {
            var p = list[i];
            if (p && p.pin_id) ids.push(String(p.pin_id));
            var handle = p && (p.origin_creator_username || p.effective_creator_username);
            if (handle && creators.indexOf(handle) === -1) creators.push(handle);
          }
          var defaultKw = '';
          if (list.length === 1 && list[0]) {
            defaultKw = (list[0].crossover_blueprint && list[0].crossover_blueprint.primary_keyword) ||
              list[0].seed_query || '';
          }
          this.promoteForm = {
            pinIds: ids,
            promoteToDailySsot: true,
            folderId: this.scopedFolderId ? String(this.scopedFolderId) : '',
            promoteKeyword: Boolean(defaultKw),
            keyword: defaultKw,
            promoteClusterSeeds: true,
            availableUsernames: creators,
            alsoPromoteCreators: false,
            notes: ''
          };
          this.isPromoteModalOpen = true;
          this.refreshIcons();
        },

        openPromoteModalForIds: function(ids) {
          var idSet = Array.isArray(ids) ? ids.map(String) : [];
          var matched = this.candidates.filter(function(p) { return idSet.indexOf(String(p.pin_id)) !== -1; });
          if (matched.length > 0) {
            this.openPromoteModal(matched);
          } else {
            this.openPromoteModal(idSet.map(function(id) { return { pin_id: id }; }));
          }
        },

        submitPromoteModal: async function() {
          if (this.isPromoting || this.promoteForm.pinIds.length === 0) return;
          this.isPromoting = true;
          try {
            var folderNum = this.promoteForm.folderId ? Number(this.promoteForm.folderId) : null;
            var payload = {
              pin_ids: this.promoteForm.pinIds,
              usernames: this.promoteForm.alsoPromoteCreators ? this.promoteForm.availableUsernames : [],
              destinations: {
                promote_to_daily_ssot: Boolean(this.promoteForm.promoteToDailySsot),
                promote_to_campaign_folder_id: (folderNum && Number.isFinite(folderNum)) ? folderNum : null,
                promote_top_annotation_as_keyword: Boolean(this.promoteForm.promoteKeyword),
                keyword: this.promoteForm.promoteKeyword && this.promoteForm.keyword.trim()
                  ? this.promoteForm.keyword.trim()
                  : null,
                promote_to_cluster_seeds: Boolean(this.promoteForm.promoteClusterSeeds)
              },
              folder_id: (folderNum && Number.isFinite(folderNum)) ? folderNum : null,
              notes: String(this.promoteForm.notes || '').trim(),
              source: 'manual'
            };

            var res = await this.callApi('/api/newborn/promote', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });
            var data = res.data || (await res.json());
            if (!res.ok || data.success === false) {
              this.notify((data && data.message) || 'Promotion failed.', 'error');
              return;
            }
            var count = (data.pins && data.pins.promoted_count) || this.promoteForm.pinIds.length;
            this.isPromoteModalOpen = false;
            this.selectedPinIds = [];
            this.notify('Promoted ' + count + ' Newborn pin(s) into SSOT & 01:00 UTC Daily Anchors.', 'success');
            await Promise.all([this.loadOverview(), this.loadCandidates(false)]);
          } catch (err) {
            this.notify((err && err.message) || 'Network error during promotion.', 'error');
          } finally {
            this.isPromoting = false;
          }
        },

        openCandidateDossier: async function(pinId) {
          if (!pinId) return;
          this.isDossierOpen = true;
          var localPin = this.candidates.find(function(p) { return String(p.pin_id) === String(pinId); }) || null;
          this.activeDossier = localPin ? { candidate: localPin, staging_trajectory: [] } : null;
          try {
            var res = await this.callApi('/api/newborn/candidates/' + encodeURIComponent(pinId));
            var data = res.data || (await res.json());
            if (res.ok && data && data.candidate) {
              this.activeDossier = data;
            }
          } catch (_) {}
          this.refreshIcons();
        },

        // ====================================================================
        // FORMATTERS & SANITIZERS
        // ====================================================================
        formatNum: function(val) {
          if (typeof window !== 'undefined' && window.PAE && typeof window.PAE.formatNumber === 'function') {
            return window.PAE.formatNumber(val);
          }
          var n = Number(val || 0);
          return Number.isFinite(n) ? Math.round(n).toLocaleString('en-US') : '0';
        },

        formatDecimal: function(val, decimals) {
          var dec = decimals !== undefined ? decimals : 1;
          var n = Number(val);
          if (!Number.isFinite(n)) return (0).toFixed(dec);
          return n.toFixed(dec);
        },

        formatNullableInt: function(val) {
          if (val === null || val === undefined || val === '') return '—';
          var n = Number(val);
          if (!Number.isFinite(n)) return '—';
          return Math.round(n).toLocaleString('en-US');
        },

        formatCeilingMetric: function(val, compact) {
          if (val === null || val === undefined || val === '') return '—';
          var n = Number(val);
          if (!Number.isFinite(n)) return '—';
          if (n >= 10000001) return '10M+';
          if (typeof window !== 'undefined' && window.PAE && typeof window.PAE.formatNumber === 'function') {
            return window.PAE.formatNumber(n, compact ? { compact: true, decimals: 1 } : undefined);
          }
          return Math.round(n).toLocaleString('en-US');
        },

        formatAgeDisplay: function(daysOrDate) {
          if (typeof window !== 'undefined' && window.PAE && typeof window.PAE.formatUniversalAge === 'function') {
            return window.PAE.formatUniversalAge(daysOrDate);
          }
          if (daysOrDate === null || daysOrDate === undefined || daysOrDate === '') return '—';
          var d = Number(daysOrDate);
          if (!Number.isFinite(d)) return '—';
          if (d >= 365) return (d / 365).toFixed(1) + 'y';
          return Math.round(Math.max(0, d)) + 'd';
        },

        formatSignedPct: function(val) {
          if (val === null || val === undefined || val === '') return '—';
          var n = Number(val);
          if (!Number.isFinite(n)) return '—';
          return (n > 0 ? '+' : '') + Math.round(n) + '%';
        },

        formatIsoShort: function(iso) {
          if (!iso) return '—';
          if (typeof window !== 'undefined' && window.PAE && typeof window.PAE.formatDate === 'function') {
            return window.PAE.formatDate(iso);
          }
          return String(iso).slice(0, 10);
        },

        safeHref: function(url) {
          if (typeof window !== 'undefined' && window.PAE && typeof window.PAE.safeUrl === 'function') {
            return window.PAE.safeUrl(url);
          }
          if (!url || typeof url !== 'string') return '#';
          var s = url.trim();
          if (/^https?:\\/\\//i.test(s) || (s.indexOf('/') === 0 && s.indexOf('//') !== 0)) return s;
          return '#';
        },

        resolveThumb: function(url) {
          if (typeof window !== 'undefined' && window.PAE && typeof window.PAE.resolvePinImageUrl === 'function') {
            return window.PAE.resolvePinImageUrl(url, '236x');
          }
          return url || '';
        },

        onImgErr: function(ev) {
          if (ev && ev.target && typeof window !== 'undefined' && window.PAE && typeof window.PAE.handlePinImgError === 'function') {
            window.PAE.handlePinImgError(ev.target);
          }
        }
      };
    }
  </script>`;
}

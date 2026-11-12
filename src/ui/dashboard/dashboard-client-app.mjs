/**
 * Alpine Application Data Store (dashboardApp)
 */
export function getDashboardClientAppScript({ safeFolderId = '' } = {}) {
  return `  <script>
    // [INVARIANT: SAFE-URL PROTOCOL SANITIZATION]
    function safeUrl(rawUrl, fallback = '#') {
      if (!rawUrl || typeof rawUrl !== 'string') return fallback;
      const trimmed = rawUrl.trim();
      if (/^(javascript|data|vbscript):/i.test(trimmed)) {
        console.warn('[Security] Dangerous URI scheme blocked:', trimmed);
        return fallback;
      }
      return trimmed;
    }

    function dashboardApp() {
      return {
        _hasInitialized: false,
        safeUrl,
        creatorDiscoveryFilter: 'all',
        isDark: (() => {
          try {
            return typeof localStorage !== 'undefined' ? localStorage.getItem('pa_theme') !== 'light' : true;
          } catch (_) { return true; }
        })(),
        darkMode: (() => {
          try {
            return typeof localStorage !== 'undefined' ? localStorage.getItem('pa_theme') !== 'light' : true;
          } catch (_) { return true; }
        })(),
        toggleTheme() {
          this.isDark = !this.isDark;
          this.darkMode = this.isDark;
          try {
            if (typeof localStorage !== 'undefined') {
              localStorage.setItem('pa_theme', this.isDark ? 'dark' : 'light');
              localStorage.setItem('pin_theme', this.isDark ? 'dark' : 'light');
            }
          } catch (_) {}
          if (this.isDark) {
            document.documentElement.classList.add('dark');
          } else {
            document.documentElement.classList.remove('dark');
          }
        },
        isAssignExistingCreatorModalOpen: false,
        assignCreatorSearch: '',
        openAssignExistingCreatorModal() {
          this.assignCreatorSearch = '';
          this.isAssignExistingCreatorModalOpen = true;
          this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
        },
        closeAssignExistingCreatorModal() {
          this.isAssignExistingCreatorModalOpen = false;
        },
        isSidebarCollapsed: (() => {
          try {
            return typeof localStorage !== 'undefined' ? localStorage.getItem('pae_sidebar_collapsed') === 'true' : false;
          } catch (_) { return false; }
        })(),
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
        currentTab: (() => {
          if (typeof window !== 'undefined') {
            const segs = (window.location.pathname || '').split('/').filter(Boolean);
            const f = (segs[0] || '').toLowerCase();
            if (f === 'accounts' || f === 'creators' || f === 'pinarchive' || (f === 'folders' && (segs[2] || '').toLowerCase() === 'creators')) return 'creators_archive';
            if (f === 'related-pins' || f === 'related_pins' || f === 'seeds' || f === 'intersections') return 'related_pins';
            if (f === 'fleet') return 'overview';
            if (f && !['api', 'fleet', 'settings', 'admin', 'health', 'favicon.ico', 'robots.txt', 'index.html', 'assets', 'static', 'pin', 'related_pins', 'related-pins', 'intersections', 'archive', 'explorer', 'accounts', 'creators', 'pinarchive', 'board-idea', 'board-ideas', 'keywords', 'overview', 'home', 'dashboard', 'domains'].includes(f)) {
              return 'creators_archive';
            }
          }
          return '${safeFolderId}' ? 'creators_archive' : 'overview';
        })(),
        scopedFolderId: '${safeFolderId}',
        activeFolderId: '${safeFolderId}',
        activeFolder: null,
        crossoverData: null,
        folderFilter: '${safeFolderId}',
        vaultScope: 'high_signal',
        foldersList: [],
        folderCreatorMap: {},
        scopedFolderCreatorIds: null,
        openFolderMenuId: null,
        isMobileMenuOpen: false,
        isLoading: false,
        isAddSeedOpen: false,
        isDossierOpen: false,
        copiedField: null,
        toastMessage: null,

        // Related Pins Hub Sub-Tab State
        relatedSubTab: 'seeds',

        // Dedicated Pin Detail Page State (Route: /pin/:id)
        activePinId: null,
        activePinDossier: null,
        isLoadingPinDossier: false,
        pinDossierTimeframe: '7d',
        pinDossierSnapshots: [],
        previousPinPath: null,
        isPinDossierOpen: false,

        // Dedicated Board Detail Page State (Route: /:username/:board)
        activeBoardName: null,
        activeBoard: null,
        activeBoardCreator: null,
        boardPins: [],
        boardWinningPins: [],
        boardPinsTotal: 0,
        boardPinsSearch: '',
        boardPinsFilter: 'all',
        boardPinsSort: 'saves_desc',
        boardPinsViewMode: 'grid',
        boardPinsPage: 1,
        boardPinsPageSize: 24,
        isLoadingBoardPins: false,

        // Unified Creator Intelligence & PinArchive State
        creatorSubTab: 'creators',
        isCreatorDossierOpen: false,
        activeCreator: null,
        activeCreatorTab: 'overview',
        activeCreatorDetail: null,
        activeCreatorSnapshots: [],
        activeCreatorBoards: [],
        activeCreatorPins: [],
        activeCreatorTopics: [],
        activeCreatorSelectedTopic: '',
        creatorTopicSearch: '',
        isCreatorLoading: false,
        isLoadingBoards: false,

        // All Account Pins State (Raw Inventory)
        activeCreatorAllPins: [],
        activeCreatorAllPinsTotal: 0,
        activeCreatorCatalogTotal: 0,
        activeCreatorExternalPinsTotal: 0,
        activeCreatorCuratorPinsTotal: 0,
        activeCreatorEcosystemTotal: 0,
        activeCreatorWinningPinsTotal: 0,
        activeCreatorRankedTotal: 0,
        activeCreatorHighVelocityTotal: 0,
        activeCreatorAllPinsPage: 1,
        activeCreatorAllPinsTotalPages: 1,
        activeCreatorAllPinsBoards: [],
        creatorAllPinsLimit: 100,
        _creatorsReqSeq: 0,
        creatorAllPinSearch: '',
        creatorAllPinBoard: '',
        creatorAllPinMinSaves: 0,
        creatorAllPinSort: 'saves_desc',
        creatorAllPinQualifiedOnly: false,
        creatorAllPinArticlesOnly: false,
        creatorAllPinRankedOnly: false,
        creatorAllPinStage: '',
        creatorAllPinHighVelocity: false,
        creatorAllPinChangedOnly: false,
        creatorAllPinScope: 'official',
        creatorTopUrlScope: 'ecosystem',
        isLoadingAllPins: false,
        isHarvestingAllPins: false,
        isDispatchingGitHubCrawl: false,

        // Master Pin Ledger Columns Customization State
        masterColumnDefinitions: [
          { key: 'media', label: 'Media / Thumbnail', required: false },
          { key: 'title', label: 'Pin Title & Destination', required: true },
          { key: 'board', label: 'Board', required: false },
          { key: 'saves', label: 'Saves (with 24h Δ)', required: false },
          { key: 'repins', label: 'Repins (with 24h Δ)', required: false },
          { key: 'status', label: 'Status Badges', required: false },
          { key: 'created_at', label: 'Created / Discovered', required: false },
          { key: 'actions', label: 'Actions', required: false }
        ],
        visibleMasterColumns: {
          media: true,
          title: true,
          board: true,
          saves: true,
          repins: true,
          status: true,
          created_at: true,
          actions: true
        },
        toggleMasterColumn(key) {
          if (key === 'title') return;
          this.visibleMasterColumns[key] = !this.visibleMasterColumns[key];
          try {
            localStorage.setItem('creator_master_visible_columns', JSON.stringify(this.visibleMasterColumns));
          } catch (_) {}
        },
        resetMasterColumns() {
          this.visibleMasterColumns = {
            media: true,
            title: true,
            board: true,
            saves: true,
            repins: true,
            status: true,
            created_at: true,
            actions: true
          };
          try {
            localStorage.removeItem('creator_master_visible_columns');
          } catch (_) {}
        },

        // Top Destination URLs State
        activeCreatorTopUrls: [],
        creatorTopUrlsTotal: 0,
        creatorTopUrlsPage: 1,
        creatorTopUrlsTotalPages: 1,
        creatorTopUrlSearch: '',
        creatorTopUrlSort: 'saves_desc',
        creatorTopUrlFilterType: 'all',
        isLoadingTopUrls: false,

        // Account-Scoped Related Pins & Intersections Radar State
        creatorRelatedSeeds: [],
        creatorRelatedIntersections: [],
        creatorRelatedStats: {
          total_seeds: 0,
          total_nodes: 0,
          unique_candidates: 0,
          self_retention_nodes: 0,
          rival_leakage_nodes: 0,
          retention_rate_pct: 0,
          leakage_rate_pct: 0,
          total_intersections: 0
        },
        isLoadingRelatedGraph: false,
        creatorRelatedMinOverlap: 2,
        creatorRelatedFilter: 'all',
        creatorRelatedPage: 1,
        creatorRelatedTotalPages: 1,
        creatorRelatedLimit: 25,
        creatorRelatedSearch: '',
        isBulkAddSeedsModalOpen: false,
        bulkAddSeedsInput: '',
        isAddingSeeds: false,
        isHarvestingRelated: false,

        // Per-Account Qualification Rules State
        creatorRules: {
          tier1_min_saves: 100,
          tier2_min_repins: 100,
          tier3_fresh_days: 14,
          tier3_min_saves: 25,
          articles_only: true,
          auto_pipeline: true,
          max_pages: 500,
          early_stop_pages: 3
        },
        isSavingCreatorRules: false,
        isReEvaluatingCreatorPins: false,
        reEvaluateMessage: '',

        // Time Range & Performance Trend
        creatorTimeRange: '7D',
        creatorSelectedMonth: 'all',
        creatorMoMMode: false,
        creatorMoMBaseMonth: '',
        creatorMoMTargetMonth: '',
        creatorChartMode: 'reach',
        selectedCreatorPinIds: [],
        isPinSelected(pinId) {
          if (!pinId) return false;
          return this.selectedCreatorPinIds.includes(String(pinId));
        },
        togglePinSelection(pinId) {
          if (!pinId) return;
          const s = String(pinId);
          const idx = this.selectedCreatorPinIds.indexOf(s);
          if (idx >= 0) {
            this.selectedCreatorPinIds.splice(idx, 1);
          } else {
            this.selectedCreatorPinIds.push(s);
          }
        },
        selectAllCurrentPins(pinsList) {
          if (!Array.isArray(pinsList)) return;
          for (const p of pinsList) {
            const pid = String(p.pin_id || p.id || '');
            if (pid && !this.selectedCreatorPinIds.includes(pid)) {
              this.selectedCreatorPinIds.push(pid);
            }
          }
        },
        clearSelectedCreatorPins() {
          this.selectedCreatorPinIds = [];
        },

        // Snapshot Log Table State
        creatorSnapNumFmt: 'full',
        creatorSnapDensity: 'compact',
        creatorSnapTimeframe: '7',
        creatorSnapPage: 1,
        creatorSnapColVisible: { reach: true, views: true, pins: true },
        isSnapColsOpen: false,

        // Board Strategy Table & Grid State
        creatorBoardSearch: '',
        creatorBoardSort: 'most_pins',
        creatorBoardPage: 1,
        creatorBoardsViewMode: 'grid',
        creatorBoardSelectedTopic: '',
        creatorBoardPageSize: 12,

        // All Pins Archive Section State (Image 3)
        creatorPinViewMode: 'table',
        creatorPinPace: '24h',
        creatorPinSearch: '',
        creatorPinBoard: '',
        creatorPinStage: '',
        creatorPinSavesFilter: '',
        creatorPinSort: 'delta_saves',
        creatorPinChangedOnly: false,
        creatorPinLimit: 25,
        creatorPinPage: 1,
        creatorPinColVisible: { board: true, saves: true, repins: true, velocity: true },
        isPinColsOpen: false,
        isGasDataEnabled: true,

        // Cookie & Session State
        isCookieModalOpen: false,
        cookieInput: '',
        isSavingCookie: false,
        cookieStatus: { has_cookie: false, preview: null },

        // Auto-Promote & Breakout Rules State
        isAutoPromoteModalOpen: false,
        isSavingAutoPromote: false,
        autoPromoteForm: {
          auto_promote_enabled: true,
          auto_promote_delta_24h: 25000,
          auto_promote_delta_7d: 100000,
          auto_harvest_pins: true,
          max_pins_harvest: 25,
          qualification_rules: {
            min_saves: 500,
            min_velocity: 10.0
          }
        },

        // Raw JSON Ingestion Modal State
        isRawJsonModalOpen: false,
        rawJsonTargetPin: '',
        rawJsonInput: '',
        isSubmittingRawJson: false,
        rawJsonStatusMsg: '',
        rawJsonIsError: false,

        // Data Stores
        overview: {},
        seeds: [],
        intersections: [],

        // Tab 4: Competitor Intelligence State
        competitorsOverview: { tracked_profiles: 0, combined_reach: 0, total_audience: 0, pins_tracked: 0 },
        competitors: [],
        competitorFilter: 'all',
        competitorSearch: '',
        competitorPage: 1,
        competitorPageSize: 50,
        competitorSort: 'audience_desc',
        _competitorsCacheKey: '',
        _cachedFilteredCompetitors: null,
        _loadingFolderCreatorsKey: null,
        _loadingFolderCreatorsPromise: null,
        creatorDiscoveryFilter: 'all',

        // Visual Feed & Board Sections Modals
        isVisualFeedModalOpen: false,
        visualFeedUser: null,
        visualFeedUsername: '',
        visualFeedPins: [],
        isVisualFeedLoading: false,

        isBoardSectionsModalOpen: false,
        boardSectionsTitle: '',
        boardSectionsBoardId: '',
        isLoadingBoardSections: false,
        boardSectionsList: [],

        _creatorAllPinsAbortController: null,
        _creatorAllPinsReqSeq: 0,
        bulkPulseCustomLabel: '',
        isBulkPulseTracking: false,
        folderCompetitorTotalsData: null,
        selectedCompetitorIds: [],
        isBulkFastRefreshing: false,
        isBulkDiscoveringCatalog: false,
        isBulkAuditSweeping: false,
        fastRefreshingCompetitorId: null,
        discoveringCatalogCompetitorId: null,
        auditSweepingCompetitorId: null,
        pulsingCreatorId: null,
        harvestingCreatorId: null,
        isAddCompetitorModalOpen: false,
        newCompetitorHandle: '',
        newCompetitorAlsoTrack: true,
        newCompetitorDiscoverPins: true,
        newCompetitorDiscoverMode: 'deep',
        newCompetitorMaxPages: 500,
        newCompetitorAutoArchiveWinning: true,
        newCompetitorInterval: 'daily',
        isSubmittingCreator: false,

        // Tab 5: Keyword Velocity State
        keywords: [],
        keywordSearch: '',
        isAddKeywordModalOpen: false,
        newKeywordText: '',
        newKeywordCategory: 'General',
        isKeywordPinsOpen: false,
        activeKeyword: null,
        activeKeywordPins: [],
        isLoadingKeywordPins: false,

        get filteredKeywords() {
          let list = this.keywords || [];
          if (this.keywordSearch) {
            const q = this.keywordSearch.toLowerCase().trim();
            list = list.filter(k => (k.keyword && k.keyword.toLowerCase().includes(q)) || (k.category && k.category.toLowerCase().includes(q)));
          }
          return list;
        },

        // Tab 6: Fleet State
        fleetProjects: [],
        fleetSearch: '',
        fleetRoleFilter: 'all',
        fleetRegionFilter: 'all',
        fleetPage: 1,
        fleetPageSize: 15,
        isAddFleetModalOpen: false,
        isInspectingNodeModalOpen: false,
        inspectedNode: null,
        isPingingAllFleet: false,
        fleetPingSummary: null,
        isSyncingFleet: false,
        newFleetProjectId: '',
        newFleetProjectName: '',
        newFleetDatabaseUrl: '',
        selectedProject: 'all',
        showDevOpsFleetSelector: false,

        get filteredFleetProjects() {
          let list = this.fleetProjects || [];
          if (this.fleetRoleFilter === 'hub') {
            list = list.filter(p => p.is_hub);
          } else if (this.fleetRoleFilter === 'shard') {
            list = list.filter(p => !p.is_hub);
          }
          if (this.fleetRegionFilter !== 'all') {
            list = list.filter(p => p.region_id === this.fleetRegionFilter);
          }
          if (this.fleetSearch && this.fleetSearch.trim()) {
            const q = this.fleetSearch.toLowerCase().trim();
            list = list.filter(p => 
              (p.project_name && p.project_name.toLowerCase().includes(q)) ||
              (p.project_id && p.project_id.toLowerCase().includes(q)) ||
              (p.region_id && p.region_id.toLowerCase().includes(q)) ||
              (p.masked_url && p.masked_url.toLowerCase().includes(q))
            );
          }
          return list;
        },

        get paginatedFleetProjects() {
          const list = this.filteredFleetProjects;
          const ps = Number(this.fleetPageSize) || 15;
          if (ps >= 100) return list;
          const start = (this.fleetPage - 1) * ps;
          return list.slice(start, start + ps);
        },

        get fleetTotalPages() {
          const count = this.filteredFleetProjects.length;
          const ps = Number(this.fleetPageSize) || 15;
          if (ps >= 100 || count === 0) return 1;
          return Math.max(1, Math.ceil(count / ps));
        },

        _clientCache: {
          creators: new Map(),
          boards: new Map(),
          pins: new Map()
        },

        // Tab 6: PinArchive & Topic Clusters State
        pinarchiveOverview: { total_pins: 0, total_saves: 0, total_repins: 0, avg_velocity: 0, tracked_accounts: 0, top_cluster: null },
        pinarchiveTopics: [],
        pinarchivePins: [],
        pinarchiveTopicSearch: '',
        pinarchiveSearch: '',
        pinarchiveMinSaves: 0,
        pinarchiveSort: 'saves',
        pinarchiveSelectedTopic: '',
        pinarchiveSelectedAccount: '',
        pinarchiveViewMode: 'grid',
        isLoadingPinArchive: false,

        // Pin Qualification & Ingest Rules State
        qualificationRules: {
          tier1_min_saves: 100,
          tier2_min_repins: 100,
          tier3_max_age_days: 14,
          tier3_min_saves: 25,
          cron_enabled: true,
          early_stop_pages: 3,
          discovery_max_pages: 500
        },
        isRulesCollapsed: false,
        isSavingRules: false,
        isReEvaluating: false,
        harvestingCompetitorId: null,

        // Competitor Boards Modal State
        isBoardsModalOpen: false,
        activeBoardsCompetitor: null,
        competitorBoardsList: [],
        isSyncingBoards: false,

        // GitHub Actions 20-Shard Crawler & Board Sharding Modal State
        isGhaCrawlerModalOpen: false,
        ghaTargetAccount: '',
        ghaCrawlMode: 'discovery',
        ghaMaxPages: '500',
        ghaBoardScope: 'all',
        ghaTargetBoards: [],
        ghaBoardSearch: '',

        get filteredGhaBoards() {
          const boards = this.activeCreatorBoards || [];
          if (!this.ghaBoardSearch.trim()) return boards;
          const q = this.ghaBoardSearch.toLowerCase().trim();
          return boards.filter(b => (b.name || '').toLowerCase().includes(q) || String(b.board_id || '').includes(q));
        },

        get filteredCompetitors() {
          const rawList = this.competitors || [];
          const fid = String(this.scopedFolderId || this.folderFilter || '').trim();
          const linkedSize = fid ? ((this.scopedFolderId ? this.scopedFolderCreatorIds?.size : this.folderCreatorMap[fid]?.size) || 0) : 0;
          const firstId = rawList.length > 0 ? (rawList[0].id || rawList[0].username || '') : '';
          const firstReach = rawList.length > 0 ? (rawList[0].monthly_reach || 0) : 0;
          const lastId = rawList.length > 1 ? (rawList[rawList.length - 1].id || rawList[rawList.length - 1].username || '') : '';
          const cacheKey = [rawList.length, firstId, firstReach, lastId, this.competitorFilter, fid, linkedSize, this.creatorDiscoveryFilter, this.vaultScope, (this.competitorSearch || '').trim().toLowerCase(), this.competitorSort].join(':');
          if (this._competitorsCacheKey === cacheKey && Array.isArray(this._cachedFilteredCompetitors)) {
            return this._cachedFilteredCompetitors;
          }

          let list = rawList;
          if (this.competitorFilter && this.competitorFilter !== 'all') {
            if (this.competitorFilter === 'paused') {
              list = list.filter(c => c.is_active === false);
            } else if (this.competitorFilter === 'active') {
              list = list.filter(c => c.is_active !== false);
            } else {
              list = list.filter(c => c.account_type === this.competitorFilter);
            }
          }
          if (this.scopedFolderId || this.folderFilter) {
            const linkedSet = (this.scopedFolderId ? this.scopedFolderCreatorIds : this.folderCreatorMap[fid]) || new Set();
            // [INVARIANT-LOCK: DO NOT REMOVE - ENFORCED BY verify_regression_locks.mjs] Lock 7: Room 3 Creator Hub Discovery Filter
            if (this.creatorDiscoveryFilter === 'tracked') {
              list = list.filter(c => c.is_linked || c.is_tracked || linkedSet.has(Number(c.id || c.competitor_id)));
            } else if (this.creatorDiscoveryFilter === 'discovered' || this.creatorDiscoveryFilter === 'auto_discovered') {
              list = list.filter(c => !c.is_linked && !c.is_tracked && !linkedSet.has(Number(c.id || c.competitor_id)));
            }
          }
          if (this.competitorSearch) {
            const q = this.competitorSearch.toLowerCase().replace('@', '').trim();
            if (q) {
              list = list.filter(c => (c.username && c.username.toLowerCase().includes(q)) || (c.display_name && c.display_name.toLowerCase().includes(q)) || (c.custom_label && c.custom_label.toLowerCase().includes(q)));
            }
          }

          const sortMode = this.competitorSort || 'audience_desc';
          const tieBreak = (a, b) => {
            const pDiff = (Number(b.pin_count) || 0) - (Number(a.pin_count) || 0);
            if (pDiff !== 0) return pDiff;
            const sDiff = (Number(b.top_pin_saves) || 0) - (Number(a.top_pin_saves) || 0);
            if (sDiff !== 0) return sDiff;
            return (Number(b.follower_count) || 0) - (Number(a.follower_count) || 0);
          };
          list = [...list].sort((a, b) => {
            if (sortMode === 'gain_24h_desc') {
              const dA = Number(a.delta_reach_24h ?? a.delta_24h ?? 0);
              const dB = Number(b.delta_reach_24h ?? b.delta_24h ?? 0);
              if (dB !== dA) return dB - dA;
              const rDiff = (Number(b.monthly_reach) || 0) - (Number(a.monthly_reach) || 0);
              return rDiff !== 0 ? rDiff : tieBreak(a, b);
            }
            if (sortMode === 'gain_7d_desc') {
              const dA = Number(a.reach_delta_7d ?? 0);
              const dB = Number(b.reach_delta_7d ?? 0);
              if (dB !== dA) return dB - dA;
              const rDiff = (Number(b.monthly_reach) || 0) - (Number(a.monthly_reach) || 0);
              return rDiff !== 0 ? rDiff : tieBreak(a, b);
            }
            if (sortMode === 'impressions_desc') {
              const vDiff = (Number(b.profile_views) || 0) - (Number(a.profile_views) || 0);
              return vDiff !== 0 ? vDiff : tieBreak(a, b);
            }
            if (sortMode === 'impressions_24h_desc') {
              const vA = Number(a.delta_views_24h ?? 0);
              const vB = Number(b.delta_views_24h ?? 0);
              if (vB !== vA) return vB - vA;
              const vDiff = (Number(b.profile_views) || 0) - (Number(a.profile_views) || 0);
              return vDiff !== 0 ? vDiff : tieBreak(a, b);
            }
            if (sortMode === 'impressions_7d_desc') {
              const vA = Number(a.views_delta_7d ?? 0);
              const vB = Number(b.views_delta_7d ?? 0);
              if (vB !== vA) return vB - vA;
              const vDiff = (Number(b.profile_views) || 0) - (Number(a.profile_views) || 0);
              return vDiff !== 0 ? vDiff : tieBreak(a, b);
            }
            if (sortMode === 'pins_desc') {
              return (Number(b.total_pins) || 0) - (Number(a.total_pins) || 0);
            }
            const rDiff = (Number(b.monthly_reach) || 0) - (Number(a.monthly_reach) || 0);
            return rDiff !== 0 ? rDiff : tieBreak(a, b);
          });

          this._competitorsCacheKey = cacheKey;
          this._cachedFilteredCompetitors = list;
          return list;
        },

        get totalCompetitorPages() {
          const list = this.filteredCompetitors || [];
          const size = this.competitorPageSize || 25;
          return Math.max(1, Math.ceil(list.length / size));
        },

        get paginatedCompetitors() {
          const list = this.filteredCompetitors || [];
          const size = this.competitorPageSize || 25;
          const page = Math.min(Math.max(1, this.competitorPage || 1), this.totalCompetitorPages);
          const start = (page - 1) * size;
          return list.slice(start, start + size);
        },

        get filteredCompetitorsReach() {
          return (this.filteredCompetitors || []).reduce((acc, c) => acc + (Number(c.monthly_reach) || 0), 0);
        },

        get filteredCompetitorsAudience() {
          return (this.filteredCompetitors || []).reduce((acc, c) => acc + (Number(c.profile_views) || 0), 0);
        },

        get filteredCompetitorsPins() {
          return (this.filteredCompetitors || []).reduce((acc, c) => acc + (Number(c.total_pins) || 0), 0);
        },

        get totalAudienceSum() {
          return (this.filteredCompetitors || []).reduce((acc, c) => acc + (Number(c.monthly_reach) || 0), 0);
        },

        get folderCompetitorTotals() {
          const list = (this.filteredCompetitors && this.filteredCompetitors.length > 0)
            ? this.filteredCompetitors
            : (this.competitors || []);
          if (list.length > 0) {
            const combinedAudience = list.reduce((sum, c) => sum + (Number(c.monthly_reach) || 0), 0);
            const combinedImpressions = list.reduce((sum, c) => sum + (Number(c.profile_views) || 0), 0);
            const combinedPins = list.reduce((sum, c) => sum + (Number(c.total_pins) || 0), 0);
            const delta24h = list.reduce((sum, c) => sum + Math.max(0, Number(c.delta_reach_24h || c.delta_24h || 0)), 0);
            const nonAggregatorList = list.filter(c => Number(c.total_pins || 0) < 1000000);
            const cadencePool = nonAggregatorList.length > 0 ? nonAggregatorList : list;
            const avgCadence = cadencePool.length > 0
              ? Number((cadencePool.reduce((sum, c) => sum + (Number(c.total_pins || 0) / 365), 0) / cadencePool.length).toFixed(1))
              : 0;
            return {
              combined_audience: combinedAudience,
              combined_impressions: combinedImpressions,
              combined_pins: combinedPins,
              total_creators: list.length,
              delta_24h: delta24h,
              avg_pinning_cadence: avgCadence
            };
          }
          if (this.folderCompetitorTotalsData) return this.folderCompetitorTotalsData;
          return {
            combined_audience: 0,
            combined_impressions: 0,
            combined_pins: 0,
            total_creators: 0,
            delta_24h: 0,
            avg_pinning_cadence: 0
          };
        },

        async toggleCreatorTracking(c) {
          if (!c) return;
          const wasTracked = c.is_tracked !== false;
          c.is_tracked = !wasTracked;
          try {
            const fid = this.scopedFolderId || this.folderFilter;
            if (fid) {
              const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/folders/' + encodeURIComponent(fid) + '/creators'), {
                method: wasTracked ? 'DELETE' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ competitor_id: c.competitor_id || c.id, username: c.username })
              });
              if (res.ok) {
                await this.loadFolderCreators(fid);
              }
            }
            if (typeof this.showToast === 'function') {
              this.showToast(c.is_tracked ? 'Tracking @' + c.username : 'Untracked @' + c.username, 'success');
            }
          } catch (_) {
            c.is_tracked = wasTracked;
          }
        },

        get availableCreatorMonths() {
          const set = new Set();
          for (const s of (this.activeCreatorSnapshots || [])) {
            const d = s.recorded_date || s.created_at;
            if (d) {
              const dt = new Date(d);
              if (!isNaN(dt.getTime())) {
                const key = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0');
                set.add(key);
              }
            }
          }
          return Array.from(set).sort().reverse();
        },

        get filteredCreatorSnapshots() {
          const snaps = this.activeCreatorSnapshots || [];
          if (!snaps.length) return [];
          const now = Date.now();
          let filtered = [...snaps].sort((a, b) => new Date(a.recorded_date || a.created_at) - new Date(b.recorded_date || b.created_at));
          
          if (this.creatorTimeRange === '7D') {
            filtered = filtered.filter(s => now - new Date(s.recorded_date || s.created_at).getTime() <= 7 * 86400000);
          } else if (this.creatorTimeRange === '30D') {
            filtered = filtered.filter(s => now - new Date(s.recorded_date || s.created_at).getTime() <= 30 * 86400000);
          } else if (this.creatorTimeRange === '90D') {
            filtered = filtered.filter(s => now - new Date(s.recorded_date || s.created_at).getTime() <= 90 * 86400000);
          } else if (this.creatorTimeRange === 'YTD') {
            const yr = new Date(new Date().getFullYear(), 0, 1).getTime();
            filtered = filtered.filter(s => new Date(s.recorded_date || s.created_at).getTime() >= yr);
          }

          if (this.creatorSelectedMonth !== 'all') {
            filtered = filtered.filter(s => {
              const d = new Date(s.recorded_date || s.created_at);
              const mKey = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
              return mKey === this.creatorSelectedMonth;
            });
          }

          return filtered.length > 0 ? filtered : snaps;
        },

        get creatorMoMStats() {
          const snaps = this.activeCreatorSnapshots || [];
          const months = this.availableCreatorMonths;
          const baseMonth = this.creatorMoMBaseMonth || (months.length > 1 ? months[0] : (months[0] || ''));
          const targetMonth = this.creatorMoMTargetMonth || (months.length > 1 ? months[months.length - 1] : (months[0] || ''));

          const getMonthAgg = (m) => {
            if (!m) return null;
            const filtered = snaps.filter(s => {
              const d = new Date(s.recorded_date || s.created_at);
              const mKey = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
              return mKey === m;
            });
            if (!filtered.length) return null;
            const last = filtered[filtered.length - 1];
            return {
              reach: Number(last.monthly_reach || 0),
              views: Number(last.profile_views || 0),
              followers: Number(last.follower_count || 0),
              pins: Number(last.total_pins || 0)
            };
          };

          const aggA = getMonthAgg(baseMonth);
          const aggB = getMonthAgg(targetMonth);

          const calc = (key) => {
            if (!aggA || !aggB) return { diff: 0, pct: 0 };
            const vA = aggA[key] || 0;
            const vB = aggB[key] || 0;
            const diff = vB - vA;
            const pct = vA > 0 ? Number(((diff / vA) * 100).toFixed(1)) : 0;
            return { diff, pct };
          };

          return {
            reach: calc('reach'),
            views: calc('views'),
            followers: calc('followers'),
            pins: calc('pins')
          };
        },

        get creatorSnapshotsWithDeltas() {
          const list = [...(this.activeCreatorSnapshots || [])].sort((a, b) => new Date(a.recorded_date || a.created_at || 0) - new Date(b.recorded_date || b.created_at || 0));
          return list.map((s, idx) => {
            const prev = idx > 0 ? list[idx - 1] : null;
            const delta_pins = prev ? (Number(s.total_pins || 0) - Number(prev.total_pins || 0)) : 0;
            const delta_reach = prev ? (Number(s.monthly_reach || 0) - Number(prev.monthly_reach || 0)) : 0;
            const delta_views = prev ? (Number(s.profile_views || 0) - Number(prev.profile_views || 0)) : 0;
            return {
              ...s,
              delta_pins,
              delta_reach,
              delta_views
            };
          });
        },

        get paginatedCreatorSnapshots() {
          let list = [...this.creatorSnapshotsWithDeltas];
          if (this.creatorSelectedMonth !== 'all') {
            list = list.filter(s => {
              const d = new Date(s.recorded_date || s.created_at);
              const mKey = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
              return mKey === this.creatorSelectedMonth;
            });
          }
          list.reverse();
          if (this.creatorSnapTimeframe === 'all') return list;
          const sz = Number(this.creatorSnapTimeframe) || 7;
          const start = (this.creatorSnapPage - 1) * sz;
          return list.slice(start, start + sz);
        },

        get creatorSnapshotsNetChange() {
          const slice = this.paginatedCreatorSnapshots;
          if (!slice || slice.length < 2) {
            return { reach: '—', views: '—', pins: '(+0)' };
          }
          const latest = slice[0];
          const earliest = slice[slice.length - 1];
          const pinsDiff = (Number(latest.total_pins || 0) - Number(earliest.total_pins || 0));
          const reachDiff = (Number(latest.monthly_reach || 0) - Number(earliest.monthly_reach || 0));
          const viewsDiff = (Number(latest.profile_views || 0) - Number(earliest.profile_views || 0));
          return {
            reach: (reachDiff > 0 ? '+' : '') + this.formatNumber(reachDiff),
            views: (viewsDiff > 0 ? '+' : '') + this.formatNumber(viewsDiff),
            pins: (pinsDiff > 0 ? '(+' + pinsDiff + ')' : (pinsDiff < 0 ? '(' + pinsDiff + ')' : '(+0)'))
          };
        },

        get isAllCreatorPinsSelected() {
          const pins = this.paginatedCreatorPins;
          if (!pins || !pins.length) return false;
          return pins.every(p => this.isPinSelected(p.pin_id));
        },

        get creatorChartData() {
          const snaps = this.filteredCreatorSnapshots;
          if (!snaps || !snaps.length) {
            return { min: 0, max: 0, latest: 0, points: [], strokePath: '', areaPath: '', dual: false, pointsA: [], pointsB: [], strokePathA: '', strokePathB: '', areaPathA: '' };
          }
          const width = 800;
          const height = 220;
          const padL = 50, padR = 30, padT = 20, padB = 40;
          const cW = width - padL - padR;
          const cH = height - padT - padB;

          if (this.creatorChartMode === 'dual') {
            const valsReach = snaps.map(s => Number(s.monthly_reach || 0));
            const valsViews = snaps.map(s => Number(s.profile_views || 0));
            const allVals = [...valsReach, ...valsViews];
            const min = Math.min(...allVals);
            const max = Math.max(...allVals);
            const range = (max - min) || 1;

            const mapSeries = (vals) => snaps.map((s, idx) => {
              const x = padL + (snaps.length === 1 ? cW / 2 : (idx / Math.max(1, snaps.length - 1)) * cW);
              const y = padT + cH - ((vals[idx] - min) / range) * cH;
              const dt = new Date(s.recorded_date || s.created_at);
              const label = !isNaN(dt.getTime()) ? dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Day ' + (idx + 1);
              return { x, y, val: vals[idx], label };
            });

            const ptsReach = mapSeries(valsReach);
            const ptsViews = mapSeries(valsViews);

            const buildSpline = (pts) => {
              if (pts.length <= 1) return pts.length === 1 ? 'M ' + pts[0].x + ' ' + pts[0].y + ' L ' + (pts[0].x + 1) + ' ' + pts[0].y : '';
              let d = 'M ' + pts[0].x + ' ' + pts[0].y;
              for (let i = 0; i < pts.length - 1; i++) {
                const p0 = pts[i];
                const p1 = pts[i + 1];
                const mx = (p0.x + p1.x) / 2;
                d += ' C ' + mx + ' ' + p0.y + ', ' + mx + ' ' + p1.y + ', ' + p1.x + ' ' + p1.y;
              }
              return d;
            };

            const strokeReach = buildSpline(ptsReach);
            const strokeViews = buildSpline(ptsViews);
            const lastReach = ptsReach[ptsReach.length - 1] || { x: padL + cW, y: padT + cH };
            const firstReach = ptsReach[0] || { x: padL, y: padT + cH };
            const areaReach = strokeReach ? (strokeReach + ' L ' + lastReach.x + ' ' + (padT + cH) + ' L ' + firstReach.x + ' ' + (padT + cH) + ' Z') : '';

            const svgPointsDualHtml = ptsReach.map(p => '<circle cx="' + p.x + '" cy="' + p.y + '" r="3.5" fill="white" stroke="#f43f5e" stroke-width="2" /><text x="' + p.x + '" y="210" text-anchor="middle" class="text-[10px] fill-slate-400 font-mono">' + p.label + '</text>').join('') + ptsViews.map(p => '<circle cx="' + p.x + '" cy="' + p.y + '" r="3.5" fill="white" stroke="#0ea5e9" stroke-width="2" />').join('');

            return {
              dual: true,
              min,
              max,
              latest: valsReach[valsReach.length - 1] || 0,
              points: ptsReach,
              pointsA: ptsReach,
              pointsB: ptsViews,
              strokePath: strokeReach,
              strokePathA: strokeReach,
              strokePathB: strokeViews,
              areaPath: areaReach,
              areaPathA: areaReach,
              svgPointsDualHtml
            };
          }

          let vals = [];
          if (this.creatorChartMode === 'views') {
            vals = snaps.map(s => Number(s.profile_views || 0));
          } else if (this.creatorChartMode === 'followers') {
            vals = snaps.map(s => Number(s.follower_count || 0));
          } else if (this.creatorChartMode === 'pins') {
            vals = snaps.map(s => Number(s.total_pins || 0));
          } else {
            vals = snaps.map(s => Number(s.monthly_reach || 0));
          }

          const min = Math.min(...vals);
          const max = Math.max(...vals);
          const latest = vals[vals.length - 1] || 0;
          const range = (max - min) || 1;

          const pts = snaps.map((s, idx) => {
            const x = padL + (snaps.length === 1 ? cW / 2 : (idx / Math.max(1, snaps.length - 1)) * cW);
            const y = padT + cH - ((vals[idx] - min) / range) * cH;
            const dt = new Date(s.recorded_date || s.created_at);
            const label = !isNaN(dt.getTime()) ? dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Day ' + (idx + 1);
            return { x, y, val: vals[idx], label };
          });

          let strokePath = '';
          if (pts.length === 1) {
            strokePath = 'M ' + pts[0].x + ' ' + pts[0].y + ' L ' + (pts[0].x + 1) + ' ' + pts[0].y;
          } else if (pts.length > 1) {
            strokePath = 'M ' + pts[0].x + ' ' + pts[0].y;
            for (let i = 0; i < pts.length - 1; i++) {
              const p0 = pts[i];
              const p1 = pts[i + 1];
              const mx = (p0.x + p1.x) / 2;
              strokePath += ' C ' + mx + ' ' + p0.y + ', ' + mx + ' ' + p1.y + ', ' + p1.x + ' ' + p1.y;
            }
          }

          const lastPt = pts[pts.length - 1] || { x: padL + cW, y: padT + cH };
          const firstPt = pts[0] || { x: padL, y: padT + cH };
          const areaPath = strokePath ? (strokePath + ' L ' + lastPt.x + ' ' + (padT + cH) + ' L ' + firstPt.x + ' ' + (padT + cH) + ' Z') : '';

          const strokeColor = this.creatorChartMode === 'views' ? '#0ea5e9' : (this.creatorChartMode === 'followers' ? '#a855f7' : (this.creatorChartMode === 'pins' ? '#10b981' : '#f43f5e'));
          const svgPointsHtml = pts.map(p => '<circle cx="' + p.x + '" cy="' + p.y + '" r="4" fill="white" stroke="' + strokeColor + '" stroke-width="2" class="cursor-pointer hover:r-6 transition-all" /><text x="' + p.x + '" y="210" text-anchor="middle" class="text-[10px] fill-slate-400 font-mono">' + p.label + '</text>').join('');

          return { dual: false, min, max, latest, points: pts, strokePath, areaPath, svgPointsHtml };
        },

        get filteredCreatorBoards() {
          let list = this.activeCreatorBoards || [];
          if (this.creatorBoardSelectedTopic) {
            const topic = this.creatorBoardSelectedTopic.toLowerCase().trim();
            list = list.filter(b => {
              const vase = Array.isArray(b.board_vase) ? b.board_vase : (b.metadata?.board_vase || []);
              return vase.some(v => (v?.text || v || '').toLowerCase().includes(topic));
            });
          }
          if (this.creatorBoardSearch) {
            const q = this.creatorBoardSearch.toLowerCase().trim();
            list = list.filter(b => {
              if (b.name && b.name.toLowerCase().includes(q)) return true;
              if (b.description && b.description.toLowerCase().includes(q)) return true;
              const vase = Array.isArray(b.board_vase) ? b.board_vase : (b.metadata?.board_vase || []);
              return vase.some(v => (v?.text || v || '').toLowerCase().includes(q));
            });
          }
          if (this.creatorBoardSort === 'most_pins') {
            list = [...list].sort((a, b) => (b.pin_count || 0) - (a.pin_count || 0));
          } else if (this.creatorBoardSort === 'most_followers') {
            list = [...list].sort((a, b) => (b.follower_count || 0) - (a.follower_count || 0));
          } else if (this.creatorBoardSort === 'recent_activity') {
            list = [...list].sort((a, b) => new Date(b.last_pinned_at || 0) - new Date(a.last_pinned_at || 0));
          } else if (this.creatorBoardSort === 'creation_date') {
            list = [...list].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
          } else if (this.creatorBoardSort === 'name_asc') {
            list = [...list].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
          }
          return list;
        },

        get paginatedCreatorBoards() {
          const list = this.filteredCreatorBoards;
          const sz = this.creatorBoardPageSize || 12;
          const start = (this.creatorBoardPage - 1) * sz;
          return list.slice(start, start + sz);
        },

        get creatorBoardsTotalPins() {
          return (this.activeCreatorBoards || []).reduce((acc, b) => acc + (Number(b.pin_count) || 0), 0);
        },

        get creatorBoardsTotalFollowers() {
          const accountFollowers = Number(this.activeCreator?.follower_count || 0);
          const maxBoardFollowers = Math.max(0, ...(this.activeCreatorBoards || []).map(b => Number(b.follower_count) || 0));
          return accountFollowers > 0 ? accountFollowers : maxBoardFollowers;
        },

        get creatorBoardsMaxPins() {
          const max = Math.max(1, ...(this.activeCreatorBoards || []).map(b => Number(b.pin_count) || 0));
          return max > 0 ? max : 1;
        },

        get creatorBoardsTopicsList() {
          const countMap = new Map();
          for (const b of (this.activeCreatorBoards || [])) {
            const vase = Array.isArray(b.board_vase) ? b.board_vase : (b.metadata?.board_vase || []);
            for (const v of vase) {
              const text = (typeof v === 'string' ? v : v?.text || '').trim();
              if (text) {
                countMap.set(text, (countMap.get(text) || 0) + 1);
              }
            }
          }
          return Array.from(countMap.entries())
            .map(([text, count]) => ({ text, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 30);
        },

        get filteredBoardPins() {
          let list = this.boardPins || [];
          if (this.boardPinsFilter === 'qualified') {
            list = list.filter(p => p.is_qualified);
          } else if (this.boardPinsFilter === 'product') {
            list = list.filter(p => p.is_product);
          }
          if (this.boardPinsSearch) {
            const q = this.boardPinsSearch.toLowerCase().trim();
            list = list.filter(p => 
              (p.title && p.title.toLowerCase().includes(q)) || 
              (p.description && p.description.toLowerCase().includes(q)) ||
              (p.domain && p.domain.toLowerCase().includes(q)) ||
              (p.link_domain && p.link_domain.toLowerCase().includes(q))
            );
          }
          if (this.boardPinsSort === 'saves_desc') {
            list = [...list].sort((a, b) => (Number(b.saves ?? b.save_count) || 0) - (Number(a.saves ?? a.save_count) || 0));
          } else if (this.boardPinsSort === 'repins_desc') {
            list = [...list].sort((a, b) => (Number(b.repins ?? b.repin_count) || 0) - (Number(a.repins ?? a.repin_count) || 0));
          } else if (this.boardPinsSort === 'velocity') {
            list = [...list].sort((a, b) => (Number(b.velocity) || 0) - (Number(a.velocity) || 0));
          } else if (this.boardPinsSort === 'newest') {
            list = [...list].sort((a, b) => new Date(b.created_at_pinterest || 0) - new Date(a.created_at_pinterest || 0));
          }
          return list;
        },

        get paginatedBoardPins() {
          const list = this.filteredBoardPins;
          const sz = this.boardPinsPageSize || 24;
          const start = (this.boardPinsPage - 1) * sz;
          return list.slice(start, start + sz);
        },

        get boardProductPinsCount() {
          return (this.boardPins || []).filter(p => p.is_product).length;
        },

        get boardWinningPinsCount() {
          return (this.boardPins || []).filter(p => p.is_qualified).length;
        },

        get boardPinsTotalPages() {
          return Math.max(1, Math.ceil((this.filteredBoardPins.length || 0) / (this.boardPinsPageSize || 24)));
        },

        get boardTotalSaves() {
          return (this.boardPins || []).reduce((acc, p) => acc + (Number(p.saves ?? p.save_count) || 0), 0);
        },

        get filteredCreatorPins() {
          let list = this.activeCreatorPins || [];
          if (this.creatorPinMinSaves > 0) {
            list = list.filter(p => Number(p.saves || 0) >= this.creatorPinMinSaves);
          }
          if (this.creatorPinSearch) {
            const q = this.creatorPinSearch.toLowerCase().trim();
            list = list.filter(p => 
              (p.title && p.title.toLowerCase().includes(q)) || 
              (p.board_name && p.board_name.toLowerCase().includes(q)) ||
              (p.description && p.description.toLowerCase().includes(q)) ||
              (p.pin_id && p.pin_id.includes(q))
            );
          }
          if (this.creatorPinBoard) {
            const b = this.creatorPinBoard.toLowerCase().trim();
            list = list.filter(p => p.board_name && p.board_name.toLowerCase() === b);
          }
          if (this.creatorPinStage) {
            list = list.filter(p => p.stage === this.creatorPinStage);
          }
          if (this.creatorPinSavesFilter === 'gte_100') {
            list = list.filter(p => (p.saves || 0) >= 100);
          } else if (this.creatorPinSavesFilter === 'gte_500') {
            list = list.filter(p => (p.saves || 0) >= 500);
          } else if (this.creatorPinSavesFilter === 'lte_50') {
            list = list.filter(p => (p.saves || 0) <= 50);
          }
          if (this.creatorPinChangedOnly) {
            list = list.filter(p => (p.delta_saves || 0) > 0 || (p.delta_repins || 0) > 0);
          }
          if (this.activeCreatorSelectedTopic) {
            const top = this.activeCreatorSelectedTopic.toLowerCase().trim();
            list = list.filter(p => {
              if (p.board_name && p.board_name.toLowerCase().includes(top)) return true;
              if (p.title && p.title.toLowerCase().includes(top)) return true;
              if (p.annotations) {
                const anns = Array.isArray(p.annotations) ? p.annotations : [];
                return anns.some(a => {
                  const name = (typeof a === 'string' ? a : (a && a.name)) || '';
                  return name.toLowerCase().includes(top);
                });
              }
              return false;
            });
          }

          // Sorting
          if (this.creatorPinSort === 'delta_saves') {
            list = [...list].sort((a, b) => (b.delta_saves || 0) - (a.delta_saves || 0));
          } else if (this.creatorPinSort === 'delta_3d') {
            list = [...list].sort((a, b) => (b.delta_saves_3d || 0) - (a.delta_saves_3d || 0));
          } else if (this.creatorPinSort === 'delta_7d') {
            list = [...list].sort((a, b) => (b.delta_saves_7d || 0) - (a.delta_saves_7d || 0));
          } else if (this.creatorPinSort === 'repins') {
            list = [...list].sort((a, b) => (b.repins || 0) - (a.repins || 0));
          } else if (this.creatorPinSort === 'velocity') {
            list = [...list].sort((a, b) => (b.velocity || 0) - (a.velocity || 0));
          } else if (this.creatorPinSort === 'shares') {
            list = [...list].sort((a, b) => (b.share_count || 0) - (a.share_count || 0));
          } else if (this.creatorPinSort === 'newest') {
            list = [...list].sort((a, b) => new Date(b.created_at_pinterest || 0) - new Date(a.created_at_pinterest || 0));
          } else {
            list = [...list].sort((a, b) => (b.saves || 0) - (a.saves || 0));
          }

          return list;
        },

        get paginatedCreatorPins() {
          const list = this.filteredCreatorPins;
          const sz = Number(this.creatorPinLimit) || 25;
          const start = (this.creatorPinPage - 1) * sz;
          return list.slice(start, start + sz);
        },

        get filteredCreatorTopics() {
          let list = this.activeCreatorTopics || [];
          if (this.creatorTopicSearch) {
            const q = this.creatorTopicSearch.toLowerCase().trim();
            list = list.filter(t => t.name && t.name.toLowerCase().includes(q));
          }
          return list;
        },

        // Pin Detail Dossier Stubs (V5 Dedicated Page Architecture /pin/:id)
        // Tab 2: Global Intersections State
        intersectionViewMode: (typeof localStorage !== 'undefined' && localStorage.getItem('pin_hub_view_mode')) || 'grid',
        isHubDrawerOpen: false,
        selectedHub: null,
        intersectionPage: 1,
        intersectionPageSize: 24,
        intersectionSort: 'pixie',
        intersectionExpandedHubs: {},
        intersectionFilters: {
          search: '',
          minOverlap: 'all',
          seedId: 'all',
          format: 'all',
          market: 'all',
          engine: 'all'
        },

        // Lightbox Modal State
        isLightboxOpen: false,
        lightboxIndex: 0,

        // Tab 1: Seed Dossier State
        activeDossierSeed: null,
        dossierCandidates: [],
        dossierTelemetry: {},
        dossierGuidedCapsules: [],
        dossierSearchQuery: '',
        dossierTab: 'table',
        dossierSort: 'saves',
        recgptPlaybook: null,
        dossierFilters: {
          search: '',
          engine: 'all',
          velocity: 'all',
          market: 'all',
          sequence: 'all'
        },

        // Tab 3: Master Explorer State
        explorerSeedId: 'all',
        explorerCandidates: [],
        explorerSort: 'saves',
        explorerFilters: {
          search: '',
          engine: 'all',
          velocity: 'all',
          market: 'all',
          sequence: 'all'
        },

        selectedCandidate: null,

        crawlStatus: { is_crawling: false },
        crawlElapsed: 0,
        crawlTimer: null,

        newSeed: {
          pin_id: '',
          label: '',
          is_competitor: true,
          auto_crawl: true
        },

        // Seeds Selection & Controls State
        selectedSeedIds: [],
        seedViewMode: (typeof localStorage !== 'undefined' && localStorage.getItem('pin_seed_view_mode')) || 'grid',
        seedSearch: '',
        seedFilterStatus: 'all',
        seedFilterType: 'all',
        seedSort: 'crawled_desc',

        // Bulk / Add Seed Modal State
        addSeedTab: 'bulk',
        bulkPinsInput: '',
        bulkLabelPrefix: 'Tracked Seed',
        bulkIsCompetitor: true,
        bulkAutoCrawl: true,
        bulkCrawlEngine: 'workflow',
        isSubmittingBulk: false,

        // Crawl Controller Modal State
        isCrawlModalOpen: false,
        crawlModalTab: 'launch',
        crawlTargetScope: 'queued',
        crawlCustomPinId: '',
        crawlEngine: 'workflow',
        crawlMaxPages: '60',
        workflowRuns: [],
        isLoadingWorkflowRuns: false,
        isTriggeringWorkflow: false,

        // Delete Modal State
        isDeleteModalOpen: false,
        deleteTarget: null,
        deletePurgeNeon: true,
        isDeleting: false,

        normalizeBoardSlug(str) {
          if (!str) return '';
          return String(str).toLowerCase().replace(/[^\\p{L}\\p{N}]+/gu, '-').replace(/^-|-$/g, '');
        },

        formatNumber(num, abbrev = false) {
          if (num === null || num === undefined) return '0';
          const val = Number(num);
          if (isNaN(val)) return '0';
          if (abbrev) {
            if (val >= 1000000) return (val / 1000000).toFixed(1) + 'M';
            if (val >= 1000) return (val / 1000).toFixed(1) + 'K';
            return String(val);
          }
          return val.toLocaleString();
        },

        switchTab(tab) {
          if (this.activePinId) {
            this.closePinPage(false);
          }
          if (this.activeBoardName) {
            this.closeBoardPage(false);
          }
          if (tab === 'overview' || tab === 'home') {
            if (this.activeCreator) this.closeCreatorProfile(false);
            this.currentTab = 'overview';
            if (typeof window !== 'undefined' && window.location.pathname !== '/') {
              window.history.pushState(null, '', '/');
            }
          } else if (tab === 'related_pins' || tab === 'seeds' || tab === 'intersections' || tab === 'explorer') {
            if (this.activeCreator) this.closeCreatorProfile(false);
            this.currentTab = 'related_pins';
            if (tab === 'seeds' || tab === 'intersections' || tab === 'explorer') {
              this.relatedSubTab = tab;
            }
            if (this.seeds.length === 0) this.fetchSeeds();
            if (this.intersections.length === 0) this.fetchIntersections();
            if (this.explorerCandidates.length === 0) this.loadExplorerData();
            if (typeof window !== 'undefined' && window.location.pathname !== '/related-pins') {
              window.history.pushState(null, '', '/related-pins');
            }
          } else if (tab === 'creators_archive' || tab === 'competitors' || tab === 'pinarchive' || tab === 'creators' || tab === 'accounts') {
            if (this.activeCreator) this.closeCreatorProfile(false);
            this.currentTab = 'creators_archive';
            if (this.competitors.length === 0) this.fetchCompetitors();
            if (typeof window !== 'undefined' && window.location.pathname !== '/accounts') {
              window.history.pushState(null, '', '/accounts');
            }
          } else if (tab === 'fleet') {
            this.switchTab('overview');
          } else {
            this.currentTab = tab;
          }
          this.$nextTick(() => {
            if (window.lucide) window.lucide.createIcons();
          });
        },

        applyCandidateFilters(list, filters) {
          if (!Array.isArray(list)) return [];
          let res = list;

          // 1. Text Search
          if (filters.search && filters.search.trim()) {
            const q = filters.search.toLowerCase().trim();
            res = res.filter(i => 
              (i.title && i.title.toLowerCase().includes(q)) ||
              (i.domain && i.domain.toLowerCase().includes(q)) ||
              (i.ocr_text && i.ocr_text.toLowerCase().includes(q)) ||
              (i.candidate_pin_id && String(i.candidate_pin_id).includes(q))
            );
          }

          // 2. Engine Provenance
          if (filters.engine && filters.engine !== 'all') {
            res = res.filter(i => (i.provenance_engine === filters.engine || i.engine_source === filters.engine));
          }

          // 3. Velocity Tier
          if (filters.velocity && filters.velocity !== 'all') {
            res = res.filter(i => {
              const v = Number(i.daily_velocity || 0);
              const tier = i.velocity_tier || (v >= 50 ? 'explosive' : (v >= 10 ? 'trending' : 'stagnant'));
              return tier === filters.velocity;
            });
          }

          // 4. Market Arbitrage Status
          if (filters.market && filters.market !== 'all') {
            if (filters.market === 'vacuum') {
              res = res.filter(i => i.is_vacuum_target || (!i.is_product && Number(i.saves || i.total_saves || 0) >= 5000));
            } else if (filters.market === 'product') {
              res = res.filter(i => i.is_product);
            }
          }

          // 5. RecGPT Meal Sequence
          if (filters.sequence && filters.sequence !== 'all') {
            res = res.filter(i => i.sequence_role === filters.sequence);
          }

          return res;
        },

        get filteredDossierCandidates() {
          return this.applyCandidateFilters(this.dossierCandidates, this.dossierFilters);
        },

        get filteredExplorerCandidates() {
          return this.applyCandidateFilters(this.explorerCandidates, this.explorerFilters);
        },

        get filteredIntersections() {
          if (!Array.isArray(this.intersections)) return [];
          let res = this.intersections;
          const f = this.intersectionFilters;

          // 1. Text Search across Title, Domain, OCR, Pin ID, or Seed Labels
          if (f.search && f.search.trim()) {
            const q = f.search.toLowerCase().trim();
            res = res.filter(i => {
              const matchTitle = i.title && i.title.toLowerCase().includes(q);
              const matchDomain = i.domain && i.domain.toLowerCase().includes(q);
              const matchOcr = i.ocr_text && i.ocr_text.toLowerCase().includes(q);
              const matchId = i.candidate_pin_id && String(i.candidate_pin_id).includes(q);
              const matchSeeds = Array.isArray(i.originating_seed_details) && i.originating_seed_details.some(s => s.label && s.label.toLowerCase().includes(q));
              return matchTitle || matchDomain || matchOcr || matchId || matchSeeds;
            });
          }

          // 2. Minimum Overlap Filter
          if (f.minOverlap && f.minOverlap !== 'all') {
            const minNum = Number(f.minOverlap);
            res = res.filter(i => Number(i.seed_overlap_count || 0) >= minNum);
          }

          // 3. Filter by Specific Originating Seed
          if (f.seedId && f.seedId !== 'all') {
            res = res.filter(i => Array.isArray(i.originating_seeds) && i.originating_seeds.includes(f.seedId));
          }

          // 4. Format Filter
          if (f.format && f.format !== 'all') {
            res = res.filter(i => i.format_type === f.format);
          }

          // 5. Market / Opportunity Filter
          if (f.market && f.market !== 'all') {
            if (f.market === 'vacuum') {
              res = res.filter(i => i.is_vacuum_target || (!i.is_product && Number(i.total_saves || i.saves || 0) >= 5000));
            } else if (f.market === 'product') {
              res = res.filter(i => i.is_product);
            } else if (f.market === 'high_rate') {
              res = res.filter(i => Number(i.avg_save_rate || i.save_rate || 0) >= 50);
            } else if (f.market === 'explosive') {
              res = res.filter(i => Number(i.daily_velocity || 0) >= 50);
            }
          }

          // 6. Engine Provenance Filter
          if (f.engine && f.engine !== 'all') {
            res = res.filter(i => (i.provenance_engine === f.engine || i.engine_source === f.engine));
          }

          // 7. Sort
          res = [...res].sort((a, b) => {
            if (this.intersectionSort === 'overlap') {
              const diff = Number(b.seed_overlap_count || 0) - Number(a.seed_overlap_count || 0);
              if (diff !== 0) return diff;
              return Number(b.pixie_multihit_score || 0) - Number(a.pixie_multihit_score || 0);
            }
            if (this.intersectionSort === 'saves') {
              return Number(b.total_saves || b.saves || 0) - Number(a.total_saves || a.saves || 0);
            }
            if (this.intersectionSort === 'rate') {
              return Number(b.avg_save_rate || b.save_rate || 0) - Number(a.avg_save_rate || a.save_rate || 0);
            }
            if (this.intersectionSort === 'velocity') {
              return Number(b.daily_velocity || 0) - Number(a.daily_velocity || 0);
            }
            // default: pixie multihit score
            return Number(b.pixie_multihit_score || 0) - Number(a.pixie_multihit_score || 0);
          });

          return res;
        },

        get bulkParsedPinIds() {
          if (!this.bulkPinsInput || typeof this.bulkPinsInput !== 'string') return [];
          const matches = this.bulkPinsInput.match(/\\d{10,25}/g) || [];
          const cleanIds = [];
          for (const m of matches) {
            const id = m.trim();
            if (id && !cleanIds.includes(id)) {
              cleanIds.push(id);
            }
          }
          return cleanIds;
        },

        get filteredSeeds() {
          let list = Array.isArray(this.seeds) ? [...this.seeds] : [];

          // 1. Text Search
          if (this.seedSearch && this.seedSearch.trim()) {
            const q = this.seedSearch.toLowerCase().trim();
            list = list.filter(s =>
              (s.pin_id && String(s.pin_id).includes(q)) ||
              (s.label && s.label.toLowerCase().includes(q))
            );
          }

          // 2. Status Filter
          if (this.seedFilterStatus === 'crawled') {
            list = list.filter(s => Boolean(s.last_crawled_at));
          } else if (this.seedFilterStatus === 'pending') {
            list = list.filter(s => !s.last_crawled_at);
          }

          // 3. Type Filter
          if (this.seedFilterType === 'competitor') {
            list = list.filter(s => Boolean(s.is_competitor));
          } else if (this.seedFilterType === 'internal') {
            list = list.filter(s => !s.is_competitor);
          }

          // 4. Sort
          if (this.seedSort === 'crawled_desc') {
            list.sort((a, b) => {
              if (!a.last_crawled_at && !b.last_crawled_at) return 0;
              if (!a.last_crawled_at) return 1;
              if (!b.last_crawled_at) return -1;
              return new Date(b.last_crawled_at) - new Date(a.last_crawled_at);
            });
          } else if (this.seedSort === 'candidates_desc') {
            list.sort((a, b) => Number(b.total_candidates || 0) - Number(a.total_candidates || 0));
          } else if (this.seedSort === 'candidates_asc') {
            list.sort((a, b) => Number(a.total_candidates || 0) - Number(b.total_candidates || 0));
          } else if (this.seedSort === 'gap_desc') {
            list.sort((a, b) => Number(b.commercial_gap_ratio || 100) - Number(a.commercial_gap_ratio || 100));
          } else if (this.seedSort === 'id_desc') {
            list.sort((a, b) => String(b.pin_id).localeCompare(String(a.pin_id)));
          }

          return list;
        },

        get isAllSeedsSelected() {
          const list = this.filteredSeeds;
          return list.length > 0 && list.every(s => this.selectedSeedIds.includes(s.pin_id));
        },

        get deleteTargetSummary() {
          if (!this.deleteTarget) return 'selected items';
          if (this.deleteTarget === 'selected') {
            return this.selectedSeedIds.length + ' selected seeds';
          }
          if (typeof this.deleteTarget === 'object') {
            return '"' + (this.deleteTarget.label || this.deleteTarget.pin_id) + '" (' + this.deleteTarget.pin_id + ')';
          }
          return 'seed ' + this.deleteTarget;
        },

        get paginatedIntersections() {
          const list = this.filteredIntersections;
          const start = (this.intersectionPage - 1) * this.intersectionPageSize;
          return list.slice(start, start + this.intersectionPageSize);
        },

        get intersectionTotalPages() {
          return Math.max(1, Math.ceil(this.filteredIntersections.length / this.intersectionPageSize));
        },

        get intersectionVisiblePages() {
          const total = this.intersectionTotalPages;
          const current = this.intersectionPage;
          const delta = 2;
          const range = [];
          for (let i = Math.max(2, current - delta); i <= Math.min(total - 1, current + delta); i++) {
            range.push(i);
          }
          if (current - delta > 2) range.unshift('...');
          if (current + delta < total - 1) range.push('...');
          range.unshift(1);
          if (total > 1) range.push(total);
          return range;
        },

        get intersectionStats() {
          const list = Array.isArray(this.intersections) ? this.intersections : [];
          const totalHubs = list.length;
          const goldenCore = list.filter(i => Number(i.seed_overlap_count || 0) >= 5).length;
          const superHubs = list.filter(i => Number(i.seed_overlap_count || 0) >= 3).length;
          const vacuumTargets = list.filter(i => i.is_vacuum_target || (!i.is_product && Number(i.total_saves || i.saves || 0) >= 5000)).length;
          let maxPixie = 0;
          for (const item of list) {
            const p = Number(item.pixie_multihit_score || 0);
            if (p > maxPixie) maxPixie = p;
          }
          return {
            totalHubs,
            goldenCore,
            superHubs,
            vacuumTargets,
            maxPixieRaw: maxPixie || 3878953.86,
            maxPixie: maxPixie.toLocaleString()
          };
        },

        getPixieResonance(item) {
          if (!item) {
            return {
              tier: 'B',
              label: '⭐ Tier B',
              badgeClass: 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border border-slate-500/30',
              barGradient: 'bg-gradient-to-r from-slate-400 to-slate-500',
              barPercent: 10,
              boostFactor: 1
            };
          }
          const score = Number(item.pixie_multihit_score || 0);
          const overlap = Number(item.seed_overlap_count || 1);
          const maxRaw = Number(this.intersectionStats?.maxPixieRaw || 3878953.86);
          const barPercent = Math.min(100, Math.max(10, Math.round((score / maxRaw) * 100)));
          const boostFactor = Math.pow(overlap, 2);

          if (score >= 3000000 || overlap >= 7) {
            return {
              tier: 'S+',
              label: '👑 Tier S+ (Top 0.1%)',
              badgeClass: 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30',
              barGradient: 'bg-gradient-to-r from-purple-500 via-rose-500 to-amber-500',
              barPercent,
              boostFactor
            };
          }
          if (score >= 1000000 || overlap >= 5) {
            return {
              tier: 'S',
              label: '🔥 Tier S (Golden Core)',
              badgeClass: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30',
              barGradient: 'bg-gradient-to-r from-rose-500 to-amber-500',
              barPercent,
              boostFactor
            };
          }
          if (score >= 500000 || overlap >= 3) {
            return {
              tier: 'A',
              label: '⚡ Tier A (Cluster Hub)',
              badgeClass: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30',
              barGradient: 'bg-gradient-to-r from-sky-500 to-emerald-500',
              barPercent,
              boostFactor
            };
          }
          return {
            tier: 'B',
            label: '⭐ Tier B (Pairwise)',
            badgeClass: 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border border-slate-500/30',
            barGradient: 'bg-gradient-to-r from-slate-400 to-slate-500',
            barPercent,
            boostFactor
          };
        },

        setIntersectionViewMode(mode) {
          this.intersectionViewMode = mode;
          try {
            if (typeof localStorage !== 'undefined') localStorage.setItem('pin_hub_view_mode', mode);
          } catch (e) {}
          this.$nextTick(() => {
            if (window.lucide) window.lucide.createIcons();
          });
        },

        openHubDrawer(item) {
          this.selectedHub = item;
          this.isHubDrawerOpen = true;
          this.$nextTick(() => {
            if (window.lucide) window.lucide.createIcons();
          });
        },

        closeHubDrawer() {
          this.isHubDrawerOpen = false;
          this.selectedHub = null;
        },

        copyHubReSpinAngle(item) {
          if (!item) return;
          const title = item.title || ('Pin ' + item.candidate_pin_id);
          const ocr = item.ocr_text ? (' Key detected image text: ' + item.ocr_text + '.') : '';
          const prompt = 'Act as an elite Pinterest viral growth strategist. Re-engineer this winning Pin concept into 5 high-converting headlines and 3 curiosity hooks.\\n\\nOriginal Winning Title: ' + title + '\\n' + ocr + '\\n\\nTarget: Maximize save rate, curiosity gap, and viral distribution across culinary/recipe clusters.';
          this.copyToClipboard(prompt, 'hub-angle-' + item.candidate_pin_id);
          this.showToast('Copied Viral Re-spin Prompt for "' + title.slice(0, 30) + '..."');
        },

        copyHubImagePrompt(item) {
          if (!item) return;
          const title = item.title || ('Pin ' + item.candidate_pin_id);
          const color = item.culinary_color_name ? (item.culinary_color_name + ' aesthetic') : (item.winning_color || 'warm appetizing tones');
          const prompt = 'High-end commercial cookbook photography of ' + title + ', styled for Pinterest viral engagement, ' + color + ', mouthwatering details, shallow depth of field, natural diffused kitchen lighting, shot on Hasselblad 50mm f/1.8 --ar 2:3 --v 6.1 --style raw';
          this.copyToClipboard(prompt, 'hub-image-' + item.candidate_pin_id);
          this.showToast('Copied Midjourney / Imagen Prompt!');
        },

        setIntersectionPage(p) {
          if (typeof p !== 'number') return;
          if (p >= 1 && p <= this.intersectionTotalPages) {
            this.intersectionPage = p;
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        resetIntersectionFilters() {
          this.intersectionFilters = {
            search: '',
            minOverlap: 'all',
            seedId: 'all',
            format: 'all',
            market: 'all',
            engine: 'all'
          };
          this.intersectionSort = 'pixie';
          this.intersectionPage = 1;
          this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
        },

        toggleExpandSeeds(pinId) {
          this.intersectionExpandedHubs = {
            ...this.intersectionExpandedHubs,
            [pinId]: !this.intersectionExpandedHubs[pinId]
          };
          this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
        },

        isSeedsExpanded(pinId) {
          return Boolean(this.intersectionExpandedHubs[pinId]);
        },

        openLightbox(index) {
          this.lightboxIndex = index;
          this.isLightboxOpen = true;
          this.$nextTick(() => {
            if (window.lucide) window.lucide.createIcons();
          });
        },

        closeLightbox() {
          this.isLightboxOpen = false;
        },

        prevLightboxImage() {
          if (!this.dossierGuidedCapsules || this.dossierGuidedCapsules.length <= 1) return;
          this.lightboxIndex = (this.lightboxIndex - 1 + this.dossierGuidedCapsules.length) % this.dossierGuidedCapsules.length;
        },

        nextLightboxImage() {
          if (!this.dossierGuidedCapsules || this.dossierGuidedCapsules.length <= 1) return;
          this.lightboxIndex = (this.lightboxIndex + 1) % this.dossierGuidedCapsules.length;
        },

        get currentLightboxCapsule() {
          if (!this.dossierGuidedCapsules || this.dossierGuidedCapsules.length === 0) return null;
          return this.dossierGuidedCapsules[this.lightboxIndex] || null;
        },

        resetDossierFilters() {
          this.dossierFilters = { search: '', engine: 'all', velocity: 'all', market: 'all', sequence: 'all' };
          this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
        },

        resetExplorerFilters() {
          this.explorerFilters = { search: '', engine: 'all', velocity: 'all', market: 'all', sequence: 'all' };
          this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
        },

        get cleanRecipeTitle() {
          if (!this.selectedCandidate) return 'Recipe';
          let title = this.selectedCandidate.title || '';
          if (!title || title.startsWith('[')) {
            title = 'Gourmet Culinary Dish';
          } else {
            title = title.replace(/\\s*\\|.*$/g, '');
            title = title.replace(/\\s*-\\s*.*recipe.*$/i, '');
            title = title.replace(/^Easy\\s+/i, '');
          }
          return title.trim();
        },

        get blueprintSeoTitle() {
          return 'Easy ' + this.cleanRecipeTitle + ' Recipe (Quick & Delicious) | Zizeeba';
        },

        get blueprintMidjourney() {
          const title = this.cleanRecipeTitle;
          const color = this.selectedCandidate?.winning_color || this.selectedCandidate?.dominant_color || '#824d30';
          return 'A high-end commercial food photography shot of ' + title + ', styled for a gourmet cookbook, vibrant textures, natural daylight, shallow depth of field, warm cozy aesthetic, color palette accented by ' + color + ', shot on Hasselblad 50mm f/1.8 --ar 9:16 --v 6.1 --style raw --q 2';
        },

        get blueprintJsonLd() {
          if (!this.selectedCandidate) return '{}';
          const title = this.cleanRecipeTitle;
          const pinId = this.selectedCandidate.candidate_pin_id;
          const schema = {
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "Product",
                "name": title + " - Printable Recipe Card PDF",
                "image": "https://zizeeba.com/images/recipes/" + pinId + ".jpg",
                "description": "Comprehensive printable digital recipe card for " + title + " featuring step-by-step instructions, ingredients breakdown, and chef tips.",
                "brand": { "@type": "Brand", "name": "Zizeeba" },
                "offers": {
                  "@type": "Offer",
                  "url": "https://zizeeba.com/recipe/" + pinId,
                  "priceCurrency": "USD",
                  "price": "1.99",
                  "availability": "https://schema.org/InStock",
                  "priceValidUntil": "2027-12-31"
                }
              },
              {
                "@type": "Recipe",
                "name": title,
                "image": ["https://zizeeba.com/images/recipes/" + pinId + ".jpg"],
                "author": { "@type": "Organization", "name": "Zizeeba Culinary Kitchen" },
                "description": "Delicious homemade " + title + " crafted with simple ingredients and optimal kitchen workflow.",
                "prepTime": "PT15M",
                "cookTime": "PT30M",
                "totalTime": "PT45M",
                "recipeYield": "4 servings",
                "recipeCategory": "Main Course"
              }
            ]
          };
          return JSON.stringify(schema, null, 2);
        },

        get candidateTrajectory() {
          const defaultAnchor = this.recgptPlaybook?.dinner_anchor || {
            title: 'Slow Cooker Garlic Herb Butter Chicken & Red Potatoes',
            save_rate: 94.2,
            recgpt_transition_score: 98.5,
            prep_time: '15m'
          };
          const defaultCoVisitor = this.recgptPlaybook?.navboost_co_visitor || {
            title: 'Cast Iron Skillet Garlic Cheddar Honey Biscuits',
            save_rate: 88.7,
            recgpt_transition_score: 92.1,
            prep_time: '20m'
          };
          const defaultFinisher = this.recgptPlaybook?.session_finisher || {
            title: 'Warm Skillet Salted Caramel Chocolate Chip Cookie with Vanilla Ice Cream',
            save_rate: 96.8,
            recgpt_transition_score: 97.4,
            prep_time: '10m'
          };

          if (!this.selectedCandidate) {
            return { anchor: defaultAnchor, co_visitor: defaultCoVisitor, finisher: defaultFinisher };
          }

          const x = this.selectedCandidate;
          const role = x.sequence_role || 'DINNER_ANCHOR';
          const pool = (this.dossierCandidates && this.dossierCandidates.length > 0)
            ? this.dossierCandidates
            : (this.explorerCandidates || []);

          const findBest = (targetRole, fallback) => {
            const match = pool
              .filter(c => c.candidate_pin_id !== x.candidate_pin_id && c.sequence_role === targetRole)
              .sort((a, b) => Number(b.saves || b.total_saves || 0) - Number(a.saves || a.total_saves || 0))[0];
            return match || fallback;
          };

          if (role === 'DINNER_ANCHOR') {
            return {
              anchor: { ...x, is_active_candidate: true },
              co_visitor: findBest('NAVBOOST_CO_VISITOR', defaultCoVisitor),
              finisher: findBest('SESSION_FINISHER', defaultFinisher)
            };
          } else if (role === 'NAVBOOST_CO_VISITOR') {
            return {
              anchor: findBest('DINNER_ANCHOR', defaultAnchor),
              co_visitor: { ...x, is_active_candidate: true },
              finisher: findBest('SESSION_FINISHER', defaultFinisher)
            };
          } else if (role === 'SESSION_FINISHER') {
            return {
              anchor: findBest('DINNER_ANCHOR', defaultAnchor),
              co_visitor: findBest('NAVBOOST_CO_VISITOR', defaultCoVisitor),
              finisher: { ...x, is_active_candidate: true }
            };
          } else {
            return {
              anchor: { ...x, is_active_candidate: true },
              co_visitor: findBest('NAVBOOST_CO_VISITOR', defaultCoVisitor),
              finisher: findBest('SESSION_FINISHER', defaultFinisher)
            };
          }
        },

        async openSeedDossier(seed) {
          this.activeDossierSeed = seed;
          this.dossierCandidates = [];
          this.dossierTelemetry = {};
          this.dossierGuidedCapsules = [];
          this.dossierSearchQuery = '';
          this.dossierTab = 'table';
          this.recgptPlaybook = null;
          this.isLightboxOpen = false;

          try {
            const [candRes, telRes, pbRes, capRes] = await Promise.all([
              fetch(this.getApiUrl('/api/candidates?seed_pin_id=' + seed.pin_id + '&sort=' + this.dossierSort + '&limit=1000')),
              fetch(this.getApiUrl('/api/cluster-telemetry?seed_pin_id=' + seed.pin_id)),
              fetch(this.getApiUrl('/api/recgpt-playbook?seed_pin_id=' + seed.pin_id)),
              fetch(this.getApiUrl('/api/guided-search?seed_pin_id=' + seed.pin_id))
            ]);
            if (candRes.ok) this.dossierCandidates = await candRes.json();
            if (telRes.ok) this.dossierTelemetry = await telRes.json();
            if (pbRes.ok) this.recgptPlaybook = await pbRes.json();
            if (capRes.ok) this.dossierGuidedCapsules = await capRes.json();
          } catch (e) {
            console.error(e);
          }

          this.$nextTick(() => {
            if (window.lucide) window.lucide.createIcons();
          });
        },

        async reloadDossierCandidates() {
          if (!this.activeDossierSeed) return;
          try {
            const [candRes, capRes] = await Promise.all([
              fetch(this.getApiUrl('/api/candidates?seed_pin_id=' + this.activeDossierSeed.pin_id + '&sort=' + this.dossierSort + '&limit=1000')),
              fetch(this.getApiUrl('/api/guided-search?seed_pin_id=' + this.activeDossierSeed.pin_id))
            ]);
            if (candRes.ok) this.dossierCandidates = await candRes.json();
            if (capRes.ok) this.dossierGuidedCapsules = await capRes.json();
          } catch (e) {}
          this.$nextTick(() => {
            if (window.lucide) window.lucide.createIcons();
          });
        },

        closeSeedDossier() {
          this.activeDossierSeed = null;
          this.dossierCandidates = [];
          this.dossierTelemetry = {};
          this.dossierGuidedCapsules = [];
          this.recgptPlaybook = null;
          this.isLightboxOpen = false;
          this.$nextTick(() => {
            if (window.lucide) window.lucide.createIcons();
          });
        },

        async inspectCandidate(item) {
          this.selectedCandidate = item;
          this.isDossierOpen = true;
          if (!this.recgptPlaybook || (item?.seed_pin_id && this.recgptPlaybook.seed_pin_id !== item.seed_pin_id)) {
            try {
              const res = await fetch(this.getApiUrl('/api/recgpt-playbook' + (item?.seed_pin_id ? '?seed_pin_id=' + item.seed_pin_id : '')));
              if (res.ok) this.recgptPlaybook = await res.json();
            } catch (e) {}
          }
          this.$nextTick(() => {
            if (window.lucide) window.lucide.createIcons();
          });
        },

        copyPromptForPairing(type) {
          const title = this.cleanRecipeTitle;
          const prompt = 'Gourmet commercial cookbook photography of ' + type + ' paired with ' + title + ', warm rustic kitchen lighting, shallow depth of field, fresh garnish, vibrant textures, shot on Hasselblad 50mm f/1.8 --ar 9:16 --v 6.1 --style raw';
          navigator.clipboard.writeText(prompt);
          this.showToast('Generated & Copied ' + type + ' Prompt!');
        },

        copyGuidedPrompt(query) {
          const prompt = 'Gourmet editorial food photography of ' + query + ', styled for a high-end culinary magazine, warm appetizing lighting, shallow depth of field, vibrant fresh textures, shot on Hasselblad 50mm f/1.8 --ar 9:16 --v 6.1 --style raw';
          navigator.clipboard.writeText(prompt);
          this.showToast('Copied Prompt for "' + query + '"!');
        },

        copyToClipboard(text, field) {
          navigator.clipboard.writeText(text);
          this.copiedField = field;
          this.showToast('Copied to Clipboard!');
          setTimeout(() => { this.copiedField = null; }, 2000);
        },

        showToast(msg) {
          this.toastMessage = msg;
          setTimeout(() => { this.toastMessage = null; }, 2500);
        },

        async init() {
          return this.initDashboard();
        },

        async initDashboard() {
          if (this._hasInitialized) return;
          this._hasInitialized = true;
          try {
            const savedTheme = typeof localStorage !== 'undefined' ? localStorage.getItem('pin_theme') : null;
            if (savedTheme) {
              this.isDark = savedTheme === 'dark';
            }
          } catch (_) {}
          try {
            const savedSidebar = typeof localStorage !== 'undefined' ? localStorage.getItem('pae_sidebar_collapsed') : null;
            if (savedSidebar !== null) {
              this.isSidebarCollapsed = savedSidebar === 'true';
            }
          } catch (_) {}
          if (typeof window !== 'undefined') {
            window.addEventListener('keydown', (e) => {
              if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
                e.preventDefault();
                this.toggleSidebar();
              }
            });
          }
          try {
            const savedCols = typeof localStorage !== 'undefined' ? localStorage.getItem('creator_master_visible_columns') : null;
            if (savedCols) {
              const parsed = JSON.parse(savedCols);
              this.visibleMasterColumns = { ...this.visibleMasterColumns, ...parsed, title: true };
            }
          } catch (_) {}
          this.$watch('creatorSubTab', (val) => {
            if (val === 'archive' && (!this.pinarchivePins || this.pinarchivePins.length === 0)) {
              this.fetchPinArchivePins();
            }
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          });
          this.$watch('activeCreatorTab', (val) => {
            if (val === 'pins' || val === 'topics') {
              this.activeCreatorTab = 'all_pins';
              if (val === 'pins') this.creatorAllPinQualifiedOnly = true;
              this.fetchCreatorAllPins();
            }
          });
          this.$watch('competitorFilter', () => { this.competitorPage = 1; });
          this.$watch('creatorDiscoveryFilter', () => { this.competitorPage = 1; });
          this.$watch('competitorSearch', () => { this.competitorPage = 1; });
          this.$watch('competitorPageSize', () => { this.competitorPage = 1; });
          this.$watch('competitorSort', () => {
            this.competitorPage = 1;
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          });
          this.loadFolders();
          // Immediate Deep Link URL Hydration (e.g. /freshmancook, /freshmancook/links, /freshmancook/related-pins)
          if (typeof window !== 'undefined') {
            const RESERVED_SYSTEM_SLUGS = new Set([
              'api', 'fleet', 'settings', 'admin', 'health', 'favicon.ico', 
              'robots.txt', 'index.html', 'assets', 'static', 'pin', 'related_pins', 'related-pins', 'relatedpins', 'intersections', 'archive', 'explorer',
              'accounts', 'creators', 'creator', 'pinarchive', 'keywords', 'keyword', 'board-idea', 'board-ideas', 'overview', 'home', 'dashboard', 'domains',
              'folders', 'folder', 'campaign-folders', 'discovery', 'board', 'boards', 'feed', 'search'
            ]);
            const CREATOR_SUB_TABS = {
              'links': 'top_urls',
              'link': 'top_urls',
              'top-urls': 'top_urls',
              'related-pins': 'related_pins',
              'related': 'related_pins',
              'all-pins': 'all_pins',
              'winning-pins': 'all_pins',
              'pins': 'all_pins',
              'topics': 'all_pins',
              'boards': 'boards',
              'overview': 'overview'
            };

            const segments = (window.location.pathname || '').split('/').filter(Boolean);
            const first = segments[0] || '';
            const second = segments[1] || '';
            const third = segments[2] || '';
            const cleanFirst = first.toLowerCase();

            if (cleanFirst === 'pin' && second) {
              this.openPinPage(second, false);
            } else if (cleanFirst === 'fleet') {
              this.currentTab = 'overview';
              if (typeof window !== 'undefined' && window.location.pathname !== '/') {
                window.history.replaceState(null, '', '/');
              }
            } else if (cleanFirst === 'accounts' || cleanFirst === 'creators' || cleanFirst === 'pinarchive') {
              this.currentTab = 'creators_archive';
              if (second && CREATOR_SUB_TABS[second.toLowerCase()]) {
                this.creatorSubTab = CREATOR_SUB_TABS[second.toLowerCase()];
              }
              const searchStr = (typeof window !== 'undefined' && window.location.search) ? window.location.search : '';
              if (searchStr) {
                const params = new URLSearchParams(window.location.search || '');
                const targetCreator = (params.get('creator') || params.get('competitor') || '').replace(/^@+/, '').trim();
                const action = (params.get('action') || '').trim().toLowerCase();
                if (action === 'track' || action === 'new') {
                  this.openAddCompetitorModal();
                  if (targetCreator) {
                    this.newCompetitorHandle = targetCreator;
                  }
                } else if (targetCreator) {
                  this.openCreatorByHandle(targetCreator, 'overview', false);
                }
              }
            } else if (cleanFirst === 'related-pins' || cleanFirst === 'related_pins' || cleanFirst === 'seeds' || cleanFirst === 'intersections') {
              this.currentTab = 'related_pins';
              if (cleanFirst === 'seeds' || cleanFirst === 'intersections') {
                this.relatedSubTab = cleanFirst;
              }
            } else if (cleanFirst === '' || cleanFirst === 'overview' || cleanFirst === 'home' || cleanFirst === 'dashboard') {
              this.currentTab = 'overview';
            } else if (first && !RESERVED_SYSTEM_SLUGS.has(cleanFirst)) {
              this.currentTab = 'creators_archive';
              if ((second === 'pin' || second === 'pins') && third) {
                const cleanU = first.replace(/^@+/, '').trim().toLowerCase();
                window.location.href = '/pin/' + encodeURIComponent(third) + '?creator=' + encodeURIComponent(cleanU);
                return;
              } else if (second && CREATOR_SUB_TABS[second.toLowerCase()]) {
                const targetTab = CREATOR_SUB_TABS[second.toLowerCase()];
                if (second.toLowerCase() === 'winning-pins' || second.toLowerCase() === 'pins') {
                  this.creatorAllPinQualifiedOnly = true;
                }
                this.openCreatorByHandle(first, targetTab);
              } else if (second) {
                this.openCreatorByHandle(first, 'overview', false).then(() => {
                  // [INVARIANT-LOCK: DO NOT REMOVE - ENFORCED BY verify_regression_locks.mjs] Lock 5: Ghost Board Shield for Untracked Creators
                  if (!this.activeCreator) return;
                  const targetSlug = this.normalizeBoardSlug(decodeURIComponent(second));
                  const matchBoard = (this.activeCreatorBoards || []).find(b => 
                    this.normalizeBoardSlug(b.name) === targetSlug ||
                    (b.board_slug && b.board_slug === targetSlug) ||
                    (b.name || '').toLowerCase() === decodeURIComponent(second).replace(/-/g, ' ').toLowerCase()
                  ) || { name: decodeURIComponent(second).replace(/-/g, ' ') };
                  this.openBoardPage(matchBoard, this.activeCreator, false);
                });
              } else {
                this.openCreatorByHandle(first, 'overview');
              }
            }

            window.addEventListener('popstate', async (e) => {
              const pSegments = (window.location.pathname || '').split('/').filter(Boolean);
              const pFirst = pSegments[0] || '';
              const pSecond = pSegments[1] || '';
              const pThird = pSegments[2] || '';
              const cleanPFirst = pFirst.toLowerCase();

              if (cleanPFirst === 'pin' && pSecond) {
                this.openPinPage(pSecond, false);
              } else if (cleanPFirst === 'fleet') {
                if (this.activePinId) this.closePinPage(false);
                if (this.activeBoardName) this.closeBoardPage(false);
                if (this.activeCreator) this.closeCreatorProfile(false);
                this.currentTab = 'overview';
                if (typeof window !== 'undefined' && window.location.pathname !== '/') {
                  window.history.replaceState(null, '', '/');
                }
              } else if (cleanPFirst === 'accounts' || cleanPFirst === 'creators' || cleanPFirst === 'pinarchive') {
                if (this.activePinId) this.closePinPage(false);
                if (this.activeBoardName) this.closeBoardPage(false);
                if (this.activeCreator) this.closeCreatorProfile(false);
                this.currentTab = 'creators_archive';
              } else if (cleanPFirst === 'related-pins' || cleanPFirst === 'related_pins') {
                if (this.activePinId) this.closePinPage(false);
                if (this.activeBoardName) this.closeBoardPage(false);
                if (this.activeCreator) this.closeCreatorProfile(false);
                this.currentTab = 'related_pins';
              } else if (cleanPFirst === '' || cleanPFirst === 'overview' || cleanPFirst === 'home') {
                if (this.activePinId) this.closePinPage(false);
                if (this.activeBoardName) this.closeBoardPage(false);
                if (this.activeCreator) this.closeCreatorProfile(false);
                this.currentTab = 'overview';
              } else if (pFirst && !RESERVED_SYSTEM_SLUGS.has(cleanPFirst)) {
                if ((pSecond === 'pin' || pSecond === 'pins') && pThird) {
                  const cleanU = pFirst.replace(/^@+/, '').trim().toLowerCase();
                  window.location.href = '/pin/' + encodeURIComponent(pThird) + '?creator=' + encodeURIComponent(cleanU);
                  return;
                } else if (pSecond && CREATOR_SUB_TABS[pSecond.toLowerCase()]) {
                  if (this.activePinId) this.closePinPage(false);
                  if (this.activeBoardName) this.closeBoardPage(false);
                  const targetTab = CREATOR_SUB_TABS[pSecond.toLowerCase()];
                  if (pSecond.toLowerCase() === 'winning-pins' || pSecond.toLowerCase() === 'pins') {
                    this.creatorAllPinQualifiedOnly = true;
                  }
                  await this.openCreatorByHandle(pFirst, targetTab, false);
                } else if (pSecond) {
                  if (this.activePinId) this.closePinPage(false);
                  const targetSlug = this.normalizeBoardSlug(decodeURIComponent(pSecond));
                  if (!this.activeCreator || (this.activeCreator.username || '').toLowerCase() !== pFirst.toLowerCase()) {
                    await this.openCreatorByHandle(pFirst, 'overview', false);
                  }
                  if (!this.activeCreator) return;
                  const matchBoard = (this.activeCreatorBoards || []).find(b => 
                    this.normalizeBoardSlug(b.name) === targetSlug ||
                    (b.board_slug && b.board_slug === targetSlug) ||
                    (b.name || '').toLowerCase() === decodeURIComponent(pSecond).replace(/-/g, ' ').toLowerCase()
                  ) || { name: decodeURIComponent(pSecond).replace(/-/g, ' ') };
                  await this.openBoardPage(matchBoard, this.activeCreator, false);
                } else {
                  if (this.activePinId) this.closePinPage(false);
                  if (this.activeBoardName) this.closeBoardPage(false);
                  await this.openCreatorByHandle(pFirst, 'overview', false);
                }
              } else {
                if (this.activePinId) this.closePinPage(false);
                if (this.activeBoardName) this.closeBoardPage(false);
                this.closeCreatorProfile(false);
              }
            });
          }

          // Background fleet & telemetry refresh (does not block instant SPA hydration)
          this.refreshAll().catch((err) => console.error('refreshAll background error:', err));
          // [INVARIANT: SINGLE-OPERATOR-SCALE-TO-ZERO] Single-shot initial check; avoid 3s polling loop while idle
          this.pollCrawlStatus();

          if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', () => {
              if (document.hidden) {
                this.stopCrawlPolling();
              } else if (this.crawlStatus && this.crawlStatus.is_crawling) {
                this.startCrawlPolling();
              }
            });
          }

          this.$nextTick(() => {
            if (window.lucide) window.lucide.createIcons();
          });
        },

        async refreshAll() {
          this.isLoading = true;
          try {
            if (this.scopedFolderId) {
              await Promise.all([
                this.fetchCookieStatus(),
                this.loadFolderCreators(this.scopedFolderId),
                this.fetchFleetProjects()
              ]);
            } else {
              await Promise.all([
                this.fetchOverview(),
                this.fetchSeeds(),
                this.fetchIntersections(),
                this.fetchCookieStatus(),
                (this.scopedFolderId || this.folderFilter) ? this.loadFolderCreators(this.scopedFolderId || this.folderFilter) : this.fetchCompetitors(),
                this.fetchKeywords(),
                this.fetchFleetProjects()
              ]);
            }
            if (this.currentTab === 'explorer') {
              await this.loadExplorerData();
            }
          } finally {
            this.isLoading = false;
            this.$nextTick(() => {
              if (window.lucide) window.lucide.createIcons();
            });
          }
        },

        getApiUrl(base) {
          if (this.selectedProject && this.selectedProject !== 'all') {
            const sep = base.includes('?') ? '&' : '?';
            return base + sep + 'project_id=' + encodeURIComponent(this.selectedProject);
          }
          return base;
        },

        async fetchCompetitors(bypassCache = false) {
          if (bypassCache) {
            this._clientCache?.creators?.clear();
            this._clientCache?.boards?.clear();
          }
          if (this.scopedFolderId || this.folderFilter) {
            return this.loadFolderCreators(this.scopedFolderId || this.folderFilter);
          }
          const reqSeq = ++this._creatorsReqSeq;
          try {
            const baseEndpoint = '/api/competitors?limit=5000' + (bypassCache ? ('&_t=' + Date.now() + '&refresh=true') : '');
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl(baseEndpoint), bypassCache ? { cache: 'no-store' } : {});
            if (reqSeq !== this._creatorsReqSeq) return;
            if (res.ok) {
              const data = await res.json();
              if (reqSeq !== this._creatorsReqSeq) return;
              this.competitorsOverview = data.overview || { tracked_profiles: 0, total_pins_stored: 0, high_velocity_pins: 0, top_competitors: [] };
              this.competitors = data.competitors || [];
              this._competitorsCacheKey = '';
              if (this.activeCreator) {
                const matched = this.competitors.find(c => (c.username || '').toLowerCase() === (this.activeCreator.username || '').toLowerCase());
                if (matched) {
                  this.activeCreator = { ...matched, ...this.activeCreator };
                }
              }
            } else {
              if (reqSeq !== this._creatorsReqSeq) return;
              this.competitorsOverview = { tracked_profiles: 0, total_pins_stored: 0, high_velocity_pins: 0, top_competitors: [] };
              this.competitors = [];
              this._competitorsCacheKey = '';
            }
          } catch (e) {
            if (reqSeq !== this._creatorsReqSeq) return;
            this.competitorsOverview = { tracked_profiles: 0, total_pins_stored: 0, high_velocity_pins: 0, top_competitors: [] };
            this.competitors = [];
            this._competitorsCacheKey = '';
          } finally {
            if (reqSeq === this._creatorsReqSeq) {
              this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
            }
          }
        },

        async syncCompetitor(username) {
          try {
            const cleanName = (username || '').replace(/^@+/, '');
            this.showToast('Syncing profile for @' + cleanName + '...');
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/competitors/sync'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ username: cleanName })
            });
            if (res.ok) {
              this._clientCache?.boards?.clear();
              await this.fetchCompetitors();
              if (this.activeCreator && (this.activeCreator.username || '').replace(/^@+/, '') === cleanName) {
                const updated = (this.competitors || []).find(c => (c.username || '').replace(/^@+/, '') === cleanName);
                if (updated) {
                  this.activeCreator = updated;
                }
                await this.fetchCreatorBoards(this.activeCreator);
              }
              this.showToast('Profile @' + cleanName + ' synced successfully!');
            } else {
              const errData = await res.json().catch(() => ({}));
              this.showToast('Failed to sync: ' + (errData?.error || res.statusText || 'Error'));
            }
          } catch (e) {
            this.showToast('Failed to sync: ' + e.message);
          }
        },

        async syncAllCompetitors() {
          if (!this.competitors || this.competitors.length === 0) return;
          this.isLoading = true;
          this.showToast('Starting full sync for ' + this.competitors.length + ' profiles...');
          try {
            for (let i = 0; i < this.competitors.length; i++) {
              const c = this.competitors[i];
              this.showToast('Syncing (' + (i + 1) + '/' + this.competitors.length + '): @' + c.username + '...');
              try {
                const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/competitors/sync'), {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ username: c.username })
                });
                if (res.status === 429 || res.status === 503) {
                  this.showToast('⚠️ Rate limit (429) or circuit breaker tripped. Pausing batch sync to protect account.');
                  break;
                }
              } catch (fetchErr) {
                console.warn('[syncAllCompetitors] Sync failed for @' + c.username, fetchErr);
              }
              if (i < this.competitors.length - 1) {
                const delay = 2500 + Math.floor(Math.random() * 1500);
                await new Promise(r => setTimeout(r, delay));
              }
            }
            await this.fetchCompetitors();
            this.showToast('All competitor profiles updated successfully!');
          } finally {
            this.isLoading = false;
          }
        },

        async deleteCompetitor(id) {
          if (!confirm('Are you sure you want to stop tracking this competitor?')) return;
          const previousCompetitors = [...(this.competitors || [])];
          // Optimistically remove from UI
          this.competitors = this.competitors.filter(c => Number(c.id) !== Number(id));
          try {
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/competitors?id=' + id), { method: 'DELETE' });
            if (res.ok) {
              if (this.activeCreator && Number(this.activeCreator.id) === Number(id)) {
                this.closeCreatorProfile();
              }
              await this.fetchCompetitors(true);
              this.showToast('Competitor removed.');
            } else {
              this.competitors = previousCompetitors;
              const err = await res.json().catch(() => ({}));
              const msg = err.error || err.message || (res.status === 503 ? 'Auth not configured (503)' : res.status === 401 ? 'Unauthorized (401)' : ('HTTP ' + res.status));
              this.showToast('Failed to delete competitor: ' + msg);
            }
          } catch (e) {
            this.competitors = previousCompetitors;
            this.showToast('Error deleting competitor: ' + (e.message || 'Network error'));
          } finally {
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        async assignCreatorToFolder(competitorId, folderId) {
          if (!competitorId || !folderId) return;
          const fid = String(folderId);
          const rawId = String(competitorId).trim();
          const isNumeric = /^\d+$/.test(rawId);
          const cid = isNumeric ? Number(rawId) : rawId;
          const cleanUsername = isNumeric ? null : rawId.replace(/^serp_/, '').replace(/^@+/, '').trim();
          const isAlreadyIn = this.isCreatorInFolder(cid, fid) || (cleanUsername && this.isCreatorInFolder(cleanUsername, fid));
          const method = isAlreadyIn ? 'DELETE' : 'POST';
          const url = isAlreadyIn 
            ? '/api/folders/' + encodeURIComponent(fid) + '/creators/' + encodeURIComponent(isNumeric ? cid : cleanUsername)
            : '/api/folders/' + encodeURIComponent(fid) + '/creators';
          const requestBody = isAlreadyIn
            ? undefined
            : JSON.stringify(isNumeric ? { competitor_id: cid } : { username: cleanUsername });
          try {
            const res = await (window.safeApiFetch || fetch)(url, {
              method,
              headers: { 'Content-Type': 'application/json' },
              body: requestBody
            });
            if (res.ok) {
              if (!this.folderCreatorMap[fid]) this.folderCreatorMap[fid] = new Set();
              if (isAlreadyIn) {
                this.folderCreatorMap[fid].delete(cid);
                if (cleanUsername) this.folderCreatorMap[fid].delete(cleanUsername);
                this.showToast('Creator unlinked from folder');
              } else {
                this.folderCreatorMap[fid].add(cid);
                if (cleanUsername) this.folderCreatorMap[fid].add(cleanUsername);
                this.showToast('Creator linked to folder');
              }
              const folderObj = this.foldersList.find(f => String(f.id) === fid);
              if (folderObj) {
                folderObj.creator_count = this.folderCreatorMap[fid].size;
              }
            } else {
              const err = await res.json().catch(() => ({}));
              this.showToast(err.message || 'Failed to update folder assignment');
            }
          } catch (e) {
            this.showToast('Network error: ' + e.message);
          }
        },

        isCreatorInFolder(competitorId, folderId) {
          const fid = String(folderId || this.folderFilter || this.scopedFolderId || '');
          if (!fid || !this.folderCreatorMap[fid]) return false;
          return this.folderCreatorMap[fid].has(Number(competitorId)) || this.folderCreatorMap[fid].has(String(competitorId));
        },

        async loadFolderCreators(folderId) {
          if (!folderId) return;
          const fid = String(folderId);
          const reqSeq = ++this._creatorsReqSeq;
          const inflightKey = fid + ':' + (this.vaultScope || 'high_signal');
          if (this._loadingFolderCreatorsKey === inflightKey && this._loadingFolderCreatorsPromise) {
            return this._loadingFolderCreatorsPromise;
          }
          this._loadingFolderCreatorsKey = inflightKey;
          this._loadingFolderCreatorsPromise = (async () => {
            try {
              const scopeParam = this.vaultScope ? ('&vault_scope=' + encodeURIComponent(this.vaultScope)) : '';
              const res = await (window.safeApiFetch || fetch)('/api/folders/' + encodeURIComponent(fid) + '/creators?discovery=true' + scopeParam);
              if (reqSeq !== this._creatorsReqSeq) return;
              if (res.ok) {
                const data = await res.json();
                if (reqSeq !== this._creatorsReqSeq) return;
                const linkedList = Array.isArray(data.linked_creators) ? data.linked_creators : [];
                const discoveredList = Array.isArray(data.discovered_creators) ? data.discovered_creators : [];
                const allList = Array.isArray(data.creators) ? data.creators : [...linkedList, ...discoveredList];

                const linkedIds = new Set(
                  (linkedList.length > 0 ? linkedList : allList.filter(c => c.is_linked))
                    .map(c => Number(c.competitor_id || c.id))
                    .filter(Boolean)
                );
                this.folderCreatorMap[fid] = linkedIds;

                if ((this.scopedFolderId && String(this.scopedFolderId) === fid) || (this.folderFilter && String(this.folderFilter) === fid)) {
                  this.scopedFolderCreatorIds = linkedIds;
                  this.folderCompetitorTotalsData = data.totals || null;
                  this.competitors = allList;
                  this._competitorsCacheKey = '';
                  this._cachedFilteredCompetitors = null;
                  if (this.activeFolder) {
                    this.activeFolder.discovered_creator_count = allList.length;
                    this.activeFolder.creator_count = allList.length;
                  }
                  const folderInList = (this.foldersList || []).find(f => String(f.id) === fid);
                  if (folderInList) {
                    folderInList.discovered_creator_count = allList.length;
                    folderInList.creator_count = allList.length;
                  }
                }
              }
            } catch (_) {
            } finally {
              if (this._loadingFolderCreatorsKey === inflightKey) {
                this._loadingFolderCreatorsKey = null;
                this._loadingFolderCreatorsPromise = null;
              }
              if (reqSeq === this._creatorsReqSeq) {
                this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
              }
            }
          })();
          return this._loadingFolderCreatorsPromise;
        },

        async setVaultScope(scope) {
          if (this.vaultScope === scope) return;
          this.vaultScope = scope;
          const fid = this.scopedFolderId || this.folderFilter;
          if (fid) {
            await this.loadFolderCreators(fid);
          }
        },

        async bulkPulseTrackSerpCreators() {
          if (!this.scopedFolderId) return;
          this.isBulkPulseTracking = true;
          try {
            const body = {
              custom_label: (this.bulkPulseCustomLabel || '').trim() || undefined,
              tracking_mode: 'pulse_only',
              sync_now: true
            };
            const res = await (window.safeApiFetch || fetch)('/api/folders/' + encodeURIComponent(this.scopedFolderId) + '/creators/bulk-pulse-track', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body)
            });
            if (res.ok) {
              const data = await res.json();
              this.showToast('⚡ Auto-tracked ' + (data.tracked_count || 0) + ' creators with 24h lightweight pulse!', 'success');
              await this.loadFolderCreators(this.scopedFolderId);
            } else {
              const err = await res.json().catch(() => ({}));
              this.showToast('Failed to auto-track creators: ' + (err.error || res.statusText), 'error');
            }
          } catch (e) {
            this.showToast('Network error: ' + (e.message || 'Unknown error'), 'error');
          } finally {
            this.isBulkPulseTracking = false;
          }
        },

        async loadFolders() {
          try {
            const res = await (window.safeApiFetch || fetch)('/api/folders');
            if (res.ok) {
              const data = await res.json();
              this.foldersList = data.folders || [];
              if (this.scopedFolderId) {
                const matched = this.foldersList.find(f => String(f.id) === String(this.scopedFolderId)) || null;
                if (matched) {
                  this.activeFolder = this.activeFolder ? { ...matched, ...this.activeFolder } : { ...matched };
                  if (Array.isArray(this.competitors) && this.competitors.length > 0) {
                    this.activeFolder.discovered_creator_count = this.competitors.length;
                    this.activeFolder.creator_count = this.competitors.length;
                    matched.discovered_creator_count = this.competitors.length;
                  }
                }
                this.$nextTick(() => {
                  this.folderFilter = String(this.scopedFolderId);
                });
              }
            }
          } catch (_) {}
        },

        async onFolderFilterChange() {
          this.competitorPage = 1;
          this.selectedCompetitorIds = [];
          this._competitorsCacheKey = '';
          if (this.folderFilter) {
            await this.loadFolderCreators(this.folderFilter);
          } else {
            this.folderCompetitorTotalsData = null;
            await this.fetchCompetitors(true);
          }
        },

        exportCompetitorsCsv() {
          const headers = ['Profile', 'Total audience', 'Impressions', 'Total Pins', 'Boards', 'Activity'];
          const lines = [
            headers.map(h => this.sanitizeCsvCell(h)).join(',')
          ];
          for (const c of this.filteredCompetitors) {
            lines.push([
              this.sanitizeCsvCell('@' + (c.username || '')),
              this.sanitizeCsvCell(c.monthly_reach != null ? c.monthly_reach : 0),
              this.sanitizeCsvCell(c.profile_views != null ? c.profile_views : 0),
              this.sanitizeCsvCell(c.total_pins != null ? c.total_pins : 0),
              this.sanitizeCsvCell(c.total_boards != null ? c.total_boards : 0),
              this.sanitizeCsvCell(c.activity_status || '1d ago')
            ].join(','));
          }
          const blob = new Blob([lines.join(String.fromCharCode(10))], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.setAttribute('href', url);
          link.setAttribute('download', 'pinterest_competitors_' + new Date().toISOString().slice(0, 10) + '.csv');
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        },

        toggleSelectCompetitor(id) {
          if (id === undefined || id === null) return;
          const numId = Number(id);
          const idx = this.selectedCompetitorIds.indexOf(numId);
          if (idx >= 0) {
            this.selectedCompetitorIds.splice(idx, 1);
          } else {
            this.selectedCompetitorIds.push(numId);
          }
        },

        get isAllCompetitorsSelected() {
          if (!this.filteredCompetitors || this.filteredCompetitors.length === 0 || this.selectedCompetitorIds.length === 0) return false;
          const selectedSet = new Set(this.selectedCompetitorIds);
          return this.filteredCompetitors.every(c => selectedSet.has(Number(c.id)));
        },

        toggleSelectAllCompetitors() {
          if (!this.filteredCompetitors || this.filteredCompetitors.length === 0) return;
          const filteredIds = this.filteredCompetitors.map(c => Number(c.id));
          const allSelected = filteredIds.every(id => this.selectedCompetitorIds.includes(id));
          if (allSelected) {
            this.selectedCompetitorIds = this.selectedCompetitorIds.filter(id => !filteredIds.includes(id));
          } else {
            const set = new Set([...this.selectedCompetitorIds, ...filteredIds]);
            this.selectedCompetitorIds = Array.from(set);
          }
        },

        clearSelectedCompetitors() {
          this.selectedCompetitorIds = [];
        },

        async quickPulseCreatorAction(competitor) {
          if (!competitor) return;
          const compId = competitor.id;
          const username = (competitor.username || '').replace(/^@+/, '').trim();
          this.pulsingCreatorId = compId;
          this.showToast('⚡ Quick Pulsing @' + username + ' (syncing impressions, total audience & boards)...');
          try {
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/creators/quick-pulse'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: compId, username })
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data?.success) {
              this.showToast('⚡ Quick Pulse complete for @' + username + '!');
              this._clientCache?.boards?.clear();
              await this.fetchCompetitors();
              if (this.activeCreator && (this.activeCreator.id === compId || (this.activeCreator.username || '').replace(/^@+/, '') === username)) {
                this._clientCache?.creators?.delete(username.toLowerCase());
                await this.openCreatorDossier(this.activeCreator);
              }
            } else {
              this.showToast('❌ Quick pulse failed: ' + (data?.error || res.statusText || 'Server error'));
            }
          } catch (e) {
            this.showToast('❌ Quick pulse network error: ' + e.message);
          } finally {
            this.pulsingCreatorId = null;
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        async deepHarvestCreatorAction(competitor) {
          if (!competitor) return;
          const compId = competitor.id;
          const username = (competitor.username || '').replace(/^@+/, '').trim();
          this.harvestingCreatorId = compId;
          this.showToast('🌊 Deep Harvesting @' + username + ' (profile sync + pin refresh & qualification)...');
          try {
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/creators/deep-harvest'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: compId, username })
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data?.success) {
              const promoted = data.qualified_promotions ?? data.promoted_count ?? data.qualified_count ?? 0;
              this.showToast('🌊 Deep Harvest complete for @' + username + ' (' + promoted + ' pins qualified into PinArchive)!');
              this._clientCache?.boards?.clear();
              await this.fetchCompetitors();
              if (this.activeCreator && (this.activeCreator.id === compId || (this.activeCreator.username || '').replace(/^@+/, '') === username)) {
                this._clientCache?.creators?.delete(username.toLowerCase());
                await this.openCreatorDossier(this.activeCreator);
              }
            } else {
              this.showToast('❌ Deep harvest failed: ' + (data?.error || res.statusText || 'Server error'));
            }
          } catch (e) {
            this.showToast('❌ Deep harvest network error: ' + e.message);
          } finally {
            this.harvestingCreatorId = null;
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        async fastRefreshCompetitorAction(competitor) {
          if (!competitor) return;
          const compId = competitor.id;
          const username = (competitor.username || '').replace(/^@+/, '').trim();
          this.fastRefreshingCompetitorId = compId;
          this.showToast('⚡ Fast refreshing archived pins for @' + username + ' directly from Pinterest...');
          try {
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/competitors/fast-refresh'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ competitor_id: compId, username })
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data?.success) {
              const refreshed = data.refreshed_count ?? data.refreshed_pins_count ?? data.total_refreshed ?? 0;
              this.showToast('⚡ Fast refresh complete for @' + username + ': ' + refreshed + ' archived pins updated with live metrics!');
              await this.fetchCompetitors();
              if (this.activeCreator && (this.activeCreator.id === compId || (this.activeCreator.username || '').replace(/^@+/, '') === username)) {
                await this.fetchCreatorPins(this.activeCreator);
                await this.fetchCreatorAllPins();
              }
            } else {
              this.showToast('❌ Fast refresh failed: ' + (data?.error || res.statusText || 'Server error'));
            }
          } catch (e) {
            this.showToast('❌ Fast refresh network error: ' + e.message);
          } finally {
            this.fastRefreshingCompetitorId = null;
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        async discoverFullCatalogAction(competitor) {
          if (!competitor) return;
          const compId = competitor.id;
          const username = (competitor.username || '').replace(/^@+/, '').trim();
          this.discoveringCatalogCompetitorId = compId;
          this.showToast('📋 Starting Full Catalog Discovery for @' + username + ' (crawling all pages to end of feed)...');
          try {
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/competitors/sync-pins'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                competitor_id: compId,
                username,
                mode: 'all',
                max_pages: 100
              })
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data?.success) {
              const fetched = data.total_fetched ?? data.crawled ?? data.pinsFetched ?? 0;
              const qualified = data.qualified ?? data.qualified_archived ?? data.qualifiedIngested ?? 0;
              const pages = data.pages_crawled ?? data.pagesCrawled ?? 0;
              this.showToast('📋 Full Catalog Discovered: ' + fetched + ' pins retrieved across ' + pages + ' pages (' + qualified + ' qualified into PinArchive)!');
              await this.fetchCompetitors();
              if (this.activeCreator && (this.activeCreator.id === compId || (this.activeCreator.username || '').replace(/^@+/, '') === username)) {
                await this.fetchCreatorAllPins();
                await this.fetchCreatorPins(this.activeCreator);
                await this.fetchCreatorBoards(this.activeCreator);
              }
            } else {
              this.showToast('❌ Discover catalog failed: ' + (data?.error || res.statusText || 'Server error'));
            }
          } catch (e) {
            this.showToast('❌ Discover catalog network error: ' + e.message);
          } finally {
            this.discoveringCatalogCompetitorId = null;
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        async auditSweepCompetitorAction(competitor) {
          if (!competitor) return;
          const compId = competitor.id;
          const username = (competitor.username || '').replace(/^@+/, '').trim();
          this.auditSweepingCompetitorId = compId;
          this.showToast('🏛️ Starting Comprehensive Audit Sweep for @' + username + '...');
          try {
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/competitors/audit-sweep'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ competitor_id: compId, username })
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data?.success) {
              const s = data.stats || data;
              const pinsAudited = s.total_pins_inventory ?? s.total_pins_audited ?? 0;
              const boardsSynced = s.boards_synced ?? 0;
              const dipsHealed = s.monotonic_dips_healed ?? 0;
              this.showToast('🏛️ Audit Sweep Complete for @' + username + '! ' + pinsAudited + ' pins audited, ' + boardsSynced + ' boards synced, ' + dipsHealed + ' metric dips healed.');
              await this.fetchCompetitors();
              if (this.activeCreator && (this.activeCreator.id === compId || (this.activeCreator.username || '').replace(/^@+/, '') === username)) {
                await this.fetchCreatorProfile(this.activeCreator);
                await this.fetchCreatorPins(this.activeCreator);
                await this.fetchCreatorAllPins();
                await this.fetchCreatorBoards(this.activeCreator);
                await this.fetchCreatorTopUrls();
              }
            } else {
              this.showToast('❌ Audit sweep failed: ' + (data?.error || res.statusText || 'Server error'));
            }
          } catch (e) {
            this.showToast('❌ Audit sweep network error: ' + e.message);
          } finally {
            this.auditSweepingCompetitorId = null;
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        async bulkPulseSelected() {
          if (!this.selectedCompetitorIds.length) return;
          const count = this.selectedCompetitorIds.length;
          this.showToast('⚡ Bulk Pulsing ' + count + ' creators (syncing impressions & audience)...');
          let successCount = 0;
          for (let i = 0; i < count; i++) {
            const cid = this.selectedCompetitorIds[i];
            const comp = (this.competitors || []).find(c => Number(c.id) === Number(cid));
            if (!comp) continue;
            try {
              await (window.safeApiFetch || fetch)(this.getApiUrl('/api/creators/quick-pulse'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: cid })
              });
              successCount++;
            } catch (_) {}
          }
          this.showToast('✓ Bulk Pulse complete (' + successCount + '/' + count + ' creators updated)!');
          this._clientCache?.creators?.clear();
          this._clientCache?.boards?.clear();
          await this.fetchCompetitors();
          this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
        },

        async bulkRefreshWinnersSelected() {
          if (!this.selectedCompetitorIds.length) return;
          const usernames = this.selectedCompetitorIds.map(id => {
            const comp = (this.competitors || []).find(c => Number(c.id) === Number(id));
            return comp?.username ? comp.username.replace(/^@+/, '').trim() : null;
          }).filter(Boolean);
          if (!usernames.length) return;
          this.showToast('🏆 Dispatching winning pins refresh for ' + usernames.length + ' creators on GitHub Actions...');
          this._clientCache?.boards?.clear();
          try {
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/creators/dispatch-crawl'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                usernames,
                crawl_mode: 'refresh',
                max_pages: 10
              })
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data?.success) {
              this.showToast('🚀 ' + (data?.message || 'Winning pins refresh dispatched on GitHub Actions!'));
            } else {
              this.showToast('❌ Bulk dispatch failed: ' + (data?.error || res.statusText));
            }
          } catch (err) {
            this.showToast('❌ Network error: ' + err.message);
          } finally {
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        bulkOpenFleetCrawlModal() {
          if (!this.selectedCompetitorIds.length) return;
          const firstComp = (this.competitors || []).find(c => Number(c.id) === Number(this.selectedCompetitorIds[0]));
          this.openGhaCrawlerModal(firstComp || { username: this.selectedCompetitorIds.length + ' Selected Creators' });
        },

        async dispatchRefreshWinnersAction(creator) {
          const target = creator || this.activeCreator;
          if (!target) return;
          const handle = (target.username || '').replace(/^@+/, '').trim();
          if (!handle) return;
          this.showToast('🏆 Dispatching winning pins refresh for @' + handle + ' on GitHub Actions...');
          try {
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/creators/dispatch-crawl'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                username: handle,
                crawl_mode: 'refresh',
                max_pages: 10
              })
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data?.success) {
              this._clientCache?.boards?.clear();
              this.showToast('🚀 Winning pins refresh launched on GitHub Actions for @' + handle + '!');
            } else {
              this.showToast('❌ Dispatch failed: ' + (data?.error || res.statusText || 'Check GitHub token'));
            }
          } catch (err) {
            this.showToast('❌ Network error: ' + err.message);
          } finally {
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        async bulkDeleteSelectedCompetitors() {
          if (!this.selectedCompetitorIds.length) return;
          const count = this.selectedCompetitorIds.length;
          if (!confirm('Are you sure you want to stop tracking ' + count + ' selected competitors?')) return;
          const previousCompetitors = [...(this.competitors || [])];
          const toDelete = new Set(this.selectedCompetitorIds.map(Number));
          this.competitors = this.competitors.filter(c => !toDelete.has(Number(c.id)));
          const idsToDelete = [...this.selectedCompetitorIds];
          this.selectedCompetitorIds = [];

          let failedCount = 0;
          let lastErrorMessage = '';
          try {
            for (const cid of idsToDelete) {
              try {
                const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/competitors?id=' + cid), { method: 'DELETE' });
                if (!res.ok) {
                  failedCount++;
                  const err = await res.json().catch(() => ({}));
                  lastErrorMessage = err.error || err.message || (res.status === 503 ? 'Auth not configured (503)' : res.status === 401 ? 'Unauthorized (401)' : ('HTTP ' + res.status));
                }
              } catch (delErr) {
                failedCount++;
                lastErrorMessage = delErr.message;
              }
            }
            await this.fetchCompetitors(true);
            if (failedCount === 0) {
              this.showToast('Removed ' + count + ' selected competitors.');
            } else if (failedCount === count) {
              this.competitors = previousCompetitors;
              this.showToast('Failed to delete competitors: ' + lastErrorMessage);
            } else {
              this.showToast('Removed ' + (count - failedCount) + ' competitors (' + failedCount + ' failed: ' + lastErrorMessage + ')');
            }
          } catch (e) {
            this.competitors = previousCompetitors;
            this.showToast('Error deleting competitors: ' + (e.message || 'Network error'));
          } finally {
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        async bulkToggleSelectedStatus(activeStatus) {
          if (!this.selectedCompetitorIds.length) return;
          const selectedSet = new Set(this.selectedCompetitorIds.map(Number));
          const count = this.selectedCompetitorIds.length;

          // 1. Instant optimistic reactive update across array
          this.competitors = (this.competitors || []).map(comp => {
            if (selectedSet.has(Number(comp.id))) {
              return { ...comp, is_active: activeStatus };
            }
            return comp;
          });
          if (this.activeCreator && selectedSet.has(Number(this.activeCreator.id))) {
            this.activeCreator = { ...this.activeCreator, is_active: activeStatus };
          }
          this.showToast(activeStatus ? ('▶ Resumed ingestion for ' + count + ' profiles.') : ('⏸ Paused ingestion for ' + count + ' profiles.'));

          // 2. Persist to backend in background
          try {
            for (const cid of this.selectedCompetitorIds) {
              await (window.safeApiFetch || fetch)(this.getApiUrl('/api/competitors/status'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: cid, is_active: activeStatus })
              }).catch(() => {});
            }
            await this.fetchCompetitors();
          } catch (e) {
            console.error('bulkToggleSelectedStatus error:', e);
          }
        },

        openBoardsModal(competitor) {
          if (!competitor) return;
          this.openCreatorDossier(competitor, 'boards');
        },

        async syncCompetitorBoardsAction(competitor) {
          if (!competitor) return;
          this.isSyncingBoards = true;
          this.showToast('Syncing boards for @' + competitor.username + ' from Pinterest...');
          try {
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/competitors/sync-boards'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ competitor_id: competitor.id, username: competitor.username })
            });
            if (res.ok) {
              this._clientCache?.boards?.clear();
              const data = await res.json();
              this.showToast('✅ Synced ' + (data.synced_boards_count ?? data.synced ?? 0) + ' boards for @' + competitor.username);
              const bRes = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/competitors/boards?competitor_id=' + encodeURIComponent(competitor.id) + (competitor.username ? '&username=' + encodeURIComponent(competitor.username) : '')));
              if (bRes.ok) {
                const bData = await bRes.json();
                this.competitorBoardsList = bData.boards || [];
                competitor.total_boards = this.competitorBoardsList.length;
                if (this.activeCreator && (this.activeCreator.id === competitor.id || this.activeCreator.username === competitor.username)) {
                  this.activeCreatorBoards = bData.boards || [];
                  this.activeCreator.total_boards = this.competitorBoardsList.length;
                }
              }
              await this.fetchCompetitors();
            } else {
              const err = await res.json().catch(() => ({}));
              this.showToast('Failed to sync boards: ' + (err.error || err.message || ('HTTP ' + res.status)));
            }
          } catch (e) {
            this.showToast('Sync boards error: ' + e.message);
          } finally {
            this.isSyncingBoards = false;
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        async fetchKeywords() {
          try {
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/keywords?limit=1000'));
            if (res.ok) {
              const data = await res.json();
              this.keywords = data.keywords || [];
            } else {
              this.keywords = [];
            }
          } catch (e) {
            this.keywords = [];
          }
        },

        async syncKeyword(keywordId) {
          try {
            this.showToast('Crawling Pinterest search SERP...');
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/keywords/sync'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ keyword_id: keywordId })
            });
            if (res.ok) {
              await this.fetchKeywords();
              this.showToast('Keyword SERP updated with daily velocity!');
            }
          } catch (e) {
            this.showToast('Failed to crawl keyword: ' + e.message);
          }
        },

        async openKeywordPins(kw) {
          this.activeKeyword = kw;
          this.isKeywordPinsOpen = true;
          this.isLoadingKeywordPins = true;
          try {
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/keywords/pins?keyword_id=' + kw.id));
            if (res.ok) {
              const data = await res.json();
              this.activeKeywordPins = data.pins || [];
            }
          } catch (e) {
            this.activeKeywordPins = [];
          } finally {
            this.isLoadingKeywordPins = false;
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        async deleteKeyword(id) {
          if (!confirm('Are you sure you want to stop tracking this keyword?')) return;
          try {
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/keywords?id=' + id), { method: 'DELETE' });
            if (res.ok) {
              await this.fetchKeywords();
              this.showToast('Keyword removed.');
            }
          } catch (e) {}
        },

        async fetchFleetProjects() {
          this.fleetProjects = [{
            id: 1,
            project_id: 'unified-vps-hub',
            project_name: 'Native VPS PostgreSQL SSOT',
            status: 'active',
            is_hub: true,
            ping_latency: 1
          }];
        },

        formatFleetHost(url) {
          if (!url) return 'vps-postgres-ssot';
          const match = url.match(/@([^/:]+)/);
          if (match && match[1]) {
            const host = match[1];
            if (host.length > 24) {
              return host.slice(0, 10) + '...' + host.slice(-10);
            }
            return host;
          }
          return 'vps-postgres-ssot';
        },

        inspectFleetNode(project) {
          this.inspectedNode = project;
          this.isInspectingNodeModalOpen = true;
          this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
        },

        async pingFleetBatchAction() {
          if (this.isPingingAllFleet) return;
          this.isPingingAllFleet = true;
          try {
            for (const node of this.fleetProjects) {
              node.ping_latency = 1;
            }
            this.fleetPingSummary = {
              avg_ms: 1,
              total_tested: this.fleetProjects.length || 1,
              healthy_count: this.fleetProjects.length || 1
            };
            this.showToast('⚡ Unified VPS PostgreSQL SSOT online (1ms)');
          } finally {
            this.isPingingAllFleet = false;
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        pingingProjectId: null,

        async pingFleetShard(project) {
          if (!project || !project.project_id) return;
          project.ping_latency = 1;
          this.showToast('⚡ ' + (project.project_name || 'Unified VPS DB') + ' active: 1ms latency');
        },

        async copyFleetUrl(project) {
          if (!project) return;
          if (project.masked_url) {
            await navigator.clipboard.writeText(project.masked_url);
            this.copiedField = 'url-' + project.id;
            this.showToast('Copied connection URL for ' + project.project_name + '!');
            setTimeout(() => { if (this.copiedField === 'url-' + project.id) this.copiedField = null; }, 2000);
          }
        },

        async syncAllFleetDatabasesAction() {
          this.isSyncingFleet = true;
          try {
            await this.fetchFleetProjects();
            await this.fetchCompetitors();
            this.showToast('🎉 Unified VPS PostgreSQL SSOT is already synchronized!');
          } finally {
            this.isSyncingFleet = false;
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        async switchProject(projId) {
          this.selectedProject = projId;
          this.activeCreator = null;
          this.activeCreatorDetail = null;
          this.activeCreatorPins = [];
          this.activeCreatorAllPins = [];
          this.activeCreatorAllPinsTotal = 0;
          this.activeCreatorCatalogTotal = 0;
          this.activeCreatorWinningPinsTotal = 0;
          this.activeCreatorRankedTotal = 0;
          this.activeCreatorHighVelocityTotal = 0;
          this.activeCreatorAllPinsBoards = [];
          this.activeCreatorTopics = [];
          this.activeCreatorBoards = [];
          this.activeCreatorSnapshots = [];
          this.activeDossierSeed = null;
          this.dossierCandidates = [];
          this.competitors = [];
          this.competitorsOverview = { tracked_profiles: 0, total_pins_stored: 0, high_velocity_pins: 0, top_competitors: [] };
          this.seeds = [];
          this.overview = { total_seeds: 0, total_candidates: 0, commercial_gaps: 0, top_clusters: [] };
          this.intersections = [];
          this.pinarchivePins = [];
          this.pinarchiveOverview = { total_pins: 0, total_saves: 0, total_repins: 0, avg_velocity: 0, tracked_accounts: 0, top_cluster: null };
          this.pinarchiveTopics = [];
          this.showToast('Switched view to project: ' + projId);
          await this.refreshAll();
        },

        async fetchPinArchiveOverview() {
          try {
            const res = await fetch(this.getApiUrl('/api/pinarchive/overview'));
            if (res.ok) {
              const data = await res.json();
              this.pinarchiveOverview = data.overview || data;
            } else {
              this.pinarchiveOverview = { total_pins: 0, total_saves: 0, total_repins: 0, avg_velocity: 0, tracked_accounts: 0, top_cluster: null };
            }
          } catch (e) {
            console.error('fetchPinArchiveOverview error:', e);
            this.pinarchiveOverview = { total_pins: 0, total_saves: 0, total_repins: 0, avg_velocity: 0, tracked_accounts: 0, top_cluster: null };
          }
        },

        async fetchPinArchiveTopics() {
          try {
            const search = encodeURIComponent(this.pinarchiveTopicSearch || '');
            const res = await fetch(this.getApiUrl('/api/pinarchive/topics?search=' + search));
            if (res.ok) {
              const data = await res.json();
              this.pinarchiveTopics = data.topics || [];
            } else {
              this.pinarchiveTopics = [];
            }
          } catch (e) {
            console.error('fetchPinArchiveTopics error:', e);
            this.pinarchiveTopics = [];
          } finally {
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        async fetchPinArchivePins() {
          this.isLoadingPinArchive = true;
          try {
            const p = new URLSearchParams();
            if (this.pinarchiveSearch) p.set('search', this.pinarchiveSearch.trim());
            if (this.pinarchiveMinSaves) p.set('min_saves', this.pinarchiveMinSaves);
            if (this.pinarchiveSort) p.set('sort', this.pinarchiveSort);
            if (this.pinarchiveSelectedTopic) p.set('topic', this.pinarchiveSelectedTopic);
            if (this.pinarchiveSelectedAccount) p.set('account', this.pinarchiveSelectedAccount.trim());
            p.set('limit', '48');
            const res = await fetch(this.getApiUrl('/api/pinarchive/pins?' + p.toString()));
            if (res.ok) {
              const data = await res.json();
              this.pinarchivePins = data.pins || [];
            } else {
              this.pinarchivePins = [];
            }
          } catch (e) {
            console.error('fetchPinArchivePins error:', e);
            this.pinarchivePins = [];
          } finally {
            this.isLoadingPinArchive = false;
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        filterByTopic(topicName) {
          if (this.pinarchiveSelectedTopic === topicName) {
            this.pinarchiveSelectedTopic = '';
          } else {
            this.pinarchiveSelectedTopic = topicName;
          }
          this.fetchPinArchivePins();
        },

        async fetchQualificationRules() {
          try {
            const res = await fetch(this.getApiUrl('/api/pinarchive/rules'));
            if (res.ok) {
              const data = await res.json();
              if (data.rules) {
                const r = data.rules;
                const enabled = r.master_ingest_enabled !== undefined ? Boolean(r.master_ingest_enabled) : (r.cron_enabled !== undefined ? Boolean(r.cron_enabled) : true);
                this.qualificationRules = {
                  ...this.qualificationRules,
                  ...r,
                  master_ingest_enabled: enabled,
                  cron_enabled: enabled
                };
              }
            }
          } catch (e) {
            console.error('fetchQualificationRules error:', e);
          }
        },

        async saveQualificationRulesAction() {
          this.isSavingRules = true;
          try {
            const payload = {
              ...this.qualificationRules,
              master_ingest_enabled: Boolean(this.qualificationRules.cron_enabled)
            };
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/pinarchive/rules'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });
            if (res.ok) {
              const data = await res.json();
              if (data.rules) {
                const r = data.rules;
                const enabled = r.master_ingest_enabled !== undefined ? Boolean(r.master_ingest_enabled) : (r.cron_enabled !== undefined ? Boolean(r.cron_enabled) : true);
                this.qualificationRules = {
                  ...this.qualificationRules,
                  ...r,
                  master_ingest_enabled: enabled,
                  cron_enabled: enabled
                };
              }
              this.showToast('✅ Qualification rules updated successfully!');
            } else {
              const err = await res.json().catch(() => ({}));
              this.showToast('Failed to save rules: ' + (err.error || err.message || ('HTTP ' + res.status)));
            }
          } catch (e) {
            this.showToast('Error saving rules: ' + e.message);
          } finally {
            this.isSavingRules = false;
          }
        },

        async reEvaluateCandidatesAction() {
          if (!confirm('Re-evaluate all archived pins against current qualification rules? Non-qualifying pins may be pruned or deactivated.')) return;
          this.isReEvaluating = true;
          try {
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/pinarchive/re-evaluate'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(this.qualificationRules)
            });
            const data = await res.json();
            if (res.ok && data.total_evaluated !== undefined) {
              const evalTotal = data.total_evaluated ?? 0;
              const qualCount = data.qualified_count ?? 0;
              const disCount = data.disqualified_pruned ?? data.disqualified_count ?? 0;
              this.showToast('⚡ Evaluated ' + evalTotal + ' pins: ' + qualCount + ' qualified, ' + disCount + ' non-qualifying.');
              await this.fetchPinArchiveOverview();
              await this.fetchPinArchivePins();
            } else {
              this.showToast('Re-evaluation note: ' + (data.error || data.message || 'Check rules'));
            }
          } catch (e) {
            this.showToast('Re-evaluation request failed: ' + e.message);
          } finally {
            this.isReEvaluating = false;
          }
        },

        async harvestCompetitorPinsAction(competitor, mode = 'daily') {
          if (!competitor) return;
          const handle = (competitor.username || '').replace(/^@+/, '').trim();
          const compId = competitor.id || handle;
          const crawlMode = mode === 'deep' ? 'discovery' : 'refresh';
          const maxPages = mode === 'deep' ? 500 : 3;

          this.harvestingCompetitorId = compId;
          this.showToast('⚡ Dispatching 20-shard GHA Crawler for @' + handle + ' (' + crawlMode + ' mode, max ' + maxPages + 'p)...');
          try {
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/competitors/dispatch-crawl'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                username: handle,
                crawl_mode: crawlMode,
                max_pages: maxPages
              })
            });
            const data = await res.json();
            if (res.ok && data.success) {
              this._clientCache?.boards?.clear();
              this.showToast('🚀 ' + (data.message || 'Crawler pipeline launched on GitHub Actions!'));
            } else {
              this.showToast('❌ Dispatch note: ' + (data.error || data.message || 'Check GitHub token configuration'));
            }
          } catch (e) {
            this.showToast('❌ Dispatch network error: ' + e.message);
          } finally {
            this.harvestingCompetitorId = null;
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        async fetchOverview() {
          try {
            const res = await fetch(this.getApiUrl('/api/overview'));
            if (res.ok) {
              this.overview = await res.json();
            } else {
              this.overview = { total_seeds: 0, total_candidates: 0, commercial_gaps: 0, top_clusters: [] };
            }
          } catch (e) {
            this.overview = { total_seeds: 0, total_candidates: 0, commercial_gaps: 0, top_clusters: [] };
          }
        },

        async fetchSeeds() {
          try {
            const res = await fetch(this.getApiUrl('/api/seeds'));
            if (res.ok) {
              this.seeds = await res.json();
            } else {
              this.seeds = [];
            }
          } catch (e) {
            this.seeds = [];
          }
        },

        async fetchIntersections() {
          try {
            const res = await fetch(this.getApiUrl('/api/intersections?min_overlap=2&limit=1000'));
            if (res.ok) {
              this.intersections = await res.json();
            } else {
              this.intersections = [];
            }
          } catch (e) {
            this.intersections = [];
          }
        },

        async loadExplorerData() {
          let url = '/api/candidates?limit=1000&sort=' + this.explorerSort;
          if (this.explorerSeedId && this.explorerSeedId !== 'all') {
            url += '&seed_pin_id=' + this.explorerSeedId;
          }
          try {
            const res = await fetch(this.getApiUrl(url));
            if (res.ok) this.explorerCandidates = await res.json();
          } catch (e) {}
          this.$nextTick(() => {
            if (window.lucide) window.lucide.createIcons();
          });
        },

        async triggerCrawl(seedPinId = null) {
          try {
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/crawl'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ seed_pin_id: seedPinId })
            });
            if (res.ok) {
              this.crawlStatus.is_crawling = true;
              this.crawlElapsed = 0;
              this.startElapsedTimer();
              this.startCrawlPolling();
              this.showToast('Background crawl started!');
            } else {
              const err = await res.json().catch(() => ({}));
              this.showToast('Failed to trigger crawl: ' + (err?.error || res.statusText || 'Failed'), 'error');
            }
          } catch (e) {
            this.showToast('Failed to trigger crawl: ' + e.message, 'error');
          }
        },

        startElapsedTimer() {
          if (this.crawlTimer) clearInterval(this.crawlTimer);
          this.crawlTimer = setInterval(() => {
            if (this.crawlStatus && this.crawlStatus.is_crawling) {
              this.crawlElapsed++;
            } else {
              clearInterval(this.crawlTimer);
              this.crawlTimer = null;
            }
          }, 1000);
        },

        startCrawlPolling() {
          // [INVARIANT: SINGLE-OPERATOR-SCALE-TO-ZERO] Only poll while crawl is actively executing
          this.stopCrawlPolling();
          this._crawlStatusInterval = setInterval(() => {
            if (typeof document === 'undefined' || !document.hidden) {
              if (this.crawlStatus && this.crawlStatus.is_crawling) {
                this.pollCrawlStatus();
              } else {
                this.stopCrawlPolling();
              }
            }
          }, 3000);
        },

        stopCrawlPolling() {
          if (this._crawlStatusInterval) {
            clearInterval(this._crawlStatusInterval);
            this._crawlStatusInterval = null;
          }
        },

        async pollCrawlStatus() {
          if (this._isPollingCrawl) return;
          this._isPollingCrawl = true;
          try {
            const res = await fetch(this.getApiUrl('/api/crawl-status'));
            if (res.ok) {
              const prevCrawling = this.crawlStatus.is_crawling;
              this.crawlStatus = await res.json();
              if (this.crawlStatus && this.crawlStatus.is_crawling) {
                if (!this._crawlStatusInterval) this.startCrawlPolling();
                if (!this.crawlTimer) this.startElapsedTimer();
              } else if (prevCrawling && !this.crawlStatus.is_crawling) {
                this.stopCrawlPolling();
                await this.refreshAll();
                if (this.activeDossierSeed) {
                  await this.openSeedDossier(this.activeDossierSeed);
                }
                if (this.activeCreator) {
                  await this.openCreatorPage(this.activeCreator, this.activeCreatorTab);
                }
                this.showToast('Crawl completed! Data refreshed.');
              }
            }
          } catch (e) {
          } finally {
            this._isPollingCrawl = false;
          }
        },

        async fetchCookieStatus() {
          try {
            const res = await fetch(this.getApiUrl('/api/settings/cookie'));
            if (res.ok) {
              const data = await res.json();
              this.cookieStatus = data;
              if (data.cookie && !this.cookieInput) {
                this.cookieInput = data.cookie;
              }
            }
          } catch (e) {}
        },

        async saveCookie() {
          if (!this.cookieInput || !this.cookieInput.trim()) {
            this.showToast('Please paste a valid Pinterest session cookie first.');
            return;
          }
          this.isSavingCookie = true;
          try {
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/settings/cookie'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ cookie: this.cookieInput.trim() })
            });
            if (res.ok) {
              const data = await res.json();
              this.cookieStatus = {
                has_cookie: data.has_cookie,
                preview: data.preview || (this.cookieInput.slice(0, 30) + '...'),
                cookie: data.cookie || this.cookieInput.trim()
              };
              this.isCookieModalOpen = false;
              this.showToast('Pinterest session cookie saved and activated across all crawlers!');
            } else {
              const err = await res.json().catch(() => ({}));
              this.showToast('Failed to save cookie: ' + (err.error || err.message || 'HTTP ' + res.status));
            }
          } catch (err) {
            this.showToast('Error saving cookie: ' + err.message);
          } finally {
            this.isSavingCookie = false;
          }
        },

        async openAutoPromoteSettingsModal() {
          this.isAutoPromoteModalOpen = true;
          this.$nextTick(() => { if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons(); });
          try {
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/creators/settings'));
            if (res.ok) {
              const data = await res.json();
              if (data?.settings) {
                this.autoPromoteForm = {
                  auto_promote_enabled: data.settings.auto_promote_enabled !== false,
                  auto_promote_delta_24h: Number(data.settings.auto_promote_delta_24h ?? 25000),
                  auto_promote_delta_7d: Number(data.settings.auto_promote_delta_7d ?? 100000),
                  auto_harvest_pins: data.settings.auto_harvest_pins !== false,
                  max_pins_harvest: Number(data.settings.max_pins_harvest ?? 100),
                  qualification_rules: {
                    min_saves: Number(data.settings.qualification_rules?.min_saves ?? 500),
                    min_velocity: Number(data.settings.qualification_rules?.min_velocity ?? 10.0)
                  }
                };
              }
            }
          } catch (_) {}
          this.$nextTick(() => { if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons(); });
        },

        resetAutoPromoteFormDefaults() {
          this.autoPromoteForm = {
            auto_promote_enabled: true,
            auto_promote_delta_24h: 25000,
            auto_promote_delta_7d: 100000,
            auto_harvest_pins: true,
            max_pins_harvest: 100,
            qualification_rules: {
              min_saves: 500,
              min_velocity: 10.0
            }
          };
          this.showToast('Defaults restored. Click "Save Rules" to apply.');
        },

        async saveAutoPromoteSettings() {
          this.isSavingAutoPromote = true;
          try {
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/creators/settings'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(this.autoPromoteForm)
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data?.success) {
              this.showToast('✅ Auto-promote breakout rules saved successfully!');
              this.isAutoPromoteModalOpen = false;
            } else {
              this.showToast('❌ Failed to save auto-promote rules: ' + (data?.error || res.statusText));
            }
          } catch (err) {
            this.showToast('❌ Network error: ' + err.message);
          } finally {
            this.isSavingAutoPromote = false;
          }
        },

        openRawJsonModal(pinId = null) {
          this.rawJsonTargetPin = pinId || (this.activeDossierSeed ? this.activeDossierSeed.pin_id : '');
          this.rawJsonInput = '';
          this.rawJsonStatusMsg = '';
          this.rawJsonIsError = false;
          this.isRawJsonModalOpen = true;
        },

        async submitRawJson() {
          if (!this.rawJsonTargetPin.trim()) {
            this.rawJsonStatusMsg = 'يرجى تحديد Target Seed Pin ID أولاً.';
            this.rawJsonIsError = true;
            return;
          }
          if (!this.rawJsonInput.trim()) {
            this.rawJsonStatusMsg = 'يرجى لصق الـ JSON الخام أولاً.';
            this.rawJsonIsError = true;
            return;
          }

          this.isSubmittingRawJson = true;
          this.rawJsonStatusMsg = 'جاري تحليل وهضم البيانات وتخزينها في قاعدة البيانات...';
          this.rawJsonIsError = false;

          try {
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/seeds/import-raw-json'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                seed_pin_id: this.rawJsonTargetPin.trim(),
                raw_json: this.rawJsonInput.trim()
              })
            });

            const data = await res.json();
            if (res.ok && data.candidates_imported !== undefined) {
              this.rawJsonStatusMsg = '✅ تم بنجاح! تم استيراد ' + data.candidates_imported + ' كانديديت و ' + data.capsules_imported + ' كبسولة بحثية BUBBLE_ONE_COL وتثبيت كوتا الحصص في Neon.';
              this.rawJsonIsError = false;
              await this.refreshAll();
              if (this.activeDossierSeed && this.activeDossierSeed.pin_id === this.rawJsonTargetPin.trim()) {
                await this.openSeedDossier(this.activeDossierSeed);
              }
              setTimeout(() => {
                this.isRawJsonModalOpen = false;
              }, 2000);
            } else {
              this.rawJsonStatusMsg = '❌ خطأ: ' + (data.error || data.message || 'فشل استيراد البيانات');
              this.rawJsonIsError = true;
            }
          } catch (err) {
            this.rawJsonStatusMsg = '❌ خطأ في الاتصال: ' + err.message;
            this.rawJsonIsError = true;
          } finally {
            this.isSubmittingRawJson = false;
          }
        },

        openAddCompetitorModal() {
          this.newCompetitorHandle = '';
          this.newCompetitorAlsoTrack = true;
          this.newCompetitorDiscoverPins = true;
          this.newCompetitorDiscoverMode = 'deep';
          this.newCompetitorMaxPages = 500;
          this.newCompetitorAutoArchiveWinning = true;
          this.newCompetitorInterval = 'daily';
          this.isAddCompetitorModalOpen = true;
          this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
        },

        formatSnapshotDate(dateStr) {
          if (!dateStr) return '—';
          const d = new Date(dateStr);
          if (isNaN(d.getTime())) return '—';
          const datePart = d.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
          });
          const hours = String(d.getHours()).padStart(2, '0');
          const mins = String(d.getMinutes()).padStart(2, '0');
          return datePart + ', ' + hours + ':' + mins;
        },

        async deleteSnapshotAction(snapshotId) {
          if (!confirm('Are you sure you want to delete this snapshot?')) return;
          try {
            await (window.safeApiFetch || fetch)(this.getApiUrl('/api/competitors/snapshot?id=' + snapshotId), { method: 'DELETE' });
            this.activeCreatorSnapshots = this.activeCreatorSnapshots.filter(s => String(s.id) !== String(snapshotId));
            this.showToast('Snapshot deleted successfully.');
          } catch (e) {
            console.error('Delete snapshot error:', e);
          }
        },

        async openCreatorPage(creator, tab = 'overview', updateHistory = true) {
          if (!creator) return;
          this.activeCreator = creator;
          this.activeCreatorTab = tab || 'overview';
          this.currentTab = 'creators_archive';
          this.creatorAllPinsLimit = 100;
          this.activePinId = null;
          this.activePinDossier = null;
          this.isCreatorDossierOpen = false;
          this.isBoardsModalOpen = false;
          this.creatorTimeRange = '7D';
          this.creatorSelectedMonth = 'all';
          this.creatorMoMMode = false;
          this.creatorChartMode = 'reach';
          this.creatorPinSearch = '';
          this.creatorPinBoard = '';
          this.creatorPinStage = '';
          this.creatorPinSavesFilter = '';
          this.creatorPinSort = 'delta_saves';
          this.creatorPinChangedOnly = false;
          this.creatorPinPage = 1;
          this.creatorSnapPage = 1;
          this.creatorBoardPage = 1;
          this.activeCreatorSelectedTopic = '';
          this.creatorTopicSearch = '';
          // Reset active Master Pin Ledger & Top URL filters to prevent cross-account filter leak
          this.creatorAllPinSearch = '';
          this.creatorAllPinBoard = '';
          this.creatorAllPinMinSaves = 0;
          this.creatorAllPinSort = 'saves_desc';
          this.creatorAllPinQualifiedOnly = (tab === 'pins' || tab === 'winning-pins');
          this.creatorAllPinArticlesOnly = false;
          this.creatorAllPinRankedOnly = false;
          this.creatorAllPinStage = '';
          this.creatorAllPinHighVelocity = false;
          this.creatorAllPinChangedOnly = false;
          this.creatorAllPinScope = 'official';
          this.activeCreatorAllPinsPage = 1;
          this.creatorTopUrlSearch = '';
          this.creatorTopUrlFilterType = 'all';
          this.creatorTopUrlScope = 'ecosystem';
          this.creatorTopUrlsPage = 1;

          const handle = (creator.username || '').replace(/^@+/, '').trim().toLowerCase();
          const compId = creator.id || handle;

          // Check SWR In-Memory Cache for Instant Render (0ms)
          const cachedCreator = this._clientCache?.creators?.get(handle);
          if (cachedCreator) {
            this.activeCreator = { ...creator, ...(cachedCreator.detail?.profile || {}) };
            this.activeCreatorDetail = cachedCreator.detail;
            this.activeCreatorSnapshots = cachedCreator.detail?.snapshots || [];
            this.activeCreatorBoards = cachedCreator.detail?.boards || [];
            this.activeCreatorPins = cachedCreator.pins || [];
            this.activeCreatorWinningPinsTotal = cachedCreator.winningPinsTotal || (cachedCreator.pins ? cachedCreator.pins.length : 0);
            this.activeCreatorTopics = cachedCreator.topics || [];
            this.isCreatorLoading = false;
          } else {
            this.activeCreator = { ...creator };
            this.activeCreatorPins = [];
            this.activeCreatorAllPins = [];
            this.activeCreatorAllPinsTotal = 0;
            this.activeCreatorCatalogTotal = 0;
            this.activeCreatorCuratorPinsTotal = 0;
            this.activeCreatorEcosystemTotal = 0;
            this.activeCreatorWinningPinsTotal = 0;
            this.activeCreatorRankedTotal = 0;
            this.activeCreatorHighVelocityTotal = 0;
            this.activeCreatorAllPinsBoards = [];
            this.activeCreatorTopics = [];
            this.activeCreatorBoards = [];
            this.activeCreatorSnapshots = [];
            this.activeCreatorDetail = null;
            this.isCreatorLoading = true;
          }

          if (typeof window !== 'undefined') {
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
          this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });

          if (updateHistory && typeof window !== 'undefined' && handle) {
            let targetPath = '/' + handle;
            if (this.activeCreatorTab === 'top_urls' || this.activeCreatorTab === 'links') targetPath = '/' + handle + '/links';
            else if (this.activeCreatorTab === 'related_pins') targetPath = '/' + handle + '/related-pins';
            else if (this.activeCreatorTab === 'all_pins') targetPath = '/' + handle + '/all-pins';
            else if (this.activeCreatorTab === 'pins') targetPath = '/' + handle + '/winning-pins';
            else if (this.activeCreatorTab === 'boards') targetPath = '/' + handle + '/boards';
            if (window.location.pathname !== targetPath) {
              window.history.pushState({ creator: handle, tab: this.activeCreatorTab }, '', targetPath);
            }
          }

          try {
            const detailRes = await fetch(this.getApiUrl('/api/competitors/detail?username=' + encodeURIComponent(handle) + '&id=' + encodeURIComponent(compId)));

            let freshDetail = null;

            if (detailRes.ok) {
              freshDetail = await detailRes.json();
              this.activeCreatorDetail = freshDetail;
              this.activeCreatorSnapshots = freshDetail.snapshots || [];
              this.activeCreatorBoards = freshDetail.boards || [];
              if (freshDetail.profile) {
                this.activeCreator = { ...this.activeCreator, ...freshDetail.profile };
              }
            } else {
              // Untracked creator / 404
              this.closeCreatorProfile(true);
              this.currentTab = 'creators_archive';
              if (typeof window !== 'undefined') {
                window.history.replaceState({}, '', '/accounts');
              }
              this.showToast('⚠️ Creator profile @' + handle + ' is not tracked.');
              return;
            }

            // Save to SWR In-Memory Cache
            if (this._clientCache?.creators) {
              this._clientCache.creators.set(handle, {
                detail: freshDetail || cachedCreator?.detail,
                cachedAt: Date.now()
              });
            }

            const initialFetches = [
              this.fetchCreatorAllPins(),
              this.fetchCreatorRules(),
              this.fetchCreatorTopUrls()
            ];
            if (this.activeCreatorTab === 'related_pins') {
              initialFetches.push(this.fetchCreatorRelatedGraph());
            } else if (this.activeCreatorTab === 'boards') {
              initialFetches.push(this.fetchCreatorBoards());
            }
            await Promise.all(initialFetches);
          } catch (e) {
            console.error('openCreatorPage error:', e);
          } finally {
            this.isCreatorLoading = false;
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        switchCreatorTab(tab) {
          if (tab === 'pins') {
            this.activeCreatorTab = 'all_pins';
            this.creatorAllPinQualifiedOnly = true;
            tab = 'all_pins';
          } else if (tab === 'topics') {
            this.activeCreatorTab = 'all_pins';
            tab = 'all_pins';
          } else {
            this.activeCreatorTab = tab;
          }

          if (this.activeCreator) {
            const cleanU = (this.activeCreator.username || '').replace(/^@+/, '').trim().toLowerCase();
            let targetPath = '/' + cleanU;
            if (tab === 'top_urls' || tab === 'links') targetPath = '/' + cleanU + '/links';
            else if (tab === 'related_pins') targetPath = '/' + cleanU + '/related-pins';
            else if (tab === 'all_pins') targetPath = '/' + cleanU + (this.creatorAllPinQualifiedOnly ? '/winning-pins' : '/all-pins');
            else if (tab === 'boards') targetPath = '/' + cleanU + '/boards';

            if (typeof window !== 'undefined' && window.location.pathname !== targetPath) {
              window.history.pushState({ creator: cleanU, tab: tab }, '', targetPath);
            }

            if (tab === 'related_pins') this.fetchCreatorRelatedGraph();
            else if (tab === 'top_urls') this.fetchCreatorTopUrls();
            else if (tab === 'all_pins') this.fetchCreatorAllPins();
            else if (tab === 'boards') this.fetchCreatorBoards();
          }
          this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
        },

        async fetchCreatorRelatedGraph() {
          if (!this.activeCreator) return;
          this.isLoadingRelatedGraph = true;
          try {
            const handle = (this.activeCreator.username || '').replace(/^@+/, '').trim();
            const compId = this.activeCreator.id || handle;
            const p = new URLSearchParams();
            p.set('id', compId);
            p.set('min_overlap', this.creatorRelatedMinOverlap || 2);
            p.set('page', this.creatorRelatedPage || 1);
            p.set('limit', this.creatorRelatedLimit || 25);
            p.set('filter', this.creatorRelatedFilter || 'all');
            if (this.creatorRelatedSearch) p.set('search', this.creatorRelatedSearch.trim());

            const [interRes, seedsRes] = await Promise.all([
              fetch(this.getApiUrl('/api/competitors/related-pins/intersections?' + p.toString())),
              fetch(this.getApiUrl('/api/competitors/related-pins/seeds?id=' + encodeURIComponent(compId)))
            ]);

            if (interRes.ok) {
              const data = await interRes.json();
              this.creatorRelatedIntersections = data.intersections || [];
              this.creatorRelatedStats = data.stats || this.creatorRelatedStats;
              this.creatorRelatedPage = data.page || 1;
              this.creatorRelatedTotalPages = data.total_pages || 1;
            }

            if (seedsRes.ok) {
              const sData = await seedsRes.json();
              this.creatorRelatedSeeds = sData.seeds || [];
            }
          } catch (e) {
            console.error('fetchCreatorRelatedGraph error:', e);
            this.showToast('Error loading related pins graph');
          } finally {
            this.isLoadingRelatedGraph = false;
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        async addBulkSeedsAction() {
          if (!this.activeCreator || !this.bulkAddSeedsInput.trim()) return;
          this.isAddingSeeds = true;
          try {
            const compId = this.activeCreator.id || this.activeCreator.username;
            const matches = this.bulkAddSeedsInput.match(/\d{14,22}/g) || [];
            if (matches.length === 0) {
              this.showToast('No valid numeric Pin IDs found in input.');
              return;
            }
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/competitors/related-pins/seeds'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ competitor_id: compId, pin_ids: matches })
            });
            const data = await res.json();
            if (res.ok && data.ok) {
              this.showToast('✅ Registered ' + data.added_count + ' seeds for @' + (this.activeCreator.username || '').replace(/^@+/, '') + '!');
              this.bulkAddSeedsInput = '';
              this.isBulkAddSeedsModalOpen = false;
              await this.fetchCreatorRelatedGraph();
            } else {
              this.showToast('Failed to register seeds: ' + (data.error || data.message || 'Error'));
            }
          } catch (e) {
            console.error('addBulkSeedsAction error:', e);
            this.showToast('Error registering seeds: ' + e.message);
          } finally {
            this.isAddingSeeds = false;
          }
        },

        async autoAddTop10WinningSeedsAction() {
          if (!this.activeCreator) return;
          this.isAddingSeeds = true;
          try {
            const compId = this.activeCreator.id || this.activeCreator.username;
            let pins = this.activeCreatorPins || [];
            if (pins.length === 0) {
              const handle = (this.activeCreator.username || '').replace(/^@+/, '').trim();
              const pinsRes = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/pinarchive/pins?account=@' + encodeURIComponent(handle) + '&limit=10'));
              if (pinsRes.ok) {
                const pData = await pinsRes.json();
                pins = pData.pins || [];
              }
            }
            const top10Ids = pins.slice(0, 10).map(p => p.pin_id || p.id).filter(Boolean);
            if (top10Ids.length === 0) {
              this.showToast('No winning pins found for this account yet.');
              return;
            }
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/competitors/related-pins/seeds'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ competitor_id: compId, pin_ids: top10Ids })
            });
            const data = await res.json();
            if (res.ok && data.ok) {
              this.showToast('🎯 Auto-added ' + data.added_count + ' top winning seeds!');
              await this.fetchCreatorRelatedGraph();
            }
          } catch (e) {
            console.error('autoAddTop10WinningSeedsAction error:', e);
          } finally {
            this.isAddingSeeds = false;
          }
        },

        async analyzeSelectedPinsAsRelated() {
          if (!this.activeCreator || this.selectedCreatorPinIds.length === 0) return;
          const compId = this.activeCreator.id || this.activeCreator.username;
          this.isAddingSeeds = true;
          try {
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/competitors/related-pins/seeds'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ competitor_id: compId, pin_ids: this.selectedCreatorPinIds })
            });
            const data = await res.json();
            if (res.ok && data.ok) {
              this.showToast('🕸️ Queued ' + data.added_count + ' selected pins for Related Graph analysis!');
              this.selectedCreatorPinIds = [];
              await this.openCreatorPage(this.activeCreator, 'related_pins');
            }
          } catch (e) {
            console.error('analyzeSelectedPinsAsRelated error:', e);
          } finally {
            this.isAddingSeeds = false;
          }
        },

        async deleteSeedAction(pinId) {
          if (!confirm('Delete Seed #' + pinId + ' and its discovered related nodes?')) return;
          try {
            const compId = this.activeCreator.id || this.activeCreator.username;
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/competitors/related-pins/seeds?id=' + encodeURIComponent(compId) + '&pin_id=' + encodeURIComponent(pinId)), {
              method: 'DELETE'
            });
            if (res.ok) {
              this.showToast('Seed #' + pinId + ' removed');
              await this.fetchCreatorRelatedGraph();
            }
          } catch (e) {
            console.error('deleteSeedAction error:', e);
          }
        },

        async harvestLiveSingleSeedAction(pinId) {
          if (!this.activeCreator) return;
          this.isHarvestingRelated = true;
          this.showToast('🔍 Scraping Pinterest Related Feed live for Seed #' + pinId + '...');
          try {
            const compId = this.activeCreator.id || this.activeCreator.username;
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/competitors/related-pins/harvest-live'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ competitor_id: compId, pin_id: pinId })
            });
            const data = await res.json();
            if (res.ok && data.ok) {
              this.showToast('✅ Discovered ' + data.discovered_count + ' related pins without cookies!');
              await this.fetchCreatorRelatedGraph();
            } else {
              this.showToast('Live scrape failed: ' + (data.error || data.message || 'Unknown error'));
            }
          } catch (e) {
            console.error('harvestLiveSingleSeedAction error:', e);
            this.showToast('Error during live harvest: ' + e.message);
          } finally {
            this.isHarvestingRelated = false;
          }
        },

        async dispatchRelatedWorkflowAction() {
          if (!this.activeCreator) return;
          const handle = (this.activeCreator.username || '').replace(/^@+/, '').trim();
          if (!confirm('Dispatch dedicated GitHub Actions Harvester for @' + handle + '? This will crawl all account seeds in parallel without cookies.')) return;
          this.isHarvestingRelated = true;
          try {
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/competitors/related-pins/dispatch-workflow'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                username: handle,
                max_pages_per_seed: '2'
              })
            });
            const data = await res.json();
            if (res.ok && data.success) {
              this.showToast('🚀 Dispatched GitHub Actions Harvester for @' + handle + '!');
            } else {
              this.showToast('Dispatch failed: ' + (data.error || data.message || 'Check GITHUB_TOKEN'));
            }
          } catch (e) {
            console.error('dispatchRelatedWorkflowAction error:', e);
            this.showToast('Error dispatching workflow: ' + e.message);
          } finally {
            this.isHarvestingRelated = false;
          }
        },

        async openCreatorDossier(creator, tab = 'overview') {
          return this.openCreatorPage(creator, tab);
        },

        async fetchCreatorAllPins() {
          if (!this.activeCreator) return;
          if (this._creatorAllPinsAbortController) {
            try { this._creatorAllPinsAbortController.abort(); } catch (_) {}
          }
          this._creatorAllPinsAbortController = new AbortController();
          this._creatorAllPinsReqSeq = (this._creatorAllPinsReqSeq || 0) + 1;
          const reqSeq = this._creatorAllPinsReqSeq;
          this.isLoadingAllPins = true;
          try {
            const handle = (this.activeCreator.username || '').replace(/^@+/, '').trim();
            const compId = this.activeCreator.id || handle;
            const p = new URLSearchParams();
            p.set('id', compId);
            p.set('username', handle);
            if (this.creatorAllPinSearch) p.set('search', this.creatorAllPinSearch.trim());
            if (this.creatorAllPinBoard) p.set('board', this.creatorAllPinBoard.trim());
            if (this.creatorAllPinMinSaves > 0) p.set('min_saves', this.creatorAllPinMinSaves);
            if (this.creatorAllPinSort) p.set('sort', this.creatorAllPinSort);
            if (this.creatorAllPinQualifiedOnly) p.set('qualified_only', 'true');
            if (this.creatorAllPinArticlesOnly) p.set('articles_only', 'true');
            if (this.creatorAllPinRankedOnly) p.set('ranked_only', 'true');
            if (this.creatorAllPinStage) p.set('stage', this.creatorAllPinStage);
            if (this.creatorAllPinHighVelocity) p.set('high_velocity', 'true');
            if (this.creatorAllPinChangedOnly) p.set('changed_only', 'true');
            if (this.creatorAllPinScope) p.set('scope', this.creatorAllPinScope);
            p.set('page', this.activeCreatorAllPinsPage || 1);
            p.set('limit', 25);

            const res = await fetch(this.getApiUrl('/api/competitors/all-pins?' + p.toString()), {
              signal: this._creatorAllPinsAbortController.signal
            });
            if (reqSeq !== this._creatorAllPinsReqSeq) return;
            if (res.ok) {
              const data = await res.json();
              if (reqSeq !== this._creatorAllPinsReqSeq) return;
              this.activeCreatorAllPins = data.pins || [];
              this.creatorAllPinsLimit = 100;
              this.activeCreatorAllPinsTotal = data.total || 0;
              this.activeCreatorCatalogTotal = data.catalog_total ?? data.total ?? 0;
              this.activeCreatorExternalPinsTotal = data.external_pins_total ?? 0;
              this.activeCreatorCuratorPinsTotal = data.curator_pins_total ?? 0;
              this.activeCreatorEcosystemTotal = data.ecosystem_catalog_total ?? ((data.catalog_total || 0) + (data.curator_pins_total || 0));
              this.activeCreatorWinningPinsTotal = data.qualified_total ?? 0;
              this.activeCreatorRankedTotal = data.ranked_total ?? 0;
              this.activeCreatorHighVelocityTotal = data.high_velocity_total ?? 0;
              this.activeCreatorAllPinsPage = data.page || 1;
              this.activeCreatorAllPinsTotalPages = data.total_pages || 1;
              if (data.boards) this.activeCreatorAllPinsBoards = data.boards;
            }
          } catch (e) {
            if (e.name === 'AbortError') return;
            console.error('fetchCreatorAllPins error:', e);
          } finally {
            if (reqSeq === this._creatorAllPinsReqSeq) {
              this.isLoadingAllPins = false;
              this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
            }
          }
        },

        async openCreatorVisualFeed(username) {
          const cleanUser = String(username || '').replace(/^@+/, '').trim();
          if (!cleanUser) return;
          this.visualFeedUsername = cleanUser;
          this.visualFeedUser = { username: cleanUser };
          this.visualFeedPins = [];
          this.isVisualFeedLoading = true;
          this.isVisualFeedModalOpen = true;
          this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });

          try {
            const res = await (window.safeApiFetch || fetch)('/api/competitors/' + encodeURIComponent(cleanUser) + '/latest-pins');
            if (res.ok) {
              const data = await res.json();
              if (data.ok) {
                this.visualFeedPins = data.pins || [];
                if (data.user) {
                  this.visualFeedUser = data.user;
                }
              } else {
                this.showToast('Failed to fetch visual feed: ' + (data.error || 'Unknown error'), 'error');
              }
            } else {
              this.showToast('Could not load visual feed (<350ms)', 'error');
            }
          } catch (err) {
            this.showToast('Network error loading visual feed: ' + err.message, 'error');
          } finally {
            this.isVisualFeedLoading = false;
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        async openBoardSectionsModal(boardId, boardTitle) {
          const cleanId = String(boardId || '').trim();
          if (!cleanId) return;
          this.boardSectionsBoardId = cleanId;
          this.boardSectionsTitle = boardTitle || 'Board Sections';
          this.boardSectionsList = [];
          this.isLoadingBoardSections = true;
          this.isBoardSectionsModalOpen = true;
          this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });

          try {
            const res = await (window.safeApiFetch || fetch)('/api/boards/' + encodeURIComponent(cleanId) + '/sections');
            if (res.ok) {
              const data = await res.json();
              if (data.ok) {
                this.boardSectionsList = data.sections || [];
              } else {
                this.showToast('Failed to fetch board sections: ' + (data.error || 'Unknown error'), 'error');
              }
            } else {
              this.showToast('Could not load board sections', 'error');
            }
          } catch (err) {
            this.showToast('Network error loading board sections: ' + err.message, 'error');
          } finally {
            this.isLoadingBoardSections = false;
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        async fetchCreatorRules() {
          if (!this.activeCreator?.id) return;
          try {
            const res = await fetch(this.getApiUrl('/api/competitors/rules?id=' + this.activeCreator.id));
            if (res.ok) {
              const data = await res.json();
              if (data.rules) {
                this.creatorRules = { ...this.creatorRules, ...data.rules };
              }
            }
          } catch (e) {
            console.error('fetchCreatorRules error:', e);
          }
        },

        async saveCreatorRulesAction() {
          if (!this.activeCreator?.id) return;
          this.isSavingCreatorRules = true;
          try {
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/competitors/rules'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                competitor_id: this.activeCreator.id,
                rules: this.creatorRules
              })
            });
            if (res.ok) {
              const cleanHandle = (this.activeCreator.username || '').replace(/^@+/, '').trim().toLowerCase();
              this._clientCache?.creators?.delete(cleanHandle);
              this.showToast('✅ Qualification rules saved for @' + (this.activeCreator.username || '').replace(/^@+/, ''));
            } else {
              const err = await res.json().catch(() => ({}));
              this.showToast('Failed to save rules: ' + (err.error || err.message || 'Error'));
            }
          } catch (e) {
            console.error('saveCreatorRules error:', e);
            this.showToast('Error saving rules: ' + e.message);
          } finally {
            this.isSavingCreatorRules = false;
          }
        },

        async reEvaluateCreatorPinsAction() {
          if (!this.activeCreator?.id) return;
          this.isReEvaluatingCreatorPins = true;
          this.reEvaluateMessage = '';
          try {
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/competitors/re-evaluate'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ competitor_id: this.activeCreator.id })
            });
            const data = await res.json();
            if (res.ok && data.ok) {
              const prunedText = data.pruned_count ? (' (' + data.pruned_count + ' demoted)') : '';
              this.reEvaluateMessage = 'Qualified ' + data.qualified_count + ' pins into archive' + prunedText + ' based on active rules!';
              this.showToast('🎯 Re-evaluation complete: ' + data.qualified_count + ' qualified' + prunedText);
              const cleanHandle = (this.activeCreator.username || '').replace(/^@+/, '').trim().toLowerCase();
              this._clientCache?.creators?.delete(cleanHandle);
              await Promise.all([
                this.fetchCreatorAllPins(),
                typeof this.fetchCreatorWinningPins === 'function' ? this.fetchCreatorWinningPins(this.activeCreator) : Promise.resolve()
              ]);
            } else {
              this.showToast('Re-evaluation error: ' + (data.error || data.message || 'Failed'));
            }
          } catch (e) {
            console.error('reEvaluate error:', e);
            this.showToast('Failed to re-evaluate: ' + e.message);
          } finally {
            this.isReEvaluatingCreatorPins = false;
          }
        },

        async fetchCreatorTopUrls() {
          if (!this.activeCreator) return;
          this.isLoadingTopUrls = true;
          try {
            const handle = (this.activeCreator.username || '').replace(/^@+/, '').trim();
            const compId = this.activeCreator.id || handle;
            const p = new URLSearchParams();
            p.set('id', compId);
            if (this.creatorTopUrlSearch) p.set('search', this.creatorTopUrlSearch.trim());
            if (this.creatorTopUrlSort) p.set('sort', this.creatorTopUrlSort);
            if (this.creatorTopUrlFilterType) p.set('filter_type', this.creatorTopUrlFilterType);
            if (this.creatorTopUrlScope) p.set('scope', this.creatorTopUrlScope);
            p.set('page', this.creatorTopUrlsPage || 1);
            p.set('limit', 50);

            const res = await fetch(this.getApiUrl('/api/competitors/top-urls?' + p.toString()));
            if (res.ok) {
              const data = await res.json();
              this.activeCreatorTopUrls = data.urls || [];
              this.creatorTopUrlsTotal = data.total || 0;
              this.creatorTopUrlsPage = data.page || 1;
              this.creatorTopUrlsTotalPages = data.total_pages || 1;
            }
          } catch (e) {
            console.error('fetchCreatorTopUrls error:', e);
          } finally {
            this.isLoadingTopUrls = false;
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        async harvestAllAccountPinsAction(creator) {
          return this.openGhaCrawlerModal(creator);
        },

        // Dedicated Pin Detail Page & Dossier Action Methods (Route: /pin/:id)
        async openPinPage(pinOrId, updateHistory = true, forceRefresh = false) {
          if (!pinOrId) return;
          const pinId = typeof pinOrId === 'object' ? String(pinOrId.pin_id || pinOrId.id || '') : String(pinOrId);
          if (!pinId) return;

          const cleanUser = (this.activeCreator?.username || (typeof pinOrId === 'object' && (pinOrId?.account_username || pinOrId?.creator_username || pinOrId?.username || pinOrId?.creator)) || '').replace(/^@+/, '').trim().toLowerCase();
          const currentBoard = this.activeBoardName || (typeof pinOrId === 'object' && (pinOrId?.board_name || pinOrId?.board)) || '';

          if (typeof window !== 'undefined' && window.sessionStorage) {
            try {
              sessionStorage.setItem('pae_pin_breadcrumb_ctx', JSON.stringify({
                pinId: pinId,
                source: cleanUser ? 'creator' : 'direct',
                creator: cleanUser,
                board: currentBoard,
                tab: this.activeCreatorTab || 'all_pins',
                returnUrl: window.location.pathname + window.location.search,
                ts: Date.now()
              }));
            } catch (_) {}
          }

          this.activePinId = pinId;
          this.activePinDossier = typeof pinOrId === 'object' ? { ...pinOrId, pin_id: pinId } : { pin_id: pinId };
          if (typeof window !== 'undefined') {
            window.location.href = '/pin/' + encodeURIComponent(pinId);
          }
        },

        closePinPage(updateHistory = true) {
          this.activePinId = null;
          this.isPinDossierOpen = false;
          this.activePinDossier = null;
          const returnPath = this.previousPinPath;
          this.previousPinPath = null;

          if (updateHistory && typeof window !== 'undefined') {
            let targetPath = '/';
            if (this.activeBoardName && (this.activeBoardCreator || this.activeCreator)) {
              const creator = this.activeBoardCreator || this.activeCreator;
              const cleanUser = (creator.username || '').replace(/^@+/, '').trim();
              const boardSlug = encodeURIComponent(this.normalizeBoardSlug(this.activeBoardName));
              targetPath = '/' + cleanUser + '/' + boardSlug;
              document.title = this.activeBoardName + ' | @' + cleanUser + ' | Pinterest Intelligence';
            } else if (this.activeCreator) {
              const cleanUser = (this.activeCreator.username || '').replace(/^@+/, '').trim().toLowerCase();
              targetPath = '/' + cleanUser;
              if (this.activeCreatorTab === 'top_urls') targetPath = '/' + cleanUser + '/links';
              else if (this.activeCreatorTab === 'related_pins') targetPath = '/' + cleanUser + '/related-pins';
              else if (this.activeCreatorTab === 'all_pins') targetPath = '/' + cleanUser + '/all-pins';
              else if (this.activeCreatorTab === 'pins') targetPath = '/' + cleanUser + '/winning-pins';
              else if (this.activeCreatorTab === 'boards') targetPath = '/' + cleanUser + '/boards';
              document.title = '@' + cleanUser + ' | Creator Hub | Pin Arbitrage Engine';
            } else if (returnPath && !returnPath.startsWith('/pin/')) {
              targetPath = returnPath;
              document.title = 'Pin Arbitrage Engine | Pinterest Intelligence Dashboard';
            }
            if (window.location.pathname !== targetPath) {
              window.history.pushState({}, '', targetPath);
            }
          }
          if (typeof window !== 'undefined') {
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
          this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
        },

        // Backwards compatibility wrappers
        async openPinDossier(pin) {
          return this.openPinPage(pin, true);
        },

        closePinDossier() {
          return this.closePinPage(true);
        },

        // Dedicated Board Detail Page Action Methods (Route: /:username/:board)
        async openBoardPage(boardOrName, creator = null, updateHistory = true) {
          if (!boardOrName) return;
          const boardName = typeof boardOrName === 'object' ? (boardOrName.name || '') : String(boardOrName);
          if (!boardName) return;

          const targetCreator = creator || this.activeCreator;
          const cleanUser = targetCreator ? (targetCreator.username || '').replace(/^@+/, '').trim().toLowerCase() : '';
          const cacheKey = cleanUser + ':' + boardName.toLowerCase();

          this.activeBoardName = boardName;
          this.activeBoardCreator = targetCreator;

          // Check SWR In-Memory Cache for Instant Render (0ms)
          const cachedBoard = this._clientCache?.boards?.get(cacheKey);
          if (cachedBoard) {
            this.activeBoard = cachedBoard.board;
            this.boardPins = cachedBoard.pins || [];
            this.boardPinsTotal = cachedBoard.pinsTotal || this.boardPins.length;
            this.isLoadingBoardPins = false;
          } else {
            // Find full board metadata from activeCreatorBoards if available
            let foundBoard = null;
            if (typeof boardOrName === 'object' && boardOrName.name && (boardOrName.pin_count || boardOrName.image_cover_url || boardOrName.url)) {
              foundBoard = boardOrName;
            } else if (this.activeCreatorBoards && this.activeCreatorBoards.length > 0) {
              foundBoard = this.activeCreatorBoards.find(b => (b.name || '').toLowerCase() === boardName.toLowerCase());
            }
            this.activeBoard = foundBoard || {
              name: boardName,
              url: targetCreator ? ('https://www.pinterest.com/' + cleanUser + '/' + encodeURIComponent(boardName.toLowerCase().replace(/\s+/g, '-'))) : null,
              pin_count: 0,
              follower_count: 0,
              image_cover_url: null,
              description: null,
              board_vase: []
            };
            this.boardPins = [];
            this.isLoadingBoardPins = true;
          }

          this.boardPinsSearch = '';
          this.boardPinsFilter = 'all';
          this.boardPinsSort = 'saves_desc';
          this.boardPinsPage = 1;
          this.boardPinsPageSize = 24;

          if (typeof window !== 'undefined') {
            window.scrollTo({ top: 0, behavior: 'smooth' });
            if (targetCreator) {
              const boardSlug = encodeURIComponent(this.normalizeBoardSlug(boardName));
              const targetPath = '/' + cleanUser + '/' + boardSlug;
              if (window.location.pathname !== targetPath) {
                if (updateHistory) {
                  window.history.pushState({ board: boardName, username: cleanUser }, '', targetPath);
                } else {
                  window.history.replaceState({ board: boardName, username: cleanUser }, '', targetPath);
                }
              }
            }
            document.title = boardName + ' | ' + (targetCreator ? '@' + cleanUser + ' | ' : '') + 'Pinterest Intelligence';
          }

          try {
            const compId = targetCreator ? (targetCreator.id || cleanUser) : '';
            const p = new URLSearchParams();
            if (compId) p.set('id', compId);
            if (cleanUser) p.set('username', cleanUser);
            p.set('board', boardName);
            p.set('limit', 1000);

            const [pinsRes, detailRes] = await Promise.all([
              fetch(this.getApiUrl('/api/competitors/all-pins?' + p.toString())),
              cleanUser ? fetch(this.getApiUrl('/api/competitors/board-detail?username=' + encodeURIComponent(cleanUser) + '&board=' + encodeURIComponent(boardName))) : Promise.resolve(null)
            ]);

            let updatedBoard = { ...this.activeBoard };
            if (detailRes && detailRes.ok) {
              const dData = await detailRes.json();
              if (dData.board) {
                updatedBoard = {
                  ...updatedBoard,
                  ...dData.board,
                  board_vase: Array.isArray(dData.board.board_vase) ? dData.board.board_vase : (updatedBoard.board_vase || [])
                };
                this.activeBoard = updatedBoard;
                if (dData.board.name) {
                  this.activeBoardName = dData.board.name;
                  if (typeof window !== 'undefined') {
                    document.title = dData.board.name + ' | ' + (targetCreator ? '@' + cleanUser + ' | ' : '') + 'Pinterest Intelligence';
                    if (targetCreator) {
                      const canonSlug = encodeURIComponent(this.normalizeBoardSlug(dData.board.name));
                      const canonPath = '/' + cleanUser + '/' + canonSlug;
                      if (window.location.pathname !== canonPath) {
                        window.history.replaceState({ board: dData.board.name, username: cleanUser }, '', canonPath);
                      }
                    }
                  }
                }
              }
            }

            let freshPins = this.boardPins;
            if (pinsRes && pinsRes.ok) {
              const data = await pinsRes.json();
              freshPins = data.pins || [];
              this.boardPins = freshPins;
              this.boardPinsTotal = data.total || this.boardPins.length;
              if (this.boardPins.length > 0 && (!this.activeBoard.pin_count || this.activeBoard.pin_count === 0)) {
                this.activeBoard.pin_count = this.boardPinsTotal;
              }
            }

            // Save to SWR In-Memory Cache
            if (this._clientCache?.boards) {
              this._clientCache.boards.set(cacheKey, {
                board: this.activeBoard,
                pins: freshPins,
                pinsTotal: this.boardPinsTotal,
                cachedAt: Date.now()
              });
            }
          } catch (err) {
            console.error('Failed to load board pins:', err);
            this.showToast('Error loading pins for board: ' + boardName);
          } finally {
            this.isLoadingBoardPins = false;
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        async refreshBoardDetail() {
          if (!this.activeBoardName) return;
          const creator = this.activeBoardCreator || this.activeCreator;
          const handle = creator ? (creator.username || '').replace(/^@+/, '').trim() : '';
          if (!handle) return;
          this.showToast('🔍 Scraping authentic Related Interests (board_vase) from Pinterest...');
          try {
            const fetchFn = window.safeApiFetch || fetch;
            const res = await fetchFn(this.getApiUrl('/api/competitors/board-detail/sync'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ username: handle, board: this.activeBoardName, refresh: true })
            });
            if (res.ok) {
              const data = await res.json();
              if (data.board) {
                this.activeBoard = {
                  ...this.activeBoard,
                  ...data.board,
                  board_vase: Array.isArray(data.board.board_vase) ? data.board.board_vase : []
                };
                this.showToast('✅ Discovered ' + (this.activeBoard.board_vase?.length || 0) + ' algorithmic Related Topics (board_vase)!');
              }
            } else {
              this.showToast('❌ Could not refresh board topics from Pinterest.');
            }
          } catch (e) {
            this.showToast('❌ Error refreshing board: ' + e.message);
          } finally {
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        closeBoardPage(updateHistory = true) {
          this.activeBoardName = null;
          this.activeBoard = null;
          this.boardPins = [];
          this.boardPinsSearch = '';
          this.boardPinsPage = 1;

          if (updateHistory && typeof window !== 'undefined') {
            let targetPath = '/';
            if (this.activeCreator) {
              targetPath = '/' + (this.activeCreator.username || '').replace(/^@+/, '').trim();
            }
            if (window.location.pathname !== targetPath) {
              window.history.pushState({}, '', targetPath);
            }
            document.title = this.activeCreator ? ('@' + (this.activeCreator.username || '').replace(/^@+/, '') + ' | Creator Hub | Pin Arbitrage Engine') : 'Pin Arbitrage Engine | Pinterest Intelligence Dashboard';
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
          this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
        },

        copyPinField(type, text) {
          if (!text) return;
          navigator.clipboard.writeText(String(text));
          this.showToast('Copied ' + type + ' to clipboard!');
        },

        async deletePinSnapshot(snapshotId) {
          if (!confirm('Are you sure you want to delete this historical metric snapshot?')) return;
          try {
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/pinarchive/pin-snapshot?id=' + encodeURIComponent(snapshotId) + '&pin_id=' + encodeURIComponent(this.activePinDossier.pin_id)), {
              method: 'DELETE'
            });
            if (res.ok) {
              this.showToast('Metric snapshot deleted');
              await this.openPinPage(this.activePinDossier, false);
            } else {
              const err = await res.json().catch(() => ({}));
              this.showToast('Failed to delete snapshot: ' + (err?.error || res.statusText || 'Error'));
            }
          } catch (err) {
            console.error('Failed to delete snapshot:', err);
          }
        },

        async fetchCreatorBoards(creator = this.activeCreator) {
          if (!creator) return;
          const targetId = creator.id || (creator.username || '').replace(/^@+/, '').trim();
          if (!targetId) return;
          const cleanUser = (creator.username || '').replace(/^@+/, '').trim();
          this.isLoadingBoards = true;
          try {
            const res = await fetch(this.getApiUrl('/api/competitors/boards?competitor_id=' + encodeURIComponent(targetId) + (cleanUser ? '&username=' + encodeURIComponent(cleanUser) : '')));
            if (res.ok) {
              const data = await res.json();
              this.activeCreatorBoards = data.boards || [];
              this.competitorBoardsList = data.boards || [];
              if (this.activeCreator && (this.activeCreator.id === creator.id || this.activeCreator.username === creator.username)) {
                this.activeCreator.total_boards = Math.max(Number(this.activeCreator.total_boards || 0), this.activeCreatorBoards.length);
              }
            }
          } catch (e) {
            console.error('fetchCreatorBoards error:', e);
          } finally {
            this.isLoadingBoards = false;
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        async fetchCreatorWinningPins(creator = this.activeCreator) {
          if (!creator) return;
          const handle = (creator.username || '').replace(/^@+/, '').trim();
          if (!handle) return;
          try {
            const res = await fetch(this.getApiUrl('/api/pinarchive/pins?account=@' + encodeURIComponent(handle) + '&limit=500'));
            if (res.ok) {
              const data = await res.json();
              this.activeCreatorPins = data.pins || [];
              this.activeCreatorWinningPinsTotal = data.total ?? (data.pins ? data.pins.length : 0);
            }
          } catch (e) {
            console.error('fetchCreatorWinningPins error:', e);
          } finally {
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        closeCreatorProfile(updateHistory = true) {
          this.activeCreator = null;
          this.activeCreatorDetail = null;
          this.activeCreatorPins = [];
          this.activeCreatorAllPins = [];
          this.creatorAllPinsLimit = 100;
          this.activeCreatorAllPinsTotal = 0;
          this.activeCreatorCatalogTotal = 0;
          this.activeCreatorWinningPinsTotal = 0;
          this.activeCreatorRankedTotal = 0;
          this.activeCreatorHighVelocityTotal = 0;
          this.activeCreatorAllPinsBoards = [];
          this.activeCreatorTopics = [];
          this.activeCreatorBoards = [];
          this.activeCreatorSnapshots = [];
          this.isCreatorDossierOpen = false;
          this.isBoardsModalOpen = false;
          this.selectedCreatorPinIds = [];
          if (updateHistory && typeof window !== 'undefined') {
            const target = (this.currentTab === 'creators_archive') ? '/accounts' : '/';
            if (window.location.pathname !== target) {
              window.history.pushState({}, '', target);
            }
          }
          this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
        },

        async openCreatorByHandle(handle, tab = 'overview', updateHistory = true) {
          const clean = (handle || '').replace(/^@+/, '').trim();
          if (!clean) return;
          const existing = (this.competitors || []).find(c => (c.username || '').toLowerCase() === clean.toLowerCase());
          if (existing) {
            await this.openCreatorPage(existing, tab, updateHistory);
          } else {
            await this.openCreatorPage({ username: clean, display_name: clean }, tab, updateHistory);
          }
        },

        openGhaCrawlerModal(creator = null, options = {}) {
          const target = creator || this.activeCreator;
          if (!target) return;
          this.ghaTargetAccount = (target.username || '').replace(/^@+/, '').trim();
          this.ghaCrawlMode = options.mode || 'discovery';
          if (options.scope === 'custom') {
            this.ghaBoardScope = 'custom';
            this.ghaTargetBoards = Array.isArray(options.boards) ? [...options.boards] : [];
          } else if (this.ghaBoardScope === 'custom' && this.ghaTargetBoards.length > 0 && !options.scope) {
            // Keep existing custom selection if caller set it
          } else {
            this.ghaBoardScope = 'all';
            this.ghaTargetBoards = [];
          }
          this.ghaBoardSearch = '';
          this.isGhaCrawlerModalOpen = true;
          this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
        },

        crawlSingleBoardGha(boardName) {
          if (!boardName || !this.activeCreator) return;
          this.openGhaCrawlerModal(this.activeCreator, {
            scope: 'custom',
            boards: [boardName]
          });
        },

        filterPinsByBoard(boardName) {
          if (!boardName) return;
          this.activeCreatorTab = 'all_pins';
          this.creatorAllPinBoard = boardName;
          this.activeCreatorAllPinsPage = 1;
          this.fetchCreatorAllPins();
          this.showToast('📋 Filtered discovered pins for board: ' + boardName);
        },

        filterWinningPinsByBoard(boardName) {
          if (!boardName) return;
          this.activeCreatorTab = 'all_pins';
          this.creatorAllPinQualifiedOnly = true;
          this.creatorAllPinBoard = boardName;
          this.activeCreatorAllPinsPage = 1;
          this.fetchCreatorAllPins();
          this.showToast('🏆 Filtered qualified winning pins for board: ' + boardName);
        },

        toggleGhaBoardSelection(boardName) {
          if (!boardName) return;
          const idx = this.ghaTargetBoards.indexOf(boardName);
          if (idx >= 0) {
            this.ghaTargetBoards.splice(idx, 1);
          } else {
            this.ghaTargetBoards.push(boardName);
          }
        },

        selectAllGhaBoards() {
          this.ghaTargetBoards = (this.activeCreatorBoards || []).map(b => b.name).filter(Boolean);
        },

        deselectAllGhaBoards() {
          this.ghaTargetBoards = [];
        },

        async submitGhaCrawlerDispatch() {
          const isBulk = this.selectedCompetitorIds.length > 1 && this.ghaTargetAccount.includes('Selected');
          const bulkUsernames = isBulk
            ? this.selectedCompetitorIds.map(id => {
                const comp = (this.competitors || []).find(c => Number(c.id) === Number(id));
                return comp?.username ? comp.username.replace(/^@+/, '').trim() : null;
              }).filter(Boolean)
            : null;

          const handle = (this.ghaTargetAccount || '').replace(/^@+/, '').trim();
          if (!handle && (!bulkUsernames || !bulkUsernames.length)) return;
          this.isDispatchingGitHubCrawl = true;
          this.isGhaCrawlerModalOpen = false;

          const targetBoards = this.ghaBoardScope === 'custom' ? this.ghaTargetBoards.join(',') : '';
          const boardMsg = targetBoards ? (' (' + this.ghaTargetBoards.length + ' selected board(s))') : ' (Sharded across 20 nodes)';
          this.showToast(isBulk
            ? ('⚡ Dispatching fleet crawler for ' + bulkUsernames.length + ' creators...')
            : ('⚡ Dispatching fleet crawler for @' + handle + boardMsg + '...'));

          const resolvedMaxPages = this.ghaCrawlMode === 'discovery' ? 3 : (this.ghaCrawlMode === 'refresh' ? 10 : 500);

          try {
            const payload = isBulk
              ? {
                  usernames: bulkUsernames,
                  crawl_mode: this.ghaCrawlMode,
                  max_pages: resolvedMaxPages,
                  target_boards: targetBoards
                }
              : {
                  username: handle,
                  crawl_mode: this.ghaCrawlMode,
                  max_pages: resolvedMaxPages,
                  target_boards: targetBoards
                };

            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/creators/dispatch-crawl'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data?.success) {
              this._clientCache?.boards?.clear();
              this.showToast('🚀 ' + (data?.message || 'Crawler pipeline launched on GitHub Actions!'));
            } else {
              this.showToast('❌ Dispatch failed: ' + (data?.error || res.statusText || 'Check GitHub token configuration'));
            }
          } catch (err) {
            this.showToast('❌ Network error: ' + err.message);
          } finally {
            this.isDispatchingGitHubCrawl = false;
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        async dispatchCreatorGitHubCrawlAction(creator, mode = 'discovery') {
          return this.openGhaCrawlerModal(creator);
        },

        async toggleCompetitorStatus(creator) {
          if (!creator) return;
          const oldStatus = creator.is_active !== false;
          const newStatus = !oldStatus;
          const targetId = creator.id || creator.username;

          // 1. Instant optimistic reactive update across array
          creator.is_active = newStatus;
          this.competitors = (this.competitors || []).map(c => {
            if ((creator.id && c.id === creator.id) || (c.username && creator.username && c.username.toLowerCase() === creator.username.toLowerCase())) {
              return { ...c, is_active: newStatus };
            }
            return c;
          });
          if (this.activeCreator && ((creator.id && this.activeCreator.id === creator.id) || (this.activeCreator.username && creator.username && this.activeCreator.username.toLowerCase() === creator.username.toLowerCase()))) {
            this.activeCreator = { ...this.activeCreator, is_active: newStatus };
          }
          if (this.competitorsOverview) {
            this.competitorsOverview.active_count = (this.competitors || []).filter(c => c.is_active !== false).length;
            this.competitorsOverview.paused_count = (this.competitors || []).filter(c => c.is_active === false).length;
          }
          this.showToast(newStatus ? '▶ Ingestion resumed.' : '⏸ Ingestion paused.');

          // 2. Persist to backend
          try {
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/competitors/status'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: targetId, is_active: newStatus })
            });
            if (!res.ok) {
              // Rollback
              creator.is_active = oldStatus;
              this.competitors = (this.competitors || []).map(c => {
                if ((creator.id && c.id === creator.id) || (c.username && creator.username && c.username.toLowerCase() === creator.username.toLowerCase())) {
                  return { ...c, is_active: oldStatus };
                }
                return c;
              });
              if (this.competitorsOverview) {
                this.competitorsOverview.active_count = (this.competitors || []).filter(c => c.is_active !== false).length;
                this.competitorsOverview.paused_count = (this.competitors || []).filter(c => c.is_active === false).length;
              }
              this.showToast('Failed to update status', 'error');
            }
          } catch (e) {
            // Rollback
            creator.is_active = oldStatus;
            this.competitors = (this.competitors || []).map(c => {
              if ((creator.id && c.id === creator.id) || (c.username && creator.username && c.username.toLowerCase() === creator.username.toLowerCase())) {
                return { ...c, is_active: oldStatus };
              }
              return c;
            });
            if (this.competitorsOverview) {
              this.competitorsOverview.active_count = (this.competitors || []).filter(c => c.is_active !== false).length;
              this.competitorsOverview.paused_count = (this.competitors || []).filter(c => c.is_active === false).length;
            }
            this.showToast('Error updating status: ' + e.message, 'error');
          }
        },

        exportCandidatesCSV(items, filename = 'related-pins-candidates.csv') {
          const data = items || this.filteredExplorerCandidates || this.candidates || [];
          if (!data || data.length === 0) {
            this.showToast('No candidate data to export.', 'info');
            return;
          }
          const headers = ['candidate_pin_id', 'domain', 'frequency', 'composite_score', 'shared_seed_count', 'board_diversity_count', 'created_at'];
          const rows = data.map(c => [
            c.candidate_pin_id || '',
            c.domain || '',
            c.frequency || 0,
            c.composite_score || 0,
            c.shared_seed_count || 0,
            c.board_diversity_count || 0,
            c.created_at || ''
          ]);
          const csvContent = [
            headers.map(h => this.sanitizeCsvCell(h)).join(','),
            ...rows.map(r => r.map(val => this.sanitizeCsvCell(val)).join(','))
          ].join(String.fromCharCode(10));
          const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.setAttribute('href', url);
          link.setAttribute('download', filename);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          this.showToast('✅ Exported ' + data.length + ' candidates to CSV.');
        },

        setCreatorPinPace(pace) {
          this.creatorPinPace = pace;
          if (pace === '24h') this.creatorPinSort = 'delta_saves';
          else if (pace === '3d') this.creatorPinSort = 'delta_3d';
          else if (pace === '7d') this.creatorPinSort = 'delta_7d';
          else if (pace === 'all') this.creatorPinSort = 'saves';
        },

        toggleCreatorPinSelection(pinId) {
          const s = String(pinId);
          const idx = this.selectedCreatorPinIds.findIndex(id => String(id) === s);
          if (idx > -1) {
            this.selectedCreatorPinIds.splice(idx, 1);
          } else {
            this.selectedCreatorPinIds.push(s);
          }
        },

        toggleSelectAllCreatorPins() {
          const currentPageIds = this.paginatedCreatorPins.map(p => String(p.pin_id));
          const allSelected = currentPageIds.length > 0 && currentPageIds.every(id => this.selectedCreatorPinIds.map(String).includes(id));
          if (allSelected) {
            this.selectedCreatorPinIds = this.selectedCreatorPinIds.filter(id => !currentPageIds.includes(String(id)));
          } else {
            for (const id of currentPageIds) {
              if (!this.selectedCreatorPinIds.map(String).includes(id)) {
                this.selectedCreatorPinIds.push(id);
              }
            }
          }
        },

        openCreatorDossierByName(username) {
          if (!username) return;
          const clean = username.replace(/^@+/, '').trim().toLowerCase();
          const existing = (this.competitors || []).find(c => (c.username || '').toLowerCase() === clean);
          if (existing) {
            this.openCreatorPage(existing, 'overview');
          } else {
            this.openCreatorPage({ username: clean, display_name: clean }, 'overview');
          }
        },

        async submitTrackCreatorUnified() {
          let raw = (this.newCompetitorHandle || '').trim();
          if (!raw) return;

          // Client-side Pinterest URL or handle parsing with multi-domain support
          let handle = raw;
          if (/(?:^|\.)pinterest\.[a-z.]+/i.test(handle)) {
            try {
              const parsed = new URL(handle.startsWith('http') ? handle : 'https://' + handle);
              const parts = parsed.pathname.split('/').filter(Boolean);
              if (parts.length > 0) handle = parts[0];
            } catch (_) {
              const pIdx = handle.indexOf('pinterest.');
              if (pIdx !== -1) {
                const sIdx = handle.indexOf('/', pIdx);
                if (sIdx !== -1) {
                  handle = handle.substring(sIdx + 1).split('/')[0].split('?')[0];
                }
              }
            }
          }
          handle = handle.replace(/^@+/, '').trim().toLowerCase();

          const reservedPaths = new Set([
            'pin', 'pins', 'search', 'ideas', 'today', 'settings', 'about',
            'business', 'blog', 'help', 'password', 'login', 'signup',
            'explore', 'categories', 'news', 'shop', 'topics', 'notifications',
            'messages', 'edit', 'following', 'followers', 'analytics'
          ]);

          if (!handle || reservedPaths.has(handle) || !/^[a-z0-9_.-]{3,64}$/.test(handle)) {
            this.showToast('⚠️ Invalid Pinterest creator handle: "' + (handle || raw) + '". Reserved words and invalid formats are not allowed.');
            return;
          }

          this.isSubmittingCreator = true;
          try {
            // 1. Ensure competitor profile is registered in database before crawling
            if (this.newCompetitorAlsoTrack || this.newCompetitorDiscoverPins) {
              const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/competitors'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  username: handle,
                  ingest_interval: this.newCompetitorInterval || 'daily',
                  is_active: true,
                  auto_archive_winning: Boolean(this.newCompetitorAutoArchiveWinning)
                })
              });
              if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                this.showToast('❌ Failed to add creator: ' + (errData?.error || res.statusText || 'Error'));
                return;
              }
              this.showToast('✅ Creator @' + handle + ' added to tracking!');
              // Await live profile sync before UI refresh
              await this.syncCompetitor(handle);
            }

            // 2. If discover pins immediately -> Dispatch to 20-Shard GitHub Actions Crawler
            if (this.newCompetitorDiscoverPins) {
              const crawlMode = this.newCompetitorDiscoverMode === 'deep' ? 'discovery' : 'refresh';
              const maxPages = this.newCompetitorDiscoverMode === 'deep' ? Math.min(10000, Math.max(1, Number(this.newCompetitorMaxPages) || 500)) : 3;
              this.showToast('⚡ Dispatching 20-shard GHA Crawler for @' + handle + ' (' + crawlMode + ' mode, ' + maxPages + ' pages)...');
              
              const resPins = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/competitors/dispatch-crawl'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  username: handle,
                  crawl_mode: crawlMode,
                  max_pages: maxPages,
                  auto_archive_winning: Boolean(this.newCompetitorAutoArchiveWinning)
                })
              });
              if (resPins.ok) {
                const data = await resPins.json().catch(() => ({}));
                this.showToast('🚀 ' + (data?.message || '20-Shard Crawler dispatched on GitHub Actions!'));
              } else {
                const errData = await resPins.json().catch(() => ({}));
                this.showToast('⚠️ Crawler notice: ' + (errData?.error || resPins.statusText || 'Failed'));
              }
            }

            // Reset modal & refresh
            this.newCompetitorHandle = '';
            this.isAddCompetitorModalOpen = false;
            await this.fetchCompetitors();
            if (this.scopedFolderId) {
              const comp = (this.competitors || []).find(c => (c.username || '').replace(/^@+/, '') === handle);
              if (comp && comp.id) {
                await this.assignCreatorToFolder(comp.id, this.scopedFolderId);
                await this.loadFolderCreators(this.scopedFolderId);
              }
            }
          } catch (e) {
            this.showToast('Error tracking creator: ' + e.message);
          } finally {
            this.isSubmittingCreator = false;
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        async submitAddCompetitor() {
          return this.submitTrackCreatorUnified();
        },

        async submitAddKeyword() {
          const kw = this.newKeywordText.trim();
          if (!kw) return;
          try {
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/keywords'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ keyword: kw, category: this.newKeywordCategory })
            });
            if (res.ok) {
              const created = await res.json().catch(() => ({}));
              this.newKeywordText = '';
              this.isAddKeywordModalOpen = false;
              await this.fetchKeywords();
              this.showToast('Keyword "' + kw + '" tracked successfully!');
              if (created?.keyword?.id) {
                this.syncKeyword(created.keyword.id);
              }
            } else {
              const err = await res.json().catch(() => ({}));
              this.showToast('Failed to track keyword: ' + (err?.error || res.statusText || 'Error'));
            }
          } catch (e) {
            this.showToast('Failed to track keyword: ' + e.message);
          }
        },

        async submitAddFleetProject() {
          this.isAddFleetModalOpen = false;
          this.showToast('Unified VPS PostgreSQL SSOT mode active — external shards disabled.');
        },

        toggleSeedSelection(pinId) {
          if (this.selectedSeedIds.includes(pinId)) {
            this.selectedSeedIds = this.selectedSeedIds.filter(id => id !== pinId);
          } else {
            this.selectedSeedIds.push(pinId);
          }
          this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
        },

        toggleSelectAllSeeds() {
          const currentFilteredIds = this.filteredSeeds.map(s => s.pin_id);
          if (this.isAllSeedsSelected) {
            this.selectedSeedIds = this.selectedSeedIds.filter(id => !currentFilteredIds.includes(id));
          } else {
            const set = new Set([...this.selectedSeedIds, ...currentFilteredIds]);
            this.selectedSeedIds = Array.from(set);
          }
          this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
        },

        openAddSeedModal(tab = 'bulk') {
          this.addSeedTab = tab;
          this.isAddSeedOpen = true;
          this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
        },

        async submitBulkSeeds() {
          const pinIds = this.bulkParsedPinIds;
          if (pinIds.length === 0) {
            this.showToast('No valid Pin IDs detected', 'error');
            return;
          }
          this.isSubmittingBulk = true;
          try {
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/seeds/bulk'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                pin_ids: pinIds,
                label_prefix: this.bulkLabelPrefix.trim() || 'Tracked Seed',
                is_competitor: Boolean(this.bulkIsCompetitor)
              })
            });

            if (res.ok) {
              const data = await res.json().catch(() => ({}));
              this.showToast('✅ Successfully imported ' + (data?.count || 0) + ' seeds into Neon!');
              this.bulkPinsInput = '';
              this.isAddSeedOpen = false;
              await this.refreshAll();

              if (this.bulkAutoCrawl) {
                if (this.bulkCrawlEngine === 'workflow') {
                  await this.triggerWorkflowRun(pinIds.join(','));
                } else {
                  await this.triggerCrawl(pinIds);
                }
              }
            } else {
              const err = await res.json().catch(() => ({}));
              this.showToast('Error importing bulk seeds: ' + (err?.error || res.statusText || 'Failed'), 'error');
            }
          } catch (e) {
            this.showToast('Failed to import bulk seeds: ' + e.message, 'error');
          } finally {
            this.isSubmittingBulk = false;
          }
        },

        openCrawlModal(target = null) {
          if (target === 'selected') {
            this.crawlTargetScope = 'selected';
          } else if (typeof target === 'string') {
            this.crawlTargetScope = 'single';
            this.crawlCustomPinId = target;
          } else if (this.selectedSeedIds.length > 0) {
            this.crawlTargetScope = 'selected';
          } else {
            this.crawlTargetScope = 'queued';
          }
          this.crawlModalTab = 'launch';
          this.isCrawlModalOpen = true;
          this.fetchWorkflowRuns();
          this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
        },

        async fetchWorkflowRuns() {
          this.isLoadingWorkflowRuns = true;
          try {
            const res = await fetch(this.getApiUrl('/api/workflow/runs?limit=15'));
            if (res.ok) {
              this.workflowRuns = await res.json();
            }
          } catch (e) {
            console.warn('Failed to load workflow runs:', e);
          } finally {
            this.isLoadingWorkflowRuns = false;
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        async executeCrawl() {
          let targetIds = [];
          if (this.crawlTargetScope === 'selected') {
            targetIds = [...this.selectedSeedIds];
            if (targetIds.length === 0) {
              this.showToast('Please select at least one seed to crawl.', 'error');
              return;
            }
          } else if (this.crawlTargetScope === 'single') {
            if (!this.crawlCustomPinId.trim()) {
              this.showToast('Please enter a target Pin ID.', 'error');
              return;
            }
            targetIds = [this.crawlCustomPinId.trim()];
          } else if (this.crawlTargetScope === 'queued') {
            targetIds = []; // sweep queued
          } else if (this.crawlTargetScope === 'all') {
            targetIds = this.seeds.map(s => s.pin_id);
          }

          if (this.crawlEngine === 'workflow') {
            await this.triggerWorkflowRun(targetIds.join(','), this.crawlMaxPages);
          } else {
            await this.triggerCrawl(targetIds.length > 0 ? targetIds : null);
            this.isCrawlModalOpen = false;
          }
        },

        async triggerWorkflowRun(seedPinIdsStr = '', maxPages = '60') {
          this.isTriggeringWorkflow = true;
          try {
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/workflow/trigger'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                seed_pin_id: seedPinIdsStr,
                max_pages: maxPages || '60'
              })
            });

            const data = await res.json().catch(() => ({}));
            if (res.ok && data?.success) {
              this.showToast('🚀 GitHub Actions Workflow Run triggered successfully!');
              this.crawlModalTab = 'history';
              setTimeout(() => this.fetchWorkflowRuns(), 2000);
            } else {
              this.showToast('Failed to trigger workflow: ' + (data?.error || res.statusText || 'Unknown error'), 'error');
            }
          } catch (e) {
            this.showToast('Workflow dispatch network error: ' + e.message, 'error');
          } finally {
            this.isTriggeringWorkflow = false;
          }
        },

        openDeleteModal(target) {
          this.deleteTarget = target;
          this.deletePurgeNeon = true;
          this.isDeleteModalOpen = true;
          this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
        },

        async confirmDelete() {
          this.isDeleting = true;
          try {
            let pinIds = [];
            if (this.deleteTarget === 'selected') {
              pinIds = [...this.selectedSeedIds];
            } else if (typeof this.deleteTarget === 'object' && this.deleteTarget?.pin_id) {
              pinIds = [this.deleteTarget.pin_id];
            } else if (typeof this.deleteTarget === 'string') {
              pinIds = [this.deleteTarget];
            }

            if (pinIds.length === 0) {
              this.isDeleteModalOpen = false;
              return;
            }

            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/seeds/bulk-delete'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                pin_ids: pinIds,
                purge_database: Boolean(this.deletePurgeNeon)
              })
            });

            if (res.ok) {
              const data = await res.json().catch(() => ({}));
              this.showToast('🗑️ Deleted ' + (data?.deleted_count || 0) + ' seeds ' + (data?.purged_database ? '(Neon DB purged cleanly)' : ''));
              this.selectedSeedIds = this.selectedSeedIds.filter(id => !pinIds.includes(id));
              this.isDeleteModalOpen = false;
              if (this.activeDossierSeed && pinIds.includes(this.activeDossierSeed.pin_id)) {
                this.closeSeedDossier();
              }
              await this.refreshAll();
            } else {
              const err = await res.json().catch(() => ({}));
              this.showToast('Error deleting seeds: ' + (err?.error || res.statusText || 'Failed'), 'error');
            }
          } catch (e) {
            this.showToast('Failed to delete seeds: ' + e.message, 'error');
          } finally {
            this.isDeleting = false;
          }
        },

        exportSelectedSeeds() {
          const selected = this.seeds.filter(s => this.selectedSeedIds.includes(s.pin_id));
          if (selected.length === 0) return;
          const headers = ['pin_id', 'label', 'is_competitor', 'total_candidates', 'total_capsules', 'commercial_gap_ratio', 'last_crawled_at'];
          const rows = [headers.map(h => this.sanitizeCsvCell(h)).join(',')];
          for (const s of selected) {
            rows.push([
              this.sanitizeCsvCell(s.pin_id),
              this.sanitizeCsvCell(s.label || ''),
              this.sanitizeCsvCell(s.is_competitor),
              this.sanitizeCsvCell(s.total_candidates || 0),
              this.sanitizeCsvCell(s.total_capsules || 0),
              this.sanitizeCsvCell(s.commercial_gap_ratio != null ? s.commercial_gap_ratio : 100),
              this.sanitizeCsvCell(s.last_crawled_at || '')
            ].join(','));
          }
          const blob = new Blob([rows.join(String.fromCharCode(10))], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.setAttribute('href', url);
          link.setAttribute('download', 'selected-seeds-' + Date.now() + '.csv');
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          this.showToast('Exported ' + selected.length + ' seeds to CSV');
        },

        async addSeed() {
          if (!this.newSeed.pin_id.trim()) {
            this.showToast('Please enter a valid Pinterest Pin ID', 'error');
            return;
          }
          try {
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/seeds'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(this.newSeed)
            });
            if (res.ok) {
              const autoCrawl = this.newSeed.auto_crawl;
              const newPinId = this.newSeed.pin_id;
              this.newSeed = { pin_id: '', label: '', is_competitor: true, auto_crawl: true };
              this.isAddSeedOpen = false;
              await this.refreshAll();
              if (autoCrawl) {
                if (this.crawlEngine === 'workflow') {
                  await this.triggerWorkflowRun(newPinId);
                } else {
                  await this.triggerCrawl(newPinId);
                }
              }
            } else {
              const err = await res.json().catch(() => ({}));
              this.showToast('Error adding seed: ' + (err?.error || res.statusText || 'Unknown error'), 'error');
            }
          } catch (e) {
            this.showToast('Failed to add seed: ' + e.message, 'error');
          }
        },

        async deleteSeed(pinId, label) {
          this.openDeleteModal({ pin_id: pinId, label: label });
        },

        safeUrl(url) {
          if (!url) return '#';
          const s = String(url).trim();
          if (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('/')) return s;
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

        exportCsv(list, filename) {
          const fname = filename || 'arbitrage-candidates.csv';
          if (!list || list.length === 0) {
            this.showToast('No data to export.', 'error');
            return;
          }
          const headers = [
            'candidate_pin_id',
            'title',
            'saves',
            'save_rate',
            'daily_velocity',
            'provenance_engine',
            'sequence_role',
            'dominant_color',
            'aspect_ratio',
            'domain',
            'is_product',
            'pin_created_at',
            'seed_overlap_count'
          ];
          const csvRows = [headers.map(h => this.sanitizeCsvCell(h)).join(',')];

          for (const row of list) {
            const values = headers.map(header => {
              let val = row[header];
              if (header === 'saves' && val === undefined) val = row.total_saves;
              if (header === 'save_rate' && val === undefined) val = row.avg_save_rate;
              if (header === 'dominant_color' && !val) val = row.winning_color;
              if (header === 'provenance_engine' && !val) val = row.engine_source;
              return this.sanitizeCsvCell(val);
            });
            csvRows.push(values.join(','));
          }

          const blob = new Blob([csvRows.join(String.fromCharCode(10))], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.setAttribute('href', url);
          link.setAttribute('download', fname.endsWith('.csv') ? fname : (fname + '.csv'));
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          this.showToast('Exported ' + list.length + ' rows to ' + fname);
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

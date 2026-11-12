/**
 * Keywords Client Application Script (Alpine.js keywordStudio)
 */
export function getKeywordsClientAppScript() {
  return `  <script>
    function keywordStudio() {
      const initialFolderId = (typeof window !== 'undefined' && window.__INITIAL_FOLDER_ID__) ? String(window.__INITIAL_FOLDER_ID__) : '';
      return {
        viewModeLevel: (typeof window !== 'undefined' && window.__INITIAL_KEYWORD_SLUG__ && window.__INITIAL_KEYWORD_SLUG__.trim()) ? 'serp_studio' : 'dashboard',
        activeFolderId: initialFolderId,
        activeFolder: null,
        darkMode: typeof localStorage !== 'undefined' ? localStorage.getItem('pa_theme') !== 'light' : true,
        isDark: typeof localStorage !== 'undefined' ? localStorage.getItem('pa_theme') !== 'light' : true,
        applyTheme() {
          if (this.darkMode || this.isDark) {
            document.documentElement.classList.add('dark');
          } else {
            document.documentElement.classList.remove('dark');
          }
          this.$nextTick(() => {
            if (window.lucide) window.lucide.createIcons();
          });
        },
        toggleTheme() {
          this.darkMode = !this.darkMode;
          this.isDark = this.darkMode;
          try {
            if (typeof localStorage !== 'undefined') {
              localStorage.setItem('pa_theme', this.darkMode ? 'dark' : 'light');
              localStorage.setItem('pin_theme', this.darkMode ? 'dark' : 'light');
            }
          } catch (_) {}
          this.applyTheme();
        },
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
          this.$nextTick(() => {
            if (window.lucide) window.lucide.createIcons();
          });
        },
        keywords: [],
        selectedKeyword: null,
        selectedKeywordDetails: null,
        activeKeywordQuery: '',
        isDetailsLoading: false,
        isWorkflowDispatching: false,
        syncingKeywordId: null,

        // Interactive 20-Runner Swarm Fleet Dispatch Modal State
        isFleetDispatchModalOpen: false,
        fleetDispatchTargetKeyword: '',
        fleetDispatchHarvestSerp: true,
        fleetDispatchScope: 'all_pins',
        fleetDispatchMaxPins: 50,

        // Level 1A Dashboard State & Bulk Selection
        selectedKeywordIds: [],
        dashboardSearch: '',
        dashboardCategoryFilter: 'ALL',
        dashboardStatusFilter: 'ALL',
        dashboardFolderFilter: initialFolderId || 'ALL',
        dashboardGrowthFilter: 'ALL',
        dashboardPinsFilter: 'ALL',
        dashboardSort: 'total_pins',
        dashboardViewMode: 'table', // 'table' | 'grid'
        dashboardPage: 1,
        dashboardPageSize: 10,
        isBulkFolderModalOpen: false,
        bulkTargetFolderId: '',
        isBulkLoading: false,
        isKeywordsLoading: false,
        isQuickTrackModalOpen: false,
        quickKeywordInput: '',
        quickKeywordCategory: 'General',

        // Table Column Visibility State & Definitions
        columnDefinitions: [
          { key: 'preview', label: 'Preview Image', required: false },
          { key: 'keyword', label: 'Keyword & Folders', required: true },
          { key: 'total_pins', label: 'SERP Breakdown', required: false },
          { key: 'status', label: 'Status', required: false },
          { key: 'created_at', label: 'Date Added', required: false },
          { key: 'last_crawled', label: 'Last Crawled', required: false },
          { key: 'actions', label: 'Actions', required: false }
        ],
        visibleColumns: {
          preview: true,
          keyword: true,
          total_pins: true,
          status: true,
          created_at: true,
          last_crawled: true,
          actions: true
        },

        // Dual-Scope Switcher State (Active SERP Top 100 vs All Vault Pins)
        serpScope: 'active', // 'active' | 'vault'

        // Pin Detail Slide-Over Inspector State (PinClicks Parity)
        isPinDrawerOpen: false,
        activeInspectorPin: null,
        activeInspectorPinIndex: 0,

        // Growth Pace & View Mode Toggle (Image 1 Parity)
        growthPaceFilter: '24h', // '24h' | '3d' | '7d' | 'all'
        viewMode: 'table', // 'table' | 'cards'
        selectedPinIds: [],
        pinPage: 1,
        pinPageSize: 50, // 25 | 50 | 100 | 'all'

        // Displaced Pins Vault State (Phase 3 & 4)
        displacedPins: [],
        displacedPinsTotal: 0,
        displacedOffset: 0,
        displacedStatusFilter: 'ALL',
        isDisplacedLoading: false,
        isLoadingMoreDisplaced: false,
        displacedPage: 1,
        displacedPageSize: 25,

        // Pin Deep Dossier & Performance Trajectory State (Image 2 Parity)
        dossierData: null,
        isDossierLoading: false,
        trajectoryRange: '30d', // '7d' | '14d' | '30d' | 'all'
        trajectoryData: null,
        isTrajectoryLoading: false,

        // Pinterest Trends 52-Week Parity State
        trendsData: null,
        isTrendsLoading: false,

        // Concurrency & Race-Condition Hardening (Inspector & Details)
        detailRequestId: 0,
        detailAbortController: null,
        activePinRequestId: 0,
        pinInspectorAbortController: null,

        // Omnibar State
        omnibarQuery: '',
        typeaheadSuggestions: [],
        isTypeaheadLoading: false,
        isOmnibarDropdownOpen: false,

        // Visual Similarity Lens State (v3_visual_search)
        isVisualLensModalOpen: false,
        isVisualLensLoading: false,
        visualLensPin: null,
        visualLensResults: [],
        visualLensError: null,

        // Engine & Crawl Depth Settings State
        isSettingsModalOpen: false,
        settingsTargetKeyword: null,
        settingsCrawlPages: 2,
        settingsMaxPins: 50,
        settingsMaxSerpPins: 50,
        settingsMaxCatalogInspect: 0,
        settingsEnableSerpHarvest: true,
        settingsCrawlScope: 'all_pins',
        settingsInspectionMode: 'full_catalog',
        settingsExcludePromoted: true,
        settingsExcludeBoardsAndSuggestions: true,
        settingsExcludeIgnoredPins: true,
        settingsMaxPinAgeDays: 30,
        settingsMinVelocity: 1.5,
        settingsPinterestCookie: '',
        isSavingPinterestCookie: false,
        settingsApplyGlobal: true,
        settingsLoading: false,
        appSettings: {
          default_crawl_pages: 2,
          default_max_pins: 50,
          max_serp_pins: 50,
          max_catalog_inspect: 0,
          enable_serp_harvest: true,
          default_crawl_scope: 'all_pins',
          default_inspection_mode: 'full_catalog',
          exclude_promoted: true,
          exclude_boards_and_suggestions: true,
          exclude_ignored_pins: true,
          breakout_max_pin_age_days: 30,
          breakout_min_velocity: 1.5,
          pinterest_cookie: ''
        },

        // UI Tabs & State
        activeTab: 'serp',
        popularPinsView: 'full',
        selectedProjectId: '',
        fleetProjects: [],
        toast: { show: false, message: '', type: 'info' },

        // Campaign Folders & Crossover Engine State
        folders: [],
        crossoverData: null,
        isCrossoverLoading: false,
        currentKeywordFolders: [],
        isFolderManagerOpen: false,
        isCreateFolderModalOpen: false,
        isAddKeywordsModalOpen: false,
        newFolder: { name: '', description: '', color: '#ec4899' },
        folderKeywordSearch: '',
        selectedFolderKeywordIds: [],

        // Pin Table Filter & Sort Controls
        intelScope: 'all',
        activeVisualTagFilter: '',
        activeDomainFilter: '',
        cachedTagFreqMap: null,
        cachedCoreAnchorsSet: null,
        cachedCombinedPins: null,
        cachedDisplacedVaultPins: null,
        pinSearch: '',
        formatFilter: 'ALL',
        pinSort: 'rank',
        expandedPinTags: {},

        // Visual Anchors & Signals Suite (PinClicks Intelligence)
        anchorsView: 'cloud', // 'cloud' | 'cards' | 'table'
        anchorsLimit: 24,
        anchorsSearch: '',
        anchorsTier: 'all', // 'all' | 'high' | 'core'
        anchorsPage: 1,
        anchorsPageSize: 20,

        // Domain Authority Table Controls
        domainSearch: '',
        domainPage: 1,
        domainPageSize: 15,

        // [INVARIANT: DEFENSIVE-PIN-DOSSIER-URL]
        // Generates safe, breadcrumb-rich URLs to Level 3 Pin Dossier (/pins/:pin_id).
        // Defensively resolves keyword and campaign folder context without throwing ReferenceErrors on undeclared state.
        getPinDossierUrl(pin) {
          if (!pin || !pin.pin_id) return '#';
          const kw = this.selectedKeyword;
          const folderId = this.activeFolder?.id || (this.dashboardFolderFilter && this.dashboardFolderFilter !== 'ALL' && this.dashboardFolderFilter !== 'UNASSIGNED' ? this.dashboardFolderFilter : null);
          const params = new URLSearchParams();
          if (kw?.id) params.set('keyword_id', String(kw.id));
          if (kw?.keyword) params.set('keyword', kw.keyword);
          if (folderId) params.set('folder_id', String(folderId));
          const qs = params.toString();
          return '/pins/' + encodeURIComponent(pin.pin_id) + (qs ? '?' + qs : '');
        },

        togglePinTags(pinId) {
          this.expandedPinTags = {
            ...this.expandedPinTags,
            [pinId]: !this.expandedPinTags[pinId]
          };
          this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
        },

        isPinTagsExpanded(pinId) {
          return Boolean(this.expandedPinTags[pinId]);
        },

        openQuickTrackModal() {
          this.quickKeywordInput = '';
          this.quickKeywordCategory = 'General';
          this.isQuickTrackModalOpen = true;
          this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
        },

        async quickTrackKeyword(term) {
          this.quickKeywordInput = term;
          await this.submitQuickKeyword();
        },

        async submitQuickKeyword() {
          const term = (this.quickKeywordInput || '').trim();
          if (!term) return;
          this.isQuickTrackModalOpen = false;
          this.showToast('Loading "' + term + '" into SERP Studio...', 'info');
          await this.loadKeywordBySlugOrText(term, true, true);
        },

        get activeSlug() {
          const raw = this.selectedKeyword?.keyword || this.activeKeywordQuery || '';
          return raw.trim().toLowerCase().replace(/\\s+/g, '-');
        },

        get omnibarTrackedMatches() {
          if (!this.omnibarQuery.trim()) return [];
          const q = this.omnibarQuery.toLowerCase().trim();
          return (this.keywords || []).filter(k => (k?.keyword || '').toLowerCase().includes(q)).slice(0, 5);
        },

        get selectableKeywordsForFolder() {
          if (!this.folderKeywordSearch || !this.folderKeywordSearch.trim()) return this.keywords;
          const q = this.folderKeywordSearch.toLowerCase().trim();
          return this.keywords.filter(k => (k.keyword || '').toLowerCase().includes(q) || (k.category || '').toLowerCase().includes(q));
        },

        get filteredDashboardKeywords() {
          let list = this.keywords || [];
          if (this.dashboardStatusFilter === 'ACTIVE') {
            list = list.filter(k => k.is_active !== false);
          } else if (this.dashboardStatusFilter === 'PAUSED') {
            list = list.filter(k => k.is_active === false);
          }
          if (this.dashboardCategoryFilter && this.dashboardCategoryFilter !== 'ALL') {
            const cat = this.dashboardCategoryFilter.toLowerCase();
            list = list.filter(k => (k.category || 'General').toLowerCase() === cat);
          }
          if (this.activeFolderId) {
            const fid = String(this.activeFolderId);
            list = list.filter(k => this.getKeywordFolders(k).some(f => f && String(f.id) === fid));
          } else if (this.dashboardFolderFilter && this.dashboardFolderFilter !== 'ALL') {
            if (this.dashboardFolderFilter === 'UNASSIGNED') {
              list = list.filter(k => this.getKeywordFolders(k).length === 0);
            } else {
              const targetFid = String(this.dashboardFolderFilter);
              list = list.filter(k => this.getKeywordFolders(k).some(f => f && String(f.id) === targetFid));
            }
          }
          if (this.dashboardGrowthFilter && this.dashboardGrowthFilter !== 'ALL') {
            if (this.dashboardGrowthFilter === 'HIGH') {
              list = list.filter(k => (k._velocity !== undefined ? k._velocity : this.getKeywordVelocity(k)) >= 50);
            } else if (this.dashboardGrowthFilter === 'TRENDING') {
              list = list.filter(k => {
                const v = k._velocity !== undefined ? k._velocity : this.getKeywordVelocity(k);
                return v >= 10 && v < 50;
              });
            } else if (this.dashboardGrowthFilter === 'POSITIVE') {
              list = list.filter(k => (k._velocity !== undefined ? k._velocity : this.getKeywordVelocity(k)) > 0);
            } else if (this.dashboardGrowthFilter === 'FLAT') {
              list = list.filter(k => (k._velocity !== undefined ? k._velocity : this.getKeywordVelocity(k)) === 0);
            } else if (this.dashboardGrowthFilter === 'DECLINING') {
              list = list.filter(k => (k._velocity !== undefined ? k._velocity : this.getKeywordVelocity(k)) < 0);
            }
          }
          if (this.dashboardPinsFilter && this.dashboardPinsFilter !== 'ALL') {
            if (this.dashboardPinsFilter === '250_PLUS') {
              list = list.filter(k => (k._totalPins !== undefined ? k._totalPins : this.getKeywordTotalPins(k)) >= 250);
            } else if (this.dashboardPinsFilter === 'UNDER_250') {
              list = list.filter(k => (k._totalPins !== undefined ? k._totalPins : this.getKeywordTotalPins(k)) < 250);
            }
          }
          if (this.dashboardSearch && this.dashboardSearch.trim()) {
            const q = this.dashboardSearch.toLowerCase().trim();
            list = list.filter(k => k._searchCorpus ? k._searchCorpus.includes(q) : (
              (k.keyword || '').toLowerCase().includes(q) ||
              (k.category || '').toLowerCase().includes(q) ||
              this.getKeywordFolders(k).some(f => (f.name || '').toLowerCase().includes(q))
            ));
          }
          if (this.dashboardSort === 'velocity') {
            return [...list].sort((a, b) => (b._velocity ?? this.getKeywordVelocity(b)) - (a._velocity ?? this.getKeywordVelocity(a)));
          } else if (this.dashboardSort === 'saves_delta') {
            return [...list].sort((a, b) => (b._saveDelta ?? this.getKeywordSaveDelta(b)) - (a._saveDelta ?? this.getKeywordSaveDelta(a)));
          } else if (this.dashboardSort === 'repins_delta') {
            return [...list].sort((a, b) => (b._repinDelta ?? this.getKeywordRepinDelta(b)) - (a._repinDelta ?? this.getKeywordRepinDelta(a)));
          } else if (this.dashboardSort === 'total_pins') {
            return [...list].sort((a, b) => (b._totalPins ?? this.getKeywordTotalPins(b)) - (a._totalPins ?? this.getKeywordTotalPins(a)));
          } else if (this.dashboardSort === 'created_desc') {
            return [...list].sort((a, b) => (b._createdAtMs ?? (Date.parse(b.created_at) || 0)) - (a._createdAtMs ?? (Date.parse(a.created_at) || 0)));
          } else if (this.dashboardSort === 'created_asc') {
            return [...list].sort((a, b) => (a._createdAtMs ?? (Date.parse(a.created_at) || 0)) - (b._createdAtMs ?? (Date.parse(b.created_at) || 0)));
          } else if (this.dashboardSort === 'name') {
            return [...list].sort((a, b) => (a.keyword || '').localeCompare(b.keyword || ''));
          } else if (this.dashboardSort === 'crawled') {
            return [...list].sort((a, b) => (b._crawledAtMs ?? (Date.parse(b.last_crawled_at) || 0)) - (a._crawledAtMs ?? (Date.parse(a.last_crawled_at) || 0)));
          }
          return list;
        },

        get paginatedDashboardKeywords() {
          if (this.dashboardPageSize === 'all') return this.filteredDashboardKeywords;
          const size = Number(this.dashboardPageSize || 10);
          const totalPages = this.dashboardTotalPages;
          const safePage = Math.min(Math.max(1, Number(this.dashboardPage) || 1), totalPages);
          const start = Math.max(0, (safePage - 1) * size);
          return this.filteredDashboardKeywords.slice(start, start + size);
        },

        get dashboardTotalPages() {
          if (this.dashboardPageSize === 'all') return 1;
          const size = Number(this.dashboardPageSize || 10);
          return Math.ceil(this.filteredDashboardKeywords.length / size) || 1;
        },

        get dashboardRangeStart() {
          const total = this.filteredDashboardKeywords.length;
          if (total === 0) return 0;
          if (this.dashboardPageSize === 'all') return 1;
          const size = Number(this.dashboardPageSize || 10);
          const safePage = Math.min(Math.max(1, Number(this.dashboardPage) || 1), this.dashboardTotalPages);
          return ((safePage - 1) * size) + 1;
        },

        get dashboardRangeEnd() {
          const total = this.filteredDashboardKeywords.length;
          if (total === 0) return 0;
          if (this.dashboardPageSize === 'all') return total;
          const size = Number(this.dashboardPageSize || 10);
          const safePage = Math.min(Math.max(1, Number(this.dashboardPage) || 1), this.dashboardTotalPages);
          return Math.min(safePage * size, total);
        },

        get dashboardPageNumbers() {
          const total = this.dashboardTotalPages;
          const current = Math.min(Math.max(1, Number(this.dashboardPage) || 1), total);
          if (total <= 7) {
            return Array.from({ length: total }, (_, i) => i + 1);
          }
          const pages = [];
          if (current <= 4) {
            for (let i = 1; i <= 5; i++) pages.push(i);
            pages.push('...');
            pages.push(total);
          } else if (current >= total - 3) {
            pages.push(1);
            pages.push('...');
            for (let i = total - 4; i <= total; i++) pages.push(i);
          } else {
            pages.push(1);
            pages.push('...');
            pages.push(current - 1);
            pages.push(current);
            pages.push(current + 1);
            pages.push('...');
            pages.push(total);
          }
          return pages;
        },

        setDashboardPage(p) {
          if (p === '...' || p < 1 || p > this.dashboardTotalPages) return;
          this.dashboardPage = p;
          this.$nextTick(() => {
            if (window.lucide) window.lucide.createIcons();
            const el = this.dashboardViewMode === 'grid'
              ? (document.getElementById('keywords-dashboard-grid') || document.getElementById('keywords-dashboard-table'))
              : document.getElementById('keywords-dashboard-table');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          });
        },

        getKeywordTotalPins(kw) {
          if (!kw) return 0;
          if (kw.total_pins_count !== undefined && kw.total_pins_count !== null && !isNaN(Number(kw.total_pins_count))) {
            return Number(kw.total_pins_count);
          }
          const active = Number(kw.active_pins_count ?? kw.snapshots_count ?? 0) || 0;
          const displaced = Number(kw.displaced_pins_count ?? 0) || 0;
          if (active > 0 || displaced > 0) return active + displaced;
          return 0;
        },

        getKeywordFolders(kw) {
          if (!kw) return [];
          if (Array.isArray(kw._folders)) return kw._folders;
          let folders = kw.folders;
          if (typeof folders === 'string' && folders.trim().startsWith('[')) {
            try { folders = JSON.parse(folders); } catch (_) { folders = []; }
          }
          if (Array.isArray(folders) && folders.length > 0) {
            const seen = new Set();
            kw._folders = folders.filter(f => f && f.id && !seen.has(String(f.id)) && seen.add(String(f.id)));
            return kw._folders;
          }
          if (!this.folders || this.folders.length === 0) return [];
          const kid = String(kw.id);
          const seen = new Set();
          kw._folders = this.folders
            .filter(f => {
              if (!f) return false;
              let prev = f.keywords_preview;
              if (typeof prev === 'string' && prev.trim().startsWith('[')) {
                try { prev = JSON.parse(prev); } catch (_) { prev = []; }
              }
              return (Array.isArray(prev) ? prev : []).some(k => k && String(k.id) === kid);
            })
            .map(f => ({ id: f.id, name: f.name, color: f.color || '#ec4899' }))
            .filter(f => !seen.has(String(f.id)) && seen.add(String(f.id)));
          return kw._folders;
        },

        getFolderKeywordCount(f) {
          if (!f) return 0;
          if (f.keyword_count !== undefined && f.keyword_count !== null && !isNaN(Number(f.keyword_count))) {
            return Number(f.keyword_count);
          }
          let prev = f.keywords_preview;
          if (typeof prev === 'string' && prev.trim().startsWith('[')) {
            try { prev = JSON.parse(prev); } catch (_) {}
          }
          return Array.isArray(prev) ? prev.filter(Boolean).length : 0;
        },

        filterByFolder(folderId) {
          this.dashboardFolderFilter = String(folderId);
          this.dashboardPage = 1;
        },

        clearFolderFilter() {
          this.dashboardFolderFilter = 'ALL';
          this.dashboardPage = 1;
        },

        get activeFolderName() {
          if (this.dashboardFolderFilter === 'ALL') return '';
          if (this.dashboardFolderFilter === 'UNASSIGNED') return 'Unassigned (No Folder)';
          const f = (this.folders || []).find(x => x && String(x.id) === String(this.dashboardFolderFilter));
          return f ? f.name : ('Folder #' + this.dashboardFolderFilter);
        },

        openQuickFolderModal(kw) {
          if (!kw) return;
          this.selectedKeyword = kw;
          this.selectedKeywordIds = [kw.id];
          this.openBulkFolderModal();
        },

        toggleColumn(key) {
          if (key === 'keyword') return; // Core column cannot be hidden
          this.visibleColumns = {
            ...this.visibleColumns,
            [key]: !this.visibleColumns[key],
            keyword: true
          };
          try {
            localStorage.setItem('keywords_visible_columns', JSON.stringify(this.visibleColumns));
          } catch (_) {}
          this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
        },

        resetColumns() {
          this.visibleColumns = {
            preview: true,
            keyword: true,
            total_pins: true,
            status: true,
            created_at: true,
            last_crawled: true,
            actions: true
          };
          try {
            localStorage.removeItem('keywords_visible_columns');
          } catch (_) {}
          this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
        },

        get activeVisibleColumnCount() {
          const visible = Object.entries(this.visibleColumns || {}).filter(([_, v]) => Boolean(v)).length;
          return visible + 1; // +1 for selection checkbox
        },

        get activeKeywordsCount() {
          const list = this.activeFolderId ? this.filteredDashboardKeywords : (this.keywords || []);
          return list.filter(k => k.is_active !== false).length;
        },

        get pausedKeywordsCount() {
          const list = this.activeFolderId ? this.filteredDashboardKeywords : (this.keywords || []);
          return list.filter(k => k.is_active === false).length;
        },

        get totalMonitoredPins() {
          const list = this.activeFolderId ? this.filteredDashboardKeywords : (this.keywords || []);
          return list.reduce((acc, k) => acc + this.getKeywordTotalPins(k), 0);
        },

        get averageFleetVelocity() {
          const base = this.activeFolderId ? this.filteredDashboardKeywords : (this.keywords || []);
          const active = base.filter(k => k.is_active !== false);
          if (active.length === 0) return 0;
          const total = active.reduce((acc, k) => acc + Number(k.avg_daily_velocity || 0), 0);
          return Number((total / active.length).toFixed(1));
        },

        get totalDisplacedPinsCount() {
          const list = this.activeFolderId ? this.filteredDashboardKeywords : (this.keywords || []);
          return list.reduce((acc, k) => acc + Number(k.displaced_pins_count || 0), 0);
        },

        get totalActivePinsCount() {
          const list = this.activeFolderId ? this.filteredDashboardKeywords : (this.keywords || []);
          return list.reduce((acc, k) => acc + Number(k.active_pins_count ?? k.snapshots_count ?? 0), 0);
        },

        get uniqueCategories() {
          const cats = new Set((this.keywords || []).map(k => k.category || 'General').filter(Boolean));
          return Array.from(cats).sort();
        },

        get nightlySyncCountdown() {
          const now = new Date();
          const next = new Date(now);
          next.setUTCHours(2, 0, 0, 0);
          if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
          const diffMs = next.getTime() - now.getTime();
          const hours = Math.floor(diffMs / 3600000);
          const mins = Math.floor((diffMs % 3600000) / 60000);
          return 'Next Batch at 02:00 UTC (~' + hours + 'h ' + mins + 'm)';
        },

        // [INVARIANT: NO-FABRICATED-TELEMETRY] Canonical velocity extraction & momentum tier assignment
        getKeywordVelocity(kw) {
          if (!kw) return 0;
          let val = 0;
          if (kw.avg_daily_velocity !== undefined && kw.avg_daily_velocity !== null) val = Number(kw.avg_daily_velocity);
          else if (kw.daily_save_velocity !== undefined && kw.daily_save_velocity !== null) val = Number(kw.daily_save_velocity);
          return Number.isFinite(val) ? val : 0;
        },

        getKeywordVelocityTierLabel(kw) {
          const vel = this.getKeywordVelocity(kw);
          if (vel >= 50) return '🔥 Explosive';
          if (vel >= 10) return '📈 Trending';
          if (vel > 0) return '⏸ Steady';
          return '⚪ Stagnant';
        },

        getKeywordVelocityTierClass(kw) {
          const vel = this.getKeywordVelocity(kw);
          if (vel >= 50) return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30';
          if (vel >= 10) return 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/30';
          if (vel > 0) return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30';
          return 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700';
        },

        getActiveSerpPercentage(kw) {
          const active = Number(kw?.active_pins_count ?? this.getKeywordTotalPins(kw) ?? 0);
          const displaced = Number(kw?.displaced_pins_count || 0);
          const total = active + displaced;
          if (!total) return 100;
          return Math.min(100, Math.max(0, Math.round((active / total) * 100)));
        },

        // Backward-compatible method signatures
        getKeywordSaveDelta(kw) {
          if (!kw) return 0;
          let val = 0;
          if (kw.saves_delta_24h !== undefined && kw.saves_delta_24h !== null) val = Number(kw.saves_delta_24h);
          else if (kw.metadata?.deltas?.saves_24h !== undefined) val = Number(kw.metadata.deltas.saves_24h);
          else val = Number(kw.avg_daily_velocity || kw.daily_save_velocity || 0);
          return Number.isFinite(val) ? val : 0;
        },

        getKeywordRepinDelta(kw) {
          if (!kw) return 0;
          let val = 0;
          if (kw.repins_delta_24h !== undefined && kw.repins_delta_24h !== null) val = Number(kw.repins_delta_24h);
          else if (kw.metadata?.deltas?.repins_24h !== undefined) val = Number(kw.metadata.deltas.repins_24h);
          return Number.isFinite(val) ? val : 0;
        },

        get filteredDisplacedPins() {
          let list = this.displacedPins || [];
          if (this.displacedStatusFilter && this.displacedStatusFilter !== 'ALL') {
            list = list.filter(p => p.status === this.displacedStatusFilter);
          }
          if (this.pinSearch && this.pinSearch.trim()) {
            const q = this.pinSearch.toLowerCase().trim();
            list = list.filter(p => 
              (p.title || '').toLowerCase().includes(q) ||
              (p.domain || '').toLowerCase().includes(q)
            );
          }
          if (this.pinSort === 'velocity') {
            return [...list].sort((a, b) => Number(b.daily_save_velocity || 0) - Number(a.daily_save_velocity || 0));
          } else if (this.pinSort === 'saves') {
            return [...list].sort((a, b) => Number(b.save_count || 0) - Number(a.save_count || 0));
          } else if (this.pinSort === 'age') {
            return [...list].sort((a, b) => new Date(b.displaced_date || 0) - new Date(a.displaced_date || 0));
          }
          return [...list].sort((a, b) => Number(b.vacuum_opportunity_score || 0) - Number(a.vacuum_opportunity_score || 0));
        },

        get paginatedDisplacedPins() {
          const list = this.filteredDisplacedPins || [];
          const sz = Number(this.displacedPageSize) || 25;
          const start = (this.displacedPage - 1) * sz;
          return list.slice(start, start + sz);
        },

        get totalDisplacedPages() {
          const list = this.filteredDisplacedPins || [];
          const sz = Number(this.displacedPageSize) || 25;
          return Math.max(1, Math.ceil(list.length / sz));
        },

        rebuildPinCaches() {
          const currentPins = (this.selectedKeywordDetails?.current_pins || []).map(p => ({
            ...p,
            is_displaced: false
          }));
          const currentPinIds = new Set(currentPins.map(p => p.pin_id));

          const droppedFromDetails = (this.selectedKeywordDetails?.dropped_out_pins || []).map(p => ({
            ...p,
            is_displaced: true,
            rank_position: p.last_known_rank || p.rank_position || 101,
            save_count: p.current_saves ?? p.save_count ?? 0,
            repin_count: p.current_repins ?? p.repin_count ?? 0,
            comment_count: p.current_comments ?? p.comment_count ?? 0,
            board_name: p.board_name || p.metadata?.board_name || null,
            creation_method: p.creation_method || p.method || p.metadata?.creation_method || p.metadata?.method || null,
            created_at_pinterest: p.created_at_pinterest || p.metadata?.created_at_pinterest || p.metadata?.created_at || null
          }));
          const fetchedDisplaced = (this.displacedPins || []).map(p => ({
            ...p,
            is_displaced: true,
            rank_position: p.last_known_rank || p.rank_position || 101,
            save_count: p.current_saves ?? p.save_count ?? 0,
            repin_count: p.current_repins ?? p.repin_count ?? 0,
            comment_count: p.current_comments ?? p.comment_count ?? 0,
            board_name: p.board_name || p.metadata?.board_name || null,
            creation_method: p.creation_method || p.method || p.metadata?.creation_method || p.metadata?.method || null,
            created_at_pinterest: p.created_at_pinterest || p.metadata?.created_at_pinterest || p.metadata?.created_at || null
          }));
          const vaultMap = new Map();
          for (const p of [...droppedFromDetails, ...fetchedDisplaced]) {
            if (p && p.pin_id && !currentPinIds.has(p.pin_id) && !vaultMap.has(p.pin_id)) {
              vaultMap.set(p.pin_id, p);
            }
          }
          const vaultPins = Array.from(vaultMap.values());
          // Sort displaced pins by their historical last_known_rank so they form a continuous #101, #102... catalog sequence
          vaultPins.sort((a, b) => Number(a.last_known_rank || a.rank_position || 999) - Number(b.last_known_rank || b.rank_position || 999));

          const activeCount = currentPins.length;
          vaultPins.forEach((p, idx) => {
            p.catalog_rank = activeCount + idx + 1;
          });
          currentPins.forEach((p, idx) => {
            p.catalog_rank = Number(p.rank_position) || (idx + 1);
          });

          this.cachedDisplacedVaultPins = vaultPins;

          const combined = [...currentPins, ...vaultPins];

          // Initialize tag frequency map: check if server provided precomputed tag_frequencies
          const freqMap = new Map();
          if (this.selectedKeywordDetails?.tag_frequencies && typeof this.selectedKeywordDetails.tag_frequencies === 'object') {
            for (const [k, v] of Object.entries(this.selectedKeywordDetails.tag_frequencies)) {
              freqMap.set(k.toLowerCase().trim(), Number(v) || 0);
            }
          }

          const coreSet = new Set();
          const shouldComputeClientFreq = freqMap.size === 0;

          // Pre-process and memoize visual tags on each pin object once
          for (const p of combined) {
            const rawTags = this.getPinVisualTags(p);
            p._cachedVisualTags = rawTags;
            p._cachedVisualTagsSlice = rawTags.slice(0, 4);
            p._hasVisualTags = rawTags.length > 0;
            p._extraTagsCount = Math.max(0, rawTags.length - 4);
            p._cachedVisualTagsLower = rawTags.map(t => t.toLowerCase());

            if (shouldComputeClientFreq) {
              for (const t of p._cachedVisualTagsLower) {
                freqMap.set(t, (freqMap.get(t) || 0) + 1);
              }
            }
          }

          for (const [t, cnt] of freqMap.entries()) {
            if (cnt >= 3) coreSet.add(t);
          }

          this.cachedTagFreqMap = freqMap;
          this.cachedCoreAnchorsSet = coreSet;
          this.cachedCombinedPins = combined;
        },

        get allCombinedPins() {
          if (!this.cachedCombinedPins) {
            this.rebuildPinCaches();
          }
          return this.cachedCombinedPins || [];
        },

        get displacedVaultPins() {
          if (!this.cachedDisplacedVaultPins) {
            this.rebuildPinCaches();
          }
          return this.cachedDisplacedVaultPins || [];
        },

        get totalDisplacedCount() {
          const fromDetails = Number(this.selectedKeywordDetails?.total_displaced_count ?? this.selectedKeywordDetails?.stats?.dropped_out ?? 0);
          const fromState = Number(this.displacedPinsTotal || 0);
          const fromArray = (this.displacedVaultPins || []).length;
          return Math.max(fromDetails, fromState, fromArray);
        },

        get totalCatalogCount() {
          const activeCount = Number(this.selectedKeywordDetails?.current_pins?.length || 0);
          const fromDetails = Number(this.selectedKeywordDetails?.total_catalog_pins_count || 0);
          return Math.max(fromDetails, activeCount + this.totalDisplacedCount);
        },

        getPinVisualTags(pin) {
          if (!pin) return [];
          if (pin._cachedVisualTags) return pin._cachedVisualTags;
          const raw = pin.metadata?.visual_annotations || pin.annotations || pin.visual_annotations || [];
          return (raw || []).map(t => {
            if (typeof t === 'string') return t.trim();
            if (t && typeof t === 'object') return (t.name || t.label || t.term || t.title || '').trim();
            return String(t || '').trim();
          }).filter(s => s && s.length >= 2);
        },

        filterByVisualTag(tag) {
          if (!tag) return;
          const clean = (typeof tag === 'string' ? tag : (tag.name || tag.label || tag.term || '')).trim().toLowerCase();
          if (this.activeVisualTagFilter === clean) {
            this.activeVisualTagFilter = '';
          } else {
            this.activeVisualTagFilter = clean;
            this.serpScope = 'all';
            this.activeTab = 'serp';
          }
          this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
        },

        filterByDomain(domain) {
          if (!domain) return;
          const clean = String(domain).trim().toLowerCase();
          if (this.activeDomainFilter === clean) {
            this.activeDomainFilter = '';
          } else {
            this.activeDomainFilter = clean;
            this.serpScope = 'all';
            this.activeTab = 'serp';
          }
          this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
        },

        get analyzedPinsList() {
          if (this.intelScope === 'active') {
            return this.selectedKeywordDetails?.current_pins || [];
          }
          return this.allCombinedPins.length > 0 ? this.allCombinedPins : (this.selectedKeywordDetails?.current_pins || []);
        },

        get totalAnalyzedPinsCount() {
          return this.analyzedPinsList.length;
        },

        get analyzedAvgSaves() {
          const list = this.analyzedPinsList;
          if (list.length === 0) return this.selectedKeywordDetails?.intelligence?.avg_saves || 0;
          const total = list.reduce((acc, p) => acc + Number(p.save_count || 0), 0);
          return Math.round(total / list.length);
        },

        get analyzedMedianSaves() {
          const list = this.analyzedPinsList;
          if (list.length === 0) {
            return this.selectedKeywordDetails?.intelligence?.benchmarks?.median_saves ?? this.selectedKeywordDetails?.intelligence?.median_saves ?? 0;
          }
          const saves = list.map(p => Number(p.save_count || 0)).sort((a, b) => a - b);
          const mid = Math.floor(saves.length / 2);
          return saves.length % 2 !== 0 ? saves[mid] : Math.round((saves[mid - 1] + saves[mid]) / 2);
        },

        get analyzedVisualFormats() {
          const pins = this.analyzedPinsList;
          if (pins.length === 0) {
            const asp = this.selectedKeywordDetails?.intelligence?.aspect_ratios;
            const fmt = this.selectedKeywordDetails?.intelligence?.formats;
            return {
              standard_pct: asp?.standard_pct ?? this.selectedKeywordDetails?.intelligence?.static_ratio ?? 80,
              extra_tall_pct: asp?.extra_tall_pct ?? 0,
              video_idea_pct: (fmt?.video_pct || 0) + (fmt?.idea_pct || 0)
            };
          }
          let standard = 0;
          let extraTall = 0;
          let videoOrIdea = 0;
          for (const p of pins) {
            const fmt = (p.metadata?.format || p.format || 'ORGANIC PIN').toUpperCase();
            const ratio = p.metadata?.aspect_ratio || p.aspect_ratio || '';
            if (fmt.includes('VIDEO') || fmt.includes('IDEA')) videoOrIdea++;
            else if (ratio === '1:2') extraTall++;
            else standard++;
          }
          const len = pins.length;
          return {
            standard_pct: Math.round((standard / len) * 100),
            extra_tall_pct: Math.round((extraTall / len) * 100),
            video_idea_pct: Math.round((videoOrIdea / len) * 100)
          };
        },

        get domainBreakdownList() {
          if (this.intelScope === 'active') {
            const backendList = this.selectedKeywordDetails?.intelligence?.domain_breakdown;
            if (Array.isArray(backendList) && backendList.length > 0) {
              return backendList;
            }
          }
          const pins = this.analyzedPinsList;
          if (pins.length === 0) return [];
          const map = new Map();
          for (const p of pins) {
            let d = (p.domain || '').trim().toLowerCase();
            if (!d && p.destination_url) {
              try { d = new URL(p.destination_url).hostname.replace(/^www\./, '').toLowerCase(); } catch (_) {}
            }
            if (!d || d === 'unknown' || d === 'uploaded by user' || d === 'null' || d === 'undefined') continue;
            if (!map.has(d)) {
              map.set(d, { domain: d, pin_count: 0, total_saves: 0, best_rank: Number(p.rank_position || 999) });
            }
            const entry = map.get(d);
            entry.pin_count++;
            entry.total_saves += Number(p.save_count || 0);
            entry.best_rank = Math.min(entry.best_rank, Number(p.rank_position || 999));
          }
          return Array.from(map.values())
            .map(entry => ({
              ...entry,
              share_pct: Number(((entry.pin_count / pins.length) * 100).toFixed(1))
            }))
            .sort((a, b) => b.pin_count - a.pin_count || b.total_saves - a.total_saves);
        },

        get repeatedDomainsCount() {
          if (this.intelScope === 'active') {
            const count = this.selectedKeywordDetails?.intelligence?.repeated_domains_count;
            if (count !== undefined && count !== null) return count;
          }
          return this.domainBreakdownList.filter(d => d.pin_count > 1).length;
        },

        get uniqueDomainsCount() {
          if (this.intelScope === 'active') {
            const count = this.selectedKeywordDetails?.intelligence?.unique_domains_count;
            if (count !== undefined && count !== null) return count;
          }
          return this.domainBreakdownList.length;
        },

        get coreAnchorsList() {
          if (this.intelScope === 'active') {
            const list = [];
            const freqMap = new Map();
            for (const p of (this.selectedKeywordDetails?.current_pins || [])) {
              const tags = p._cachedVisualTagsLower || this.getPinVisualTags(p).map(t => t.toLowerCase());
              const seen = new Set();
              for (const t of tags) {
                if (!seen.has(t)) {
                  seen.add(t);
                  freqMap.set(t, (freqMap.get(t) || 0) + 1);
                }
              }
            }
            for (const [tag, count] of freqMap.entries()) {
              if (count >= 2) {
                list.push({ tag, count });
              }
            }
            return list.sort((a, b) => b.count - a.count);
          }

          if (Array.isArray(this.selectedKeywordDetails?.core_anchors) && this.selectedKeywordDetails.core_anchors.length > 0) {
            return this.selectedKeywordDetails.core_anchors;
          }
          const freqMap = this.tagFrequencyMap;
          const list = [];
          for (const [tag, count] of freqMap.entries()) {
            if (count >= 2) {
              list.push({ tag, count });
            }
          }
          return list.sort((a, b) => b.count - a.count);
        },

        filteredAnchorsList() {
          let list = this.coreAnchorsList || [];
          if (this.anchorsTier === 'high') {
            list = list.filter(a => a.count >= 10);
          } else if (this.anchorsTier === 'core') {
            list = list.filter(a => a.count >= 5);
          }
          if (this.anchorsSearch && this.anchorsSearch.trim()) {
            const q = this.anchorsSearch.toLowerCase().trim();
            list = list.filter(a => a.tag.toLowerCase().includes(q));
          }
          return list;
        },

        paginatedAnchorsTable() {
          const list = this.filteredAnchorsList();
          const start = (this.anchorsPage - 1) * this.anchorsPageSize;
          return list.slice(start, start + this.anchorsPageSize);
        },

        totalAnchorsPages() {
          return Math.ceil(this.filteredAnchorsList().length / this.anchorsPageSize) || 1;
        },

        setAnchorsPage(p) {
          if (p >= 1 && p <= this.totalAnchorsPages()) {
            this.anchorsPage = p;
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        filteredDomainsList() {
          let list = this.domainBreakdownList || [];
          if (this.domainSearch && this.domainSearch.trim()) {
            const q = this.domainSearch.toLowerCase().trim();
            list = list.filter(d => d.domain.toLowerCase().includes(q));
          }
          return list;
        },

        paginatedDomainsList() {
          const list = this.filteredDomainsList();
          const start = (this.domainPage - 1) * this.domainPageSize;
          return list.slice(start, start + this.domainPageSize);
        },

        totalDomainsPages() {
          return Math.ceil(this.filteredDomainsList().length / this.domainPageSize) || 1;
        },

        setDomainPage(p) {
          if (p >= 1 && p <= this.totalDomainsPages()) {
            this.domainPage = p;
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        get tagFrequencyMap() {
          if (!this.cachedTagFreqMap) {
            this.rebuildPinCaches();
          }
          return this.cachedTagFreqMap || new Map();
        },

        getTagFrequency(tag) {
          if (!tag) return 0;
          if (!this.cachedTagFreqMap) {
            this.rebuildPinCaches();
          }
          return this.cachedTagFreqMap?.get(String(tag).toLowerCase().trim()) || 0;
        },

        isCoreAnchorTag(tag) {
          if (!tag) return false;
          if (!this.cachedCoreAnchorsSet) {
            this.rebuildPinCaches();
          }
          return this.cachedCoreAnchorsSet?.has(String(tag).toLowerCase().trim()) || false;
        },

        get breakoutPins() {
          const maxAge = Number(this.appSettings.breakout_max_pin_age_days || this.appSettings.breakout_rules?.max_pin_age_days || 30);
          const minVel = Number(this.appSettings.breakout_min_velocity || this.appSettings.breakout_rules?.min_daily_save_velocity || 1.5);
          return (this.allCombinedPins || []).filter(p => {
            if (p.is_breakout_candidate) return true;
            if (Number(p.breakout_score || 0) >= 20) return true;
            const vel = Number(p.daily_save_velocity || 0);
            const age = Number(p.metadata?.pin_age_days || 999);
            const saves = Number(p.metadata?.raw_saves || p.save_count || p.current_saves || 0);
            if (vel >= minVel && age <= maxAge) return true;
            if (saves >= 50 && age <= 45) return true;
            return false;
          }).sort((a, b) => Number(b.breakout_score || b.daily_save_velocity || 0) - Number(a.breakout_score || a.daily_save_velocity || 0));
        },

        get filteredPins() {
          let list = [];
          if (this.serpScope === 'active') {
            list = (this.selectedKeywordDetails?.current_pins || []).map(p => ({ ...p, is_displaced: false }));
          } else if (this.serpScope === 'displaced') {
            list = this.displacedVaultPins;
          } else if (this.serpScope === 'breakout') {
            list = this.breakoutPins;
          } else if (this.serpScope === 'velocity') {
            list = this.allCombinedPins.filter(p => Number(p.daily_save_velocity || 0) > 0);
          } else {
            // 'all' or 'vault' (All Vault Pins: current + displaced deduplicated)
            list = this.allCombinedPins;
          }

          if (this.activeVisualTagFilter) {
            const vtag = this.activeVisualTagFilter.toLowerCase().trim();
            list = list.filter(p => {
              const tags = p._cachedVisualTagsLower || this.getPinVisualTags(p).map(t => t.toLowerCase());
              return tags.includes(vtag);
            });
          }

          if (this.activeDomainFilter) {
            const dom = this.activeDomainFilter.toLowerCase().trim();
            list = list.filter(p => {
              let d = (p.domain || '').toLowerCase().trim();
              if (!d && p.destination_url) {
                try { d = new URL(p.destination_url).hostname.replace(/^www\./, '').toLowerCase(); } catch (_) {}
              }
              return d === dom;
            });
          }

          if (this.formatFilter && this.formatFilter !== 'ALL') {
            list = list.filter(p => (p.metadata?.format || p.format || 'ORGANIC PIN') === this.formatFilter);
          }

          if (this.pinSearch && this.pinSearch.trim()) {
            const q = this.pinSearch.toLowerCase().trim();
            list = list.filter(p => 
              (p.title || '').toLowerCase().includes(q) ||
              (p.domain || '').toLowerCase().includes(q) ||
              (p.metadata?.pinner?.username || '').toLowerCase().includes(q) ||
              (p.metadata?.pinner?.full_name || '').toLowerCase().includes(q) ||
              this.getPinVisualTags(p).some(t => t.toLowerCase().includes(q))
            );
          }

          if (this.pinSort === 'velocity') {
            return [...list].sort((a, b) => Number(b.daily_save_velocity || 0) - Number(a.daily_save_velocity || 0));
          } else if (this.pinSort === 'saves') {
            return [...list].sort((a, b) => {
              const aEngage = Number(a.metadata?.raw_saves || a.save_count || a.current_saves || 0);
              const bEngage = Number(b.metadata?.raw_saves || b.save_count || b.current_saves || 0);
              return bEngage - aEngage;
            });
          } else if (this.pinSort === 'age') {
            return [...list].sort((a, b) => Number(a.metadata?.pin_age_days || 9999) - Number(b.metadata?.pin_age_days || 9999));
          }

          return [...list].sort((a, b) => {
            if (a.is_displaced && !b.is_displaced) return 1;
            if (!a.is_displaced && b.is_displaced) return -1;
            return Number(a.catalog_rank || a.rank_position || a.last_known_rank || 999) - Number(b.catalog_rank || b.rank_position || b.last_known_rank || 999);
          });
        },

        get pinTotalPages() {
          if (this.pinPageSize === 'all') return 1;
          const count = this.filteredPins.length;
          if (count === 0) return 1;
          return Math.max(1, Math.ceil(count / Number(this.pinPageSize || 50)));
        },

        get paginatedPins() {
          if (this.pinPageSize === 'all') return this.filteredPins;
          const size = Number(this.pinPageSize || 50);
          const start = (this.pinPage - 1) * size;
          return this.filteredPins.slice(start, start + size);
        },

        get pinPageNumbers() {
          const total = this.pinTotalPages;
          const current = this.pinPage;
          if (total <= 7) {
            return Array.from({ length: total }, (_, i) => i + 1);
          }
          const pages = [];
          if (current <= 4) {
            for (let i = 1; i <= 5; i++) pages.push(i);
            pages.push('...');
            pages.push(total);
          } else if (current >= total - 3) {
            pages.push(1);
            pages.push('...');
            for (let i = total - 4; i <= total; i++) pages.push(i);
          } else {
            pages.push(1);
            pages.push('...');
            pages.push(current - 1);
            pages.push(current);
            pages.push(current + 1);
            pages.push('...');
            pages.push(total);
          }
          return pages;
        },

        setPinPage(p) {
          if (p >= 1 && p <= this.pinTotalPages) {
            this.pinPage = p;
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        getPinGlobalIndex(idx) {
          const size = this.pinPageSize === 'all' ? 0 : Number(this.pinPageSize || 50);
          return (this.pinPage - 1) * size + idx;
        },

        init() {
          this.selectedProjectId = ''; // Keywords & SERP studio strictly bind to Central Metadata Hub
          this.darkMode = typeof localStorage !== 'undefined' ? localStorage.getItem('pa_theme') !== 'light' : true;
          this.isDark = this.darkMode;
          this.applyTheme();
          this.fetchSettings();

          if (this.activeFolderId) {
            this.dashboardFolderFilter = this.activeFolderId;
            (async () => {
              try {
                const fRes = await fetch('/api/folders/' + encodeURIComponent(this.activeFolderId));
                if (fRes.ok) {
                  const fData = await fRes.json().catch(() => ({}));
                  this.activeFolder = fData.folder || null;
                }
              } catch (_) {}
            })();
          }

          if (typeof window !== 'undefined') {
            window.addEventListener('keydown', (e) => {
              if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
                const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
                if (activeTag !== 'input' && activeTag !== 'textarea') {
                  e.preventDefault();
                  this.toggleSidebar();
                }
              }
            });
          }

          try {
            const savedCols = localStorage.getItem('keywords_visible_columns');
            if (savedCols) {
              const parsed = JSON.parse(savedCols);
              if (parsed && typeof parsed === 'object') {
                delete parsed.velocity;
                delete parsed.saves_delta;
                delete parsed.repins_delta;
                this.visibleColumns = { ...this.visibleColumns, ...parsed, keyword: true };
                delete this.visibleColumns.velocity;
                delete this.visibleColumns.saves_delta;
                delete this.visibleColumns.repins_delta;
              }
            }
          } catch (_) {}

          window.addEventListener('popstate', (e) => {
            const path = window.location.pathname || '';
            if (path === '/keywords' || path === '/keywords/') {
              this.viewModeLevel = 'dashboard';
              this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
            } else {
              const pathSlug = this.extractSlugFromUrl();
              if (pathSlug) {
                this.viewModeLevel = 'serp_studio';
                this.loadKeywordBySlugOrText(pathSlug, false);
              }
            }
          });

          const urlSlug = this.extractSlugFromUrl() || window.__INITIAL_KEYWORD_SLUG__ || '';
          
          if (urlSlug) {
            this.viewModeLevel = 'serp_studio';
            this.loadKeywordBySlugOrText(urlSlug, false);
            // Defer secondary hub calls so they do not saturate DB connection pool during initial SERP render
            setTimeout(() => {
              this.fetchKeywords();
              this.fetchFolders();
            }, 600);
          } else {
            this.viewModeLevel = 'dashboard';
            this.fetchKeywords();
            this.fetchFolders();
          }

          this.$watch('dashboardSearch', () => { this.dashboardPage = 1; this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); }); });
          this.$watch('dashboardCategoryFilter', () => { this.dashboardPage = 1; this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); }); });
          this.$watch('dashboardStatusFilter', () => { this.dashboardPage = 1; this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); }); });
          this.$watch('dashboardFolderFilter', () => { this.dashboardPage = 1; this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); }); });
          this.$watch('dashboardGrowthFilter', () => { this.dashboardPage = 1; this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); }); });
          this.$watch('dashboardPinsFilter', () => { this.dashboardPage = 1; this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); }); });
          this.$watch('dashboardSort', () => { this.dashboardPage = 1; this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); }); });
          this.$watch('dashboardPageSize', () => { this.dashboardPage = 1; this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); }); });
          this.$watch('dashboardTotalPages', (total) => { if (this.dashboardPage > total) this.dashboardPage = Math.max(1, total); });
          this.$watch('dashboardViewMode', () => { this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); }); });
          this.$watch('pinSearch', async (val) => {
            this.pinPage = 1;
            if (val && String(val).includes('pin.it/') && /pin[.]it[/][a-zA-Z0-9_-]+/i.test(String(val).trim())) {
              await this.resolveAndInspectShortlink(String(val).trim());
            }
          });
          this.$watch('serpScope', () => { this.pinPage = 1; });
          this.$watch('formatFilter', () => { this.pinPage = 1; });
          this.$watch('pinSort', () => { this.pinPage = 1; });
          this.$watch('activeVisualTagFilter', () => { this.pinPage = 1; });
          this.$watch('activeDomainFilter', () => { this.pinPage = 1; });
          this.$watch('pinPageSize', () => { this.pinPage = 1; });
          this.$watch('anchorsSearch', () => { this.anchorsPage = 1; });
          this.$watch('anchorsTier', () => { this.anchorsPage = 1; });
          this.$watch('domainSearch', () => { this.domainPage = 1; });
          this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
        },

        switchToDashboard() {
          this.viewModeLevel = 'dashboard';
          const returnPath = this.activeFolderId
            ? '/folders/' + encodeURIComponent(this.activeFolderId) + '/keywords'
            : '/keywords';
          window.history.pushState(null, '', returnPath);
          this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
        },

        switchToSerpStudio(kw) {
          this.viewModeLevel = 'serp_studio';
          if (kw) {
            this.selectKeyword(kw, true);
          }
          this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
        },

        toggleDashboardKeywordSelection(kwId) {
          const id = Number(kwId);
          const idx = this.selectedKeywordIds.findIndex(x => Number(x) === id);
          if (idx > -1) {
            this.selectedKeywordIds.splice(idx, 1);
          } else {
            this.selectedKeywordIds.push(id);
          }
        },

        toggleSelectAllDashboardKeywords() {
          const list = this.paginatedDashboardKeywords;
          const allSelected = list.length > 0 && list.every(k => this.isDashboardKeywordSelected(k.id));
          if (allSelected) {
            const pageIds = new Set(list.map(k => Number(k.id)));
            this.selectedKeywordIds = this.selectedKeywordIds.filter(id => !pageIds.has(Number(id)));
          } else {
            const newIds = new Set(this.selectedKeywordIds.map(x => Number(x)));
            list.forEach(k => newIds.add(Number(k.id)));
            this.selectedKeywordIds = Array.from(newIds);
          }
        },

        isDashboardKeywordSelected(kwId) {
          const id = Number(kwId);
          return this.selectedKeywordIds.some(x => Number(x) === id);
        },

        clearSelectedKeywords() {
          this.selectedKeywordIds = [];
        },

        async bulkSyncKeywords() {
          if (this.selectedKeywordIds.length === 0) return;
          this.isBulkLoading = true;
          this.showToast('Initiating refresh for ' + this.selectedKeywordIds.length + ' keywords...', 'info');
          try {
            const results = await Promise.allSettled(this.selectedKeywordIds.map(id => 
              (window.safeApiFetch || fetch)(this.getApiUrl('/api/keywords/sync'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ keyword_id: id, force: true })
              })
            ));
            const successCount = results.filter(r => r.status === 'fulfilled' && r.value?.ok).length;
            const failCount = results.length - successCount;
            if (failCount > 0) {
              this.showToast('Refreshed ' + successCount + ' keywords (' + failCount + ' failed due to rate limits or errors)', successCount > 0 ? 'warning' : 'error');
            } else {
              this.showToast('Refreshed ' + successCount + ' keywords!', 'success');
            }
            await this.fetchKeywords();
          } catch (err) {
            this.showToast('Bulk refresh error: ' + err.message, 'error');
          } finally {
            this.isBulkLoading = false;
            this.selectedKeywordIds = [];
          }
        },

        async bulkRefreshKeywords() {
          return this.bulkSyncKeywords();
        },

        async bulkToggleKeywordStatus(targetStatus) {
          if (this.selectedKeywordIds.length === 0) return;
          this.isBulkLoading = true;
          try {
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/keywords/status'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ids: this.selectedKeywordIds, is_active: targetStatus })
            });
            if (!res.ok) {
              const errPayload = await res.json().catch(() => ({}));
              throw new Error(errPayload.message || errPayload.error || ('HTTP ' + res.status));
            }
            this.showToast('Updated status for ' + this.selectedKeywordIds.length + ' keywords.', 'success');
            await this.fetchKeywords();
          } catch (err) {
            this.showToast('Bulk status update error: ' + err.message, 'error');
          } finally {
            this.isBulkLoading = false;
            this.selectedKeywordIds = [];
          }
        },

        async bulkDeleteKeywords() {
          if (this.selectedKeywordIds.length === 0) return;
          if (!confirm('Are you sure you want to delete ' + this.selectedKeywordIds.length + ' tracked keywords?')) return;
          this.isBulkLoading = true;
          try {
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/keywords'), {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ids: this.selectedKeywordIds })
            });
            if (!res.ok) {
              const errPayload = await res.json().catch(() => ({}));
              throw new Error(errPayload.message || errPayload.error || ('HTTP ' + res.status));
            }
            this.showToast('Deleted ' + this.selectedKeywordIds.length + ' keywords.', 'info');
            await this.fetchKeywords();
          } catch (err) {
            this.showToast('Bulk delete error: ' + err.message, 'error');
          } finally {
            this.isBulkLoading = false;
            this.selectedKeywordIds = [];
          }
        },

        openBulkFolderModal() {
          if (this.selectedKeywordIds.length === 0) return;
          this.bulkTargetFolderId = this.folders[0]?.id || '';
          this.isBulkFolderModalOpen = true;
        },

        async commitBulkFolder() {
          if (!this.bulkTargetFolderId || this.selectedKeywordIds.length === 0) return;
          this.isBulkLoading = true;
          try {
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/folders/items'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                folder_id: this.bulkTargetFolderId,
                keyword_ids: this.selectedKeywordIds
              })
            });
            if (!res.ok) {
              const errPayload = await res.json().catch(() => ({}));
              throw new Error(errPayload.message || errPayload.error || ('HTTP ' + res.status));
            }
            this.showToast('Added ' + this.selectedKeywordIds.length + ' keywords to campaign folder!', 'success');
            this.isBulkFolderModalOpen = false;
            await this.fetchFolders();
          } catch (err) {
            this.showToast('Bulk folder error: ' + err.message, 'error');
          } finally {
            this.isBulkLoading = false;
            this.selectedKeywordIds = [];
          }
        },

        async toggleKeywordStatus(kw) {
          if (!kw?.id) return;
          const newStatus = !(kw.is_active !== false);
          try {
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/keywords/status'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: kw.id, is_active: newStatus })
            });
            if (res.ok) {
              kw.is_active = newStatus;
              this.showToast('Keyword "' + kw.keyword + '" is now ' + (newStatus ? 'Active' : 'Paused') + '.', 'info');
            }
          } catch (err) {
            this.showToast('Failed to update status: ' + err.message, 'error');
          }
        },

        computeSerpPowerPairs() {
          const pins = this.filteredPins || [];
          if (pins.length === 0) return [];
          
          const tagCounts = new Map();
          const pairCounts = new Map();
          let validPinCount = 0;

          for (const pin of pins) {
            const rawTags = this.getPinVisualTags(pin).map(s => s.toLowerCase());

            const uniqueTags = Array.from(new Set(rawTags));
            // Combinatorial guardrail: strictly cap at k <= 15 tags per pin
            const boundedTags = uniqueTags.slice(0, 15);
            if (boundedTags.length < 2) continue;
            validPinCount++;

            for (const tag of boundedTags) {
              tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
            }

            for (let i = 0; i < boundedTags.length; i++) {
              for (let j = i + 1; j < boundedTags.length; j++) {
                const t1 = boundedTags[i] < boundedTags[j] ? boundedTags[i] : boundedTags[j];
                const t2 = boundedTags[i] < boundedTags[j] ? boundedTags[j] : boundedTags[i];
                const key = t1 + '|||' + t2;
                pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
              }
            }
          }

          if (validPinCount === 0 || pairCounts.size === 0) return [];

          const results = [];
          const N = validPinCount;

          for (const [key, count] of pairCounts.entries()) {
            if (count < 2) continue;
            const [tagA, tagB] = key.split('|||');
            const countA = tagCounts.get(tagA) || 1;
            const countB = tagCounts.get(tagB) || 1;
            // Phase 5: Standardized Laplace-smoothed Lift:
            // Lift_smoothed = ((C_AB + 1) * (N + 4)) / ((C_A + 2) * (C_B + 2))
            const liftRaw = ((count + 1) * (N + 4)) / ((countA + 2) * (countB + 2));
            const lift = Number.isFinite(liftRaw) ? Number(liftRaw.toFixed(2)) : 1.0;
            results.push({
              tagA,
              tagB,
              count,
              lift,
              supportPct: Number(((count / N) * 100).toFixed(1))
            });
          }

          return results.sort((a, b) => b.lift - a.lift).slice(0, 8);
        },

        copySerpVisualBlueprint(pair) {
          if (!pair) return;
          const kw = this.selectedKeyword?.keyword || this.activeKeywordQuery || '';
          const prompt = 'Hyper-detailed Pinterest viral pin aesthetic, combining "' + pair.tagA + '" with "' + pair.tagB + '" for organic search query "' + kw + '". Ultra-high CTR commercial composition, vibrant focal lighting, clean negative space for typography overlay, editorial photography --ar 2:3 --stylize 250';
          this.copyToClipboard(prompt, 'Copied Visual Blueprint Prompt for ' + pair.tagA + ' + ' + pair.tagB + '!');
        },

        extractSlugFromUrl() {
          const path = window.location.pathname || '';
          if (path.startsWith('/keywords/')) {
            const raw = path.slice('/keywords/'.length);
            return decodeURIComponent(raw).trim();
          }
          const urlParams = new URLSearchParams(window.location.search);
          return urlParams.get('q') || urlParams.get('keyword') || urlParams.get('slug') || '';
        },

        showToast(message, type = 'info') {
          this.toast = { show: true, message, type };
          this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          setTimeout(() => { this.toast.show = false; }, 3500);
        },

        getApiUrl(path) {
          return path;
        },

        onProjectChange() {
          localStorage.setItem('pa_selected_project_id', this.selectedProjectId);
          this.selectedKeyword = null;
          this.selectedKeywordDetails = null;
          this.fetchKeywords();
        },

        async fetchFleetProjects() {
          this.fleetProjects = [{
            id: 1,
            project_id: 'unified-vps-hub',
            project_name: 'Native VPS PostgreSQL SSOT',
            status: 'active',
            is_hub: true
          }];
        },

        normalizeKeyword(k) {
          if (!k) return k;
          k._totalPins = this.getKeywordTotalPins(k);
          k._velocity = this.getKeywordVelocity(k);
          k._saveDelta = this.getKeywordSaveDelta(k);
          k._repinDelta = this.getKeywordRepinDelta(k);
          k._createdAtMs = k.created_at ? (Date.parse(k.created_at) || 0) : 0;
          k._crawledAtMs = k.last_crawled_at ? (Date.parse(k.last_crawled_at) || 0) : 0;
          k._formattedCreatedAt = this.formatDate(k.created_at);
          k._relativeCreatedAt = this.formatRelativeTime(k.created_at);
          k._formattedCrawledAt = this.formatDate(k.last_crawled_at);
          k._relativeCrawledAt = this.formatRelativeTime(k.last_crawled_at);
          const folders = this.getKeywordFolders(k);
          k._folders = folders;
          k._searchCorpus = ((k.keyword || '') + ' ' + (k.category || '') + ' ' + (folders.map(f => f.name || '').join(' '))).toLowerCase();
          return k;
        },

        async fetchKeywords(forceRefresh = false) {
          this.isKeywordsLoading = true;
          try {
            const refreshParam = forceRefresh ? '&refresh=true' : '';
            const folderParam = this.activeFolderId ? ('&folder_id=' + encodeURIComponent(this.activeFolderId)) : '';
            const res = await fetch(this.getApiUrl('/api/keywords?limit=1000' + refreshParam + folderParam));
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            const raw = Array.isArray(data.keywords) ? data.keywords : [];
            this.keywords = raw.map(k => this.normalizeKeyword(k));
          } catch (err) {
            this.showToast('Failed to load keywords: ' + err.message, 'error');
          } finally {
            this.isKeywordsLoading = false;
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        async loadKeywordBySlugOrText(slugOrText, updateHistory = true, allowCreate = false) {
          if (!slugOrText) return;
          const cleanText = slugOrText.replace(/[-_]+/g, ' ').trim().toLowerCase();
          const cleanSlug = cleanText.replace(/\\s+/g, '-');
          this.activeKeywordQuery = cleanText;

          // Fetch official 52-week trends asynchronously
          this.fetchTrends(cleanText);

          const match = this.keywords.find(k => 
            k.keyword.toLowerCase() === cleanText ||
            k.keyword.toLowerCase().replace(/\\s+/g, '-') === cleanSlug
          );

          if (match) {
            await this.selectKeyword(match, updateHistory);
          } else {
            this.isDetailsLoading = true;
            try {
              const autoParam = allowCreate ? '&auto_create=true' : '';
              const res = await fetch(this.getApiUrl('/api/keywords/serp-compare?slug=' + encodeURIComponent(cleanSlug) + autoParam));
              const data = await res.json();
              if (data.success && data.keyword) {
                this.selectedKeyword = data.keyword;
                this.selectedKeywordDetails = data;
                this.displacedOffset = 0;
                this.displacedPins = [];
                if (data.total_displaced_count !== undefined) {
                  this.displacedPinsTotal = Number(data.total_displaced_count);
                }
                this.anchorsPage = 1;
                this.anchorsSearch = '';
                this.domainPage = 1;
                this.domainSearch = '';
                this.rebuildPinCaches();
                if (data.keyword.id) {
                  this.fetchDisplacedPins(data.keyword.id);
                }
                if (!this.keywords.some(k => k.id === data.keyword.id)) {
                  this.keywords.unshift(this.normalizeKeyword(data.keyword));
                }
                if (updateHistory) {
                  window.history.pushState(null, '', '/keywords/' + encodeURIComponent(cleanSlug));
                }
              } else {
                throw new Error(data.error || 'Could not resolve keyword');
              }
            } catch (err) {
              this.showToast('Error loading keyword: ' + err.message, 'error');
            } finally {
              this.isDetailsLoading = false;
              this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
            }
          }
        },

        async selectKeyword(kw, updateHistory = true) {
          if (!kw) return;
          this.selectedKeyword = kw;
          this.activeKeywordQuery = kw.keyword;
          this.pinPage = 1;
          this.selectedPinIds = [];
          this.anchorsPage = 1;
          this.anchorsSearch = '';
          this.domainPage = 1;
          this.domainSearch = '';
          this.isDetailsLoading = true;
          this.activeTab = 'serp';
          this.displacedOffset = 0;
          this.displacedPins = [];
          this.displacedPinsTotal = Number(kw.displaced_pins_count || 0);

          // Fetch 52-week trends
          this.fetchTrends(kw.keyword);
          this.fetchCurrentKeywordFolders();
          this.fetchDisplacedPins(kw.id);

          const cleanSlug = kw.keyword.trim().toLowerCase().replace(/\\s+/g, '-');
          if (updateHistory) {
            const targetPath = this.activeFolderId
              ? '/folders/' + encodeURIComponent(this.activeFolderId) + '/keywords?q=' + encodeURIComponent(cleanSlug)
              : '/keywords/' + encodeURIComponent(cleanSlug);
            window.history.pushState(null, '', targetPath);
          }

          if (this.detailAbortController) {
            this.detailAbortController.abort();
          }
          this.detailAbortController = new AbortController();
          const currentReqId = ++this.detailRequestId;

          try {
            const res = await fetch(this.getApiUrl('/api/keywords/serp-compare?keyword_id=' + kw.id), {
              signal: this.detailAbortController.signal
            });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();

            if (currentReqId !== this.detailRequestId) return;

            this.selectedKeywordDetails = data;
            if (data.total_displaced_count !== undefined) {
              this.displacedPinsTotal = Number(data.total_displaced_count);
            }
            this.rebuildPinCaches();
          } catch (err) {
            if (err.name === 'AbortError') return;
            if (currentReqId === this.detailRequestId) {
              this.showToast('Error loading SERP details: ' + err.message, 'error');
            }
          } finally {
            if (currentReqId === this.detailRequestId) {
              this.isDetailsLoading = false;
              this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
            }
          }
        },

        async fetchTrends(term, force = false) {
          if (!term) return;
          this.isTrendsLoading = true;
          try {
            if (force) {
              const fetchFn = window.safeApiFetch || fetch;
              const res = await fetchFn(this.getApiUrl('/api/keywords/trends/refresh'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ term, force: true })
              });
              if (res && res.ok) {
                const data = await res.json();
                if (data.success) {
                  this.trendsData = { ...(this.trendsData || {}), ...data };
                  return;
                }
              }
            }

            const [trendsRes, popularRes] = await Promise.allSettled([
              fetch(this.getApiUrl('/api/keywords/trends?term=' + encodeURIComponent(term))),
              fetch(this.getApiUrl('/api/keywords/trends/popular-pins?term=' + encodeURIComponent(term)))
            ]);

            let merged = {};
            if (trendsRes.status === 'fulfilled' && trendsRes.value.ok) {
              const tData = await trendsRes.value.json();
              if (tData.success) merged = { ...tData };
            }
            if (popularRes.status === 'fulfilled' && popularRes.value.ok) {
              const pData = await popularRes.value.json();
              if (pData.success && Array.isArray(pData.popular_pins) && pData.popular_pins.length > 0) {
                merged.popular_pins = pData.popular_pins;
              }
              if (pData.success && Array.isArray(pData.collage_images) && pData.collage_images.length > 0 && (!merged.collage_images || merged.collage_images.length === 0)) {
                merged.collage_images = pData.collage_images;
              }
            }

            if (Object.keys(merged).length > 0) {
              this.trendsData = { ...(this.trendsData || {}), ...merged };
            }
          } catch (_) {} finally {
            this.isTrendsLoading = false;
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        // Pin Deep Dossier & Trajectory Controls (Image 2 Parity)
        async openPinInspector(pin) {
          if (!pin) return;
          this.activeInspectorPin = { ...pin };
          const list = this.filteredPins;
          this.activeInspectorPinIndex = list.findIndex(p => p.pin_id === pin.pin_id);
          this.dossierData = null;
          this.trajectoryData = null;
          this.isPinDrawerOpen = true;
          this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });

          if (this.pinInspectorAbortController) {
            this.pinInspectorAbortController.abort();
          }
          this.pinInspectorAbortController = new AbortController();
          const currentReqId = ++this.activePinRequestId;

          await Promise.allSettled([
            this.fetchPinDossier(pin.pin_id, this.selectedKeyword?.id, currentReqId, this.pinInspectorAbortController.signal),
            this.fetchPinTrajectory(pin.pin_id, this.selectedKeyword?.id, this.trajectoryRange, currentReqId, this.pinInspectorAbortController.signal)
          ]);
        },

        closePinInspector() {
          if (this.pinInspectorAbortController) {
            this.pinInspectorAbortController.abort();
            this.pinInspectorAbortController = null;
          }
          this.activePinRequestId++;
          this.isPinDrawerOpen = false;
          this.activeInspectorPin = null;
          this.dossierData = null;
          this.trajectoryData = null;
        },

        async fetchPinDossier(pinId, keywordId, reqId, signal) {
          const cleanPin = String(pinId || '').trim();
          if (!cleanPin) return;
          const currentReqId = reqId || this.activePinRequestId;
          const abortSignal = signal || this.pinInspectorAbortController?.signal;
          if (currentReqId !== this.activePinRequestId) return;
          this.isDossierLoading = true;
          try {
            const kid = keywordId || this.selectedKeyword?.id || '';
            const res = await fetch(this.getApiUrl('/api/keywords/pins/dossier?pin_id=' + encodeURIComponent(cleanPin) + (kid ? '&keyword_id=' + kid : '')), {
              signal: abortSignal
            });
            if (currentReqId !== this.activePinRequestId) return;
            if (res.ok) {
              const data = await res.json();
              if (currentReqId !== this.activePinRequestId) return;
              if (data.success) {
                this.dossierData = data.dossier || data;
                const linkUrl = this.dossierData.link || this.activeInspectorPin?.link || this.dossierData.url;
                if (linkUrl) {
                  this.hydratePinUrlGlobalSaves(linkUrl);
                }
              }
            }
          } catch (err) {
            if (err.name === 'AbortError') return;
          } finally {
            if (currentReqId === this.activePinRequestId) {
              this.isDossierLoading = false;
              this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
            }
          }
        },

        async fetchPinTrajectory(pinId, keywordId, range, reqId, signal) {
          const cleanPin = String(pinId || '').trim();
          if (!cleanPin) return;
          const currentReqId = reqId || this.activePinRequestId;
          const abortSignal = signal || this.pinInspectorAbortController?.signal;
          if (currentReqId !== this.activePinRequestId) return;
          this.isTrajectoryLoading = true;
          const r = range || this.trajectoryRange || '30d';
          try {
            const kid = keywordId || this.selectedKeyword?.id || '';
            const res = await fetch(this.getApiUrl('/api/keywords/pins/trajectory?pin_id=' + encodeURIComponent(cleanPin) + '&range=' + r + (kid ? '&keyword_id=' + kid : '')), {
              signal: abortSignal
            });
            if (currentReqId !== this.activePinRequestId) return;
            if (res.ok) {
              const data = await res.json();
              if (currentReqId !== this.activePinRequestId) return;
              if (data.success) {
                this.trajectoryData = data;
              }
            }
          } catch (err) {
            if (err.name === 'AbortError') return;
          } finally {
            if (currentReqId === this.activePinRequestId) {
              this.isTrajectoryLoading = false;
              this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
            }
          }
        },

        changeTrajectoryRange(range) {
          this.trajectoryRange = range;
          if (this.activeInspectorPin?.pin_id) {
            this.fetchPinTrajectory(this.activeInspectorPin.pin_id, this.selectedKeyword?.id, range, this.activePinRequestId, this.pinInspectorAbortController?.signal);
          }
        },

        async fetchDisplacedPins(keywordId, append = false) {
          const kid = keywordId || this.selectedKeyword?.id;
          if (!kid) return;
          if (append) {
            this.isLoadingMoreDisplaced = true;
          } else {
            this.isDisplacedLoading = true;
            this.displacedOffset = 0;
          }
          try {
            const offset = append ? this.displacedOffset : 0;
            const limit = 500;
            const statusParam = this.displacedStatusFilter !== 'ALL' ? '&status=' + encodeURIComponent(this.displacedStatusFilter) : '';
            const res = await fetch(this.getApiUrl('/api/keywords/displaced?keyword_id=' + kid + '&limit=' + limit + '&offset=' + offset + statusParam));
            if (res.ok) {
              const data = await res.json();
              const incoming = data.displaced_pins || data.pins || [];
              if (append) {
                const existingIds = new Set([
                  ...this.displacedPins.map(p => String(p.pin_id || p.id)),
                  ...(this.selectedKeywordDetails?.dropped_out_pins || []).map(p => String(p.pin_id || p.id))
                ]);
                const fresh = incoming.filter(p => !existingIds.has(String(p.pin_id || p.id)));
                this.displacedPins = [...this.displacedPins, ...fresh];
                this.displacedOffset += incoming.length;
              } else {
                this.displacedPins = incoming;
                this.displacedOffset = incoming.length;
              }
              if (data.total !== undefined && data.total !== null) {
                this.displacedPinsTotal = Number(data.total);
              } else {
                this.displacedPinsTotal = Math.max(this.displacedPinsTotal || 0, this.displacedPins.length);
              }
              if (append && incoming.length < limit) {
                this.displacedPinsTotal = Math.max(this.displacedPins.length, (this.selectedKeywordDetails?.dropped_out_pins || []).length);
              }
              this.rebuildPinCaches();
            }
          } catch (_) {} finally {
            this.isDisplacedLoading = false;
            this.isLoadingMoreDisplaced = false;
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        async loadMoreDisplacedPins() {
          if (this.isLoadingMoreDisplaced || this.isDisplacedLoading) return;
          if (this.displacedVaultPins.length >= this.totalDisplacedCount) return;
          if (this.displacedOffset === 0 && this.displacedVaultPins.length > 0) {
            this.displacedOffset = this.displacedVaultPins.length;
          }
          await this.fetchDisplacedPins(this.selectedKeyword?.id, true);
        },

        async fetchSettings() {
          try {
            const res = await fetch(this.getApiUrl('/api/settings'));
            if (res.ok) {
              const data = await res.json();
              if (data.success && data.settings) {
                this.appSettings = { ...this.appSettings, ...data.settings };
                this.settingsCrawlPages = Number(data.settings.default_crawl_pages || 2);
                this.settingsMaxSerpPins = Number(data.settings.max_serp_pins || data.settings.default_max_pins || 50);
                this.settingsMaxPins = this.settingsMaxSerpPins;
                this.settingsMaxCatalogInspect = data.settings.max_catalog_inspect !== undefined ? Number(data.settings.max_catalog_inspect) : 0;
                this.settingsEnableSerpHarvest = data.settings.enable_serp_harvest !== undefined ? Boolean(data.settings.enable_serp_harvest) : true;
                this.settingsCrawlScope = data.settings.default_crawl_scope || 'all_pins';
                this.settingsInspectionMode = data.settings.default_inspection_mode || 'full_catalog';
                this.settingsExcludePromoted = data.settings.exclude_promoted !== undefined ? Boolean(data.settings.exclude_promoted) : true;
                this.settingsExcludeBoardsAndSuggestions = data.settings.exclude_boards_and_suggestions !== undefined ? Boolean(data.settings.exclude_boards_and_suggestions) : true;
                this.settingsExcludeIgnoredPins = data.settings.exclude_ignored_pins !== undefined ? Boolean(data.settings.exclude_ignored_pins) : true;
                this.settingsMaxPinAgeDays = Number(data.settings.breakout_max_pin_age_days || data.settings.breakout_rules?.max_pin_age_days || 30);
                this.settingsMinVelocity = Number(data.settings.breakout_min_velocity || data.settings.breakout_rules?.min_daily_save_velocity || 1.5);
                if (data.settings.pinterest_cookie) {
                  this.settingsPinterestCookie = String(data.settings.pinterest_cookie);
                }
              }
            }
          } catch (e) {
            console.error('Failed to fetch settings:', e);
          }
        },

        openSettingsModal(kw = null) {
          const target = kw || (this.viewModeLevel === 'serp_studio' ? (this.selectedKeyword || this.selectedKeywordDetails?.keyword) : null);
          this.settingsTargetKeyword = target;
          if (target) {
            this.settingsCrawlPages = Number(target.crawl_pages_limit || this.appSettings.default_crawl_pages || 2);
            this.settingsMaxSerpPins = Number(target.target_pin_count || this.appSettings.max_serp_pins || this.appSettings.default_max_pins || 50);
            this.settingsMaxPins = this.settingsMaxSerpPins;
            this.settingsMaxCatalogInspect = Number(this.appSettings.max_catalog_inspect !== undefined ? this.appSettings.max_catalog_inspect : 0);
            this.settingsEnableSerpHarvest = this.appSettings.enable_serp_harvest !== undefined ? Boolean(this.appSettings.enable_serp_harvest) : true;
            this.settingsCrawlScope = this.appSettings.default_crawl_scope || 'all_pins';
            this.settingsInspectionMode = target.inspection_mode || this.appSettings.default_inspection_mode || 'full_catalog';
            this.settingsApplyGlobal = false;
          } else {
            this.settingsCrawlPages = Number(this.appSettings.default_crawl_pages || 2);
            this.settingsMaxSerpPins = Number(this.appSettings.max_serp_pins || this.appSettings.default_max_pins || 50);
            this.settingsMaxPins = this.settingsMaxSerpPins;
            this.settingsMaxCatalogInspect = Number(this.appSettings.max_catalog_inspect !== undefined ? this.appSettings.max_catalog_inspect : 0);
            this.settingsEnableSerpHarvest = this.appSettings.enable_serp_harvest !== undefined ? Boolean(this.appSettings.enable_serp_harvest) : true;
            this.settingsCrawlScope = this.appSettings.default_crawl_scope || 'all_pins';
            this.settingsInspectionMode = this.appSettings.default_inspection_mode || 'full_catalog';
            this.settingsApplyGlobal = true;
          }
          this.settingsExcludePromoted = this.appSettings.exclude_promoted !== undefined ? Boolean(this.appSettings.exclude_promoted) : true;
          this.settingsExcludeBoardsAndSuggestions = this.appSettings.exclude_boards_and_suggestions !== undefined ? Boolean(this.appSettings.exclude_boards_and_suggestions) : true;
          this.settingsExcludeIgnoredPins = this.appSettings.exclude_ignored_pins !== undefined ? Boolean(this.appSettings.exclude_ignored_pins) : true;
          this.settingsMaxPinAgeDays = Number(this.appSettings.breakout_max_pin_age_days || this.appSettings.breakout_rules?.max_pin_age_days || 30);
          this.settingsMinVelocity = Number(this.appSettings.breakout_min_velocity || this.appSettings.breakout_rules?.min_daily_save_velocity || 1.5);
          this.settingsPinterestCookie = String(this.appSettings.pinterest_cookie || this.settingsPinterestCookie || '');
          this.isSettingsModalOpen = true;
          this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
        },

        async savePinterestCookieSetting() {
          if (!this.settingsPinterestCookie || !this.settingsPinterestCookie.trim()) {
            this.showToast('Please paste a valid Pinterest cookie or _pinterest_sess token first.', 'warning');
            return;
          }
          this.isSavingPinterestCookie = true;
          try {
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/settings/cookie'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ cookie: this.settingsPinterestCookie.trim() })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.success) {
              throw new Error(data.error || data.message || 'Failed to save Pinterest cookie');
            }
            this.appSettings.pinterest_cookie = data.cookie || this.settingsPinterestCookie.trim();
            this.showToast('Pinterest session cookie saved & activated across all crawlers!', 'success');
          } catch (err) {
            this.showToast('Error saving cookie: ' + err.message, 'error');
          } finally {
            this.isSavingPinterestCookie = false;
          }
        },

        async saveSettings() {
          this.settingsLoading = true;
          try {
            if (this.settingsApplyGlobal || !this.settingsTargetKeyword) {
              const payload = {
                default_crawl_pages: this.settingsCrawlPages,
                default_max_pins: this.settingsMaxSerpPins || this.settingsMaxPins,
                max_serp_pins: this.settingsMaxSerpPins || this.settingsMaxPins,
                max_catalog_inspect: Number(this.settingsMaxCatalogInspect !== undefined ? this.settingsMaxCatalogInspect : 0),
                enable_serp_harvest: Boolean(this.settingsEnableSerpHarvest),
                default_crawl_scope: this.settingsCrawlScope || 'all_pins',
                default_inspection_mode: this.settingsInspectionMode || 'full_catalog',
                exclude_promoted: this.settingsExcludePromoted,
                exclude_boards_and_suggestions: this.settingsExcludeBoardsAndSuggestions,
                exclude_ignored_pins: this.settingsExcludeIgnoredPins,
                breakout_max_pin_age_days: this.settingsMaxPinAgeDays,
                breakout_min_velocity: this.settingsMinVelocity,
                breakout_rules: {
                  max_pin_age_days: this.settingsMaxPinAgeDays,
                  min_daily_save_velocity: this.settingsMinVelocity
                },
                pinterest_cookie: (this.settingsPinterestCookie || '').trim() || undefined
              };
              const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/settings'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
              });
              if (!res.ok) {
                const errPayload = await res.json().catch(() => ({}));
                throw new Error(errPayload.message || errPayload.error || 'Failed to save global settings');
              }
              this.appSettings = { ...this.appSettings, ...payload };
            }

            if (this.settingsTargetKeyword) {
              const kwPayload = {
                keyword_id: this.settingsTargetKeyword.id,
                crawl_pages_limit: this.settingsCrawlPages,
                target_pin_count: this.settingsMaxSerpPins || this.settingsMaxPins,
                inspection_mode: this.settingsInspectionMode
              };
              const resKw = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/keywords/settings'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(kwPayload)
              });
              if (!resKw.ok) {
                const errPayload = await resKw.json().catch(() => ({}));
                throw new Error(errPayload.message || errPayload.error || 'Failed to save keyword settings');
              }
              this.settingsTargetKeyword.crawl_pages_limit = this.settingsCrawlPages;
              this.settingsTargetKeyword.target_pin_count = this.settingsMaxSerpPins || this.settingsMaxPins;
              this.settingsTargetKeyword.inspection_mode = this.settingsInspectionMode;
              if (this.selectedKeyword && this.selectedKeyword.id === this.settingsTargetKeyword.id) {
                this.selectedKeyword.crawl_pages_limit = this.settingsCrawlPages;
                this.selectedKeyword.target_pin_count = this.settingsMaxSerpPins || this.settingsMaxPins;
                this.selectedKeyword.inspection_mode = this.settingsInspectionMode;
              }
              if (this.selectedKeywordDetails?.keyword && this.selectedKeywordDetails.keyword.id === this.settingsTargetKeyword.id) {
                this.selectedKeywordDetails.keyword.crawl_pages_limit = this.settingsCrawlPages;
                this.selectedKeywordDetails.keyword.target_pin_count = this.settingsMaxSerpPins || this.settingsMaxPins;
                this.selectedKeywordDetails.keyword.inspection_mode = this.settingsInspectionMode;
              }
              const inList = (this.keywords || []).find(k => k.id === this.settingsTargetKeyword.id);
              if (inList) {
                inList.crawl_pages_limit = this.settingsCrawlPages;
                inList.target_pin_count = this.settingsMaxSerpPins || this.settingsMaxPins;
                inList.inspection_mode = this.settingsInspectionMode;
              }
            }

            this.showToast('Settings saved successfully!', 'success');
            this.isSettingsModalOpen = false;
          } catch (err) {
            this.showToast('Error saving settings: ' + err.message, 'error');
          } finally {
            this.settingsLoading = false;
          }
        },

        getPaceDelta(pin, metric = 'saves') {
          if (!pin) return '';
          const filter = this.growthPaceFilter || '24h';
          if (filter === 'all') return '';

          let val = 0;
          const deltas = pin.metadata?.deltas || pin.deltas || {};
          if (filter === '24h') {
            val = Number(deltas[metric + '_24h'] ?? (metric === 'saves' ? (pin.daily_save_velocity ?? 0) : 0));
          } else if (filter === '3d') {
            val = Number(deltas[metric + '_3d'] ?? (metric === 'saves' ? ((pin.daily_save_velocity || 0) * 3) : 0));
          } else if (filter === '7d') {
            val = Number(deltas[metric + '_7d'] ?? (metric === 'saves' ? ((pin.daily_save_velocity || 0) * 7) : 0));
          }
          if (val > 0) return '+' + this.formatNumber(val);
          if (val < 0) return '-' + this.formatNumber(Math.abs(val));
          return '0';
        },

        getTrajectoryDualSvg(snapshots, width = 640, height = 220) {
          if (!snapshots || snapshots.length === 0) {
            return { isEmpty: true, isSingle: false, savesLine: '', savesArea: '', repinsLine: '', savesMax: 0, repinsMax: 0, points: [] };
          }
          if (snapshots.length === 1) {
            const rawS0 = Number(snapshots[0].save_count);
            const rawR0 = Number(snapshots[0].repin_count);
            const s0Save = Number.isFinite(rawS0) ? rawS0 : 0;
            const s0Repin = Number.isFinite(rawR0) ? rawR0 : 0;
            return {
              isEmpty: false,
              isSingle: true,
              singlePoint: { 
                x: (width / 2).toFixed(1), 
                y: (height / 2).toFixed(1), 
                date: snapshots[0].snapshot_date, 
                saves: s0Save, 
                repins: s0Repin 
              },
              savesLine: '',
              savesArea: '',
              repinsLine: '',
              savesMax: s0Save,
              repinsMax: s0Repin,
              points: []
            };
          }

          const savesVals = snapshots.map(s => {
            const v = Number(s.save_count);
            return Number.isFinite(v) ? v : 0;
          });
          const repinsVals = snapshots.map(s => {
            const v = Number(s.repin_count);
            return Number.isFinite(v) ? v : 0;
          });
          const savesMin = Math.min(...savesVals);
          const savesMax = Math.max(...savesVals, savesMin + 1);
          const savesRange = (savesMax - savesMin) || 1;

          const repinsMin = Math.min(...repinsVals);
          const repinsMax = Math.max(...repinsVals, repinsMin + 1);
          const repinsRange = (repinsMax - repinsMin) || 1;

          const step = width / (snapshots.length - 1);
          const points = snapshots.map((s, i) => {
            const x = (i * step).toFixed(1);
            const sVal = Number.isFinite(Number(s.save_count)) ? Number(s.save_count) : 0;
            const rVal = Number.isFinite(Number(s.repin_count)) ? Number(s.repin_count) : 0;
            const saveY = (height - 30 - ((sVal - savesMin) / savesRange) * (height - 60)).toFixed(1);
            const repinY = (height - 30 - ((rVal - repinsMin) / repinsRange) * (height - 60)).toFixed(1);
            return { x, saveY, repinY, date: s.snapshot_date, saves: sVal, repins: rVal };
          });

          const savesLine = points.map((p, i) => (i === 0 ? 'M' : 'L') + ' ' + p.x + ' ' + p.saveY).join(' ');
          const savesArea = savesLine + ' L ' + width + ' ' + (height - 15) + ' L 0 ' + (height - 15) + ' Z';
          const repinsLine = points.map((p, i) => (i === 0 ? 'M' : 'L') + ' ' + p.x + ' ' + p.repinY).join(' ');

          return { isEmpty: false, isSingle: false, savesLine, savesArea, repinsLine, savesMax, repinsMax, points };
        },

        togglePinSelection(pinId) {
          if (this.selectedPinIds.includes(pinId)) {
            this.selectedPinIds = this.selectedPinIds.filter(id => id !== pinId);
          } else {
            this.selectedPinIds.push(pinId);
          }
        },

        toggleSelectAllPins() {
          const list = this.paginatedPins;
          const allCurrentSelected = list.length > 0 && list.every(p => this.selectedPinIds.includes(p.pin_id));
          if (allCurrentSelected) {
            const currentIds = new Set(list.map(p => p.pin_id));
            this.selectedPinIds = this.selectedPinIds.filter(id => !currentIds.has(id));
          } else {
            const set = new Set(this.selectedPinIds);
            for (const p of list) {
              set.add(p.pin_id);
            }
            this.selectedPinIds = Array.from(set);
          }
        },

        isPinSelected(pinId) {
          return this.selectedPinIds.includes(pinId);
        },

        nextInspectorPin() {
          const list = this.filteredPins;
          if (this.activeInspectorPinIndex < list.length - 1) {
            this.activeInspectorPinIndex++;
            this.openPinInspector(list[this.activeInspectorPinIndex]);
          }
        },

        prevInspectorPin() {
          const list = this.filteredPins;
          if (this.activeInspectorPinIndex > 0) {
            this.activeInspectorPinIndex--;
            this.openPinInspector(list[this.activeInspectorPinIndex]);
          }
        },

        getInspectorAnnotations() {
          const raw = (this.dossierData?.annotations && this.dossierData.annotations.length > 0)
            ? this.dossierData.annotations
            : (this.activeInspectorPin?.metadata?.visual_annotations || []);
          return (raw || []).map(t => {
            if (typeof t === 'string') return t;
            if (t && typeof t === 'object') {
              return t.name || t.label || t.display_label || t.term || t.title || '';
            }
            return String(t || '');
          }).filter(Boolean);
        },

        copyAllInspectorTags() {
          const tags = this.getInspectorAnnotations();
          if (tags.length === 0) return;
          this.copyToClipboard(tags.join(', '), 'Copied ' + tags.length + ' Annotated Interests!');
        },

        async onOmnibarInput() {
          const q = this.omnibarQuery.trim();
          this.isOmnibarDropdownOpen = true;
          if (q.length < 2) {
            this.typeaheadSuggestions = [];
            return;
          }

          this.isTypeaheadLoading = true;
          try {
            const res = await fetch(this.getApiUrl('/api/keywords/typeahead?q=' + encodeURIComponent(q)));
            if (res.ok) {
              const data = await res.json();
              this.typeaheadSuggestions = data.suggestions || [];
            }
          } catch (_) {} finally {
            this.isTypeaheadLoading = false;
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        async submitOmnibarKeyword() {
          const raw = this.omnibarQuery.trim();
          if (!raw) return;
          this.isOmnibarDropdownOpen = false;
          this.omnibarQuery = '';
          if (raw.includes('pin.it/') && /pin[.]it[/][a-zA-Z0-9_-]+/i.test(raw)) {
            await this.resolveAndInspectShortlink(raw);
            return;
          }
          await this.loadKeywordBySlugOrText(raw, true, true);
        },

        async resolveAndInspectShortlink(url) {
          if (!url) return;
          try {
            const res = await fetch('/api/pins/resolve-shortlink?url=' + encodeURIComponent(url), {
              signal: AbortSignal.timeout(8000)
            });
            if (!res.ok) return;
            const data = await res.json();
            if (data?.ok && data.pin_id) {
              await this.openPinInspector({ pin_id: data.pin_id });
            }
          } catch (_) {}
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

        computeViralityRatio(globalSaves, pinSaves) {
          const g = Number(globalSaves || 0);
          const p = Math.max(1, Number(pinSaves || 0));
          return (g / p).toFixed(1);
        },

        async hydratePinUrlGlobalSaves(url) {
          if (!url) return;
          try {
            const res = await fetch('/api/urls/global-saves?url=' + encodeURIComponent(url), {
              signal: AbortSignal.timeout(6000)
            });
            if (res.ok) {
              const data = await res.json();
              if (data?.ok && data.global_saves !== undefined) {
                if (this.dossierData) {
                  this.dossierData.url_global_saves = Number(data.global_saves);
                }
                if (this.activeInspectorPin) {
                  this.activeInspectorPin.url_global_saves = Number(data.global_saves);
                }
              }
            }
          } catch (_) {}
        },

        async trackNewKeyword(term) {
          const clean = term.trim();
          if (!clean) return;
          await this.loadKeywordBySlugOrText(clean, true, true);
        },

        async rescanActiveKeyword(force = true) {
          if (this.selectedKeyword?.id) {
            await this.rescanKeyword(this.selectedKeyword.id, force);
          } else if (this.activeKeywordQuery) {
            await this.loadKeywordBySlugOrText(this.activeKeywordQuery, true);
          }
        },

        async rescanKeyword(id, force = true) {
          this.syncingKeywordId = id;
          const kwObj = this.keywords.find(k => k.id === id) || (this.selectedKeyword?.id === id ? this.selectedKeyword : null);
          const crawlPages = kwObj?.crawl_pages_limit || this.appSettings.default_crawl_pages || 10;
          const maxPins = kwObj?.target_pin_count || this.appSettings.default_max_pins || 250;
          const inspectionMode = kwObj?.inspection_mode || this.appSettings.default_inspection_mode || 'full_catalog';

          this.showToast('Crawling fresh SERP (~' + maxPins + ' pins) from Pinterest...', 'info');

          try {
            const targetKw = kwObj?.keyword || (this.selectedKeyword?.id === id ? this.selectedKeyword?.keyword : '') || this.activeKeywordQuery || '';
            const targetSlug = kwObj?.slug || kwObj?.canonical_keyword || (this.selectedKeyword?.id === id ? this.selectedKeyword?.slug : '') || this.activeKeywordQuery || '';
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/keywords/sync'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                keyword_id: id,
                keyword: targetKw,
                slug: targetSlug,
                force: Boolean(force),
                crawl_pages: crawlPages,
                max_pins: maxPins,
                inspection_mode: inspectionMode,
                dispatch_workflow: false
              })
            });

            if (!res.ok) {
              const errPayload = await res.json().catch(() => ({}));
              throw new Error(errPayload.message || errPayload.error || ('HTTP ' + res.status));
            }
            const data = await res.json();
            const count = Number(data.result?.crawled_pins ?? (data.result?.pins_collected || 0));
            if (data.result?.success && count > 0) {
              this.showToast('SERP updated: ' + count + ' pins indexed!', 'success');
              await this.fetchKeywords();
              if (this.selectedKeyword && this.selectedKeyword.id === id) {
                await this.selectKeyword(this.selectedKeyword, false);
              }
              // [INVARIANT: ZERO-DOUBLE-TRIGGER]
              // [INVARIANT: EDGE-ONLY-RESCAN]
              // Table row re-crawl runs strictly on Cloudflare Edge (< 2s) with dispatch_workflow: false.
              // Deep fleet telemetry is triggered independently via the interactive Trigger Fleet modal.
            } else {
              const reason = data.result?.reason === 'zero_organic_results'
                ? '0 organic pins found on Pinterest (check cookie/query)'
                : (data.result?.reason || data.result?.message || 'No pins indexed');
              this.showToast('Crawl completed: ' + reason, 'warning');
              await this.fetchKeywords();
            }
          } catch (err) {
            this.showToast('Crawl error: ' + err.message, 'error');
          } finally {
            this.syncingKeywordId = null;
          }
        },

        async deleteKeyword(id) {
          if (!confirm('Are you sure you want to delete this tracked keyword and its snapshots?')) return;
          try {
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/keywords?id=' + id), { method: 'DELETE' });
            if (!res.ok) {
              const errPayload = await res.json().catch(() => ({}));
              throw new Error(errPayload.message || errPayload.error || ('HTTP ' + res.status));
            }
            this.showToast('Keyword deleted.', 'info');
            if (this.selectedKeyword?.id === id) {
              this.selectedKeyword = null;
              this.selectedKeywordDetails = null;
            }
            await this.fetchKeywords(true);
            if (this.keywords.length > 0 && !this.selectedKeyword) {
              this.selectKeyword(this.keywords[0]);
            }
          } catch (err) {
            this.showToast('Delete error: ' + err.message, 'error');
          }
        },

        openFleetDispatchModal(target = null) {
          const kwObj = (typeof target === 'object' && target !== null)
            ? target
            : (typeof target === 'string' && target
                ? (this.keywords.find(k => k.keyword?.toLowerCase() === target.toLowerCase()) || { keyword: target })
                : this.selectedKeyword);
          this.fleetDispatchTargetKeyword = kwObj?.keyword || '';
          this.fleetDispatchHarvestSerp = true;
          this.fleetDispatchScope = 'all_pins';
          this.fleetDispatchMaxPins = kwObj?.target_pin_count || this.appSettings?.default_max_pins || 50;
          this.isFleetDispatchModalOpen = true;
          this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
        },

        onFleetTargetKeywordChange() {
          if (!this.fleetDispatchTargetKeyword) {
            this.fleetDispatchMaxPins = this.appSettings?.default_max_pins || 50;
            return;
          }
          const kw = this.keywords.find(k => k.keyword?.toLowerCase() === this.fleetDispatchTargetKeyword.toLowerCase());
          if (kw) {
            this.fleetDispatchMaxPins = kw.target_pin_count || this.appSettings?.default_max_pins || 50;
          }
        },

        async executeFleetDispatch() {
          this.isWorkflowDispatching = true;
          this.isFleetDispatchModalOpen = false;
          this.showToast('Dispatching 20-Runner Swarm via GitHub Actions...', 'info');
          try {
            const targetKw = this.fleetDispatchTargetKeyword || '';
            const targetPins = String(this.fleetDispatchMaxPins || this.selectedKeyword?.target_pin_count || this.appSettings?.default_max_pins || 50);
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/keywords/dispatch-workflow'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                target_keyword: targetKw,
                keyword: targetKw,
                crawl_scope: this.fleetDispatchScope || 'all_pins',
                max_pins: targetPins,
                enable_serp_harvest: this.fleetDispatchHarvestSerp ? 'true' : 'false'
              })
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data?.success) {
              this.showToast('20-Runner Swarm dispatched successfully!', 'success');
            } else {
              this.showToast('Dispatch note: ' + (data.message || data.error || 'Check GitHub token'), 'error');
            }
          } catch (err) {
            this.showToast('Error triggering fleet: ' + err.message, 'error');
          } finally {
            this.isWorkflowDispatching = false;
          }
        },

        async triggerWorkflow(notify = true) {
          this.openFleetDispatchModal();
        },

        copyToClipboard(text, msg = 'Copied to clipboard!') {
          const cleanText = String(text || '').trim();
          if (!cleanText) return;
          if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            navigator.clipboard.writeText(cleanText).then(() => {
              this.showToast(msg, 'success');
            }).catch(() => {
              this.fallbackCopyText(cleanText, msg);
            });
          } else {
            this.fallbackCopyText(cleanText, msg);
          }
        },

        fallbackCopyText(text, msg) {
          try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            const successful = document.execCommand('copy');
            document.body.removeChild(ta);
            if (successful) {
              this.showToast(msg, 'success');
            } else {
              this.showToast('Please copy manually', 'warning');
            }
          } catch (_) {
            this.showToast('Copy not supported on this device', 'error');
          }
        },

        cleanControlChars(str) {
          if (!str) return '';
          return Array.from(String(str))
            .filter(ch => {
              const code = ch.charCodeAt(0);
              if (code < 32 || (code >= 127 && code <= 159)) return false;
              if (code >= 0x200B && code <= 0x200F) return false;
              if (code >= 0x202A && code <= 0x202E) return false;
              return true;
            })
            .join('')
            .replace(/\\s+/g, ' ')
            .trim();
        },

        copySEOFormula() {
          const kw = this.cleanControlChars(this.selectedKeyword?.keyword || this.activeKeywordQuery || '');
          if (!kw) return;
          const guides = this.selectedKeywordDetails?.guides || [];
          const topModifiers = guides
            .slice(0, 3)
            .map(g => this.cleanControlChars(g.display_label || g.term))
            .filter(Boolean)
            .join(' ');
          const formula = kw.charAt(0).toUpperCase() + kw.slice(1) + (topModifiers ? ' - ' + topModifiers : '');
          this.copyToClipboard(formula, 'Copied SEO Title Formula: "' + formula + '"');
        },

        formatNumber(num) {
          const n = Number(num || 0);
          if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
          if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
          return n.toLocaleString();
        },

        formatDate(d) {
          if (!d) return 'Never';
          try {
            const date = new Date(d);
            if (isNaN(date.getTime())) return String(d);
            return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          } catch (_) {
            return String(d);
          }
        },

        formatRelativeTime(d) {
          if (!d) return 'Never';
          try {
            const date = new Date(d);
            if (isNaN(date.getTime())) return 'Never';
            const diffMs = Date.now() - date.getTime();
            if (diffMs < 0) return 'Just now';
            const diffSec = Math.floor(diffMs / 1000);
            if (diffSec < 60) return diffSec + 's ago';
            const diffMin = Math.floor(diffSec / 60);
            if (diffMin < 60) return diffMin + 'm ago';
            const diffHours = Math.floor(diffMin / 60);
            if (diffHours < 24) return diffHours + 'h ago';
            const diffDays = Math.floor(diffHours / 24);
            if (diffDays < 7) return diffDays + 'd ago';
            return date.toLocaleDateString();
          } catch (_) {
            return String(d);
          }
        },

        getQuotaPercentage(kw) {
          if (!kw) return 0;
          const current = Number(kw.snapshots_count) || Number(kw.target_pin_count) || 250;
          const target = Number(kw.target_pin_count) || 250;
          return Math.min(100, Math.max(0, Math.round((current / target) * 100)));
        },

        getPinMethod(pin) {
          if (!pin) return 'pinterest_platform';
          const candidates = [
            pin.creation_method,
            pin.method,
            pin.metadata?.creation_method,
            pin.metadata?.method
          ].filter(m => m && typeof m === 'string' && m.trim().length > 0);
          return (candidates.find(m => m.trim().toLowerCase() !== 'pinterest_platform') || candidates[0] || 'pinterest_platform').toLowerCase().trim();
        },

        formatPinMethodLabel(pin) {
          const m = this.getPinMethod(pin);
          if (m.includes('schedule') || m.includes('tailwind') || m.includes('buffer')) return 'Pin Scheduling';
          if (m.includes('extension') || m.includes('button')) return 'Browser Extension';
          if (m.includes('api') || m.includes('developer')) return 'Pinterest API';
          if (m.includes('publishing') || m.includes('native')) return 'Native Publish';
          if (m.includes('carousel')) return 'Carousel';
          if (m.includes('platform') || m.includes('web') || m.includes('mobile')) return 'Pinterest Platform';
          return m.replace(/_/g, ' ').replace(/\\b\\w/g, c => c.toUpperCase());
        },

        getPinMethodBadgeClass(pin) {
          const m = this.getPinMethod(pin);
          if (m.includes('schedule')) {
            return 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30';
          }
          if (m.includes('extension')) {
            return 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30';
          }
          return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30';
        },

        getPinCreatedDate(pin) {
          if (!pin) return null;
          return pin.created_at_pinterest || pin.metadata?.created_at_pinterest || pin.metadata?.created_at || null;
        },

        formatPinCreated(pin) {
          const d = this.getPinCreatedDate(pin);
          if (!d) return 'Unknown';
          try {
            const dt = new Date(d);
            if (isNaN(dt.getTime())) return String(d);
            return dt.toUTCString().replace(' GMT', '');
          } catch (_) {
            return String(d);
          }
        },

        formatPinAge(pin) {
          const d = this.getPinCreatedDate(pin);
          if (!d) return '';
          try {
            const dt = new Date(d);
            if (isNaN(dt.getTime())) return '';
            const diffMs = Date.now() - dt.getTime();
            if (diffMs < 0) return 'Recent';
            const days = Math.floor(diffMs / 86400000);
            if (days === 0) return 'Today';
            if (days === 1) return '1d ago';
            if (days < 30) return days + 'd ago';
            if (days < 365) return Math.floor(days / 30) + 'mo ago';
            return (days / 365).toFixed(1) + 'y ago';
          } catch (_) {
            return '';
          }
        },

        async openVisualLens(pin) {
          this.visualLensPin = { ...pin };
          this.isVisualLensModalOpen = true;
          this.isVisualLensLoading = true;
          this.visualLensResults = [];
          this.visualLensError = null;

          try {
            const res = await fetch(this.getApiUrl('/api/keywords/visual-search?pin_id=' + encodeURIComponent(pin.pin_id)));
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to fetch visual search matches');
            this.visualLensResults = data.matches || [];
            const seedData = data.seed_pin || data.seed;
            if (seedData) {
              this.visualLensPin = {
                ...this.visualLensPin,
                title: (this.visualLensPin.title && !this.visualLensPin.title.startsWith('Pin #')) ? this.visualLensPin.title : (seedData.title || this.visualLensPin.title),
                image_url: this.visualLensPin.image_url || seedData.image_url,
                domain: this.visualLensPin.domain || seedData.domain,
                save_count: this.visualLensPin.save_count || seedData.save_count
              };
            }
          } catch (err) {
            this.visualLensError = err.message;
          } finally {
            this.isVisualLensLoading = false;
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        closeVisualLens() {
          this.isVisualLensModalOpen = false;
          this.visualLensPin = null;
          this.visualLensResults = [];
          this.visualLensError = null;
        },

        researchKeywordTag(tag) {
          this.closePinInspector();
          this.loadKeywordBySlugOrText(tag, true, true);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        },

        formatAge(days) {
          if (days === null || days === undefined || isNaN(Number(days))) return '-';
          const d = Number(days);
          if (d === 0) return 'Today';
          if (d === 1) return '1d ago';
          if (d < 30) return d + 'd ago';
          if (d < 365) return Math.floor(d / 30) + 'mo ago';
          return Math.floor(d / 365) + 'y ago';
        },

        getSparklinePoints(kw) {
          const history = kw.metadata?.velocity_history;
          if (Array.isArray(history) && history.length > 1) {
            return history.map(h => Number(h.velocity || 0));
          }
          const cur = Number(kw.avg_daily_velocity || 0);
          return [Math.max(0, cur * 0.6), Math.max(0, cur * 0.85), cur];
        },

        generateSparklinePath(points, width = 80, height = 20) {
          if (!points || points.length < 2) return '';
          const min = Math.min(...points);
          const max = Math.max(...points);
          const range = (max - min) === 0 ? 1 : (max - min);
          const step = width / (points.length - 1);
          return points.map((p, i) => {
            const x = (i * step).toFixed(1);
            const y = (height - ((p - min) / range) * (height - 4) - 2).toFixed(1);
            return (i === 0 ? 'M' : 'L') + ' ' + x + ' ' + y;
          }).join(' ');
        },

        getTrendsAreaPath(points, width = 800, height = 180) {
          if (!points || points.length < 2) return { line: '', area: '' };
          const min = 0;
          const max = 100;
          const range = 100;
          const step = width / (points.length - 1);

          const coords = points.map((p, i) => {
            const x = (i * step).toFixed(1);
            const y = (height - (Math.min(100, Math.max(0, Number(p || 0))) / range) * (height - 20) - 10).toFixed(1);
            return { x, y };
          });

          const line = coords.map((c, i) => (i === 0 ? 'M' : 'L') + ' ' + c.x + ' ' + c.y).join(' ');
          const area = line + ' L ' + width + ' ' + height + ' L 0 ' + height + ' Z';
          return { line, area };
        },

        getVelocityAreaPath(points, width = 500, height = 75) {
          if (!points || points.length < 2) return { line: '', area: '' };
          const min = 0;
          const max = Math.max(...points, 1);
          const range = max - min;
          const step = width / (points.length - 1);

          const coords = points.map((p, i) => {
            const x = (i * step).toFixed(1);
            const y = (height - ((p - min) / range) * (height - 12) - 4).toFixed(1);
            return { x, y };
          });

          const line = coords.map((c, i) => (i === 0 ? 'M' : 'L') + ' ' + c.x + ' ' + c.y).join(' ');
          const area = line + ' L ' + width + ' ' + height + ' L 0 ' + height + ' Z';
          return { line, area };
        },

        // =========================================================================
        // CAMPAIGN FOLDERS & CROSSOVER MATRIX ENGINE METHODS
        // =========================================================================

        async fetchFolders() {
          try {
            const res = await fetch(this.getApiUrl('/api/folders'));
            if (res.ok) {
              const data = await res.json();
              this.folders = data.folders || [];
              if (this.keywords && this.keywords.length > 0) {
                this.keywords.forEach(k => {
                  delete k._folders;
                  const fList = this.getKeywordFolders(k);
                  k._folders = fList;
                  k._searchCorpus = ((k.keyword || '') + ' ' + (k.category || '') + ' ' + (fList.map(f => f.name || '').join(' '))).toLowerCase();
                });
              }
              if (this.folders.length > 0) {
                if (this.activeFolderId) {
                  const matched = this.folders.find(f => String(f.id) === String(this.activeFolderId));
                  if (matched) this.activeFolder = this.activeFolder ? { ...matched, ...this.activeFolder } : matched;
                } else if (!this.activeFolder) {
                  this.activeFolder = this.folders[0];
                }
                if (this.activeTab === 'crossover' && this.activeFolder) {
                  this.fetchFolderCrossover(this.activeFolder.id);
                }
              }
            }
          } catch (_) {}
        },

        async selectFolder(folder) {
          if (!folder) return;
          this.activeFolder = folder;
          this.activeTab = 'crossover';
          await this.fetchFolderCrossover(folder.id);
        },

        openCrossoverTab() {
          this.activeTab = 'crossover';
          if (this.activeFolder) {
            if (!this.crossoverData || this.crossoverData.folder?.id !== this.activeFolder.id) {
              this.fetchFolderCrossover(this.activeFolder.id);
            }
          } else if (this.folders.length > 0) {
            this.selectFolder(this.folders[0]);
          }
        },

        async fetchFolderCrossover(folderId) {
          if (!folderId) return;
          this.isCrossoverLoading = true;
          try {
            const res = await fetch(this.getApiUrl('/api/folders/crossover?folder_id=' + folderId));
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            this.crossoverData = data.crossover || null;
          } catch (err) {
            this.showToast('Error loading crossover matrix: ' + err.message, 'error');
          } finally {
            this.isCrossoverLoading = false;
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        openCreateFolderModal() {
          this.newFolder = { name: '', description: '', color: '#ec4899' };
          this.isCreateFolderModalOpen = true;
        },

        async saveNewCampaignFolder() {
          if (!this.newFolder.name?.trim()) return;
          try {
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/folders'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(this.newFolder)
            });
            if (!res.ok) {
              const errPayload = await res.json().catch(() => ({}));
              throw new Error(errPayload.message || errPayload.error || ('HTTP ' + res.status));
            }
            const data = await res.json();
            this.showToast('Campaign folder created!', 'success');
            this.isCreateFolderModalOpen = false;
            await this.fetchFolders();
            if (data.folder) {
              this.selectFolder(data.folder);
              this.activeTab = 'crossover';
            }
          } catch (err) {
            this.showToast('Error creating folder: ' + err.message, 'error');
          }
        },

        async deleteCampaignFolder(folderId) {
          if (!confirm('Are you sure you want to delete this campaign folder? Keywords will remain tracked.')) return;
          try {
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/folders?id=' + folderId), { method: 'DELETE' });
            if (!res.ok) {
              const errPayload = await res.json().catch(() => ({}));
              throw new Error(errPayload.message || errPayload.error || ('HTTP ' + res.status));
            }
            this.showToast('Folder deleted.', 'info');
            if (this.activeFolder?.id === folderId) {
              this.activeFolder = null;
              this.crossoverData = null;
            }
            await this.fetchFolders();
          } catch (err) {
            this.showToast('Delete error: ' + err.message, 'error');
          }
        },

        async fetchCurrentKeywordFolders() {
          if (!this.selectedKeyword?.id) {
            this.currentKeywordFolders = [];
            return;
          }
          try {
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/folders/by-keyword?keyword_id=' + this.selectedKeyword.id));
            if (res.ok) {
              const data = await res.json();
              this.currentKeywordFolders = data.folders || [];
            }
          } catch (_) {}
        },

        isKeywordInFolder(folderId) {
          return this.currentKeywordFolders.some(f => f.id === folderId);
        },

        async toggleCurrentKeywordFolder(folderId) {
          if (!this.selectedKeyword?.id) return;
          const inFolder = this.isKeywordInFolder(folderId);
          try {
            if (inFolder) {
              await (window.safeApiFetch || fetch)(this.getApiUrl('/api/folders/items'), {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folder_id: folderId, keyword_id: this.selectedKeyword.id })
              });
              this.showToast('Removed from folder', 'info');
            } else {
              await (window.safeApiFetch || fetch)(this.getApiUrl('/api/folders/items'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folder_id: folderId, keyword_id: this.selectedKeyword.id })
              });
              this.showToast('Added to folder!', 'success');
            }
            await this.fetchCurrentKeywordFolders();
            await this.fetchFolders();
            if (this.activeFolder?.id === folderId) {
              await this.fetchFolderCrossover(folderId);
            }
          } catch (err) {
            this.showToast('Folder update error: ' + err.message, 'error');
          }
        },

        async openAddKeywordsModal() {
          if (!this.activeFolder) return;
          this.folderKeywordSearch = '';
          try {
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/folders?id=' + this.activeFolder.id));
            if (res.ok) {
              const data = await res.json();
              this.selectedFolderKeywordIds = (data.folder?.items || []).map(i => i.keyword_id);
            } else {
              this.selectedFolderKeywordIds = [];
            }
          } catch (_) {
            this.selectedFolderKeywordIds = [];
          }
          this.isAddKeywordsModalOpen = true;
        },

        isKeywordSelected(kid) {
          return this.selectedFolderKeywordIds.includes(kid);
        },

        toggleKeywordSelection(kid) {
          if (this.selectedFolderKeywordIds.includes(kid)) {
            this.selectedFolderKeywordIds = this.selectedFolderKeywordIds.filter(id => id !== kid);
          } else {
            this.selectedFolderKeywordIds.push(kid);
          }
        },

        async commitFolderKeywords() {
          if (!this.activeFolder) return;
          try {
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/folders/items'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                folder_id: this.activeFolder.id,
                keyword_ids: this.selectedFolderKeywordIds
              })
            });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            this.showToast('Folder keywords updated!', 'success');
            this.isAddKeywordsModalOpen = false;
            await this.fetchFolders();
            await this.fetchFolderCrossover(this.activeFolder.id);
          } catch (err) {
            this.showToast('Error saving keywords: ' + err.message, 'error');
          }
        },

        copyAllUniversalTags() {
          const tags = (this.crossoverData?.tag_bridges || []).slice(0, 15).map(t => t.tag).join(', ');
          if (!tags) return;
          this.copyToClipboard(tags, 'Copied Universal Tag Blueprint to clipboard!');
        },

        safeUrl(url) {
          if (!url) return '#';
          const s = String(url).trim();
          if (/^https?:\\/\\//i.test(s) || s.startsWith('/')) return s;
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

        exportClusterBlueprintCsv() {
          const blueprint = this.crossoverData?.topic_cluster_blueprint;
          if (!blueprint || !Array.isArray(blueprint.csv_rows) || blueprint.csv_rows.length === 0) {
            this.showToast('No blueprint rows available for export', 'error');
            return;
          }
          const rows = blueprint.csv_rows;
          const headers = Object.keys(rows[0]);
          const csvContent = [
            headers.map(h => this.sanitizeCsvCell(h)).join(','),
            ...rows.map(r => headers.map(h => this.sanitizeCsvCell(r[h])).join(','))
          ].join('\\r\\n');

          const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          const safeName = (this.activeFolder?.name || 'cluster_blueprint').toLowerCase().replace(/[^a-z0-9]+/g, '_');
          a.download = 'pinterest_cluster_' + safeName + '.csv';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          this.showToast('1-Click CSV Blueprint downloaded successfully!', 'success');
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

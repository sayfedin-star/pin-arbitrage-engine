/**
 * src/ui/dashboard/dashboard-client-boards.mjs
 *
 * Modular Client Subsystem: Pin Dossier Navigation, Board Detail Page,
 * GitHub Actions Crawler Modal & Unified Creator Onboarding.
 * Extracted from dashboard-client-app.mjs (Wave 2 decomposition).
 */

export function getDashboardBoardsAndPinMethods() {
  return `        // Dedicated Pin Detail Page & Dossier Action Methods (Route: /pin/:id)
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
          this.$nextTick(() => { if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons(); });
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
              url: targetCreator ? ('https://www.pinterest.com/' + cleanUser + '/' + encodeURIComponent(boardName.toLowerCase().replace(/\\s+/g, '-'))) : null,
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
              window.apiFetch(this.getApiUrl('/api/creators/all-pins?' + p.toString())),
              cleanUser ? window.apiFetch(this.getApiUrl('/api/creators/board-detail?username=' + encodeURIComponent(cleanUser) + '&board=' + encodeURIComponent(boardName))) : Promise.resolve(null)
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
            this.$nextTick(() => { if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons(); });
          }
        },

        async refreshBoardDetail() {
          if (!this.activeBoardName) return;
          const creator = this.activeBoardCreator || this.activeCreator;
          const handle = creator ? (creator.username || '').replace(/^@+/, '').trim() : '';
          if (!handle) return;
          this.showToast('Scraping authentic Related Interests (board_vase) from Pinterest...');
          try {
            const res = await window.apiFetch(this.getApiUrl('/api/creators/board-detail/sync'), {
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
                this.showToast('Discovered ' + (this.activeBoard.board_vase?.length || 0) + ' algorithmic Related Topics (board_vase)!');
              }
            } else {
              this.showToast('Could not refresh board topics from Pinterest.');
            }
          } catch (e) {
            this.showToast('Error refreshing board: ' + e.message);
          } finally {
            this.$nextTick(() => { if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons(); });
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
          this.$nextTick(() => { if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons(); });
        },

        async copyPinField(type, text) {
          if (!text) return;
          if (typeof window !== 'undefined' && window.PAE && typeof window.PAE.copyText === 'function') {
            await window.PAE.copyText(String(text));
          } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
            await navigator.clipboard.writeText(String(text));
          }
          this.showToast('Copied ' + type + ' to clipboard!');
        },

        async deletePinSnapshot(snapshotId) {
          const confirmed = await window.PAE.confirm('Are you sure you want to delete this historical metric snapshot?', {
            title: 'Delete Metric Snapshot',
            confirmLabel: 'Delete Snapshot',
            danger: true
          });
          if (!confirmed) return;
          try {
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/creators/pin-snapshot?id=' + encodeURIComponent(snapshotId) + '&pin_id=' + encodeURIComponent(this.activePinDossier.pin_id)), {
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

        async fetchCreatorBoards(creator = this.activeCreator, force = false) {
          if (!creator) return;
          const targetId = creator.id || (creator.username || '').replace(/^@+/, '').trim();
          if (!targetId) return;
          const cleanUser = (creator.username || '').replace(/^@+/, '').trim();
          const boardCacheKey = String(targetId) + ':' + cleanUser.toLowerCase();
          if (!force && this._clientCache?.boards?.has(boardCacheKey)) {
            const cachedBoards = this._clientCache.boards.get(boardCacheKey) || [];
            this.activeCreatorBoards = cachedBoards;
            this.competitorBoardsList = cachedBoards;
            return;
          }
          const signal = typeof this._nextAbortSignal === 'function' ? this._nextAbortSignal('creator_boards') : undefined;
          this.isLoadingBoards = true;
          try {
            const res = await window.apiFetch(
              this.getApiUrl('/api/creators/boards?competitor_id=' + encodeURIComponent(targetId) + (cleanUser ? '&username=' + encodeURIComponent(cleanUser) : '')),
              signal ? { signal } : {}
            );
            if (signal && signal.aborted) return;
            if (res.ok) {
              const data = await res.json();
              if (signal && signal.aborted) return;
              const boards = data.boards || [];
              if (this._clientCache?.boards) {
                this._clientCache.boards.set(boardCacheKey, boards);
              }
              this.activeCreatorBoards = boards;
              this.competitorBoardsList = boards;
              if (this.activeCreator && (this.activeCreator.id === creator.id || this.activeCreator.username === creator.username)) {
                this.activeCreator.total_boards = Math.max(Number(this.activeCreator.total_boards || 0), boards.length);
              }
            }
          } catch (e) {
            if ((signal && signal.aborted) || (e && e.name === 'AbortError')) return;
            console.error('fetchCreatorBoards error:', e);
          } finally {
            if (!signal || !signal.aborted) {
              this.isLoadingBoards = false;
              this.$nextTick(() => { if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons(); });
            }
          }
        },

        async fetchCreatorWinningPins(creator = this.activeCreator) {
          if (!creator) return;
          const handle = (creator.username || '').replace(/^@+/, '').trim();
          if (!handle) return;
          try {
            const res = await window.apiFetch(this.getApiUrl('/api/creators/pins?account=@' + encodeURIComponent(handle) + '&limit=500'));
            if (res.ok) {
              const data = await res.json();
              this.activeCreatorPins = data.pins || [];
              this.activeCreatorWinningPinsTotal = data.total ?? (data.pins ? data.pins.length : 0);
            }
          } catch (e) {
            console.error('fetchCreatorWinningPins error:', e);
          } finally {
            this.$nextTick(() => { if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons(); });
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
            const target = this.scopedFolderId
              ? ('/folders/' + encodeURIComponent(this.scopedFolderId) + '/creators')
              : ((this.currentTab === 'creators_archive') ? '/accounts' : '/');
            if (window.location.pathname !== target) {
              window.history.pushState({}, '', target);
            }
          }
          this.$nextTick(() => { if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons(); });
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
          if (Array.isArray(options.bulkUsernames) && options.bulkUsernames.length > 0) {
            this.ghaBulkUsernames = options.bulkUsernames.map(u => String(u || '').replace(/^@+/, '').trim()).filter(Boolean);
            this.ghaTargetAccount = this.ghaBulkUsernames.length + ' Selected Creators';
          } else {
            this.ghaBulkUsernames = [];
            this.ghaTargetAccount = (target.username || '').replace(/^@+/, '').trim();
          }
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
          this.$nextTick(() => { if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons(); });
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
          this.showToast('Filtered discovered pins for board: ' + boardName);
        },

        filterWinningPinsByBoard(boardName) {
          if (!boardName) return;
          this.activeCreatorTab = 'all_pins';
          this.creatorAllPinQualifiedOnly = true;
          this.creatorAllPinBoard = boardName;
          this.activeCreatorAllPinsPage = 1;
          this.fetchCreatorAllPins();
          this.showToast('Filtered qualified winning pins for board: ' + boardName);
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
          const isBulk = Array.isArray(this.ghaBulkUsernames) && this.ghaBulkUsernames.length > 0;
          const bulkUsernames = isBulk ? [...this.ghaBulkUsernames] : null;

          const handle = (this.ghaTargetAccount || '').replace(/^@+/, '').trim();
          if (!handle && (!bulkUsernames || !bulkUsernames.length)) return;
          this.isDispatchingGitHubCrawl = true;
          this.isGhaCrawlerModalOpen = false;

          const targetBoards = this.ghaBoardScope === 'custom' ? this.ghaTargetBoards.join(',') : '';
          const boardMsg = targetBoards ? (' (' + this.ghaTargetBoards.length + ' selected board(s))') : ' (Sharded across 20 nodes)';
          this.showToast(isBulk
            ? ('Dispatching fleet crawler for ' + bulkUsernames.length + ' creators...')
            : ('Dispatching fleet crawler for @' + handle + boardMsg + '...'));

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
              this.showToast(data?.message || 'Crawler pipeline launched on GitHub Actions!');
            } else {
              this.showToast('Dispatch failed: ' + (data?.error || res.statusText || 'Check GitHub token configuration'));
            }
          } catch (err) {
            this.showToast('Network error: ' + err.message);
          } finally {
            this.isDispatchingGitHubCrawl = false;
            this.$nextTick(() => { if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons(); });
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
          this.showToast(newStatus ? 'Ingestion resumed.' : 'Ingestion paused.');

          // 2. Persist to backend
          try {
            const res = await window.apiFetch(this.getApiUrl('/api/creators/status'), {
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
          this.showToast('Exported ' + data.length + ' candidates to CSV.');
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
          if (/(?:^|\\.)pinterest\\.[a-z.]+/i.test(handle)) {
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
            'messages', 'edit', 'following', 'followers', 'analytics', 'newborn'
          ]);

          if (!handle || reservedPaths.has(handle) || !/^[a-z0-9_.-]{3,64}$/.test(handle)) {
            this.showToast('Invalid Pinterest creator handle: "' + (handle || raw) + '". Reserved words and invalid formats are not allowed.');
            return;
          }

          this.isSubmittingCreator = true;
          try {
            // 1. Ensure competitor profile is registered in database before crawling
            let createdCompetitorId = null;
            if (this.newCompetitorAlsoTrack || this.newCompetitorDiscoverPins) {
              const res = await window.apiFetch(this.getApiUrl('/api/creators'), {
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
                this.showToast('Failed to add creator: ' + (errData?.error || res.statusText || 'Error'));
                return;
              }
              const createData = await res.json().catch(() => ({}));
              createdCompetitorId = createData?.competitor?.id || null;
              this.showToast('Creator @' + handle + ' added to tracking!');
              // Await live profile sync before UI refresh
              await this.syncCompetitor(handle);
            }

            // 2. If discover pins immediately -> Dispatch to 20-Runner GitHub Actions Crawler
            if (this.newCompetitorDiscoverPins) {
              const crawlMode = this.newCompetitorDiscoverMode === 'deep' ? 'discovery' : 'refresh';
              const maxPages = this.newCompetitorDiscoverMode === 'deep' ? Math.min(10000, Math.max(1, Number(this.newCompetitorMaxPages) || 500)) : 3;
              this.showToast('Dispatching 20-runner GHA Crawler for @' + handle + ' (' + crawlMode + ' mode, ' + maxPages + ' pages)...');
              
              const resPins = await window.apiFetch(this.getApiUrl('/api/creators/dispatch-crawl'), {
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
                this.showToast(data?.message || '20-Runner Crawler dispatched on GitHub Actions!');
              } else {
                const errData = await resPins.json().catch(() => ({}));
                this.showToast('Crawler notice: ' + (errData?.error || resPins.statusText || 'Failed'));
              }
            }

            // Reset modal & refresh
            this.newCompetitorHandle = '';
            this.isAddCompetitorModalOpen = false;
            if (this.scopedFolderId) {
              await this.ensureCreatorLinkedToFolder(createdCompetitorId || handle, this.scopedFolderId);
              await this.loadFolderCreators(this.scopedFolderId);
            } else {
              await this.fetchCompetitors();
            }
          } catch (e) {
            this.showToast('Error tracking creator: ' + e.message);
          } finally {
            this.isSubmittingCreator = false;
            this.$nextTick(() => { if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons(); });
          }
        },

        async submitAddCompetitor() {
          return this.submitTrackCreatorUnified();
        },`;
}

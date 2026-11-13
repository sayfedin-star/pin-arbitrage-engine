/**
 * src/ui/dashboard/dashboard-client-seeds.mjs
 *
 * Modular Client Subsystem: Seed Selection, Filtering, Bulk Ingestion,
 * Crawl Dispatch & CSV Export Operations.
 * Extracted incrementally from dashboard-client-app.mjs (Phase 3 decomposition).
 */

export function getDashboardSeedComputedProperties() {
  return `        get bulkParsedPinIds() {
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
        },`;
}

export function getDashboardSeedActionMethods() {
  return `        toggleSeedSelection(pinId) {
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
              this.showToast('✅ Successfully imported ' + (data?.count || 0) + ' seeds into PostgreSQL!');
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
              this.showToast('🗑️ Deleted ' + (data?.deleted_count || 0) + ' seeds ' + (data?.purged_database ? '(PostgreSQL DB purged cleanly)' : ''));
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
        },`;
}

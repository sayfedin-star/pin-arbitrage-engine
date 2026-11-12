/**
 * src/ui/dashboard/dashboard-client-intersections.mjs
 *
 * Modular Client Subsystem: Candidate Filtering, Pixie Multi-Hit Intersections,
 * Hub Centroid Drawer Actions & Lightbox Navigation.
 * Extracted incrementally from dashboard-client-app.mjs (Phase 3 decomposition).
 */

export function getDashboardIntersectionsMethods() {
  return `        applyCandidateFilters(list, filters) {
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
        },`;
}

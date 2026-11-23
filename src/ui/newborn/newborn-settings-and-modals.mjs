/**
 * src/ui/newborn/newborn-settings-and-modals.mjs
 *
 * Wave 6D Settings Drawer & Interactive Overlays:
 * 1. Slide-Over Settings & Automation Drawer (`z-[60]`):
 *    - Filters & Rules (`Max Pin Age` 7d/14d/30d/60d/90d/custom, `Min Re-pins`, `Min Saves (0 = ignored)`),
 *    - Rule Profiles CRUD,
 *    - Cookie Vault (strictly redacted write-only Zone-A `_pinterest_sess`),
 *    - Surfaces & Opt-In Automation (`auto_track_enabled: false` and `auto_fetch_accounts: false` by default).
 * 2. Pin Dossier Slide-Over (`z-[65]`):
 *    - Verified Root Age + UTC Created, Re-pins (+Re-pins/day), Saves, Destination / No Link,
 *      Discovery Source, Pin Annotations, and On-Demand Account Reach (`Total audience` & `Impressions`).
 *    - Strictly ZERO Comments, Reactions, or Shares noise.
 * 3. Track Daily Modal (`z-[75]`): Explicit opt-in enrollment to `newborn_daily_anchors` + Campaign Folder.
 * 4. Rule Profile Modal (`z-[75]`): Create / Edit named hunt profiles.
 */

export function getNewbornSettingsAndModalsHtml() {
  return `
    <!-- Legacy slide-over settings drawer removed (centralized in /settings) -->

    <!-- ====================================================================== -->
    <!-- 2. CLEAN PIN DOSSIER SLIDE-OVER (z-[65] — High-Signal Core Metrics Only) -->
    <!-- ====================================================================== -->
    <template x-if="dossierOpen">
      <div class="fixed inset-0 z-[65] flex justify-end" role="dialog" aria-modal="true" aria-labelledby="newborn-dossier-title">
        <div class="fixed inset-0 bg-slate-900/40 backdrop-blur-[1px]" @click="dossierOpen = false"></div>

        <aside class="relative z-10 w-full max-w-xl bg-white dark:bg-[#121215] border-l border-slate-200 dark:border-[#27272A] h-full flex flex-col shadow-2xl">
          <div class="px-5 py-4 border-b border-slate-200 dark:border-[#27272A] flex items-center justify-between gap-3">
            <h2 id="newborn-dossier-title" class="text-sm font-bold text-slate-900 dark:text-[#FAFAFA] truncate" x-text="dossierData?.candidate?.title || 'Golden Pin Dossier'"></h2>
            <button type="button" @click="dossierOpen = false" aria-label="Close pin dossier" class="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer">
              <i data-lucide="x" class="w-4 h-4" aria-hidden="true"></i>
            </button>
          </div>

          <div class="flex-1 overflow-y-auto p-5 space-y-4">
            <template x-if="isLoadingDossier">
              <div class="py-12 text-center text-xs text-slate-500">Loading verified root pin details...</div>
            </template>

            <template x-if="!isLoadingDossier && dossierData?.candidate">
              <div class="space-y-4">
                <template x-if="dossierData.candidate.image_url">
                  <img :src="dossierData.candidate.image_url" :alt="dossierData.candidate.title || 'Golden Pin image'" width="480" height="360" loading="lazy" class="w-full max-h-72 object-cover rounded-xl bg-slate-100 dark:bg-[#18181B]" />
                </template>

                <!-- Primary Signal KPIs: Pin Age, Re-pins, Saves -->
                <div class="grid grid-cols-3 gap-2 text-center">
                  <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-[#18181B] border border-slate-200/80 dark:border-[#27272A]">
                    <div class="text-[10px] uppercase text-slate-500" x-text="settingsDraft?.qualification?.resolve_root_pin ? 'Root Age' : 'Pin Age'">Pin Age</div>
                    <div class="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-[#FAFAFA]" x-text="formatRootAge(dossierData.candidate.age_days)"></div>
                  </div>
                  <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-[#18181B] border border-slate-200/80 dark:border-[#27272A]">
                    <div class="text-[10px] uppercase text-slate-500">Re-pins</div>
                    <div class="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-[#FAFAFA]" x-text="formatNullableCount(dossierData.candidate.repin_count)"></div>
                    <div class="text-[10px] font-mono tabular-nums text-emerald-600 dark:text-emerald-400 font-semibold" x-text="formatVelocity(dossierData.candidate.repin_per_day)"></div>
                  </div>
                  <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-[#18181B] border border-slate-200/80 dark:border-[#27272A]">
                    <div class="text-[10px] uppercase text-slate-500">Saves</div>
                    <div class="text-sm font-bold font-mono tabular-nums text-slate-700 dark:text-[#E4E4E7]" x-text="formatNullableCount(dossierData.candidate.save_count)"></div>
                  </div>
                </div>

                <!-- Metadata & Opt-In Account Reach -->
                <div class="p-3.5 rounded-xl bg-slate-50 dark:bg-[#18181B] border border-slate-200/80 dark:border-[#27272A] space-y-2 text-xs">
                  <div class="flex justify-between gap-2"><span class="text-slate-500" x-text="settingsDraft?.qualification?.resolve_root_pin ? 'Root Created (UTC)' : 'Pin Created (UTC)'">Pin Created (UTC)</span><span class="font-mono tabular-nums" x-text="formatShortTimestamp(dossierData.candidate.created_at_pinterest)"></span></div>
                  <div class="flex justify-between gap-2"><span class="text-slate-500">Discovery Source</span><span class="font-semibold" x-text="formatSurfaceLabel(dossierData.candidate.run_surface || dossierData.candidate.first_surface)"></span></div>
                  <div class="flex justify-between gap-2"><span class="text-slate-500">Destination</span><span class="font-medium truncate max-w-[240px]" x-text="dossierData.candidate.is_linkless ? 'No Link / Linkless' : (dossierData.candidate.clean_domain || '—')"></span></div>
                  <div class="flex justify-between gap-2"><span class="text-slate-500">Pin Shares</span><span class="font-mono tabular-nums" x-text="formatNullableCount(dossierData.candidate.share_count)"></span></div>
                  <div class="flex justify-between gap-2"><span class="text-slate-500">Creation Method</span><span class="font-medium" x-text="formatCreationMethodLabel(dossierData.candidate.raw_creation_method) || '—'"></span></div>
                  <div class="flex justify-between gap-2"><span class="text-slate-500">Pin Type</span><span class="font-medium" x-text="dossierData.candidate.is_repin ? 'Repin' : 'Original'"></span></div>
                  <div class="pt-2 border-t border-slate-200/70 dark:border-[#27272A] flex items-center justify-between gap-2">
                    <div>
                      <div class="text-slate-500">Account Reach (Opt-In)</div>
                      <div class="font-mono tabular-nums text-slate-900 dark:text-[#FAFAFA] mt-0.5"
                           x-text="dossierData.candidate.creator_monthly_reach != null ? ('@' + (dossierData.candidate.effective_creator_username || 'creator') + ' · Total audience: ' + formatReach(dossierData.candidate.creator_monthly_reach) + (dossierData.candidate.creator_profile_views != null ? (' · Impressions: ' + formatReach(dossierData.candidate.creator_profile_views)) : '')) : 'Not pulled yet'"></div>
                    </div>
                    <button type="button"
                            @click="pullAccountReach([dossierData.candidate.pin_id], true)"
                            :disabled="Boolean(pullingAccountPins[dossierData.candidate.pin_id])"
                            class="px-2.5 py-1.5 rounded-lg border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 text-[11px] font-semibold cursor-pointer shrink-0">
                      <span x-text="pullingAccountPins[dossierData.candidate.pin_id] ? 'Pulling...' : 'Pull Account Reach'"></span>
                    </button>
                  </div>
                </div>

                <template x-if="extractPinAnnotationNames(dossierData.candidate).length > 0">
                  <div class="space-y-1.5">
                    <h3 class="text-xs font-semibold uppercase tracking-wider text-slate-500">Pin Annotations</h3>
                    <div class="flex flex-wrap gap-1.5">
                      <template x-for="tag in extractPinAnnotationNames(dossierData.candidate)" :key="tag">
                        <button type="button"
                                @click="dossierOpen = false; selectAnnotationFilter(tag)"
                                class="px-2 py-1 rounded-lg bg-slate-100 dark:bg-[#27272A] hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs text-slate-700 dark:text-[#E4E4E7] cursor-pointer"
                                x-text="tag"></button>
                      </template>
                    </div>
                  </div>
                </template>

                <div class="flex flex-wrap items-center gap-2 pt-2">
                  <a :href="'https://www.pinterest.com/pin/' + encodeURIComponent(dossierData.candidate.pin_id) + '/'"
                     target="_blank"
                     rel="noopener noreferrer"
                     class="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#27272A] text-xs font-semibold text-slate-700 dark:text-[#FAFAFA]">
                    View on Pinterest
                  </a>
                  <button type="button"
                          @click="dossierOpen = false; scrollRelatedPins([dossierData.candidate.pin_id])"
                          class="px-3.5 py-2 rounded-xl bg-slate-900 dark:bg-[#FAFAFA] text-white dark:text-[#09090B] text-xs font-semibold cursor-pointer">
                    Scroll Related
                  </button>
                  <button type="button"
                          @click="dossierOpen = false; openPromoteModal([dossierData.candidate.pin_id])"
                          class="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer">
                    Track Daily
                  </button>
                </div>
              </div>
            </template>
          </div>
        </aside>
      </div>
    </template>

    <!-- ====================================================================== -->
    <!-- 3. TRACK DAILY MODAL (z-[75] — Explicit Opt-In Enrollment)             -->
    <!-- ====================================================================== -->
    <template x-if="promoteModalOpen">
      <div class="fixed inset-0 z-[75] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="newborn-promote-modal-title">
        <div class="fixed inset-0 bg-slate-900/50 backdrop-blur-[1px]" @click="promoteModalOpen = false"></div>

        <div class="relative z-10 w-full max-w-md bg-white dark:bg-[#18181B] rounded-2xl border border-slate-200 dark:border-[#27272A] shadow-2xl p-5 space-y-4">
          <div class="flex items-center justify-between gap-2">
            <h2 id="newborn-promote-modal-title" class="text-base font-bold text-slate-900 dark:text-[#FAFAFA]">
              Track Daily <span class="font-mono tabular-nums text-rose-600" x-text="'(' + promotePinIds.length + ' pin' + (promotePinIds.length === 1 ? '' : 's') + ')'"></span>
            </h2>
            <button type="button" @click="promoteModalOpen = false" aria-label="Close Track Daily dialog" class="p-1 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer">
              <i data-lucide="x" class="w-4 h-4" aria-hidden="true"></i>
            </button>
          </div>

          <div class="space-y-3 text-xs">
            <label class="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50/70 dark:bg-[#121215] cursor-pointer">
              <input type="checkbox" x-model="promoteForm.promoteToDailySsot" class="mt-0.5 rounded text-rose-600 focus:ring-rose-500" />
              <div>
                <div class="font-semibold text-slate-900 dark:text-[#FAFAFA]">Enroll in 01:00 UTC Daily Velocity Tracking</div>
                <div class="text-[11px] text-slate-500">Registers in <code>universal_master_pins</code> and <code>newborn_daily_anchors</code>.</div>
              </div>
            </label>

            <label class="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50/70 dark:bg-[#121215] cursor-pointer">
              <input type="checkbox" x-model="promoteForm.promoteKeyword" class="mt-0.5 rounded text-rose-600 focus:ring-rose-500" />
              <div>
                <div class="font-semibold text-slate-900 dark:text-[#FAFAFA]">Track Top Pin Annotation as Keyword</div>
                <div class="text-[11px] text-slate-500">Adds the primary crossover annotation to your Keywords Radar.</div>
              </div>
            </label>

            <label class="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50/70 dark:bg-[#121215] cursor-pointer">
              <input type="checkbox" x-model="promoteForm.promoteClusterSeeds" class="mt-0.5 rounded text-rose-600 focus:ring-rose-500" />
              <div>
                <div class="font-semibold text-slate-900 dark:text-[#FAFAFA]">Add to Discovery Cluster Seeds</div>
                <div class="text-[11px] text-slate-500">Enrolls pin as a seed in the Cluster Intelligence graph.</div>
              </div>
            </label>

            <label class="block space-y-1">
              <span class="font-semibold text-slate-700 dark:text-[#E4E4E7]">Campaign Folder (Optional)</span>
              <select x-model="promoteForm.folderId" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#121215] text-xs">
                <option value="">No specific folder</option>
                <template x-for="f in foldersList" :key="f.id">
                  <option :value="String(f.id)" x-text="f.name"></option>
                </template>
              </select>
            </label>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-[#27272A]">
            <button type="button"
                    @click="stagePins(promotePinIds, 'watchlist'); promoteModalOpen = false"
                    class="px-3 py-2 rounded-xl border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 text-xs font-semibold cursor-pointer">
              Stage to Watchlist Only
            </button>
            <button type="button"
                    @click="submitPromotePins()"
                    :disabled="isPromoting"
                    class="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-xs font-semibold cursor-pointer"
                    x-text="isPromoting ? 'Enrolling...' : 'Start Daily Tracking'"></button>
          </div>
        </div>
      </div>
    </template>

    <!-- ====================================================================== -->
    <!-- 4. RULE PROFILE CREATE / EDIT MODAL (z-[75])                           -->
    <!-- ====================================================================== -->
    <template x-if="profileModalOpen">
      <div class="fixed inset-0 z-[75] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="newborn-profile-modal-title">
        <div class="fixed inset-0 bg-slate-900/50 backdrop-blur-[1px]" @click="profileModalOpen = false"></div>

        <form @submit.prevent="saveProfile()" class="relative z-10 w-full max-w-md bg-white dark:bg-[#18181B] rounded-2xl border border-slate-200 dark:border-[#27272A] shadow-2xl p-5 space-y-4">
          <div class="flex items-center justify-between gap-2">
            <h2 id="newborn-profile-modal-title" class="text-base font-bold text-slate-900 dark:text-[#FAFAFA]" x-text="profileForm.id ? 'Edit Rule Profile' : 'Create Rule Profile'"></h2>
            <button type="button" @click="profileModalOpen = false" aria-label="Close profile dialog" class="p-1 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer">
              <i data-lucide="x" class="w-4 h-4" aria-hidden="true"></i>
            </button>
          </div>

          <div class="space-y-3 text-xs">
            <label class="block space-y-1">
              <span class="font-semibold text-slate-700 dark:text-[#E4E4E7]">Profile Name</span>
              <input type="text" required x-model="profileForm.name" placeholder="e.g. 14-Day High Re-pin Recipes" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#121215]" />
            </label>
            <label class="block space-y-1">
              <span class="font-semibold text-slate-700 dark:text-[#E4E4E7]">Description</span>
              <input type="text" x-model="profileForm.description" placeholder="Short summary of when to use this profile" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#121215]" />
            </label>
            <div class="grid grid-cols-3 gap-2.5">
              <label class="block space-y-1">
                <span class="font-semibold text-slate-700 dark:text-[#E4E4E7]">Max Age (d)</span>
                <input type="number" min="1" max="365" x-model.number="profileForm.maxAgeDays" class="w-full px-2.5 py-2 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#121215] font-mono tabular-nums" />
              </label>
              <label class="block space-y-1">
                <span class="font-semibold text-slate-700 dark:text-[#E4E4E7]">Min Re-pins</span>
                <input type="number" min="0" x-model.number="profileForm.minRepins" class="w-full px-2.5 py-2 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#121215] font-mono tabular-nums" />
              </label>
              <label class="block space-y-1">
                <span class="font-semibold text-slate-700 dark:text-[#E4E4E7]">Min Saves</span>
                <input type="number" min="0" x-model.number="profileForm.minSaves" class="w-full px-2.5 py-2 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#121215] font-mono tabular-nums" />
              </label>
            </div>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" x-model="profileForm.linklessOnly" class="rounded text-rose-600 focus:ring-rose-500" />
              <span class="font-medium text-slate-700 dark:text-[#E4E4E7]">Only No Link / Linkless Pins</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" x-model="profileForm.isDefault" class="rounded text-rose-600 focus:ring-rose-500" />
              <span class="font-medium text-slate-700 dark:text-[#E4E4E7]">Set as Default Profile</span>
            </label>
          </div>

          <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-[#27272A]">
            <button type="button" @click="profileModalOpen = false" class="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#27272A] text-xs font-semibold cursor-pointer">Cancel</button>
            <button type="submit" :disabled="isSavingProfile" class="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-xs font-semibold cursor-pointer" x-text="isSavingProfile ? 'Saving...' : 'Save Profile'"></button>
          </div>
        </form>
      </div>
    </template>

    <!-- ====================================================================== -->
    <!-- 5. FLOATING CLUSTER BASKET BAR (z-[55])                                -->
    <!-- ====================================================================== -->
    <template x-if="clusterBasket.length > 0">
      <div id="discover-cluster-basket-bar"
           class="fixed bottom-4 left-4 right-4 md:left-72 lg:left-80 z-[55] max-w-5xl mx-auto rounded-2xl border border-slate-200 dark:border-[#27272A] bg-white/95 dark:bg-[#121215]/95 backdrop-blur-xl shadow-2xl p-3.5 space-y-2.5">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div class="flex items-center gap-2.5 min-w-0">
            <span class="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-rose-600 text-white shrink-0">
              <i data-lucide="shopping-basket" class="w-4 h-4" aria-hidden="true"></i>
            </span>
            <div class="min-w-0">
              <div class="text-xs font-bold text-slate-900 dark:text-[#FAFAFA]" x-text="'Cluster Basket (' + clusterBasket.length + ' selected)'">Cluster Basket</div>
              <div class="text-[11px] text-slate-500 dark:text-[#A1A1AA] truncate">Collect terms from Trends, Related Interests &amp; Build Cluster</div>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-2 shrink-0">
            <form @submit.prevent="addManualBasketKeyword()" class="flex items-center gap-1">
              <input type="text"
                     x-model="basketManualInput"
                     placeholder="+ Add keyword"
                     aria-label="Add custom keyword to Cluster Basket"
                     class="w-32 sm:w-40 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#18181B] text-xs text-slate-900 dark:text-[#FAFAFA] focus:outline-none focus:ring-2 focus:ring-rose-500" />
              <button type="submit" class="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] text-xs font-semibold text-slate-700 dark:text-[#FAFAFA] hover:bg-slate-100 dark:hover:bg-[#18181B] cursor-pointer">Add</button>
            </form>

            <button type="button"
                    @click="clearBasket()"
                    class="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer">
              Clear
            </button>

            <button type="button"
                    @click="launchBasketQuickHunt()"
                    :disabled="isLaunchingBasketHunt"
                    class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-indigo-200 dark:border-indigo-800/60 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-xs font-semibold transition cursor-pointer disabled:opacity-60">
              <i data-lucide="radar" class="w-3.5 h-3.5" aria-hidden="true"></i>
              <span x-text="isLaunchingBasketHunt ? 'Hunting...' : 'Quick Newborn Hunt'"></span>
            </button>

            <button type="button"
                    @click="openBasketCampaignModal()"
                    class="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-xs transition cursor-pointer">
              <i data-lucide="folder-plus" class="w-3.5 h-3.5" aria-hidden="true"></i>
              <span>Create / Add to Campaign</span>
            </button>
          </div>
        </div>

        <div class="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto pt-1 border-t border-slate-100 dark:border-[#27272A]">
          <template x-for="kw in clusterBasket" :key="kw">
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A] text-[11px] font-medium text-slate-700 dark:text-[#E4E4E7]">
              <span x-text="kw"></span>
              <button type="button" @click="removeFromBasket(kw)" :aria-label="'Remove ' + kw" class="text-slate-400 hover:text-rose-600 cursor-pointer">
                <i data-lucide="x" class="w-3 h-3" aria-hidden="true"></i>
              </button>
            </span>
          </template>
        </div>
      </div>
    </template>

    <!-- ====================================================================== -->
    <!-- 6. CREATE / ADD TO CAMPAIGN MODAL (z-[75])                             -->
    <!-- ====================================================================== -->
    <template x-if="basketCampaignModalOpen">
      <div class="fixed inset-0 z-[75] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="basket-campaign-modal-title">
        <div class="fixed inset-0 bg-slate-900/50 backdrop-blur-[1px]" @click="basketCampaignModalOpen = false"></div>

        <form @submit.prevent="submitBasketToCampaign()" class="relative z-10 w-full max-w-lg bg-white dark:bg-[#18181B] rounded-2xl border border-slate-200 dark:border-[#27272A] shadow-2xl p-5 space-y-4">
          <div class="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-[#27272A] pb-3">
            <div>
              <h2 id="basket-campaign-modal-title" class="text-base font-bold text-slate-900 dark:text-[#FAFAFA]">Create / Add to Campaign</h2>
              <p class="text-xs text-slate-500 dark:text-[#A1A1AA]" x-text="clusterBasket.length + ' keywords ready for daily SERP Pulse &amp; Newborn Hunt'"></p>
            </div>
            <button type="button" @click="basketCampaignModalOpen = false" aria-label="Close campaign modal" class="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer">
              <i data-lucide="x" class="w-4 h-4" aria-hidden="true"></i>
            </button>
          </div>

          <div class="space-y-3.5 text-xs">
            <div class="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] w-full">
              <button type="button"
                      @click="basketCampaignForm.mode = 'new'"
                      class="flex-1 py-1.5 rounded-lg font-semibold transition cursor-pointer"
                      :class="basketCampaignForm.mode === 'new' ? 'bg-white dark:bg-[#27272A] text-slate-900 dark:text-white shadow-2xs' : 'text-slate-500 dark:text-[#A1A1AA]'">
                Create New Campaign
              </button>
              <button type="button"
                      @click="basketCampaignForm.mode = 'existing'"
                      class="flex-1 py-1.5 rounded-lg font-semibold transition cursor-pointer"
                      :class="basketCampaignForm.mode === 'existing' ? 'bg-white dark:bg-[#27272A] text-slate-900 dark:text-white shadow-2xs' : 'text-slate-500 dark:text-[#A1A1AA]'">
                Add to Existing Campaign
              </button>
            </div>

            <template x-if="basketCampaignForm.mode === 'new'">
              <label class="block space-y-1">
                <span class="font-semibold text-slate-700 dark:text-[#E4E4E7]">Campaign Name</span>
                <input type="text"
                       required
                       x-model="basketCampaignForm.newName"
                       placeholder="e.g. Fall Soup Recipes 2026"
                       class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#121215] text-slate-900 dark:text-[#FAFAFA] focus:outline-none focus:ring-2 focus:ring-rose-500" />
              </label>
            </template>

            <template x-if="basketCampaignForm.mode === 'existing'">
              <label class="block space-y-1">
                <span class="font-semibold text-slate-700 dark:text-[#E4E4E7]">Select Campaign</span>
                <select required
                        x-model="basketCampaignForm.existingFolderId"
                        class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#121215] text-slate-900 dark:text-[#FAFAFA]">
                  <option value="">Choose a workspace campaign...</option>
                  <template x-for="f in foldersList" :key="f.id">
                    <option :value="f.id" x-text="f.name"></option>
                  </template>
                </select>
              </label>
            </template>

            <!-- Flexible Top N Daily Selector -->
            <div class="space-y-1.5">
              <div class="flex items-center justify-between">
                <span class="font-semibold text-slate-700 dark:text-[#E4E4E7]">Top N Daily SERP Pins per Keyword</span>
                <span class="font-mono tabular-nums text-[11px] text-slate-500" x-text="'Top ' + basketCampaignForm.serpTopN"></span>
              </div>
              <div class="flex items-center gap-1.5 flex-wrap">
                <template x-for="n in [10, 20, 30, 50]" :key="n">
                  <button type="button"
                          @click="basketCampaignForm.serpTopN = n"
                          class="px-3 py-1.5 rounded-lg text-xs font-mono font-semibold border transition cursor-pointer"
                          :class="Number(basketCampaignForm.serpTopN) === n ? 'bg-rose-600 border-rose-600 text-white' : 'bg-slate-50 dark:bg-[#121215] border-slate-200 dark:border-[#27272A] text-slate-700 dark:text-[#E4E4E7]'"
                          x-text="'Top ' + n"></button>
                </template>
                <input type="number"
                       min="5"
                       max="100"
                       x-model.number="basketCampaignForm.serpTopN"
                       aria-label="Custom Top N Daily count"
                       class="w-20 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#121215] text-xs font-mono tabular-nums" />
              </div>
            </div>

            <!-- Action Checkboxes -->
            <div class="space-y-2 p-3 rounded-xl bg-slate-50 dark:bg-[#121215] border border-slate-200 dark:border-[#27272A]">
              <label class="flex items-start gap-2.5 cursor-pointer">
                <input type="checkbox" x-model="basketCampaignForm.trackTopNDaily" class="mt-0.5 rounded border-slate-300 text-rose-600 focus:ring-rose-500" />
                <div>
                  <div class="font-semibold text-slate-900 dark:text-[#FAFAFA]">Track Top N SERP Daily (Pulse)</div>
                  <div class="text-[11px] text-slate-500 dark:text-[#A1A1AA]">Enroll Top N SERP pins per keyword into the campaign's daily velocity Pulse.</div>
                </div>
              </label>

              <label class="flex items-start gap-2.5 cursor-pointer pt-2 border-t border-slate-200/70 dark:border-[#27272A]">
                <input type="checkbox" x-model="basketCampaignForm.runNewbornDeepHunt" class="mt-0.5 rounded border-slate-300 text-rose-600 focus:ring-rose-500" />
                <div>
                  <div class="font-semibold text-slate-900 dark:text-[#FAFAFA]">Run Newborn Deep Hunt</div>
                  <div class="text-[11px] text-slate-500 dark:text-[#A1A1AA]">Immediately launch an all-surface Newborn hunt for these basket keywords linked to the campaign.</div>
                </div>
              </label>
            </div>
          </div>

          <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-[#27272A]">
            <button type="button" @click="basketCampaignModalOpen = false" class="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#27272A] text-xs font-semibold cursor-pointer">Cancel</button>
            <button type="submit"
                    :disabled="isSubmittingBasketCampaign"
                    class="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-xs font-semibold cursor-pointer"
                    x-text="isSubmittingBasketCampaign ? 'Saving...' : 'Save Campaign &amp; Run'"></button>
          </div>
        </form>
      </div>
    </template>
  `;
}

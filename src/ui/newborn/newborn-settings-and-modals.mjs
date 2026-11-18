/**
 * src/ui/newborn/newborn-settings-and-modals.mjs
 *
 * Renders:
 * 1. Room `settings`: Full-Power Settings, Named Rule Profiles, Redacted Zone-A Cookie Vault,
 *    8-Surface Controls, Qualification/Provenance Rules & Autonomous Schedule Control Center
 * 2. Modals & Drawers: Multi-Pillar Promote Modal, Candidate Dossier Slide-Over Drawer,
 *    and Rule Profile Create/Edit Modal
 */

export function getNewbornSettingsAndModalsHtml({ includeSettingsRoom = true, includeModals = true } = {}) {
  const settingsRoomHtml = includeSettingsRoom ? `
    <!-- ====================================================================== -->
    <!-- ROOM: FULL-POWER SETTINGS, PROFILES & AUTOMATION CONTROL CENTER        -->
    <!-- ====================================================================== -->
    <div x-show="currentRoom === 'settings'" class="space-y-6">
      <!-- Top Control Action Bar -->
      <div class="p-4 rounded-2xl bg-white dark:bg-[#121215] border border-[#E2E8F0] dark:border-[#27272A] shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div>
          <span class="text-[11px] font-bold uppercase tracking-wider text-[#E11D48] dark:text-rose-400">Dynamic Control Center (app_settings + newborn_rule_profiles)</span>
          <h2 class="text-base font-bold text-[#0F172A] dark:text-[#FAFAFA]">Qualification, 8-Surface Depth, Rule Profiles, Cookie Vault &amp; Automation</h2>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <button type="button"
                  @click="resetSettingsToDefaults()"
                  :disabled="isSavingSettings"
                  class="px-3 py-1.5 rounded-xl text-xs font-semibold border border-[#E2E8F0] dark:border-[#27272A] bg-[#F1F5F9] hover:bg-[#E2E8F0] dark:bg-[#18181B] dark:hover:bg-[#27272A] text-[#64748B] hover:text-[#0F172A] dark:text-[#A1A1AA] dark:hover:text-[#FAFAFA] transition cursor-pointer disabled:opacity-50">
            Reset Factory Defaults
          </button>

          <button type="button"
                  @click="openProfileModal(null)"
                  class="px-3 py-1.5 rounded-xl text-xs font-semibold border border-[#E2E8F0] dark:border-[#27272A] bg-white dark:bg-[#18181B] hover:bg-[#F1F5F9] text-[#0F172A] dark:text-[#FAFAFA] transition inline-flex items-center gap-1.5 cursor-pointer">
            <i data-lucide="plus" class="w-3.5 h-3.5 text-[#E11D48]"></i>
            <span>Save as New Profile</span>
          </button>

          <button type="button"
                  @click="saveGlobalSettings()"
                  :disabled="isSavingSettings"
                  class="px-4 py-1.5 rounded-xl text-xs font-semibold bg-[#E11D48] hover:bg-rose-500 text-white transition inline-flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50">
            <i data-lucide="save" class="w-3.5 h-3.5"></i>
            <span x-text="isSavingSettings ? 'Saving...' : 'Save Global Settings'">Save Global Settings</span>
          </button>
        </div>
      </div>

      <!-- Row 1 (Asymmetric 7/5): Named Rule Profiles + Redacted Zone-A Cookie Vault -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <!-- Named Rule Profiles Manager (7 cols) -->
        <div class="lg:col-span-7 bg-white dark:bg-[#121215] border border-[#E2E8F0] dark:border-[#27272A] rounded-2xl shadow-xs p-5 space-y-4">
          <div class="flex items-center justify-between gap-2">
            <div>
              <span class="text-[11px] font-bold uppercase tracking-wider text-[#64748B] dark:text-[#A1A1AA]">Flexible Presets &amp; Overrides</span>
              <h3 class="text-sm font-bold text-[#0F172A] dark:text-[#FAFAFA]">Named Rule Profiles</h3>
            </div>
            <button type="button"
                    @click="openProfileModal(null)"
                    class="px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-500/10 text-[#E11D48] dark:text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 transition cursor-pointer">
              + Create Profile
            </button>
          </div>

          <div class="space-y-2.5">
            <template x-for="prof in profiles" :key="'mgr-' + prof.id">
              <div class="p-3.5 rounded-xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                   :class="selectedProfileSlug === prof.slug ? 'bg-rose-50/60 dark:bg-rose-950/20 border-rose-300 dark:border-rose-500/40' : 'bg-[#F8FAFC] dark:bg-[#18181B] border-[#E2E8F0] dark:border-[#27272A]'">
                <div class="min-w-0 space-y-1">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="font-bold text-xs text-[#0F172A] dark:text-[#FAFAFA]" x-text="prof.name"></span>
                    <span class="text-[10px] font-mono text-[#64748B]" x-text="prof.slug"></span>
                    <template x-if="prof.is_default">
                      <span class="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300">Default</span>
                    </template>
                  </div>
                  <p class="text-[11px] text-[#64748B] dark:text-[#A1A1AA]" x-text="prof.description || 'Custom surface, qualification, and automation override profile.'"></p>
                </div>

                <div class="flex items-center gap-1.5 shrink-0">
                  <button type="button"
                          @click="loadProfileIntoDraft(prof.slug)"
                          class="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-white dark:bg-[#121215] border border-[#E2E8F0] dark:border-[#27272A] text-[#0F172A] dark:text-[#FAFAFA] hover:bg-[#F1F5F9] cursor-pointer">
                    Load
                  </button>
                  <button type="button"
                          @click="openProfileModal(prof)"
                          class="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-white dark:bg-[#121215] border border-[#E2E8F0] dark:border-[#27272A] text-[#0F172A] dark:text-[#FAFAFA] hover:bg-[#F1F5F9] cursor-pointer">
                    Edit
                  </button>
                  <template x-if="!prof.is_default">
                    <button type="button"
                            @click="deleteRuleProfile(prof)"
                            aria-label="Delete rule profile"
                            class="px-2 py-1 rounded-lg text-[11px] font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer">
                      Delete
                    </button>
                  </template>
                </div>
              </div>
            </template>
          </div>
        </div>

        <!-- Redacted Two-Zone Cookie Vault (5 cols) -->
        <div class="lg:col-span-5 bg-white dark:bg-[#121215] border border-[#E2E8F0] dark:border-[#27272A] rounded-2xl shadow-xs p-5 space-y-4">
          <div class="flex items-center justify-between gap-2">
            <div>
              <span class="text-[11px] font-bold uppercase tracking-wider text-[#64748B] dark:text-[#A1A1AA]">Zero-Secret-Leak Vault</span>
              <h3 class="text-sm font-bold text-[#0F172A] dark:text-[#FAFAFA]">Two-Zone Pinterest Cookie Health</h3>
            </div>
            <span class="px-2 py-0.5 rounded text-[10px] font-mono font-semibold border"
                  :class="cookieStatus.has_cookie ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300'"
                  x-text="cookieStatus.has_cookie ? '[CONFIGURED]' : 'GUEST ONLY'"></span>
          </div>

          <div class="p-3 rounded-xl bg-[#F8FAFC] dark:bg-[#18181B] border border-[#E2E8F0] dark:border-[#27272A] space-y-1.5 text-[11px]">
            <div class="flex items-center justify-between font-mono">
              <span class="text-[#64748B]">Routing Mode:</span>
              <span class="font-semibold text-[#0F172A] dark:text-[#FAFAFA]" x-text="cookieStatus.zone_routing_mode"></span>
            </div>
            <div class="flex items-center justify-between font-mono">
              <span class="text-[#64748B]">Credential Source:</span>
              <span class="text-[#0F172A] dark:text-[#FAFAFA]" x-text="cookieStatus.source || 'none'"></span>
            </div>
            <p class="text-[#64748B] dark:text-[#A1A1AA] pt-1">
              Zone 1 sends <code class="font-mono">_auth=1</code> strictly to <code class="font-mono">RelatedModulesResource</code>, <code class="font-mono">BoardFeedResource</code>, <code class="font-mono">BaseSearchResource(pins)</code> &amp; <code class="font-mono">BestPinsFeedAltResource</code>. Zone 2 strips all cookies on <code class="font-mono">PinResource</code>, <code class="font-mono">Pidgets</code>, <code class="font-mono">UserResource</code> &amp; <code class="font-mono">Trends</code> so <code class="font-mono">pin_join</code> annotations are never stripped.
            </p>
          </div>

          <div class="space-y-2.5">
            <label for="nb-cookie-vault-input" class="block text-[11px] font-bold uppercase tracking-wider text-[#64748B] dark:text-[#A1A1AA]">
              Paste _pinterest_sess Token or Full Cookie Header
            </label>
            <input id="nb-cookie-vault-input"
                   type="password"
                   autocomplete="off"
                   x-model="cookieDraftInput"
                   placeholder="TWc9PSZ... (stored server-side only, never returned)"
                   class="w-full px-3 py-2 text-xs font-mono rounded-xl bg-[#F1F5F9] dark:bg-[#18181B] border border-[#E2E8F0] dark:border-[#27272A] text-[#0F172A] dark:text-[#FAFAFA] focus:outline-none focus:ring-2 focus:ring-rose-500" />

            <label class="flex items-center gap-2 text-xs text-[#64748B] dark:text-[#A1A1AA] cursor-pointer">
              <input type="checkbox" x-model="alsoUpdateSharedCookie" class="rounded border-slate-300 text-[#E11D48] focus:ring-rose-500" />
              <span>Also mirror into shared <code class="font-mono">pinterest_cookie</code> for Related Crawlers</span>
            </label>

            <div class="flex items-center justify-between gap-2 pt-1">
              <button type="button"
                      @click="saveCookieToVault()"
                      :disabled="isSavingCookie || !cookieDraftInput.trim()"
                      class="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-[#E11D48] hover:bg-rose-500 text-white transition cursor-pointer disabled:opacity-50">
                <span x-text="isSavingCookie ? 'Saving...' : 'Save Session Cookie'">Save Session Cookie</span>
              </button>
              <template x-if="cookieStatus.has_cookie">
                <button type="button"
                        @click="clearCookieFromVault()"
                        :disabled="isSavingCookie"
                        class="px-3 py-1.5 rounded-xl text-xs font-semibold border border-rose-200 dark:border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition cursor-pointer">
                  Clear Cookie
                </button>
              </template>
            </div>
          </div>
        </div>
      </div>

      <!-- Row 2: Qualification, Age Presets, Provenance & Linkless Vacuum Controls -->
      <div class="bg-white dark:bg-[#121215] border border-[#E2E8F0] dark:border-[#27272A] rounded-2xl shadow-xs p-5 space-y-5">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-[#F1F5F9] dark:border-[#27272A] pb-3">
          <div>
            <span class="text-[11px] font-bold uppercase tracking-wider text-[#64748B] dark:text-[#A1A1AA]">Qualification &amp; Provenance Gate</span>
            <h3 class="text-sm font-bold text-[#0F172A] dark:text-[#FAFAFA]">Pin Age Window, Velocity Thresholds, Outlier Cap &amp; Linkless Vacuum</h3>
          </div>

          <!-- Age Window Presets (7d, 14d, 30d, 90d, custom) -->
          <div class="bg-[#F1F5F9] dark:bg-[#18181B] p-1 rounded-xl border border-[#E2E8F0] dark:border-[#27272A] flex items-center gap-1">
            <template x-for="ap in ['7d', '14d', '30d', '90d', 'custom']" :key="'ap-' + ap">
              <button type="button"
                      @click="applyAgePreset(ap)"
                      class="px-2.5 py-1 rounded-lg text-xs font-mono font-semibold uppercase transition cursor-pointer"
                      :class="settingsDraft.qualification.age_window_preset === ap ? 'bg-white dark:bg-[#27272A] text-[#E11D48] dark:text-rose-400 shadow-2xs' : 'text-[#64748B] dark:text-[#A1A1AA]'"
                      x-text="ap"></button>
            </template>
          </div>
        </div>

        <!-- Numeric Thresholds Grid -->
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <div>
            <label for="nb-q-min-age" class="block text-[11px] font-semibold text-[#64748B] dark:text-[#A1A1AA] mb-1">Min Age (Days)</label>
            <input id="nb-q-min-age" type="number" min="0" step="0.5" x-model.number="settingsDraft.qualification.min_age_days"
                   class="w-full px-3 py-1.5 text-xs font-mono tabular-nums rounded-xl bg-[#F1F5F9] dark:bg-[#18181B] border border-[#E2E8F0] dark:border-[#27272A]" />
          </div>
          <div>
            <label for="nb-q-max-age" class="block text-[11px] font-semibold text-[#64748B] dark:text-[#A1A1AA] mb-1">Max Age (Days)</label>
            <input id="nb-q-max-age" type="number" min="0.5" step="0.5" x-model.number="settingsDraft.qualification.max_age_days"
                   @input="settingsDraft.qualification.age_window_preset = 'custom'"
                   class="w-full px-3 py-1.5 text-xs font-mono tabular-nums rounded-xl bg-[#F1F5F9] dark:bg-[#18181B] border border-[#E2E8F0] dark:border-[#27272A]" />
          </div>
          <div>
            <label for="nb-q-min-repins" class="block text-[11px] font-semibold text-[#64748B] dark:text-[#A1A1AA] mb-1">Min Repins</label>
            <input id="nb-q-min-repins" type="number" min="0" x-model.number="settingsDraft.qualification.min_repin_count"
                   class="w-full px-3 py-1.5 text-xs font-mono tabular-nums rounded-xl bg-[#F1F5F9] dark:bg-[#18181B] border border-[#E2E8F0] dark:border-[#27272A]" />
          </div>
          <div>
            <label for="nb-q-min-saves" class="block text-[11px] font-semibold text-[#64748B] dark:text-[#A1A1AA] mb-1">Min Saves (Hydrated)</label>
            <input id="nb-q-min-saves" type="number" min="0" x-model.number="settingsDraft.qualification.min_save_count"
                   class="w-full px-3 py-1.5 text-xs font-mono tabular-nums rounded-xl bg-[#F1F5F9] dark:bg-[#18181B] border border-[#E2E8F0] dark:border-[#27272A]" />
          </div>
          <div>
            <label for="nb-q-min-repin-vel" class="block text-[11px] font-semibold text-[#64748B] dark:text-[#A1A1AA] mb-1">Min Repin / Day</label>
            <input id="nb-q-min-repin-vel" type="number" min="0" step="0.1" x-model.number="settingsDraft.qualification.min_repin_per_day"
                   class="w-full px-3 py-1.5 text-xs font-mono tabular-nums rounded-xl bg-[#F1F5F9] dark:bg-[#18181B] border border-[#E2E8F0] dark:border-[#27272A]" />
          </div>
          <div>
            <label for="nb-q-min-save-vel" class="block text-[11px] font-semibold text-[#64748B] dark:text-[#A1A1AA] mb-1">Min Save / Day</label>
            <input id="nb-q-min-save-vel" type="number" min="0" step="0.1" x-model.number="settingsDraft.qualification.min_save_per_day"
                   class="w-full px-3 py-1.5 text-xs font-mono tabular-nums rounded-xl bg-[#F1F5F9] dark:bg-[#18181B] border border-[#E2E8F0] dark:border-[#27272A]" />
          </div>
          <div>
            <label for="nb-q-min-shares" class="block text-[11px] font-semibold text-[#64748B] dark:text-[#A1A1AA] mb-1">Min Shares</label>
            <input id="nb-q-min-shares" type="number" min="0" x-model.number="settingsDraft.qualification.min_shares"
                   class="w-full px-3 py-1.5 text-xs font-mono tabular-nums rounded-xl bg-[#F1F5F9] dark:bg-[#18181B] border border-[#E2E8F0] dark:border-[#27272A]" />
          </div>
          <div>
            <label for="nb-q-min-comments" class="block text-[11px] font-semibold text-[#64748B] dark:text-[#A1A1AA] mb-1">Min Comments</label>
            <input id="nb-q-min-comments" type="number" min="0" x-model.number="settingsDraft.qualification.min_comments"
                   class="w-full px-3 py-1.5 text-xs font-mono tabular-nums rounded-xl bg-[#F1F5F9] dark:bg-[#18181B] border border-[#E2E8F0] dark:border-[#27272A]" />
          </div>
          <div>
            <label for="nb-q-min-reactions" class="block text-[11px] font-semibold text-[#64748B] dark:text-[#A1A1AA] mb-1">Min Reactions</label>
            <input id="nb-q-min-reactions" type="number" min="0" x-model.number="settingsDraft.qualification.min_reactions"
                   class="w-full px-3 py-1.5 text-xs font-mono tabular-nums rounded-xl bg-[#F1F5F9] dark:bg-[#18181B] border border-[#E2E8F0] dark:border-[#27272A]" />
          </div>
          <div>
            <label for="nb-q-max-flw" class="block text-[11px] font-semibold text-[#64748B] dark:text-[#A1A1AA] mb-1">Max Creator Followers</label>
            <input id="nb-q-max-flw" type="number" min="0" step="500" x-model.number="settingsDraft.qualification.max_creator_followers"
                   class="w-full px-3 py-1.5 text-xs font-mono tabular-nums rounded-xl bg-[#F1F5F9] dark:bg-[#18181B] border border-[#E2E8F0] dark:border-[#27272A]" />
          </div>
        </div>

        <!-- Provenance Sources, AI Disclosure & Linkless Vacuum -->
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 pt-3 border-t border-[#F1F5F9] dark:border-[#27272A]">
          <div class="lg:col-span-7 space-y-2.5">
            <span class="block text-[11px] font-bold uppercase tracking-wider text-[#64748B] dark:text-[#A1A1AA]">Allowed Upload Provenance Sources</span>
            <div class="flex flex-wrap gap-2">
              <template x-for="prov in validProvenances" :key="'chk-prov-' + prov">
                <button type="button"
                        @click="toggleAllowedProvenance(prov)"
                        class="px-2.5 py-1 rounded-lg text-[11px] font-mono font-semibold border transition cursor-pointer"
                        :class="settingsDraft.qualification.provenance.allowed_sources.includes(prov) ? 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/40' : 'bg-[#F1F5F9] dark:bg-[#18181B] text-[#64748B] border-[#E2E8F0] dark:border-[#27272A] line-through opacity-70'"
                        x-text="prov"></button>
              </template>
            </div>
            <div class="flex flex-wrap items-center gap-4 pt-1 text-xs text-[#0F172A] dark:text-[#FAFAFA]">
              <label class="inline-flex items-center gap-2 cursor-pointer">
                <input type="checkbox" x-model="settingsDraft.qualification.enforce_max_followers_filter" class="rounded border-slate-300 text-[#E11D48] focus:ring-rose-500" />
                <span>Hard-filter creators above Max Followers</span>
              </label>
              <label class="inline-flex items-center gap-2 cursor-pointer">
                <input type="checkbox" x-model="settingsDraft.qualification.provenance.exclude_products" class="rounded border-slate-300 text-[#E11D48] focus:ring-rose-500" />
                <span>Exclude Product Pins</span>
              </label>
              <label class="inline-flex items-center gap-2 cursor-pointer">
                <input type="checkbox" x-model="settingsDraft.qualification.provenance.exclude_videos" class="rounded border-slate-300 text-[#E11D48] focus:ring-rose-500" />
                <span>Exclude Video Pins</span>
              </label>
            </div>
          </div>

          <div class="lg:col-span-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label for="nb-ai-policy" class="block text-[11px] font-semibold text-[#64748B] dark:text-[#A1A1AA] mb-1">AI Disclosure</label>
              <select id="nb-ai-policy" x-model="settingsDraft.qualification.provenance.ai_disclosure_policy"
                      class="w-full px-2.5 py-1.5 text-xs rounded-xl bg-[#F1F5F9] dark:bg-[#18181B] border border-[#E2E8F0] dark:border-[#27272A]">
                <option value="exclude">Exclude AI</option>
                <option value="include">Allow AI</option>
                <option value="only">AI Only</option>
              </select>
            </div>
            <div>
              <label for="nb-vacuum-mode" class="block text-[11px] font-semibold text-[#64748B] dark:text-[#A1A1AA] mb-1">Linkless Vacuum</label>
              <select id="nb-vacuum-mode" x-model="settingsDraft.qualification.linkless_vacuum.mode"
                      class="w-full px-2.5 py-1.5 text-xs rounded-xl bg-[#F1F5F9] dark:bg-[#18181B] border border-[#E2E8F0] dark:border-[#27272A]">
                <option value="boost">Score Boost</option>
                <option value="only">Linkless Only</option>
                <option value="off">Off</option>
              </select>
            </div>
            <div>
              <label for="nb-vacuum-boost" class="block text-[11px] font-semibold text-[#64748B] dark:text-[#A1A1AA] mb-1">Vacuum Boost (+pts)</label>
              <input id="nb-vacuum-boost" type="number" min="0" max="50" x-model.number="settingsDraft.qualification.linkless_vacuum.score_boost"
                     class="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums rounded-xl bg-[#F1F5F9] dark:bg-[#18181B] border border-[#E2E8F0] dark:border-[#27272A]" />
            </div>
          </div>
        </div>
      </div>

      <!-- Row 3: 8-Surface Discovery Toggles, Fresh Board Age & Snowball Controls -->
      <div class="bg-white dark:bg-[#121215] border border-[#E2E8F0] dark:border-[#27272A] rounded-2xl shadow-xs p-5 space-y-5">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-[#F1F5F9] dark:border-[#27272A] pb-3">
          <div>
            <span class="text-[11px] font-bold uppercase tracking-wider text-[#64748B] dark:text-[#A1A1AA]">8-Surface Discovery &amp; RelatedModulesResource Snowball</span>
            <h3 class="text-sm font-bold text-[#0F172A] dark:text-[#FAFAFA]">Per-Surface Enablement, Pagination Caps, Board Freshness &amp; Default L1 Interest</h3>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label for="nb-disc-country" class="block text-[11px] font-semibold text-[#64748B] dark:text-[#A1A1AA] mb-1">Default Market Country</label>
            <select id="nb-disc-country" x-model="settingsDraft.discovery.country"
                    class="w-full px-3 py-1.5 text-xs font-mono rounded-xl bg-[#F1F5F9] dark:bg-[#18181B] border border-[#E2E8F0] dark:border-[#27272A]">
              <template x-for="c in supportedCountries" :key="'dc-' + c.code">
                <option :value="c.code" x-text="c.label"></option>
              </template>
            </select>
          </div>
          <div>
            <label for="nb-disc-interest" class="block text-[11px] font-semibold text-[#64748B] dark:text-[#A1A1AA] mb-1">Default L1 Interest (22 Sections)</label>
            <select id="nb-disc-interest" x-model="settingsDraft.discovery.default_l1_interest"
                    class="w-full px-3 py-1.5 text-xs rounded-xl bg-[#F1F5F9] dark:bg-[#18181B] border border-[#E2E8F0] dark:border-[#27272A]">
              <option value="all">All L1 Interests</option>
              <template x-for="cat in l1InterestsCatalog" :key="'di-' + cat.slug">
                <option :value="cat.slug" x-text="cat.label"></option>
              </template>
            </select>
          </div>
          <div>
            <label for="nb-disc-board-age" class="block text-[11px] font-semibold text-[#64748B] dark:text-[#A1A1AA] mb-1">Max Fresh Board Age (Days)</label>
            <input id="nb-disc-board-age" type="number" min="1" max="365" x-model.number="settingsDraft.discovery.max_board_age_days"
                   class="w-full px-3 py-1.5 text-xs font-mono tabular-nums rounded-xl bg-[#F1F5F9] dark:bg-[#18181B] border border-[#E2E8F0] dark:border-[#27272A]" />
          </div>
          <div>
            <label for="nb-disc-hyd-cap" class="block text-[11px] font-semibold text-[#64748B] dark:text-[#A1A1AA] mb-1">Max Pin Hydrations / Run</label>
            <input id="nb-disc-hyd-cap" type="number" min="5" max="2000" x-model.number="settingsDraft.discovery.hydration.max_pin_hydrations_per_run"
                   class="w-full px-3 py-1.5 text-xs font-mono tabular-nums rounded-xl bg-[#F1F5F9] dark:bg-[#18181B] border border-[#E2E8F0] dark:border-[#27272A]" />
          </div>
        </div>

        <!-- 8 Surfaces Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <template x-for="sf in surfacesCatalog" :key="'cfg-sf-' + sf.id">
            <div class="p-3.5 rounded-xl border transition space-y-2.5"
                 :class="settingsDraft.discovery.surfaces[sf.id]?.enabled ? 'bg-[#F8FAFC] dark:bg-[#18181B] border-[#E2E8F0] dark:border-[#27272A]' : 'bg-[#F8FAFC]/50 dark:bg-[#121215] border-[#E2E8F0]/60 dark:border-[#27272A]/60 opacity-65'">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <div class="text-xs font-bold text-[#0F172A] dark:text-[#FAFAFA] truncate" x-text="sf.label"></div>
                  <div class="text-[10px] font-mono text-[#64748B] truncate" x-text="sf.cookie_zone === 'zero_cookie' ? 'Zone 2: Zero-Cookie' : 'Zone 1: Auth (_auth=1)'"></div>
                </div>
                <input type="checkbox"
                       :aria-label="'Enable ' + sf.label"
                       x-model="settingsDraft.discovery.surfaces[sf.id].enabled"
                       class="rounded border-slate-300 text-[#E11D48] focus:ring-rose-500 cursor-pointer mt-0.5" />
              </div>

              <div class="flex items-center justify-between gap-2 pt-1 border-t border-[#E2E8F0]/70 dark:border-[#27272A]">
                <span class="text-[11px] text-[#64748B]">Max Pages / Depth</span>
                <input type="number"
                       min="1"
                       max="50"
                       :aria-label="sf.label + ' max pages'"
                       x-model.number="settingsDraft.discovery.surfaces[sf.id].max_pages"
                       class="w-16 px-2 py-1 text-xs font-mono tabular-nums text-right rounded-lg bg-white dark:bg-[#121215] border border-[#E2E8F0] dark:border-[#27272A]" />
              </div>
            </div>
          </template>
        </div>

        <!-- Snowball Controls -->
        <div class="p-4 rounded-xl bg-[#F8FAFC] dark:bg-[#18181B] border border-[#E2E8F0] dark:border-[#27272A] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-center">
          <label class="flex items-center gap-2.5 text-xs font-semibold text-[#0F172A] dark:text-[#FAFAFA] cursor-pointer">
            <input type="checkbox" x-model="settingsDraft.discovery.snowball.enabled" class="rounded border-slate-300 text-[#E11D48] focus:ring-rose-500" />
            <span>Auto-Expand Golden Snowball</span>
          </label>
          <div>
            <label for="nb-sb-hops" class="block text-[11px] font-semibold text-[#64748B] dark:text-[#A1A1AA] mb-1">Snowball Hop Depth (0–5)</label>
            <input id="nb-sb-hops" type="number" min="0" max="5" x-model.number="settingsDraft.discovery.snowball.max_hops"
                   class="w-full px-3 py-1.5 text-xs font-mono tabular-nums rounded-xl bg-white dark:bg-[#121215] border border-[#E2E8F0] dark:border-[#27272A]" />
          </div>
          <div>
            <label for="nb-sb-cap" class="block text-[11px] font-semibold text-[#64748B] dark:text-[#A1A1AA] mb-1">Top Golden Seed Cap (1–100)</label>
            <input id="nb-sb-cap" type="number" min="1" max="100" x-model.number="settingsDraft.discovery.snowball.seed_cap"
                   class="w-full px-3 py-1.5 text-xs font-mono tabular-nums rounded-xl bg-white dark:bg-[#121215] border border-[#E2E8F0] dark:border-[#27272A]" />
          </div>
          <div>
            <label for="nb-sb-minscore" class="block text-[11px] font-semibold text-[#64748B] dark:text-[#A1A1AA] mb-1">Min Golden Score to Seed</label>
            <input id="nb-sb-minscore" type="number" min="0" max="100" x-model.number="settingsDraft.discovery.snowball.min_seed_golden_score"
                   class="w-full px-3 py-1.5 text-xs font-mono tabular-nums rounded-xl bg-white dark:bg-[#121215] border border-[#E2E8F0] dark:border-[#27272A]" />
          </div>
        </div>
      </div>

      <!-- Row 4: Autonomous Tracking, UTC Window, Consecutive Days & Multi-Destination Auto-Promotion -->
      <div class="bg-white dark:bg-[#121215] border border-[#E2E8F0] dark:border-[#27272A] rounded-2xl shadow-xs p-5 space-y-5">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-[#F1F5F9] dark:border-[#27272A] pb-3">
          <div class="flex items-center gap-3">
            <label class="inline-flex items-center gap-2.5 text-sm font-bold text-[#0F172A] dark:text-[#FAFAFA] cursor-pointer">
              <input type="checkbox" x-model="settingsDraft.automation.auto_track_enabled" class="w-4 h-4 rounded border-slate-300 text-[#E11D48] focus:ring-rose-500" />
              <span>Master Autonomous Tracking &amp; Auto-Promotion</span>
            </label>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <button type="button"
                    @click="runAutoCycleNow()"
                    :disabled="isAutoRunning"
                    class="px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50">
              <i data-lucide="play" class="w-3.5 h-3.5"></i>
              <span x-text="isAutoRunning ? 'Executing...' : 'Run Auto-Cycle Now'">Run Auto-Cycle Now</span>
            </button>

            <button type="button"
                    @click="dispatchGitHubNewbornFleet()"
                    :disabled="isDispatchingFleet"
                    class="px-3 py-1.5 rounded-xl text-xs font-semibold border border-[#E2E8F0] dark:border-[#27272A] bg-[#F1F5F9] hover:bg-[#E2E8F0] dark:bg-[#18181B] text-[#0F172A] dark:text-[#FAFAFA] transition inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50">
              <i data-lucide="cloud" class="w-3.5 h-3.5 text-[#E11D48]"></i>
              <span x-text="isDispatchingFleet ? 'Dispatching...' : 'Dispatch GitHub Fleet'">Dispatch GitHub Fleet</span>
            </button>
          </div>
        </div>

        <!-- Schedule & UTC Window Controls -->
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <div>
            <label for="nb-auto-cadence" class="block text-[11px] font-semibold text-[#64748B] dark:text-[#A1A1AA] mb-1">Discovery Cadence</label>
            <select id="nb-auto-cadence" x-model="settingsDraft.automation.schedule.cadence"
                    class="w-full px-2.5 py-1.5 text-xs font-mono rounded-xl bg-[#F1F5F9] dark:bg-[#18181B] border border-[#E2E8F0] dark:border-[#27272A]">
              <option value="hourly">hourly (60m)</option>
              <option value="every_3h">every_3h (180m)</option>
              <option value="every_6h">every_6h (360m)</option>
              <option value="every_12h">every_12h (720m)</option>
              <option value="daily">daily (1440m)</option>
              <option value="custom">custom</option>
            </select>
          </div>
          <div>
            <label for="nb-auto-poll-int" class="block text-[11px] font-semibold text-[#64748B] dark:text-[#A1A1AA] mb-1">Watchlist Poll (Min)</label>
            <input id="nb-auto-poll-int" type="number" min="15" max="10080" x-model.number="settingsDraft.automation.schedule.watchlist_poll_interval_minutes"
                   class="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums rounded-xl bg-[#F1F5F9] dark:bg-[#18181B] border border-[#E2E8F0] dark:border-[#27272A]" />
          </div>
          <div>
            <label for="nb-auto-utc-start" class="block text-[11px] font-semibold text-[#64748B] dark:text-[#A1A1AA] mb-1">UTC Start Hour (0–23)</label>
            <input id="nb-auto-utc-start" type="number" min="0" max="23" x-model.number="settingsDraft.automation.schedule.target_window_utc.start_hour"
                   class="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums rounded-xl bg-[#F1F5F9] dark:bg-[#18181B] border border-[#E2E8F0] dark:border-[#27272A]" />
          </div>
          <div>
            <label for="nb-auto-utc-end" class="block text-[11px] font-semibold text-[#64748B] dark:text-[#A1A1AA] mb-1">UTC End Hour (0–23)</label>
            <input id="nb-auto-utc-end" type="number" min="0" max="23" x-model.number="settingsDraft.automation.schedule.target_window_utc.end_hour"
                   class="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums rounded-xl bg-[#F1F5F9] dark:bg-[#18181B] border border-[#E2E8F0] dark:border-[#27272A]" />
          </div>
          <div>
            <label for="nb-auto-cooldown" class="block text-[11px] font-semibold text-[#64748B] dark:text-[#A1A1AA] mb-1">Cooldown (Min)</label>
            <input id="nb-auto-cooldown" type="number" min="0" max="1440" x-model.number="settingsDraft.automation.schedule.cooldown_minutes"
                   class="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums rounded-xl bg-[#F1F5F9] dark:bg-[#18181B] border border-[#E2E8F0] dark:border-[#27272A]" />
          </div>
          <div>
            <label for="nb-auto-consec" class="block text-[11px] font-semibold text-[#64748B] dark:text-[#A1A1AA] mb-1">Consecutive Days</label>
            <input id="nb-auto-consec" type="number" min="1" max="30" x-model.number="settingsDraft.automation.pin_promotion_rules.promote_thresholds.min_consecutive_days"
                   class="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums rounded-xl bg-[#F1F5F9] dark:bg-[#18181B] border border-[#E2E8F0] dark:border-[#27272A]" />
          </div>
        </div>

        <!-- Auto-Promotion Targets & Thresholds -->
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 pt-3 border-t border-[#F1F5F9] dark:border-[#27272A]">
          <div class="lg:col-span-7 space-y-3">
            <span class="block text-[11px] font-bold uppercase tracking-wider text-[#64748B] dark:text-[#A1A1AA]">Pin Auto-Promotion Targets</span>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs text-[#0F172A] dark:text-[#FAFAFA]">
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" x-model="settingsDraft.automation.pin_promotion_rules.destinations.stage_to_watchlist" class="rounded border-slate-300 text-[#E11D48]" />
                <span>Stage qualified breakouts to Watchlist</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" x-model="settingsDraft.automation.pin_promotion_rules.destinations.promote_to_daily_ssot" class="rounded border-slate-300 text-[#E11D48]" />
                <span>Promote into SSOT + <code class="font-mono">newborn_daily_anchors</code></span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" x-model="settingsDraft.automation.pin_promotion_rules.destinations.promote_top_annotation_as_keyword" class="rounded border-slate-300 text-[#E11D48]" />
                <span>Auto-track Top Annotation as Keyword</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" x-model="settingsDraft.automation.pin_promotion_rules.destinations.promote_to_cluster_seeds" class="rounded border-slate-300 text-[#E11D48]" />
                <span>Seed into <code class="font-mono">cluster_seeds</code> (/discovery)</span>
              </label>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div>
                <label for="nb-promo-min-score" class="block text-[11px] font-semibold text-[#64748B] mb-1">Promote Golden Score</label>
                <input id="nb-promo-min-score" type="number" min="0" max="100" x-model.number="settingsDraft.automation.pin_promotion_rules.promote_thresholds.min_golden_score"
                       class="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums rounded-xl bg-[#F1F5F9] dark:bg-[#18181B] border border-[#E2E8F0] dark:border-[#27272A]" />
              </div>
              <div>
                <label for="nb-promo-min-repins" class="block text-[11px] font-semibold text-[#64748B] mb-1">Promote Min Repins</label>
                <input id="nb-promo-min-repins" type="number" min="0" x-model.number="settingsDraft.automation.pin_promotion_rules.promote_thresholds.min_repins"
                       class="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums rounded-xl bg-[#F1F5F9] dark:bg-[#18181B] border border-[#E2E8F0] dark:border-[#27272A]" />
              </div>
              <div>
                <label for="nb-promo-folder" class="block text-[11px] font-semibold text-[#64748B] mb-1">Target Campaign Folder</label>
                <select id="nb-promo-folder" x-model="settingsDraft.automation.pin_promotion_rules.destinations.promote_to_campaign_folder_id"
                        class="w-full px-2.5 py-1.5 text-xs rounded-xl bg-[#F1F5F9] dark:bg-[#18181B] border border-[#E2E8F0] dark:border-[#27272A]">
                  <option value="">None (Global SSOT)</option>
                  <template x-for="fl in foldersList" :key="'auto-fl-' + fl.id">
                    <option :value="fl.id" x-text="'#' + fl.id + ' ' + fl.name"></option>
                  </template>
                </select>
              </div>
            </div>
          </div>

          <!-- Rookie Creator Auto-Promotion into /accounts -->
          <div class="lg:col-span-5 p-4 rounded-xl bg-[#F8FAFC] dark:bg-[#18181B] border border-[#E2E8F0] dark:border-[#27272A] space-y-3">
            <label class="flex items-center justify-between text-xs font-bold text-[#0F172A] dark:text-[#FAFAFA] cursor-pointer">
              <span>Auto-Promote Rookie Accounts to Creator Hub (/accounts)</span>
              <input type="checkbox" x-model="settingsDraft.automation.rookie_promotion_rules.enabled" class="rounded border-slate-300 text-[#E11D48]" />
            </label>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label for="nb-rk-max-flw" class="block text-[11px] text-[#64748B] mb-1">Max Followers</label>
                <input id="nb-rk-max-flw" type="number" min="0" step="500" x-model.number="settingsDraft.automation.rookie_promotion_rules.max_followers"
                       class="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums rounded-lg bg-white dark:bg-[#121215] border border-[#E2E8F0] dark:border-[#27272A]" />
              </div>
              <div>
                <label for="nb-rk-min-reach" class="block text-[11px] text-[#64748B] mb-1">Min Total audience</label>
                <input id="nb-rk-min-reach" type="number" min="0" step="5000" x-model.number="settingsDraft.automation.rookie_promotion_rules.min_monthly_reach"
                       class="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums rounded-lg bg-white dark:bg-[#121215] border border-[#E2E8F0] dark:border-[#27272A]" />
              </div>
              <div>
                <label for="nb-rk-min-score" class="block text-[11px] text-[#64748B] mb-1">Min Rookie Score</label>
                <input id="nb-rk-min-score" type="number" min="0" max="100" x-model.number="settingsDraft.automation.rookie_promotion_rules.min_rookie_score"
                       class="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums rounded-lg bg-white dark:bg-[#121215] border border-[#E2E8F0] dark:border-[#27272A]" />
              </div>
              <div>
                <label for="nb-rk-mode" class="block text-[11px] text-[#64748B] mb-1">Tracking Mode</label>
                <select id="nb-rk-mode" x-model="settingsDraft.automation.rookie_promotion_rules.destination_tracking_mode"
                        class="w-full px-2.5 py-1.5 text-xs rounded-lg bg-white dark:bg-[#121215] border border-[#E2E8F0] dark:border-[#27272A]">
                  <option value="pulse_only">Pulse Only</option>
                  <option value="full">Full Catalog</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  ` : '';

  const modalsHtml = includeModals ? `
  <!-- ======================================================================== -->
  <!-- MODAL 1: MULTI-PILLAR PROMOTE MODAL (POST /api/newborn/promote)          -->
  <!-- ======================================================================== -->
  <div x-show="isPromoteModalOpen"
       x-cloak
       class="fixed inset-0 z-[70] bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-4"
       @click="isPromoteModalOpen = false">
    <div role="dialog"
         aria-modal="true"
         aria-labelledby="nb-promote-modal-title"
         @click.stop
         class="w-full max-w-lg rounded-2xl bg-white dark:bg-[#121215] border border-[#E2E8F0] dark:border-[#27272A] shadow-2xl p-5 space-y-4">
      <div class="flex items-center justify-between border-b border-[#F1F5F9] dark:border-[#27272A] pb-3">
        <div>
          <span class="text-[10px] font-mono uppercase tracking-wider text-[#E11D48] font-bold">Zero-Pollution Graduation</span>
          <h3 id="nb-promote-modal-title" class="text-sm font-bold text-[#0F172A] dark:text-[#FAFAFA]"
              x-text="'Promote ' + promoteForm.pinIds.length + ' Newborn Pin(s) Across Pillars'"></h3>
        </div>
        <button type="button"
                @click="isPromoteModalOpen = false"
                aria-label="Close promote modal"
                class="p-1.5 rounded-lg text-[#64748B] hover:text-[#0F172A] dark:hover:text-[#FAFAFA] cursor-pointer">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>

      <div class="space-y-3 text-xs">
        <label class="flex items-start gap-2.5 p-2.5 rounded-xl bg-[#F8FAFC] dark:bg-[#18181B] border border-[#E2E8F0] dark:border-[#27272A] cursor-pointer">
          <input type="checkbox" x-model="promoteForm.promoteToDailySsot" class="rounded border-slate-300 text-[#E11D48] mt-0.5" />
          <div>
            <div class="font-semibold text-[#0F172A] dark:text-[#FAFAFA]">Ingest into Master SSOT + 01:00 UTC Daily Velocity Anchors</div>
            <div class="text-[11px] text-[#64748B]">Writes to <code class="font-mono">universal_master_pins</code>, <code class="font-mono">pins_daily_metrics</code> &amp; <code class="font-mono">newborn_daily_anchors</code>.</div>
          </div>
        </label>

        <div>
          <label for="nb-modal-folder" class="block text-[11px] font-semibold text-[#64748B] mb-1">Assign to Campaign Folder (Optional)</label>
          <select id="nb-modal-folder" x-model="promoteForm.folderId"
                  class="w-full px-3 py-2 text-xs rounded-xl bg-[#F1F5F9] dark:bg-[#18181B] border border-[#E2E8F0] dark:border-[#27272A] text-[#0F172A] dark:text-[#FAFAFA]">
            <option value="">No Campaign Folder</option>
            <template x-for="fl in foldersList" :key="'mdl-fl-' + fl.id">
              <option :value="String(fl.id)" x-text="'#' + fl.id + ' — ' + fl.name"></option>
            </template>
          </select>
        </div>

        <div class="p-2.5 rounded-xl bg-[#F8FAFC] dark:bg-[#18181B] border border-[#E2E8F0] dark:border-[#27272A] space-y-2">
          <label class="flex items-center gap-2.5 cursor-pointer">
            <input type="checkbox" x-model="promoteForm.promoteKeyword" class="rounded border-slate-300 text-[#E11D48]" />
            <span class="font-semibold text-[#0F172A] dark:text-[#FAFAFA]">Track Primary Annotation / Custom Keyword in Keywords Fleet</span>
          </label>
          <template x-if="promoteForm.promoteKeyword">
            <div>
              <label for="nb-modal-kw" class="sr-only">Keyword override</label>
              <input id="nb-modal-kw" type="text" x-model="promoteForm.keyword"
                     placeholder="Leave blank to auto-derive top visual annotation"
                     class="w-full px-3 py-1.5 text-xs rounded-lg bg-white dark:bg-[#121215] border border-[#E2E8F0] dark:border-[#27272A]" />
            </div>
          </template>
        </div>

        <label class="flex items-center gap-2.5 p-2.5 rounded-xl bg-[#F8FAFC] dark:bg-[#18181B] border border-[#E2E8F0] dark:border-[#27272A] cursor-pointer">
          <input type="checkbox" x-model="promoteForm.promoteClusterSeeds" class="rounded border-slate-300 text-[#E11D48]" />
          <span class="font-semibold text-[#0F172A] dark:text-[#FAFAFA]">Register in <code class="font-mono">cluster_seeds</code> (/discovery Related Graph)</span>
        </label>

        <template x-if="promoteForm.availableUsernames.length > 0">
          <div class="p-2.5 rounded-xl bg-[#F8FAFC] dark:bg-[#18181B] border border-[#E2E8F0] dark:border-[#27272A] space-y-2">
            <label class="flex items-center gap-2.5 cursor-pointer">
              <input type="checkbox" x-model="promoteForm.alsoPromoteCreators" class="rounded border-slate-300 text-[#E11D48]" />
              <span class="font-semibold text-[#0F172A] dark:text-[#FAFAFA]"
                    x-text="'Also Track Origin Creator(s) in Creator Hub (' + promoteForm.availableUsernames.join(', ') + ')'"></span>
            </label>
          </div>
        </template>

        <div>
          <label for="nb-modal-notes" class="block text-[11px] font-semibold text-[#64748B] mb-1">Operator Notes</label>
          <input id="nb-modal-notes" type="text" x-model="promoteForm.notes"
                 placeholder="Optional arbitrage thesis or spoke angle..."
                 class="w-full px-3 py-1.5 text-xs rounded-xl bg-[#F1F5F9] dark:bg-[#18181B] border border-[#E2E8F0] dark:border-[#27272A]" />
        </div>
      </div>

      <div class="flex items-center justify-end gap-2 pt-2 border-t border-[#F1F5F9] dark:border-[#27272A]">
        <button type="button"
                @click="isPromoteModalOpen = false"
                class="px-3.5 py-2 rounded-xl text-xs font-semibold border border-[#E2E8F0] dark:border-[#27272A] bg-[#F1F5F9] dark:bg-[#18181B] text-[#0F172A] dark:text-[#FAFAFA] cursor-pointer">
          Cancel
        </button>
        <button type="button"
                @click="submitPromoteModal()"
                :disabled="isPromoting"
                class="px-4 py-2 rounded-xl text-xs font-semibold bg-[#E11D48] hover:bg-rose-500 text-white transition cursor-pointer disabled:opacity-50">
          <span x-text="isPromoting ? 'Promoting...' : 'Confirm Promotion'">Confirm Promotion</span>
        </button>
      </div>
    </div>
  </div>

  <!-- ======================================================================== -->
  <!-- MODAL 2: RULE PROFILE CREATE / EDIT MODAL                                -->
  <!-- ======================================================================== -->
  <div x-show="isProfileModalOpen"
       x-cloak
       class="fixed inset-0 z-[70] bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-4"
       @click="isProfileModalOpen = false">
    <div role="dialog"
         aria-modal="true"
         aria-labelledby="nb-profile-modal-title"
         @click.stop
         class="w-full max-w-md rounded-2xl bg-white dark:bg-[#121215] border border-[#E2E8F0] dark:border-[#27272A] shadow-2xl p-5 space-y-4">
      <div class="flex items-center justify-between border-b border-[#F1F5F9] dark:border-[#27272A] pb-3">
        <h3 id="nb-profile-modal-title" class="text-sm font-bold text-[#0F172A] dark:text-[#FAFAFA]"
            x-text="profileForm.id ? 'Update Rule Profile' : 'Create Rule Profile'"></h3>
        <button type="button" @click="isProfileModalOpen = false" aria-label="Close profile modal" class="p-1 text-[#64748B] cursor-pointer">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>

      <div class="space-y-3 text-xs">
        <div>
          <label for="nb-prof-name" class="block text-[11px] font-semibold text-[#64748B] mb-1">Profile Name</label>
          <input id="nb-prof-name" type="text" x-model="profileForm.name"
                 placeholder="e.g. Q4 Holiday Decor 14d Rockets"
                 class="w-full px-3 py-2 text-xs rounded-xl bg-[#F1F5F9] dark:bg-[#18181B] border border-[#E2E8F0] dark:border-[#27272A]" />
        </div>
        <div>
          <label for="nb-prof-desc" class="block text-[11px] font-semibold text-[#64748B] mb-1">Description</label>
          <textarea id="nb-prof-desc" rows="2" x-model="profileForm.description"
                    placeholder="Summarize surface, age, and provenance overrides..."
                    class="w-full px-3 py-2 text-xs rounded-xl bg-[#F1F5F9] dark:bg-[#18181B] border border-[#E2E8F0] dark:border-[#27272A]"></textarea>
        </div>
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" x-model="profileForm.is_default" class="rounded border-slate-300 text-[#E11D48]" />
          <span class="font-medium text-[#0F172A] dark:text-[#FAFAFA]">Set as Default Rule Profile</span>
        </label>
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" x-model="profileForm.snapshotCurrentSettings" class="rounded border-slate-300 text-[#E11D48]" />
          <span class="font-medium text-[#0F172A] dark:text-[#FAFAFA]">Snapshot current Control Center settings into profile</span>
        </label>
      </div>

      <div class="flex items-center justify-end gap-2 pt-2 border-t border-[#F1F5F9] dark:border-[#27272A]">
        <button type="button" @click="isProfileModalOpen = false" class="px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#F1F5F9] dark:bg-[#18181B] cursor-pointer">Cancel</button>
        <button type="button" @click="submitProfileModal()" :disabled="isSavingProfile" class="px-4 py-2 rounded-xl text-xs font-semibold bg-[#E11D48] hover:bg-rose-500 text-white cursor-pointer disabled:opacity-50">
          <span x-text="isSavingProfile ? 'Saving...' : 'Save Profile'">Save Profile</span>
        </button>
      </div>
    </div>
  </div>

  <!-- ======================================================================== -->
  <!-- DRAWER: CANDIDATE STAGING DOSSIER & CROSSOVER BLUEPRINT                  -->
  <!-- ======================================================================== -->
  <div x-show="isDossierOpen"
       x-cloak
       class="fixed inset-0 z-[75] bg-slate-950/60 backdrop-blur-xs flex justify-end"
       @click="isDossierOpen = false">
    <div role="dialog"
         aria-modal="true"
         aria-labelledby="nb-dossier-title"
         @click.stop
         class="w-full max-w-xl h-full bg-white dark:bg-[#121215] border-l border-[#E2E8F0] dark:border-[#27272A] shadow-2xl overflow-y-auto p-5 space-y-5">
      <div class="flex items-center justify-between border-b border-[#F1F5F9] dark:border-[#27272A] pb-3">
        <div>
          <span class="text-[10px] font-mono uppercase tracking-wider text-[#E11D48] font-bold">Newborn Candidate Dossier</span>
          <h3 id="nb-dossier-title" class="text-sm font-bold text-[#0F172A] dark:text-[#FAFAFA]"
              x-text="activeDossier?.candidate?.title || ('Pin #' + (activeDossier?.candidate?.pin_id || ''))"></h3>
        </div>
        <button type="button" @click="isDossierOpen = false" aria-label="Close candidate dossier" class="p-1.5 rounded-lg text-[#64748B] cursor-pointer">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>

      <template x-if="activeDossier && activeDossier.candidate">
        <div class="space-y-4 text-xs">
          <div class="flex items-start gap-4">
            <img :src="resolveThumb(activeDossier.candidate.image_url)"
                 @error="onImgErr($event)"
                 alt=""
                 class="w-24 h-32 rounded-xl object-cover border border-[#E2E8F0] dark:border-[#27272A] shrink-0" />
            <div class="space-y-1.5 min-w-0 flex-1">
              <div class="flex flex-wrap gap-1.5 font-mono text-[10px]">
                <span class="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300 font-bold"
                      x-text="'Golden ' + formatDecimal(activeDossier.candidate.golden_score, 1)"></span>
                <span class="px-2 py-0.5 rounded bg-[#F1F5F9] dark:bg-[#18181B]" x-text="activeDossier.candidate.stage"></span>
                <span class="px-2 py-0.5 rounded bg-[#F1F5F9] dark:bg-[#18181B]" x-text="activeDossier.candidate.upload_provenance"></span>
              </div>
              <div class="font-mono text-[11px] text-[#0F172A] dark:text-[#FAFAFA]">
                <span>Origin Creator:</span>
                <strong x-text="'@' + (activeDossier.candidate.origin_creator_username || activeDossier.candidate.effective_creator_username || 'unknown')"></strong>
              </div>
              <div class="font-mono text-[11px] text-[#64748B]">
                <span>Pinner:</span>
                <span x-text="'@' + (activeDossier.candidate.pinner_username || 'unknown')"></span>
              </div>
              <div class="flex flex-wrap gap-2 pt-2">
                <button type="button"
                        @click="snowballPinIds([activeDossier.candidate.pin_id])"
                        class="px-3 py-1.5 rounded-lg font-semibold bg-[#F1F5F9] dark:bg-[#18181B] text-[#0F172A] dark:text-[#FAFAFA] cursor-pointer">
                  Snowball Related
                </button>
                <button type="button"
                        @click="openPromoteModal([activeDossier.candidate])"
                        class="px-3 py-1.5 rounded-lg font-semibold bg-[#E11D48] text-white cursor-pointer">
                  Promote Pin
                </button>
                <a :href="safeHref('https://www.pinterest.com/pin/' + activeDossier.candidate.pin_id + '/')"
                   target="_blank"
                   rel="noopener noreferrer"
                   class="px-3 py-1.5 rounded-lg font-semibold border border-[#E2E8F0] dark:border-[#27272A] text-[#64748B]">
                  Pinterest
                </a>
              </div>
            </div>
          </div>

          <!-- Crossover Blueprint Summary -->
          <div class="p-3.5 rounded-xl bg-[#F8FAFC] dark:bg-[#18181B] border border-[#E2E8F0] dark:border-[#27272A] space-y-1.5">
            <div class="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">Crossover Blueprint</div>
            <div><span class="text-[#64748B]">Board Name:</span> <strong x-text="activeDossier.candidate.crossover_blueprint?.recommended_board_name || '—'"></strong></div>
            <div><span class="text-[#64748B]">Spoke Title:</span> <strong x-text="activeDossier.candidate.crossover_blueprint?.recommended_pin_title || '—'"></strong></div>
            <div><span class="text-[#64748B]">Slug:</span> <code class="font-mono" x-text="activeDossier.candidate.crossover_blueprint?.recommended_slug || '—'"></code></div>
          </div>

          <!-- Staging Trajectory Snapshots -->
          <div class="space-y-2">
            <div class="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">Staging Daily Trajectory</div>
            <div class="border border-[#E2E8F0] dark:border-[#27272A] rounded-xl overflow-hidden">
              <table class="w-full text-left font-mono tabular-nums text-[11px]">
                <thead class="bg-[#F1F5F9] dark:bg-[#18181B]">
                  <tr>
                    <th class="px-3 py-1.5">Date</th>
                    <th class="px-3 py-1.5 text-right">Saves</th>
                    <th class="px-3 py-1.5 text-right">Repins</th>
                    <th class="px-3 py-1.5 text-right">Repin/d</th>
                    <th class="px-3 py-1.5 text-right">Golden</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-[#F1F5F9] dark:divide-[#1E1E22]">
                  <template x-for="sn in (activeDossier.staging_trajectory || [])" :key="sn.recorded_date">
                    <tr>
                      <td class="px-3 py-1.5" x-text="sn.recorded_date"></td>
                      <td class="px-3 py-1.5 text-right" x-text="sn.save_count != null ? formatCeilingMetric(sn.save_count, false) : '—'"></td>
                      <td class="px-3 py-1.5 text-right" x-text="sn.repin_count != null ? formatCeilingMetric(sn.repin_count, false) : '—'"></td>
                      <td class="px-3 py-1.5 text-right" x-text="sn.repin_per_day != null ? ('+' + formatDecimal(sn.repin_per_day, 1)) : '—'"></td>
                      <td class="px-3 py-1.5 text-right" x-text="formatDecimal(sn.golden_score, 1)"></td>
                    </tr>
                  </template>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
  ` : '';

  return `${settingsRoomHtml}${modalsHtml}`;
}

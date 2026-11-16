# PAE Mandatory UI/UX Skills & Design Directives

> **Purpose:** Single Source of Truth (SSOT) ensuring UI/UX edits adhere strictly to `DESIGN.md` and the retained PAE UI skills (`web-design-guidelines` and `writing-guidelines`).
> **Enforcement Rule:** Review this rule and `DESIGN.md` before modifying `src/*-ui.mjs` or `src/ui/*.mjs`.

---

## 1. Trigger Files & Retained Skills
- **Trigger Files:** Any file under `src/*-ui.mjs`, `src/ui/*.mjs`, or `DESIGN.md`.
- **Retained Skills:**
  1. `.agents/skills/web-design-guidelines/SKILL.md` (Web accessibility, keyboard navigation, contrast, reduced motion)
  2. `.agents/skills/writing-guidelines/SKILL.md` (Voice, crisp SaaS microcopy, empty/error state clarity)

---

## 2. Design System & Token Parity (`DESIGN.md`)
- **Cockpit Dense SaaS Hierarchy:** Clean Swiss-grid alignment, high-legibility density, `Geist` sans display/body copy, and `JetBrains Mono` (`tabular-nums`) for all telemetry.
- **Default Light Theme (`:root`) & Optional Dark (`.dark`):**
  - Light: Canvas `#F8FAFC`, Cards `#FFFFFF` (`rounded-2xl`, `1px solid #E2E8F0`), Secondary `#F1F5F9`, Hover `#E2E8F0`, Primary Ink `#0F172A`, Steel `#64748B`, Muted `#94A3B8`, Deep Rose `#E11D48`, Emerald `#10B981`, Amber `#F59E0B`, Sky `#0EA5E9`.
  - Dark (`.dark` on `document.documentElement`): Canvas `#09090B`, Surface 1 `#121215`, Surface 2 `#18181B`, Border `#27272A`, Primary Ink `#FAFAFA`, Steel `#A1A1AA`, Muted `#71717A`.
- **Prohibited Patterns:** No neon/purple AI gradients, no pure `#000000` surfaces/borders, no `[class*="..."]` regex CSS hacks, and no `.dark` lock on `<body>`.

---

## 3. Accessibility & Web Engineering (`web-design-guidelines`)
- Enforce `font-mono tabular-nums` on numeric metrics, ranks, velocities, and dates.
- Maintain WCAG AA contrast across Light/Dark themes and clear `focus-visible` indicators.
- Support `Escape` dismissal (`@keydown.escape.window`), `role="dialog"`, `aria-modal="true"`, and `aria-labelledby` on drawers and modals.
- Respect `@media (prefers-reduced-motion: reduce)` (`motion-reduce:animate-none`).

---

## 4. Microcopy & Pinterest Terminology (`writing-guidelines`)
- Use crisp, actionable microcopy without filler words.
- Official Pinterest Business parity: `Profile Views` -> **`Impressions`**, `Monthly Reach` -> **`Total audience`**, Subsystem Title -> **`Creator Hub`**.

---

## 5. PAE Frontend Safety & Security Invariants
- **Headless Node.js Shield:** UI template files are evaluated by Node test scripts (`npm run check`, `npm test`). Guard `localStorage`, `window`, and `document` with `typeof ... !== 'undefined'`.
- **Theme Storage:** Unified on `pa_theme` (default `'light'`).
- **Asset Pinning & Sanitization (`scripts/audit_ui.mjs`):** Keep Alpine pinned to `3.14.8` and Lucide to `0.469.0`; wrap dynamic external URLs with `safeUrl()` and CSV exports with `sanitizeCsvCell()`.
- **Fetch Discipline:** Guard frontend API fetches with `AbortSignal.timeout(15000)`, check `res.ok`, and protect user flows from HTML `502`/`504` responses without calling `window.alert()`.

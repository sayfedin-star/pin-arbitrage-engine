# UI/UX & Design System Directives

> **Purpose:** Single Source of Truth (SSOT) aligning all UI/UX updates, colors, typography, and component patterns with `DESIGN.md`, `.agents/rules/ui-ux-skills-enforcement.md`, `web-design-guidelines`, and `writing-guidelines`.
> **Enforcement Rule:** Preserve semantic design tokens from `DESIGN.md` and existing Alpine.js / SSR module structure (`src/*-ui.mjs`, `src/ui/*.mjs`)—do NOT invent conflicting color systems or ad-hoc dark locks.

---

## 1. Design System Token Parity (`DESIGN.md`)
- **Default Light-Mode Bento SaaS (`:root`):**
  - Canvas `#F8FAFC`, Bento Cards `#FFFFFF` (`rounded-2xl`, `border-[#E2E8F0]`), Secondary `#F1F5F9`, Hover `#E2E8F0`, Primary Ink `#0F172A`, Steel Secondary `#64748B`, Deep Rose Accent `#E11D48`, Signal Emerald `#10B981`, Amber `#F59E0B`, Sky `#0EA5E9`.
- **Optional Dark Theme (`.dark`):**
  - Canvas `#09090B`, Surface `#121215`, Elevated `#18181B`, Border `#27272A`, Primary Ink `#FAFAFA`.
  - Theme storage unified on `pa_theme` (default `'light'`), toggling `.dark` on `document.documentElement` only (never hardcode `.dark` on `<body>`).
- **Typography & Tabular Stability:**
  - `Geist` sans for UI copy and `JetBrains Mono` (`font-mono tabular-nums`) for all numeric metrics, ranks, velocities, and dates.

---

## 2. Retained UI/UX Skills & Microcopy
- Use the retained skills in `.agents/skills/`:
  - `web-design-guidelines`: accessibility, keyboard `Escape` handling, ARIA attributes, `focus-visible`, and `prefers-reduced-motion`.
  - `writing-guidelines`: crisp, concise English SaaS microcopy and official Pinterest Business analytics labels (`Impressions`, `Total audience`, `Creator Hub`).

---

## 3. Architectural Non-Interference & Safety Invariants
- Preserve Fastify SSR lazy imports (`src/routes/pages.mjs`), Alpine `3.14.8` & Lucide `0.469.0` version pins (`scripts/audit_ui.mjs`), `safeUrl()`, and `sanitizeCsvCell()`.
- Guard all browser globals (`localStorage`, `window`, `document`) with `typeof ... !== 'undefined'` for headless Node checks.
- Wrap conditional `<template x-if>` contents in a single root `<div>` and bind mutating `fetch()` calls with `AbortSignal.timeout(15000)` + `res.ok` checks.

# Google Stitch UI/UX & Design Directives

> **Purpose:** Single Source of Truth (SSOT) enforcing that all UI/UX modifications, design systems, colors, typography, buttons, and page layouts rely strictly on Google Stitch in full harmony with `.agents/rules/ui-ux-skills-enforcement.md` and `DESIGN.md`.
> **Enforcement Rule:** The agent and any subagents MUST consult Google Stitch (via Stitch MCP and Stitch Agent Skills) alongside `ui-ux-pro-max`, `web-design-guidelines`, and `writing-guidelines` whenever designing, updating, or styling screens, components, colors, or page layouts—NEVER invent ad-hoc CSS or arbitrary hex colors.

---

## 1. Mandatory Reliance on Stitch & Design System Parity
- **Trigger Conditions:**
  - Creating new screens, views, or modal dialogs.
  - Modifying existing page layouts or responsive structure.
  - Adding or styling UI components (buttons, navigation bars, cards, badges, inputs, data tables).
  - Updating color palettes, theme tokens (Default Light / Optional Dark mode), typography, or spacing scales.
- **Protocol:**
  - **Do NOT** hand-code arbitrary hex colors, conflicting CSS classes, or uncoordinated styling.
  - **Always harmonize with the Design System:**
    1. Inspect the existing Stitch project and design system via Stitch MCP tools (`list_projects`, `get_design_system`, `list_design_systems`), the local `DESIGN.md`, and `.agents/rules/ui-ux-skills-enforcement.md`.
    2. Use the relevant Stitch skill (e.g. `stitch::generate-design`, `stitch::manage-design-system`, `stitch::react-components`, or `taste-design`) combined with `ui-ux-pro-max` to generate or adapt the UI elements.
    3. Ensure new buttons, cards, or colors use the canonical semantic tokens specified in `DESIGN.md` (Default Light-Mode Bento SaaS: Canvas `#F8FAFC`, Surface Cards `#FFFFFF` with `rounded-2xl` and `border-[#E2E8F0]`, Secondary `#F1F5F9`, Primary Ink `#0F172A`, Steel Secondary `#64748B`, Deep Rose `#E11D48`, Signal Emerald `#10B981`, Amber `#F59E0B`, Sky `#0EA5E9`; Optional Dark: Canvas `#09090B`, Surface `#121215`, Elevated `#18181B`, Primary Ink `#FAFAFA`) rather than hardcoded raw values.

---

## 2. Component, Token & Accessibility Parity
- **Bento SaaS Architectural Hierarchy:**
  - Primary UI modules follow an asymmetric Bento layout with `rounded-2xl` corners, `1px solid #E2E8F0` border in light mode (`#27272A` in dark mode), and subtle elevation shadow (`0 1px 3px 0 rgba(0, 0, 0, 0.04), 0 1px 2px -1px rgba(0, 0, 0, 0.04)`).
- **Buttons & Interactive Elements:**
  - State variants (hover, active, disabled, focus-ring) must follow Stitch component specifications and Web Interface Guidelines.
  - All interactive elements must adhere to standard contrast ratios (WCAG AA minimum) and explicit `focus-visible` indicators.
- **Color Palettes & Theme Integrity:**
  - The default theme is Light-Mode Bento SaaS (`:root`), with optional dark mode (`.dark`).
  - Theme storage is strictly unified on `pa_theme` (default `'light'`).
  - Eradicate regex CSS attribute hacks (`[class*="..."]`) and `.dark` body locks.
- **Typography & Tabular Stability:**
  - All numerical metrics, ranks, velocities, and dates must use tabular monospace (`font-mono tabular-nums`) as mandated in `DESIGN.md` and `ui-ux-skills-enforcement.md`.

---

## 3. Stitch Agent Skills Integration
- The agent has full access to the following Stitch skills in `.agents/skills/`:
  - `stitch-generate-design`: For creating and editing screens with enhanced professional prompts.
  - `stitch-react-components`: For converting Stitch screens into clean, modular React/Tailwind components.
  - `stitch-manage-design-system`: For managing project design tokens, assets, and themes.
  - `taste-design`: For anti-generic, high-craft aesthetic standards.
  - `design-md`: For extracting and maintaining the project's `DESIGN.md` single source of truth.
  - `ui-ux-pro-max`: For deep design intelligence, Swiss-grid layout, and dense data UI patterns.
  - `web-design-guidelines`: For accessibility, reduced motion, and interaction standards.
  - `writing-guidelines`: For clear microcopy and official Pinterest Business terminology.

---

## 4. Architectural Non-Interference & Safety Invariants
- When applying Stitch UI changes to this repository:
  - Do NOT disrupt backend queries, Neon shard routing, or edge prefetch rules.
  - Frontend components must connect cleanly to existing data hooks without stripping invariant safety guards.
  - Respect Rule 16 (functional replacer `content.replace(target, () => replacement)`) and Rule 17 (headless Node.js environment guards for browser globals like `localStorage`, `window`, and `document`).

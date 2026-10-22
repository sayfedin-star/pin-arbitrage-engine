# Google Stitch UI/UX & Design Directives

> **Purpose:** Single Source of Truth (SSOT) enforcing that all UI/UX modifications, design systems, colors, typography, buttons, and page layouts rely strictly on Google Stitch.
> **Enforcement Rule:** The agent and any subagents MUST consult Google Stitch (via Stitch MCP and Stitch Agent Skills) whenever designing, updating, or styling screens, components, colors, or page layouts—NEVER invent ad-hoc CSS or arbitrary hex colors.

---

## 1. Mandatory Reliance on Stitch for UI Changes
- **Trigger Conditions:**
  - Creating new screens, views, or modal dialogs.
  - Modifying existing page layouts or responsive structure.
  - Adding or styling UI components (buttons, navigation bars, cards, badges, inputs, data tables).
  - Updating color palettes, theme tokens (Dark/Light mode), typography, or spacing scales.
- **Protocol:**
  - **Do NOT** hand-code arbitrary hex colors, conflicting CSS classes, or uncoordinated styling.
  - **Always rely on Stitch** to establish or adhere to the design system:
    1. Inspect the existing Stitch project and design system via Stitch MCP tools (`list_projects`, `get_design_system`, `list_design_systems`) or the local `DESIGN.md`.
    2. Use the relevant Stitch skill (e.g. `stitch::generate-design`, `stitch::manage-design-system`, `stitch::react-components`, or `taste-design`) to generate or adapt the UI elements.
    3. Ensure new buttons, cards, or colors use semantic tokens (e.g. `primary`, `secondary`, `accent`, `surface`, `border`) mapped from Stitch rather than hardcoded raw values.

---

## 2. Component & Token Parity
- **Buttons & Interactive Elements:**
  - State variants (hover, active, disabled, focus-ring) must follow the Stitch component specifications.
  - All interactive elements must adhere to standard contrast ratios (WCAG AA minimum) derived from Stitch's color calibration.
- **Color Palettes & Theme Integrity:**
  - Color changes must be registered or synced with the Stitch Design System (`DESIGN.md` / `theme tokens`).
  - Colors must maintain clear semantic hierarchy: background, surface, elevated surface, muted text, primary text, brand accent, and status indicators (success, warning, danger).

---

## 3. Stitch Agent Skills Integration
- The agent has full access to the following Stitch skills in `.agents/skills/`:
  - `stitch-generate-design`: For creating and editing screens with enhanced professional prompts.
  - `stitch-react-components`: For converting Stitch screens into clean, modular React/Tailwind components.
  - `stitch-manage-design-system`: For managing project design tokens, assets, and themes.
  - `taste-design`: For anti-generic, high-craft aesthetic standards.
  - `design-md`: For extracting and maintaining the project's `DESIGN.md` single source of truth.

---

## 4. Architectural Non-Interference
- When applying Stitch UI changes to this repository:
  - Do NOT disrupt backend queries, Neon shard routing, or edge prefetch rules.
  - Frontend components must connect cleanly to existing data hooks without stripping invariant safety guards.

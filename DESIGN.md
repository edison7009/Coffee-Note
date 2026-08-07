# TierNote Desktop Design System

## Product Context

- **What this is:** A local-first, general-purpose note workspace where an editable T1-T5 list makes priorities visible and an AI note agent helps organize local material.
- **Who it is for:** People who want one calm place to collect, rank, read, and refine notes without giving up local ownership.
- **Project type:** Cross-platform desktop productivity application. The public `website/` is a separate branded product surface and does not inherit these desktop rules.

## Aesthetic Direction

- **Direction:** Calm native workspace, informed by Codex rather than copied from it.
- **Decoration:** Minimal. Hierarchy comes from type, whitespace, alignment, and state, not colorful cards or ornamental chrome.
- **Hover tooltips:** Prohibited inside the desktop app — including native
  `title` attributes, which must never appear in the app DOM (we are not a
  website). Information belongs inline or behind an explicit click; `aria-label`
  stays for assistive technology. This rule does not apply to the public
  `website/`. Non-interactive readouts (like the AI composer model ID) are
  plain text: no cursor change, no hover highlight, no tooltip.
- **Cursor:** The desktop app uses only the system default arrow cursor
  everywhere. No `cursor: pointer` (hand), grab, help, wait, or resize cursors —
  including buttons, navigation, drag handles, and pane resizers. Hover states
  are communicated by background/color, never by the cursor. Text fields keep
  the browser-native I-beam.
- **Mood:** Serious, quiet, capable, and spacious. TierNote should feel like a professional work surface, not a personalized dashboard template.
- **Memorable quality:** A Codex-like note tool whose primary object is the user's tiered knowledge, not chat.
- **References:** `references/pasture/` for a permissively licensed Tauri + React Codex client; `references/palot/` for sidebar and conversation-system organization only.

## Product Structure

- Keep the homepage tier list as the core first screen.
- Use one outer shell for the top bar and persistent left navigation rail.
- Let the shared title bar span the full window width. Place the 16 x 16 product icon and the closed `TierNote` wordmark at its left edge, followed by back/forward navigation and the File, Edit, and Help menus. On macOS, reserve clearance for native traffic-light controls.
- Start the left rail below the title bar with Home as its first row. Do not repeat the product icon, wordmark, or a separate folder action in that row; library switching belongs in the File menu.
- Place the center workspace and right contextual rail inside one continuous inner panel. Its top-left border and radius are the primary visual boundary; the right rail is not a second sidebar.
- Treat AI chat as one workspace mode, not the visual identity of the whole product.
- Keep the composer in a stable bottom row when chat is active.
- Remove redundant dashboard cards, helper copy, metrics decoration, and duplicated labels as each screen is migrated.
- Prefer one clear action per region. Secondary actions use familiar icons from Lucide.

## Typography

- **UI and body target:** Source Sans 3 with Noto Sans SC for Chinese coverage. Self-host before switching production CSS.
- **Current migration fallback:** Segoe UI Variable, Segoe UI, Noto Sans SC, Microsoft YaHei, sans-serif.
- **Data:** Use tabular numerals for token, cost, date, and count values.
- **Scale:** 16px body, 20px section title, 28-32px page title; 15px left
  navigation (matches the EchoBird sister app); 14px directory/file tree and
  controls; 13px minimum for all readable/interactive UI text; 12px metadata
  floor for counts, shortcuts, timestamps, and tiny badges only.
- **Minimum size rule:** No readable desktop UI text below **13px** and nothing
  below **12px** anywhere. If a component cannot fit its label at 13px, enlarge
  the component; never shrink the type to fit.
- **Weight:** Use 400 for body, 550-600 for controls and navigation, and 650-700 only for page titles.
- **Letter spacing:** 0. Avoid uppercase tracking except tiny technical metadata.
- **Brand exception:** The compact title-bar `TierNote` wordmark reuses the bundled `Lora` bold-italic face from the AI-chat identity at 16px.

## Color

- **Approach:** Codex/iOS surface hierarchy. Shell controls, icons, and text stay monochrome; a barely tinted environmental surface separates navigation from the white work area without becoming a brand color. The homepage alone may use restrained category color to make its core prioritization model memorable.
- **Light:** ink `#2c2c2e`, muted `#77777b`, canvas `#ffffff`, sidebar `#f0f5f0`, grouped surface `#f7f7f5`, line `rgba(60, 60, 67, 0.12)`.
- **Interaction:** graphite `#3a3b3d`; hover `#252628`; soft state `rgba(58, 59, 61, 0.07)`.
- **Dark:** canvas `#1c1c1e`, sidebar `#242426`, ink and interaction `#f2f2f7` / `#d1d1d6`.
- **Semantic color:** Reserve red, amber, and green for errors, warnings, and success only. Do not use semantic colors as branding or decoration.
- **Tier color:** T1-T5 use muted rose, amber, yellow, teal, and green. Color stays in the homepage tier strip and softly tinted label cells; it does not enter navigation, reading, or settings surfaces.

## Spacing And Shape

- **Base unit:** 4px.
- **Density:** Comfortable and work-focused: 8px between related controls, 16px within regions, 24-32px between major regions.
- **Radius:** 4px for compact controls, 7px for inputs and list selections, 8px maximum for cards and dialogs. Pills are reserved for statuses.
- **Borders:** Use only for pane boundaries, inputs, dialogs, and meaningful grouping. Avoid cards inside cards.
- **Shadows:** Dialogs and floating menus only. Main page regions stay flat.

## Motion

- **Approach:** Minimal and functional.
- **Timing:** 90ms for hover/focus changes, 150-200ms for panels and dialogs.
- **Behavior:** No decorative movement, scale-on-hover, or animated gradients. Respect reduced-motion settings.

## Migration Order

1. Establish the monochrome interaction system and neutralize the title bar.
2. Rebuild the app shell and left navigation around a Codex-like quiet hierarchy.
3. Simplify the homepage so the tier list dominates and dashboard cards disappear.
4. Unify note reading and AI chat inside the same center-workspace grammar.
5. Rework the right rail as contextual information that can collapse when it is not useful.

## Decisions Log

| Date | Decision | Rationale |
| --- | --- | --- |
| 2026-08-07 | Adopt a Codex-informed desktop direction | The current multi-color dashboard treatment makes the product feel smaller and less focused than the local-first tiered-note model deserves. |
| 2026-08-07 | Remove accent-color customization | One fixed visual system reduces noise and prevents user themes from fragmenting the product identity. |
| 2026-08-07 | Join the top bar to the left rail and the center to the right rail | This reproduces the spatial grammar the user values in Codex: one quiet navigation shell around one coherent work surface. |
| 2026-08-07 | Make the desktop product monochrome | Neutral black and gray give the repeated-use workspace broader appeal; color is reserved for semantic feedback rather than branding. |
| 2026-08-07 | Adopt Codex/iOS surface colors | A soft environmental sidebar, white work surface, warm grouped controls, and dark-gray type remove the cold electronic-screen feeling while keeping icons and emphasis monochrome. |
| 2026-08-07 | Make the homepage the color exception | Three low-saturation entry cards and muted T1-T5 colors give the core screen identity while the repeated-use shell and note-reading surfaces stay quiet. |
| 2026-08-07 | Keep website design separate | The public site is expressive brand communication; the desktop app is a repeated-use work surface. |
| 2026-08-07 | Enforce a minimum type scale | Left navigation, directory tree, and right-rail text at 10-13px was too small to read. Floor: 13px readable / 12px metadata; 15px navigation (EchoBird reference), 14px directory tree. |
| 2026-08-08 | Use only the default arrow cursor everywhere | A hand cursor is a web pattern; the desktop shell keeps a single native cursor so no element implies clickability beyond its hover state. |
| 2026-08-08 | Move the product identity and app menus into the shared title bar | A compact 16 x 16 icon, Lora bold-italic `TierNote` wordmark, page history, and File/Edit/Help menus match the native Codex-like shell while letting Home align directly with the workspace top edge. |

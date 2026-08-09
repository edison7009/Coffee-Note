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
- **Cursor:** The desktop app uses the system default arrow cursor for ordinary
  controls and drag-and-drop content. Text fields keep the browser-native I-beam.
  The two pane resizers are the only resize-cursor exception: use `col-resize`
  both while hovering over a divider and throughout an active pane resize.
- **Mood:** Serious, quiet, capable, and spacious. TierNote should feel like a professional work surface, not a personalized dashboard template.
- **Memorable quality:** A Codex-like note tool whose primary object is the user's tiered knowledge, not chat.
- **References:** `references/pasture/` for a permissively licensed Tauri + React Codex client; `references/palot/` for sidebar and conversation-system organization only.

## Product Structure

- Keep the homepage tier list as the core first screen.
- The Home greeting may include one compact animated weather mark on its right.
  Home shows only the condition image: no city, temperature, forecast text,
  provider name, enclosing card, or dashboard treatment. An explicit click opens
  a read-only lightweight detail panel containing only current conditions and several
  forecast days. Its title and city share the action row, where a gear opens
  Settings > Appearance directly. City search, recent cities, one-time device
  location and source attribution live only there. Once configured, weather stays
  enabled as part of Home; users switch cities rather than removing the feature. Never request
  location on launch. The
  desktop prohibition on hover tooltips still applies to this mark. Treat the
  mark as an absolutely positioned background element: it never consumes layout
  width or compresses the greeting, and may sit behind the greeting when the
  center workspace becomes narrow. Keep a small inset from the top-right edge
  and allow the weather canvas to overflow so halos and clouds are never clipped.
  Settings keeps up to ten deduplicated recent cities locally as direct text
  actions. Multi-word names remain intact and the row wraps only between cities;
  do not spend space on generic location-privacy helper copy.
- Use one outer shell for the top bar and persistent left navigation rail.
- Let the shared title bar span the full window width. Place the 16 x 16 product icon and the closed `TierNote` wordmark at its left edge, followed by back/forward navigation and the File, Edit, and Help menus. On macOS, reserve clearance for native traffic-light controls.
- Start the left rail below the title bar with Home as its first row. Do not repeat the product icon or wordmark there. Library switching remains in the File menu and is also exposed as a discoverable global-action icon at the right edge of the Home row, matching the placement of global actions such as search in Codex.
- Leave a modest top inset above the Home row so the left rail breathes under the title bar rather than feeling pinned to it.
- Place the center workspace and right contextual rail inside one continuous inner panel. Its top-left border and radius are the primary visual boundary; the right rail is not a second sidebar.
- Keep the left navigation pane within its 210-380px range. The right contextual rail has no product-level maximum; its only upper bound is the remaining window width after preserving the main workspace's 560px minimum.
- Treat AI chat as one workspace mode, not the visual identity of the whole product.
- Treat Settings as another global workspace mode, opened from the Settings text
  action immediately to the right of Help in the title-bar menu. Do not duplicate
  this action beside the window controls.
  Below the shared title bar, replace the normal left rail with a settings navigation
  rail and merge the center workspace plus contextual right rail into one continuous,
  scrollable settings surface. Settings is not a modal and uses no backdrop or floating
  dialog boundary. Keep model and appearance as distinct pages. Library switching
  already belongs to the Home row and File menu and is not duplicated here.
  All settings scroll surfaces use the same narrow, transparent-track, low-contrast
  scrollbar treatment as the main workspace; avoid native heavy scrollbar chrome.
  Keep the settings navigation rail compact at 220px on the ordinary desktop layout.
  Name its model destination Models to match common AI app settings language, and
  keep the version and Feedback actions together on one unwrapped footer row.
  Appearance is one continuous grouped surface rather than three distant cards:
  theme and language use compact label/control rows, followed by a structured
  Weather forecast section with the current-city readout at the header's right,
  recent cities below, and the current-location action beside city search. Provider attribution belongs in the section's
  introductory sentence rather than consuming its own row. Weather has no
  removal action; selecting another city replaces the current one.
- Model settings use a directory/detail split inside the model page: searchable
  providers on the left and one provider's URL, local key, protocol note,
  and selectable models on the right. Provider marks are compact monochrome
  identifiers, not decorative cards. Show only the catalog's canonical provider
  display name; never repeat its lowercase/internal provider ID beneath it, including
  in the composer model menu. Keep OpenAI-compatible as the ordinary path;
  only the official Anthropic provider uses its native Messages API, indicated by
  a short inline note rather than a control. Model rows may show technical metadata at the 12px floor (model
  ID, context size, and input/output price), while actions and names remain 13px
  or larger. Keep the default provider first in the directory, followed by every
  provider with selected models, then the untouched catalog entries. A compact
  Add custom action in the provider directory asks for a custom name and creates
  an OpenAI-compatible local provider whose model IDs are entered manually. Custom
  providers stay grouped at the top and use a neutral cube mark. Their details
  replace the catalog documentation action with a trash action;
  the explicit trash action deletes immediately and removes only that provider's
  local configuration.
  Manually entered model IDs are local records and show the ID once, with no guessed
  name, icon, or price. Adding one enables it immediately; it uses the same checkbox
  interaction as catalog models, while a dedicated trash action removes its saved
  local record. Unchecking only removes it from the composer. A catalog refresh must
  never remove or hide a
  locally saved model, including one newly marked deprecated upstream.
  The AI composer exposes only models selected here. Every reasoning-capable
  model gets TierNote's fixed five effort levels (low, medium, high, xhigh, max);
  models.dev reasoning-option metadata must not filter or clamp them. A provider's model list always expands in
  full inside the outer settings scroller; do not cap its result count or add a
  nested model-list scrollbar. Non-default providers show a count only when at
  least one model is selected; never render a zero badge. The composer model
  readout must come only from the provider's explicitly selected model list;
  never fall back to a seeded or example model ID.
- On My Contexts (`我的设定`), use five direct-entry content cards with independent retrieval
  switches, all enabled by default. Cards have no selected state: their light
  surface remains `#f1f1f1` during hover and navigation, with a neutral dark-mode
  counterpart. Reserve system blue for the enabled switch track; Add Material is
  an action and has no retrieval switch.
- Keep the composer in a stable bottom row when chat is active.
- Reserve matching scrollbar gutters on both sides of the center scroll area so
  page content remains optically centered and aligns with the fixed composer.
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
- **Tier color:** T1-T5 use muted rose, amber, yellow, teal, and green. Color stays in the homepage tier strip, softly tinted label cells, the compact note priority button, and the menu's small tier swatches; it does not enter navigation, article content, or settings surfaces. The priority button keeps its tier-tinted background unchanged on hover/open. Menu hover and selection use one neutral background with no colored border or glow.

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
- **Home weather exception:** Tiny condition-specific motion may communicate the
  current weather inside the greeting readout: slow cloud drift and sparse rain
  or snow only. It stops under reduced-motion preferences and must remain lower
  contrast than the greeting and tier list. Do not animate the surrounding page.

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
| 2026-08-08 | Use the default arrow except for pane resizing | A hand cursor is a web pattern; ordinary controls and content keep the default arrow, while the dividers between the three panes use native directional feedback during resize. |
| 2026-08-08 | Move the product identity and app menus into the shared title bar | A compact 16 x 16 icon, Lora bold-italic `TierNote` wordmark, page history, and File/Edit/Help menus match the native Codex-like shell while letting Home align directly with the workspace top edge. |
| 2026-08-08 | Gate My Contexts retrieval per note | Five default-on local switches make AI inclusion explicit; a backend allowlist enforces the same state for question-aware and always-on personal context. Cards remain direct neutral navigation entries rather than selectable options. |
| 2026-08-08 | Treat managed starter content as user-owned after first creation | Demo and My Contexts seed files are generated only for an empty first-run directory. A permanent marker prevents upgrades from overwriting, backfilling, or recreating edited and deleted files; current localized names remain temporary. |
| 2026-08-09 | Replace the settings dialog with a global settings workspace | A persistent category rail and one merged content surface match the desktop shell, remove the dated modal feel, and give model and appearance settings room to remain legible. Library switching remains with Home and File. |
| 2026-08-09 | Use models.dev for provider/model directory data; keep TierNote request configuration independent | A live catalog removes hard-coded model names and prices. Anthropic alone uses its native Messages API; every other provider uses the industry-default OpenAI-compatible path. TierNote always exposes five reasoning levels for reasoning models and lets provider endpoints normalize them. Composer selections change actual requests. |
| 2026-08-09 | Add ambient weather beside the Home greeting | Home keeps only a quiet animated condition image; its click panel is a read-only current and multi-day forecast with a compact single-line city header and a direct gear shortcut to Settings > Appearance. City selection, location, history, and provider attribution live in Appearance; users replace the current city rather than removing weather. This preserves the calm workspace while connecting it to the user's day. Location is requested only from Settings after an explicit click, rounded to city-level precision, and stored locally; manual city search remains the universal fallback. |

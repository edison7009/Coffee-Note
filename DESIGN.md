# Coffee Note Desktop Design System

## Product Context

- **What this is:** A local-first, general-purpose note workspace where an editable T1-T5 list makes priorities visible and an AI note agent helps organize local material.
- **Who it is for:** People who want one calm place to collect, rank, read, and refine notes without giving up local ownership.
- **Project type:** Cross-platform desktop productivity application. The public `website/` is a separate branded product surface and does not inherit these desktop rules.

## Aesthetic Direction

- **Direction:** Calm native workspace, informed by Codex rather than copied from it.
- **Decoration:** Minimal. Hierarchy comes from type, whitespace, alignment, and state, not colorful cards or ornamental chrome.
- **Borderless modal headers:** Use a text-only title block with the explicit close
  action on the right. Do not place decorative or category icons to the left of
  modal titles; typography and whitespace provide the hierarchy.
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
- **Mood:** Serious, quiet, capable, and spacious. Coffee Note should feel like a professional work surface, not a personalized dashboard template.
- **Memorable quality:** A Codex-like note tool whose primary object is the user's tiered knowledge, not chat.

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
- Let the shared title bar span the full window width. Place the `Coffee Note` wordmark at its left edge, followed by back/forward navigation and the File, Edit, and Help menus. On macOS, reserve clearance for native traffic-light controls.
- Start the left rail below the title bar with Home as its first row. Do not repeat the product icon or wordmark there. Library switching remains in the File menu and is also exposed as a discoverable global-action icon at the right edge of the Home row, matching the placement of global actions such as search in Codex.
- Leave a modest top inset above the Home row so the left rail breathes under the title bar rather than feeling pinned to it.
- Place the center workspace and right contextual rail inside one continuous inner panel. Its top-left border and radius are the primary visual boundary; the right rail is not a second sidebar.
- Keep the left navigation pane within its 210-380px range. The right contextual rail has no product-level maximum; its only upper bound is the remaining window width after preserving the main workspace's 560px minimum.
- Treat AI chat as one workspace mode, not the visual identity of the whole product.
- Treat Plugins as one Plugin market workspace. Categories filter package types;
  installation and enabled state appear directly on package rows and detail pages.
  Do not add a parallel Installed tab. A plugin row represents one installable
  package and opens an uncapped list of independently switchable
  skills. Keep publisher and runtime identifiers internal instead of adding metadata
  rows to the package UI. Do not add per-plugin access controls or capability-access
  metadata; built-in capabilities use normal application access. Plugin and skill
  switches still control capability availability: remove disabled Agent tools from
  model requests and reject direct execution attempts in the backend.
- Presentation generation uses the application-managed native runtime. Skills define
  narrative and slide intent; they do not install their own renderer. Generated decks
  are editable 16:9 `.pptx` files with restrained typography, one message per slide,
  deliberate layouts, and density limits that prevent obviously overflowing content.
- Settings exposes Recognition and generation as a separate destination next to
  Audio to text. Its Image recognition and Image generation tabs mirror the compact
  Audio to text switcher and keep independent provider, model, endpoint, and locally
  saved API-key records. Recognition is a fallback when the active model cannot
  accept images; generation is the shared provider for image-generation skills.
  Expose each Agent tool only when its configuration is complete, save generated
  images to a unique workspace path, and allow presentation skills to reuse that
  relative path. Do not add a local OCR tab before that runtime exists.
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
- Message settings support only Tencent Weixin and Telegram. Present both as
  restrained connection rows in the continuous settings surface, with status,
  pairing, and recovery information shown inline after an explicit action.
  A paired private phone chat is another entry point into the same AI note agent
  used by the desktop composer: ordinary text remains conversation, while a
  message consisting primarily of one public link implicitly asks AI to fetch,
  organize, and save it as a local note. Phone turns persist in the shared local
  conversation history and appear in the desktop right rail. This is not a remote
  terminal or group-chat bot. Keep credentials in the current user's app-data
  directory and never expose them back to the webview.
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
  model gets Coffee Note's fixed five effort levels (low, medium, high, xhigh, max);
  models.dev reasoning-option metadata must not filter or clamp them. A provider's model list always expands in
  full inside the outer settings scroller; do not cap its result count or add a
  nested model-list scrollbar. Non-default providers show a count only when at
  least one model is selected; never render a zero badge. The composer model
  readout must come only from the provider's explicitly selected model list;
  never fall back to a seeded or example model ID.
- On My Contexts (`我的设定`), use five direct-entry content cards with independent retrieval
  switches, all enabled by default. Cards have no selected state: their light
  surface remains `#f1f1f1` during hover and navigation, with a neutral dark-mode
  counterpart. Enabled/context states use iOS blue (`#007aff`) in light mode and
  egg-yolk yellow (`#e7be15`) in dark mode. Reuse that state color for the active
  library multi-select control, selected-note checkmarks, and the removable note
  context pill in the AI composer. Add Material is an action and has no retrieval switch.
- Keep the composer in a stable bottom row when chat is active.
- Present the composer metrics as one compact runtime summary rather than equal
  dashboard columns. Separate metric groups with a low-contrast `|`, join
  closely related values such as input and output with `·`, and keep each group
  intact in the deliberate narrow-layout rows. Show only values the runtime actually measures;
  future latency, speed, turn, or step metrics join this same grammar once the
  backend reports them.
- Render AI thinking and tool activity as compact, unframed disclosure rows rather
  than full-width cards. Tool rows use small static status icons, with aligned
  26px summaries; clicking the chevron reveals arguments and results inline.
  While the turn is active, keep one separate EchoBird-style status line after
  the activity stream. It uses Coffee Note's warm orange status color, the complete
  supported-language verb lists, the left flower glyph sequence, typewriter erase/type
  timing, a caret during rewrites, and the EchoBird left-to-right text shimmer. Add
  an elapsed clock only after 15 seconds; the muted elapsed clock does not shimmer.
  Completed rows become
  static muted text, failures retain a clear semantic error state, and raw provider
  reasoning remains private.
- In the right conversation history, replace the active working conversation's
  delete action with an always-visible loading indicator. Restore delete only after
  work finishes; its icon and hit area must remain comfortably legible without
  dominating the row. Conversation rows have no persistent borders: ordinary rows
  are transparent, while hover and the current conversation use one soft neutral
  background. A working row keeps that background with a small static theme-color dot. When work
  completes outside the conversation currently being viewed, keep the same background
  as an unread-completion signal until the user opens that conversation. Keep the
  status dot geometrically centered in the action area.
- In light mode, the chat composer and user message bubble use layered neutral gray
  surfaces with neutral ink, never the inherited green/teal treatment. The user
  bubble keeps a compact Codex-like rounded shape rather than becoming a card.
- Reserve matching scrollbar gutters on both sides of the center scroll area so
  page content remains optically centered and aligns with the fixed composer.
- Desktop scrollbars hide the native WebView chrome and use a narrow, real-DOM,
  low-contrast neutral slider with no track or arrow buttons. The slider appears only
  during scrolling, pointer/keyboard interaction, or editor activity, then fades after
  a short idle delay. It floats over the edge so content never shifts; scrolling and
  thumb dragging always remain available.
- AI conversation records use the same restrained desktop context menu as note
  content. Copy prioritizes selected text and otherwise copies the record under the
  pointer; Select all covers the visible transcript.
- The AI composer textarea uses the complete desktop editing context menu. Keep
  selection-sensitive commands disabled when they have no applicable text, and read
  the clipboard only after the user explicitly invokes Paste.
- Saved conversation rows expose a restrained right-click menu for rename, identity,
  local-file access, and deletion. Rename fades into place inline without changing the
  row height, surface, typography, or spacing; its editable title has no visible border.
  Destructive hover uses semantic red, while all other actions remain neutral.
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
- **Brand exception:** The compact title-bar `Coffee Note` wordmark reuses the bundled `Lora` bold-italic face from the AI-chat identity at 16px.

## Color

- **Approach:** Codex/iOS surface hierarchy. Shell controls, icons, and text stay monochrome; a barely tinted environmental surface separates navigation from the white work area without becoming a brand color. The homepage alone may use restrained category color to make its core prioritization model memorable.
- **Light:** ink `#2c2c2e`, muted `#77777b`, canvas `#ffffff`, sidebar `#f0f5f0`, grouped surface `#f7f7f5`, line `rgba(60, 60, 67, 0.12)`.
- **Interaction:** graphite `#3a3b3d`; hover `#252628`; soft state `rgba(58, 59, 61, 0.07)`.
- **Dark:** canvas `#1c1c1e`, sidebar `#242426`, ink and interaction `#f2f2f7` / `#d1d1d6`.
- **Workspace content ink:** the center workspace and contextual rail reuse the
  fixed interaction neutral (`#3a3b3d` in light mode and `#c7c7c7` in dark mode)
  instead of introducing another color token. Keep the left navigation's existing
  hierarchy unchanged.
- **Semantic color:** Reserve red, amber, and green for errors, warnings, and success only. Do not use semantic colors as branding or decoration.
- **Tier color:** T1-T5 use muted rose, amber, yellow, teal, and green. Color stays in the homepage tier strip, softly tinted label cells, the compact note priority button, and the menu's small tier swatches; it does not enter navigation, article content, or settings surfaces. The priority button keeps its tier-tinted background unchanged on hover/open. Menu hover and selection use one neutral background with no colored border or glow.

## Spacing And Shape

- **Base unit:** 4px.
- **Density:** Comfortable and work-focused: 8px between related controls, 16px within regions, 24-32px between major regions.
- **Radius:** 4px for compact controls, 7px for inputs and list selections, 8px maximum for cards and dialogs. Pills are reserved for statuses.
- **Borders:** Use only for pane boundaries, inputs, dialogs, and meaningful grouping. Avoid cards inside cards.
- **Text-input focus:** Desktop text inputs and textareas use only their own
  1px border to indicate focus. Never add an outer outline, glow, or focus shadow;
  this is the shared default for new fields. Buttons and links may retain a
  keyboard-visible outline for accessibility.
- **Shadows:** Dialogs and floating menus only. Main page regions stay flat.

## Motion

- **Approach:** Minimal and functional.
- **Timing:** 90ms for hover/focus changes, 150-200ms for panels and dialogs.
- **Behavior:** No decorative movement, scale-on-hover, or animated gradients. Respect reduced-motion settings.
- **AI activity:** Tool rows and history indicators stay static. The active turn's
  EchoBird-style status line is the chat animation exception: its warm orange text
  shimmer runs linearly for 2.4 seconds while the left flower glyph and rewrite caret
  follow the matching typewriter cycle. The elapsed-time text updates once per second
  after the first 15 seconds but stays muted and static. Reduced motion disables the
  shimmer and caret.
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
| 2026-08-08 | Move the product identity and app menus into the shared title bar | A compact 16 x 16 icon, Lora bold-italic `Coffee Note` wordmark, page history, and File/Edit/Help menus match the native Codex-like shell while letting Home align directly with the workspace top edge. |
| 2026-08-08 | Gate My Contexts retrieval per note | Five default-on local switches make AI inclusion explicit; a backend allowlist enforces the same state for question-aware and always-on personal context. Cards remain direct neutral navigation entries rather than selectable options. |
| 2026-08-08 | Treat managed starter content as user-owned after first creation | Demo and My Contexts seed files are generated only for an empty first-run directory. A permanent marker prevents upgrades from overwriting, backfilling, or recreating edited and deleted files; current localized names remain temporary. |
| 2026-08-09 | Replace the settings dialog with a global settings workspace | A persistent category rail and one merged content surface match the desktop shell, remove the dated modal feel, and give model and appearance settings room to remain legible. Library switching remains with Home and File. |
| 2026-08-09 | Use models.dev for provider/model directory data; keep Coffee Note request configuration independent | A live catalog removes hard-coded model names and prices. Anthropic alone uses its native Messages API; every other provider uses the industry-default OpenAI-compatible path. Coffee Note always exposes five reasoning levels for reasoning models and lets provider endpoints normalize them. Composer selections change actual requests. |
| 2026-08-09 | Add ambient weather beside the Home greeting | Home keeps only a quiet animated condition image; its click panel is a read-only current and multi-day forecast with a compact single-line city header and a direct gear shortcut to Settings > Appearance. City selection, location, history, and provider attribution live in Appearance; users replace the current city rather than removing weather. This preserves the calm workspace while connecting it to the user's day. Location is requested only from Settings after an explicit click, rounded to city-level precision, and stored locally; manual city search remains the universal fallback. |
| 2026-08-14 | Make paired phone chats full Coffee Note conversations | A linked private chat should behave like the desktop composer rather than force every message through link capture. Ordinary messages get ordinary AI replies, link-only messages implicitly become saved notes, and all turns share the local conversation history visible in the desktop rail. Pairing, credentials, cursors, and recoverable jobs remain local. |
| 2026-08-14 | Adopt a restrained turn-status shimmer | One theme-colored activity line with a left-to-right text shimmer and delayed static elapsed time replaces the repeated Braille spinner; tool rows and conversation history keep static marks. |
| 2026-08-15 | Remove leading icons from borderless modal headers | Text-only titles make the lightweight dialogs quieter and more refined while one shared header keeps title and close-action alignment consistent. |
| 2026-08-16 | Treat Skills as two-level management | The first level manages installed packages and source actions; opening a package reveals an uncapped two-column list of its concrete skills with independent switches and a clear back action. This separates installation from capability control and remains usable for repositories containing hundreds of skills without implying an in-app download marketplace. |
| 2026-08-16 | Preserve official plugin artwork in Skills | Package and child-skill rows use the nearest Codex plugin manifest's compact icon directly, without a second backing tile or border, and fall back to the standalone neutral skill mark. This makes large official collections scannable without adding labels or card decoration. |
| 2026-08-16 | Make Tier drag channels geometrically continuous | Visual spacing remains airy, but every wrapped line is divided at card center lines so each pixel maps to a deterministic insertion slot. A gap must never fall through to the row-end position. |
| 2026-08-17 | Establish the plugin-market architecture | Plugins are distribution units, skills are Agent actions, and shared runtimes are managed once by the application. Coffee Media is the first manifest-driven official plugin; Git skill sources remain prompt-only community extensions. |
| 2026-08-17 | Generate presentations in the shared native runtime | Coffee Presentation submits one structured deck to an application-level engine that creates editable `.pptx` files without a per-skill environment. The initial layout and density contract favors reliable, restrained slides over unconstrained drawing commands. |
| 2026-08-17 | Separate image recognition and generation settings | Keep one Recognition and generation destination with two compact internal tabs. Recognition falls back to its own external image model when the active model is text-only; generation uses an independently configured provider. Local OCR remains a later capability. |

# TierNote — portable Codex project memory

Updated: 2026-08-15

This file preserves the decisions and working context needed to continue the
project on another machine. It contains no API keys, private user parameters,
or temporary deployment credentials.

## TierNote fork status

- This repository is the TierNote sister product forked from the original longevity app.
- Visible product name: **TierNote**.
- The repository directory is `TierNote`; developer package names use `tiernote`
  or `TierNote` where spaces are invalid.
- TierNote is a local-first, general-purpose workspace agent rather than a
  fixed note system or a longevity product. The user selects an ordinary directory
  and asks the Agent to work in it. Notes are common work, but source code, documents,
  data, and other tasks are equally valid.
- **Identifier migration (2026-08-20):** Current releases use
  `app.tiernote.desktop`, the `TierNote` app-data directory, `.tiernote` workspace
  metadata, `tiernote:` browser storage keys, and `tiernote-*` built-in plugin,
  skill, runtime, and sidecar IDs. Startup performs a tested one-time migration
  from the v0.1.8 identity before initializing the WebView or backend stores, so
  provider credentials, conversations, plugin state, message channels, local UI
  preferences, and tier ordering remain available after upgrade.
- GitHub release and feedback URLs use the `edison7009/TierNote` repository.
- **Licensing (2026-08-19):** TierNote uses AGPL-3.0-or-later for current
  releases, with paid commercial licensing available for closed-source
  customization, white-label distribution, and proprietary embedding. Copies
  released before the transition retain the MIT permissions already granted;
  `NOTICE` preserves that historical notice. External contributions are
  accepted under the bilingual CLA in `CONTRIBUTING.md` so commercial
  relicensing remains possible.
- The homepage editable T1–T5 tier list is the core interaction model because it
  makes prioritization and decisions immediately legible.
- Longevity-specific starter content and product copy below are inherited context
  awaiting replacement; they are not the TierNote product direction.

## Workspace Agent foundation (2026-08-15)

- **Generated file destination (updated 2026-08-19):** PPTX, DOCX, PDF, and MP4 outputs use
  the current selected workspace root by default, so switching workspaces also changes
  the default output location. Settings > General lets the user choose a fixed custom
  folder or restore the current-workspace default. Existing custom paths stored in
  current-user app data remain unchanged. Completed generation tool rows show the backend-returned
  absolute path with Copy path and Show in folder actions; do not rely on model prose to
  tell users where a file was saved. Workspace-relative source images remain in the selected
  workspace and presentation/video runtimes resolve those inputs separately from the output folder.

- The selected directory is the workspace. It may be a code repository, writing
  project, note collection, or any other folder. Never infer a required note
  hierarchy and never create `inbox`, `dossiers`, or another category directory
  merely because TierNote is the visible product name.
- The Agent must accept programming, debugging, writing, research, organization,
  and other workspace tasks. It must not refuse work simply because the request is
  programming or not note-related.
- General files use `list_workspace`, `read_workspace_file`,
  `write_workspace_file`, and `replace_workspace_text`. Code remains code; it must
  never be wrapped in a Markdown note or routed through `save_note`.
- `save_note`, semantic Markdown search, T1-T5 priorities, My information, and the
  homepage tier list are optional product capabilities, not the filesystem model.
  `save_note` defaults to the workspace root and uses a subdirectory only when the
  user explicitly asks or the existing workspace makes that destination clear.
- The directory tree must not hide or offer bulk deletion of folders based on old
  TierNote category names. A folder named `papers`, `templates`, `inbox`, or
  similar may be ordinary user project data.
- **Complete workspace file tree (2026-08-19):** The directory tree shows every
  ordinary non-hidden file, not only Markdown. Markdown remains the only built-in
  center preview. Other files open a restrained unsupported-preview state, may be
  attached to the AI composer by single click, multi-select, or the context menu,
  and reach the Agent as validated workspace-relative paths without injecting
  binary bytes into the prompt. The root, expanded directories, and directories
  containing selected files refresh in the background and when the window regains
  focus, so externally downloaded files appear without a restart while collapsed
  branches stay inexpensive. Their context menu also supports the existing workspace
  file operations and opening through the system application.
- **Local document ingestion (2026-08-20):** TierNote owns its document-reading
  implementation. DOCX, PPTX, XLSX, HTML, plain text, and text-based PDF files
  are read locally before reaching the Agent; audio and video continue through
  TierNote's existing transcription pipeline. External projects may inform test
  cases and product requirements, but must not be added as conversion runtimes or
  code dependencies without explicit approval. Scanned or image-only PDFs still
  require a separate OCR path.
- The current Agent tool surface can edit text files but cannot execute terminal
  commands. It must state that honestly and never claim builds or tests ran. Add
  shell execution only together with an explicit user approval and safety model.

## Desktop redesign direction (2026-08-07)

- **Plugin platform foundation (2026-08-17):** TierNote treats plugins as the
  install/update unit, skills as the Agent invocation unit, and runtimes as shared
  application-managed infrastructure. Settings > Plugins is the Plugin market;
  categories filter plugin types, while enabled and installed state lives on the
  package row and detail page instead of a separate Installed view. The bundled
  `TierNote Media` package is the first manifest-driven
  official plugin: its media-to-text skill, publisher, version, and
  prewarmed `media-transcription` runtime are declared under
  `src-tauri/builtin-plugins/tiernote-media/` instead of being duplicated as a Rust
  prompt constant. Official plugins may bundle many independently switchable skills;
  a skill must never install its own runtime. Git skill packages remain supported as
  prompt-only community extensions, and TierNote never automatically executes
  their scripts, hooks, MCP servers, or runtime declarations.
- Plugin details expose the package and its independently switchable skills only.
  Publisher and runtime identifiers remain internal metadata. Plugin manifests and
  UI do not carry per-plugin access metadata; built-in capabilities use the
  application's normal workspace access. Disabling a built-in plugin or one of its
  skills removes the corresponding Agent tool and the backend rejects direct calls
  as a second guard.
- **Native presentation plugin (2026-08-17):** The bundled `TierNote Presentation`
  package lives under `src-tauri/builtin-plugins/tiernote-presentation/`. Its
  `create-presentation` skill sends a complete structured deck to the shared,
  prewarmed `presentation-engine` runtime. The runtime is compiled into the desktop
  app, writes editable widescreen `.pptx` packages without installing PowerPoint,
  Node, Python, or a per-skill environment, and currently supports minimal,
  business, and dark themes plus title, section, content, two-column, quote, and
  workspace-image layouts. Generated files use a new filename instead of silently
  overwriting an existing deck.
- **Native document plugin (2026-08-17):** The bundled `TierNote Documents` package
  lives under `src-tauri/builtin-plugins/tiernote-documents/` and exposes independent
  `create-docx` and `create-pdf` skills on one prewarmed `document-engine`. Both
  submit a complete semantic block list to the guarded `create_document` tool.
  `src-tauri/src/document.rs` writes editable Open XML `.docx` packages and lays out
  `.pdf` files with a local TrueType font; neither path requires Word, LibreOffice,
  Python, Node, or a per-skill runtime. Output filenames are reserved with
  create-new semantics. DOCX generation writes the standard Open XML package
  structure directly with the Rust `zip` crate. PDF generation uses the
  MIT-licensed `printpdf` crate.
- **Multimodal model settings (2026-08-17):** Settings includes one dedicated
  Multimodal models destination beside Audio to text. Its internal Image recognition,
  Image generation, Speech generation, Video generation, Music generation, and Sound effects generation tabs reuse the same compact switcher and store
  separate service, model, endpoint, and API-key records in local app data. An
  image-capable active chat model remains the first choice for recognition; the
  recognition configuration is its fallback. Image-generation skills use the
  generation configuration. Video generation keeps an independent external-provider
  record without replacing TierNote Video's native fallback. Its built-in service selector
  offers Runway plus direct BytePlus/Volcano Engine Seedance, Kling, Google Vertex AI
  Veo, MiniMax/Hailuo, Luma, Vidu, Pika, Alibaba Cloud Wan, Tencent Cloud Hunyuan/Youtu,
  Tencent-hosted PixVerse, LTX, Adobe Firefly, and
  OpenAI Sora presets. Every vendor keeps its real endpoint, model IDs, authentication
  shape, and protocol marker; Adobe persists both its OAuth token and `x-api-key`, while
  Vertex keeps the project/location in its editable URL. Runway and Vidu credential
  checks use non-generating account endpoints. Tencent TokenHub checks `/v1/models` and
  exposes its native Hunyuan/Youtu models plus PixVerse V6/C1. Providers without a safe account or model
  endpoint receive local completeness validation rather than a paid generation call.
  OpenAI Sora remains visible for existing users but is marked with its 2026-09-24 shutdown.
  Music generation stores official
  Google Lyria, ElevenLabs Music, and MiniMax Music presets; its connection checks use
  model or account metadata endpoints and never create paid audio. Music remains a
  configuration surface until a guarded Agent music tool and local-save contract are added.
  Sound effects generation stores a separate ElevenLabs `eleven_text_to_sound_v2`
  preset and uses the same non-generating account check; it likewise remains a
  settings-only capability until guarded audio saving exists. Audio to text remains
  the separate STT/ASR destination: it supports OpenAI recorded-audio transcription,
  Deepgram Nova, AssemblyAI Universal, and ElevenLabs Scribe file-upload protocols.
  Realtime-only transcription models are intentionally not offered in that file workflow.
  The Agent exposes `recognize_image` and `generate_image`
  only when their respective configuration is complete; generated PNG/JPEG files are
  saved non-destructively in the selected workspace and can be passed directly to the
  presentation tool by relative path. This version is cloud-only and does not expose
  an unfinished local OCR tab.
- **Built-in storyboard director and text-to-video fallback (2026-08-17):** The bundled
  `TierNote Video` package lives under `src-tauri/builtin-plugins/tiernote-video/`. It exposes
  a storyboard-only director skill and a render skill; both receive the same bundled,
  model-neutral cinematic specification. They establish a director brief, beat map,
  continuity bible, motivated camera language, and paired keyframe/motion prompts before
  generation. The render skill calls the guarded `generate_image` tool once per scene,
  then calls `create_video` once. The application generates scene narration through the
  locally configured OpenAI-compatible speech endpoint and combines the images,
  narration, burned ASS captions, and restrained pan/zoom motion with a bundled
  FFmpeg sidecar. It writes a new workspace-root `.mp4` without overwriting an
  existing file. This is the dependable baseline rather than a diffusion video
  model. The storyboard method is provider-independent so its motion prompts can also be
  adapted to a configured video model. Git-installed community skills remain prompt-only
  and cannot execute their own scripts, hooks, or runtimes.
- **Note creation shortcuts (2026-08-17):** Every concrete note view exposes
  Generate DOCX, Generate PDF, Generate PPT, and Generate video beside Copy full text. Clicking one selects the
  matching enabled bundled skill in the shared composer, focuses the input, keeps
  the current note attached as context, and deliberately does not send anything.
  The old disabled Mobile long image placeholder was removed.
- **Ambient Home weather (2026-08-09):** The open area to the right of the Home
  greeting holds only a compact animated condition image: no city, temperature,
  forecast text, provider name, or enclosing card appears on Home. Explicit click
  opens a read-only lightweight panel with current conditions and four forecast days.
  Its compact header keeps the forecast title and city on one line, with a gear shortcut
  directly to Settings > General. All city search, recent-city, one-time device location,
  and Open-Meteo attribution controls live there. Weather has no removal action; choosing
  another city replaces the current one. Device coordinates are rounded
  to 0.1 degrees before saving/requesting, and results are cached locally for 30
  minutes. It never prompts for location on launch. City search stores up to ten
  deduplicated recent cities locally and exposes them as direct, non-breaking text actions,
  replacing generic privacy helper copy. Settings changes dispatch a local browser
  event so Home refreshes immediately without a restart. The mark is absolutely
  positioned in the hero
  background, never consumes horizontal layout space, and may sit behind the
  greeting as the center narrows. The condition scene is the one Home exception to
  the static-motion rule: slow cloud/rain/snow motion only, with the global
  reduced-motion rule providing a static fallback. Keep the weather provider behind
  the normalized frontend module so production licensing or a proxy can replace the
  prototype endpoint without changing Home.
- **Typography floor (2026-08-07):** Desktop UI text must never render below
  **13px** for readable/interactive text and **12px** for technical metadata
  (counts, shortcuts, timestamps, badges). Left navigation uses **15px**,
  matching the EchoBird sister app's sidebar (`E:\EchoBird`); the user
  directory/library tree uses **14px**; the right contextual rail uses 14px
  list titles, 13px messages/meta, and 12.5px section labels; body text is
  16px. `DESIGN.md` is the source of truth for these rules.
- **No `title` attributes / hover tooltips (2026-08-07):** The desktop app
  must never render native `title` attributes — we are not a website — and must
  not use hover-revealed tips as the primary way to surface information.
  Tooltips are a web pattern (`website/` may use them); inside the desktop app,
  information belongs inline or behind an explicit click, with `aria-label`
  kept for accessibility. Non-interactive readouts (e.g. the AI composer model
  ID) are plain text: no cursor change, no hover effects, no tooltip.
- **AI activity rows (2026-08-14):** Thinking and tool calls in AI chat render as
  compact, unframed disclosure rows rather than stacked full-width cards. Tool rows
  use static status marks and switch to a checkmark on completion or a failure mark;
  summaries stay aligned to 26px. While a turn is active, one separate EchoBird-style
  line appears after the activity stream with Coffee-CLI's compact Braille-dot spinner
  on its left. Its warm
  orange label cycles the complete supported-language verb lists with the left
  flower glyph sequence, typewriter erase/type timing, 2.4-second text shimmer,
  and a caret during rewrites. Elapsed time appears only after 15 seconds and stays
  muted and static; reduced motion disables the shimmer and caret. Completed rows
  remain static muted text, failures keep a semantic error state, and provider
  reasoning content remains internal.
- **One-shot composer skills (2026-08-14):** A skill selected in the AI composer is
  captured for the submitted turn, then cleared immediately so it cannot silently
  affect the next message. The Import Your Materials flow passes the built-in media
  skill directly to its generated turn and must not leave that skill selected in the
  composer afterward.
- **Custom My Contexts (2026-08-14):** The action inside My Contexts is Add Context,
  not Add Material. It creates a Markdown page in TierNote's dedicated local
  My Contexts directory, immediately lists it on that page, and gives it the same
  default-on independent AI retrieval switch as the built-in context pages. General
  material creation remains available from the library controls outside My Contexts.
- **Local Agent Loop (2026-08-14):** TierNote uses its focused Rust ReAct
  loop as the only agent runtime. `agent_loop.rs` owns model streaming, tool
  orchestration, durable provider transcripts, token accounting, and local
  context compaction. Rust also owns Library Graph, My Contexts routing, note
  tools, web reading, memory suggestions, and channel delivery. Skills and Git
  plugin sources remain supported as prompt/tool extensions through `skills.rs`;
  there is no Node agent sidecar, runtime archive, or private console launcher. The
  video encoder is a narrowly invoked application-managed binary, not an agent runtime.
- **Capture recognition preference (2026-08-14):** The Import Your Materials dialog
  stores its last cloud/local speech-recognition choice under the local UI key
  `tiernote:capture-transcription-mode:v1` and restores it the next time the dialog
  or desktop app opens. The dialog only presents usable recognition modes as radio
  choices: an unconfigured mode is an explicit link to the matching cloud/local tab
  in Settings > Audio to text; if exactly one mode is usable it is automatically
  selected and fixed, and the remembered two-way choice applies only when both modes
  are usable. A hosted mode requires complete endpoint, model, and API-key fields;
  a local mode requires both the selected runtime and selected model to be installed.
  Local availability fails closed when live resource status cannot be read; a saved
  selection alone must never make a partially installed local setup appear usable.
- **Media environment prewarm (2026-08-14):** Media-to-text is a frequently reused
  built-in capability. After launch, TierNote silently prepares the pinned media
  fetcher in the current user's app-data directory, verifies and reuses an existing
  copy, and retries on the actual media request if background preparation failed.
  Startup and first-use preparation share one process-local lock so they never write
  the same partial download concurrently. Speech-recognition runtimes, CUDA support,
  and models remain explicit user downloads; the AI never asks the user to configure
  or repeatedly install the media-import environment.
- **Windows local transcription compatibility (2026-08-15):** The pinned whisper.cpp
  Windows runtime normally selects its fastest CPU backend. If it exits immediately
  after loading that backend, TierNote retries in an isolated temporary runtime
  containing only the baseline `ggml-cpu-x64.dll`. This keeps optimized CPUs fast while
  covering machines that crash after selecting the Haswell backend. Failed attempts
  report the process status and diagnostics instead of treating the final successful
  backend-load log line as the cause.
- **Chinese-first local transcription library (2026-08-19):** Settings > Audio to text
  separates storage, inference engines, and model weights. SenseVoiceSmall Q8 is the
  lightweight default, with Paraformer Large Q8
  and Fun-ASR-Nano Q4 available through the official self-contained FunASR llama.cpp
  runtime and shared FSMN-VAD long-audio segmentation. Model downloads use pinned
  ModelScope revisions first in China, fall back to pinned Hugging Face revisions,
  and verify exact sizes and SHA-256 digests. Runtime and model downloads are shown
  separately so users can understand and manage each layer. Existing Whisper
  base/small/medium IDs and files remain compatible but
  are explicitly labeled as multilingual fallbacks with limited Chinese accuracy.
  FireRedASR2-AED and FireRedASR2-LLM are first-class catalog entries with one Download
  action: TierNote probes the China mirror and silently falls back to the official
  international source instead of making users choose a route. They clearly state their
  separate Python/PyTorch or vLLM requirements; do not report them as locally installed
  until TierNote owns that runtime. Each of the four engine families has its own
  configurable storage root and folder under `TierNote Transcription`; changing the
  directory migrates only that engine and its models, so large families can live on
  different drives. Legacy one-directory storage remains a read-compatible fallback,
  and Windows extended path prefixes such as `\\?\` must never be shown in the UI.
  Storage opens in the system file manager. The top navigation separates local
  recognition into FireRedASR2, FunASR, Whisper CPU, and Whisper NVIDIA tabs (FireRedASR2
  stays first for the Chinese-first product); each tab contains only its own runtime and compatible models, with
  no secondary engine-browser state. Cloud is visually separated from those local
  families. Exactly one local model can be configured through the theme-color switches.
  A model switch appears only when both that model and the matching runtime are installed;
  an installed model whose runtime is missing shows the static `Engine missing` state instead
  of leaving the row action area blank. Only a fully usable selection may give its family tab
  the theme-color `In use` state. Downloaded engines show `Downloaded` in the row action area.
  Recommendation badges are scoped within each
  family (SenseVoiceSmall for FunASR, FireRedASR2-AED for FireRed, Whisper Small for Whisper).
- **Working conversation indicator (2026-08-14):** While the agent is busy, the
  active conversation card in the right history rail replaces its delete action with
  a small always-visible, geometrically centered theme-color dot and exposes `aria-busy`.
  Delete returns when work finishes, with a 16px icon inside a 30px hit area. History
  rows are unframed and transparent at rest; only hover/current state adds a neutral
  background. Working rows remain highlighted with the static dot; a conversation that
  completes while it is not being viewed remains highlighted as unread until opened.
  Completion is keyed by the event's conversation ID before background events are
  ignored, so it cannot leak A's content into B. The current frontend still permits
  only one working conversation and blocks switching conversations mid-run, but the
  row-level presentation is ready to consume multiple working conversation IDs later.
- **Neutral chat surfaces (2026-08-10):** AI chat uses a warm-neutral composer
  surface (`#f7f7f7`) and the navigation surface for user bubbles in both themes,
  with neutral ink; do not restore the inherited green/teal composer or bubble.
  Small estimated costs keep up to four decimals but trim meaningless trailing zeros
  (`0.0040` displays as `0.004`), while the no-request baseline remains `0.00`.
- **Composer runtime summary (2026-08-14):** Usage below the AI composer is one
  centered, wrapping summary rather than fixed equal-width columns. Low-contrast
  `|` characters separate request, cache, token, context, and cost groups; `·`
  joins related values inside a group, currently input and output tokens. A
  deliberate narrow layout keeps groups intact without leaving a separator at a
  row edge. Only backend-measured values appear; latency, first
  token, throughput, turn, or step metrics can join the same grammar after the
  runtime starts reporting them.
- **Softer workspace text (2026-08-11):** The center workspace and right contextual
  rail reuse the fixed interaction neutral as their scoped ink: `#3a3b3d` in light
  mode and `#c7c7c7` in dark mode. The left navigation keeps its existing hierarchy.
  Tier-note labels and chat content must follow the same scoped ink rather than
  restoring brighter hard-coded colors.
- **Auto-hiding scrollbars (2026-08-10):** Main content, settings, provider lists,
  and Markdown editors follow the Coffee-CLI pattern: native WebView scrollbars are
  fully hidden and a narrow real-DOM slider floats over the edge. The slider has no
  native arrow buttons or visible track, supports dragging, fades over 220ms, and
  begins hiding 450ms after inactivity; reduced motion switches immediately. Sidebar
  and contextual-rail scrollbars remain fully hidden.
- **AI transcript context menu (2026-08-10):** Conversation records reuse the
  desktop reader context menu. Copy uses the current transcript selection when one
  exists; otherwise it copies the user, assistant, memory, or tool record under the
  pointer. Select all selects the complete visible transcript.
- **AI composer context menu (2026-08-10):** The AI prompt textarea reuses the
  full desktop editor menu: undo, redo, cut, copy, paste, delete, and select all.
  Clipboard read access is invoked only by the explicit Paste action.
- **Conversation-card context menu (2026-08-10):** Right-clicking a saved
  conversation offers inline rename, copy conversation UUID, copy its local JSON
  path, reveal that file in the system file manager, and delete. Manual titles are
  persisted as custom titles and are not replaced by later automatic first-message
  title updates. Inline rename fades in without changing the card surface, height,
  typography, or spacing, and the editable title has no visible border.
  Rename/delete stay disabled while the single active agent is busy.
- The desktop app is moving to a calm, Codex-informed note-workspace style. This
  supersedes older instructions below that require a colorful dashboard shell or
  a blue-green gradient title bar.
- TierNote now uses a monochrome black, graphite, and gray shell with no selectable
  brand color. The homepage is the deliberate exception: its three entry cards and
  T1-T5 map use restrained category colors. Appearance settings keep system/light/dark
  modes and color schemes, while General owns language and other non-visual preferences.
- Light mode follows the Codex/iOS surface hierarchy: the navigation shell and title
  drag bar share a very soft environmental gray-green (`#f0f5f0`), while the inner
  work surface remains white and grouped controls use warm gray-white. This tint is
  a surface boundary, never an icon, text, or brand accent.
- The custom title bar is a flat neutral surface. The center workspace should feel
  large and quiet; hierarchy comes from typography, whitespace, and selection
  states rather than decorative cards, gradients, shadows, or multiple accents.
- The shell topology is the defining Codex reference: the top bar and left rail are
  one continuous outer surface, while the center workspace and right contextual rail
  form one continuous inner panel. The inner panel begins below the top bar with a
  visible top-left radius and border; the right rail must not read as a second sidebar.
- The shared title bar spans the full window width. The left rail starts below
  it with Home as the first row; macOS reserves extra title-bar clearance for
  native traffic-light controls.
- The homepage tier list remains the product core. T1-T5 use muted rose, amber,
  yellow, teal, and green, limited to the tier strip, softly tinted label cells,
  the compact note priority button, and the menu's small tier swatches. The button
  keeps its matching tinted background unchanged on hover/open; menu hover and
  selection use one neutral background with no colored border or glow.
- The display brand uses the `TierNote` wordmark in the title bar and AI-chat
  empty state. The AI-chat empty state intentionally has no logo image. The in-app
  mark source is `src-tauri/icons/logo.png`, which must
  remain byte-identical to the copied UI source at `public/brand/logo-new.png`.
- OS app icons are generated with `tauri icon` from full-bleed square sources in
  `src-tauri/icons/sources/`: `logo-windows.png` (Windows: `icon.ico`, the
  `Square*Logo.png` set, and `StoreLogo.png`; Android: the `icons/android/`
  set) and `logo-square.png` (macOS: `icon.icns`; Linux: `icon.png`, `32x32.png`,
  `64x64.png`, `128x128.png`, and `128x128@2x.png`; iOS: the `icons/ios/` set).
  The sources are full-bleed so the mark is not shrunken by transparent padding;
  macOS and iOS auto-apply their rounded masks, and Linux keeps square corners.
  Regenerate per platform with `npx tauri icon <source> -o <temp-dir>` and copy
  the platform files into `src-tauri/icons/`.
- The title-bar wordmark reuses the AI-chat identity's bundled `Lora`
  bold-italic face at 16px. The AI-chat empty-state logo and wordmark keep their
  separate 42px identity treatment.
- The left navigation keeps a modest top inset above Home so the first row does
  not feel crowded against the shared title bar.
- `DESIGN.md` is the desktop design source of truth. The public `website/` remains
  a separate product surface with its existing expressive brand direction.
- **Cursor rule (2026-08-08):** the desktop app uses the system default arrow
  for ordinary controls and content drag-and-drop; text inputs keep the native
  I-beam. The two pane resizers are the sole resize-cursor exception: use
  `col-resize` on divider hover and throughout an active pane resize.
- **Text-input focus (2026-08-14):** All desktop text inputs and textareas use
  only their own 1px border as the focus indicator. The shared CSS removes outer
  outlines and focus shadows from text-entry controls so newly added fields do
  not regress to a web-style glow. Buttons and links retain keyboard-visible
  focus treatment.
- Do not keep cloned reference repositories, debugging screenshots, or temporary
  research scripts in the project root. Re-fetch external sources when a focused
  implementation task requires them, then remove them after use.

## Legacy source-product context

The remaining notes describe the source product and are retained temporarily so
the working behavior is not lost during migration. The TierNote rules above take
precedence whenever they conflict.

## Product identity

- Product name: **TierNote**.
- Chinese product name: **科学延寿**. Use **延寿** consistently in Chinese
  product, website, documentation, and starter-library copy; keep the previous
  product-domain term out of new copy.
- Version: **0.1.1**.
- Goal: a productized, local-first scientific-longevity desktop application for
  Windows, macOS, and Linux—not a personal wrapper around the developer's notes.
- Product origin: inspired by the developer's `C:\Life extension` notes, but the
  shipped application and its data library must be completely independent of
  that folder.
- Default library locations are documented in `README.md`; users may explicitly
  choose another directory later.
- Initial languages: Simplified Chinese and English.
- Starter knowledge is product-neutral and must not contain the developer's
  personal health parameters.

## Core product model

The application combines:

1. General Agent work inside a user-selected local directory, including code and
   ordinary text files.
2. Optional knowledge reading, internal note links, capture, and structured note
   creation when the user asks for note work.
3. Optional T1-T5 prioritization and personal-context features layered over
   Markdown without imposing a directory hierarchy.

The default starter library currently contains **88 Chinese documents plus 88
English companion documents**. Run `npm run library:check` to verify the pairs.

Primary knowledge categories:

- Longevity strategies
- People / public cases
- Longevity stories and anecdotes

The application must open reference websites in the user's system browser.
Article keywords may link internally to other knowledge pages, and content pages
use a minimal icon-only back action beside the category label.

## Strategy priorities

The home page uses an editable T1–T5 priority map. The order is a starting
reference based on public protocols (including Bryan Johnson) and evidence
maturity; it is not a universal medical ranking. Users can reorder it or ask AI
to help.

Current default examples:

- T1: strength training, aerobic exercise, high-quality/healthy diet
- T2: creatine, soluble dietary fiber, Omega-3
- T3: vitamin D3, magnesium, vitamin C
- T4: CoQ10, NAD+, spermidine
- T5: ergothioneine, PQQ, Ca-AKG

Use **NAD+** as the visible umbrella term rather than “NMN / NR”.
The library also includes healthy diet, Yamanaka factors, and mouse longevity
gene-editing material. Do not restore the removed Lü Liangwei-specific content
to the product template.

## Desktop experience decisions

- Visible desktop slogan remains:
  **由 AI 和科学来驱动，你的延寿计划**
- Left navigation label is **首页 / Home**.
- Left navigation is one fixed hierarchical tree: top-level categories expand
  to second-level notes. People and longevity anecdotes are expandable too.
- Avoid a visible sidebar scrollbar, but keep mouse-wheel scrolling.
- The left, center, and right panes are resizable. While dragging, only the
  divider being manipulated is highlighted; the opposite divider stays idle.
- The left pane keeps its 210-380px product range. The right rail has no fixed
  maximum; it may expand until the center workspace reaches its 560px minimum.
- The top title/drag bar spans the full window width. Its left side shows a
  16 x 16 product icon, the closed `TierNote` wordmark in the bundled `Lora`
  bold-italic face, functional back/forward navigation, and File/Edit/Help menus.
  File keeps the library-switch action; the right edge of the Home navigation
  row also exposes the same action as a discoverable global folder icon, matching
  the placement of future global actions such as search. Edit may remain a
  restrained placeholder until editing commands are wired; Help links to product
  help and feedback.
- The left rail starts directly below the title bar with Home as its first row.
  Do not repeat the logo/wordmark there. Keep the Home content lifted so its top
  area aligns visually with the right-rail header divider.
- Windows/Linux use custom window controls; macOS uses native traffic-light
  controls on the left.
- The desktop app is single-instance. Launching it again must restore and focus
  the existing main window instead of opening another process/window.
- Settings opens from the **Settings** text action immediately to the right of Help in the
  title-bar menu; do not duplicate it near the window controls. It is a global
  workspace mode rather than a modal dialog: below the shared title bar, a
  dedicated settings navigation rail replaces the normal library rail while one
  continuous work surface replaces both the center pane and contextual right
  rail. Keep General, Appearance, and Models as distinct categories. Knowledge-library
  switching stays on the Home row and File menu, so it is not duplicated in
  Settings. The model page places one compact Currency label with `¥` / `$`
  symbol controls directly below Refresh Catalog; do not create a separate
  currency section or add explanatory pricing copy. A visible Back to app action exits settings;
  Escape does the same. The settings rail has no redundant Settings heading;
  version and Feedback share one unwrapped footer row. The model navigation item
  is named **Models** to match common AI app settings language. Settings scrollbars, including the
  outer work surface and provider directory, stay thin with transparent tracks
  and low-contrast thumbs. The settings navigation rail is 220px wide on the
  ordinary desktop layout. Appearance contains theme and color scheme controls.
  General uses one continuous grouped surface: language and generated-file location
  are compact controls, and Weather forecast follows with
  current city at the header's right, recent cities below, and the current-location
  action beside city search. Open-Meteo attribution
  is plain text in the weather section description, with no separate footer or link.
  Do not collapse unrelated settings
  into one long form.
- Remove redundant headers, helper labels, dark duplicate divider lines,
  “30 秒结论”, model IDs in the chat box, local-context labels, and knowledge
  context cards.
- Keep the chat composer in a persistent bottom layout row. The content above
  it scrolls independently so the final message is never covered and the
  composer never disappears while scrolling. The center content scroller uses
  stable gutters on both edges so page content stays visually centered despite
  the visible right scrollbar and aligns with the composer.
- Keep the composer compact. Below it, show one restrained metrics line with
  provider-reported cache hit rate and token usage, API request count, local
  context percentage, and a cost estimate when current model pricing is known.
  The metrics are stored per conversation and switch with the active chat.
  The visible cost-unit control offers only `¥` and `$`; a legacy Auto preference
  resolves from the interface language until the user makes an explicit choice.
  CNY and USD use DeepSeek's official
  regional token prices directly rather than converting through an exchange
  rate. Persist the preference locally under `tiernote:currency`.
- The composer skill picker and Settings > Skills share one source-backed
  catalog. Adding a skill plugin asks only for a Git repository URL and a TierNote
  category; package names, descriptions, versions, and skill instructions
  are read from the repository's manifest and `SKILL.md` files and are never
  duplicated into editable app-owned copies. Repositories are cached once under
  the current user's app-data `skill-sources/` directory for offline use and
  updates. Selecting a skill reads its original `SKILL.md` and adds it only to
  that AI request's prompt. TierNote does not execute third-party scripts,
  hooks, runtimes, or MCP servers from these repositories.
- Settings > Skills is a two-level skill management workspace. The category view lists
  installed skill packages/sources and keeps package update, move, removal, and
  master enable controls there. Opening a package shows a simple back action and
  every discovered child skill in an uncapped, two-column list with its own
  persisted enable switch. Packages with hundreds of `SKILL.md` entries must not
  be truncated; the settings workspace scrolls naturally. A disabled child is
  removed from the composer catalog and rejected by Rust prompt loading, while
  the package master switch still provides one-click all-off/all-on behavior.
  Codex plugin artwork is read from each nearest `.codex-plugin/plugin.json`
  (`interface.composerIcon`, then `interface.logo`) and shown on package/skill
  rows directly, without an extra shared backing tile or border; the neutral
  Sparkles mark is shown by itself as fallback. Icon paths must remain inside
  their plugin root, supported raster/SVG assets are size-limited, and shared
  icons are deduplicated in the catalog rather than repeated for every child.
- Chat uses a minimal two-sided conversation layout: user messages are compact
  bubbles aligned to the right, while TierNote answers remain readable,
  unframed content aligned to the left. Do not show participant names or avatars;
  message position already communicates the speaker.
- Opening AI chat or switching conversations must position the message area at
  the bottom before paint, with no visible scroll animation. New output follows
  only while the user remains near the bottom; reading older messages must not
  pull the user back down.
- Provider reasoning/thinking content stays internal to the model session. Never
  emit it into the chat UI or persist it in UI messages; only the final answer
  is user-visible. When loading conversations, remove reasoning-detail markup
  written by versions affected by the v0.0.6 streaming bug.
- The chat composer shows context usage as a percentage in its metrics line.
  Request-only context maintenance follows the staged Reasonix approach: at
  about 60% of the 1,000,000-byte app budget, stale tool results are snipped;
  at 80%, they are pruned to placeholders; if the request is still too large,
  older history is compacted while about 500 KB of recent messages and up to
  150 KB of deterministic digest remain. The system prompt stays byte-stable
  between rare compactions to improve provider prefix-cache reuse, and the
  complete original conversation always stays on disk. The actual provider
  limit may be lower.
  AI chat exposes New chat actions in three places: the conversation header,
  beside AI chat in the fixed left navigation, and in the fixed right-rail
  header. On non-AI pages, the right-rail action returns to AI chat instead.
  Selecting a saved conversation is read-only and must not move it to the top of
  history; only new conversation content changes its recency. Each history item
  ends with its actual last-updated date and time.
- Avoid hover tooltips and decorative hover motion throughout the app.
- Use generous, older-adult-friendly typography, especially in the center
  reading area.
- The home tier list keeps the original card presentation:
  a rounded bordered card with thin row dividers, tinted tier label cells with
  a left color strip, and plain large text items sized to their content. Do
  not render items as bordered buttons or equal-width grid cells, and do not
  add arrows. Pointer drag-and-drop reordering between and within tiers stays
  enabled in this presentation. Drag hit-testing has no logical gaps: each
  wrapped visual line is continuously partitioned at card center lines, so the
  visible spacing belongs to its adjacent insertion slot instead of falling
  through to an incorrect append-at-end target.
- The right pane stacks two persistent sections: **Favorites** on top and
  **My Plan** shortcuts (supplements, exercise, diet, daily routine, health log) below; when a note
  is open its sources appear as a third section. The old header star toggle is
  gone (favorites are always visible). On first launch the favorites are seeded
  once with Bryan Johnson (flag `tiernote:favorites-seeded:v1`); a user's
  later edits are never overwritten.
- The **My Plan** rail has five sections: supplements (补剂计划), exercise (运动计划), diet (饮食计划), daily routine (作息计划), and health log (健康记录). Clicking a section opens its own **note page** — `plans/supplements.md`, `plans/exercise.md`, `plans/diet.md`, `plans/daily-routine.md` — rendered like any other library note (new page, back navigation); the health log opens the per-day editor page. The AI maintains the four plan pages via the `update_plan` tool (standard format: goals, current status, concrete arrangements, review notes).
- AI tools follow the general workspace model described above. Generic text/code
  tasks use the workspace list/read/write/exact-replace tools. Note-specific tools
  remain available only when relevant: `save_note`, `update_note`, `update_plan`,
  and `update_tier`. The home tier list is derived only from tiered Markdown in the
  selected workspace, so a new workspace starts empty and switching roots never
  leaks the Demo list. Loading reads only the first 32 KB needed for metadata rather
  than parsing note bodies. Drag order is workspace-local metadata in
  `.tiernote/tier-order.json`; Markdown frontmatter remains the source of truth
  for tier membership. Frontend workspace work is generation-scoped: selecting
  another root immediately invalidates pending loads and mutations so an old root
  can never republish its snapshot over the new workspace. The frontend reloads
  after every Agent run so edits appear immediately.
- AI settings separate **provider** and **model**; wire protocol is derived. TierNote
  reads the public `https://models.dev/api.json` catalog for provider names,
  default OpenAI-compatible endpoints, models, capabilities, context limits,
  reasoning effort options, and USD pricing; provider marks come from
  `https://models.dev/logos/{provider}.svg`. The Rust backend caches the bounded,
  validated catalog for 24 hours at `TierNote/models-dev-catalog.json` in the
  current user's app-data directory and falls back to that cache while offline.
  Provider UI uses the canonical models.dev display name only. Do not repeat the
  internal lowercase provider ID below the name; composer model choices also use
  the canonical name rather than a legacy stored label.
  Selected providers may expose multiple composer models. The official Anthropic
  provider always uses its native Messages API and shows a short inline note;
  every other provider, including DeepSeek, always uses the OpenAI-compatible
  protocol. DeepSeek's default base URL is `https://api.deepseek.com`; the old
  mistaken `/anthropic` default is migrated automatically. Provider URL, API key,
  selected models, active model, derived protocol, and reasoning
  effort persist in plaintext `TierNote/config.json` in app-data only. Existing
  two-protocol configs migrate without discarding their URL, model, or key. In
  the provider directory, the default provider stays first and providers with
  selected models move directly below it; untouched catalog providers follow.
  A configured non-default provider with no selected models keeps its local URL
  and key but shows no `0` badge.
  Each provider's model list is fully expanded with no height cap, result limit,
  or nested scrollbar; the outer settings surface handles the added height.
  Normalization merges duplicate legacy records that resolve to the same provider
  ID, preferring the active record and unioning its explicitly selected models. This
  prevents a configured non-default provider from incorrectly displaying `0`.
  The provider directory also offers **Add custom**. It asks for a custom name,
  creates an OpenAI-compatible local configuration, and lets the user add model IDs
  manually. Custom providers stay together at the top of the directory, use a
  neutral cube mark, and replace the catalog
  documentation link with an explicit trash action that removes that provider only.
  Manually entered model IDs are local records: they are enabled immediately, render
  once without a duplicate display name, icon, or guessed price, and use the same
  checkbox as catalog models. Unchecking only removes the model from the composer;
  its separate local record remains until the row's trash action deletes it. Catalog
  refreshes may enrich matching metadata but never
  remove local model selections; even a catalog-deprecated selected model stays visible.
  The former seeded `deepseek-v4-flash` default is cleared when its legacy
  OpenAI/Anthropic slot is migrated. Composer model text is valid only when the
  model remains in the explicit selected-model array; otherwise it reads Choose model.
- The AI composer model menu and reasoning control are functional configuration,
  not previews. Model changes update the active provider/model immediately.
  Every catalog-declared reasoning model exposes TierNote's fixed five choices:
  `low`, `medium`, `high`, `xhigh`, and `max`. Do not filter or clamp these from
  models.dev `reasoning_options`; provider endpoints may normalize unsupported
  intermediate values themselves. Choices are sent as `reasoning_effort` for OpenAI-compatible Chat
  Completions or `output_config.effort` for Anthropic Messages. Models without a
  catalog-declared reasoning capability show a non-interactive Standard readout and
  receive no guessed reasoning parameter.
- Every outbound model request identifies the app to compatible upstreams with
  `HTTP-Referer: https://tiernote.org`, `X-OpenRouter-Title: TierNote`, and the
  backward-compatible `X-Title: TierNote`. This attribution replaces any inherited
  EchoBird identity and applies to both streaming and
  synchronous OpenAI-compatible/Anthropic requests.
- The desktop app's TierNote brand link opens `https://tiernote.org/`. Download and
  update endpoints remain separately configured until their hosting is migrated.
- AI provider settings, including API keys, persist as plaintext JSON in the
  current user's app-data directory (`TierNote/config.json`). They must
  never be written into the repository or knowledge library.
- Borderless modal headers share one text-only standard component. Use typography
  for hierarchy, never a decorative or category icon to the left of the title;
  keep the explicit close action aligned on the right and do not maintain separate
  modal-title alignment rules.
- Local knowledge retrieval uses an in-process Rust knowledge map: cached
  language-aware Markdown parsing, weighted title/path/heading/body matching,
  one-hop Markdown-link graph expansion, and relevant excerpt selection.
  Automatic grounding and the `search_library` tool share this retriever. It
  uses no embedding API, external service, vector database, or indexing tokens.
- Evidence-oriented questions automatically use an app-managed live research
  layer: the configured model produces a concise English biomedical query that
  is instructed to exclude personal identifiers and measurements,
  then the backend searches PubMed, ClinicalTrials.gov, and bioRxiv (through
  Europe PMC). Answers receive a deterministic source list and must distinguish
  peer-reviewed papers, trial registrations/results, and preprints.
- The app silently checks the latest GitHub release. When an update exists, a
  small teal update control appears beside the sidebar product name. Windows
  downloads the published NSIS installer with circular progress and launches
  it; unsupported platforms or failed installs fall back to the product
  website.
- Workspace Agent uses one completion-first path. Cache reuse, targeted memory and
  Library Graph retrieval, duplicate-call detection, and context maintenance are
  always enabled; there is no user-selectable economy/full quality mode. The
  global emergency ceiling only produces an honest final status instead of
  stopping with a hard tool-loop error.
- The temporary product-positioning memo for the Agent's cost-saving focus
  lives at `docs/NOTE_AGENT_SAVINGS.md`; keep it in mind when refining product
  copy, pricing, model recommendations, or agent behavior.
- Memory routing keeps two user-visible sources of truth separate: confirmed
  facts are written into the managed `我的资料/plans/*.md` pages, while the
  user-selected workspace remains the general work and research/source directory. The
  app-data `memory.json` is only a rebuildable source index; personal context is
  retrieved from Markdown with a small question-aware byte budget and is placed
  in the user message so the system prompt stays cache-stable.
- The visible My Contexts (`我的设定`) page exposes AI-retrieval switches for its five content notes.
  All five default on and persist locally under
  `tiernote:my-info-retrieval:v1`; Add Material remains an action rather than a
  retrievable section. Every agent request sends the enabled stable IDs, and
  Rust applies the resulting localized-path allowlist to both question-aware
  Library Graph context and always-on memory injection. My Contexts cards are direct
  navigation entries with no selected-card state; their light neutral surface is
  `#f1f1f1`. Enabled/context states use iOS blue (`#007aff`) in light mode and
  egg-yolk yellow (`#e7be15`) in dark mode. The same state color marks the active
  library multi-select control, selected-file checkmarks, and the removable file
  context pill in the AI composer.

## Website

- The public website is active again at `https://tiernote.org/`. The
  single-page site under `website/` is independent from the desktop UI and keeps
  its own brand, copy, download routes, and screenshot assets.
- Product screenshots are paired by locale. English and Simplified Chinese use
  matching desktop captures, and the in-place language switch updates both copy
  and screenshots. Other incomplete locales continue to fall back to English.
- Remote usage: `irm https://tiernote.org/install.ps1 | iex`. The script
  first tries the website's version/download routes and falls back to the latest
  GitHub Release asset, so it remains useful while the public site is offline or
  being rebuilt.
- Primary product URL: `https://tiernote.org/`.

## Architecture and important paths

- Desktop frontend: React + TypeScript + Vite under `src/`.
- Desktop shell/backend: Tauri 2 + Rust under `src-tauri/`.
- Product starter library: `starter-knowledge/`.
- Desktop visual assets: `public/`, `src-tauri/icons/`, and `设计思路/`.
- Architecture notes: `docs/ARCHITECTURE.md`.
- Bilingual-library rules: `docs/BILINGUAL_LIBRARY.md`.
- Cross-platform release workflow: `.github/workflows/release.yml`.
- Website: static product page, Cloudflare Worker download routes, remote install
  scripts, release version metadata, brand assets, and localized screenshots.

## Restore development dependencies on a new machine

Prerequisites:

- Node.js and npm
- Rust toolchain
- Tauri platform prerequisites for the operating system

Desktop:

```powershell
cd C:\TierNote
npm install
npm run library:check
npm run typecheck
npm run tauri:dev
```

Website:

```powershell
cd C:\TierNote\website
npx serve .
```

Recreating desktop `node_modules/`, `dist/`, or `src-tauri/target/` is expected.
These are deliberately excluded from portable copies because they are generated
and machine-specific. The website itself has no generated build directory.

## Recommended continuation

1. Continue refining the desktop experience and verify pane resizing, native
   title-bar behavior, keyboard navigation, and readable scaling.
2. Add and test night mode.
3. Finish product-grade AI provider configuration and knowledge-grounded tool
   calls.
4. Review the bilingual starter library for scientific sourcing and product
   neutrality.
5. Test the published `v0.1.1` installers on real Windows, macOS, and Linux
   machines. Future production releases should add Windows and Apple code
   signing when certificates are available.

## Agent-logic optimization references (added 2026-08-07)

The AI-chat empty state advertises three capabilities that TierNote already
implements partially. When optimizing the agent loop later, borrow from these
references:

- DeepSeek cache optimization and hit rate — [Reasonix](https://github.com/esengine/DeepSeek-Reasonix):
  keep the system prompt byte-stable, reuse provider context caches, and report
  cache hit rate in the composer metrics line.
- Anti-over-engineering prompts — [ponytail](https://github.com/DietrichGebert/ponytail):
  keep agent instructions minimal and specific; avoid bloated system prompts.
- Library Graph — Markdown version of [code-review-graph](https://github.com/tirth8205/code-review-graph):
  build an in-process graph over the local Markdown library (links, paths,
  headings) instead of external services.

The UI copy on the empty chat screen: **DeepSeek 缓存极致优化 + 高命中率记忆路由 +
Library Graph 检索 + 短输出、少调用、自动压缩** (English: DeepSeek cache
optimization + high-hit memory routing + Library Graph retrieval + shorter
output, fewer calls, automatic compaction). The empty state is a
semi-transparent watermark that disappears as soon as a conversation starts,
with the closing value line **让每一个 Token，产出至少两倍价值。** (English:
Make every token deliver at least twice the value.)

## Starter data ownership (2026-08-08)

The managed Demo library and My Info pages are starter data only. TierNote
creates their bilingual seed content once, and then treats every file as user
data. A permanent `.starter-pack-initialized` marker prevents later launches,
upgrades, or starter-content revisions from overwriting or recreating edited or
deleted files. When upgrading a pre-marker installation, any existing file means
the directory is adopted as-is; TierNote writes the marker without backfilling
missing seed files. Current Chinese directory names and My Info section IDs are
transitional implementation details, not permanent product contracts.

My Info retrieval switches are enforced in both request-scoped retrieval and AI
tool calls. If the selected workspace is the My Info directory or one
of its ancestors/descendants, the managed My Info subtree is excluded from the
general library route and only the enabled personal-section allowlist may expose
its contents.

## Audio-to-text import foundation (2026-08-10)

The desktop Audio to text settings are backed by real app-data state rather
than UI-only placeholders. Provider configuration is stored as plaintext JSON
at the current user's local app-data `TierNote/transcription.json`; it is never
written into the repository or selected workspace. Provider records are kept
independently so switching services does not discard their endpoint, model, or
API key. The hosted path has separate request adapters for OpenAI-compatible,
Deepgram, and AssemblyAI protocols and streams audio files instead of reading
the whole upload into memory.

The local path downloads pinned runtime and model resources into the current
user's local app-data `TierNote/transcription/` directory by default. Audio to
text now exposes one tab and one independently configurable storage directory
for FireRedASR2, FunASR, Whisper CPU, and Whisper NVIDIA. Moving a directory
migrates only that engine family, rejects targets inside its current models or
runtimes subtree, and ignores stale migration results after the user changes
tabs. Every fixed resource
has an expected byte size and SHA-256 digest; archives are extracted only after
verification. Windows supports Whisper CPU/NVIDIA and FunASR, Linux supports
Whisper CPU and FunASR, and Apple silicon supports FunASR.

FireRedASR2 is a real managed local route rather than an external-link
placeholder. Its official source is pinned to revision
`4e7d9aaf4482a47cec1724807026b9b151926eb5`; installation creates an isolated
Python environment, tries the Tsinghua PyPI mirror before the default index,
installs the pinned official package plus the omitted binary feature-bank and PEFT dependencies,
and marks the engine ready only after imports succeed. Windows uses Python 3.11–3.13 because the
feature-bank package does not provide a Python 3.14 Windows x64 wheel; macOS and Linux also allow 3.14.
an incompatible partial environment is rebuilt on retry. Runtime installation failures remain
available from backend status when the user leaves and reopens the settings page. AED and
LLM model bundles prefer ModelScope and fall back to revision-pinned Hugging
Face files; every required file is size- and SHA-256-checked. Local input is
decoded and converted to 16 kHz mono PCM WAV, then TierNote invokes the selected
engine/model. FireRed disables the optional VAD/LID/punctuation modules for the
single-file route and reads the official CLI's `result.jsonl` output.

The home capture flow now treats YouTube, Bilibili, TikTok, Douyin, Xiaohongshu,
X, and their supported short-link hosts as media sources. It first asks the
media source for public subtitles and cleans VTT/SRT-style cues, tags, and
duplicate lines. If no usable subtitle is available, it validates the selected
hosted or local configuration, downloads the best compatible audio into a
temporary directory, transcribes it, and then sends the transcript through the
existing note-organization model to produce editable Markdown. Ordinary web
URLs retain the existing HTML extraction path. Direct local audio/video file
selection is not implemented yet.

The bundled media-to-text skill treats the generated note title as a narrow
navigation label rather than a copy of the source headline. Chinese titles aim
for 7–10 visible characters and English titles for 3–6 words, while preserving
necessary proper names instead of truncating them. Transcript polishing removes
speech and caption noise plus generic AI framing, but must preserve the source's
meaning, uncertainty, attribution, names, numbers, and voice; it may not invent
facts, opinions, examples, or conclusions merely to make the note read smoothly.

## Phone message channels (updated 2026-08-14)

TierNote supports two paired private phone channels: Tencent Weixin iLink
and Telegram Bot API. The Rust channel runtime stores credentials and a
durable task queue under the current user's local app-data `TierNote/`
directory; neither credentials nor pending jobs enter the selected workspace.
Weixin follows Tencent's MIT-licensed `openclaw-weixin` HTTP/JSON protocol for
QR login, optional phone verification, long polling, `context_token` replies,
and sync-cursor recovery. Telegram uses Bot API long polling, private chats,
and a one-time pairing code after the user supplies a BotFather token.

Inbound text now enters the same local Agent Loop as the desktop composer.
Ordinary text is ordinary conversation and must never be saved merely because it
came from a phone. A message consisting primarily of a public URL is the one
implicit action: fetch, organize, and save the source as a local note. Explicit
requests may use the same note search/read/create/update and memory tools as the
desktop client. Terminal access, app-settings mutation, unpaired senders, group
chats, WhatsApp, and arbitrary attachments remain outside this channel surface.

Each connected channel stores a durable conversation ID and continues that local
conversation across phone turns. Agent transcripts and UI messages are written to
the normal `conversations/` store, so phone conversations appear and can be
continued from the desktop right rail. Jobs are persisted before the inbound cursor
is acknowledged and removed only after the final phone reply is delivered.

## Next-work plan

1. **Phase 1 — Finish import preprocessing**: media URL audio download and
   hosted/local transcription are implemented. Next, add direct local file
   selection and conversion for md/html/txt/pdf/docx/audio/video, then define
   deterministic fallback and error reporting for unsupported sources.
   Keep processing local by default, SSRF-safe, and free of login-cookie
   channels. Acceptance: selecting a local document or media file produces an
   editable Markdown note through the same capture dialog.
2. **Phase 2 — Library Graph**:
   evolve `knowledge_map.rs` into a persistent registry + backlinks + orphan/
   broken-link lint + deterministic metadata rebuild after agent runs;
   measure token and tool-call savings.
3. **Phase 3 — Cache hit rate and cost**: keep the stable TierNote system
   prompt small and compare provider-reported cache usage across model providers.
4. **Phase 4 — Evidence-retrieval self-healing routing**:
   primary/fallback endpoints for Europe PMC / PubMed / ClinicalTrials with
   health checks and automatic degradation.

## Provider prefix-cache continuity (2026-08-10)

AI conversations now have one UI transcript and one durable Agent Loop provider
transcript in TierNote. Conversation mutations still share one process-local
storage lock to protect UI JSON and its index.

Cache usage remains the provider-reported aggregate. DeepSeek does not return
token attribution by prompt section, so TierNote must not claim a synthetic
rate that subtracts personal-context tokens. The composer labels this value
`累计命中` / `Total cache` to make the cold-start-inclusive scope explicit.

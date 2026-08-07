# TierNote — portable Codex project memory

Updated: 2026-08-07

This file preserves the decisions and working context needed to continue the
project on another machine. It contains no API keys, private user parameters,
or temporary deployment credentials.

## TierNote fork status

- This repository is the TierNote sister product forked from the original longevity app.
- Visible product name: **TierNote** (always use the closed wordmark, without a space).
- Internal directory/package/storage identifiers may use `TierNote` or `tiernote`.
- TierNote is a clean, general-purpose note system rather than a longevity product.
- The homepage editable T1–T5 tier list is the core interaction model because it
  makes prioritization and decisions immediately legible.
- Longevity-specific starter content and product copy below are inherited context
  awaiting replacement; they are not the TierNote product direction.

## Desktop redesign direction (2026-08-07)

- The desktop app is moving to a calm, Codex-informed note-workspace style. This
  supersedes older instructions below that require a colorful dashboard shell or
  a blue-green gradient title bar.
- TierNote now uses a monochrome black, graphite, and gray shell with no selectable
  brand color. The homepage is the deliberate exception: its three entry cards and
  T1-T5 map use restrained category colors. Appearance settings keep system/light/dark
  modes and language, but no longer expose accent choices.
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
- The left rail spans the full window height. On Windows/Linux its logo and navigation
  use the former empty top-left title-bar area; macOS keeps extra top clearance for
  native traffic-light controls. The web title bar starts above the inner work panel,
  not above the left rail.
- The homepage tier list remains the product core. T1-T5 use muted rose, amber,
  yellow, teal, and green, limited to the tier strip and softly tinted label cells.
- The display brand uses the transparent rounded-corner feather mark plus the
  closed `TierNote` name in the left rail; the same mark remains in the chat empty
  state. Keep internal paths, storage keys, window title, and bundle identifiers
  as `TierNote`. The in-app mark source is `src-tauri/icons/logo.png`, which must
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
- In the left rail the wordmark uses the same Lora italic face as the AI-chat
  identity at a larger 22px; the AI-chat empty-state logo and wordmark share a
  compact 42px height basis.
- `DESIGN.md` is the desktop design source of truth. The public `website/` remains
  a separate product surface with its existing expressive brand direction.
- Local UI references are archived in ignored directories: `references/pasture/`
  (Apache-2.0, Tauri + React, closest implementation reference) and
  `references/palot/` (MIT, useful for sidebar and conversation organization).
  Do not copy OpenAI trademarks or code extracted from the closed-source Codex app.

## Legacy source-product context

The remaining notes describe the source product and are retained temporarily so
the working behavior is not lost during migration. The TierNote rules above take
precedence whenever they conflict.

## Product identity

- Product name: **TierNote** (always use the closed wordmark in visible text).
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

1. Knowledge reading and internal note links.
2. AI-assisted collection: users paste a URL or material into the conversation
   and ask AI to structure and save it; there is no separate quick-capture
   navigation item.
3. AI-assisted longevity planning grounded in the local knowledge library.

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
- Top title/drag bar uses a restrained blue–green gradient. Its left side shows
  the bilingual statement **延寿，是人类在 AI 时代最有价值的投资。** /
  **Longevity is humanity’s most valuable investment in the age of AI.**; it
  should not repeat the logo, product name, or main-page slogan.
- Windows/Linux use custom window controls; macOS uses native traffic-light
  controls on the left.
- The desktop app is single-instance. Launching it again must restore and focus
  the existing main window instead of opening another process/window.
- Settings is a gear button near the window controls, not a permanent sidebar
  item. Keep the dialog organized into three focused categories: model,
  knowledge library, and appearance. Currency controls belong at the bottom of
  the model page rather than in a separate usage/cost category. Do not collapse
  unrelated settings back into one long form. In the light theme, keep the
  entire settings shell pure white, and keep all category panels at one fixed
  outer height so switching never moves the dialog boundaries.
- Remove redundant headers, helper labels, dark duplicate divider lines,
  “30 秒结论”, model IDs in the chat box, local-context labels, and knowledge
  context cards.
- Keep the chat composer in a persistent bottom layout row. The content above
  it scrolls independently so the final message is never covered and the
  composer never disappears while scrolling.
- Keep the composer compact. Below it, show one restrained metrics line with
  provider-reported cache hit rate and token usage, API request count, local
  context percentage, and a cost estimate when current model pricing is known.
  The metrics are stored per conversation and switch with the active chat.
  The cost unit supports Auto, CNY, and USD. Auto follows the interface language
  (Chinese uses CNY, English uses USD); CNY and USD use DeepSeek's official
  regional token prices directly rather than converting through an exchange
  rate. Persist the preference locally under `tiernote:currency`.
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
- The home tier list keeps the original Open Longevity card presentation:
  a rounded bordered card with thin row dividers, tinted tier label cells with
  a left color strip, and plain large text items sized to their content. Do
  not render items as bordered buttons or equal-width grid cells, and do not
  add arrows. Pointer drag-and-drop reordering between and within tiers stays
  enabled in this presentation.
- The right pane stacks two persistent sections: **Favorites** on top and
  **My Plan** shortcuts (supplements, exercise, diet, daily routine, health log) below; when a note
  is open its sources appear as a third section. The old header star toggle is
  gone (favorites are always visible). On first launch the favorites are seeded
  once with Bryan Johnson (flag `tiernote:favorites-seeded:v1`); a user's
  later edits are never overwritten.
- The **My Plan** rail has five sections: supplements (补剂计划), exercise (运动计划), diet (饮食计划), daily routine (作息计划), and health log (健康记录). Clicking a section opens its own **note page** — `plans/supplements.md`, `plans/exercise.md`, `plans/diet.md`, `plans/daily-routine.md` — rendered like any other library note (new page, back navigation); the health log opens the per-day editor page. The AI maintains the four plan pages via the `update_plan` tool (standard format: goals, current status, concrete arrangements, review notes).
- AI tools follow the "everything is a note" model: `save_note` (new notes in inbox/dossiers/cases/stories), `update_note` (edit any note by relative path, optionally writing `sources` into frontmatter), `update_plan` (the four plan pages), and `update_tier` (reassign an item's T1–T5 tier in `catalog/strategies.csv`, which drives the home strategy map; `pending` hides an item). The frontend reloads the library after every agent run so edits appear immediately.
- AI settings expose OpenAI and Anthropic wire protocols. Each protocol keeps
  its own API URL, model, and API key, and switching protocols must never
  overwrite the other protocol's values. New fields start empty; service URLs
  and model names appear only as visibly marked `e.g.` placeholders.
- AI provider settings, including API keys, persist as plaintext JSON in the
  current user's app-data directory (`TierNote/config.json`). They must
  never be written into the repository or knowledge library.
- Modal headers share one standard component: a fixed 44 x 44 icon tile aligned
  to the vertical center of an `TIERNOTE` eyebrow plus main title block.
  Settings and capture dialogs use the same header and add a close action on the
  right; do not maintain separate modal-title alignment rules.
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
- Note Agent uses one completion-first path. Cache reuse, targeted memory and
  Library Graph retrieval, duplicate-call detection, and context maintenance are
  always enabled; there is no user-selectable economy/full quality mode. The
  global emergency ceiling only produces an honest final status instead of
  stopping with a hard tool-loop error.
- The temporary product-positioning memo for the Note Agent's cost-saving focus
  lives at `docs/NOTE_AGENT_SAVINGS.md`; keep it in mind when refining product
  copy, pricing, model recommendations, or agent behavior.
- Memory routing keeps two user-visible sources of truth separate: confirmed
  facts are written into the managed `我的资料/plans/*.md` pages, while the
  user-selected knowledge directory remains the research/source library. The
  app-data `memory.json` is only a rebuildable source index; personal context is
  retrieved from Markdown with a small question-aware byte budget and is placed
  in the user message so the system prompt stays cache-stable.
- A future night mode is desirable but not yet a release blocker.

## Website

- Website source: `website/`
- Primary hosted URL: `https://tiernote.life/` (Cloudflare Pages).
- The website is build-free HTML/CSS/JavaScript. For Cloudflare Pages, leave
  the framework preset, build command, and root directory empty; set only the
  build output directory to `website`. GitHub Pages publishes that same folder
  from the main repository workflow as a mirror at
  `https://edison7009.github.io/TierNote/`.
- `website/version.json` participates in `npm run release:check` and must match
  all desktop version fields. `website/_worker.js` exposes release-aware
  version and download routes, and the install scripts fall back to GitHub.
- The desktop app and website are separate products in the same repository.
  The former `TierNote-website` repository remains as a migration backup.
- Visual direction: dark teal, Renaissance scientific engraving, warm paper,
  copper/brass lines, and a full-bleed Tree of Life hero image. It should feel
  optimistic, healthy, literary, and scientific—not dense or
  trypophobia-inducing.
- Keep the hero image clean. The six content sections below it use a restrained
  static analog-film treatment: one shared lightweight WebP grain texture,
  section-specific exposure direction, muted teal/copper light leaks, and soft
  edge fading. The overlays sit behind content, never animate, and must preserve
  text contrast on desktop and mobile.
- Website hero:
  - Chinese: **延寿，是人类在 AI 时代最有价值的投资。**
  - English: **Longevity is humanity’s most valuable investment in the age of AI.**
- Website hero lead is one unified subtitle paragraph at one visual level:
  **富豪花费百万美元借助科技延寿，而 TierNote 希望把生命之光同样带给普通家庭；以
  Bryan Johnson 公开的延寿计划为蓝本，融入 AI 与科学依据，让普通人也能拥有富豪级的延寿策略。**
  Do not render the Bryan Johnson sentence as a smaller note.
- The hero installer uses text-only platform tabs with no underline indicator.
  Its Chinese primary actions are **安装 TierNote** and **在 GitHub 上点星**;
  English keeps **Install TierNote** and **Star on GitHub**. Align the
  install label and release version by their text baselines.
  Its macOS fallback note is the compact inline command: `macOS 首次需在「终端」
  xattr -cr '/Applications/TierNote.app'`. Keep this installation area
  comfortably readable: 12px platform tabs, 13px desktop command text, and a
  14px macOS note; mobile may ellipsize the visible command while copying the
  complete value.
- The scrolling T1–T5 strip is bilingual; strategy names are the same enlarged
  size as the T1–T5 labels.
- Open manifesto section keeps **科学延寿，不应该是富豪专属。** on the
  left and shows the bilingual desktop home screenshot on the right; do not
  restore the former three-principle list there.
- The following **人人都能看得懂的界面。** section shows the bilingual NAD+
  knowledge-page screenshot instead of repeating the home screenshot.
- Product-section title:
  - Chinese: **AI + 科学的时代**
  - English: **The age of AI + science**

## Architecture and important paths

- Desktop frontend: React + TypeScript + Vite under `src/`.
- Desktop shell/backend: Tauri 2 + Rust under `src-tauri/`.
- Product starter library: `starter-knowledge/`.
- Desktop visual assets: `public/`, `src-tauri/icons/`, and `设计思路/`.
- Architecture notes: `docs/ARCHITECTURE.md`.
- Bilingual-library rules: `docs/BILINGUAL_LIBRARY.md`.
- Cross-platform release workflow: `.github/workflows/release.yml`.
- Website: build-free static HTML/CSS/JavaScript under `website/`.

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

## Reference archive and next-work plan (2026-08-07)

`references/` holds shallow clones of projects studied for TierNote. It is
gitignored (never committed); on a new machine, re-clone as needed. A memory
file with full analysis lives at `references/README.md`.

Archived repos:

- `markitdown/` — Microsoft's file → clean Markdown converter (PDF/Word/PPT/
  Excel/HTML/images/audio/YouTube). Highest direct value: TierNote's
  "paste material → AI structures and saves it" flow lacks this preprocessing
  layer. MIT license.
- `codebase-memory-mcp/` — tree-sitter → persistent code knowledge graph.
  Architecture blueprint for TierNote's Library Graph over the Markdown
  library (persistent registry, backlinks, structural queries). ~1.3 GB clone;
  self-reported benchmarks (arXiv:2603.27277) — borrow design, not numbers.
- `pi-llm-wiki/` — Karpathy-style LLM Wiki: four-layer model (immutable raw /
  editable wiki pages / generated meta / config), ownership guardrails,
  deterministic lint, agent working memory. Read `docs/architecture.md`.
- `Agent-Reach/` — web-reading capability layer (Jina Reader for pages,
  yt-dlp subtitles, RSS, gh CLI; per-channel primary/fallback routing +
  `doctor` health checks). Directly relevant to the home capture flow
  "paste a link → AI structures and saves a note". Borrow the zero-config
  channels and self-healing routing; do NOT bundle its CLI installs or
  login-cookie channels into the desktop product.
- `DeepSeek-Reasonix/`, `ponytail/`, `code-review-graph/` — cache-hit
  optimization, anti-over-engineering prompts, MD link-graph prototype.

Not archived (analyzed, low/borrow-only): taste-skill (anti-slop prompt
reference only),
OpenMontage (cost transparency + self-review gates only).

Next-work plan:

1. **Phase 1 — Import preprocessing layer** (markitdown + Agent-Reach pattern):
   detect source type → multi-backend routing → fallback. URLs use the
   zero-config read chain (Jina Reader / built-in HTML cleaning / yt-dlp
   subtitles / RSS); local files use built-in Rust conversion for
   md/html/txt/pdf/docx subset, optional markitdown CLI for complex formats.
   Local-file-only, SSRF-safe, no login-cookie channels. Acceptance: pasting
   a PDF or a URL produces a structured Markdown note.
2. **Phase 2 — Library Graph** (codebase-memory-mcp + pi-llm-wiki blueprints):
   evolve `knowledge_map.rs` into a persistent registry + backlinks + orphan/
   broken-link lint + deterministic metadata rebuild after agent runs;
   measure token and tool-call savings.
3. **Phase 3 — Cache hit rate and cost** (Reasonix) + prompt slimming
   (ponytail): audit `agent_loop.rs` system prompt.
4. **Phase 4 — Evidence-retrieval self-healing routing** (Agent-Reach pattern):
   primary/fallback endpoints for Europe PMC / PubMed / ClinicalTrials with
   health checks and automatic degradation.

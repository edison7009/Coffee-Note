# My Info Retrieval Toggles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add five default-on My Info switches that persist locally and prevent disabled documents from entering either layer of AI personal-context retrieval.

**Architecture:** The frontend stores a stable five-key boolean map in local storage and sends the enabled section IDs with every agent request. Rust maps those IDs to localized Markdown paths and applies one allowlist to both question-aware retrieval and always-on memory injection; an absent request field remains backward-compatible and means all five sections are enabled.

**Tech Stack:** React 18, TypeScript, CSS, Tauri 2, Rust, Node test runner, Cargo tests.

---

### Task 1: Frontend retrieval preferences

**Files:**
- Create: `src/myInfoRetrieval.ts`
- Create: `tests/my-info-retrieval.test.mjs`
- Modify: `src/types.ts`

- [x] Write failing tests for five default-on section IDs, malformed persisted data, and enabled-ID projection.
- [x] Run `node --test tests/my-info-retrieval.test.mjs` and confirm it fails because the module does not exist.
- [x] Implement the typed preference helper and add `enabledMyInfoSections` to `AgentRequest`.
- [x] Re-run the focused Node test and confirm it passes.

### Task 2: Backend retrieval allowlist

**Files:**
- Modify: `src-tauri/src/knowledge_map.rs`
- Modify: `src-tauri/src/memory.rs`
- Modify: `src-tauri/src/agent_loop.rs`

- [x] Write failing Rust tests proving a disabled personal document is absent from keyword retrieval and always-on memory.
- [x] Run the focused Cargo tests and confirm compilation fails on the not-yet-created filtered APIs.
- [x] Add an optional allowlist to personal-context construction while preserving existing unfiltered APIs.
- [x] Map stable frontend section IDs to the current locale's Markdown paths; missing request field means all enabled, while an empty list means none enabled.
- [x] Re-run the focused Rust tests and confirm they pass.

### Task 3: My Info switches and request wiring

**Files:**
- Create: `tests/my-info-ui.test.mjs`
- Modify: `src/App.tsx`
- Modify: `src/index.css`
- Modify: `src/i18n.ts`

- [x] Write failing source-level UI tests for the exact Chinese hint, switch semantics, request field, and the non-switch Add Material action.
- [x] Run `node --test tests/my-info-ui.test.mjs` and confirm it fails on the missing UI.
- [x] Initialize and persist retrieval preferences in `App`, pass enabled IDs to every agent request, and render one switch beside each of the five cards.
- [x] Style the 32 x 20 switch with a neutral off state and blue on state, including dark mode and keyboard focus without hover decoration.
- [x] Re-run the focused UI tests and confirm they pass.

### Task 4: Documentation and verification

**Files:**
- Modify: `CODEX_HANDOFF.md`
- Modify: `DESIGN.md`

- [x] Record the five default-on retrieval switches and the backend enforcement rule.
- [x] Run all Node tests, `npm run typecheck`, `npm run build`, focused Cargo tests, and `npm run library:check`.
- [x] Open the My Info page in the running app, verify all five switches default on, toggle one off/on, reload to verify persistence, and inspect desktop layout.
- [x] Review `git diff` for unrelated or generated output and report the result without committing unless requested.

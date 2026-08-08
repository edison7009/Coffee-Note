# Titlebar Wordmark Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the title-bar logo and align the TierNote wordmark with the Home navigation icon.

**Architecture:** Keep the existing React title-bar component and neutral shell CSS. The change is limited to the title-bar brand markup, its spacing rule, and a source-level regression test; all other brand placements remain intact.

**Tech Stack:** React + TypeScript, Vite, CSS, Node.js built-in test runner.

---

### Task 1: Update title-bar brand markup and spacing

**Files:**
- Modify: `src/App.tsx` in `AppTitlebar`
- Modify: `src/index.css` in `.titlebar-brand`

- [x] Remove only the `<img src="/brand/logo-new.png" ...>` child from `.titlebar-brand`.
- [x] Remove the now-unused `gap` declaration from `.titlebar-brand`; keep its right padding so history controls retain their spacing.
- [x] Preserve the existing `TierNote` element, font, title-bar drag region, and all menu/window controls.
- [x] Set `.titlebar-leading` to a 23px left inset so the wordmark shares the Home icon's 14px sidebar padding plus 9px button padding.

### Task 2: Add regression coverage

**Files:**
- Modify: `tests/sidebar-actions.test.mjs`

- [x] Assert that the `.titlebar-brand` block contains no `<img>`.
- [x] Assert that the title bar still contains the `TierNote` wordmark and that the chat empty state still contains the logo asset reference.

### Task 3: Verify the change

**Files:** None

- [x] Run the Node test suite with `node --test tests/*.test.mjs`.
- [x] Run `npm run typecheck` and `npm run build`.
- [x] Inspect the diff and confirm no generated files or unrelated branding placements changed.

# TierNote Note Agent

TierNote is a **Note Agent**, not a coding agent or a general-purpose shell
harness. Its job is to make a user's notes useful, searchable, and cheap to
maintain.

## Product promise

- **Manage notes, not a codebase.** The agent reads the local Markdown library,
  links related notes, captures source material, and writes only through
  domain-specific note tools.
- **Stay local by default.** The library is plain Markdown on the user's
  machine. Provider credentials remain in the app-data configuration file and
  are never copied into the repository or library.
- **Spend tokens where they matter.** Routine note work defaults to Economy
  mode: compact answers, a small output budget, and one precise retrieval before
  a note read. Full mode remains available for deep comparisons and research
  synthesis.

## Note Agent vs. coding agent

| Coding agent | TierNote Note Agent |
| --- | --- |
| edits source files and runs commands | curates Markdown notes and plans |
| optimizes for implementation speed | optimizes for clarity, recall, and cost |
| broad repository context | selected local notes and Library Graph context |
| model choice is usually secondary | cheap DeepSeek-compatible models are a first-class path |

The safe capability surface is intentionally narrow: search and read local
notes, save or update notes, update personal plan pages, and adjust the T1-T5
priority map. There is no arbitrary shell tool.

## Cost controls

The persisted `economyMode` setting is enabled for new installs and migrated
settings. It is sent with both chat and capture requests. The Rust runtime uses
it to cap model output and tool-call rounds, while the stable system prompt
asks the model to avoid repeated source text and exploratory calls. Provider
cache-hit and token totals remain visible in the conversation metrics line.

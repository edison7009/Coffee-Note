# Coffee Note Note Agent

Coffee Note is a **Note Agent**, not a coding agent or a general-purpose shell
harness. Its job is to make a user's notes useful, searchable, and cheap to
maintain.

## Product promise

- **Manage notes, not a codebase.** The agent reads the local Markdown library,
  links related notes, captures source material, and writes only through
  domain-specific note tools.
- **Stay local by default.** The library is plain Markdown on the user's
  machine. Provider credentials remain in the app-data configuration file and
  are never copied into the repository or library.
- **Spend tokens where they matter.** Completion comes first. The agent keeps
  answers concise, retrieves only relevant excerpts, reuses stable prompt
  prefixes, and blocks duplicate calls without putting task quality behind a
  user-selectable economy switch.

## Note Agent vs. coding agent

| Coding agent | Coffee Note Note Agent |
| --- | --- |
| edits source files and runs commands | curates Markdown notes and plans |
| optimizes for implementation speed | optimizes for clarity, recall, and cost |
| broad repository context | selected local notes and Library Graph context |
| model choice is usually secondary | cheap DeepSeek-compatible models are a first-class path |

The safe capability surface is intentionally narrow: search and read local
notes, save or update notes, update personal plan pages, and adjust the T1-T5
priority map. There is no arbitrary shell tool.

## Cost controls

Cost controls are always on and are not a separate quality mode. The Agent keeps
the current task running until it reaches a genuine completion, user
cancellation, provider failure, or the global emergency safety ceiling. Within
that path it uses targeted local retrieval, stable system-prompt prefixes for
cache reuse, duplicate-call detection, stale tool-result maintenance, and
request-level context compaction. Provider cache-hit and token totals remain
visible in the conversation metrics line.

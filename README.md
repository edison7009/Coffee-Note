# Coffee Note

Coffee Note is a local-first desktop workspace for collecting, ranking, reading, and refining Markdown notes with AI assistance.

The editable T1–T5 priority map is the core experience: it makes the work that matters most visible without turning the app into a task manager. Your library stays on your computer by default, and AI provider configuration is stored only in your current user's app-data directory.

## What you can do

- Keep a local Markdown library and browse it in a calm desktop workspace.
- Rank notes from T1 to T5, then reorder them directly on Home.
- Paste links, rough notes, or source material for AI-assisted organization.
- Keep reusable personal context—goals, experience, constraints, and records—under your control.
- Use any selected OpenAI-compatible provider, or Anthropic's native Messages API.

## Development

Prerequisites: Node.js, Rust, and the platform prerequisites for Tauri.

```powershell
npm install
npm run library:check
npm run typecheck
npm run tauri:dev
```

## Privacy

Coffee Note is local-first. Do not commit API keys, personal notes, or generated build output. Provider keys are intentionally stored as plaintext only in the current user's Coffee Note app-data directory.

# Coffee Note

**The most affordable AI note tool.** A local-first AI second brain for knowledge and ideas — deeply optimized for DeepSeek and other cheap models, so every token earns at least twice its value.

> Website: [note.coffeecli.com](https://note.coffeecli.com) · English default, 中文版 `/cn/`

## Highlights

### 🏷️ DeepSeek efficient caching — the more you use, the more you save

Coffee Note is a Note Agent built for notes, not for engineering. It doesn't push you toward expensive Claude, GPT, or Opus plans — it runs on the models you can afford.

- **DeepSeek-compatible and cache-friendly**: stable system prompts and request structures reuse provider prefix caches; cache hits are visible in the chat.
- **Completion-first agent loop**: repeated tool calls are blocked, no artificially truncated tool chains.
- **Library Graph retrieval**: searches your local Markdown library by title, path, hierarchy, body, and links — no embedding API, no vector database, no index tokens.
- **Dual Memory**: high-hit-rate memory routing — it fetches the open note and My Info first, then only the memory the question needs.
- **Cost visible**: token count, request count, cache hit rate, and cost estimate shown per request.
- **Replaceable models**: provider, endpoint, model, and key stored separately — never locked to one vendor.

### 🎬 Any short video URL becomes a note

Paste a YouTube, Bilibili, Douyin, Xiaohongshu, or X link — Coffee Note transcribes the video (API or local engine) and the agent turns the spoken content into structured Markdown. From "watched and forgotten" to searchable, quotable, reviewable.

Local audio/video files (mp3 / mp4 / m4a / wav) work too — drop them in and they become notes.

### 🎞️ Notes grow into PPT and video

Select a few notes, pick a skill, get a finished artifact. One instruction from notes to a presentation — no copy-paste, no layout work.

## Core experience

The editable **T1–T5 priority map** is the heart of the app: it makes the work that matters most visible without turning the app into a task manager.

- Keep a local Markdown library and browse it in a calm desktop workspace.
- Rank notes from T1 to T5, then reorder them directly on Home.
- Paste links, rough notes, source material, or **local files** (txt / md / html / docx / pptx / xlsx / pdf / images / audio / video) for AI-assisted organization.
- Keep reusable personal context — goals, experience, constraints, and records — under your control.
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

Coffee Note is local-first. Your library stays on your computer by default; only your explicit AI requests send the needed context. Do not commit API keys, personal notes, or generated build output. Provider keys are intentionally stored as plaintext only in the current user's Coffee Note app-data directory.

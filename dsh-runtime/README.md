# Coffee Note DeepSeek Harness runtime

This directory is the only Coffee Note integration boundary for
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). DSH owns
the agent loop, session persistence, token metering, tool orchestration, and
context compaction. Coffee Note's Rust core owns product context and local note
tools.

## Version policy

All DSH packages are pinned to exact release-candidate versions in
`package.json` and resolved by `package-lock.json`. Do not depend on the DSH
repository's `master` branch or use version ranges. Upgrade the complete DSH
package set together, run the smoke test, then run the Coffee Note test suite.

```powershell
npm run dsh:ci
npm run dsh:smoke
npm test
cd src-tauri
cargo test --lib
```

## Runtime boundary

- `coffee-note.cordis.yml` is the pinned DSH composition.
- `src/coffee-tools.mjs` registers Coffee Note tools with DSH.
- Rust starts DSH over newline-delimited JSON-RPC on stdio.
- Coffee Note passes catalog-confirmed context, output, and reasoning capabilities
  into the selected DSH model; unknown custom models use conservative limits and
  retain their provider's default reasoning behavior.
- Tool calls cross a random-token TCP bridge bound to `127.0.0.1` only.
- API keys are passed in the child-process environment and remain in the
  current user's local app-data configuration; they are never written here.
- The desktop bundle includes a pinned Node runtime, so end users do not need
  Node.js installed.
- The smoke test performs a complete local prompt against a fake streaming model,
  including reasoning dispatch and streamed completion; it makes no paid request.

The DSH packages are distributed under their upstream MIT license. Their
package license files remain present in the bundled `node_modules` tree.

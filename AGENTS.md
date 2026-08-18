# Coffee Note agent notes

Coffee Note is a sister product forked from the original longevity app. Its visible
product name is **Coffee Note**. The repository directory uses `Coffee-Note`;
internal package names, storage keys, and identifiers use `coffee-note` or
`CoffeeNote` where spaces are invalid; the reverse-domain bundle identifier is
`app.coffeenote.desktop`.
The copied longevity content is transitional and will be replaced with a clean,
general-purpose note model. The homepage tier list remains the core experience.

Before making product or design changes, read `CODEX_HANDOFF.md`. It is the
portable project memory for continuing development on another machine.
Also read `DESIGN.md` before changing the desktop UI; it is the desktop design
source of truth and does not apply to the separate public website.

Project rules:

- Treat the desktop app and the future public website as separate products sharing
  one brand. The current `website/` directory intentionally keeps only the
  Windows remote installer reference until the public site is rebuilt.
- The desktop app must use its own product library. Never bind it to
  `C:\Life extension` or any developer-specific directory.
- Preserve the bilingual starter library and run `npm run library:check` after
  changing it.
- Keep user data local by default. Persist the AI provider configuration,
  including API keys, as plaintext JSON only in the current user's app-data
  directory; never write it into the repository or knowledge library.
- Preserve the restrained neutral black/gray visual language, large readable
  type, and low-chrome desktop UI. Avoid hover tooltips, unnecessary borders,
  redundant labels, and web-like decoration inside the desktop app.
- No native `title` attributes anywhere in the desktop app — we are not a
  website. Hover tooltips are a web pattern; show information inline or behind
  an explicit click and keep `aria-label` for accessibility. One explicit
  rule: non-interactive readouts (like the AI composer model ID) are plain
  text — no cursor change, no hover effects, no tooltip.
- Enforce the desktop minimum type floor from `DESIGN.md`: no readable UI text
  below 13px, no metadata below 12px, 15px left navigation, 14px directory/file
  tree. Never ship smaller text to fix a layout; enlarge the component instead.
- Do not commit generated dependencies or build output (`node_modules/`,
  `dist/`, `src-tauri/target/`).
- Keep `website/install.ps1` and `website/version.json` usable as the remote
  Windows install/update infrastructure. The remaining public website will be
  rebuilt later.
- Before any version bump, release tag, or GitHub Release, read the current
  `docs/RELEASE.md`, inspect the latest `CI` and `Release desktop apps` runs,
  and run `npm run release:preflight`. Push the version commit first and wait
  for the matching `main` CI run to succeed before creating the tag. After
  tagging, monitor the release workflow through publication and verify all nine
  assets plus the website version and Windows download endpoints. Never treat a
  started or draft release as complete.
- Commit as `codex` (lowercase, the https://github.com/codex identity) in this
  repository; local `user.name` and `user.email` are already configured for it.

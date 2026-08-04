# TierNote website

The public website for [TierNote](https://github.com/edison7009/TierNote).
It is plain HTML, CSS, and JavaScript and does not require a build step.

## Development

Serve this directory with any static HTTP server, for example:

```bash
npx serve .
```

Opening `index.html` directly also renders the page. An HTTP server is useful
for testing `version.json` and clipboard behavior.

## Verification

From the repository root:

```bash
node --test website/tests/static-site.test.mjs
node --check website/js/main.js
node --check website/_worker.js
```

## Cloudflare Pages

Only one project setting is required:

| Setting | Value |
| --- | --- |
| Build output directory | `website` |

Leave the framework preset, build command, and root directory empty. The
checked-in `_worker.js` serves static files and provides release-aware
`/version.json` and `/download/<platform>` routes.

Primary URL: [tiernote.life](https://tiernote.life/)

The root `.github/workflows/website-pages.yml` workflow publishes the same
directory to the [GitHub Pages mirror](https://edison7009.github.io/TierNote/).

## Versioning

`website/version.json` must match the desktop version in `package.json`,
`src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`. The repository's
`npm run release:check` command enforces this before a release is published.
The release is visible to the website and installers only after the matching
GitHub Release and platform assets have actually been published.

// Cloudflare Pages Function — note.coffeecli.com
//
// Uses env.ASSETS to serve the static site directly, and proxies GitHub
// Release assets for the install scripts / in-app updater:
//
//   /download/<platform>   → stream the matching GitHub Release asset
//   /version.json?platform → latest published version for that platform
//                            (empty string while CI is still building the
//                            installer, so callers never offer an update
//                            before the file is actually downloadable)
//   /*                     → CF Pages static files (env.ASSETS)
//
// Modeled on Coffee-CLI's Web-Home/_worker.js and OpenLongevity's
// website/_worker.js. Requires Cloudflare Pages "Advanced mode" so the
// exported default handler intercepts requests; see docs/RELEASE.md.

const REPO = "edison7009/Coffee-Note";

// Asset filenames follow `Coffee.Note_<version>_<OS>_<arch>.<ext>`
// (renamed by the release.yml CI step). Keys are the platform slugs that
// install.ps1 / install.sh / docs/RELEASE.md request; each slug maps to a
// single asset. The old/pre-rename patterns are kept as a fallback so a
// manually-published tag still resolves.
const PLATFORM_PATTERNS = {
  windows: (name) =>
    name.endsWith("Windows_x64-setup.exe") || name.endsWith("x64-setup.exe"),
  "windows-msi": (name) => name.endsWith("Windows_x64.msi"),
  "macos-arm": (name) => name.endsWith("macOS_arm64.dmg"),
  "darwin-aarch64": (name) => name.endsWith("macOS_arm64.dmg"),
  "macos-intel": (name) => name.endsWith("macOS_x64.dmg"),
  "darwin-x64": (name) => name.endsWith("macOS_x64.dmg"),
  macos: (name) => name.endsWith("macOS_arm64.dmg"),
  "linux-deb": (name) => name.endsWith("Linux_x64.deb"),
  "linux-rpm": (name) => name.endsWith("Linux_x64.rpm"),
  "linux-appimage": (name) => name.endsWith("Linux_x64.AppImage"),
  "linux-x64": (name) => name.endsWith("Linux_x64.AppImage"),
  linux: (name) => name.endsWith("Linux_x64.AppImage"),
  "linux-arm64-deb": (name) => name.endsWith("Linux_arm64.deb"),
  "linux-arm64-rpm": (name) => name.endsWith("Linux_arm64.rpm"),
  "linux-aarch64": (name) => name.endsWith("Linux_arm64.deb"),
  "linux-arm64-appimage": (name) => name.endsWith("Linux_arm64.AppImage"),
};

async function latestAssets() {
  // cf cacheEverything caches the GitHub API response at the edge for
  // 5 minutes, so the shared Worker IP isn't hammered by every install.
  const response = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "Coffee-Note-Website",
    },
    cf: { cacheEverything: true, cacheTtl: 300 },
  });
  if (!response.ok) throw new Error(`GitHub API ${response.status}`);

  const release = await response.json();
  const assets = {};
  for (const [platform, matches] of Object.entries(PLATFORM_PATTERNS)) {
    const asset = release.assets.find((candidate) => matches(candidate.name));
    if (asset) {
      assets[platform] = {
        name: asset.name,
        url: asset.browser_download_url,
        // Strip the leading "v" from the git tag so `version` is clean
        // semver — the Windows registry DisplayVersion has no "v".
        version: release.tag_name.replace(/^v/i, ""),
      };
    }
  }
  return assets;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ── /version.json?platform=<slug> ─────────────────────────────────
    if (url.pathname === "/version.json") {
      try {
        const assets = await latestAssets();
        const platform = url.searchParams.get("platform");
        const version = platform
          ? (assets[platform]?.version ?? "")
          : (assets.windows?.version ?? "");
        return Response.json({ version }, { headers: { "Cache-Control": "no-store" } });
      } catch (error) {
        return Response.json(
          { version: "", error: error.message },
          { status: 502, headers: { "Cache-Control": "no-store" } },
        );
      }
    }

    // ── /download/<platform> ──────────────────────────────────────────
    const download = url.pathname.match(/^\/download\/([a-z0-9-]+)$/);
    if (download) {
      const platform = download[1];
      if (!PLATFORM_PATTERNS[platform]) {
        return new Response(
          `Unknown platform "${platform}". Available: ${Object.keys(PLATFORM_PATTERNS).join(", ")}`,
          { status: 400 },
        );
      }
      try {
        const asset = (await latestAssets())[platform];
        if (!asset) return new Response("Installer is not available yet", { status: 404 });

        const file = await fetch(asset.url, { headers: { "User-Agent": "Coffee-Note-Website" } });
        if (!file.ok) return new Response("Unable to download installer", { status: 502 });

        return new Response(file.body, {
          headers: {
            "Content-Type": "application/octet-stream",
            "Content-Disposition": `attachment; filename="${asset.name}"`,
            "Content-Length": file.headers.get("Content-Length") ?? "",
            "Cache-Control": "no-store",
            "X-Coffee-Note-Version": asset.version,
          },
        });
      } catch (error) {
        return new Response(`Unable to resolve installer: ${error.message}`, { status: 502 });
      }
    }

    // ── everything else → CF Pages static files ───────────────────────
    return env.ASSETS.fetch(request);
  },
};

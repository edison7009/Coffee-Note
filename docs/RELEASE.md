# Coffee Note 发布流程

> 每次修改版本号、创建 tag 或发布 GitHub Release 前都必须重新阅读本文。
> 核心顺序：**版本提交 → 本地预检 → 推送 main → 等 CI 全绿 → 创建 tag → 守到正式发布 → 验收下载**。

## 一、发布前先看状态

不要看到代码能在本机构建就直接打 tag。先确认工作区、远端和最近的 Actions：

```powershell
git fetch origin main --tags
git status --short
git rev-list --left-right --count HEAD...origin/main
gh run list --repo edison7009/Coffee-Note --workflow CI --limit 5
gh run list --repo edison7009/Coffee-Note --workflow "Release desktop apps" --limit 5
```

- 必须在 `main` 上发布，且本地与 `origin/main` 同步。
- 除明确保留的用户文件外，不得带着未确认改动发布。
- 最近的 `main` CI 若为红色，先读取失败日志并修复，不能用 Release 工作流代替 CI 验证。
- `vX.Y.Z` tag 或同版本 Release 已存在时，先查明原因；不要直接覆盖一个已经公开的版本。

## 二、统一修改 6 个版本文件

| 文件 | 字段 |
|---|---|
| `package.json` | `version` |
| `package-lock.json` | 顶层 `version` 和 `packages[""].version` |
| `src-tauri/tauri.conf.json` | `version` |
| `src-tauri/Cargo.toml` | Coffee Note package 的 `version` |
| `src-tauri/Cargo.lock` | `name = "coffee-note"` 条目的 `version` |
| `website/version.json` | `version` |

先用 npm 同步前两个文件，再精确修改其余四个文件：

```powershell
npm version X.Y.Z --no-git-tag-version --ignore-scripts
npm run release:check
```

`release:check` 同时检查全部 6 个文件和 `package-lock.json` 的两个版本字段。tag 触发时还会校验 `vX.Y.Z` 与应用版本完全一致。

## 三、本地发布预检

版本文件修改完成后运行唯一入口：

```powershell
npm run release:preflight
```

它依次执行：

1. 准备当前平台的 Coffee Video FFmpeg sidecar；
2. 检查 6 个版本文件；
3. TypeScript 类型检查、前端测试、双语资源检查和前端构建；
4. Rust 格式检查、Clippy `-D warnings` 和完整 Rust 测试。

任何一步失败都不得打 tag。提交版本号前再检查 `git diff --check`，且不能提交 `node_modules/`、`dist/`、`src-tauri/target/` 或 `src-tauri/binaries/`。

## 四、先推版本提交，等 main CI 全绿

```powershell
git add package.json package-lock.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock website/version.json
git commit -m "chore: bump version to X.Y.Z"
git push origin main
gh run list --repo edison7009/Coffee-Note --workflow CI --branch main --limit 3
```

找到与版本提交 SHA 对应的 CI run，并等待它 `completed/success`。CI 的前端与 Rust 质量门都必须成功后才能继续。

## 五、只创建一次 tag，触发正式发布

```powershell
git tag vX.Y.Z
git push origin refs/tags/vX.Y.Z
```

`.github/workflows/release.yml` 的顺序是：

1. **Release checks**：重复版本、前端、双语资源、FFmpeg sidecar、Rust fmt、Clippy 和 Rust 测试检查；
2. **Create release**：创建或复用 draft Release；
3. **Build**：并行构建 Windows x64、macOS arm64、macOS x64、Linux x64、Linux arm64；
4. **Normalize download names**：统一附件名；
5. **Publish release**：仅在五个平台全部成功后发布为 latest。

Linux arm64 必须使用原生 `ubuntu-24.04-arm` runner，不能改回 glib/pkg-config 无法工作的交叉编译。每个平台在 Tauri 构建前都必须执行 `npm run video-runtime:prepare`。

持续监控，不要在工作流刚启动或 Release 仍是 draft 时宣布完成：

```powershell
gh run list --repo edison7009/Coffee-Note --workflow "Release desktop apps" --branch vX.Y.Z --limit 3
gh run watch RUN_ID --repo edison7009/Coffee-Note --exit-status
```

## 六、发布完成验收

正式版必须满足：

- GitHub Release 为非 draft、非 prerelease、latest；
- tag 指向已经通过 main CI 的版本提交；
- 共有 9 个附件：Windows EXE/MSI、macOS arm64/x64 DMG、Linux x64 DEB/RPM/AppImage、Linux arm64 DEB/RPM；
- 附件名全部为 `Coffee.Note_X.Y.Z_*`；
- `https://note.coffeecli.com/version.json?platform=windows` 返回 `{"version":"X.Y.Z"}`；
- `https://note.coffeecli.com/download/windows` 返回 `application/octet-stream`，文件名为该版本 Windows EXE，不能是 HTML；
- 本地 `main` 与 `origin/main` 同步，工作区只剩明确保留的用户文件。

常用检查：

```powershell
gh release view vX.Y.Z --repo edison7009/Coffee-Note --json tagName,isDraft,isPrerelease,publishedAt,url,assets
curl.exe -sS "https://note.coffeecli.com/version.json?platform=windows"
curl.exe -sS -I "https://note.coffeecli.com/download/windows"
```

## 七、版本同步 workflow 的真实行为

`.github/workflows/bump-version.yml` 只是手工或外部令牌发布时的兜底：它把 6 个版本文件同步到**刚发布的版本**，不会自动生成下一个版本号。

正常的 tag 发布由 `release.yml` 使用 `GITHUB_TOKEN` 创建 Release，GitHub 不会递归触发 `release` 事件 workflow。因此正常发布必须在打 tag 前就把 6 个版本文件准备正确，不能依赖发布后自动修复。

## 八、历史失败与固定结论

| 失败 | 原因 | 固定做法 |
|---|---|---|
| `v0.0.2` 首次发布 | tag 是 `v0.0.2`，源码仍为 `0.0.1` | 先改 6 个版本文件并通过 `release:check` |
| `v0.0.2` Linux arm64 | 交叉编译时 `glib-sys`/pkg-config 失败 | 使用原生 `ubuntu-24.04-arm` runner |
| `v0.1.3` 首次发布 | 两项前端行为测试失败 | 版本提交的 main CI 必须先全绿 |
| `v0.1.6` 首次发布及随后 main CI | Tauri 找不到 Linux FFmpeg sidecar | CI、Release checks、五平台构建都先执行 `video-runtime:prepare` |
| 旧 Bump workflow | Git identity 不合法，且职责被误解 | 只作同版本兜底；正常发布不依赖它 |
| 旧 GitHub Pages workflow | 仓库未启用 GitHub Pages | 官网由 Cloudflare 提供，不把 Pages 失败当桌面发布步骤 |

旧失败 run 会永久保留在 Actions 历史中，这是正常审计记录，不能也不需要把历史红灯“改绿”。判断当前状态要看相同提交之后的成功 run。

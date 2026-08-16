# Coffee Note 发布流程

> 本文档汇总了历次发版踩过的坑，按步骤执行即可正确发布。
> 版本号统一在 **5 个文件**，必须全部一致。

## 版本文件清单（5 处，缺一不可）

| 文件 | 字段 | 示例 |
|---|---|---|
| `package.json` | `version` | `"0.0.2"` |
| `src-tauri/tauri.conf.json` | `version` | `"0.0.2"` |
| `src-tauri/Cargo.toml` | `version =` | `version = "0.0.2"` |
| `src-tauri/Cargo.lock` | `name="coffee-note"` 下一行 `version =` | `version = "0.0.2"` |
| `website/version.json` | `version` | `{"version":"0.0.2"}` |

> **release.yml 的 tag 校验**：`tag == v{package.json.version}`。tag 和 package.json 不一致会直接失败（曾踩坑：打 v0.0.2 但 package.json 还是 0.0.1 → CI 21 秒失败）。

## 一、修改版本号

从 0.0.2 → 0.0.3 为例：

```bash
# 1. 改 5 处版本号
sed -i 's/"version": "0.0.2"/"version": "0.0.3"/' package.json src-tauri/tauri.conf.json website/version.json
sed -i 's/^version = "0.0.2"/version = "0.0.3"/' src-tauri/Cargo.toml
# Cargo.lock 里 coffee-note 包条目（不是所有 0.0.2，用精确匹配）
sed -i '0,/^name = "coffee-note"/{/^name = "coffee-note"/{n; s/version = "0.0.2"/version = "0.0.3"/}}' src-tauri/Cargo.lock

# 2. 验证一致
npm run release:check   # 输出 "Release version X is consistent"
npm run typecheck       # 前端
cd src-tauri && cargo check   # Rust

# 3. 提交
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock website/version.json
git commit -m "chore: bump version to 0.0.3"
git push
```

## 二、打 tag 触发 CI 发布

```bash
git tag v0.0.3
git push origin v0.0.3
```

CI（`.github/workflows/release.yml`）自动执行：
1. **Release checks**：质量校验（npm build + 前端测试 + cargo check + release:check + tag 匹配）
2. **Create release**：建 draft release
3. **Build**：5 平台矩阵（Windows x64 / macOS ARM / macOS Intel / Linux x64 / **Linux arm64**）
   - Linux arm64 用 **native `ubuntu-24.04-arm` runner**（不要交叉编译——glib-sys pkg-config 会失败）
4. **rename-assets**：统一资产命名
   - arm64 rpm 匹配 `*.aarch64.rpm`（Tauri 生成名，不是 `_arm64`）——曾踩坑导致孤儿资产
5. **Publish release**：发布

**监控**：`gh run watch` 或 `gh run list --repo edison7009/Coffee-Note`。构建约 15-20 分钟。

## 三、发布后：bump-version 自动同步

`.github/workflows/bump-version.yml` 在 **release published** 时自动把 5 处版本文件升到下个版本占位——所以**发版后 main 分支版本号会变**，下次只需改下个版本号即可。

> 若某次不想自动 bump（如 hotfix），可临时禁用 workflow 或手动改回。

## 四、软件内自更新

应用内「下载更新」逻辑（`run_windows_update`）：
- 优先 `https://note.coffeecli.com/download/windows`
- **若返回 HTML**（Cloudflare SPA fallback）→ 自动 fallback 到 GitHub release 的 `*_Windows_x64-setup.exe`
- 版本检测读 `https://note.coffeecli.com/version.json?platform=windows`

**⚠️ 关键**：自更新逻辑在**发布的新版本**里才生效。当前 v0.0.2 安装包是旧代码，装新版（含 fallback 修复）后才能自更新。**旧版必须手动下载更新**。

## 五、网站部署（Cloudflare）

网站源码在 `website/`，Cloudflare Pages 连着 GitHub 自动同步（push main 即更新）：
- `index.html` → 单页双语（英文默认 + 中文切换 + 只有中文显示中国网盘）
- `install.ps1` / `install.sh` → 命令安装（优先走网站 `/download`，失败自动回退 GitHub Release）
- `version.json` → 静态兜底版本文件
- **`_worker.js` → 关键：`/download/*` 下载代理 + 动态 `/version.json`**（复制自 Coffee-CLI `Web-Home/_worker.js` 和 OpenLongevity `website/_worker.js` 的 Pages Function）

**⚠️ 首次部署必须在 Cloudflare Pages 启用 Advanced mode**（否则 `_worker.js` 不生效，`/download/*` 仍返回 HTML，`irm …|iex` 会报"文件或目录损坏"）：
1. Cloudflare 控制台 → Workers & Pages → 本项目 → Settings → Functions → 开启 **Advanced mode**
2. 确认 `_worker.js` 已随网站部署到站点根目录（push main 自动同步）
3. 验证：`curl -I https://note.coffeecli.com/download/windows` 应返回 `Content-Type: application/octet-stream`，而非 `text/html`

`_worker.js` 路由：
- `/download/<platform>` → 流式代理 GitHub Release 对应安装包。支持的 slug：`windows`、`windows-msi`、`darwin-aarch64`、`darwin-x64`、`macos-arm`/`macos-intel`、`linux-x64`、`linux-aarch64`、`linux-deb`/`linux-rpm`/`linux-appimage`、`linux-arm64-deb`/`-rpm`/`-appimage`
- `/version.json?platform=X` → 动态返回最新**已发布**版本；对应平台安装包还没上传时返回空串，避免"版本号先更新但包还在 CI 构建"的竞态（app 会把空串当"还没发布"处理）
- `/*` → 静态文件

`install.ps1` / `install.sh` 即使 Worker 未部署也能用：`/download/*` 返回 HTML 时脚本会检测并自动回退到 GitHub Release 直连下载（`install.ps1` 校验 PE 的 `MZ` 魔数；`install.sh` 校验首字节非 `<`）。

## 六、验收清单

- [ ] 5 个版本文件一致 + `release:check` 通过
- [ ] `git tag vX.Y.Z` 与 package.json 完全一致
- [ ] CI 全绿，**9 个资产**齐全（含 Linux arm64 deb/rpm）
- [ ] 资产命名统一（`Coffee.Note_<ver>_*`）
- [ ] GitHub release 已发布（非 draft）
- [ ] bump-version 自动把版本号升到下一占位
- [ ] 网站 version.json 已更新（Cloudflare 同步）
- [ ] 自更新在新版安装后可用（旧版需手动更新）

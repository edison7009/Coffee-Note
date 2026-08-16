# 「导入资料」→ Agent 读取 → Markdown 开发计划

> 状态：待评审 | 日期：2026-08-12 | 分支：codex/note-agent（功能开发）
> 前置调研：Task 1（现状调研）✅、Task 2（GitHub 工具盘点）✅

---

## 0. 核心思路（一句话）

**不转格式，只送内容。** 用户在「导入你的资料」界面选择本地文件（或粘贴链接/本地路径），Coffee-Note 把来源变成**文字内容**送进 Agent 上下文，**Agent 自己整理成 Markdown 并保存**（`save_note` 已有）。

- 文字类来源：**0 转化**——读到就是内容
- 唯一真正的格式转换是**音频类**（视频/音频 → 文字），`transcription.rs` 已实现
- 不做文档转换工具（pandoc / docx-rs / pdf-extract / markitdown 全不用）
- 不管模型接入与计费（设置页已有 API 页面）

---

## 1. 现状事实（已确认）

| 环节 | 位置 | 说明 |
|---|---|---|
| 前端导入入口 | `i18n.ts:129` `captureTitle: '导入你的资料'` | 已有页面，当前只收文本/URL |
| URL 抓取 | `web_reader.rs`（direct/firecrawl/jina） | 网页 → 文字内容 |
| 音视频转写 | `transcription.rs` `supports_media_url` / `audio_to_wav` / 转写 | 视频平台链接 + 本地音视频 → 文字 |
| LLM 整理 | `lib.rs:2464` `prepare_capture` | 文字 → LLM → Markdown 草稿，已工作 |
| Agent 工具 | `agent_tools.rs`：`save_note` / `read_note` / `web_fetch` | 注册 = `match name` 加分支 |
| 拖放 | `tauri.conf.json` `dragDropEnabled: false` | 当前关闭，需开启 |

**缺口（唯一要补的）**：本地文件 → Agent 上下文。

---

## 2. 统一管线（所有来源一条线）

```
粘贴链接（网页）    → web_reader 抓页面文字   ─┐
选择/拖入文件（文本） → 直读文字              ─┤
粘贴链接（视频平台）  → 转音频 → 转文字       ─┼→ 文字内容 → Agent → 整理成 MD → save_note
选择本地视频/音频    → 转音频 → 转文字       ─┤
选择图片/扫描件      → 图片内容（多模态）     ─┘
```

---

## 3. 唯一技术点：`read_file_content`

| 输入 | 处理 | 成本 |
|---|---|---|
| `.txt` / `.md` | `fs::read_to_string` 直读 | 0 |
| `.html` | 复用 `web_reader` | 0 |
| `.docx` | 解 ZIP 提取 document.xml 文本 | 轻 |
| `.pdf` | 文本层提取（`pdf-extract` crate 或等效） | 轻 |
| `.png` / `.jpg` / `.webp` | 原样送多模态（base64） | 0 |
| `.mp3` / `.mp4` / `.m4a` / `.wav` 等 | **复用 transcription**：`audio_to_wav` + 转写 | 已有 |
| 扫描型 PDF | 逐页渲染为图片送多模态（后置可选） | 后置 |

> 提取 ≠ 转换：只捞文本，不做排版、表格重建——那是 Agent 的事。

---

## 4. 实施步骤

1. **前端**：导入资料页支持文件选择 + 拖放（开启 `dragDropEnabled`）+ 识别粘贴的本地路径（`C:\...`、`/Users/...` 存在则当文件读）
2. **Rust**：新增 `read_file_content(path)` 命令，按扩展名分流读取（文本直读 / 音频走 transcription / 图片原样）
3. **Agent**：`agent_tools.rs` 新增 `read_local_file(path)` 工具；系统提示词告知 Agent「可以读取本地文件，读到内容后整理成 Markdown 用 save_note 保存」
4. **验收**：拖入 `.pdf`/`.docx`/图片/`.txt`/`.mp3` → Agent 读出内容 → 整理成结构化 .md 入库

## 5. 涉及文件

| 文件 | 改动 |
|---|---|
| `src-tauri/src/lib.rs` | 新增 `read_file_content` 命令 + 注册 |
| `src-tauri/src/file_reader.rs`（新） | 按扩展名提取内容（文本/图片/音频） |
| `src-tauri/src/agent_tools.rs` | 新增 `read_local_file` 工具 |
| `src-tauri/tauri.conf.json` | 开启 `dragDropEnabled` |
| `src/api.ts` / `src/types.ts` | 新增 `readFileContent` API + 类型 |
| `src/App.tsx` | 导入资料页：文件选择/拖放/路径识别 |
| `src/i18n.ts` | 新增文案（zh/en） |
| `tests/` | 新增流程测试 |

## 6. 不做（明确排除）

- ❌ pandoc / docx-rs / pdf-extract 等转换工具
- ❌ 格式检测分流、转换预览、降级路径
- ❌ 模型接入、计费、API 管理（设置页已有）
- ❌ 图片 OCR 引擎（交给多模态 LLM）

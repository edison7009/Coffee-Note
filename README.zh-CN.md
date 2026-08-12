# Coffee Note

**你最省钱的 AI 笔记工具。** 本地优先的 AI 第二大脑——深度优化 DeepSeek 和其他低价模型，让每一个 token 产出至少两倍价值。

> 官网：[note.coffeecli.com](https://note.coffeecli.com) · 默认英文，中文版 `/cn/`

## 三大亮点

### 🏷️ DeepSeek 高效缓存 — 越用越省钱、越用越懂你

Coffee Note 是**为笔记而生的 Note Agent**，不是工程工具。它不把你推向昂贵的 Claude、GPT 或 Opus 订阅——它跑在你负担得起的模型上。

- **DeepSeek 兼容与缓存友好**：稳定系统提示与请求结构，复用供应商前缀缓存，缓存命中率直接在对话中可见。
- **完成优先的 Agent 循环**：阻止重复工具调用，不人为截断工具链。
- **Library Graph 检索**：在本地 Markdown 库内按标题、路径、层级、正文和链接检索——无需 embedding API、向量数据库或索引 token。
- **双向记忆库（Dual Memory）**：高命中率记忆路由——先取当前打开的笔记和「我的资料」，再按问题只取需要的记忆。
- **成本可见**：每次请求展示 token、次数、缓存命中率和成本估算。
- **模型可替换**：协议、地址、模型和密钥分开保存，绝不锁定单一厂商。

### 🎬 一键短视频变成笔记

粘贴 YouTube、B 站、抖音、小红书、X 的链接——Coffee Note 自动转写视频（API 或本地引擎），Agent 把口播内容整理成结构化 Markdown。从「看过就忘」到「可搜索、可引用、可复习」。

本地音视频文件（mp3 / mp4 / m4a / wav）同样支持——拖进来就变成笔记。

### 🎞️ 笔记一键长成 PPT 和视频

多选几份笔记，选一个技能，得到一份成品。一条指令从笔记到演示——不复制、不排版。

## 核心体验

可编辑的 **T1–T5 优先级地图**是应用的核心：让最重要的事保持可见，但不把软件变成另一个任务管理器。

- 在安静、低干扰的桌面工作区管理本地 Markdown 笔记库。
- 将笔记放进 T1–T5，并直接在首页重新排序。
- 粘贴链接、零散笔记、原始资料，或**本地文件**（txt / md / html / docx / pptx / xlsx / pdf / 图片 / 音视频）交给 AI 整理。
- 自主维护目标、经验、约束与重要记录等个人上下文。
- 使用任意已选择的 OpenAI 兼容服务商，或 Anthropic 原生 Messages API。

## 开发

需要 Node.js、Rust 和 Tauri 对应平台的运行环境。

```powershell
npm install
npm run library:check
npm run typecheck
npm run tauri:dev
```

## 隐私

Coffee Note 默认本地优先。笔记库默认保留在你的电脑上，只有你发起的 AI 请求才发送必要上下文。不要提交 API Key、个人笔记或生成的构建产物。服务商密钥仅以明文 JSON 保存在当前用户的 Coffee Note 应用数据目录中。

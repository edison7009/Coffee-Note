# Coffee Note

Coffee Note 是一款本地优先的桌面笔记工作台：用 AI 协助收集、整理、阅读和持续打磨 Markdown 笔记。

可编辑的 T1–T5 优先级地图是核心体验。它让最重要的事保持可见，但不把软件变成另一个任务管理器。笔记库默认保留在你的电脑上；AI 服务商配置也只写入当前用户的应用数据目录。

## 可以做什么

- 在安静、低干扰的桌面工作区管理本地 Markdown 笔记库。
- 将笔记放进 T1–T5，并直接在首页重新排序。
- 粘贴链接、零散笔记或原始资料，让 AI 协助整理。
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

Coffee Note 默认本地优先。不要提交 API Key、个人笔记或生成的构建产物。服务商密钥仅以明文 JSON 保存在当前用户的 Coffee Note 应用数据目录中。

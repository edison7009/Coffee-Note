# Coffee Note 架构说明

## 产品定位

Coffee Note 是一个本地优先的纯笔记工作台：用户用 T1-T5 分级组织本地
Markdown 笔记，AI 以「省钱的 Note Agent」形式协助整理与治理笔记。

产品边界见 [NOTE_AGENT_SAVINGS.md](./NOTE_AGENT_SAVINGS.md)：它不是
coding agent，不绑定昂贵模型，以完成笔记治理任务为优先，尽量复用本地
笔记与个人资料，减少重复上下文与无效调用。

## 技术栈

- Tauri 2：Windows、macOS、Linux 桌面壳与本地权限边界；
- React + TypeScript + Vite：三栏知识阅读和对话界面；
- Rust：路径安全、本地 Markdown 读取、收录写入、轻量检索与 DSH 适配；
- DeepSeek Harness：模型请求、Agent 循环、工具编排、持久会话、Token 计量与上下文压缩；
- Markdown/CSV：开放、可迁移的产品资料格式。

## 独立资料库

Coffee Note 的默认资料库位于各平台的应用数据目录：

```text
Windows  %USERPROFILE%/.coffee-note/演示笔记
macOS    ~/.coffee-note/演示笔记
Linux    ~/.coffee-note/演示笔记
```

首次启动由应用创建目录和入门内容。`starter-knowledge/` 只包含公开的
结构示例、用户资料空模板和通用安全边界。

外部 Markdown 资料通过显式的「导入」流程复制或转换到产品资料库，不会
成为产品运行依赖。

## Agent：DeepSeek Harness 单一运行时

Agent 循环完全交由固定版本的 DeepSeek Harness 运行时负责，包括模型流式
请求、工具编排、持久会话、Token 计量与上下文压缩。Coffee Note 不再维护
并行的自研循环；`dsh_runtime.rs` 只承担 Tauri 事件适配、进程生命周期、
产品上下文注入和本地工具桥接。

产品能力仍由 Rust 提供：`agent_tools.rs` 中的本地知识检索、笔记读写、
Library Graph、记忆路由和网页读取通过仅监听 localhost、带随机令牌的私有
桥暴露给 DSH。DSH 配置不启用任意 Shell、编码工具或不受限文件写入。

## 本地知识与个人记忆

Coffee Note 的记忆路由有两个用户可见的真源，以及一份可重建索引：

- **我的资料**（应用管理的 Markdown）：用户确认的长期目标、偏好、约束、
  经验与健康背景写入对应的 `plans/*.md` 页面；这是个人事实的唯一真源。
- **当前笔记目录**（用户选择的 Markdown 根目录）：研究材料、项目笔记和
  外部知识由 Library Graph 按问题检索，不会复制到「我的资料」。
- **对话记录与记忆索引**（应用数据目录）：完整会话保留在本机；
  `memory.json` 是用于去重和来源追踪的本地索引，丢失时不会影响 Markdown
  中的个人事实，下一次确认记忆会从可见页面重新建立索引。

每次 Agent 请求由 Coffee Note 路由器组合三类上下文：当前问题相关的
「我的资料」摘要、当前笔记目录的 Library Graph 命中，以及首次迁移时的
最近对话。个人资料检索保持在约 16 KB；当前笔记只注入相关片段。之后的
会话维护和压缩由 DSH 负责。系统提示保持稳定，动态资料放入用户消息，
从而保留 DeepSeek 前缀缓存复用的机会。

模型上下文优先级：

1. 当前打开的笔记；
2. `profile/about-me.md`、`plans/*.md`、`records/*.md` 等「我的资料」；
3. 与问题关键词命中的笔记（Library Graph 检索）；
4. 模型通用知识。

当前使用内置的零外部依赖「本地知识地图」检索：

- 按当前界面语言扫描并缓存 Markdown，文件大小或修改时间变化时自动重建；
- 综合标题、路径、章节标题和正文词频排序；
- 解析 Markdown 内链，并从高相关笔记扩展一层出边与入边邻居；
- 只截取命中问题的少量段落进入模型上下文，个人资料、个人方案和当前页面
  保持最高优先级；
- 自动上下文注入与 Agent 的 `search_library` 工具复用同一检索器。

这一设计借鉴 Microsoft GraphRAG 的「知识图 + 原始文本片段」查询方式，
以及本地 CodeGraph 工具的「预解析关系图、按需返回少量相关内容」方式，
但没有复制或嵌入其运行时。完整 GraphRAG 索引需要额外的 LLM 抽取成本，
现阶段不适合只有几十到几百篇 Markdown 的本地桌面应用。当前方案不调用
嵌入 API，不需要 Python、向量数据库或额外 Token。知识库规模进一步增长
后，再评估 SQLite FTS5、可选本地嵌入与重排序。

参考：

- [Microsoft GraphRAG](https://github.com/microsoft/graphrag)
- [LightRAG](https://github.com/HKUDS/LightRAG)
- [CodeGraph](https://github.com/colbymchenry/codegraph)

## 安全与隐私

- 所有读操作限制在用户选择的知识目录；
- 路径 canonicalize 后检查，阻止 `../` 越界；
- AI 收录只写入 `knowledge/inbox/`，且不会覆盖同名文件；
- AI 服务商配置（包括 API Key）以明文 JSON 保存在当前用户的应用数据
  目录 `Coffee Note/config.json`，不写入仓库或知识库；
- 个人资料只在用户发起模型请求时发送给其配置的模型服务商。

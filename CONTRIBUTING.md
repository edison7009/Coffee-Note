# Contributing to Coffee Note / 贡献指南

Thanks for helping improve Coffee Note.

## English

### Contribution workflow

1. Fork the repository and create a focused branch from `main`.
2. Run the checks relevant to your change before opening a pull request.
3. Explain why the change is useful and link any related issues.
4. By submitting a contribution, you agree to the Contributor License
   Agreement below.

### Contributor License Agreement (CLA)

Coffee Note is distributed under the **GNU Affero General Public License,
Version 3.0 or later (AGPL-3.0-or-later)**. The project may also offer paid
commercial licenses for closed-source customization, white-label distribution,
or proprietary embedding. To keep that licensing model possible, contributions
require the following grant.

By opening a pull request or otherwise submitting code, documentation, artwork,
translations, or other content (your "Contribution"), you agree that:

1. **Ownership.** You represent that you have the right to submit the
   Contribution and that it is not copied from an incompatibly licensed source.
2. **License grant.** You grant edison7009 and the Coffee Note project a
   perpetual, worldwide, non-exclusive, royalty-free, irrevocable license to
   reproduce, modify, publicly display, sublicense, and distribute the
   Contribution and derivative works under any license, including
   AGPL-3.0-or-later and commercial proprietary licenses.
3. **Patent grant.** To the extent your Contribution necessarily practices
   patent claims you control, you grant the project and downstream recipients a
   perpetual, worldwide, royalty-free, irrevocable patent license to make, use,
   sell, offer for sale, import, and otherwise transfer the Contribution.
4. **No warranty.** The Contribution is provided "as is", without warranty.
5. **Attribution.** Your authorship remains visible in repository history and
   applicable notices.

If your employer owns your work or you cannot grant these rights, contact the
maintainer before submitting.

## 简体中文

### 贡献流程

1. Fork 本仓库，从 `main` 创建专注于单一改动的分支。
2. 提交 PR 前运行与改动相关的检查。
3. 说明改动原因，并关联相关 issue。
4. 提交贡献即表示同意下方的贡献者许可协议。

### 贡献者许可协议（CLA）

Coffee Note 采用 **GNU Affero 通用公共许可证 v3 或更高版本
（AGPL-3.0-or-later）**。项目也可能向需要闭源定制、白标分发或嵌入专有
产品的机构提供付费商业授权。为保留这种授权能力，贡献须遵守以下条款。

提交 PR 或以其他方式提交代码、文档、图像、翻译或其他内容（下称“贡献”），
即表示你同意：

1. **权属。** 你声明自己有权提交该贡献，且它并非复制自许可证不兼容的来源。
2. **许可授予。** 你授予 edison7009 与 Coffee Note 项目一项永久、全球、
   非独占、免版税、不可撤销的许可，可复制、修改、公开展示、再许可及分发
   该贡献与其衍生作品，包括采用 AGPL-3.0-or-later 或商业专有许可证。
3. **专利授权。** 若实施贡献必然涉及你控制的专利权利要求，你向项目及下游
   接收者授予永久、全球、免版税、不可撤销的专利许可，可制造、使用、销售、
   许诺销售、进口及以其他方式转让该贡献。
4. **不提供担保。** 贡献按“现状”提供，不附任何担保。
5. **署名。** 你的作者身份会保留在仓库历史及适用声明中。

若你的雇主拥有相关权利，或你无法授予上述许可，请在提交前联系维护者。

## Suggested checks / 建议检查

```powershell
npm run typecheck
npm test
npm run library:check
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
```

Questions / 联系：**hi@coffeecli.com**

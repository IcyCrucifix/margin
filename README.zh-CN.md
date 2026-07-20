[English](README.md) | 简体中文

# Margin：内置笔记系统的内容阅读器

Margin 是一个用于记录逐页课堂笔记的本地浏览器工作区。它可以打开 PDF 和 PowerPoint 文件，让 Markdown/LaTeX 备忘与对应页面精确关联，并可在之后将原始文件和备忘整理成完善的笔记。

上课时，你可以在 Margin 中打开 PDF 或 PowerPoint，并为每一页或每一张幻灯片分别撰写 Markdown/LaTeX 备忘；每条备忘都会与对应的原始页面保持关联，而不会修改原文件。输入公式时，先输入 `\`，再输入符号名称（例如 `\omega`），即可从 `\omega` 和 `\Omega` 等大小写建议中选择；继续输入则可忽略建议。课后，Stage 2 可以将讲义和备忘合并成完善的笔记。

Obsidian 并非必需。Margin 可以将笔记存储在：

- 任意普通本地文件夹中，并使用可移植的 Markdown 链接；或
- Obsidian 仓库中，并使用 Wiki 链接、PDF 页面嵌入和课程文件夹路由。

原始文件始终以逐字节完全相同的方式复制，绝不会被编辑。所有内容均保留在用户自己的电脑上。

## 快速开始

在 macOS 上，引导式安装程序会创建项目虚拟环境、安装 Python 软件包，并询问笔记的存储位置：

```bash
./install.command
./start.command
```

随后，可以直接使用 <http://127.0.0.1:4317> 上的本地界面，也可以启用 <https://icycrucifix.github.io/margin/workspace/> 上的公开界面。两者使用同一个本地配套服务和本地资料库。

### 将托管工作区连接到本地资料库

托管工作区仅提供界面。在显示资料库之前，每位用户都必须在 `127.0.0.1:4317` 上安装并启动本地 Margin 配套服务。

1. 运行 `./start.command`，并保持其终端窗口处于打开状态。
2. 使用桌面版 Chrome 打开 <https://icycrucifix.github.io/margin/workspace/>。
3. 选择 **Connect to local Margin**（连接到本地 Margin）。
4. 如果 Chrome 发出询问，请允许此网站连接到本设备上的应用。旧版 Chrome 可能会将其称为本地网络访问权限。
5. 在本地 **Connect Margin** 窗口中，确认请求方为 `https://icycrucifix.github.io`，然后选择 **Allow connection**（允许连接）。

Chrome 只能通过回环地址访问这台电脑上的 Margin。本地配套服务仅能读写设置期间所选的笔记文件夹或 Obsidian 仓库，以及用户明确导入的讲义文件。GitHub 无法获取讲义文件、笔记、仓库路径、会话令牌或文件系统访问权限。

如果浏览器阻止了确认窗口或连接仍然失败，请参阅[托管工作区权限与故障排除](docs/setup.md#connect-the-hosted-workspace)。

如需手动设置，以下文件夹模式示例会自动创建 `~/Documents/Margin Notes`：

```bash
cp config.example.json config.json
python3 -m venv .venv
.venv/bin/python3 -m pip install -r requirements.txt
.venv/bin/python3 -m content_reader.server --open
```

有关依赖项、配置和自动启动的信息，请参阅 [docs/setup.md](docs/setup.md)。

有关该系统的更多说明，请参阅 [Codex_Explanation](Codex_Explanation.markdown)。

## Stage 1：记录与页面关联的笔记

1. 选择 **Open lecture**（打开讲义），然后选择 `.pdf` 或 `.pptx` 文件。
2. 输入课程代码、讲义标题和日期。
3. 选择缩略图，或聚焦查看器后按 **左/右方向键**，即可切换页面。
4. 在右侧编辑器中编写 Markdown。`$...$` 和 `$$...$$` 数学公式会就地渲染。
5. 输入 `\`，再输入符号名称，即可获得 `\omega` 和 `\Omega` 等 LaTeX 建议。

笔记会自动保存。每条备忘都位于独立 Markdown 文件中的稳定页面标记之间；讲义原文件保持不变。
使用相同文件名重新上传修订后的文件时，旧版的页面备忘会被带入新副本，并且同名文件的所有上传版本会共享后续编辑。
如果某个页面或幻灯片无法渲染，请在查看器工具栏中选择 **Reload file**（重新加载文件）。Margin 会重新尝试生成讲义图像，而不会重新导入原始文件，也不会改变备忘与页面之间的对应关系。
选择顶部工具栏中的 **Shortcuts**（快捷键），或在备忘编辑器外按 `?`，即可显示键盘快捷键列表。

使用顶部工具栏中的翻译图标，可以在英语和简体中文之间切换界面语言。对话框可将该选择仅应用于界面，也可同时设为完善笔记所使用的语言。如果所选讲义已经有另一种语言的完善笔记，Margin 会让你选择保留当前笔记供以后运行使用，或将其标记为需要受保护的重新整理。

## Stage 2：手动或自动整理笔记

Margin 为同一套受保护的处理流程提供三个入口：

- **Polish now**（立即整理）：处理当前所选讲义。
- **Polish pending**（整理待处理项目）：逐一处理所有缺失或过期的完善笔记。
- **Optional daily schedule**（可选每日计划）：在 `config.json` 中启用 `auto_polish`；Margin 会在本地服务器运行期间处理待办队列。

按下 Stage 2 操作按钮后，会打开简单的选项。如果已登录的 Codex CLI 或已配置的 AI 命令准备就绪，Margin 可以直接运行。否则，Margin 会说明直接整理当前不可用，并提供一键按钮，将隐藏的一次性整理提示词或隐藏的夜间自动化模板复制到用户自己的 AI 系统中。用户无需打开 Python 源代码即可获取任一提示词。

当 `polish_command` 为 `null` 时使用 Codex CLI。其他本地 AI 智能体仍可通过 JSON 命令模板连接。Stage 1 不强制使用 AI；高级用户也可以自行撰写 Stage 2 草稿，然后运行确定性的最终处理程序。

Stage 2 会对原始文件和页面备忘进行哈希校验，拒绝过期结果，并且绝不会重写未发生变化的完善笔记。详情请参阅 [docs/polish.md](docs/polish.md)。

## 存储布局

两种模式使用相同的持久化结构：

```text
Lecture Notes/
  _Sources/       未改动的 PDF/PPTX 副本
  Raw/            与页面关联的课堂备忘
  Polished/       Stage 2 笔记
  .content-reader/library.json
  Lecture Notes Hub.md
```

普通文件夹模式使用常规相对 Markdown 链接，并将所有内容保存在这个中央资料库中。Obsidian 模式还支持 Wiki 链接、嵌入式 PDF 页面，以及将内容路由到现有的课程代码文件夹。

确切的文件和标记约定请参阅 [docs/storage.md](docs/storage.md)。Obsidian 特有的行为请参阅 [docs/obsidian-sync.md](docs/obsidian-sync.md)。

## 配置与安全

`config.json` 已加入 gitignore。它控制存储模式和路径、本地主机和端口、可选 AI 命令，以及可选的每日整理。服务器默认绑定到 `127.0.0.1`。直接在本地执行修改操作需要 Margin 的私有请求头。公开工作区必须经过明确配对，并且每次数据请求都需要一个仅保存在浏览器内存中的短期、限定来源的会话。

Stage 1 无需 AI 即可运行。对于 Stage 2，自定义智能体命令应使用该智能体支持的最严格文件系统权限来包装。Margin 的最终处理程序仍会独立验证草稿路径和输入哈希值。

## 文档

- [docs/setup.md](docs/setup.md) — 安装、选择存储方式、配置、自动启动和测试
- [docs/storage.md](docs/storage.md) — 可移植文件夹和共享文件格式约定
- [docs/obsidian-sync.md](docs/obsidian-sync.md) — 仅适用于 Obsidian 的 Wiki 链接和课程路由
- [docs/polish.md](docs/polish.md) — 手动队列、内置每日计划、自有 AI 命令和无 AI 流程

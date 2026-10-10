# 对话集 · ChatShelf

**把散落的 AI 对话按项目收好，下次打开，接着做。**

由 **pakco** 开发的免费、本机保存的 Codex 插件。MIT 开源，无需购买插件或订阅插件服务；宿主客户端的账户与使用条件另计。

**当前版本：0.9.6-beta.1 · macOS + Codex 桌面客户端。** 这是公开测试版，尚未上架官方插件目录。

[下载免费测试版](https://github.com/pakco77/chat-shelf/releases/tag/v0.9.6-beta.1) · [15 秒演示](https://github.com/pakco77/chat-shelf/releases/download/v0.9.6-beta.1/chat-shelf-demo-15s.mp4) · [反馈问题](https://github.com/pakco77/chat-shelf/issues)

![对话集示例界面](assets/demo-poster.jpg)

## 安装：先下载完整包

1. 在 Mac 上安装并登录支持插件的 Codex 桌面客户端。
2. 从上面的发布页下载 **`chat-shelf-0.9.6-beta.1-macos.zip`**，解压。不要选 GitHub 自动生成的 `Source code` 压缩包；完整包已包含程序依赖。
3. 把整个解压目录放在「文稿」等保留位置，双击 **`Install.command`**；详见 [INSTALL.md](INSTALL.md)。安装脚本会寻找已有的客户端运行环境，不要求管理员权限，不安装系统服务，不改动你的对话。
4. 在 Codex 中新建一个对话，说：

   > 打开对话集，把当前工具可见的聊天标题收录进去；保留我的文件夹、项目和已有整理。若后台同步不可用，请使用当前对话提供的聊天列表工具导入，并说明实际收录范围。

第一次收录后，新对话会出现在「待收纳」。把对话归入同一项目，下次从项目书架或「接着上次」找到它。

**安装成功不等于已取得你的聊天记录。** 收录需要当前客户端提供聊天列表工具，或由你主动导入文件；后台自动同步在本测试版中尚未完成真实环境接通。

如果希望 Codex 协助安装，可把这段话连同下载后的完整包交给它：

> 请安装 https://github.com/pakco77/chat-shelf 的 0.9.6-beta.1 免费测试版。先阅读 README 和 INSTALL.md，使用带依赖的 macOS 发布包，执行本地安装脚本，保留已有 ChatShelf 数据。启用后在新对话打开对话集，并按技能说明收录当前工具可见的聊天标题；不能访问的来源请明确说明。

## 可以做什么

- **按项目整理**：ChatGPT 与 Codex 作为来源标签，同一项目的对话放在一起。
- **快速找回**：标题和已导入末段搜索、常用、项目书架，以及首页「接着上次」。
- **轻松收纳**：文件夹拖动排序、自定义颜色、项目归入、批量整理、拖入垃圾桶、恢复和撤销。
- **在客户端继续**：macOS 上的 Codex 对话交给原生客户端打开，不跳转 ChatGPT 网页。
- **本机备份**：保存整理状态、导出备份、恢复；已收录记录不因时间久而自动移除。
- **跟随语言**：界面支持简体中文与英文，优先使用宿主语言；其他语言暂回退英文。用户自己的内容保持原文。

## 本次测试范围

| 能力 | 当前状态 |
| --- | --- |
| 文件夹、项目、搜索、整理、撤销、回收站、备份恢复 | 可使用 |
| 由当前 Codex 对话工具手动收录可见标题 | 工具可用时可使用；不是全量历史同步 |
| 导入 ChatGPT 的 `conversations.json` 或索引 JSON | 可使用；完整正文不会保存到对话集 |
| 末段或末图预览 | 需要导入对应内容；只有标题时不会伪造预览 |
| macOS Codex 原生继续对话 | 原生打开请求已验证；加载由客户端处理，须有原对话访问权 |
| 后台自动同步、ChatGPT 原生定位 | 尚未接通，依赖宿主允许的接口 |
| Windows、Linux、Claude | 本次未验证，不列为支持平台 |

原生打开返回“已交给客户端”表示系统已接受请求。插件无法收到客户端随后加载对话的完整回执；原记录被删除、属于其他账户或设备时，仍可能由客户端报告失败。对话集中的条目和整理状态会保留。

「接着上次」当前使用最近更新的对话，不是跨客户端的最后阅读记录。单个本机索引当前最多 5,000 篇。示例视频使用虚构数据；示例对话不连接真实原文。

## 导入更多对话

在界面选择「更多 → 导入对话」，或把 JSON 文件拖入窗口。支持 ChatGPT 导出的 `conversations.json`、对话集备份以及包含 `id`、`title`、`source` 的索引数组。

导入仅整理本机索引，不会移动、归档或删除平台上的原始聊天。标题索引更新会保留现有项目、常用、归档、回收站及预览；原始记录不会因为它没出现在本次可见列表中而被删除。

需要末段预览时，可在 Codex 中明确说“补齐这些对话的最后可见消息预览”。只有宿主返回可确认的末条内容才能收录，不以列表摘要代替。聊天列表的覆盖范围由宿主决定，不能保证拿到全量历史。

## 数据与隐私

默认数据目录：`~/Library/Application Support/ChatShelf/`。文件夹、项目、标题索引、末段预览、备份均保存在本机。整理动作不会修改原始平台记录。更新插件只替换程序，数据目录独立保留。

插件不收集遥测，不读取客户端内部数据库、cookies 或登录凭据，不把索引上传给开发者。使用 Codex 协助收录时，当前对话会按宿主工具权限处理这些内容；这不等同于离线处理。详见 [PRIVACY.md](PRIVACY.md)。

## 从源码安装与开发

需要 macOS、Node.js 18+（建议使用仍受支持的 LTS）和 npm，以及可用的 Codex 客户端。源码包需要首次联网安装锁定的依赖；完整下载包已包含这些依赖。

```sh
git clone https://github.com/pakco77/chat-shelf.git
cd chat-shelf
npm ci --ignore-scripts
zsh Install.command
```

程序自检：

```sh
npm run check
npm run check:install
```

独立预览使用 `npm start`，仅监听 `127.0.0.1:4317`。隔离示例可运行：

```sh
CHAT_SHELF_DATA="$PWD/.demo-data" npm run demo
CHAT_SHELF_DATA="$PWD/.demo-data" CHAT_SHELF_PORT=4387 npm start
```

示例脚本只会写入指定的示例目录，不能覆盖已有真实数据。

## 更新、卸载和反馈

更新：先从「更多 → 保存备份」保存一份，再安装新版完整包；已有整理数据保留。已打开的旧页面需要重新打开，新对话才能取得新启用的插件工具。

卸载：在 Codex 插件管理中卸载或禁用对话集。数据目录不会自动清除，便于重装或恢复。

遇到问题，请在 [Issues](https://github.com/pakco77/chat-shelf/issues) 提供 macOS 版本、客户端版本、插件版本和复现步骤。不要公开上传真实对话导出、备份、连接会话文件或带私人标题的截图。

## License

[MIT](LICENSE) · Copyright © 2026 pakco.

ChatShelf is a free, local-first conversation organizer for the Codex desktop app on macOS. Group chats by project, search imported previews, and hand supported Codex chats back to the native client. This beta does not promise automatic collection or full-history access. See the installation and support limits above.

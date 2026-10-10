---
name: shelf-index
description: 打开可视化的对话集（原名对话整理），或将用户可访问的真实聊天标题更新到本机对话集。
---

用户要求打开对话集时，调用本插件 open_shelf。用户要求在客户端打开某篇时，使用 open_chat 的真实 key；检查 ok 结果；若 delivery 为 dispatched，只能说已交给客户端打开，尚无对话加载回执。失败必须返回 reason 和需要时的 detail，不能将网页跳转或仅发送链接称为打开成功。macOS Codex 使用正式原生链接，独立于同步连接；ChatGPT 定位仍需宿主提供连接。旧称「对话整理」「收纳」也使用这个入口。

用户明确要求更新、同步或整理自己的聊天标题时：
1. 首次收录或更新当前可见的聊天标题时，若宿主向本轮对话提供 list_threads，可直接调用一次 `list_threads({limit:50})`，在本轮完成导入，无需等待后台连接。用户明确要求自动同步时，先调用本插件 sync_chats 并检查 sync 状态；成功时无需重复导入，失败也不阻止使用宿主列表人工补齐。合并返回的 pinnedThreads 与 threads，仅接收 kind 为 chatgpt 或 codex 的条目，明确映射 `source = kind`，保留真实 id、title、updatedAt 及 Codex 的 hostId，按 `source:id` 去重。这只是本轮人工收录，不能称为后台自动同步；列表为空时说明没有可收录项，不提交空导入。
2. 将上述映射后的标题索引传给 `import_chats({chats:[...]})`；不能把宿主的 kind 字段直接当作导入字段，也不能省略 source。用户明确要求末段预览时，可通过宿主 read_thread 或等价工具读取最后可见消息；read_thread 使用 turnLimit:1、includeOutputs:false、maxOutputCharsPerItem:1000，Codex 保留 hostId，ChatGPT 不传 hostId。提取最多 180 字的开头，传入 lastMessagePreview；没有消息则省略。若最后消息含图片，使用宿主明确返回且能确认属于该消息的图片附件，传入 `lastMessageImage`（内嵌 PNG/JPEG/WebP/GIF data URL，解码后最多 512 KB）；无法取得像素时传 `null`，有配文则先显示文字，没有文字时显示「图片未同步」。不要拿其他消息的附件代替，不猜测文件指针的下载地址。更新为纯文字消息时传入新的 `lastMessagePreview` 并省略图片字段，以清除旧图片；仅刷新标题则两者均省略。不要把列表摘要、初始问题或工具输出冒充末段。不读取其他正文、认证信息、浏览器 cookies 或内部数据库，不猜测未返回的聊天 ID。
3. 不给现有条目传 category、project、status、trashPreviousStatus 或 favorite，以保留用户已经做好的整理。
4. 更新后调用 open_shelf。准确说明获取的是当前工具可见范围，不声称全量。已连接的服务会每 30 秒同步最近可见列表及置顶项的标题、时间和可读取的末段，优先新对话和已更新的对话，每轮最多核对 12 篇。未连接时不得称已开启同步。宿主主动拒绝或关闭连接时，记录返回原因，不绕过信任检查，不默认称为刷新即可修复。
5. 宿主未提供聊天列表能力时，使用用户主动提供的索引 JSON 或 ChatGPT conversations.json。界面在浏览器中仅提取标题、最近时间与当前分支最后可见消息的开头和可用的内嵌图片，完整正文不发送给本机服务。如果没有数据，明确说明缺少索引来源，不伪造成功。
对话集中的文件夹与项目共用，source 仅表示对话来自 ChatGPT 或 Codex。归档与回收站仅作用于本机索引，不移动、归档或删除原生 ChatGPT/Codex 聊天。用户请求整理本机对话时可以使用 archive_chats、trash_chats、restore_chats；项目通过 add_project、assign_project 管理。

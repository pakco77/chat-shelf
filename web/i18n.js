// 界面文案按键维护；用户的标题、末段、文件夹和项目名称不参与翻译。
const messages = {
  homeLabel: ['对话集，回到书架', '对话集, back to shelf'],
  browsing: ['浏览方式', 'Views'], shelf: ['书架', 'Shelf'], all: ['全部', 'All'], favorites: ['常用', 'Favorites'],
  demo: ['示例数据', 'Demo'], demoHint: ['当前是虚构的示例对话，「继续对话」不会打开真实原文', 'These are fictional demo chats. Continue does not open a real conversation.'],
  searchPlaceholder: ['找一段对话', 'Find a conversation'], searchLabel: ['搜索对话标题与末段', 'Search titles and last messages'],
  more: ['更多', 'More'], moreActions: ['更多操作', 'More actions'], archived: ['已归档', 'Archived'],
  importMenu: ['导入对话…', 'Import chats…'], backup: ['保存备份', 'Save backup'], syncMenu: ['立即同步对话', 'Sync chats now'], about: ['关于对话集', 'About 对话集'],
  loading: ['正在翻开对话集', 'Opening 对话集'], connecting: ['连接客户端…', 'Connecting to client…'], syncStatus: ['查看同步状态', 'View sync status'], pagination: ['分页', 'Pages'],
  trash: ['垃圾桶', 'Trash'], trashHint: ['把对话拖到这里，或点击查看垃圾桶', 'Drag chats here, or click to view Trash'],
  trashIdle: ['拖入对话', 'Drag chats in'], trashCarrying: ['拖到这里', 'Drag here'], trashDrop: ['松手放入', 'Drop here'],
  importDrop: ['松手导入', 'Drop to import'], importTypes: ['conversations.json 或索引 JSON', 'conversations.json or an index JSON file'],
  timeout: ['连接超时，请重试', 'The connection timed out. Please retry.'], requestFailed: ['请求未完成', 'The request could not be completed.'],
  operationFailed: ['操作未完成', 'The action could not be completed.'], serviceOffline: ['连不上本机服务，请启动对话集后重试', 'Cannot reach the local service. Start 对话集 and retry.'],
  timeUnknown: ['时间未知', 'Unknown date'], timeMissing: ['时间未提供', 'Date not provided'], today: ['今天', 'Today'], yesterday: ['昨天', 'Yesterday'], justNow: ['刚刚', 'Just now'],
  lastImageAlt: ['最后一条消息里的图片', 'Image in the last message'], imageMissing: ['图片未同步', 'Image not synced'], previewMissing: ['暂无末段预览', 'No last-message preview yet'],
  chatUnit: ['篇', {one:'chat', other:'chats'}], chatCount: ['{count} 篇', {one:'{count} chat', other:'{count} chats'}],
  folderCount: ['{count} 个文件夹', {one:'{count} folder', other:'{count} folders'}], projectCount: ['{count} 个项目', {one:'{count} project', other:'{count} projects'}],
  folderLabel: ['{name}，{chats}{inbox}，F2 改名，Alt 加方向键排序', '{name}, {chats}{inbox}, F2 to rename, Alt + arrow keys to reorder'], needsOrganizing: ['待整理', ', to organize'],
  folderDragHelp: ['拖动排序 · Alt 加方向键也可排序', 'Drag to reorder · or use Alt + arrow keys'], folderOrderSaved: ['文件夹顺序已保存', 'Folder order saved'],
  changeColorLabel: ['修改{name}颜色', 'Change color of {name}'], changeColor: ['修改颜色', 'Change color'],
  welcomeTitle: ['把 ChatGPT 和 Codex 的对话，', 'Keep your ChatGPT and Codex chats'], welcomeSubtitle: ['按项目收成一本本集子。', 'together by project.'],
  welcomeText: ['在 Codex 中说：“打开对话集，把当前可见的聊天标题收录进去。”也可导入 ChatGPT 导出的 conversations.json 或索引 JSON。整理保存在本机，原对话不动。', 'In Codex, say: “Open 对话集 and import the currently visible chat titles.” You can also import a ChatGPT conversations.json export or an index JSON file. Organization stays on this device. Original chats stay intact.'],
  chooseFile: ['选择文件', 'Choose file'], dragFile: ['或直接拖进窗口', 'or drag it into this window'], resume: ['接着上次', 'Pick up again'], continue: ['继续', 'Continue'],
  inbox: ['待收纳', 'Inbox'], inboxCount: ['{count} 篇待收纳', {one:'{count} chat to organize', other:'{count} chats to organize'}], addFolder: ['＋ 文件夹', '＋ Folder'],
  projectLabel: ['{name}，{chats}', '{name}, {chats}'], unfiled: ['散篇', 'Unfiled'], unfiledLabel: ['散篇，未归项目的 {chats}', 'Unfiled, {chats} without a project'],
  projectsIn: ['{name}里的项目', 'Projects in {name}'], newProject: ['新建项目', 'New project'], newProjectShort: ['新项目', 'New project'],
  filter: ['筛选', 'Filter'], filterLabel: ['筛选与排序', 'Filter and sort'], source: ['来源', 'Source'], order: ['顺序', 'Order'], recentFirst: ['最近更新', 'Newest first'], oldestFirst: ['最早更新', 'Oldest first'], groupDates: ['按日期分组', 'Group by date'],
  renameHint: ['双击改名', 'Double-click to rename'], allChats: ['全部对话', 'All chats'], chats: ['对话', 'Chats'], folderColor: ['修改文件夹颜色', 'Change folder color'],
  renameProject: ['修改项目名称', 'Rename project'], renameFolder: ['修改文件夹名称', 'Rename folder'], selectAll: ['选择全部 {chats}', 'Select all {chats}'],
  deleteProject: ['删除项目', 'Delete project'], projectDeleteHint: ['对话留在文件夹', 'Chats stay in the folder'], deleteFolder: ['删除文件夹', 'Delete folder'], folderDeleteHint: ['对话回到待收纳', 'Chats return to Inbox'],
  addProject: ['＋ 新项目', '＋ Project'], selectChat: ['选择 {title}', 'Select {title}'], previousPage: ['上一页', 'Previous page'], nextPage: ['下一页', 'Next page'], pageRange: ['第 {start}–{end}，共 {total}', '{start}–{end} of {total}'],
  notFound: ['没有找到「{query}」', 'No results for “{query}”'], searched: ['标题和最后一段都搜过了。', 'Searched titles and last messages.'], clearSearch: ['清空搜索', 'Clear search'],
  emptyProject: ['这个项目还没有对话', 'No chats in this project yet'], emptyProjectHint: ['在任意一篇里选择「归入」，或把卡片拖到书脊上。', 'Choose “Move to” in a chat, or drag a card onto the project spine.'],
  emptyFolder: ['这个文件夹还是空的', 'This folder is empty'], emptyFolderHint: ['在任意一篇里选择「归入」，把对话放进来。', 'Choose “Move to” in a chat to put it here.'], emptySource: ['没有这个来源的对话', 'No chats from this source'], allSources: ['看全部来源', 'Show all sources'],
  emptyFavorites: ['还没有常用对话', 'No favorite chats yet'], emptyFavoritesHint: ['在一篇的「⋯」里设为常用，它会出现在这里。', 'Use “⋯” in a chat to add it to Favorites.'],
  emptyArchive: ['没有归档的对话', 'No archived chats'], emptyArchiveHint: ['归档只在本机收起，随时可以恢复。', 'Archived chats are hidden locally and can be restored anytime.'],
  emptyTrash: ['垃圾桶是空的', 'Trash is empty'], emptyTrashHint: ['移到垃圾桶的对话会留在这里，可以恢复。', 'Chats moved to Trash stay here and can be restored.'],
  emptyMatch: ['没有符合条件的对话', 'No chats match these filters'], emptyImport: ['还没有导入对话', 'No chats imported yet'], importChats: ['导入对话', 'Import chats'],
  selectedCount: ['{count} 篇已选', {one:'{count} chat selected', other:'{count} chats selected'}], bulkActions: ['批量整理', 'Organize selected chats'], handle: ['处理…', 'Actions…'], moveMenu: ['归入…', 'Move to…'],
  restore: ['恢复', 'Restore'], folders: ['文件夹', 'Folders'], projects: ['项目', 'Projects'], newProjectMenu: ['新建项目…', 'New project…'], putAway: ['收起', 'Put away'], archive: ['归档', 'Archive'], toTrash: ['移到垃圾桶', 'Move to Trash'], cancel: ['取消', 'Cancel'], undo: ['撤销', 'Undo'],
  moved: ['已归入「{name}」', 'Moved to “{name}”'], moveTo: ['归入', 'Move to'], movedOut: ['已移出项目', 'Removed from project'], moveOut: ['移出', 'Remove from'], project: ['项目', 'Project'],
  archivedDone: ['已归档', 'Archived'], trashedDone: ['已移到垃圾桶，可恢复', 'Moved to Trash. You can restore it.'], restoredDone: ['对话已恢复', 'Chat restored'], originalPlace: ['原处', 'Original location'],
  restoreChat: ['恢复对话', 'Restore chat'], destination: ['整理位置，当前在{name}', 'Move to, currently in {name}'], choosePlace: ['选择位置', 'Choose location'], leaveProject: ['移出当前项目', 'Remove from current project'],
  previousChat: ['上一篇', 'Previous chat'], nextChat: ['下一篇', 'Next chat'], backToList: ['返回列表', 'Back to list'], lastImage: ['最后一张图', 'Last image'], lastMessage: ['最后一段', 'Last message'], chatMore: ['更多对话操作', 'More chat actions'],
  unfavorite: ['取消常用', 'Remove from Favorites'], favorite: ['设为常用', 'Add to Favorites'], localOnly: ['只整理本机索引，原对话不动', 'Organizes the local index. Original chats stay intact.'], continueChat: ['继续对话', 'Continue chat'],
  demoOpen: ['这是示例对话，没有原文可打开；导入自己的对话后可在客户端找回', 'This is a demo chat with no original to open. Import your own chats to find them in the client.'], openingClient: ['正在连接客户端…', 'Connecting to the client…'], noClientResult: ['客户端没有返回结果，请重试。', 'The client returned no result. Please retry.'], openedClient: ['已在客户端定位原对话', 'Located the original chat in the client'],
  handedToClient: ['已交给客户端打开', 'Sent to the desktop client'], client_launch_failed: ['未能启动桌面客户端，请确认已安装并能正常打开。', 'Could not launch the desktop client. Check that it is installed and opens normally.'], invalid_host_id: ['对话的来源设备不正确，请重新同步索引。', 'The chat’s source device is invalid. Sync the index again.'],
  openFailed: ['未能打开这篇对话', 'Could not open this chat'], clientReason: ['客户端返回的原因', 'Client diagnostic'], chatName: ['对话名称', 'Chat title'], copyFind: ['复制名称，手动查找', 'Copy title to find manually'], recheck: ['重新检查', 'Check again'], retryOpen: ['重试打开', 'Retry opening'], backToPreview: ['返回预览', 'Back to preview'],
  findInClient: ['在客户端手动查找', 'Find in the client'], findHint: ['复制名称后，在客户端的搜索中粘贴，找到原对话继续。', 'Copy the title and paste it into the client’s search to find the original chat.'], copyTitle: ['复制名称', 'Copy title'],
  newFolder: ['新建文件夹', 'New folder'], name: ['名称', 'Name'], folderPlaceholder: ['例如：工作', 'For example: Work'], create: ['创建', 'Create'], colorTitle: ['「{name}」的颜色', 'Color of “{name}”'], color: ['颜色', 'Color'], hexColor: ['色号', 'Hex color'], hexHint: ['六位十六进制色号，例如 #336699', 'Six-digit hex color, for example #336699'], saveColor: ['保存颜色', 'Save color'],
  projectName: ['项目名称', 'Project name'], folderName: ['文件夹名称', 'Folder name'], projectPlaceholder: ['例如：CAMpass', 'For example: CAMpass'], putIn: ['放在', 'Folder'], createWithSelected: ['同时收入已选的 {count} 篇', {one:'Include the selected {count} chat', other:'Include the selected {count} chats'}], createProject: ['创建项目', 'Create project'], close: ['关闭', 'Close'],
  aboutChatCount: ['{count} 篇对话', {one:'{count} chat', other:'{count} chats'}],
  aboutText: ['ChatGPT 和 Codex 只是来源标签，同一个项目的对话装在同一本册子里。项目、归档和垃圾桶只存在本机，原对话保持原状。', 'ChatGPT and Codex are source labels. Chats for the same project stay together. Projects, archives and Trash are local; original chats stay intact.'],
  demoAbout: ['当前是虚构的示例数据，用来演示整理和找回流程。', 'These fictional chats demonstrate organizing and finding conversations.'], backupLocation: ['备份存放位置', 'Backup location'], freePlugin: ['免费插件 · 无需订阅', 'Free plugin · No subscription required'], developer: ['开发者 pakco', 'Developed by pakco'],
  syncing: ['同步中…', 'Syncing…'], autoSync: ['自动同步', 'Auto sync'], partialSync: ['部分已同步', 'Partially synced'], syncProblem: ['同步遇到问题', 'Sync problem'], syncDisconnected: ['同步未连接', 'Sync disconnected'], lastSync: ['上次成功同步：{date}', 'Last successful sync: {date}'],
  clientSync: ['客户端同步', 'Client sync'], syncScope: ['连接可用且服务运行时，每 30 秒同步客户端最近可见的 50 篇及置顶对话的标题和时间。新对话进入「待收纳」，已有分类和预览保留。', 'While the service and client connection are available, sync checks the latest 50 visible chats and pinned chats every 30 seconds. New chats go to Inbox. Existing organization and previews are preserved.'],
  syncRetention: ['已收录的对话不会因时间久而移除。完整历史可继续通过导出文件补入。', 'Indexed chats do not expire. Import an export file to add older history.'], syncWaiting: ['请在客户端中打开一次对话集，连接后自动同步。', 'Open 对话集 in the client once. Auto sync starts when connected.'], noSyncYet: ['尚未完成同步', 'No successful sync yet'], connectionReason: ['连接返回的原因', 'Connection diagnostic'], syncNow: ['立即同步', 'Sync now'],
  syncPartialReason: ['部分客户端来源暂不可用，已同步能访问的对话；已有记录保留。', 'Some client sources are unavailable. Accessible chats were synced; existing records are preserved.'], previewPartialReason: ['标题已同步，部分末段暂未读取：{reason}', 'Titles synced. Some last messages could not be read: {reason}'], collected: ['已收录 {count} 篇新对话', {one:'Added {count} new chat', other:'Added {count} new chats'}], syncedDone: ['客户端对话已同步', 'Client chats synced'],
  emptyName: ['名称不能为空', 'Name cannot be empty'], nameSaved: ['名称已保存', 'Name saved'], fileTooLarge: ['请选择 128 MB 以内的 JSON 文件', 'Choose a JSON file up to 128 MB'], readingFile: ['正在读取 {name}…', 'Reading {name}…'], indexTooLarge: ['请导入不超过 5000 条的对话索引', 'Import an index with up to 5,000 chats'], imported: ['已导入 {count} 篇{added}', {one:'Imported {count} chat{added}', other:'Imported {count} chats{added}'}], importedNew: ['，其中 {count} 篇是新的', {one:', including {count} new chat', other:', including {count} new chats'}], invalidJSON: ['这个文件不是有效的 JSON', 'This file is not valid JSON'],
  projectDeleted: ['项目已删除，对话仍在文件夹里', 'Project deleted. Chats remain in the folder.'], folderDeleted: ['文件夹已删除，对话回到待收纳', 'Folder deleted. Chats returned to Inbox.'], unfavorited: ['已取消常用', 'Removed from Favorites'], favorited: ['已设为常用', 'Added to Favorites'], undone: ['已撤销', 'Undone'], backedUp: ['备份已保存到本机', 'Backup saved locally'], copied: ['名称已复制，在客户端搜索中粘贴即可', 'Title copied. Paste it into the client’s search.'], copyFailed: ['无法自动复制，请按 ⌘C 或 Ctrl+C 复制选中的名称', 'Cannot copy automatically. Press ⌘C or Ctrl+C to copy the selected title.'], colorSaved: ['文件夹颜色已保存', 'Folder color saved'], projectCreated: ['项目已创建', 'Project created'], folderCreated: ['文件夹已创建', 'Folder created'], serviceUnavailable: ['连不上本机服务', 'Cannot reach the local service'], reconnect: ['重新连接', 'Reconnect'],
  index_full: ['对话集已达到 5000 篇的容量，本次未收录新条目，原记录保留。', 'The index has reached its 5,000-chat limit. No new entries were added; existing records are preserved.'],
  index_conflict: ['另一处对话集正在更新索引，请稍后重试。', 'Another instance is updating the index. Please retry shortly.'],
  chat_unavailable: ['客户端找不到这篇原对话的记录。可能已删除，或当前账号、设备无法访问。', 'The client cannot find the original chat. It may have been deleted or be unavailable on this account or device.'],
  client_timeout: ['客户端响应超时，请稍后重试。', 'The client timed out. Please retry shortly.'], client_denied: ['客户端拒绝了这次访问。请检查登录与连接权限。', 'The client denied access. Check your login and connection permissions.'],
  client_connection_closed: ['客户端关闭了同步连接，无法通过这条连接定位原对话；已收录的对话仍然保留。', 'The client closed the sync connection. It cannot locate the original chat through this connection; indexed chats are preserved.'],
  client_disconnected: ['尚未连接桌面客户端，请在客户端中打开一次对话集，再重试。', 'The desktop client is not connected. Open 对话集 in the client once and retry.'],
  client_error: ['这次操作未完成，请查看返回的具体原因。', 'The action could not be completed. See the returned diagnostic.'], index_missing: ['这篇对话已不在索引中，请刷新后重试。', 'This chat is no longer in the index. Refresh and retry.'], demo_chat: ['这是示例对话，没有真实原文可打开。', 'This is a demo chat with no original to open.'],
};
let language = 'en', locale = 'en';
export function setLocale(hostLocale, browserLanguages = []) {
  const candidates = [hostLocale, ...browserLanguages];
  let preferred = 'en';
  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || !candidate.trim() || candidate.length > 128) continue;
    try { preferred = Intl.getCanonicalLocales(candidate.trim().replaceAll('_', '-'))[0]; break; } catch { /* 无效语言标签继续使用浏览器偏好。 */ }
  }
  language = /^zh(?:-|$)/i.test(preferred) ? 'zh-CN' : 'en';
  // ponytail: 先覆盖简体中文和英文，其他语言回退英文；地区格式保留支持语言的原始标签。
  locale = /^(?:zh|en)(?:-|$)/i.test(preferred) ? preferred : 'en';
  return language;
}
export function getLocale() { return locale; }
export function getLanguage() { return language; }
export function failureText(result) { return Object.hasOwn(messages, result.code) ? t(result.code) : result.reason || t('operationFailed'); }
export function t(key, vars = {}) {
  const values = Object.hasOwn(messages, key) ? messages[key] : undefined;
  let text = values?.[language === 'zh-CN' ? 0 : 1] ?? values?.[1] ?? key;
  if (typeof text === 'object') text = text[new Intl.PluralRules(locale).select(Number(vars.count ?? 0))] ?? text.other;
  return text.replace(/\{(\w+)\}/g, (_, name) => vars[name] == null ? '' : typeof vars[name] === 'number' ? new Intl.NumberFormat(locale).format(vars[name]) : String(vars[name]));
}
export function localize(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n, JSON.parse(el.dataset.i18nVars ?? '{}')); });
  for (const attr of ['aria-label', 'title', 'placeholder', 'label', 'alt']) root.querySelectorAll('[data-i18n-' + attr + ']').forEach(el => el.setAttribute(attr, t(el.getAttribute('data-i18n-' + attr))));
  document.documentElement.lang = language;
  document.title = '对话集';
  for (const [name, key] of Object.entries({idle:'trashIdle', carrying:'trashCarrying', drop:'trashDrop'})) document.documentElement.style.setProperty('--trash-' + name, JSON.stringify(t(key)));
}

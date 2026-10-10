import { t, setLocale, getLocale, localize, failureText } from './i18n.js';
import { lastMessageContent, lastMessagePreview, timestampSeconds, folderLayout, sortConversations, conversationDay, portraitPages, titleKeywords } from './history.js';
// 对话集：文件夹是布面「函」，项目是函里的「册」，对话是一页页「篇」。只换界面，数据格式与接口沿用 0.8.0。
function esc(value) { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
const $ = id => document.getElementById(id);
const board = $('board'), detail = $('detail'), search = $('search'), heading = $('page-heading'), toastEl = $('toast');
const motion = matchMedia('(prefers-reduced-motion: no-preference)');
let data, view = 'home', source = 'all', selected = new Set(), dragging = [], busy = false, toastTimer, page = 0, pageCount = 1, sortOrder = 'recent', groupDates = false;
// enter：本次渲染要播放的入场方式；pulse：刚被放入对话的函或册，用来播放「变厚」反馈。
let enter = 'intro', pulse = null, navAt = 0, boardSize = '', peekKeys = [], liftedSpine = null, lastBox = '';
// focusNext：整段重绘后要放回焦点的元素（键盘用户不会掉回页面开头）。
let focusNext = null;
let folderDrag = null, folderPageTimer, folderClickBlocked = false;
// intro 首次打开、page 进入新页面（书架立起＋纸页升起）、up 只刷新纸页、next/prev 翻页。
const enterClass = () => enter ? ' enter-' + ({intro:'up', page:'up'}[enter] ?? enter) : '';
const embedded = window.parent !== window;
let hostLocale, languagePending = false;
// 表单只更新带键的文案，不重新创建输入框；改名、拖动和保存期间延后列表重绘。
const copy = (key, vars = {}) => `<span data-i18n="${key}" data-i18n-vars="${esc(JSON.stringify(vars))}">${esc(t(key, vars))}</span>`;
function updateLanguage() {
  setLocale(hostLocale, navigator.languages?.length ? navigator.languages : [navigator.language]);
  localize();
  if (!data) return;
  renderSync();
  const syncNote = detail.querySelector('#sync-form [role="status"]');
  if (syncNote) syncNote.textContent = syncExplanation(data.sync ?? {}) || (data.sync?.lastSuccessAt ? t('lastSync',{date:new Date(data.sync.lastSuccessAt*1000).toLocaleString(getLocale())}) : t('noSyncYet'));
  if (busy || opening || dragging.length || folderDrag || document.querySelector('.name-input') || (detail.open && !detail.dataset.chatKey)) { languagePending = true; return; }
  const active = document.activeElement;
  if (active?.id) focusNext = () => $(active.id);
  else if (active?.dataset.select) focusNext = () => document.querySelector('[data-select="' + CSS.escape(active.dataset.select) + '"]');
  else if (active?.dataset.action) {
    const selector = '[data-action="' + CSS.escape(active.dataset.action) + '"]' + ['key','box','project','tab'].filter(k => active.dataset[k]).map(k => '[data-' + k + '="' + CSS.escape(active.dataset[k]) + '"]').join('');
    focusNext = () => document.querySelector(selector);
  }
  render();
  if (detail.open && detail.dataset.chatKey) peek(detail.dataset.chatKey);
}
window.addEventListener('languagechange', updateLanguage);
const pending = new Map();
let requestId = 0;
let opening = false, refreshing = false;
function rpc(method, params) {
  const id = ++requestId;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(t('timeout'))); }, 15000);
    pending.set(id, { resolve, reject, timeout });
    window.parent.postMessage({ jsonrpc:'2.0', id, method, params }, '*');
  });
}
window.addEventListener('message', event => {
  if (event.source !== window.parent || event.data?.jsonrpc !== '2.0') return;
  const message = event.data;
  const request = pending.get(message.id);
  if (request) {
    clearTimeout(request.timeout); pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message ?? t('requestFailed')));
    else request.resolve(message.result);
  } else if (message.method === 'ui/notifications/host-context-changed') {
    if (Object.hasOwn(message.params ?? {}, 'locale')) { hostLocale = message.params.locale; updateLanguage(); }
  } else if (message.method === 'ui/notifications/tool-result' && message.params?.structuredContent?.chats) {
    data = message.params.structuredContent; render();
  } else if (message.method === 'ui/resource-teardown' || message.method === 'ping') {
    window.parent.postMessage({ jsonrpc:'2.0', id:message.id, result:{} }, '*');
  }
});
async function call(name, args = {}) {
  if (embedded) {
    const result = await rpc('tools/call', { name, arguments:args });
    if (result.isError) throw new Error(result.content?.find(c => c.type === 'text')?.text ?? t('operationFailed'));
    return result.structuredContent;
  }
  let response;
  try { response = await fetch('/api/' + name, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(args), signal:AbortSignal.timeout(15000) }); }
  catch (error) { throw new Error(error.name === 'TimeoutError' ? t('timeout') : t('serviceOffline')); }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? t('operationFailed'));
  return result;
}

const sourceName = owner => owner === 'chatgpt' ? 'ChatGPT' : 'Codex';
const projects = () => data.projects ?? [];
const boxOf = id => data.boxes.find(b => b.id === id);
const boxName = box => box?.id === 'inbox' && box.name === '待收纳' ? t('inbox') : box?.name ?? '';
const projectOf = id => projects().find(p => p.id === id);
const isActive = chat => (chat.status ?? 'active') === 'active';
const activeIn = id => data.chats.filter(c => isActive(c) && c.category === id);
// ponytail: 同名空文件夹只从界面收起，保留旧索引；有对话或项目时仍显示。
const visibleBoxes = () => data.boxes.filter(b => !['垃圾桶','回收站'].includes(b.name) || data.chats.some(c => c.category === b.id) || projects().some(p => p.category === b.id));
const currentProject = () => view.startsWith('project:') ? projectOf(view.slice(8)) : null;
const currentBox = () => boxOf(currentProject()?.category ?? (/^(box|loose):/.test(view) ? view.slice(view.indexOf(':') + 1) : ''));
const query = () => search.value.trim().toLocaleLowerCase();
const isDemo = () => String(data?.coverage ?? '').startsWith('示例');
const hash = text => [...text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const bookWidth = n => Math.round(Math.min(30, 10 + 5 * Math.log2(n + 1)));
const spineWidth = n => Math.round(Math.min(64, 30 + 6 * Math.log2(n + 1)));

// ponytail: 大小写折叠按 toLocaleLowerCase 逐字对齐，个别语言长度变化的字符会错位，中文与英文标题不受影响。
function highlight(text, q) {
  if (!q) return esc(text);
  const lower = text.toLocaleLowerCase(); let out = '', at = 0, hit;
  while ((hit = lower.indexOf(q, at)) !== -1) { out += esc(text.slice(at, hit)) + '<mark class="hit">' + esc(text.slice(hit, hit + q.length)) + '</mark>'; at = hit + q.length; }
  return out + esc(text.slice(at));
}
const titleHTML = (title, q = query()) => q && title.toLocaleLowerCase().includes(q) ? highlight(title, q) : titleKeywords(title).map(part => part.kind ? `<span class="kw ${part.kind}">${esc(part.text)}</span>` : esc(part.text)).join('');
function matches(chat) {
  const q = query();
  return (source === 'all' || chat.source === source) && (!q || chat.title.toLocaleLowerCase().includes(q) || (chat.lastMessagePreview ?? '').toLocaleLowerCase().includes(q));
}
// 搜索覆盖全部对话；不搜索时按当前函、册、散篇或常用过滤。
function filtered() {
  const q = query(), box = currentBox(), project = currentProject(), status = view === 'archived' ? 'archived' : view === 'trash' ? 'trashed' : 'active';
  return sortConversations(data.chats.filter(c => (c.status ?? 'active') === status && matches(c) && (q || ((!box || c.category === box.id) && (!project || c.project === project.id) && (!view.startsWith('loose:') || !c.project) && (view !== 'favorites' || c.favorite)))), sortOrder);
}
function dateLabel(value, full = false) {
  const seconds = timestampSeconds(value), date = new Date(seconds * 1000);
  if (!seconds || Number.isNaN(date.valueOf())) return `<span class="date">${copy('timeUnknown')}</span>`;
  const options = {...(date.getFullYear() === new Date().getFullYear() ? {} : {year:'numeric'}), month:'long', day:'numeric', ...(full ? {hour:'2-digit', minute:'2-digit', hour12:false} : {})};
  return `<time class="date" datetime="${date.toISOString()}" title="${esc(date.toLocaleString(getLocale()))}">${esc(new Intl.DateTimeFormat(getLocale(), options).format(date))}</time>`;
}
function ago(value) {
  const seconds = timestampSeconds(value), diff = Date.now() / 1000 - seconds;
  if (!seconds) return '';
  if (diff < 90) return t('justNow');
  if (diff < 3600) return new Intl.RelativeTimeFormat(getLocale()).format(-Math.round(diff / 60), 'minute');
  if (diff < 86400) return new Intl.RelativeTimeFormat(getLocale()).format(-Math.round(diff / 3600), 'hour');
  if (diff < 86400 * 30) return new Intl.RelativeTimeFormat(getLocale()).format(-Math.round(diff / 86400), 'day');
  return new Intl.DateTimeFormat(getLocale(), {month:'long', day:'numeric'}).format(new Date(seconds * 1000));
}
const where = chat => esc(boxName(boxOf(chat.category))) + (projectOf(chat.project) ? ' · ' + esc(projectOf(chat.project).name) : '');
function previewHTML(chat, full = false) {
  if (chat.lastMessageImage !== undefined && (chat.lastMessageImage || !chat.lastMessagePreview?.trim())) return `<figure class="last-image${full ? ' full' : ''}">${chat.lastMessageImage ? `<img src="${esc(chat.lastMessageImage)}" alt="${esc(t('lastImageAlt'))}" data-i18n-alt="lastImageAlt" loading="lazy" decoding="async">` : ''}<figcaption class="image-fallback"${chat.lastMessageImage ? ' hidden' : ''}>${copy('imageMissing')}</figcaption></figure>`;
  const text = lastMessagePreview(chat), q = full ? '' : query();
  // 搜索命中末段时从命中处附近截取，命中词总在卡片可见范围内。
  const at = q ? text.toLocaleLowerCase().indexOf(q) : -1, shown = at > 36 ? '…' + text.slice(at - 20) : text;
  return `<p class="${full ? 'last-words' : 'leaf-body'}${text ? '' : ' unavailable'}">${text ? highlight(shown, q) : t('previewMissing')}</p>`;
}
document.addEventListener('error', event => { if (event.target.matches?.('.last-image img')) { event.target.hidden = true; event.target.nextElementSibling.hidden = false; } }, true);
const emptyArt = '<svg class="empty-art" viewBox="0 0 120 64" aria-hidden="true"><path d="M60 14C48 6 30 6 14 10v44c16-4 34-4 46 4 12-8 30-8 46-4V10C90 6 72 6 60 14Zm0 0v44"/><path d="M24 22c8-1.5 17-1 26 2M24 31c8-1.5 17-1 26 2M70 24c9-3 18-3.5 26-2M70 33c9-3 18-3.5 26-2"/></svg>';
function empty(text, hint = '', button = '') {
  return `<div class="empty">${emptyArt}<p class="empty-title">${text}</p>${hint ? `<p class="empty-hint">${hint}</p>` : ''}${button}</div>`;
}

// —— 首页：一排排布面函，题签上写名称，函口露出里面的书册 ——
function caseCard(box, i) {
  const chats = activeIn(box.id), shelf = projects().filter(p => p.category === box.id), loose = chats.filter(c => !c.project).length;
  const books = shelf.slice(0, 10).map((p, j) => `<i class="book v${j % 5}" data-w="${bookWidth(chats.filter(c => c.project === p.id).length)}" data-h="${62 + hash(p.id) % 38}" data-j="${j}"></i>`).join('')
    + (loose ? `<i class="sheaf" data-w="${Math.min(34, 16 + loose * 3)}" data-h="${56 + Math.min(26, loose * 5)}" data-j="${Math.min(shelf.length, 10)}"></i>` : '');
  const inbox = box.id === 'inbox' && chats.length;
  return `<article class="case${pulse?.box === box.id ? ' fed' : ''}${folderDrag?.active && folderDrag.id === box.id ? ' folder-dragging' : ''}" data-color="${esc(box.color)}" data-box="${box.id}" data-i="${i}" title="${esc(t('folderDragHelp'))}" data-i18n-title="folderDragHelp">
<div class="case-books" aria-hidden="true">${books}</div>
<div class="case-front"><button class="case-label" data-action="box" data-box="${box.id}" data-rename="folder" aria-label="${esc(t('folderLabel', {name:boxName(box), chats:t('chatCount',{count:chats.length}), inbox:inbox ? t('needsOrganizing') : ''}))}"><span class="case-name">${esc(boxName(box))}</span><span class="case-count">${new Intl.NumberFormat(getLocale()).format(chats.length)}<small>${t('chatUnit',{count:chats.length})}</small>${inbox ? '<i class="dot" aria-hidden="true"></i>' : ''}</span></button><button class="case-color" data-action="folder-color" data-box="${box.id}" aria-label="${esc(t('changeColorLabel',{name:boxName(box)}))}" title="${esc(t('changeColor'))}" data-i18n-title="changeColor"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 4 6 6M3 21l5-1L21 7a2.8 2.8 0 0 0-4-4L4 16l-1 5Z"/></svg></button></div></article>`;
}
function resumeHTML() {
  if (!data.chats.length) return `<section class="welcome${enter ? ' enter' : ''}"><h2 class="welcome-title">${copy('welcomeTitle')}<br>${copy('welcomeSubtitle')}</h2><p class="welcome-text">${copy('welcomeText')}</p><div class="welcome-actions"><button class="primary-button" data-action="import">${copy('chooseFile')}</button><span class="hint">${copy('dragFile')}</span></div></section>`;
  const recent = sortConversations(data.chats.filter(isActive), 'recent')[0], inbox = activeIn('inbox').length;
  return `<section class="resume${enter ? ' enter' : ''}">${recent ? `<div class="resume-card"><div class="resume-main"><span class="kicker">${copy('resume')}</span><button class="resume-title" data-action="peek" data-key="${esc(recent.key)}" title="${esc(recent.title)}">${titleHTML(recent.title, '')}</button><span class="resume-where">${where(recent)} · ${ago(recent.updatedAt)}</span></div><button class="go-button" data-action="open" data-key="${esc(recent.key)}">${copy('continue')}<span aria-hidden="true">↗</span></button></div>` : ''}
<div class="home-tools">${inbox ? `<button class="inbox-nudge" data-action="box" data-box="inbox">${t('inboxCount',{count:inbox})}<span aria-hidden="true">→</span></button>` : ''}<button class="ghost-button" data-action="add-category">${copy('addFolder')}</button></div></section>`;
}
function renderHome() {
  heading.innerHTML = resumeHTML();
  const list = visibleBoxes(), layout = folderLayout(board.clientWidth, board.clientHeight, list.length), pages = Math.max(1, Math.ceil(list.length / layout.capacity));
  if (folderDrag) list.sort((a,b) => folderDrag.order.indexOf(a.id) - folderDrag.order.indexOf(b.id));
  for (const [key, value] of Object.entries({columns:layout.columns, width:layout.cardWidth + 'px', height:layout.cardHeight + 'px', gap:layout.gap + 'px'})) board.style.setProperty('--folder-' + key, value);
  page = Math.min(page, pages - 1);
  pagination(pages, list.length, page * layout.capacity + 1, Math.min((page + 1) * layout.capacity, list.length));
  board.innerHTML = `<div class="case-grid${enterClass()}">${list.slice(page * layout.capacity, (page + 1) * layout.capacity).map(caseCard).join('')}</div>`;
}

// —— 函内页：书架上的册（项目）＋ 一页页篇（对话） ——
function shelfHTML(box) {
  const chats = activeIn(box.id), shelf = projects().filter(p => p.category === box.id);
  if (!shelf.length) return '';
  const loose = chats.filter(c => !c.project).length, chosen = currentProject()?.id ?? (view.startsWith('loose:') ? 'loose' : '');
  const lift = id => chosen === id ? ` aria-pressed="true"${liftedSpine !== id ? ' data-lift' : ''}` : ' aria-pressed="false"';
  const spines = shelf.map((p, j) => { const n = chats.filter(c => c.project === p.id).length; return `<button class="spine v${j % 5}${pulse?.project === p.id ? ' fed' : ''}" data-action="project" data-project="${p.id}" data-w="${spineWidth(n)}" data-i="${j}"${lift(p.id)} aria-label="${esc(t('projectLabel',{name:p.name,chats:t('chatCount',{count:n})}))}" title="${esc(p.name)}"><span class="spine-label">${esc(p.name)}</span><span class="spine-count">${n}</span></button>`; }).join('');
  const bundle = loose ? `<button class="spine bundle" data-action="loose" data-loose="${box.id}" data-w="${spineWidth(loose)}" data-i="${shelf.length}"${lift('loose')} aria-label="${esc(t('unfiledLabel',{chats:t('chatCount',{count:loose})}))}"><span class="spine-label">${copy('unfiled')}</span><span class="spine-count">${loose}</span></button>` : '';
  return `<div class="shelf-wrap"><div class="shelf${enter === 'page' || enter === 'intro' ? ' enter' : ''}" data-color="${esc(box.color)}" role="group" aria-label="${esc(t('projectsIn',{name:boxName(box)}))}">${spines}${bundle}<button class="spine ghost" data-action="add-project" data-i="${shelf.length + 1}" aria-label="${esc(t('newProject'))}" data-i18n-aria-label="newProject"><span class="spine-plus" aria-hidden="true">＋</span><span class="spine-label">${copy('newProjectShort')}</span></button></div></div>`;
}
function filterMenu() {
  const changed = source !== 'all' || sortOrder !== 'recent' || groupDates;
  const seg = (attr, value, label, on) => `<button data-${attr}="${value}" aria-pressed="${on}">${label}</button>`;
  return `<details class="utility-menu filter-menu"><summary aria-label="${esc(t('filterLabel'))}" data-i18n-aria-label="filterLabel">${t('filter')}${changed ? '<i class="dot" aria-hidden="true"></i>' : ''}</summary><div>
<p class="menu-label">${copy('source')}</p><div class="segmented">${seg('source','all',t('all'),source === 'all')}${seg('source','chatgpt','ChatGPT',source === 'chatgpt')}${seg('source','codex','Codex',source === 'codex')}</div>
<p class="menu-label">${copy('order')}</p><div class="segmented">${seg('sort','recent',t('recentFirst'),sortOrder === 'recent')}${seg('sort','oldest',t('oldestFirst'),sortOrder === 'oldest')}</div>
<label class="check-row"><input id="group-dates" type="checkbox"${groupDates ? ' checked' : ''}>${copy('groupDates')}</label></div></details>`;
}
function headingHTML(mode, list) {
  const box = currentBox(), project = currentProject(), q = search.value.trim();
  const title = mode === 'search' ? `<h1 class="page-title">「${esc(q)}」</h1>` : box
    ? `<h1 class="page-title"><button class="heading-name" ${project ? `data-rename="project" data-project="${project.id}"` : view.startsWith('loose:') ? 'disabled' : `data-rename="folder" data-box="${box.id}"`} title="${view.startsWith('loose:') ? '' : t('renameHint')}">${esc(project ? project.name : view.startsWith('loose:') ? t('unfiled') : boxName(box))}</button></h1>`
    : `<h1 class="page-title">${{recent:t('allChats'), favorites:t('favorites'), archived:t('archived'), trash:t('trash')}[view] ?? t('chats')}</h1>`;
  const backTo = mode === 'shelf' && (project || view.startsWith('loose:')) ? esc(boxName(box)) : t('shelf');
  const more = [];
  if (mode === 'shelf') {
    more.push(`<button data-action="add-project">${copy('newProject')}</button>`);
    more.push(`<button data-action="folder-color" data-box="${box.id}">${copy('folderColor')}</button>`);
    if (!view.startsWith('loose:')) more.push(`<button data-action="rename">${project ? t('renameProject') : t('renameFolder')}</button>`);
  }
  if (list.length) more.push(`<button data-action="select-all">${t('selectAll',{chats:t('chatCount',{count:list.length})})}</button>`);
  if (mode === 'shelf' && project) more.push(`<button class="danger-button" data-action="delete-project">${copy('deleteProject')}<small>${copy('projectDeleteHint')}</small></button>`);
  if (mode === 'shelf' && !project && !view.startsWith('loose:') && box.id !== 'inbox') more.push(`<button class="danger-button" data-action="delete-category" data-box="${box.id}">${copy('deleteFolder')}<small>${copy('folderDeleteHint')}</small></button>`);
  const noShelf = mode === 'shelf' && !projects().some(p => p.category === box.id);
  return `<div class="heading-row"><button class="back" data-action="back"><span aria-hidden="true">‹</span>${backTo}</button>${title}<span class="page-count">${t('chatCount',{count:list.length})}</span>
<div class="heading-tools">${noShelf ? `<button class="ghost-button" data-action="add-project">${copy('addProject')}</button>` : ''}${filterMenu()}${more.length ? `<details class="utility-menu"><summary aria-label="${esc(t('more'))}" data-i18n-aria-label="more">⋯</summary><div>${more.join('')}</div></details>` : ''}</div></div>${mode === 'shelf' ? shelfHTML(box) : ''}`;
}
function leaf(chat, i) {
  const project = projectOf(chat.project), key = esc(chat.key), mark = selected.has(chat.key);
  const tag = project && !view.startsWith('project:') ? `<span class="leaf-tag" data-color="${esc(boxOf(project.category)?.color ?? 'stone')}">${esc(project.name)}</span>` : '';
  return `<article class="leaf${mark ? ' selected' : ''}${chat.favorite ? ' favored' : ''}" data-key="${key}" data-i="${i}" draggable="${chat.status !== 'trashed'}">
<div class="leaf-meta"><label class="leaf-check"><input type="checkbox" data-select="${key}" aria-label="${esc(t('selectChat',{title:chat.title}))}"${mark ? ' checked' : ''}></label><span class="src ${chat.source}">${sourceName(chat.source)}</span>${dateLabel(chat.updatedAt)}</div>
<h3 class="leaf-title"><button data-action="peek" data-key="${key}" title="${esc(chat.title)}">${titleHTML(chat.title)}</button></h3>
${previewHTML(chat)}${tag}${chat.favorite ? `<span class="ribbon" title="${esc(t('favorites'))}" data-i18n-title="favorites"></span>` : ''}</article>`;
}
function gallery(list) {
  const grouped = groupDates && board.clientHeight >= 210;
  const layout = portraitPages(list, board.clientWidth, board.clientHeight, grouped), pages = layout.pages;
  page = Math.min(page, pages.length - 1);
  const rows = pages[page], before = pages.slice(0, page).reduce((sum, p) => sum + p.length, 0);
  pagination(pages.length, list.length, before + 1, before + rows.length);
  board.style.setProperty('--card-columns', layout.columns);
  board.style.setProperty('--card-width', layout.cardWidth + 'px');
  board.style.setProperty('--card-height', layout.cardHeight + 'px');
  board.classList.toggle('compact-cards', layout.cardHeight < 236);
  board.classList.toggle('tiny-cards', layout.cardHeight < 172);
  const motionClass = enterClass();
  if (!grouped) return `<div class="leaf-grid${motionClass}">${rows.map(leaf).join('')}</div>`;
  const sections = [];
  for (const chat of rows) {
    const day = conversationDay(chat.updatedAt, new Date(), getLocale());
    if (day.id === 'unknown') day.label = t('timeMissing');
    if (sections.at(-1)?.day.id !== day.id) sections.push({day, chats:[]});
    sections.at(-1).chats.push(chat);
  }
  let i = 0;
  return `<div class="leaf-sections${motionClass}">${sections.map(section => `<section><h2 class="date-heading">${esc(section.day.label)}</h2><div class="leaf-grid">${section.chats.map(chat => leaf(chat, i++)).join('')}</div></section>`).join('')}</div>`;
}
function emptyFor(mode) {
  if (mode === 'search') return empty(esc(t('notFound',{query:search.value.trim()})), t('searched'), `<button class="ghost-button" data-action="clear-search">${copy('clearSearch')}</button>`);
  if (currentProject()) return empty(t('emptyProject'), t('emptyProjectHint'));
  if (currentBox()) return empty(source === 'all' ? t('emptyFolder') : t('emptySource'), source === 'all' ? t('emptyFolderHint') : '', source === 'all' ? '' : `<button class="ghost-button" data-source="all">${copy('allSources')}</button>`);
  if (view === 'favorites') return empty(t('emptyFavorites'), t('emptyFavoritesHint'));
  if (view === 'archived') return empty(t('emptyArchive'), t('emptyArchiveHint'));
  if (view === 'trash') return empty(t('emptyTrash'), t('emptyTrashHint'));
  return data.chats.length ? empty(t('emptyMatch')) : empty(t('emptyImport'), '', `<button class="primary-button" data-action="import">${copy('importChats')}</button>`);
}
function renderPages(mode) {
  const list = filtered(), shelf = heading.querySelector('.shelf'), scroll = shelf?.scrollLeft ?? 0, menuOpen = heading.querySelector('.filter-menu')?.open;
  heading.innerHTML = headingHTML(mode, list);
  // 整段重绘后还原书架横向位置与筛选菜单，连续调整时不跳动。
  const nextShelf = heading.querySelector('.shelf'); if (nextShelf) nextShelf.scrollLeft = scroll;
  if (menuOpen) heading.querySelector('.filter-menu').open = true;
  board.innerHTML = list.length ? gallery(list) : emptyFor(mode);
  if (!list.length) pagination(1, 0, 0, 0);
  const lifted = heading.querySelector('.spine[aria-pressed="true"]');
  liftedSpine = lifted ? lifted.dataset.project ?? 'loose' : null;
}
function paint(root) {
  root.querySelectorAll('[data-w],[data-h],[data-i],[data-j],[data-color]').forEach(el => {
    if (el.dataset.w) el.style.setProperty('--w', el.dataset.w + 'px');
    if (el.dataset.h) el.style.setProperty('--h', el.dataset.h + '%');
    if (el.dataset.i) el.style.setProperty('--i', el.dataset.i);
    if (el.dataset.j) el.style.setProperty('--j', el.dataset.j);
    if (el.dataset.color) el.style.setProperty('--tone', el.dataset.color.startsWith('#') ? el.dataset.color : `var(--t-${el.dataset.color})`);
  });
}
function navState(mode) {
  const tab = mode === 'search' ? '' : ['home', 'recent', 'favorites'].includes(view) ? view : currentBox() ? 'home' : '';
  const ink = document.querySelector('.tab-ink'); let target = null;
  document.querySelectorAll('.view-tabs [data-tab]').forEach(b => { const on = b.dataset.tab === tab; b.classList.toggle('active', on); b.setAttribute('aria-current', on ? 'page' : 'false'); if (on) target = b; });
  ink.style.opacity = target ? 1 : 0;
  if (target) { ink.style.width = target.offsetWidth - 16 + 'px'; ink.style.transform = `translateX(${target.offsetLeft + 8}px)`; }
}
function render() {
  if (!data) return;
  if ((/^(box|loose):/.test(view) && !currentBox()) || (view.startsWith('project:') && !currentProject())) view = 'home';
  const mode = query() ? 'search' : view === 'home' ? 'home' : currentBox() ? 'shelf' : 'list';
  document.body.dataset.mode = mode;
  board.setAttribute('aria-busy', String(busy));
  $('demo-badge').hidden = !isDemo();
  renderSync();
  const trashCount = data.chats.filter(c => c.status === 'trashed').length;
  $('trash-count').textContent = trashCount; $('trash-count').hidden = !trashCount;
  document.querySelector('.trash-dock').setAttribute('aria-label', t('projectLabel',{name:t('trash'),chats:t('chatCount',{count:trashCount})}));
  document.querySelector('.trash-dock').setAttribute('aria-current', view === 'trash' && !query() ? 'page' : 'false');
  if (mode === 'home') renderHome(); else renderPages(mode);
  paint(heading); paint(board);
  navState(mode);
  renderSelection();
  enter = null; pulse = null;
  boardSize = board.clientWidth + 'x' + board.clientHeight;
  languagePending = false;
  if (focusNext) { focusNext()?.focus({preventScroll:true}); focusNext = null; }
}
function pagination(pages, total, start, end) {
  pageCount = pages;
  $('pagination').innerHTML = pages > 1 ? `<button class="page-turn" data-action="previous-page" aria-label="${esc(t('previousPage'))}" data-i18n-aria-label="previousPage"${page === 0 ? ' disabled' : ''}>‹</button><span class="page-no"><b>${page + 1}</b><span>/</span>${pages}</span><button class="page-turn" data-action="next-page" aria-label="${esc(t('nextPage'))}" data-i18n-aria-label="nextPage"${page === pages - 1 ? ' disabled' : ''}>›</button><span class="page-range">${t('pageRange',{start,end,total})}</span>` : '';
}
function renderSelection() {
  const bar = $('selection-bar'); bar.hidden = !selected.size;
  document.body.classList.toggle('selecting', selected.size > 0);
  if (!selected.size) return;
  const parked = view === 'archived' || view === 'trash';
  bar.innerHTML = `<span class="selection-count">${t('selectedCount',{count:selected.size})}</span><select id="bulk-action" aria-label="${esc(t('bulkActions'))}" data-i18n-aria-label="bulkActions"><option value="">${parked ? t('handle') : t('moveMenu')}</option>${parked ? `<option value="restore" data-i18n="restore">${t('restore')}</option>` : `<optgroup label="${esc(t('folders'))}" data-i18n-label="folders">${visibleBoxes().map(b => `<option value="folder:${b.id}">${esc(boxName(b))}</option>`).join('')}</optgroup><optgroup label="${esc(t('projects'))}" data-i18n-label="projects">${projects().map(p => `<option value="project:${p.id}">${esc(boxName(boxOf(p.category)))} · ${esc(p.name)}</option>`).join('')}<option value="new-project" data-i18n="newProjectMenu">${t('newProjectMenu')}</option></optgroup><optgroup label="${esc(t('putAway'))}" data-i18n-label="putAway"><option value="archive" data-i18n="archive">${t('archive')}</option><option value="trash" data-i18n="toTrash">${t('toTrash')}</option></optgroup>`}</select><button class="cancel" data-action="cancel-selection">${copy('cancel')}</button>`;
}

// —— 动效：页面切换、翻页、展开一篇、盖印 ——
function go(next, from = null) {
  navAt = performance.now();
  const update = () => {
    view = next; page = 0; source = 'all'; selected.clear(); enter = 'page';
    focusNext = next.startsWith('box:') ? () => heading.querySelector('.heading-name') : next === 'home' && lastBox ? () => board.querySelector(`.case[data-box="${CSS.escape(lastBox)}"] .case-label`) : null;
    render();
  };
  if (!document.startViewTransition || !motion.matches || detail.open || document.hidden) { update(); return; }
  // 被点开的函题签与内页大标题共用一个过渡名，浏览器把名称从卡片「移」到标题。
  const old = from === 'case' ? board.querySelector(`.case[data-box="${CSS.escape(next.slice(4))}"] .case-name`) : from === 'heading' ? heading.querySelector('.heading-name') : null;
  if (old) old.style.viewTransitionName = 'case-title';
  let named = null;
  const transition = document.startViewTransition(() => {
    update();
    named = from === 'case' ? heading.querySelector('.heading-name') : from === 'heading' ? board.querySelector(`.case[data-box="${CSS.escape(lastBox)}"] .case-name`) : null;
    if (named) named.style.viewTransitionName = 'case-title';
  });
  transition.ready.catch(() => {});
  transition.finished.finally(() => { if (named) named.style.viewTransitionName = ''; });
}
function turn(step) {
  const next = Math.max(0, Math.min(pageCount - 1, page + step));
  if (next === page) return;
  const from = document.activeElement;
  focusNext = from?.closest('.page-turn') ? () => $('pagination').querySelector(`[data-action="${step > 0 ? 'next' : 'previous'}-page"]:not(:disabled)`) ?? $('pagination').querySelector('.page-turn:not(:disabled)') : board.contains(from) ? () => board.querySelector('.leaf-title button') : null;
  page = next; enter = step > 0 ? 'next' : 'prev'; render();
}
function back() {
  search.value = '';
  const box = currentBox();
  if (box && (currentProject() || view.startsWith('loose:'))) { navAt = performance.now(); view = 'box:' + box.id; page = 0; source = 'all'; enter = 'up'; focusNext = () => heading.querySelector('.heading-name'); render(); return; }
  home();
}
function home() {
  search.value = '';
  lastBox = view.startsWith('box:') ? view.slice(4) : '';
  go('home', lastBox ? 'heading' : null);
}
function openSpine(next) {
  // 同一本书再点一次就放回书架，回到整个文件夹。
  const clicked = next.startsWith('project:') ? `.spine[data-project="${CSS.escape(next.slice(8))}"]` : '.spine[data-loose]';
  if (view === next) next = 'box:' + currentBox().id;
  focusNext = () => heading.querySelector(clicked);
  navAt = performance.now(); view = next; page = 0; selected.clear(); enter = 'up'; render();
}
function toast(text, canUndo = false, error = false) {
  clearTimeout(toastTimer); const element = toastEl; element.hidden = false; element.classList.toggle('error', error);
  // 模态预览打开时外面的元素都不可点，提示条放进预览里，「撤销」才点得到。
  const host = detail.open ? detail : document.body; if (element.parentElement !== host) host.append(element);
  element.innerHTML = '<span>' + esc(text) + '</span>' + (canUndo ? `<button data-action="undo">${copy('undo')}</button>` : '');
  element.classList.remove('show'); void element.offsetWidth; element.classList.add('show');
  toastTimer = setTimeout(() => { element.hidden = true; }, canUndo ? 6500 : 4200);
}
async function action(name, args, message, after) {
  if (busy) { pulse = null; return false; }
  busy = true; board.setAttribute('aria-busy', 'true');
  detail.setAttribute('aria-busy', 'true');
  // 只锁住、之后也只解锁当前可用的控件，翻篇按钮在两端的禁用状态不被覆盖。
  const locked = [...detail.querySelectorAll('select,input,button:not([data-action="close-dialog"]):not([data-action="open"])')].filter(control => !control.disabled);
  locked.forEach(control => control.disabled = true);
  try {
    const next = await call(name, args);
    const update = () => { data = next; selected.clear(); render(); if (detail.open && detail.dataset.chatKey && ['move_chats','assign_project','favorite_chat','undo_shelf','archive_chats','restore_chats'].includes(name)) peek(detail.dataset.chatKey); };
    if (document.startViewTransition && motion.matches && !detail.open && !document.hidden) await document.startViewTransition(update).updateCallbackDone.catch(() => {}); else update();
    after?.();
    if (message) toast(message, next.canUndo && !['get_shelf','export_backup','undo_shelf'].includes(name));
    return true;
  } catch (error) { pulse = null; if (detail.open && detail.dataset.chatKey) peek(detail.dataset.chatKey); toast(error.message, false, true); return false; }
  finally { busy = false; board.setAttribute('aria-busy', 'false'); detail.setAttribute('aria-busy', 'false'); locked.forEach(control => control.disabled = false); if (languagePending) updateLanguage(); }
}
async function move(keys, category) {
  const box = boxOf(category); if (!box) return;
  pulse = {box:category};
  await action('move_chats', {keys, category}, t('moved',{name:boxName(box)}), () => stamp(t('moveTo'), box.name));
}
async function assignProject(keys, project) {
  const target = projectOf(project), left = projectOf(data.chats.find(c => c.key === keys[0])?.project);
  pulse = target ? {project, box:target.category} : null;
  await action('assign_project', {keys, project}, target ? t('moved',{name:target.name}) : t('movedOut'), () => stamp(target ? t('moveTo') : t('moveOut'), target?.name ?? left?.name ?? t('project')));
}
async function setStatus(kind, keys) {
  const operation = {archive:'archive_chats', trash:'trash_chats', restore:'restore_chats'}[kind];
  const inPeek = detail.open && keys.length === 1 && detail.dataset.chatKey === keys[0];
  const ok = await action(operation, {keys}, {archive:t('archived'), trash:t('trashedDone'), restore:t('restoredDone')}[kind], inPeek && kind !== 'trash' ? () => stamp(kind === 'archive' ? t('putAway') : t('restore'), kind === 'archive' ? t('archive') : t('originalPlace')) : null);
  // 归档、恢复后让印章停留片刻再合上，删除则立即合上。
  if (ok && inPeek) {
    const sheet = detail.querySelector('.sheet');
    kind === 'trash' ? closeSheet() : setTimeout(() => { if (detail.open && detail.querySelector('.sheet') === sheet) closeSheet(); }, 820);
  }
  return ok;
}
// 朱文印：盖在当前这一页上，告诉用户它去了哪里。
function stamp(verb, name) {
  const sheet = detail.open && detail.querySelector('.sheet');
  if (!sheet) return;
  sheet.querySelector('.stamp')?.remove();
  const mark = document.createElement('div'); mark.className = 'stamp'; mark.setAttribute('aria-hidden', 'true');
  mark.innerHTML = `<small>${esc(verb)}</small><b>${esc(name.length > 7 ? name.slice(0, 6) + '…' : name)}</b>`;
  sheet.append(mark); sheet.classList.remove('thud'); void sheet.offsetWidth; sheet.classList.add('thud');
}
function sheetFrames(target, sheet, closing) {
  if (innerWidth < 640) return [{transform:'translateY(100%)'}, {transform:'none'}];
  const a = target?.getBoundingClientRect(), b = sheet.getBoundingClientRect();
  if (!a?.width) return [{opacity:0, transform:'translateY(14px) scale(.98)'}, {opacity:1, transform:'none'}];
  // 从卡片所在位置放大展开（合上时反向回到卡片），让用户看清是哪一篇被打开。
  const from = `translate(${a.left - b.left}px,${a.top - b.top}px) scale(${a.width / b.width})`;
  return closing ? [{transformOrigin:'0 0', transform:from, opacity:0}, {transformOrigin:'0 0', opacity:1, offset:.5}, {transformOrigin:'0 0', transform:'none', opacity:1}]
    : [{transformOrigin:'0 0', transform:from, opacity:0}, {transformOrigin:'0 0', opacity:1, offset:.3}, {transformOrigin:'0 0', transform:'none', opacity:1}];
}
function showSheet(from) {
  detail.showModal();
  const sheet = detail.querySelector('.sheet');
  if (motion.matches && sheet) sheet.animate(sheetFrames(from, sheet, false), {duration:360, easing:'cubic-bezier(.2,.8,.2,1)'});
}
function closeSheet() {
  if (!detail.open || detail.dataset.closing) return;
  const sheet = detail.querySelector('.sheet'), key = detail.dataset.chatKey;
  const card = key && board.querySelector(`.leaf[data-key="${CSS.escape(key)}"]`);
  if (!motion.matches || !sheet) { detail.close(); return; }
  detail.dataset.closing = '1'; detail.classList.add('closing');
  const frames = sheetFrames(card, sheet, true).reverse();
  // 后台标签页会暂停动画，超时兜底保证一定能合上。
  let done = false;
  const finish = () => { if (done) return; done = true; if (!detail.open || detail.querySelector('.sheet') !== sheet) return; delete detail.dataset.closing; detail.classList.remove('closing'); detail.close(); };
  sheet.animate(frames, {duration:240, easing:'cubic-bezier(.4,0,.2,1)', fill:'forwards'}).finished.then(finish, finish);
  setTimeout(finish, 320);
}
function chatActions(chat) {
  const key = `data-key="${esc(chat.key)}"`;
  return `${chat.status === 'trashed' || chat.status === 'archived' ? `<button data-action="restore" ${key}>${copy('restoreChat')}</button>` : `<button data-action="archive" ${key}>${copy('archive')}</button>`}${chat.status !== 'trashed' ? `<button class="danger-button" data-action="trash" ${key}>${copy('toTrash')}</button>` : ''}`;
}
function placeSelect(chat) {
  const box = boxOf(chat.category), project = projectOf(chat.project);
  return `<label class="place"><span class="place-label">${copy('moveTo')}</span><select id="detail-destination" data-key="${esc(chat.key)}" aria-label="${esc(t('destination',{name:boxName(box) + (project ? ' · ' + project.name : '')}))}"><option value="" selected disabled>${esc(box ? boxName(box) : t('choosePlace'))}${project ? ' · ' + esc(project.name) : ''}</option><optgroup label="${esc(t('folders'))}" data-i18n-label="folders">${visibleBoxes().map(b => `<option value="folder:${b.id}">${esc(boxName(b))}</option>`).join('')}</optgroup>${projects().length ? `<optgroup label="${esc(t('projects'))}" data-i18n-label="projects">${projects().map(p => `<option value="project:${p.id}">${esc(boxName(boxOf(p.category)))} · ${esc(p.name)}</option>`).join('')}</optgroup>` : ''}${project ? `<option value="project:none" data-i18n="leaveProject">${t('leaveProject')}</option>` : ''}</select></label>`;
}
function peek(key, from = null) {
  if (detail.open && detail.dataset.closing) return;
  const chat = data.chats.find(c => c.key === key); if (!chat) return;
  const trashed = chat.status === 'trashed', opening = !detail.open;
  const active = detail.contains(document.activeElement) ? document.activeElement : null;
  const focused = active?.id ? '#' + active.id : active?.dataset.step ? `[data-step="${active.dataset.step}"]` : active?.dataset.action ? `[data-action="${CSS.escape(active.dataset.action)}"]` : '';
  // 打开时记下当前列表顺序，左右键在同一批对话里翻篇。
  if (opening) peekKeys = filtered().map(c => c.key);
  const at = peekKeys.indexOf(key);
  detail.className = 'sheet-dialog'; detail.dataset.chatKey = key;
  const keepToast = detail.contains(toastEl);
  detail.innerHTML = `<article class="sheet${chat.favorite ? ' favored' : ''}">
<header class="sheet-top"><span class="src ${chat.source}">${sourceName(chat.source)}</span>${dateLabel(chat.updatedAt, true)}<span class="sheet-where">${where(chat)}</span>
${at >= 0 && peekKeys.length > 1 ? `<span class="sheet-nav"><button data-action="peek-step" data-step="-1" aria-label="${esc(t('previousChat'))}" data-i18n-aria-label="previousChat"${at === 0 ? ' disabled' : ''}>‹</button><span>${at + 1} / ${peekKeys.length}</span><button data-action="peek-step" data-step="1" aria-label="${esc(t('nextChat'))}" data-i18n-aria-label="nextChat"${at === peekKeys.length - 1 ? ' disabled' : ''}>›</button></span>` : ''}
<button class="sheet-close" data-action="close-dialog" aria-label="${esc(t('backToList'))}" data-i18n-aria-label="backToList">×</button></header>
<h2 id="detail-title" class="sheet-title" tabindex="-1">${titleHTML(chat.title, '')}</h2>
<div class="sheet-body"><p class="kicker">${chat.lastMessageImage || (chat.lastMessageImage === null && !chat.lastMessagePreview) ? t('lastImage') : t('lastMessage')}</p>${previewHTML(chat, true)}${chat.lastMessageImage && chat.lastMessagePreview ? `<p class="last-words caption">${esc(chat.lastMessagePreview)}</p>` : ''}</div>
<footer class="sheet-foot">${trashed ? '' : placeSelect(chat)}
<details class="utility-menu sheet-more"><summary aria-label="${esc(t('chatMore'))}" data-i18n-aria-label="chatMore">⋯</summary><div>${trashed ? '' : `<button data-action="favorite" data-key="${esc(key)}">${chat.favorite ? t('unfavorite') : t('favorite')}</button>`}${chatActions(chat)}<p class="menu-note">${copy('localOnly')}</p></div></details>
<button class="primary-button" data-action="open" data-key="${esc(key)}">${copy('continueChat')}<span aria-hidden="true">↗</span></button></footer>
<span class="ribbon" aria-hidden="true"></span></article>`;
  if (keepToast) detail.append(toastEl);
  if (opening) { showSheet(from); $('detail-title').focus({preventScroll:true}); }
  else ((focused && detail.querySelector(focused + ':not(:disabled)')) || (focused.startsWith('[data-step') && detail.querySelector('.sheet-nav button:not(:disabled)')) || detail.querySelector('.sheet-more summary')).focus({preventScroll:true});
}
function peekStep(step) {
  let at = peekKeys.indexOf(detail.dataset.chatKey);
  do at += step; while (at >= 0 && at < peekKeys.length && !data.chats.some(c => c.key === peekKeys[at]));
  if (at < 0 || at >= peekKeys.length) return;
  peek(peekKeys[at]);
  if (motion.matches) detail.querySelector('.sheet').animate([{transform:`translateX(${step * 26}px)`, opacity:.3}, {transform:'none', opacity:1}], {duration:220, easing:'cubic-bezier(.2,.8,.2,1)'});
}
async function openChat(key) {
  const chat = data.chats.find(c => c.key === key); if (!chat) return;
  // 示例对话没有真实原文：说明清楚，不跳到不存在的链接。
  if (chat.id.startsWith('demo-')) { toast(t('demoOpen')); return; }
  if (opening) return;
  opening = true;
  const buttons = [...document.querySelectorAll('[data-action="open"]')];
  const locked = buttons.filter(button=>!button.disabled);
  locked.forEach(button=>{button.disabled=true;button.setAttribute('aria-busy','true');});
  toast(t('openingClient'));
  try {
    const result = await call('open_chat',{key});
    if (!result?.ok) showOpenFailure(chat,result ?? {reason:t('noClientResult')});
    else { if (detail.querySelector('#open-chat-form')) detail.close(); toast(t(result.delivery === 'dispatched' ? 'handedToClient' : 'openedClient')); }
  } catch (error) { showOpenFailure(chat,{reason:error.message,retryable:true}); }
  finally { opening=false; locked.forEach(button=>{button.disabled=false;button.removeAttribute('aria-busy');}); if (languagePending) updateLanguage(); }
}
function showOpenFailure(chat,result) {
  toastEl.hidden=true;
  sheetForm('open-chat-form',copy('openFailed'),`<input type="hidden" name="key" value="${esc(chat.key)}"><p class="form-note open-reason" role="alert">${result.code && t(result.code) !== result.code ? copy(result.code) : esc(failureText(result))}</p>${result.detail ? `<details class="backup-location"><summary>${copy('clientReason')}</summary><code>${esc(result.detail)}</code></details>` : ''}<label class="field"><span>${sourceName(chat.source)} · ${copy('chatName')}</span><input value="${esc(chat.title)}" readonly></label><button type="button" class="ghost-button" data-action="find-chat" data-key="${esc(chat.key)}">${copy('copyFind')}</button>`,result.retryable === false ? copy('recheck') : copy('retryOpen'));
  const back = detail.querySelector('[data-action="close-dialog"]');
  back.dataset.action='return-chat'; back.dataset.key=chat.key; back.innerHTML=copy('backToPreview');
}
function findChat(chat) {
  sheetForm('find-chat-form', copy('findInClient'), `<p class="form-note">${copy('findHint')}</p><label class="field"><span>${copy('chatName')}</span><input name="name" value="${esc(chat.title)}" readonly></label>`, copy('copyTitle'));
  detail.querySelector('input').select();
}
function sheetForm(id, title, body, submit) {
  delete detail.dataset.chatKey; detail.className = 'sheet-dialog form-dialog';
  detail.innerHTML = `<form id="${id}" class="sheet small-sheet"><h2 id="detail-title" class="sheet-title">${title}</h2>${body}<div class="dialog-actions"><button class="ghost-button" type="button" data-action="close-dialog">${copy('cancel')}</button><button class="primary-button" type="submit">${submit}</button></div></form>`;
  showSheet(null); detail.querySelector('input')?.focus();
}
function addCategory() { sheetForm('category-form', copy('newFolder'), `<label class="field"><span>${copy('name')}</span><input name="name" maxlength="40" autocomplete="off" required placeholder="${esc(t('folderPlaceholder'))}" data-i18n-placeholder="folderPlaceholder"></label>`, copy('create')); }
function colorCategory(id) {
  const box = boxOf(id); if (!box) return;
  const color = box.color.startsWith('#') ? box.color : getComputedStyle(document.documentElement).getPropertyValue('--t-' + box.color).trim();
  sheetForm('color-form', copy('colorTitle',{name:boxName(box)}), `<input type="hidden" name="category" value="${box.id}"><div class="color-fields"><label class="field"><span>${copy('color')}</span><input id="folder-color-picker" type="color" value="${esc(color)}"></label><label class="field"><span>${copy('hexColor')}</span><input id="folder-color-hex" name="color" value="${esc(color)}" pattern="#[0-9a-fA-F]{6}" maxlength="7" autocomplete="off" spellcheck="false" required title="${esc(t('hexHint'))}" data-i18n-title="hexHint"></label></div>`, copy('saveColor'));
  const picker = $('folder-color-picker'), hex = $('folder-color-hex');
  picker.addEventListener('input', () => { hex.value = picker.value; });
  hex.addEventListener('input', () => { if (hex.checkValidity()) picker.value = hex.value; });
  hex.focus(); hex.select();
}
function addProject() {
  const category = currentBox()?.id ?? data.chats.find(c => selected.has(c.key))?.category ?? visibleBoxes()[0]?.id;
  sheetForm('project-form', copy('newProject'), `<label class="field"><span>${copy('projectName')}</span><input name="name" maxlength="40" autocomplete="off" required placeholder="${esc(t('projectPlaceholder'))}" data-i18n-placeholder="projectPlaceholder"></label><label class="field"><span>${copy('putIn')}</span><select name="category">${visibleBoxes().map(b => `<option value="${b.id}"${b.id === category ? ' selected' : ''}>${esc(boxName(b))}</option>`).join('')}</select></label>${selected.size ? `<p class="form-note">${copy('createWithSelected',{count:selected.size})}</p>` : ''}`, copy('createProject'));
}
function about() {
  delete detail.dataset.chatKey; detail.className = 'sheet-dialog form-dialog';
  const chats = data.chats.filter(isActive).length;
  detail.innerHTML = `<article class="sheet small-sheet about"><button class="sheet-close" data-action="close-dialog" aria-label="${esc(t('close'))}" data-i18n-aria-label="close">×</button><span class="seal about-seal" aria-hidden="true">对话<br>集印</span><h2 id="detail-title" class="sheet-title">对话集</h2><p class="about-line">${copy('aboutChatCount',{count:chats})} · ${copy('folderCount',{count:visibleBoxes().length})} · ${copy('projectCount',{count:projects().length})}</p><p class="about-text">${copy('aboutText')}</p>${isDemo() ? `<p class="about-text demo-note">${copy('demoAbout')}</p>` : ''}<details class="backup-location"><summary>${copy('backupLocation')}</summary><code>${esc(data.backupDirectory)}</code></details><p class="about-text">${copy('freePlugin')}</p><p class="about-sign">0.9.6-beta.1 · ${copy('developer')}</p></article>`;
  showSheet(null);
}
function syncExplanation(sync) {
  if (sync.state === 'partial') return sync.code ? t('previewPartialReason',{reason:failureText(sync)}) : t('syncPartialReason');
  if (sync.state === 'error') return failureText(sync);
  return sync.state === 'waiting' ? t('syncWaiting') : '';
}
function renderSync() {
  const element = $('sync-status'), sync = data.sync ?? {};
  element.hidden = isDemo();
  element.textContent = sync.state === 'syncing' ? t('syncing') : sync.state === 'synced' ? t('autoSync') : sync.state === 'partial' ? t('partialSync') : sync.connected ? t('syncProblem') : t('syncDisconnected');
  element.dataset.state = sync.state ?? 'waiting';
  element.title = [syncExplanation(sync),sync.lastSuccessAt ? t('lastSync',{date:new Date(sync.lastSuccessAt*1000).toLocaleString(getLocale())}) : ''].filter(Boolean).join('\n') || t('syncStatus');
}
function syncDetails() {
  const sync = data.sync ?? {};
  sheetForm('sync-form',copy('clientSync'),`<p class="form-note">${copy('syncScope')}</p><p class="form-note">${copy('syncRetention')}</p><p class="form-note" role="status">${esc(syncExplanation(sync) || (sync.lastSuccessAt ? t('lastSync',{date:new Date(sync.lastSuccessAt*1000).toLocaleString(getLocale())}) : t('noSyncYet')))}</p>${sync.detail ? `<details class="backup-location"><summary>${copy('connectionReason')}</summary><code>${esc(sync.detail)}</code></details>` : ''}`, copy('syncNow'));
}
async function refreshShelf(sync = false) {
  if (refreshing || busy || opening || dragging.length || folderDrag) return;
  refreshing=true;
  const submit = sync && detail.querySelector('#sync-form button[type="submit"]');
  if (submit) { submit.disabled=true; submit.textContent=t('syncing'); }
  try {
    const next = await call(sync ? 'sync_chats' : 'get_shelf');
    // 后台刷新不拆掉正在拖动的卡片、编辑表单、展开页、菜单或多选操作。
    if (busy || opening || dragging.length || folderDrag || (!sync && (detail.open || selected.size || document.querySelector('.name-input,.utility-menu[open]')))) return;
    const changed = next.revision !== data.revision;
    data = next;
    if (changed) render(); else renderSync();
    if (sync) {
      if (next.sync?.state === 'error') { syncDetails(); return; }
      if (detail.querySelector('#sync-form')) detail.close();
      toast(next.sync?.state === 'partial' ? syncExplanation(next.sync) : next.sync?.added ? t('collected',{count:next.sync.added}) : t('syncedDone'));
    }
  } catch (error) { if (sync) toast(error.message,false,true); }
  finally { refreshing=false; if (submit) {submit.disabled=false;submit.innerHTML=copy('syncNow');} if (languagePending) updateLanguage(); }
}
function beginRename(element) {
  if (!element) return;
  const isProject = element.dataset.rename === 'project', object = isProject ? projectOf(element.dataset.project) : boxOf(element.dataset.box);
  if (!object || busy) return;
  const input = document.createElement('input'); input.className = 'name-input' + (element.classList.contains('case-label') ? ' on-case' : ''); input.value = object.name; input.maxLength = 40; input.setAttribute('aria-label', isProject ? t('projectName') : t('folderName'));
  let cancelled = false, done = false;
  // Enter / Esc 直接收尾，失焦（点到别处）也收尾；只执行一次。
  const finish = async () => {
    if (done) return; done = true;
    if (!cancelled && !input.value.trim()) { toast(t('emptyName'), false, true); done = false; input.focus(); return; }
    focusNext = () => document.querySelector(`[data-rename="${isProject ? 'project' : 'folder'}"][data-${isProject ? 'project' : 'box'}="${CSS.escape(object.id)}"]`);
    if (!cancelled && input.value.trim() !== object.name) { if (!await action(isProject ? 'rename_project' : 'rename_category', {id:object.id, name:input.value}, t('nameSaved'))) { focusNext = null; done = false; input.focus(); } }
    else render();
  };
  input.addEventListener('keydown', event => { if (!event.isComposing && ['Enter','Escape'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); cancelled = event.key === 'Escape'; finish(); } });
  input.addEventListener('blur', finish);
  element.replaceWith(input); input.focus(); input.select();
}
async function importFile(file) {
  if (!file || !data) return;
  try {
    if (file.size > 128 * 1024 * 1024) throw new Error(t('fileTooLarge'));
    toast(t('readingFile',{name:file.name}));
    const input = JSON.parse(await file.text()), rows = Array.isArray(input) ? input : input.chats;
    if (!Array.isArray(rows) || rows.length > 5000) throw new Error(t('indexTooLarge'));
    // 只在浏览器里提取标题、时间和最后一段，完整正文不发给本机服务。
    const chats = rows.map(r => ({id:r?.id, title:r?.title, source:r?.source ?? 'chatgpt', hostId:r?.hostId, updatedAt:r?.updatedAt ?? r?.update_time, category:r?.category, favorite:r?.favorite, project:r?.project, status:r?.status, trashPreviousStatus:r?.trashPreviousStatus, ...(r?.lastMessagePreview !== undefined || r?.lastMessageImage !== undefined || r?.mapping !== undefined ? lastMessageContent(r) : {})}));
    const before = new Set(data.chats.map(c => c.key));
    const added = chats.filter(c => !before.has((c.source ?? 'chatgpt') + ':' + c.id)).length;
    pulse = {box:'inbox'};
    if (await action('import_chats', {chats, ...(input.boxes === undefined ? {} : {boxes:input.boxes}), ...(input.projects === undefined ? {} : {projects:input.projects})}, t('imported',{count:chats.length,added:added ? t('importedNew',{count:added}) : ''}))) {
      if (detail.open) detail.close();
      if (view !== 'home') home();
    }
  } catch (error) { toast(error instanceof SyntaxError ? t('invalidJSON') : error.message, false, true); }
}

detail.addEventListener('click', event => { if (event.target !== detail) return; const r = detail.querySelector('.sheet')?.getBoundingClientRect(); if (!r || event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) closeSheet(); });
detail.addEventListener('cancel', event => { event.preventDefault(); closeSheet(); });
// 浏览器关闭 dialog 时会把焦点还给打开前的元素，延后一拍再把焦点放回刚看过的卡片。
detail.addEventListener('close', () => { if (languagePending) updateLanguage(); delete detail.dataset.closing; detail.classList.remove('closing'); if (detail.contains(toastEl)) document.body.append(toastEl); });
detail.addEventListener('close', () => setTimeout(() => { if (!detail.open && document.activeElement !== search && detail.dataset.chatKey) (board.querySelector(`.leaf-title [data-key="${CSS.escape(detail.dataset.chatKey)}"]`) ?? heading.querySelector('.resume-title') ?? heading.querySelector('.back'))?.focus({preventScroll:true}); }));
document.addEventListener('click', async event => {
  if (folderDrag?.active || (folderClickBlocked && event.detail && event.target.closest('.case'))) { event.preventDefault(); return; }
  document.querySelectorAll('.utility-menu[open]').forEach(menu => { if (!menu.contains(event.target)) menu.open = false; });
  // 双击文件夹时第二下会落在刚打开的内页上，忽略这一下，避免误开卡片。
  if (event.detail > 1 && performance.now() - navAt < 450) return;
  if (event.target.closest('.name-input')) return;
  const toggle = event.target.closest('[data-source],[data-sort]');
  if (toggle) {
    const attr = toggle.dataset.source ? 'source' : 'sort', value = toggle.dataset[attr];
    if (attr === 'source') source = value; else sortOrder = value;
    page = 0; selected.clear(); enter = 'up'; focusNext = () => heading.querySelector(`[data-${attr}="${value}"]`); render(); return;
  }
  const button = event.target.closest('[data-action]');
  if (!button) {
    const box = event.target.closest('.case'), card = event.target.closest('.leaf');
    if (box) go('box:' + box.dataset.box, 'case');
    else if (card && !dragging.length && !event.target.closest('input,label,details,button,a,select')) peek(card.dataset.key, card);
    return;
  }
  if (!button.closest('.filter-menu')) document.querySelectorAll('.utility-menu').forEach(m => m.open = false);
  const key = button.dataset.key;
  switch (button.dataset.action) {
    case 'previous-page': turn(-1); break;
    case 'next-page': turn(1); break;
    case 'home': case 'recent': case 'favorites': case 'archived': case 'trash':
      if (key && button.dataset.action === 'trash') { await setStatus('trash', [key]); break; }
      if (button.dataset.action === 'home') home(); else { search.value = ''; go(button.dataset.action); } break;
    case 'back': back(); break;
    case 'box': search.value = ''; go('box:' + button.dataset.box, button.closest('.case') ? 'case' : null); break;
    case 'project': if (button.classList.contains('spine')) openSpine('project:' + button.dataset.project); else { search.value = ''; go('project:' + button.dataset.project); } break;
    case 'loose': openSpine('loose:' + button.dataset.loose); break;
    case 'add-category': addCategory(); break;
    case 'folder-color': colorCategory(button.dataset.box); break;
    case 'add-project': addProject(); break;
    case 'rename': beginRename(heading.querySelector('.heading-name[data-rename]')); break;
    case 'delete-project': { const project = currentProject(); if (project && await action('delete_project', {id:project.id}, t('projectDeleted'))) { view = 'box:' + project.category; render(); } break; }
    case 'delete-category': if (await action('delete_category', {id:button.dataset.box}, t('folderDeleted'))) back(); break;
    case 'peek': if (!dragging.length) peek(key, button.closest('.leaf') ?? button); break;
    case 'peek-step': peekStep(Number(button.dataset.step)); break;
    case 'open': await openChat(key); break;
    case 'find-chat': { const chat = data.chats.find(c=>c.key === key); if (chat) findChat(chat); break; }
    case 'return-chat': peek(key); break;
    case 'favorite': { const was = data.chats.find(c => c.key === key)?.favorite; await action('favorite_chat', {key}, was ? t('unfavorited') : t('favorited')); break; }
    case 'archive': case 'restore': await setStatus(button.dataset.action, [key]); break;
    case 'undo': await action('undo_shelf', {}, t('undone')); break;
    case 'refresh': await refreshShelf(true); break;
    case 'sync-details': syncDetails(); break;
    case 'import': $('import-file').click(); break;
    case 'export': await action('export_backup', {}, t('backedUp')); break;
    case 'clear-search': search.value = ''; page = 0; enter = 'up'; render(); search.focus(); break;
    case 'cancel-selection': selected.clear(); render(); break;
    case 'select-all': filtered().forEach(c => selected.add(c.key)); render(); break;
    case 'close-dialog': closeSheet(); break;
    case 'about': about(); break;
  }
});
document.addEventListener('change', async event => {
  const element = event.target;
  if (element.id === 'group-dates') { groupDates = element.checked; page = 0; enter = 'up'; render(); return; }
  if (element.id === 'bulk-action' && element.value) {
    const choice = element.value; element.value = '';
    if (choice === 'new-project') addProject();
    else if (choice.startsWith('folder:')) await move([...selected], choice.slice(7));
    else if (choice.startsWith('project:')) await assignProject([...selected], choice.slice(8));
    else await setStatus(choice, [...selected]);
    return;
  }
  if (element.id === 'detail-destination') {
    const [kind, ...parts] = element.value.split(':'), destination = parts.join(':'), chat = data.chats.find(c => c.key === element.dataset.key);
    // 选的就是当前位置时什么也不做，不占用撤销步数。
    if ((kind === 'folder' && destination === chat?.category) || (kind === 'project' && destination === chat?.project)) { element.value = ''; return; }
    if (kind === 'folder') await move([element.dataset.key], destination);
    else if (kind === 'project') await assignProject([element.dataset.key], destination === 'none' ? null : destination);
    return;
  }
  if (element.dataset.select) { element.checked ? selected.add(element.dataset.select) : selected.delete(element.dataset.select); element.closest('.leaf').classList.toggle('selected', element.checked); renderSelection(); }
});
search.addEventListener('input', () => { page = 0; selected.clear(); enter = 'up'; render(); });
// ponytail: 按实际剩余高度分页，不裁切对话来消除滚动；尺寸没变就不重绘，避免打断入场动画。
new ResizeObserver(() => { if (data && !folderDrag && board.clientWidth + 'x' + board.clientHeight !== boardSize) render(); }).observe(board);
$('import-file').addEventListener('change', async event => { await importFile(event.target.files[0]); event.target.value = ''; });
let fileDepth = 0;
// 从卡片图片上拖动时浏览器也会带上 Files，正在拖卡片时不当作导入。
const carriesFile = event => !dragging.length && !folderDrag && [...(event.dataTransfer?.types ?? [])].includes('Files');
window.addEventListener('dragenter', event => { if (carriesFile(event)) { fileDepth++; $('drop-veil').hidden = false; } });
window.addEventListener('dragleave', event => { if (carriesFile(event) && --fileDepth <= 0) { fileDepth = 0; $('drop-veil').hidden = true; } });
window.addEventListener('dragover', event => { if (carriesFile(event)) event.preventDefault(); });
window.addEventListener('drop', event => { if (!carriesFile(event)) return; event.preventDefault(); fileDepth = 0; $('drop-veil').hidden = true; importFile(event.dataTransfer.files[0]); });

// 文件夹用指针拖动，鼠标与触屏共用；只预排画面，松手后沿用本机保存和撤销。
function folderOrder(ids, id, target) {
  const order = [...ids], from = order.indexOf(id), to = order.indexOf(target);
  if (from < 0 || to < 0 || from === to) return order;
  order.splice(from, 1); order.splice(to, 0, id);
  return order;
}
async function saveFolderOrder(ids, id) {
  if (ids.every((value,index) => value === data.boxes[index]?.id)) { render(); return; }
  focusNext = () => board.querySelector(`.case-label[data-box="${CSS.escape(id)}"]`);
  if (!await action('reorder_categories', {ids}, t('folderOrderSaved'))) { focusNext = null; render(); }
}
function finishFolderDrag(cancel = false) {
  if (!folderDrag) return;
  const drag = folderDrag; folderDrag = null; clearTimeout(folderPageTimer);
  drag.ghost?.remove(); document.body.classList.remove('sorting-folders');
  if (board.hasPointerCapture(drag.pointerId)) board.releasePointerCapture(drag.pointerId);
  if (drag.active) {
    folderClickBlocked = true;
    if (cancel) { page = drag.page; focusNext = () => board.querySelector(`.case-label[data-box="${CSS.escape(drag.id)}"]`); render(); } else void saveFolderOrder(drag.order, drag.id);
  }
  if (languagePending) updateLanguage();
}
document.addEventListener('pointerdown', event => {
  if (!folderDrag) folderClickBlocked = false;
  const card = event.target.closest?.('.case');
  if (!card || event.button !== 0 || busy || opening || detail.open || folderDrag || dragging.length || event.target.closest('.case-color,.name-input')) return;
  folderDrag = {id:card.dataset.box, pointerId:event.pointerId, x:event.clientX, y:event.clientY, order:data.boxes.map(box => box.id), page, card, active:false};
});
document.addEventListener('pointermove', event => {
  const drag = folderDrag; if (!drag || event.pointerId !== drag.pointerId) return;
  if (!drag.active) {
    if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 7) return;
    drag.active = true; board.setPointerCapture(drag.pointerId);
    const rect = drag.card.getBoundingClientRect();
    drag.ghost = drag.card.cloneNode(true); drag.ghost.classList.add('folder-ghost'); drag.ghost.setAttribute('aria-hidden','true');
    Object.assign(drag.ghost.style, {width:rect.width + 'px',height:rect.height + 'px',left:rect.left + 'px',top:rect.top + 'px'});
    document.body.append(drag.ghost); drag.card.classList.add('folder-dragging'); document.body.classList.add('sorting-folders');
  }
  event.preventDefault(); drag.ghost.style.transform = `translate(${event.clientX - drag.x}px, ${event.clientY - drag.y}px)`;
  const hit = document.elementFromPoint(event.clientX, event.clientY), turner = hit?.closest('.page-turn');
  const step = turner && !turner.disabled ? (turner.dataset.action === 'next-page' ? 1 : -1) : 0;
  if (step !== drag.turn) {
    clearTimeout(folderPageTimer); drag.turn = step;
    if (step) folderPageTimer = setTimeout(() => { if (folderDrag !== drag) return; page = Math.max(0, Math.min(pageCount - 1, page + step)); enter = ''; render(); drag.turn = 0; }, 600);
  }
  const target = hit?.closest('.case'), card = board.querySelector(`.case[data-box="${CSS.escape(drag.id)}"]`);
  if (!target || target === card || !board.contains(target)) return;
  const cards = [...board.querySelectorAll('.case')], positions = cards.map(el => el.getBoundingClientRect());
  const after = drag.order.indexOf(drag.id) < drag.order.indexOf(target.dataset.box);
  drag.order = folderOrder(drag.order, drag.id, target.dataset.box);
  if (!card) { render(); return; }
  target.parentNode.insertBefore(card, after ? target.nextSibling : target);
  if (motion.matches) cards.forEach((el,index) => { const rect = el.getBoundingClientRect(), dx = positions[index].left - rect.left, dy = positions[index].top - rect.top; if (el !== card && (dx || dy)) el.animate([{transform:`translate(${dx}px, ${dy}px)`},{transform:'translate(0, 0)'}], {duration:180,easing:'ease-out'}); });
});
document.addEventListener('pointerup', event => { if (event.pointerId === folderDrag?.pointerId) finishFolderDrag(folderDrag.active && !board.contains(document.elementFromPoint(event.clientX, event.clientY))); });
document.addEventListener('pointercancel', event => { if (event.pointerId === folderDrag?.pointerId) finishFolderDrag(true); });
board.addEventListener('lostpointercapture', () => finishFolderDrag(true));
document.addEventListener('dragstart', event => {
  if (event.target.closest?.('.case')) { event.preventDefault(); return; }
  const card = event.target.closest?.('.leaf'); if (!card || card.draggable === false) return;
  if (busy) { event.preventDefault(); return; }
  dragging = selected.has(card.dataset.key) ? [...selected] : [card.dataset.key]; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-chat-shelf', JSON.stringify(dragging)); card.classList.add('dragging');
  document.body.classList.add('carrying');
});
const dropTarget = event => event.target.closest?.('.spine[data-project],.spine[data-loose],.case[data-box],.trash-dock');
document.addEventListener('dragover', event => { const target = dropTarget(event); if (!target || !dragging.length) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; document.querySelectorAll('.is-target').forEach(el => { if (el !== target) el.classList.remove('is-target'); }); target.classList.add('is-target'); });
document.addEventListener('dragleave', event => { const target = dropTarget(event); if (target && !target.contains(event.relatedTarget)) target.classList.remove('is-target'); });
function clearDrag() { dragging = []; document.body.classList.remove('carrying'); document.querySelectorAll('.is-target,.dragging').forEach(el => el.classList.remove('is-target', 'dragging')); }
document.addEventListener('drop', async event => {
  const target = dropTarget(event); if (!target || !dragging.length) return; event.preventDefault();
  const keys = [...dragging]; clearDrag();
  if (target.matches('.trash-dock')) {
    const ok = await setStatus('trash', keys);
    if (ok && motion.matches) target.animate([{transform:'scale(.9)'},{transform:'scale(1.05)'},{transform:'scale(1)'}], {duration:320,easing:'ease-out'});
  }
  else if (target.dataset.project) await assignProject(keys, target.dataset.project);
  else if (target.dataset.loose) await assignProject(keys, null);
  else await move(keys, target.dataset.box);
});
document.addEventListener('dragend', () => { clearDrag(); if (languagePending) updateLanguage(); });
document.addEventListener('keydown', async event => {
  if (folderDrag?.active) { if (event.key === 'Escape') { event.preventDefault(); finishFolderDrag(true); } return; }
  const typing = event.target.matches?.('input,textarea,select') ?? false;
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); if (detail.open) detail.close(); search.focus(); search.select(); return; }
  if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'z' && !event.target.matches?.('input,textarea') && data?.canUndo) { event.preventDefault(); await action('undo_shelf', {}, t('undone')); return; }
  if (detail.open) { if (!typing && detail.dataset.chatKey && ['ArrowLeft','ArrowRight'].includes(event.key)) { event.preventDefault(); peekStep(event.key === 'ArrowLeft' ? -1 : 1); } return; }
  const name = event.target.closest?.('[data-rename]');
  if (name?.classList.contains('case-label') && event.altKey && ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) {
    event.preventDefault(); if (busy) return;
    const list = visibleBoxes(), index = list.findIndex(box => box.id === name.dataset.box), columns = Number(board.style.getPropertyValue('--folder-columns')) || 1;
    const step = {ArrowLeft:-1,ArrowRight:1,ArrowUp:-columns,ArrowDown:columns}[event.key], target = list[index + step];
    if (target) { const capacity = folderLayout(board.clientWidth, board.clientHeight, list.length).capacity; page = Math.floor((index + step) / capacity); await saveFolderOrder(folderOrder(data.boxes.map(box => box.id), name.dataset.box, target.id), name.dataset.box); }
    return;
  }
  if (name && (event.key === 'F2' || (event.key === 'Enter' && name.classList.contains('heading-name')))) { event.preventDefault(); beginRename(name); return; }
  if (event.key === '/' && !typing) { event.preventDefault(); search.focus(); return; }
  if (event.key === 'Escape') {
    if (event.target === search && search.value) { search.value = ''; enter = 'up'; render(); return; }
    if (typing) { event.target.blur(); return; }
    if (document.querySelector('.utility-menu[open]')) { document.querySelectorAll('.utility-menu[open]').forEach(m => m.open = false); return; }
    if (selected.size) { selected.clear(); render(); return; }
    if (query()) { search.value = ''; page = 0; enter = 'up'; render(); search.focus(); return; }
    if (view !== 'home') back();
    return;
  }
  if (!typing && ['ArrowLeft','ArrowRight'].includes(event.key) && !event.target.closest('.shelf,select,details')) { event.preventDefault(); turn(event.key === 'ArrowLeft' ? -1 : 1); }
});
document.addEventListener('dblclick', event => { const name = event.target.closest('.heading-name[data-rename]'); if (name) { event.preventDefault(); beginRename(name); } });
document.addEventListener('submit', async event => {
  if (event.target.id === 'open-chat-form') { event.preventDefault(); await openChat(new FormData(event.target).get('key')); return; }
  if (event.target.id === 'sync-form') { event.preventDefault(); await refreshShelf(true); return; }
  if (event.target.id === 'find-chat-form') {
    event.preventDefault();
    const input = event.target.querySelector('input');
    try { await navigator.clipboard.writeText(input.value); toast(t('copied')); }
    catch { input.focus(); input.select(); toast(t('copyFailed'), false, true); }
    return;
  }
  if (event.target.id === 'color-form') {
    event.preventDefault();
    const form = new FormData(event.target), id = form.get('category');
    if (await action('set_category_color', {id, color:form.get('color')}, t('colorSaved'))) {
      detail.close();
      (board.querySelector(`.case-color[data-box="${CSS.escape(id)}"]`) ?? heading.querySelector('.heading-name'))?.focus({preventScroll:true});
    }
    return;
  }
  if (!['category-form','project-form'].includes(event.target.id)) return; event.preventDefault();
  const form = new FormData(event.target), isProject = event.target.id === 'project-form', before = new Set((isProject ? projects() : visibleBoxes()).map(p => p.id)), keys = [...selected];
  if (await action(isProject ? 'add_project' : 'add_category', isProject ? {name:form.get('name'), category:form.get('category'), keys} : {name:form.get('name')}, isProject ? t('projectCreated') : t('folderCreated'))) {
    detail.close();
    if (isProject) { const added = projects().find(p => !before.has(p.id)); if (added) { search.value = ''; navAt = performance.now(); view = 'project:' + added.id; page = 0; enter = 'page'; pulse = {project:added.id}; focusNext = () => heading.querySelector('.heading-name'); render(); } }
    else { const added = visibleBoxes().find(b => !before.has(b.id)); if (added) board.querySelector(`.case-label[data-box="${CSS.escape(added.id)}"]`)?.focus({preventScroll:true}); }
  }
});
async function start() {
  try {
    if (embedded) { const init = await rpc('ui/initialize', {appInfo:{name:'chat-shelf', version:'0.9.6-beta.1'}, appCapabilities:{availableDisplayModes:['inline','fullscreen']}, protocolVersion:'2026-01-26'}); hostLocale = init.hostContext?.locale; updateLanguage(); window.parent.postMessage({jsonrpc:'2.0', method:'ui/notifications/initialized', params:{}}, '*'); if (init.hostContext?.availableDisplayModes?.includes('fullscreen') && init.hostContext.displayMode !== 'fullscreen') await rpc('ui/request-display-mode', {mode:'fullscreen'}); }
    data = await call('get_shelf'); enter = 'intro'; render();
    document.body.classList.add('ready');
  } catch (error) {
    board.setAttribute('aria-busy', 'false'); document.body.dataset.mode = 'error';
    board.innerHTML = empty(t('serviceUnavailable'), esc(error.message), `<button class="primary-button" data-action="retry">${copy('reconnect')}</button>`);
  }
}
document.addEventListener('click', event => { if (event.target.closest('[data-action="retry"]')) start(); });
updateLanguage();
start();
setInterval(()=>{if (data && !document.hidden) void refreshShelf();},15000);
document.addEventListener('visibilitychange',()=>{if (data && !document.hidden) void refreshShelf();});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext as runUI } from 'node:vm';
import { t, setLocale } from '../web/i18n.js';
setLocale('zh-CN');
const runInNewContext = (code, context) => { if (!Object.hasOwn(context,'folderDrag')) context.folderDrag = null; return runUI(code, Object.assign(context,{languagePending:false,t,copy:(key,vars) => t(key,vars)})); };
import { lastMessagePreview } from '../web/history.js';

const source = readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
// 执行真实事件处理函数，模拟其边界；不启动浏览器或读取用户数据。
const functionOf = (name,context) => runInNewContext('(' + source.match(new RegExp('(?:async )?function ' + name + '\\([^]*?\\n\\}'))[0] + ')',context);
const preview = functionOf('previewHTML',{lastMessagePreview,query:()=>'',esc:value=>value,highlight:value=>value});
assert.match(preview({lastMessageImage:null,lastMessagePreview:'末条图片附带的真实文字'}),/末条图片附带的真实文字/,'图片像素未同步时，已有文字应仍然可见');
assert.doesNotMatch(preview({lastMessageImage:null,lastMessagePreview:'末条图片附带的真实文字'}),/图片未同步/);
assert.match(preview({lastMessageImage:null,lastMessagePreview:''}),/图片未同步/,'仅有图片指针时保留明确占位说明');
const commands = [];
let focus = '';
const context = {
  detail:{open:true,dataset:{chatKey:'test'},close() { this.open = false; }},
  search:{focus() { focus = 'search'; },select() {}},
  data:{canUndo:true},
  action:async name => commands.push(name),
};
const keydown = runInNewContext('(' + source.match(/document\.addEventListener\('keydown', (async event => \{[\s\S]*?\n\})\);/)[1] + ')',context);
const key = (value,tag='button',shiftKey=false) => ({key:value,metaKey:['k','z'].includes(value),shiftKey,target:{matches:selector=>selector.split(',').includes(tag),closest:()=>null},preventDefault() {}});
await keydown(key('k'));
assert.equal(context.detail.open,false,'预览内搜索快捷键必须退出预览');
assert.equal(focus,'search');
context.detail.open = true;
await keydown(key('z'));
await keydown(key('z','select'));
assert.deepEqual(commands,['undo_shelf','undo_shelf'],'预览和整理下拉框中都能撤销');
await keydown(key('z','input'));
await keydown(key('z','button',true));
assert.equal(commands.length,2,'文字编辑与系统重做快捷键不能误撤销整理');
Object.assign(context,{document:{querySelector:()=>null},selected:new Set(),view:'home',page:2,render() {},query:()=>context.search.value});
context.detail.open = false; context.search.value = '匹配结果';
await keydown(key('Escape'));
assert.equal(context.search.value,'','关闭预览后，列表上的 Esc 必须能退出搜索');
assert.equal(context.page,0);

const selection = new Set(['first-page']);
const pages = {page:0,pageCount:3,selected:selection,document:{activeElement:null},board:{contains:()=>false},render() {}};
const turn = functionOf('turn',pages);
turn(1);
assert.equal(pages.page,1);
assert(selection.has('first-page'),'翻页必须保留已经选择的对话');
turn(-1); turn(-1);
assert.equal(pages.page,0);
assert.equal(selection.size,1);

let deadline;
const signal = {}, network = {embedded:false,AbortSignal:{timeout(ms) { deadline = ms; return signal; }},fetch:async (_url,options) => { assert.equal(options.signal,signal); throw new TypeError('Failed to fetch'); }};
await assert.rejects(functionOf('call',network)('get_shelf'),/连不上本机服务/);
assert(deadline > 0 && deadline <= 15000,'本机请求必须有超时上限');
network.fetch = async () => { throw new DOMException('Timed out','TimeoutError'); };
await assert.rejects(functionOf('call',network)('get_shelf'),/连接超时/);

let sheet = {}, closed = 0, timer;
const status = {detail:{open:true,dataset:{chatKey:'test'},querySelector:()=>sheet},action:async()=>true,stamp() {},closeSheet() { closed++; },setTimeout(callback) { timer = callback; }};
const setStatus = functionOf('setStatus',status);
assert.equal(await setStatus('trash',['test']),true,'拖入垃圾桶必须能取得成功结果');
closed = 0;
await setStatus('archive',['test']);
sheet = {};
timer();
assert.equal(closed,0,'撤销重绘后，归档的旧定时器不能再关闭预览');
await setStatus('archive',['test']);
timer();
assert.equal(closed,1,'没有后续操作时，归档预览应正常合上');
let finishAnimation, fallback;
sheet = {animate:()=>({finished:new Promise(resolve=>{finishAnimation=resolve;})})};
const closing = {detail:{open:true,dataset:{chatKey:'test'},querySelector:()=>sheet,classList:{add() {},remove() {}},close() { closed++; }},board:{querySelector:()=>null},CSS:{escape:value=>value},motion:{matches:true},sheetFrames:()=>[],setTimeout(callback) { fallback=callback; }};
functionOf('closeSheet',closing)();
sheet = {};
finishAnimation();
await Promise.resolve();
fallback();
assert.equal(closed,1,'旧关闭动画不能合上后来打开的另一张预览');
let renameRenders = 0, renameAttempts = 0;
const edit = {value:'',listeners:{},setAttribute() {},addEventListener(name,listener) { this.listeners[name]=listener; },focus() {},select() {}};
const rename = {busy:false,boxOf:()=>({id:'folder',name:'原名称'}),document:{createElement:()=>edit,querySelector:()=>null},CSS:{escape:value=>value},toast() {},render() { renameRenders++; },action:async()=>{ renameAttempts++; return false; }};
functionOf('beginRename',rename)({dataset:{rename:'folder',box:'folder'},classList:{contains:()=>false},replaceWith() {}});
edit.value = '重名';
await edit.listeners.blur();
assert.equal(renameRenders,0,'改名失败必须保留输入框与用户已经输入的名称');
assert.equal(edit.value,'重名');
edit.value = '重试名称';
await edit.listeners.blur();
assert.equal(renameAttempts,2,'改名失败后必须能继续修改并重试');
edit.listeners.keydown({key:'Escape',preventDefault() {},stopPropagation() {}});
assert.equal(renameRenders,1,'Esc 必须能取消失败后的编辑');
assert.equal(typeof rename.focusNext,'function','编辑结束必须恢复到名称按钮');
let notices = [], opened = [], failureView;
const chat = {id:'11111111-2222-8333-8444-555555555555',key:'test',source:'chatgpt',title:'原对话',href:'codex://threads/11111111-2222-8333-8444-555555555555'};
const resume = {data:{chats:[chat]},opening:false,document:{querySelectorAll:()=>[]},detail:{querySelector:()=>null},call:async(name,args)=>{opened.push({name,args});return {ok:true};},showOpenFailure(value,result){failureView={chat:value,result};},toast:message=>notices.push(message)};
const openChat = functionOf('openChat',resume);
await openChat('test');
chat.source = 'codex';
await openChat('test');
assert.equal(opened.length,2);
assert(opened.every(o=>o.name==='open_chat' && o.args.key==='test'),'ChatGPT 和 Codex 都通过客户端定位，不能拼接链接');
resume.call = async()=>({ok:true,delivery:'dispatched'});
await openChat('test');
assert.equal(notices.at(-1),'已交给客户端打开','交给系统后不宣称原对话已加载');
resume.call = async()=>({ok:false,reason:'原对话记录不可访问',code:'chat_unavailable'});
await openChat('test');
assert.equal(failureView.result.reason,'原对话记录不可访问','客户端失败必须保留具体原因');
resume.call = async()=>{throw new Error('连接超时');};
await openChat('test');
assert.equal(failureView.result.reason,'连接超时');
assert.equal(resume.opening,false,'失败后不能锁住重试');
resume.opening=true;
await openChat('test');
assert.equal(resume.opening,true,'重复点击不能发起第二次打开');
const imported = [];
const importFile = functionOf('importFile',{data:{chats:[]},pulse:null,toast() {},action:async(name,args)=>{ imported.push({name,args}); return false; }});
const remoteChat = {id:chat.id,source:'codex',title:'远程对话',hostId:'remote-host'};
for (const backup of [{chats:[remoteChat]},[remoteChat]]) {
  await importFile({name:'backup.json',size:100,text:async()=>JSON.stringify(backup)});
}
assert.equal(imported.length,2,'文件导入必须同时支持备份对象和对话数组');
assert(imported.every(call=>call.name==='import_chats' && call.args.chats[0].hostId==='remote-host'),'首次导入远程对话必须保留来源主机，避免继续对话时误定位本机');
const input = {value:'原对话',focus() { this.focused=true; },select() { this.selected=true; }};
let copied, prevented = 0;
const copying = {navigator:{clipboard:{writeText:async text=>{ copied=text; }}},toast:message=>notices.push(message)};
const submit = runInNewContext('(' + source.match(/document\.addEventListener\('submit', (async event => \{[\s\S]*?\n\})\);/)[1] + ')',copying);
const lookupEvent = {target:{id:'find-chat-form',querySelector:()=>input},preventDefault() { prevented++; }};
await submit(lookupEvent);
assert.equal(copied,input.value,'客户端查找只复制原名称，不发送导航或改写索引');
assert.equal(prevented,1);
copying.navigator.clipboard.writeText = async()=>{ throw new Error('剪贴板不可用'); };
await submit(lookupEvent);
assert(input.focused && input.selected,'剪贴板被拒绝时选中名称供手动复制');
assert.match(notices.at(-1),/⌘C 或 Ctrl\+C/);
// 复用页面真实的拖放处理，覆盖整张卡片、多选、取消和原有收纳路径。
const classList = () => {
  const values = new Set();
  return {add(...items) { items.forEach(item=>values.add(item)); },remove(...items) { items.forEach(item=>values.delete(item)); },contains:item=>values.has(item)};
};
const handlers = {}, dragged = {dataset:{key:'one'},draggable:true,classList:classList()}, bucket = {dataset:{},classList:classList(),matches:selector=>selector==='.trash-dock',contains:target=>target===bucket};
let dropResult = true, pulses = 0;
bucket.animate = () => { pulses++; };
const drops = [], drag = {
  dragging:[],selected:new Set(['one','two']),busy:false,motion:{matches:true},
  document:{body:{classList:classList()},addEventListener(name,handler) { handlers[name]=handler; },querySelectorAll(selector) { return [dragged,bucket].filter(element=>selector.split(',').some(value=>element.classList.contains(value.slice(1)))); }},
  setStatus:async(kind,keys)=>{ assert.equal(drag.dragging.length,0,'发起整理前必须清掉拖动状态'); drops.push({kind,keys:Array.from(keys)}); return dropResult; },
  assignProject:async(keys,project)=>drops.push({kind:'project',keys:Array.from(keys),project}),
  move:async(keys,category)=>drops.push({kind:'folder',keys:Array.from(keys),category}),
};
runInNewContext(source.slice(source.indexOf("document.addEventListener('dragstart'"),source.indexOf("document.addEventListener('keydown'")),drag);
const dragEvent = target => ({target:{closest:selector=>selector.includes('.trash-dock') ? target : selector==='.leaf' ? dragged : null},dataTransfer:{effectAllowed:'',dropEffect:'',setData(type,value) { this.type=type; this.value=value; }},preventDefault() { this.prevented=true; }});
let event = dragEvent(bucket);
handlers.dragstart(event);
assert.deepEqual(JSON.parse(event.dataTransfer.value),['one','two'],'拖动选中的卡片时必须包含全部已选项');
handlers.dragover(event);
assert(bucket.classList.contains('is-target') && event.prevented,'垃圾桶必须是有效的放入目标');
handlers.dragleave({...event,relatedTarget:bucket});
assert(bucket.classList.contains('is-target'),'经过桶内图标或文字时不能闪掉高亮');
await handlers.drop(event);
assert.deepEqual(drops.at(-1),{kind:'trash',keys:['one','two']});
assert.equal(pulses,1);
assert(!drag.document.body.classList.contains('carrying') && !bucket.classList.contains('is-target') && !dragged.classList.contains('dragging'));
await handlers.drop(event);
assert.equal(drops.length,1,'同一次拖动不能重复放入');
drag.selected = new Set(['two']);
handlers.dragstart(event);
assert.deepEqual(JSON.parse(event.dataTransfer.value),['one'],'拖动未选中的卡片只能移动它自身');
handlers.dragend();
await handlers.drop(event);
assert.equal(drops.length,1,'取消拖动不能修改对话');
await handlers.drop(dragEvent(bucket));
assert.equal(drops.length,1,'外部文件和文字不能当成对话丢进垃圾桶');
drag.busy = true;
event = dragEvent(bucket); handlers.dragstart(event);
assert(event.prevented && drag.dragging.length===0,'保存期间不能发起新的拖动');
drag.busy = false;
dropResult = false;
handlers.dragstart(event); await handlers.drop(event);
assert.equal(pulses,1,'放入失败不能播放成功反馈');
dropResult = true; drag.motion.matches = false;
handlers.dragstart(event); await handlers.drop(event);
assert.equal(pulses,1,'减少动态效果时不播放放入动画');
const projectTarget = {dataset:{project:'project'},classList:classList(),matches:()=>false};
handlers.dragstart(event); await handlers.drop(dragEvent(projectTarget));
assert.deepEqual(drops.at(-1),{kind:'project',keys:['one'],project:'project'});
const folderTarget = {dataset:{box:'folder'},classList:classList(),matches:()=>false};
handlers.dragstart(event); await handlers.drop(dragEvent(folderTarget));
assert.deepEqual(drops.at(-1),{kind:'folder',keys:['one'],category:'folder'},'原有项目和文件夹收纳不能受影响');
let reads = 0, repaint = 0, finishRead;
const refresh = {refreshing:false,busy:false,opening:false,dragging:['one'],selected:new Set(),data:{revision:0},detail:{open:false},document:{querySelector:()=>null},call:async()=>{ reads++; return {revision:1}; },render() { repaint++; },renderSync() {}};
const refreshShelf = functionOf('refreshShelf',refresh);
await refreshShelf();
assert.equal(reads,0,'拖动期间不能发起后台刷新');
refresh.dragging = [];
refresh.call = () => new Promise(resolve=>{ finishRead=resolve; });
const reading = refreshShelf();
refresh.dragging = ['one'];
finishRead({revision:1}); await reading;
assert.equal(refresh.data.revision,0,'请求在拖动开始后返回，也不能拆掉当前卡片');
assert.equal(refresh.refreshing,false);
refresh.dragging = [];
refresh.call = async()=>({revision:1});
await refreshShelf();
assert.equal(repaint,1,'拖动结束后必须恢复正常刷新');
refresh.folderDrag = {active:true};
await refreshShelf();
assert.equal(repaint,1,'文件夹排序期间也不能拆掉卡片');
refresh.folderDrag = null;

// 文件夹排序执行同一套真实指针处理：小幅移动、取消、保存失败及跨页，不写用户数据。
const folderHandlers = {}, saves = [], captures = new Set();
let folderCards = [], hit, folderSaveOK = true, pageTimer;
const makeFolder = id => ({dataset:{box:id},classList:classList(),style:{},setAttribute() {},remove() {},
  getBoundingClientRect() { return {left:folderCards.indexOf(this)*120,top:0,width:100,height:140}; },
  cloneNode() { return makeFolder(id); },
  closest(selector) { return selector === '.case' ? this : null; },
  parentNode:{insertBefore(card,before) { folderCards = folderCards.filter(el=>el!==card); folderCards.splice(before ? folderCards.indexOf(before) : folderCards.length,0,card); }},
  get nextSibling() { return folderCards[folderCards.indexOf(this)+1] ?? null; },
});
const folders = {folderDrag:null,folderClickBlocked:false,folderPageTimer:null,languagePending:false,busy:false,opening:false,dragging:[],page:0,pageCount:2,enter:'',motion:{matches:false},detail:{open:false},CSS:{escape:value=>value},
  data:{boxes:['work','life','hidden','inbox'].map(id=>({id}))},
  board:{querySelector:selector=>folderCards.find(card=>selector.includes('"'+card.dataset.box+'"')),querySelectorAll:()=>folderCards,contains:el=>folderCards.includes(el),
    setPointerCapture:id=>captures.add(id),hasPointerCapture:id=>captures.has(id),releasePointerCapture:id=>captures.delete(id),addEventListener(name,handler) { folderHandlers[name]=handler; }},
  document:{body:{classList:classList(),append() {}},addEventListener(name,handler) { folderHandlers[name]=handler; },elementFromPoint:()=>hit},
  setTimeout(callback) { pageTimer=callback; return 1; },clearTimeout() { pageTimer=null; },
  render() { folderCards = Array.from(folders.folderDrag?.order ?? folders.data.boxes.map(box=>box.id)).filter(id=>id!=='hidden').map(makeFolder); },
  action:async(name,args)=>{ saves.push({name,ids:Array.from(args.ids)}); if (folderSaveOK) { folders.data.boxes=Array.from(args.ids,id=>({id})); folders.render(); } return folderSaveOK; },
};
folders.render();
runInNewContext(source.slice(source.indexOf('function folderOrder('),source.indexOf("document.addEventListener('dragstart'")),folders);
const pointer = (target,x=0,y=0) => ({target,button:0,pointerId:1,clientX:x,clientY:y,preventDefault() { this.prevented=true; }});
folderHandlers.pointerdown(pointer(folderCards[0]));
folderHandlers.pointermove(pointer(folderCards[0],3));
assert(!folders.folderDrag.active,'轻点和抖动不能开始排序');
folderHandlers.pointerup(pointer(folderCards[0],3));
assert.equal(saves.length,0);
const startFolderMove = () => { folderHandlers.pointerdown(pointer(folderCards[0])); hit=folderCards[1]; folderHandlers.pointermove(pointer(folderCards[0],125)); };
startFolderMove();
assert.deepEqual(folderCards.map(card=>card.dataset.box),['life','work','inbox'],'拖动时其他文件夹必须即时让位');
assert.equal(folders.data.boxes[0].id,'work','松手之前不能写入保存数据');
folderHandlers.pointerup(pointer(hit,125)); await Promise.resolve();
assert.deepEqual(saves.at(-1),{name:'reorder_categories',ids:['life','work','hidden','inbox']},'隐藏的旧文件夹也要完整保留');
assert.equal(folders.folderDrag,null);
assert.equal(captures.size,0);
assert(folders.folderClickBlocked,'松手后的点击不能误打开文件夹');
const beforeCancel = folders.data.boxes.map(box=>box.id);
startFolderMove(); assert(!folders.folderClickBlocked,'下一次主动点击或拖动不能被强制延迟'); folderHandlers.pointercancel(pointer(hit));
assert.deepEqual(folders.data.boxes.map(box=>box.id),beforeCancel);
assert.deepEqual(folderCards.map(card=>card.dataset.box),['life','work','inbox']);
startFolderMove(); hit=null; folderHandlers.pointerup(pointer(folderCards[0],500));
assert.equal(saves.length,1,'放在书架外必须取消，不能写入顺序');
folderSaveOK=false; startFolderMove(); folderHandlers.pointerup(pointer(hit,125));
await new Promise(resolve => setImmediate(resolve));
assert.deepEqual(folders.data.boxes.map(box=>box.id),beforeCancel);
assert.deepEqual(folderCards.map(card=>card.dataset.box),['life','work','inbox'],'保存失败必须还原原顺序');
startFolderMove(); hit={disabled:false,dataset:{action:'next-page'},closest:selector=>selector==='.page-turn' ? hit : null};
folderHandlers.pointermove(pointer(folderCards[0],600));
assert.equal(folders.page,0); pageTimer();
assert.equal(folders.page,1,'拖到翻页按钮停留后应自动翻页');
folderHandlers.pointercancel(pointer(hit));
assert.equal(folders.page,0,'取消跨页拖动应回到原页');
folders.busy=true; folderHandlers.pointerdown(pointer(folderCards[0]));
assert.equal(folders.folderDrag,null,'保存中不能开始第二次文件夹拖动');
console.log('PASS: 文件夹拖动即时排序、轻点不误拖、隐藏项保留、取消与书架外放开、保存失败回退、跨页拖动、后台刷新保护');
console.log('PASS: 预览搜索撤销、Esc 返回、跨页多选、连接错误超时、快速撤销与关闭、改名失败重试、双来源客户端定位、失败原因与重试、复制失败恢复、单篇与多选拖入垃圾桶、取消拖动与失败反馈、原有拖放收纳、后台刷新不打断拖动');

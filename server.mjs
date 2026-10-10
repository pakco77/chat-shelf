import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createStore } from './store.mjs';
import { createDesktopClient, hostIndex, failure, openNativeChat } from './client.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const dataRoot = process.env.CHAT_SHELF_DATA ?? process.env.PLUGIN_DATA ?? join(homedir(), 'Library/Application Support/ChatShelf');
const store = createStore(join(dataRoot, 'state.json'), join(root, 'snapshot.json'));
const desktop = createDesktopClient(join(dataRoot,'client-session.json'));
let syncJob = null;
const previewTimes = new Map();
let syncStatus = {state:'waiting',intervalSeconds:30,lastSuccessAt:null,added:0,reason:'请在客户端中打开一次对话集，连接后自动同步。'};
const snapshot = () => ({...store.snapshot(),sync:{...syncStatus,connected:desktop.connected()}});
async function syncChats() {
  if (syncJob) return syncJob;
  syncJob = (async()=>{
    syncStatus = {...syncStatus,state:'syncing'};
    try {
      const signal = AbortSignal.timeout(12000), list = await desktop.list(signal), rows = hostIndex(list), before = new Set(store.snapshot().chats.map(c=>c.key));
      store.sync(rows);
      // ponytail: 每轮最多补 12 篇、并行读取 4 篇；缓存仅在本进程内，重启会重新核对，随后逐轮补齐较早的可见对话。
      const pending = rows.filter(chat=>previewTimes.get(chat.source + ':' + chat.id) !== chat.updatedAt).sort((a,b)=>b.updatedAt-a.updatedAt).slice(0,12);
      const previews = [], checked = [], errors = [];
      for (let at=0;at<pending.length;at+=4) {
        const batch = pending.slice(at,at+4), results = await Promise.allSettled(batch.map(chat=>desktop.preview(chat,signal)));
        results.forEach((result,index)=>{
          if (result.status === 'fulfilled') { checked.push(batch[index]); if (result.value) previews.push(result.value); }
          else errors.push(failure(result.reason));
        });
        if (signal.aborted) break;
      }
      if (previews.length) store.sync(previews);
      for (const chat of checked) previewTimes.set(chat.source + ':' + chat.id,chat.updatedAt);
      const partial = Boolean(list.unavailableHosts?.length || list.unavailableSources?.length || errors.length);
      syncStatus = {state:partial ? 'partial' : 'synced',intervalSeconds:30,lastSuccessAt:Date.now()/1000,added:rows.filter(c=>!before.has(c.source + ':' + c.id)).length,
        reason:errors.length ? '标题已同步，部分末段暂未读取：' + errors[0].reason : partial ? '部分客户端来源暂不可用，已同步能访问的对话；已有记录保留。' : '',visibleCount:rows.length,previewsUpdated:previews.length,
        ...(errors.length ? {code:errors[0].code,detail:errors[0].detail,retryable:errors[0].retryable} : {})};
    } catch (error) { syncStatus = {...syncStatus,state:'error',...failure(error)}; }
    return snapshot();
  })().finally(()=>{syncJob=null;});
  return syncJob;
}
const URI = 'ui://chat-shelf/main.html';
const icons = [{src:'data:image/svg+xml;base64,' + readFileSync(join(root,'assets/sidebar-icon.svg')).toString('base64'),mimeType:'image/svg+xml',sizes:['20x20']}];
const categoryId = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/);
const sourceId = z.enum(['chatgpt','codex']);
const folderColor = z.union([z.enum(['amber','sage','rose','lilac','blue','stone']),z.string().regex(/^#[0-9a-f]{6}$/i)]);
const inputBox = z.object({id:categoryId,source:sourceId.optional(),name:z.string().min(1).max(40),color:folderColor});
const inputProject = z.object({id:categoryId,name:z.string().min(1).max(40),category:categoryId});
const chatKeys = z.array(z.string().min(1).max(150)).min(1).max(5000);
const inputChat = z.object({
  id:categoryId,title:z.string().trim().min(1).max(1000),source:sourceId.optional(),hostId:categoryId.optional(),updatedAt:z.number().finite().optional(),
  category:categoryId.optional(),favorite:z.boolean().optional(),lastMessagePreview:z.string().max(180).optional(),lastMessageImage:z.string().max(700000).nullable().optional(),
  project:categoryId.nullable().optional(),status:z.enum(['active','archived','trashed']).optional(),
  trashPreviousStatus:z.enum(['active','archived']).optional(),
});
const operations = {
  get_shelf:{schema:z.object({}),run:snapshot,title:'查看对话集并保持客户端同步'},
  sync_chats:{schema:z.object({}),run:syncChats,title:'同步客户端对话'},
  open_chat:{schema:z.object({key:z.string().min(1).max(150)}),run:async args=>{
    const chat = store.snapshot().chats.find(chat=>chat.key === args.key);
    if (!chat) return {ok:false,code:'index_missing',reason:'这篇对话已不在索引中，请刷新后重试。',retryable:true};
    if (chat.id.startsWith('demo-')) return {ok:false,code:'demo_chat',reason:'这是示例对话，没有真实原文可打开。',retryable:false};
    // 隔离测试用 0 保留模拟宿主路径；正常 macOS 使用系统注册的 Codex 入口。
    if (process.env.CHAT_SHELF_NATIVE_OPEN !== '0') {
      const native = await openNativeChat(chat);
      if (native) return native;
    }
    return desktop.open(chat);
  },title:'在客户端继续原对话'},
  export_backup:{schema:z.object({}),run:() => store.backup(),title:'保存备份到本机'},
  move_chats:{schema:z.object({keys:chatKeys,category:categoryId,source:sourceId.optional()}),run:args => store.move(args.keys,args.category),title:'移动对话'},
  favorite_chat:{schema:z.object({key:z.string().min(1).max(150)}),run:args => store.favorite(args.key),title:'切换常用对话'},
  undo_shelf:{schema:z.object({}),run:() => store.undo(),title:'撤销整理操作'},
  add_category:{schema:z.object({source:sourceId.optional(),name:z.string().min(1).max(40)}),run:args => store.addCategory(args.name),title:'新增文件夹'},
  rename_category:{schema:z.object({source:sourceId.optional(),id:categoryId,name:z.string().min(1).max(40)}),run:args => store.renameCategory(args.id,args.name),title:'修改文件夹名称'},
  set_category_color:{schema:z.object({id:categoryId,color:folderColor}),run:args => store.setCategoryColor(args.id,args.color),title:'修改文件夹颜色'},
  reorder_categories:{schema:z.object({ids:z.array(categoryId).min(1).max(128)}),run:args => store.reorderCategories(args.ids),title:'调整文件夹顺序'},
  delete_category:{schema:z.object({source:sourceId.optional(),id:categoryId}),run:args => store.deleteCategory(args.id),title:'删除文件夹与所属项目，对话移回待收纳'},
  add_project:{schema:z.object({name:z.string().min(1).max(40),category:categoryId,keys:z.array(z.string().min(1).max(150)).max(5000).optional()}),run:args => store.addProject(args.name,args.category,args.keys),title:'新建本机项目'},
  rename_project:{schema:z.object({id:categoryId,name:z.string().min(1).max(40)}),run:args => store.renameProject(args.id,args.name),title:'修改本机项目名称'},
  delete_project:{schema:z.object({id:categoryId}),run:args => store.deleteProject(args.id),title:'删除本机项目，保留对话'},
  assign_project:{schema:z.object({keys:chatKeys,project:categoryId.nullable()}),run:args => store.assignProject(args.keys,args.project),title:'设置对话所属项目'},
  archive_chats:{schema:z.object({keys:chatKeys}),run:args => store.archive(args.keys),title:'归档本机索引中的对话'},
  trash_chats:{schema:z.object({keys:chatKeys}),run:args => store.trash(args.keys),title:'将对话索引移入回收站'},
  restore_chats:{schema:z.object({keys:chatKeys}),run:args => store.restore(args.keys),title:'恢复归档或回收站中的对话索引'},
  import_chats:{schema:z.object({version:z.union([z.literal(1),z.literal(2),z.literal(3)]).optional(),chats:z.array(inputChat).max(5000),boxes:z.array(inputBox).max(128).optional(),projects:z.array(inputProject).max(1000).optional()}),run:args => store.import(args),title:'导入对话索引或分类与项目备份'},
};
function html() {
  return readFileSync(join(root,'web/index.html'),'utf8')
    .replace('<link rel="stylesheet" href="/style.css">', () => '<style>' + readFileSync(join(root,'web/style.css'),'utf8') + '</style>')
    .replace('<script type="module" src="/app.js"></script>', () => '<script type="module">' + ['history.js','i18n.js','app.js'].map(file => readFileSync(join(root,'web',file),'utf8').replace(/^import .* from '\.\/(?:history|i18n)\.js';\n/gm,'').replace(/^export /gm,'')).join('\n') + '</script>');
}
function result(snapshot) {
  return { content:[{type:'text',text:snapshot.chats ? '对话集中有 ' + snapshot.chats.length + ' 条标题索引。' : snapshot.ok ? '已请求客户端定位原对话。' : snapshot.reason}], structuredContent:snapshot };
}
const mcp = new McpServer({name:'chat-shelf',version:'0.9.6-beta.1',icons}, {
  instructions:'对话集管理本机对话索引，ChatGPT 和 Codex 只是来源标签，可以放入同一文件夹及项目。归档与回收站只隐藏或恢复本机索引，项目也是本机整理层；不修改原生聊天、不永久删除、不宣称全量同步。可使用宿主聊天列表获取真实 ID、标题、最近时间；只有用户要求末段预览时，读取最后可见消息并提取最多 180 字的开头，传入 lastMessagePreview。末条消息含图片时，可读取宿主明确返回且对应末条消息的附件，传入最多 512 KB 的 PNG/JPEG/WebP/GIF data URL 到 lastMessageImage；只有图片指针而无像素时传 null。不要使用旧附件或猜测下载地址。不要把检索摘要或初始问题冒充末段，不读取其他正文、内部数据库或认证信息。宿主没有能力时使用用户提供的 JSON，不猜测 ID 或来源。',
  capabilities:{extensions:{'io.modelcontextprotocol/ui':{mimeTypes:['text/html;profile=mcp-app']}}},
});
mcp.registerResource('对话集',URI,{mimeType:'text/html;profile=mcp-app'},async () => ({
  contents:[{uri:URI,mimeType:'text/html;profile=mcp-app',text:html(),_meta:{'openai/ui':{availableDisplayModes:['inline','fullscreen']},ui:{prefersBorder:false,csp:{connectDomains:[],resourceDomains:[]}}}}],
}));
mcp.registerTool('open_shelf',{
  title:'对话集',description:'打开对话集，在同一文件夹与本机项目中整理 ChatGPT 和 Codex 对话；支持来源筛选、本机归档、回收站、恢复和撤销，不修改原生聊天。',
  inputSchema:{},
  annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false},
  _meta:{ui:{resourceUri:URI},'openai/ui':{entrypoints:[{type:'global'},{type:'thread'}]}},
},async (_args,extra) => { desktop.bind(extra._meta); if (desktop.available()) await syncChats(); return result(snapshot()); });
for (const [name,operation] of Object.entries(operations)) {
  mcp.registerTool(name,{
    title:operation.title,description:name === 'open_chat' ? '在客户端打开原对话：macOS Codex 使用正式原生链接并返回 dispatched；其他来源通过宿主核对记录并定位。系统接收链接不等于对话已加载，失败返回具体原因，不修改对话内容。' : operation.title + '，仅作用于对话集的本机索引。',
    inputSchema:operation.schema,
    annotations:{readOnlyHint:operation.readOnly === true,destructiveHint:false,openWorldHint:false},
    _meta:{ui:{visibility:['model','app']}},
  },async (args,extra) => {
    desktop.bind(extra._meta);
    if (name === 'get_shelf' && syncStatus.code !== 'client_connection_closed' && desktop.available() && (!syncStatus.lastSuccessAt || Date.now()/1000 - syncStatus.lastSuccessAt >= 30)) void syncChats();
    try { store.snapshot(); const value = await operation.run(operation.schema.parse(args)); return result(value.chats ? {...value,sync:snapshot().sync} : value); }
    catch (error) { return {isError:true,content:[{type:'text',text:error.message}]}; }
  });
}

if (process.argv.includes('--stdio')) await mcp.connect(new StdioServerTransport());
if (!process.env.CHAT_SHELF_NO_HTTP) {
  const port = Number(process.env.CHAT_SHELF_PORT ?? 4317);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('端口不正确');
  const hosts = new Set(['127.0.0.1:' + port,'localhost:' + port]);
  const origins = new Set([...hosts].map(host => 'http://' + host));
  const http = createServer(async (req,res) => {
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    const send = (status,value) => { res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value)); };
    if (!hosts.has(req.headers.host) || (req.headers.origin && !origins.has(req.headers.origin))) { send(403,{error:'仅允许本机界面访问'});return; }
    const path = new URL(req.url,'http://127.0.0.1:' + port).pathname;
    if (req.method === 'GET' && ['/','/style.css','/app.js','/history.js','/i18n.js'].includes(path)) {
      const file = path === '/' ? 'index.html' : path.slice(1);
      const mime = path === '/' ? 'text/html' : path.endsWith('.css') ? 'text/css' : 'text/javascript';
      res.writeHead(200,{'Content-Type':mime + '; charset=utf-8'});res.end(readFileSync(join(root,'web',file)));return;
    }
    if (req.method === 'GET' && path === '/health') { send(200,{ok:true});return; }
    if (req.method !== 'POST' || !path.startsWith('/api/')) { send(404,{error:'没有这个入口'});return; }
    const operation = operations[path.slice(5)];
    if (!operation) { send(404,{error:'操作不存在'});return; }
    try {
      let body = '';
      for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 8 * 1024 * 1024) throw new Error('索引内容过大，请减少本次导入的图片'); }
      store.snapshot();
      const value = await operation.run(operation.schema.parse(JSON.parse(body || '{}')));
      send(200,value.chats ? {...value,sync:snapshot().sync} : value);
    } catch (error) { send(400,{error:error instanceof z.ZodError ? '输入格式不正确' : error.message}); }
  });
  http.listen(port,'127.0.0.1',() => { console.error('对话集预览：http://127.0.0.1:' + port); });
  http.on('error',error=>{ if (process.argv.includes('--stdio') && error.code === 'EADDRINUSE') return; console.error('对话集本机界面未启动：' + error.message); });
  // 一个本机界面服务负责后台轮询；其他 MCP 实例在用户读取时同步，避免重复常驻轮询。
  http.on('listening',()=>{
    // 客户端关闭通道后停止重复请求；用户重新打开对话集或点击立即同步时再检查。
    const timer = setInterval(()=>{ if (syncStatus.code !== 'client_connection_closed' && desktop.available()) void syncChats(); },30000);
    timer.unref(); http.on('close',()=>clearInterval(timer));
  });
}
async function shutdown() { await desktop.close(); process.exit(0); }
process.once('SIGTERM',shutdown); process.once('SIGINT',shutdown);
if (process.argv.includes('--stdio')) process.stdin.once('end',shutdown);
if (desktop.available()) void syncChats();

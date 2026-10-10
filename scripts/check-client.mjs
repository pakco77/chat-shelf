import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, chmodSync, statSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../store.mjs';
import { hostIndex, hostPreview, openIndexedChat, openNativeChat, failure, createDesktopClient } from '../client.mjs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';

const id = '11111111-2222-8333-8444-555555555555';
const text = value=>({content:[{type:'text',text:JSON.stringify(value)}]});

// 使用真实的打开函数，只替换系统 URL 派发器；不能发起真实桌面导航。
const launches = [];
const nativeOptions = {platform:'darwin',launch:async(command,args,options)=>{ launches.push({command,args,options}); }};
const handedOff = await openNativeChat({id,source:'codex',href:'https://untrusted.invalid/'},nativeOptions);
assert.equal(handedOff.ok,true);
assert.equal(handedOff.delivery,'dispatched','操作系统接收链接不等于对话已经加载');
assert.deepEqual(launches[0].args,['-b','com.openai.codex','codex://threads/' + id]);
assert.equal(launches[0].command,'/usr/bin/open');
assert(launches[0].options.timeout > 0);
await openNativeChat({id,source:'codex',hostId:'remote-host'},nativeOptions);
assert.equal(launches[1].args[2],'codex://threads/' + id + '?hostId=remote-host');
assert.equal(await openNativeChat({id,source:'chatgpt'},nativeOptions),null,'ChatGPT 不能发往本地恢复入口');
assert.equal(await openNativeChat({id,source:'codex'},{...nativeOptions,platform:'linux'}),null,'其他平台沿用宿主接口');
assert.equal((await openNativeChat({id:'bad;id',source:'codex'},nativeOptions)).code,'invalid_chat_id');
assert.equal((await openNativeChat({id,source:'codex',hostId:'../bad'},nativeOptions)).code,'invalid_host_id');
assert.equal(launches.length,2,'无效输入和非 Codex 对话都不能触发系统调用');
const launchFailure = await openNativeChat({id,source:'codex'},{...nativeOptions,launch:async()=>{throw new Error('Unable to find application with bundle identifier com.openai.codex');}});
assert.equal(launchFailure.code,'client_launch_failed');
assert.match(launchFailure.detail,/Unable to find/);
console.log('PASS: Codex 原生链接独立于同步连接，核对来源与主机，系统交接不伪报加载完成');

assert.deepEqual(hostIndex({pinnedThreads:[{id,kind:'codex',hostId:'local',title:'置顶',updatedAt:1000}],threads:[{id,kind:'codex',hostId:'local',title:'最新',updatedAt:2000}]}),[{id,source:'codex',hostId:'local',title:'最新',updatedAt:2000}]);
assert.throws(()=>hostIndex({threads:[]}));
assert.throws(()=>hostIndex({pinnedThreads:[],threads:[{id:'bad',kind:'codex',title:'错误'}]}));
const indexed = {id,source:'codex',title:'有预览',updatedAt:1};
const record = {thread:{id,kind:'codex',updatedAt:2,preview:'初始问题不能当末段'},turns:[{items:[{type:'userMessage',content:[{type:'text',text:'上一条问题'}]},{type:'agentMessage',text:'**真实末段** ' + '字'.repeat(200)},{type:'commandExecution',output:'工具输出不能当末段'}]},{items:[{type:'agentMessage',text:'较早一轮'}]}]};
assert.equal(hostPreview(indexed,record).lastMessagePreview,'真实末段 ' + '字'.repeat(175),'只取最新一轮最后可见消息，清除排版标记并截到 180 字');
assert.equal(hostPreview(indexed,record).updatedAt,2);
record.turns[0].items.push({type:'userMessage',content:[{type:'text',text:'最新的追问'}]});
assert.equal(hostPreview(indexed,record).lastMessagePreview,'最新的追问','运行中的对话应显示最新可见追问');
record.turns[0].items = [{type:'reasoning',text:'不可见推理'}];
assert.equal(hostPreview(indexed,record),null,'没有可见消息时不能使用检索摘要或较早一轮');
assert.throws(()=>hostPreview(indexed,{thread:{id,kind:'chatgpt'},turns:[]}),/不一致/);
assert.throws(()=>hostPreview(indexed,{thread:{id,kind:'codex'}}),/没有返回末条消息/);
const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/U4QAAAAASUVORK5CYII=';
record.turns[0].items = [{type:'userMessage',content:[{type:'text',text:'说明图片'},{type:'image',image_url:image}]}];
assert.equal(hostPreview(indexed,record).lastMessageImage,image);
record.turns[0].items = [{type:'userMessage',content:[{type:'image',url:'file-service://unavailable'}]}];
assert.equal(hostPreview(indexed,record).lastMessageImage,null,'没有图片像素时不能猜下载地址');
for (const source of ['chatgpt','codex']) {
  const calls = [], chat = {id,source,hostId:'durable'};
  const result = await openIndexedChat(chat,async(name,args,signal)=>{
    assert(signal instanceof AbortSignal); calls.push({name,args});
    return text(name==='read_thread' ? {thread:{id,kind:source}} : {navigated:true});
  });
  assert.equal(result.ok,true);
  assert.deepEqual(calls.map(c=>c.name),['read_thread','navigate_to_codex_page']);
  assert.equal(calls[0].args.hostId,source==='codex' ? 'durable' : undefined,'只向本地任务读取传来源主机');
  assert.deepEqual(calls[1].args,{threadId:id});
}
let opened = false;
const missing = await openIndexedChat({id,source:'codex'},async name=>{
  if (name === 'navigate_to_codex_page') opened=true;
  return {isError:true,content:[{type:'text',text:'no rollout found for thread id ' + id}]};
});
assert.equal(missing.code,'chat_unavailable'); assert.equal(opened,false);
assert.match(missing.detail,/no rollout found/);
const denied = await openIndexedChat({id,source:'chatgpt'},async name=>text(name==='read_thread' ? {thread:{id,kind:'chatgpt'}} : {navigated:false,reason:'permission denied'}));
assert.equal(denied.code,'client_denied');
const invalid = await openIndexedChat({id:'demo-invalid',source:'codex'},()=>{throw new Error('不应调用');});
assert.equal(invalid.code,'invalid_chat_id');
assert.equal(failure(new Error('连接超时')).code,'client_timeout');
assert.equal(failure(new Error('MCP error -32603: Codex app tools pipe closed')).code,'client_connection_closed');
assert.equal(failure(new Error('No Codex thread found for threadId: ' + id + '. Hosts without a readable match: local, durable')).code,'chat_unavailable');
console.log('PASS: 双来源先检查原记录再定位，保留远程来源，找不到记录不导航，拒绝和超时返回具体原因');

const dir = mkdtempSync(join(tmpdir(),'shelf-client-check-'));
try {
  const sessionFile = join(dir,'client-session.json'), previousPipe = process.env.CODEX_APP_TOOLS_PIPE_PATH;
  try {
    process.env.CODEX_APP_TOOLS_PIPE_PATH = '/test/host-provided-connection';
    createDesktopClient(sessionFile).bind({'x-codex-turn-metadata':{thread_id:id}});
    assert.equal(statSync(sessionFile).mode & 0o077,0,'连接会话只能当前用户读取');
    assert.equal(JSON.parse(readFileSync(sessionFile)).threadId,id);
    delete process.env.CODEX_APP_TOOLS_PIPE_PATH;
    assert.equal(createDesktopClient(sessionFile).available(),true,'本机预览必须能复用宿主实际提供的绑定');
    chmodSync(sessionFile,0o644);
    assert.equal(createDesktopClient(sessionFile).available(),false,'拒绝其他用户可读的连接会话');
  } finally { if (previousPipe === undefined) delete process.env.CODEX_APP_TOOLS_PIPE_PATH; else process.env.CODEX_APP_TOOLS_PIPE_PATH=previousPipe; }
  // 真实 SDK/stdio 往返；工具端只返回虚构记录，不操作桌面或用户数据。
  const pluginRoot = join(dir,'resources/plugins/openai-bundled/plugins/codex-app-tools');
  mkdirSync(pluginRoot,{recursive:true});
  const sdk = name=>new URL('../node_modules/@modelcontextprotocol/sdk/dist/esm/' + name,import.meta.url).href;
  writeFileSync(join(pluginRoot,'server.mjs'),`
import { McpServer } from ${JSON.stringify(sdk('server/mcp.js'))};
import { StdioServerTransport } from ${JSON.stringify(sdk('server/stdio.js'))};
import { readFileSync } from 'node:fs';
import { z } from ${JSON.stringify(new URL('../node_modules/zod/index.js',import.meta.url).href)};
const server=new McpServer({name:'shelf-check-host',version:'1'},{capabilities:{}});
const reply=value=>({content:[{type:'text',text:JSON.stringify(value)}]});
let connectionClosed=false;
for (const name of ['list_threads','read_thread','navigate_to_codex_page']) server.registerTool(name,{inputSchema:{threadId:z.string().optional(),hostId:z.string().optional(),turnLimit:z.number().optional(),limit:z.number().optional(),includeOutputs:z.boolean().optional(),maxOutputCharsPerItem:z.number().optional()}},(args,extra)=>{
 if(extra._meta?.['openai/threadId']!==${JSON.stringify(id)}) throw new Error('缺少宿主提供的上下文');
 const list=process.env.TEST_SHELF_LIST_FILE ? JSON.parse(readFileSync(process.env.TEST_SHELF_LIST_FILE,'utf8')) : {threads:[{id:${JSON.stringify(id)},kind:'codex',hostId:'local',title:'真实调用虚构记录',updatedAt:1}],pinnedThreads:[]};
 if(list.closeConnection) connectionClosed=true;
 if(connectionClosed) return {isError:true,content:[{type:'text',text:'Codex app tools pipe closed'}]};
 const chat=list.threads.find(chat=>chat.id===args.threadId);
 if(name==='read_thread' && chat?.previewFailure) return {isError:true,content:[{type:'text',text:'no rollout found for thread id ' + args.threadId}]};
 return reply(name==='list_threads'?list:name==='read_thread'?{thread:{id:args.threadId,kind:chat?.kind ?? 'codex',updatedAt:chat?.updatedAt},turns:[{items:[{type:'agentMessage',text:'最新的真实末段：' + (chat?.title ?? '')}]}]}:{navigated:true});
});
await server.connect(new StdioServerTransport());
`);
  writeFileSync(join(pluginRoot,'launch.sh'),'#!/bin/sh\nexec "$TEST_SHELF_NODE" ./server.mjs\n',{mode:0o700});
  writeFileSync(join(pluginRoot,'.mcp.json'),JSON.stringify({mcpServers:{codex_app:{command:'./launch.sh',args:[],cwd:'.',env_vars:['TEST_SHELF_NODE','TEST_SHELF_LIST_FILE','CODEX_APP_TOOLS_PIPE_PATH']}}}));
  const vars = ['CODEX_APP_TOOLS_PIPE_PATH','CODEX_ELECTRON_RESOURCES_PATH','TEST_SHELF_NODE','TEST_SHELF_LIST_FILE'];
  const previous = Object.fromEntries(vars.map(key=>[key,process.env[key]]));
  let desktop;
  try {
    process.env.CODEX_APP_TOOLS_PIPE_PATH='/test/provided-connection';
    process.env.CODEX_ELECTRON_RESOURCES_PATH=join(dir,'resources');
    process.env.TEST_SHELF_NODE=process.execPath;
    const visible = {threads:[{id,kind:'codex',hostId:'local',title:'真实调用虚构记录',updatedAt:1}],pinnedThreads:[]};
    process.env.TEST_SHELF_LIST_FILE=join(dir,'visible-list.json');
    writeFileSync(process.env.TEST_SHELF_LIST_FILE,JSON.stringify(visible));
    desktop=createDesktopClient(); desktop.bind({'openai/threadId':id});
    assert.equal(desktop.connected(),false,'收到连接配置不能冒充实际接通');
    assert.equal(hostIndex(await desktop.list()).length,1);
    assert.equal(desktop.connected(),true,'工具握手成功后才标为接通');
    assert.equal((await desktop.preview({id,source:'codex',title:'真实调用虚构记录',updatedAt:1})).lastMessagePreview,'最新的真实末段：真实调用虚构记录');
    assert.equal((await desktop.open({id,source:'codex'})).ok,true);
    for (const [name,call] of [['列表',()=>desktop.list()],['末段',()=>desktop.preview(indexed)],['定位',()=>desktop.open(indexed)]]) {
      visible.closeConnection=true; writeFileSync(process.env.TEST_SHELF_LIST_FILE,JSON.stringify(visible));
      const failed = await call().catch(error=>({ok:false,...failure(error)}));
      assert.equal(failed.code,'client_connection_closed',name + '应识别 MCP isError 返回的连接关闭');
      assert.equal(desktop.connected(),false,name + '收到连接关闭后必须释放失效连接');
      delete visible.closeConnection; writeFileSync(process.env.TEST_SHELF_LIST_FILE,JSON.stringify(visible));
      assert.equal(hostIndex(await desktop.list()).length,1,name + '失败后的下一次调用必须重新建立连接');
      assert.equal(desktop.connected(),true);
    }
    const backendRoot = join(dir,'backend'); mkdirSync(backendRoot);
    writeFileSync(join(backendRoot,'state.json'),JSON.stringify({version:3,chats:[],history:[],revision:0}));
    const shelf = new Client({name:'shelf-backend-check',version:'1'},{capabilities:{}});
    try {
      await shelf.connect(new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../server.mjs',import.meta.url)),'--stdio'],env:{...process.env,CHAT_SHELF_NATIVE_OPEN:'0',CHAT_SHELF_DATA:backendRoot,CHAT_SHELF_NO_HTTP:'1'},stderr:'ignore'}));
      const synced = await shelf.callTool({name:'open_shelf',arguments:{},_meta:{'openai/threadId':id}});
      assert.equal(synced.structuredContent.sync.state,'synced');
      assert.equal(synced.structuredContent.chats.length,1);
      assert.equal(synced.structuredContent.chats[0].category,'inbox');
      assert.equal(synced.structuredContent.chats[0].lastMessagePreview,'最新的真实末段：真实调用虚构记录','自动收录必须经过真实 SDK 读取并保存末段');
      const opened = await shelf.callTool({name:'open_chat',arguments:{key:'codex:' + id}});
      assert.equal(opened.structuredContent.ok,true);
      const missing = await shelf.callTool({name:'open_chat',arguments:{key:'codex:missing'}});
      assert.equal(missing.structuredContent.code,'index_missing');
      visible.threads[0].updatedAt=2; visible.threads[0].title='对话已继续';
      const unreadable = {id:'33333333-4444-4333-8444-555555555555',kind:'chatgpt',title:'暂不可读的末段',updatedAt:3,previewFailure:true};
      visible.threads.push(unreadable); writeFileSync(process.env.TEST_SHELF_LIST_FILE,JSON.stringify(visible));
      const partial = (await shelf.callTool({name:'sync_chats',arguments:{}})).structuredContent;
      assert.equal(partial.sync.state,'partial'); assert.equal(partial.sync.code,'chat_unavailable');
      assert.match(partial.sync.detail,/no rollout found/,'末段读取失败应带回原原因');
      assert.equal(partial.chats.find(chat=>chat.id===id).lastMessagePreview,'最新的真实末段：对话已继续','已更新对话必须刷新末段');
      assert(partial.chats.some(chat=>chat.id===unreadable.id),'一篇末段失败不能阻止标题收录');
      unreadable.previewFailure=false; writeFileSync(process.env.TEST_SHELF_LIST_FILE,JSON.stringify(visible));
      const recovered = (await shelf.callTool({name:'sync_chats',arguments:{}})).structuredContent;
      assert.equal(recovered.sync.state,'synced');
      assert.equal(recovered.sync.previewsUpdated,1,'重试只读失败或有更新的记录');
      assert.equal(recovered.chats.find(chat=>chat.id===unreadable.id).lastMessagePreview,'最新的真实末段：暂不可读的末段');
    } finally { await shelf.close(); }
    if (process.argv.includes('--poll')) {
      const visible = {threads:[{id,kind:'codex',title:'已收录',updatedAt:1,hostId:'local'}],pinnedThreads:[]};
      process.env.TEST_SHELF_LIST_FILE=join(dir,'visible-list.json');
      writeFileSync(process.env.TEST_SHELF_LIST_FILE,JSON.stringify(visible));
      const background = new Client({name:'shelf-poll-check',version:'1'},{capabilities:{}});
      try {
        await background.connect(new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../server.mjs',import.meta.url)),'--stdio'],env:{...process.env,CHAT_SHELF_NATIVE_OPEN:'0',CHAT_SHELF_DATA:backendRoot,CHAT_SHELF_NO_HTTP:'',CHAT_SHELF_PORT:'4398'},stderr:'ignore'}));
        const current = async()=>{
          const response=await fetch('http://127.0.0.1:4398/api/get_shelf',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
          assert(response.ok); return response.json();
        };
        let first;
        for (let retry=0;retry<50;retry++) {
          try {first=await current();if(first.sync.lastSuccessAt)break;}catch{}
          await new Promise(resolve=>setTimeout(resolve,100));
        }
        assert(first?.sync.lastSuccessAt,'服务启动必须自动同步');
        visible.threads.push({id:'22222222-3333-4333-8444-555555555555',kind:'chatgpt',title:'后台新增对话',updatedAt:2});
        writeFileSync(process.env.TEST_SHELF_LIST_FILE,JSON.stringify(visible));
        await new Promise(resolve=>setTimeout(resolve,31000));
        const second=await current();
        assert(second.chats.some(chat=>chat.title==='后台新增对话'),'无界面操作时，30 秒轮询必须自动收录新对话');
        assert.equal(second.chats.find(chat=>chat.title==='后台新增对话').lastMessagePreview,'最新的真实末段：后台新增对话','后台新增对话同时补入末段');
        assert(second.sync.lastSuccessAt>first.sync.lastSuccessAt);
        assert.equal(second.sync.added,1);
        console.log('PASS: 实际服务启动及 30 秒后台轮询自动收录新对话，无需手动刷新（隔离模拟宿主）');
      } finally {await background.close();}
    }
  } finally { await desktop?.close(); assert.equal(desktop?.connected(),false); for (const key of vars) previous[key]===undefined ? delete process.env[key] : process.env[key]=previous[key]; }
  console.log('PASS: 复用宿主连接的真实 MCP 往返、相对启动路径解析、上下文传递与受限工具调用');
  const file = join(dir,'state.json'), seed = join(dir,'seed.json');
  writeFileSync(seed,JSON.stringify({chats:[{id:'old',source:'chatgpt',title:'旧名称',updatedAt:1,category:'work',favorite:true,lastMessagePreview:'真实末段'}]}));
  const store = createStore(file,seed);
  store.move(['chatgpt:old'],'life');
  const before = store.snapshot();
  store.sync([{id:'old',source:'chatgpt',title:'新名称',updatedAt:2},{id:'new',source:'codex',hostId:'durable',title:'新对话',updatedAt:3}]);
  let state = store.snapshot(), old = state.chats.find(c=>c.id==='old');
  assert.equal(old.category,'life'); assert.equal(old.favorite,true); assert.equal(old.lastMessagePreview,'真实末段');
  assert.equal(state.chats.find(c=>c.id==='new').category,'inbox');
  assert.equal(state.chats.find(c=>c.id==='new').hostId,'durable');
  assert.equal(state.chats.find(c=>c.id==='new').href,null,'远程任务不能拼成本机会话链接');
  assert.equal(JSON.parse(readFileSync(file)).history.length,1,'自动同步不能占用撤销记录');
  store.undo(); state = store.snapshot();
  assert.equal(state.chats.find(c=>c.id==='old').category,'work');
  assert.equal(state.chats.find(c=>c.id==='old').title,'新名称','撤销整理不能回滚同步的标题');
  assert(state.chats.some(c=>c.id==='new'),'撤销整理不能丢掉自动收录的新对话');
  const stable = readFileSync(file,'utf8');
  store.sync([{id:'old',source:'chatgpt',title:'过期标题',updatedAt:1}]);
  assert.equal(readFileSync(file,'utf8'),stable,'过期或未变化的数据不应写文件');
  assert.throws(()=>store.sync([{id:'invalid/id',source:'codex',title:'无效来源'}]));
  assert.equal(readFileSync(file,'utf8'),stable,'无效来源必须原子拒绝');
  store.trash(['chatgpt:old']);
  store.sync([{id:'old',source:'chatgpt',title:'最新标题',updatedAt:4}]);
  assert.equal(store.snapshot().chats.find(c=>c.id==='old').status,'trashed','同步不能复活回收站条目');
  store.sync([{id:'old',source:'chatgpt',title:'最新标题',updatedAt:4,lastMessagePreview:'最新的真实末段'}]);
  assert.equal(store.snapshot().chats.find(c=>c.id==='old').lastMessagePreview,'最新的真实末段','同步必须保存真实末段，不能只保存标题');
  store.undo();
  assert.equal(store.snapshot().chats.find(c=>c.id==='old').lastMessagePreview,'最新的真实末段','撤销整理不能抹掉刚补齐的预览');
  store.sync([{id:'old',source:'chatgpt',title:'最新标题',updatedAt:5,lastMessagePreview:'末条图片',lastMessageImage:image}]);
  store.sync([{id:'old',source:'chatgpt',title:'只改标题',updatedAt:6}]);
  assert.equal(store.snapshot().chats.find(c=>c.id==='old').lastMessageImage,image,'只同步标题不能清除已有图片');
  store.sync([{id:'old',source:'chatgpt',title:'最新文字',updatedAt:7,lastMessagePreview:'新的文字消息'}]);
  assert.equal(store.snapshot().chats.find(c=>c.id==='old').lastMessageImage,undefined,'新的文字消息不能显示上一条图片');
  store.sync([{id:'old',source:'chatgpt',title:'过期图片',updatedAt:5,lastMessagePreview:'旧图片说明',lastMessageImage:image}]);
  assert.equal(store.snapshot().chats.find(c=>c.id==='old').lastMessagePreview,'新的文字消息','过期末段不能覆盖新预览');
  assert.equal(store.snapshot().chats.find(c=>c.id==='old').lastMessageImage,undefined);
  assert.equal(before.chats.length,1);
  console.log('PASS: 自动同步保留整理和预览，新增对话进待收纳，撤销不丢收录，旧数据不覆盖新数据');
} finally { rmSync(dir,{recursive:true,force:true}); }

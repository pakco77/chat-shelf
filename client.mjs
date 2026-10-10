import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { join, dirname, resolve, isAbsolute } from 'node:path';
import { homedir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { lastMessageContent, timestampSeconds } from './web/history.js';

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
// 用户点击时使用客户端注册的 URL 入口，不依赖后台同步的工具连接。
export async function openNativeChat(chat,{platform=process.platform,launch=promisify(execFile)}={}) {
  if (platform !== 'darwin' || chat.source !== 'codex') return null;
  if (!uuid.test(chat.id)) return {ok:false,code:'invalid_chat_id',reason:'原对话 ID 不正确，无法定位。',retryable:false};
  if (chat.hostId && !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(chat.hostId)) return {ok:false,code:'invalid_host_id',reason:'对话的来源设备不正确，请重新同步索引。',retryable:false};
  const url = 'codex://threads/' + chat.id + (chat.hostId && chat.hostId !== 'local' ? '?hostId=' + encodeURIComponent(chat.hostId) : '');
  try {
    await launch('/usr/bin/open',['-b','com.openai.codex',url],{timeout:5000,maxBuffer:8192});
    // ponytail: 系统 URL 入口没有加载回执；后续恢复失败由客户端显示，不能冒充 navigated。
    return {ok:true,threadId:chat.id,delivery:'dispatched'};
  } catch (error) {
    return {ok:false,code:'client_launch_failed',reason:'未能启动桌面客户端，请确认已安装并能正常打开。',detail:String(error.stderr || error.message || error).slice(0,1000),retryable:true};
  }
}
export function failure(error) {
  const detail = String(error?.message ?? error ?? '客户端没有返回原因').slice(0,1000);
  if (/最多.*5000|5000.*上限/.test(detail)) return {code:'index_full',reason:'对话集已达到 5000 篇的容量，本次未收录新条目，原记录保留。',detail,retryable:false};
  if (/另一处对话集|索引已在另一处更新/.test(detail)) return {code:'index_conflict',reason:'另一处对话集正在更新索引，请稍后重试。',detail,retryable:true};
  if (/no rollout found|no (?:codex thread|chatgpt conversation|thread|chat).*found|(?:thread|conversation|chat).*not.found|对话.*(?:不存在|未找到)/i.test(detail)) return {code:'chat_unavailable',reason:'客户端找不到这篇原对话的记录。可能已删除，或当前账号、设备无法访问。',detail,retryable:false};
  if (/timeout|timed out|超时/i.test(detail)) return {code:'client_timeout',reason:'客户端响应超时，请稍后重试。',detail,retryable:true};
  if (/permission|unauthorized|forbidden|denied|权限|拒绝/i.test(detail)) return {code:'client_denied',reason:'客户端拒绝了这次访问。请检查登录与连接权限。',detail,retryable:false};
  if (/app tools pipe closed/i.test(detail)) return {code:'client_connection_closed',reason:'客户端关闭了同步连接，无法通过这条连接定位原对话；已收录的对话仍然保留。',detail,retryable:true};
  if (/ENOENT|ECONN|closed|disconnect|连接|未连接|未提供|未绑定/i.test(detail)) return {code:'client_disconnected',reason:'尚未连接桌面客户端，请在客户端中打开一次对话集，再重试。',detail,retryable:true};
  return {code:'client_error',reason:'这次操作未完成，请查看返回的具体原因。',detail,retryable:true};
}
function payload(result) {
  if (result?.isError) throw new Error(result.content?.filter(c=>c.type==='text').map(c=>c.text).join('\n') || '客户端没有返回原因');
  if (result?.structuredContent) return result.structuredContent;
  const content = result?.content?.find(c=>c.type==='text')?.text;
  try { return JSON.parse(content); } catch { throw new Error(content || '客户端返回格式不正确'); }
}
export function hostIndex(list) {
  if (!Array.isArray(list?.threads) || !Array.isArray(list?.pinnedThreads)) throw new Error('客户端返回的聊天列表格式不正确');
  const rows = new Map();
  for (const chat of [...list.pinnedThreads,...list.threads]) {
    if (!['codex','chatgpt'].includes(chat.kind)) continue;
    if (!uuid.test(chat.id) || typeof chat.title !== 'string' || !chat.title.trim()) throw new Error('客户端返回的对话 ID 或标题不正确');
    const row = {id:chat.id,source:chat.kind,title:chat.title,updatedAt:timestampSeconds(chat.updatedAt),...(chat.hostId ? {hostId:chat.hostId} : {})};
    rows.set(row.source + ':' + row.id,row);
  }
  return [...rows.values()];
}
export function hostPreview(chat,record) {
  if (record?.error) throw new Error(typeof record.error === 'string' ? record.error : record.error.message);
  if (record?.thread?.id !== chat.id || record.thread.kind !== chat.source) throw new Error('客户端返回的原对话与索引不一致，请重新同步后检查');
  const items = record.turns?.[0]?.items;
  if (!Array.isArray(items)) throw new Error('客户端没有返回末条消息，本次保留已有预览');
  const message = items.findLast(item => ['userMessage','agentMessage'].includes(item.type));
  if (!message) return null;
  if (message.type === 'agentMessage' && typeof message.text !== 'string') throw new Error('客户端返回的末条消息格式不正确');
  const content = message.type === 'agentMessage' ? [message.text] : message.content;
  if (!Array.isArray(content)) throw new Error('客户端返回的末条消息格式不正确');
  const preview = lastMessageContent({current_node:'last',mapping:{last:{message:{author:{role:message.type === 'agentMessage' ? 'assistant' : 'user'},content:{parts:content}}}}});
  return {...chat,...preview,updatedAt:Math.max(chat.updatedAt,timestampSeconds(record.thread.updatedAt))};
}
export async function openIndexedChat(chat,call) {
  if (!uuid.test(chat.id)) return {ok:false,...failure(new Error('原对话 ID 不正确，无法定位')),code:'invalid_chat_id',retryable:false};
  try {
    const signal = AbortSignal.timeout(12000);
    const record = payload(await call('read_thread',{threadId:chat.id,...(chat.source === 'codex' && chat.hostId ? {hostId:chat.hostId} : {}),turnLimit:1},signal));
    if (record.error) throw new Error(typeof record.error === 'string' ? record.error : record.error.message);
    if (record.thread?.id !== chat.id || record.thread?.kind !== chat.source) throw new Error('客户端返回的原对话与索引不一致，请重新同步后检查');
    const opened = payload(await call('navigate_to_codex_page',{threadId:chat.id},signal));
    if (opened.navigated !== true) throw new Error(typeof opened.error === 'string' ? opened.error : opened.error?.message || opened.reason || '客户端未能定位这篇原对话');
    return {ok:true,threadId:chat.id};
  } catch (error) { return {ok:false,...failure(error)}; }
}
export function createDesktopClient(sessionFile) {
  let metadata = null, connecting = null, client = null, hostEnv = {...process.env};
  const sessionVars = ['CODEX_APP_TOOLS_PIPE_PATH','CODEX_MCP_NODE_PATH','CODEX_ELECTRON_RESOURCES_PATH'];
  function session() {
    if (!sessionFile || (process.env.CODEX_APP_TOOLS_PIPE_PATH && metadata)) return;
    try {
      const stat = statSync(sessionFile);
      if ((stat.mode & 0o077) || (process.getuid && stat.uid !== process.getuid())) return;
      const saved = JSON.parse(readFileSync(sessionFile,'utf8'));
      if (!uuid.test(saved.threadId) || !saved.env?.CODEX_APP_TOOLS_PIPE_PATH || sessionVars.some(key=>saved.env[key] !== undefined && typeof saved.env[key] !== 'string')) return;
      const env = process.env.CODEX_APP_TOOLS_PIPE_PATH ? process.env : saved.env;
      if (hostEnv.CODEX_APP_TOOLS_PIPE_PATH !== env.CODEX_APP_TOOLS_PIPE_PATH && client) { const previous=client;client=null;void previous.close().catch(()=>{}); }
      metadata = {'openai/threadId':saved.threadId};
      hostEnv = {...process.env,...Object.fromEntries(sessionVars.filter(key=>env[key]).map(key=>[key,env[key]]))};
      if (process.env.CODEX_APP_TOOLS_PIPE_PATH) bind(metadata);
    } catch { /* 尚未有客户端绑定，照常返回未连接原因。 */ }
  }
  function bind(meta) {
    if (!meta) return;
    let turn = meta['x-codex-turn-metadata'];
    if (typeof turn === 'string') { try { turn = JSON.parse(turn); } catch { turn = null; } }
    const id = meta['openai/threadId'] ?? meta['openai/thread_id'] ?? meta.codexThreadId ?? meta.codex_thread_id ?? meta.threadId ?? meta.thread_id ?? turn?.thread_id ?? meta.thread?.id;
    if (typeof id === 'string' && uuid.test(id)) {
      metadata = {'openai/threadId':id};
      if (sessionFile && process.env.CODEX_APP_TOOLS_PIPE_PATH) {
        // 只转交宿主实际提供的连接给本机预览进程；不从磁盘猜测客户端接口。
        try {
          mkdirSync(dirname(sessionFile),{recursive:true});
          const temp = sessionFile + '.' + process.pid + '.tmp';
          writeFileSync(temp,JSON.stringify({threadId:id,env:Object.fromEntries(sessionVars.filter(key=>process.env[key]).map(key=>[key,process.env[key]]))}),{mode:0o600});
          renameSync(temp,sessionFile);
        } catch (error) { console.error('本机预览未收到客户端连接：' + (error.code ?? '保存失败')); }
      }
    }
  }
  function definition() {
    // 复用客户端随附的 MCP 工具，不扫描数据库、套接字或登录凭据。
    const resources = hostEnv.CODEX_ELECTRON_RESOURCES_PATH ?? ['/Applications/Codex.app/Contents/Resources','/Applications/ChatGPT.app/Contents/Resources'].find(path=>existsSync(join(path,'plugins/openai-bundled/plugins/codex-app-tools/.mcp.json')));
    const candidates = resources ? [join(resources,'plugins/openai-bundled/plugins/codex-app-tools/.mcp.json')] : [];
    const cache = join(homedir(),'.codex/plugins/cache/openai-bundled/codex-app-tools');
    if (existsSync(cache)) for (const version of readdirSync(cache).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}))) candidates.push(join(cache,version,'.mcp.json'));
    const file = candidates.find(existsSync);
    if (!file) throw new Error('未连接：没有找到客户端随附的聊天工具');
    const config = JSON.parse(readFileSync(file,'utf8')).mcpServers.codex_app;
    return {...config,cwd:resolve(dirname(file),config.cwd ?? '.'),command:!isAbsolute(config.command) && config.command.includes('/') ? resolve(dirname(file),config.command) : config.command,
      env:{...(resources ? {CODEX_ELECTRON_RESOURCES_PATH:resources} : {}),...config.env}};
  }
  async function connect(signal) {
    session();
    if (!hostEnv.CODEX_APP_TOOLS_PIPE_PATH) throw new Error('未连接：宿主未提供桌面客户端连接');
    if (!metadata) throw new Error('未绑定：请在客户端中打开一次对话集');
    if (client) return client;
    if (!connecting) connecting = (async()=>{
      const config = definition(), env = {...config.env,...Object.fromEntries((config.env_vars ?? sessionVars).filter(key=>hostEnv[key]).map(key=>[key,hostEnv[key]]))};
      const transport = new StdioClientTransport({command:config.command,args:config.args,cwd:config.cwd,env,stderr:'ignore'});
      const next = new Client({name:'chat-shelf-client',version:'0.9.6-beta.1'},{capabilities:{}});
      next.onclose = ()=>{ if (client === next) client=null; };
      try { await next.connect(transport,{signal,timeout:10000}); await next.listTools({}, {signal,timeout:10000}); client = next; return next; }
      catch (error) { await next.close().catch(()=>{}); throw error; }
    })().finally(()=>{connecting=null;});
    return connecting;
  }
  async function call(name,args,signal) {
    if (!['list_threads','read_thread','navigate_to_codex_page'].includes(name)) throw new Error('不支持这个客户端操作');
    const connection = await connect(signal);
    try {
      const result = await connection.callTool({name,arguments:args,_meta:metadata},undefined,{signal,timeout:10000});
      if (result.isError) payload(result);
      return result;
    }
    catch (error) {
      if (['client_connection_closed','client_disconnected'].includes(failure(error).code) && client === connection) { client=null; await connection.close().catch(()=>{}); }
      throw error;
    }
  }
  return {bind,
    available:()=>{session();return Boolean(hostEnv.CODEX_APP_TOOLS_PIPE_PATH && metadata);},
    connected:()=>Boolean(client),
    list:async(signal=AbortSignal.timeout(12000))=>payload(await call('list_threads',{limit:50},signal)),
    preview:async(chat,signal=AbortSignal.timeout(12000))=>hostPreview(chat,payload(await call('read_thread',{threadId:chat.id,...(chat.source === 'codex' && chat.hostId ? {hostId:chat.hostId} : {}),turnLimit:1,includeOutputs:false,maxOutputCharsPerItem:1000},signal))),
    open:chat=>openIndexedChat(chat,call),
    async close() { const current=client; client=null; await current?.close().catch(()=>{}); },
  };
}

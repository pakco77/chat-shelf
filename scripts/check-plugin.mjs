import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ponytail: 验收实际客户端解析；直接启动 server.mjs 无法发现插件清单丢失连接的问题。
const args = process.argv.slice(2);
const root = resolve(args.find(arg => arg !== '--installed') ?? fileURLToPath(new URL('../',import.meta.url)));
const proc = spawn(process.env.CODEX_CLI_PATH ?? 'codex',['app-server'],{stdio:['pipe','pipe','ignore']});
const lines = createInterface({input:proc.stdout}), waiting = new Map();
let id = 0;
function rpc(method,params) {
  const key = ++id;
  return new Promise((resolve,reject) => {
    waiting.set(key,{resolve,reject});
    proc.stdin.write(JSON.stringify({id:key,method,params}) + '\n');
  });
}
function rejectPending(error) { for (const w of waiting.values()) w.reject(error); waiting.clear(); }
proc.on('error',rejectPending);
proc.on('exit',code => rejectPending(new Error('客户端诊断进程已退出：' + code)));
lines.on('line',line => {
  let m;
  try { m = JSON.parse(line); } catch { return; }
  const w = waiting.get(m.id);
  if (w) { waiting.delete(m.id); m.error ? w.reject(new Error(m.error.message)) : w.resolve(m.result); }
});
const timer = setTimeout(() => { rejectPending(new Error('客户端插件检查超时')); proc.kill(); },20000);
try {
  await rpc('initialize',{clientInfo:{name:'shouna-plugin-check',version:'0.1.0'},capabilities:{experimentalApi:true}});
  proc.stdin.write(JSON.stringify({method:'initialized',params:{}}) + '\n');
  const {plugin} = await rpc('plugin/read',{pluginName:'chat-shelf',marketplacePath:resolve(root,'.agents/plugins/marketplace.json')});
  assert.equal(plugin.summary.interface?.displayName,'对话集');
  assert(plugin.summary.interface?.logo,'客户端未读取插件图标');
  assert(plugin.summary.interface?.composerIcon,'客户端未读取单色入口图标');
  assert(plugin.mcpServers.includes('chat-shelf'),'客户端只发现技能，未发现对话集服务连接');
  assert.equal(plugin.skills.length,1);
  console.log('PASS: 客户端原生解析对话集插件，发现 chat-shelf 服务与对话集技能');
  if (args.includes('--installed')) {
    const {data} = await rpc('mcpServerStatus/list',{serverName:'chat-shelf'});
    const server = data.find(s => s.name === 'chat-shelf');
    assert(server,'客户端没有加载对话集服务');
    assert.equal(server.toolsError,null,server.toolsError ?? '对话集工具发现失败');
    for (const name of ['set_category_color','sync_chats','open_chat']) assert(Object.values(server.tools).some(t => t.name === name),'安装版缺少工具：' + name);
    const entry = Object.values(server.tools).find(t => t.name === 'open_shelf');
    assert.equal(entry?.title,'对话集');
    assert.equal(entry._meta.ui.resourceUri,'ui://chat-shelf/main.html');
    assert(entry._meta['openai/ui'].entrypoints.some(e => e.type === 'global'));
    console.log('PASS: 客户端实际启动安装版，发现对话集 UI 工具及全局左栏入口元数据');
  }
} finally { clearTimeout(timer); lines.close(); proc.stdin.end(); proc.kill(); }

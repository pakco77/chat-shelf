import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, existsSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

// ponytail: 使用真实 CLI 和临时 HOME/CODEX_HOME 走完整安装；不接触使用者的插件配置、聊天数据或预览端口。
const root = fileURLToPath(new URL('../',import.meta.url));
const version = JSON.parse(readFileSync(join(root,'package.json'),'utf8')).version;
const temp = mkdtempSync(join(tmpdir(),'chat-shelf-install-check-'));
const cli = [process.env.CODEX_CLI_PATH,
  '/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex',
  '/Applications/Codex.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex'].find(path=>path && existsSync(path));
assert(cli,'安装验收需要当前 macOS Codex 桌面客户端');
const npm = execFileSync('/usr/bin/which',['npm'],{encoding:'utf8'}).trim();
function environment(name,source=false) {
  const home = join(temp,name), codex = join(home,'codex');
  mkdirSync(codex,{recursive:true});
  return {HOME:home,CODEX_HOME:codex,PATH:'/usr/bin:/bin:/usr/sbin:/sbin' + (source ? ':' + dirname(npm) + ':' + dirname(process.execPath) : ''),
    CHAT_SHELF_DATA:join(home,'data'),CHAT_SHELF_NO_HTTP:'1',CHAT_SHELF_NATIVE_OPEN:'0',npm_config_update_notifier:'false'};
}
function run(command,args,env,cwd=root) {
  return execFileSync(command,args,{cwd,env,encoding:'utf8',timeout:300000,maxBuffer:2*1024*1024});
}
function install(directory,env,expectedVersion=version) {
  const output = run('/bin/zsh',[join(directory,'Install.command')],env);
  assert.match(output,/安装完成/);
  const list = JSON.parse(run(cli,['plugin','list','--json'],env));
  assert(list.installed.some(plugin=>plugin.pluginId === 'chat-shelf@pakco-chat-shelf' && plugin.version === expectedVersion && plugin.enabled));
  return output;
}
async function useCache(cache,env,addChat=false) {
  const client = new Client({name:'chat-shelf-install-check',version:'1.0.0'},{capabilities:{}});
  const transport = new StdioClientTransport({command:'/bin/zsh',args:[join(cache,'scripts/start.sh')],cwd:'/',env,stderr:'pipe'});
  try {
    await client.connect(transport,{timeout:10000});
    const {tools} = await client.listTools({}, {timeout:10000});
    assert(tools.some(tool=>tool.name === 'open_shelf' && tool._meta?.['openai/ui']?.entrypoints?.some(entry=>entry.type === 'global')));
    if (addChat) {
      const result = await client.callTool({name:'import_chats',arguments:{chats:[{id:'install-test',source:'codex',title:'安装隔离验证',category:'work'}]}},undefined,{timeout:10000});
      assert.notEqual(result.isError,true);
    }
    const result = await client.callTool({name:'get_shelf',arguments:{}},undefined,{timeout:10000});
    assert.equal(result.structuredContent.chats.length,1);
    assert.equal(result.structuredContent.chats[0].title,'安装隔离验证');
  } finally { await client.close(); }
}
try {
  const bundle = join(temp,'macOS 测试包'), source = join(temp,'source'), legacy = join(temp,'旧版本目录');
  run(process.execPath,['scripts/package.mjs',bundle],process.env);
  run(process.execPath,['scripts/package.mjs','--source',source],process.env);
  run(process.execPath,['scripts/package.mjs',legacy],process.env);
  for (const file of ['package.json','.codex-plugin/plugin.json']) {
    const path = join(legacy,file), json = JSON.parse(readFileSync(path,'utf8'));
    json.version = '0.9.5'; writeFileSync(path,JSON.stringify(json));
  }
  assert.equal(JSON.parse(readFileSync(join(bundle,'snapshot.json'),'utf8')).chats.length,0);
  assert(!existsSync(join(bundle,'.data')) && !existsSync(join(bundle,'.git')));
  assert(statSync(join(bundle,'Install.command')).mode & 0o111);
  assert(existsSync(join(bundle,'package-lock.json')) && !existsSync(join(source,'node_modules')));
  const offline = environment('offline');
  assert(!spawnSync('/usr/bin/which',['node'],{env:offline}).stdout?.length,'模拟新电脑不应依赖 PATH 中的 Node');
  assert(!spawnSync('/usr/bin/which',['npm'],{env:offline}).stdout?.length,'模拟新电脑不应依赖 npm');
  install(legacy,offline,'0.9.5');
  const legacyCache = join(offline.CODEX_HOME,'plugins/cache/pakco-chat-shelf/chat-shelf/0.9.5');
  await useCache(legacyCache,offline,true);
  const before = readFileSync(join(offline.CHAT_SHELF_DATA,'state.json'));
  const output = install(bundle,offline);
  assert.deepEqual(readFileSync(join(offline.CHAT_SHELF_DATA,'state.json')),before,'新目录的新版本安装不得改写用户数据');
  assert(!output.includes('正在按锁文件安装运行依赖'),'完整包不得联网安装依赖');
  const cache = join(offline.CODEX_HOME,'plugins/cache/pakco-chat-shelf/chat-shelf',version);
  assert(existsSync(join(cache,'node_modules/@modelcontextprotocol/sdk')),'运行依赖必须进入客户端独立缓存');
  await useCache(cache,offline);
  install(bundle,offline);
  assert.deepEqual(readFileSync(join(offline.CHAT_SHELF_DATA,'state.json')),before,'重新安装不得改写用户数据');
  renameSync(bundle,bundle + '-moved');
  await useCache(cache,offline);
  console.log('PASS: 完整分享包无需 PATH Node/npm，依赖进入真实客户端缓存；原目录移动后仍能启动 MCP；重新安装保留数据');
  const sourceEnv = environment('source-install',true);
  assert.match(install(source,sourceEnv),/正在按锁文件安装运行依赖/);
  const sourceCache = join(sourceEnv.CODEX_HOME,'plugins/cache/pakco-chat-shelf/chat-shelf',version);
  await useCache(sourceCache,sourceEnv,true);
  console.log('PASS: 源码包显式 npm ci 后安装，独立缓存可以发现 MCP 工具并读写隔离索引');
  const wrapper = join(temp,'host-node'), log = join(temp,'host-node-used');
  writeFileSync(wrapper,`#!/bin/zsh\nprint used >> '${log.replaceAll("'","'\\''")}'\nexec '${process.execPath.replaceAll("'","'\\''")}' "$@"\n`,{mode:0o755});
  run('/bin/zsh',[join(source,'scripts/start.sh'),'--check'],{...sourceEnv,CODEX_MCP_NODE_PATH:wrapper});
  assert(readFileSync(log,'utf8').split('used').length >= 3,'必须优先使用宿主提供的合格 Node');
  writeFileSync(wrapper,'#!/bin/zsh\nexit 1\n',{mode:0o755});
  run('/bin/zsh',[join(source,'scripts/start.sh'),'--check'],{...sourceEnv,CODEX_MCP_NODE_PATH:wrapper});
  console.log('PASS: 优先宿主 Node，宿主路径无效时回退已有合格 Node；启动时不下载依赖');
} finally { rmSync(temp,{recursive:true,force:true}); }

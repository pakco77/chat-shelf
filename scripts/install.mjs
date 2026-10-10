import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const root = realpathSync(fileURLToPath(new URL('../', import.meta.url)));
const manifest = JSON.parse(readFileSync(join(root,'package.json'),'utf8'));
const env = {...process.env, PATH:dirname(process.execPath) + ':' + (process.env.PATH ?? '')};
function run(command,args,options={}) {
  const result = spawnSync(command,args,{cwd:root,env,encoding:'utf8',timeout:120000,...options});
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr?.trim() || `${command} 未完成（${result.status}）`);
  return result.stdout?.trim();
}
function which(command) {
  try { return run('/usr/bin/which',[command]); } catch { return null; }
}
function dependenciesPresent(directory) {
  try {
    const require = createRequire(join(directory,'package.json'));
    const modules = realpathSync(join(directory,'node_modules')) + sep;
    return Object.entries(manifest.dependencies).every(([name,version])=>{
      let parent = dirname(realpathSync(require.resolve(name + '/package.json')));
      while (parent.startsWith(modules)) {
        const file = join(parent,'package.json');
        if (existsSync(file)) {
          const dependency = JSON.parse(readFileSync(file,'utf8'));
          if (dependency.name === name) return dependency.version === version;
        }
        parent = dirname(parent);
      }
      return false;
    });
  } catch { return false; }
}
try {
  if (process.platform !== 'darwin') throw new Error('这个测试版安装器适用于 macOS。');
  const resources = process.env.CODEX_ELECTRON_RESOURCES_PATH;
  const cli = [process.env.CODEX_CLI_PATH,
    resources && join(resources,'codex-cli/CodexCLI.app/Contents/MacOS/codex'),
    '/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex',
    '/Applications/Codex.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex',
    which('codex')].find(path=>path && existsSync(path));
  if (!cli) throw new Error('没有找到 Codex 客户端。请先安装并打开 Codex 桌面客户端，再运行 Install.command。');
  if (!dependenciesPresent(root)) {
    const npm = which('npm');
    if (!npm) throw new Error('源码包需要 npm 安装依赖。请安装 Node（含 npm），或下载已包含依赖的 macOS 测试包。');
    console.log('正在按锁文件安装运行依赖；需要联网。');
    run(npm,['ci','--omit=dev','--ignore-scripts','--no-audit','--no-fund'],{stdio:'inherit',timeout:300000});
    if (!dependenciesPresent(root)) throw new Error('依赖安装未完成，请检查 npm 的错误后重试。');
  }
  run('/bin/zsh',[join(root,'scripts/start.sh'),'--check']);
  console.log(`正在安装对话集 ${manifest.version}。已有整理数据保持原样。`);
  const marketplaces = JSON.parse(run(cli,['plugin','marketplace','list','--json']));
  const previous = marketplaces.marketplaces?.find(marketplace=>marketplace.name === 'pakco-chat-shelf');
  const previousSource = previous?.marketplaceSource;
  let replacedSource = false;
  if (previous && resolve(previous.root) !== root) {
    if (previousSource?.sourceType !== 'local' || !previousSource.source) throw new Error('这个插件市场已经使用其他来源。请在 Codex 插件设置中确认更新来源后再安装本地测试包。');
    run(cli,['plugin','marketplace','remove','pakco-chat-shelf','--json']);
    replacedSource = true;
  }
  try { run(cli,['plugin','marketplace','add',root,'--json']); }
  catch (error) {
    if (replacedSource) {
      try { run(cli,['plugin','marketplace','add',previousSource.source,'--json']); }
      catch { console.error('原安装来源目前无法恢复；已安装的插件缓存和整理数据没有被删除。'); }
    }
    throw error;
  }
  const installed = JSON.parse(run(cli,['plugin','add','chat-shelf@pakco-chat-shelf','--json']));
  if (installed.pluginId !== 'chat-shelf@pakco-chat-shelf' || installed.version !== manifest.version || !installed.installedPath) throw new Error('客户端没有确认安装预期版本，请检查客户端更新后重试。');
  const cache = realpathSync(resolve(installed.installedPath));
  if (!dependenciesPresent(cache)) throw new Error('客户端没有把运行依赖复制到插件缓存。请保留安装窗口信息并反馈；本次没有修改聊天数据。');
  run('/bin/zsh',[join(cache,'scripts/start.sh'),'--check']);
  const listing = JSON.parse(run(cli,['plugin','list','--json']));
  if (!listing.installed?.some(plugin=>plugin.pluginId === installed.pluginId && plugin.enabled === true && plugin.version === manifest.version)) throw new Error('插件已安装但没有启用，请在客户端插件设置中启用「对话集」。');
  console.log('安装完成。请保留这个解压目录，后续更新仍会使用这个安装来源。');
  console.log('回到 Codex 新建一个对话，发送：\n\n打开对话集，把当前可见的聊天标题收录进去\n');
  console.log('如果新对话仍看不到插件，退出并重新打开客户端后再试。');
} catch (error) {
  console.error('安装未完成：' + error.message);
  process.exitCode = 1;
}

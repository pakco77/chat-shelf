import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync, realpathSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(readFileSync(join(root,'package.json'),'utf8'));
const sourceOnly = process.argv.includes('--source');
const output = resolve(process.argv.slice(2).find(arg => arg !== '--source') ?? join(root, '../' + (sourceOnly ? 'duihua-source-' : 'chat-shelf-share-') + manifest.version));
if (existsSync(output)) throw new Error('输出目录已存在，请选择一个新目录');
mkdirSync(output, { recursive:true });
// 分享包只装载程序文件；开发快照、历史、备份和个人验证记录不进入包。
for (const name of ['.agents','.codex-plugin','.mcp.json','Install.command','INSTALL.md','INSTALL.zh-CN.md','LICENSE','PRIVACY.md','PRIVACY.zh-CN.md','README.md','README.zh-CN.md','assets','mcp.json','package.json','package-lock.json','scripts','self-check.mjs','server.mjs','client.mjs','skills','store.mjs','web']) cpSync(join(root,name),join(output,name),{recursive:true});
writeFileSync(join(output,'.gitignore'),'node_modules/\n.data/\n.demo-data/\n*.zip\n.DS_Store\n');
writeFileSync(join(output,'snapshot.json'),JSON.stringify({capturedAt:null,coverage:'本机聊天索引，等待导入',chats:[]},null,2)+'\n');
const modules = sourceOnly ? null : realpathSync(join(root,'node_modules'));
const copied = new Set();
function packageRoot(name, from) {
  const require = createRequire(join(from,'package.json'));
  let location;
  try { location = require.resolve(name + '/package.json'); }
  catch { location = require.resolve(name); }
  let directory = dirname(realpathSync(location));
  while (directory !== dirname(directory)) {
    const file = join(directory,'package.json');
    if (existsSync(file) && JSON.parse(readFileSync(file,'utf8')).name === name) return directory;
    directory = dirname(directory);
  }
  throw new Error('找不到运行依赖：' + name);
}
function include(name, from) {
  const directory = packageRoot(name,from);
  if (copied.has(directory)) return;
  const path = relative(modules,directory);
  if (path.startsWith('..')) throw new Error('运行依赖不在已有 node_modules 中：' + name);
  copied.add(directory);
  // ponytail: 复用已安装依赖的生产闭包，保留嵌套版本和许可证；不复制整套网站依赖。
  cpSync(directory,join(output,'node_modules',path),{recursive:true,filter:src => !relative(directory,src).split('/').includes('node_modules')});
  const manifest = JSON.parse(readFileSync(join(directory,'package.json'),'utf8'));
  for (const dependency of Object.keys(manifest.dependencies ?? {})) include(dependency,directory);
  for (const dependency of Object.keys(manifest.optionalDependencies ?? {})) {
    try { packageRoot(dependency,directory); } catch { continue; }
    include(dependency,directory);
  }
}
if (!sourceOnly) for (const dependency of Object.keys(manifest.dependencies)) include(dependency,root);
const privateIds = JSON.parse(readFileSync(join(root,'snapshot.json'),'utf8')).chats.map(chat => Buffer.from(chat.id));
function verifyPackage(directory) {
  return readdirSync(directory).reduce((sum,name) => {
    const file = join(directory,name), stat = statSync(file);
    if (stat.isDirectory()) return sum + verifyPackage(file);
    const contents = readFileSync(file);
    if (privateIds.some(id => contents.includes(id))) throw new Error('发现开发快照的聊天 ID，停止分发：' + relative(output,file));
    return sum + stat.size;
  },0);
}
const size = verifyPackage(output);
console.log((sourceOnly ? 'GitHub 源码' : '分享包') + '检查通过：0 条对话，不含开发快照 ID；' + copied.size + ' 个运行依赖；' + (size/1024/1024).toFixed(1) + ' MB；' + output);

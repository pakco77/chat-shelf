import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { t, setLocale, getLocale, getLanguage, failureText } from '../web/i18n.js';
import { conversationDay } from '../web/history.js';

const app = readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
const html = readFileSync(new URL('../web/index.html',import.meta.url),'utf8');
const i18n = readFileSync(new URL('../web/i18n.js',import.meta.url),'utf8');
const messages = new Function(i18n.replace(/^export /gm,'') + '\nreturn messages;')();
const keys = [...app.matchAll(/\b(?:t|copy)\('([^']+)'/g)].map(m=>m[1]);
keys.push(...[...html.matchAll(/data-i18n(?:-[\w-]+)?="(\w+)"/g)].map(m=>m[1]));
for (const key of keys) assert(messages[key],'界面使用了缺失的翻译键：' + key);
for (const [key,values] of Object.entries(messages)) {
  assert.equal(values.length,2,key);
  assert(values.every(value=>typeof value === 'string' || value.one && value.other),key);
  const tokens = value=>[...JSON.stringify(value).matchAll(/\{(\w+)\}/g)].map(m=>m[1]);
  assert.deepEqual([...new Set(tokens(values[0]))].sort(),[...new Set(tokens(values[1]))].sort(),'中英文参数不一致：' + key);
}
assert.equal(setLocale('en-GB',['zh-CN']),'en');
assert.equal(getLocale(),'en-GB','客户端语言必须优先于浏览器偏好');
assert.equal(t('chatCount',{count:1}),'1 chat');
assert.equal(t('chatCount',{count:2}),'2 chats');
assert.equal(t('chatCount',{count:5000}),'5,000 chats');
assert.equal(t('colorTitle'),'Color of “”','缺少可选参数不能导致崩溃');
assert.equal(t('missing-key'),'missing-key');
assert.match(failureText({code:'client_connection_closed',reason:'原始中文解释'}),/client closed/);
assert.equal(failureText({code:'unknown',reason:'specific diagnostic'}),'specific diagnostic');
assert.equal(failureText({code:'constructor',reason:'specific diagnostic'}),'specific diagnostic');
assert.equal(conversationDay(Date.now()/1000,new Date(),'en-GB').label,'today');
assert.equal(setLocale('fr-FR',['zh-CN']),'en','不支持的客户端语言应明确回退英文');
assert.equal(getLocale(),'en');
assert.equal(setLocale(null,['zh-CN','en-US']),'zh-CN','独立浏览器使用偏好语言');
assert.equal(t('chatCount',{count:2}),'2 篇');
assert.equal(setLocale('en_US',['zh-CN']),'en');
assert.equal(setLocale('invalid_tag!',['zh-CN']),'zh-CN');
assert.equal(setLocale('',[]),'en');

// 执行页面真实的语言通知与更新路径，不读取用户索引。
let repaint = 0, localized = 0, editing = false;
const parent = {}, title = '自定义标题 <保留>', draft = '尚未保存的名称';
const ui = {
  window:{parent}, pending:new Map(), hostLocale:undefined, languagePending:false,
  navigator:{languages:['zh-CN']}, setLocale, getLocale, t,
  data:{chats:[{title}],revision:12}, search:{value:'原搜索'}, selected:new Set(['chosen']),
  busy:false, opening:false, dragging:[], folderDrag:null, detail:{open:false,dataset:{},querySelector:()=>null},
  document:{activeElement:null,querySelector:()=>editing ? {value:draft} : null},
  localize:()=>{localized++;}, renderSync() {}, render:()=>{repaint++;ui.languagePending=false;},
};
ui.updateLanguage = runInNewContext('(' + app.match(/function updateLanguage\([^]*?\n\}/)[0] + ')',ui);
const receive = runInNewContext('(' + app.match(/window\.addEventListener\('message', (event => \{[^]*?\n\})\);/)[1] + ')',ui);
const notify = (params,source=parent)=>receive({source,data:{jsonrpc:'2.0',method:'ui/notifications/host-context-changed',params}});
notify({locale:'en-US'},{});
assert.equal(ui.hostLocale,undefined,'其他窗口不能更改界面语言');
notify({locale:'en-US'});
assert.equal(getLanguage(),'en');
assert.equal(repaint,1);
assert.equal(ui.data.chats[0].title,title,'语言变化不能翻译用户内容');
assert.equal(ui.search.value,'原搜索');
assert.deepEqual([...ui.selected],['chosen']);
notify({theme:'dark'});
assert.equal(ui.hostLocale,'en-US','部分宿主通知不能清空已有语言');
editing = true; notify({locale:'zh-CN'});
assert.equal(getLanguage(),'zh-CN');
assert.equal(repaint,1,'改名期间不能销毁正在输入的控件');
assert(ui.languagePending && localized===2);
editing = false; ui.updateLanguage();
assert.equal(repaint,2,'编辑结束后必须恢复列表语言');

const esc = runInNewContext('(' + app.match(/^function esc[^\n]+/m)[0] + ')');
const copy = runInNewContext('(' + app.match(/^const copy = ([^\n]+);$/m)[1] + ')',{esc,t});
const unsafeName = '"<img src=x onerror=alert(1)> & 原名';
assert(!copy('colorTitle',{name:unsafeName}).includes('<img'),'翻译变量仍须转义');
assert(copy('colorTitle',{name:unsafeName}).includes('&lt;img'));
setLocale('zh-CN');
console.log('PASS: 中英文键和参数完整、客户端语言优先、浏览器回退、地区和单复数、诊断保留、宿主语言变化、输入与多选保护、翻译变量转义');

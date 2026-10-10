import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, readdirSync, statSync, existsSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createStore, normalizeChats } from './store.mjs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { lastMessageContent, lastMessagePreview, timestampSeconds, folderLayout, sortConversations, conversationDay, cardLayout, portraitPages, titleKeywords } from './web/history.js';
const dir = mkdtempSync(join(tmpdir(), 'chat-shelf-check-'));
try {
  const seedFile = join(dir,'seed.json'), file = join(dir,'state.json');
  // 所有整理检查只操作临时索引，不读取或改写用户的对话整理状态。
  writeFileSync(seedFile,JSON.stringify({chats:[
    {id:'gpt',source:'chatgpt',title:'测试工作',category:'work',updatedAt:1791076242,favorite:true,lastMessagePreview:'保留预览'},
    {id:'codex',source:'codex',title:'测试实现',category:'work'},
  ]}));
  const store = createStore(file,seedFile), keys = ['chatgpt:gpt','codex:codex'];
  const get = (key = keys[0]) => store.snapshot().chats.find(chat => chat.key === key);
  function unchanged(action) {
    const before = JSON.stringify(store.snapshot()), bytes = readFileSync(file,'utf8');
    assert.throws(action);
    assert.equal(JSON.stringify(store.snapshot()),before);
    assert.equal(readFileSync(file,'utf8'),bytes);
  }
  assert.equal(timestampSeconds(1791076242428),1791076242.428);
  assert.equal(timestampSeconds(undefined),0);
  for (const source of ['chatgpt','codex']) {
    const id = '11111111-2222-8333-8444-555555555555';
    const [chat] = normalizeChats([{id,source,title:'原对话',href:'https://chatgpt.com/c/' + id}]);
    assert.equal(chat.href,source === 'codex' ? 'codex://threads/' + id : null,'只有 Codex 本地会话能使用本地恢复入口');
    const [stale] = normalizeChats([{id,source,title:'旧错误链接',href:'codex://threads/' + id}]);
    assert.equal(stale.href,chat.href,'旧索引中的错误链接不能继续用于 ChatGPT 对话');
  }
  const branch = {current_node:'tool',mapping:{old:{message:{author:{role:'assistant'},content:{parts:['旧分支']}}},last:{parent:null,message:{author:{role:'assistant'},content:{parts:['最后一段\n对话']}}},tool:{parent:'last',message:{author:{role:'tool'},content:{parts:['工具输出']}}}}};
  assert.equal(lastMessagePreview(branch),'最后一段 对话');
  assert.equal(lastMessagePreview({...branch,current_node:'missing'}),'');
  assert.equal(lastMessagePreview({lastMessagePreview:':::writing{variant="document" id="12345"} # 真实标题 **真实内容** :::'}),'真实标题 真实内容');
  assert.equal(lastMessagePreview({lastMessagePreview:'图片请求 [User attached 1 image; image contents were not included]'}),'图片请求');
  assert.equal(lastMessagePreview({lastMessagePreview:' x '.repeat(200)}).length,180);
  assert.throws(() => lastMessagePreview({lastMessagePreview:{text:'bad'}}));
  branch.mapping.last.parent='tool'; branch.mapping.last.message.metadata={is_visually_hidden_from_conversation:true};
  assert.equal(lastMessagePreview(branch),'');
  for (const [width,height,count] of [[1120,600],[560,585],[358,420],[288,150],[836,310,6],[1216,598,6],[343,580,6],[1136,522,10]]) {
    const f=folderLayout(width,height,count);
    assert(f.cardWidth/f.cardHeight >= 1.4 && f.cardWidth/f.cardHeight < 1.42);
    assert(f.columns*f.cardWidth+(f.columns-1)*f.gap <= width+0.01);
    assert(f.capacity/f.columns*(f.cardHeight+f.gap)-f.gap <= height);
  }
  assert.equal(folderLayout(560,585).capacity,6);
  // 矮窗口里 6 个文件夹缩小后一屏放下，不再翻页。
  assert.equal(folderLayout(836,310).capacity,3);
  assert.equal(folderLayout(836,310,6).capacity,6);
  // 放不下时缩到最小再分页，文件夹变多不会让每页反而变少。
  assert.equal(folderLayout(1136,522,9).capacity,9);
  assert.equal(folderLayout(1136,522,10).capacity,9);
  const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=';
  const imageBranch={current_node:'image',mapping:{text:{message:{author:{role:'user'},content:{parts:['不要回退到这条旧文字']}}},image:{parent:'text',message:{author:{role:'assistant'},content:{parts:[{content_type:'image_asset_pointer',asset_pointer:'file-service://image'}]}}}}};
  assert.deepEqual(lastMessageContent(imageBranch),{lastMessagePreview:'',lastMessageImage:null});
  imageBranch.mapping.image.message.content.parts=[{type:'image_url',image_url:{url:pixel}},'图片说明'];
  assert.deepEqual(lastMessageContent(imageBranch),{lastMessagePreview:'图片说明',lastMessageImage:pixel});
  imageBranch.current_node='text';
  assert.equal(lastMessageContent(imageBranch).lastMessageImage,undefined);
  for(const value of ['https://example.com/image.png','file:///image.png','data:image/svg+xml;base64,PHN2Zz4=',pixel.replace('png','jpeg'),pixel+'x',42]) assert.throws(()=>lastMessageContent({lastMessageImage:value}));
  store.import({chats:[{id:'gpt',title:'测试工作',lastMessageImage:pixel,lastMessagePreview:'图片说明'}]});
  assert.equal(get().lastMessageImage,pixel);
  store.import({chats:[{id:'gpt',title:'只刷新标题'}]});
  assert.equal(get().lastMessageImage,pixel);
  assert.equal(get().lastMessagePreview,'图片说明');
  store.import({chats:[{id:'gpt',title:'新文字',lastMessagePreview:'新消息'}]});
  assert.equal(get().lastMessageImage,undefined);
  store.undo();
  assert.equal(get().lastMessageImage,pixel);
  const mediaBackup=JSON.parse(readFileSync(store.backup().backupPath,'utf8'));
  assert.equal(mediaBackup.chats.find(c=>c.id==='gpt').lastMessageImage,pixel);
  unchanged(()=>store.import({chats:[{id:'gpt',title:'无效图片',lastMessageImage:'https://example.com/image.jpg'}]}));
  store.import({chats:[{id:'gpt',title:'测试工作',lastMessagePreview:'保留预览'}]});
  const now = new Date(2026,9,5,12), today = new Date(2026,9,5,10).getTime()/1000, yesterday = new Date(2026,9,4,10).getTime()/1000;
  assert.equal(conversationDay(today,now).label,'今天');
  assert.equal(conversationDay(yesterday,now).label,'昨天');
  for (const order of ['recent','oldest']) assert.equal(sortConversations([{id:'missing',updatedAt:0},{id:'old',updatedAt:yesterday},{id:'new',updatedAt:today}],order).at(-1).id,'missing');
  for (const [width,height] of [[1120,460],[820,360],[560,560],[358,460],[288,245]]) {
    const card=cardLayout(width,height), rows=card.capacity/card.columns;
    assert(card.cardHeight > card.cardWidth);
    assert(card.columns*card.cardWidth+(card.columns-1)*16 <= width+0.01);
    assert(rows*card.cardHeight+(rows-1)*16 <= height+0.01);
  }
  assert.equal(cardLayout(560,560).capacity,6);
  // 手机宽度一页至少 2×2，不再一页只有一张。
  assert.equal(cardLayout(343,480).capacity,4);

  const marked = text => titleKeywords(text).filter(part=>part.kind).map(part=>[part.text,part.kind]);
  assert.deepEqual(marked('CAMpass设计迭代梳理'),[['CAMpass','product']]);
  assert.deepEqual(marked('草拟Jev小绿书'),[['Jev','product'],['小绿书','topic']]);
  assert.deepEqual(marked('CNC/CAM 竞品雷达'),[['CNC/CAM','technical'],['竞品雷达','topic']]);
  assert.deepEqual(marked('W40周报总结'),[['周报','topic']]);
  assert.deepEqual(marked('DNA周报'),[['DNA周报','topic']]);
  assert.deepEqual(marked('CAMbridge WebCAM Tucked JEV2'),[]);
  assert.deepEqual(marked('JEV JEV 周报 Tuck'),[['JEV','product'],['周报','topic']]);
  assert.deepEqual(marked('New chat'),[]);
  for (const title of ['','无关键词的标题','CAMpass 与 CAM','<script>JEV</script> & 周报','🗂️ Tuck / JEV / CAM']) {
    assert.equal(titleKeywords(title).map(part=>part.text).join(''),title);
    assert(titleKeywords(title).filter(part=>part.kind).length<=2);
  }

  const six=Array.from({length:6},(_,id)=>({id,updatedAt:today}));
  assert.equal(portraitPages(six,560,531).pages.length,1);
  assert.equal(portraitPages([...six,{id:6,updatedAt:today}],560,531).pages.length,2);
  assert.equal(portraitPages(six,560,443,true).pages.length,1);
  assert.equal(portraitPages(six,560,442,true).pages.length,2);
  const twoDays=[{id:1,updatedAt:today},{id:2,updatedAt:yesterday}];
  assert.equal(portraitPages(twoDays,560,578,true).pages.length,1);
  assert.equal(portraitPages(twoDays,560,577,true).pages.length,2);
  for (const grouped of [true,false]) {
    const input=Array.from({length:29},(_,id)=>({id,updatedAt:today-Math.floor(id/4)*86400}));
    for(const [width,height] of [[1120,480],[560,531],[288,170]]) {
      const result=portraitPages(input,width,height,grouped);
      assert.deepEqual(result.pages.flat(),input);
      for(const page of result.pages) {
        const counts=[];
        for(const chat of page){const day=grouped?conversationDay(chat.updatedAt).id:'all';if(counts.at(-1)?.day===day)counts.at(-1).count++;else counts.push({day,count:1});}
        const used=counts.reduce((sum,group)=>sum+(grouped?32:0)+Math.ceil(group.count/result.columns)*(result.cardHeight+16)-16,0)+(counts.length-1)*16;
        assert(used<=height);
      }
    }
  }


  assert.equal(store.snapshot().version,3);
  assert.equal(store.snapshot().boxes.length,6);
  assert(store.snapshot().boxes.every(box => !Object.hasOwn(box,'source')));
  store.move(keys,'life');
  assert(store.snapshot().chats.every(chat => chat.category === 'life'));
  store.undo();
  assert(store.snapshot().chats.every(chat => chat.category === 'work'));
  store.addProject('共同项目','work',keys);
  const project = store.snapshot().projects[0];
  assert(store.snapshot().chats.every(chat => chat.project === project.id));
  store.renameProject(project.id,'正式项目');
  assert.equal(store.snapshot().projects[0].name,'正式项目');
  store.move([keys[0]],'work');
  assert.equal(get().project,project.id);
  store.move([keys[0]],'life');
  assert.equal(get().project,null);
  store.assignProject([keys[0]],project.id);
  assert.equal(get().category,'work');
  store.assignProject([keys[0]],null);
  assert.equal(get().project,null);
  assert.equal(get().category,'work');
  store.undo();
  const beforeProjectDelete = store.snapshot();
  store.deleteProject(project.id);
  assert.equal(store.snapshot().projects.length,0);
  assert(store.snapshot().chats.every(chat => chat.project === null));
  store.undo();
  assert.deepEqual(store.snapshot().projects,beforeProjectDelete.projects);
  assert.deepEqual(store.snapshot().chats,beforeProjectDelete.chats);

  store.archive([keys[0]]);
  store.trash(keys);
  assert.equal(get().trashPreviousStatus,'archived');
  assert.equal(get(keys[1]).trashPreviousStatus,'active');
  store.trash(keys);
  assert.equal(get().trashPreviousStatus,'archived');
  store.import([{id:'gpt',source:'chatgpt',title:'刷新标题'},{id:'codex',source:'codex',title:'刷新实现'}]);
  assert.equal(get().status,'trashed');
  assert.equal(get().project,project.id);
  assert.equal(get().favorite,true);
  assert.equal(get().lastMessagePreview,'保留预览');
  assert.equal(get().updatedAt,1791076242);
  const restarted = createStore(file,seedFile);
  assert.deepEqual(restarted.snapshot().chats,store.snapshot().chats);
  unchanged(() => store.archive(keys));
  store.restore(keys);
  assert.equal(get().status,'archived');
  assert.equal(get(keys[1]).status,'active');
  assert(!Object.hasOwn(get(),'trashPreviousStatus'));
  store.restore([keys[0]]);
  assert.equal(get().status,'active');
  store.undo();
  assert.equal(get().status,'archived');
  const beforeFolderDelete = store.snapshot();
  store.deleteCategory('work');
  assert.equal(store.snapshot().projects.length,0);
  assert(store.snapshot().chats.every(chat => chat.category === 'inbox' && chat.project === null));
  assert.equal(get().status,'archived');
  store.undo();
  assert.deepEqual(store.snapshot().projects,beforeFolderDelete.projects);
  assert.deepEqual(store.snapshot().chats,beforeFolderDelete.chats);

  unchanged(() => store.move([keys[0],'missing'],'life'));
  unchanged(() => store.archive([keys[0],'missing']));
  unchanged(() => store.trash([keys[0],keys[0]]));
  unchanged(() => store.restore(['missing']));
  unchanged(() => store.addProject('坏批量','life',[keys[0],'missing']));
  unchanged(() => store.assignProject(keys,'missing'));
  unchanged(() => store.import([{id:'gpt',title:'冲突归属',category:'life',project:project.id}]));
  store.import([{id:'codex',source:'codex',title:'只给项目',project:project.id}]);
  assert.equal(get(keys[1]).category,'work');
  unchanged(() => store.addProject('正式项目','work'));
  unchanged(() => store.renameCategory('work','生活'));
  const originalColor = store.snapshot().boxes.find(box => box.id === 'work').color;
  store.setCategoryColor('work','#1234Ab');
  assert.equal(createStore(file,seedFile).snapshot().boxes.find(box => box.id === 'work').color,'#1234ab');
  const colorRevision = store.snapshot().revision;
  store.setCategoryColor('work','#1234AB');
  assert.equal(store.snapshot().revision,colorRevision);
  for (const color of ['red','#abc','#12345678','url(x)',null]) unchanged(() => store.setCategoryColor('work',color));
  unchanged(() => store.setCategoryColor('missing','#123456'));
  const colorBackup = JSON.parse(readFileSync(store.backup().backupPath,'utf8'));
  assert.equal(colorBackup.boxes.find(box => box.id === 'work').color,'#1234ab');
  store.undo();
  assert.equal(store.snapshot().boxes.find(box => box.id === 'work').color,originalColor);
  store.addCategory('自定义颜色');
  const colorFolder = store.snapshot().boxes.find(box => box.name === '自定义颜色');
  store.setCategoryColor(colorFolder.id,'#eeccee');
  const beforeOrder = store.snapshot(), order = beforeOrder.boxes.map(box => box.id).reverse();
  store.reorderCategories(order);
  const reordered = createStore(file,seedFile).snapshot();
  assert.deepEqual(reordered.boxes.map(box => box.id),order,'文件夹排序必须持久化');
  assert.deepEqual(reordered.chats,beforeOrder.chats,'排序不能改变对话或归属');
  assert.deepEqual(reordered.projects,beforeOrder.projects);
  assert.deepEqual(reordered.boxes,[...beforeOrder.boxes].reverse(),'文件夹名称和自定义颜色不能丢失');
  const orderRevision = reordered.revision;
  store.reorderCategories(order);
  assert.equal(store.snapshot().revision,orderRevision,'没有移动时不能产生撤销记录');
  for (const invalid of [null,order.slice(1),[...order,'missing'],order.map(() => order[0]),order.map((id,index) => index ? id : 'missing')]) unchanged(() => store.reorderCategories(invalid));
  const orderBackup = JSON.parse(readFileSync(store.backup().backupPath,'utf8'));
  const emptyOrderSeed = join(dir,'order-seed.json'); writeFileSync(emptyOrderSeed,JSON.stringify({chats:[]}));
  const orderRestore = createStore(join(dir,'order-restore.json'),emptyOrderSeed);
  orderRestore.import(orderBackup);
  assert.deepEqual(orderRestore.snapshot().boxes,reordered.boxes,'新安装恢复备份必须保留文件夹顺序');
  orderRestore.sync([{id:'new-after-order',source:'codex',title:'排序后同步的新对话'}]);
  assert.deepEqual(orderRestore.snapshot().boxes,reordered.boxes,'同步不能重置文件夹顺序');
  store.undo();
  assert.deepEqual(store.snapshot().boxes,beforeOrder.boxes,'撤销排序必须恢复原顺序和颜色');
  const colorRestore = createStore(join(dir,'color-restore.json'),seedFile);
  colorRestore.import(store.snapshot());
  assert.equal(colorRestore.snapshot().boxes.find(box => box.name === '自定义颜色').color,'#eeccee');
  store.undo(); store.undo();
  unchanged(() => store.deleteCategory('inbox'));
  unchanged(() => store.import([{id:'new',title:'有效项'},{id:'bad/id',title:'无效项'}]));
  unchanged(() => store.import([{id:'duplicate',title:'a'},{id:'duplicate',title:'b'}]));
  unchanged(() => store.import([{id:'gpt',source:'chatgpt',title:'错误状态',status:null}]));
  unchanged(() => store.import([{id:'gpt',title:'错误项目',project:'missing'}]));
  unchanged(() => store.import([{id:'gpt',title:'错误常用标记',favorite:null}]));
  unchanged(() => store.import({version:99,chats:[{id:'gpt',title:'未来版本'}]}));
  assert.throws(() => normalizeChats([{id:'valid',title:'a',source:'unknown'}]));
  assert.throws(() => normalizeChats([{id:'valid',title:'a',category:'unknown'}]));
  assert.throws(() => normalizeChats([{id:'valid',title:'a',status:'trashed'}]));

  store.trash([keys[0]]);
  const backup = JSON.parse(readFileSync(store.backup().backupPath,'utf8'));
  assert.equal(backup.version,3);
  assert.deepEqual(backup.projects,store.snapshot().projects);
  assert.equal(backup.chats[0].trashPreviousStatus,'archived');
  const emptySeed = join(dir,'empty.json'); writeFileSync(emptySeed,JSON.stringify({chats:[]}));
  const restored = createStore(join(dir,'restored.json'),emptySeed);
  restored.import(backup);
  assert.deepEqual(restored.snapshot().chats,backup.chats);
  assert.deepEqual(restored.snapshot().projects,backup.projects);
  restored.renameCategory('work','新的工作名');
  restored.import(backup);
  assert.equal(restored.snapshot().boxes.find(box => box.id === 'work').name,'新的工作名');
  assert.equal(restored.snapshot().boxes.length,6);
  const freshRestore = createStore(join(dir,'fresh-restore.json'),emptySeed);
  const renamedBackup = {...backup,boxes:backup.boxes.map(box => box.id === 'work' ? {...box,name:'备份中的职业'} : box)};
  freshRestore.import(renamedBackup);
  assert.equal(freshRestore.snapshot().boxes.find(box => box.id === 'work').name,'备份中的职业');
  assert.deepEqual(freshRestore.snapshot().projects,backup.projects);

  // 两来源同名不同 ID 合并；相同 ID 不同名保留，历史逐条使用各自目录迁移。
  const legacyBoxes = [
    {id:'work',name:'工作',color:'amber',source:'chatgpt'},
    {id:'life',name:'生活',color:'sage',source:'chatgpt'},
    {id:'inbox',name:'待收纳',color:'stone',source:'chatgpt'},
    {id:'work',name:'工程',color:'blue',source:'codex'},
    {id:'personal',name:'生活',color:'sage',source:'codex'},
    {id:'inbox',name:'待整理',color:'stone',source:'codex'},
  ];
  const legacyRows = [
    {id:'g',title:'旧 GPT',source:'chatgpt',category:'work',favorite:true,lastMessagePreview:'旧预览'},
    {id:'c',title:'旧 Codex',source:'codex',category:'work'},
    {id:'l',title:'生活',source:'codex',category:'personal'},
  ];
  const legacyFile = join(dir,'legacy.json'), earlierBoxes = legacyBoxes.map(box => box.source === 'codex' && box.id === 'work' ? {...box,name:'历史工程'} : box);
  const originalLegacy = Buffer.from(JSON.stringify({version:2,boxes:legacyBoxes,chats:legacyRows,history:[[{id:'history-array',title:'数组历史',category:'work'}],{boxes:earlierBoxes,chats:legacyRows}],revision:7},null,1) + '\n');
  writeFileSync(legacyFile,originalLegacy);
  const migrationBackupsBefore = new Set(readdirSync(join(dir,'backups')));
  const migrated = createStore(legacyFile,seedFile), migratedState = migrated.snapshot();
  assert.equal(migratedState.boxes.length,5);
  const originalBackup = readdirSync(join(dir,'backups')).find(name => name.startsWith('pre-v3-') && !migrationBackupsBefore.has(name));
  assert(originalBackup);
  assert.deepEqual(readFileSync(join(dir,'backups',originalBackup)),originalLegacy);
  assert.equal(statSync(join(dir,'backups',originalBackup)).mode & 0o777,0o600);
  const engineering = migratedState.boxes.find(box => box.name === '工程');
  assert.notEqual(engineering.id,'work');
  assert(engineering.id.length <= 128);
  assert.equal(migratedState.chats.find(chat => chat.id === 'c').category,engineering.id);
  assert.equal(migratedState.chats.find(chat => chat.id === 'l').category,'life');
  assert.equal(migratedState.chats[0].favorite,true);
  assert.equal(migratedState.chats[0].lastMessagePreview,'旧预览');
  assert.equal(JSON.parse(readFileSync(legacyFile,'utf8')).version,3);
  assert.deepEqual(createStore(legacyFile,seedFile).snapshot().chats,migratedState.chats);
  migrated.undo();
  const historyEngineering = migrated.snapshot().boxes.find(box => box.name === '历史工程');
  assert.equal(migrated.snapshot().chats.find(chat => chat.id === 'c').category,historyEngineering.id);
  assert.notEqual(historyEngineering.id,engineering.id);
  migrated.undo();
  assert.equal(migrated.snapshot().chats[0].id,'history-array');
  assert.equal(migrated.snapshot().projects.length,0);
  assert.equal(migrated.snapshot().boxes.length,6);
  const corruptFile = join(dir,'corrupt.json'), corrupt = JSON.stringify({boxes:legacyBoxes,chats:legacyRows,history:[{boxes:earlierBoxes,chats:[{id:'bad/id',title:'损坏'}]}],revision:0});
  writeFileSync(corruptFile,corrupt);
  const beforeCorrupt = readdirSync(join(dir,'backups'));
  assert.throws(() => createStore(corruptFile,seedFile));
  assert.equal(readFileSync(corruptFile,'utf8'),corrupt);
  assert.deepEqual(readdirSync(join(dir,'backups')),beforeCorrupt);
  const tooLong = 'a'.repeat(128), longFile = join(dir,'long-id.json');
  writeFileSync(longFile,JSON.stringify({boxes:legacyBoxes.map(box => box.id === 'work' ? {...box,id:tooLong} : box),chats:legacyRows.map(chat => chat.category === 'work' ? {...chat,category:tooLong} : chat)}));
  assert(createStore(longFile,seedFile).snapshot().boxes.every(box => box.id.length <= 128));

  // 旧备份按名称合并，不能替换当前目录或抹掉已有项目、归档与回收站状态。
  const oldBackup = {version:2,boxes:legacyBoxes,chats:legacyRows};
  store.addCategory('独有分类');
  const existingProject = structuredClone(store.snapshot().projects);
  store.import(oldBackup);
  assert(store.snapshot().boxes.some(box => box.name === '独有分类'));
  assert.deepEqual(store.snapshot().projects,existingProject);
  assert.equal(get().status,'trashed');
  store.archive(['chatgpt:g']);
  store.import(oldBackup);
  assert.equal(store.snapshot().chats.find(chat => chat.key === 'chatgpt:g').status,'archived');
  const afterOldImport = store.snapshot();
  store.import(oldBackup);
  assert.deepEqual(store.snapshot().boxes,afterOldImport.boxes);
  assert.deepEqual(store.snapshot().chats,afterOldImport.chats);
  unchanged(() => store.import({...oldBackup,boxes:legacyBoxes.filter(box => box.id !== 'inbox')}));
  unchanged(() => store.import({...backup,projects:[{id:'bad-project',name:'孤立项目',category:'missing'}]}));
  const beforeMergeUndo = store.snapshot();
  store.addCategory('只在现在'); store.undo();
  assert.deepEqual(store.snapshot().boxes,beforeMergeUndo.boxes);
  assert.deepEqual(store.snapshot().projects,beforeMergeUndo.projects);
  assert.deepEqual(store.snapshot().chats,beforeMergeUndo.chats);

  // 预览和 MCP 同时打开同一文件时，旧实例不能覆盖另一实例的归档或分类。
  const concurrentFile = join(dir,'concurrent.json');
  const firstWriter = createStore(concurrentFile,seedFile), secondWriter = createStore(concurrentFile,seedFile);
  firstWriter.archive([keys[0]]);
  const afterArchive = readFileSync(concurrentFile,'utf8');
  assert.throws(() => secondWriter.favorite(keys[0]),/刷新/);
  assert.equal(readFileSync(concurrentFile,'utf8'),afterArchive);
  assert(!existsSync(concurrentFile + '.lock'));
  assert.equal(secondWriter.snapshot().chats[0].status,'archived');
  secondWriter.favorite(keys[0]);
  assert.equal(secondWriter.snapshot().chats[0].status,'archived');
  assert.equal(firstWriter.snapshot().chats[0].favorite,false);
  firstWriter.addCategory('来自另一个窗口');
  const afterCategory = readFileSync(concurrentFile,'utf8');
  assert.throws(() => secondWriter.import([{id:'gpt',title:'旧窗口刷新'}]),/刷新/);
  assert.throws(() => secondWriter.undo(),/刷新/);
  assert.equal(readFileSync(concurrentFile,'utf8'),afterCategory);
  assert(secondWriter.snapshot().boxes.some(box => box.name === '来自另一个窗口'));
  secondWriter.import([{id:'gpt',title:'已刷新窗口'}]);
  assert(secondWriter.snapshot().boxes.some(box => box.name === '来自另一个窗口'));
  writeFileSync(concurrentFile + '.lock','occupied',{flag:'wx'});
  const beforeLocked = readFileSync(concurrentFile,'utf8');
  assert.throws(() => secondWriter.trash(keys),/正在保存/);
  assert.equal(readFileSync(concurrentFile,'utf8'),beforeLocked);
  assert(existsSync(concurrentFile + '.lock'));
  unlinkSync(concurrentFile + '.lock');
  secondWriter.trash(keys);
  assert.equal(createStore(concurrentFile,seedFile).snapshot().chats[0].trashPreviousStatus,'archived');
  const sameRevision = JSON.parse(readFileSync(concurrentFile,'utf8'));
  sameRevision.chats[0].title = '另一实例的同修订号内容';
  writeFileSync(concurrentFile,JSON.stringify(sameRevision));
  assert.throws(() => secondWriter.favorite(keys[0]),/刷新/);
  assert.equal(secondWriter.snapshot().chats[0].title,'另一实例的同修订号内容');

  // 示例数据只写临时目录；代码生成的末图必须通过数据层的 PNG 校验，且全部标为示例。
  const demoDir = join(dir,'demo');
  execFileSync(process.execPath,[fileURLToPath(new URL('./scripts/demo.mjs',import.meta.url))],{env:{...process.env,CHAT_SHELF_NO_HTTP:'1',CHAT_SHELF_DATA:demoDir},stdio:'pipe'});
  const demo = createStore(join(demoDir,'state.json'),seedFile).snapshot();
  assert(demo.coverage.startsWith('示例') && demo.chats.length >= 50 && demo.chats.every(chat => chat.id.startsWith('demo-')));
  assert(demo.chats.filter(chat => chat.lastMessageImage).length >= 5 && demo.projects.length >= 8);
  assert.throws(() => execFileSync(process.execPath,[fileURLToPath(new URL('./scripts/demo.mjs',import.meta.url))],{env:{...process.env,CHAT_SHELF_NO_HTTP:'1',CHAT_SHELF_DATA:demoDir},stdio:'pipe'}));
  execFileSync(process.execPath,[fileURLToPath(new URL('./scripts/demo.mjs',import.meta.url)),'--force'],{env:{...process.env,CHAT_SHELF_NO_HTTP:'1',CHAT_SHELF_DATA:demoDir},stdio:'pipe'});
  // 真实索引也可能存在 .data；--force 只能重建示例，不能按目录名判断可覆盖。
  const realIndex = readFileSync(file), demoFile = join(demoDir,'state.json');
  writeFileSync(demoFile,realIndex);
  assert.throws(() => execFileSync(process.execPath,[fileURLToPath(new URL('./scripts/demo.mjs',import.meta.url)),'--force'],{env:{...process.env,CHAT_SHELF_NO_HTTP:'1',CHAT_SHELF_DATA:demoDir},stdio:'pipe'}),/已有非示例/);
  assert.deepEqual(readFileSync(demoFile),realIndex);

  const client = new Client({name:'shelf-check',version:'1.0.0'},{capabilities:{}});
  const mcp = JSON.parse(readFileSync(new URL('./mcp.json',import.meta.url),'utf8')).mcpServers['chat-shelf'];
  const pluginRoot = fileURLToPath(new URL('.',import.meta.url));
  const transport = new StdioClientTransport({command:mcp.command,args:mcp.args,cwd:join(pluginRoot,mcp.cwd ?? '.'),env:{...process.env,CHAT_SHELF_NO_HTTP:'1',CHAT_SHELF_DATA:join(dir,'mcp')},stderr:'pipe'});
  try {
    await client.connect(transport);
    assert(client.getServerVersion().icons[0].src.startsWith('data:image/svg+xml;base64,'));
    const tools = (await client.listTools()).tools, renderer = tools.find(tool => tool.name === 'open_shelf');
    assert.equal(renderer.title,'对话集');
    assert.equal(renderer._meta.ui.resourceUri,'ui://chat-shelf/main.html');
    assert.deepEqual(renderer._meta['openai/ui'].entrypoints,[{type:'global'},{type:'thread'}]);
    for (const name of ['add_project','rename_project','delete_project','assign_project','archive_chats','trash_chats','restore_chats','set_category_color','reorder_categories']) assert(tools.some(tool => tool.name === name));
    const resource = await client.readResource({uri:'ui://chat-shelf/main.html'});
    assert.equal(resource.contents[0].mimeType,'text/html;profile=mcp-app');
    assert(resource.contents[0].text.includes('ui/initialize'));
    const bundled=resource.contents[0].text.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
    assert(!/^import /m.test(bundled));
    assert(bundled.includes('function titleKeywords') && bundled.includes('function portraitPages'));
    new Function(bundled);
    let opened = await client.callTool({name:'open_shelf',arguments:{}});
    assert.equal(opened.structuredContent.version,3);
    assert(opened.structuredContent.boxes.every(box => box.source === undefined));
    const imported = await client.callTool({name:'import_chats',arguments:{chats:[{id:'mcp-gpt',source:'chatgpt',title:'测试 GPT',lastMessageImage:pixel},{id:'mcp-codex',source:'codex',title:'测试 Codex'}]}});
    assert(!imported.isError);
    assert(imported.structuredContent.chats.every(chat => chat.href === (chat.source === 'codex' ? 'codex://threads/' + chat.id : null)));
    assert.equal(imported.structuredContent.chats.find(c=>c.id==='mcp-gpt').lastMessageImage,pixel);
    const mcpKeys = ['chatgpt:mcp-gpt','codex:mcp-codex'];
    const created = await client.callTool({name:'add_category',arguments:{name:'MCP 分类',source:'codex'}});
    const folder = created.structuredContent.boxes.find(box => box.name === 'MCP 分类');
    const colored = await client.callTool({name:'set_category_color',arguments:{id:folder.id,color:'#336699'}});
    assert.equal(colored.structuredContent.boxes.find(box => box.id === folder.id).color,'#336699');
    const mcpOrder = colored.structuredContent.boxes.map(box => box.id).reverse();
    const sortedFolders = await client.callTool({name:'reorder_categories',arguments:{ids:mcpOrder}});
    assert.deepEqual(sortedFolders.structuredContent.boxes.map(box => box.id),mcpOrder);
    assert.deepEqual(sortedFolders.structuredContent.chats,colored.structuredContent.chats);
    assert.equal((await client.callTool({name:'reorder_categories',arguments:{ids:mcpOrder.slice(1)}})).isError,true);
    assert.deepEqual((await client.callTool({name:'undo_shelf',arguments:{}})).structuredContent.boxes,colored.structuredContent.boxes);
    const badColor = await client.callTool({name:'set_category_color',arguments:{id:folder.id,color:'url(x)'}});
    assert.equal(badColor.isError,true);
    const colorImported = await client.callTool({name:'import_chats',arguments:{chats:[],boxes:[{id:'mcp-color',name:'备份颜色',color:'#eef0ff'},{id:'inbox',name:'待收纳',color:'stone'}]}});
    assert(!colorImported.isError);
    assert.equal(colorImported.structuredContent.boxes.find(box => box.name === '备份颜色').color,'#eef0ff');
    const grouped = await client.callTool({name:'add_project',arguments:{name:'MCP 项目',category:folder.id,keys:mcpKeys}});
    const mcpProject = grouped.structuredContent.projects.find(project => project.name === 'MCP 项目');
    assert(grouped.structuredContent.chats.filter(chat => mcpKeys.includes(chat.key)).every(chat => chat.project === mcpProject.id));
    const archived = await client.callTool({name:'archive_chats',arguments:{keys:mcpKeys}});
    assert(archived.structuredContent.chats.filter(chat => mcpKeys.includes(chat.key)).every(chat => chat.status === 'archived'));
    await client.callTool({name:'trash_chats',arguments:{keys:mcpKeys}});
    const refreshed = await client.callTool({name:'import_chats',arguments:{chats:[{id:'mcp-gpt',title:'刷新 GPT'}]}});
    assert.equal(refreshed.structuredContent.chats.find(chat => chat.id === 'mcp-gpt').status,'trashed');
    const recovered = await client.callTool({name:'restore_chats',arguments:{keys:mcpKeys}});
    assert(recovered.structuredContent.chats.filter(chat => mcpKeys.includes(chat.key)).every(chat => chat.status === 'archived'));
    const invalid = await client.callTool({name:'trash_chats',arguments:{keys:[mcpKeys[0],'missing']}});
    assert.equal(invalid.isError,true);
    assert.deepEqual((await client.callTool({name:'get_shelf',arguments:{}})).structuredContent.chats,recovered.structuredContent.chats);
    const exported = await client.callTool({name:'export_backup',arguments:{}});
    assert.deepEqual(JSON.parse(readFileSync(exported.structuredContent.backupPath,'utf8')).projects,recovered.structuredContent.projects);
    const deleted = await client.callTool({name:'delete_category',arguments:{id:folder.id}});
    assert(!deleted.structuredContent.projects.some(project => project.id === mcpProject.id));
    assert(deleted.structuredContent.chats.filter(chat => mcpKeys.includes(chat.key)).every(chat => chat.category === 'inbox' && chat.project === null && chat.status === 'archived'));
    const undone = await client.callTool({name:'undo_shelf',arguments:{}});
    assert(undone.structuredContent.projects.some(project => project.id === mcpProject.id));
  } finally { await client.close(); }
  await import('./scripts/check-interactions.mjs');
  await import('./scripts/check-i18n.mjs');
  await import('./scripts/check-client.mjs');
  console.log('PASS: 对话集 0.9.6-beta.2 · 预览快捷键、跨页批量选择、移动端交互与连接失败恢复、按来源找回、旧错误链接拦截与复制失败恢复、自定义文件夹颜色与持久化恢复、统一文件夹与旧历史迁移、项目、归档与回收站恢复、刷新保留状态、备份合并、无效批量原子拒绝、并发旧写入拒绝与原文备份、文件夹比例分页、竖卡分页、末图提取和保留清除、关键词标注、MCP 图标与内嵌脚本、示例数据');
} finally { rmSync(dir,{recursive:true,force:true}); }

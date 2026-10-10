import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { lastMessageContent, timestampSeconds } from './web/history.js';

export const boxes = [
  { id:'work', name:'工作', color:'amber' }, { id:'life', name:'生活', color:'sage' },
  { id:'writing', name:'写作', color:'rose' }, { id:'radar', name:'雷达', color:'lilac' },
  { id:'tools', name:'工具', color:'blue' }, { id:'inbox', name:'待收纳', color:'stone' },
];
const sources = ['chatgpt','codex'], colors = boxes.map(b => b.color);
const validColor = color => colors.includes(color) || (typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color));
const idPattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;
const defaultBoxes = () => boxes.map(box => ({...box}));
const nameKey = name => name.normalize('NFKC').toLocaleLowerCase();
function itemName(name) {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 40 || /[\u0000-\u001f\u007f]/.test(name)) throw new Error('名称需为 1–40 个字');
  return name.trim();
}
function stableId(value, used) {
  const base = 'legacy-' + createHash('sha256').update(value).digest('hex').slice(0,24);
  let id = base, suffix = 1;
  while (used.has(id)) id = base + '-' + suffix++;
  return id;
}
function normalizeBoxes(input = defaultBoxes()) {
  if (!Array.isArray(input) || input.length > 128) throw new Error('文件夹格式不正确，最多支持 128 个文件夹');
  const legacy = input.some(box => box?.source !== undefined);
  const ids = new Set(), names = new Set(), mapping = new Map(), groups = new Map();
  for (const box of input) {
    if (!box || typeof box.id !== 'string' || !idPattern.test(box.id) || !validColor(box.color) || (legacy && !sources.includes(box.source))) throw new Error('文件夹格式不正确');
    const name = itemName(box.name), owner = legacy ? box.source + ':' : '', id = owner + box.id, key = owner + nameKey(name);
    if (ids.has(id) || names.has(key)) throw new Error('有重复的文件夹');
    ids.add(id); names.add(key);
    const group = groups.get(nameKey(name)) ?? [];
    group.push({...box,name}); groups.set(nameKey(name),group);
  }
  if (!legacy) {
    if (!ids.has('inbox')) throw new Error('需要保留待收纳文件夹');
    return {boxes:input.map(box => ({id:box.id,name:itemName(box.name),color:box.color})),mapping,legacy};
  }
  if (sources.some(source => input.some(box => box.source === source) && !ids.has(source + ':inbox'))) throw new Error('旧索引缺少待收纳文件夹');
  const inbox = input.find(box => box.id === 'inbox');
  if (!inbox) throw new Error('需要保留待收纳文件夹');
  const inboxName = nameKey(itemName(inbox.name));
  const used = new Set(['inbox']), result = [];
  for (const [name,group] of groups) {
    const first = group[0];
    const id = name === inboxName ? 'inbox' : used.has(first.id) ? stableId(first.source + ':' + first.id + ':' + name,used) : first.id;
    used.add(id); result.push({id,name:first.name,color:first.color});
    for (const box of group) mapping.set(box.source + ':' + box.id,id);
  }
  return {boxes:result,mapping,legacy};
}
function normalizeProjects(input = [], catalog = defaultBoxes()) {
  if (!Array.isArray(input) || input.length > 1000) throw new Error('项目格式不正确，最多支持 1000 个项目');
  const ids = new Set(), names = new Set(), categories = new Set(catalog.map(box => box.id));
  return input.map(project => {
    if (!project || typeof project.id !== 'string' || !idPattern.test(project.id) || !categories.has(project.category)) throw new Error('项目或所属文件夹不正确');
    const name = itemName(project.name), key = project.category + ':' + nameKey(name);
    if (ids.has(project.id) || names.has(key)) throw new Error('同一文件夹中有重复的项目');
    ids.add(project.id); names.add(key);
    return {id:project.id,name,category:project.category};
  });
}
// ponytail: 标题关键词只用于首次摆放；不确定的留在待收纳，用户拖拽决定最终归属。
function suggest(title) {
  if (/雷达|日报|竞品|机会/.test(title)) return 'radar';
  if (/CAM|CNC|Beta|Genmitsu|刀路|周报|进展|里程碑|JEV|Jev|Tuck|WriteX/i.test(title)) return 'work';
  if (/带娃|育儿|手柄|照片|中秋|猫砂|存款|手机号/.test(title)) return 'life';
  if (/文章|写作|配图|图像|图片|图解|封面|公众号|小红书|翻译|润色|Logo/i.test(title)) return 'writing';
  if (/Codex|模型|路由|GitHub|验证|隐私|工具/i.test(title)) return 'tools';
  return 'inbox';
}
export function normalizeChats(input, suggestCategory = false, catalog = defaultBoxes(), projects = []) {
  const rows = Array.isArray(input) ? input : input?.chats;
  if (!Array.isArray(rows) || rows.length > 5000) throw new Error('请导入不超过 5000 条的聊天索引');
  const seen = new Set(), categories = new Set(catalog.map(box => box.id)), projectMap = new Map(projects.map(project => [project.id,project]));
  let imageBytes = 0;
  return rows.map(row => {
    if (!row || typeof row !== 'object') throw new Error('聊天索引格式不正确');
    const id = row.id, source = row.source === undefined ? 'chatgpt' : row.source;
    if (typeof id !== 'string' || !idPattern.test(id) || !sources.includes(source)) throw new Error('聊天来源或 ID 不正确');
    if (row.hostId !== undefined && (typeof row.hostId !== 'string' || !idPattern.test(row.hostId))) throw new Error('对话所在客户端不正确');
    if (typeof row.title !== 'string' || !row.title.trim() || row.title.length > 1000) throw new Error('聊天标题不正确');
    const category = row.category === undefined ? (suggestCategory ? suggest(row.title) : 'inbox') : row.category, project = row.project ?? null, status = row.status === undefined ? 'active' : row.status;
    if (!categories.has(category)) throw new Error('文件夹不存在');
    if (project !== null && (!projectMap.has(project) || projectMap.get(project).category !== category)) throw new Error('项目不存在或不属于该文件夹');
    if (!['active','archived','trashed'].includes(status)) throw new Error('对话状态不正确');
    if (row.favorite !== undefined && typeof row.favorite !== 'boolean') throw new Error('常用标记不正确');
    if (status === 'trashed' && !['active','archived'].includes(row.trashPreviousStatus)) throw new Error('回收站缺少有效的恢复状态');
    const key = source + ':' + id;
    if (seen.has(key)) throw new Error('导入中有重复的聊天');
    seen.add(key);
    const preview = lastMessageContent(row);
    imageBytes += preview.lastMessageImage?.length ?? 0;
    if (imageBytes > 8*1024*1024) throw new Error('图片预览总量超过 8 MB，请减少图片或压缩后导入');
    return {id,key,source,...(row.hostId === undefined ? {} : {hostId:row.hostId}),title:row.title.trim(),updatedAt:timestampSeconds(row.updatedAt ?? row.update_time),...preview,
      category,project,status,...(status === 'trashed' ? {trashPreviousStatus:row.trashPreviousStatus} : {}),favorite:row.favorite === true,
      // codex://threads 只恢复本地会话，不能打开普通 ChatGPT 云端对话。
      href:source === 'codex' && (!row.hostId || row.hostId === 'local') ? 'codex://threads/' + id : null};
  });
}
function normalizeSnapshot(input, suggestCategory = false) {
  const saved = Array.isArray(input) ? {chats:input} : input;
  if (!saved || typeof saved !== 'object' || (saved.version !== undefined && ![1,2,3].includes(saved.version))) throw new Error('索引版本或格式不正确');
  const catalog = normalizeBoxes(saved.boxes), projects = normalizeProjects(saved.projects,catalog.boxes);
  if (!Array.isArray(saved.chats)) throw new Error('聊天索引格式不正确');
  const rows = saved.chats.map(row => {
    if (!catalog.legacy || !row || typeof row !== 'object') return row;
    const oldCategory = row.category === undefined ? (suggestCategory ? suggest(row.title) : 'inbox') : row.category;
    const category = catalog.mapping.get((row.source ?? 'chatgpt') + ':' + oldCategory);
    if (!category) throw new Error('旧对话的文件夹不存在');
    return {...row,category};
  });
  return {boxes:catalog.boxes,projects,chats:normalizeChats(rows,suggestCategory,catalog.boxes,projects),legacy:catalog.legacy};
}
function decodeState(bytes, suggestCategory = false) {
  const saved = JSON.parse(bytes.toString('utf8')), normalized = normalizeSnapshot(saved,suggestCategory), history = saved.history ?? [];
  if (!Array.isArray(history) || history.length > 12) throw new Error('保存的撤销记录损坏，原文件已保留');
  if (saved.revision !== undefined && (!Number.isSafeInteger(saved.revision) || saved.revision < 0)) throw new Error('索引修订号损坏，原文件已保留');
  let migrated = saved.version !== 3 || normalized.legacy;
  const histories = history.map(entry => {
    const value = normalizeSnapshot(entry);
    if (Array.isArray(entry) || value.legacy) migrated = true;
    return {boxes:value.boxes,projects:value.projects,chats:value.chats};
  });
  return {migrated,state:{version:3,boxes:normalized.boxes,projects:normalized.projects,chats:normalized.chats,
    history:histories,revision:saved.revision ?? 0,capturedAt:saved.capturedAt,coverage:saved.coverage}};
}
export function createStore(file, seedFile) {
  const existed = existsSync(file), original = readFileSync(existed ? file : seedFile), decoded = decodeState(original,!existed);
  const token = bytes => bytes === null ? null : createHash('sha256').update(bytes).digest('hex');
  let state = decoded.state, diskToken = existed ? token(original) : null, migrationOriginal = existed && decoded.migrated ? original : null;
  const backupDirectory = join(dirname(file),'backups');
  function readCurrent() {
    try { return readFileSync(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  function refresh() {
    const bytes = readCurrent(), latest = token(bytes);
    if (latest === diskToken) return;
    if (bytes === null) throw new Error('索引文件已被移走，请重新打开对话集');
    const checked = decodeState(bytes);
    state = checked.state; diskToken = latest; migrationOriginal = checked.migrated ? bytes : null;
  }
  const snapshot = () => {
    refresh();
    return structuredClone({version:3,boxes:state.boxes,projects:state.projects,chats:state.chats,revision:state.revision,canUndo:state.history.length > 0,capturedAt:state.capturedAt,coverage:state.coverage,backupDirectory});
  };
  function lockedWrite(change) {
    mkdirSync(dirname(file),{recursive:true});
    const lock = file + '.lock'; let descriptor;
    try { descriptor = openSync(lock,'wx',0o600); }
    catch (error) { if (error.code === 'EEXIST') throw new Error('另一处对话集正在保存，请稍后刷新再试'); throw error; }
    try {
      // ponytail: 本机进程用短排他锁保护检查与写入；异常终止留下的锁需人工清理，不抢占未知持有者。
      if (token(readCurrent()) !== diskToken) throw new Error('索引已在另一处更新，请刷新后重试');
      return change();
    } finally { closeSync(descriptor); unlinkSync(lock); }
  }
  function save(next) {
    if (migrationOriginal) {
      mkdirSync(backupDirectory,{recursive:true});
      const path = join(backupDirectory,'pre-v3-' + new Date().toISOString().replace(/[:.]/g,'-') + '-' + randomUUID().slice(0,8) + '.json');
      writeFileSync(path,migrationOriginal,{mode:0o600,flag:'wx'});
    }
    const temp = file + '.tmp', bytes = Buffer.from(JSON.stringify(next,null,2));
    writeFileSync(temp,bytes,{mode:0o600});
    renameSync(temp,file); state = next; diskToken = token(bytes); migrationOriginal = null;
    return snapshot();
  }
  // 当前内容及每条撤销记录先完整验证，原始字节备份成功后再原子迁移。
  if (migrationOriginal) lockedWrite(() => save(state));
  function mutate(change) {
    const next = structuredClone(state);
    change(next);
    const checked = normalizeSnapshot(next);
    next.boxes = checked.boxes; next.projects = checked.projects; next.chats = checked.chats;
    next.history = [...state.history,{chats:state.chats,boxes:state.boxes,projects:state.projects}].slice(-12);
    next.revision = state.revision + 1;
    return lockedWrite(() => save(next));
  }
  function findBox(id) {
    const box = state.boxes.find(box => box.id === id);
    if (!box) throw new Error('文件夹不存在');
    return box;
  }
  function findProject(id) {
    const project = state.projects.find(project => project.id === id);
    if (!project) throw new Error('项目不存在');
    return project;
  }
  function selected(keys) {
    if (!Array.isArray(keys) || !keys.length || keys.length > 5000) throw new Error('请选择对话');
    const unique = new Set(keys), chats = state.chats.filter(chat => unique.has(chat.key));
    if (unique.size !== keys.length || chats.length !== keys.length) throw new Error('聊天不存在或选择重复');
    return unique;
  }
  function uniqueName(collection,name,except) {
    name = itemName(name);
    if (collection.some(item => item.id !== except && nameKey(item.name) === nameKey(name))) throw new Error('已有同名项目或文件夹');
    return name;
  }
  return {
    snapshot,
    backup() {
      const current = snapshot();
      mkdirSync(backupDirectory,{recursive:true});
      const backupPath = join(backupDirectory,'chat-shelf-' + new Date().toISOString().replace(/[:.]/g,'-') + '-' + randomUUID().slice(0,8) + '.json');
      writeFileSync(backupPath,JSON.stringify({version:3,capturedAt:current.capturedAt,coverage:current.coverage,boxes:current.boxes,projects:current.projects,chats:current.chats},null,2),{mode:0o600,flag:'wx'});
      return {...current,backupPath};
    },
    addCategory(name) {
      name = uniqueName(state.boxes,name);
      if (state.boxes.length >= 128) throw new Error('最多支持 128 个文件夹');
      return mutate(next => next.boxes.splice(next.boxes.findIndex(box => box.id === 'inbox'),0,{id:randomUUID(),name,color:colors[next.boxes.length % 5]}));
    },
    renameCategory(id,name) {
      const box = findBox(id); name = uniqueName(state.boxes,name,id);
      return box.name === name ? snapshot() : mutate(next => { next.boxes.find(box => box.id === id).name = name; });
    },
    setCategoryColor(id,color) {
      const box = findBox(id);
      if (!validColor(color)) throw new Error('请选择内置配色或六位十六进制色号，例如 #336699');
      color = color.toLowerCase();
      return box.color === color ? snapshot() : mutate(next => { next.boxes.find(box => box.id === id).color = color; });
    },
    reorderCategories(ids) {
      if (!Array.isArray(ids) || ids.length !== state.boxes.length || new Set(ids).size !== ids.length || ids.some(id => !state.boxes.some(box => box.id === id))) throw new Error('文件夹列表已变化，请刷新后重新排序');
      if (ids.every((id,index) => id === state.boxes[index].id)) return snapshot();
      return mutate(next => { next.boxes = ids.map(id => next.boxes.find(box => box.id === id)); });
    },
    deleteCategory(id) {
      findBox(id);
      if (id === 'inbox') throw new Error('待收纳用于接收未分类对话，需要保留');
      return mutate(next => {
        next.boxes = next.boxes.filter(box => box.id !== id);
        next.projects = next.projects.filter(project => project.category !== id);
        next.chats.forEach(chat => { if (chat.category === id) { chat.category = 'inbox'; chat.project = null; } });
      });
    },
    move(keys,category) {
      const unique = selected(keys); findBox(category);
      return mutate(next => next.chats.forEach(chat => { if (unique.has(chat.key) && chat.category !== category) { chat.category = category; chat.project = null; } }));
    },
    addProject(name,category,keys = []) {
      findBox(category); name = uniqueName(state.projects.filter(project => project.category === category),name);
      if (state.projects.length >= 1000) throw new Error('最多支持 1000 个项目');
      if (!Array.isArray(keys)) throw new Error('请选择对话');
      const unique = keys.length ? selected(keys) : new Set(), id = randomUUID();
      return mutate(next => {
        next.projects.push({id,name,category});
        next.chats.forEach(chat => { if (unique.has(chat.key)) { chat.project = id; chat.category = category; } });
      });
    },
    renameProject(id,name) {
      const project = findProject(id); name = uniqueName(state.projects.filter(item => item.category === project.category),name,id);
      return project.name === name ? snapshot() : mutate(next => { next.projects.find(project => project.id === id).name = name; });
    },
    deleteProject(id) {
      findProject(id);
      return mutate(next => {
        next.projects = next.projects.filter(project => project.id !== id);
        next.chats.forEach(chat => { if (chat.project === id) chat.project = null; });
      });
    },
    assignProject(keys,id) {
      const unique = selected(keys), project = id === null ? null : findProject(id);
      return mutate(next => next.chats.forEach(chat => { if (unique.has(chat.key)) { chat.project = id; if (project) chat.category = project.category; } }));
    },
    archive(keys) {
      const unique = selected(keys);
      if (state.chats.some(chat => unique.has(chat.key) && chat.status === 'trashed')) throw new Error('请先从回收站恢复对话');
      return mutate(next => next.chats.forEach(chat => { if (unique.has(chat.key)) chat.status = 'archived'; }));
    },
    trash(keys) {
      const unique = selected(keys);
      return mutate(next => next.chats.forEach(chat => { if (unique.has(chat.key) && chat.status !== 'trashed') { chat.trashPreviousStatus = chat.status; chat.status = 'trashed'; } }));
    },
    restore(keys) {
      const unique = selected(keys);
      return mutate(next => next.chats.forEach(chat => { if (unique.has(chat.key)) { chat.status = chat.status === 'trashed' ? chat.trashPreviousStatus : 'active'; delete chat.trashPreviousStatus; } }));
    },
    favorite(key) {
      selected([key]);
      return mutate(next => { const chat = next.chats.find(chat => chat.key === key); chat.favorite = !chat.favorite; });
    },
    sync(rows) {
      refresh();
      const incoming = normalizeChats(rows.map(row => ({id:row.id,source:row.source,hostId:row.hostId,title:row.title,updatedAt:row.updatedAt,lastMessagePreview:row.lastMessagePreview,lastMessageImage:row.lastMessageImage})));
      const previews = new Set(rows.filter(row => row.lastMessagePreview !== undefined || row.lastMessageImage !== undefined).map(row => (row.source ?? 'chatgpt') + ':' + row.id));
      let changed = false;
      const merge = entry => {
        const chats = new Map(entry.chats.map(chat => [chat.key,chat]));
        for (const row of incoming) {
          const old = chats.get(row.key);
          const next = old ? {...old,
            ...(row.updatedAt >= old.updatedAt ? {title:row.title,updatedAt:row.updatedAt} : {}),
            ...(row.updatedAt >= old.updatedAt && previews.has(row.key) ? {lastMessagePreview:row.lastMessagePreview,lastMessageImage:row.lastMessageImage} : {}),
            ...(row.hostId === undefined ? {} : {hostId:row.hostId,href:row.href})} : row;
          if (next.lastMessageImage === undefined) delete next.lastMessageImage;
          if (!old || old.title !== next.title || old.updatedAt !== next.updatedAt || old.hostId !== next.hostId || old.lastMessagePreview !== next.lastMessagePreview || old.lastMessageImage !== next.lastMessageImage) changed = true;
          chats.set(row.key,next);
        }
        if (chats.size > 5000) throw new Error('当前最多整理 5000 条聊天，本次同步未写入');
        return {...entry,chats:[...chats.values()]};
      };
      // 同步内容也合入旧撤销快照，撤销只还原整理，不会抹去新收录的对话或预览。
      const next = merge(structuredClone(state));
      next.history = state.history.map(merge);
      const coverage = '自动同步客户端最近可见对话（标题、时间与可读取的末段）；保留已收录历史';
      if (!changed && state.coverage === coverage) return snapshot();
      next.coverage = coverage; next.revision += 1;
      return lockedWrite(() => save(next));
    },
    import(input) {
      const rawRows = Array.isArray(input) ? input : input?.chats;
      if (!Array.isArray(rawRows) || rawRows.length > 5000) throw new Error('请导入不超过 5000 条的聊天索引');
      if (!Array.isArray(input) && input.version !== undefined && ![1,2,3].includes(input.version)) throw new Error('索引版本不正确');
      const hasCatalog = !Array.isArray(input) && input.boxes !== undefined;
      if (!rawRows.length && !hasCatalog) throw new Error('文件里没有聊天');
      const fresh = state.revision === 0 && !state.chats.length && !state.projects.length && !state.history.length;
      const catalog = hasCatalog && fresh ? [] : structuredClone(state.boxes), projects = structuredClone(state.projects), categoryMap = new Map(), projectMap = new Map();
      let normalizedRows = rawRows;
      if (hasCatalog) {
        const incoming = normalizeSnapshot(input);
        normalizedRows = incoming.chats;
        const used = new Set(catalog.map(box => box.id));
        for (const box of incoming.boxes) {
          const same = incoming.legacy ? catalog.find(item => nameKey(item.name) === nameKey(box.name)) : catalog.find(item => item.id === box.id) ?? catalog.find(item => nameKey(item.name) === nameKey(box.name));
          if (same) categoryMap.set(box.id,same.id);
          else {
            const id = used.has(box.id) ? stableId('import:' + box.id + ':' + nameKey(box.name),used) : box.id;
            used.add(id); catalog.push({...box,id}); categoryMap.set(box.id,id);
          }
        }
        const projectIds = new Set(projects.map(project => project.id));
        for (const project of incoming.projects) {
          const category = categoryMap.get(project.category), same = projects.find(item => item.id === project.id) ?? projects.find(item => item.category === category && nameKey(item.name) === nameKey(project.name));
          if (same) projectMap.set(project.id,same.id);
          else {
            const id = projectIds.has(project.id) ? stableId('project:' + project.id,projectIds) : project.id;
            projectIds.add(id); projects.push({...project,id,category}); projectMap.set(project.id,id);
          }
        }
      } else if (!Array.isArray(input) && input.projects !== undefined) throw new Error('项目备份需要同时包含文件夹');
      const merged = new Map(state.chats.map(chat => [chat.key,chat])), seen = new Set();
      for (const [index,raw] of rawRows.entries()) {
        if (!raw || typeof raw !== 'object') throw new Error('聊天索引格式不正确');
        const key = (raw.source ?? 'chatgpt') + ':' + raw.id;
        if (seen.has(key)) throw new Error('导入中有重复的聊天');
        seen.add(key);
        const existing = merged.get(key), row = normalizedRows[index];
        const category = raw.category === undefined ? existing?.category ?? (hasCatalog ? categoryMap.get(row.category) : 'inbox') : hasCatalog ? categoryMap.get(row.category) : raw.category;
        const project = raw.project === undefined ? existing?.project ?? null : raw.project === null ? null : hasCatalog ? projectMap.get(row.project) : raw.project;
        const parent = projects.find(item => item.id === project);
        const status = raw.status === undefined ? existing?.status ?? 'active' : raw.status;
        const combined = {...raw,hostId:raw.hostId ?? existing?.hostId,category,project,status,
          updatedAt:raw.updatedAt ?? raw.update_time ?? existing?.updatedAt,
          ...lastMessageContent(raw.lastMessagePreview === undefined && raw.lastMessageImage === undefined && raw.mapping === undefined ? existing ?? {} : raw),
          favorite:raw.favorite === undefined ? existing?.favorite ?? false : raw.favorite,
          trashPreviousStatus:raw.trashPreviousStatus ?? existing?.trashPreviousStatus};
        if (raw.project === undefined && parent && parent.category !== category) combined.project = null;
        if (raw.project !== undefined && raw.project !== null && parent) {
          if (raw.category !== undefined && category !== parent.category) throw new Error('项目不属于指定文件夹');
          if (raw.category === undefined) combined.category = parent.category;
        }
        if (status !== 'trashed') delete combined.trashPreviousStatus;
        const chat = normalizeChats([combined],false,catalog,projects)[0];
        merged.set(chat.key,chat);
      }
      if (merged.size > 5000) throw new Error('当前最多整理 5000 条聊天');
      return mutate(next => { next.boxes = catalog; next.projects = projects; next.chats = [...merged.values()]; next.coverage = '本机聊天索引，非全量历史或持续同步'; });
    },
    undo() {
      if (!state.history.length) throw new Error('没有可撤销的操作');
      const next = structuredClone(state), previous = next.history.pop();
      next.chats = previous.chats; next.boxes = previous.boxes; next.projects = previous.projects; next.revision += 1;
      return lockedWrite(() => save(next));
    },
  };
}

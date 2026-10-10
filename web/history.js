function previewText(text) {
  return text.replace(/:::writing\{[^}]*\}/g,'').replace(/:::/g,'').replace(/\[User attached [^\]]+\]/g,'')
    .replace(/(^|\s)#{1,6}\s+/g,'$1').replace(/\*\*|__|`+/g,'')
    .replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/\s+/g,' ').trim().slice(0,180);
}

function imageData(value) {
  if (value === null) return null;
  if (typeof value !== 'string' || value.length > 700000) throw new Error('图片预览需为 512 KB 以内的内嵌图片');
  const match = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[2].length % 4) throw new Error('图片预览仅支持内嵌 PNG、JPEG、WebP 或 GIF');
  const bytes = atob(match[2]), type = match[1];
  if (bytes.length > 512*1024 || !(type === 'png' ? bytes.startsWith('\x89PNG\r\n\x1a\n') : type === 'jpeg' ? bytes.startsWith('\xff\xd8\xff') : type === 'gif' ? /^GIF8[79]a/.test(bytes) : bytes.startsWith('RIFF') && bytes.slice(8,12) === 'WEBP')) throw new Error('图片预览格式或大小不正确');
  return value;
}

export function lastMessageContent(row) {
  if (row.lastMessagePreview !== undefined || row.lastMessageImage !== undefined) {
    if (row.lastMessagePreview !== undefined && typeof row.lastMessagePreview !== 'string') throw new Error('对话预览需为文本');
    return {lastMessagePreview:previewText(row.lastMessagePreview ?? ''),...(row.lastMessageImage === undefined ? {} : {lastMessageImage:imageData(row.lastMessageImage)})};
  }
  // ponytail: 只取当前分支最后可见消息；图片指针没有像素时保留 null，不猜 URL 或回退上一条文字。
  const visited = new Set();
  let node = row.current_node;
  while (node && row.mapping?.[node] && !visited.has(node)) {
    visited.add(node);
    const entry = row.mapping[node], message = entry.message;
    if (['user','assistant'].includes(message?.author?.role) && !message.metadata?.is_visually_hidden_from_conversation && (!message.recipient || message.recipient === 'all')) {
      const parts = message.content?.parts ?? (message.content?.content_type === 'image_asset_pointer' ? [message.content] : []), text = parts.map(p => typeof p === 'string' ? p : p?.type === 'text' ? p.text : '').join(' ').trim();
      const pictures = parts.filter(p => p && typeof p === 'object' && ['image_asset_pointer','image_url','input_image','image'].includes(p.content_type ?? p.type));
      if (pictures.length || /\[User attached \d+ images?;/.test(text)) {
        const picture = pictures.at(-1), value = picture?.image_url?.url ?? picture?.image_url ?? picture?.url ?? (picture?.data && picture?.mimeType ? `data:${picture.mimeType};base64,${picture.data}` : null);
        return {lastMessagePreview:previewText(text),lastMessageImage:typeof value === 'string' && value.startsWith('data:') ? imageData(value) : null};
      }
      if (text) return {lastMessagePreview:previewText(text)};
    }
    node = entry.parent;
  }
  return {lastMessagePreview:''};
}

export function lastMessagePreview(row) { return lastMessageContent(row).lastMessagePreview; }

export function timestampSeconds(value) {
  return Number.isFinite(value) && value > 0 ? (value > 100000000000 ? value / 1000 : value) : 0;
}

export function folderLayout(width,height,count = 0) {
  const gap = width < 600 ? 18 : 28;
  const columns = width < 300 ? 1 : width < 680 ? 2 : 3;
  const widest = Math.min(width<680?250:width<1100?300:400,(width-(columns-1)*gap)/columns);
  let cardWidth = Math.max(1,Math.min(widest,height*1.4));
  // 文件夹不多时宁可缩小一点也一屏放下；放不下时缩到最小尺寸再分页，每页尽量多放。
  const rows = Math.ceil(count/columns), shared = Math.min(widest,(height-(rows-1)*gap)/rows*1.4);
  if (rows > 1) cardWidth = Math.min(cardWidth,Math.max(shared,width < 680 ? 140 : 180));
  const cardHeight = Math.floor(cardWidth/1.4);
  return {columns,gap,cardWidth,cardHeight,capacity:columns*Math.max(1,Math.floor((height+gap)/(cardHeight+gap)))};
}

export function sortConversations(chats, order = 'recent') {
  return [...chats].sort((a,b) => {
    const left = timestampSeconds(a.updatedAt), right = timestampSeconds(b.updatedAt);
    if (!left || !right) return left ? -1 : right ? 1 : a.key.localeCompare(b.key);
    return (order === 'oldest' ? left-right : right-left) || a.key.localeCompare(b.key);
  });
}

export function conversationDay(value, now = new Date(), locale = 'zh-CN') {
  const seconds = timestampSeconds(value), date = new Date(seconds * 1000);
  if (!seconds || Number.isNaN(date.valueOf())) return {id:'unknown',label:'时间未提供'};
  const day = new Date(date); day.setHours(0,0,0,0);
  const today = new Date(now); today.setHours(0,0,0,0);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate()-1);
  const label = day.valueOf() === today.valueOf() ? new Intl.RelativeTimeFormat(locale,{numeric:'auto'}).format(0,'day') : day.valueOf() === yesterday.valueOf() ? new Intl.RelativeTimeFormat(locale,{numeric:'auto'}).format(-1,'day') : date.toLocaleDateString(locale,{...(date.getFullYear() === today.getFullYear() ? {} : {year:'numeric'}),month:'long',day:'numeric'});
  return {id:String(day.valueOf()),label};
}

export function cardLayout(width, height) {
  const gap = 16, min = width < 520 ? 148 : 168;
  const columns = Math.max(1, Math.min(6, Math.floor((width + gap) / (min + gap))));
  let cardWidth = Math.max(1, Math.min(232, (width - (columns - 1) * gap) / columns));
  // 竖版纸页：高宽比可在 1.12–1.42 之间伸缩，宁可略矮也多放一行，避免一页只剩一两张。
  const rows = Math.max(1, Math.floor((height + gap) / (cardWidth * 1.12 + gap)));
  const cardHeight = Math.floor(Math.min(cardWidth * 1.42, (height - (rows - 1) * gap) / rows));
  if (cardHeight <= cardWidth) cardWidth = cardHeight / 1.12;
  return {columns, cardWidth, cardHeight, capacity: columns * rows};
}

export function portraitPages(chats, width, height, grouped = false) {
  const layout = cardLayout(width, Math.max(1,height-(grouped?32:0)));
  const pages = []; let page = [], used = 0, previous = '', column = 0;
  for (const chat of chats) {
    const day = grouped ? conversationDay(chat.updatedAt).id : '';
    const newGroup = grouped && day !== previous;
    let newRow = !page.length || newGroup || column === layout.columns;
    let cost = newRow ? layout.cardHeight + (page.length?16:0) + (newGroup?32:0) : 0;
    if (page.length && used+cost>height) {
      pages.push(page); page=[]; used=0; column=0;
      newRow=true; cost=layout.cardHeight+(grouped?32:0);
    }
    if (newRow) column=0;
    page.push(chat); used+=cost; column++; previous=day;
  }
  if (page.length) pages.push(page);
  return {...layout,pages:pages.length?pages:[[]]};
}

const groups = {
  product: ['ChatGPT','Codex','CAMpass','Genmitsu','WriteX','Tuck','JEV','MiMo','GitHub'],
  topic: ['DNA周报','周报','日报','竞品雷达','雷达','产品定位','原生形态','小绿书','公众号','带娃','育儿','隐私政策','老照片','照片修复','图解','猫砂盆','手柄','中秋','一人公司'],
  technical: ['CNC/CAM','CNC','CAM','G-code','SVG','STL','UI','上下文','多模型路由','模型路由','刀路播放','刀路'],
};
const kinds = new Map(Object.entries(groups).flatMap(([kind, words]) => words.map(word => [word.toLowerCase(),kind])));
const words = [...kinds.keys()].sort((a,b) => b.length-a.length).map(word => word.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
const pattern = new RegExp(words.join('|'),'giu');

// ponytail: 用明确词库识别，不猜测未知专有名词；后续扩展词库即可，正文与原始标题不改写。
export function titleKeywords(title) {
  const parts = [], seen = new Set(); let cursor = 0;
  for (const match of title.matchAll(pattern)) {
    const text=match[0], start=match.index, end=start+text.length, key=text.toLowerCase();
    // 英文词只匹配完整名称，同时允许 CAM设计、使用JEV模型 这样的中英文相邻标题。
    if ((/^[a-z0-9]/i.test(text) && /[a-z0-9_]/i.test(title[start-1]??'')) || (/[a-z0-9]$/i.test(text) && /[a-z0-9_]/i.test(title[end]??'')) || seen.has(key)) continue;
    if (start>cursor) parts.push({text:title.slice(cursor,start)});
    parts.push({text,kind:kinds.get(key)}); seen.add(key); cursor=end;
    if (seen.size===2) break;
  }
  if (cursor<title.length) parts.push({text:title.slice(cursor)});
  return parts;
}

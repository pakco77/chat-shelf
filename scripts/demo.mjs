// 生成「对话集」示例数据：虚构的 ChatGPT / Codex 对话、项目与末图，只写入示例数据目录。
// 用法：CHAT_SHELF_DATA="$PWD/.demo-data" node scripts/demo.mjs [--force]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import { boxes, normalizeChats } from '../store.mjs';

const dir = resolve(process.env.CHAT_SHELF_DATA ?? '.demo-data'), file = join(dir, 'state.json');
// 真实整理数据在 ChatShelf 目录，示例脚本绝不写进去。
if (dir.includes('Application Support/ChatShelf')) throw new Error('示例数据不能写入真实的 ChatShelf 目录');
if (existsSync(file)) {
  const saved = JSON.parse(readFileSync(file,'utf8'));
  if (!String(saved.coverage ?? '').startsWith('示例') || !Array.isArray(saved.chats) || saved.chats.some(chat => typeof chat?.id !== 'string' || !chat.id.startsWith('demo-'))) throw new Error('目录里已有非示例索引，不能覆盖；请指定新的示例目录');
  if (!process.argv.includes('--force')) throw new Error('目录里已有示例 state.json；加 --force 重建示例');
}

// —— 极简光栅画布：抗锯齿线段、圆、多边形，编码为 PNG data URL ——
const crcTable = Array.from({length:256}, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = bytes => { let c = ~0; for (const b of bytes) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (~c) >>> 0; };
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
function canvas(w, h, bg) {
  const px = new Float32Array(w * h * 3), base = hex(bg);
  for (let i = 0; i < w * h; i++) px.set(base, i * 3);
  const dot = (x, y, c, a) => { if (x < 0 || y < 0 || x >= w || y >= h || a <= 0) return; const i = (y * w + x) * 3; for (let k = 0; k < 3; k++) px[i + k] += (c[k] - px[i + k]) * Math.min(1, a); };
  const area = (x0, y0, x1, y1, f) => { for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(h - 1, Math.ceil(y1)); y++) for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(w - 1, Math.ceil(x1)); x++) f(x, y); };
  const api = {
    vgrad(top, bottom) { const a = hex(top), b = hex(bottom); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px.set(a.map((v, k) => v + (b[k] - v) * y / h), (y * w + x) * 3); return api; },
    rect(x, y, rw, rh, color, a = 1) { const c = hex(color); area(x, y, x + rw - 1, y + rh - 1, (i, j) => dot(i, j, c, a)); return api; },
    disc(cx, cy, r, color, a = 1) { const c = hex(color); area(cx - r - 1, cy - r - 1, cx + r + 1, cy + r + 1, (x, y) => dot(x, y, c, a * Math.max(0, Math.min(1, r - Math.hypot(x - cx, y - cy) + .5)))); return api; },
    line(x0, y0, x1, y1, color, width = 2, a = 1) {
      const c = hex(color), r = width / 2, dx = x1 - x0, dy = y1 - y0, len = dx * dx + dy * dy || 1;
      area(Math.min(x0, x1) - r - 1, Math.min(y0, y1) - r - 1, Math.max(x0, x1) + r + 1, Math.max(y0, y1) + r + 1, (x, y) => {
        const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / len));
        dot(x, y, c, a * Math.max(0, Math.min(1, r - Math.hypot(x - x0 - t * dx, y - y0 - t * dy) + .5)));
      });
      return api;
    },
    path(points, color, width = 2, a = 1, dash = 0) { for (let i = 1; i < points.length; i++) if (!dash || i % 2) api.line(...points[i - 1], ...points[i], color, width, a); return api; },
    poly(points, color, a = 1) {
      const c = hex(color), xs = points.map(p => p[0]), ys = points.map(p => p[1]);
      area(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), (x, y) => {
        let inside = false;
        for (let i = 0, j = points.length - 1; i < points.length; j = i++) { const [xi, yi] = points[i], [xj, yj] = points[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside; }
        if (inside) dot(x, y, c, a);
      });
      return api;
    },
    each(f) { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 3; f(x, y, px.subarray(i, i + 3)); } return api; },
    png() {
      const raw = Buffer.alloc((w * 3 + 1) * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w * 3; x++) raw[y * (w * 3 + 1) + 1 + x] = Math.max(0, Math.min(255, Math.round(px[y * w * 3 + x])));
      const chunk = (type, body) => { const head = Buffer.alloc(4), tail = Buffer.alloc(4), typed = Buffer.concat([Buffer.from(type), body]); head.writeUInt32BE(body.length); tail.writeUInt32BE(crc(typed)); return Buffer.concat([head, typed, tail]); };
      const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
      return 'data:image/png;base64,' + Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, {level:9})), chunk('IEND', Buffer.alloc(0))]).toString('base64');
    },
  };
  return api;
}
const roundRect = (x, y, w, h, r, steps = 6) => {
  const pts = [];
  for (const [cx, cy, start] of [[x + w - r, y + r, -90], [x + w - r, y + h - r, 0], [x + r, y + h - r, 90], [x + r, y + r, 180]])
    for (let s = 0; s <= steps; s++) { const t = (start + s * 90 / steps) * Math.PI / 180; pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]); }
  return [...pts, pts[0]];
};

// 1. CAM 刀路预览：切削为青色、空走为橙色虚线
const toolpath = (() => {
  const c = canvas(480, 360, '#1d2631');
  for (let x = 0; x <= 480; x += 24) c.line(x, 0, x, 360, '#263241', 1);
  for (let y = 0; y <= 360; y += 24) c.line(0, y, 480, y, '#263241', 1);
  c.path(roundRect(60, 50, 360, 260, 34), '#c9d3dd', 2.5);
  for (let k = 1; k <= 6; k++) c.path(roundRect(60 + k * 14, 50 + k * 14, 360 - k * 28, 260 - k * 28, Math.max(6, 34 - k * 4)), '#5fc7d6', 1.6, .9 - k * .06);
  const spiral = []; for (let t = 0; t < 26; t += .08) spiral.push([330 + Math.cos(t) * t * 1.9, 180 + Math.sin(t) * t * 1.9]);
  c.path(spiral, '#5fc7d6', 1.3, .95);
  const rapid = []; for (let i = 0; i <= 20; i++) rapid.push([150 + i * 9, 175 + Math.sin(i / 3) * 6]);
  c.path(rapid, '#f0a35e', 2, 1, 1);
  return c.disc(150, 175, 9, '#f0a35e').disc(150, 175, 4, '#1d2631').png();
})();
// 2. 竞品定价柱状图：我们的定价用朱砂突出
const pricing = (() => {
  const c = canvas(480, 360, '#f7f2e8');
  for (let y = 70; y <= 290; y += 55) c.line(48, y, 450, y, '#e2d9c8', 1);
  [[180, '#8d9fb0'], [120, '#8d9fb0'], [205, '#5d7891'], [95, '#c23b22'], [150, '#8d9fb0'], [230, '#5d7891']].forEach(([v, color], i) => c.rect(70 + i * 64, 290 - v, 38, v, color));
  return c.line(48, 290, 450, 290, '#5d544a', 2).png();
})();
// 3. 公众号封面：落日、远山与标题条
const cover = (() => {
  const c = canvas(360, 480, '#f3d9b1').vgrad('#f6e3c3', '#e9a77b');
  c.disc(230, 250, 70, '#c23b22', .92);
  c.poly([[0, 330], [80, 260], [150, 315], [230, 240], [360, 330], [360, 480], [0, 480]], '#7a5643', .85);
  c.poly([[0, 380], [110, 320], [210, 372], [300, 330], [360, 360], [360, 480], [0, 480]], '#4c3427');
  return c.rect(36, 56, 210, 22, '#2b211a').rect(36, 92, 150, 22, '#2b211a').rect(36, 132, 96, 8, '#2b211a', .5).png();
})();
// 4. 老照片修复前后：左半有颗粒与划痕，右半已修复，中间是对比滑块
const photo = (() => {
  let seed = 7; const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const c = canvas(400, 300, '#c9b28a').vgrad('#d8c4a0', '#9c8460');
  c.disc(150, 120, 34, '#5b4632').disc(250, 112, 30, '#5b4632');
  c.poly([[96, 300], [110, 190], [150, 165], [190, 190], [206, 300]], '#4a3828');
  c.poly([[200, 300], [214, 180], [250, 155], [288, 180], [300, 300]], '#4a3828');
  c.each((x, y, p) => { const v = Math.hypot((x - 200) / 200, (y - 150) / 150); const k = 1 - Math.max(0, v - .6) * .6; for (let i = 0; i < 3; i++) p[i] *= k; if (x < 200) { const n = (Math.round(rand() * 4) - 2) * 9; for (let i = 0; i < 3; i++) p[i] += n; } });
  c.line(40, 20, 120, 260, '#efe6d2', 1.2, .8).line(170, 0, 150, 300, '#efe6d2', 1, .6).line(20, 200, 190, 230, '#efe6d2', 1, .5);
  return c.line(200, 0, 200, 300, '#ffffff', 2.5).disc(200, 150, 13, '#ffffff').disc(200, 150, 9, '#9c8460').png();
})();
// 5. WriteX 编辑器首屏线框
const editor = (() => {
  const c = canvas(360, 480, '#e8e3d9');
  c.poly(roundRect(70, 30, 220, 430, 26, 8), '#fbf8f1');
  c.rect(92, 64, 120, 12, '#2b2520').rect(254, 62, 18, 18, '#c23b22');
  [[92, 110, 176], [92, 128, 160], [92, 146, 170], [92, 164, 120], [92, 200, 176], [92, 218, 150], [92, 236, 168], [92, 254, 90]].forEach(([x, y, w]) => c.rect(x, y, w, 7, '#bdb3a4'));
  c.rect(92, 290, 176, 96, '#efe7d9').rect(104, 304, 120, 7, '#cdbfa9').rect(104, 320, 96, 7, '#cdbfa9');
  return c.poly(roundRect(92, 404, 176, 34, 10, 4), '#c23b22').rect(150, 418, 60, 7, '#fbe9df').line(186, 92 + 160, 186, 92 + 172, '#2b2520', 2).png();
})();
// 6. 周末路线：公园、河流与朱砂虚线
const outing = (() => {
  const c = canvas(480, 360, '#ece9dc');
  c.disc(120, 110, 70, '#c3d6ac').disc(170, 150, 50, '#c3d6ac').disc(370, 250, 80, '#c3d6ac');
  const river = []; for (let x = -10; x <= 490; x += 10) river.push([x, 210 + Math.sin(x / 60) * 30]);
  c.path(river, '#9fc4d8', 18);
  for (let x = 0; x <= 480; x += 60) c.line(x, 0, x + 40, 360, '#ddd7c6', 2);
  const route = []; for (let t = 0; t <= 1; t += .025) route.push([110 + 270 * t, 120 + 140 * t * t - 60 * Math.sin(t * 3)]);
  c.path(route, '#c23b22', 3.5, 1, 1);
  for (const [x, y] of [[110, 120], [380, 260]]) c.poly([[x - 12, y - 18], [x + 12, y - 18], [x, y + 2]], '#c23b22').disc(x, y - 22, 13, '#c23b22').disc(x, y - 22, 5, '#fbf8f1');
  return c.png();
})();

const now = Math.floor(Date.now() / 1000), h = 3600, d = 86400;
const P = {campass:['demo-p-campass', 'CAMpass', 'work'], writex:['demo-p-writex', 'WriteX', 'work'], tuck:['demo-p-tuck', 'Tuck', 'work'], weekly:['demo-p-weekly', 'DNA周报', 'work'],
  wechat:['demo-p-wechat', '公众号', 'writing'], green:['demo-p-green', '小绿书', 'writing'], kids:['demo-p-kids', '带娃', 'life'], photo:['demo-p-photo', '老照片修复', 'life'],
  radar:['demo-p-radar', '竞品雷达', 'radar'], route:['demo-p-route', '多模型路由', 'tools']};
// [来源, 标题, 文件夹或项目, 距今秒数, 末段文字或图片, 额外字段]
const rows = [
  ['codex', '实现 G-code 解析 Worker', 'campass', 2 * h, '已把解析放进 Web Worker，主线程只收分段结果。1.2 万行的测试文件从 3.8 秒降到 0.6 秒，npm test 全部通过。剩下大文件的进度条还没接。', {favorite:true}],
  ['chatgpt', 'CAMpass 刀路播放卡顿排查', 'campass', 5 * h, '卡顿主要来自每帧重建整条路径。建议把刀路按 Z 层切块，只重绘视口里的段落；播放头放在单独图层，拖动时不触发整图重算。'],
  ['chatgpt', '刀路预览配色：切削和空走怎么区分', 'campass', d + 3 * h, {image:toolpath, text:'切削用青色实线，空走用橙色虚线，刀具位置用实心圆。'}],
  ['codex', '修复圆弧插补 G02/G03 方向反了', 'campass', 2 * d, '问题在 I/J 偏移的符号：顺时针时圆心用了逆时针公式。补了 6 个圆弧用例，四个象限都覆盖到了。'],
  ['chatgpt', 'CAMpass 首页信息架构', 'campass', 4 * d, '首页只保留三件事：最近的项目、导入文件、继续上次的仿真。设置和教程放进二级页面，新用户第一屏就能把文件拖进来。'],
  ['chatgpt', 'Genmitsu 雕刻机参数表整理', 'campass', 9 * d, '3018-PRO 主轴最高 10000 转。木材建议进给 600 mm/min、下刀 1 mm；亚克力降到 300 mm/min，用单刃铣刀减少熔边。'],
  ['codex', 'CAMpass 单元测试补齐', 'campass', 12 * d, '补了解析器、坐标变换、单位换算三组测试，覆盖率从 41% 到 78%。CI 里加了一个 50 MB 大文件的冒烟测试。'],
  ['chatgpt', 'STL 转刀路的精度取舍', 'campass', 18 * d, '0.05 mm 的弦高误差对木工足够；做模具再降到 0.01 mm，代价是刀路行数增加约 4 倍。'],
  ['chatgpt', 'WriteX 编辑器首屏改版', 'writex', d + 6 * h, {image:editor}],
  ['codex', 'WriteX 草稿自动保存', 'writex', 3 * d, '改成输入停顿 800 ms 后保存，本地保留最近 20 个版本。离线时写入 IndexedDB，联网后合并，冲突时两份都留。'],
  ['chatgpt', 'WriteX 的定价要不要分档', 'writex', 6 * d, '建议先只做一档：免费写作，月付解锁导出与云同步。分档会让早期用户犹豫，等有 500 个付费用户再按数据拆分。'],
  ['chatgpt', 'WriteX 应用商店描述改写', 'writex', 15 * d, '第一句只说结果：「写完就能发」。后面三条卖点各占一行：多平台排版、AI 改稿不改原意、离线也能写。'],
  ['codex', 'WriteX Markdown 导出丢失图片', 'writex', 20 * d, '导出时图片路径相对于草稿目录，复制到别处就断了。现在会把图片一起打包进 assets/，并改写成相对路径。'],
  ['codex', 'Tuck 插件打包脚本', 'tuck', 2 * d + 4 * h, '打包改成白名单，只复制程序文件并生成空白快照。打包后自动扫描是否混入开发数据，发现就中止。'],
  ['chatgpt', 'Tuck 的名字和图标方向', 'tuck', 7 * d, 'Tuck 的意思是把东西塞好、收好。图标可以是一张折起一角的纸，比抽屉更轻，也不会和文件管理器撞脸。'],
  ['codex', 'Tuck 本机服务只监听 127.0.0.1', 'tuck', 10 * d, '已限制 Host 和 Origin，外部页面的请求一律 403。加了一条自检：从局域网地址访问应当失败。'],
  ['chatgpt', 'DNA周报 第 40 周', 'weekly', 3 * d, '本周完成：样机评审、供应商报价对比、App 首页改版。风险：模具交期可能推迟一周，已约备选厂商周四沟通。', {favorite:true}],
  ['chatgpt', 'DNA周报 第 39 周', 'weekly', 10 * d, '本周完成：电池续航测试、包装打样。下周重点是认证资料，需要法务在周三前确认说明书措辞。'],
  ['chatgpt', '周报模板：风险该怎么写', 'weekly', 24 * d, '风险只写三样：发生了什么、影响哪个日期、你已经做了什么。少写「可能」，写清楚需要谁在哪天前做决定。'],
  ['chatgpt', '和供应商谈起订量的话术', 'work', 5 * d, '先给年度预估量，再谈首单。可以提出首单 300 件、价格按 1000 件阶梯，换取 6 个月内补足的承诺。'],
  ['codex', '批量重命名截图脚本', 'work', 8 * d, '脚本按拍摄时间改名为 2026-10-01_序号.png，遇到重名自动加后缀。默认只预览，加 --apply 才真正改名。'],
  ['chatgpt', '公众号封面配图', 'wechat', d + 2 * h, {image:cover}],
  ['chatgpt', '《一人公司的第一年》开头', 'wechat', 3 * d + 5 * h, '开头别讲道理，从一个具体的晚上写起：凌晨一点，第 37 个订单的退货通知。读者会自己问，后来怎么样了？'],
  ['chatgpt', '文章结尾怎么收', 'wechat', 6 * d, '结尾回到开头那条退货通知，但这次你知道该怎么回复了。不用总结三点收获，让变化本身说话。'],
  ['chatgpt', '公众号排版：段落多长合适', 'wechat', 16 * d, '手机上每段不超过 4 行，大约 80 字。长论证拆成小标题，每个小标题下只回答一个问题。'],
  ['chatgpt', '小绿书选题：AI 帮我整理旧对话', 'green', 2 * d, '标题直接用痛点：「三个月的 AI 对话，我找不到上周那一段了」。第一张图放整理前后的对比。'],
  ['chatgpt', '小绿书配图尺寸', 'green', 11 * d, '竖图 3:4 最稳，1080×1440。文字放在上面三分之一，避开底部被标题遮住的区域。'],
  ['codex', '小绿书批量加水印脚本', 'green', 14 * d, '水印放右下角，透明度 35%，字号按图片短边的 4% 设置。已处理 48 张，原图保留在 originals/。'],
  ['chatgpt', '这段话帮我润色但别改意思', 'writing', 4 * d, '改后：「我想做的是让人少花一点时间在找东西上。」只调整了语序和一个虚词，原意没动。'],
  ['chatgpt', '带娃周末去哪里', 'kids', 2 * d + 7 * h, {image:outing, text:'沿河步道串起两个公园，全程 2.4 公里，中间有洗手间和咖啡店。'}],
  ['chatgpt', '三岁孩子挑食怎么办', 'kids', 9 * d, '少量多次，把新食物和他喜欢的放在同一盘；不劝也不夸，连续出现 8 到 10 次才算真正尝试过。'],
  ['chatgpt', '睡前故事：会飞的书架', 'kids', 19 * d, '最后，小熊把那本最旧的书放回最高一层。书架轻轻晃了一下，像是在说：晚安，明天见。'],
  ['chatgpt', '老照片修复效果对比', 'photo', 3 * d + 2 * h, {image:photo}],
  ['codex', '老照片批量去划痕', 'photo', 13 * d, '先自动检测细长亮线做蒙版，再用修补模型处理。12 张里有 2 张把人脸区域误判成划痕，已加手动排除。'],
  ['chatgpt', '中秋给长辈的礼物', 'life', 6 * d + 3 * h, '长辈更在意实用和心意：一套顺手的茶具，加一张手写卡片，比贵重礼盒更容易被记住。'],
  ['chatgpt', '猫砂盆放在哪里最合适', 'life', 22 * d, '远离食盆和水碗，放在安静、有退路的角落。多猫家庭按「猫的数量加一」准备。'],
  ['chatgpt', '竞品雷达：同类 CNC 软件定价', 'radar', 2 * d + h, {image:pricing, text:'六款同类软件里，我们的定价最低，但缺少云端刀路库。'}],
  ['chatgpt', '竞品雷达：笔记类 App 十月更新', 'radar', 8 * d, '三家都在加「AI 整理」：一家做自动标签，一家做每日回顾，一家把聊天记录直接转成笔记。都还没有按项目归档。'],
  ['chatgpt', '竞品雷达 日报 10 月 1 日', 'radar', 6 * d + 9 * h, '今天值得看的两条：一家对手上线团队版，按席位收费；另一家开源了导入工具，支持 ChatGPT 导出格式。'],
  ['chatgpt', '这个开源项目值不值得跟', 'radar', 15 * d, '看三个信号：最近 90 天的提交频率、issue 回复时间、有没有公司在用。前两项不错，还没有生产环境案例。'],
  ['codex', '多模型路由 UI 原型', 'route', 3 * d + 8 * h, '路由表改成按任务类型选模型，界面上只留一个下拉框，默认跟随上次选择，高级选项收进抽屉。', {favorite:true}],
  ['chatgpt', '多模型路由：什么时候用便宜模型', 'route', 7 * d, '分类、改写、提取这类有明确答案的任务用小模型；规划、长文、复杂调试用大模型。先按任务类型分流，再看成本。'],
  ['codex', '路由失败时的降级策略', 'route', 17 * d, '主模型超时 20 秒或返回 5xx 时切到备用模型，同一请求最多重试一次，并在响应头里记下实际使用的模型。'],
  ['chatgpt', 'GitHub Actions 缓存不生效', 'tools', 5 * d + 2 * h, '缓存 key 里带了时间戳，每次都不一样。改成按 package-lock.json 的哈希生成后，命中率从 0 升到 90%。'],
  ['codex', '隐私政策页面生成', 'tools', 21 * d, '按「收集什么、为什么、保存多久、怎么删除」四段生成，每段不超过三句，最后附上联系方式。'],
  ['chatgpt', '薄铝板加工怎么夹', 'inbox', 6 * h, '薄板最好用真空吸附；没有的话用双面胶加四角压板，先铣内轮廓再铣外轮廓，最后留 0.3 mm 的连接桥。'],
  ['codex', '修复导出 SVG 时坐标上下颠倒', 'inbox', d + 9 * h, 'SVG 的 y 轴向下，G-code 的 y 轴向上。导出时统一翻转一次再平移到原点，测试图形已经对齐。'],
  ['chatgpt', '给孩子的英文绘本推荐', 'inbox', 2 * d + 5 * h, '三岁可以从重复句式的绘本开始，比如每页只换一个动物的那种。读的时候指着图说，不用逐字翻译。'],
  ['chatgpt', '一张图讲清上下文窗口', 'inbox', 3 * d + 3 * h, {image:null}],
  ['chatgpt', 'New chat', 'inbox', 4 * d, '好的，我们从第一步开始：先把需求写成一句话，再列出你最不确定的地方。'],
  ['codex', '清理 node_modules 占用的空间', 'inbox', 5 * d + 4 * h, undefined],
  ['chatgpt', '旧版 Logo 讨论', 'writing', 40 * d, '保留圆角方形外框，去掉内部渐变；单色版本要在 16 像素下仍然认得出。', {status:'archived'}],
  ['codex', '弃用的 Electron 打包方案', 'tools', 45 * d, '改用系统自带浏览器打开本机页面后，这套 Electron 配置不再需要，安装包从 180 MB 降到 2 MB。', {status:'archived'}],
  ['chatgpt', '测试一下', 'inbox', 30 * d, '收到，测试成功。', {status:'trashed', trashPreviousStatus:'active'}],
];
const projects = Object.values(P).map(([id, name, category]) => ({id, name, category}));
const chats = normalizeChats(rows.map(([source, title, place, age, body, extra = {}], i) => {
  const project = P[place];
  const content = body === undefined ? {} : typeof body === 'string' ? {lastMessagePreview:body} : {lastMessageImage:body.image, ...(body.text ? {lastMessagePreview:body.text} : {lastMessagePreview:''})};
  return {id:`demo-${String(i + 1).padStart(2, '0')}`, source, title, updatedAt:now - age, category:project ? project[2] : place, project:project ? project[0] : null, ...content, ...extra};
}), false, boxes, projects);
mkdirSync(dir, {recursive:true});
writeFileSync(file, JSON.stringify({version:3, boxes:boxes.map(box => ({...box})), projects, chats, history:[], revision:0, capturedAt:now, coverage:'示例数据：虚构对话，仅用于演示'}, null, 2), {mode:0o600});
console.log(`示例数据已写入 ${file}：${chats.length} 篇对话、${projects.length} 个项目、${chats.filter(c => c.lastMessageImage).length} 张代码生成的末图`);

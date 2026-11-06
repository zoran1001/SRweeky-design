/**
 * AFTERSHOCK 设计团队周报 · 简易同步服务器
 *
 * 作用：
 *  1. 打开页面、给每位成员生成一个短链接，例如 http://localhost:8787/f/a1b2c3d4e5
 *  2. 成员在自己的手机/电脑打开链接，只看到自己的内容，填完直接在线提交
 *  3. 负责人在主界面点「同步成员提交」，就能把最新提交合并进来
 *
 * 用法：
 *  1. 先安装 Node.js（https://nodejs.org ，选 LTS 版本）
 *  2. 在本文件夹打开命令行，运行：node server.js
 *  3. 浏览器访问 http://localhost:8787
 *  4. 想让外网/手机访问，把这个程序放到一台服务器上，或用内网穿透工具把端口映射出去
 *
 * 数据保存在本文件夹的 data/db.json 里，备份这一个文件即可。
 * 不依赖任何第三方库，只用 Node 自带模块。
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const ROOT = __dirname;                                  // 网站根目录（本文件所在文件夹）
const DATA_DIR = path.join(ROOT, "data");                // 数据目录
const DB_FILE = path.join(DATA_DIR, "db.json");          // 数据文件
const PORT = Number(process.env.PORT || 8787);           // 端口，可用环境变量 PORT 覆盖
const PAGE = "aftershock_design_team_kpi_manager.html";  // 主页面文件名
const MAX_BODY = 2 * 1024 * 1024;                        // 请求体最大 2MB，防止被塞爆

/* ---------- 读写数据文件 ---------- */

function loadDB() {
  try {
    const db = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
    db.tokens = db.tokens || {};   // 成员 id → 短令牌
    db.weeks = db.weeks || {};     // 周次 → { members 名册, subs 提交 }
    db.latest = db.latest || null; // 最近一次推送的周次
    return db;
  } catch (e) {
    return { tokens: {}, weeks: {}, latest: null };
  }
}

function saveDB(db) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  // 先写临时文件再改名，避免写到一半断电把数据写坏
  const tmp = DB_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), "utf8");
  fs.renameSync(tmp, DB_FILE);
}

/* ---------- 小工具 ---------- */

function json(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", c => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error("内容太大")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(new Error("内容格式不正确"));
      }
    });
    req.on("error", reject);
  });
}

function newToken() {
  // 5 字节随机数转十六进制 = 10 位字符，猜不到，链接又短
  return crypto.randomBytes(5).toString("hex");
}

function lanAddress() {
  // 找一个能发给同事的局域网 IP（优先 192.168 / 10. / 172.16-31）
  const nets = os.networkInterfaces();
  const all = [];
  Object.keys(nets).forEach(name => {
    (nets[name] || []).forEach(n => {
      if (n.family === "IPv4" && !n.internal) all.push(n.address);
    });
  });
  const preferred = all.find(a => /^192\.168\./.test(a)) ||
    all.find(a => /^10\./.test(a)) ||
    all.find(a => /^172\.(1[6-9]|2\d|3[01])\./.test(a));
  return preferred || all[0] || null;
}

function publicBase(req) {
  // 给成员用的链接前缀：如果负责人是用 localhost 打开，就自动换成局域网 IP
  const host = req.headers.host || ("localhost:" + PORT);
  const hostname = host.split(":")[0];
  const lan = lanAddress();
  if (lan && (hostname === "localhost" || hostname === "127.0.0.1")) {
    return "http://" + lan + ":" + PORT;
  }
  return "http://" + host;
}


const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

/* 只允许访问白名单里的页面，避免别人直接下载 data/db.json */
const PAGES = {
  "/": PAGE,
  "/index.html": "index.html",
  "/share.html": "share.html",
  ["/" + PAGE]: PAGE
};

function sendPage(res, file) {
  const full = path.join(ROOT, file);
  fs.readFile(full, (err, buf) => {
    if (err) { res.writeHead(404); res.end("页面不存在"); return; }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(full)] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    res.end(buf);
  });
}

/* ---------- 接口 ---------- */


const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://" + (req.headers.host || "localhost"));
  const pathname = url.pathname;

  try {
    // 1. 健康检查：前端用它判断当前是不是走服务器模式
    if (pathname === "/api/health") {
      return json(res, 200, { ok: true, time: Date.now(), base: publicBase(req) });
    }

    // 2. 会长：推送本周名册，服务器分配短令牌
    if (pathname === "/api/roster" && req.method === "POST") {
      const body = await readBody(req);
      const week = String(body.week || "").trim();
      if (!week || !Array.isArray(body.members)) {
        return json(res, 400, { error: "缺少周次或成员列表" });
      }
      const db = loadDB();
      const bucket = db.weeks[week] || (db.weeks[week] = { members: {}, subs: {} });
      bucket.members = bucket.members || {};
      bucket.subs = bucket.subs || {};

      body.members.forEach(m => {
        if (!m || !m.id) return;
        if (!db.tokens[m.id]) db.tokens[m.id] = newToken();
        bucket.members[m.id] = {
          id: m.id,
          name: m.name || m.id,
          role: m.role || "",
          desc: m.desc || "",
          color: m.color || "#f17b59",
          kpis: Array.isArray(m.kpis) ? m.kpis : [],
          seed: {                       // 让成员打开链接时能看到已有内容
            t: Array.isArray(m.tasks) ? m.tasks : [],
            b: Array.isArray(m.blockers) ? m.blockers : [],
            p: Array.isArray(m.plans) ? m.plans : []
          }
        };
      });

      db.latest = week;
      saveDB(db);

      const tokens = {};
      body.members.forEach(m => { if (m && m.id) tokens[m.id] = db.tokens[m.id]; });
      return json(res, 200, { week, tokens, base: publicBase(req) });
    }

    // 3. 成员打开短链接时，取自己的资料（其他人拿不到）
    if (pathname.startsWith("/api/fill/") && req.method === "GET") {
      const token = pathname.split("/").pop();
      const db = loadDB();
      const memberId = Object.keys(db.tokens).find(id => db.tokens[id] === token);
      const week = db.latest;
      if (!memberId || !week || !db.weeks[week] || !db.weeks[week].members[memberId]) {
        return json(res, 404, { error: "链接无效或本周还没有生成过填写链接，请联系负责人重新发一条" });
      }
      const m = db.weeks[week].members[memberId];
      const sub = db.weeks[week].subs[memberId] || null;
      return json(res, 200, {
        week,
        member: { id: m.id, name: m.name, role: m.role, desc: m.desc, color: m.color },
        data: m.seed,
        submitted: sub
      });
    }

    // 4. 成员提交（同一个链接重复提交会覆盖上一次）
    if (pathname.startsWith("/api/fill/") && req.method === "POST") {
      const token = pathname.split("/").pop();
      const db = loadDB();
      const memberId = Object.keys(db.tokens).find(id => db.tokens[id] === token);
      const week = db.latest;
      if (!memberId || !week || !db.weeks[week]) {
        return json(res, 404, { error: "链接无效，请联系负责人重新发一条" });
      }
      const body = await readBody(req);
      db.weeks[week].subs[memberId] = {
        tasks: Array.isArray(body.tasks) ? body.tasks : [],
        blockers: Array.isArray(body.blockers) ? body.blockers : [],
        plans: Array.isArray(body.plans) ? body.plans : [],
        submittedAt: new Date().toISOString()
      };
      saveDB(db);
      return json(res, 200, { ok: true, submittedAt: db.weeks[week].subs[memberId].submittedAt });
    }

    // 4.5 兼容旧的长链接：页面发现服务器在跑，就直接按成员身份提交
    if (pathname === "/api/submit" && req.method === "POST") {
      const body = await readBody(req);
      const week = String(body.week || "");
      const memberId = String(body.memberId || "");
      const db = loadDB();
      const bucket = db.weeks[week];
      if (!bucket || !bucket.members || !bucket.members[memberId]) {
        return json(res, 404, { error: "服务器里没有你本周的名册，请让负责人再点一次「邀请成员填写」" });
      }
      bucket.subs = bucket.subs || {};
      bucket.subs[memberId] = {
        tasks: Array.isArray(body.tasks) ? body.tasks : [],
        blockers: Array.isArray(body.blockers) ? body.blockers : [],
        plans: Array.isArray(body.plans) ? body.plans : [],
        submittedAt: new Date().toISOString()
      };
      saveDB(db);
      return json(res, 200, { ok: true, submittedAt: bucket.subs[memberId].submittedAt });
    }

    // 5. 会长同步：取本周所有提交
    if (pathname === "/api/submissions" && req.method === "GET") {
      const week = url.searchParams.get("week") || "";
      const db = loadDB();
      const bucket = db.weeks[week];
      if (!bucket) return json(res, 200, { week, submissions: [] });
      const submissions = Object.keys(bucket.subs || {}).map(memberId => {
        const m = bucket.members[memberId] || {};
        return {
          memberId,
          name: m.name || memberId,
          submittedAt: bucket.subs[memberId].submittedAt,
          data: {
            tasks: bucket.subs[memberId].tasks || [],
            blockers: bucket.subs[memberId].blockers || [],
            plans: bucket.subs[memberId].plans || []
          }
        };
      });
      return json(res, 200, { week, submissions });
    }

    // 6. 成员短链接：/f/令牌 → 直接返回页面，页面会自己识别令牌
    if (pathname.startsWith("/f/")) {
      return sendPage(res, PAGE);
    }

    // 7. 固定页面
    if (PAGES[pathname]) {
      return sendPage(res, PAGES[pathname]);
    }

    // 8. 其他静态资源（不许跳出根目录、不许读 data 目录）
    const ext = path.extname(pathname).toLowerCase();
    if (MIME[ext]) {
      const full = path.join(ROOT, path.normalize(pathname).replace(/^([.][.][/\\])+/, ""));
      if (full.startsWith(ROOT) && !full.startsWith(DATA_DIR)) {
        return fs.readFile(full, (err, buf) => {
          if (err) { res.writeHead(404); res.end("Not found"); return; }
          res.writeHead(200, { "Content-Type": MIME[ext], "Cache-Control": ext === ".html" ? "no-store" : "no-cache" });
          res.end(buf);
        });
      }
    }

    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  } catch (e) {
    json(res, 500, { error: e.message || "服务器内部错误" });
  }
});

// 双击启动器时自动打开浏览器（开机自启用 --quiet 时不会弹页面）
function openPage() {
  if (process.env.AFTERSHOCK_OPEN !== "1") return;
  const lan = Object.values(os.networkInterfaces()).flat()
    .find(n => n && n.family === "IPv4" && !n.internal);
  const url = "http://" + (lan ? lan.address : "localhost") + ":" + PORT + "/";
  require("child_process").exec('start "" "' + url + '"', () => {});
}

// 端口被占用时不要甩一堆报错：说明服务其实已经在跑了
server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    const lan = Object.values(os.networkInterfaces()).flat()
      .find(n => n && n.family === "IPv4" && !n.internal);
    console.log("");
    console.log("  服务已经在运行了，不用再启动一次，帮你直接打开页面。");
    console.log("  管理界面：   http://" + (lan ? lan.address : "localhost") + ":" + PORT);
    openPage();
  } else {
    console.log("  启动失败：" + err.message);
  }
  setTimeout(() => process.exit(0), 800);
});

server.listen(PORT, () => {
  console.log("");
  console.log("  AFTERSHOCK 周报同步服务已启动");
  console.log("  本机访问：   http://localhost:" + PORT);
  // 自动列出局域网地址，方便直接发给同事
  const nets = os.networkInterfaces();
  Object.keys(nets).forEach(name => {
    (nets[name] || []).forEach(n => {
      if (n.family === "IPv4" && !n.internal) {
        console.log("  同事访问：   http://" + n.address + ":" + PORT + "   (" + name + ")");
      }
    });
  });
  console.log("  数据文件：   " + DB_FILE);
  console.log("  停止服务：   Ctrl + C");
  console.log("");
  openPage();
});

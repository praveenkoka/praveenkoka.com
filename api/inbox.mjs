// Private dashboard of /talk conversations, rendered as chat threads.
// Reached only at /inbox-<secret>/ (vercel.json rewrites it here with the secret as ?slug=);
// the secret path and the password live in env vars (INBOX_PATH, INBOX_PASSWORD), never in the repo.
// Anything else gets a 404, and the right path still needs HTTP basic auth (user "praveen").
import { createHash, timingSafeEqual } from "node:crypto";
import { redis, kvConfigured } from "./_kv.mjs";
import { DAILY_CAP_USD } from "./_budget.mjs";

const USER = process.env.INBOX_USER || "praveen";
const READ = "inbox:read"; // hash: conversation id -> time (ms) of the last exchange marked read
const HOUR = 3600 * 1000;
const CHIPS = [
  "Do a little dance!", "Show me some exercise!", "Play some air guitar!", "How was this built?",
  "What do you do at Trilogy?", "What's Tandav Labs?", "What have you learned building AI for ed-tech?",
  "What startups have you built?", "Tell me about your drum music sampling project.",
  "Agentic or vanilla RAG? What did your benchmarks show?", "Why run OpenClaw on a cheap cloud box?",
];

const same = (a, b) => timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());

// Best-effort brake on password guessing: 10 failed attempts per IP per 15 minutes, per instance.
const fails = new Map();
const tooManyFails = (ip) => (fails.get(ip) || []).filter((t) => Date.now() - t < 15 * 60 * 1000).length >= 10;
const noteFail = (ip) => fails.set(ip, [...(fails.get(ip) || []), Date.now()].slice(-20));

function authorized(req) {
  const [scheme, value] = String(req.headers.authorization || "").split(" ");
  if (scheme !== "Basic" || !value) return false;
  const decoded = Buffer.from(value, "base64").toString("utf8");
  const i = decoded.indexOf(":");
  if (i < 0) return false;
  return same(decoded.slice(0, i), USER) && same(decoded.slice(i + 1), process.env.INBOX_PASSWORD);
}

export default async function handler(req, res) {
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  const slug = String(req.query?.slug || "");
  if (!process.env.INBOX_PATH || !process.env.INBOX_PASSWORD || !same(slug, process.env.INBOX_PATH)) {
    return res.status(404).send("Not found");
  }
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "local";
  if (tooManyFails(ip)) return res.status(429).send("Too many attempts. Try again later.");
  if (!authorized(req)) {
    if (req.headers.authorization) noteFail(ip);
    res.setHeader("WWW-Authenticate", 'Basic realm="Talk inbox", charset="UTF-8"');
    return res.status(401).send("Authentication required");
  }
  if (!kvConfigured) return res.status(503).send("Chat log store is not configured");

  // mark read / unread: POST {ids: [...], t: <ms> | 0}; t = 0 marks unread
  if (req.method === "POST") {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const ids = (Array.isArray(body.ids) ? body.ids : []).filter((id) => typeof id === "string" && /^[a-zA-Z0-9-]{8,64}$/.test(id)).slice(0, 500);
    if (!ids.length) return res.status(400).json({ error: "no ids" });
    const t = Number(body.t) || 0;
    await redis([t ? ["HSET", READ, ...ids.flatMap((id) => [id, String(t)])] : ["HDEL", READ, ...ids]]);
    return res.status(200).json({ ok: true });
  }

  const n = Math.min(500, Math.max(10, Number(req.query?.n) || 150));
  const now = Math.floor(Date.now() / HOUR);
  const hours = Array.from({ length: 24 }, (_, i) => `ai-spend:${now - 23 + i}`);
  const [ids, total, spendVals, readFlat] = await redis([["ZREVRANGE", "chats", 0, n - 1], ["ZCARD", "chats"], ["MGET", ...hours], ["HGETALL", READ]]);
  const read = {};
  for (let i = 0; i < (readFlat || []).length; i += 2) read[readFlat[i]] = Number(readFlat[i + 1]);
  const lists = ids.length ? await redis(ids.map((id) => ["LRANGE", `chat:${id}`, 0, -1])) : [];
  const chats = ids.map((id, i) => ({ id, x: (lists[i] || []).map((e) => { try { return JSON.parse(e); } catch { return null; } }).filter(Boolean) }))
    .filter((c) => c.x.length);
  const spent = spendVals.reduce((a, v) => a + (Number(v) || 0), 0);

  const data = JSON.stringify({ chats, total, spent, cap: DAILY_CAP_USD, chips: CHIPS, n, read }).replace(/</g, "\\u003c");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(page(data));
}

const page = (data) => `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Talk inbox</title>
<style>
:root { --bg:#f5f4f0; --panel:#fff; --ink:#16161a; --mut:#6b6b74; --line:#e4e2dc; --me:#16161a; --me-ink:#fff; --him:#fff; --acc:#e0632f; --tag:#f1efe9; --sel:#fff4ec; }
@media (prefers-color-scheme: dark) { :root { --bg:#0e0f14; --panel:#15161d; --ink:#ececf1; --mut:#8c8d99; --line:#262733; --me:#ececf1; --me-ink:#0e0f14; --him:#1d1e27; --acc:#ff8a57; --tag:#22232d; --sel:#221a17; } }
* { box-sizing:border-box; }
body { margin:0; font:14px/1.45 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; background:var(--bg); color:var(--ink); height:100vh; display:flex; flex-direction:column; }
header { display:flex; flex-wrap:wrap; align-items:center; gap:10px 22px; padding:14px 20px; border-bottom:1px solid var(--line); background:var(--panel); }
h1 { font-size:16px; margin:0; letter-spacing:-.01em; }
.stat { color:var(--mut); font-size:13px; } .stat b { color:var(--ink); font-weight:600; }
.app { flex:1; display:grid; grid-template-columns:minmax(260px, 360px) 1fr; min-height:0; }
aside { border-right:1px solid var(--line); display:flex; flex-direction:column; min-height:0; background:var(--panel); }
.tools { padding:10px 12px; border-bottom:1px solid var(--line); display:flex; flex-direction:column; gap:8px; }
.tools input[type=search] { width:100%; padding:8px 10px; border-radius:8px; border:1px solid var(--line); background:var(--bg); color:var(--ink); font:inherit; }
.tools label { font-size:12.5px; color:var(--mut); display:flex; align-items:center; gap:6px; cursor:pointer; }
.list { overflow-y:auto; flex:1; }
.item { display:block; width:100%; text-align:left; padding:11px 14px; border:0; border-bottom:1px solid var(--line); background:none; color:inherit; font:inherit; cursor:pointer; }
.item:hover { background:var(--bg); } .item.on { background:var(--sel); box-shadow:inset 3px 0 0 var(--acc); }
.item .top { display:flex; justify-content:space-between; gap:8px; font-size:12px; color:var(--mut); }
.item .q { margin-top:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.pill { display:inline-block; font-size:11px; padding:1px 7px; border-radius:999px; background:var(--tag); color:var(--mut); margin-left:4px; }
.pill.typed { background:var(--acc); color:#fff; }
main { overflow-y:auto; padding:18px 22px 40px; min-height:0; }
.meta { color:var(--mut); font-size:12.5px; margin:0 0 16px; display:flex; flex-wrap:wrap; gap:6px 14px; align-items:center; }
.back { display:none; border:1px solid var(--line); background:var(--panel); color:var(--ink); border-radius:8px; padding:5px 10px; font:inherit; cursor:pointer; }
.ex { display:flex; flex-direction:column; gap:6px; margin-bottom:14px; max-width:760px; }
.b { max-width:78%; padding:9px 13px; border-radius:16px; white-space:pre-wrap; overflow-wrap:anywhere; }
.b.me { align-self:flex-start; background:var(--him); border:1px solid var(--line); border-bottom-left-radius:5px; }
.b.him { align-self:flex-end; background:var(--me); color:var(--me-ink); border-bottom-right-radius:5px; }
.who { font-size:11px; color:var(--mut); text-transform:uppercase; letter-spacing:.08em; }
.b.me.chip { opacity:.72; }
.sub { font-size:11.5px; color:var(--mut); display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
.sub.r { align-self:flex-end; } .sub.l { align-self:flex-start; }
.item.unread .q { font-weight:650; } .item.unread .when::before { content:""; display:inline-block; width:8px; height:8px; border-radius:50%; background:var(--acc); margin-right:6px; vertical-align:1px; }
.item:not(.unread) { color:var(--mut); }
.btn { border:1px solid var(--line); background:var(--panel); color:var(--ink); border-radius:8px; padding:5px 10px; font:inherit; font-size:12.5px; cursor:pointer; }
.btn:hover { border-color:var(--mut); }
.row { display:flex; gap:12px; align-items:center; flex-wrap:wrap; }
.tag { font-size:11px; padding:1px 7px; border-radius:999px; background:var(--tag); }
.tag.warn { background:#c0392b; color:#fff; }
.empty { color:var(--mut); padding:40px 0; text-align:center; }
@media (max-width: 760px) {
  .app { grid-template-columns:1fr; }
  .app.reading aside { display:none; } .app:not(.reading) main { display:none; }
  .back { display:inline-block; }
  .b { max-width:88%; }
}
</style></head>
<body>
<header><h1>Talk inbox</h1><span class="stat" id="stats"></span></header>
<div class="app" id="app">
  <aside>
    <div class="tools">
      <input type="search" id="search" placeholder="Search questions and answers" aria-label="Search conversations">
      <label><input type="checkbox" id="typed"> Only conversations with typed questions</label>
      <div class="row"><label><input type="checkbox" id="unreadOnly"> Unread only</label><button type="button" class="btn" id="allRead">Mark all read</button></div>
    </div>
    <div class="list" id="list" role="list"></div>
  </aside>
  <main id="thread"><p class="empty">Pick a conversation. Unread ones have an orange dot.</p></main>
</div>
<script>
const D = ${data};
const chip = new Set(D.chips);
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const fmt = (t) => new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 60 ? m + "m ago" : m < 1440 ? Math.round(m / 60) + "h ago" : Math.round(m / 1440) + "d ago"; };
const chats = D.chats.map((c) => ({ ...c, last: c.x[c.x.length - 1].t, typed: c.x.filter((e) => !chip.has(e.q.trim())).length, country: (c.x.find((e) => e.c) || {}).c || "??" }))
  .sort((a, b) => b.last - a.last);
const exchanges = chats.reduce((a, c) => a + c.x.length, 0);
// read state, shared across devices; a conversation turns unread again when new messages arrive
const read = D.read || {};
const isUnread = (c) => !(read[c.id] >= c.last);
const save = (ids, t) => fetch(location.pathname, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, t }) }).catch(() => {});
function markRead(cs) { const now = Date.now(); cs.forEach((c) => (read[c.id] = c.last)); save(cs.map((c) => c.id), Math.max(...cs.map((c) => c.last))); renderStats(); }
function markUnread(c) { delete read[c.id]; save([c.id], 0); renderList(); renderStats(); }
function renderStats() {
$("stats").innerHTML = "";
[["Unread", chats.filter(isUnread).length], ["Conversations", D.total + (D.total > chats.length ? " (latest " + chats.length + " shown)" : "")], ["Exchanges shown", exchanges],
 ["With typed questions", chats.filter((c) => c.typed).length], ["AI spend, last 24h", "$" + D.spent.toFixed(3) + " of $" + D.cap]]
  .forEach(([k, v], i) => { const s = el("span", "stat"); s.append(k + ": "); s.append(el("b", null, String(v))); $("stats").append(s, " "); });
}
renderStats();

let current = null;
function renderList() {
  const q = $("search").value.trim().toLowerCase(), onlyTyped = $("typed").checked, onlyUnread = $("unreadOnly").checked;
  const list = $("list"); list.innerHTML = "";
  const shown = chats.filter((c) => (!onlyTyped || c.typed) && (!onlyUnread || isUnread(c) || c === current) && (!q || c.x.some((e) => (e.q + " " + e.a).toLowerCase().includes(q))));
  if (!shown.length) list.append(el("p", "empty", "Nothing matches."));
  for (const c of shown) {
    const b = el("button", "item" + (c === current ? " on" : "") + (isUnread(c) ? " unread" : "")); b.type = "button"; b.setAttribute("role", "listitem");
    const top = el("div", "top"); top.append(el("span", "when", fmt(c.last) + " · " + ago(c.last)));
    const right = el("span", null, c.country); right.append(el("span", "pill", c.x.length + " msg"));
    if (c.typed) right.append(el("span", "pill typed", c.typed + " typed"));
    top.append(right); b.append(top);
    const firstTyped = c.x.find((e) => !chip.has(e.q.trim())) || c.x[0];
    b.append(el("div", "q", firstTyped.q));
    b.onclick = () => open(c);
    list.append(b);
  }
}
function open(c) {
  current = c; if (isUnread(c)) markRead([c]); renderList(); $("app").classList.add("reading");
  const m = $("thread"); m.innerHTML = ""; m.scrollTop = 0;
  const meta = el("div", "meta");
  const back = el("button", "back", "← All conversations"); back.type = "button"; back.onclick = () => { $("app").classList.remove("reading"); };
  meta.append(back, el("span", null, "Started " + fmt(c.x[0].t)), el("span", null, "Last " + fmt(c.last)), el("span", null, c.country), el("span", null, c.x.length + " exchanges, " + c.typed + " typed"), el("span", null, "id " + c.id.slice(0, 8)));
  const un = el("button", "btn", "Mark unread"); un.type = "button"; un.onclick = () => markUnread(c); meta.append(un);
  m.append(meta);
  for (const e of c.x) {
    const ex = el("div", "ex"), isChip = chip.has(e.q.trim());
    ex.append(el("div", "b me" + (isChip ? " chip" : ""), e.q));
    const sr = el("div", "sub l"); sr.append(el("span", "who", "Visitor"), el("span", null, fmt(e.t))); if (isChip) sr.append(el("span", "tag", "chip")); ex.append(sr);
    ex.append(el("div", "b him", e.a));
    const sl = el("div", "sub r"); sl.append(el("span", "who", "Avatar"));
    if (e.g) sl.append(el("span", "tag", e.g));
    if (e.w) sl.append(el("span", "tag", "→ " + e.w));
    if (e.o) sl.append(el("span", "tag warn", "out of tokens"));
    if (e.r) sl.append(el("span", "tag warn", "rate limited"));
    ex.append(sl);
    m.append(ex);
  }
}
$("search").addEventListener("input", renderList);
$("typed").addEventListener("change", renderList);
$("unreadOnly").addEventListener("change", renderList);
$("allRead").addEventListener("click", () => { markRead(chats.filter(isUnread)); renderList(); });
renderList();
// nothing opens by itself, so nothing gets marked read without you looking at it
</script>
</body></html>`;

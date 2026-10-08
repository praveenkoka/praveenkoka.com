// Local dev server: static files from public/ plus the /api functions, mirroring Vercel.
// Usage: node --env-file=.env.local scripts/dev.mjs  (http://localhost:3000)
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const ROOT = new URL("../public/", import.meta.url).pathname;
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json",
  ".jpg": "image/jpeg", ".png": "image/png", ".ico": "image/x-icon", ".glb": "model/gltf-binary", ".xml": "application/xml",
  ".txt": "text/plain", ".webmanifest": "application/manifest+json" };

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname.startsWith("/api/")) {
    const name = url.pathname.slice(5).replace(/[^a-z]/g, "");
    let body = "";
    for await (const c of req) body += c;
    req.body = body ? JSON.parse(body) : {};
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (o) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(o)); };
    res.send = (b) => res.end(b);
    try { (await import(`../api/${name}.mjs`)).default(req, res); } catch (e) { res.statusCode = 404; res.end(String(e)); }
    return;
  }
  let p = normalize(join(ROOT, decodeURIComponent(url.pathname)));
  if (!p.startsWith(ROOT)) { res.statusCode = 403; return res.end(); }
  try { if ((await stat(p)).isDirectory()) p = join(p, "index.html"); } catch {}
  try {
    const data = await readFile(p);
    res.setHeader("Content-Type", TYPES[extname(p)] || "application/octet-stream");
    res.end(data);
  } catch { res.statusCode = 404; res.end("not found"); }
}).listen(3000, () => console.log("http://localhost:3000"));

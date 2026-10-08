// Prints recent /talk conversations from the Upstash chat log, newest first.
// Usage:
//   vercel env pull .env.chats --environment=production --yes
//   node --env-file=.env.chats scripts/chats.mjs [conversations=20]
//   rm .env.chats
import { redis, kvConfigured } from "../api/_kv.mjs";

if (!kvConfigured) { console.error("Set KV_REST_API_URL and KV_REST_API_TOKEN (see usage at the top)."); process.exit(1); }
const limit = Number(process.argv[2] || 20);
const [ids, total, keys] = await redis([["ZREVRANGE", "chats", 0, limit - 1], ["ZCARD", "chats"], ["DBSIZE"]]);
console.log(`${total} conversations stored (${keys} keys in the database). Showing ${ids.length}, newest first.\n`);
if (!ids.length) process.exit(0);
const lists = await redis(ids.map((id) => ["LRANGE", `chat:${id}`, 0, -1]));
ids.forEach((id, i) => {
  const entries = (lists[i] || []).map((e) => JSON.parse(e));
  if (!entries.length) return;
  const first = new Date(entries[0].t), country = entries.find((e) => e.c)?.c || "??";
  console.log(`── ${first.toLocaleString()}  ·  ${country}  ·  ${entries.length} exchange${entries.length === 1 ? "" : "s"}  ·  ${id.slice(0, 8)}`);
  for (const e of entries) {
    console.log(`  Q: ${e.q}`);
    console.log(`  A: ${e.a}${e.g ? `  [${e.g}]` : ""}${e.o ? "  [out of tokens]" : ""}`);
  }
  console.log();
});

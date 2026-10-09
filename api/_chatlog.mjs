// Anonymous chat log in Upstash Redis, sized to stay inside the free tier
// (500K commands/month, 256 MB): one list per conversation, one compact entry per exchange.
// Bounds: MAX_SESSIONS conversations x MAX_ENTRIES exchanges, each kept for TTL_DAYS.
// Oldest conversations are deleted first when the cap is reached. No IPs are stored.
import { redis, kvConfigured } from "./_kv.mjs";

const MAX_SESSIONS = Number(process.env.CHATLOG_MAX_SESSIONS || 4000);
const MAX_ENTRIES = 40;
const TTL_DAYS = 60;
const TTL = TTL_DAYS * 86400;
const INDEX = "chats"; // sorted set: session id -> last activity (ms)

export const validSid = (s) => typeof s === "string" && /^[a-zA-Z0-9-]{8,64}$/.test(s);

export async function logExchange({ sid, question, reply, gesture, world, country, outOfTokens, rateLimited }) {
  if (!kvConfigured || !validSid(sid)) return;
  const now = Date.now();
  const entry = JSON.stringify({
    t: now,
    q: String(question || "").slice(0, 240),
    a: String(reply || "").slice(0, 400),
    ...(gesture && gesture !== "none" ? { g: gesture } : {}),
    ...(world ? { w: world } : {}),
    ...(country ? { c: String(country).slice(0, 2) } : {}),
    ...(outOfTokens ? { o: 1 } : {}),
    ...(rateLimited ? { r: 1 } : {}),
  });
  const key = `chat:${sid}`;
  try {
    // 4 commands per exchange
    await redis([["RPUSH", key, entry], ["LTRIM", key, -MAX_ENTRIES, -1], ["EXPIRE", key, TTL], ["ZADD", INDEX, now, sid]]);
    if (Math.random() < 0.05) await prune(); // occasional housekeeping, ~1 in 20 requests
  } catch (e) {
    console.error("[chatlog] write failed", e);
  }
}

// Drop index entries for expired conversations; if still over the cap, delete the oldest conversations.
export async function prune() {
  const [, count] = await redis([["ZREMRANGEBYSCORE", INDEX, 0, Date.now() - TTL * 1000], ["ZCARD", INDEX]]);
  if (count <= MAX_SESSIONS) return;
  const extra = count - MAX_SESSIONS + Math.ceil(MAX_SESSIONS * 0.05); // free 5% headroom at once
  const [oldest] = await redis([["ZRANGE", INDEX, 0, extra - 1]]);
  if (oldest?.length) await redis([["DEL", ...oldest.map((s) => `chat:${s}`)], ["ZREM", INDEX, ...oldest]]);
}

// Rolling 24-hour AI spend cap, shared across all function instances via Upstash Redis (REST).
// Spend is kept in hourly buckets that expire after 25 hours, so "the last 24 hours" is the sum of
// the current bucket and the 23 before it, and we can say how long until enough of it ages out.
// Without KV_REST_API_URL / KV_REST_API_TOKEN it falls back to per-instance memory (local dev).

export const DAILY_CAP_USD = Number(process.env.DAILY_AI_BUDGET_USD || 1);

// Gemini paid-tier list prices, USD per 1M tokens (override via env if they change)
const PRICE = {
  chatIn: Number(process.env.PRICE_CHAT_IN || 0.3), // gemini-3.5-flash-lite input
  chatOut: Number(process.env.PRICE_CHAT_OUT || 2.5), // gemini-3.5-flash-lite output (incl. thinking)
  ttsIn: Number(process.env.PRICE_TTS_IN || 1.0), // gemini-3.8-flash-lite-tts text input
  ttsOut: Number(process.env.PRICE_TTS_OUT || 12.0), // gemini-3.8-flash-lite-tts audio output
};

export function chatCost(usage = {}) {
  const out = (usage.candidatesTokenCount || 0) + (usage.thoughtsTokenCount || 0);
  return ((usage.promptTokenCount || 0) * PRICE.chatIn + out * PRICE.chatOut) / 1e6;
}
export function ttsCost(usage = {}) {
  return ((usage.promptTokenCount || 0) * PRICE.ttsIn + (usage.candidatesTokenCount || 0) * PRICE.ttsOut) / 1e6;
}

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const HOUR = 3600 * 1000;
const key = (h) => `ai-spend:${h}`;
const mem = new Map();
if (!URL_ || !TOKEN) console.warn("[budget] no KV store configured; tracking spend per instance only");

async function redis(cmds) {
  const r = await fetch(`${URL_}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmds),
  });
  if (!r.ok) throw new Error("kv " + r.status);
  return (await r.json()).map((x) => x.result);
}

// Spend per hour bucket for the last 24 hours, oldest first.
async function buckets() {
  const now = Math.floor(Date.now() / HOUR);
  const hours = Array.from({ length: 24 }, (_, i) => now - 23 + i);
  if (!URL_ || !TOKEN) return hours.map((h) => mem.get(h) || 0);
  const [vals] = await redis([["MGET", ...hours.map(key)]]);
  return vals.map((v) => Number(v) || 0);
}

// { ok, spent, cap, retryHours }: retryHours is how long until enough spend ages out to be under the cap.
export async function checkBudget() {
  try {
    const b = await buckets();
    const spent = b.reduce((a, x) => a + x, 0);
    if (spent < DAILY_CAP_USD) return { ok: true, spent, cap: DAILY_CAP_USD };
    let remaining = spent, hours = 0;
    for (const x of b) { remaining -= x; hours++; if (remaining < DAILY_CAP_USD * 0.98) break; }
    const intoHour = (Date.now() % HOUR) / HOUR;
    return { ok: false, spent, cap: DAILY_CAP_USD, retryHours: Math.max(1, Math.ceil(hours - intoHour)) };
  } catch (e) {
    // If the store is unreachable, fail open: the provider's own quotas still apply.
    console.error("[budget] check failed", e);
    return { ok: true, spent: NaN, cap: DAILY_CAP_USD };
  }
}

export async function recordSpend(usd) {
  if (!(usd > 0)) return;
  const h = Math.floor(Date.now() / HOUR);
  try {
    if (!URL_ || !TOKEN) { mem.set(h, (mem.get(h) || 0) + usd); return; }
    await redis([["INCRBYFLOAT", key(h), usd.toFixed(8)], ["EXPIRE", key(h), 25 * 3600]]);
  } catch (e) {
    console.error("[budget] record failed", e);
  }
}

export function outOfTokens(hours) {
  const h = Math.max(1, Math.round(hours || 1));
  return `Sorry, I'm out of tokens for now. Come back in ${h} hour${h === 1 ? "" : "s"}.`;
}

// Hours until Gemini's daily quotas reset (midnight US Pacific), for provider-side quota errors.
export function hoursToPacificMidnight() {
  const now = new Date();
  const pt = new Date(now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
  const next = new Date(pt); next.setHours(24, 0, 0, 0);
  return Math.max(1, Math.ceil((next - pt) / HOUR));
}

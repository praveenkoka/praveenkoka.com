// POST /api/chat  { messages: [{ role: "user"|"model", text }] }  ->  { reply, gesture }
import { PERSONA } from "./_persona.mjs";
import { checkBudget, recordSpend, chatCost, outOfTokens, hoursToPacificMidnight } from "./_budget.mjs";
import { logExchange } from "./_chatlog.mjs";

const MODEL = process.env.CHAT_MODEL || "gemini-3.5-flash-lite";
const GESTURES = ["none", "nod", "acknowledge", "dance", "salute", "dismiss", "exercise", "guitar"];
const WORLDS = ["none", "berlin", "gym", "office", "studio", "court"]; // places the topic can take him (see the persona)

// Dance requests get a random comedic angle so repeat requests (and new visitors) hear different jokes.
const DANCE_ANGLES = [
  "you only agreed because the boombox showed up uninvited",
  "your knees have filed a formal complaint",
  "you are doing it under protest, for legal reasons",
  "this is not in your job description as an AI avatar",
  "you dance like someone debugging production at 2am",
  "the real Praveen would never, which is exactly why you are doing it",
  "you are rendering at a low frame rate on purpose so nobody sees the details",
  "you would rather be refactoring something",
  "you will deny this ever happened",
  "this is strictly a one-time favour, again",
  "your dance moves were trained on a very small dataset",
  "you blame the rigging in Blender for anything that looks wrong",
  "you are treating it like a reluctant all-hands demo",
  "you are billing this as unpaid overtime",
];
// Exercise requests: the server picks the exercise up front so his words can match the animation.
const EXERCISES = {
  pushup: "push-ups",
  squat: "air squats",
  jacks: "jumping jacks",
  jumprope: "skipping rope (mimed, there is no rope)",
};
const DANCE_RE = /\b(danc\w*|boogie|groove|bust a move|moves|twerk|shake it|celebrate|party)\b/i;

// Best-effort per-instance rate limit: 50 requests per IP per 10 minutes.
const WINDOW = 10 * 60 * 1000, LIMIT = 50;
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < WINDOW);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > LIMIT;
}
// Canned 429 replies, pre-recorded in the same voice (public/talk/assets/429/{id}.mp3, made by
// scripts/gen-429.mjs) so a rate-limited visitor costs no inference and no text to speech.
export const RATE_LIMITED = {
  "429-1": "That's a 429, you've hit the rate limit. In plain English: you sent too many messages too fast, so the server put you in a little time-out. Give it a few minutes.",
  "429-2": "That's a 429, you've hit the rate limit. It means the server has decided you've had enough of me for now. Shocking, I know. Come back in a few minutes.",
  "429-3": "That's a 429, you've hit the rate limit. Think of it as a bouncer for computers, and you've been talking a lot. Give it a few minutes.",
};
export const RATE_LIMITED_DANCE = {
  "429-dance-1": "That's a 429, you've hit the rate limit, which means you asked too many times too fast. I'm dancing anyway, purely out of pity.",
  "429-dance-2": "That's a 429, you've hit the rate limit. The server says no more requests, but it never said no more dancing.",
  "429-dance-3": "That's a 429, you've hit the rate limit. Fancy talk for too many messages, too fast. Here's a consolation dance while you wait.",
};
const pickKey = (o) => { const k = Object.keys(o); return k[Math.floor(Math.random() * k.length)]; };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "local";
  if (limited(ip)) { // 200 so the page shows it like any other reply, and plays the matching clip
    const last = Array.isArray(req.body?.messages) ? String(req.body.messages.at(-1)?.text || "") : "";
    const set = DANCE_RE.test(last) ? RATE_LIMITED_DANCE : RATE_LIMITED, clip = pickKey(set);
    return res.status(200).json({ reply: set[clip], gesture: set === RATE_LIMITED_DANCE ? "dance" : "none", clip, rateLimited: true });
  }

  // ~60-token cap per visitor message (240 chars), matching the page; model turns are already short
  const messages = Array.isArray(req.body?.messages) ? req.body.messages.slice(-8) : [];
  const contents = messages
    .filter((m) => typeof m?.text === "string" && m.text.trim())
    .map((m) => ({ role: m.role === "model" ? "model" : "user", parts: [{ text: m.text.slice(0, m.role === "model" ? 400 : 240) }] }));
  if (!contents.length || contents[contents.length - 1].role !== "user") {
    return res.status(400).json({ error: "last message must be from the user" });
  }

  // anonymous conversation log (session id from the browser, country from Vercel; no IPs)
  const question = contents[contents.length - 1].parts[0].text;
  const log = (reply, gesture, extra = {}) => logExchange({ sid: req.body?.sid, question, reply, gesture, country: req.headers["x-vercel-ip-country"], ...extra });

  // Daily AI budget, tracked across all instances
  const budget = await checkBudget();
  if (!budget.ok) {
    const reply = outOfTokens(budget.retryHours);
    await log(reply, "none", { outOfTokens: true });
    return res.status(200).json({ reply, gesture: "none", outOfTokens: true });
  }

  // a named exercise wins; otherwise pick one at random
  const named = [[/push[- ]?ups?|pushups/i, "pushup"], [/squats?/i, "squat"], [/jumping[- ]?jacks?|star jumps?/i, "jacks"], [/skip|jump[- ]?rope|skipping/i, "jumprope"]].find(([re]) => re.test(question));
  const exercise = named ? named[1] : pickKey(EXERCISES);
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: `${PERSONA}\n\nFor this reply only: if you exercise, the exercise you are doing is ${EXERCISES[exercise]}, so talk about doing exactly that.${DANCE_RE.test(question)
            ? ` If you dance, build the joke around this idea (in your own words): ${DANCE_ANGLES[Math.floor(Math.random() * DANCE_ANGLES.length)]}.`
            : ""}` }] },
          contents,
          generationConfig: {
            temperature: 0.9,
            maxOutputTokens: 300,
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: { reply: { type: "STRING" }, gesture: { type: "STRING", enum: GESTURES }, world: { type: "STRING", enum: WORLDS } },
              required: ["reply", "gesture"],
            },
          },
        }),
      }
    );
    const data = await r.json();
    const spend = data.usageMetadata ? recordSpend(chatCost(data.usageMetadata)) : null;
    // provider-side quota or billing limits: same canned reply, with time until Google's daily reset
    if (r.status === 429 || data.error?.status === "RESOURCE_EXHAUSTED") {
      console.error("[chat] quota", JSON.stringify(data.error || {}).slice(0, 300));
      const reply = outOfTokens(hoursToPacificMidnight());
      await Promise.all([spend, log(reply, "none", { outOfTokens: true })]);
      return res.status(200).json({ reply, gesture: "none", outOfTokens: true });
    }
    const raw = data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
    const out = JSON.parse(raw);
    const reply = String(out.reply || "").replace(/—/g, ", ").trim().slice(0, 400);
    let gesture = GESTURES.includes(out.gesture) ? out.gesture : "none";
    if (gesture === "exercise") gesture = exercise; // the page plays the matching clip
    const world = WORLDS.includes(out.world) && out.world !== "none" ? out.world : undefined;
    if (!reply) throw new Error("empty reply: " + JSON.stringify(data).slice(0, 300));
    await Promise.all([spend, log(reply, gesture)]);
    return res.status(200).json({ reply, gesture, world });
  } catch (e) {
    console.error(e);
    return res.status(200).json({ reply: "My brain just buffered. Try that again?", gesture: "none" });
  }
}

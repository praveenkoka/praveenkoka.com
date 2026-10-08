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
const GUITAR_ANGLES = [
  "you are headlining a sold-out stadium that only exists in your head",
  "your solo is so fast the frame rate cannot keep up",
  "you learned it all from one YouTube video at 2am",
  "you are tuning by ear and your ear is wrong",
  "this riff is dedicated to every failed deploy",
  "the neighbours have already called to complain",
  "it is a power ballad about technical debt",
  "you are warming up for a world tour nobody booked",
  "your guitar teacher would be quietly disappointed",
  "you are channelling eighties hair metal despite having no hair",
  "this is how you debug: loudly",
  "the boombox is doing most of the work and you know it",
  "you shred harder than your laptop fans",
  "you will be signing autographs after the set, by appointment only",
];
const EXERCISE_ANGLES = [
  "your aspirational muscles finally have to earn their keep",
  "you are counting reps the way you estimate sprints, badly",
  "you are doing this so the real Praveen does not have to",
  "your personal trainer is a linter that only complains",
  "you have never sweated before because you are made of polygons",
  "this counts as your cardio for the quarter",
  "you are negotiating the rep count down as you go",
  "you are doing it for the screenshot, not the gains",
  "the music is carrying this workout",
  "you will mention this at every standup for a month",
  "you are mostly here for the post-workout snack",
  "you are doing it with perfect form, according to nobody",
  "you skipped leg day for a decade and it shows",
  "your physics engine is doing the heavy lifting",
];
const ANGLE_RULE = "Use a fresh joke: never mention that the guitar, rope or equipment is not real, and never reuse a line from earlier in the conversation.";
const DANCE_RE = /\b(danc\w*|boogie|groove|bust a move|moves|twerk|shake it|celebrate|party)\b/i;
const GUITAR_RE = /\b(guitar|shred\w*|riff\w*|rock out|solo)\b/i;
const EXERCISE_RE = /\b(exercis\w*|work ?out|push[- ]?ups?|pushups?|squats?|jumping[- ]?jacks?|skip\w*|jump[- ]?rope|gym|lift\w*|cardio|run|sweat)\b/i;
const pick = (a) => a[Math.floor(Math.random() * a.length)];

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
export const RATE_LIMITED_GUITAR = {
  "429-guitar-1": "That's a 429, you've hit the rate limit. Too many requests, too fast. So here's an encore while the server cools off.",
  "429-guitar-2": "That's a 429, you've hit the rate limit. The server stopped listening to you, but it can't stop me shredding.",
  "429-guitar-3": "That's a 429, you've hit the rate limit. Translation: you talk too much. This solo is for you while you wait.",
};
export const RATE_LIMITED_EXERCISE = {
  "429-exercise-1": "That's a 429, you've hit the rate limit. You asked too much, too fast, so the server benched you. I'm getting my reps in anyway.",
  "429-exercise-2": "That's a 429, you've hit the rate limit. It's like a gym closing time, but for chatting. Cool down for a few minutes.",
  "429-exercise-3": "That's a 429, you've hit the rate limit. The server needs a rest day, and frankly so do I. Back in a few minutes.",
};
export const RATE_LIMITED_DANCE = {
  "429-dance-1": "That's a 429, you've hit the rate limit, which means you asked too many times too fast. I'm dancing anyway, purely out of pity.",
  "429-dance-2": "That's a 429, you've hit the rate limit. The server says no more requests, but it never said no more dancing.",
  "429-dance-3": "That's a 429, you've hit the rate limit. Fancy talk for too many messages, too fast. Here's a consolation dance while you wait.",
};
// the exercise the visitor asked for by name, if any
const namedExercise = (q) => [[/push[- ]?ups?|pushups/i, "pushup"], [/squats?/i, "squat"], [/jumping[- ]?jacks?|star jumps?/i, "jacks"], [/skip|jump[- ]?rope/i, "jumprope"]].find(([re]) => re.test(q))?.[1];
const pickKey = (o) => { const k = Object.keys(o); return k[Math.floor(Math.random() * k.length)]; };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "local";
  if (limited(ip)) { // 200 so the page shows it like any other reply, and plays the matching clip
    const last = Array.isArray(req.body?.messages) ? String(req.body.messages.at(-1)?.text || "") : "";
    const [set, gesture] = DANCE_RE.test(last) ? [RATE_LIMITED_DANCE, "dance"]
      : GUITAR_RE.test(last) ? [RATE_LIMITED_GUITAR, "guitar"]
      : EXERCISE_RE.test(last) ? [RATE_LIMITED_EXERCISE, namedExercise(last) || pickKey(EXERCISES)]
      : [RATE_LIMITED, "none"];
    const clip = pickKey(set);
    return res.status(200).json({ reply: set[clip], gesture, clip, rateLimited: true });
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

  const exercise = namedExercise(question) || pickKey(EXERCISES); // a named exercise wins; otherwise random
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: [
            PERSONA,
            `For this reply only: if you exercise, the exercise you are doing is ${EXERCISES[exercise]}, so talk about doing exactly that.`,
            // a random comedic angle per request, so repeat requests (and new visitors) hear different jokes
            DANCE_RE.test(question) && `If you dance, build the joke around this idea (in your own words): ${pick(DANCE_ANGLES)}. ${ANGLE_RULE}`,
            GUITAR_RE.test(question) && `If you play air guitar, build the joke around this idea (in your own words): ${pick(GUITAR_ANGLES)}. ${ANGLE_RULE}`,
            EXERCISE_RE.test(question) && `If you exercise, build the joke around this idea (in your own words): ${pick(EXERCISE_ANGLES)}. ${ANGLE_RULE}`,
          ].filter(Boolean).join("\n\n") }] },
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

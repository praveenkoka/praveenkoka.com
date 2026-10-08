// POST /api/chat  { messages: [{ role: "user"|"model", text }] }  ->  { reply, gesture }
import { PERSONA } from "./_persona.mjs";

const MODEL = process.env.CHAT_MODEL || "gemini-3.5-flash-lite";
const GESTURES = ["none", "wave", "nod", "acknowledge", "dance"];

// Best-effort per-instance rate limit: 20 requests per IP per 10 minutes.
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 20;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "local";
  if (limited(ip)) return res.status(429).json({ reply: "Easy there. Give me a minute to catch my breath.", gesture: "none" });

  const messages = Array.isArray(req.body?.messages) ? req.body.messages.slice(-8) : [];
  const contents = messages
    .filter((m) => typeof m?.text === "string" && m.text.trim())
    .map((m) => ({ role: m.role === "model" ? "model" : "user", parts: [{ text: m.text.slice(0, 400) }] }));
  if (!contents.length || contents[contents.length - 1].role !== "user") {
    return res.status(400).json({ error: "last message must be from the user" });
  }

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: PERSONA }] },
          contents,
          generationConfig: {
            temperature: 0.9,
            maxOutputTokens: 300,
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: { reply: { type: "STRING" }, gesture: { type: "STRING", enum: GESTURES } },
              required: ["reply", "gesture"],
            },
          },
        }),
      }
    );
    const data = await r.json();
    const raw = data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
    const out = JSON.parse(raw);
    const reply = String(out.reply || "").replace(/—/g, ", ").trim().slice(0, 400);
    const gesture = GESTURES.includes(out.gesture) ? out.gesture : "none";
    if (!reply) throw new Error("empty reply: " + JSON.stringify(data).slice(0, 300));
    return res.status(200).json({ reply, gesture });
  } catch (e) {
    console.error(e);
    return res.status(200).json({ reply: "My brain just buffered. Try that again?", gesture: "none" });
  }
}

// POST /api/tts  { text }  ->  streamed 16-bit PCM from Google Gemini TTS (default), or mp3 from Sarvam when TTS_PROVIDER=sarvam
const PROVIDER = process.env.TTS_PROVIDER || "google";
const GOOGLE_MODEL = process.env.GOOGLE_TTS_MODEL || "gemini-3.8-flash-lite-tts";
const GOOGLE_VOICE = process.env.GOOGLE_TTS_VOICE || "Charon";
const SARVAM_SPEAKER = process.env.SARVAM_SPEAKER || "kabir";

// Best-effort per-instance rate limit: 25 requests per IP per 10 minutes.
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 25;
}

// Streams raw 16-bit PCM (24 kHz mono) to the client as Gemini generates it.
async function googleStream(text, res) {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GOOGLE_MODEL}:streamGenerateContent?alt=sse&key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `### DIRECTOR'S NOTES\nVoice: deep, warm, male, a little playful. Accent: Indian English. Pace: brisk and conversational. Do not read these notes.\n\n### TRANSCRIPT\n${text}` }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: GOOGLE_VOICE } } },
        },
      }),
    }
  );
  if (!r.ok || !r.body) throw new Error("google tts http " + r.status);
  res.setHeader("Content-Type", "audio/L16;rate=24000;channels=1");
  res.setHeader("Cache-Control", "no-store");
  res.status(200);
  let buf = "", odd = null;
  for await (const chunk of r.body) {
    buf += Buffer.from(chunk).toString().replace(/\r/g, "");
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const ev = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const line = ev.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;
      const part = JSON.parse(line.slice(5)).candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
      if (!part) continue;
      let pcm = Buffer.from(part.inlineData.data, "base64");
      if (odd) { pcm = Buffer.concat([odd, pcm]); odd = null; }
      if (pcm.length % 2) { odd = pcm.subarray(pcm.length - 1); pcm = pcm.subarray(0, pcm.length - 1); }
      res.write(pcm);
    }
  }
  res.end();
}

async function sarvam(text) {
  const r = await fetch("https://api.sarvam.ai/text-to-speech", {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-subscription-key": process.env.SARVAM_API_KEY },
    body: JSON.stringify({ text, language_code: "en-IN", model: "bulbul:v3", speaker: SARVAM_SPEAKER, pace: 1.0, speech_sample_rate: 24000, output_audio_codec: "mp3" }),
  });
  const data = await r.json();
  if (!data.audios?.[0]) throw new Error("sarvam tts: " + JSON.stringify(data).slice(0, 300));
  return { type: "audio/mpeg", body: Buffer.from(data.audios[0], "base64") };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const useSarvam = PROVIDER === "sarvam" && process.env.SARVAM_API_KEY;
  if (!useSarvam && !process.env.GEMINI_API_KEY) return res.status(501).json({ error: "tts not configured" });
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "local";
  if (limited(ip)) return res.status(429).json({ error: "slow down" });
  const text = String(req.body?.text || "").slice(0, 500).trim();
  if (!text) return res.status(400).json({ error: "text required" });

  try {
    if (!useSarvam) return await googleStream(text, res);
    const out = await sarvam(text);
    res.setHeader("Content-Type", out.type);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(out.body);
  } catch (e) {
    console.error(e);
    if (res.headersSent) return res.end();
    return res.status(502).json({ error: "tts failed" });
  }
}

// POST /api/tts  { text }  ->  streamed 16-bit PCM (24 kHz mono), or 503 when the voice is unavailable.
import { checkBudget, recordSpend, ttsCost } from "./_budget.mjs";
// Murf Falcon when MURF_API_KEY is set (default), else Google Gemini TTS; mp3 from Sarvam when TTS_PROVIDER=sarvam.
const PROVIDER = process.env.TTS_PROVIDER || (process.env.MURF_API_KEY ? "murf" : "google");
const MURF_VOICE = process.env.MURF_VOICE || "en-US-wayne";
const MURF_STYLE = process.env.MURF_STYLE || "Conversational";
const GOOGLE_MODEL = process.env.GOOGLE_TTS_MODEL || "gemini-3.8-flash-lite-tts";
const GOOGLE_VOICE = process.env.GOOGLE_TTS_VOICE || "Charon";
const SARVAM_SPEAKER = process.env.SARVAM_SPEAKER || "kabir";

// Spoken forms for names the voices tend to spell out letter by letter. Captions keep the written form.
const SAY = [
  [/\bMurf\.ai\b/gi, "Murph dot A I"],
  [/\bMurf\b/gi, "Murph"],
  [/\bthree\.js\b/gi, "three J S"],
  [/\bffmpeg\b/gi, "F F mpeg"],
  [/\bOpenClaw\b/g, "Open Claw"],
  [/\bRAG\b/g, "rag"],
];
const forSpeech = (t) => SAY.reduce((s, [re, to]) => s.replace(re, to), t);

// Best-effort per-instance rate limit: 60 requests per IP per 10 minutes (chat allows 50).
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 60;
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
  let buf = "", odd = null, usage = null;
  for await (const chunk of r.body) {
    buf += Buffer.from(chunk).toString().replace(/\r/g, "");
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const ev = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const line = ev.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;
      const evt = JSON.parse(line.slice(5));
      if (evt.usageMetadata) usage = evt.usageMetadata;
      const part = evt.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
      if (!part) continue;
      let pcm = Buffer.from(part.inlineData.data, "base64");
      if (odd) { pcm = Buffer.concat([odd, pcm]); odd = null; }
      if (pcm.length % 2) { odd = pcm.subarray(pcm.length - 1); pcm = pcm.subarray(0, pcm.length - 1); }
      res.write(pcm);
    }
  }
  res.end();
  if (usage) await recordSpend(ttsCost(usage));
}

// Murf Falcon streams a WAV; strip the header and forward the raw PCM as it arrives.
async function murfStream(text, res) {
  const r = await fetch("https://global.api.murf.ai/v1/speech/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": process.env.MURF_API_KEY },
    body: JSON.stringify({ text, voiceId: MURF_VOICE, style: MURF_STYLE, model: "FALCON", format: "WAV", sampleRate: 24000, channelType: "MONO" }),
  });
  if (!r.ok || !r.body) throw new Error("murf http " + r.status + " " + (await r.text()).slice(0, 200));
  res.setHeader("Content-Type", "audio/L16;rate=24000;channels=1");
  res.setHeader("Cache-Control", "no-store");
  res.status(200);
  let head = Buffer.alloc(0), inData = false, odd = null;
  for await (const chunk of r.body) {
    let buf = Buffer.from(chunk);
    if (!inData) {
      head = Buffer.concat([head, buf]);
      const at = head.indexOf("data");
      if (at < 0 || head.length < at + 8) continue;
      buf = head.subarray(at + 8);
      inData = true;
    }
    if (odd) { buf = Buffer.concat([odd, buf]); odd = null; }
    if (buf.length % 2) { odd = buf.subarray(buf.length - 1); buf = buf.subarray(0, buf.length - 1); }
    if (buf.length) res.write(buf);
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
  const useMurf = PROVIDER === "murf" && process.env.MURF_API_KEY;
  if (!useSarvam && !useMurf && !process.env.GEMINI_API_KEY) return res.status(501).json({ error: "tts not configured" });
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "local";
  if (limited(ip)) return res.status(429).json({ error: "slow down" });
  const text = forSpeech(String(req.body?.text || "").slice(0, 500).trim());
  if (!text) return res.status(400).json({ error: "text required" });

  try {
    // Murf (free plan) gates itself; a Murf error is reported, never retried on paid Google TTS
    if (useMurf) return await murfStream(text, res);
    if (!useSarvam) {
      const budget = await checkBudget();
      if (!budget.ok) return res.status(503).json({ error: "out of tokens", retryHours: budget.retryHours });
      return await googleStream(text, res);
    }
    const out = await sarvam(text);
    res.setHeader("Content-Type", out.type);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(out.body);
  } catch (e) {
    console.error(e);
    if (res.headersSent) return res.end();
    return res.status(503).json({ error: "voice unavailable" });
  }
}

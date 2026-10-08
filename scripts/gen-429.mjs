// Pre-records the canned rate-limit replies in the avatar's Murf voice.
// node --env-file=.env.local scripts/gen-429.mjs  ->  public/talk/assets/429/{id}.mp3
import { writeFileSync, mkdirSync } from "node:fs";
import { RATE_LIMITED, RATE_LIMITED_DANCE, RATE_LIMITED_GUITAR, RATE_LIMITED_EXERCISE } from "../api/chat.mjs";

const dir = new URL("../public/talk/assets/429/", import.meta.url);
mkdirSync(dir, { recursive: true });
const only = process.argv[2] ? new RegExp(process.argv[2]) : null; // e.g. "guitar|exercise" to record just those
for (const [id, text] of Object.entries({ ...RATE_LIMITED, ...RATE_LIMITED_DANCE, ...RATE_LIMITED_GUITAR, ...RATE_LIMITED_EXERCISE })) {
  if (only && !only.test(id)) continue;
  const r = await fetch("https://global.api.murf.ai/v1/speech/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": process.env.MURF_API_KEY },
    body: JSON.stringify({ text: text.replace(/429/g, "four twenty nine"), voiceId: process.env.MURF_VOICE || "en-US-wayne", style: "Conversational", model: "FALCON", format: "MP3", sampleRate: 24000, channelType: "MONO" }),
  });
  if (!r.ok) throw new Error(`${id}: ${r.status} ${await r.text()}`);
  writeFileSync(new URL(`${id}.mp3`, dir), Buffer.from(await r.arrayBuffer()));
  console.log("wrote", id);
}

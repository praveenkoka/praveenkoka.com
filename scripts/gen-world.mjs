// Generates the /talk background world with Gemini's image model.
// Usage: node --env-file=.env.local scripts/gen-world.mjs [outfile]
import { writeFileSync } from "node:fs";

const MODEL = process.env.WORLD_IMAGE_MODEL || "gemini-3-pro-image";
const out = process.argv[2] || "scratch-world.png";
const prompt = `Ultra-wide cinematic environment concept art, no people, no text, no logos.
An open-air rooftop AI lab terrace floating above a futuristic Indian megacity at blue hour, inspired by Bengaluru.
Distant skyline of glass towers with warm amber windows, monsoon clouds lit from below in soft orange and magenta,
a few slow holographic data ribbons drifting in the sky, faint stars emerging.
Foreground: a clean dark terrace floor with subtle reflections, empty open space in the exact centre of the frame
where a person will stand, minimal greenery and warm string lights at the edges.
Mood: calm, optimistic, playful, premium. Palette: deep indigo night sky, warm amber, coral orange, soft magenta accents.
Photoreal, volumetric light, shallow atmospheric haze, horizon line at about 45 percent of image height, eye-level camera.`;

const res = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "21:9", imageSize: "2K" } },
    }),
  }
);
const data = await res.json();
const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
if (!part) { console.error(JSON.stringify(data).slice(0, 1500)); process.exit(1); }
writeFileSync(out, Buffer.from(part.inlineData.data, "base64"));
console.log("wrote", out, part.inlineData.mimeType);

// Generates the /talk 360° world (equirectangular panorama) with Gemini's image model.
// Usage: node --env-file=.env.local scripts/gen-world.mjs [outfile]
import { writeFileSync } from "node:fs";

const MODEL = process.env.WORLD_IMAGE_MODEL || "gemini-3-pro-image";
const out = process.argv[2] || "scratch-world.png";
const prompt = `A seamless 360-degree equirectangular panorama (full spherical projection, 360 by 180 degrees), photographed from eye height, 1.6 metres,
standing at the exact centre of a large open-air rooftop AI lab terrace high above a futuristic Indian megacity at blue hour, inspired by Bengaluru.
The left and right edges must join seamlessly. Straight horizon exactly at the vertical middle of the image. No people, no text, no logos.
All around: a continuous skyline of glass towers with warm amber windows in every direction, monsoon clouds lit from below in soft orange and magenta,
a few slow holographic data ribbons drifting in the sky, faint stars overhead.
The terrace: a wide, clean, dark polished stone floor with subtle reflections filling the bottom of the panorama, glass balustrades with warm LED strips
around the edge about twelve metres away, planters with tropical plants and warm string lights, a glass pavilion with a glowing interior on one side,
a lounge with low seating on another. Mood: calm, optimistic, playful, premium. Palette: deep indigo sky, warm amber, coral orange, soft magenta.
Photoreal, volumetric light, gentle atmospheric haze.`;

const res = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "21:9", imageSize: "4K" } },
    }),
  }
);
const data = await res.json();
const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
if (!part) { console.error(JSON.stringify(data).slice(0, 1500)); process.exit(1); }
writeFileSync(out, Buffer.from(part.inlineData.data, "base64"));
console.log("wrote", out, part.inlineData.mimeType);

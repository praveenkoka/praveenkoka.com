// Generates the /talk background worlds with Gemini's image model.
// Usage: node --env-file=.env.local scripts/gen-world.mjs <world> [outfile]
// Worlds: bengaluru (the original rooftop), berlin, newyork, studio.
// Every world uses the same framing so the avatar stands on its floor: 21:9, eye-level camera,
// horizon at about 45 percent of image height, empty space in the exact centre.
import { writeFileSync } from "node:fs";

const MODEL = process.env.WORLD_IMAGE_MODEL || "gemini-3-pro-image";
const FRAMING = `Ultra-wide cinematic environment concept art, no people, no text, no logos, no readable signs.
Empty open floor space in the exact centre of the frame where a person will stand.
Photoreal, volumetric light, shallow atmospheric haze, horizon line at about 45 percent of image height, eye-level camera.`;
const WORLDS = {
  bengaluru: `An open-air rooftop AI lab terrace floating above a futuristic Indian megacity at blue hour, inspired by Bengaluru.
Distant skyline of glass towers with warm amber windows, monsoon clouds lit from below in soft orange and magenta,
a few slow holographic data ribbons drifting in the sky, faint stars emerging.
Foreground: a clean dark terrace floor with subtle reflections, minimal greenery and warm string lights at the edges.
Mood: calm, optimistic, playful, premium. Palette: deep indigo night sky, warm amber, coral orange, soft magenta accents.`,
  berlin: `A vast converted industrial brick warehouse loft in Berlin at golden hour, a creative tech studio.
Tall steel-framed factory windows along the back wall with low sun streaming through, long warm light beams in the haze,
exposed brick, steel beams and a high ceiling, a glimpse of the Berlin TV tower and rooftops through the windows.
Foreground: a wide polished dark concrete floor with soft reflections, a few large plants, a long wooden workbench with monitors
and a vintage sofa pushed to the edges. Mood: calm, focused, creative, premium. Palette: warm amber and honey light, deep shadows, muted teal.`,
  newyork: `A Brooklyn rooftop terrace at sunset looking across the East River at the Manhattan skyline.
The skyline glowing in pink and gold light, a big soft gradient sky from coral to lavender, the bridges in the distance,
first city lights turning on. Foreground: a wide dark wooden deck with soft reflections, low planters with grasses,
festoon string lights and a couple of lounge chairs at the edges. Mood: relaxed, optimistic, cinematic.
Palette: coral, peach, lavender and deep blue, warm amber lights.`,
  studio: `A moody professional music recording studio live room at night, built around drums.
A beautiful drum kit with brass cymbals off to one side, guitar amps, a grand piano in the shadows, acoustic wood slat walls,
a large control room window glowing behind the glass with mixing console lights, neon strip lights in magenta and cyan.
Foreground: a wide dark wooden floor with Persian rugs at the edges and soft reflections. Mood: intimate, warm, creative.
Palette: deep charcoal, warm walnut, magenta and cyan neon accents, warm tungsten light.`,
};

const world = process.argv[2];
if (!WORLDS[world]) { console.error(`usage: gen-world.mjs <${Object.keys(WORLDS).join("|")}> [outfile]`); process.exit(1); }
const out = process.argv[3] || `scratch-world-${world}.png`;
const res = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${FRAMING}\n${WORLDS[world]}` }] }],
      generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "21:9", imageSize: "2K" } },
    }),
  }
);
const data = await res.json();
const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
if (!part) { console.error(JSON.stringify(data).slice(0, 1500)); process.exit(1); }
writeFileSync(out, Buffer.from(part.inlineData.data, "base64"));
console.log("wrote", out, part.inlineData.mimeType);

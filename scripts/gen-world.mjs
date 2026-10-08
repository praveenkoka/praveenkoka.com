// Generates the /talk background worlds with Gemini's image model.
// Usage: node --env-file=.env.local scripts/gen-world.mjs <world> [outfile]
// Worlds: bengaluru (the original rooftop), berlin (park), court (basketball arena), studio.
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
  berlin: `A huge sunny park in Berlin on a bright summer afternoon, inspired by the Tiergarten.
A wide open lawn of fresh green grass stretching away in every direction, tall old linden and oak trees in loose groups,
the golden Victory Column rising far away above the treetops, a deep blue sky with a few soft white clouds,
dappled sunlight, a gravel path curving past at the edges, a couple of park benches far off. No people.
Foreground: short neat grass all around the centre. Mood: relaxed, fresh, cheerful.
Palette: vivid greens, sky blue, warm sunlight, a touch of gold.`,
  court: `Standing exactly on the centre circle of the court in a huge, empty, modern professional basketball arena.
The arena lights are on, a gleaming polished hardwood court with crisp painted lines, the centre circle right in the middle,
both baskets with glass backboards visible far away on the left and the right, a giant four-sided video scoreboard hanging high above,
tens of thousands of empty seats rising in tiers all around, warm spotlights from the roof cutting through faint haze.
No logos, no team names, no text, no people. Mood: dramatic, big-game, cinematic.
Palette: warm honey wood, deep navy seats, bright white arena light, a few accent lights in orange and blue.`,
  studio: `A wide establishing shot from the far end of the room, so everything sits small and life-size in the frame.
A moody professional music recording studio live room at night, built around drums.
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

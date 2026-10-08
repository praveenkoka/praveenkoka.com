# praveenkoka.com

Personal site of Praveen Koka. A static site (plain HTML and CSS) that shares its visual language with [tandavlabs.com](https://www.tandavlabs.com).

- `public/index.html`: home page
- `public/writing/index.html`: all articles from the Trilogy AI Substack
- `public/styles.css`: styles
- `public/assets/img/`: images

Deployed on Vercel (project `praveenkoka-com`); `vercel.json` serves `public/` with no build step.

Local preview: `npx serve public`

## Talk to Praveen (`/talk/`)

A three.js avatar (`public/talk/`) in a Gemini-generated 360° world (`scripts/gen-world.mjs`, projected with `GroundedSkybox`; drag to orbit), with two Vercel functions:

- `api/chat.mjs`: Gemini chat with the persona and facts in `api/_persona.mjs`; returns `{ reply, gesture }`.
- `api/tts.mjs`: streams 16-bit PCM. Default is Murf Falcon (`MURF_API_KEY`, `MURF_VOICE`, default `en-US-wayne`); without a Murf key it falls back to Google Gemini TTS (`GOOGLE_TTS_MODEL`, `GOOGLE_TTS_VOICE`). Set `TTS_PROVIDER=sarvam` and `SARVAM_API_KEY` to use Sarvam Bulbul v3.

Env: `GEMINI_API_KEY` (required, chat), `MURF_API_KEY` (voice). Local: put it in `.env.local`, then `node --env-file=.env.local scripts/dev.mjs` and open http://localhost:3000.

The bottom-right widget on the home and writing pages (`public/talk-widget.js`, `avatar-widget.jpg`) links to `/talk/`.

# praveenkoka.com

Personal site of Praveen Koka. A static site (plain HTML and CSS) that shares its visual language with [tandavlabs.com](https://www.tandavlabs.com).

- `public/index.html`: home page
- `public/writing/index.html`: all articles from the Trilogy AI Substack
- `public/styles.css`: styles
- `public/assets/img/`: images

Deployed on Vercel (project `praveenkoka-com`); `vercel.json` serves `public/` with no build step.

Local preview: `npx serve public`

## Talk to Praveen (`/talk/`)

A three.js avatar (`public/talk/`) in one of six Gemini-generated worlds (the chat moves him to Berlin, the gym, the startup office or the studio when the topic calls for it) (`public/talk/assets/worlds/`: Bengaluru rooftop, Berlin park, basketball arena centre court, drum studio, gym, startup office; made by `scripts/gen-world.mjs <world>`, switched with the next-world thumbnail in the top bar, remembered per browser, `?world=` to link one; each wrapped 360° with mirrored copies, four for the indoor rooms so they sit in proportion; drag to swivel, right-drag to pan, scroll to zoom), with two Vercel functions:

- `api/chat.mjs`: Gemini chat with the persona and facts in `api/_persona.mjs`; returns `{ reply, gesture }`.
- `api/tts.mjs`: streams 16-bit PCM. Default is Murf Falcon (`MURF_API_KEY`, `MURF_VOICE`, default `en-US-wayne`); without a Murf key it falls back to Google Gemini TTS (`GOOGLE_TTS_MODEL`, `GOOGLE_TTS_VOICE`). Set `TTS_PROVIDER=sarvam` and `SARVAM_API_KEY` to use Sarvam Bulbul v3.

Env: `GEMINI_API_KEY` (required, chat), `MURF_API_KEY` (voice), `KV_REST_API_URL` + `KV_REST_API_TOKEN` (Upstash Redis, for the spend cap).

**Spend cap:** `api/_budget.mjs` tracks Gemini spend (chat, plus Google TTS if used) in hourly Redis buckets and caps it at `DAILY_AI_BUDGET_USD` (default $1) over a rolling 24 hours. Over the cap, or if Gemini reports its quota is exhausted, the avatar answers "Sorry, I'm out of tokens for now. Come back in X hours." Murf errors (e.g. the free plan running out) fall back to silent captions, never to paid TTS. Visitor messages are capped at about 60 tokens (240 characters) on the page and the server.

**Chat log:** `api/_chatlog.mjs` stores each exchange anonymously in Upstash (time, question, answer, gesture, country; no IPs), grouped by a random per-browser conversation id. It stays inside the free tier: 4 commands per exchange, at most 4,000 conversations x 40 exchanges, 60-day expiry, oldest conversations deleted first when the cap is reached. Read it with:

```
vercel env pull .env.chats --environment=production --yes
node --env-file=.env.chats scripts/chats.mjs 20
rm .env.chats
``` Local: put it in `.env.local`, then `node --env-file=.env.local scripts/dev.mjs` and open http://localhost:3000.

The bottom-right widget on the home and writing pages (`public/talk-widget.js`, `avatar-widget.jpg`) links to `/talk/`.

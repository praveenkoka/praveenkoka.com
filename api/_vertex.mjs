// Gemini on Vertex AI, authenticated as a service account (see VERTEX-AUTH.md in apps/content).
// AI Studio API keys bill against prepaid credits; Vertex bills the project's Cloud billing account.
// GCP_SA_KEY holds the service-account key JSON (raw or base64). We sign a JWT with it, swap it for
// an OAuth access token, and cache the token per function instance until shortly before it expires.
import { createSign } from "node:crypto";

const PROJECT = process.env.VERTEX_PROJECT || "tandav-471515";
const LOCATION = process.env.VERTEX_LOCATION || "global";
const HOST = LOCATION === "global" ? "aiplatform.googleapis.com" : `${LOCATION}-aiplatform.googleapis.com`;

export const vertexConfigured = Boolean(process.env.GCP_SA_KEY);

let creds = null;
let cached = { token: null, exp: 0 };

function loadCreds() {
  if (creds) return creds;
  const raw = (process.env.GCP_SA_KEY || "").trim();
  if (!raw) throw new Error("GCP_SA_KEY is not set");
  creds = JSON.parse(raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8"));
  return creds;
}

const b64url = (v) => Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString("base64url");

async function accessToken() {
  if (cached.token && cached.exp - Date.now() > 60_000) return cached.token;
  const { client_email, private_key, token_uri = "https://oauth2.googleapis.com/token" } = loadCreds();
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64url({ alg: "RS256", typ: "JWT" })}.${b64url({
    iss: client_email,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: token_uri,
    iat: now,
    exp: now + 3600,
  })}`;
  const sig = createSign("RSA-SHA256").update(unsigned).sign(private_key, "base64url");
  const r = await fetch(token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${sig}` }),
  });
  const d = await r.json();
  if (!r.ok || !d.access_token) throw new Error("vertex token " + r.status + " " + JSON.stringify(d).slice(0, 200));
  cached = { token: d.access_token, exp: Date.now() + (d.expires_in || 3600) * 1000 };
  return cached.token;
}

// POST to a Gemini model method on Vertex (generateContent, streamGenerateContent, ...).
// `query` is appended as-is, e.g. "alt=sse". Returns the raw fetch Response.
export async function vertexFetch(model, method, body, query = "") {
  const url = `https://${HOST}/v1/projects/${PROJECT}/locations/${LOCATION}/publishers/google/models/${model}:${method}${query ? "?" + query : ""}`;
  return fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GroundedSkybox } from "three/addons/objects/GroundedSkybox.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const SNAPSHOT = params.get("snapshot") === "1"; // used to render the widget image

/* ============ renderer, scene, camera ============ */
const canvas = $("scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: SNAPSHOT });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0f2a);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environmentIntensity = 0.75;

const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 300);

/* ============ Gemini-generated 360° world ============ */
// An equirectangular panorama, projected onto the ground near the avatar so you can walk all the way round.
const WORLD_YAW = Number(params.get("yaw") ?? 4.2); // turns the panorama so the skyline sits behind him at the start
const SHOT_HEIGHT = 1.6, WORLD_RADIUS = 70;
// sharper panorama where the GPU allows it; 4096 px is the safe limit on phones
const WORLD_URL = renderer.capabilities.maxTextureSize >= 8192 && Math.min(screen.width, screen.height) >= 700 ? "/talk/assets/world360-hd.jpg" : "/talk/assets/world360.jpg";
new THREE.TextureLoader().load(WORLD_URL, (tex) => {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = pmrem.fromEquirectangular(tex).texture; // the world lights the avatar
  scene.environmentRotation.y = WORLD_YAW;
  const sky = new GroundedSkybox(tex, SHOT_HEIGHT, WORLD_RADIUS);
  sky.position.y = SHOT_HEIGHT - 0.01;
  sky.rotation.y = WORLD_YAW;
  scene.add(sky);
});

/* ============ lights ============ */
scene.add(new THREE.HemisphereLight(0x7f8cff, 0x2a1810, 0.35));
const key = new THREE.DirectionalLight(0xffd6ad, 1.9);
key.position.set(2.2, 4.2, 3.4);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.camera.left = -2; key.shadow.camera.right = 2; key.shadow.camera.top = 3; key.shadow.camera.bottom = -1;
key.shadow.bias = -0.0005;
scene.add(key);
const rimL = new THREE.DirectionalLight(0xff4fa3, 1.6); rimL.position.set(-3, 2.6, -2.5); scene.add(rimL);
const rimR = new THREE.DirectionalLight(0xffa040, 1.3); rimR.position.set(3, 2.2, -2.5); scene.add(rimR);
const fill = new THREE.PointLight(0xbfc8ff, 0.8, 8); fill.position.set(-1.2, 1.6, 2.5); scene.add(fill);

/* ============ pedestal ============ */
const pedestal = new THREE.Group();
const disc = new THREE.Mesh(
  new THREE.CylinderGeometry(0.85, 0.92, 0.08, 96),
  new THREE.MeshStandardMaterial({ color: 0x0d0f1c, metalness: 0.7, roughness: 0.28 })
);
disc.position.y = -0.04; disc.receiveShadow = true;
pedestal.add(disc);
const ringMat = (c) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false });
const ring1 = new THREE.Mesh(new THREE.TorusGeometry(0.88, 0.008, 12, 160), ringMat(new THREE.Color(1.9, 0.75, 0.3)));
ring1.rotation.x = Math.PI / 2; ring1.position.y = 0.002;
const ring2 = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.004, 12, 160, Math.PI * 1.35), ringMat(new THREE.Color(1.6, 0.35, 1.0)));
ring2.rotation.x = Math.PI / 2; ring2.position.y = -0.03;
pedestal.add(ring1, ring2);
scene.add(pedestal);

/* ============ drifting particles ============ */
const N = 420;
const pGeo = new THREE.BufferGeometry();
const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), speed = new Float32Array(N);
const palette = [new THREE.Color(1.6, 0.85, 0.45), new THREE.Color(1.5, 0.45, 0.95), new THREE.Color(0.8, 0.85, 1.6)];
for (let i = 0; i < N; i++) {
  const r = 1.4 + Math.random() * 8, a = Math.random() * Math.PI * 2;
  pos.set([Math.cos(a) * r, Math.random() * 4, Math.sin(a) * r], i * 3);
  col.set(palette[i % 3].toArray(), i * 3);
  speed[i] = 0.05 + Math.random() * 0.12;
}
pGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
pGeo.setAttribute("color", new THREE.BufferAttribute(col, 3));
const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.022, vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
scene.add(particles);

/* ============ post ============ */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.5, 0.92);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const controls = new OrbitControls(camera, canvas);
controls.enablePan = false;
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.rotateSpeed = 0.6;
controls.zoomSpeed = 0.7;
controls.minDistance = 1.8;
controls.maxDistance = 7;
controls.minPolarAngle = THREE.MathUtils.degToRad(48); // a little from above
controls.maxPolarAngle = THREE.MathUtils.degToRad(93); // never below the floor
controls.autoRotateSpeed = 0.35;
controls.enabled = !SNAPSHOT;

let lastInteraction = performance.now();
controls.addEventListener("start", () => { lastInteraction = performance.now(); controls.autoRotate = false; $("hint")?.classList.add("gone"); });
controls.addEventListener("end", () => { lastInteraction = performance.now(); });

function frame() {
  const portrait = camera.aspect < 0.8;
  if (SNAPSHOT) { camera.fov = 12; camera.position.set(0, 1.66, 4.6); controls.target.set(0, 1.56, 0); }
  else if (portrait) { camera.fov = 58; camera.position.set(0, 1.35, 4.0); controls.target.set(0, 0.72, 0); }
  else { camera.fov = 50; camera.position.set(0, 1.45, 3.5); controls.target.set(0, 0.95, 0); }
  camera.updateProjectionMatrix();
  controls.update();
}
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.fov = SNAPSHOT ? 12 : camera.aspect < 0.8 ? 58 : 50;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();
frame();

/* ============ avatar ============ */
let mixer, headBone, neckBone, avatarRoot;
const faces = []; // every head primitive (skin, beard, mouth interior) carries the same morph targets
const actions = {};
let current = null;

const manager = new THREE.LoadingManager();
const loader = new GLTFLoader(manager);
loader.setMeshoptDecoder(MeshoptDecoder);
loader.load(
  SNAPSHOT && params.get("glb") ? `/talk/assets/${params.get("glb").replace(/[^\w.-]/g, "")}` : "/talk/assets/bald_indian.glb",
  (gltf) => {
    const avatar = gltf.scene;
    avatarRoot = avatar;
    avatar.traverse((o) => {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false; }
      if (o.morphTargetDictionary?.viseme_aa !== undefined) faces.push(o);
      if (o.isBone && /Head$/.test(o.name)) headBone = o;
      if (o.isBone && /Neck$/.test(o.name)) neckBone = o;
    });
    scene.add(avatar);
    mixer = new THREE.AnimationMixer(avatar);
    for (const clip of gltf.animations) actions[clip.name] = mixer.clipAction(clip);
    for (const n of ["Acknowledging", "Head Nod Yes", "Waving"]) {
      if (actions[n]) { actions[n].setLoop(THREE.LoopOnce, 1); actions[n].clampWhenFinished = true; }
    }
    mixer.addEventListener("finished", onClipFinished);
    play("Breathing Idle");
    ready();
  },
  (e) => { if (e.total) $("bar").style.width = `${Math.round((e.loaded / e.total) * 100)}%`; },
  (err) => { console.error(err); $("intro-status").textContent = "Couldn't load the avatar. Try refreshing."; }
);

function play(name, fade = 0.35) {
  const next = actions[name];
  if (!next || next === current) return;
  next.reset().setEffectiveWeight(1).fadeIn(fade).play();
  if (current) current.fadeOut(fade);
  current = next;
}
let talkFlip = false;
function talkClip() { talkFlip = !talkFlip; return talkFlip ? "Talking" : "Talking 2"; }
function settle() { play(speaking ? talkClip() : dancingUntil > performance.now() ? "Dancing" : "Breathing Idle"); }
function onClipFinished() { settle(); }

/* ============ lip-sync ============ */
const VIS = ["viseme_aa", "viseme_E", "viseme_I", "viseme_O", "viseme_U", "viseme_PP", "viseme_FF", "viseme_TH", "viseme_DD", "viseme_kk", "viseme_CH", "viseme_SS", "viseme_nn", "viseme_RR", "jawOpen", "mouthWide"];
const target = Object.fromEntries(VIS.map((v) => [v, 0]));
const value = Object.fromEntries(VIS.map((v) => [v, 0]));
function clearTargets() { for (const v of VIS) target[v] = 0; }

const CHAR_VIS = { a: "viseme_aa", e: "viseme_E", i: "viseme_I", y: "viseme_I", o: "viseme_O", u: "viseme_U", w: "viseme_U",
  p: "viseme_PP", b: "viseme_PP", m: "viseme_PP", f: "viseme_FF", v: "viseme_FF", t: "viseme_DD", d: "viseme_DD", l: "viseme_nn",
  n: "viseme_nn", k: "viseme_kk", g: "viseme_kk", q: "viseme_kk", c: "viseme_kk", x: "viseme_kk", s: "viseme_SS", z: "viseme_SS",
  j: "viseme_CH", h: "viseme_CH", r: "viseme_RR" };
const VOWEL = new Set(["viseme_aa", "viseme_E", "viseme_I", "viseme_O", "viseme_U"]);

// audio-driven (Sarvam mp3): band energies pick a mouth shape, loudness drives the jaw
let analyser, freq, timeBuf;
function audioVisemes() {
  analyser.getByteFrequencyData(freq);
  analyser.getByteTimeDomainData(timeBuf);
  let rms = 0;
  for (let i = 0; i < timeBuf.length; i++) { const s = (timeBuf[i] - 128) / 128; rms += s * s; }
  rms = Math.sqrt(rms / timeBuf.length);
  const hz = audioCtx.sampleRate / analyser.fftSize;
  const band = (a, b) => { let s = 0, n = 0; for (let i = Math.floor(a / hz); i < Math.floor(b / hz); i++) { s += freq[i]; n++; } return s / (n || 1) / 255; };
  const low = band(150, 700), mid = band(700, 2200), high = band(3000, 7500);
  clearTargets();
  const open = Math.min(1, Math.max(0, (rms - 0.02) * 5));
  if (open < 0.05) return;
  target.jawOpen = open * 0.55;
  if (high > mid * 0.9 && high > 0.18) { target.viseme_SS = 0.6 * open + 0.2; }
  else if (mid > low * 1.05) { target.viseme_E = 0.55 * open; target.mouthWide = 0.25 * open; }
  else if (low > 0.45) { target.viseme_aa = 0.65 * open; }
  else { target.viseme_O = 0.55 * open; }
}

// text-driven (browser voice fallback): walk the text at speaking pace, resync on word boundaries
let ttsText = "", charAnchor = 0, anchorTime = 0;
const CPS = 13.5;
function textVisemes(now) {
  clearTargets();
  const idx = Math.floor(charAnchor + ((now - anchorTime) / 1000) * CPS);
  const ch = (ttsText[idx] || " ").toLowerCase();
  const v = CHAR_VIS[ch];
  if (!v) return;
  target[v] = VOWEL.has(v) ? 0.6 : 0.45;
  if (VOWEL.has(v)) target.jawOpen = v === "viseme_aa" || v === "viseme_O" ? 0.4 : 0.22;
}

function setMorph(name, v) {
  for (const f of faces) { const i = f.morphTargetDictionary[name]; if (i !== undefined) f.morphTargetInfluences[i] = v; }
}
function applyMouth(dt) {
  if (!faces.length) return;
  const k = 1 - Math.exp(-dt / 0.065);
  for (const v of VIS) { value[v] += (target[v] - value[v]) * k; setMorph(v, value[v]); }
}

/* ============ speech ============ */
let audioCtx, muted = false, speaking = false, mode = null, dancingUntil = 0, ttsAvailable = true;

async function speak(text) {
  stopSpeaking();
  const myTurn = ++turn;
  if (muted) { await fakeSpeak(text); return; }
  if (ttsAvailable) {
    try {
      const r = await fetch("/api/tts/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      if (r.status === 501) ttsAvailable = false;
      else if (r.ok) {
        const type = r.headers.get("Content-Type") || "";
        if (type.startsWith("audio/L16")) { await playPcmStream(r.body, myTurn); return; }
        await playAudio(await r.arrayBuffer(), myTurn);
        return;
      }
    } catch (e) { console.warn(e); }
  }
  await browserSpeak(text);
}

// Google TTS: 16-bit PCM arrives in chunks; schedule each chunk back to back as it lands.
let turn = 0, scheduled = [];
async function playPcmStream(body, myTurn) {
  const reader = body.getReader();
  const RATE = 24000;
  let t0 = 0, odd = null, started = false;
  const begin = () => { if (!started) { started = true; mode = "audio"; startTalking(); } };
  while (true) {
    const { value, done } = await reader.read();
    if (done || myTurn !== turn) break;
    let bytes = value;
    if (odd) { const m = new Uint8Array(odd.length + bytes.length); m.set(odd); m.set(bytes, odd.length); bytes = m; odd = null; }
    if (bytes.length % 2) { odd = bytes.slice(-1); bytes = bytes.slice(0, -1); }
    if (!bytes.length) continue;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
    const n = bytes.length / 2;
    const ab = audioCtx.createBuffer(1, n, RATE);
    const ch = ab.getChannelData(0);
    for (let i = 0; i < n; i++) ch[i] = view.getInt16(i * 2, true) / 32768;
    const src = audioCtx.createBufferSource();
    src.buffer = ab;
    src.connect(analyser);
    const now = audioCtx.currentTime;
    if (t0 < now + 0.05) t0 = now + 0.08; // small lead so chunks don't underrun
    src.start(t0);
    t0 += ab.duration;
    scheduled.push(src);
    begin();
  }
  if (myTurn !== turn) return;
  const remaining = Math.max(0, t0 - audioCtx.currentTime);
  await new Promise((res) => setTimeout(res, remaining * 1000 + 120));
  if (myTurn === turn) { scheduled = []; stopTalking(); }
}

function playAudio(buf, myTurn) {
  return new Promise(async (resolve) => {
    const decoded = await audioCtx.decodeAudioData(buf);
    if (myTurn !== turn) return resolve();
    const src = audioCtx.createBufferSource();
    src.buffer = decoded;
    src.connect(analyser);
    scheduled.push(src);
    mode = "audio"; startTalking();
    src.onended = () => { if (myTurn === turn) { scheduled = []; stopTalking(); } resolve(); };
    src.start();
  });
}

let voice = null;
function pickVoice() {
  const vs = speechSynthesis.getVoices();
  voice = vs.find((v) => /en-IN/i.test(v.lang) && /rishi|male|prabhat|ravi/i.test(v.name))
    || vs.find((v) => /en-IN/i.test(v.lang))
    || vs.find((v) => /en-GB/i.test(v.lang) && /daniel|male/i.test(v.name))
    || vs.find((v) => /^en/i.test(v.lang));
}
if ("speechSynthesis" in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }

function browserSpeak(text) {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window)) { fakeSpeak(text).then(resolve); return; }
    const u = new SpeechSynthesisUtterance(text);
    if (voice) u.voice = voice;
    u.lang = voice?.lang || "en-IN";
    u.pitch = 0.75; u.rate = 1.0;
    ttsText = text; charAnchor = 0;
    u.onstart = () => { anchorTime = performance.now(); mode = "text"; startTalking(); };
    u.onboundary = (e) => { charAnchor = e.charIndex; anchorTime = performance.now(); };
    u.onend = u.onerror = () => { stopTalking(); resolve(); };
    speechSynthesis.speak(u);
  });
}

// muted: animate the mouth from the text with no sound
function fakeSpeak(text) {
  return new Promise((resolve) => {
    ttsText = text; charAnchor = 0; anchorTime = performance.now(); mode = "text"; startTalking();
    setTimeout(() => { stopTalking(); resolve(); }, (text.length / CPS) * 1000 + 300);
  });
}

function startTalking() {
  speaking = true;
  faceVisitor();
  if (dancingUntil > performance.now()) return;
  if (!current || !/Waving|Nod|Acknowledging/.test(current.getClip().name)) play(talkClip());
}
function stopTalking() { speaking = false; mode = null; clearTargets(); settle(); }
function stopSpeaking() {
  turn++;
  for (const src of scheduled) { try { src.stop(); } catch {} }
  scheduled = [];
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  speaking = false; mode = null; clearTargets();
}

/* ============ facing ============ */
let facing = 0, facingTarget = 0;
function faceVisitor() { facingTarget = Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z); }
function lerpAngle(a, b, t) { const d = Math.atan2(Math.sin(b - a), Math.cos(b - a)); return a + d * t; }

/* ============ gestures ============ */
function gesture(g) {
  faceVisitor();
  if (g === "nod") play("Head Nod Yes", 0.25);
  else if (g === "acknowledge") play("Acknowledging", 0.25);
  else if (g === "dance") { dancingUntil = performance.now() + 9000; play("Dancing", 0.4); setTimeout(settle, 9100); }
}

/* ============ chat (persisted per browser) ============ */
const STORE = "pk-talk-v1";
const store = {
  load() { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; } },
  save(data) { try { localStorage.setItem(STORE, JSON.stringify(data)); } catch {} },
};
const saved = store.load();
const history = Array.isArray(saved.history) ? saved.history.filter((m) => m && typeof m.text === "string").slice(-30) : [];
function persist() { store.save({ history: history.slice(-30), muted }); }
const capQ = $("cap-q"), capA = $("cap-a");
let busy = false;

function setBusy(b) {
  busy = b;
  $("q").disabled = b; $("send").disabled = b || !$("q").value.trim();
  document.querySelectorAll("#chips button").forEach((x) => (x.disabled = b));
}

async function ask(question) {
  question = question.trim();
  if (!question || busy) return;
  ensureAudio();
  setBusy(true);
  stopSpeaking(); settle();
  capQ.textContent = `"${question}"`;
  capA.innerHTML = '<span class="dots"><span></span><span></span><span></span></span>';
  history.push({ role: "user", text: question });
  $("reset").hidden = false;
  let reply = "Hmm, I lost my train of thought. Try again?", g = "none";
  try {
    const r = await fetch("/api/chat/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: history.slice(-8) }) });
    const d = await r.json();
    if (d.reply) { reply = d.reply; g = d.gesture || "none"; }
  } catch (e) { console.warn(e); }
  history.push({ role: "model", text: reply });
  persist();
  capA.textContent = reply;
  gesture(g);
  setBusy(false);
  $("q").focus({ preventScroll: true });
  await speak(reply);
}

$("ask").addEventListener("submit", (e) => { e.preventDefault(); const q = $("q").value; $("q").value = ""; ask(q); });
$("q").addEventListener("input", () => { $("send").disabled = busy || !$("q").value.trim(); });
$("chips").addEventListener("click", (e) => { const b = e.target.closest("button[data-q]"); if (b) ask(b.dataset.q); });

$("mute").addEventListener("click", () => {
  muted = !muted;
  $("mute").setAttribute("aria-pressed", String(muted));
  $("mute").setAttribute("aria-label", muted ? "Unmute voice" : "Mute voice");
  if (muted) stopSpeaking(), settle();
  persist();
});

// voice input where the browser supports it
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SR) {
  const mic = $("mic"); mic.hidden = false;
  const rec = new SR(); rec.lang = "en-IN"; rec.interimResults = true;
  let listening = false;
  rec.onresult = (e) => { const t = Array.from(e.results).map((r) => r[0].transcript).join(""); $("q").value = t; if (e.results[e.results.length - 1].isFinal) { $("q").value = ""; ask(t); } };
  rec.onend = () => { listening = false; mic.classList.remove("on"); };
  mic.addEventListener("click", () => { ensureAudio(); if (busy) return; if (listening) { rec.stop(); return; } stopSpeaking(); listening = true; mic.classList.add("on"); rec.start(); });
}

/* ============ start ============ */
// Audio can only start after a user gesture, so it is created on the first question (or mic tap).
function ensureAudio() {
  if (audioCtx) { if (audioCtx.state === "suspended") audioCtx.resume(); return; }
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  analyser = audioCtx.createAnalyser(); analyser.fftSize = 1024; analyser.smoothingTimeConstant = 0.5;
  freq = new Uint8Array(analyser.frequencyBinCount); timeBuf = new Uint8Array(analyser.fftSize);
  analyser.connect(audioCtx.destination);
}

const HELLO = "Hey, I'm Praveen. Well, the 3D version. Ask me about AI, startups, or what I'm building.";
function ready() {
  $("intro").classList.add("gone");
  if (SNAPSHOT) { document.querySelectorAll(".top,.ask,.caption,.hint").forEach((e) => (e.style.display = "none")); return; }
  $("q").disabled = false;
  if (saved.muted) { muted = true; $("mute").setAttribute("aria-pressed", "true"); $("mute").setAttribute("aria-label", "Unmute voice"); }
  const lastUser = [...history].reverse().find((m) => m.role === "user");
  const lastModel = [...history].reverse().find((m) => m.role === "model");
  if (lastUser && lastModel) {
    capQ.textContent = `Last time: "${lastUser.text}"`;
    capA.textContent = "Welcome back! Pick up where we left off, or ask something new.";
    $("reset").hidden = false;
  } else {
    capQ.textContent = "";
    capA.textContent = HELLO;
    if (!history.length) { history.push({ role: "model", text: HELLO }); persist(); }
  }
  faceVisitor();
}

$("reset").addEventListener("click", () => {
  stopSpeaking(); settle();
  history.length = 0;
  history.push({ role: "model", text: HELLO });
  persist();
  capQ.textContent = ""; capA.textContent = HELLO;
  $("reset").hidden = true;
  faceVisitor();
});

/* ============ loop ============ */
const clock = new THREE.Clock();
const tmp = new THREE.Vector3();
let headYaw = 0, headPitch = 0;

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime, now = performance.now();
  if (mixer) mixer.update(dt);

  // body turns toward the visitor when he answers
  if (avatarRoot) {
    facing = lerpAngle(facing, facingTarget, 1 - Math.exp(-dt * 2.5));
    avatarRoot.rotation.y = facing;
  }

  // head tracks the camera while it is in front of him, on top of the animation
  if (avatarRoot && headBone && !SNAPSHOT) {
    tmp.copy(camera.position); avatarRoot.worldToLocal(tmp);
    const yaw = Math.atan2(tmp.x, tmp.z);
    const pitch = Math.atan2(1.6 - tmp.y, Math.hypot(tmp.x, tmp.z));
    const inFront = Math.abs(yaw) < 1.4 ? 1 : 0;
    const k = 1 - Math.exp(-dt * 4);
    headYaw += (THREE.MathUtils.clamp(yaw, -0.9, 0.9) * inFront - headYaw) * k;
    headPitch += (THREE.MathUtils.clamp(pitch, -0.3, 0.35) * inFront - headPitch) * k;
    headBone.rotation.y += headYaw * 0.55; headBone.rotation.x += headPitch * 0.4;
    if (neckBone) neckBone.rotation.y += headYaw * 0.3;
  }

  if (speaking && mode === "audio" && analyser) audioVisemes();
  else if (speaking && mode === "text") textVisemes(now);
  else clearTargets();
  applyMouth(dt);
  if (SNAPSHOT && params.get("morph")) for (const kv of params.get("morph").split(",")) { const [n, v] = kv.split(":"); setMorph(n, Number(v)); }

  // drift slowly round him when nobody is interacting
  if (!SNAPSHOT && !busy && !speaking && now - lastInteraction > 20000) controls.autoRotate = true;
  controls.update();

  ring2.rotation.z = t * 0.25;
  ring1.material.color.setRGB(1.9, 0.75 + Math.sin(t * 1.3) * 0.15, 0.3);
  const p = pGeo.attributes.position;
  for (let i = 0; i < N; i++) { let y = p.getY(i) + speed[i] * dt; if (y > 4.2) y = 0; p.setY(i, y); }
  p.needsUpdate = true;

  composer.render();
});

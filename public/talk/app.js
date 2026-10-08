import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
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
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.35;

const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 300);

/* ============ Gemini-generated world, wrapped all the way round ============ */
// The 21:9 rooftop image fills half the circle; a mirrored copy fills the other half,
// so the edges always meet and you can swivel 360 degrees without a gap.
const IMG_ASPECT = 3168 / 1344;
const R = 34;
const BH = (R * Math.PI) / IMG_ASPECT; // each copy spans half the circumference
const backdropTex = new THREE.TextureLoader().load("/talk/assets/world.jpg", (t) => { t.colorSpace = THREE.SRGBColorSpace; });
backdropTex.colorSpace = THREE.SRGBColorSpace;
backdropTex.wrapS = THREE.MirroredRepeatWrapping;
backdropTex.repeat.x = -2;
backdropTex.offset.x = 0.5; // image centre directly behind him from the starting view
const backdrop = new THREE.Mesh(
  new THREE.CylinderGeometry(R, R, BH, 160, 1, true, Math.PI, Math.PI * 2),
  new THREE.MeshBasicMaterial({ map: backdropTex, side: THREE.BackSide, toneMapped: false })
);
// image horizon (45% from the top) at eye height, so the terrace floor in the picture lands behind his feet
backdrop.position.set(0, 1.35 - 0.05 * BH + 2.6, 0);
scene.add(backdrop);

// a dark glossy floor under him that fades out into the terrace in the picture
const floorFade = (() => {
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const g = c.getContext("2d"), grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, "#fff"); grd.addColorStop(0.35, "#fff"); grd.addColorStop(1, "#000");
  g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
})();
const floor = new THREE.Mesh(
  new THREE.CircleGeometry(7, 96),
  new THREE.MeshStandardMaterial({ color: 0x06070f, metalness: 0, roughness: 0.9, envMapIntensity: 0.1, transparent: true, opacity: 0.92, alphaMap: floorFade, depthWrite: false })
);
floor.rotation.x = -Math.PI / 2; floor.position.y = -0.045; floor.receiveShadow = true;
scene.add(floor);

/* ============ lights ============ */
scene.add(new THREE.HemisphereLight(0x7f8cff, 0x2a1810, 0.9));
const key = new THREE.DirectionalLight(0xffd6ad, 2.4);
key.position.set(2.2, 4.2, 3.4);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.camera.left = -2; key.shadow.camera.right = 2; key.shadow.camera.top = 3; key.shadow.camera.bottom = -1;
key.shadow.bias = -0.0005;
scene.add(key);
const rimL = new THREE.DirectionalLight(0xff4fa3, 2.2); rimL.position.set(-3, 2.6, -2.5); scene.add(rimL);
const rimR = new THREE.DirectionalLight(0xffa040, 1.8); rimR.position.set(3, 2.2, -2.5); scene.add(rimR);
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
const N = 320;
const pGeo = new THREE.BufferGeometry();
const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), speed = new Float32Array(N);
const palette = [new THREE.Color(1.6, 0.85, 0.45), new THREE.Color(1.5, 0.45, 0.95), new THREE.Color(0.8, 0.85, 1.6)];
for (let i = 0; i < N; i++) {
  const r = 1.4 + Math.random() * 6, a = Math.random() * Math.PI * 2;
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
controls.enablePan = true;
controls.screenSpacePanning = true;
controls.panSpeed = 0.6;
controls.enableDamping = true;
controls.dampingFactor = 0.045; // lower = longer glide after you let go
controls.rotateSpeed = 0.6;
controls.zoomSpeed = 0.7;
controls.minDistance = 2.2;
controls.maxDistance = 11;
controls.minPolarAngle = THREE.MathUtils.degToRad(55); // a little from above
controls.maxPolarAngle = THREE.MathUtils.degToRad(91); // never below the floor
controls.autoRotateSpeed = 0.35;
controls.enabled = !SNAPSHOT;

// panning is kept to a box around him so he never leaves the frame
const PAN_MIN = new THREE.Vector3(-1.6, 0.35, -1.6), PAN_MAX = new THREE.Vector3(1.6, 1.8, 1.6);
controls.addEventListener("change", () => { controls.target.clamp(PAN_MIN, PAN_MAX); });

let lastInteraction = performance.now();
const INTRO_MS = 2000;
let introUntil = 0; // short welcome spin when the page opens
function interacted() { lastInteraction = performance.now(); introUntil = 0; controls.autoRotate = false; $("hint")?.classList.add("gone"); }
controls.addEventListener("start", interacted);
controls.addEventListener("end", () => { lastInteraction = performance.now(); });

function frame() {
  const portrait = camera.aspect < 0.8;
  if (SNAPSHOT && params.get("frame") === "og") { camera.fov = 30; camera.position.set(-1.1, 1.45, 4.6); controls.target.set(-1.1, 1.15, 0); } // link-preview image: him on the right third
  else if (SNAPSHOT) { camera.fov = 12; camera.position.set(0, 1.66, 4.6); controls.target.set(0, 1.56, 0); }
  else if (portrait) { camera.fov = 40; camera.position.set(0, 1.3, 5.6); controls.target.set(0, 0.62, 0); }
  else if (window.innerHeight < 760 || window.innerWidth <= 900) { camera.fov = 32; camera.position.set(0, 1.5, 6.6); controls.target.set(0, 0.55, 0); } // shorter screens: higher in frame, clear of the caption
  else { camera.fov = 32; camera.position.set(0, 1.45, 5.6); controls.target.set(0, 0.92, 0); }
  if (params.has("az")) { // test hook: start the camera at a given swivel angle (radians)
    const off = camera.position.clone().sub(controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), Number(params.get("az")));
    camera.position.copy(controls.target).add(off);
  }
  camera.updateProjectionMatrix();
  controls.update();
}
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.fov = SNAPSHOT ? (params.get("frame") === "og" ? 30 : 12) : camera.aspect < 0.8 ? 40 : 32;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();
frame();

/* ============ view controls (buttons) ============ */
const UP = new THREE.Vector3(0, 1, 0), tmpV = new THREE.Vector3(), right = new THREE.Vector3();
function rotateView(angle) {
  tmpV.copy(camera.position).sub(controls.target).applyAxisAngle(UP, angle);
  camera.position.copy(controls.target).add(tmpV);
}
function zoomView(factor) {
  tmpV.copy(camera.position).sub(controls.target);
  const d = THREE.MathUtils.clamp(tmpV.length() * factor, controls.minDistance, controls.maxDistance);
  camera.position.copy(controls.target).add(tmpV.setLength(d));
}
function panView(dx, dy) {
  right.setFromMatrixColumn(camera.matrix, 0).setY(0).normalize();
  const before = controls.target.clone();
  controls.target.addScaledVector(right, dx).add(new THREE.Vector3(0, dy, 0)).clamp(PAN_MIN, PAN_MAX);
  camera.position.add(tmpV.copy(controls.target).sub(before));
}
// held buttons move smoothly every frame; a tap gives one small step
const VIEW_RATE = { rotate: 1.1, zoom: 0.9, pan: 0.9 }; // rad/s, log-distance/s, m/s
let held = null, heldSince = 0, resetAnim = null;
function step(action, dir, dt) {
  if (action === "rotate") rotateView(dir * VIEW_RATE.rotate * dt);
  else if (action === "zoom") zoomView(Math.exp(-dir * VIEW_RATE.zoom * dt));
  else if (action === "pan-x") panView(dir * VIEW_RATE.pan * dt, 0);
  else if (action === "pan-y") panView(0, dir * VIEW_RATE.pan * dt);
}
function resetView() {
  const from = { pos: camera.position.clone(), target: controls.target.clone() };
  frame();
  const to = { pos: camera.position.clone(), target: controls.target.clone() };
  camera.position.copy(from.pos); controls.target.copy(from.target);
  resetAnim = { from, to, t: 0 };
}
const viewCtrl = $("view-ctrl");
if (viewCtrl && !SNAPSHOT) {
  viewCtrl.addEventListener("pointerdown", (e) => {
    const b = e.target.closest("button[data-act]"); if (!b) return;
    e.preventDefault(); interacted();
    if (b.dataset.act === "reset") { resetView(); return; }
    held = { action: b.dataset.act, dir: Number(b.dataset.dir) }; heldSince = performance.now();
    b.setPointerCapture?.(e.pointerId);
  });
  const release = () => { if (held && performance.now() - heldSince < 180) step(held.action, held.dir, 0.25); held = null; };
  viewCtrl.addEventListener("pointerup", release);
  viewCtrl.addEventListener("pointercancel", () => (held = null));
  viewCtrl.addEventListener("lostpointercapture", () => (held = null));
  // keyboard: Enter/Space on a focused button gives one step
  viewCtrl.addEventListener("keydown", (e) => {
    const b = e.target.closest("button[data-act]"); if (!b || (e.key !== "Enter" && e.key !== " ")) return;
    e.preventDefault(); interacted();
    if (b.dataset.act === "reset") resetView(); else step(b.dataset.act, Number(b.dataset.dir), 0.3);
  });
}

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

function play(name, fade = 0.35, randomStart = false) {
  const next = actions[name];
  if (!next || next === current) return;
  next.reset().setEffectiveWeight(1).fadeIn(fade).play();
  if (randomStart) next.time = Math.random() * next.getClip().duration;
  if (current) current.fadeOut(fade);
  current = next;
}
let talkFlip = false;
function talkClip() { talkFlip = !talkFlip; return talkFlip ? "Talking" : "Talking 2"; }
function settle() { play(speaking ? talkClip() : dancingUntil > performance.now() ? "Dancing" : "Breathing Idle"); }
function onClipFinished() { settle(); }

// While he speaks: alternate the two talking clips at (estimated) sentence breaks, switch anyway
// before a clip visibly loops, and slip in at most one nod or acknowledgement per answer.
const SPEECH_CPS = 14; // characters per second for the voice, used to estimate sentence timings
let speechText = "", talkPlan = null;
function planTalk(text) {
  const breaks = [];
  const re = /[.!?]+["')\]]?\s+/g;
  let m;
  while ((m = re.exec(text))) if (m.index + m[0].length < text.length - 4) breaks.push((m.index + m[0].length) / SPEECH_CPS);
  talkPlan = { start: performance.now(), breaks, next: 0, lastSwitch: 0, gestured: false };
}
function switchTalk(atBreak) {
  if (!talkPlan) return;
  const elapsed = (performance.now() - talkPlan.start) / 1000;
  talkPlan.lastSwitch = elapsed;
  if (atBreak && !talkPlan.gestured && Math.random() < 0.3) {
    talkPlan.gestured = true;
    play(Math.random() < 0.5 ? "Head Nod Yes" : "Acknowledging", 0.3); // returns to talking when it finishes
    return;
  }
  play(talkClip(), 0.45, true);
}
function directTalk() {
  if (!speaking || !talkPlan || dancingUntil > performance.now() || !current) return;
  const name = current.getClip().name;
  if (!/^Talking/.test(name)) return; // let gestures finish
  const elapsed = (performance.now() - talkPlan.start) / 1000;
  const sinceSwitch = elapsed - talkPlan.lastSwitch;
  if (talkPlan.next < talkPlan.breaks.length && elapsed >= talkPlan.breaks[talkPlan.next]) {
    talkPlan.next++;
    if (sinceSwitch >= 1.6) switchTalk(true);
  } else if (sinceSwitch > Math.max(current.getClip().duration * 1.4, 3.5)) {
    switchTalk(false);
  }
}

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

// text-driven (muted or no voice): walk the text at speaking pace
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
let audioCtx, muted = false, speaking = false, mode = null, dancingUntil = 0;

// When the voice service is unavailable (e.g. the free Murf quota ran out), answer in captions
// with the mouth still moving, and don't ask the server again for a while.
let voiceDownUntil = 0;
async function speak(text) {
  stopSpeaking();
  speechText = text;
  const myTurn = ++turn;
  if (muted || performance.now() < voiceDownUntil) { await fakeSpeak(text); return; }
  try {
    const r = await fetch("/api/tts/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
    if (r.ok) {
      const type = r.headers.get("Content-Type") || "";
      if (type.startsWith("audio/L16")) { await playPcmStream(r.body, myTurn); return; }
      await playAudio(await r.arrayBuffer(), myTurn);
      return;
    }
    voiceDownUntil = performance.now() + 10 * 60 * 1000;
  } catch (e) { console.warn(e); voiceDownUntil = performance.now() + 60 * 1000; }
  if (myTurn === turn) await fakeSpeak(text);
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

// muted: animate the mouth from the text with no sound
function fakeSpeak(text) {
  return new Promise((resolve) => {
    ttsText = text; charAnchor = 0; anchorTime = performance.now(); mode = "text"; startTalking();
    setTimeout(() => { stopTalking(); resolve(); }, (text.length / CPS) * 1000 + 300);
  });
}

function startTalking() {
  speaking = true;
  planTalk(speechText);
  faceVisitor();
  if (dancingUntil > performance.now()) return;
  if (!current || !/Waving|Nod|Acknowledging/.test(current.getClip().name)) play(talkClip());
}
function stopTalking() { speaking = false; mode = null; talkPlan = null; clearTargets(); settle(); }
function stopSpeaking() {
  turn++;
  for (const src of scheduled) { try { src.stop(); } catch {} }
  scheduled = [];
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
// anonymous conversation id, used only to group a visitor's exchanges in the chat log
const newSid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
let sid = typeof saved.sid === "string" && /^[a-zA-Z0-9-]{8,64}$/.test(saved.sid) ? saved.sid : newSid();
function persist() { store.save({ history: history.slice(-30), muted, sid }); }
const capQ = $("cap-q"), capA = $("cap-a");
let busy = false;

function setBusy(b) {
  busy = b;
  $("q").disabled = b; $("send").disabled = b || !$("q").value.trim();
  document.querySelectorAll("#chips button, #built").forEach((x) => (x.disabled = b));
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
    const r = await fetch("/api/chat/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: history.slice(-8), sid }) });
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

// keep the caption (and the wide chip column) just above the input block, whatever its height
const askEl = $("ask");
const setAskH = () => document.documentElement.style.setProperty("--ask-h", `${askEl.offsetHeight}px`);
new ResizeObserver(setAskH).observe(askEl);
setAskH();

$("ask").addEventListener("submit", (e) => { e.preventDefault(); const q = $("q").value.slice(0, MAX_CHARS); $("q").value = ""; updateCount(); ask(q); });
// Keep prompts chat-sized: about 60 tokens (~4 characters per token). The server enforces the same cap.
const MAX_TOKENS = 60, MAX_CHARS = MAX_TOKENS * 4;
const approxTokens = (t) => Math.ceil(t.length / 4);
function updateCount() {
  const q = $("q");
  if (q.value.length > MAX_CHARS) q.value = q.value.slice(0, MAX_CHARS);
  const n = approxTokens(q.value), c = $("count");
  c.textContent = n >= MAX_TOKENS * 0.7 ? `${n}/${MAX_TOKENS}` : "";
  c.classList.toggle("full", n >= MAX_TOKENS);
  $("send").disabled = busy || !q.value.trim();
}
$("q").addEventListener("input", updateCount);
// Suggestions glow until each has been tried once; remembered per browser.
const TRIED = "pk-talk-tried";
const tried = new Set((() => { try { return JSON.parse(localStorage.getItem(TRIED)) || []; } catch { return []; } })());
function markTried(q) { tried.add(q); try { localStorage.setItem(TRIED, JSON.stringify([...tried])); } catch {} paintChips(); }
function paintChips() { document.querySelectorAll("#chips button[data-q]").forEach((b) => b.classList.toggle("fresh", !tried.has(b.dataset.q))); }
paintChips();
$("chips").addEventListener("click", (e) => { const b = e.target.closest("button[data-q]"); if (!b || busy) return; markTried(b.dataset.q); ask(b.dataset.q); });
$("built").addEventListener("click", () => { if (busy) return; markTried("How was this built?"); ask("How was this built?"); });

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
  if (!SNAPSHOT) introUntil = performance.now() + INTRO_MS;
  if (SNAPSHOT) { document.querySelectorAll(".top,.ask,.caption,.hint,.chips,.built,.view-ctrl").forEach((e) => (e.style.display = "none")); return; }
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
  sid = newSid();
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

  directTalk();
  if (speaking && mode === "audio" && analyser) audioVisemes();
  else if (speaking && mode === "text") textVisemes(now);
  else clearTargets();
  applyMouth(dt);
  if (SNAPSHOT && params.get("morph")) for (const kv of params.get("morph").split(",")) { const [n, v] = kv.split(":"); setMorph(n, Number(v)); }

  // drift slowly round him when nobody is interacting
  if (held) step(held.action, held.dir, dt);
  if (resetAnim) {
    resetAnim.t = Math.min(1, resetAnim.t + dt / 0.7);
    const e = 1 - Math.pow(1 - resetAnim.t, 3);
    camera.position.lerpVectors(resetAnim.from.pos, resetAnim.to.pos, e);
    controls.target.lerpVectors(resetAnim.from.target, resetAnim.to.target, e);
    if (resetAnim.t >= 1) resetAnim = null;
  }
  if (now < introUntil) {
    // ease in quickly, then glide to a stop over the last second
    const left = (introUntil - now) / 1000, elapsed = INTRO_MS / 1000 - left;
    const k = Math.min(1, elapsed / 0.4) * Math.min(1, left / 1);
    controls.autoRotate = true; controls.autoRotateSpeed = 2.4 * k * k * (3 - 2 * k);
  } else if (!SNAPSHOT && !busy && !speaking && now - lastInteraction > 20000) {
    controls.autoRotate = true; controls.autoRotateSpeed = 0.35;
  } else if (controls.autoRotate && introUntil && now >= introUntil) {
    controls.autoRotate = false; introUntil = 0;
  }
  controls.update(dt);

  ring2.rotation.z = t * 0.25;
  ring1.material.color.setRGB(1.9, 0.75 + Math.sin(t * 1.3) * 0.15, 0.3);
  const p = pGeo.attributes.position;
  for (let i = 0; i < N; i++) { let y = p.getY(i) + speed[i] * dt; if (y > 4.2) y = 0; p.setY(i, y); }
  p.needsUpdate = true;

  composer.render();
});

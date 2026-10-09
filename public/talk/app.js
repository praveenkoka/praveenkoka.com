import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const SNAPSHOT = params.get("snapshot") === "1";
if (params.get("demo")) { // test hook: surface errors in the title for headless checks
  addEventListener("error", (e) => (document.title = "ERR " + e.message));
  addEventListener("unhandledrejection", (e) => (document.title = "REJ " + (e.reason?.message || e.reason)));
} // used to render the widget image

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
// Each world wraps its picture round the circle `copies` times (mirrored, so the joins are seamless).
// Two copies suit skylines and big spaces; an interior uses four so its furniture is drawn at half the
// size and sits in proportion to him.
const bandHeight = (copies) => (2 * Math.PI * R) / copies / IMG_ASPECT;
const BH = bandHeight(2);
// Six worlds, all generated with the same framing (scripts/gen-world.mjs). Each one tints the
// floor and the rim lights to match its light.
const WORLDS = {
  bengaluru: { label: "Bengaluru", floor: 0x06070f, rimL: 0xff4fa3, rimR: 0xffa040, hemi: 0x7f8cff },
  berlin: { label: "Berlin", floor: 0x1c2a12, floorOpacity: 0.55, rimL: 0xfff1d6, rimR: 0xffe2a8, hemi: 0xd6ecff, hemiI: 1.9, keyI: 3.2, particles: false },
  court: { label: "Court", floor: 0x2a1708, floorOpacity: 0.6, rimL: 0xffb46b, rimR: 0x7fb4ff, hemi: 0xffe6c8, hemiI: 1.3, keyI: 2.8 },
  studio: { label: "Studio", floor: 0x0b0806, rimL: 0xff4fd2, rimR: 0x45dcff, hemi: 0x8a7a9a, copies: 4, offset: 0.5 + 0.09 }, // kit off his shoulder, not hidden behind him
  gym: { label: "Gym", floor: 0x0a0a0c, floorOpacity: 0.8, rimL: 0xffb27a, rimR: 0xffd2a6, hemi: 0xffd9c0, hemiI: 1.3, keyI: 2.8, copies: 4 },
  office: { label: "Startup", floor: 0x120c07, floorOpacity: 0.7, rimL: 0xffbe7a, rimR: 0x8fb4ff, hemi: 0xffe2c0, hemiI: 1.2, keyI: 2.6, copies: 4 },
};
const worldParam = new URLSearchParams(location.search).get("world");
let worldId = WORLDS[worldParam] ? worldParam : (() => { try { const w = JSON.parse(localStorage.getItem("pk-talk-v1"))?.world; return WORLDS[w] ? w : "bengaluru"; } catch { return "bengaluru"; } })();
const texLoader = new THREE.TextureLoader();
const worldTex = {};
function loadWorldTex(id) {
  return (worldTex[id] ||= new Promise((resolve, reject) => texLoader.load(`/talk/assets/worlds/${id}.jpg?v=2`, (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.MirroredRepeatWrapping;
    t.repeat.x = -(WORLDS[id].copies || 2);
    t.offset.x = WORLDS[id].offset ?? 0.5; // image centre directly behind him from the starting view
    resolve(t);
  }, undefined, reject)));
}
const backdropTex = new THREE.Texture(); // placeholder until the first world loads
const backdrop = new THREE.Mesh(
  new THREE.CylinderGeometry(R, R, BH, 160, 1, true, Math.PI, Math.PI * 2),
  new THREE.MeshBasicMaterial({ map: backdropTex, color: 0x000000, side: THREE.BackSide, toneMapped: false })
);
// image horizon (45% from the top) at eye height, so the terrace floor in the picture lands behind his feet;
// the horizon stays at the same height whatever the band height
const placeBackdrop = (copies) => {
  const h = bandHeight(copies);
  if (backdrop.geometry.parameters.height !== h) { backdrop.geometry.dispose(); backdrop.geometry = new THREE.CylinderGeometry(R, R, h, 160, 1, true, Math.PI, Math.PI * 2); }
  backdrop.position.set(0, 1.35 - 0.05 * h + 2.6, 0);
};
placeBackdrop(2);
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
const hemi = new THREE.HemisphereLight(0x7f8cff, 0x2a1810, 0.9); scene.add(hemi);
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

// Switching worlds: fade the backdrop to black, swap the picture and tints, fade back in.
let worldFade = { from: 0, to: 1, start: 0, ms: 1 }, worldSwitch = 0;
const fadeWorld = (to, ms) => { worldFade = { from: backdrop.material.color.r, to, start: performance.now(), ms }; };
async function setWorld(id, instant = false) {
  if (!WORLDS[id]) return;
  const mine = ++worldSwitch;
  worldId = id;
  if (!instant) fadeWorld(0, 220);
  let tex;
  try { tex = await loadWorldTex(id); } catch (e) { console.warn(e); return; }
  if (!instant) await new Promise((r) => setTimeout(r, Math.max(0, 220 - (performance.now() - worldFade.start))));
  if (mine !== worldSwitch) return;
  const w = WORLDS[id];
  backdrop.material.map = tex; backdrop.material.needsUpdate = true;
  placeBackdrop(w.copies || 2);
  floor.material.color.setHex(w.floor); floor.material.opacity = w.floorOpacity ?? 0.92;
  rimL.color.setHex(w.rimL); rimR.color.setHex(w.rimR); hemi.color.setHex(w.hemi);
  hemi.intensity = w.hemiI ?? 0.9; key.intensity = w.keyI ?? 2.4;
  particles.visible = w.particles !== false;
  fadeWorld(1, instant ? 500 : 380);
}
function tickWorld(now) {
  const k = Math.min(1, (now - worldFade.start) / worldFade.ms);
  backdrop.material.color.setScalar(worldFade.from + (worldFade.to - worldFade.from) * k);
}
setWorld(worldId, true);

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

/* ============ boombox (appears for dances and declined physical requests) ============ */
const boombox = new THREE.Group();
const speakerCones = [], speakerCaps = [];
{
  const metal = new THREE.MeshStandardMaterial({ color: 0x17181f, metalness: 0.6, roughness: 0.38 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xd8dce6, metalness: 1, roughness: 0.22 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x0b0b0f, roughness: 0.85 });
  const body = new THREE.Mesh(new RoundedBoxGeometry(0.64, 0.36, 0.2, 4, 0.045), metal);
  body.castShadow = true;
  boombox.add(body);
  for (const x of [-0.18, 0.18]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.098, 0.012, 12, 48), chrome);
    ring.position.set(x, -0.02, 0.102);
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.04, 0.03, 40), rubber);
    cone.rotation.x = Math.PI / 2; cone.position.set(x, -0.02, 0.09);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.026, 20, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 0.6, 0.25), toneMapped: false }));
    cap.position.set(x, -0.02, 0.108);
    boombox.add(ring, cone, cap);
    speakerCones.push(cone); speakerCaps.push(cap);
  }
  const display = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.05), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 1.4, 1.6), toneMapped: false }));
  display.position.set(0, 0.105, 0.101);
  const deck = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.09), new THREE.MeshStandardMaterial({ color: 0x2a2c36, metalness: 0.3, roughness: 0.5 }));
  deck.position.set(0, -0.03, 0.101);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.014, 10, 40, Math.PI), chrome);
  handle.position.y = 0.18;
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.42, 8), chrome);
  antenna.position.set(0.24, 0.36, -0.04); antenna.rotation.z = -0.5;
  boombox.add(display, deck, handle, antenna);
}
boombox.visible = false;
scene.add(boombox);
let boom = null; // { start, end } while it is on stage

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
  SNAPSHOT && params.get("glb") ? `/talk/assets/${params.get("glb").replace(/[^\w.-]/g, "")}` : "/talk/assets/bald_indian.glb?v=15",
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
    for (const n of ONE_SHOTS) {
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
const ONE_SHOTS = ["Acknowledging", "Head Nod Yes", "Waving", "Dismissing Gesture", "Salute"];
const IDLES = ["Breathing Idle", "Offensive Idle"];
const DANCES = ["Dancing", "Hip Hop Dancing", "Wave Hip Hop Dance"];
let currentIdle = "Breathing Idle", currentDance = null, jumpingUntil = 0, actionClip = "Jumping Rope"; // jumpingUntil: an exercise or air guitar is playing
let nextIdleChange = performance.now() + 9000;

let talkFlip = false;
function talkClip() { talkFlip = !talkFlip; return talkFlip ? "Talking" : "Talking 2"; }
const busyBody = () => dancingUntil > performance.now() || jumpingUntil > performance.now();
function settle() {
  const now = performance.now();
  if (dancingUntil > now) play(currentDance, 0.4);
  else if (jumpingUntil > now) play(actionClip, 0.35);
  else if (speaking) play(talkClip());
  else play(currentIdle, 0.5);
}
function onClipFinished() { settle(); }

// Idle life: alternate breathing and the guarded "offensive" idle at random, with the odd
// dismissive wave so he never looks frozen. (Jump rope is kept for declining physical requests.)
function directIdle(now) {
  if (SNAPSHOT || speaking || busy || busyBody() || now < nextIdleChange || !current) return;
  if (!IDLES.includes(current.getClip().name)) return; // let one-shots finish first
  nextIdleChange = now + 8000 + Math.random() * 7000;
  const r = Math.random();
  if (r < 0.08) play("Dismissing Gesture", 0.35);
  else { currentIdle = Math.random() < 0.6 ? IDLES.find((n) => n !== currentIdle) : currentIdle; play(currentIdle, 0.6); }
}

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
    const r = Math.random();
    play(r < 0.4 ? "Head Nod Yes" : r < 0.8 ? "Acknowledging" : "Dismissing Gesture", 0.3); // returns to talking when it finishes
    return;
  }
  play(talkClip(), 0.45, true);
}
function directTalk() {
  if (!speaking || !talkPlan || busyBody() || !current) return;
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
async function speak(text, clip) {
  stopSpeaking();
  speechText = text;
  const myTurn = ++turn;
  if (clip && !muted) { // canned, pre-recorded reply (e.g. the rate-limit message)
    try {
      const r = await fetch(`/talk/assets/429/${clip.replace(/[^\w-]/g, "")}.mp3?v=1`);
      if (r.ok) { const buf = await r.arrayBuffer(); if (myTurn === turn) await playAudio(buf, myTurn); return; }
    } catch (e) { console.warn(e); }
    if (myTurn === turn) await fakeSpeak(text);
    return;
  }
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
  if (busyBody()) return;
  if (!current || !ONE_SHOTS.includes(current.getClip().name)) play(talkClip());
}
function stopTalking() { speaking = false; mode = null; talkPlan = null; clearTargets(); settle(); }
function stopSpeaking() {
  turn++;
  for (const src of scheduled) { try { src.stop(); } catch {} }
  scheduled = [];
  speaking = false; mode = null; clearTargets();
}

/* ============ music for the boombox ============ */
// A random slice of one of two trap beats, sized to the action, fading in and out.
// It plays at a solid level but ducks under his voice, and never feeds the lip-sync analyser.
const TRACKS = {
  hiphop: ["/talk/assets/music/trap-1.mp3", "/talk/assets/music/trap-2.mp3"],
  metal: ["/talk/assets/music/metal-1.mp3", "/talk/assets/music/metal-2.mp3"],
};
const MUSIC_LEVEL = 0.5, MUSIC_DUCKED = 0.2;
const trackBufs = {};
const trackTurn = { hiphop: Math.floor(Math.random() * 2), metal: Math.floor(Math.random() * 2) };
let musicGain = null, musicAnalyser = null, musicData = null, music = null, musicTargetNow = -1;
const musicTarget = () => (muted ? 0 : speaking ? MUSIC_DUCKED : MUSIC_LEVEL);
function loadTrack(url) {
  if (!trackBufs[url]) trackBufs[url] = fetch(url).then((r) => r.arrayBuffer()).then((b) => audioCtx.decodeAudioData(b));
  return trackBufs[url];
}
async function playMusic(ms, genre) {
  if (!TRACKS[genre]) genre = "hiphop";
  if (!audioCtx || muted) return;
  if (!musicGain) {
    musicGain = audioCtx.createGain(); musicGain.gain.value = 0;
    musicAnalyser = audioCtx.createAnalyser(); musicAnalyser.fftSize = 512; musicData = new Uint8Array(musicAnalyser.fftSize);
    musicGain.connect(musicAnalyser); musicAnalyser.connect(audioCtx.destination);
  }
  const list = TRACKS[genre];
  trackTurn[genre] = (trackTurn[genre] + 1) % list.length;
  let buf;
  try { buf = await loadTrack(list[trackTurn[genre]]); } catch (e) { console.warn(e); return; }
  stopMusic(0.1);
  const dur = Math.min(ms / 1000, buf.duration - 0.3);
  // leave room after the slice so it can keep playing if he is still talking (see holdForSpeech)
  const offset = Math.random() * Math.max(0, buf.duration - dur - 0.3 - MUSIC_SPARE);
  const src = audioCtx.createBufferSource();
  src.buffer = buf; src.connect(musicGain);
  const t0 = audioCtx.currentTime, g = musicGain.gain;
  g.cancelScheduledValues(t0); g.setValueAtTime(0, t0);
  musicTargetNow = musicTarget(); g.linearRampToValueAtTime(musicTargetNow, t0 + 0.25);
  src.start(t0, offset);
  music = { src, until: t0 + dur, last: t0 + buf.duration - offset - 0.3 };
  src.onended = () => { if (music?.src === src) music = null; };
}
function stopMusic(fade = 0.3) {
  if (!music) return;
  const t = audioCtx.currentTime;
  musicGain.gain.cancelScheduledValues(t); musicGain.gain.setTargetAtTime(0, t, fade / 3);
  try { music.src.stop(t + fade); } catch {}
  music = null;
}
function tickMusic() { // duck under speech, fade out at the end
  if (!music || !audioCtx) return;
  const t = audioCtx.currentTime, g = musicGain.gain;
  if (t >= music.until) { stopMusic(0.05); return; }
  if (t >= music.until - 0.6) { if (musicTargetNow !== 0) { g.cancelScheduledValues(t); g.setTargetAtTime(0, t, 0.18); musicTargetNow = 0; } return; }
  const want = musicTarget();
  if (want !== musicTargetNow) { g.cancelScheduledValues(t); g.setTargetAtTime(want, t, 0.12); musicTargetNow = want; }
}
function musicLevel() {
  if (!music || !musicAnalyser) return 0;
  musicAnalyser.getByteTimeDomainData(musicData);
  let sum = 0;
  for (let i = 0; i < musicData.length; i++) { const v = (musicData[i] - 128) / 128; sum += v * v; }
  return Math.min(1, Math.sqrt(sum / musicData.length) * 3.5);
}
function boomboxOn(ms, genre) {
  const side = new THREE.Vector3(1.2, 0, 0.45).applyAxisAngle(UP, facing);
  boombox.position.set(side.x, 0.14, side.z);
  boombox.rotation.y = facing - 0.4;
  boombox.visible = true;
  boom = { start: performance.now(), end: performance.now() + ms };
  playMusic(ms, genre);
}
// While he is still talking, keep the action, boombox and music going until a beat after he stops.
const MUSIC_TAIL_MS = 2500, MUSIC_SPARE = 14; // seconds of track kept free for that
function holdForSpeech(now) {
  if (!boom || !speaking || boom.end >= now + MUSIC_TAIL_MS) return;
  let until = now + MUSIC_TAIL_MS;
  if (music) until = Math.min(until, now + (music.last - audioCtx.currentTime) * 1000); // never past the end of the track
  if (until <= boom.end) return;
  boom.end = until;
  if (dancingUntil > now) dancingUntil = until;
  if (jumpingUntil > now) jumpingUntil = until;
  if (music) music.until = audioCtx.currentTime + (until - now) / 1000;
}
function tickBoombox(now) {
  if (!boom) return;
  holdForSpeech(now);
  const t = (now - boom.start) / 1000, left = (boom.end - now) / 1000;
  if (left <= 0) { boombox.visible = false; boom = null; settle(); return; }
  const k = Math.min(1, t / 0.45), back = 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2); // ease-out-back pop in
  const s = left < 0.35 ? Math.max(0, left / 0.35) : back;
  const lvl = musicLevel();
  boombox.scale.setScalar(Math.max(0.001, s * (1 + lvl * 0.05)));
  for (const c of speakerCones) c.scale.set(1 + lvl * 0.3, 1 + lvl * 1.5, 1 + lvl * 0.3);
  for (const c of speakerCaps) c.material.color.setRGB(1.2 + lvl * 1.4, 0.4 + lvl * 0.6, 0.2 + lvl * 0.3);
}

/* ============ facing ============ */
let facing = 0, facingTarget = 0;
function faceVisitor() { facingTarget = Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z); }
function lerpAngle(a, b, t) { const d = Math.atan2(Math.sin(b - a), Math.cos(b - a)); return a + d * t; }

/* ============ gestures ============ */
const EXERCISES = { pushup: "Push Up", squat: "Air Squat", jacks: "Jumping Jacks", jumprope: "Jumping Rope" };
let exerciseGenre = Math.random() < 0.5 ? "metal" : "hiphop"; // exercise alternates hip hop and metal
function startAction(clip, ms, genre) {
  const now = performance.now();
  dancingUntil = 0; actionClip = clip; jumpingUntil = now + ms;
  play(clip, 0.35); setTimeout(settle, ms + 100);
  boomboxOn(ms, genre);
}
function gesture(g) {
  faceVisitor();
  const now = performance.now();
  if (g === "nod") play("Head Nod Yes", 0.25);
  else if (g === "acknowledge") play("Acknowledging", 0.25);
  else if (g === "salute") play("Salute", 0.25);
  else if (g === "dismiss") play("Dismissing Gesture", 0.25);
  else if (g === "dance") { // a different dance each time
    const others = DANCES.filter((d) => d !== currentDance); // random, but never the same dance twice in a row
    currentDance = others[Math.floor(Math.random() * others.length)];
    jumpingUntil = 0; dancingUntil = now + 10000; play(currentDance, 0.4); setTimeout(settle, 10100);
    boomboxOn(10000, "hiphop");
  } else if (EXERCISES[g]) { // the server picked the exercise so his words match it
    startAction(EXERCISES[g], 8000, exerciseGenre = exerciseGenre === "metal" ? "hiphop" : "metal");
  } else if (g === "guitar") {
    startAction("Guitar Playing", 9000, "metal");
  }
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
function persist() { store.save({ history: history.slice(-30), muted, sid, world: worldId }); }
const capQ = $("cap-q"), capA = $("cap-a");
let busy = false;

function setBusy(b) {
  busy = b;
  $("q").disabled = b; $("send").disabled = b || !$("q").value.trim();
  document.querySelectorAll("#chips button, #built").forEach((x) => (x.disabled = b));
}

// Phones and tablets: never focus the box on our own (it pops the keyboard); only when tapped.
const TOUCH = matchMedia("(hover: none) and (pointer: coarse)").matches;
async function ask(question, typed = false) {
  question = question.trim();
  if (!question || busy) return;
  ensureAudio();
  setBusy(true);
  stopSpeaking(); settle();
  capQ.textContent = `"${question}"`;
  capA.innerHTML = '<span class="dots"><span></span><span></span><span></span></span>';
  history.push({ role: "user", text: question });
  $("reset").hidden = false;
  let reply = "Hmm, I lost my train of thought. Try again?", g = "none", clip = null;
  try {
    const r = await fetch("/api/chat/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: history.slice(-8), sid }) });
    const d = await r.json();
    if (d.reply) { reply = d.reply; g = d.gesture || "none"; clip = d.clip || null; }
    if (WORLDS[d.world] && d.world !== worldId) { setWorld(d.world); persist(); showNextWorld(); } // the topic takes him somewhere
  } catch (e) { console.warn(e); }
  history.push({ role: "model", text: reply });
  persist();
  capA.textContent = reply;
  gesture(g);
  setBusy(false);
  if (typed && !TOUCH) $("q").focus({ preventScroll: true }); // desktop: keep typing after Enter
  await speak(reply, clip);
}

// keep the caption (and the wide chip column) just above the input block, whatever its height
const askEl = $("ask");
const setAskH = () => document.documentElement.style.setProperty("--ask-h", `${askEl.offsetHeight}px`);
new ResizeObserver(setAskH).observe(askEl);
setAskH();

$("ask").addEventListener("submit", (e) => { e.preventDefault(); const q = $("q").value.slice(0, MAX_CHARS); $("q").value = ""; updateCount(); if (TOUCH) $("q").blur(); ask(q, true); });
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
  if (muted) { stopSpeaking(); settle(); stopMusic(); }
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

const HELLO = "Hey, I'm Praveen's AI avatar. Full disclosure: the real Praveen is kind of boring. He just writes code and builds businesses. I'm the fun one. Ask me anything!";

// The intro is pre-recorded (same voice) so it plays instantly and costs nothing per visit.
let introAudio = null;
const prefetchIntro = () => (introAudio = introAudio || fetch("/talk/assets/intro.mp3?v=1").then((r) => r.arrayBuffer()).catch(() => null));
async function speakIntro() {
  if (busy) return;
  ensureAudio();
  stopSpeaking();
  speechText = HELLO;
  const myTurn = ++turn;
  if (muted) { await fakeSpeak(HELLO); return; }
  const buf = await prefetchIntro();
  if (myTurn !== turn) return;
  if (!buf) { await fakeSpeak(HELLO); return; }
  await playAudio(buf.slice(0), myTurn);
}
// Browsers only allow sound after the visitor interacts, so play it straight away if allowed,
// otherwise on their first tap, drag or key press (unless that first action is asking something).
function armIntro() {
  ensureAudio();
  if (audioCtx.state === "running") { speakIntro(); return; }
  const first = (e) => {
    window.removeEventListener("pointerdown", first, true); window.removeEventListener("keydown", first, true);
    if (e.target.closest?.("#ask, #built, #reset, #mute")) return;
    audioCtx.resume().then(speakIntro);
  };
  window.addEventListener("pointerdown", first, true); window.addEventListener("keydown", first, true);
}
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
    prefetchIntro();
    armIntro();
  }
  faceVisitor();
  if (EXERCISES[params.get("demo")] || params.get("demo") === "guitar") { const d = params.get("demo"); gesture(d); boom.end += 120000; jumpingUntil += 120000; } // test hook
  if (params.get("demo") === "dance") { gesture("dance"); boom.end += 120000; dancingUntil += 120000; } // test hook: hold the dance and boombox for screenshots
}

// world switcher: a thumbnail of the next world; tapping it goes there
const worldBtn = $("world-btn"), WORLD_IDS = Object.keys(WORLDS);
const nextWorld = () => WORLD_IDS[(WORLD_IDS.indexOf(worldId) + 1) % WORLD_IDS.length];
function showNextWorld() {
  const n = nextWorld();
  worldBtn.querySelector("img").src = `/talk/assets/worlds/${n}-thumb.jpg?v=2`;
  worldBtn.querySelector("span").textContent = WORLDS[n].label;
  worldBtn.setAttribute("aria-label", `Switch world to ${WORLDS[n].label}`);
  worldBtn.title = `Switch to ${WORLDS[n].label}`;
}
worldBtn.addEventListener("click", () => { setWorld(nextWorld()); persist(); showNextWorld(); });
showNextWorld();
// warm the cache for the other worlds once he is on stage
setTimeout(() => Object.keys(WORLDS).forEach((id) => { if (id !== worldId) loadWorldTex(id).catch(() => {}); }), 6000);

$("reset").addEventListener("click", () => {
  stopSpeaking(); settle();
  sid = newSid();
  history.length = 0;
  history.push({ role: "model", text: HELLO });
  persist();
  capQ.textContent = ""; capA.textContent = HELLO;
  $("reset").hidden = true;
  faceVisitor();
  speakIntro();
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
  directIdle(now);
  tickMusic();
  tickBoombox(now);
  tickWorld(now);
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

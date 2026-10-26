import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { LYRICS, AUDIO_SRC } from './lyrics.js';

const COUNT = matchMedia('(max-width: 700px)').matches ? 30000 : 60000;
const rand = (a, b) => a + Math.random() * (b - a);
// Cahaya aditif untuk kanvas transparan: warna DITAMBAHKAN ke latar, tapi alpha kanvas tidak ditulis.
// AdditiveBlending biasa ikut menulis alpha, sehingga partikel redup malah menutupi & menggelapkan
// latar CSS di belakang kanvas (terlihat seperti noda gelap).
const GLOW_BLEND = {
  blending: THREE.CustomBlending,
  blendEquation: THREE.AddEquation,
  blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor,
  blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
};

// Tiap baris lirik memakai salah satu scene ini.
//   shape   : bentuk yang dibentuk partikel
//   palette : warna partikel (atau color:'texture' = warna asli model)
//   text    : efek teks lirik (lihat .fx-* di style.css)
//   physics : 'fall' = partikel jatuh seperti hujan
//   reveal  : model 3D asli muncul setelah partikel selesai membentuk
//   bg      : [warna tengah, warna pinggir] gradasi latar
//   orbit   : objek berayun kiri-kanan (swing = seberapa jauh) supaya terlihat 3D
//   bounce  : memantul kenyal · bob : melayang naik-turun (balon)
//   build   : seberapa bertahap partikel tersusun dari bawah ke atas · flight : warna saat terbang
//   pops    : urutan balon yang meletus · hits : objek memantul tiap ketukan
//   bubbles : tiap gelembung chat muncul tepat di ketukannya (beats)
//   expr    : bola wajah ganti ekspresi di tiap ketukan (urutan di EXPRESSIONS)
//   beats   : detik (dihitung dari awal baris) untuk tiap letusan / pantulan;
//             bisa ditimpa per baris lewat `beats` di lyrics.js
//   dur     : lama partikel terbang saat transisi (detik)
//   glow    : partikel berpendar + halo hangat di belakang (0 = mati, 1 = penuh)
//   remorph : tetap terbang ulang walau bentuknya sama dengan scene sebelumnya
//   additive: partikel bercahaya seperti neon (untuk latar gelap) · dim: redam warna partikel (0..1)
//   fogColor/haloColor: warna kabut & halo
//   burst/twist/flightGlow: kekuatan lontaran, pusaran, & pendar saat transisi (0 = bergeser halus saja)
//   density : bagian partikel yang ditampilkan (0.4 = 40%, lebih renggang)
//   stage   : panggung + lampu sorot + mahkota · letterbox : garis hitam sinematik atas-bawah
//   cam     : gerakan kamera { z, y, ang: [awal, akhir], dur, orbit, orbitSpeed, hand, look, beatKick }
//   heaven  : cahaya surgawi (awan bercahaya + berkas sinar) · bg2 : latar kedua (berganti setelah 1.4 detik)
const SCENES = {
  happy:    { shape: 'happy',    bg: ['#ffffff', '#c9dbff'], text: 'jelly', size: 0.032, orbit: true, swing: 0.6, bounce: true, expr: true, hits: true, beats: [0.5, 1.0, 1.5, 2.0, 2.5] , cam: { z: [8.4, 7.4], hand: 0.04 } },
  happy2:   { shape: 'balloons', bg: ['#fffaf5', '#bcd3ff'], text: 'bubbly', size: 0.03, orbit: true, swing: 0.45, bob: 0.16, flight: '#ff86ad' , cam: { z: [7.6, 7.9], y: [-0.3, 0.6], look: 0.7 } },
  no:       { shape: 'balloons', bg: ['#fff6ef', '#b7c3ef'], text: 'burst', size: 0.03, orbit: true, swing: 0.35, bob: 0.16, pops: [0, 1, 2, 3], beats: [0.8, 1.6, 2.4, 3.2], shake: 0.06 , cam: { z: [7.9, 7.5], hand: 0.03 } },
  nofall:   { shape: 'chat',     bg: ['#f6f1ff', '#b4b2e8'], text: 'burst', size: 0.024, bubbles: true, beats: [0.3, 0.8, 1.3], dur: 0.45, orbit: true, swing: 0.3, flight: '#8a6bff' , cam: { z: [7.2, 8.2], ang: [-0.15, 0.1] } },
  favorite: { shape: 'model',   color: 'texture', bg: ['#2a2350', '#07060f'], fogColor: '#0b0918', text: 'spot', orbit: true, swing: 0.35, size: 0.022, reveal: true, stage: true, cam: { z: [9.4, 8.1], y: [-0.45, -0.3], dur: 6 } },
  day:      { shape: 'dayScene', bg: ['#2a170a', '#070403'], bg2: ['#4a2a12', '#0b0604'], fogColor: '#120a05', additive: true, haloColor: '#ffc979', text: 'heaven', size: 0.026, glow: 0.35, burst: 0.3, heaven: true, cam: { z: [8.8, 8.4], y: [-0.4, -0.4], orbit: 0.55, orbitSpeed: 0.3 } },
  awake:    { shape: 'moon',    bg: ['#16224d', '#03050f'], fogColor: '#03050f', fog: [16, 40], additive: true, night: true, text: 'dream', size: 0.026, flight: '#bcd0ff', letterbox: true, cam: { z: [8.4, 7.6], y: [-0.4, 0.3], look: 0.9, ang: [0.12, -0.12], dur: 4, hand: 0.015 } },
  one:      { shape: 'medal',   bg: ['#2a2140', '#08060f'], fogColor: '#0b0918', additive: true, dim: 0.45, text: 'pop', size: 0.026, hits: true, medal: true, flight: '#ffc23d', cam: { z: [8.4, 7.2], dur: 5 } },
  fan:      { shape: 'fanHeart', bg: ['#3a2352', '#0f0a1f'], fogColor: '#120b22', additive: true, glow: 0.8, haloColor: '#ff8fb8', text: 'heartbeat', size: 0.028, orbit: true, swing: 0.25, flight: '#ff8fb8' , cam: { z: [7.6, 7.2], orbit: 0.18, orbitSpeed: 0.5, beatKick: true } },
  cry:      { shape: 'cryHeart', bg: ['#232a52', '#080b1a'], fogColor: '#0a0d1d', additive: true, glow: 0.5, haloColor: '#8fa8ff', text: 'drip', size: 0.028, orbit: true, swing: 0.2, cry: true, beats: [1.4, 2.6, 3.8], burst: 0, twist: 0, build: 0, flightGlow: 0, dur: 1.6 , cam: { z: [6.8, 9.2], y: [0.2, -0.2], dur: 7 } , letterbox: true },
};
// pembuka (judul dari partikel) & penutup (bintang + kredit)
SCENES.opening = { shape: 'title', bg: ['#1a1f3a', '#05060d'], fogColor: '#05060d', additive: true, size: 0.022, text: 'none', letterbox: true, build: 0.1, cam: { z: [9, 8], dur: 4 } };
SCENES.ending = { shape: 'stars', palette: ['#8fa8ff', '#cfd9ff', '#ffd9a0'], bg: ['#0b0e1c', '#000000'], fogColor: '#000000', fog: [30, 60], additive: true, size: 0.05, spin: 0.03, text: 'none', letterbox: true, cam: { z: [8, 10], dur: 8 } };
const IDLE = { shape: 'scatter', palette: ['#3a55a8', '#5268a6', '#7a6440'], bg: ['#141a36', '#04050b'], fogColor: '#04050b', additive: true, spin: 0.03, size: 0.03, fog: [10, 22] };

/* ---------- renderer ---------- */
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 0, 8);
const hemi = new THREE.HemisphereLight(0xffffff, 0xbcd0ff, 2.2);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(2, 3, 5);
scene.add(sun);
// kabut tipis: partikel di belakang memudar -> kesan kedalaman 3D
scene.fog = new THREE.Fog(0xeef3ff, 7.5, 14);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

/* ---------- partikel ---------- */
function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.55, 'rgba(255,255,255,.9)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

const pos = new Float32Array(COUNT * 3);
const col = new Float32Array(COUNT * 3);
const vel = new Float32Array(COUNT * 3);
const speed = new Float32Array(COUNT).map(() => 0.6 + Math.random() * 0.8);
const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
const mat = new THREE.PointsMaterial({
  size: 0.03, map: dotTexture(), vertexColors: true, transparent: true, alphaTest: 0.2,
});
const points = new THREE.Points(geo, mat);
points.frustumCulled = false;
scene.add(points);

// model 3D asli, muncul perlahan menggantikan partikel
const modelGroup = new THREE.Group();
scene.add(modelGroup);
let meshMats = null;
let meshOpacity = 0;
function setMeshOpacity(o) {
  for (const m of meshMats) {
    const transparent = o < 0.995;
    if (m.transparent !== transparent) { m.transparent = transparent; m.needsUpdate = true; }
    m.opacity = o;
  }
  modelGroup.visible = o > 0.005;
}

/* ---------- medali logam ----------
   Model GLB medali muncul setelah partikel membentuknya: flip satu putaran, lalu berayun
   seperti tergantung di pitanya (pivot di atas). Pantulan lingkungan (RoomEnvironment)
   membuat logamnya berkilau, dan satu lampu kecil menyapu permukaannya bolak-balik. */
const envTex = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const medalPivot = new THREE.Group();
const medalInner = new THREE.Group();
medalPivot.add(medalInner);
medalPivot.visible = false;
scene.add(medalPivot);
const glint = new THREE.PointLight(0xfff1c4, 0, 8);
scene.add(glint);
let medalMats = null;
let medalOpacity = 0;
let medalAt = Infinity; // kapan medali asli muncul
let medalShownAt = Infinity;
let auraSwitched = false;
// urutan hati patah di scene `cry`: retak -> terbelah -> hancur (detik absolut)
let cryCrack = Infinity, crySplit = Infinity, cryCrumble = Infinity;
let crackDone = false, splitDone = false, crumbled = false;
let rippleAmp = 1, ecgAmp = 1;
// ekspresi bola wajah: dari ekspresi `exFrom` ke `exTo` sejauh `exE` (0..1), skala bintang aksen
let exFrom = 0, exTo = 0, exE = 1, accentK = 0;

/* ---------- reaksi musik ----------
   AnalyserNode membaca frekuensi lagu tiap frame. bass/mid/level = 0..1 (dihaluskan),
   beat = 1 sesaat setelah dentuman bass terdeteksi lalu memudar. */
const sound = { bass: 0, mid: 0, level: 0, beat: 0, avg: 0, lastBeat: -1 };
let analyser = null, freq = null;
function readAudio(dt) {
  if (!analyser) return;
  analyser.getByteFrequencyData(freq);
  let b = 0, m = 0, l = 0;
  for (let k = 1; k <= 6; k++) b += freq[k];
  for (let k = 7; k <= 60; k++) m += freq[k];
  for (let k = 0; k < freq.length; k++) l += freq[k];
  b /= 6 * 255; m /= 54 * 255; l /= freq.length * 255;
  const f = Math.min(1, dt * 20);
  sound.bass += (b - sound.bass) * f;
  sound.mid += (m - sound.mid) * f;
  sound.level += (l - sound.level) * f;
  sound.avg += (b - sound.avg) * Math.min(1, dt * 1.5);
  sound.beat = Math.max(0, sound.beat - dt * 4);
  if (b > sound.avg * 1.3 + 0.05 && time - sound.lastBeat > 0.28) {
    sound.beat = 1;
    sound.lastBeat = time;
    if (active.cam?.beatKick) kick(0.12);
  }
}

/* ---------- kamera ----------
   Tiap scene punya gerakan kamera sendiri (cam): z/y/ang = [awal, akhir] selama dur detik,
   orbit = ayunan kiri-kanan, hand = goyang seperti dipegang tangan, look = titik tatap (y).
   kick() = punch-in cepat di momen penting (balon pecah, hati retak, mahkota mendarat). */
let camKick = 0, camLook = 0;
// posisi kursor (-1..1) & versi halusnya, untuk paralaks kamera dan judul landing
const mouse = { x: 0, y: 0, sx: 0, sy: 0 };
addEventListener('pointermove', (e) => { mouse.x = (e.clientX / innerWidth) * 2 - 1; mouse.y = -((e.clientY / innerHeight) * 2 - 1); });
function kick(a) { camKick = Math.max(camKick, a); }

// lirik karaoke: kata menyala saat dinyanyikan (lihat `words` di lyrics.js)
let karaoke = null;
function updateKaraoke() {
  if (!karaoke) return;
  const t = time - karaoke.start;
  while (karaoke.next < karaoke.times.length && t >= karaoke.times[karaoke.next]) karaoke.spans[karaoke.next++].classList.add('sung');
}
const fogColor = new THREE.Color('#eef3ff');
const haloColor = new THREE.Color('#ffffff');
// kemiringan cincin glitter (sumbu X lalu Z)
const RING_CX = Math.cos(0.42), RING_SX = Math.sin(0.42), RING_CZ = Math.cos(0.18), RING_SZ = Math.sin(0.18);
function setMedalOpacity(o) {
  for (const m of medalMats) {
    const transparent = o < 0.995;
    if (m.transparent !== transparent) { m.transparent = transparent; m.needsUpdate = true; }
    m.opacity = o;
  }
  medalPivot.visible = o > 0.005;
}

/* ---------- panggung (scene favorite) ----------
   Panggung bundar berputar dengan lampu di tepinya, 3 kerucut cahaya lampu sorot (efek visual,
   tidak mengubah pencahayaan model), dan mahkota emas yang turun ke kepala. */
const stage = new THREE.Group();
stage.position.y = -1.6;
stage.visible = false;
scene.add(stage);
const stageMats = [];
const stageMat = (m) => { m.transparent = true; stageMats.push(m); return m; };
const stageTop = new THREE.Group();
stage.add(stageTop);
stageTop.add(new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.65, 0.16, 64).translate(0, -0.08, 0),
  stageMat(new THREE.MeshStandardMaterial({ color: '#2b2350', metalness: 0.6, roughness: 0.3, envMap: envTex }))));
[[1.58, '#ff8fb8'], [1.1, '#ffd36e']].forEach(([r, color]) => {
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.022, 12, 128), stageMat(new THREE.MeshBasicMaterial({ color })));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.005;
  stageTop.add(ring);
});
const bulbs = [];
const BULB = new THREE.Color('#fff1c4'); // warna lampu kecil di tepi panggung
for (let k = 0; k < 18; k++) {
  const a = (k / 18) * Math.PI * 2;
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), stageMat(new THREE.MeshBasicMaterial({ color: '#fff1c4' })));
  bulb.position.set(Math.cos(a) * 1.6, -0.08, Math.sin(a) * 1.6);
  stageTop.add(bulb);
  bulbs.push(bulb);
}

const SPOTS = [
  { pos: [-3.2, 5, 1.5], color: '#ffe9c4', at: 0.4 },
  { pos: [3.2, 5, 1.5], color: '#ffd1e3', at: 0.9 },
  { pos: [0, 5.5, -1.6], color: '#cfe0ff', at: 1.4 },
].map((sp) => {
  const from = new THREE.Vector3(...sp.pos), floor = new THREE.Vector3(0, -1.6, 0);
  const len = from.distanceTo(floor);
  // kerucut cahaya: paling terang di sumbernya, memudar ke lantai
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(1.3, len, 48, 1, true).translate(0, -len / 2, 0).rotateX(-Math.PI / 2),
    new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(sp.color) }, uOpacity: { value: 0 } },
      vertexShader: 'varying float vH; void main() { vH = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 uColor; uniform float uOpacity; varying float vH; void main() { gl_FragColor = vec4(uColor, pow(vH, 1.6) * uOpacity); }',
      transparent: true, depthWrite: false, ...GLOW_BLEND, side: THREE.DoubleSide,
    }),
  );
  cone.position.copy(from);
  cone.lookAt(floor);
  cone.visible = false;
  scene.add(cone);
  return { ...sp, cone, k: 0 };
});

// mahkota emas: pita, 5 duri berujung bola, dan permata warna-warni
const crown = new THREE.Group();
const crownMats = [];
const crownMat = (o) => { const m = new THREE.MeshStandardMaterial({ envMap: envTex, transparent: true, ...o }); crownMats.push(m); return m; };
const gold = crownMat({ color: '#ffc23d', metalness: 1, roughness: 0.22, envMapIntensity: 1.6 });
crown.add(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.27, 0.14, 48, 1, true), gold));
['#ff4f8b', '#4f7dff', '#8a6bff', '#4f7dff', '#ff4f8b'].forEach((gem, k) => {
  const a = (k / 5) * Math.PI * 2;
  const spike = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.2, 16), gold);
  spike.position.set(Math.sin(a) * 0.285, 0.17, Math.cos(a) * 0.285);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 10), gold);
  tip.position.set(spike.position.x, 0.285, spike.position.z);
  const b = a + Math.PI / 5;
  const jewel = new THREE.Mesh(new THREE.SphereGeometry(0.04, 16, 10), crownMat({ color: gem, metalness: 0.2, roughness: 0.08 }));
  jewel.position.set(Math.sin(b) * 0.3, 0, Math.cos(b) * 0.3);
  crown.add(spike, tip, jewel);
});
crown.rotation.z = 0.12; // sedikit miring biar lucu
crown.visible = false;
modelGroup.add(crown);
const crownRest = new THREE.Vector3(0, 2.35, 0);
let crownLanded = false;

/* ---------- penganugerahan (scene one) ----------
   Confetti 3D sungguhan (InstancedMesh: kertas metalik yang berputar & melayang jatuh) yang
   meledak saat medali muncul + semburan kecil di tiap ketukan, dan pilar cahaya dari atas. */
const CONFETTI_N = 420;
const confetti = new THREE.InstancedMesh(
  new THREE.PlaneGeometry(0.07, 0.13),
  new THREE.MeshStandardMaterial({ metalness: 0.85, roughness: 0.35, envMap: envTex, envMapIntensity: 1.3, side: THREE.DoubleSide }),
  CONFETTI_N,
);
confetti.frustumCulled = false;
confetti.visible = false;
scene.add(confetti);
const cf = {
  p: new Float32Array(CONFETTI_N * 3), v: new Float32Array(CONFETTI_N * 3),
  r: new Float32Array(CONFETTI_N * 3), w: new Float32Array(CONFETTI_N * 3),
  alive: new Uint8Array(CONFETTI_N), next: 0, k: 0,
};
{
  const cols = ['#ffc23d', '#ffe08a', '#ff6f9c', '#5b86ff', '#e8ecff'].map((h) => new THREE.Color(h));
  for (let i = 0; i < CONFETTI_N; i++) confetti.setColorAt(i, cols[i % cols.length]);
}
const cfDummy = new THREE.Object3D();
// posisi meriam confetti di tepi kiri & kanan (dihitung saat dipakai: visibleWidth didefinisikan di bawah)
const cannonX = () => (visibleWidth() / 2) * 0.92;
function burstConfetti(n, ox, oy, oz, power, aimX = 0) {
  for (let m = 0; m < n; m++) {
    const i = cf.next, ix = i * 3;
    cf.next = (cf.next + 1) % CONFETTI_N;
    const dx = rand(-1, 1) + aimX * 1.4, dy = rand(0.4, 1.3) + Math.abs(aimX) * 0.5, dz = rand(-0.7, 0.7), len = Math.hypot(dx, dy, dz);
    const sp = rand(2.5, 6.5) * power;
    cf.p[ix] = ox + rand(-0.1, 0.1); cf.p[ix + 1] = oy + rand(-0.1, 0.1); cf.p[ix + 2] = oz;
    cf.v[ix] = (dx / len) * sp; cf.v[ix + 1] = (dy / len) * sp; cf.v[ix + 2] = (dz / len) * sp;
    for (let k = 0; k < 3; k++) { cf.r[ix + k] = Math.random() * 6.3; cf.w[ix + k] = rand(-9, 9); }
    cf.alive[i] = 1;
  }
}
function updateConfetti(dt, on) {
  cf.k += ((on ? 1 : 0) - cf.k) * (1 - Math.pow(0.02, dt));
  confetti.visible = cf.k > 0.01;
  if (!confetti.visible) return;
  const d = Math.max(0, 1 - 1.6 * dt);
  for (let i = 0; i < CONFETTI_N; i++) {
    const ix = i * 3;
    if (cf.alive[i]) {
      // gravitasi + hambatan udara -> melambat lalu melayang turun sambil bergoyang
      cf.v[ix] = cf.v[ix] * d + Math.sin(time * 3 + i) * 0.6 * dt;
      cf.v[ix + 1] = cf.v[ix + 1] * d - 1.8 * dt; // gravitasi kecil: confetti melayang lama
      cf.v[ix + 2] *= d;
      for (let k = 0; k < 3; k++) { cf.p[ix + k] += cf.v[ix + k] * dt; cf.r[ix + k] += cf.w[ix + k] * dt; }
      if (cf.p[ix + 1] < -4.5) cf.alive[i] = 0;
    }
    cfDummy.position.set(cf.p[ix], cf.p[ix + 1], cf.p[ix + 2]);
    cfDummy.rotation.set(cf.r[ix], cf.r[ix + 1], cf.r[ix + 2]);
    cfDummy.scale.setScalar(cf.alive[i] ? cf.k : 0);
    cfDummy.updateMatrix();
    confetti.setMatrixAt(i, cfDummy.matrix);
  }
  confetti.instanceMatrix.needsUpdate = true;
}
// pilar cahaya dari atas ke medali (kerucut dengan gradasi seperti lampu sorot panggung)
const beam = new THREE.Mesh(
  new THREE.ConeGeometry(1.7, 6.8, 48, 1, true).translate(0, -3.4, 0),
  new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color('#ffe2a8') }, uOpacity: { value: 0 } },
    vertexShader: 'varying float vH; void main() { vH = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 uColor; uniform float uOpacity; varying float vH; void main() { gl_FragColor = vec4(uColor, pow(vH, 1.3) * uOpacity); }',
    transparent: true, depthWrite: false, ...GLOW_BLEND, side: THREE.DoubleSide,
  }),
);
beam.position.set(0, 6.2, -0.8);
beam.visible = false;
scene.add(beam);
let beamK = 0;
let stageK = 0;
let sceneStart = 0;
let camZ = 8, camY = 0, camAng = 0;

/* ---------- cahaya surgawi (scene day, referensi source/sun.png) ----------
   Gumpalan awan yang disinari dari belakang (partikel, lihat dayShape), cahaya hangat lembut
   di baliknya, dan berkas-berkas cahaya vertikal yang turun dari awan ke badan. Berkas cahaya
   selalu menghadap kamera (billboard sumbu Y) supaya tetap terlihat saat kamera mengitari. */
function softGlowTexture() {
  const S = 256, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, 'rgba(255,226,170,.9)');
  grd.addColorStop(0.35, 'rgba(255,180,90,.35)');
  grd.addColorStop(1, 'rgba(255,150,70,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(cv);
}
const heavenGlow = new THREE.Sprite(new THREE.SpriteMaterial({
  map: softGlowTexture(), transparent: true, depthWrite: false, fog: false, opacity: 0, ...GLOW_BLEND,
}));
heavenGlow.scale.set(7, 4.5, 1);
heavenGlow.position.set(0, 3.0, -2);
heavenGlow.visible = false;
scene.add(heavenGlow);

const shafts = new THREE.Group();
shafts.visible = false;
scene.add(shafts);
const shaftUniforms = { uTime: { value: 0 }, uReveal: { value: 0 }, uOpacity: { value: 0 } };
const SHAFT_TOP = 2.8, SHAFT_LEN = 5.4;
for (let k = 0; k < 11; k++) {
  const w = k % 3 === 0 ? rand(0.18, 0.3) : rand(0.04, 0.12);
  const shaft = new THREE.Mesh(
    new THREE.PlaneGeometry(w, SHAFT_LEN).translate(0, -SHAFT_LEN / 2, 0),
    new THREE.ShaderMaterial({
      uniforms: {
        ...shaftUniforms,
        uSeed: { value: Math.random() },
        uStrength: { value: rand(0.35, 1) },
        uColor: { value: new THREE.Color(k % 3 ? '#ffc979' : '#fff0cf') },
      },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        uniform vec3 uColor; uniform float uTime, uReveal, uOpacity, uSeed, uStrength;
        varying vec2 vUv;
        void main() {
          float y = vUv.y; // 1 = atas (awan), 0 = bawah
          float fade = pow(y, 0.7) * smoothstep(0.0, 0.25, y);
          float edge = pow(1.0 - abs(vUv.x * 2.0 - 1.0), 1.6);
          float reveal = smoothstep(1.0 - uReveal - 0.15, 1.0 - uReveal, y); // turun dari atas
          float shimmer = 0.7 + 0.3 * sin(uTime * 1.3 + uSeed * 20.0 + y * 3.0);
          gl_FragColor = vec4(uColor, fade * edge * reveal * shimmer * uOpacity * uStrength);
        }`,
      transparent: true, depthWrite: false, ...GLOW_BLEND, side: THREE.DoubleSide,
    }),
  );
  shaft.position.set(rand(-0.95, 0.95), SHAFT_TOP, rand(-1.4, 0.4));
  shafts.add(shaft);
}
let sunK = 0;
// halo bulan (scene awake)
const moonHalo = new THREE.Sprite(new THREE.SpriteMaterial({
  map: softGlowTexture(), color: '#bcd0ff', transparent: true, depthWrite: false, fog: false, opacity: 0, ...GLOW_BLEND,
}));
moonHalo.visible = false;
scene.add(moonHalo);
let moonK = 0;
let bgTimer = 0;

/* ---------- partikel bercahaya ----------
   Lapisan "aura": partikel yang sama digambar ulang lebih besar & transparan,
   jadi tiap titik punya pendar lembut (seperti bloom) yang tetap terlihat di latar terang. */
const glow = { value: 0 };
const auraMat = new THREE.PointsMaterial({
  size: 0.12, map: mat.map, vertexColors: true, transparent: true, opacity: 0, depthWrite: false,
});
const aura = new THREE.Points(geo, auraMat);
aura.frustumCulled = false;
points.add(aura);

// halo hangat lembut di belakang badan
function haloTexture() {
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, 'rgba(255,214,110,.55)');
  grd.addColorStop(0.5, 'rgba(255,200,90,.2)');
  grd.addColorStop(1, 'rgba(255,190,90,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(c);
}
const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTexture(), transparent: true, depthWrite: false, fog: false, opacity: 0 }));
halo.scale.set(5, 7, 1);
halo.position.set(0, 0.4, -1.5);
halo.renderOrder = -1;
scene.add(halo);

/* ---------- bentuk ---------- */
const visibleWidth = () => 2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;

function scatterShape(rMin, rMax) {
  const out = new Float32Array(COUNT * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < COUNT; i++) {
    v.randomDirection().multiplyScalar(rand(rMin, rMax));
    v.toArray(out, i * 3);
  }
  return out;
}

function heartShape(scale) {
  const out = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT; i++) {
    const t = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random());
    const x = 16 * Math.sin(t) ** 3;
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    out[i * 3] = x * r * scale;
    out[i * 3 + 1] = y * r * scale + 0.8;
    out[i * 3 + 2] = rand(-1, 1) * (1 - r * r) * 18 * scale * 0.4;
  }
  return out;
}

// pencahayaan "dipanggang" ke warna partikel supaya bentuk bulat terlihat bervolume
const LIGHT = new THREE.Vector3(-0.45, 0.6, 0.65).normalize();
const WHITE = new THREE.Color(1, 1, 1);
function shade(c, n, gloss = 0) {
  const d = Math.max(0, n.dot(LIGHT));
  c.multiplyScalar(0.6 + 0.4 * d);
  if (gloss) c.lerp(WHITE, Math.pow(d, 28) * gloss);
  return c;
}

// alat bantu untuk bola wajah: kulit bola + fitur wajah yang ditempel di permukaan depan
function faceTools(R, cy, positions, colors) {
  const n = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
  const put = (i) => { p.toArray(positions, i * 3); positions[i * 3 + 1] += cy; c.toArray(colors, i * 3); };
  // fitur digambar 2D (x, y) lalu diproyeksikan ke permukaan bola
  const face = (i, x, y, color) => {
    n.set(x, y, Math.sqrt(Math.max(0, R * R - x * x - y * y))).normalize();
    p.copy(n).multiplyScalar(R * 1.02);
    shade(c.copy(color), n);
    put(i);
  };
  const skin = (i, a, b) => {
    n.randomDirection();
    p.copy(n).multiplyScalar(R);
    shade(c.copy(a).lerp(b, Math.random()), n, 0.6);
    put(i);
  };
  return { n, p, c, put, face, skin };
}

// bola wajah 3D yang berganti-ganti ekspresi (seperti emoticon), cincin berkilau, dan bintang aksen.
// Partikel wajah (pivotKind 14) punya posisi & warna untuk TIAP ekspresi, lalu di-morph saat ganti.
// Bintang aksen (pivotKind 15) muncul kenyal di kanan atas pada ekspresi tertentu.
const EXPRESSIONS = [
  { eyes: ['arc', 'arc'], mouth: 'openTongue' },          // senang ^ ^
  { eyes: ['dot', 'dot'], mouth: 'smile' },               // senyum
  { eyes: ['dot', 'wink'], mouth: 'smile', accent: 1 },   // kedip + bintang
  { eyes: ['dot', 'dot'], mouth: 'laugh' },               // tertawa lebar
  { eyes: ['squint', 'squint'], mouth: 'tongue' },        // > < melet
  { eyes: ['wink', 'dot'], mouth: 'tongueSide', accent: 1 }, // kedip melet + kilau
];
function happyShape(R) {
  const positions = new Float32Array(COUNT * 3), colors = new Float32Array(COUNT * 3);
  const phase = new Float32Array(COUNT), weight = new Float32Array(COUNT);
  const pivot = new Float32Array(COUNT * 3), pivotKind = new Uint8Array(COUNT);
  const cy = 0.75;
  const skinA = new THREE.Color('#8fb4ff'), skinB = new THREE.Color('#bcd3ff');
  const ink = new THREE.Color('#1b2f73'), blush = new THREE.Color('#ff9cc2');
  const tongue = new THREE.Color('#ff6f9c'), red = new THREE.Color('#ff4f5e'), coral = new THREE.Color('#ff6f61');
  const redDark = new THREE.Color('#c92a42'), redLight = new THREE.Color('#ff9aa4');
  const gold = new THREE.Color('#ffc94d');
  const sparkle = ['#ffc94d', '#5b86ff', '#ff86ad', '#ffffff'].map((h) => new THREE.Color(h));
  const tilt = new THREE.Euler(1.15, 0, 0.35);
  const { p, c, put, skin } = faceTools(R, cy, positions, colors);
  const n = new THREE.Vector3();

  // --- fitur wajah (koordinat dalam satuan R, pusat wajah = 0,0) -> [x, y, warna]
  const eye = (kind, sx) => {
    const ex = sx * 0.35, ey = 0.1;
    if (kind === 'dot') {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 0.075;
      return [ex + Math.cos(a) * r * 0.8, ey + Math.sin(a) * r * 1.35, ink];
    }
    if (kind === 'arc') {
      const a = rand(0.1, 0.9) * Math.PI, r = rand(0.15, 0.18);
      return [ex + Math.cos(a) * r, ey - 0.04 + Math.sin(a) * r, ink];
    }
    // chevron: 'squint' menunjuk ke tengah wajah (> <), 'wink' = mata tertutup melengkung ke bawah
    if (kind === 'squint') {
      const dir = -sx, t = Math.random(), up = Math.random() < 0.5 ? 1 : -1;
      return [ex - dir * 0.09 + dir * 0.16 * t + rand(-0.012, 0.012), ey + up * 0.085 * (1 - t) + rand(-0.012, 0.012), ink];
    }
    const a = rand(1.15, 1.85) * Math.PI, r = 0.12;
    return [ex + Math.cos(a) * r, ey + 0.06 + Math.sin(a) * r * 0.6 + rand(-0.012, 0.012), ink];
  };
  const smileArc = (r0, y0) => {
    const a = rand(1.15, 1.85) * Math.PI, r = r0 + rand(-0.018, 0.018);
    return [Math.cos(a) * r, y0 + Math.sin(a) * r * 0.9, ink];
  };
  const blob = (cx, cy0, rx, ry, color) => {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random());
    return [cx + Math.cos(a) * r * rx, cy0 + Math.sin(a) * r * ry, color];
  };
  const mouth = (kind) => {
    if (kind === 'openTongue') {
      const a = rand(1, 2) * Math.PI, r = Math.sqrt(Math.random()) * 0.32;
      const x = Math.cos(a) * r, y = -0.12 + Math.sin(a) * r * 0.85;
      return [x, y, y < -0.3 && Math.abs(x) < 0.18 ? tongue : ink];
    }
    if (kind === 'smile') return smileArc(0.36, 0.02);
    if (kind === 'laugh') {
      // mulut terbuka lebar: isi koral dengan pinggiran gelap
      const a = rand(1, 2) * Math.PI, r = Math.sqrt(Math.random()) * 0.36;
      const x = Math.cos(a) * r, y = -0.08 + Math.sin(a) * r * 0.9;
      return [x, y, r > 0.32 || y > -0.1 ? ink : coral];
    }
    if (Math.random() < 0.4) return smileArc(0.28, -0.02);
    // lidah samping: keluar dari sudut kanan senyum, ujungnya miring ke luar (bukan ke tengah)
    return kind === 'tongueSide' ? tongueOut(0.13, 0.3, 0.17, 0.2, -0.265) : tongueOut(0, 0);
  };
  // lidah menjulur: bentuk U (pangkal rata, ujung membulat), alur di tengah, kilau di kiri atas,
  // dan menonjol 3D (lift) paling tebal di tengah. ox = geser ke samping, ang = miring (radian, + = ke kanan)
  const tongueOut = (ox, ang, w = 0.2, l = 0.24, top = -0.25) => {
    let x, y;
    do { x = rand(-w / 2, w / 2); y = rand(0, l); } while (y > l - w / 2 && Math.hypot(x, y - (l - w / 2)) > w / 2);
    let color = red;
    if (Math.abs(x) < 0.012 && y > 0.04 && y < l - 0.05) color = redDark;
    else if (x < -0.035 && x > -0.075 && y > 0.06 && y < 0.13) color = redLight;
    const lift = 0.07 * (1 - ((2 * x) / w) ** 2) * Math.min(1, y / 0.05); // pangkal masuk ke mulut
    const ca = Math.cos(ang), sa = Math.sin(ang);
    return [ox + x * ca + y * sa, top + x * sa - y * ca, color, lift];
  };
  const cheek = (sx) => blob(sx * 0.62, -0.1, 0.16, 0.1, blush);

  const faceStart = Math.floor(COUNT * 0.6), faceEnd = Math.floor(COUNT * 0.79), faceN = faceEnd - faceStart;
  const exprPos = EXPRESSIONS.map(() => new Float32Array(COUNT * 3));
  const exprCol = EXPRESSIONS.map(() => new Float32Array(COUNT * 3));
  const project = (x, y, color, lift, i, outP, outC) => {
    x *= R; y *= R;
    n.set(x, y, Math.sqrt(Math.max(0, R * R - x * x - y * y))).normalize();
    p.copy(n).multiplyScalar(R * (1.02 + (lift ?? 0)));
    p.y += cy;
    p.toArray(outP, i * 3);
    shade(c.copy(color), n).toArray(outC, i * 3);
  };
  for (let i = faceStart; i < faceEnd; i++) {
    // pembagian tetap per partikel: 30% mata, 45% mulut, 25% pipi
    const q = (i - faceStart) / faceN;
    EXPRESSIONS.forEach((ex, e) => {
      const [x, y, color, lift] = q < 0.3 ? eye(ex.eyes[q < 0.15 ? 0 : 1], q < 0.15 ? -1 : 1) : q < 0.75 ? mouth(ex.mouth) : cheek(q < 0.875 ? -1 : 1);
      project(x, y, color, lift, i, exprPos[e], exprCol[e]);
    });
    positions.set(exprPos[0].subarray(i * 3, i * 3 + 3), i * 3);
    colors.set(exprCol[0].subarray(i * 3, i * 3 + 3), i * 3);
    pivotKind[i] = 14;
  }

  const accentPivot = [1.05 * R, cy + 1.05 * R, 0.35 * R];
  for (let i = 0; i < COUNT; i++) {
    if (i >= faceStart && i < faceEnd) continue;
    const f = i / COUNT, ix = i * 3;
    if (f < 0.6) {
      skin(i, skinA, skinB);
    } else if (f < 0.95) {
      const a = Math.random() * Math.PI * 2, r = R * rand(1.45, 1.75);
      p.set(Math.cos(a) * r, rand(-0.02, 0.02) * R, Math.sin(a) * r).applyEuler(tilt);
      c.copy(sparkle[i % sparkle.length]);
      put(i);
    } else if (f < 0.975) {
      p.randomDirection().multiplyScalar(R * rand(2, 2.6));
      c.copy(sparkle[i % sparkle.length]);
      put(i);
    } else {
      // bintang aksen 4 sudut (lebih padat di tengah)
      const arm = (i % 4) * (Math.PI / 2) + 0.3, t = Math.pow(Math.random(), 1.6), size = 0.32 * R;
      const w = (1 - t) * 0.18 * size * rand(-1, 1);
      positions[ix] = accentPivot[0] + Math.cos(arm) * t * size - Math.sin(arm) * w;
      positions[ix + 1] = accentPivot[1] + Math.sin(arm) * t * size + Math.cos(arm) * w;
      positions[ix + 2] = accentPivot[2] + rand(-0.02, 0.02);
      pivot.set(accentPivot, ix);
      pivotKind[i] = 15;
      gold.toArray(colors, ix);
    }
  }
  return { positions, colors, phase, weight, pivot, pivotKind, exprPos, exprCol, accent: EXPRESSIONS.map((e) => e.accent ?? 0), hide: [0, cy, 0] };
}

// "bantal" 3D dari gambar 2D: jarak tiap piksel ke tepi (chamfer distance) jadi ketebalan gembung
function puffMask(W, H, draw) {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = g.strokeStyle = '#fff';
  draw(g);
  const a = g.getImageData(0, 0, W, H).data;
  const d = new Float32Array(W * H), inside = [];
  for (let i = 0; i < W * H; i++) if (a[i * 4 + 3] > 128) { d[i] = 1e9; inside.push(i); }
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (d[i]) d[i] = Math.min(d[i], d[i - 1] + 1, d[i - W] + 1, d[i - W - 1] + 1.414, d[i - W + 1] + 1.414);
    }
  let dmax = 0;
  for (let y = H - 2; y > 0; y--)
    for (let x = W - 2; x > 0; x--) {
      const i = y * W + x;
      if (d[i]) d[i] = Math.min(d[i], d[i + 1] + 1, d[i + W] + 1, d[i + W + 1] + 1.414, d[i + W - 1] + 1.414);
      if (d[i] > dmax) dmax = d[i];
    }
  return { d, inside, dmax };
}

// tiga gelembung chat 3D yang menggembung, bertumpuk rata kanan seperti pesan terkirim di HP.
// Tiap gelembung muncul (pop kenyal) tepat di ketukannya.
function chatShape(visW) {
  const positions = new Float32Array(COUNT * 3), colors = new Float32Array(COUNT * 3);
  const phase = new Float32Array(COUNT), weight = new Float32Array(COUNT);
  const pivot = new Float32Array(COUNT * 3), pivotKind = new Uint8Array(COUNT), group = new Int8Array(COUNT);
  const fit = Math.min(1, visW / 4);
  const right = Math.min(2.4, visW / 2 - 0.25);
  const bubbles = [
    { w: 2.0, y: 2.45, col: '#4f7dff', txt: 'no' },
    { w: 2.3, y: 1.25, col: '#ff6f9c', txt: 'no!' },
    { w: 2.7, y: -0.05, col: '#8a6bff', txt: 'no!!' },
  ];
  const W = 512, H = 256;
  const shapeOf = (g) => {
    g.beginPath();
    g.roundRect(16, 16, 480, 168, 84);
    g.fill();
    // ekor gelembung di kanan bawah
    g.beginPath();
    g.moveTo(400, 150);
    g.quadraticCurveTo(470, 180, 500, 236);
    g.quadraticCurveTo(440, 215, 360, 175);
    g.fill();
  };
  const body = puffMask(W, H, shapeOf);
  const n = new THREE.Vector3(), c = new THREE.Color();
  const textCol = new THREE.Color('#ffffff');
  const total = bubbles.reduce((a, b) => a + b.w * b.w, 0);
  let i = 0;
  bubbles.forEach((b, k) => {
    const w = b.w * fit, s = w / 480; // dunia per piksel
    const cx = right - w / 2, cy = b.y;
    const P = body.dmax * s * 0.75;
    const h = (j) => { const t = Math.min(1, body.d[j] / body.dmax); return P * Math.sqrt(1 - (1 - t) * (1 - t)); };
    const text = puffMask(W, H, (g) => {
      g.font = '900 110px "Arial Rounded MT Bold", "Arial Black", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(b.txt, 256, 104);
    });
    const base = new THREE.Color(b.col);
    const end = k === bubbles.length - 1 ? COUNT : i + Math.round((COUNT * b.w * b.w) / total);
    for (; i < end; i++) {
      const ix = i * 3;
      const isText = Math.random() < 0.15 && text.inside.length;
      const j = isText ? text.inside[(Math.random() * text.inside.length) | 0] : body.inside[(Math.random() * body.inside.length) | 0];
      const x = j % W, y = (j / W) | 0;
      const side = isText ? 1 : Math.random() < 0.5 ? 1 : -1;
      const gx = (h(j + 1) - h(j - 1)) / (2 * s), gy = (h(j + W) - h(j - W)) / (2 * s);
      n.set(-gx, gy, side).normalize();
      positions[ix] = cx + (x + Math.random() - 256) * s;
      positions[ix + 1] = cy + (100 - y - Math.random()) * s;
      positions[ix + 2] = side * h(j) + (isText ? 0.03 : 0);
      if (isText) c.copy(textCol);
      else {
        const chrome = 0.5 + 0.5 * n.y;
        c.copy(base).lerp(WHITE, chrome * chrome * 0.35);
      }
      shade(c, n, isText ? 0 : 0.9);
      c.toArray(colors, ix);
      pivot[ix] = cx + w * 0.3; pivot[ix + 1] = cy - 0.3 * w * 0.35; pivot[ix + 2] = 0; // pop dari arah ekor
      pivotKind[i] = 4;
      group[i] = k;
    }
  });
  return { positions, colors, phase, weight, pivot, pivotKind, group };
}

// medali emas 3D juara #1: tepi bergerigi seperti rosette, angka 1 timbul berwarna biru,
// alur cincin di permukaan, dua pita bergaris ke atas, dan bintang berkelip di sekitarnya
function medalShape(visW) {
  const positions = new Float32Array(COUNT * 3), colors = new Float32Array(COUNT * 3);
  const phase = new Float32Array(COUNT), weight = new Float32Array(COUNT);
  const pivot = new Float32Array(COUNT * 3), pivotKind = new Uint8Array(COUNT);
  const fit = Math.min(1, visW / 4.2);
  const W = 512, R = 1.35 * fit, s = R / 240, cy = 0.45;
  const T = 0.16 * fit, rim = 18; // tebal koin & lebar tepi yang membulat (piksel)
  const disc = puffMask(W, W, (g) => {
    g.beginPath();
    for (let k = 0; k <= 360; k++) {
      const a = (k / 360) * Math.PI * 2, r = 230 + 10 * Math.cos(a * 16);
      g.lineTo(256 + Math.cos(a) * r, 256 + Math.sin(a) * r);
    }
    g.fill();
  });
  const num = puffMask(W, W, (g) => {
    g.font = '900 300px "Arial Black", "Arial Rounded MT Bold", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('1', 256, 270);
  });
  const h = (j) => T * Math.sqrt(Math.min(1, disc.d[j] / rim));
  const goldA = new THREE.Color('#ffc23d'), goldDark = new THREE.Color('#d99a00');
  const enamel = new THREE.Color('#2f5fe0');
  const stripes = ['#4f7dff', '#ffffff', '#ff6f9c', '#ffffff', '#4f7dff'].map((x) => new THREE.Color(x));
  const starCols = [new THREE.Color('#ffc94d'), new THREE.Color('#5b86ff'), new THREE.Color('#ff86ad')];
  const stars = [[-2.3, 2.6, 0.25], [2.4, 2.2, 0.3], [-2.6, 0.3, 0.22], [2.5, -0.4, 0.2], [-1.6, -0.9, 0.16], [1.7, 3.1, 0.18]];
  const n = new THREE.Vector3(), c = new THREE.Color();
  for (let i = 0; i < COUNT; i++) {
    const f = i / COUNT, ix = i * 3;
    let x, y, z;
    if (f < 0.7) {
      const j = disc.inside[(Math.random() * disc.inside.length) | 0];
      const px = j % W, py = (j / W) | 0;
      const side = Math.random() < 0.5 ? 1 : -1;
      const gx = (h(j + 1) - h(j - 1)) / (2 * s), gy = (h(j + W) - h(j - W)) / (2 * s);
      n.set(-gx, gy, side).normalize();
      x = (px + Math.random() - 256) * s;
      y = (256 - py - Math.random()) * s + cy;
      z = side * h(j);
      const rr = Math.hypot(px - 256, py - 256);
      if (side > 0 && num.d[j] > 0) {
        // angka timbul: sisi angka sedikit lebih tinggi & berkilau
        z += 0.06 * fit * Math.min(1, num.d[j] / 4);
        c.copy(enamel).lerp(WHITE, Math.max(0, n.y) * 0.3);
      } else if (Math.abs(rr - 190) < 6) {
        z -= side * 0.015; // alur cincin
        c.copy(goldDark);
      } else {
        const chrome = 0.5 + 0.5 * n.y;
        c.copy(goldA).lerp(WHITE, chrome * chrome * 0.45);
      }
      shade(c, n, 0.9);
    } else if (f < 0.9) {
      // pita: dua tali berbentuk V dari belakang atas medali ke atas layar
      const left = f < 0.8, t = Math.random(), u = Math.random();
      const x0 = (left ? -0.35 : 0.35) * R, y0 = cy + R * 0.75;
      const x1 = (left ? -1.05 : 1.05) * R, y1 = Math.min(3.5, cy + R * 2.5);
      const wv = 0.42 * R;
      x = x0 + (x1 - x0) * t + (u - 0.5) * wv;
      y = y0 + (y1 - y0) * t;
      z = -T - 0.05 + Math.sin(t * Math.PI) * 0.12 * (left ? 1 : -1);
      c.copy(stripes[Math.min(stripes.length - 1, (u * stripes.length) | 0)]);
      n.set(0, 0, 1);
      shade(c, n.set(left ? 0.3 : -0.3, 0, 1).normalize());
    } else {
      const k = i % stars.length, [sx, sy, sz] = stars[k];
      const cx = sx * fit, size = sz * Math.max(0.75, fit);
      const arm = (i % 4) * (Math.PI / 2) + k * 0.4, t = Math.pow(Math.random(), 1.6);
      const w = (1 - t) * 0.16 * size * rand(-1, 1);
      x = cx + Math.cos(arm) * t * size - Math.sin(arm) * w;
      y = sy + Math.sin(arm) * t * size + Math.cos(arm) * w;
      z = rand(-0.03, 0.03) - 0.4;
      c.copy(starCols[k % starCols.length]);
      pivot[ix] = cx; pivot[ix + 1] = sy; pivot[ix + 2] = -0.4;
      pivotKind[i] = 1;
      phase[i] = k * 0.9;
    }
    positions[ix] = x; positions[ix + 1] = y; positions[ix + 2] = z;
    c.toArray(colors, ix);
  }
  return { positions, colors, phase, weight, pivot, pivotKind };
}

// aura medali: cincin glitter miring yang mengorbit (5), angka "1" raksasa di belakang medali
// yang disapu kilau emas dari bawah ke atas (bright 4), bintang berkelip (1), dan kilau naik (6)
function medalAuraShape(visW) {
  const positions = new Float32Array(COUNT * 3), colors = new Float32Array(COUNT * 3);
  const phase = new Float32Array(COUNT), weight = new Float32Array(COUNT);
  const pivot = new Float32Array(COUNT * 3), pivotKind = new Uint8Array(COUNT), bright = new Uint8Array(COUNT);
  const fit = Math.min(1, visW / 4.2);
  // warna diredam karena scene ini memakai cahaya aditif
  const ringCols = ['#ffc23d', '#ffb000', '#ffe08a', '#5b86ff', '#ff86ad'].map((h) => new THREE.Color(h).multiplyScalar(0.6));
  const starCols = ['#ffc94d', '#5b86ff', '#ff86ad'].map((h) => new THREE.Color(h).multiplyScalar(0.7));
  const riseCol = new THREE.Color('#ffd86b').multiplyScalar(0.7);
  const oneRim = new THREE.Color('#ffd27a').multiplyScalar(1.1), oneFill = new THREE.Color('#ffb000').multiplyScalar(0.16);
  const stars = [[-2.3, 2.6, 0.25], [2.4, 2.2, 0.3], [-2.6, 0.3, 0.22], [2.5, -0.4, 0.2], [-1.6, -0.9, 0.16], [1.7, 3.1, 0.18]];
  // angka "1": garis tepi menyala + isi tipis, tinggi ~5 satuan, jauh di belakang medali
  const W = 512;
  const one = puffMask(W, W, (g) => {
    g.font = 'italic 600 440px Fraunces, Georgia, serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('1', 256, 280);
  });
  const oneEdge = one.inside.filter((j) => one.d[j] < 3);
  const s1 = (6 * Math.max(0.8, fit)) / 400;
  const halfW = visW / 2 + 0.3, sx = halfW / 2.6; // sebar sampai tepi kiri & kanan layar
  const dustCols = ['#ffd27a', '#ffe9c4', '#ff9cc2', '#9fb7ff'].map((h) => new THREE.Color(h).multiplyScalar(0.55));
  for (let i = 0; i < COUNT; i++) {
    const f = i / COUNT, ix = i * 3;
    let c;
    if (f < 0.36) {
      phase[i] = Math.random() * Math.PI * 2;
      weight[i] = rand(1.55, 2.1) * fit;
      pivot[ix + 1] = rand(-0.06, 0.06);
      pivotKind[i] = 5;
      positions[ix] = Math.cos(phase[i]) * weight[i];
      positions[ix + 1] = 0.4;
      positions[ix + 2] = Math.sin(phase[i]) * weight[i];
      c = ringCols[i % ringCols.length];
    } else if (f < 0.56) {
      const edge = Math.random() < 0.75;
      const list = edge ? oneEdge : one.inside, j = list[(Math.random() * list.length) | 0];
      positions[ix] = ((j % W) - 256 + Math.random()) * s1;
      positions[ix + 1] = (256 - ((j / W) | 0) - Math.random()) * s1 + 0.6;
      positions[ix + 2] = -2.8 + rand(-0.05, 0.05);
      bright[i] = 4;
      c = edge ? oneRim : oneFill;
    } else if (f < 0.68) {
      const k = i % stars.length, [bx, sy, sz] = stars[k];
      const cx = bx * sx, size = sz * Math.max(0.75, fit);
      const arm = (i % 4) * (Math.PI / 2) + k * 0.4, t = Math.pow(Math.random(), 1.6);
      const w = (1 - t) * 0.16 * size * rand(-1, 1);
      positions[ix] = cx + Math.cos(arm) * t * size - Math.sin(arm) * w;
      positions[ix + 1] = sy + Math.sin(arm) * t * size + Math.cos(arm) * w;
      positions[ix + 2] = rand(-0.03, 0.03) - 0.6;
      pivot[ix] = cx; pivot[ix + 1] = sy; pivot[ix + 2] = -0.6;
      pivotKind[i] = 1;
      phase[i] = k * 0.9;
      c = starCols[k % starCols.length];
    } else if (f < 0.84) {
      // kilau naik, tersebar selebar layar (lebih rapat di samping supaya kiri-kanan tidak kosong)
      const side = Math.random() < 0.7 ? (Math.random() < 0.5 ? -1 : 1) * rand(0.35, 1) : rand(-0.35, 0.35);
      pivot[ix] = side * halfW; pivot[ix + 2] = rand(-3, 0.6);
      phase[i] = Math.random();
      weight[i] = rand(0.08, 0.18);
      pivotKind[i] = 6;
      positions[ix] = pivot[ix]; positions[ix + 1] = rand(-3, 3); positions[ix + 2] = pivot[ix + 2];
      c = riseCol;
    } else {
      // debu emas & bokeh berkelip di seluruh layar, berlapis kedalaman
      positions[ix] = rand(-halfW * 1.3, halfW * 1.3);
      positions[ix + 1] = rand(-2.6, 3.8);
      positions[ix + 2] = rand(-5, 0.8);
      phase[i] = Math.random();
      bright[i] = 1;
      c = dustCols[i % dustCols.length];
    }
    c.toArray(colors, ix);
  }
  return { positions, colors, phase, weight, pivot, pivotKind, bright };
}

// hati kaca neon (referensi hati.png): lobus montok, lekukan atas dalam, ujung bawah lancip.
// Daftar piksel dibagi: rim (pinggiran yang menyala) dan band (garis cahaya melengkung di dalam).
function heartSampler(width) {
  const W = 512;
  const m = puffMask(W, W, (g) => {
    g.beginPath();
    g.moveTo(256, 450);
    g.bezierCurveTo(150, 380, 40, 300, 42, 180);
    g.bezierCurveTo(44, 95, 110, 52, 175, 55);
    g.bezierCurveTo(222, 58, 248, 92, 256, 128);
    g.bezierCurveTo(264, 92, 290, 58, 337, 55);
    g.bezierCurveTo(402, 52, 468, 95, 470, 180);
    g.bezierCurveTo(472, 300, 362, 380, 256, 450);
    g.fill();
  });
  const s = width / 428, P = m.dmax * s * 0.5, CY = 252;
  const rim = [], band = [];
  for (const j of m.inside) {
    const dd = m.d[j], px = j % W, py = (j / W) | 0;
    if (dd < 3.5) rim.push(j);
    else if (dd > 26 && dd < 31 && ((px < 256 && py > 160 && py < 400) || (px > 256 && py > 110 && py < 300))) band.push(j);
  }
  const h = (j) => { const t = Math.min(1, m.d[j] / m.dmax); return P * Math.sqrt(1 - (1 - t) * (1 - t)); };
  const at = (j, side, out, n) => {
    const px = j % W, py = (j / W) | 0;
    const gx = (h(j + 1) - h(j - 1)) / (2 * s), gy = (h(j + W) - h(j - W)) / (2 * s);
    n.set(-gx, gy, side).normalize();
    out.set((px + Math.random() - 256) * s, (CY - py - Math.random()) * s, side * h(j));
    return j;
  };
  const pick = (list) => list[(Math.random() * list.length) | 0];
  const rs = () => (Math.random() < 0.5 ? 1 : -1);
  return {
    m, s, W, at,
    tipY: (CY - 450) * s,
    surface: (out, n) => at(pick(m.inside), rs(), out, n),
    rim: (out, n) => at(pick(rim), rs(), out, n),
    band: (out, n) => at(pick(band), 1, out, n),
    outline: (out) => { const j = pick(rim); out.set((j % W - 256) * s, (CY - ((j / W) | 0)) * s, 0); return j; },
  };
}

// garis EKG: dua kompleks detak (P-QRS-T) di kiri & kanan hati, seperti di gambar referensi
function ecgHeight(x, fit) {
  const g = (u, w) => Math.exp(-(u * u) / (2 * w * w));
  let y = 0;
  for (const c of [-2.3, 2.3]) {
    const u = x / fit - c;
    y += 1.1 * g(u, 0.05) - 0.45 * g(u - 0.13, 0.05) - 0.2 * g(u + 0.12, 0.04) + 0.22 * g(u - 0.5, 0.1) + 0.12 * g(u + 0.45, 0.09);
  }
  return y * 0.9 * fit;
}

// scene hati neon untuk `fan` dan `cry`. Posisi partikel hati, riak, EKG, dan bokeh diambil
// SEKALI lalu dipakai kedua mode, jadi pindah dari fan ke cry tidak perlu partikel berpindah:
// cukup warnanya yang bergeser (pink -> biru-ungu) dan hati kecil berubah jadi air mata.
// pivotKind: 7 hati kecil naik, 8 detak, 9 hati patah, 10 air mata, 12 riak, 13 EKG
// bright (kilau warna): 1 berkelip, 2 riak memudar, 3 sapuan cahaya EKG
function heartScenes(visW) {
  const fit = Math.min(1, visW / 4.2), cy = 0.8, ecgY = -1.25, halfW = visW / 2 + 0.5;
  const big = heartSampler(2.8 * fit), mini = heartSampler(0.34 * Math.max(0.8, fit));
  const C = (x) => new THREE.Color(x);
  const pals = {
    fan: { rim: C('#ffd6e6'), fill: C('#ff5c93').multiplyScalar(0.45), band: C('#ffc2dc'), ripple: C('#ff8fb8'), ecg: C('#ffb3cf'), bokeh: [C('#ff8fb8'), C('#b9a3ff'), C('#ffd6e6')] },
    cry: { rim: C('#e3ddff'), fill: C('#9a7fe0').multiplyScalar(0.4), band: C('#cfc6ff'), ripple: C('#a9b8ff'), ecg: C('#9fc0ff'), bokeh: [C('#8fa8ff'), C('#b9a3ff'), C('#5b6fd6')] },
  };
  const miniCols = [C('#ff6f9c'), C('#ffb3cf'), C('#b9a3ff'), C('#ff8fb8')];
  const tearCols = [C('#7fb0ff'), C('#a9c8ff')];
  const crackCol = C('#ffffff');
  const zig = (py) => 256 + 14 * (2 * Math.abs(((py / 50) % 1) * 2 - 1) - 1); // garis retak (piksel)
  const hash = (x) => { const v = Math.sin(x) * 43758.5453; return v - Math.floor(v); };
  // batas pembagian partikel (kumulatif), sama untuk kedua mode
  const T = { rim: 0.3, fill: 0.5, band: 0.56, crack: 0.6, ripple: 0.7, ecg: 0.8, bokeh: 0.88 };
  const extraStart = Math.floor(COUNT * T.bokeh);
  const make = () => ({
    positions: new Float32Array(COUNT * 3), colors: new Float32Array(COUNT * 3),
    phase: new Float32Array(COUNT), weight: new Float32Array(COUNT),
    pivot: new Float32Array(COUNT * 3), pivotKind: new Uint8Array(COUNT), bright: new Uint8Array(COUNT),
    side: new Int8Array(COUNT), part: new Uint8Array(COUNT).fill(2), // part: 0 hati, 1 retakan, 2 lainnya
    tipY: big.tipY + cy, halfW,
  });
  const out = { fan: make(), cry: make() };
  const both = (fn) => { fn(out.fan, 'fan'); fn(out.cry, 'cry'); };
  const p = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < COUNT; i++) {
    const ix = i * 3, f = i / COUNT;
    if (f < T.band) {
      // badan hati: pinggiran terang, isi redup seperti kaca, garis cahaya melengkung di dalam
      let j, key, br = 0;
      if (f < T.rim) { j = big.rim(p, n); key = 'rim'; }
      else if (f < T.fill) { j = big.surface(p, n); key = 'fill'; }
      else { j = big.band(p, n); p.z += 0.02; key = 'band'; br = 1; }
      p.y += cy;
      const sd = j % big.W < zig((j / big.W) | 0) ? -1 : 1, ph = Math.random();
      both((o, m) => {
        p.toArray(o.positions, ix);
        pals[m][key].toArray(o.colors, ix);
        o.bright[i] = br; o.phase[i] = ph; o.part[i] = 0; o.side[i] = sd;
        o.pivot[ix + 1] = cy;
        o.pivotKind[i] = m === 'cry' ? 9 : 8;
      });
    } else if (f < T.crack) {
      // retakan zig-zag; di fan selalu tersembunyi di dalam hati, di cry muncul saat waktunya retak
      let j;
      do {
        const py = 110 + ((Math.random() * 330) | 0);
        j = py * big.W + Math.round(zig(py) + rand(-2, 2));
      } while (!big.m.d[j]);
      big.at(j, Math.random() < 0.5 ? 1 : -1, p, n);
      p.z += Math.sign(p.z) * 0.02;
      p.y += cy;
      const sd = Math.random() < 0.5 ? -1 : 1;
      both((o, m) => {
        p.toArray(o.positions, ix);
        if (m === 'fan') o.positions[ix + 2] *= 0.05;
        crackCol.toArray(o.colors, ix);
        o.part[i] = 1; o.side[i] = sd;
        o.pivot[ix + 1] = cy;
        o.pivotKind[i] = m === 'cry' ? 9 : 8;
      });
    } else if (f < T.ripple) {
      // riak: garis luar hati yang terus menyebar keluar & memudar (3 gelombang)
      big.outline(p);
      p.y += cy;
      both((o, m) => {
        p.toArray(o.positions, ix);
        pals[m].ripple.toArray(o.colors, ix);
        o.pivot[ix + 1] = cy; o.phase[i] = (i % 3) / 3;
        o.pivotKind[i] = 12; o.bright[i] = 2;
      });
    } else if (f < T.ecg) {
      // garis EKG: 40% partikel dipadatkan di sekitar lonjakan supaya garisnya tetap tajam
      const x = Math.random() < 0.4 ? (Math.random() < 0.5 ? -2.3 : 2.3) * fit + rand(-0.7, 0.7) * fit : rand(-halfW, halfW);
      p.set(x, ecgY + rand(-0.008, 0.008), 0.3);
      const hgt = ecgHeight(x, fit);
      both((o, m) => {
        p.toArray(o.positions, ix);
        pals[m].ecg.toArray(o.colors, ix);
        o.weight[i] = hgt; o.pivot[ix + 1] = ecgY;
        o.pivotKind[i] = 13; o.bright[i] = 3;
      });
    } else if (i < extraStart) {
      // bokeh & debu berkilau di latar
      p.set(rand(-halfW, halfW), rand(-2.5, 3.8), rand(-4, -0.5));
      const ph = Math.random();
      both((o, m) => {
        p.toArray(o.positions, ix);
        const c = pals[m].bokeh[i % 3].clone().multiplyScalar(0.7);
        c.toArray(o.colors, ix);
        o.phase[i] = ph; o.bright[i] = 1;
      });
    } else {
      // fan: hati kecil neon (garis luar) naik seperti "like" di live stream
      const fo = out.fan, k = i % 30;
      mini.rim(p, n);
      p.toArray(fo.positions, ix);
      fo.pivot[ix] = (hash(k * 1.7) - 0.5) * 2 * (halfW - 0.6);
      fo.pivot[ix + 2] = -0.4 - hash(k * 2.9) * 1.6;
      fo.phase[i] = hash(k * 4.1);
      fo.weight[i] = 0.07 + hash(k * 5.3) * 0.07;
      fo.pivotKind[i] = 7;
      miniCols[k % miniCols.length].toArray(fo.colors, ix);
      // cry: tetes air mata, 6 partikel per tetes membentuk garis jatuh
      const co = out.cry, d = Math.floor((i - extraStart) / 6), seg = (i - extraStart) % 6;
      co.pivot[ix] = (hash(d * 1.3) - 0.5) * 2 * halfW;
      co.pivot[ix + 1] = seg * 0.04;
      co.pivot[ix + 2] = -3 + hash(d * 2.1) * 4;
      co.phase[i] = hash(d * 3.7);
      co.weight[i] = 0.18 + hash(d * 4.9) * 0.14;
      co.pivotKind[i] = 10;
      tearCols[d % 2].toArray(co.colors, ix);
      co.positions[ix] = co.pivot[ix]; co.positions[ix + 2] = co.pivot[ix + 2];
    }
  }
  return out;
}

// scene day (cahaya surgawi): 45% partikel = badanmu (indeks sama dengan bentuk model, jadi
// tidak perlu berpindah dari scene favorite), gumpalan awan di atas yang disinari dari belakang (19),
// kabut awan di bawah yang melayang (16), dan debu cahaya yang turun di dalam berkas sinar (18)
function dayShape(model, visW) {
  const positions = new Float32Array(COUNT * 3), colors = new Float32Array(COUNT * 3);
  const phase = new Float32Array(COUNT), weight = new Float32Array(COUNT);
  const pivot = new Float32Array(COUNT * 3), pivotKind = new Uint8Array(COUNT), bright = new Uint8Array(COUNT);
  const span = visW / 2 + 2;
  // warna diredam karena scene ini memakai cahaya aditif (partikel bertumpuk jadi terang)
  const goldA = new THREE.Color('#b86a10').multiplyScalar(0.55), goldB = new THREE.Color('#ffc46b').multiplyScalar(0.55);
  const cloudDim = new THREE.Color('#3a2414'), rimGold = new THREE.Color('#ffb54d'), rimHot = new THREE.Color('#fff0cf');
  const fogCol = new THREE.Color('#7a4f2c').multiplyScalar(0.45), dustCol = new THREE.Color('#ffd9a0').multiplyScalar(0.8);
  const mass = [[0, 0, 0.75], [-0.7, 0.15, 0.55], [0.7, 0.1, 0.6], [-0.35, 0.45, 0.5], [0.4, 0.5, 0.45],
    [-1.15, -0.1, 0.4], [1.1, -0.05, 0.42], [0, -0.3, 0.5], [0.05, 0.7, 0.35]];
  const MC = [0, 3.0, -1.4], ms = Math.min(1, visW / 4.2);
  const fogPuffs = [[-0.5, 0, 0.5], [0, 0.12, 0.6], [0.5, 0, 0.5]];
  const n = new THREE.Vector3(), c = new THREE.Color();
  for (let i = 0; i < COUNT; i++) {
    const f = i / COUNT, ix = i * 3;
    if (f < 0.45) {
      positions.set(model.subarray(ix, ix + 3), ix);
      c.copy(goldA).lerp(goldB, Math.random());
      if (f < 0.36) bright[i] = 4; // badan: disapu gelombang cahaya dari kaki ke kepala
      else {
        // debu emas: lepas dari permukaan badan, melayang naik sambil memudar, lalu kembali
        pivotKind[i] = 17; bright[i] = 5;
        phase[i] = Math.random(); weight[i] = rand(0.18, 0.35);
        c.lerp(WHITE, 0.25);
      }
    } else if (f < 0.72) {
      // awan atas: tepi yang menghadap ke bawah/samping & bagian tengah paling menyala (disinari dari belakang)
      const [px, py, pr] = mass[i % mass.length];
      n.randomDirection();
      const lx = px + n.x * pr, ly = py + n.y * pr * 0.8, lz = n.z * pr * 0.8;
      const down = Math.max(0, -n.y), side = Math.abs(n.x), center = Math.exp(-(lx * lx) / 0.9);
      const b = Math.min(1, 0.12 + 0.6 * Math.pow(down, 1.5) * center + 0.45 * Math.pow(side, 3) + 0.3 * center * (1 - (ly + 0.5) / 1.5));
      c.copy(cloudDim).lerp(rimGold, b);
      if (b > 0.7) c.lerp(rimHot, (b - 0.7) / 0.3);
      positions[ix] = MC[0] + lx * 1.4 * ms;
      positions[ix + 1] = MC[1] + ly * 0.9;
      positions[ix + 2] = MC[2] + lz;
      phase[i] = Math.random();
      pivotKind[i] = 19;
    } else if (f < 0.9) {
      // kabut awan bawah: melayang pelan ke kanan
      const k = i % 7, [px, py, pr] = fogPuffs[i % fogPuffs.length];
      n.randomDirection();
      positions[ix] = (px + n.x * pr) * 1.6;
      positions[ix + 1] = (py + n.y * pr * 0.5) * 1.2;
      positions[ix + 2] = n.z * pr;
      pivot[ix] = (k / 7) * 2 * span - span; pivot[ix + 1] = -2.2 + (k % 3) * 0.15; pivot[ix + 2] = -0.8 - (k % 4) * 0.6;
      weight[i] = 0.05 + (k % 3) * 0.02;
      pivotKind[i] = 16;
      c.copy(fogCol).multiplyScalar(0.6 + 0.4 * Math.random());
    } else {
      // debu cahaya yang turun pelan di dalam berkas sinar
      pivot[ix] = rand(-1, 1); pivot[ix + 2] = rand(-1.2, 0.4);
      phase[i] = Math.random();
      weight[i] = rand(0.08, 0.16);
      pivotKind[i] = 18; bright[i] = 1;
      positions[ix] = pivot[ix]; positions[ix + 1] = rand(-2.5, 2.6); positions[ix + 2] = pivot[ix + 2];
      c.copy(dustCol);
    }
    c.toArray(colors, ix);
  }
  return { positions, colors, phase, weight, pivot, pivotKind, bright, span };
}

// judul pembuka "Best Friend" dari partikel bercahaya + debu berkelip di sekitarnya
function titleShape(visW) {
  const positions = new Float32Array(COUNT * 3), colors = new Float32Array(COUNT * 3);
  const phase = new Float32Array(COUNT), weight = new Float32Array(COUNT), bright = new Uint8Array(COUNT);
  const W = 1024, H = 320, text = 'Best Friend';
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.font = 'italic 300 150px Fraunces, Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#fff';
  g.fillText(text, W / 2, H / 2);
  const a = g.getImageData(0, 0, W, H).data, px = [];
  for (let i = 0; i < W * H; i++) if (a[i * 4 + 3] > 128) px.push(i);
  const s = Math.min(7.2, visW * 0.88) / g.measureText(text).width;
  const ink = [new THREE.Color('#cfe0ff').multiplyScalar(0.6), new THREE.Color('#ffffff').multiplyScalar(0.55), new THREE.Color('#ffd9a0').multiplyScalar(0.6)];
  const dust = new THREE.Color('#8fa8ff').multiplyScalar(0.6);
  for (let i = 0; i < COUNT; i++) {
    const ix = i * 3;
    phase[i] = Math.random();
    if (i / COUNT < 0.85) {
      const j = px[(Math.random() * px.length) | 0];
      positions[ix] = ((j % W) - W / 2 + Math.random()) * s;
      positions[ix + 1] = (H / 2 - ((j / W) | 0) - Math.random()) * s + 0.7;
      positions[ix + 2] = rand(-0.06, 0.06);
      ink[i % 7 === 0 ? 2 : i % 2].toArray(colors, ix);
      if (i % 3 === 0) bright[i] = 1;
    } else {
      positions[ix] = rand(-visW / 2, visW / 2); positions[ix + 1] = rand(-2, 3.5); positions[ix + 2] = rand(-3, 0.5);
      dust.toArray(colors, ix);
      bright[i] = 1;
    }
  }
  return { positions, colors, phase, weight, bright };
}

// langit malam sinematik (scene awake): bulan sabit besar bertekstur kawah, bintang berlapis
// kedalaman, rasi bintang berbentuk hati yang digambar garis demi garis, bintang jatuh, dan kabut.
// bright: 1 berkelip, 6 garis rasi (muncul sesuai urutan), 7 bintang jatuh, 8 titik sudut rasi
// pivotKind: 16 kabut melayang, 20 bintang jatuh
const MOON_POS = [Math.min(1.7, visibleWidth() * 0.26), 2.1, -2.2];
const SHOOT_DIR = [-0.91, -0.41, 0];
function nightShape(visW) {
  const positions = new Float32Array(COUNT * 3), colors = new Float32Array(COUNT * 3);
  const phase = new Float32Array(COUNT), weight = new Float32Array(COUNT);
  const pivot = new Float32Array(COUNT * 3), pivotKind = new Uint8Array(COUNT), bright = new Uint8Array(COUNT);
  const fit = Math.min(1, visW / 4.2), span = visW / 2 + 2;
  const hash = (x) => { const v = Math.sin(x) * 43758.5453; return v - Math.floor(v); };
  const C = (x, k = 1) => new THREE.Color(x).multiplyScalar(k);
  // warna diredam: scene ini memakai cahaya aditif (bertumpuk = makin terang)
  const moonLit = C('#fff1d0', 0.5), moonCrater = C('#b9a383', 0.32), moonEdge = C('#ffe2a8', 0.28);
  const starCols = [C('#ffffff', 0.55), C('#bcd0ff', 0.55), C('#ffe9c4', 0.5), C('#9fb7ff', 0.45)];
  const lineCol = C('#bcd0ff', 0.45), vertexCol = C('#ffffff', 0.7), shootCol = C('#e6eeff', 0.8), mistCol = C('#6f86c9', 0.22);

  // rasi bintang hati: 14 titik sudut di garis luar hati, garis menyambung berurutan (tertutup)
  const NV = 14, heartC = [-1.25 * fit, 0.95, -1.2], hs = 0.055 * fit;
  const verts = [];
  for (let k = 0; k < NV; k++) {
    const t = (k / NV) * Math.PI * 2 + (hash(k * 3.1) - 0.5) * 0.12;
    verts.push([
      heartC[0] + 16 * Math.sin(t) ** 3 * hs,
      heartC[1] + (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * hs,
      heartC[2] + (hash(k * 7.7) - 0.5) * 0.3,
    ]);
  }
  const R = 1.25 * fit, cutX = 0.42 * R, cutY = 0.12 * R, cutR = 0.86 * R; // lingkaran pemotong -> sabit
  const n = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
  const shootStart = Math.floor(COUNT * 0.8), shootN = Math.floor(COUNT * 0.05);
  for (let i = 0; i < COUNT; i++) {
    const f = i / COUNT, ix = i * 3;
    if (f < 0.25) {
      // bulan sabit: titik di belahan bola yang menghadap kamera, di luar lingkaran pemotong.
      // (kalau sisi belakang/cekung ikut digambar, cahaya aditif membuatnya jadi bulatan kabur)
      let d;
      for (;;) {
        n.randomDirection();
        n.z = Math.abs(n.z);
        d = Math.hypot(n.x * R - cutX, n.y * R - cutY) - cutR;
        if (d > 0) break;
      }
      p.copy(n).multiplyScalar(R);
      // makin redup ke arah garis gelap (terminator), makin terang di tepi luar yang tersinari
      const lit = THREE.MathUtils.smoothstep(d, 0, 0.3 * R);
      const crater = Math.max(0, Math.sin(n.x * 9.1 + n.y * 3.7) * Math.sin(n.y * 7.3 - n.z * 5.9) * Math.sin(n.z * 6.1 + n.x * 4.3));
      c.copy(moonEdge).lerp(moonLit, lit).lerp(moonCrater, Math.min(1, crater * 4) * 0.55);
      positions[ix] = MOON_POS[0] + p.x; positions[ix + 1] = MOON_POS[1] + p.y; positions[ix + 2] = MOON_POS[2] + p.z;
    } else if (f < 0.63) {
      // bintang berlapis: sebagian kecil terang & besar, sisanya debu bintang jauh
      positions[ix] = rand(-span * 2.2, span * 2.2);
      positions[ix + 1] = rand(-3, 7);
      positions[ix + 2] = -3 - Math.pow(Math.random(), 0.8) * 10;
      c.copy(starCols[i % starCols.length]).multiplyScalar(i % 9 === 0 ? 2.4 : 1.4);
      phase[i] = Math.random();
      bright[i] = 1;
    } else if (f < 0.77) {
      // garis rasi: posisi di sepanjang jalur hati (weight = urutan 0..1 untuk animasi menggambar)
      const pathPos = Math.random(), seg = Math.floor(pathPos * NV), u = pathPos * NV - seg;
      const v0 = verts[seg], v1 = verts[(seg + 1) % NV];
      positions[ix] = v0[0] + (v1[0] - v0[0]) * u + rand(-0.006, 0.006);
      positions[ix + 1] = v0[1] + (v1[1] - v0[1]) * u + rand(-0.006, 0.006);
      positions[ix + 2] = v0[2] + (v1[2] - v0[2]) * u;
      weight[i] = pathPos;
      bright[i] = 6;
      c.copy(lineCol);
    } else if (f < 0.8) {
      // titik sudut rasi: gugus kecil yang menyala saat garisnya sampai
      const k = i % NV, v = verts[k], a2 = Math.random() * Math.PI * 2, r2 = Math.pow(Math.random(), 2) * 0.045;
      positions[ix] = v[0] + Math.cos(a2) * r2; positions[ix + 1] = v[1] + Math.sin(a2) * r2; positions[ix + 2] = v[2];
      weight[i] = k / NV;
      phase[i] = hash(k);
      bright[i] = 8;
      c.copy(vertexCol);
    } else if (i < shootStart + shootN) {
      // bintang jatuh: 3 bintang, tiap partikel = satu titik di ekornya (weight 0 = kepala .. 1 = ujung ekor)
      const j = i - shootStart, k = j % 3;
      pivot[ix] = (0.4 + k * 0.9) * span * 0.6; pivot[ix + 1] = 3.2 + k * 0.6; pivot[ix + 2] = -3 - k;
      weight[i] = Math.pow(Math.random(), 1.4);
      phase[i] = k * 0.37;
      pivotKind[i] = 20;
      bright[i] = 7;
      c.copy(shootCol);
    } else {
      // kabut tipis di bawah, disinari bulan, melayang pelan
      const k = i % 10, g = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5; // sebaran ~gaussian
      positions[ix] = g() * (1.6 + (k % 3) * 0.6); positions[ix + 1] = g() * 0.35; positions[ix + 2] = g() * 0.9;
      pivot[ix] = (k / 10) * 2 * span - span; pivot[ix + 1] = -2.2 + (k % 3) * 0.2; pivot[ix + 2] = -1 - (k % 4) * 0.8;
      weight[i] = 0.04 + (k % 3) * 0.015;
      pivotKind[i] = 16;
      // makin jauh dari pusat gumpalan makin redup -> tepi kabut lembut
      const fall = Math.exp(-(positions[ix] ** 2) / 4 - (positions[ix + 1] ** 2) / 0.2);
      c.copy(mistCol).multiplyScalar((0.4 + 0.6 * Math.random()) * fall);
    }
    c.toArray(colors, ix);
  }
  return { positions, colors, phase, weight, pivot, pivotKind, bright, span };
}

// sekumpulan balon 3D mengilap dengan tali yang menyatu di bawah
function balloonsShape(s) {
  const positions = new Float32Array(COUNT * 3), colors = new Float32Array(COUNT * 3);
  const phase = new Float32Array(COUNT), weight = new Float32Array(COUNT);
  const group = new Int8Array(COUNT), kind = new Uint8Array(COUNT); // kind: 0 balon, 1 simpul, 2 tali
  const B = [
    { c: '#7fa6ff', x: -1.6, y: 1.35, z: 0.1, r: 0.7 },
    { c: '#ff9cc2', x: -0.5, y: 2.0, z: -0.4, r: 0.78 },
    { c: '#ffd36e', x: 0.6, y: 1.5, z: 0.5, r: 0.7 },
    { c: '#b9a3ff', x: 1.65, y: 1.2, z: -0.1, r: 0.66 },
  ].map((b) => ({ ...b, color: new THREE.Color(b.c), x: b.x * s, r: b.r * Math.max(0.8, s) }));
  const total = B.reduce((a, b) => a + b.r * b.r, 0);
  const gather = new THREE.Vector3(0, -1.5, 0.4);
  const stringCol = new THREE.Color('#9aa8c7');
  const n = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
  for (let i = 0; i < COUNT; i++) {
    let pick = Math.random() * total, k = 0;
    while (k < B.length - 1 && pick > B[k].r * B[k].r) { pick -= B[k].r * B[k].r; k++; }
    const b = B[k], knotY = b.y - b.r * 1.15;
    const f = Math.random();
    if (f < 0.84) {
      n.randomDirection();
      const taper = n.y < 0 ? 1 + n.y * 0.18 : 1;
      p.set(b.x + n.x * b.r * taper, b.y + n.y * b.r * 1.15, b.z + n.z * b.r * taper);
      shade(c.copy(b.color), n, 0.9);
      weight[i] = 1;
    } else if (f < 0.86) {
      const t = Math.random(), a = Math.random() * Math.PI * 2, r = 0.02 + t * 0.06;
      p.set(b.x + Math.cos(a) * r, knotY - t * 0.12, b.z + Math.sin(a) * r);
      c.copy(b.color).multiplyScalar(0.8);
      weight[i] = 1;
      kind[i] = 1;
    } else {
      kind[i] = 2;
      const t = Math.random();
      p.set(b.x, knotY - 0.12, b.z).lerp(gather, t);
      p.x += Math.sin(t * Math.PI * 3 + k) * 0.08 * (1 - t);
      c.copy(stringCol);
      weight[i] = 1 - t; // ujung atas ikut balon, ujung bawah diam
    }
    phase[i] = k * 1.3;
    group[i] = k;
    p.toArray(positions, i * 3);
    c.toArray(colors, i * 3);
  }
  const centers = B.map((b) => new THREE.Vector3(b.x, b.y, b.z));
  const labelColors = B.map((b) => b.color.clone().offsetHSL(0, 0.15, -0.2).getStyle());
  return { positions, colors, phase, weight, group, kind, centers, labelColors };
}

// spiral partikel yang mengelilingi badan
function ringShape(radius, bottom, top) {
  const out = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT; i++) {
    const t = Math.random();
    const a = t * Math.PI * 6 + rand(-0.2, 0.2);
    const r = radius + rand(-0.12, 0.12);
    out[i * 3] = Math.cos(a) * r;
    out[i * 3 + 1] = bottom + t * (top - bottom) + rand(-0.05, 0.05);
    out[i * 3 + 2] = Math.sin(a) * r;
  }
  return out;
}

// loader bersama; MeshoptDecoder diperlukan untuk model yang sudah dikompres (folder models/)
const gltfLoader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

async function modelShape(url, height, onProgress) {
  const gltf = await gltfLoader.loadAsync(url, (e) => e.total && onProgress(e.loaded / e.total));
  gltf.scene.updateMatrixWorld(true);
  let src;
  gltf.scene.traverse((o) => { if (o.isMesh && !src) src = o; });

  // model terkompres menyimpan posisi/UV sebagai angka bulat ternormalisasi (-1..1); ubah dulu ke
  // Float32 supaya koordinat dunia (bisa > 1) tidak terpotong saat matriks diterapkan
  const g = src.geometry.clone();
  for (const [name, attr] of Object.entries(g.attributes)) {
    if (attr.array instanceof Float32Array && !attr.normalized) continue;
    const size = attr.itemSize, out = new Float32Array(attr.count * size);
    const get = [attr.getX, attr.getY, attr.getZ, attr.getW];
    for (let i = 0; i < attr.count; i++) for (let k = 0; k < size; k++) out[i * size + k] = get[k].call(attr, i);
    g.setAttribute(name, new THREE.BufferAttribute(out, size));
  }
  g.applyMatrix4(src.matrixWorld);
  g.computeBoundingBox();
  const box = g.boundingBox;
  const center = box.getCenter(new THREE.Vector3());
  const s = height / (box.max.y - box.min.y);
  if (!g.attributes.normal) g.computeVertexNormals();
  const sampler = new MeshSurfaceSampler(new THREE.Mesh(g)).build();
  const mesh = new THREE.Mesh(g, src.material);
  mesh.scale.setScalar(s);
  mesh.position.set(-center.x * s, -center.y * s + 0.4, -center.z * s);

  // ambil warna dari texture model lewat UV
  const material = Array.isArray(src.material) ? src.material[0] : src.material;
  let pixels = null, tw = 0, th = 0;
  if (material.map?.image && g.attributes.uv) {
    const img = material.map.image;
    tw = Math.min(1024, img.width); th = Math.round(img.height * tw / img.width);
    const c = document.createElement('canvas');
    c.width = tw; c.height = th;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, tw, th);
    pixels = ctx.getImageData(0, 0, tw, th).data;
  }
  const base = material.color ?? new THREE.Color(1, 1, 1);

  const positions = new Float32Array(COUNT * 3);
  const colors = new Float32Array(COUNT * 3);
  const p = new THREE.Vector3(), n = new THREE.Vector3(), uv = new THREE.Vector2(), c = new THREE.Color();
  for (let i = 0; i < COUNT; i++) {
    sampler.sample(p, n, undefined, uv);
    positions[i * 3] = (p.x - center.x) * s;
    positions[i * 3 + 1] = (p.y - center.y) * s + 0.4;
    positions[i * 3 + 2] = (p.z - center.z) * s;
    if (pixels) {
      const x = Math.min(tw - 1, ((uv.x % 1 + 1) % 1) * tw | 0);
      const y = Math.min(th - 1, ((uv.y % 1 + 1) % 1) * th | 0); // glTF: flipY = false
      const k = (y * tw + x) * 4;
      c.setRGB(pixels[k] / 255, pixels[k + 1] / 255, pixels[k + 2] / 255, THREE.SRGBColorSpace);
    } else c.copy(base);
    c.toArray(colors, i * 3);
  }
  return { positions, colors, mesh };
}

function paletteColors(palette) {
  const out = new Float32Array(COUNT * 3);
  const cs = palette.map((h) => new THREE.Color(h));
  const c = new THREE.Color();
  for (let i = 0; i < COUNT; i++) {
    c.copy(cs[i % cs.length]).lerp(cs[(i + 1) % cs.length], Math.random() * 0.5);
    c.toArray(out, i * 3);
  }
  return out;
}

const shapes = {};
shapes.scatter = scatterShape(3, 10);
shapes.stars = scatterShape(9, 25);
shapes.heart = heartShape(Math.min(0.17, visibleWidth() / 40));
shapes.ring = ringShape(1.7, -1.7, 2.5);
// bentuk yang membawa warna & gerakan sendiri
const shapeColors = {}, shapeMotion = {};
function addShape(key, s) {
  shapes[key] = s.positions;
  shapeColors[key] = s.colors;
  shapeMotion[key] = s;
}
// Bentuk-bentuk berat dihitung SATU PER SATU setelah halaman tampil, dengan jeda di antaranya,
// supaya kartu pembuka langsung muncul dan tidak membeku beberapa detik saat dibuka.
const SHAPE_BUILDERS = [
  ['happy', () => happyShape(Math.min(1.45, visibleWidth() * 0.2))],
  ['balloons', () => balloonsShape(Math.min(1, visibleWidth() / 7))],
  ['moon', () => nightShape(visibleWidth())],
  ['chat', () => chatShape(visibleWidth())],
  // medali buatan hanya cadangan: jangan menimpa medali GLB kalau sudah lebih dulu dimuat
  ['medal', () => (medalMats ? null : medalShape(visibleWidth()))],
  ['medalAura', () => medalAuraShape(visibleWidth())],
  ['neonHearts', () => {
    const h = heartScenes(visibleWidth());
    addShape('fanHeart', h.fan);
    addShape('cryHeart', h.cry);
  }],
];
async function buildShapes(onStep) {
  for (let k = 0; k < SHAPE_BUILDERS.length; k++) {
    await new Promise((r) => setTimeout(r, 0)); // beri kesempatan browser menggambar frame
    const [key, build] = SHAPE_BUILDERS[k];
    const out = build();
    if (out) addShape(key, out);
    onStep((k + 1) / SHAPE_BUILDERS.length);
  }
}
shapes.scatter.forEach((v, i) => (pos[i] = v));

const colorCache = new Map();
function colorsFor(sc) {
  if (sc.color === 'texture') return modelColors;
  if (shapeColors[sc.shape]) return shapeColors[sc.shape];
  const key = sc.palette.join();
  if (!colorCache.has(key)) colorCache.set(key, paletteColors(sc.palette));
  return colorCache.get(key);
}
let modelColors = null;
// `dim` di scene: warna partikel diredam (untuk mode cahaya aditif supaya tidak terlalu silau)
const dimCache = new WeakMap();
function dimmed(colors, k) {
  if (!colors || !k || k === 1) return colors;
  let byK = dimCache.get(colors);
  if (!byK) dimCache.set(colors, (byK = new Map()));
  if (!byK.has(k)) byK.set(k, colors.map((v) => v * k));
  return byK.get(k);
}

/* ---------- state ---------- */
let active = IDLE;
let targetPos = shapes.scatter;
let targetCol = colorsFor(IDLE);
let mode = 'morph'; // 'morph' | 'fall' | 'rain'
let shakeUntil = 0;
let sceneTimer = 0;
let revealAt = Infinity;
let time = 0;
col.set(targetCol);

/* ---------- transisi ----------
   Tiap partikel terbang lewat kurva Bezier: dari posisi lama, melambung ke titik
   kontrol yang mengikuti "aliran" mirip noise (jadi partikel terbang berombongan),
   lalu mendarat di bentuk baru. Selama terbang partikel berpusar di sumbu Y dan
   berpendar. Partikel bawah berangkat duluan, jadi bentuk tersusun dari bawah ke atas. */
const DUR = 1.5;
const startPos = new Float32Array(COUNT * 3);
const startCol = new Float32Array(COUNT * 3);
const ctrl = new Float32Array(COUNT * 3);
const delay = new Float32Array(COUNT);
const twist = new Float32Array(COUNT);
const flightCol = new THREE.Color();
let flightGlow = 0.45; // seberapa kuat partikel berpendar warna `flight` saat terbang
let transStart = -10;
let motion = null;

/* ---------- balon meletus ----------
   free[i] = 1: serpihan balon yang terlempar, 2: tali yang melayang jatuh */
const free = new Uint8Array(COUNT);
let releaseFree = false; // true setelah transisi dimulai: serpihan boleh terbang ke bentuk baru
let popQueue = [];
function popBalloon(k) {
  const m = shapeMotion.balloons, center = m.centers[k];
  for (let i = 0; i < COUNT; i++) {
    if (m.group[i] !== k) continue;
    const ix = i * 3;
    if (m.kind[i] === 2) {
      free[i] = 2;
      vel[ix] = rand(-0.3, 0.3); vel[ix + 1] = rand(0, 0.6); vel[ix + 2] = 0;
      continue;
    }
    free[i] = 1;
    const dx = pos[ix] - center.x, dy = pos[ix + 1] - center.y, dz = pos[ix + 2] - center.z;
    const f = rand(2.5, 6) / (Math.hypot(dx, dy, dz) || 1);
    vel[ix] = dx * f; vel[ix + 1] = dy * f + 1.5; vel[ix + 2] = dz * f;
  }
  shakeUntil = time + 0.25;
  kick(0.35);
  popLabel(center, m.labelColors[k]);
}

// tulisan "no!" muncul di posisi balon yang pecah (posisi 3D diproyeksikan ke layar)
const labelsEl = document.getElementById('labels');
function popLabel(local, color) {
  const v = local.clone().applyMatrix4(points.matrixWorld).project(camera);
  const el = document.createElement('div');
  el.className = 'pop-label';
  el.textContent = 'no!';
  el.style.left = `${(v.x * 0.5 + 0.5) * innerWidth}px`;
  el.style.top = `${(-v.y * 0.5 + 0.5) * innerHeight}px`;
  el.style.setProperty('--c', color);
  el.style.setProperty('--r', `${rand(-14, 14)}deg`);
  labelsEl.appendChild(el);
  setTimeout(() => el.remove(), 1400);
}

// pantulan kenyal huruf: tiap ketukan memberi dorongan pegas yang meredam
let hitTimes = [];
let hitsSeen = 0;
function hitSquash() {
  let s = 0;
  for (const h of hitTimes) {
    const t = time - h;
    if (t > 0) s += Math.exp(-t * 5) * Math.sin(t * 16) * 0.18;
  }
  return s;
}

function beginTransition(sc, beats) {
  releaseFree = true;
  startPos.set(pos);
  startCol.set(col);
  transStart = time;
  flightCol.set(sc.flight ?? '#5b86ff');
  flightGlow = sc.flightGlow ?? 0.45;
  let minY = Infinity, maxY = -Infinity;
  for (let i = 1; i < targetPos.length; i += 3) {
    if (targetPos[i] < minY) minY = targetPos[i];
    if (targetPos[i] > maxY) maxY = targetPos[i];
  }
  const spanY = maxY - minY || 1;
  const burst = sc.burst ?? 1.8, build = sc.build ?? 0.3, jitter = 0.15 * (sc.dur ?? DUR) / DUR;
  for (let i = 0; i < COUNT; i++) {
    const ix = i * 3;
    const sx = pos[ix], sy = pos[ix + 1], sz = pos[ix + 2];
    const tx = targetPos[ix], ty = targetPos[ix + 1], tz = targetPos[ix + 2];
    const nx = Math.sin(sy * 1.7 + tz * 0.8), ny = Math.sin(sz * 1.3 + tx * 0.9) + 0.6, nz = Math.sin(sx * 1.5 + ty * 0.7);
    const b = (burst * rand(0.6, 1.4)) / (Math.hypot(nx, ny, nz) || 1);
    ctrl[ix] = (sx + tx) / 2 + nx * b;
    ctrl[ix + 1] = (sy + ty) / 2 + ny * b;
    ctrl[ix + 2] = (sz + tz) / 2 + nz * b;
    delay[i] = ((ty - minY) / spanY) * build + Math.random() * jitter;
    // gelembung chat: partikel tiap gelembung baru berangkat menjelang ketukannya
    if (sc.bubbles && motion?.group && beats) delay[i] = Math.max(0, beats[motion.group[i]] - 0.3) + Math.random() * 0.05;
    twist[i] = rand(0.5, 1.2) * Math.PI * (sc.twist ?? 1);
  }
}

const bgLayers = document.querySelectorAll('.bg-layer');
let bgIdx = 0;
function setBg([a, b]) {
  bgIdx ^= 1;
  bgLayers[bgIdx].style.background = `radial-gradient(ellipse at 50% 35%, ${a}, ${b} 75%)`;
  bgLayers[bgIdx].classList.add('on');
  bgLayers[bgIdx ^ 1].classList.remove('on');
}

function applyScene(sc, beats) {
  clearTimeout(sceneTimer);
  active = sc;
  const same = targetPos === shapes[sc.shape];
  // serpihan yang masih jatuh tetap jatuh sampai giliran terbangnya tiba (lihat releaseFree)
  const hadFree = free.some((v) => v);
  releaseFree = false;
  popQueue = (sc.pops ?? []).map((k, j) => ({ k, at: time + (beats?.[j] ?? 0.8 * (j + 1)) }));
  hitTimes = sc.hits || sc.bubbles ? (beats ?? []).map((b) => time + b) : [];
  hitsSeen = 0;
  targetPos = shapes[sc.shape] ?? shapes.scatter;
  targetCol = dimmed(colorsFor(sc) ?? colorsFor(IDLE), sc.dim);
  mat.size = sc.size ?? 0.04;
  // cahaya aditif untuk scene gelap: partikel yang bertumpuk makin terang, seperti neon
  const additive = !!sc.additive;
  if (!!mat.userData.additive !== additive) {
    for (const m of [mat, auraMat]) {
      if (additive) Object.assign(m, GLOW_BLEND);
      else m.blending = THREE.NormalBlending;
      m.userData.additive = additive;
      m.needsUpdate = true;
    }
    mat.depthWrite = !additive;
  }
  fogColor.set(sc.fogColor ?? '#eef3ff');
  haloColor.set(sc.haloColor ?? '#ffffff');
  // urutan sampel partikel acak, jadi menggambar sebagian pertama tetap tersebar merata
  geo.setDrawRange(0, Math.floor(COUNT * (sc.density ?? 1)));
  // tunggu partikel selesai membentuk badan, lalu tampilkan model asli
  revealAt = sc.reveal ? time + (meshOpacity > 0.5 ? 0 : 3) : Infinity;
  // medali logam muncul setelah partikel hampir selesai tersusun
  medalAt = sc.medal ? time + 2.4 : Infinity;
  auraSwitched = false;
  const ct = sc.cry ? beats ?? [1.4, 2.6, 3.8] : null;
  cryCrack = ct ? time + ct[0] : Infinity;
  crySplit = ct ? time + ct[1] : Infinity;
  cryCrumble = ct ? time + ct[2] : Infinity;
  crackDone = splitDone = crumbled = false;
  setBg(sc.bg);
  letterboxEl.classList.toggle('on', !!sc.letterbox);
  clearTimeout(bgTimer);
  if (sc.bg2) bgTimer = setTimeout(() => active === sc && setBg(sc.bg2), 1400);
  sceneStart = time;
  crownLanded = false;
  mode = sc.physics === 'fall' ? 'fall' : 'morph';
  motion = shapeMotion[sc.shape] ?? null;
  // bentuk sama (balon -> balon meletus) tidak perlu terbang ulang
  if (mode === 'morph' && (!same || hadFree || sc.remorph)) beginTransition(sc, beats);
  if (mode === 'fall') for (let i = 0; i < COUNT; i++) vel.set([rand(-0.3, 0.3), rand(0, 1.5), 0], i * 3);
  if (sc.shake) shakeUntil = time + 0.7;
  if (sc.shatterAfter) sceneTimer = setTimeout(shatter, sc.shatterAfter * 1000);
}

// hati pecah: partikel meledak keluar lalu jatuh jadi hujan
function shatter() {
  mode = 'rain';
  for (let i = 0; i < COUNT; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1] - 0.8;
    const d = Math.hypot(x, y) || 1;
    const f = rand(1, 5);
    vel.set([(x / d) * f, (y / d) * f + 2, rand(-2, 2)], i * 3);
  }
  shakeUntil = time + 0.4;
}

/* ---------- lirik ---------- */
const lyricEl = document.getElementById('lyric');
const dotsEl = document.getElementById('dots');
LYRICS.forEach(() => dotsEl.appendChild(document.createElement('span')));
let current = -1;

function showLine(text, fx, beats, words) {
  lyricEl.querySelectorAll('.line:not(.out)').forEach((el) => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 600);
  });
  const el = document.createElement('div');
  el.className = `line fx-${fx}`;
  karaoke = null;
  const tokens = text.split(/(\s+)/).filter(Boolean);
  const sungSpans = [];
  if (words) el.classList.add('karaoke');
  // kalau ada beats, kata-kata terakhir muncul tepat di tiap ketukan (mis. tiap balon pecah)
  const wordCount = tokens.filter((t) => t.trim()).length;
  const offset = beats ? wordCount - beats.length : 0;
  let w = 0;
  tokens.forEach((t, i) => {
    const span = document.createElement('span');
    span.className = 'w';
    span.style.setProperty('--i', i);
    if (words && t.trim()) {
      // karaoke: teks di dalam .k supaya redup/menyala tidak bentrok dengan animasi efek di .w
      const k = document.createElement('span');
      k.className = 'k';
      k.textContent = t;
      span.appendChild(k);
      sungSpans.push(span);
    } else span.textContent = t;
    if (beats && !words && t.trim()) {
      span.style.animationDelay = `${w < offset ? w * 0.12 : beats[w - offset]}s`;
      w++;
    }
    el.appendChild(span);
  });
  lyricEl.appendChild(el);
  if (words) karaoke = { spans: sungSpans, times: words, start: time, next: 0 };
}

function goTo(i) {
  i = Math.max(0, Math.min(LYRICS.length - 1, i));
  if (i === current) return;
  current = i;
  const line = LYRICS[i];
  const sc = SCENES[line.scene] ?? SCENES.favorite;
  const beats = line.beats ?? sc.beats ?? null;
  applyScene(sc, beats);
  showLine(line.text, sc.text, beats, line.words);
  [...dotsEl.children].forEach((d, k) => d.classList.toggle('on', k === i));
}

/* ---------- loop ---------- */
const clock = new THREE.Clock();
// batas langkah waktu per frame. Saat diuji otomatis (?probe), frame sangat lambat (render CPU),
// jadi batasnya dilonggarkan supaya waktu animasi tetap sama dengan waktu nyata.
const MAX_DT = new URLSearchParams(location.search).has('probe') ? 0.5 : 0.05;
function tick() {
  const dt = Math.min(clock.getDelta(), MAX_DT);
  time += dt;
  readAudio(dt);
  updateKaraoke();

  while (popQueue.length && time >= popQueue[0].at) popBalloon(popQueue.shift().k);

  // hati patah: kamera tersentak saat retak & terbelah, lalu kepingan hati berjatuhan
  if (active.cry && motion?.part) {
    if (!crackDone && time >= cryCrack) { crackDone = true; shakeUntil = time + 0.2; kick(0.3); }
    if (!splitDone && time >= crySplit) { splitDone = true; shakeUntil = time + 0.25; kick(0.4); }
    if (!crumbled && time >= cryCrumble) {
      crumbled = true;
      releaseFree = false; // kepingan terus jatuh, tidak kembali ke bentuk hati
      for (let i = 0; i < COUNT; i++) {
        if (motion.part[i] === 2) continue;
        const ix = i * 3;
        free[i] = 1;
        vel[ix] = motion.side[i] * rand(0.5, 2.2); vel[ix + 1] = rand(-0.3, 1.2); vel[ix + 2] = rand(-1, 1);
      }
      shakeUntil = time + 0.3;
    }
  }

  // medali asli muncul -> partikel penyusunnya meledak keluar jadi aura glitter
  if (active.medal && medalMats && !auraSwitched && time >= medalAt) {
    // ledakan dari medali + dua meriam di kiri & kanan bawah yang menembak ke arah tengah
    burstConfetti(200, 0, 0.6, 0.4, 1);
    burstConfetti(110, -cannonX(), -2.2, 0.3, 1.25, 1);
    burstConfetti(110, cannonX(), -2.2, 0.3, 1.25, -1);
    kick(0.4);
    shakeUntil = time + 0.2;
    auraSwitched = true;
    medalShownAt = time;
    targetPos = shapes.medalAura;
    targetCol = shapeColors.medalAura;
    motion = shapeMotion.medalAura;
    beginTransition({ burst: 1.4, build: 0, flight: '#ffe08a' });
  }

  // ketukan gelembung chat: kamera sedikit tersentak seperti notifikasi masuk
  let passed = 0;
  for (const h of hitTimes) if (time >= h) passed++;
  if (passed > hitsSeen) {
    hitsSeen = passed;
    if (active.bubbles) shakeUntil = time + 0.12;
    if (active.medal && auraSwitched) {
      const side = passed % 2 ? 1 : -1; // bergantian dari kiri dan kanan
      burstConfetti(70, side * cannonX(), -2.2, 0.3, 1.1, -side);
    }
    kick(active.bubbles ? 0.3 : 0.15);
  }

  // ganti ekspresi di tiap ketukan: morph cepat (0.2 detik), bintang aksen muncul kenyal
  if (active.expr && motion?.exprPos) {
    const nEx = motion.exprPos.length;
    exTo = passed % nEx;
    exFrom = passed ? (passed - 1) % nEx : 0;
    const t = passed ? time - hitTimes[passed - 1] : 1;
    exE = 1 - Math.pow(1 - Math.min(1, t / 0.2), 3);
    accentK = motion.accent[exTo]
      ? Math.min(1, t * 6) * (1 + 0.35 * Math.exp(-6 * t) * Math.sin(18 * t))
      : Math.max(0, accentK - dt * 6);
  }

  if (mode === 'morph') {
    const el = time - transStart;
    const ph = motion?.phase, wt = motion?.weight, bob = active.bob ?? 0, dur = active.dur ?? DUR;
    const pv = motion?.pivot, pk = motion?.pivotKind, grp = motion?.group;
    const twinkle = (i) => 0.5 + 0.5 * Math.abs(Math.sin(time * 2.2 + ph[i]));
    const blink = (time % 3.2) < 0.16 ? 0.12 : 1;
    const heartbeat = 1 + 0.08 * Math.sin(time * 4);
    // detak jantung "dug-dug": dua denyut cepat lalu jeda
    const lp = (time % 1.05) / 1.05;
    const lub = 1 + 0.09 * Math.exp(-(((lp - 0.05) / 0.05) ** 2)) + 0.06 * Math.exp(-(((lp - 0.22) / 0.05) ** 2)) + 0.05 * sound.beat;
    const hSide = motion?.side, hPart = motion?.part, tipY = motion?.tipY ?? 0;
    const splitE = time > crySplit ? 1 - Math.pow(1 - Math.min(1, (time - crySplit) / 0.7), 3) : 0;
    const br = motion?.bright;
    const exPA = motion?.exprPos?.[exFrom], exPB = motion?.exprPos?.[exTo];
    const exCA = motion?.exprCol?.[exFrom], exCB = motion?.exprCol?.[exTo];
    const hide = motion?.hide;
    // sapuan cahaya EKG bergerak kiri -> kanan, seirama detak jantung
    const sweepW = motion?.halfW ?? 4, sweepX = -sweepW + lp * 2 * sweepW;
    const sweepY = -1.7 + ((time * 0.35) % 1) * 4.6; // gelombang cahaya naik dari kaki ke kepala
    // rasi bintang hati digambar mulai 0.5 detik, selesai dalam 2.2 detik (baris ini hanya ~4 detik)
    const drawn = active.night ? THREE.MathUtils.clamp((time - sceneStart - 0.5) / 2.2, 0, 1) : 1;
    for (let i = 0; i < COUNT; i++) {
      const ix = i * 3, iy = ix + 1, iz = ix + 2;
      if (free[i] && releaseFree && el >= delay[i]) {
        // giliran terbang: mulai dari posisi jatuhnya sekarang
        free[i] = 0;
        startPos[ix] = pos[ix]; startPos[iy] = pos[iy]; startPos[iz] = pos[iz];
      }
      if (free[i]) {
        const g = free[i] === 2 ? 1.2 : 5;
        const d = Math.max(0, 1 - (free[i] === 2 ? 0.6 : 1.8) * dt); // hambatan udara -> jatuh pelan seperti confetti
        vel[ix] *= d; vel[iy] = vel[iy] * d - g * dt; vel[iz] *= d;
        if (pos[iy] > -9) { pos[ix] += vel[ix] * dt; pos[iy] += vel[iy] * dt; pos[iz] += vel[iz] * dt; }
        continue;
      }
      let tx = targetPos[ix], ty = targetPos[iy], tz = targetPos[iz];
      if (bob && wt[i]) {
        const w = wt[i] * bob;
        ty += Math.sin(time * 1.4 + ph[i]) * w;
        tx += Math.cos(time * 0.9 + ph[i]) * w * 0.35;
      }
      // gerakan kecil di sekitar pivot: bintang berkelip, mata berkedip, hati berdenyut, gelembung pop
      if (pk && pk[i]) {
        const cx = pv[ix], cy = pv[iy], cz = pv[iz];
        if (pk[i] === 5) {
          // orbit cincin glitter: putar di bidang datar, lalu miringkan
          const a = ph[i] + time * 0.55, lx = Math.cos(a) * wt[i], lz = Math.sin(a) * wt[i];
          const y1 = cy * RING_CX - lz * RING_SX, z1 = cy * RING_SX + lz * RING_CX;
          tx = lx * RING_CZ - y1 * RING_SZ; ty = lx * RING_SZ + y1 * RING_CZ + 0.4; tz = z1;
        } else if (pk[i] === 6) {
          // kilau naik dari bawah ke atas layar, lalu mulai lagi dari bawah (di luar layar)
          ty = -4.2 + ((time * wt[i] + ph[i]) % 1) * 8.4;
          tx = cx + Math.sin(time * 1.2 + ph[i] * 6) * 0.1; tz = cz;
        } else if (pk[i] === 7) {
          // hati kecil naik dari bawah: tumbuh di awal, bergoyang kiri-kanan
          const cyc = (time * wt[i] + ph[i]) % 1, k = Math.min(1, cyc * 5);
          const mx = cx + Math.sin(time * 1.5 + ph[i] * 10) * 0.25, my = -4.2 + cyc * 8.4;
          tx = mx + tx * k; ty = my + ty * k; tz = cz + tz * k;
        } else if (pk[i] === 8) {
          ty = cy + (ty - cy) * lub; tx *= lub; tz *= lub;
        } else if (pk[i] === 9) {
          if (hPart[i] === 1 && time < cryCrack) tz *= 0.05; // retakan masih tersembunyi di dalam hati
          if (splitE > 0) {
            // dua belahan miring menjauh, berporos di ujung bawah hati
            const sd = hSide[i], ang = -sd * 0.2 * splitE, cA = Math.cos(ang), sA = Math.sin(ang);
            const px = tx, py = ty - tipY;
            tx = px * cA - py * sA + sd * 0.25 * splitE;
            ty = px * sA + py * cA + tipY;
          }
        } else if (pk[i] === 10) {
          ty = 4.2 - ((time * wt[i] + ph[i]) % 1) * 8.4 + cy; tx = cx; tz = cz;
        } else if (pk[i] === 12) {
          // riak: garis luar hati membesar terus dari pusat hati
          const k = 1.06 + ((time * 0.4 + ph[i]) % 1) * 0.8;
          tx = cx + (tx - cx) * k; ty = cy + (ty - cy) * k; tz = cz + (tz - cz) * k;
        } else if (pk[i] === 20) {
          // bintang jatuh: melesat di 18% awal siklusnya, ekor tertinggal di belakang kepala
          const cyc = (time * 0.22 + ph[i]) % 1, u = Math.min(1, cyc / 0.18);
          const hx = cx + SHOOT_DIR[0] * u * 7, hy = cy + SHOOT_DIR[1] * u * 7;
          tx = hx - SHOOT_DIR[0] * wt[i] * 0.9; ty = hy - SHOOT_DIR[1] * wt[i] * 0.9; tz = cz;
        } else if (pk[i] === 18) {
          ty = 2.6 - ((time * wt[i] + ph[i]) % 1) * 5.2;
          tx = cx + Math.sin(time * 0.7 + ph[i] * 9) * 0.05; tz = cz;
        } else if (pk[i] === 19) {
          // awan bergulung pelan
          tx += Math.sin(time * 0.35 + ph[i] * 6.3) * 0.06;
          ty += Math.cos(time * 0.3 + ph[i] * 5.1) * 0.05;
        } else if (pk[i] === 17) {
          const t = (time * wt[i] + ph[i]) % 1;
          tx += Math.sin(t * 6 + ph[i] * 10) * 0.25 * t;
          ty += t * 1.8;
          tz += Math.cos(t * 5 + ph[i] * 7) * 0.2 * t;
        } else if (pk[i] === 16) {
          // awan: melayang ke kanan, muncul lagi dari kiri setelah keluar layar
          const span = motion.span, w = (((cx + time * wt[i] + span) % (2 * span)) + 2 * span) % (2 * span) - span;
          tx += w; ty += cy; tz += cz;
        } else if (pk[i] === 14) {
          // fitur wajah: morph posisi dari ekspresi lama ke ekspresi baru
          tx = exPA[ix] + (exPB[ix] - exPA[ix]) * exE;
          ty = exPA[iy] + (exPB[iy] - exPA[iy]) * exE;
          tz = exPA[iz] + (exPB[iz] - exPA[iz]) * exE;
        } else if (pk[i] === 15) {
          // bintang aksen: tumbuh dari pivotnya; saat mati disembunyikan di dalam bola
          const sx = cx + (tx - cx) * accentK, sy = cy + (ty - cy) * accentK, sz = cz + (tz - cz) * accentK;
          const m = Math.min(1, accentK * 3);
          tx = hide[0] + (sx - hide[0]) * m; ty = hide[1] + (sy - hide[1]) * m; tz = hide[2] + (sz - hide[2]) * m;
        } else if (pk[i] === 13) {
          ty = cy + wt[i] * ecgAmp; // EKG: tinggi lonjakan x kekuatan detak (0 = garis datar)
        } else if (pk[i] === 2) ty = cy + (ty - cy) * blink;
        else {
          let k;
          if (pk[i] === 4) {
            // gelembung tumbuh dari ekornya lalu memantul kenyal saat ketukannya
            const t = time - (hitTimes[grp[i]] ?? transStart);
            k = t < 0 ? 0.35 : 1 + 0.3 * Math.exp(-t * 6) * Math.sin(t * 18);
          } else k = pk[i] === 1 ? twinkle(i) : heartbeat;
          tx = cx + (tx - cx) * k; ty = cy + (ty - cy) * k; tz = cz + (tz - cz) * k;
        }
      }
      const p =Math.min(1, Math.max(0, ((el - delay[i]) * (0.8 + (speed[i] - 0.6) * 0.5)) / dur));
      if (p >= 1) {
        pos[ix] = tx; pos[iy] = ty + Math.sin(time * 1.5 + i) * 0.004; pos[iz] = tz;
        // kilau warna per partikel: berkelip, riak memudar, sapuan cahaya EKG
        if (exCA && pk[i] === 14) {
          col[ix] = exCA[ix] + (exCB[ix] - exCA[ix]) * exE;
          col[iy] = exCA[iy] + (exCB[iy] - exCA[iy]) * exE;
          col[iz] = exCA[iz] + (exCB[iz] - exCA[iz]) * exE;
          continue;
        }
        let lum = 1;
        if (br && br[i]) {
          if (br[i] === 1) lum = 0.55 + 0.45 * Math.sin(time * 3 + ph[i] * 17);
          else if (br[i] === 2) lum = Math.pow(1 - ((time * 0.4 + ph[i]) % 1), 1.5) * rippleAmp;
          else if (br[i] === 3) { const dx = tx - sweepX; lum = 0.3 + 0.9 * Math.exp(-(dx * dx) / 0.5); }
          else if (br[i] === 4) { const dy = ty - sweepY; lum = 0.75 + 0.9 * Math.exp(-(dy * dy) / 0.06); }
          else if (br[i] === 5) lum = Math.pow(1 - ((time * wt[i] + ph[i]) % 1), 1.2) * 1.3;
          else if (br[i] === 6) lum = THREE.MathUtils.smoothstep(drawn, wt[i] - 0.02, wt[i]) * 0.9;
          else if (br[i] === 8) lum = drawn >= wt[i] ? 1.1 + 0.9 * Math.exp(-(drawn - wt[i]) * 25) + 0.2 * Math.sin(time * 3 + ph[i] * 9) : 0.12;
          else {
            const cyc = (time * 0.22 + ph[i]) % 1;
            lum = cyc < 0.18 ? Math.pow(1 - wt[i], 1.5) * Math.sin((cyc / 0.18) * Math.PI) * 1.4 : 0;
          }
        }
        col[ix] = targetCol[ix] * lum; col[iy] = targetCol[iy] * lum; col[iz] = targetCol[iz] * lum;
        continue;
      }
      // ease-out: langsung melesat begitu scene ganti, lalu mendarat pelan (tanpa jeda di awal)
      const e = 1 - Math.pow(1 - p, 3);
      const u = 1 - e, a = u * u, b = 2 * u * e, c = e * e;
      const bx = a * startPos[ix] + b * ctrl[ix] + c * tx;
      const by = a * startPos[iy] + b * ctrl[iy] + c * ty;
      const bz = a * startPos[iz] + b * ctrl[iz] + c * tz;
      const mid = Math.sin(Math.PI * e); // 0 di awal & akhir, puncak di tengah
      const ang = mid * twist[i], cs = Math.cos(ang), sn = Math.sin(ang);
      pos[ix] = bx * cs - bz * sn;
      pos[iy] = by;
      pos[iz] = bx * sn + bz * cs;
      if (br && br[i] >= 6) {
        // garis rasi & bintang jatuh memudar saat terbang, baru muncul lewat animasinya sendiri
        col[ix] = startCol[ix] * (1 - e); col[iy] = startCol[iy] * (1 - e); col[iz] = startCol[iz] * (1 - e);
        continue;
      }
      const g = mid * flightGlow;
      col[ix] = (startCol[ix] + (targetCol[ix] - startCol[ix]) * e) * (1 - g) + flightCol.r * g;
      col[iy] = (startCol[iy] + (targetCol[iy] - startCol[iy]) * e) * (1 - g) + flightCol.g * g;
      col[iz] = (startCol[iz] + (targetCol[iz] - startCol[iz]) * e) * (1 - g) + flightCol.b * g;
    }
  } else {
    const gravity = mode === 'rain' ? 9 : 3;
    for (let i = 0; i < COUNT; i++) {
      const ix = i * 3, iy = ix + 1, iz = ix + 2;
      vel[iy] -= gravity * dt;
      pos[ix] += vel[ix] * dt;
      pos[iy] += vel[iy] * dt;
      pos[iz] += vel[iz] * dt;
      if (pos[iy] < -6) {
        pos[ix] = rand(-9, 9); pos[iy] = rand(6, 9); pos[iz] = rand(-4, 2);
        vel[ix] = 0; vel[iy] = -rand(0, 3); vel[iz] = 0;
      }
    }
  }
  geo.attributes.position.needsUpdate = true;

  const ck = 1 - Math.pow(0.05, dt);
  if (mode !== 'morph') for (let i = 0; i < col.length; i++) col[i] += (targetCol[i] - col[i]) * ck;
  geo.attributes.color.needsUpdate = true;

  // kabut menyesuaikan scene (bintang butuh jarak pandang jauh)
  const [fogNear, fogFar] = active.fog ?? [7.5, 14];
  scene.fog.near += (fogNear - scene.fog.near) * ck;
  scene.fog.far += (fogFar - scene.fog.far) * ck;
  scene.fog.color.lerp(fogColor, ck);
  halo.material.color.lerp(haloColor, ck);

  // hati patah: riak berhenti setelah retak, EKG perlahan jadi garis datar setelah hancur
  rippleAmp += ((active.cry && time >= cryCrack ? 0 : 1) - rippleAmp) * (1 - Math.pow(0.05, dt));
  ecgAmp += ((active.cry && time >= cryCrumble ? 0 : 1) - ecgAmp) * (1 - Math.pow(0.3, dt));

  // gerakan per scene
  // rotasi & skala didekati pelan ke targetnya, jadi tidak "loncat" saat scene ganti
  const follow = 1 - Math.pow(0.03, dt);
  let rotTarget = 0;
  if (active.orbit) rotTarget = Math.sin(time * 0.35) * (active.swing ?? 0.7);
  else if (active.spin) rotTarget = points.rotation.y + active.spin * dt;
  points.rotation.y += (rotTarget - points.rotation.y) * follow;
  const beat = active.beat ? 1 + 0.1 * Math.pow(Math.max(0, Math.sin(time * 6)), 8) : 1;
  // pantulan kenyal: memanjang saat di atas, gepeng saat menyentuh bawah
  const pulse = 1 + 0.035 * sound.bass; // seluruh objek sedikit membesar mengikuti bass
  let sx = beat * pulse, sy = beat * pulse, py = 0;
  if (active.bounce) {
    const b = Math.abs(Math.sin(time * 2.6));
    py = b * 0.25; sy = 0.93 + 0.1 * b; sx = 1.04 - 0.05 * b;
  }
  if (hitTimes.length) {
    const s = hitSquash();
    sy *= 1 - s; sx *= 1 + s * 0.6;
  }
  const sk = 1 - Math.pow(1e-6, dt); // cukup cepat untuk mengikuti pantulan, tapi tetap halus
  points.scale.x += (sx - points.scale.x) * sk;
  points.scale.y += (sy - points.scale.y) * sk;
  points.scale.z += (sx - points.scale.z) * sk;
  points.position.y += (py - points.position.y) * sk;
  modelGroup.rotation.y = points.rotation.y;

  const shown = meshMats && time >= revealAt;
  const fade = 1 - Math.pow(shown ? 0.15 : 0.002, dt); // muncul pelan, hilang cepat
  meshOpacity += ((shown ? 1 : 0) - meshOpacity) * fade;
  if (meshMats) setMeshOpacity(meshOpacity);

  // medali logam: muncul cepat, flip satu putaran, lalu berayun seperti tergantung di pita
  if (medalMats) {
    const mShown = active.medal && auraSwitched;
    medalOpacity += ((mShown ? 1 : 0) - medalOpacity) * (1 - Math.pow(mShown ? 0.002 : 0.0005, dt));
    setMedalOpacity(medalOpacity);
    if (medalPivot.visible) {
      const t = time - medalShownAt;
      const flip = 1 - Math.pow(1 - Math.min(1, t / 1.4), 3);
      medalInner.rotation.y = (1 - flip) * Math.PI * 2 + Math.sin(time * 0.6) * 0.35 * flip;
      medalPivot.rotation.z = Math.exp(-t * 0.7) * Math.sin(t * 3.2) * 0.14 + Math.sin(time * 1.3) * 0.025;
      const s = hitTimes.length ? hitSquash() : 0;
      medalInner.scale.set(1 + s * 0.6, 1 - s, 1 + s * 0.6);
      glint.intensity = 6 * medalOpacity;
      glint.position.set(Math.sin(time * 0.9) * 2.5, 1.2, 2.2);
    } else glint.intensity = 0;
  }

  // pendar partikel: naik pelan, berdenyut lembut seperti napas
  mat.size = (active.size ?? 0.04) * (1 + 0.12 * sound.bass);
  const glowTarget = (active.glow ?? 0) * (0.85 + 0.15 * Math.sin(time * 2.2) + 0.4 * sound.bass);
  glow.value += (glowTarget - glow.value) * (1 - Math.pow(0.2, dt));
  auraMat.opacity = glow.value * 0.22 * mat.opacity;
  auraMat.size = mat.size * 3;
  aura.visible = auraMat.opacity > 0.005;
  halo.material.opacity = glow.value;
  halo.scale.set(5 + Math.sin(time * 2.2) * 0.25, 7 + Math.sin(time * 2.2) * 0.35, 1);
  // saat model asli tampil utuh, partikel penyusunnya ikut menghilang
  const ptsTarget = shown && active.shape === 'model' ? 0 : 1;
  mat.opacity += (ptsTarget - mat.opacity) * (1 - Math.pow(0.1, dt));

  // panggung: muncul membesar, berputar pelan, lampu tepi berkedip bergantian
  const st = time - sceneStart;
  stageK += ((active.stage ? 1 : 0) - stageK) * (1 - Math.pow(0.03, dt));
  stage.visible = stageK > 0.01;
  if (stage.visible) {
    stage.scale.setScalar(0.7 + 0.3 * stageK);
    stageTop.rotation.y += dt * 0.3;
    for (const m of stageMats) m.opacity = stageK;
    bulbs.forEach((b, k) => b.material.color.setScalar(0.4 + 0.6 * (Math.sin(time * 4 + k * 0.9) > 0 ? 1 : 0.35)).multiply(BULB));
  }
  // lampu sorot menyala satu per satu (sedikit berkedip saat dinyalakan); hanya visual, model tidak ikut disinari
  for (const sp of SPOTS) {
    const on = active.stage && st > sp.at ? 1 : 0;
    sp.k += (on - sp.k) * (1 - Math.pow(on ? 0.002 : 0.05, dt));
    const flicker = on && st - sp.at < 0.3 ? (Math.random() > 0.35 ? 1 : 0.2) : 1;
    sp.cone.visible = sp.k > 0.01;
    sp.cone.material.uniforms.uOpacity.value = 0.2 * sp.k * flicker;
  }
  // mahkota turun dari atas sambil berputar, mendarat memantul di kepala
  const crownT = (time - revealAt - 0.8) / 1.3;
  crown.visible = active.stage && meshMats && crownT > 0;
  if (crown.visible) {
    const u = Math.min(1, crownT);
    const bounce = u < 0.7 ? (u / 0.7) ** 2 : 1 - Math.sin(((u - 0.7) / 0.3) * Math.PI) * 0.12;
    crown.position.set(crownRest.x, crownRest.y + 2.5 * (1 - bounce), crownRest.z);
    crown.rotation.y = (1 - u) * Math.PI * 4;
    for (const m of crownMats) m.opacity = meshOpacity;
    if (u >= 1 && !crownLanded) { crownLanded = true; shakeUntil = time + 0.15; kick(0.25); }
  }
  // kamera: bergerak dari posisi awal ke akhir scene (ease in-out), diikuti dengan halus
  const cm = active.cam ?? {};
  const cu = Math.min(1, st / (cm.dur ?? 4)), ce = cu * cu * (3 - 2 * cu);
  const along = (r, def) => (r ? r[0] + (r[1] - r[0]) * ce : def);
  const camFollow = 1 - Math.pow(0.15, dt);
  camZ += (along(cm.z, 8) - camZ) * camFollow;
  camY += (along(cm.y, 0) - camY) * camFollow;
  camLook += ((cm.look ?? along(cm.y, 0)) - camLook) * camFollow;
  const angT = along(cm.ang, 0) + (cm.orbit ? Math.sin(st * (cm.orbitSpeed ?? 0.3)) * cm.orbit : 0);
  camAng += (angT - camAng) * camFollow;
  camKick *= Math.pow(0.004, dt);

  // penganugerahan: confetti & pilar cahaya hanya di scene medali setelah medali asli muncul
  updateConfetti(dt, active.medal && auraSwitched);
  beamK += ((active.medal && auraSwitched ? 1 : 0) - beamK) * (1 - Math.pow(0.05, dt));
  beam.visible = beamK > 0.01;
  beam.material.uniforms.uOpacity.value = 0.2 * beamK * (1 + 0.4 * sound.bass);

  // halo bulan muncul pelan & sedikit berdenyut mengikuti musik
  moonK += ((active.night ? 1 : 0) - moonK) * (1 - Math.pow(0.08, dt));
  moonHalo.visible = moonK > 0.01;
  if (moonHalo.visible) {
    moonHalo.position.set(MOON_POS[0], MOON_POS[1], MOON_POS[2] - 0.6);
    moonHalo.scale.setScalar(4.6 + 0.4 * sound.level);
    moonHalo.material.opacity = moonK * (0.55 + 0.25 * sound.level);
  }

  // cahaya surgawi: awan menyala dulu, lalu berkas cahaya turun perlahan dari atas ke bawah
  sunK += ((active.heaven ? 1 : 0) - sunK) * (1 - Math.pow(0.05, dt));
  heavenGlow.visible = shafts.visible = sunK > 0.01;
  if (shafts.visible) {
    const reveal = active.heaven ? 1 - Math.pow(1 - THREE.MathUtils.clamp((st - 0.6) / 1.8, 0, 1), 2) : 1;
    shaftUniforms.uReveal.value = reveal * 1.15;
    shaftUniforms.uOpacity.value = sunK * 0.55 * (1 + 0.5 * sound.bass);
    shaftUniforms.uTime.value = time;
    shafts.rotation.y = camAng; // tetap menghadap kamera
    heavenGlow.material.opacity = sunK * (0.75 + 0.1 * Math.sin(time * 0.8));
  }

  const amp = time < shakeUntil ? (active.shake ?? 0.1) : 0;
  const hand = cm.hand ?? 0.012; // goyang halus seperti kamera dipegang tangan
  const hx = (Math.sin(time * 1.1) + Math.sin(time * 1.9 + 2) * 0.5) * hand;
  const hy = (Math.sin(time * 1.3 + 1) + Math.sin(time * 2.3) * 0.5) * hand;
  mouse.sx += (mouse.x - mouse.sx) * (1 - Math.pow(0.05, dt));
  mouse.sy += (mouse.y - mouse.sy) * (1 - Math.pow(0.05, dt));
  const cz = camZ - camKick;
  camera.position.set(Math.sin(camAng + mouse.sx * 0.05) * cz + hx, camY + hy + mouse.sy * 0.15, Math.cos(camAng + mouse.sx * 0.05) * cz);
  camera.lookAt(hx * 0.5, camLook, 0);
  camera.position.x += (Math.random() - 0.5) * amp;
  camera.position.y += (Math.random() - 0.5) * amp;

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
// keadaan awal (landing): sama seperti applyScene(IDLE), tapi elemen DOM lain belum siap di sini
for (const m of [mat, auraMat]) { Object.assign(m, GLOW_BLEND); m.userData.additive = true; m.needsUpdate = true; }
mat.depthWrite = false;
fogColor.set(IDLE.fogColor);
scene.fog.color.set(IDLE.fogColor);
setBg(IDLE.bg);
tick();

/* ---------- mulai + kontrol ---------- */
const statusEl = document.getElementById('status');
const startBtn = document.getElementById('start');
const audio = AUDIO_SRC ? new Audio(AUDIO_SRC) : null;
// `time` boleh angka detik (6.2) atau teks menit:detik ('0:06.2')
const toSec = (t) => (typeof t === 'string' ? t.split(':').reduce((a, v) => a * 60 + parseFloat(v), 0) : t);
const fmt = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
// buka dengan ?timing untuk merekam waktu tiap baris
const timing = audio && new URLSearchParams(location.search).has('timing');
const recorded = [];
const synced = audio && !timing && LYRICS.every((l) => Number.isFinite(toSec(l.time)));

const progressEl = document.getElementById('progress');
const countEl = document.getElementById('count');

// landing: pecah judul jadi huruf (muncul bergantian), tombol Play magnetis, judul paralaks
const introEl = document.getElementById('intro');
document.querySelectorAll('.intro-title .word').forEach((w, wi) => {
  const text = w.textContent;
  w.textContent = '';
  [...text].forEach((ch, ci) => {
    const span = document.createElement('span');
    span.className = 'ch';
    span.textContent = ch;
    span.style.setProperty('--i', wi * 5 + ci);
    w.appendChild(span);
  });
});
introEl.addEventListener('pointermove', (e) => {
  introEl.style.setProperty('--mx', (e.clientX / innerWidth) * 2 - 1);
  introEl.style.setProperty('--my', (e.clientY / innerHeight) * 2 - 1);
  // tombol tertarik ke kursor saat kursor berada dalam radius 170px
  const r = startBtn.getBoundingClientRect();
  const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2), d = Math.hypot(dx, dy);
  const pull = d < 170 ? (1 - d / 170) * 0.35 : 0;
  startBtn.style.transform = `translate(${dx * pull}px, ${dy * pull}px)`;
});
introEl.addEventListener('pointerleave', () => { startBtn.style.transform = ''; });
// progres gabungan: setengah untuk unduh model, setengah untuk menyiapkan bentuk scene
const progress = { model: 0, shapes: 0 };
function showProgress() {
  const p = (progress.model + progress.shapes) / 2;
  statusEl.textContent = 'Loading';
  countEl.textContent = String(Math.round(p * 100)).padStart(3, '0');
  progressEl.style.strokeDashoffset = 100 - p * 100;
}
const shapesReady = buildShapes((p) => { progress.shapes = p; showProgress(); });
const modelReady = modelShape('models/andrew3d.glb', 4, (p) => { progress.model = p; showProgress(); })
  .then(({ positions, colors, mesh }) => {
    shapes.model = positions;
    modelColors = colors;
    addShape('dayScene', dayShape(positions, visibleWidth()));
    // cari puncak kepala (rata-rata partikel tertinggi) untuk tempat mendarat mahkota
    let top = -Infinity;
    for (let i = 1; i < positions.length; i += 3) top = Math.max(top, positions[i]);
    let hx = 0, hz = 0, hn = 0, minX = Infinity, maxX = -Infinity;
    for (let i = 0; i < positions.length; i += 3) {
      if (positions[i + 1] < top - 0.35) continue;
      hx += positions[i]; hz += positions[i + 2]; hn++;
      minX = Math.min(minX, positions[i]); maxX = Math.max(maxX, positions[i]);
    }
    crownRest.set(hx / hn, top - 0.06, hz / hn);
    crown.scale.setScalar(THREE.MathUtils.clamp((maxX - minX) / 0.55, 0.6, 1.4));
    modelGroup.add(mesh);
    meshMats = [].concat(mesh.material);
    setMeshOpacity(0);
    progress.model = 1;
    showProgress();
  })
  .catch((err) => {
    console.error(err);
    shapes.model = heartShape(0.15);
    statusEl.textContent = 'Model gagal dimuat';
  });
// Siapkan (compile) shader semua objek sekarang, saat masih loading. Kalau tidak, browser baru
// menyiapkannya saat objek pertama kali tampil, dan lagu terasa patah-patah di tengah (mis. scene 5).
function warmUpShaders() {
  const hidden = [];
  scene.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
  try { renderer.compile(scene, camera); } catch (err) { console.warn('Gagal menyiapkan shader', err); }
  for (const o of hidden) o.visible = false;
}
Promise.all([modelReady, shapesReady]).finally(() => {
  warmUpShaders();
  progressEl.style.strokeDashoffset = 0;
  countEl.textContent = '100';
  if (!/gagal/.test(statusEl.textContent)) statusEl.textContent = 'Siap — tekan Play';
  startBtn.disabled = false;
});

// medali dimuat di latar belakang; selama belum siap, scene `one` memakai medali partikel buatan
modelShape('models/medal.glb', 2.6 * Math.min(1, visibleWidth() / 4.2), () => {})
  .then(({ positions, colors, mesh }) => {
    shapes.medal = positions;
    shapeColors.medal = colors;
    shapeMotion.medal = null; // partikel kini mengikuti bentuk asli, tanpa bintang cadangan
    medalMats = [].concat(mesh.material);
    for (const m of medalMats) {
      if (!m.isMeshStandardMaterial) continue;
      m.envMap = envTex;
      m.envMapIntensity = 1.4;
      if (!m.metalnessMap) { m.metalness = 1; m.roughness = Math.min(m.roughness, 0.3); }
      m.needsUpdate = true;
    }
    // pivot di ujung atas medali supaya ayunannya seperti benda tergantung
    const box = new THREE.Box3().setFromObject(mesh);
    medalPivot.position.y = box.max.y;
    medalInner.position.y = -box.max.y;
    medalInner.add(mesh);
    setMedalOpacity(0);
  })
  .catch((err) => console.error('Medali gagal dimuat', err));

const letterboxEl = document.getElementById('letterbox');
const titleCard = document.getElementById('title-card');
const endingEl = document.getElementById('ending');
let started = false, opening = false, inEnding = false, openingTimer = 0;

function setupAudio() {
  if (!audio || analyser) return;
  try {
    const ctx = new AudioContext();
    const src = ctx.createMediaElementSource(audio);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.6;
    src.connect(analyser);
    analyser.connect(ctx.destination);
    freq = new Uint8Array(analyser.frequencyBinCount);
  } catch (err) {
    console.warn('Analisis audio tidak tersedia', err);
  }
}

// pembuka: judul dari partikel ~3.6 detik, lalu lagu mulai dan masuk ke scene 1
function playOpening() {
  if (!shapes.title) addShape('title', titleShape(visibleWidth()));
  clearTimeout(openingTimer);
  opening = true;
  inEnding = false;
  current = -1;
  endingEl.classList.remove('show');
  applyScene(SCENES.opening, null);
  showLine('', 'none');
  [...dotsEl.children].forEach((d) => d.classList.remove('on'));
  titleCard.classList.add('show');
  openingTimer = setTimeout(() => {
    opening = false;
    titleCard.classList.remove('show');
    if (!audio) return goTo(0);
    audio.currentTime = 0;
    audio.play().then(() => !synced && goTo(0)).catch((err) => {
      console.warn('Lagu tidak bisa diputar', err);
      goTo(0);
    });
  }, 3600);
}

// penutup: partikel jadi langit berbintang, lalu kredit muncul
function playEnding() {
  if (inEnding || opening) return;
  inEnding = true;
  applyScene(SCENES.ending, null);
  showLine('', 'none');
  [...dotsEl.children].forEach((d) => d.classList.remove('on'));
  setTimeout(() => inEnding && endingEl.classList.add('show'), 1400);
}
document.getElementById('replay').addEventListener('click', (e) => {
  e.stopPropagation();
  playOpening();
});
audio?.addEventListener('ended', () => !timing && playEnding());

function next() {
  if (opening || inEnding) return;
  if (current >= LYRICS.length - 1) playEnding();
  else goTo(current + 1);
}

startBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  started = true;
  document.getElementById('intro').classList.add('hide');
  setupAudio();
  if (timing) { audio?.play(); return; }
  // "buka kunci" audio di dalam klik, karena lagu baru diputar setelah pembuka selesai
  if (audio) {
    audio.muted = true;
    audio.play().then(() => { audio.pause(); audio.currentTime = 0; }).catch(() => {}).finally(() => { audio.muted = false; });
  }
  playOpening();
});

const recordedBeats = [];
const recordedWords = [];
const TIMING_HELP = 'MODE TIMING — spasi: baris berikutnya mulai · B: ketukan (mis. tiap "no") · W: tiap kata mulai dinyanyikan (karaoke)';
function renderTiming() {
  const list = recorded.map((t, i) => {
    const b = recordedBeats[i]?.length ? `, beats: [${recordedBeats[i].map((x) => x.toFixed(2)).join(', ')}]` : '';
    const w = recordedWords[i]?.length ? `, words: [${recordedWords[i].map((x) => x.toFixed(2)).join(', ')}]` : '';
    return `baris ${i + 1}: time: '${fmt(t)}'${b}${w}`;
  }).join('\n');
  timingEl.textContent = `${TIMING_HELP}\n\n${list}`;
  if (recorded.length === LYRICS.length) timingEl.textContent += '\n\nBaris terakhir. Salin hasilnya ke lyrics.js';
  console.log(list);
}
function recordNext() {
  if (recorded.length >= LYRICS.length) return;
  recorded.push(audio.currentTime);
  recordedBeats.push([]);
  recordedWords.push([]);
  goTo(recorded.length - 1);
  renderTiming();
}
// kata (karaoke) dicatat relatif terhadap awal baris yang sedang tampil
function recordWord() {
  if (!recorded.length) return;
  const i = recorded.length - 1;
  recordedWords[i].push(audio.currentTime - recorded[i]);
  renderTiming();
}
// ketukan dicatat relatif terhadap awal baris yang sedang tampil
function recordBeat() {
  if (!recorded.length) return;
  const i = recorded.length - 1;
  recordedBeats[i].push(audio.currentTime - recorded[i]);
  renderTiming();
}
let timingEl;
if (timing) {
  timingEl = document.createElement('pre');
  timingEl.id = 'timing';
  timingEl.textContent = `${TIMING_HELP}\n\nTekan spasi tepat saat baris 1 mulai dinyanyikan`;
  document.body.appendChild(timingEl);
}

addEventListener('keydown', (e) => {
  if (!started) return;
  if (timing) {
    if (e.key === ' ') { e.preventDefault(); recordNext(); }
    if (e.key.toLowerCase() === 'b') recordBeat();
    if (e.key.toLowerCase() === 'w') recordWord();
    return;
  }
  if (e.key === 'ArrowRight' || e.key === ' ') next();
  if (e.key === 'ArrowLeft' && !opening && !inEnding) goTo(current - 1);
});
addEventListener('click', () => started && !synced && !timing && next());

if (synced) {
  // 'playing' (bukan 'play'): baru terpicu saat suara benar-benar keluar, bukan saat perintah putar
  // dipanggil. Selama pembuka/penutup, posisi lagu diabaikan supaya scene 1 tidak mulai duluan.
  const check = () => {
    if (!opening && !inEnding) {
      let i = 0;
      LYRICS.forEach((l, k) => { if (audio.currentTime >= toSec(l.time)) i = k; });
      goTo(i);
    }
    if (!audio.paused) requestAnimationFrame(check);
  };
  audio.addEventListener('playing', check);
}

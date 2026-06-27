/* ===========================================================
   EVO DESIGN RACING — Showroom 3D de F1
   Roteiro:
   1) Portão de garagem "EVO DESIGN" fechado (hero)
   2) Scroll abre o portão e a câmera entra no showroom
   3) 6 carros de F1 girando em torno de si (3 esq / 3 dir)
   4) Parede de quadros dos produtos no fim
   5) Scroll final desliza os quadros da direita p/ esquerda
   Three.js + GSAP ScrollTrigger + Lenis + Postprocessing
   =========================================================== */

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { VignetteShader } from 'three/addons/shaders/VignetteShader.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const { gsap } = window;
gsap.registerPlugin(window.ScrollTrigger);

const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || window.innerWidth < 760;

// camada de BLOOM seletivo (só LEDs e logo brilham, sem afetar carros/piso/paredes)
const BLOOM_SCENE = 1;
const bloomLayer = new THREE.Layers(); bloomLayer.set(BLOOM_SCENE);

/* ----------------------------------------------------------- 0. WebGL */
function getWebGLContext() {
  const c = document.createElement('canvas');
  const opts = { failIfMajorPerformanceCaveat: false };
  try {
    const ctx = c.getContext('webgl2', opts) || c.getContext('webgl', opts) || c.getContext('experimental-webgl', opts);
    if (ctx) return ctx;
  } catch (e) { getWebGLContext._reason = e.message; }
  return null;
}
if (!getWebGLContext()) {
  const rEl = document.getElementById('webgl-reason');
  if (rEl) rEl.textContent = 'Ative a aceleração de hardware do navegador (chrome://settings/system).';
  document.getElementById('no-webgl').hidden = false;
  document.getElementById('loader').classList.add('hidden');
  document.body.classList.remove('is-loading');
  throw new Error('WebGL indisponível');
}
document.body.classList.add('is-loading');

/* ----------------------------------------------------------- 1. Renderer / Cena / Câmera */
const canvas = document.getElementById('scene');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  document.getElementById('no-webgl').hidden = false;
  document.getElementById('loader').classList.add('hidden');
  document.body.classList.remove('is-loading');
  throw e;
}
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05040a);
scene.fog = new THREE.Fog(0x05040a, 10, 48);

const camera = new THREE.PerspectiveCamera(isMobile ? 78 : 50, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 1.9, 15.9);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;

/* ----------------------------------------------------------- 2. Materiais */
const matMetal = new THREE.MeshStandardMaterial({ color: 0x1a1a22, metalness: 0.95, roughness: 0.3 });
const matDark = new THREE.MeshStandardMaterial({ color: 0x0c0c12, metalness: 0.6, roughness: 0.5 });
const matCarbon = new THREE.MeshStandardMaterial({ color: 0x0b0b10, metalness: 0.6, roughness: 0.4 });
const matTire = new THREE.MeshStandardMaterial({ color: 0x09090c, metalness: 0.1, roughness: 0.85 });
const matEvo = new THREE.MeshStandardMaterial({ color: 0x00d3c0, metalness: 0.3, roughness: 0.3, emissive: 0x00d3c0, emissiveIntensity: 0.4 });
const matFrame = new THREE.MeshStandardMaterial({ color: 0x1a1a1f, metalness: 0.0, roughness: 0.8 }); // fosco (sem brilho na moldura)

const clickable = []; // meshes clicáveis (quadros + bistrôs dos carros)

// loader compartilhado com decoder meshopt (modelos comprimidos)
const gltfLoader = new GLTFLoader();
gltfLoader.setMeshoptDecoder(MeshoptDecoder);

// corrige materiais "fantasma"/transparentes (carros que aparecem vazados)
function fixMats(obj) {
  obj.traverse((o) => {
    if (o.isMesh && o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((mt) => { mt.transparent = false; mt.opacity = 1; mt.depthWrite = true; mt.side = THREE.DoubleSide; mt.needsUpdate = true; });
    }
  });
}

// carrega um .glb: centraliza, escala p/ tamanho-alvo, assenta no chão, posiciona e gira
function loadModel(url, opts = {}) {
  const { size = 3, x = 0, z = 0, rotY = 0, floorY = -1.6, onReady } = opts;
  gltfLoader.load(url, (gltf) => {
    const m = gltf.scene;
    fixMats(m);
    let box = new THREE.Box3().setFromObject(m);
    const c = box.getCenter(new THREE.Vector3());
    const s = box.getSize(new THREE.Vector3());
    m.position.sub(c);
    m.scale.setScalar(size / Math.max(s.x, s.y, s.z));
    const grp = new THREE.Group(); grp.add(m);
    box = new THREE.Box3().setFromObject(grp);
    grp.position.set(x, floorY - box.min.y, z);
    grp.rotation.y = rotY;
    scene.add(grp);
    if (onReady) onReady(grp, m);
  }, undefined, (e) => { console.warn('[EVO] modelo nao carregou:', url, (e && e.message) || e); });
}

// carrega um .glb IGNORANDO malhas "lixo" gigantes (modelos Sketchfab com backdrop/stray)
function loadModelClean(url, opts = {}) {
  const { size = 3, x = 0, z = 0, rotY = 0, floorY = -1.6, onReady } = opts;
  gltfLoader.load(url, (gltf) => {
    const root = gltf.scene; fixMats(root); root.updateMatrixWorld(true);
    const items = [];
    root.traverse((o) => { if (o.isMesh && o.geometry) { o.geometry.computeBoundingBox(); const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld); items.push({ o, b, d: b.getSize(new THREE.Vector3()).length() }); } });
    if (!items.length) return;
    const med = items.map((i) => i.d).sort((a, b) => a - b)[Math.floor(items.length / 2)] || 1;
    const box = new THREE.Box3();
    items.forEach((i) => { if (i.d > med * 5) i.o.visible = false; else box.union(i.b); }); // esconde gigantes, mede só o resto
    const c = box.getCenter(new THREE.Vector3()); const s = box.getSize(new THREE.Vector3());
    const sc = size / Math.max(s.x, s.y, s.z);
    root.position.sub(c); root.scale.setScalar(sc);
    const grp = new THREE.Group(); grp.add(root);
    grp.position.set(x, floorY - (box.min.y - c.y) * sc, z); grp.rotation.y = rotY;
    scene.add(grp);
    if (onReady) onReady(grp, root);
  }, undefined, (e) => { console.warn('[EVO] modelo nao carregou:', url, (e && e.message) || e); });
}

/* ----------------------------------------------------------- 3. Showroom: chão, paredes texturizadas, teto, sala fechada */
const SHOW_HALF = 9;          // parede lateral a x = ±9
const ROOM_FRONT = 6;         // z da entrada (portão)
const ROOM_BACK = -34;        // z da parede do fundo
const ROOM_LEN = ROOM_FRONT - ROOM_BACK; // 40
const ROOM_MIDZ = (ROOM_FRONT + ROOM_BACK) / 2;

// --- textura procedural de parede (painéis verticais sutis) ---
function makeWallTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 512;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#34353d'); g.addColorStop(0.5, '#2a2b32'); g.addColorStop(1, '#242530');
  x.fillStyle = g; x.fillRect(0, 0, 512, 512);
  // painéis verticais
  for (let i = 0; i <= 512; i += 128) {
    x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(i - 1, 0, 2, 512);
    x.fillStyle = 'rgba(255,255,255,0.05)'; x.fillRect(i + 2, 0, 1, 512);
  }
  // ruído leve
  for (let n = 0; n < 1600; n++) { x.fillStyle = 'rgba(255,255,255,' + (Math.random() * 0.02) + ')'; x.fillRect(Math.random() * 512, Math.random() * 512, 1, 1); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
const wallTex = makeWallTexture();

// --- piso (concreto polido com leve textura) ---
const floorTex = wallTex.clone(); floorTex.repeat.set(8, 24);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(2 * SHOW_HALF, 91),
  new THREE.MeshStandardMaterial({ color: 0x3a3b42, metalness: 0.1, roughness: 0.6 }));
floor.rotation.x = -Math.PI / 2; floor.position.set(0, -1.6, -39.5); scene.add(floor); // termina na porta (z=6) — não invade a calçada
// piso interno: textura "piso" (Tiles056 — xadrez preto e branco) — cor + relevo
{
  const tlf = new THREE.TextureLoader(); let col = null, nrm = null, pend = 2;
  const RX = 2.5, RY = 12.6; // escala uniforme (quadrados ~1,2m)
  const ma = renderer.capabilities.getMaxAnisotropy();
  const apply = () => { if (--pend) return;
    col.colorSpace = THREE.SRGBColorSpace; col.wrapS = col.wrapT = THREE.RepeatWrapping; col.repeat.set(RX, RY); col.anisotropy = ma;
    nrm.wrapS = nrm.wrapT = THREE.RepeatWrapping; nrm.repeat.set(RX, RY); nrm.anisotropy = ma;
    floor.material = new THREE.MeshStandardMaterial({ map: col, normalMap: nrm, color: 0xffffff, metalness: 0.2, roughness: 0.4 });
  };
  tlf.load('assets/textures/piso_col.jpg', (t) => { col = t; apply(); });
  tlf.load('assets/textures/piso_nrm.jpg', (t) => { nrm = t; apply(); });
}


// --- CALÇADA externa (rua, na frente da garagem) ---
function makeSidewalkTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = '#9b9ba0'; x.fillRect(0, 0, 512, 512);
  x.strokeStyle = 'rgba(0,0,0,0.28)'; x.lineWidth = 5;
  for (let i = 0; i <= 512; i += 128) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 512); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(512, i); x.stroke(); }
  for (let n = 0; n < 4500; n++) { x.fillStyle = 'rgba(0,0,0,' + (Math.random() * 0.05) + ')'; x.fillRect(Math.random() * 512, Math.random() * 512, 1, 1); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(8, 6); return t;
}
const sidewalk = new THREE.Mesh(new THREE.PlaneGeometry(240, 90),
  new THREE.MeshStandardMaterial({ color: 0x9a9a9e, metalness: 0.0, roughness: 0.96 }));
sidewalk.rotation.x = -Math.PI / 2; sidewalk.position.set(0, -1.585, 51); scene.add(sidewalk); // começa na porta (z=6) e vai até perto da câmera, sem invadir o interior
// textura real de calçada (PavingStones) — cor + relevo
{
  const tls = new THREE.TextureLoader(); let col = null, nrm = null, pend = 2;
  const RX = 64, RY = 24;
  const ma = renderer.capabilities.getMaxAnisotropy();
  const apply = () => { if (--pend) return;
    col.colorSpace = THREE.SRGBColorSpace; col.wrapS = col.wrapT = THREE.RepeatWrapping; col.repeat.set(RX, RY); col.anisotropy = ma;
    nrm.wrapS = nrm.wrapT = THREE.RepeatWrapping; nrm.repeat.set(RX, RY); nrm.anisotropy = ma;
    sidewalk.material = new THREE.MeshStandardMaterial({ map: col, normalMap: nrm, color: 0xffffff, metalness: 0.0, roughness: 0.95 });
  };
  tls.load('assets/textures/sidewalk_col.jpg', (t) => { col = t; apply(); });
  tls.load('assets/textures/sidewalk_nrm.jpg', (t) => { nrm = t; apply(); });
}
// meio-fio (degrau baixo na borda da calçada, junto à garagem)
const curb = new THREE.Mesh(new THREE.BoxGeometry(240, 0.18, 0.5),
  new THREE.MeshStandardMaterial({ color: 0x6f6f75, metalness: 0.1, roughness: 0.9 }));
curb.position.set(0, -1.5, 5.4); scene.add(curb);

// --- paredes laterais: DIREITA = espelho · ESQUERDA = fachada de blocos de concreto (textura parede esquerda) ---
const _wtl = new THREE.TextureLoader();
const _aniso = renderer.capabilities.getMaxAnisotropy();
const lwallCol = _wtl.load('assets/textures/lwall_col.jpg'); lwallCol.colorSpace = THREE.SRGBColorSpace; lwallCol.wrapS = lwallCol.wrapT = THREE.RepeatWrapping; lwallCol.repeat.set(8, 2.2); lwallCol.anisotropy = _aniso;
const lwallBump = _wtl.load('assets/textures/lwall_bump.jpg'); lwallBump.wrapS = lwallBump.wrapT = THREE.RepeatWrapping; lwallBump.repeat.set(8, 2.2); lwallBump.anisotropy = _aniso;
[-1, 1].forEach((s) => {
  if (s === 1 && !isMobile) {
    // espelho na parede direita
    const mirror = new Reflector(new THREE.PlaneGeometry(ROOM_LEN, 8.6), {
      textureWidth: 1024, textureHeight: 1024, color: 0x70767e, clipBias: 0.003,
    });
    mirror.position.set(SHOW_HALF - 0.03, 2.7, ROOM_MIDZ);
    mirror.rotation.y = -Math.PI / 2;
    scene.add(mirror);
  } else {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_LEN, 11),
      new THREE.MeshStandardMaterial({ map: lwallCol, bumpMap: lwallBump, bumpScale: 0.08, color: 0xffffff, metalness: 0.25, roughness: 0.8 }));
    wall.position.set(s * SHOW_HALF, 2.5, ROOM_MIDZ); wall.rotation.y = -s * Math.PI / 2; scene.add(wall); // termina no portão (z=6)
  }
});

// --- teto + parede do fundo (sala fechada, sem gaps) ---
// teto só dentro do showroom (termina no portão z=6, p/ não aparecer escuro sobre a calçada)
const ceil = new THREE.Mesh(new THREE.PlaneGeometry(2 * SHOW_HALF, 100),
  new THREE.MeshStandardMaterial({ color: 0x16161c, metalness: 0.2, roughness: 0.9 }));
ceil.rotation.x = Math.PI / 2; ceil.position.set(0, 6.5, -44); scene.add(ceil);
// parede do fundo: UMA parede só, MESMA textura da esquerda (fachada de blocos)
const BACK_W = 40;
const bwCol = _wtl.load('assets/textures/lwall_col.jpg'); bwCol.colorSpace = THREE.SRGBColorSpace; bwCol.wrapS = bwCol.wrapT = THREE.RepeatWrapping; bwCol.repeat.set(8, 3.2); bwCol.anisotropy = _aniso;
const bwBump = _wtl.load('assets/textures/lwall_bump.jpg'); bwBump.wrapS = bwBump.wrapT = THREE.RepeatWrapping; bwBump.repeat.set(8, 3.2); bwBump.anisotropy = _aniso;
const backWall = new THREE.Mesh(new THREE.PlaneGeometry(BACK_W, 16),
  new THREE.MeshStandardMaterial({ map: bwCol, bumpMap: bwBump, bumpScale: 0.08, color: 0xffffff, metalness: 0.25, roughness: 0.8 }));
backWall.position.set(0, 3.2, ROOM_BACK); scene.add(backWall);

// --- RODAPÉ de MADEIRA entre as paredes internas e o piso (acabamento discreto) ---
{
  const woodMat = (repX) => {
    const t = _wtl.load('assets/textures/rodape_col.jpg'); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repX, 1); t.anisotropy = _aniso;
    return new THREE.MeshStandardMaterial({ map: t, color: 0xffffff, metalness: 0.0, roughness: 0.6 });
  };
  const BH = 0.24, BD = 0.16, BY = -1.6 + BH / 2; // nem grosso nem fino
  const bbL = new THREE.Mesh(new THREE.BoxGeometry(BD, BH, ROOM_LEN), woodMat(18)); bbL.position.set(-(SHOW_HALF - 0.05), BY, ROOM_MIDZ); scene.add(bbL);
  const bbR = new THREE.Mesh(new THREE.BoxGeometry(BD, BH, ROOM_LEN), woodMat(18)); bbR.position.set(SHOW_HALF - 0.05, BY, ROOM_MIDZ); scene.add(bbR);
  const bbB = new THREE.Mesh(new THREE.BoxGeometry(2 * SHOW_HALF, BH, BD), woodMat(9)); bbB.position.set(0, BY, ROOM_BACK + 0.1); scene.add(bbB);
}

// (trilhos de LED no chão removidos a pedido)

// cores de LED — bloom seletivo
const LED_BLUE = 0x4fb4ff;   // teto (forte)
const RING_BLUE = 0x1c4a70;  // anel da plataforma (bem fraco -> brilho bem leve)
// --- LUZ HEXAGONAL no teto (favo de mel, LED azul) ---
// anel hexagonal (tubo de luz) — material "basic" = sempre aceso (cara de LED)
function hexRingGeo(R, tube) {
  const outer = new THREE.Shape();
  for (let i = 0; i <= 6; i++) { const a = i * Math.PI / 3; const px = Math.cos(a) * R, py = Math.sin(a) * R; i ? outer.lineTo(px, py) : outer.moveTo(px, py); }
  const hole = new THREE.Path(); const ri = R - tube;
  for (let i = 0; i <= 6; i++) { const a = i * Math.PI / 3; const px = Math.cos(a) * ri, py = Math.sin(a) * ri; i ? hole.lineTo(px, py) : hole.moveTo(px, py); }
  outer.holes.push(hole);
  return new THREE.ShapeGeometry(outer);
}
{
  const HEX_R = 2.1, HEX_TUBE = 0.16, HEX_Y = 6.25;
  const ledBlue = new THREE.MeshBasicMaterial({ color: LED_BLUE, side: THREE.DoubleSide }); // LED azul (visível por baixo)
  const hexGeo = hexRingGeo(HEX_R, HEX_TUBE);
  const hexGroup = new THREE.Group();
  // favo de mel "flat-top": colunas em X, linhas em Z (cobre o corredor)
  for (let col = -1; col <= 1; col++) {
    for (let row = -1; row <= 9; row++) {
      const x = col * 1.5 * HEX_R;
      const z = ROOM_FRONT - 4 - (row + (col & 1 ? 0.5 : 0)) * Math.sqrt(3) * HEX_R;
      if (z < ROOM_BACK + 3) continue;
      const hx = new THREE.Mesh(hexGeo, ledBlue);
      hx.rotation.x = -Math.PI / 2; // deita no teto
      hx.position.set(x, HEX_Y, z);
      hx.layers.enable(BLOOM_SCENE); // brilha
      hexGroup.add(hx);
    }
  }
  scene.add(hexGroup);
  // (point lights do teto removidos — causavam os poços de brilho no teto)
}
// claridade azulada na sala (luz ambiente fria, sem hotspot)
scene.add(new THREE.HemisphereLight(0xbfe0ff, 0x20242c, 0.9));

/* ----------------------------------------------------------- 3b/3c. (prateleira, rodas, volantes, bancada e sofá removidos a pedido) */

/* ----------------------------------------------------------- 4. Luzes (sem holofotes/brilho — só luz difusa uniforme) */
scene.add(new THREE.AmbientLight(0xcdd2da, 1.5));
const moon = new THREE.DirectionalLight(0xeef2ff, 0.9); moon.position.set(6, 14, 10); scene.add(moon);
const fillLight = new THREE.DirectionalLight(0xdfe6f0, 0.5); fillLight.position.set(-6, 10, -14); scene.add(fillLight);

/* ----------------------------------------------------------- 5. PORTÃO DE GARAGEM "EVO DESIGN" */
const doorGroup = new THREE.Group();
scene.add(doorGroup);
const DOOR_Y_CLOSED = 1.7;
const DOOR_OPEN_RISE = 7.2;

(function buildDoor() {
  // FACHADA BRANCA completa em volta do portão (parede com o vão da porta)
  // vão da porta: x[-4.7, 4.7], y[-1.6, 5.0]
  const FZ = 6.15;

  // --- MURO de PEDRA (textura real StoneBricksSplitface) + paredes grandes p/ preencher a tela ---
  // painéis bem maiores que a tela: vista externa, sem cantos pretos (sem "caixa")
  const VAO = 4.7;          // meia-largura do vão da porta
  // planos (sem espessura) p/ não esticar textura nas faces laterais (bug das pontas)
  const tmpMuro = () => new THREE.MeshStandardMaterial({ color: 0x6f6f74, roughness: 0.95 });
  const left = new THREE.Mesh(new THREE.PlaneGeometry(48, 56), tmpMuro());
  left.position.set(-(VAO + 24), 20, FZ); doorGroup.add(left);
  const right = new THREE.Mesh(new THREE.PlaneGeometry(48, 56), tmpMuro());
  right.position.set(VAO + 24, 20, FZ); doorGroup.add(right);
  const top = new THREE.Mesh(new THREE.PlaneGeometry(2 * VAO, 44), tmpMuro());
  top.position.set(0, 27, FZ); doorGroup.add(top); // só acima do vão, encaixe exato com as laterais (sem overlap)

  // Mapeamento da pedra ALINHADO ao mundo (mesmo tile em todos -> pedras contínuas, sem emenda/bug acima da porta)
  const TILE = 4; // unidades de mundo por tile da textura
  const muroPanels = [
    { mesh: left,  w: 48,      h: 56, cx: -(VAO + 24), cy: 20 },
    { mesh: right, w: 48,      h: 56, cx: VAO + 24,    cy: 20 },
    { mesh: top,   w: 2 * VAO, h: 44, cx: 0,           cy: 27 },
  ];
  const tl = new THREE.TextureLoader();
  let stoneCol = null, stoneNrm = null, pend = 2;
  const applyStone = () => {
    if (--pend) return;
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    muroPanels.forEach((p) => {
      const rx = p.w / TILE, ry = p.h / TILE, ox = (p.cx - p.w / 2) / TILE, oy = (p.cy - p.h / 2) / TILE;
      const c = stoneCol.clone(); c.wrapS = c.wrapT = THREE.RepeatWrapping; c.repeat.set(rx, ry); c.offset.set(ox, oy); c.colorSpace = THREE.SRGBColorSpace; c.anisotropy = maxAniso; c.needsUpdate = true;
      const n = stoneNrm.clone(); n.wrapS = n.wrapT = THREE.RepeatWrapping; n.repeat.set(rx, ry); n.offset.set(ox, oy); n.anisotropy = maxAniso; n.needsUpdate = true;
      p.mesh.material = new THREE.MeshStandardMaterial({ map: c, normalMap: n, color: 0xffffff, metalness: 0.0, roughness: 0.95, side: THREE.DoubleSide });
    });
  };
  tl.load('assets/textures/wall_col.jpg', (t) => { t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; stoneCol = t; applyStone(); });
  tl.load('assets/textures/wall_nrm.jpg', (t) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; stoneNrm = t; applyStone(); });

  // (grafite e contorno verde-água removidos a pedido)

  // textura do portão: chapa enrolável real (pasta "portao") recortada do atlas + "EVO DESIGN RACING"
  const dc = document.createElement('canvas'); dc.width = 1024; dc.height = 768;
  const x = dc.getContext('2d');
  function drawDoor(img) {
    if (img) {
      // recorta só a área limpa das chapas (sem a faixa escura do topo) e estica p/ preencher (mesma proporção)
      x.drawImage(img, 18, 135, 582, 418, 0, 0, 1024, 768);
    } else {
      const grd = x.createLinearGradient(0, 0, 0, 768);
      grd.addColorStop(0, '#b9bcc0'); grd.addColorStop(0.5, '#d6d9dd'); grd.addColorStop(1, '#b9bcc0');
      x.fillStyle = grd; x.fillRect(0, 0, 1024, 768);
    }
    // reflexo vertical suave
    const sh = x.createLinearGradient(0, 0, 1024, 0);
    sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(0.5, 'rgba(255,255,255,0.10)'); sh.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = sh; x.fillRect(0, 0, 1024, 768);
    // texto EVO DESIGN RACING
    x.textAlign = 'center';
    x.shadowColor = 'rgba(0,0,0,0.45)'; x.shadowBlur = 14; x.shadowOffsetY = 3;
    x.fillStyle = '#00b8a8'; x.font = 'bold 168px Oswald, sans-serif'; x.fillText('EVO', 512, 350);
    x.fillStyle = '#23262b'; x.font = '600 78px Oswald, sans-serif'; x.fillText('DESIGN RACING', 512, 446);
    x.shadowBlur = 0; x.shadowOffsetY = 0;
  }
  drawDoor(null);
  const doorTex = new THREE.CanvasTexture(dc); doorTex.colorSpace = THREE.SRGBColorSpace;
  doorTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  { const mi = new Image(); mi.onload = () => { drawDoor(mi); doorTex.needsUpdate = true; }; mi.src = 'assets/textures/door2_col.jpg'; }

  // portão menos metálico/reflexivo -> sem o brilho (hotspot) acima do EVO
  const matDoorEdge = new THREE.MeshStandardMaterial({ color: 0x5a5e63, metalness: 0.5, roughness: 0.55 });
  const panel = new THREE.Mesh(new THREE.BoxGeometry(9.2, 6.6, 0.25),
    [matDoorEdge, matDoorEdge, matDoorEdge, matDoorEdge,
     new THREE.MeshStandardMaterial({ map: doorTex, metalness: 0.45, roughness: 0.6 }), matDoorEdge]);
  panel.name = 'doorPanel';
  panel.position.set(0, DOOR_Y_CLOSED, 5.9); // atrás da fachada (sobe escondido)
  doorGroup.add(panel);
  doorGroup.userData.panel = panel;

  // === MOLDURA + ACABAMENTOS em CONCRETO (Concrete044C) ===
  const concreteParts = []; // {mesh, rx, ry} -> recebe textura quando carregar
  const tmpC = () => new THREE.MeshStandardMaterial({ color: 0x8f8f93, roughness: 0.9 });
  const addC = (mesh, rx, ry) => { mesh.material = tmpC(); concreteParts.push({ mesh, rx, ry }); doorGroup.add(mesh); };

  // repeat UNIFORME (mesma escala nos 2 eixos -> sem esticar a textura, sem serrilhado). TILE ~1.6 unidades.
  const CT = 1.6;
  const JW = 0.6, JZ = 6.3;
  // batentes laterais (cobrem a lateral do portão e o vão até a parede)
  const jL = new THREE.Mesh(new THREE.BoxGeometry(JW, 7.3, 0.6)); jL.position.set(-(VAO + 0.05), 2.05, JZ); addC(jL, JW / CT, 7.3 / CT);
  const jR = new THREE.Mesh(new THREE.BoxGeometry(JW, 7.3, 0.6)); jR.position.set(VAO + 0.05, 2.05, JZ); addC(jR, JW / CT, 7.3 / CT);
  // verga (cobre o topo do portão + a faixa de pedra logo acima, sem deixar aparecer a parede)
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(2 * (VAO + 0.05) + JW, 1.4, 0.6)); lintel.position.set(0, 5.55, JZ); addC(lintel, (2 * (VAO + 0.05) + JW) / CT, 1.4 / CT);
  // soleira (degrau) na base: separa a calçada da área interna
  const thresh = new THREE.Mesh(new THREE.BoxGeometry(2 * (VAO + 0.05) + JW, 0.22, 0.95)); thresh.position.set(0, -1.49, 6.22); addC(thresh, (2 * (VAO + 0.05) + JW) / CT, 0.95 / CT);
  // rodapé nas laterais (onde a parede encontra a calçada)
  const baseL = new THREE.Mesh(new THREE.BoxGeometry(116, 0.5, 0.4)); baseL.position.set(-(VAO + 0.3) - 58, -1.4, 6.05); addC(baseL, 116 / CT, 0.5 / CT);
  const baseR = new THREE.Mesh(new THREE.BoxGeometry(116, 0.5, 0.4)); baseR.position.set((VAO + 0.3) + 58, -1.4, 6.05); addC(baseR, 116 / CT, 0.5 / CT);

  const tlc = new THREE.TextureLoader(); let ccol = null, cpend = 1;
  const applyConcrete = () => {
    if (--cpend) return;
    const ma = renderer.capabilities.getMaxAnisotropy();
    concreteParts.forEach((p) => {
      // só cor (sem normal map) nas peças finas -> elimina o ruído/serrilhado em ângulo raso
      const c = ccol.clone(); c.wrapS = c.wrapT = THREE.RepeatWrapping; c.repeat.set(p.rx, p.ry); c.colorSpace = THREE.SRGBColorSpace; c.anisotropy = ma; c.needsUpdate = true;
      p.mesh.material = new THREE.MeshStandardMaterial({ map: c, color: 0xcfcfd3, metalness: 0.0, roughness: 0.92 });
    });
  };
  tlc.load('assets/textures/concrete_col.jpg', (t) => { ccol = t; applyConcrete(); });
})();

/* ----------------------------------------------------------- 5b. BEBIDAS (máquina de salgadinhos) na parte externa, encostadas na parede (2x à esquerda da porta) */
gltfLoader.load('assets/models/bebidas.glb', (gltf) => {
  const root = gltf.scene; root.updateMatrixWorld(true);
  // opaco em TUDO menos o vidro (corrige corpo transparente sem matar o vidro)
  root.traverse((o) => {
    if (o.isMesh && o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => {
        const isGlass = ((m.name || '') + (o.name || '')).toLowerCase().includes('glass');
        if (!isGlass) { m.transparent = false; m.opacity = 1; m.depthWrite = true; m.side = THREE.DoubleSide; m.needsUpdate = true; }
      });
    }
  });
  // mede meshes e esconde "lixo" gigante; centraliza/mede pelo resto
  const items = [];
  root.traverse((o) => { if (o.isMesh && o.geometry) { o.geometry.computeBoundingBox(); const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld); items.push({ o, b, d: b.getSize(new THREE.Vector3()).length() }); } });
  if (!items.length) return;
  const med = items.map((i) => i.d).sort((a, b) => a - b)[Math.floor(items.length / 2)] || 1;
  const box = new THREE.Box3();
  items.forEach((i) => {
    const sz = i.b.getSize(new THREE.Vector3());
    const minD = Math.min(sz.x, sz.y, sz.z);
    // painel fino e ALTO (fundo/laterais do "estúdio" do modelo) -> esconder. Prateleiras (finas no Y) ficam.
    const panelFundo = (minD < 9) && (sz.y > 80) && (minD < sz.y - 2);
    if (i.d > med * 6 || panelFundo) i.o.visible = false;
    else box.union(i.b);
  });
  const s = box.getSize(new THREE.Vector3()); const c = box.getCenter(new THREE.Vector3());
  const SIZE = 2.4; const sc = SIZE / Math.max(s.x, s.y, s.z);
  const Wm = s.x * sc, Hm = s.y * sc * 1.4, Dm = s.z * sc;
  const sideMat = new THREE.MeshStandardMaterial({ color: 0x121317, metalness: 0.65, roughness: 0.45 });
  [[-6.9, 6.7], [-9.5, 6.7]].forEach(([bx, bz]) => {
    const m = root.clone(true); m.scale.set(sc, sc * 1.4, sc); // altura +40%
    m.position.set(-c.x * sc, -box.min.y * sc * 1.4, -c.z * sc); // centro em xz, base no chão
    const grp = new THREE.Group(); grp.add(m);
    // fecha as laterais e o fundo (o modelo tem vidro transparente nas laterais)
    [-1, 1].forEach((sgx) => { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.05, Hm, Dm * 0.98), sideMat); sp.position.set(sgx * Wm / 2, Hm / 2, 0); grp.add(sp); });
    const bp = new THREE.Mesh(new THREE.BoxGeometry(Wm, Hm, 0.05), sideMat); bp.position.set(0, Hm / 2, -Dm / 2); grp.add(bp);
    grp.position.set(bx, -1.585, bz); grp.rotation.y = 0; // frente (salgadinhos) virada p/ a rua
    scene.add(grp);
  });
  // luz pra iluminar as máquinas (exterior é escuro)
  const bl = new THREE.PointLight(0xfff2e0, 7, 12, 2); bl.position.set(-8.2, 1.6, 8.2); scene.add(bl);
});

// BANCO na calçada, encostado na parede, à DIREITA da porta (comprimento paralelo à parede) — +30%
gltfLoader.load('assets/models/banco.glb', (gltf) => {
  const m = gltf.scene; fixMats(m);
  let box = new THREE.Box3().setFromObject(m); const s = box.getSize(new THREE.Vector3());
  const sc = 3.12 / Math.max(s.x, s.y, s.z);
  m.scale.set(sc, sc * 1.3, sc); // altura +30%
  const grp = new THREE.Group(); grp.add(m);
  box = new THREE.Box3().setFromObject(grp); const c = box.getCenter(new THREE.Vector3());
  m.position.x -= c.x; m.position.z -= c.z; m.position.y -= box.min.y; // base (todas as pernas) no chão
  grp.position.set(7.5, -1.6, 6.5); grp.rotation.y = -Math.PI / 2;
  scene.add(grp);
});

// (placa "EVO DESIGN" da parede removida a pedido)

/* ----------------------------------------------------------- 6. CARROS DE F1 (procedurais, giram em torno de si) */
function makeF1Car(accent) {
  const g = new THREE.Group();
  const acc = new THREE.MeshStandardMaterial({ color: accent, metalness: 0.5, roughness: 0.35, emissive: accent, emissiveIntensity: 0.15 });

  // monocoque
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.45, 3.6), matCarbon); body.position.y = 0.15; g.add(body);
  // afinamento frontal (bico)
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.32, 1.7, 4), matCarbon);
  nose.rotation.x = -Math.PI / 2; nose.rotation.z = Math.PI / 4; nose.position.set(0, 0.08, 2.5); g.add(nose);
  // engine cover / airbox
  const cover = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 1.4), matCarbon); cover.position.set(0, 0.4, -0.9); g.add(cover);
  const airbox = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 0.5, 12), matCarbon); airbox.position.set(0, 0.7, -0.1); g.add(airbox);
  // faixas accent
  [-1, 1].forEach((s) => { const st = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.13, 3.2), acc); st.position.set(s * 0.48, 0.25, 0); g.add(st); });
  // halo
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 8, 20, Math.PI), matMetal);
  halo.rotation.x = Math.PI / 2; halo.rotation.z = Math.PI; halo.position.set(0, 0.6, -0.2); g.add(halo);
  // cockpit
  const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.3, 16, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x05131a, metalness: 0.8, roughness: 0.2 }));
  seat.position.set(0, 0.42, 0.4); g.add(seat);
  // asa dianteira
  const fw = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.06, 0.55), acc); fw.position.set(0, -0.4, 2.1); g.add(fw);
  // asa traseira
  const rw = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 0.06), acc); rw.position.set(0, 0.6, -1.85); g.add(rw);
  const rwSup = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.65, 0.3), matCarbon); rwSup.position.set(0, 0.32, -1.85); g.add(rwSup);
  // pneus
  function tire(px, pz) {
    const t = new THREE.Group();
    const rubber = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.42, 24), matTire); rubber.rotation.z = Math.PI / 2;
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.44, 10), acc); rim.rotation.z = Math.PI / 2;
    t.add(rubber, rim); t.position.set(px, -0.42, pz); return t;
  }
  [[-0.82, 1.5], [0.82, 1.5], [-0.86, -1.4], [0.86, -1.4]].forEach((p) => g.add(tire(p[0], p[1])));
  return g;
}

// anel de luz no piso (sob o carro, rente ao chão)
function makeFloorRing(accent) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.045, 10, 50),
    new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 1.5, roughness: 0.4 }));
  ring.rotation.x = Math.PI / 2; ring.position.y = -1.56; g.add(ring);
  const halo = new THREE.Mesh(new THREE.CircleGeometry(2.6, 40), new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.06 }));
  halo.rotation.x = -Math.PI / 2; halo.position.y = -1.57; g.add(halo);
  return g;
}

const cars = [];
const CAR_FLOOR_Y = -0.82; // rodas tocam o piso (y=-1.6)
const accents = [0x00d3c0, 0xff2d55, 0xffd000, 0x3399ff, 0xffffff, 0x00d3c0];
// no celular os carros ficam mais perto do centro (pra aparecerem no portrait)
const CAR_X = isMobile ? 2.4 : 3.6; // 20% mais perto do centro
// dados de cada carro (abrem no card ao clicar no bistrô)
const carData = [
  { img: '1.png',  title: 'Cockpit Concept Completo', price: 'a partir de R$ 3.299,90', desc: 'A versão mais imponente da EVO. Rodas dianteiras e traseiras, estrutura completa e presença máxima. A partir de 1,0m x 40cm.' },
  { img: '4.png',  title: 'Cockpit Concept', price: 'a partir de R$ 2.199,90', desc: 'A essência do cockpit numa versão minimalista, com design frontal icônico e estrutura simplificada.' },
  { img: '8.png',  title: 'Linha Classic', price: 'a partir de R$ 1.799,90', desc: 'Inspirado nos ícones históricos da Fórmula 1. Visual limpo, elegante e atemporal.' },
  { img: '12.png', title: 'Capacetes Decorativos F1', price: 'a partir de R$ 999,90', desc: 'Capacetes dos grandes ícones da F1. Detalhamento fiel, acabamento premium e forte apelo emocional.' },
  { img: '14.png', title: 'Quadros de Volante F1', price: 'a partir de R$ 399,90', desc: 'Reprodução decorativa dos icônicos volantes da F1. Design e personalidade. 30x30cm.' },
  { img: '16.png', title: 'EVO Track Edition · Brasil GP', price: 'a partir de R$ 699,90', desc: 'Homenagem ao Grande Prêmio do Brasil. Elegante, minimalista e refinado. 30x30cm.' },
];
// carros 3D reais (size/rotY ajustáveis por modelo)
const carModels = [
  { file: 'car_ferrari.glb', size: 4.94, rotY: 0 },
  { file: 'car_rb20.glb',    size: 4.94, rotY: 0 },
  { file: 'car_mcl39.glb',   size: 4.94, rotY: 0 },
  { file: 'car_mp431.glb',   size: 4.94, rotY: 0 },
];
const carSlots = [
  { x: -CAR_X, z: -2 }, { x: CAR_X, z: -7 },
  { x: -CAR_X, z: -13 }, { x: CAR_X, z: -18 },
];

// bistrô com computador (clicável) na frente do carro
function makeKiosk(data, side) {
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x16161c, metalness: 0.6, roughness: 0.4 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x241c14, metalness: 0.2, roughness: 0.6 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.1, 12), dark); pole.position.set(0, -1.05, 0); g.add(pole);
  const kbase = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.06, 18), dark); kbase.position.set(0, -1.57, 0); g.add(kbase);
  const ktop = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.07, 20), wood); ktop.position.set(0, -0.5, 0); g.add(ktop);
  // tela do computador (canvas)
  const c = document.createElement('canvas'); c.width = 512; c.height = 320; const x = c.getContext('2d');
  x.fillStyle = '#04201d'; x.fillRect(0, 0, 512, 320);
  x.textAlign = 'center';
  x.fillStyle = '#00d3c0'; x.font = 'bold 36px Oswald, sans-serif';
  x.fillText(data.title.toUpperCase().slice(0, 22), 256, 78);
  x.fillStyle = '#fff'; x.font = 'bold 50px Inter, sans-serif';
  x.fillText(data.price.replace('a partir de ', ''), 256, 158);
  x.fillStyle = '#00d3c0'; if (x.roundRect) { x.beginPath(); x.roundRect(96, 214, 320, 70, 14); x.fill(); } else x.fillRect(96, 214, 320, 70);
  x.fillStyle = '#04201d'; x.font = 'bold 30px Inter, sans-serif'; x.fillText('VER INFORMAÇÕES', 256, 252);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.41), new THREE.MeshBasicMaterial({ map: tex }));
  screen.position.set(0, -0.16, 0.05); screen.rotation.x = -0.34; screen.userData.product = data; g.add(screen); clickable.push(screen);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.46, 0.05), dark); body.position.set(0, -0.16, 0.0); body.rotation.x = -0.34; g.add(body);
  g.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2; // tela virada p/ o corredor
  return g;
}

// pódio sob cada carro: base estática (anel de LED azul) + TOPO giratório (gira junto com o carro)
const PODIUM_TOP = -1.28;
const spinPlats = []; // topos giratórios {plat, spin}
function makePodium(x, z, spin) {
  // base estática (cilindro escuro + anel de LED azul na borda)
  const baseG = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(3.05, 3.35, 0.24, 60),
    new THREE.MeshStandardMaterial({ color: 0x0b0c10, metalness: 0.5, roughness: 0.45 }));
  base.position.y = -1.52; baseG.add(base);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.18, 0.07, 14, 96),
    new THREE.MeshBasicMaterial({ color: RING_BLUE }));
  ring.rotation.x = Math.PI / 2; ring.position.y = -1.5; ring.layers.enable(BLOOM_SCENE); baseG.add(ring);
  baseG.position.set(x, 0, z); scene.add(baseG);

  // TOPO giratório (disco que roda com o carro) + marcas radiais p/ perceber a rotação
  const topG = new THREE.Group();
  const topDisc = new THREE.Mesh(new THREE.CylinderGeometry(3.0, 3.0, 0.12, 60),
    new THREE.MeshStandardMaterial({ color: 0x141519, metalness: 0.5, roughness: 0.4 }));
  topDisc.position.y = -1.4; topG.add(topDisc);
  const markMat = new THREE.MeshStandardMaterial({ color: 0x2c2e36, metalness: 0.3, roughness: 0.6 });
  for (let a = 0; a < 8; a++) { // 8 marcas na borda do disco (mostram o giro)
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.1), markMat);
    m.position.set(Math.cos(a * Math.PI / 4) * 2.7, -1.33, Math.sin(a * Math.PI / 4) * 2.7);
    m.rotation.y = -a * Math.PI / 4; topG.add(m);
  }
  topG.position.set(x, 0, z); scene.add(topG);
  spinPlats.push({ plat: topG, spin });
}

// "verniz": deixa a pintura do carro mais brilhante e a cor mais viva (clear-coat)
function varnish(grp) {
  grp.traverse((o) => {
    if (o.isMesh && o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => {
        if (m.roughness !== undefined) m.roughness = Math.max(0.06, m.roughness * 0.35); // mais liso (brilhante)
        m.envMapIntensity = 1.5; // reflexo do ambiente (cara de verniz)
        if (m.color) { const hsl = {}; m.color.getHSL(hsl); m.color.setHSL(hsl.h, Math.min(1, hsl.s * 1.25), hsl.l); } // cor mais viva
        m.needsUpdate = true;
      });
    }
  });
}

// carros: modelo + plataforma giram juntos sobre o pódio
carSlots.forEach((slot, i) => {
  const cm = carModels[i];
  const spin = 0.2 + i * 0.04;
  makePodium(slot.x, slot.z, spin);
  loadModel('assets/models/' + cm.file, {
    size: cm.size, x: slot.x, z: slot.z, rotY: cm.rotY, floorY: PODIUM_TOP, // sobe o carro p/ cima do pódio
    onReady: (grp) => {
      grp.traverse((o) => { o.userData.product = carData[i]; }); // carro inteiro clicável (abre o card)
      varnish(grp); // realça a pintura (verniz)
      clickable.push(grp);
      cars.push({ car: grp, spin });
    },
  });
});

/* ----------------------------------------------------------- 6b. McLaren do print no fim da sala (no chão, sem luzes próprias) */
loadModel('assets/models/hero_mclaren.glb', { size: 5, x: 0, z: -29.5, rotY: 0.5 }); // de frente p/ a entrada, levemente de lado
// roda F1 ("whell") no fim da sala, lado direito
loadModel('assets/models/wheel_end.glb', { size: 1.7, x: 5, z: -29, rotY: 0 });

// prateleira (prateleira_unitaria) no fundo-esquerda, estendida até perto da parede esquerda, cheia de rodas/volantes
gltfLoader.load('assets/models/prateleira_unitaria.glb', (gltf) => {
  const m = gltf.scene; fixMats(m);
  let box = new THREE.Box3().setFromObject(m); const s = box.getSize(new THREE.Vector3());
  const sc = 3.2 / Math.max(s.x, s.y, s.z);
  m.scale.set(sc, sc, sc * 1.6); // estende a LARGURA (vira world-x após girar) p/ alcançar a parede esquerda
  const grp = new THREE.Group(); grp.add(m);
  box = new THREE.Box3().setFromObject(grp); const c = box.getCenter(new THREE.Vector3());
  m.position.x -= c.x; m.position.z -= c.z; m.position.y -= box.min.y; // centra xz, base no chão
  grp.position.set(-7.15, -1.6, -33.2); grp.rotation.y = Math.PI / 2; // estende só p/ a esquerda (direita ~-5.5, esquerda ~-8.8)
  scene.add(grp); grp.updateMatrixWorld(true);

  // detecta os NÍVEIS (prateleiras = malhas finas no Y) e a faixa útil em X
  const lv = []; const full = new THREE.Box3();
  grp.traverse((o) => { if (o.isMesh && o.geometry) { o.geometry.computeBoundingBox(); const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld); full.union(b); const d = b.getSize(new THREE.Vector3()); if (d.y < 0.12 && d.x > 0.8) lv.push(b.max.y); } });
  const levels = [...new Set(lv.map((v) => Math.round(v * 20) / 20))].sort((a, b) => a - b);
  const xMin = full.min.x + 0.45, xMax = full.max.x - 0.45, zc = grp.position.z;

  // carrega roda + volante e enfileira em TODOS os níveis (alternando, repetindo) — +29%
  let roda = null, vol = null, pend = 2;
  const fill = () => {
    if (--pend) return;
    const norm = (p, size) => { const b = new THREE.Box3().setFromObject(p); const z = b.getSize(new THREE.Vector3()); p.scale.setScalar(size / Math.max(z.x, z.y, z.z)); };
    const ITEM = 0.62, RODA = ITEM * 1.35; norm(roda, RODA); norm(vol, ITEM); // roda +35%
    const span = xMax - xMin; const sp = RODA * 1.1; const n = Math.max(2, Math.floor(span / sp) + 1); const step = span / (n - 1);
    let k = 0;
    levels.forEach((ly) => {
      for (let i = 0; i < n; i++) {
        const isRoda = (k++ % 2 === 0);
        const it = (isRoda ? roda : vol).clone(true);
        const g2 = new THREE.Group(); g2.add(it);
        const b2 = new THREE.Box3().setFromObject(g2); const c2 = b2.getCenter(new THREE.Vector3());
        it.position.x -= c2.x; it.position.z -= c2.z; it.position.y -= b2.min.y; // base sobre a prateleira
        g2.position.set(xMin + i * step, ly + 0.01, zc);
        if (isRoda) g2.rotation.y = Math.PI / 4; // roda girada 45°
        scene.add(g2);
      }
    });
  };
  gltfLoader.load('assets/models/roda_prateleira.glb', (g) => { roda = g.scene; fixMats(roda); fill(); });
  gltfLoader.load('assets/models/volante_prateleira.glb', (g) => { vol = g.scene; fixMats(vol); fill(); });
});

// GAME (arcade) no fundo à DIREITA, encostado na parede de vidro (espelho), de frente p/ a loja
loadModel('assets/models/game.glb', { size: 3.38, x: 8.1, z: -30, rotY: Math.PI, floorY: -1.6 }); // girado +90° anti-horário, encostado no vidro (x~8.95)

// TAPETE embaixo da McLaren — o modelo tem offset interno (+1.99,-1.99); compenso p/ centralizar sob o carro (-0.03,-29.5)
loadModel('assets/models/tapete.glb', { size: 6, x: -2.02, z: -27.5, rotY: 0, floorY: -1.585 });

// LOGO F1 no topo, centralizada e ENCOSTADA na parede esquerda — em pé + brilho nas cores
gltfLoader.load('assets/models/logo_f1.glb', (g) => {
  const m = g.scene; fixMats(m);
  m.traverse((o) => {
    if (o.isMesh && o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((mm) => { if (mm.color) { mm.emissive = mm.color.clone(); mm.emissiveIntensity = 1.0; mm.toneMapped = false; mm.needsUpdate = true; } });
      o.layers.enable(BLOOM_SCENE);
    }
  });
  // escala (a logo é deitada: ~3.2 de largura)
  let box = new THREE.Box3().setFromObject(m);
  const sz = box.getSize(new THREE.Vector3());
  const lsc = 3.4 / Math.max(sz.x, sz.y, sz.z);
  m.scale.set(-lsc, lsc, lsc); // espelha no eixo do texto (corrige "1F" -> "F1")
  const grp = new THREE.Group(); grp.add(m);
  box = new THREE.Box3().setFromObject(grp); const c = box.getCenter(new THREE.Vector3());
  m.position.sub(c);                 // centraliza no grupo
  // a logo está DEITADA (face +y). Levanta, vira p/ +x e corrige de ponta-cabeça
  const qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);
  grp.quaternion.copy(qy).multiply(qx);
  grp.position.set(-(SHOW_HALF - 0.12), 4.7, ROOM_MIDZ); // topo, centro da parede esq, encostada
  scene.add(grp);
});
// luz colorida suave atrás da logo (reforça o brilho na parede)
const logoGlow = new THREE.PointLight(0xff2d3a, 3, 9, 2); logoGlow.position.set(-8.2, 4.9, ROOM_MIDZ); scene.add(logoGlow);

/* ----------------------------------------------------------- 7. PAREDE DE QUADROS no fim (deslizam dir->esq) */
const WALL_Z = -33.85; // quadros bem juntos da parede do fundo (passam ATRÁS da prateleira)
const endWall = new THREE.Group();
endWall.position.set(0, 1.85, WALL_Z); // quadros mais altos (espaço p/ ver o carro no chão)
scene.add(endWall);

// (painel de fundo separado removido — a parede do fundo agora é uma só)

const manager = new THREE.LoadingManager();
const texLoader = new THREE.TextureLoader(manager);

// dados de cada quadro (foto + info do produto p/ o card)
const wallData = [
  { img: '1.png',  title: 'Cockpit Concept Completo', price: 'a partir de R$ 3.299,90', desc: 'A versão mais imponente da EVO. Rodas dianteiras e traseiras, estrutura completa e presença máxima. Tamanho a partir de 1,0m x 40cm.' },
  { img: '2.png',  title: 'Cockpit Concept Completo', price: 'a partir de R$ 3.299,90', desc: 'Design frontal icônico, estrutura completa e máximo impacto visual no ambiente.' },
  { img: '8.png',  title: 'Linha Classic', price: 'a partir de R$ 1.799,90', desc: 'Inspirado nos ícones históricos da F1. Visual limpo, elegante e atemporal. Tamanho a partir de 1,0m x 40cm.' },
  { img: '12.png', title: 'Capacetes Decorativos F1', price: 'a partir de R$ 999,90', desc: 'Capacetes dos grandes ícones da F1. Detalhamento fiel, acabamento premium e forte apelo emocional. Escala 1:2.' },
  { img: '14.png', title: 'Quadros de Volante F1', price: 'a partir de R$ 399,90', desc: 'Reprodução decorativa dos icônicos volantes da F1. Design e personalidade. 30x30cm.' },
  { img: '4.png',  title: 'Cockpit Concept', price: 'a partir de R$ 2.199,90', desc: 'A essência do cockpit numa versão minimalista, com estrutura simplificada. Tamanho a partir de 1,0m x 40cm.' },
  { img: '16.png', title: 'EVO Track Edition · Brasil GP', price: 'a partir de R$ 699,90', desc: 'Homenagem ao Grande Prêmio do Brasil. Elegante, minimalista e refinado. 30x30cm.' },
  { img: '6.png',  title: 'Cockpit Concept', price: 'a partir de R$ 2.199,90', desc: 'Design frontal icônico com proporção equilibrada — exclusividade para ambientes sofisticados.' },
  { img: '18.png', title: 'Quadros de Volante F1', price: 'a partir de R$ 399,90', desc: 'Peças que unem design e performance. Cada detalhe importa. 30x30cm.' },
  { img: 'amb-quarto.jpg',   title: 'EVO no seu ambiente', price: '', desc: 'Veja como uma peça EVO transforma e redefine o espaço.' },
  { img: 'amb-showroom.jpg', title: 'EVO no seu ambiente', price: '', desc: 'Presença que eleva qualquer ambiente de alto padrão.' },
];
const FRAME_SPACING = isMobile ? 6.5 : 4.4;
const FRAME_H = isMobile ? 3.6 : 2.9;          // tamanho do quadro (celular um pouco maior)

// textura do botão "VER INFORMAÇÕES" (retângulo)
function makeButtonTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 120;
  const x = c.getContext('2d');
  x.fillStyle = '#00d3c0';
  const r = 14; if (x.roundRect) { x.beginPath(); x.roundRect(2, 2, 508, 116, r); x.fill(); } else { x.fillRect(2, 2, 508, 116); }
  x.fillStyle = '#04201d'; x.font = 'bold 42px Inter, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText('VER INFORMAÇÕES', 256, 62);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const btnTex = makeButtonTexture();

wallData.forEach((data, i) => {
  texLoader.load('assets/products/' + data.img, (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const aspect = (tex.image.width || 1) / (tex.image.height || 1);
    const H = FRAME_H, W = Math.min(FRAME_H * 1.25, Math.max(FRAME_H * 0.6, H * aspect));
    const f = new THREE.Group();
    f.add(new THREE.Mesh(new THREE.BoxGeometry(W + 0.24, H + 0.24, 0.12), matFrame));
    const matp = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.05, H + 0.05), new THREE.MeshBasicMaterial({ color: 0x0a0a0e })); matp.position.z = 0.061; f.add(matp);
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: tex })); pic.position.z = 0.07; pic.userData.product = data; f.add(pic); clickable.push(pic);
    // botão menor embaixo do quadro
    const btn = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 0.3), new THREE.MeshBasicMaterial({ map: btnTex, transparent: true }));
    btn.position.set(0, -(H / 2) - 0.42, 0.07); btn.userData.product = data; f.add(btn); clickable.push(btn);
    f.position.set(i * FRAME_SPACING, 0, 0);
    endWall.add(f);
  });
});
const WALL_COUNT = wallData.length;
const WALL_START_X = 0; // primeiro quadro centralizado ao chegar

// (holofotes da parede de quadros removidos a pedido — sem brilho)

/* ----------------------------------------------------------- 8. (partículas removidas a pedido) */

/* ----------------------------------------------------------- 9. Postprocessing — BLOOM SELETIVO (só LEDs/logo) + MSAA */
let composer = null, bloomComposer = null, finalComposer = null;
const __darkMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
const __matStore = {};
function darkenNonBloomed(obj) {
  if (obj.isMesh && bloomLayer.test(obj.layers) === false) { __matStore[obj.uuid] = obj.material; obj.material = __darkMat; }
}
function restoreMaterial(obj) { if (__matStore[obj.uuid]) { obj.material = __matStore[obj.uuid]; delete __matStore[obj.uuid]; } }
const __nopost = new URLSearchParams(location.search).get('nopost');
try {
  if (__nopost || isMobile) throw new Error('postprocessing desativado (mobile/nopost)');
  const renderScene = new RenderPass(scene, camera);
  // passe de BLOOM (threshold 0: tudo que sobrar visível na camada de bloom brilha)
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.58, 0.6, 0.0);
  bloomComposer = new EffectComposer(renderer);
  bloomComposer.renderToScreen = false;
  bloomComposer.addPass(renderScene);
  bloomComposer.addPass(bloomPass);
  // passe FINAL (com MSAA): cena normal + soma do bloom
  const mixPass = new ShaderPass(new THREE.ShaderMaterial({
    uniforms: { baseTexture: { value: null }, bloomTexture: { value: bloomComposer.renderTarget2.texture } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform sampler2D baseTexture; uniform sampler2D bloomTexture; varying vec2 vUv; void main(){ gl_FragColor = texture2D(baseTexture, vUv) + texture2D(bloomTexture, vUv); }',
  }), 'baseTexture');
  mixPass.needsSwap = true;
  const aaRT = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, { type: THREE.HalfFloatType, samples: 4 });
  finalComposer = new EffectComposer(renderer, aaRT);
  finalComposer.addPass(renderScene);
  finalComposer.addPass(mixPass);
  const vig = new ShaderPass(VignetteShader); vig.uniforms.offset.value = 1.0; vig.uniforms.darkness.value = 1.0; finalComposer.addPass(vig);
  finalComposer.addPass(new OutputPass());
  const __pr = Math.min(window.devicePixelRatio, 2);
  [bloomComposer, finalComposer].forEach((c) => { c.setSize(window.innerWidth, window.innerHeight); c.setPixelRatio(__pr); });
  composer = finalComposer;
} catch (e) { console.warn('[EVO] Postprocessing off', e); composer = null; bloomComposer = null; finalComposer = null; }

/* ----------------------------------------------------------- 10. Loader */
const loaderEl = document.getElementById('loader');
const barFill = document.getElementById('loader-bar-fill');
const pctEl = document.getElementById('loader-pct');
manager.onProgress = (u, l, t) => { const p = Math.round(l / t * 100); barFill.style.width = p + '%'; pctEl.textContent = p; };
manager.onLoad = () => { barFill.style.width = '100%'; pctEl.textContent = '100'; setTimeout(revelar, 250); };
setTimeout(() => { if (document.body.classList.contains('is-loading')) revelar(); }, 7000);
let revealed = false;
function revelar() {
  if (revealed) return; revealed = true;
  loaderEl.classList.add('hidden'); document.body.classList.remove('is-loading');
  gsap.from(camera.position, { z: 30, duration: 2.6, ease: 'power3.out' });
  initReveals(); window.ScrollTrigger.refresh();
}

/* ----------------------------------------------------------- 11. Scroll (Lenis + ScrollTrigger) */
if (!prefersReduced) {
  const lenis = new window.Lenis({ duration: 1.2, smoothWheel: true, touchMultiplier: 1.4 });
  lenis.on('scroll', window.ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
  window.__lenis = lenis;
}

// waypoints da câmera (um por seção)
const stepsDesktop = [
  { pos: [0, 1.9, 15.9],  look: [0, 2.0, 5] },   // 0 fora: garagem (mais 20% perto)
  { pos: [0, 1.5, 6.5], look: [0, 1.4, -2] },    // 1 entrando (portão abre)
  { pos: [0, 1.3, -3],  look: [0, 1.0, -12] },   // 2 dentro, carros ao redor
  { pos: [0, 1.3, -16], look: [0, 1.0, -26] },   // 3 mais fundo, último par de carros
  { pos: [0, 1.6, -27], look: [0, 1.7, -33] },   // 4 encarando a parede de quadros (quadros mais altos)
];
// no celular a câmera desce o corredor devagar, passando por TODOS os carros
const stepsMobile = [
  { pos: [0, 2.0, 17.2],  look: [0, 2.0, 5] },   // 0 portão: garagem (mais 20% perto)
  { pos: [0, 1.5, 5.5], look: [0, 1.1, -2] },    // 1 entrando
  { pos: [0, 1.2, -4],  look: [0, 0.7, -12] },   // 2 corredor (carros dos 2 lados à frente)
  { pos: [0, 1.2, -15], look: [0, 0.7, -24] },   // 3 mais fundo (últimos carros)
  { pos: [0, 1.6, -23.5], look: [0, 1.2, -33] }, // 4 parede (afastado: aparece o carro no chão)
];
const steps = isMobile ? stepsMobile : stepsDesktop;
const target = { px: steps[0].pos[0], py: steps[0].pos[1], pz: steps[0].pos[2], lx: steps[0].look[0], ly: steps[0].look[1], lz: steps[0].look[2] };
const fx = { door: 0 };   // portão: 0..1
let frameIndex = 0;       // quadro atual da galeria (controlado pelas setas)

// preview: ?step=N
const __step = new URLSearchParams(location.search).get('step');
if (__step !== null && steps[+__step]) {
  const s = steps[+__step];
  target.px = s.pos[0]; target.py = s.pos[1]; target.pz = s.pos[2]; target.lx = s.look[0]; target.ly = s.look[1]; target.lz = s.look[2];
  if (+__step >= 1) fx.door = 1;
}

// setas da galeria de quadros (passam um a um, sem depender do scroll)
function goFrame(d) { frameIndex = Math.max(0, Math.min(WALL_COUNT - 1, frameIndex + d)); }
{
  const bind = (id, d) => {
    const el = document.getElementById(id);
    if (!el) return;
    const h = (e) => { e.preventDefault(); e.stopPropagation(); goFrame(d); };
    el.addEventListener('click', h);
    el.addEventListener('touchend', h, { passive: false }); // toque confiável no celular (preventDefault evita clique duplo)
  };
  bind('frame-prev', -1);
  bind('frame-next', 1);
  window.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') goFrame(-1); else if (e.key === 'ArrowRight') goFrame(1); });
}

if (!prefersReduced) {
  gsap.utils.toArray('.panel').forEach((panel, i) => {
    if (i === 0) return;
    const from = steps[i - 1], to = steps[i];
    window.ScrollTrigger.create({
      trigger: panel, start: 'top bottom', end: 'top center', scrub: 1,
      onUpdate: (self) => {
        const p = gsap.parseEase('power2.inOut')(self.progress);
        target.px = THREE.MathUtils.lerp(from.pos[0], to.pos[0], p);
        target.py = THREE.MathUtils.lerp(from.pos[1], to.pos[1], p);
        target.pz = THREE.MathUtils.lerp(from.pos[2], to.pos[2], p);
        target.lx = THREE.MathUtils.lerp(from.look[0], to.look[0], p);
        target.ly = THREE.MathUtils.lerp(from.look[1], to.look[1], p);
        target.lz = THREE.MathUtils.lerp(from.look[2], to.look[2], p);
      },
    });
  });
  // portão abre devagar: trecho de scroll longo (toda a 2ª seção)
  const enterPanel = document.querySelectorAll('.panel')[1];
  if (enterPanel) {
    window.ScrollTrigger.create({
      trigger: enterPanel, start: 'top bottom', end: 'top top', scrub: 2,
      onUpdate: (self) => { fx.door = self.progress; },
    });
  }
  // ao chegar na parede, mostra o título + as setas (sem mexer no scroll dos quadros)
  const hintEl = document.querySelector('.wall-hint');
  const navEl = document.getElementById('frame-nav');
  window.ScrollTrigger.create({
    trigger: '.panel--wall', start: 'top center', end: 'bottom center',
    onToggle: (self) => {
      if (hintEl) hintEl.classList.toggle('show', self.isActive);
      if (navEl) navEl.classList.toggle('show', self.isActive);
    },
  });
}

/* dots */
const dots = document.querySelectorAll('.progress-dots button');
const panelsForDots = document.querySelectorAll('.panel');
dots.forEach((d) => d.addEventListener('click', () => {
  const el = panelsForDots[+d.dataset.go];
  if (window.__lenis) window.__lenis.scrollTo(el); else el.scrollIntoView({ behavior: 'smooth' });
}));
panelsForDots.forEach((panel, i) => {
  window.ScrollTrigger.create({ trigger: panel, start: 'top center', end: 'bottom center',
    onToggle: (self) => { if (self.isActive) dots.forEach((d) => d.classList.toggle('active', +d.dataset.go === i)); } });
});

/* ----------------------------------------------------------- 12. Reveals */
function initReveals() {
  gsap.utils.toArray('.reveal').forEach((el) => {
    gsap.fromTo(el, { y: 40, opacity: 0 },
      { y: 0, opacity: 1, duration: 1, ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 88%', toggleActions: 'play none none reverse' } });
  });
  gsap.to('.panel--hero .reveal', { y: 0, opacity: 1, stagger: 0.12, duration: 1, ease: 'power3.out' });
}

/* ----------------------------------------------------------- 13. Parallax de mouse */
const mouse = { x: 0, y: 0 };
if (!prefersReduced && !isMobile) {
  window.addEventListener('pointermove', (e) => { mouse.x = (e.clientX / window.innerWidth - 0.5) * 2; mouse.y = (e.clientY / window.innerHeight - 0.5) * 2; });
}

/* ----------------------------------------------------------- 13b. Clique nos quadros -> card de produto */
const raycaster = new THREE.Raycaster();
const pointerV = new THREE.Vector2();
let downX = 0, downY = 0;
renderer.domElement.addEventListener('pointerdown', (e) => { downX = e.clientX; downY = e.clientY; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (Math.abs(e.clientX - downX) > 6 || Math.abs(e.clientY - downY) > 6) return; // ignora arrasto
  pointerV.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointerV.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointerV, camera);
  const hits = raycaster.intersectObjects(clickable, true);
  if (hits.length) {
    let o = hits[0].object;
    while (o && !o.userData.product) o = o.parent; // sobe até achar o produto
    if (o) openCard(o.userData.product);
  }
});

const cardEl = document.getElementById('product-card');
function openCard(p) {
  if (!p || !cardEl) return;
  cardEl.querySelector('#pc-img').src = 'assets/products/' + p.img;
  cardEl.querySelector('#pc-title').textContent = p.title;
  cardEl.querySelector('#pc-desc').textContent = p.desc;
  cardEl.querySelector('#pc-price').textContent = p.price || '';
  const btn = cardEl.querySelector('.pc-body .btn'); if (btn) btn.textContent = p.cta || 'Quero esta peça';
  cardEl.classList.add('open');
}
function closeCard() { if (cardEl) cardEl.classList.remove('open'); }
if (cardEl) {
  cardEl.querySelector('.pc-close').addEventListener('click', closeCard);
  cardEl.querySelector('.pc-backdrop').addEventListener('click', closeCard);
}

/* ----------------------------------------------------------- 14. Render loop */
const lookAt = new THREE.Vector3(steps[0].look[0], steps[0].look[1], steps[0].look[2]);
const clock = new THREE.Clock();
let doorY = DOOR_Y_CLOSED, wallX = WALL_START_X;
function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();

  camera.position.x += (target.px + mouse.x * 0.35 - camera.position.x) * 0.06;
  camera.position.y += (target.py - mouse.y * 0.2 - camera.position.y) * 0.06;
  camera.position.z += (target.pz - camera.position.z) * 0.06;
  lookAt.x += (target.lx - lookAt.x) * 0.06;
  lookAt.y += (target.ly - lookAt.y) * 0.06;
  lookAt.z += (target.lz - lookAt.z) * 0.06;
  camera.lookAt(lookAt);

  // portão sobe ao abrir
  const doorTargetY = DOOR_Y_CLOSED + fx.door * DOOR_OPEN_RISE;
  doorY += (doorTargetY - doorY) * 0.05;
  if (doorGroup.userData.panel) doorGroup.userData.panel.position.y = doorY;

  // parede de quadros: setas passam um a um; o quadro atual fica centralizado
  const wallTargetX = -frameIndex * FRAME_SPACING;
  wallX += (wallTargetX - wallX) * 0.12;   // resposta rápida ao clicar na seta
  endWall.position.x = wallX;
  const visHalf = isMobile ? 4.0 : 6.8;    // celular mostra 1 quadro grande; PC mostra o atual + vizinhos
  for (let i = 0; i < endWall.children.length; i++) {
    const ch = endWall.children[i];
    ch.visible = Math.abs(wallX + ch.position.x) <= visHalf;
  }

  // carros + plataformas giram juntos (sensação de plataforma girando)
  if (!prefersReduced) {
    cars.forEach((c) => { c.car.rotation.y = t * c.spin; });
    spinPlats.forEach((p) => { p.plat.rotation.y = t * p.spin; });
  }

  // render: bloom seletivo (escurece o que não brilha -> bloom -> restaura -> cena final + bloom)
  if (bloomComposer && finalComposer) {
    scene.traverse(darkenNonBloomed);
    bloomComposer.render();
    scene.traverse(restoreMaterial);
    finalComposer.render();
  } else if (composer) { composer.render(); } else { renderer.render(scene, camera); }
}
animate();

/* ----------------------------------------------------------- 15. Resize */
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
  if (bloomComposer) bloomComposer.setSize(window.innerWidth, window.innerHeight);
  if (finalComposer) finalComposer.setSize(window.innerWidth, window.innerHeight);
  else if (composer) composer.setSize(window.innerWidth, window.innerHeight);
  window.ScrollTrigger.refresh();
});

// Chorus act B — 「迷宮入りのコード、終わらない夜」: a flight through a maze whose walls
// are blocks of code. The camera turns a corner on every word onset; each word
// floats ahead in the corridor (a gate we fly through); 夜 waits at the end of the
// last, accelerating straight.
import * as THREE from 'three';
import { SpeedLines } from '../engine/fx';
import { FSPass, H, W } from '../engine/gl';
import { LEAD } from '../engine/lyrics';
import { CODE, CODE_POOL, drawCodeLine } from '../engine/motifs';
import { col, css, lin } from '../engine/palette';
import type { PostParams } from '../engine/post';
import type { Frame } from '../engine/scene';
import { Glyphs3D, tint } from '../engine/text3d';
import { clamp, ease, hash, lerp, mulberry32 } from '../engine/util';
import { Act } from './chorus-common';

const CELL = 4.4; // corridor width = grid cell
const WALL_H = 9;
const TAU_TURN = 0.17; // half-duration of a corner (s)

interface Seg { c0: THREE.Vector3; dir: THREE.Vector3; t0: number; t1: number; v: number; acc: number; }

export class MazeAct extends Act {
  scene = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(64, W / H, 0.05, 400);
  segs: Seg[] = [];
  walls!: THREE.InstancedMesh;
  words: { g: Glyphs3D; wi: number; at: number; big: boolean }[] = [];
  sky = new FSPass(/* glsl */ `
    uniform float t; uniform float dawn; uniform vec3 camDir;
    void main() {
      vec2 p = vUv;
      vec3 night = mix(vec3(0.004, 0.005, 0.012), vec3(0.01, 0.02, 0.07), p.y);
      vec3 dw = mix(vec3(0.05, 0.03, 0.16), vec3(0.06, 0.16, 0.55), smoothstep(0.2, 1.0, p.y));
      vec3 c = mix(night, dw, dawn);
      vec2 g = floor(p * vec2(420.0, 236.0));
      float s = step(0.9965, hash12(g)) * (0.5 + 0.5 * sin(t * 3.0 + hash12(g + 3.1) * 40.0));
      c += vec3(0.6, 0.7, 1.0) * s * smoothstep(0.35, 0.9, p.y) * (1.0 - dawn * 0.7);
      gl_FragColor = vec4(c, 1.0);
    }`, { t: { value: 0 }, dawn: { value: 0 }, camDir: { value: new THREE.Vector3() } });
  speed = new SpeedLines();
  private wallMat!: THREE.ShaderMaterial;
  private tEnd = 0;
  private yoru = 0;

  async init() {
    const { line, n, t0, t1 } = this.a;
    this.tEnd = t1;
    // ---- path: a right/left/right zig-zag, corners on the word onsets
    const tc = line.words.slice(1).map((w) => w.start); // コード、 終わらない 夜
    this.yoru = tc[2]!;
    const dirs = [new THREE.Vector3(0, 0, -1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(1, 0, 0)];
    const times = [t0 - 0.6, ...tc, t1 + 0.6];
    const open = new Set<string>();
    const key = (x: number, z: number) => `${x},${z}`;
    let cell = new THREE.Vector3(0, 0, 0); // grid coords
    for (let k = 0; k < 4; k++) {
      const dur = times[k + 1]! - times[k]!;
      const last = k === 3;
      // last segment accelerates: cover ~3x the distance
      const nCells = last ? 12 : Math.max(3, Math.round((11 * dur) / CELL));
      const c0 = cell.clone().multiplyScalar(CELL);
      const len = nCells * CELL;
      const v = last ? len / dur / 2.2 : len / dur;
      const acc = last ? (2 * (len - v * dur)) / (dur * dur) : 0;
      this.segs.push({ c0, dir: dirs[k]!, t0: times[k]!, t1: times[k + 1]!, v, acc });
      for (let i = 0; i <= nCells; i++) open.add(key(cell.x + dirs[k]!.x * i, cell.z + dirs[k]!.z * i));
      cell = cell.clone().add(dirs[k]!.clone().multiplyScalar(nCells));
    }
    // side branches (dead ends) so it reads as a maze
    const rnd = mulberry32(n * 101 + 7);
    const pathCells = [...open].map((s) => s.split(',').map(Number) as [number, number]);
    for (let b = 0; b < 26; b++) {
      const [x0, z0] = pathCells[Math.floor(rnd() * pathCells.length)]!;
      const d = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(rnd() * 4)]!;
      const L = 1 + Math.floor(rnd() * 3);
      for (let i = 1; i <= L; i++) {
        const x = x0 + d[0]! * i, z = z0 + d[1]! * i;
        // keep branches from touching the main corridor elsewhere
        if (open.has(key(x, z))) break;
        open.add(key(x, z));
      }
    }
    // walls: every non-open cell within 2 of an open cell
    const wallCells: [number, number][] = [];
    const seen = new Set<string>();
    for (const s of open) {
      const [x, z] = s.split(',').map(Number) as [number, number];
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
        const k2 = key(x + dx, z + dz);
        if (open.has(k2) || seen.has(k2)) continue;
        seen.add(k2);
        wallCells.push([x + dx, z + dz]);
      }
    }
    // code texture atlas: 4x4 panels of syntax-coloured code
    const atlas = document.createElement('canvas');
    atlas.width = atlas.height = 2048;
    const g = atlas.getContext('2d')!;
    g.fillStyle = '#05070f';
    g.fillRect(0, 0, 2048, 2048);
    const src = [...CODE, ...CODE_POOL];
    for (let p = 0; p < 16; p++) {
      const ox = (p % 4) * 512, oy = Math.floor(p / 4) * 512;
      g.fillStyle = p % 3 === 0 ? '#0a1024' : '#070a16';
      g.fillRect(ox + 6, oy + 6, 500, 500);
      for (let r = 0; r < 22; r++) {
        const s = src[Math.floor(hash(p, r) * src.length)]!;
        const indent = Math.floor(hash(p, r, 2) * 4) * 2;
        drawCodeLine(g, ' '.repeat(indent) + s, ox + 18, oy + 26 + r * 22.5, 17, { alpha: 0.95 });
      }
      g.strokeStyle = css('cyan', 0.45);
      g.lineWidth = 3;
      g.strokeRect(ox + 4, oy + 4, 504, 504);
    }
    const tex = new THREE.CanvasTexture(atlas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    this.wallMat = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex }, tint: { value: new THREE.Vector3(...lin(n === 2 ? 'violet' : 'blue')) }, glow: { value: 1 }, camPos: { value: new THREE.Vector3() }, pulse: { value: 0 }, fogC: { value: new THREE.Vector3() } },
      vertexShader: /* glsl */ `
        attribute float aPanel; varying vec2 vUv; varying float vPanel; varying vec3 vW; varying vec3 vN;
        void main() {
          vUv = uv; vPanel = aPanel;
          vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0); vW = w.xyz;
          vN = normalize(mat3(modelMatrix * instanceMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map; uniform vec3 tint; uniform float glow; uniform vec3 camPos; uniform float pulse; uniform vec3 fogC;
        varying vec2 vUv; varying float vPanel; varying vec3 vW; varying vec3 vN;
        void main() {
          float px = mod(vPanel, 4.0), py = floor(vPanel / 4.0);
          vec2 uv = (vec2(px, 3.0 - py) + vec2(vUv.x, vUv.y)) / 4.0;
          vec3 c = texture2D(map, uv).rgb;
          float side = 1.0 - abs(vN.y);
          float d = length(vW - camPos);
          float edge = smoothstep(0.47, 0.5, max(abs(vUv.x - 0.5), abs(vUv.y - 0.5)));
          vec3 col = c * (0.75 + 2.0 * glow) * side + tint * edge * (1.5 + 4.0 * pulse) * side;
          col += tint * 0.05;
          float h = clamp(vW.y / 9.0, 0.0, 1.0);
          col *= mix(0.55, 1.15, h);
          float fog = 1.0 - exp(-d * 0.028);
          gl_FragColor = vec4(mix(col, fogC, fog), 1.0);
        }`,
    });
    const box = new THREE.BoxGeometry(CELL, WALL_H, CELL);
    this.walls = new THREE.InstancedMesh(box, this.wallMat, wallCells.length);
    const panel = new Float32Array(wallCells.length);
    const m = new THREE.Matrix4();
    wallCells.forEach(([x, z], i) => {
      const hh = WALL_H * (0.75 + 0.5 * hash(x, z, 5));
      m.makeScale(1, hh / WALL_H, 1).setPosition(x * CELL, hh / 2, z * CELL);
      this.walls.setMatrixAt(i, m);
      panel[i] = Math.floor(hash(x, z) * 16);
    });
    box.setAttribute('aPanel', new THREE.InstancedBufferAttribute(panel, 1));
    this.scene.add(this.walls);
    // floor grid
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.ShaderMaterial({
      uniforms: { tint: { value: new THREE.Vector3(...lin(n === 2 ? 'violet' : 'cyan')) }, camPos: { value: new THREE.Vector3() } },
      vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `
        uniform vec3 tint; uniform vec3 camPos; varying vec3 vW;
        void main() {
          vec2 g = abs(fract(vW.xz / 1.1) - 0.5); float l = 1.0 - smoothstep(0.0, 0.04, min(g.x, g.y));
          float d = length(vW - camPos); float f = exp(-d * 0.06);
          gl_FragColor = vec4(tint * l * 0.6 * f + vec3(0.002, 0.003, 0.008), 1.0);
        }`,
    }));
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);
    // words: gates in the corridor
    line.words.forEach((w, wi) => {
      const big = wi === line.words.length - 1;
      const g3 = new Glyphs3D(w.chars, { font: 'dela', size: big ? 7.5 : 1.35, color: col('bone'), outlineWidth: '3%', outlineBlur: '14%', outlineColor: n === 2 ? 0x8b5cff : 0x62e6ff, outlineOpacity: 0.0 });
      const at = big ? t1 + 0.32 : w.start + (wi === 0 ? 1.15 : 0.95);
      this.scene.add(g3.group);
      this.words.push({ g: g3, wi, at, big });
    });
  }

  /** camera path position + tangent at time t */
  private path(t: number, out = new THREE.Vector3(), tan = new THREE.Vector3()) {
    const S = this.segs;
    let k = S.findIndex((s) => t < s.t1);
    if (k < 0) k = S.length - 1;
    const s = S[k]!;
    const local = (seg: Seg, tt: number) => {
      const d = tt - seg.t0;
      return seg.c0.clone().addScaledVector(seg.dir, seg.v * d + 0.5 * seg.acc * d * d);
    };
    const vel = (seg: Seg, tt: number) => seg.dir.clone().multiplyScalar(seg.v + seg.acc * (tt - seg.t0));
    // near the start of segment k (corner k), blend with the previous segment (quadratic Bézier)
    if (k > 0 && t - s.t0 < TAU_TURN) {
      const p = S[k - 1]!;
      const A = local(p, s.t0 - TAU_TURN), B = s.c0.clone(), C = local(s, s.t0 + TAU_TURN);
      const u = (t - (s.t0 - TAU_TURN)) / (2 * TAU_TURN);
      out.copy(A).multiplyScalar((1 - u) * (1 - u)).addScaledVector(B, 2 * u * (1 - u)).addScaledVector(C, u * u);
      tan.copy(B).sub(A).multiplyScalar(2 * (1 - u)).addScaledVector(C.clone().sub(B), 2 * u).normalize();
      return { pos: out, tan, turn: Math.sin(u * Math.PI) * (k % 2 ? 1 : -1) };
    }
    if (k + 1 < S.length && s.t1 - t < TAU_TURN) {
      const nx = S[k + 1]!;
      const A = local(s, s.t1 - TAU_TURN), B = nx.c0.clone(), C = local(nx, s.t1 + TAU_TURN);
      const u = (t - (s.t1 - TAU_TURN)) / (2 * TAU_TURN);
      out.copy(A).multiplyScalar((1 - u) * (1 - u)).addScaledVector(B, 2 * u * (1 - u)).addScaledVector(C, u * u);
      tan.copy(B).sub(A).multiplyScalar(2 * (1 - u)).addScaledVector(C.clone().sub(B), 2 * u).normalize();
      return { pos: out, tan, turn: Math.sin(u * Math.PI) * ((k + 1) % 2 ? 1 : -1) };
    }
    out.copy(local(s, t));
    tan.copy(vel(s, t)).normalize();
    return { pos: out, tan, turn: 0 };
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostParams {
    const { ctx, line, n } = this.a;
    const r = ctx.renderer;
    const t = f.t, T = t + LEAD;
    const { pos, tan, turn } = this.path(t);
    const eye = pos.clone().add(new THREE.Vector3(0, 2.1 + 0.08 * Math.sin(t * 9) * f.a.kick, 0));
    const ahead = this.path(t + 0.18).pos.clone().add(new THREE.Vector3(0, 2.3, 0));
    this.cam.position.copy(eye);
    const roll = turn * 0.22;
    const right = new THREE.Vector3().crossVectors(tan, new THREE.Vector3(0, 1, 0)).normalize();
    this.cam.up.set(0, 1, 0).applyAxisAngle(tan, -roll).add(right.multiplyScalar(0));
    this.cam.lookAt(ahead);
    const fast = clamp((t - this.yoru) / Math.max(0.1, this.tEnd - this.yoru));
    this.cam.fov = 64 + 26 * ease.inQuad(fast);
    this.cam.updateProjectionMatrix();
    // walls
    const u = this.wallMat.uniforms;
    (u.camPos!.value as THREE.Vector3).copy(eye);
    u.glow!.value = 0.12 + 0.7 * f.a.kick + 0.3 * f.a.snare;
    u.pulse!.value = f.a.kick;
    const fogC = n === 2 ? new THREE.Vector3(0.05, 0.06, 0.25) : new THREE.Vector3(0.004, 0.006, 0.02);
    (u.fogC!.value as THREE.Vector3).copy(fogC);
    // words: each one leads the camera through the maze (it flies ahead and takes the
    // corners first); 夜 waits as a giant gate at the end of the last straight
    const ws = line.words.map((w) => w.start);
    for (const W3 of this.words) {
      const w = line.words[W3.wi]!;
      const next = W3.wi + 1 < ws.length ? ws[W3.wi + 1]! : this.tEnd;
      let anchor: THREE.Vector3, face: THREE.Vector3, fade = 1, grow = 1;
      if (W3.big) {
        const gp = this.path(W3.at);
        anchor = gp.pos.clone().add(new THREE.Vector3(0, 4.2, 0));
        face = gp.tan.clone();
        W3.g.group.visible = T > w.start - 0.6;
      } else {
        const u = clamp((T - w.start) / Math.max(0.2, next - w.start));
        const lead = lerp(1.05, 0.6, ease.inOutQuad(u));
        const out2 = clamp((T - next) / 0.16);
        const gp = this.path(t + lead + 0.6 * out2);
        const onPath = gp.pos.clone().add(new THREE.Vector3(0, 2.25 + 0.15 * Math.sin(t * 4 + W3.wi), 0));
        const camDir = ahead.clone().sub(eye).normalize();
        const centred = eye.clone().addScaledVector(camDir, lerp(8.5, 5.2, ease.inOutQuad(u)) + 4 * out2).add(new THREE.Vector3(0, 0.1, 0));
        anchor = onPath.lerp(centred, 0.7);
        face = anchor.clone().sub(eye).normalize();
        fade = 1 - out2;
        grow = 1 + 0.6 * out2 + 0.25 * (1 - ease.outBack(clamp((T - w.start + 0.3) / 0.3)));
        W3.g.group.visible = T > w.start - 0.3 && out2 < 1;
      }
      W3.g.group.position.copy(anchor);
      W3.g.group.lookAt(anchor.clone().sub(face));
      W3.g.group.scale.setScalar(grow);
      for (const it of W3.g.items) {
        const ch = it.ch!;
        const d = T - ch.start;
        const sung = d >= 0;
        const k = sung ? ease.outBack(clamp(d / 0.16)) : 0;
        it.mesh.position.set(it.x, -it.y + (sung ? 0 : -0.12), sung ? 0 : -0.3);
        it.mesh.scale.setScalar(sung ? lerp(1.6, 1, k) : 0.92);
        const hot = sung ? 1.4 + 4 * Math.exp(-d / 0.2) : 0.4;
        tint(it.mesh, sung ? col('bone', hot) : col('steel', 1.0), (sung ? 1 : 0.6) * fade);
        it.mesh.outlineOpacity = sung ? 0.55 * fade : 0;
      }
    }
    // background sky, then the maze
    this.sky.u.t!.value = t;
    this.sky.u.dawn!.value = n === 2 ? 1 : 0;
    this.sky.render(r, out);
    this.scene.fog = null;
    this.draw(this.scene, this.cam, out);
    const sp = 0.08 + 1.2 * ease.inQuad(fast);
    this.speed.render(r, out, { frame: f.frame, intensity: sp * (0.6 + 0.4 * f.a.kick), color: n === 2 ? [0.9, 0.7, 2] : [0.6, 1.4, 2], inner: 0.3 - 0.12 * fast, density: 260 });
    const turnHit = Math.abs(turn);
    return {
      bloom: 0.9, bloomThreshold: 0.8, ca: 1.5 + 4 * turnHit + 6 * fast, vignette: 0.5,
      zoomBlur: 0.15 * turnHit + 0.9 * ease.inCubic(fast), shake: [Math.sin(t * 83) * 6 * f.a.kick, Math.cos(t * 71) * 4 * f.a.kick],
      flash: fast > 0.93 ? Math.min(0.6, (fast - 0.93) * 7) : 0, flashColor: n === 2 ? [0.9, 0.85, 1] : [0.85, 0.95, 1],
    };
  }
}

// The instrumental drop after chorus 2 (bars 41–44, full band, no vocals): brute force.
//   A  compile tunnel   — hyperspeed through walls of code, the build bar racing
//   B  log storm        — terminal flood, a Japanese word slammed on every beat
//   C  boss rush        — the cursor strikes the bug on every kick, HP drains
//   D  stuck at 1%      — nothing works, TS1005 looms, and everything freezes
// The bug can't be killed by force: only the one-character fix in `typo` does it.
import * as THREE from 'three';
import { Shockwave, SpeedLines } from '../engine/fx';
import { font } from '../engine/fonts';
import { FSPass, H, Layer2D, W, screenCamera } from '../engine/gl';
import { BUG_ERROR, CODE, CODE_POOL, drawCodeLine, drawProgress, storyClock } from '../engine/motifs';
import { col, css, lin } from '../engine/palette';
import type { PostParams } from '../engine/post';
import { Scene, type Frame } from '../engine/scene';
import { text2D } from '../engine/type2d';
import { clamp, ease, hash, lerp } from '../engine/util';
import { BUG_C, BUG_SCALE, makeBugSwarm } from './bug-swarm';

const STORM = ['エラー', '失敗', 'もう一回', 'なんで？！'];
const RUSH = ['直れ', '直れ！！'];
const LOGS: [string, string][] = [
  ['ERROR', "TS1005: ',' expected."], ['WARN', 'unused variable `hope`'], ['INFO', 'retrying build (attempt 47)'],
  ['ERROR', 'build failed with 1 error'], ['INFO', 'compiling night.ts…'], ['ERROR', 'SyntaxError: Unexpected token ;'],
  ['WARN', 'coffee is cold'], ['ERROR', 'night.ts(3,10)'], ['INFO', 'cache cleared'], ['ERROR', 'Maximum call stack size exceeded'],
  ['WARN', 'patience: 0.02'], ['INFO', 'npm install (again)'], ['ERROR', 'process exited with code 1'], ['INFO', '再ビルド中…'],
];

export default class Drop extends Scene {
  // ---- A: tunnel
  tun = new THREE.Scene();
  tunCam = new THREE.PerspectiveCamera(70, W / H, 0.1, 400);
  tunMat!: THREE.ShaderMaterial;
  // ---- C/D: bug
  bugScene = new THREE.Scene();
  bugCam = screenCamera();
  bugMat!: THREE.ShaderMaterial;
  bg = new FSPass(/* glsl */ `
    uniform float kick; uniform float red; uniform float frame;
    void main() {
      vec2 p = (vUv - 0.5) * uRes;
      float r = length(p - vec2(0.0, 40.0)) / 900.0;
      vec3 c = mix(vec3(0.003, 0.004, 0.012), vec3(0.016, 0.002, 0.004), red);
      c += mix(vec3(0.0, 0.05, 0.2), vec3(0.25, 0.01, 0.03), red) * exp(-r * 3.0) * (0.5 + 0.7 * kick);
      float band = floor(vUv.y * 80.0); c += vec3(0.2, 0.01, 0.03) * red * step(0.985, hash12(vec2(band, floor(frame / 3.0))));
      gl_FragColor = vec4(c, 1.0);
    }`, { kick: { value: 0 }, red: { value: 0 }, frame: { value: 0 } });
  hud = new Layer2D();
  speed = new SpeedLines();
  shock = new Shockwave();
  b: number[] = []; // section boundaries
  strikes: number[] = [];

  async init() {
    const A = this.ctx.audio;
    const k0 = Math.round(A.bar(this.ctx.start));
    this.b = [this.ctx.start, A.barTime(k0 + 1), A.barTime(k0 + 2), A.barTime(k0 + 3), this.ctx.end];
    // strikes: strong kicks in section C (+ two in D that miss)
    this.strikes = A.onsets.kick.filter(([t, s]) => t >= this.b[2]! - 0.02 && t < this.b[4]! - 0.3 && s > 0.25).map(([t]) => t);
    // tunnel walls: a tall code texture scrolled in the shader
    const cv = document.createElement('canvas');
    cv.width = 1024; cv.height = 2048;
    const g = cv.getContext('2d')!;
    g.fillStyle = '#04060d'; g.fillRect(0, 0, 1024, 2048);
    const src = [...CODE, ...CODE_POOL];
    for (let r = 0; r < 70; r++) {
      const s = src[Math.floor(hash(r, 3) * src.length)]!;
      drawCodeLine(g, ' '.repeat(Math.floor(hash(r, 4) * 6)) + s, 30, 20 + r * 29, 22);
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 8;
    this.tunMat = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex }, scroll: { value: 0 }, glow: { value: 1 }, tint: { value: new THREE.Vector3(...lin('cyan')) }, ring: { value: 0 } },
      vertexShader: `varying vec2 vUv; varying float vZ; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0); vZ = -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map; uniform float scroll, glow, ring; uniform vec3 tint; varying vec2 vUv; varying float vZ;
        void main() {
          vec2 uv = vec2(vUv.x, vUv.y * 24.0 + scroll);
          vec3 c = texture2D(map, uv).rgb * (0.7 + 2.2 * glow);
          float rr = fract(vUv.y * 40.0 + scroll * 1.6667);
          c += tint * smoothstep(0.03, 0.0, abs(rr - 0.5)) * (1.0 + 4.0 * ring);
          c *= exp(-vZ * 0.022);
          gl_FragColor = vec4(c, 1.0);
        }`,
      side: THREE.BackSide,
    });
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 240, 4, 1, true), this.tunMat);
    tube.rotation.x = Math.PI / 2;
    tube.rotation.y = Math.PI / 4;
    tube.position.z = -110;
    this.tun.add(tube);
    // bug
    const sw = makeBugSwarm({ seed: 777, count: 2600, wound: 1 });
    this.bugMat = sw.mat;
    this.bugScene.add(sw.mesh);
  }

  private section(t: number) {
    let s = 0;
    while (s < 3 && t >= this.b[s + 1]!) s++;
    return s;
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostParams {
    const { renderer: r, comp, audio: A } = this.ctx;
    // the last 0.26 s freeze on one frame (the music doesn't stop; the picture does)
    const freezeAt = this.ctx.end - 0.26;
    const frozen = f.t >= freezeAt;
    const t = frozen ? freezeAt : f.t;
    const sec = this.section(t);
    const bs = this.b[sec]!, lt = t - bs;
    const kick = frozen ? 0 : f.a.kick, snare = frozen ? 0 : f.a.snare;
    const beatIdx = Math.floor(A.beat(t) + 1e-3);
    const bt = A.beatTime(beatIdx), sinceBeat = t - bt;
    const hc = this.hud.clear();
    let post: PostParams = { bloom: 0.9, ca: 2 + 4 * kick, vignette: 0.5, grain: 0.05 };
    // global build progress (steps on every beat, stuck at 99%)
    const p0 = A.beat(this.b[0]!), p1 = A.beat(this.b[3]!);
    const prog = Math.min(0.99, 0.12 + 0.87 * clamp((Math.floor(A.beat(t) * 2) / 2 - p0) / (p1 - p0)));
    if (sec === 0) {
      // ---------------- A: compile tunnel
      const travel = 3.2 * lt + 1.2 * lt * lt;
      this.tunMat.uniforms.scroll!.value = travel;
      this.tunMat.uniforms.glow!.value = 0.25 + 0.9 * kick + 0.4 * snare;
      this.tunMat.uniforms.ring!.value = kick;
      const rolls = Math.floor((t - bs) / (A.period * 2));
      const rollK = ease.outExpo(clamp(((t - bs) - rolls * A.period * 2) / 0.28));
      this.tunCam.position.set(0, 0, 0);
      this.tunCam.up.set(0, 1, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), (rolls + rollK) * Math.PI / 2 * (hash(rolls, 5) > 0.5 ? 1 : -1));
      this.tunCam.lookAt(0, 0, -10);
      this.tunCam.fov = 72 + 10 * kick;
      this.tunCam.updateProjectionMatrix();
      r.setRenderTarget(out); r.autoClear = false; r.clearDepth();
      r.render(this.tun, this.tunCam);
      this.speed.render(r, out, { frame: f.frame, intensity: 0.15 + 0.5 * kick, color: [0.6, 1.4, 2.2], inner: 0.32, density: 180 });
      // HUD: big build bar
      text2D(hc, 'コンパイル中', W / 2, 470, 'dot', 76, css('ice'), { align: 'center', glow: css('cyan', 0.8), glowBlur: 24 });
      drawProgress(hc, W / 2 - 520, 520, 1040, 30, prog, css('cyan'));
      text2D(hc, `${Math.floor(prog * 100)}%`, W / 2 + 560, 548, 'dela', 44, css('bone'));
      text2D(hc, `night.ts — attempt ${47 + Math.floor((t - this.b[0]!) * 3)}`, W / 2, 610, 'dot', 26, css('mist'), { align: 'center' });
      // start slam
      const e = t - bs;
      if (e < 0.6) {
        const k = clamp(e / 0.12);
        hc.save(); hc.translate(W / 2, 300); hc.scale(1 + 1.5 * (1 - ease.outCubic(k)), 1 + 1.5 * (1 - ease.outCubic(k)));
        text2D(hc, 'ビルド', 0, 70, 'dela', 220, css('bone', 1 - clamp((e - 0.4) / 0.2)), { align: 'center', glow: css('cyan', 0.9), glowBlur: 40 });
        hc.restore();
      }
      post = { ...post, zoomBlur: 0.25 + 0.4 * kick, flash: e < 0.06 ? 0.35 * (1 - e / 0.06) : 0, flashColor: [0.8, 0.95, 1] };
    } else if (sec === 1) {
      // ---------------- B: log storm
      this.bg.u.kick!.value = kick * 0.5; this.bg.u.red!.value = 0.4; this.bg.u.frame!.value = f.frame;
      this.bg.render(r, out);
      const scrollL = (t - bs) * 34;
      for (let i = -1; i < 34; i++) {
        const li = Math.floor(scrollL) + i;
        const [lvl, msg] = LOGS[Math.floor(hash(li, 11) * LOGS.length)]!;
        const y = 40 + (i - (scrollL % 1)) * 32;
        const c = lvl === 'ERROR' ? css('red') : lvl === 'WARN' ? css('amber') : css('cyan', 0.8);
        hc.font = font('dot', 24);
        hc.fillStyle = css('steel', 0.8); hc.fillText(`[${(108 + li * 0.03).toFixed(2)}]`, 90, y);
        hc.fillStyle = c; hc.fillText(lvl.padEnd(6), 260, y);
        hc.fillStyle = css('bone', 0.75); hc.fillText(msg, 380, y);
      }
      // a word per beat
      const wi = Math.max(0, Math.min(STORM.length - 1, Math.floor((t - bs) / A.period)));
      const e = t - (bs + wi * A.period);
      const word = STORM[wi]!;
      const k = clamp(e / 0.1);
      const px = word.length > 3 ? 230 : 300;
      const pos = [[W / 2, 600], [W / 2 - 260, 560], [W / 2 + 120, 640], [W / 2, 590]][wi]!;
      hc.save();
      hc.translate(pos[0]!, pos[1]!);
      hc.rotate((hash(wi, 2) - 0.5) * 0.14);
      const sc = 1 + 1.3 * (1 - ease.outCubic(k));
      hc.scale(sc, sc);
      hc.fillStyle = css('ink', 0.8);
      hc.font = font('dela', px);
      hc.textAlign = 'center';
      const tw = hc.measureText(word).width;
      hc.fillRect(-tw / 2 - 40, -px * 0.62, tw + 80, px * 1.12);
      hc.lineWidth = 6; hc.strokeStyle = css('red'); hc.strokeRect(-tw / 2 - 40, -px * 0.62, tw + 80, px * 1.12);
      text2D(hc, word, 0, px * 0.34, 'dela', px, css(wi === 3 ? 'red' : 'bone'), { align: 'center', glow: css('red', 0.8), glowBlur: 30 });
      hc.restore();
      post = { ...post, glitch: 0.2 * snare + (e < 0.07 ? 0.6 : 0), rgbSplit: e < 0.1 ? 10 : 2 * snare, shake: [Math.sin(t * 90) * 16 * Math.exp(-e / 0.08), Math.cos(t * 80) * 12 * Math.exp(-e / 0.08)], ca: 3 + 6 * kick, flash: e < 0.05 ? 0.04 : 0, flashColor: [1, 0.6, 0.6] };
    } else {
      // ---------------- C / D: the bug
      this.bg.u.kick!.value = kick; this.bg.u.red!.value = 1; this.bg.u.frame!.value = f.frame;
      this.bg.render(r, out);
      const st = this.strikes.filter((x) => x <= t);
      const last = st.length ? st[st.length - 1]! : -10;
      const e = t - last;
      const inD = sec === 3;
      const hp = inD ? 0.01 : Math.max(0.03, 0.22 - 0.028 * st.length);
      const u = this.bugMat.uniforms;
      u.t!.value = t; u.kick!.value = kick + (e < 0.3 ? Math.exp(-e / 0.1) : 0); u.snare!.value = Math.max(snare, inD ? 0.6 : 0);
      u.frame!.value = frozen ? Math.round(freezeAt * 60) : f.frame;
      u.hitE!.value = !inD && e < 1.2 ? e : -1;
      const hx = 0.35 * Math.sin(st.length * 2.3), hy = 0.3 * Math.cos(st.length * 1.7);
      (u.hitP!.value as THREE.Vector2).set(hx, hy);
      u.scale!.value = BUG_SCALE * (inD ? 1.25 + 0.05 * Math.sin(t * 20) : 1.12);
      (u.center!.value as THREE.Vector2).set(inD ? 0 : -BUG_C.x * 0.0 + 120, inD ? -20 : 20);
      r.setRenderTarget(out); r.autoClear = false; r.clearDepth();
      r.render(this.bugScene, this.bugCam);
      const cx = W / 2 + (inD ? 0 : 120) + hx * BUG_SCALE * 1.12, cy = H / 2 - (inD ? -20 : 20) - hy * BUG_SCALE * 1.12;
      if (!inD) this.shock.render(r, out, e, { center: [cx / W, 1 - cy / H], color: [2.6, 2.4, 2.6], speed: 2.0, width: 0.02 });
      this.speed.render(r, out, { frame: f.frame, intensity: inD ? 0.25 : 0.2 + 0.6 * Math.exp(-e / 0.3), center: [cx / W, 1 - cy / H], color: [1.6, 0.3, 0.45], inner: 0.28, density: 160 });
      // cursor streak into the hit point
      if (e >= 0 && e < 0.1) {
        const ang = hash(st.length, 9) * Math.PI * 2;
        const L = 1400 * (1 - e / 0.1);
        hc.save(); hc.translate(cx, cy); hc.rotate(ang);
        const grd = hc.createLinearGradient(0, 0, L, 0);
        grd.addColorStop(0, css('ice', 1)); grd.addColorStop(1, css('cyan', 0));
        hc.fillStyle = grd; hc.fillRect(0, -9, L, 18);
        hc.restore();
      }
      // HP bar
      const bw = inD ? 1100 : 800, bx = W / 2 - bw / 2, by = inD ? 140 : 90;
      text2D(hc, 'BUG', bx, by - 16, 'dela', inD ? 48 : 34, css('red'));
      hc.fillStyle = css('ink', 0.85); hc.fillRect(bx - 4, by - 4, bw + 8, 34);
      hc.fillStyle = css('red'); hc.fillRect(bx, by, Math.max(4, bw * hp), 26);
      text2D(hc, `${Math.round(hp * 100)}%`, bx + bw + 20, by + 24, 'dela', inD ? 60 : 30, css('bone'));
      if (!inD) {
        if (e < 1.0) {
          const a = 1 - clamp((e - 0.6) / 0.4);
          text2D(hc, `-${(512 + Math.floor(hash(st.length, 3) * 1500)).toLocaleString()}`, cx + 50, cy - 60 - 130 * ease.outCubic(clamp(e / 0.6)), 'dela', 76, css('gold', a), { glow: css('amber', a), glowBlur: 26 });
        }
        // 直れ slams on the section downbeat and on beat 3
        const wi = (t - bs) < A.period * 2 ? 0 : 1;
        const ew = t - (bs + wi * A.period * 2);
        const kk = clamp(ew / 0.12);
        hc.save(); hc.translate(560, 840); hc.rotate(-0.06);
        const sc = 1 + 1.4 * (1 - ease.outCubic(kk)); hc.scale(sc, sc);
        text2D(hc, RUSH[wi]!, 0, 0, 'dela', 200, css('bone'), { align: 'center', glow: css('cyan', 0.9), glowBlur: 36 });
        hc.restore();
      } else {
        // nothing works: MISS, and the compiler's verdict looms
        if (e < 0.5 && last >= this.b[3]!) {
          text2D(hc, 'MISS', cx + 20, cy - 40 - 90 * ease.outCubic(clamp(e / 0.4)), 'dela', 90, css('mist', 1 - e / 0.5), { align: 'center' });
        }
        const jitter = frozen ? 0 : (hash(f.frame >> 1, 3) - 0.5) * 18;
        hc.save();
        hc.font = font('mono8', 74);
        hc.textAlign = 'center';
        hc.fillStyle = css('ink', 0.7); hc.fillRect(140, 820, W - 280, 140);
        text2D(hc, BUG_ERROR.split('  ')[0]!, W / 2 + jitter, 900, 'mono8', 74, css('bone'), { align: 'center', glow: css('red', 0.9), glowBlur: 30 });
        text2D(hc, 'night.ts(3,10)', W / 2, 948, 'mono4', 34, css('red'), { align: 'center' });
        hc.restore();
      }
      post = {
        ...post, bloom: 0.85, ca: 3 + 8 * (e < 0.15 ? 1 - e / 0.15 : 0), glitch: (inD ? 0.35 : 0.1) + 0.3 * snare,
        shake: [Math.sin(t * 97) * 20 * Math.exp(-e / 0.08), Math.cos(t * 89) * 16 * Math.exp(-e / 0.08)],
        invert: !inD && e < 0.034 ? 1 : 0, zoom: 1 + 0.04 * Math.exp(-e / 0.1), rgbSplit: inD ? 4 : 0,
      };
    }
    // corner clock + attempt counter (all sections)
    text2D(hc, storyClock(t), W - 120, 90, 'dot', 34, css('mist', 0.8), { align: 'right' });
    comp.draw(r, this.hud.upload(), out);
    if (frozen) post = { ...post, glitch: 0, shake: [0, 0], saturation: 0.25, zoom: 1.02, ca: 2, rgbSplit: 0 };
    return post;
  }
}

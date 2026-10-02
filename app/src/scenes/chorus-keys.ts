// Chorus act A — 「タイピングの音だけが BGM」: a mechanical keyboard in 3D. Every sung
// mora presses its keycap; the character flies up out of the key into the lyric line.
// The bass drops on the downbeat (camera whip), then BGM slams in front of an equalizer.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Text } from 'troika-three-text';
import { Shockwave, SpeedLines } from '../engine/fx';
import { H, W } from '../engine/gl';
import { LEAD } from '../engine/lyrics';
import { col } from '../engine/palette';
import type { PostParams } from '../engine/post';
import type { Frame } from '../engine/scene';
import { Glyphs3D, text3d, tint } from '../engine/text3d';
import { clamp, ease, hash, lerp, pulse } from '../engine/util';
import { Act, softDot } from './chorus-common';

const ROWS = [14, 14, 13, 12, 10];
const OFFS = [0, 0.35, 0.6, 0.85, 1.6];
const PITCH = 1.14;
const LEG = 'QWERTYUIOP[]ASDFGHJKL;ZXCVBNM,./1234567890-=';

export class KeysAct extends Act {
  scene = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(36, W / H, 0.05, 300);
  keys!: THREE.InstancedMesh;
  glow!: THREE.InstancedMesh;
  eq!: THREE.InstancedMesh;
  keyPos: THREE.Vector3[] = [];
  charKey: number[] = []; // lyric glyph index -> key index
  legends: { mesh: Text; key: number; lyric: boolean }[] = [];
  row!: Glyphs3D; // タイピングの音だけが
  bgm!: Glyphs3D; // BGM
  rowChars: { ch: { start: number; end: number }; gi: number; key: number }[] = [];
  light = new THREE.PointLight(0x62e6ff, 0, 9, 1.6);
  tDrop = 0;
  tBGM = 0;
  speed = new SpeedLines();
  shock = new Shockwave();
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private c = new THREE.Color();

  async init() {
    const { ctx, line, n } = this.a;
    const A = ctx.audio;
    this.tDrop = A.barTime(Math.ceil(A.bar(this.a.t0) - 1e-3));
    const bgmWord = line.words.find((w) => w.w.includes('BGM'))!;
    this.tBGM = bgmWord.start;
    // keyboard
    const geo = new RoundedBoxGeometry(1, 0.5, 1, 3, 0.14);
    const mat = new THREE.MeshStandardMaterial({ color: n === 2 ? 0x161a2e : 0x0e111c, roughness: 0.38, metalness: 0.15 });
    const count = ROWS.reduce((a, b) => a + b, 0);
    this.keys = new THREE.InstancedMesh(geo, mat, count);
    let k = 0;
    const totalW = ROWS[0]! * PITCH;
    ROWS.forEach((nk, r) => {
      for (let c = 0; c < nk; c++) {
        const x = -totalW / 2 + OFFS[r]! + c * PITCH + 0.5;
        const z = (r - 2) * PITCH;
        this.keyPos.push(new THREE.Vector3(x, 0.25, z));
        k++;
      }
    });
    this.scene.add(this.keys);
    // per-key underglow (additive soft dots)
    const gm = new THREE.MeshBasicMaterial({ map: softDot(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    this.glow = new THREE.InstancedMesh(new THREE.PlaneGeometry(2.2, 2.2), gm, count);
    this.glow.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
    this.scene.add(this.glow);
    // deck plate
    const deck = new THREE.Mesh(new RoundedBoxGeometry(totalW + 1.2, 0.3, PITCH * 5 + 1.0, 3, 0.2), new THREE.MeshStandardMaterial({ color: 0x07080f, roughness: 0.6 }));
    deck.position.set(0.4, -0.2, 0);
    this.scene.add(deck);
    // lighting
    this.scene.add(new THREE.HemisphereLight(n === 2 ? 0x8a7cff : 0x3a5cff, 0x000000, 0.55));
    const dl = new THREE.DirectionalLight(0xcfe0ff, 1.4);
    dl.position.set(-3, 8, 6);
    this.scene.add(dl);
    this.scene.add(this.light);
    // lyric -> keys: a left-to-right sweep across the middle rows
    const lyricGlyphs = line.chars.filter((c) => c.c !== ' ' && !/[A-Z]/.test(c.c));
    const latin = line.chars.filter((c) => /[A-Z]/.test(c.c));
    const used = new Set<number>();
    const keyAt = (r: number, c: number) => ROWS.slice(0, r).reduce((a, b) => a + b, 0) + Math.min(c, ROWS[r]! - 1);
    lyricGlyphs.forEach((_, i) => {
      const r = 1 + (i % 3), c = 1 + Math.round((i / Math.max(1, lyricGlyphs.length - 1)) * 10);
      let key = keyAt(r, c);
      while (used.has(key)) key++;
      used.add(key);
      this.charKey.push(key);
    });
    // legends: lyric kana on their keys, Latin on the others
    const lyricKeySet = new Map(this.charKey.map((key, i) => [key, lyricGlyphs[i]!.c]));
    const latinKeys = [keyAt(3, 5), keyAt(2, 5), keyAt(3, 7)]; // B G M
    this.keyPos.forEach((p, key) => {
      const ly = lyricKeySet.get(key);
      const li = latinKeys.indexOf(key);
      const s = ly ?? (li >= 0 ? latin[li]?.c ?? 'X' : LEG[Math.floor(hash(key, 3) * LEG.length)]!);
      const m = text3d(s, { font: ly ? 'sans9' : 'mono8', size: ly ? 0.56 : 0.34, color: ly ? col('ice') : col('steel'), anchorX: 'center', anchorY: 'middle', depthTest: true });
      m.rotation.x = -Math.PI / 2;
      m.position.set(p.x, 0.505, p.z);
      this.scene.add(m);
      this.legends.push({ mesh: m, key, lyric: !!ly || li >= 0 });
    });
    // floating lyric row
    const rowText = lyricGlyphs.map((c) => c.c).join('');
    this.row = new Glyphs3D(rowText, { font: 'dela', size: 0.98, color: col('bone'), depthTest: false });
    this.row.group.position.set(0, 3.1, -1.2);
    this.scene.add(this.row.group);
    lyricGlyphs.forEach((ch, i) => this.rowChars.push({ ch, gi: i, key: this.charKey[i]! }));
    // BGM
    this.bgm = new Glyphs3D('BGM', { font: 'dela', size: 5.2, color: col('bone'), tracking: 0.06, outlineWidth: '6%', outlineBlur: '22%', outlineColor: n === 2 ? 0x8b5cff : 0x62e6ff, outlineOpacity: 0.9 });
    this.bgm.group.position.set(0, 2.5, -6.2);
    this.scene.add(this.bgm.group);
    // equalizer
    const eqN = 44;
    this.eq = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ toneMapped: false }), eqN * 2);
    this.eq.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(eqN * 2 * 3), 3);
    this.scene.add(this.eq);
    this.scene.fog = new THREE.FogExp2(0x05060b, 0.03);
  }

  private bgmIndex(t: number) {
    // BGM letters timing (B, G, M)
    const latin = this.a.line.chars.filter((c) => /[A-Z]/.test(c.c));
    return latin.map((c) => c.start);
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostParams {
    const { ctx, n } = this.a;
    const t = f.t, T = t + LEAD;
    const A = ctx.audio;
    const accent = n === 2 ? col('violet') : col('cyan');
    // ---- key presses
    const press = new Float32Array(this.keyPos.length);
    const glow = new Float32Array(this.keyPos.length);
    for (const rc of this.rowChars) {
      const d = T - rc.ch.start;
      if (d >= 0) {
        press[rc.key] = Math.max(press[rc.key]!, d < 0.05 ? 1 : Math.exp(-(d - 0.05) / 0.12));
        glow[rc.key] = Math.max(glow[rc.key]!, 7 * Math.exp(-d / 0.35) + 0.6);
      }
    }
    const latinStarts = this.bgmIndex(t);
    const latinKeys = [this.keyIndex(3, 5), this.keyIndex(2, 5), this.keyIndex(3, 7)];
    latinStarts.forEach((s, i) => {
      const d = T - s;
      if (d >= 0) {
        const key = latinKeys[i]!;
        press[key] = Math.max(press[key]!, d < 0.05 ? 1 : Math.exp(-(d - 0.05) / 0.12));
        glow[key] = Math.max(glow[key]!, 9 * Math.exp(-d / 0.4) + 0.8);
      }
    });
    // ambient typing after the drop: random keys on kicks / hats
    if (t > this.tDrop) {
      const kt = A.lastOnset('kick', t), st = A.lastOnset('snare', t), ht = A.lastOnset('hat', t);
      for (const [et, seed, amp] of [[kt, 1, 1], [st, 2, 0.8], [ht, 3, 0.5]] as [number, number, number][]) {
        const d = t - et;
        if (d < 0 || d > 0.6) continue;
        for (let j = 0; j < 4; j++) {
          const key = Math.floor(hash(Math.round(et * 1000), seed, j) * this.keyPos.length);
          press[key] = Math.max(press[key]!, amp * (d < 0.04 ? 1 : Math.exp(-(d - 0.04) / 0.1)));
          glow[key] = Math.max(glow[key]!, amp * 4 * Math.exp(-d / 0.25));
        }
      }
    }
    const kickWave = f.a.kick;
    this.keyPos.forEach((p, i) => {
      const y = p.y - 0.2 * press[i]!;
      this.m4.makeTranslation(p.x, y, p.z);
      this.keys.setMatrixAt(i, this.m4);
      this.m4.compose(this.v.set(p.x, 0.03, p.z), this.q.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)), this.s.setScalar(1));
      this.glow.setMatrixAt(i, this.m4);
      const base = 0.18 + 0.25 * kickWave * (0.5 + 0.5 * Math.sin(p.x * 0.7 + t * 6));
      this.c.copy(accent).multiplyScalar(base + glow[i]!);
      this.glow.setColorAt(i, this.c);
    });
    this.keys.instanceMatrix.needsUpdate = true;
    this.glow.instanceMatrix.needsUpdate = true;
    this.glow.instanceColor!.needsUpdate = true;
    for (const L of this.legends) {
      const p = this.keyPos[L.key]!;
      L.mesh.position.y = 0.505 - 0.2 * press[L.key]!;
      const g = glow[L.key]!;
      if (L.lyric) tint(L.mesh, g > 1 ? col('bone', 1 + g * 0.6) : col('ice', 0.9), 1);
      else tint(L.mesh, col('steel', 0.8 + g * 0.5), 0.9);
      void p;
    }
    // point light follows the active key
    let active = this.rowChars[0]!;
    for (const rc of this.rowChars) if (T >= rc.ch.start) active = rc;
    const kp = this.keyPos[active.key]!;
    this.light.position.set(kp.x, 1.4, kp.z + 0.4);
    this.light.color.copy(accent);
    this.light.intensity = 6 + 30 * Math.exp(-Math.max(0, T - active.ch.start) / 0.3);
    // ---- the row lifts away as BGM slams in (set first: glyph paths are computed in world space)
    const lift = ease.outExpo(clamp((T - this.tBGM - 0.12) / 0.35));
    this.row.group.position.set(0, 3.1 + 2.0 * lift, -1.2 - 1.0 * lift);
    const gs = 1 - 0.2 * lift;
    this.row.group.scale.setScalar(gs);
    // ---- the lyric row: each glyph rises out of its key
    for (const rc of this.rowChars) {
      const it = this.row.items[rc.gi]!;
      const d = T - rc.ch.start;
      if (d < 0) { it.mesh.visible = false; continue; }
      it.mesh.visible = true;
      const p = ease.outExpo(clamp(d / 0.42));
      const src = this.keyPos[rc.key]!;
      const gp = this.row.group.position;
      const home = this.v.set(it.x * gs, -it.y * gs, 0).add(gp);
      const x = lerp(src.x, home.x, p), y = lerp(0.6, home.y, p) + Math.sin(p * Math.PI) * 0.9, z = lerp(src.z, home.z, p);
      it.mesh.position.set((x - gp.x) / gs, (y - gp.y) / gs, (z - gp.z) / gs);
      it.mesh.rotation.set(lerp(-Math.PI / 2, 0, ease.outBack(p)), 0, (1 - p) * (hash(rc.gi, 9) - 0.5) * 1.2);
      const pop = 1 + 0.35 * pulse(d, 0.42, 0.01, 0.12);
      it.mesh.scale.setScalar(lerp(0.5, 1, p) * pop);
      tint(it.mesh, d < 0.6 ? col('bone', 1 + 4 * Math.exp(-d / 0.18)) : col('bone', 1.15), 1);
    }
    // ---- BGM + equalizer (after the BGM word starts)
    const showBGM = T >= this.tBGM - 0.25;
    this.bgm.group.visible = showBGM;
    this.bgm.items.forEach((it, i) => {
      const s0 = latinStarts[i] ?? this.tBGM;
      const d = T - s0;
      it.mesh.visible = d >= 0;
      const k = clamp(d / 0.13);
      it.mesh.scale.setScalar(1 + 2.2 * (1 - ease.outCubic(k)));
      it.mesh.position.y = -it.y + 0.25 * Math.sin(t * 2.2 + i);
      tint(it.mesh, col(n === 2 ? 'ice' : 'bone', 1.4 + 6 * Math.exp(-Math.max(0, d) / 0.12) + 1.5 * f.a.kick), 1);
    });
    const eqN = this.eq.count / 2;
    for (let i = 0; i < eqN; i++) {
      const band = Math.min(15, Math.floor((i / eqN) * 16));
      const v = showBGM ? A.band(band, t) : 0.05;
      const h = 0.15 + 6.5 * Math.pow(v, 1.6) * (0.85 + 0.3 * hash(i, 4));
      const x = (i - eqN / 2 + 0.5) * 0.42;
      for (const side of [0, 1]) {
        this.m4.compose(this.v.set(x, side ? -h / 2 + 0.6 : h / 2 + 0.6, -10.5), this.q.identity(), this.s.set(0.3, side ? h * 0.35 : h, 0.3));
        this.eq.setMatrixAt(i * 2 + side, this.m4);
        this.c.copy(i % 2 ? accent : col('blue')).multiplyScalar((side ? 0.25 : 1.4) * (0.5 + 2 * v));
        this.eq.setColorAt(i * 2 + side, this.c);
      }
    }
    this.eq.instanceMatrix.needsUpdate = true;
    this.eq.instanceColor!.needsUpdate = true;
    this.eq.visible = showBGM;
    // ---- camera: close tracking → whip on the bass drop → front view for BGM
    const cam = this.cam;
    const close = new THREE.Vector3(kp.x - 2.2, 1.0, kp.z + 3.6), closeT = new THREE.Vector3(kp.x + 1.2, 1.9, kp.z - 1.6);
    const wide = new THREE.Vector3(-5.5 + 0.6 * (t - this.tDrop), 7.2, 9.6 - 0.5 * (t - this.tDrop)), wideT = new THREE.Vector3(0, 1.6, -1.6);
    const front = new THREE.Vector3(Math.sin((t - this.tBGM) * 0.35) * 2.2, 1.9, 10.5 - 0.8 * (t - this.tBGM)), frontT = new THREE.Vector3(0, 2.6, -6);
    let pos: THREE.Vector3, tgt: THREE.Vector3, roll = 0;
    if (t < this.tDrop) {
      pos = close; tgt = closeT; roll = -0.12;
      // smooth the jump between keys
      const sm = this.smoothKey(T);
      pos.x = sm.x - 2.2; tgt.x = sm.x + 1.2; pos.z = sm.z + 3.6; tgt.z = sm.z - 1.6;
    } else if (t < this.tBGM - 0.12) {
      const k = ease.outExpo(clamp((t - this.tDrop) / 0.38));
      const sm = this.smoothKey(this.tDrop + LEAD);
      pos = new THREE.Vector3(sm.x - 2.2, 1.0, sm.z + 3.6).lerp(wide, k);
      tgt = new THREE.Vector3(sm.x + 1.2, 1.9, sm.z - 1.6).lerp(wideT, k);
      roll = lerp(-0.12, 0.04, k);
    } else {
      pos = front; tgt = frontT; roll = 0.02 * Math.sin(t * 1.3);
    }
    cam.position.copy(pos);
    cam.up.set(Math.sin(roll), Math.cos(roll), 0);
    cam.lookAt(tgt);
    cam.fov = t < this.tDrop ? 40 : t < this.tBGM - 0.12 ? lerp(52, 38, ease.outExpo(clamp((t - this.tDrop) / 0.5))) : 34;
    cam.updateProjectionMatrix();
    // ---- background
    const r = ctx.renderer;
    const bg = n === 2 ? col('navy', 0.6) : col('ink');
    r.setRenderTarget(out);
    r.setClearColor(bg, 1);
    r.clear();
    r.setClearColor(0x000000, 1);
    this.scene.fog!.color = bg;
    this.draw(this.scene, cam, out);
    // ---- fx
    const dd = t - this.tDrop;
    this.speed.render(r, out, { frame: f.frame, intensity: dd >= 0 ? 0.9 * Math.exp(-dd / 0.3) : 0, color: n === 2 ? [0.8, 0.6, 2.2] : [0.6, 1.6, 2.4], inner: 0.24, density: 150 });
    this.shock.render(r, out, dd, { color: n === 2 ? [2, 1.2, 3] : [1.2, 2.6, 3.2], speed: 2.2, width: 0.03 });
    const bgmHits = latinStarts.map((s) => T - s).filter((d) => d >= 0 && d < 0.25);
    const hit = bgmHits.length ? Math.exp(-Math.min(...bgmHits) / 0.06) : 0;
    return {
      bloom: 0.95, bloomThreshold: 0.85, ca: 1.6 + 5 * hit + (dd >= 0 ? 4 * Math.exp(-dd / 0.2) : 0),
      flash: Math.max(dd >= 0 ? 0.65 * Math.exp(-dd / 0.025) : 0, 0.85 * Math.exp(-(t - this.a.t0) / 0.07)), flashColor: n === 2 ? [0.85, 0.8, 1] : [0.8, 0.95, 1],
      shake: [Math.sin(t * 91) * 14 * hit, Math.cos(t * 77) * 10 * hit],
      zoom: 1 + 0.04 * hit + (dd >= 0 ? 0.08 * Math.exp(-dd / 0.15) : 0),
      zoomBlur: dd >= 0 ? 0.9 * Math.exp(-dd / 0.18) : 0, vignette: 0.45,
    };
  }

  private keyIndex(r: number, c: number) {
    return ROWS.slice(0, r).reduce((a, b) => a + b, 0) + Math.min(c, ROWS[r]! - 1);
  }

  /** camera track position that glides between active keys */
  private smoothKey(T: number) {
    const rc = this.rowChars;
    let i = 0;
    while (i + 1 < rc.length && T >= rc[i + 1]!.ch.start) i++;
    const a = this.keyPos[rc[i]!.key]!, b = this.keyPos[rc[Math.min(rc.length - 1, i + 1)]!.key]!;
    const t0 = rc[i]!.ch.start, t1 = rc[Math.min(rc.length - 1, i + 1)]!.ch.start;
    const k = t1 > t0 ? ease.inOutCubic(clamp((T - t0) / (t1 - t0))) : 0;
    if (T < rc[0]!.ch.start) return a.clone().add(new THREE.Vector3(-1.5 * clamp((rc[0]!.ch.start - T) / 0.4), 0, 0));
    return a.clone().lerp(b, k);
  }
}

// The sticky note (付箋) for tomorrow's self, stuck on the monitor: paper (lit by the room
// model), and the lyric written on it in marker-ish handwriting (zen gothic with per-glyph jitter,
// each glyph wiped in as it is sung).
import * as THREE from 'three';
import type { Char, Line } from '../engine/lyrics';
import { col } from '../engine/palette';
import { text3d, tint } from '../engine/text3d';
import { clamp, ease, hash, mulberry32 } from '../engine/util';
import type { Text } from 'troika-three-text';
import { LEADV } from './success-kit';
import type { World } from './outro-world';

export const NOTE = { size: 17, c: new THREE.Vector3(35.5, 21, -29.45), rot: -0.06 };

function paperTexture() {
  const S = 512;
  const cv = document.createElement('canvas');
  cv.width = S; cv.height = S;
  const c = cv.getContext('2d')!;
  const g = c.createLinearGradient(0, 0, S * 0.3, S);
  g.addColorStop(0, '#fff0a6');
  g.addColorStop(0.55, '#ffe07a');
  g.addColorStop(1, '#f4c95c');
  c.fillStyle = g;
  c.fillRect(0, 0, S, S);
  // adhesive band
  c.fillStyle = 'rgba(180,140,40,0.10)';
  c.fillRect(0, 0, S, S * 0.13);
  // paper grain
  const r = mulberry32(5);
  for (let i = 0; i < 2600; i++) {
    c.fillStyle = `rgba(120,90,30,${0.025 + 0.03 * r()})`;
    c.fillRect(r() * S, r() * S, 1 + r() * 2, 1);
  }
  // soft darker edges
  const e = c.createRadialGradient(S * 0.4, S * 0.4, S * 0.3, S * 0.5, S * 0.5, S * 0.75);
  e.addColorStop(0, 'rgba(0,0,0,0)');
  e.addColorStop(1, 'rgba(90,60,10,0.18)');
  c.fillStyle = e;
  c.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function shadowTexture() {
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = S; cv.height = S;
  const c = cv.getContext('2d')!;
  c.filter = 'blur(14px)';
  c.fillStyle = 'rgba(0,0,0,0.85)';
  c.fillRect(S * 0.14, S * 0.14, S * 0.72, S * 0.72);
  const tex = new THREE.CanvasTexture(cv);
  return tex;
}

export interface NoteGlyph { mesh: Text; ch?: Char; x: number; y: number; rot: number; sc: number; size: number; line?: Line; ps: boolean; k: number }

export class StickyNote {
  group = new THREE.Group(); // in world space, on the monitor
  paper: THREE.Mesh;
  paperMat: THREE.ShaderMaterial;
  /** warm bounce light on the paper (the room is lit by the sunrise) */
  setGlow(c: THREE.Color) { (this.paperMat.uniforms.uEmis!.value as THREE.Color).copy(c); }
  glyphs: NoteGlyph[] = [];
  constructor(world: World, line: Line) {
    const S = NOTE.size;
    const geo = new THREE.PlaneGeometry(S, S, 10, 10);
    // a slight curl at the bottom-right corner
    const pos = geo.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) / S + 0.5, y = pos.getY(i) / S + 0.5;
      const k = Math.max(0, (x - 0.55) / 0.45) * Math.max(0, (0.45 - y) / 0.45);
      pos.setZ(i, k * k * 1.6);
    }
    geo.computeVertexNormals();
    this.paperMat = world.roomMat('#ffffff', { map: paperTexture(), emis: col('#000000') });
    this.paper = new THREE.Mesh(geo, this.paperMat);
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(S * 1.25, S * 1.25), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, opacity: 0.6, depthWrite: false, color: 0x000000 }));
    sh.position.set(0.6, -0.7, -0.2);
    this.group.add(sh, this.paper);
    this.group.position.copy(NOTE.c);
    this.group.rotation.z = NOTE.rot;
    world.noteGroup.add(this.group);
    // handwriting: 明日の / 自分、/ よろしく / 頼むよ。  (+ P.S.)
    const rows: Char[][] = [line.words[0]!.chars, line.words[1]!.chars, line.words[2]!.chars, line.words[3]!.chars];
    const size = 3.0, x0 = -6.7, ys = [5.7, 2.4, -0.9, -4.2];
    let k = 0;
    rows.forEach((chars, ri) => {
      let x = x0;
      chars.forEach((ch) => {
        const punct = '、。'.includes(ch.c);
        const sz = size * (punct ? 1 : 0.96 + 0.1 * hash(k, 3));
        const m = text3d(ch.c, { font: 'zen', size: sz, color: col('navy'), anchorX: 'center', anchorY: 'middle', depthTest: true, renderOrder: 20 });
        const g: NoteGlyph = { mesh: m, ch, x: x + size * (punct ? 0.32 : 0.5) + (hash(k, 5) - 0.5) * 0.25, y: ys[ri]! + (hash(k, 7) - 0.5) * 0.35 - (punct ? 0.25 : 0), rot: (hash(k, 9) - 0.5) * 0.14, sc: 1, size: sz, line, ps: false, k };
        m.position.set(g.x, g.y, 0.06);
        m.rotation.z = g.rot;
        this.group.add(m);
        this.glyphs.push(g);
        x += size * (punct ? 0.62 : 0.98) + (hash(k, 11) - 0.5) * 0.18;
        k++;
      });
    });
    // P.S. (written after the line, smaller)
    const ps = 'P.S. リファクタは任せた';
    let x = x0 + 0.2;
    for (const c of ps) {
      if (c === ' ') { x += 0.45; continue; }
      const latin = /[A-Za-z.]/.test(c);
      const sz = 1.25;
      const m = text3d(c, { font: 'zen', size: sz, color: col('navy'), anchorX: 'center', anchorY: 'middle', depthTest: true, renderOrder: 20 });
      const g: NoteGlyph = { mesh: m, x: x + sz * 0.5, y: -7.0 + (hash(k, 13) - 0.5) * 0.2, rot: (hash(k, 15) - 0.5) * 0.1, sc: 1, size: sz, ps: true, k };
      m.position.set(g.x, g.y, 0.06);
      this.group.add(m);
      this.glyphs.push(g);
      x += latin ? sz * 0.62 : sz * 0.98;
      k++;
    }
  }

  /** write-on reveal; psT0 = when the P.S. starts */
  update(t: number, psT0: number, ink: THREE.Color) {
    const T = t + LEADV;
    let pi = 0;
    for (const g of this.glyphs) {
      let t0: number, dur: number;
      if (g.ch) { t0 = g.ch.start; dur = clamp(g.ch.end - g.ch.start, 0.1, 0.32); }
      else { t0 = psT0 + pi * 0.045; dur = 0.07; pi++; }
      const p = clamp((T - t0) / dur);
      const m = g.mesh;
      m.visible = p > 0;
      if (!m.visible) continue;
      const s = g.size;
      // wipe left -> right (clipRect in glyph-local units)
      m.clipRect = [-s * 0.6, -s * 0.7, -s * 0.6 + s * 1.2 * ease.outQuad(p), s * 0.7];
      const pop = 1 + 0.08 * (1 - ease.outCubic(clamp((T - t0) / (dur + 0.15))));
      m.scale.setScalar(pop);
      m.rotation.z = g.rot;
      tint(m, ink, 1);
    }
  }
}

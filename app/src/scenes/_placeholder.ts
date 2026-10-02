// Stand-in for timeline entries whose module isn't written yet: plain synced karaoke.
import * as THREE from 'three';
import { FSPass, Layer2D, H, W, screenCamera } from '../engine/gl';
import { enter, gstate } from '../engine/kinetic';
import { col, css } from '../engine/palette';
import { Scene, type Frame } from '../engine/scene';
import { Glyphs3D, tint } from '../engine/text3d';
import { drawGlyphs2D, layout2D, text2D, type Lay2D } from '../engine/type2d';

export default class Placeholder extends Scene {
  bg = new FSPass(/* glsl */ `
    uniform float t; uniform float kick;
    void main() {
      vec2 p = (vUv - .5) * vec2(uRes.x / uRes.y, 1.);
      float g = 0.05 + 0.05 * vnoise(p * 3. + t * .2);
      gl_FragColor = vec4(C_INK + C_BLUE * g * (0.4 + kick), 1.);
    }`, { t: { value: 0 }, kick: { value: 0 } });
  layer = new Layer2D();
  lays = new Map<number, Lay2D>();
  scene = new THREE.Scene();
  cam = screenCamera();
  title!: Glyphs3D;

  async init() {
    const { lyrics, start, end, id } = this.ctx;
    for (const l of lyrics.lines) {
      if (l.end >= start && l.start < end) this.lays.set(l.i, layout2D(l, { font: 'sans9', size: 92, wrap: 1500 }));
    }
    this.title = new Glyphs3D(id.toUpperCase(), { font: 'dela', size: 64, color: col('cyan', 3) });
    this.title.group.position.set(-W / 2 + 120 + this.title.width / 2, H / 2 - 110, 0);
    this.scene.add(this.title.group);
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp, lyrics } = this.ctx;
    this.bg.u.t!.value = f.t;
    this.bg.u.kick!.value = f.a.kick;
    this.bg.render(renderer, out);
    this.title.items.forEach((it, i) => {
      it.mesh.position.y = -it.y + Math.sin(f.t * 3 + i * 0.6) * 6;
      tint(it.mesh, col('cyan', 1.5 + 3 * f.a.kick));
    });
    this.draw(this.scene, this.cam, out);
    const ctx = this.layer.clear();
    text2D(ctx, `placeholder — ${this.ctx.id}  ${f.t.toFixed(2)}s  bar ${f.bar.toFixed(2)}`, 120, H - 90, 'dot', 26, css('steel'));
    const l = lyrics.at(f.t);
    const lay = l && this.lays.get(l.i);
    if (l && lay && f.t < l.end + 0.6) {
      drawGlyphs2D(ctx, lay, W / 2, H / 2, (g) => {
        const s = gstate(g, l, f.t, 'line', 0.4);
        if (!s.vis) return null;
        if (!s.on) return { style: { fill: css('steel', 0.55) } };
        return { style: { fill: css('bone'), glow: css('cyan', 0.6), glowBlur: 20 }, kin: enter('slam', s.since, g.gi) };
      });
    }
    comp.draw(renderer, this.layer.upload(), out);
    return { bloom: 0.8 };
  }
}

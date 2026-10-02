// loop (21.50 → 31.62): the build into chorus 1. Four shots, one per line, cut on the
// first sung mora of each line; the energy rises shot by shot and ends in a whiteout.
//   A  L8  さっきからずっと同じ場所       infinite code corridor (we pass the same sign again)
//   B  L9  ループする思考が止まらない     the thought as a dial; spins out of control
//   C  L10 何が正解か分からなくなって     a decision tree forking on every mora, ？ everywhere
//   D  L11 画面越しに自分を問い詰める     screen-share hall of mirrors, riser, whiteout
import * as THREE from 'three';
import { Layer2D, W } from '../engine/gl';
import { LEAD } from '../engine/lyrics';
import { storyClock } from '../engine/motifs';
import { css } from '../engine/palette';
import type { PostParams } from '../engine/post';
import { Scene, type Frame } from '../engine/scene';
import { text2D } from '../engine/type2d';
import { clamp, lerp } from '../engine/util';
import { Branch } from './loop-branch';
import { Corridor } from './loop-corridor';
import { Droste } from './loop-droste';
import { Ring } from './loop-ring';

export default class Loop extends Scene {
  A!: Corridor;
  B!: Ring;
  C!: Branch;
  D!: Droste;
  hud = new Layer2D();
  cuts: number[] = [];

  async init() {
    const ly = this.ctx.lyrics;
    const { start, end } = this.ctx;
    const c1 = ly.get('ループする思考が止まらない').start - LEAD;
    const c2 = ly.get('何が正解か分からなくなって').start - LEAD;
    const c3 = ly.get('画面越しに自分を問い詰める').start - LEAD;
    this.cuts = [start, c1, c2, c3, end];
    this.A = new Corridor(this.ctx, start, c1);
    this.B = new Ring(this.ctx, c1, c2);
    this.C = new Branch(this.ctx, c2, c3);
    this.D = new Droste(this.ctx, c3, end);
    await Promise.all([this.A.init(), this.B.init(), this.C.init(), this.D.init()]);
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostParams | void {
    const t = f.t;
    const [, c1, c2, c3] = this.cuts as [number, number, number, number, number];
    const shot = t < c1 ? 0 : t < c2 ? 1 : t < c3 ? 2 : 3;
    const pp = shot === 0 ? this.A.render(f, out) : shot === 1 ? this.B.render(f, out) : shot === 2 ? this.C.render(f, out) : this.D.render(f, out);
    // HUD: the clock + the loop counter that keeps accelerating
    if (shot !== 3) {
      const ctx = this.hud.clear();
      const { start, end } = this.ctx;
      const p = clamp((t - start) / (end - start));
      const n = Math.floor(Math.exp(lerp(0, Math.log(9999), Math.pow(p, 1.5))));
      text2D(ctx, storyClock(t), 104, 92, 'dot', 30, css('mist', 0.85), { tracking: 0.08 });
      text2D(ctx, 'night.ts:3', 106, 126, 'dot', 20, css('steel', 0.9));
      text2D(ctx, `while (!bug.fixed)  #${String(n).padStart(4, '0')}`, W - 104, 92, 'dot', 22, css('steel', 0.95), { align: 'right' });
      ctx.fillStyle = css('cyan', 0.8);
      const bw = 240 * ((t * 1.7) % 1);
      ctx.fillRect(W - 104 - 240, 106, bw, 3);
      this.ctx.comp.draw(this.ctx.renderer, this.hud.upload(), out);
    }
    return pp;
  }
}

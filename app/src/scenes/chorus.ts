// The chorus (×2): four acts cut on the beat —
//   keys  「タイピングの音だけが BGM」   a keyboard; every mora presses its key
//   maze  「迷宮入りのコード、終わらない夜」 a flight through a maze of code
//   boss  「でもバグに負けるのは癪だから」 the bug, an HP bar, impact frames
//   dash  「光るカーソル、明日を迎えに行く」 the cursor races toward the light
// params.n = 1 (night) | 2 (dawn colours, the bug already wounded).
import * as THREE from 'three';
import type { Line } from '../engine/lyrics';
import type { PostParams } from '../engine/post';
import { Scene, type Frame } from '../engine/scene';
import type { Act } from './chorus-common';
import { BossAct } from './chorus-boss';
import { DashAct } from './chorus-dash';
import { KeysAct } from './chorus-keys';
import { MazeAct } from './chorus-maze';

export default class Chorus extends Scene {
  acts: Act[] = [];

  async init() {
    const ctx = this.ctx;
    const n = (ctx.params.n as number) ?? 1;
    const A = ctx.audio;
    const lines = ctx.lyrics.lines.filter((l) => l.start >= ctx.start - 0.01 && l.start < ctx.end);
    // act cuts: the 8th-grid point at (or just before) each line's first sung mora
    const cut = (l: Line) => A.beatFloor(l.start + 0.02, 0.5);
    const b = [ctx.start, cut(lines[1]!), cut(lines[2]!), cut(lines[3]!), ctx.end];
    const mk = (i: number) => ({ ctx, line: lines[i]!, n, t0: b[i]!, t1: b[i + 1]! });
    this.acts = [new KeysAct(mk(0)), new MazeAct(mk(1)), new BossAct(mk(2)), new DashAct(mk(3))];
    for (const a of this.acts) await a.init();
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostParams | void {
    const act = this.acts.find((a) => f.t >= a.a.t0 && f.t < a.a.t1) ?? this.acts[0]!;
    return act.render(f, out);
  }
}

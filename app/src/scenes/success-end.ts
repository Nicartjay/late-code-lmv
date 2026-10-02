// success S6/S7 helpers: the git graph rocket, the messy editor, crumple + toss (Canvas2D).
import { font } from '../engine/fonts';
import { drawEditor } from '../engine/motifs';
import { css } from '../engine/palette';
import { clamp, ease, hash, lerp } from '../engine/util';

export const MESSY: string[] = [
  '// utils_old_FINAL_v3.ts  (触るな)',
  'export function doStuff2(x: any, y?: any) {',
  '  if (x) { if (y) { if (x.y) { if (!x.z) {',
  '    // TODO: あとでリファクタ',
  '    for (let i = 0; i < 147; i++) { if (i == 2) continue;',
  '      else { tmp = tmp2 || tmp3 || window.tmp4; } }',
  '    return x ? y ? x.y ? 1 : 0 : -1 : null; // ???',
  '  } } } }',
  '  // const old = doStuff(x);  // 消すな',
  '  // const old2 = doStuff(x, true);',
  '  var _x = JSON.parse(JSON.stringify(x)); // たぶんdeep copy',
  '  setTimeout(() => setTimeout(() => setTimeout(done, 0), 0), 0);',
  '  return _x || x || y || "動いてるからヨシ";',
  '}',
];

export function makeMessyEditor(w = 1000, h = 600) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const c = cv.getContext('2d')!;
  drawEditor(c, 0, 0, w, h, { lines: MESSY, px: 22, title: 'utils_old_FINAL_v3.ts', highlight: 3 });
  return cv;
}

/** draw the (pre-rendered) editor image crumpling into a paper ball. c = 0 flat .. 1 ball */
export function drawCrumple(ctx: CanvasRenderingContext2D, img: HTMLCanvasElement, cx: number, cy: number, w: number, h: number, c: number, rot: number, seed = 1) {
  const n = 28;
  const ce = ease.inOutCubic(clamp(c));
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  // polygon around the rectangle perimeter, contracting toward the centre (jagged)
  const pts: [number, number][] = [];
  const per = 2 * (w + h);
  for (let i = 0; i < n; i++) {
    let d = (i / n) * per, x: number, y: number;
    if (d < w) { x = -w / 2 + d; y = -h / 2; } else if ((d -= w) < h) { x = w / 2; y = -h / 2 + d; } else if ((d -= h) < w) { x = w / 2 - d; y = h / 2; } else { d -= w; x = -w / 2; y = h / 2 - d; }
    const rr = Math.hypot(x, y), a = Math.atan2(y, x);
    const target = Math.min(w, h) * (0.2 + 0.08 * hash(i, seed, 1));
    const r2 = lerp(rr, target, ce) * (1 + 0.12 * ce * (hash(i, seed, 2) - 0.5));
    const a2 = a + ce * 0.35 * (hash(i, seed, 3) - 0.5);
    pts.push([Math.cos(a2) * r2, Math.sin(a2) * r2]);
  }
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.save();
  ctx.clip();
  const sc = lerp(1, 0.42, ce);
  ctx.rotate(ce * 0.6);
  ctx.drawImage(img, (-w / 2) * sc, (-h / 2) * sc, w * sc, h * sc);
  // crumple shading + creases
  if (ce > 0.01) {
    const R = Math.min(w, h) * 0.6;
    const g = ctx.createRadialGradient(-R * 0.2, -R * 0.25, R * 0.05, 0, 0, R * lerp(2.2, 0.4, ce));
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${0.75 * ce})`);
    ctx.fillStyle = g;
    ctx.fillRect(-w, -h, 2 * w, 2 * h);
    ctx.strokeStyle = css('mist', 0.35 * ce);
    ctx.lineWidth = 2;
    for (let k = 0; k < 12; k++) {
      const a0 = hash(k, seed, 9) * Math.PI * 2, r0 = Math.min(w, h) * 0.3 * hash(k, seed, 10);
      const a1 = a0 + (hash(k, seed, 11) - 0.5) * 2.5, r1 = Math.min(w, h) * 0.35;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a0) * r0 * lerp(1.6, 0.6, ce), Math.sin(a0) * r0 * lerp(1.6, 0.6, ce));
      ctx.lineTo(Math.cos(a1) * r1 * lerp(1.6, 0.6, ce), Math.sin(a1) * r1 * lerp(1.6, 0.6, ce));
      ctx.stroke();
    }
  }
  ctx.restore();
  ctx.strokeStyle = css(ce > 0.5 ? 'mist' : 'steel', 0.5 + 0.4 * ce);
  ctx.lineWidth = 1.5 + 2 * ce;
  ctx.stroke();
  // paper highlights on the creases of the ball
  if (ce > 0.3) {
    ctx.strokeStyle = css('bone', 0.5 * ce);
    ctx.lineWidth = 2.5;
    for (let k = 0; k < 7; k++) {
      const a0 = hash(k, seed, 21) * Math.PI * 2, r0 = Math.min(w, h) * 0.2 * (0.2 + 0.8 * hash(k, seed, 22));
      const a1 = a0 + 0.5 + hash(k, seed, 23);
      ctx.beginPath();
      ctx.moveTo(Math.cos(a0) * r0, Math.sin(a0) * r0);
      ctx.lineTo(Math.cos(a1) * r0 * 0.6, Math.sin(a1) * r0 * 0.6);
      ctx.stroke();
    }
  }
  ctx.restore();
}

export interface Commit { id: string; msg: string; lane: number; jp?: boolean }
export const COMMITS: Commit[] = [
  { id: 'c0ffee1', msg: 'init: night.ts', lane: 0 },
  { id: '2c9d1b8', msg: 'wip', lane: 0 },
  { id: '77d0a5e', msg: 'wip2', lane: 0 },
  { id: 'e41c7f0', msg: 'try: 全部消してみる', lane: 1 },
  { id: 'b4dc0de', msg: 'revert', lane: 1 },
  { id: 'f00dbab', msg: 'たぶん直った', lane: 0 },
  { id: '9b1e004', msg: '動かない', lane: 0 },
  { id: 'a3f9c12', msg: 'fix: セミコロン → カンマ', lane: 0 },
];

function mixedText(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, px: number, fill: string) {
  ctx.fillStyle = fill;
  let cx = x;
  for (const ch of s) {
    const jp = /[^\x00-\x7f]/.test(ch);
    ctx.font = font(jp ? 'code4' : 'mono4', px);
    ctx.fillText(ch, cx, y);
    cx += jp ? px : px * 0.6;
  }
  return cx;
}

/**
 * git log --graph, newest at the top. `launch` 0..1: the HEAD commit shoots up like a rocket
 * (camera follows: the old graph slides down). `appear` 0..1 reveals the commits bottom -> top.
 */
export function drawGitGraph(ctx: CanvasRenderingContext2D, o: { x: number; y: number; appear: number; launch: number; frame: number; t: number }) {
  const step = 112, laneW = 76;
  const N = COMMITS.length;
  const L = o.launch;
  const camDown = 560 * ease.inCubic(clamp(L));
  const headRise = 1600 * Math.pow(clamp(L), 2.4);
  const pos = (i: number) => {
    const c = COMMITS[i]!;
    return [o.x + c.lane * laneW, o.y + (N - 1 - i) * step + camDown] as [number, number];
  };
  ctx.save();
  ctx.lineCap = 'round';
  // edges
  for (let i = 1; i < N; i++) {
    const vis = clamp(o.appear * N - i + 0.5);
    if (vis <= 0) continue;
    const c = COMMITS[i]!;
    const [x1, y1] = pos(i);
    // parent: previous commit on lane 0 (lane-1 commits branch from 77d0a5e and merge into f00dbab)
    const parents: number[] = [];
    if (c.lane === 1) parents.push(i === 3 ? 2 : i - 1);
    else if (i === 5) parents.push(2, 4);
    else parents.push(i - 1);
    for (const pi of parents) {
      const [x0, y0] = pos(pi);
      ctx.strokeStyle = i === N - 1 ? css('green', 0.9) : css(COMMITS[pi]!.lane || c.lane ? 'mist' : 'steel', 0.8);
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      if (x0 === x1) ctx.lineTo(x1, lerp(y0, y1, vis));
      else ctx.bezierCurveTo(x0, (y0 + y1) / 2, x1, (y0 + y1) / 2, lerp(x0, x1, vis), lerp(y0, y1, vis));
      ctx.stroke();
    }
  }
  // the rocket trail: HEAD line stretched upward
  const [hx, hy0] = pos(N - 1);
  const hy = hy0 - headRise;
  if (L > 0) {
    const g = ctx.createLinearGradient(0, hy, 0, hy0 + 40);
    g.addColorStop(0, css('bone', 1));
    g.addColorStop(0.08, css('green', 1));
    g.addColorStop(1, css('green', 0.0));
    ctx.strokeStyle = g;
    ctx.lineWidth = 10 + 10 * L;
    ctx.shadowColor = css('green'); ctx.shadowBlur = 30;
    ctx.beginPath(); ctx.moveTo(hx, hy0 + 30); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.shadowBlur = 0;
    // sparks
    for (let k = 0; k < 60; k++) {
      const age = hash(k, 3) * 0.5;
      const yy = hy + (hy0 - hy) * hash(k, 5) + age * 200;
      const xx = hx + (hash(k, 7, o.frame >> 1) - 0.5) * 60 * (0.3 + hash(k, 5));
      const r = 1.5 + 3 * hash(k, 9);
      ctx.fillStyle = css(hash(k, 11) > 0.7 ? 'bone' : 'green', 0.9 * (1 - hash(k, 5)) * clamp(L * 3));
      ctx.fillRect(xx - r, yy - r, r * 2, r * 2);
    }
  }
  // nodes + labels
  for (let i = 0; i < N; i++) {
    const vis = clamp(o.appear * N - i);
    if (vis <= 0) continue;
    const c = COMMITS[i]!;
    let [x, y] = pos(i);
    const head = i === N - 1;
    if (head) y = hy;
    const r = head ? 22 : 13;
    const pop = ease.outBack(clamp(vis * 1.5));
    ctx.fillStyle = head ? css('green') : css('ink2');
    ctx.strokeStyle = head ? css('bone') : css(c.lane ? 'mist' : 'steel');
    ctx.lineWidth = 4;
    if (head) { ctx.shadowColor = css('green'); ctx.shadowBlur = 36; }
    ctx.beginPath(); ctx.arc(x, y, r * pop, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = vis;
    ctx.textBaseline = 'middle';
    const lx = o.x + 2 * laneW + 10;
    const ex = mixedText(ctx, c.id, lx, y, 28, css(head ? 'green' : 'steel'));
    mixedText(ctx, c.msg, ex + 20, y, 28, css(head ? 'bone' : 'mist', head ? 1 : 0.75));
    if (head) {
      ctx.font = font('mono8', 20);
      const tag = L > 0.55 ? 'origin/main' : 'HEAD → main';
      const tw = ctx.measureText(tag).width;
      const tx = lx, ty = y + 38;
      ctx.fillStyle = css('green', 0.18); ctx.strokeStyle = css('green', 0.8); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(tx - 8, ty - 15, tw + 16, 30, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = css('green'); ctx.fillText(tag, tx, ty + 1);
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  return { headX: hx, headY: hy };
}

#!/usr/bin/env bun
// Offline renderer: drives the app in headless Chrome (?export=1).
//   gpu:     bun scripts/render.ts gpu
//   stills:  bun scripts/render.ts stills --t 1.5,23,40.2 [--only id1,id2] [--out dir] [--samples 1]
//   sheet:   bun scripts/render.ts sheet --from 20 --to 35 [--n 12] [--cols 4] [--only ids] [--out file.png]
//            (or --times a,b,c | --entry id | --cuts)
//   perf:    bun scripts/render.ts perf --from 20 --to 25 [--only ids] [--samples 1]
//   video:   bun scripts/render.ts video [--from 0] [--to <dur>] [--fps 60] [--crf 16] [--samples 1] [--shutter 0.5]
//            [--preset slow] [--out ../out/video.mp4] [--noaudio]
// Uses the Vite dev server at --url (default http://localhost:5173) or starts a private one without HMR.
import { chromium, type Page } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const mode = argv[0] ?? 'stills';
const opt = (k: string, d?: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const flag = (k: string) => argv.includes(`--${k}`);
const APP = path.resolve(import.meta.dir, '..');
const ROOT = path.resolve(APP, '..');
const AUDIO = path.join(ROOT, 'audio', '2時のデバッグ.wav');
const W = 1920, H = 1080;
const SAMPLES = +opt('samples', '1')!;
const SHUTTER = +opt('shutter', '0.5')!;

async function reachable(url: string) {
  try { const r = await fetch(url, { signal: AbortSignal.timeout(1500) }); return r.ok; } catch { return false; }
}

async function ensureServer(): Promise<{ url: string; stop: () => void }> {
  const url = opt('url', 'http://localhost:5173')!;
  if (!flag('private') && await reachable(url)) return { url, stop: () => {} };
  const port = 5300 + Math.floor(Math.random() * 500);
  const proc = Bun.spawn(['bunx', 'vite', '--port', String(port), '--strictPort'], { cwd: APP, stdout: 'ignore', stderr: 'ignore', env: { ...process.env, LNC_NO_HMR: '1' } });
  const u = `http://localhost:${port}`;
  for (let i = 0; i < 150 && !(await reachable(u)); i++) await Bun.sleep(100);
  return { url: u, stop: () => proc.kill() };
}

async function openPage(url: string) {
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: !flag('headed'),
    args: ['--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const logs: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  const only = opt('only');
  await page.goto(`${url}/?export=1${only ? `&only=${only}` : ''}`);
  await page.waitForFunction(() => (window as any).__lnc?.ready || (window as any).__lnc?.error, null, { timeout: 180000 });
  const err = await page.evaluate(() => (window as any).__lnc.error);
  if (err) throw new Error(`app failed to boot:\n${err}\n${logs.join('\n')}`);
  const sceneErrors: string[] = await page.evaluate(() => (window as any).__lnc.errors);
  if (sceneErrors.length) console.error('SCENE ERRORS:\n' + sceneErrors.join('\n'));
  return { browser, page, logs };
}

async function stills(page: Page, times: number[], outDir: string) {
  mkdirSync(outDir, { recursive: true });
  const files: string[] = [];
  for (const t of times) {
    await page.evaluate(([t, s, sh]) => (window as any).__lnc.still(t, s, sh), [t, SAMPLES, SHUTTER] as const);
    const f = path.join(outDir, `f_${t.toFixed(2).padStart(7, '0')}.png`);
    await page.screenshot({ path: f, clip: { x: 0, y: 0, width: W, height: H } });
    files.push(f);
  }
  return files;
}

async function sheet(page: Page, times: number[], cols: number, out: string, labels?: string[]) {
  const dataUrl: string = await page.evaluate(async ({ times, cols, labels, samples, shutter }) => {
    const P = (window as any).__lnc;
    const cw = 480, ch = 270, pad = 4, lab = 18;
    const rows = Math.ceil(times.length / cols);
    const cv = document.createElement('canvas');
    cv.width = cols * (cw + pad) + pad; cv.height = rows * (ch + lab + pad) + pad;
    const c = cv.getContext('2d')!;
    c.fillStyle = '#222'; c.fillRect(0, 0, cv.width, cv.height);
    const src = document.getElementById('c') as HTMLCanvasElement;
    times.forEach((t: number, i: number) => {
      P.still(t, samples, shutter);
      const x = pad + (i % cols) * (cw + pad), y = pad + Math.floor(i / cols) * (ch + lab + pad);
      c.drawImage(src, x, y + lab, cw, ch);
      c.fillStyle = '#ddd'; c.font = '13px monospace'; c.fillText(`${t.toFixed(2)}s ${labels?.[i] ?? ''}`, x + 2, y + 13);
    });
    return cv.toDataURL('image/png');
  }, { times, cols, labels, samples: SAMPLES, shutter: SHUTTER });
  mkdirSync(path.dirname(out), { recursive: true });
  await Bun.write(out, Buffer.from(dataUrl.split(',')[1]!, 'base64'));
}

async function video(page: Page, from: number, to: number, fps: number, out: string) {
  mkdirSync(path.dirname(out), { recursive: true });
  const args = ['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(fps), '-i', 'pipe:0'];
  if (!flag('noaudio')) args.push('-ss', String(from), '-t', String(to - from), '-i', AUDIO);
  // frames are sRGB: convert with the BT.709 matrix and tag the stream (players decode untagged HD as BT.709)
  args.push('-vf', 'vflip,scale=out_color_matrix=bt709:out_range=tv,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709',
    '-c:v', 'libx264', '-preset', opt('preset', 'slow')!, '-crf', opt('crf', '16')!, '-pix_fmt', 'yuv420p', '-x264-params', opt('x264', 'aq-mode=3')!);
  if (!flag('noaudio')) args.push('-c:a', 'aac', '-b:a', '320k', '-shortest');
  args.push('-movflags', '+faststart', out);
  const ff = Bun.spawn(args, { stdin: 'pipe', stdout: 'inherit', stderr: 'inherit' });
  let frames = 0;
  const total = Math.round(to * fps) - Math.round(from * fps);
  const t0 = performance.now();
  const server = Bun.serve({
    port: 0,
    fetch(req, srv) { return srv.upgrade(req) ? undefined : new Response('ws only', { status: 400 }); },
    websocket: {
      maxPayloadLength: W * H * 4 + 1024,
      async message(ws, msg) {
        ff.stdin.write(msg as Uint8Array);
        await ff.stdin.flush();
        frames++;
        ws.send(String(frames));
        if (frames % 60 === 0 || frames === total) {
          const el = (performance.now() - t0) / 1000;
          process.stdout.write(`\r${frames}/${total} frames  ${(frames / el).toFixed(1)} fps  eta ${((total - frames) / (frames / el)).toFixed(0)}s   `);
        }
      },
    },
  });
  await page.evaluate((o) => (window as any).__lnc.stream(o), { from, to, fps, ws: `ws://localhost:${server.port}`, samples: SAMPLES, shutter: SHUTTER, inflight: 3 });
  while (frames < total) await Bun.sleep(20);
  ff.stdin.end();
  await ff.exited;
  server.stop();
  console.log(`\nwrote ${out} (${frames} frames in ${((performance.now() - t0) / 1000).toFixed(1)}s)`);
}

const { url, stop } = await ensureServer();
const { browser, page, logs } = await openPage(url);
try {
  if (mode === 'gpu') {
    console.log(await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2')!;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    }));
  } else if (mode === 'stills') {
    const times = (opt('t') ?? '0').split(',').map(Number);
    console.log((await stills(page, times, path.resolve(opt('out', path.join(ROOT, 'out/stills'))!))).join('\n'));
  } else if (mode === 'sheet') {
    const tl: { id: string; start: number; end: number }[] = await page.evaluate(() => (window as any).__lnc.timeline);
    let from = +opt('from', '0')!, to = +opt('to', '10')!;
    const n = +opt('n', '12')!;
    const ent = opt('entry');
    if (ent) { const e = tl.find((x) => x.id === ent)!; from = e.start + 0.02; to = e.end - 0.02; }
    let times = Array.from({ length: n }, (_, i) => from + ((to - from) * i) / Math.max(1, n - 1));
    if (opt('times')) times = opt('times')!.split(',').map(Number);
    let labels: string[] | undefined;
    if (flag('cuts')) {
      times = tl.slice(1).flatMap((e) => [e.start - 0.1, e.start + 1 / 60, e.start + 0.15]);
      labels = tl.slice(1).flatMap((e) => ['', e.id, '']);
    }
    const out = path.resolve(opt('out', path.join(ROOT, `out/sheets/sheet_${ent ?? `${from}-${to}`}.png`))!);
    await sheet(page, times, +opt('cols', '4')!, out, labels);
    console.log(out);
  } else if (mode === 'perf') {
    const from = +opt('from', '0')!, to = +opt('to', '5')!;
    const r = await page.evaluate(async ({ from, to, samples }) => {
      const P = (window as any).__lnc;
      const ms: number[] = [];
      const buf = new Uint8Array(1920 * 1080 * 4);
      for (let t = from; t < to; t += 1 / 60) {
        const a = performance.now();
        P.engine.render(t, samples, 0.5);
        P.engine.readPixels(buf);
        ms.push(performance.now() - a);
      }
      ms.sort((a, b) => a - b);
      return { n: ms.length, avg: ms.reduce((a, b) => a + b, 0) / ms.length, p50: ms[ms.length >> 1], p95: ms[Math.floor(ms.length * 0.95)], max: ms[ms.length - 1] };
    }, { from, to, samples: SAMPLES });
    console.log(`frames ${r.n}  avg ${r.avg.toFixed(1)}ms  p50 ${r.p50!.toFixed(1)}  p95 ${r.p95!.toFixed(1)}  max ${r.max!.toFixed(1)}`);
  } else if (mode === 'video') {
    const dur: number = await page.evaluate(() => (window as any).__lnc.duration);
    await video(page, +opt('from', '0')!, +opt('to', String(dur))!, +opt('fps', '60')!, path.resolve(opt('out', path.join(ROOT, 'out/video.mp4'))!));
  }
  if (logs.length) console.error('BROWSER LOG:\n' + logs.slice(0, 40).join('\n'));
} finally {
  await browser.close();
  stop();
}

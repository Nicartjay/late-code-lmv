import audioDoc from '../../data/audio.json';
import lyricsDoc from '../../data/lyrics.json';
import { AudioData } from './engine/audio';
import { Engine } from './engine/engine';
import { loadFonts } from './engine/fonts';
import { H, W } from './engine/gl';
import { Lyrics } from './engine/lyrics';
import { buildTimeline } from './timeline';

const params = new URLSearchParams(location.search);
const EXPORT = params.has('export');
const only = params.get('only')?.split(',').filter(Boolean);
const canvas = document.getElementById('c') as HTMLCanvasElement;

interface API {
  ready: boolean; error: string | null; errors: string[]; duration: number; width: number; height: number;
  timeline: { id: string; start: number; end: number }[]; engine?: Engine;
  still?: (t: number, samples?: number, shutter?: number) => boolean;
  stream?: (o: { from: number; to: number; fps: number; ws: string; samples: number; shutter: number; inflight: number }) => Promise<number>;
}
const api: API = { ready: false, error: null, errors: [], duration: 0, width: W, height: H, timeline: [] };
(window as unknown as { __lnc: API }).__lnc = api;

async function boot() {
  if (EXPORT) document.body.classList.add('export');
  await loadFonts();
  const lyrics = new Lyrics(lyricsDoc as never);
  const audio = new AudioData(audioDoc as never);
  const engine = new Engine(canvas, lyrics, audio, buildTimeline(lyrics, audio));
  await engine.init(only);
  api.engine = engine;
  api.errors = engine.errors;
  api.duration = audio.duration;
  api.timeline = engine.timeline();
  api.still = (t, samples = 1, shutter = 0.5) => { engine.render(t, samples, shutter); return true; };
  api.stream = (o) => stream(engine, o);
  api.ready = true;
  if (!EXPORT) await preview(engine, audio.duration);
}

async function stream(engine: Engine, o: { from: number; to: number; fps: number; ws: string; samples: number; shutter: number; inflight: number }) {
  engine.fps = o.fps;
  const ws = new WebSocket(o.ws);
  ws.binaryType = 'arraybuffer';
  await new Promise<void>((res, rej) => { ws.onopen = () => res(); ws.onerror = () => rej(new Error('ws failed')); });
  let acked = 0;
  ws.onmessage = (m) => { acked = Math.max(acked, +m.data); };
  const f0 = Math.round(o.from * o.fps), f1 = Math.round(o.to * o.fps);
  const pool = Array.from({ length: o.inflight + 1 }, () => new Uint8Array(W * H * 4));
  let sent = 0;
  for (let i = f0; i < f1; i++) {
    while (sent - acked >= o.inflight) await new Promise((r) => setTimeout(r, 1));
    engine.render(i / o.fps, o.samples, o.shutter);
    const buf = pool[sent % pool.length]!;
    engine.readPixels(buf);
    ws.send(buf);
    sent++;
  }
  while (acked < sent) await new Promise((r) => setTimeout(r, 5));
  ws.close();
  return sent;
}

// ------------------------------------------------------------------ live preview
async function preview(engine: Engine, duration: number) {
  const ui = {
    play: document.getElementById('play') as HTMLButtonElement,
    time: document.getElementById('time')!,
    bar: document.getElementById('bar')!,
    fill: document.querySelector('#bar .fill') as HTMLElement,
    scene: document.getElementById('scene')!,
    fps: document.getElementById('fps')!,
  };
  for (const e of engine.timeline()) {
    const m = document.createElement('div');
    m.className = 'mark';
    m.style.left = `${(e.start / duration) * 100}%`;
    m.title = e.id;
    ui.bar.appendChild(m);
  }
  const actx = new AudioContext();
  ui.time.textContent = 'loading audio…';
  // dev server: the original WAV; the website: a 192 kbps MP3 copy (public/audio/song.mp3)
  const audioURL = import.meta.env.PROD ? `${import.meta.env.BASE_URL}audio/song.mp3` : '/audio/song.wav';
  const buf = await actx.decodeAudioData(await (await fetch(audioURL)).arrayBuffer());
  const overlay = document.getElementById('start');
  let playing = false, offset = +(params.get('t') ?? 0), startedAt = 0, src: AudioBufferSourceNode | null = null;
  let loop: { a: number; b: number } | null = null;
  const now = () => (playing ? actx.currentTime - startedAt - (actx.outputLatency || 0) : offset);
  const play = () => {
    if (playing) return;
    src = actx.createBufferSource();
    src.buffer = buf;
    src.connect(actx.destination);
    src.start(0, Math.max(0, offset));
    startedAt = actx.currentTime - offset;
    playing = true;
    ui.play.textContent = '❚❚';
    overlay?.classList.add('gone');
    void actx.resume();
  };
  const pause = () => {
    if (!playing) return;
    offset = now();
    src?.stop();
    src = null;
    playing = false;
    ui.play.textContent = '▶';
  };
  const seek = (t: number) => {
    const was = playing;
    pause();
    offset = Math.max(0, Math.min(duration - 0.01, t));
    if (was) play();
    dirty = true;
  };
  let dirty = true;
  ui.play.onclick = () => (playing ? pause() : play());
  if (overlay) {
    overlay.classList.add('ready');
    overlay.onclick = () => play();
  }
  ui.bar.onclick = (e) => {
    const r = ui.bar.getBoundingClientRect();
    seek(((e.clientX - r.left) / r.width) * duration);
  };
  window.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 5 : 1;
    const tl = engine.timeline();
    const cur = now();
    if (e.key === ' ') { e.preventDefault(); playing ? pause() : play(); }
    else if (e.key === 'ArrowLeft') seek(cur - step);
    else if (e.key === 'ArrowRight') seek(cur + step);
    else if (e.key === ',') seek(cur - 1 / 60);
    else if (e.key === '.') seek(cur + 1 / 60);
    else if (e.key === '[') { const p = [...tl].reverse().find((x) => x.start < cur - 0.25); seek(p ? p.start : 0); }
    else if (e.key === ']') { const n = tl.find((x) => x.start > cur + 0.01); if (n) seek(n.start); }
    else if (e.key === 'l') { const c = tl.filter((x) => x.start <= cur && cur < x.end).pop(); loop = loop ? null : c ? { a: c.start, b: c.end } : null; }
    else if (e.key === 'h') document.getElementById('ui')!.classList.toggle('hidden');
  });
  let last = performance.now(), frames = 0, lastT = -1;
  const tick = () => {
    let t = now();
    if (loop && t >= loop.b) { seek(loop.a); t = loop.a; }
    if (playing && t >= duration) { pause(); offset = 0; }
    if (playing || dirty || t !== lastT) {
      engine.render(Math.max(0, t));
      dirty = false;
      lastT = t;
      frames++;
    }
    const e = engine.entryAt(t);
    ui.time.textContent = `${t.toFixed(2)} / ${duration.toFixed(1)}`;
    ui.fill.style.width = `${(t / duration) * 100}%`;
    ui.scene.textContent = e ? `${e.id}${loop ? ' (loop)' : ''}` : '';
    const n = performance.now();
    if (n - last > 1000) { ui.fps.textContent = `${frames} fps`; frames = 0; last = n; }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

boot().catch((e) => {
  api.error = String((e as Error).stack ?? e);
  console.error(e);
  document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;top:0;left:0;color:#f66;white-space:pre-wrap">${api.error}</pre>`);
});

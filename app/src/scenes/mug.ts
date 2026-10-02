// mug — 11.37 → 16.27 s (L4 マグカップの底に残った / L5 冷え切って苦いだけの液体)
//  M1  near top-down mug on the dark desk, orbiting; the tired face (疲れ顔, still being sung)
//      floats on the coffee; マグカップの circles in around the rim, one mora at a time.
//  M2  底に: the camera dives into the mug — inner wall with old coffee rings as a tunnel;
//      底に / 残った lie on the little coffee left at the bottom.
//  M3  冷え切って: warmth drains (amber -> ice), frost grows in from the rim and the frame
//      edges, a thermometer readout ticks down; 苦いだけの on a roll-whip.
//  M4  液体: a drop falls, ripples push the words apart, 液体 bobs up in the middle.
import * as THREE from 'three';
import { font } from '../engine/fonts';
import { FSPass, H, Layer2D, W } from '../engine/gl';
import { Shockwave } from '../engine/fx';
import { gstate } from '../engine/kinetic';
import { LEAD, type Line } from '../engine/lyrics';
import { drawCodeLine, storyClock } from '../engine/motifs';
import { col, css, cssMix } from '../engine/palette';
import type { PostParams } from '../engine/post';
import { Scene, type Frame } from '../engine/scene';
import { Glyphs3D, tint } from '../engine/text3d';
import { clamp, ease, hash, lerp, noise1, prog, spring } from '../engine/util';
import { LIQ_Y, MugModel, R_IN, RIM_Y, rippleH } from './mug-model';

const TAU = Math.PI * 2;

interface Times { cut: number; ma: number; soko: number; noko: number; hie: number; nigai: number; eki: number; end: number }

export default class Mug extends Scene {
  scene3 = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(36, W / H, 0.05, 400);
  model = new MugModel();
  hud = new Layer2D();
  frost = new FSPass(/* glsl */ `
    uniform float amt, t;
    void main(){
      vec2 p = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
      vec2 q = abs(vUv - 0.5) * 2.0;
      float edge = max(q.x * 0.92, q.y);
      float corner = length(q);
      float n = fbm(p * 5.0 + 3.0);
      float front = amt * (0.2 + 0.16 * smoothstep(1.05, 1.4, corner)) - (1.0 - edge) + (n - 0.5) * 0.12;
      float m = smoothstep(0.0, 0.06, front);
      float cry = 0.0;
      for (int o = 0; o < 2; o++) {
        float sc = o == 0 ? 9.0 : 26.0;
        vec2 g = p * sc + float(o) * 13.7; vec2 i0 = floor(g), f0 = fract(g);
        float d1 = 8.0, d2 = 8.0;
        for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
          vec2 b = vec2(float(x), float(y)); vec2 r = b + hash22(i0 + b) - f0; float d = dot(r, r);
          if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
        }
        float edgeV = 1.0 - smoothstep(0.0, 0.09, sqrt(d2) - sqrt(d1));
        cry += edgeV * (o == 0 ? 0.9 : 0.55) + (o == 0 ? 0.12 * (1.0 - sqrt(d1)) : 0.0);
      }
      float rim = smoothstep(0.025, 0.0, abs(front - 0.02));
      vec3 c = vec3(0.32, 0.5, 0.82) * (0.18 + cry) * m + vec3(0.6, 0.85, 1.0) * rim * 0.45 * amt;
      gl_FragColor = vec4(c, clamp(m * 0.6 + rim * 0.25, 0.0, 1.0));
    }`, { amt: { value: 0 }, t: { value: 0 } }, { transparent: true, blending: THREE.NormalBlending });

  splash = new Shockwave();
  L3!: Line; L4!: Line; L5!: Line;
  T!: Times;
  face!: Glyphs3D; ring!: Glyphs3D; soko!: Glyphs3D; noko!: Glyphs3D; hie!: Glyphs3D; nigai!: Glyphs3D; eki!: Glyphs3D;
  drop!: THREE.Mesh;
  desk!: THREE.Mesh;

  async init() {
    const { lyrics: Ly } = this.ctx;
    this.L3 = Ly.get('私の顔はきっと、ひどい疲れ顔');
    const L4 = (this.L4 = Ly.get('マグカップの底に残った'));
    const L5 = (this.L5 = Ly.get('冷え切って苦いだけの液体'));
    const ws = (l: Line, s: string) => Ly.word(l, s).start - LEAD;
    this.T = {
      cut: this.ctx.start, ma: ws(L4, 'マグカップの'), soko: ws(L4, '底に'), noko: ws(L4, '残った'),
      hie: ws(L5, '冷え切って'), nigai: ws(L5, '苦いだけの'), eki: ws(L5, '液体'), end: this.ctx.end,
    };
    const S = this.scene3;
    S.add(this.model.group);
    // desk
    this.desk = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.ShaderMaterial({
      vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `varying vec3 vW;
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        void main(){
          vec2 p = vW.xz;
          float pool = exp(-length((p - vec2(-14.0, -10.0)) * vec2(0.55, 0.75)) / 9.0);
          float grain = 0.5 + 0.5 * sin(p.x * 3.1 + sin(p.y * 0.35) * 2.0 + sin(p.x * 0.7) * 1.5);
          vec3 c = vec3(0.0016, 0.0019, 0.0034) + vec3(0.012, 0.03, 0.14) * pool * (0.85 + 0.15 * grain);
          c += vec3(0.004, 0.006, 0.014) * exp(-length(p) / 14.0);
          gl_FragColor = vec4(c, 1.0);
        }`,
    }));
    this.desk.rotation.x = -Math.PI / 2;
    S.add(this.desk);
    // soft contact shadow
    const sh = new THREE.Mesh(new THREE.CircleGeometry(7.5, 64), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying vec2 vP; void main(){ float r = length(vP - vec2(0.9, -0.9)) / 7.5; gl_FragColor = vec4(0.0, 0.0, 0.0, 0.75 * pow(1.0 - clamp(r, 0.0, 1.0), 1.6)); }`,
    }));
    sh.rotation.x = -Math.PI / 2; sh.position.y = 0.01;
    S.add(sh);
    // lights: the monitor (blue, upper-left), a faint cool fill
    const key = new THREE.DirectionalLight(col('blue'), 1.5); key.position.set(-9, 12, -6); S.add(key);
    const key2 = new THREE.DirectionalLight(col('ice'), 1.1); key2.position.set(-5, 10, -8); S.add(key2);
    S.add(new THREE.HemisphereLight(0x22305a, 0x000000, 0.55));
    // the drop
    this.drop = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), new THREE.MeshBasicMaterial({ color: col('ice', 2.5), toneMapped: false }));
    this.drop.scale.set(1, 2.4, 1);
    S.add(this.drop);

    const W0 = (l: Line, s: string) => Ly.word(l, s);
    const flat = (g: Glyphs3D) => { g.group.rotation.order = 'YXZ'; g.group.rotation.x = -Math.PI / 2; S.add(g.group); return g; };
    this.face = flat(new Glyphs3D(W0(this.L3, '疲れ顔').chars, { font: 'mincho', size: 1.7, color: col('mist'), depthTest: false, renderOrder: 20 }));
    this.ring = flat(new Glyphs3D(W0(L4, 'マグカップの').chars, { font: 'sans9', size: 1.3, color: col('bone'), renderOrder: 30 }));
    this.soko = flat(new Glyphs3D(W0(L4, '底に').chars, { font: 'sans9', size: 1.3, color: col('bone'), depthTest: false, renderOrder: 21 }));
    this.noko = flat(new Glyphs3D(W0(L4, '残った').chars, { font: 'sans9', size: 1.3, color: col('bone'), depthTest: false, renderOrder: 21 }));
    this.hie = flat(new Glyphs3D(W0(L5, '冷え切って').chars, { font: 'sans9', size: 0.95, color: col('ice'), depthTest: false, renderOrder: 22 }));
    this.nigai = flat(new Glyphs3D(W0(L5, '苦いだけの').chars, { font: 'sans9', size: 0.95, color: col('bone'), depthTest: false, renderOrder: 22 }));
    this.eki = flat(new Glyphs3D(W0(L5, '液体').chars, { font: 'sans9', size: 1.45, color: col('bone'), depthTest: false, renderOrder: 23 }));
  }

  /** camera az (rad) at t: the view orbits slowly and snaps on word onsets */
  private camAz(t: number) {
    const T = this.T;
    return 0.55 + 0.32 * (t - T.cut)
      + 0.55 * ease.outExpo(clamp((t - T.soko) / 0.5))
      - 0.32 * ease.outExpo(clamp((t - T.hie) / 0.35))
      + 0.42 * ease.outBack(clamp((t - T.nigai) / 0.4))
      + 0.12 * ease.outExpo(clamp((t - T.eki) / 0.3));
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostParams {
    const { renderer, comp, audio: A } = this.ctx;
    const T = this.T, t = f.t;
    const kD = ease.outExpo(clamp((t - (T.soko - 0.05)) / 0.55)); // the dive
    const kH = ease.outExpo(clamp((t - T.hie) / 0.4));
    const eR = t - T.eki; // seconds since the drop hit
    const warm = 1 - ease.inOutCubic(clamp((t - T.hie) / 0.6));
    const frostA = ease.outCubic(clamp((t - T.hie) / 1.1));

    // ------------------------------------------------ camera
    const az = this.camAz(t);
    const dist = lerp(lerp(24.5, 22.0, prog(t, T.cut, T.soko)), lerp(12.6, 11.4, prog(t, T.soko + 0.5, T.hie)), kD) - 3.6 * kH - 0.4 * prog(t, T.hie + 0.4, T.eki) + 1.1 * (eR > 0 ? ease.outCubic(clamp(eR / 0.4)) : 0);
    const tilt = lerp(lerp(0.36, 0.3, prog(t, T.cut, T.soko)), 0.05, kD) - 0.03 * kH;
    const ty = lerp(8.2, LIQ_Y, kD);
    const shake = eR > 0 ? Math.exp(-eR / 0.12) * 0.12 : 0;
    const tgt = new THREE.Vector3(Math.sin(t * 61) * shake, ty, Math.cos(t * 53) * shake);
    const cam = this.cam;
    cam.position.set(tgt.x + dist * Math.sin(tilt) * Math.sin(az), ty + dist * Math.cos(tilt), tgt.z + dist * Math.sin(tilt) * Math.cos(az));
    cam.up.set(-Math.sin(az), 0, -Math.cos(az));
    cam.lookAt(tgt);
    cam.fov = 36 + 16 * Math.sin(Math.PI * clamp((t - (T.soko - 0.05)) / 0.6)) * (t > T.soko - 0.05 ? 1 : 0);
    cam.updateProjectionMatrix();

    // ------------------------------------------------ mug + coffee
    const mu = this.model.liqMat.uniforms;
    mu.uT!.value = t; mu.uWarm!.value = warm; mu.uFrost!.value = frostA; mu.uRip!.value = eR > 0 ? eR : -1;
    mu.uLight!.value = 1 + 0.25 * A.hit('snare', t, 0.12);
    this.model.ceramic.color.copy(col('bone')).lerp(col('ice'), 1 - warm);
    // the drop: falls in the last 0.16 s before 液
    const dropE = t - (T.eki - 0.16);
    this.drop.visible = false;
    void dropE;

    // ------------------------------------------------ text
    const R = 4.75;
    const ringOn = t < T.soko + 0.6;
    this.ring.group.visible = ringOn;
    this.ring.group.position.set(0, RIM_Y + 0.25, 0);
    this.ring.group.rotation.y = az;
    const n = this.ring.items.length;
    this.ring.items.forEach((it, i) => {
      const s = gstate(it, this.L4, t, 'char', 0.06);
      const slot = Math.PI / 2 + 0.285 * ((n - 1) / 2 - i);
      it.mesh.visible = s.vis;
      if (!s.vis) return;
      const fly = s.on ? ease.outExpo(clamp(s.since / 0.32)) : 0;
      const a = slot - (1 - fly) * 0.55;
      const rr = R + (1 - fly) * 2.6 + 3.0 * kD;
      it.mesh.position.set(Math.cos(a) * rr, Math.sin(a) * rr, 0);
      it.mesh.rotation.set(0, 0, a - Math.PI / 2);
      it.mesh.scale.setScalar(s.on ? 1 + 0.25 * Math.exp(-s.since / 0.08) : 0.92);
      tint(it.mesh, s.on ? col('bone', 1 + 2.6 * Math.exp(-s.since / 0.12)) : col('steel'), s.on ? 1 - kD : 0.3 * (1 - kD));
    });

    // the tired face, still floating in the coffee until マ
    const fa = 1 - prog(t, T.ma - 0.05, T.ma + 0.25, ease.inQuad);
    this.face.group.visible = fa > 0.01;
    this.face.group.position.set(0, LIQ_Y + 0.03, 0);
    this.face.group.rotation.y = az;
    this.face.items.forEach((it, i) => {
      it.mesh.position.set(it.x * 0.92, -it.y + 0.15 * Math.sin(t * 2.2 + i), 0);
      it.mesh.rotation.set(0, 0, 0.12 * Math.sin(t * 1.7 + i * 1.3) + (i === 2 ? 0.16 : 0));
      tint(it.mesh, col('mist', 0.9), 0.85 * fa);
    });

    const surf = (g: Glyphs3D, line: Line, cx: number, cy: number, o: { vis?: number; color: string; inten?: number; antic?: number; sink?: number }) => {
      g.group.position.set(0, LIQ_Y + 0.03, 0);
      g.group.rotation.y = az;
      let any = false;
      for (const it of g.items) {
        const s = gstate(it, line, t, 'word', o.antic ?? 0.3);
        it.mesh.visible = s.vis && (o.vis ?? 1) > 0.01;
        if (!it.mesh.visible) continue;
        any = true;
        // local (screen-aligned) position on the surface
        const lx = cx + it.x, ly = cy - it.y;
        // to world (for the ripple): local x -> world (cos az, -sin az)… use local coords (ripple is radial)
        const h = rippleH(lx, ly, eR);
        const bob = 0.04 * Math.sin(t * 2.0 + it.gi * 0.9);
        const pop = s.on ? spring(s.since, 2.6, 0.38) : 1;
        const sink = o.sink ?? 0;
        it.mesh.position.set(lx, ly, h * 1.4 + bob - sink * 0.5 + (s.on ? 0.5 * (1 - pop) : 0));
        it.mesh.rotation.set(-(rippleH(lx, ly + 0.15, eR) - h) * 3.0, (rippleH(lx + 0.15, ly, eR) - h) * 3.0, 0.04 * Math.sin(t * 1.3 + it.gi));
        it.mesh.scale.setScalar(s.on ? 0.6 + 0.4 * pop : 1);
        const fl = s.on ? Math.exp(-s.since / 0.12) : 0;
        tint(it.mesh, s.on ? col(o.color, (o.inten ?? 1) + 2.4 * fl) : col('steel'), (s.on ? 1 : 0.28) * (o.vis ?? 1) * (1 - sink));
      }
      g.group.visible = any;
    };
    const sinkL4 = prog(t, T.hie - 0.08, T.hie + 0.16, ease.inCubic);
    surf(this.soko, this.L4, 0, 1.0 + 1.6 * sinkL4, { color: 'bone', vis: kD > 0.05 ? 1 : 0, sink: sinkL4 });
    surf(this.noko, this.L4, 0, -0.78 - 1.6 * sinkL4, { color: 'bone', vis: kD > 0.05 ? 1 : 0, sink: sinkL4, antic: 0.25 });
    const push = eR > 0 ? ease.outCubic(clamp(eR / 0.45)) : 0;
    surf(this.hie, this.L5, 0, 0.62 + 0.72 * push, { color: 'ice', inten: 1.15, antic: 0.25 });
    surf(this.nigai, this.L5, 0, -0.62 - 0.72 * push, { color: 'mist', inten: 1.05, antic: 0.25 });
    surf(this.eki, this.L5, 0, 0, { color: 'bone', inten: 1.2, vis: eR > -0.02 ? 1 : 0, antic: 0 });

    this.draw(this.scene3, cam, out);
    this.frost.u.amt!.value = frostA * (1 - 0.15 * push);
    this.frost.u.t!.value = t;
    if (frostA > 0.001) this.frost.render(renderer, out);
    if (eR > 0 && eR < 1.2) {
      this.splash.render(renderer, out, eR, { center: [0.5, 0.5], color: [0.5, 0.75, 1.4], speed: 0.9, width: 0.012 });
      this.splash.render(renderer, out, eR - 0.12, { center: [0.5, 0.5], color: [0.25, 0.4, 0.9], speed: 0.75, width: 0.008 });
    }

    // ------------------------------------------------ HUD
    const c = this.hud.clear();
    this.clock(c, f);
    if (t > T.noko - 0.1) this.readout(c, f);
    comp.draw(renderer, this.hud.upload(), out);

    return {
      bloom: 0.75, vignette: 0.55, grain: 0.05, ca: 1.3,
      zoomBlur: 0.5 * Math.sin(Math.PI * clamp((t - (T.soko - 0.05)) / 0.5)) * (t > T.soko - 0.05 ? 1 : 0),
      flash: eR >= 0 && eR < 0.08 ? 0.18 * (1 - eR / 0.08) : 0, flashColor: [0.6, 0.8, 1],
      saturation: 1 - 0.15 * (1 - warm),
    };
  }

  private clock(c: CanvasRenderingContext2D, f: Frame) {
    const s = storyClock(f.t);
    c.save();
    c.font = font('dot', 34); c.fillStyle = css('mist', 0.75);
    c.fillText(s.slice(0, 2), 112, 134);
    const w1 = c.measureText(s.slice(0, 2)).width;
    c.globalAlpha = f.beatPhase < 0.5 ? 1 : 0.25; c.fillText(':', 112 + w1, 134);
    c.globalAlpha = 1; c.fillText(s.slice(3), 112 + w1 + c.measureText(':').width, 134);
    c.restore();
  }

  /** right-side readout: coffee.level, then the temperature dropping under 冷え切って */
  private readout(c: CanvasRenderingContext2D, f: Frame) {
    const T = this.T, t = f.t;
    const x = W - 250, top = 330, bot = 790;
    const kT = ease.outQuad(clamp((t - T.hie) / 0.75));
    const temp = lerp(61.8, 12.4, kT) + (kT > 0 && kT < 1 ? (hash(f.frame >> 1, 2) - 0.5) * 0.6 : 0);
    const appear = ease.outExpo(clamp((t - (T.noko - 0.1)) / 0.3));
    c.save();
    c.globalAlpha = appear;
    c.translate((1 - appear) * 60, 0);
    c.fillStyle = css('ink', 0.72);
    c.beginPath(); c.roundRect(x - 150, top - 120, 210, bot - top + 190, 18); c.fill();
    // level / temp label
    c.font = font('dot', 24); c.textAlign = 'right'; c.fillStyle = css('steel', 0.95);
    c.fillText(t < T.hie ? 'coffee.level' : 'coffee.temp', x + 30, top - 64);
    c.font = font('dot', 54);
    const warmC = cssMix('amber', 'ice', kT);
    c.fillStyle = t < T.hie ? css('mist') : warmC;
    c.shadowColor = t < T.hie ? 'transparent' : warmC; c.shadowBlur = 18;
    c.fillText(t < T.hie ? '0.08' : `${temp.toFixed(1)}°C`, x + 30, top - 14);
    c.shadowBlur = 0;
    // thermometer tube
    const tw = 26;
    c.fillStyle = css('ink3', 0.9); c.strokeStyle = css('steel', 0.6); c.lineWidth = 2;
    c.beginPath(); c.roundRect(x - tw / 2, top + 10, tw, bot - top - 10, tw / 2); c.fill(); c.stroke();
    c.beginPath(); c.arc(x, bot + 16, 26, 0, TAU); c.fill(); c.stroke();
    const lvl = t < T.hie ? 0.08 : lerp(0.82, 0.12, kT);
    const fy = lerp(bot, top + 20, t < T.hie ? 0.1 : lvl);
    c.fillStyle = t < T.hie ? css('amber', 0.85) : warmC;
    c.shadowColor = c.fillStyle; c.shadowBlur = 16;
    c.beginPath(); c.roundRect(x - 7, fy, 14, bot - fy + 10, 7); c.fill();
    c.beginPath(); c.arc(x, bot + 16, 17, 0, TAU); c.fill();
    c.shadowBlur = 0;
    // ticks
    c.strokeStyle = css('steel', 0.7); c.lineWidth = 2;
    for (let i = 0; i <= 10; i++) {
      const y = lerp(bot, top + 20, i / 10);
      c.beginPath(); c.moveTo(x - tw / 2 - (i % 5 === 0 ? 22 : 12), y); c.lineTo(x - tw / 2 - 4, y); c.stroke();
    }
    c.restore();
    // code line under 冷え切って: coffee: "cold",
    if (t > T.hie + 0.25) {
      const k = clamp((t - T.hie - 0.25) / 0.4);
      const line = '  coffee: "cold",';
      c.save(); c.fillStyle = css('ink', 0.72); c.beginPath(); c.roundRect(104, H - 168, 470, 70, 14); c.fill(); c.restore();
      drawCodeLine(c, line, 124, H - 133, 34, { maxChars: Math.floor(k * line.length) });
    }
    void noise1;
  }
}

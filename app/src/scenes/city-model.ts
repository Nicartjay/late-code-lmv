// A procedural night city at 2 AM: ~10k instanced towers with an anti-aliased lit-window
// facade shader + distance fog, a dark street grid, a sky dome, and OUR tower at the origin
// whose only lit window is ours (separate emissive quad + a constant-size point glow).
// Units: metres. Our window faces -z (toward downtown, ~2.6 km away at -z).
import * as THREE from 'three';
import { GLSL_COMMON } from '../engine/gl';
import { mulberry32 } from '../engine/util';

export const WIN = { x: 0, y: 29.1, z: 0, w: 3.0, h: 2.2 }; // our window (centre, size), in the facade z = 0
export const DOWNTOWN = new THREE.Vector3(150, 0, -2600);

const FOG = /* glsl */ `
  uniform float uFog, uCity, uT, uDarkR, uDark;
  vec3 fogit(vec3 c, float d, vec3 dir) {
    float f = 1.0 - exp(-d / uFog);
    vec3 fc = (vec3(0.004, 0.007, 0.022) + vec3(0.006, 0.014, 0.05) * exp(-abs(dir.y) * 6.0)) * (1.0 - 0.92 * uDark);
    return mix(c, fc, f);
  }`;

export class CityModel {
  group = new THREE.Group();
  cityMat: THREE.ShaderMaterial;
  groundMat: THREE.ShaderMaterial;
  skyMat: THREE.ShaderMaterial;
  windowMat: THREE.ShaderMaterial;
  glowMat: THREE.ShaderMaterial;
  wallMat: THREE.ShaderMaterial;
  glassMat: THREE.ShaderMaterial;
  interior = new THREE.Group(); // the wall around our window, seen from inside (L6 shot)
  windowCount = 0;

  constructor() {
    const shared = { uFog: { value: 2600 }, uCity: { value: 1 }, uT: { value: 0 }, uDarkR: { value: 1e5 }, uDark: { value: 0 } };
    // ------------------------------------------------------------ towers
    const rnd = mulberry32(20261002);
    type B = { x: number; z: number; w: number; d: number; h: number; lit: number; seed: number };
    const bs: B[] = [];
    const STEP = 70;
    for (let gx = -55; gx <= 55; gx++) {
      for (let gz = -60; gz <= 30; gz++) {
        const cx = gx * STEP, cz = gz * STEP;
        const dd = Math.hypot(cx - DOWNTOWN.x, cz - DOWNTOWN.z);
        const r0 = Math.hypot(cx, cz);
        if (r0 > 4300) continue;
        if (Math.abs(cx) < 60 && cz > -80 && cz < 80) continue; // clear around our tower
        const down = Math.max(0, 1 - dd / 950);
        const n = 1 + Math.floor(rnd() * 3);
        for (let k = 0; k < n; k++) {
          const w = 14 + rnd() * 26, d = 12 + rnd() * 24;
          const x = cx + (rnd() - 0.5) * (STEP - w - 12), z = cz + (rnd() - 0.5) * (STEP - d - 12);
          let h = 7 + Math.pow(rnd(), 2.2) * 34;
          if (down > 0) h = Math.max(h, 40 + Math.pow(rnd(), 1.3) * 260 * down + 60 * down);
          else if (rnd() < 0.04) h = 45 + rnd() * 50;
          const lit = down > 0 ? 0.07 + 0.16 * down : 0.03 + rnd() * 0.025;
          bs.push({ x, z, w, d, h, lit, seed: rnd() * 1000 });
        }
      }
    }
    // our tower (all windows dark: lit = 0; ours is a separate quad)
    bs.push({ x: 0, z: 9, w: 24, d: 18, h: 44, lit: 0.0, seed: 7 });
    const N = bs.length;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const aInfo = new Float32Array(N * 2);
    bs.forEach((b, i) => { aInfo[i * 2] = b.lit; aInfo[i * 2 + 1] = b.seed; });
    geo.setAttribute('aInfo', new THREE.InstancedBufferAttribute(aInfo, 2));
    this.cityMat = new THREE.ShaderMaterial({
      uniforms: shared,
      vertexShader: /* glsl */ `
        attribute vec2 aInfo; varying vec3 vW; varying vec3 vN; varying vec2 vInfo; varying vec3 vScale;
        void main(){
          vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vW = w.xyz; vInfo = aInfo;
          vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        ${GLSL_COMMON}
        ${FOG}
        varying vec3 vW; varying vec3 vN; varying vec2 vInfo;
        void main(){
          vec3 c;
          float top = step(0.5, vN.y);
          vec2 fc = abs(vN.x) > 0.5 ? vec2(vW.z, vW.y) : vec2(vW.x, vW.y);
          vec2 cs = vec2(2.8, 3.3);
          vec2 g = fc / cs;
          vec2 cell = floor(g), f = fract(g);
          float win = smoothstep(0.16, 0.2, f.x) * smoothstep(0.84, 0.8, f.x) * smoothstep(0.24, 0.28, f.y) * smoothstep(0.86, 0.82, f.y);
          float h = hash13(vec3(cell, vInfo.y + floor(vN.x * 2.0 + vN.z * 3.0) * 17.0));
          float lit = step(1.0 - vInfo.x, h);
          float tone = hash12(cell + vInfo.y);
          vec3 lc = mix(vec3(0.85, 0.89, 0.97), vec3(0.55, 0.78, 1.0), tone) * (0.9 + 2.2 * hash12(cell * 1.7));
          float px = length(fwidth(g));
          float aa = smoothstep(0.35, 0.9, px);
          float L = mix(win * lit, 0.42 * vInfo.x, aa);
          L *= step(length(vW.xz) + vInfo.y * 0.45, uDarkR);
          vec3 facade = (vec3(0.004, 0.005, 0.009) + vec3(0.002, 0.004, 0.012) * (1.0 - win) * step(0.5, abs(vN.x) + abs(vN.z))) * (1.0 - 0.8 * uDark);
          c = facade + lc * L * uCity * (1.0 - top);
          c += vec3(0.002, 0.003, 0.008) * top;
          vec3 dv = vW - cameraPosition;
          c = fogit(c, length(dv), normalize(dv));
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    const mesh = new THREE.InstancedMesh(geo, this.cityMat, N);
    const m4 = new THREE.Matrix4();
    bs.forEach((b, i) => { m4.makeScale(b.w, b.h, b.d).setPosition(b.x, b.h / 2, b.z); mesh.setMatrixAt(i, m4); });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    this.group.add(mesh);
    this.windowCount = Math.round(bs.reduce((s, b) => s + (2 * (b.w + b.d) / 2.8) * (b.h / 3.3), 0));

    // ------------------------------------------------------------ ground (streets)
    this.groundMat = new THREE.ShaderMaterial({
      uniforms: shared,
      vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `
        ${GLSL_COMMON}
        ${FOG}
        varying vec3 vW;
        void main(){
          vec2 p = vW.xz;
          vec2 q = p / 70.0 + 0.5;
          vec2 fq = fract(q);
          vec2 dR = min(fq, 1.0 - fq) * 70.0;          // metres to the nearest road centre-line (per axis)
          float onRoad = smoothstep(4.5, 3.0, min(dR.x, dR.y));
          // street lamps: a pool at each intersection, a few dark
          vec2 cellI = floor(q + 0.5);
          float on = step(0.22, hash12(cellI + 4.0));
          float dI = length(dR);
          float pool = exp(-dI * dI / 30.0) * on * (0.6 + 0.8 * hash12(cellI));
          float px = length(fwidth(q));
          float far = smoothstep(0.04, 0.2, px);
          float L = mix(pool * 0.55 + onRoad * 0.03, 0.02, far);
          L *= step(length(cellI * 70.0) + hash12(cellI + 9.0) * 400.0, uDarkR);
          float r = length(vW.xz);
          vec3 c = vec3(0.0012, 0.0016, 0.0032) + vec3(0.32, 0.36, 0.45) * L * uCity;
          vec3 dv = vW - cameraPosition;
          c = fogit(c, length(dv), normalize(dv));
          c *= smoothstep(4600.0, 3600.0, r);
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(12000, 12000), this.groundMat);
    ground.rotation.x = -Math.PI / 2;
    this.group.add(ground);

    // ------------------------------------------------------------ sky
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: shared, side: THREE.BackSide, depthWrite: false,
      vertexShader: `varying vec3 vD; void main(){ vD = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
      fragmentShader: /* glsl */ `
        uniform float uCity, uDark; varying vec3 vD;
        void main(){
          vec3 d = normalize(vD);
          float hz = exp(-abs(d.y) * 9.0);
          float dome = exp(-length(vec2(d.x - 0.06, d.z + 1.0)) * 3.0) * exp(-max(d.y, 0.0) * 5.0);
          vec3 c = (vec3(0.0018, 0.0024, 0.006) + vec3(0.008, 0.02, 0.07) * hz * (0.4 + 0.6 * uCity) + vec3(0.01, 0.025, 0.08) * dome * uCity) * (1.0 - 0.9 * uDark);
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), this.skyMat);
    sky.frustumCulled = false;
    sky.renderOrder = -10;
    sky.onBeforeRender = (_r, _s, cam) => { sky.position.copy(cam.position); sky.scale.setScalar(5000); };
    this.group.add(sky);

    // ------------------------------------------------------------ our window (seen from outside)
    this.windowMat = new THREE.ShaderMaterial({
      uniforms: { uI: { value: 1 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uI; varying vec2 vUv;
        void main(){
          vec2 p = vUv;
          // the room behind the glass, lit by the monitor (lower right of the room = lower left from outside)
          float mon = exp(-length((p - vec2(0.68, 0.22)) * vec2(1.3, 2.2)) * 2.4);
          vec3 c = vec3(0.04, 0.10, 0.42) * (0.3 + 0.7 * (1.0 - p.y)) + vec3(0.55, 0.75, 1.0) * mon * 1.7;
          float curtain = smoothstep(0.31, 0.27, p.x) * step(0.04, p.x);
          float folds = 0.55 + 0.45 * sin(p.x * 70.0 + sin(p.y * 6.0) * 0.6);
          c = mix(c, vec3(0.012, 0.02, 0.06) * folds + vec3(0.03, 0.06, 0.2) * mon * 0.4, curtain * 0.9);
          c *= 1.0 - 0.75 * smoothstep(0.16, 0.13, p.y) * step(0.32, p.x);
          // frame + centre mullion
          float fr = step(0.03, p.x) * step(p.x, 0.97) * step(0.04, p.y) * step(p.y, 0.96);
          float mul = 1.0 - step(abs(p.x - 0.5), 0.012);
          c *= fr * mul;
          gl_FragColor = vec4(c * uI, 1.0);
        }`,
    });
    const wq = new THREE.Mesh(new THREE.PlaneGeometry(WIN.w, WIN.h), this.windowMat);
    wq.position.set(WIN.x, WIN.y, WIN.z - 0.03);
    wq.rotation.y = Math.PI; // faces -z
    this.group.add(wq);
    // constant-size glow so it never disappears when we are kilometres away
    this.glowMat = new THREE.ShaderMaterial({
      uniforms: { uI: { value: 1 }, uSize: { value: 14 } }, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
      vertexShader: `uniform float uSize; void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_PointSize = uSize; }`,
      fragmentShader: `uniform float uI; void main(){ vec2 q = gl_PointCoord - 0.5; float d = length(q);
        float a = exp(-d * d * 160.0) * 2.0 + 0.3 * exp(-d * d * 18.0);
        float st = exp(-abs(q.x) * 90.0) * exp(-abs(q.y) * 7.0) + exp(-abs(q.y) * 90.0) * exp(-abs(q.x) * 7.0);
        gl_FragColor = vec4(vec3(0.6, 0.8, 1.6) * (a + st * 0.6) * uI, 1.0); }`,
    });
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.Float32BufferAttribute([WIN.x, WIN.y, WIN.z - 0.1], 3));
    const pts = new THREE.Points(pg, this.glowMat);
    pts.frustumCulled = false;
    pts.renderOrder = 50;
    this.group.add(pts);

    // ------------------------------------------------------------ interior wall + glass (L6 shot)
    this.wallMat = new THREE.ShaderMaterial({
      vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `
        varying vec3 vW;
        void main(){
          // lit faintly by the monitor below-right, behind the camera
          float g = exp(-length((vW.xy - vec2(1.6, ${(WIN.y - 2.2).toFixed(2)})) * vec2(0.5, 0.8)) * 0.9);
          vec3 c = vec3(0.0025, 0.003, 0.006) + vec3(0.006, 0.016, 0.07) * g;
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    const hw = WIN.w / 2, hh = WIN.h / 2;
    const panel = (w: number, h: number, x: number, y: number, z: number, d = 0.25) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.wallMat);
      m.position.set(x, y, z); this.interior.add(m);
    };
    panel(12, 8, -hw - 6, WIN.y, 0.12);
    panel(12, 8, hw + 6, WIN.y, 0.12);
    panel(WIN.w, 6, 0, WIN.y + hh + 3, 0.12);
    panel(WIN.w, 6, 0, WIN.y - hh - 3, 0.12);
    // window frame + centre mullion
    const frameMat = new THREE.MeshBasicMaterial({ color: 0x07090f });
    const bar = (w: number, h: number, x: number, y: number) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), frameMat); m.position.set(x, y, 0.02); this.interior.add(m); };
    bar(0.07, WIN.h, 0, WIN.y);
    bar(WIN.w, 0.08, 0, WIN.y + hh - 0.04);
    bar(WIN.w, 0.1, 0, WIN.y - hh + 0.05);
    bar(0.08, WIN.h, -hw + 0.04, WIN.y);
    bar(0.08, WIN.h, hw - 0.04, WIN.y);
    // the glass: a faint reflection of the monitor behind us
    this.glassMat = new THREE.ShaderMaterial({
      uniforms: { uI: { value: 1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uI; varying vec2 vUv;
        void main(){
          vec2 p = vUv;
          vec2 q = (p - vec2(0.68, 0.3)) / vec2(0.2, 0.13);
          float r = max(abs(q.x), abs(q.y));
          float refl = (1.0 - smoothstep(0.85, 1.25, r)) * 0.05 + exp(-r * 1.5) * 0.02;
          float streak = exp(-pow((p.x + p.y * 0.4 - 0.55) * 9.0, 2.0)) * 0.012;
          vec3 c = vec3(0.12, 0.3, 1.0) * refl + vec3(0.5, 0.65, 1.0) * streak;
          gl_FragColor = vec4(c * uI, 1.0);
        }`,
    });
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(WIN.w, WIN.h), this.glassMat);
    glass.position.set(WIN.x, WIN.y, 0.0);
    glass.renderOrder = 5;
    this.interior.add(glass);
    this.group.add(this.interior);
  }

  set(t: number, city: number, fog: number, darkR = 1e5, dark = 0) {
    this.cityMat.uniforms.uDarkR!.value = darkR;
    this.cityMat.uniforms.uDark!.value = dark;
    this.cityMat.uniforms.uT!.value = t;
    this.cityMat.uniforms.uCity!.value = city;
    this.cityMat.uniforms.uFog!.value = fog;
  }
}

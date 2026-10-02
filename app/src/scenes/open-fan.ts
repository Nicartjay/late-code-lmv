// A 120 mm PC fan in 3D: extruded frame (with screw holes), shader blades with analytic
// rotational motion blur + a stationary specular glint, hub with a spinning sticker, rear struts.
// Units: 1 = 10 mm (frame is 12 x 12 x 2.5). Facing +z.
import * as THREE from 'three';
import { col } from '../engine/palette';

const BLADES = 7;
const R_OPEN = 5.72; // frame opening radius
const R_TIP = 5.55; // blade tip
const R_HUB = 1.95;

function stickerTexture() {
  const S = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#0b0e19';
  c.beginPath(); c.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); c.fill();
  c.strokeStyle = 'rgba(154,166,194,0.55)'; c.lineWidth = 5;
  c.beginPath(); c.arc(S / 2, S / 2, S / 2 - 18, 0, Math.PI * 2); c.stroke();
  c.lineWidth = 2;
  c.beginPath(); c.arc(S / 2, S / 2, S / 2 - 92, 0, Math.PI * 2); c.stroke();
  // ring text
  const txt = 'BRUSHLESS  DC 12V  0.20A  ·  MODEL LNC-1202  ·  ';
  c.fillStyle = 'rgba(196,236,255,0.85)';
  c.font = '600 34px "lnc-mono8"';
  c.textAlign = 'center'; c.textBaseline = 'middle';
  const n = txt.length;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    c.save();
    c.translate(S / 2 + Math.cos(a - Math.PI / 2) * (S / 2 - 55), S / 2 + Math.sin(a - Math.PI / 2) * (S / 2 - 55));
    c.rotate(a);
    c.fillText(txt[i]!, 0, 0);
    c.restore();
  }
  // centre: a small embossed circle
  c.strokeStyle = 'rgba(154,166,194,0.35)'; c.lineWidth = 3;
  c.beginPath(); c.arc(S / 2, S / 2, 46, 0, Math.PI * 2); c.stroke();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export class Fan {
  group = new THREE.Group();
  rotor = new THREE.Group(); // hub cap (spins)
  bladeMat: THREE.ShaderMaterial;
  stickerMat: THREE.ShaderMaterial;
  ledMat: THREE.MeshBasicMaterial;
  frameMat: THREE.MeshStandardMaterial;

  constructor() {
    // ---------------------------------------------------------------- frame
    const S = 6, R = 0.85;
    const shape = new THREE.Shape();
    shape.moveTo(-S + R, -S);
    shape.lineTo(S - R, -S); shape.quadraticCurveTo(S, -S, S, -S + R);
    shape.lineTo(S, S - R); shape.quadraticCurveTo(S, S, S - R, S);
    shape.lineTo(-S + R, S); shape.quadraticCurveTo(-S, S, -S, S - R);
    shape.lineTo(-S, -S + R); shape.quadraticCurveTo(-S, -S, -S + R, -S);
    const hole = new THREE.Path(); hole.absarc(0, 0, R_OPEN, 0, Math.PI * 2, true); shape.holes.push(hole);
    for (const [x, y] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
      const h = new THREE.Path(); h.absarc(x * 5.02, y * 5.02, 0.3, 0, Math.PI * 2, true); shape.holes.push(h);
    }
    const fg = new THREE.ExtrudeGeometry(shape, { depth: 2.3, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.12, bevelSegments: 3, curveSegments: 96 });
    fg.translate(0, 0, -1.15);
    this.frameMat = new THREE.MeshStandardMaterial({ color: 0x141a2c, roughness: 0.42, metalness: 0.25 });
    const frame = new THREE.Mesh(fg, this.frameMat);
    this.group.add(frame);

    // rear struts + motor mount
    const strutMat = new THREE.MeshStandardMaterial({ color: 0x10141f, roughness: 0.6, metalness: 0.1 });
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + (k * Math.PI) / 2;
      const len = 6.2;
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.38, len, 0.3), strutMat);
      b.position.set(Math.cos(a) * (R_HUB + len / 2 - 0.4), Math.sin(a) * (R_HUB + len / 2 - 0.4), -1.0);
      b.rotation.z = a - Math.PI / 2;
      this.group.add(b);
    }
    const mount = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, 0.5, 64), strutMat);
    mount.rotation.x = Math.PI / 2; mount.position.z = -1.0;
    this.group.add(mount);

    // ---------------------------------------------------------------- blades (shader disc)
    this.bladeMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: {
        uTheta: { value: 0 }, uSpan: { value: 0 }, uLight: { value: 1 }, uGlintA: { value: 2.2 },
        uKey: { value: new THREE.Vector3(...col('blue').toArray()) }, uRim: { value: new THREE.Vector3(...col('ice').toArray()) },
      },
      vertexShader: /* glsl */ `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        #define TAU 6.28318530718
        uniform float uTheta, uSpan, uLight, uGlintA; uniform vec3 uKey, uRim; varying vec2 vP;
        void main(){
          float r = length(vP);
          if (r > ${R_TIP.toFixed(2)} || r < ${(R_HUB - 0.05).toFixed(2)}) discard;
          float a = atan(vP.y, vP.x);
          float rn = clamp((r - ${R_HUB.toFixed(2)}) / ${(R_TIP - R_HUB).toFixed(2)}, 0.0, 1.0);
          float sector = TAU / ${BLADES.toFixed(1)};
          float sweep = 0.95 * rn * rn + 0.35 * rn;
          float w = mix(0.52, 0.74, rn);
          float soft = 0.035 / (max(r, 0.5) * sector);
          float acc = 0.0, lead = 0.0, face = 0.0;
          const int N = 16;
          for (int k = 0; k < N; k++) {
            float ak = a - uTheta + uSpan * (float(k) / float(N - 1) - 0.5);
            float u = fract((ak - sweep) / sector);
            float m = smoothstep(0.0, soft, u) * smoothstep(w, w - soft, u);
            acc += m;
            lead += m * smoothstep(w * 0.35, 0.0, w - u);   // leading edge (u near w)
            face += m * (u / w);
          }
          acc /= float(N); lead /= float(N); face /= float(N);
          // tip ring rounding
          float tip = smoothstep(${R_TIP.toFixed(2)}, ${(R_TIP - 0.06).toFixed(2)}, r);
          acc *= tip;
          vec3 base = vec3(0.010, 0.012, 0.022);
          vec3 c = base * acc + uKey * 0.10 * face * uLight + uKey * 0.06 * acc * rn * uLight;
          // stationary glint where the key light reflects (world angle)
          float da = atan(sin(a - uGlintA), cos(a - uGlintA));
          float gl = exp(-da * da / 0.10) * smoothstep(0.15, 0.8, rn);
          c += uRim * gl * lead * 1.6 * uLight;
          gl_FragColor = vec4(c, acc * 0.94);
        }`,
    });
    const blades = new THREE.Mesh(new THREE.CircleGeometry(R_TIP, 160), this.bladeMat);
    blades.renderOrder = 2;
    this.group.add(blades);

    // ---------------------------------------------------------------- hub (spinning sticker)
    const hubMat = new THREE.MeshStandardMaterial({ color: 0x0d111d, roughness: 0.35, metalness: 0.3 });
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(R_HUB, R_HUB * 0.97, 1.3, 96, 1, true), hubMat);
    hub.rotation.x = Math.PI / 2; hub.position.z = 0.1;
    this.group.add(hub);
    this.stickerMat = new THREE.ShaderMaterial({
      uniforms: { map: { value: stickerTexture() }, uTheta: { value: 0 }, uSpan: { value: 0 }, uLight: { value: 1 } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map; uniform float uTheta, uSpan, uLight; varying vec2 vUv;
        vec2 rot(vec2 p, float a){ float c = cos(a), s = sin(a); return vec2(c*p.x - s*p.y, s*p.x + c*p.y); }
        void main(){
          vec2 p = vUv - 0.5;
          vec4 acc = vec4(0.0);
          for (int k = 0; k < 10; k++) {
            float ak = -uTheta + uSpan * (float(k) / 9.0 - 0.5);
            acc += texture2D(map, rot(p, ak) + 0.5);
          }
          acc /= 10.0;
          gl_FragColor = vec4(acc.rgb * (0.35 + 0.65 * uLight), 1.0);
        }`,
    });
    const cap = new THREE.Mesh(new THREE.CircleGeometry(R_HUB, 96), this.stickerMat);
    cap.position.z = 0.76;
    this.rotor.add(cap);
    this.group.add(this.rotor);

    // inner LED ring
    this.ledMat = new THREE.MeshBasicMaterial({ color: col('cyan', 2), toneMapped: false });
    const led = new THREE.Mesh(new THREE.TorusGeometry(R_OPEN + 0.02, 0.035, 8, 200), this.ledMat);
    led.position.z = 1.28;
    this.group.add(led);
  }

  /** theta: rotor angle (rad), omega: angular velocity (rad/s), shutter (s) */
  update(theta: number, omega: number, shutter: number, light = 1, led = 1) {
    const span = Math.min(Math.abs(omega) * shutter, Math.PI);
    this.bladeMat.uniforms.uTheta!.value = theta;
    this.bladeMat.uniforms.uSpan!.value = span;
    this.bladeMat.uniforms.uLight!.value = light;
    this.stickerMat.uniforms.uTheta!.value = theta;
    this.stickerMat.uniforms.uSpan!.value = span;
    this.stickerMat.uniforms.uLight!.value = light;
    this.ledMat.color.copy(col('cyan', 0.25 + 2.2 * led));
  }
}

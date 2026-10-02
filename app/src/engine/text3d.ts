// troika-three-text helpers: crisp SDF text (any Japanese font) in 3D or screen space.
// Create every Text in init() (layout is async); in render() only change transforms,
// color, fillOpacity / outline / stroke opacity — never text/font/fontSize.
import * as THREE from 'three';
import { Text, configureTextBuilder } from 'troika-three-text';
import { fontURL, type FontKey } from './fonts';
import { layoutGlyphs, type Glyph, type LayoutOpts } from './kinetic';
import type { Char, Line } from './lyrics';

configureTextBuilder({
  sdfGlyphSize: 128,
  textureWidth: 4096,
  defaultFontURL: fontURL('sans4'),
  unicodeFontsURL: `${import.meta.env.BASE_URL}fonts/_no_fallback_/`, // never fetch fallback fonts from a CDN
});

const pending = new Set<Promise<void>>();
function track(t: Text) {
  const p = new Promise<void>((res) => t.sync(() => res()));
  pending.add(p);
  void p.then(() => pending.delete(p));
  return t;
}
/** resolves when every Text created so far has finished typesetting */
export async function syncAll() {
  while (pending.size) await Promise.all([...pending]);
}

export type Blend = 'normal' | 'add';
const mats = new Map<string, THREE.MeshBasicMaterial>();
export function textMaterial(blend: Blend = 'normal', depthTest = false) {
  const key = `${blend}|${depthTest}`;
  let m = mats.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({
      transparent: true, depthWrite: false, depthTest, side: THREE.DoubleSide, toneMapped: false,
      blending: blend === 'add' ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    mats.set(key, m);
  }
  return m;
}

export interface T3 {
  font: FontKey;
  size: number;
  color?: THREE.ColorRepresentation;
  opacity?: number;
  anchorX?: 'left' | 'center' | 'right' | number;
  anchorY?: 'top' | 'top-baseline' | 'middle' | 'bottom-baseline' | 'bottom' | number;
  tracking?: number; // em
  lineHeight?: number;
  maxWidth?: number;
  align?: 'left' | 'center' | 'right';
  outlineWidth?: number | string;
  outlineColor?: THREE.ColorRepresentation;
  outlineBlur?: number | string;
  outlineOpacity?: number;
  strokeWidth?: number | string;
  strokeColor?: THREE.ColorRepresentation;
  blend?: Blend;
  depthTest?: boolean;
  renderOrder?: number;
  curveRadius?: number;
}

/** one troika Text (multi-character strings, code, labels) */
export function text3d(str: string, o: T3): Text {
  const t = new Text();
  t.text = str;
  t.font = fontURL(o.font);
  t.fontSize = o.size;
  t.letterSpacing = o.tracking ?? 0;
  t.lineHeight = o.lineHeight ?? 1.2;
  t.anchorX = o.anchorX ?? 'center';
  t.anchorY = o.anchorY ?? 'middle';
  if (o.maxWidth) t.maxWidth = o.maxWidth;
  t.textAlign = o.align ?? 'left';
  t.color = o.color !== undefined ? new THREE.Color(o.color as THREE.ColorRepresentation) : new THREE.Color(1, 1, 1);
  t.fillOpacity = o.opacity ?? 1;
  if (o.outlineWidth !== undefined) t.outlineWidth = o.outlineWidth;
  if (o.outlineColor !== undefined) t.outlineColor = new THREE.Color(o.outlineColor as THREE.ColorRepresentation);
  if (o.outlineBlur !== undefined) t.outlineBlur = o.outlineBlur;
  if (o.outlineOpacity !== undefined) t.outlineOpacity = o.outlineOpacity;
  if (o.strokeWidth !== undefined) t.strokeWidth = o.strokeWidth;
  if (o.strokeColor !== undefined) t.strokeColor = new THREE.Color(o.strokeColor as THREE.ColorRepresentation);
  if (o.curveRadius) t.curveRadius = o.curveRadius;
  t.material = textMaterial(o.blend ?? 'normal', o.depthTest ?? false);
  t.renderOrder = o.renderOrder ?? 10;
  t.frustumCulled = false;
  return track(t);
}

export interface G3Item extends Glyph { mesh: Text; }

/**
 * Per-character meshes for a lyric line (or any string), laid out with the font's
 * advances (horizontal or 縦書き). Units are px when used with screenCamera();
 * in a 3D scene pass a world-unit `size`. y is UP in this group (layout is flipped).
 */
export class Glyphs3D {
  group = new THREE.Group();
  items: G3Item[] = [];
  width: number;
  height: number;
  line?: Line;
  constructor(src: string | Line | Char[], o: T3 & Omit<LayoutOpts, 'font' | 'size'>) {
    if (typeof src !== 'string' && !Array.isArray(src)) this.line = src;
    const lay = layoutGlyphs(src, { ...o });
    this.width = lay.width;
    this.height = lay.height;
    for (const g of lay.glyphs) {
      if (g.c === ' ') continue;
      const mesh = text3d(g.c, { ...o, anchorX: 'center', anchorY: 'middle', tracking: 0 });
      mesh.position.set(g.x, -g.y, 0);
      mesh.rotation.z = g.rot;
      this.group.add(mesh);
      this.items.push({ ...g, mesh });
    }
  }
  /** reset every glyph to its layout transform */
  reset() {
    for (const it of this.items) {
      it.mesh.position.set(it.x, -it.y, 0);
      it.mesh.rotation.set(0, 0, it.rot);
      it.mesh.scale.setScalar(1);
      it.mesh.visible = true;
    }
  }
}

/** set color (linear, may exceed 1 for bloom) + opacity of a troika Text */
export function tint(t: Text, c: THREE.Color, opacity = 1) {
  const cur = t.color as THREE.Color;
  if (cur && (cur as THREE.Color).isColor) cur.copy(c);
  else t.color = c.clone();
  t.fillOpacity = opacity;
  if (t.outlineWidth) t.outlineOpacity = opacity;
}

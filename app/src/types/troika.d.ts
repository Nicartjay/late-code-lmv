declare module 'troika-three-text' {
  import { Mesh, Material, Color, Texture } from 'three';
  export class Text extends Mesh {
    text: string; font: string | null; fontSize: number; letterSpacing: number; lineHeight: number | string;
    maxWidth: number; textAlign: string; anchorX: number | string; anchorY: number | string;
    color: number | string | Color | null; fillOpacity: number; outlineWidth: number | string;
    outlineColor: number | string | Color; outlineOpacity: number; outlineBlur: number | string;
    outlineOffsetX: number | string; outlineOffsetY: number | string;
    strokeWidth: number | string; strokeColor: number | string | Color; strokeOpacity: number;
    curveRadius: number; depthOffset: number; sdfGlyphSize: number | null; glyphGeometryDetail: number;
    gpuAccelerateSDF: boolean; clipRect: [number, number, number, number] | null; direction: string;
    material: Material; textRenderInfo: any; whiteSpace: string; overflowWrap: string;
    sync(cb?: () => void): void; dispose(): void;
  }
  export function configureTextBuilder(cfg: Record<string, unknown>): void;
  export function preloadFont(opts: { font: string; characters?: string | string[]; sdfGlyphSize?: number }, cb: () => void): void;
}

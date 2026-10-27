// Diagonal watermark: "SYNTHETIC SAMPLE: not issued by {company}" at -30 degrees, 28 pt, #777777, opacity 0.30, tiled every 300 px.
// Drawn as vector outlines (not text) so the PDF text layer stays readable; the PDF also carries the same sentence as a real header line.
import { pathData, width } from "./fonts";
import { PAGE_H, PAGE_W, SCALE, watermarkText } from "./model";

export const WM = { size: 28, angle: -30, color: "#777777", opacity: 0.3, pitchPx: 300 } as const;
export interface Tile { x: number; y: number; d: string }

export function watermarkTiles(company: string): Tile[] {
  const text = watermarkText(company);
  const d = pathData("sans", text, 0, 0, WM.size);
  const textW = width("sans", text, WM.size);
  const rad = (Math.abs(WM.angle) * Math.PI) / 180;
  const pitchY = WM.pitchPx / SCALE; // 148.5 pt between rows
  const pitchX = textW * Math.cos(rad) + WM.pitchPx / SCALE;
  const tiles: Tile[] = [];
  for (let r = 0; r < 10; r++) {
    const y = -60 + r * pitchY;
    const shift = (r % 2) * (pitchX / 2);
    for (let c = -2; c < 3; c++) {
      const x = -pitchX * 0.35 + shift + c * pitchX;
      const reach = textW * Math.cos(rad);
      if (x > PAGE_W || x + reach < 0 || y < 0 || y - textW * Math.sin(rad) > PAGE_H) continue;
      tiles.push({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, d });
    }
  }
  return tiles;
}

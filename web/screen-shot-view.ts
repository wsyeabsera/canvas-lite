// Browser side of screen_image (pure helpers and their tests: web/screen-shot.ts).
import { shotSize, shotSvg } from "./screen-shot.ts";

/** Browser only: the screen html as base64 PNG text (no data: prefix). Rejects when the image cannot load or the canvas is tainted. */
export async function renderScreenPng(html: string, w: number, h: number): Promise<string> {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const root = doc.documentElement;
  root.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
  const xhtml = new XMLSerializer().serializeToString(root);
  const { width, height, scale } = shotSize(w, h);
  const img = new Image();
  const loaded = new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("the screen html could not be drawn as an image"));
  });
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(shotSvg(xhtml, w, h))}`;
  await loaded;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas context");
  ctx.scale(scale, scale);
  ctx.drawImage(img, 0, 0);
  return canvas.toDataURL("image/png").slice("data:image/png;base64,".length);
}

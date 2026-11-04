import { tokens } from "../design/tokens/tokens";
import { API_BASE } from "./life-session";
import type { Review } from "./review";
import { normalizeShareLines } from "./share-copy";

export function fitPosterLines(text: string, width: number, maxLines: number, measure: (value: string) => number): string[] {
  const characters = [...new Intl.Segmenter("zh", { granularity: "grapheme" }).segment(text.replace(/\s+/gu, " ").trim())].map((item) => item.segment);
  const lines: string[] = [];
  let line: string[] = [];
  for (const character of characters) {
    if (line.length && measure(line.join("") + character) > width) {
      if (lines.length === maxLines - 1) {
        while (line.length && measure(line.join("") + "…") > width) line.pop();
        lines.push(line.join("") + "…");
        return lines;
      }
      lines.push(line.join(""));
      line = [];
    }
    line.push(character);
  }
  if (line.length) lines.push(line.join(""));
  return lines;
}

async function loadImage(path: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = `${API_BASE}/${path}`;
  await image.decode();
  return image;
}

export async function createSharePoster(review: Review, selectedLine?: string): Promise<Blob> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const [logo, qr] = await Promise.race([
    Promise.all([loadImage("findjoy-logo.svg"), loadImage("findjoy-qr.png"), document.fonts.ready]),
    new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new Error("图片素材加载超时，请重试。")), 15_000);
    }),
  ]).finally(() => clearTimeout(timeout));
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1620;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前浏览器暂不支持生成图片，请换个浏览器重试。");
  context.scale(2, 2);
  const color = tokens.color;
  const sans = tokens.typography.family.ui;
  const serif = `'Songti SC', ${tokens.typography.family.display}`;
  const drawText = (value: string, x: number, y: number, size: number, ink: string, width: number, lines = 1, lineHeight = size * 1.5, family = sans, weight = 400) => {
    context.font = `${weight} ${size}px ${family}`;
    context.fillStyle = ink;
    fitPosterLines(value, width, lines, (text) => context.measureText(text).width)
      .forEach((text, index) => context.fillText(text, x, y + index * lineHeight));
  };

  context.fillStyle = color.brand;
  context.fillRect(0, 0, 540, 810);
  drawText("A LIFE REMEMBERED", 44, 38, 10, color["text-inverse"], 440, 1, 15, sans, 600);
  drawText("我在人间", 44, 94, 44, color["text-inverse"], 440, 1, 55, serif);
  drawText("走了一回", 44, 149, 44, color["text-inverse"], 440, 1, 55, serif);
  drawText("人生没有答案，只有选择", 44, 192, 12, color["text-inverse"], 440);
  context.fillStyle = color["text-inverse"];
  context.beginPath();
  context.roundRect(24, 220, 492, 526, 24);
  context.fill();
  context.drawImage(logo, 16, 226, 172.8, 59.4);
  const candidates = normalizeShareLines(review.shareLines);
  const line = selectedLine && candidates.includes(selectedLine) ? selectedLine : "人生没有答案，只有选择。";
  drawText("一段模拟人生，一次新的看见", 52, 306, 12, color.brand, 436);
  drawText(line, 52, 380, 30, color.text, 436, 4, 42, serif, 600);
  drawText("如果这是你的一生，你会怎么选？", 52, 590, 18, color.text, 436, 2, 25, serif);

  context.strokeStyle = color.border;
  context.setLineDash([3, 3]);
  context.beginPath();
  context.moveTo(24, 650);
  context.lineTo(516, 650);
  context.stroke();
  context.setLineDash([]);
  context.fillStyle = color.brand;
  for (const x of [24, 516]) {
    context.beginPath();
    context.arc(x, 650, 10, 0, 2 * Math.PI);
    context.fill();
  }
  drawText("换作你，会怎么选？", 52, 682, 18, color.text, 300, 1, 27, sans, 500);
  drawText("长按识别二维码", 52, 708, 11, color["text-muted"], 300);
  drawText("来 FindJoy，经历另一种人生", 52, 727, 11, color["text-muted"], 300);
  context.drawImage(qr, 416, 662, 72, 72);
  context.textAlign = "center";
  drawText("FINDJOY 觅乐 · 另一种人生，另一种可能", 270, 780, 11, color["text-inverse"], 480);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => {
    if (blob) resolve(blob);
    else reject(new Error("图片生成失败，请重试。"));
  }, "image/png"));
}

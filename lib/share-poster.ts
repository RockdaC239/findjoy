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

export interface PosterMoment {
  age: string;
  text: string;
}

function splitPosterMoment(moment: string): PosterMoment {
  const match = moment.match(/^(\d{1,3})\s*岁[，,]\s*(.+)$/u);
  if (match) return { age: `${match[1]} 岁`, text: match[2]!.replace(/。$/u, "").trim() };
  const later = moment.match(/^(往后|后来|晚年)\s*[，,]\s*(.+)$/u);
  if (later) return { age: later[1]!, text: later[2]!.replace(/。$/u, "").trim() };
  return { age: "往后", text: moment.replace(/。$/u, "").trim() };
}

// 海报只取三个跨度最大的节点：早年、人生中段、晚年；不把整份回顾塞进图片。
export function selectPosterMoments(moments: string[] | undefined, limit = 3): PosterMoment[] {
  const all = (moments ?? []).map((moment) => moment.trim()).filter(Boolean);
  if (!all.length) return [];
  const count = Math.min(limit, all.length);
  const indexes = count === 1
    ? [0]
    : Array.from({ length: count }, (_, index) => Math.round(index * (all.length - 1) / (count - 1)));
  return [...new Set(indexes)].map((index) => splitPosterMoment(all[index]!)).slice(0, limit);
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
    const fitted = fitPosterLines(value, width, lines, (text) => context.measureText(text).width);
    fitted.forEach((text, index) => context.fillText(text, x, y + index * lineHeight));
    return fitted;
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
  const identity = [review.modeLabel, typeof review.age === "number" ? `享年 ${review.age} 岁` : ""].filter(Boolean).join(" · ") || "一段模拟人生";
  drawText(identity, 52, 300, 11, color.brand, 436);
  const quoteLines = drawText(line, 52, 330, 30, color.text, 436, 3, 42, serif, 600);
  const moments = selectPosterMoments(Array.isArray(review.moments) ? review.moments : []);
  let momentY = 330 + quoteLines.length * 42 + 16;
  for (const moment of moments) {
    drawText(moment.age, 52, momentY, 14, color["accent-readable"], 56, 1, 25, sans);
    drawText(moment.text, 120, momentY, 14, color.text, 368, 1, 25, sans);
    momentY += 33;
  }
  const questionY = Math.max(560, Math.min(590, momentY + 14));
  drawText("如果这是你的一生", 52, questionY, 18, color.text, 436, 1, 28, serif);
  drawText("你愿意这样活吗？", 52, questionY + 28, 18, color.text, 436, 1, 28, serif);

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

export type StreamedChoice = { id: string; text: string };

export type StreamedEvent = {
  story: string;
  title: string;
  choices: StreamedChoice[];
  timePassed?: number;
};

function readStringField(input: string, field: string) {
  const match = input.match(new RegExp(`"${field}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)`));
  if (!match) return "";
  try {
    return JSON.parse(`"${match[1].replace(/\\\\$/g, "")}"`) as string;
  } catch {
    return match[1].replace(/\\n/g, "\n").replace(/\\"/g, '"');
  }
}

// 数值字段读取：timePassed 是流式 JSON 的第一个字段，数字可能还在传输中（"timePassed":3,
// 或 "timePassed": 3.0），只取已完整到达的整数部分。
function readNumberField(input: string, field: string): number | undefined {
  const match = input.match(new RegExp(`"${field}"\\s*:\\s*(\\d+(?:\\.\\d+)?)`));
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isFinite(value) ? Math.floor(value) : undefined;
}

// 兼容模型以任意字段顺序输出选项对象（{"id":"A","text":"..."} 或 {"text":"...","id":"A"}），
// 也兼容空格/换行等宽松格式，避免流式播放时卡片内容闪跳（先空、后突然出现另一份文案）。
function extractStreamedChoices(input: string): StreamedChoice[] {
  const choices: StreamedChoice[] = [];
  const objectPattern = /\{[^{}]*\}/g;
  for (const block of input.matchAll(objectPattern)) {
    const raw = block[0];
    const idMatch = raw.match(/"id"\s*:\s*"((?:\\.|[^"\\])*)"/);
    const textMatch = raw.match(/"text"\s*:\s*"((?:\\.|[^"\\])*)"/);
    if (!idMatch || !textMatch) continue;
    try {
      choices.push({ id: JSON.parse(`"${idMatch[1]}"`) as string, text: JSON.parse(`"${textMatch[1]}"`) as string });
    } catch {
      /* 跳过尚未完整流式到达的对象 */
    }
  }
  return choices;
}

export function readStreamedEvent(input: string): StreamedEvent {
  const choices = extractStreamedChoices(input);
  return {
    story: readStringField(input, "story"),
    title: readStringField(input, "title"),
    choices,
    timePassed: readNumberField(input, "timePassed") ?? readNumberField(input, "time_passed"),
  };
}

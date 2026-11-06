export type StreamedChoice = { id: string; text: string };

export type StreamedEvent = {
  outcome?: "continue" | "death";
  narration?: string;
  story: string;
  title: string;
  choices: StreamedChoice[];
  timePassed?: number;
};

// Scan one value without treating delimiters inside JSON strings as structure.
function valueEnd(input: string, start: number): number {
  let depth = 0;
  let quoted = false;
  for (let i = start; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === "\\") i++;
      else if (char === '"') {
        quoted = false;
        if (depth === 0) return i + 1;
      }
    } else if (char === '"') quoted = true;
    else if (char === "{" || char === "[") depth++;
    else if (char === "}" || char === "]") {
      if (depth === 0) return i;
      if (--depth === 0) return i + 1;
    } else if (char === "," && depth === 0) return i;
  }
  return input.length;
}

function fields(input: string): Record<string, string> {
  const result: Record<string, string> = Object.create(null);
  let index = input.search(/\S/);
  if (input[index] !== "{") return result;
  index++;
  while (index < input.length) {
    while (/\s/.test(input[index] ?? "") && index < input.length) index++;
    if (input[index] !== '"') break;
    const end = valueEnd(input, index);
    let key: string;
    try { key = JSON.parse(input.slice(index, end)) as string; } catch { break; }
    index = end;
    while (index < input.length && /\s/.test(input[index])) index++;
    if (input[index++] !== ":") break;
    while (index < input.length && /\s/.test(input[index])) index++;
    const valueStart = index;
    index = valueEnd(input, index);
    result[key] = input.slice(valueStart, index);
    while (index < input.length && /\s/.test(input[index])) index++;
    if (input[index++] !== ",") break;
  }
  return result;
}

function stringValue(raw = ""): string {
  if (!raw.startsWith('"')) return "";
  let body = "";
  for (let i = 1; i < raw.length; i++) {
    const char = raw[i];
    if (char === '"') break;
    if (char === "\\") {
      const length = raw[i + 1] === "u" ? 6 : 2;
      if (i + length > raw.length) break;
      body += raw.slice(i, i + length);
      i += length - 1;
    } else body += char;
  }
  try { return JSON.parse(`"${body}"`) as string; } catch { return ""; }
}

function choicesValue(raw = ""): StreamedChoice[] {
  if (!raw.startsWith("[")) return [];
  const choices: StreamedChoice[] = [];
  let index = 1;
  while (index < raw.length) {
    while (index < raw.length && /\s/.test(raw[index])) index++;
    const end = valueEnd(raw, index);
    if (end === index) break;
    try {
      const value = JSON.parse(raw.slice(index, end)) as StreamedChoice | null;
      if (value && typeof value.id === "string" && typeof value.text === "string") choices.push({ id: value.id, text: value.text });
    } catch { break; }
    index = end;
    while (index < raw.length && /\s/.test(raw[index])) index++;
    if (raw[index++] !== ",") break;
  }
  return choices;
}

export function readStreamedEvent(input: string): StreamedEvent {
  const root = fields(input);
  const outcome = stringValue(root.outcome);
  const number = (root.timePassed ?? root.time_passed ?? "").match(/^\d+(?:\.\d+)?/);
  const timePassed = number ? Math.floor(Number(number[0])) : undefined;
  return {
    ...(outcome === "death" || outcome === "continue" ? { outcome } : {}),
    ...(root.narration !== undefined ? { narration: stringValue(root.narration) } : {}),
    story: stringValue(root.story),
    title: stringValue(fields(root.event ?? "").title),
    choices: outcome === "death" ? [] : choicesValue(root.choices),
    timePassed: Number.isFinite(timePassed) ? timePassed : undefined,
  };
}

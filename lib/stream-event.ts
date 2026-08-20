export type StreamedChoice = { id: string; text: string };

export type StreamedEvent = {
  story: string;
  title: string;
  choices: StreamedChoice[];
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

export function readStreamedEvent(input: string): StreamedEvent {
  const choices = Array.from(input.matchAll(/\{\s*"id"\s*:\s*"((?:\\.|[^"\\])*)"\s*,\s*"text"\s*:\s*"((?:\\.|[^"\\])*)"\s*\}/g)).flatMap((match) => {
    try {
      return [{ id: JSON.parse(`"${match[1]}"`) as string, text: JSON.parse(`"${match[2]}"`) as string }];
    } catch {
      return [];
    }
  });
  return { story: readStringField(input, "story"), title: readStringField(input, "title"), choices };
}

export type SseMessage = { event: string; data: string };

export function encodeSseMessage(event: string, payload: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

export function parseSseMessages(input: string): { messages: SseMessage[]; remainder: string } {
  const blocks = input.split("\n\n");
  const remainder = blocks.pop() ?? "";
  const messages = blocks.flatMap((block) => {
    const event = block.split("\n").find((line) => line.startsWith("event:"))?.slice(6).trim() ?? "message";
    const data = block.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
    return data ? [{ event, data }] : [];
  });
  return { messages, remainder };
}

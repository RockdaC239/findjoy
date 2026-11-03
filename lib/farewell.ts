export function farewellLines(story: string | undefined, cause: string): string[] {
  const lines = story?.trim().split(/(?<=[。！？])\s*|\n+/u).map(line => line.trim()).filter(Boolean);
  return lines?.length ? lines : [`你${cause}。`, "这一生，停在了这里。"];
}

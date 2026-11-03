export interface NarrativeDirection { content: string; sourceEventId: string }
export interface NarrativePerson { id: string; relation: string; want: string; sharedMemory: string; sourceEventId: string; status?: "active" | "inactive" }
export interface NarrativeThread extends NarrativeDirection { id: string; status: "open" | "closed" }
export interface NarrativeUpdate { direction?: NarrativeDirection; people?: NarrativePerson[]; threads?: NarrativeThread[] }
export interface NarrativeState { version: 1; direction?: NarrativeDirection; people: NarrativePerson[]; threads: NarrativeThread[] }

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
export function boundedText(value: unknown, max = 160): string | undefined {
  return typeof value === "string" && value.trim() && value.trim().length <= max ? value.trim() : undefined;
}
function id(value: unknown): string | undefined {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(value) ? value : undefined;
}
export function boundedStrings(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length > 16 || value.some(item => !boundedText(item, 80))) return undefined;
  return [...new Set(value.map(item => (item as string).trim()))];
}
function direction(value: unknown): NarrativeDirection | undefined {
  const row = record(value);
  const content = boundedText(row?.content), sourceEventId = id(row?.sourceEventId);
  return content && sourceEventId ? { content, sourceEventId } : undefined;
}
export function normalizeNarrative(value: unknown): NarrativeUpdate | undefined {
  const input = record(value);
  if (!input) return undefined;
  const people: NarrativePerson[] = [];
  for (const value of (Array.isArray(input.people) ? input.people : []).slice(0, 4)) {
    const row = record(value);
    const personId = id(row?.id), relation = boundedText(row?.relation, 40), want = boundedText(row?.want), sharedMemory = boundedText(row?.sharedMemory), sourceEventId = id(row?.sourceEventId);
    if (personId && relation && want && sharedMemory && sourceEventId && (row?.status === undefined || row.status === "active" || row.status === "inactive")) {
      people.push({ id: personId, relation, want, sharedMemory, sourceEventId, ...(row?.status ? { status: row.status as "active" | "inactive" } : {}) });
    }
  }
  const threads: NarrativeThread[] = [];
  for (const value of (Array.isArray(input.threads) ? input.threads : []).slice(0, 3)) {
    const row = record(value), facts = direction(value), threadId = id(row?.id);
    if (facts && threadId && (row?.status === "open" || row?.status === "closed")) threads.push({ ...facts, id: threadId, status: row.status });
  }
  const nextDirection = direction(input.direction);
  return nextDirection || people.length || threads.length ? { ...(nextDirection ? { direction: nextDirection } : {}), people, threads } : undefined;
}

export function resolveNarrativeReferences(update: NarrativeUpdate | undefined, eventId: string, historyIds: readonly string[]): NarrativeUpdate | undefined {
  const normalized = normalizeNarrative(update);
  if (!normalized) return undefined;
  const valid = new Set([...historyIds, eventId]);
  const source = <T extends { sourceEventId: string }>(value: T): T | undefined => {
    const sourceEventId = value.sourceEventId === "current" ? eventId : value.sourceEventId;
    return valid.has(sourceEventId) ? { ...value, sourceEventId } : undefined;
  };
  return {
    direction: normalized.direction ? source(normalized.direction) : undefined,
    people: (normalized.people ?? []).flatMap(person => { const accepted = source(person); return accepted ? [accepted] : []; }),
    threads: (normalized.threads ?? []).flatMap(thread => { const accepted = source(thread); return accepted ? [accepted] : []; }),
  };
}

export function applyNarrative(previous: NarrativeState | undefined, update: NarrativeUpdate | undefined, eventId: string, historyIds: readonly string[]): NarrativeState | undefined {
  const normalized = resolveNarrativeReferences(update, eventId, historyIds);
  if (!normalized) return previous;
  const people = new Map((previous?.people ?? []).map(person => [person.id, person]));
  for (const person of normalized.people ?? []) {
    people.delete(person.id);
    if (person.status !== "inactive") people.set(person.id, person);
  }
  const threads = new Map((previous?.threads ?? []).map(thread => [thread.id, thread]));
  for (const thread of normalized.threads ?? []) {
    threads.delete(thread.id);
    if (thread.status === "open") threads.set(thread.id, thread);
  }
  const nextDirection = normalized.direction;
  return { version: 1, direction: nextDirection ?? previous?.direction, people: [...people.values()].slice(-4), threads: [...threads.values()].slice(-3) };
}

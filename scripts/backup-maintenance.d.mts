export function parseBackupTime(name: string): number | null;
export function selectExpiredBackups(entries: Array<{ name: string }>, options?: {
  keepDaily?: number;
  keepWeekly?: number;
}): string[];
export function pruneBackups(directory: string, options?: {
  keepDaily?: number;
  keepWeekly?: number;
}): Promise<string[]>;
export function copyOffsite(archive: string, manifest: string, env?: Record<string, string | undefined>): Promise<{ configured: boolean; target?: string }>;
export function sendAlert(env: Record<string, string | undefined>, alert: { kind: string; stage: string }): Promise<boolean>;

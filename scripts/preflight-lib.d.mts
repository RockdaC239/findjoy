export interface PreflightCheck {
  name: string;
  status: "pass" | "warn" | "fail";
  detail: string;
}

export const REQUIRED_TABLES: string[];

export function staticChecks(env: Record<string, string | undefined>, options?: {
  allowHttp?: boolean;
  allowLocalModelConfig?: boolean;
  allowPrivilegedRole?: boolean;
  requireBackup?: boolean;
  requireOffsite?: boolean;
  requireAlert?: boolean;
}): PreflightCheck[];

export function databaseChecks(metadata: {
  serverVersionNum: number;
  serverVersion: string;
  database: string;
  inRecovery: boolean;
  role: { name: string; superuser: boolean; createdb: boolean; createrole: boolean };
  history: Array<{ version: string; checksum: string }>;
  tableAccess: boolean;
  sequenceAccess: boolean;
  connections?: { used: number; max: number };
}, expectedMigrations: Array<{ version: string; checksum: string }>, options?: {
  allowPrivilegedRole?: boolean;
}): PreflightCheck[];

export function backupChecks(latest: {
  completedAt: string;
  bytes: number;
  sha256?: string;
  archiveExists: boolean;
  archiveBytes: number;
  checksumMatches?: boolean;
} | null, options?: {
  requireBackup?: boolean;
  maxBackupAgeHours?: number;
  now?: number;
}): PreflightCheck[];

export function diskChecks(freeBytes: number, minFreeGb: number, label?: string): PreflightCheck[];
export function summarize(checks: PreflightCheck[]): { ok: boolean; fails: number; warnings: number; passes: number };
export function formatChecks(checks: PreflightCheck[]): string;

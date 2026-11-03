export const DEVELOPER_MODE_COOKIE = "findjoy_developer";
export const MOCK_MODE_COOKIE = "findjoy_mock";
export interface DeveloperMode { enabled: boolean; mock: boolean }
export function readDeveloperMode(header: string | null): DeveloperMode {
  const cookies = new Map((header ?? "").split(";").map(part => { const [key, value] = part.trim().split("="); return [key, value] as const; }));
  const enabled = cookies.get(DEVELOPER_MODE_COOKIE) === "1";
  return { enabled, mock: enabled && cookies.get(MOCK_MODE_COOKIE) === "1" };
}

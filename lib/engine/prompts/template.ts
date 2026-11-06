export function renderPrompt(template: string, values: Record<string, string | number> = {}): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    if (!Object.hasOwn(values, key)) throw new Error(`缺少提示词变量：${key}`);
    return String(values[key]);
  });
}

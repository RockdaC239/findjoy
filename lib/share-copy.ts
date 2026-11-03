// 只筛去可机械识别的敏感内容；隐含身份仍须生成约束和用户预览确认。
export function normalizeShareLines(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((line): line is string => typeof line === "string")
    .map(line => line.trim()).filter(line => line.length >= 8 && [...line].length <= 32
      && !/[\d@\n\r]|https?:|www\.|手机号|身份证|病史|疾病|诊断|癌症|抑郁|债务|负债|收入|工资|住址|公司名|出轨|离婚|家暴/iu.test(line)))].slice(0, 3);
}

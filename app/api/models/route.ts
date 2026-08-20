import { NextResponse } from "next/server";
import { getProvider, normalizeRemoteModels } from "../../../lib/provider-catalog";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const providerId = typeof body.providerId === "string" ? body.providerId : "";
  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  const provider = getProvider(providerId);

  if (!provider) return NextResponse.json({ error: "不支持的供应商" }, { status: 400 });
  if (!apiKey) return NextResponse.json({ error: "请先填写 API Key" }, { status: 400 });

  try {
    const response = await fetch(`${provider.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });
    if (!response.ok) return NextResponse.json({ error: "未能读取可用模型，请检查 Key 权限或直接使用推荐模型" }, { status: response.status });
    const models = normalizeRemoteModels(await response.json());
    if (!models.length) return NextResponse.json({ error: "该供应商未返回可用模型，请使用推荐模型" }, { status: 422 });
    return NextResponse.json({ models });
  } catch {
    return NextResponse.json({ error: "读取模型列表失败，请稍后重试或使用推荐模型" }, { status: 502 });
  }
}

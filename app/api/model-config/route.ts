import { NextResponse } from "next/server";
import { getModelConfigMode, getLocalModelConfigPath, maskModelConfig, readLocalModelConfig, writeLocalModelConfig } from "../../../lib/model-config";

function environmentView() {
  const apiKey = (process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || "").trim();
  return {
    providerId: (process.env.LLM_PROVIDER || "environment").trim(),
    model: (process.env.LLM_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini").trim(),
    hasApiKey: Boolean(apiKey),
    apiKeyHint: apiKey ? `****${apiKey.slice(-4)}` : undefined,
  };
}

export async function GET() {
  const mode = getModelConfigMode();
  return NextResponse.json({ mode, config: mode === "local" ? maskModelConfig(readLocalModelConfig(getLocalModelConfigPath())) : environmentView() });
}

export async function PUT(request: Request) {
  if (getModelConfigMode() !== "local") {
    return NextResponse.json({ error: "线上环境由服务端统一配置模型，不能修改" }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  try {
    const config = writeLocalModelConfig(body, getLocalModelConfigPath());
    return NextResponse.json({ mode: "local", config: maskModelConfig(config) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "模型配置保存失败" }, { status: 400 });
  }
}

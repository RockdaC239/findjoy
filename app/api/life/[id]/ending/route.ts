import { NextResponse } from "next/server";
import { generateEnding, sanitizeModelConfig } from "../../../../../lib/model-adapter";
import { lifeStore } from "../../../../../lib/life-store";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const state = lifeStore.get(id);
  if (!state) return NextResponse.json({ error: "人生不存在" }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  const ending = await generateEnding(state, sanitizeModelConfig(body.modelConfig));
  return NextResponse.json({ ending });
}

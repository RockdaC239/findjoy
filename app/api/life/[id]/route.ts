import { NextResponse } from "next/server";
import { lifeStore } from "../../../../lib/life-store";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const state = lifeStore.get(id);
  if (!state) return NextResponse.json({ error: "人生不存在" }, { status: 404 });
  return NextResponse.json({ state });
}

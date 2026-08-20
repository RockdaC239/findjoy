import { NextResponse } from "next/server";
import { lifeStore } from "../../../../lib/life-store";
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) { const { id } = await params; const state = lifeStore.get(id); return state ? NextResponse.json({ state }) : NextResponse.json({ error: "人生不存在" }, { status: 404 }); }

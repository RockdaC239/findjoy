import { NextResponse } from "next/server";
import { buildEnding } from "../../../../../lib/life";
import { lifeStore } from "../../../../../lib/life-store";
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) { const { id } = await params; const state = lifeStore.get(id); return state ? NextResponse.json({ ending: buildEnding(state) }) : NextResponse.json({ error: "人生不存在" }, { status: 404 }); }

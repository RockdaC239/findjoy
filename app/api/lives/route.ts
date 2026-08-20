import { NextResponse } from "next/server";
import { lifeStore } from "../../../lib/life-store";

export async function GET() {
  return NextResponse.json({ lives: lifeStore.listSummaries() });
}

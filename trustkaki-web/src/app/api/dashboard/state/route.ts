import { NextResponse } from "next/server";
import { readDashboardState } from "@/lib/persistence/trustkakiRepository";

export async function GET() {
  try {
    const state = await readDashboardState();
    return NextResponse.json(state);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to read dashboard state", detail: message },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { resetDemoPersistence } from "@/lib/persistence/trustkakiRepository";

export async function POST() {
  try {
    const persistence = await resetDemoPersistence();
    return NextResponse.json({ persistence });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to reset demo data", detail: message },
      { status: 500 }
    );
  }
}

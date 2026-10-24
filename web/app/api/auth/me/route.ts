import { NextResponse } from "next/server";

import { getSessionPrincipal } from "@/lib/session";

export async function GET() {
  try {
    const principal = await getSessionPrincipal();
    if (!principal) {
      return NextResponse.json(
        { ok: false, error: "Authentication required." },
        { status: 401 },
      );
    }

    return NextResponse.json({
      ok: true,
      user: {
        id: principal.user._id.toHexString(),
        username: principal.user.username,
        displayName: principal.user.displayName,
        email: principal.user.email ?? "",
        role: principal.role.name,
      },
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Authentication service unavailable." },
      { status: 503 },
    );
  }
}

import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";

import { COLLECTIONS, type AuditLogDocument, type RoleDocument, type UserDocument } from "@/lib/db-types";
import { getDatabase } from "@/lib/mongodb";
import { createSessionToken, getSessionCookieOptions, SESSION_COOKIE_NAME } from "@/lib/session";

const USERNAME_PATTERN = /^[a-z0-9._-]{1,64}$/;
const GENERIC_LOGIN_ERROR = "Invalid username or password.";

async function recordLoginAudit(
  actorUsername: string,
  action: "LOGIN_SUCCESS" | "LOGIN_FAILED",
  actorUserId: ObjectId | null = null,
) {
  try {
    const db = await getDatabase();
    await db.collection<AuditLogDocument>(COLLECTIONS.auditLogs).insertOne({
      actorUserId,
      actorUsername,
      action,
      details: action === "LOGIN_SUCCESS" ? "Successful login." : "Invalid login attempt.",
      createdAt: new Date(),
    });
  } catch {
    // Keep audit storage failures out of responses and logs; never include credentials.
    console.error("Authentication audit event could not be written.");
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const username = typeof input.username === "string" ? input.username.trim().toLowerCase() : "";
  const password = typeof input.password === "string" ? input.password : "";

  if (!USERNAME_PATTERN.test(username) || !password || Buffer.byteLength(password, "utf8") > 72) {
    if (USERNAME_PATTERN.test(username)) {
      await recordLoginAudit(username, "LOGIN_FAILED");
    }
    return NextResponse.json({ ok: false, error: GENERIC_LOGIN_ERROR }, { status: 400 });
  }

  try {
    const db = await getDatabase();
    const user = await db.collection<UserDocument>(COLLECTIONS.users).findOne(
      { username },
      { projection: { username: 1, displayName: 1, passwordHash: 1, roleId: 1, status: 1 } },
    );

    const passwordMatches = user ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!user || !passwordMatches || user.status !== "active") {
      await recordLoginAudit(username, "LOGIN_FAILED");
      return NextResponse.json({ ok: false, error: GENERIC_LOGIN_ERROR }, { status: 401 });
    }

    const role = await db.collection<RoleDocument>(COLLECTIONS.roles).findOne({ _id: user.roleId });
    if (!role) {
      return NextResponse.json(
        { ok: false, error: "Authentication service unavailable." },
        { status: 503 },
      );
    }

    const token = await createSessionToken(user._id.toHexString());
    await recordLoginAudit(user.username, "LOGIN_SUCCESS", user._id);

    const response = NextResponse.json({
      ok: true,
      user: {
        id: user._id.toHexString(),
        username: user.username,
        displayName: user.displayName,
        role: role.name,
      },
    });
    response.cookies.set(SESSION_COOKIE_NAME, token, getSessionCookieOptions());
    return response;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Authentication service unavailable." },
      { status: 503 },
    );
  }
}

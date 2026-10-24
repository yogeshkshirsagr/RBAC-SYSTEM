import "server-only";

import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import { ObjectId } from "mongodb";

import { getDatabase } from "@/lib/mongodb";
import { COLLECTIONS, type RoleDocument, type UserDocument } from "@/lib/db-types";

export const SESSION_COOKIE_NAME = "rbac_session";
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

const SESSION_ISSUER = "rbac-system";
const SESSION_AUDIENCE = "rbac-system-web";

function getSessionKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET is missing or too short.");
  }

  return new TextEncoder().encode(secret);
}

export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

export async function createSessionToken(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer(SESSION_ISSUER)
    .setAudience(SESSION_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(getSessionKey());
}

async function getSessionSubject(token: string): Promise<string | null> {
  const key = getSessionKey();
  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms: ["HS256"],
      issuer: SESSION_ISSUER,
      audience: SESSION_AUDIENCE,
    });
    return typeof payload.sub === "string" && /^[a-f\d]{24}$/i.test(payload.sub)
      ? payload.sub
      : null;
  } catch {
    return null;
  }
}

export interface SessionPrincipal {
  user: UserDocument & { _id: ObjectId };
  role: RoleDocument & { _id: ObjectId };
}

/** Verify the signed cookie and resolve the user's current role from MongoDB. */
export async function getSessionPrincipal(): Promise<SessionPrincipal | null> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const subject = await getSessionSubject(token);
  if (!subject) return null;

  const db = await getDatabase();
  const user = await db.collection<UserDocument>(COLLECTIONS.users).findOne({
    _id: new ObjectId(subject),
    status: "active",
  });
  if (!user) return null;

  const role = await db.collection<RoleDocument>(COLLECTIONS.roles).findOne({ _id: user.roleId });
  if (!role) return null;

  return { user, role };
}

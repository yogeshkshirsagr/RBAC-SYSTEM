import "server-only";

import { NextResponse } from "next/server";

import { getDatabase } from "@/lib/mongodb";
import {
  COLLECTIONS,
  type PermissionDocument,
  type PermissionKey,
} from "@/lib/db-types";
import { getSessionPrincipal, type SessionPrincipal } from "@/lib/session";

type PermissionAuthorization =
  | { ok: true; principal: SessionPrincipal; permissions: ReadonlySet<PermissionKey> }
  | { ok: false; response: NextResponse };

const unauthorized = () =>
  NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });

const forbidden = () =>
  NextResponse.json({ ok: false, error: "Permission denied." }, { status: 403 });

const unavailable = () =>
  NextResponse.json(
    { ok: false, error: "Authorization service unavailable." },
    { status: 503 },
  );

/** Resolve permissions from the authenticated user's current MongoDB role. */
export async function authorizePermission(
  requiredPermission: PermissionKey,
): Promise<PermissionAuthorization> {
  let principal: SessionPrincipal | null;
  try {
    principal = await getSessionPrincipal();
  } catch {
    return { ok: false, response: unavailable() };
  }

  if (!principal) return { ok: false, response: unauthorized() };

  const assignedKeys = principal.role.permissionKeys;
  if (!Array.isArray(assignedKeys)) {
    return { ok: false, response: forbidden() };
  }

  const validAssignedKeys = assignedKeys.filter(
    (key): key is PermissionKey =>
      key === "manage_users" ||
      key === "view_student_records" ||
      key === "update_marks" ||
      key === "view_own_records" ||
      key === "view_security_logs",
  );
  if (!validAssignedKeys.includes(requiredPermission)) {
    return { ok: false, response: forbidden() };
  }

  try {
    const db = await getDatabase();
    const permissionDocuments = await db
      .collection<PermissionDocument>(COLLECTIONS.permissions)
      .find({ key: { $in: validAssignedKeys } }, { projection: { key: 1 } })
      .toArray();
    const permissions = new Set(permissionDocuments.map(({ key }) => key));

    if (!permissions.has(requiredPermission)) {
      return { ok: false, response: forbidden() };
    }

    return { ok: true, principal, permissions };
  } catch {
    return { ok: false, response: unavailable() };
  }
}

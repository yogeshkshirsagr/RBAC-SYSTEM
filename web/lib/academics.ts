import "server-only";

import type { ObjectId } from "mongodb";

import { COLLECTIONS, type AuditLogDocument } from "@/lib/db-types";
import { getDatabase } from "@/lib/mongodb";

export function normalizeSubjectName(name: string): string {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

export async function recordAcademicAudit(
  actorUserId: ObjectId,
  actorUsername: string,
  action: string,
  details: string,
): Promise<void> {
  try {
    const db = await getDatabase();
    const entry: AuditLogDocument = {
      actorUserId,
      actorUsername,
      action,
      details,
      createdAt: new Date(),
    };
    await db.collection<AuditLogDocument>(COLLECTIONS.auditLogs).insertOne(entry);
  } catch {
    console.error("Academic activity audit event could not be written.");
  }
}

export function isObjectIdString(value: unknown): value is string {
  return typeof value === "string" && /^[a-f\d]{24}$/i.test(value);
}

import { NextResponse } from "next/server";

import { authorizePermission } from "@/lib/authorization";
import { COLLECTIONS, type AuditLogDocument, type PermissionDocument, type RoleDocument, type UserDocument } from "@/lib/db-types";
import { getDatabase } from "@/lib/mongodb";

export async function GET() {
  const authorization = await authorizePermission("manage_users");
  if (!authorization.ok) return authorization.response;
  if (!authorization.permissions.has("view_security_logs")) {
    return NextResponse.json({ ok: false, error: "Permission denied." }, { status: 403 });
  }

  try {
    const db = await getDatabase();
    const users = db.collection<UserDocument>(COLLECTIONS.users);
    const rolesCollection = db.collection<RoleDocument>(COLLECTIONS.roles);
    const permissionsCollection = db.collection<PermissionDocument>(COLLECTIONS.permissions);
    const auditLogs = db.collection<AuditLogDocument>(COLLECTIONS.auditLogs);

    const [totalUsers, roles, permissions, auditEventCount, recentEvents, usersByRole] =
      await Promise.all([
        users.countDocuments(),
        rolesCollection.find({}).sort({ name: 1 }).toArray(),
        permissionsCollection.find({}).sort({ name: 1 }).toArray(),
        auditLogs.countDocuments(),
        auditLogs
          .find(
            {},
            { projection: { actorUsername: 1, action: 1, details: 1, createdAt: 1 } },
          )
          .sort({ createdAt: -1, _id: -1 })
          .limit(6)
          .toArray(),
        users
          .aggregate<{ _id: UserDocument["roleId"]; count: number }>([
            { $group: { _id: "$roleId", count: { $sum: 1 } } },
          ])
          .toArray(),
      ]);

    const rolesById = new Map(roles.map((role) => [role._id.toHexString(), role]));
    const roleCountsById = new Map(
      usersByRole.map(({ _id, count }) => [_id.toHexString(), count]),
    );
    const assignedUserCount = usersByRole.reduce((sum, group) => sum + group.count, 0);

    if (
      assignedUserCount !== totalUsers ||
      usersByRole.some(({ _id }) => !rolesById.has(_id.toHexString()))
    ) {
      return NextResponse.json(
        { ok: false, error: "Dashboard data is unavailable." },
        { status: 503 },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        stats: {
          totalUsers,
          roleCount: roles.length,
          permissionCount: permissions.length,
          auditEventCount,
          roleDistribution: roles.map((role) => ({
            role: role.name,
            count: roleCountsById.get(role._id.toHexString()) ?? 0,
          })),
          permissionMatrix: permissions.map((permission) => ({
            key: permission.key,
            name: permission.name,
            roles: roles
              .filter((role) => role.permissionKeys.includes(permission.key))
              .map((role) => role.name),
          })),
          recentEvents: recentEvents.map((event) => ({
            actorUsername: event.actorUsername,
            action: event.action,
            details: event.details,
            createdAt: event.createdAt.toISOString(),
          })),
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: "Dashboard data is unavailable." },
      { status: 503 },
    );
  }
}

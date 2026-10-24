import { loadEnvConfig } from "@next/env";
import { ObjectId } from "mongodb";

import { COLLECTIONS, type RoleDocument, type UserDocument } from "../lib/db-types";
import { closeMongoConnection, getDatabase } from "../lib/mongodb";
import { createSessionToken, SESSION_COOKIE_NAME } from "../lib/session";

loadEnvConfig(process.cwd());

const baseUrl = (process.env.TEST_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const allowedUserKeys = new Set([
  "id",
  "username",
  "displayName",
  "email",
  "role",
  "status",
  "createdAt",
  "updatedAt",
]);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function requestUsers(cookie?: string) {
  return fetch(`${baseUrl}/api/users`, {
    headers: cookie ? { Cookie: cookie } : undefined,
    cache: "no-store",
  });
}

async function requestDashboardStats(cookie?: string) {
  return fetch(`${baseUrl}/api/dashboard/stats`, {
    headers: cookie ? { Cookie: cookie } : undefined,
    cache: "no-store",
  });
}

async function signIn(username: string, password: string): Promise<string> {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
    cache: "no-store",
  });
  assert(response.status === 200, `Expected ${username} login to return 200.`);

  const setCookie = response.headers.get("set-cookie");
  assert(setCookie, `Expected ${username} login to set a session cookie.`);
  const cookie = setCookie.split(";", 1)[0];
  assert(cookie.startsWith(`${SESSION_COOKIE_NAME}=`), "Unexpected session cookie name.");
  return cookie;
}

async function expectStatus(name: string, response: Response, expected: number) {
  assert(response.status === expected, `${name}: expected HTTP ${expected}, got ${response.status}.`);
  console.log(`PASS ${name} (HTTP ${expected})`);
}

async function main() {
  const db = await getDatabase();
  const usersCollection = db.collection<UserDocument>(COLLECTIONS.users);
  let temporaryUserId: ObjectId | undefined;

  try {
    const adminUser = await usersCollection.findOne({ username: "admin" });
    const teacherUser = await usersCollection.findOne({ username: "teacher1" });
    const studentUser = await usersCollection.findOne({ username: "student1" });
    assert(adminUser && teacherUser && studentUser, "Expected all seeded demo users to exist.");
    const rolesCollection = db.collection<RoleDocument>(COLLECTIONS.roles);
    const permissionsCollection = db.collection(COLLECTIONS.permissions);

    const adminCookie = await signIn("admin", "Admin@123");
    const teacherCookie = await signIn("teacher1", "Teacher@123");
    const studentCookie = await signIn("student1", "Student@123");

    await expectStatus("Unauthenticated request is denied", await requestUsers(), 401);
    await expectStatus(
      "Unauthenticated dashboard statistics are denied",
      await requestDashboardStats(),
      401,
    );

    const adminResponse = await requestUsers(adminCookie);
    await expectStatus("Admin with manage_users can list users", adminResponse, 200);
    const adminPayload = (await adminResponse.json()) as {
      users?: Array<Record<string, unknown>>;
    };
    assert(Array.isArray(adminPayload.users), "Admin response did not include a user list.");
    assert(adminPayload.users.length > 0, "Admin response user list was empty.");
    for (const user of adminPayload.users) {
      assert(
        Object.keys(user).every((key) => allowedUserKeys.has(key)),
        "User response contained an unexpected field.",
      );
      assert(!("passwordHash" in user) && !("sessionToken" in user), "Sensitive field was returned.");
    }
    console.log("PASS user list contains safe profile fields only");

    await expectStatus("Teacher without manage_users is denied", await requestUsers(teacherCookie), 403);
    await expectStatus("Student without manage_users is denied", await requestUsers(studentCookie), 403);

    const dashboardResponse = await requestDashboardStats(adminCookie);
    await expectStatus("Admin can read dashboard statistics", dashboardResponse, 200);
    const dashboardPayload = (await dashboardResponse.json()) as {
      stats?: {
        totalUsers?: number;
        roleCount?: number;
        permissionCount?: number;
        auditEventCount?: number;
        roleDistribution?: Array<{ role: string; count: number }>;
        permissionMatrix?: Array<{ key: string; name: string; roles: string[] }>;
        recentEvents?: Array<Record<string, unknown>>;
      };
    };
    const stats = dashboardPayload.stats;
    assert(stats, "Dashboard response omitted statistics.");
    const [actualUserCount, actualRoleCount, actualPermissionCount, actualAuditCount] = await Promise.all([
      usersCollection.countDocuments(),
      rolesCollection.countDocuments(),
      permissionsCollection.countDocuments(),
      db.collection(COLLECTIONS.auditLogs).countDocuments(),
    ]);
    assert(stats.totalUsers === actualUserCount, "Dashboard total did not match the users collection.");
    assert(stats.roleCount === actualRoleCount, "Dashboard role count did not match the roles collection.");
    assert(
      stats.permissionCount === actualPermissionCount,
      "Dashboard permission count did not match the permissions collection.",
    );
    assert(stats.auditEventCount === actualAuditCount, "Dashboard audit count did not match audit_logs.");

    const actualRoles = await rolesCollection.find({}).toArray();
    assert(stats.roleDistribution?.length === actualRoles.length, "Role distribution omitted database roles.");
    for (const role of actualRoles) {
      const displayedRole = stats.roleDistribution.find((entry) => entry.role === role.name);
      const count = await usersCollection.countDocuments({ roleId: role._id });
      assert(displayedRole?.count === count, `Dashboard count for role ${role.name} was incorrect.`);
    }

    const actualPermissions = await permissionsCollection.find({}).toArray();
    assert(
      stats.permissionMatrix?.length === actualPermissions.length,
      "Permission matrix did not match the permissions collection.",
    );
    for (const permission of actualPermissions) {
      const displayedPermission = stats.permissionMatrix.find((entry) => entry.key === permission.key);
      const expectedRoles = actualRoles
        .filter((role) => role.permissionKeys.includes(permission.key))
        .map((role) => role.name)
        .sort();
      assert(displayedPermission, `Dashboard omitted permission ${permission.key}.`);
      assert(
        JSON.stringify([...displayedPermission.roles].sort()) === JSON.stringify(expectedRoles),
        `Dashboard role assignment for ${permission.key} did not match MongoDB.`,
      );
    }
    const safeEventKeys = new Set(["actorUsername", "action", "details", "createdAt"]);
    for (const event of stats.recentEvents ?? []) {
      assert(
        Object.keys(event).every((key) => safeEventKeys.has(key)),
        "Dashboard audit event contained unexpected fields.",
      );
    }
    console.log("PASS dashboard counts, role assignments, and audit event count match MongoDB");

    await expectStatus(
      "Teacher without dashboard permissions is denied",
      await requestDashboardStats(teacherCookie),
      403,
    );
    await expectStatus(
      "Student without dashboard permissions is denied",
      await requestDashboardStats(studentCookie),
      403,
    );

    const studentRole = await db.collection<RoleDocument>(COLLECTIONS.roles).findOne({ name: "Student" });
    assert(studentRole, "Student role was not found.");
    temporaryUserId = new ObjectId();
    await usersCollection.insertOne({
      _id: temporaryUserId,
      username: `phase4-disabled-${temporaryUserId.toHexString()}`,
      displayName: "Temporary authorization test account",
      passwordHash: "not-used-by-this-test",
      roleId: studentRole._id,
      status: "disabled",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const inactiveToken = await createSessionToken(temporaryUserId.toHexString());
    await expectStatus(
      "Inactive account session is denied",
      await requestUsers(`${SESSION_COOKIE_NAME}=${inactiveToken}`),
      401,
    );

    const tamperedCookieParts = adminCookie.split("=", 2);
    const tokenParts = tamperedCookieParts[1]?.split(".");
    assert(tokenParts?.length === 3, "Admin session token had an invalid format.");
    tokenParts[2] = `${tokenParts[2][0] === "a" ? "b" : "a"}${tokenParts[2].slice(1)}`;
    await expectStatus(
      "Tampered session is denied",
      await requestUsers(`${SESSION_COOKIE_NAME}=${tokenParts.join(".")}`),
      401,
    );
  } finally {
    if (temporaryUserId) {
      await usersCollection.deleteOne({ _id: temporaryUserId });
    }
    await closeMongoConnection();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Authorization test failed.");
  process.exitCode = 1;
});

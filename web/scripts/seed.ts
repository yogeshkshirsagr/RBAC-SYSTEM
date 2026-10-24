import { loadEnvConfig } from "@next/env";
import bcrypt from "bcryptjs";
import type { Document } from "mongodb";

import { closeMongoConnection, getDatabase } from "../lib/mongodb";
import {
  COLLECTIONS,
  type PermissionDocument,
  type PermissionKey,
  type RoleDocument,
  type RoleName,
  type UserDocument,
} from "../lib/db-types";

loadEnvConfig(process.cwd());

// These accounts are intentionally public demo credentials for local development only.
// Never use them for a deployed environment or for real accounts.
const demoAccounts = [
  { username: "admin", displayName: "Admin User", password: "Admin@123", role: "Admin" },
  { username: "teacher1", displayName: "Priya Sharma", password: "Teacher@123", role: "Teacher" },
  { username: "student1", displayName: "Arjun Patel", password: "Student@123", role: "Student" },
] as const satisfies ReadonlyArray<{
  username: string;
  displayName: string;
  password: string;
  role: RoleName;
}>;

const permissionSeeds: ReadonlyArray<Omit<PermissionDocument, "createdAt" | "updatedAt">> = [
  {
    key: "manage_users",
    name: "Manage users",
    description: "Create, update, and remove user accounts.",
    resource: "users",
    action: "manage",
  },
  {
    key: "view_student_records",
    name: "View student records",
    description: "Read student academic records.",
    resource: "student_records",
    action: "read",
  },
  {
    key: "update_marks",
    name: "Update marks",
    description: "Create or update student marks.",
    resource: "marks",
    action: "write",
  },
  {
    key: "view_own_records",
    name: "View own records",
    description: "Read the signed-in user's own records.",
    resource: "own_records",
    action: "read",
  },
  {
    key: "view_security_logs",
    name: "View security logs",
    description: "Read security and audit activity.",
    resource: "audit_logs",
    action: "read",
  },
];

const roleSeeds: ReadonlyArray<{
  name: RoleName;
  description: string;
  permissionKeys: PermissionKey[];
}> = [
  {
    name: "Admin",
    description: "System administration and access management.",
    permissionKeys: [
      "manage_users",
      "view_student_records",
      "update_marks",
      "view_own_records",
      "view_security_logs",
    ],
  },
  {
    name: "Teacher",
    description: "Academic access for student records and marks.",
    permissionKeys: ["view_student_records", "update_marks", "view_own_records"],
  },
  {
    name: "Student",
    description: "Access to the signed-in student's own records.",
    permissionKeys: ["view_own_records"],
  },
];

const schemas: Record<string, Document> = {
  [COLLECTIONS.users]: {
    bsonType: "object",
    required: ["username", "displayName", "passwordHash", "roleId", "status", "createdAt", "updatedAt"],
    properties: {
      username: { bsonType: "string", minLength: 1, pattern: "^[a-z0-9._-]+$" },
      displayName: { bsonType: "string", minLength: 1 },
      passwordHash: { bsonType: "string", minLength: 1 },
      roleId: { bsonType: "objectId" },
      status: { enum: ["active", "disabled"] },
      createdAt: { bsonType: "date" },
      updatedAt: { bsonType: "date" },
    },
  },
  [COLLECTIONS.roles]: {
    bsonType: "object",
    required: ["name", "description", "permissionKeys", "createdAt", "updatedAt"],
    properties: {
      name: { enum: ["Admin", "Teacher", "Student"] },
      description: { bsonType: "string" },
      permissionKeys: {
        bsonType: "array",
        items: { enum: permissionSeeds.map(({ key }) => key) },
      },
      createdAt: { bsonType: "date" },
      updatedAt: { bsonType: "date" },
    },
  },
  [COLLECTIONS.permissions]: {
    bsonType: "object",
    required: ["key", "name", "description", "resource", "action", "createdAt", "updatedAt"],
    properties: {
      key: { enum: permissionSeeds.map(({ key }) => key) },
      name: { bsonType: "string" },
      description: { bsonType: "string" },
      resource: { bsonType: "string" },
      action: { bsonType: "string" },
      createdAt: { bsonType: "date" },
      updatedAt: { bsonType: "date" },
    },
  },
  [COLLECTIONS.auditLogs]: {
    bsonType: "object",
    required: ["actorUserId", "actorUsername", "action", "details", "createdAt"],
    properties: {
      actorUserId: { bsonType: ["objectId", "null"] },
      actorUsername: { bsonType: "string" },
      action: { bsonType: "string" },
      details: { bsonType: "string" },
      createdAt: { bsonType: "date" },
    },
  },
  [COLLECTIONS.subjects]: {
    bsonType: "object",
    required: ["teacherId", "name", "normalizedName", "maxMarks", "createdAt", "updatedAt"],
    properties: {
      teacherId: { bsonType: "objectId" },
      name: { bsonType: "string", minLength: 1, maxLength: 100 },
      normalizedName: { bsonType: "string", minLength: 1, maxLength: 100 },
      maxMarks: { bsonType: ["double", "int", "long", "decimal"], minimum: 0.01 },
      createdAt: { bsonType: "date" },
      updatedAt: { bsonType: "date" },
    },
  },
  [COLLECTIONS.marks]: {
    bsonType: "object",
    required: ["teacherId", "studentId", "subjectId", "marksObtained", "createdAt", "updatedAt"],
    properties: {
      teacherId: { bsonType: "objectId" },
      studentId: { bsonType: "objectId" },
      subjectId: { bsonType: "objectId" },
      marksObtained: { bsonType: ["double", "int", "long", "decimal"], minimum: 0 },
      createdAt: { bsonType: "date" },
      updatedAt: { bsonType: "date" },
    },
  },
};

async function ensureCollections(db: Awaited<ReturnType<typeof getDatabase>>) {
  const existing = new Set(
    (await db.listCollections({}, { nameOnly: true }).toArray()).map(({ name }) => name),
  );

  for (const [name, schema] of Object.entries(schemas)) {
    const validator = { $jsonSchema: schema };
    if (existing.has(name)) {
      await db.command({
        collMod: name,
        validator,
        validationLevel: "strict",
        validationAction: "error",
      });
    } else {
      await db.createCollection(name, {
        validator,
        validationLevel: "strict",
        validationAction: "error",
      });
    }
  }
}

async function seed() {
  const db = await getDatabase();
  await ensureCollections(db);

  const users = db.collection<UserDocument>(COLLECTIONS.users);
  const roles = db.collection<RoleDocument>(COLLECTIONS.roles);
  const permissions = db.collection<PermissionDocument>(COLLECTIONS.permissions);

  await users.createIndex({ username: 1 }, { unique: true, name: "uniq_users_username" });
  await users.createIndex({ roleId: 1 }, { name: "users_by_role" });
  await roles.createIndex({ name: 1 }, { unique: true, name: "uniq_roles_name" });
  await permissions.createIndex({ key: 1 }, { unique: true, name: "uniq_permissions_key" });
  await db.collection(COLLECTIONS.auditLogs).createIndex(
    { createdAt: -1 },
    { name: "audit_logs_by_created_at" },
  );
  await db.collection(COLLECTIONS.auditLogs).createIndex(
    { actorUserId: 1, createdAt: -1 },
    { name: "audit_logs_by_actor_and_date" },
  );
  await db.collection(COLLECTIONS.subjects).createIndex(
    { teacherId: 1, normalizedName: 1 },
    { unique: true, name: "uniq_subject_per_teacher" },
  );
  await db.collection(COLLECTIONS.subjects).createIndex(
    { teacherId: 1, name: 1 },
    { name: "subjects_by_teacher" },
  );
  await db.collection(COLLECTIONS.marks).createIndex(
    { teacherId: 1, studentId: 1, subjectId: 1 },
    { unique: true, name: "uniq_marks_per_teacher_student_subject" },
  );
  await db.collection(COLLECTIONS.marks).createIndex(
    { teacherId: 1, studentId: 1, updatedAt: -1 },
    { name: "marks_by_teacher_student" },
  );

  const now = new Date();
  for (const permission of permissionSeeds) {
    await permissions.updateOne(
      { key: permission.key },
      { $setOnInsert: { ...permission, createdAt: now, updatedAt: now } },
      { upsert: true },
    );
  }

  for (const role of roleSeeds) {
    await roles.updateOne(
      { name: role.name },
      { $setOnInsert: { ...role, createdAt: now, updatedAt: now } },
      { upsert: true },
    );
  }

  const rolesByName = new Map(
    (await roles.find({ name: { $in: roleSeeds.map(({ name }) => name) } }).toArray()).map(
      (role) => [role.name, role._id] as const,
    ),
  );

  for (const account of demoAccounts) {
    const roleId = rolesByName.get(account.role);
    if (!roleId) {
      throw new Error(`Seeded role '${account.role}' could not be found.`);
    }

    const passwordHash = await bcrypt.hash(account.password, 12);
    await users.updateOne(
      { username: account.username },
      {
        $setOnInsert: {
          username: account.username,
          displayName: account.displayName,
          passwordHash,
          roleId,
          status: "active",
          createdAt: now,
          updatedAt: now,
        },
      },
      { upsert: true },
    );
  }

  const [userCount, roleCount, permissionCount, seededUsers, seededRoleNames, seededPermissionKeys] =
    await Promise.all([
      users.countDocuments(),
      roles.countDocuments(),
      permissions.countDocuments(),
      users
        .find({ username: { $in: demoAccounts.map(({ username }) => username) } })
        .project({ username: 1, roleId: 1, passwordHash: 1 })
        .toArray(),
      roles.distinct("name", { name: { $in: roleSeeds.map(({ name }) => name) } }),
      permissions.distinct("key", { key: { $in: permissionSeeds.map(({ key }) => key) } }),
    ]);

  if (seededUsers.length !== demoAccounts.length) {
    throw new Error("Demo user verification failed.");
  }
  for (const account of demoAccounts) {
    const user = seededUsers.find((seededUser) => seededUser.username === account.username);
    if (
      !user ||
      user.roleId.toString() !== rolesByName.get(account.role)?.toString() ||
      !/^\$2[aby]\$/.test(user.passwordHash)
    ) {
      throw new Error(`Demo user verification failed for '${account.username}'.`);
    }
  }
  if (
    roleSeeds.some(({ name }) => !seededRoleNames.includes(name)) ||
    permissionSeeds.some(({ key }) => !seededPermissionKeys.includes(key))
  ) {
    throw new Error("Role or permission verification failed.");
  }

  console.log(
    `Seed verified. Database totals: ${userCount} users, ${roleCount} roles, ${permissionCount} permissions.`,
  );
  console.log("Verified demo accounts, role references, and bcrypt password hashes.");
}

async function main() {
  try {
    await seed();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error.";
    console.error(`Seed failed: ${message}`);
    process.exitCode = 1;
  } finally {
    try {
      await closeMongoConnection();
    } catch {
      console.error("Could not cleanly close the MongoDB connection.");
      process.exitCode = 1;
    }
  }
}

void main();

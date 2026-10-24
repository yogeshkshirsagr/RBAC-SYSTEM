import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { MongoServerError } from "mongodb";

import { authorizePermission } from "@/lib/authorization";
import { getDatabase } from "@/lib/mongodb";
import {
  COLLECTIONS,
  type AuditLogDocument,
  type RoleDocument,
  type RoleName,
  type UserDocument,
} from "@/lib/db-types";

const USERNAME_PATTERN = /^[a-z0-9._-]{1,64}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLE_NAMES = new Set<RoleName>(["Admin", "Teacher", "Student"]);

function invalidInput(message = "Check the required fields and try again.") {
  return NextResponse.json({ ok: false, error: message }, { status: 400 });
}

export async function GET() {
  const authorization = await authorizePermission("manage_users");
  if (!authorization.ok) return authorization.response;

  try {
    const db = await getDatabase();
    const users = await db
      .collection<UserDocument>(COLLECTIONS.users)
      .find(
        {},
        {
          projection: {
            username: 1,
            displayName: 1,
            email: 1,
            roleId: 1,
            status: 1,
            createdAt: 1,
            updatedAt: 1,
          },
        },
      )
      .sort({ username: 1 })
      .toArray();

    const roleIds = [...new Map(users.map((user) => [user.roleId.toHexString(), user.roleId])).values()];
    const roles = await db
      .collection<RoleDocument>(COLLECTIONS.roles)
      .find({ _id: { $in: roleIds } }, { projection: { name: 1 } })
      .toArray();
    const roleNames = new Map(roles.map((role) => [role._id.toHexString(), role.name]));

    if (users.some((user) => !roleNames.has(user.roleId.toHexString()))) {
      return NextResponse.json(
        { ok: false, error: "User data is unavailable." },
        { status: 503 },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        users: users.map((user) => ({
          id: user._id.toHexString(),
          username: user.username,
          displayName: user.displayName,
          email: user.email ?? "",
          role: roleNames.get(user.roleId.toHexString()),
          status: user.status,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: "User directory is unavailable." },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  const authorization = await authorizePermission("manage_users");
  if (!authorization.ok) return authorization.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidInput("Invalid request body.");
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return invalidInput("Invalid request body.");
  }

  const input = body as Record<string, unknown>;
  const allowedFields = new Set(["name", "username", "email", "initialPassword", "role"]);
  if (Object.keys(input).some((field) => !allowedFields.has(field))) {
    return invalidInput("Unexpected fields are not accepted.");
  }

  const displayName = typeof input.name === "string" ? input.name.trim() : "";
  const username = typeof input.username === "string" ? input.username.trim().toLowerCase() : "";
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const initialPassword = typeof input.initialPassword === "string" ? input.initialPassword : "";
  const roleName = typeof input.role === "string" ? input.role : "";

  if (displayName.length < 1 || displayName.length > 100) {
    return invalidInput("Name must be between 1 and 100 characters.");
  }
  if (!USERNAME_PATTERN.test(username)) {
    return invalidInput("Username must use 1–64 lowercase letters, numbers, dots, underscores, or hyphens.");
  }
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return invalidInput("Enter a valid email address.");
  }
  if (initialPassword.length < 8 || Buffer.byteLength(initialPassword, "utf8") > 72) {
    return invalidInput("Initial password must be at least 8 characters and no more than 72 bytes.");
  }
  if (!ROLE_NAMES.has(roleName as RoleName)) {
    return invalidInput("Select a valid role.");
  }
  const validatedRoleName = roleName as RoleName;

  try {
    const db = await getDatabase();
    const users = db.collection<UserDocument>(COLLECTIONS.users);
    const existingUser = await users.findOne({ username }, { projection: { _id: 1 } });
    if (existingUser) {
      return NextResponse.json({ ok: false, error: "That username is already in use." }, { status: 409 });
    }

    const role = await db
      .collection<RoleDocument>(COLLECTIONS.roles)
      .findOne({ name: validatedRoleName });
    if (!role) {
      return NextResponse.json(
        { ok: false, error: "The selected role is unavailable." },
        { status: 503 },
      );
    }

    const now = new Date();
    const passwordHash = await bcrypt.hash(initialPassword, 12);
    const result = await users.insertOne({
      username,
      displayName,
      email,
      passwordHash,
      roleId: role._id,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    try {
      await db.collection<AuditLogDocument>(COLLECTIONS.auditLogs).insertOne({
        actorUserId: authorization.principal.user._id,
        actorUsername: authorization.principal.user.username,
        action: "USER_CREATED",
        details: `Created user '${username}' with role '${role.name}'.`,
        createdAt: now,
      });
    } catch {
      console.error("User creation audit event could not be written.");
    }

    return NextResponse.json(
      {
        ok: true,
        user: {
          id: result.insertedId.toHexString(),
          username,
          displayName,
          email,
          role: role.name,
          status: "active",
          createdAt: now,
          updatedAt: now,
        },
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) {
      return NextResponse.json({ ok: false, error: "That username is already in use." }, { status: 409 });
    }
    return NextResponse.json(
      { ok: false, error: "User could not be created." },
      { status: 503 },
    );
  }
}

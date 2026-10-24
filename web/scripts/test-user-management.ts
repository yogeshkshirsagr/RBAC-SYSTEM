import { loadEnvConfig } from "@next/env";
import { ObjectId } from "mongodb";
import { randomUUID } from "node:crypto";

import { COLLECTIONS, type UserDocument } from "../lib/db-types";
import { closeMongoConnection, getDatabase } from "../lib/mongodb";
import { SESSION_COOKIE_NAME } from "../lib/session";

loadEnvConfig(process.cwd());

const baseUrl = (process.env.TEST_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const testUsername = `phase5-${randomUUID().slice(0, 12)}`;
const validUser = {
  name: "Phase Five Test User",
  username: testUsername,
  email: `${testUsername}@example.test`,
  initialPassword: "Phase5-TestPass!23",
  role: "Teacher",
};
const safeUserFields = new Set([
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

async function signIn(username: string, password: string): Promise<string> {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
    cache: "no-store",
  });
  assert(response.status === 200, `Expected ${username} login to succeed.`);
  const setCookie = response.headers.get("set-cookie");
  assert(setCookie, `Expected ${username} login to set a session cookie.`);
  const cookie = setCookie.split(";", 1)[0];
  assert(cookie.startsWith(`${SESSION_COOKIE_NAME}=`), "Unexpected session cookie name.");
  return cookie;
}

async function createRequest(body: unknown, cookie?: string) {
  return fetch(`${baseUrl}/api/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
}

async function expectStatus(name: string, response: Response, expected: number) {
  assert(response.status === expected, `${name}: expected HTTP ${expected}, got ${response.status}.`);
  console.log(`PASS ${name} (HTTP ${expected})`);
}

async function assertSafeUser(user: Record<string, unknown>) {
  assert(
    Object.keys(user).every((key) => safeUserFields.has(key)),
    "User response contained an unexpected field.",
  );
  assert(!("passwordHash" in user) && !("sessionToken" in user), "Sensitive field was returned.");
}

async function main() {
  const db = await getDatabase();
  const users = db.collection<UserDocument>(COLLECTIONS.users);

  try {
    const adminCookie = await signIn("admin", "Admin@123");
    const teacherCookie = await signIn("teacher1", "Teacher@123");
    const studentCookie = await signIn("student1", "Student@123");

    await expectStatus(
      "Unauthenticated user creation is denied",
      await createRequest(validUser),
      401,
    );
    await expectStatus(
      "Teacher user creation is denied",
      await createRequest(validUser, teacherCookie),
      403,
    );
    await expectStatus(
      "Student user creation is denied",
      await createRequest(validUser, studentCookie),
      403,
    );

    const createResponse = await createRequest(validUser, adminCookie);
    await expectStatus("Admin can create a user", createResponse, 201);
    const createdPayload = (await createResponse.json()) as {
      user?: Record<string, unknown>;
    };
    assert(createdPayload.user, "Create response omitted the new user profile.");
    await assertSafeUser(createdPayload.user);
    assert(createdPayload.user.username === testUsername, "Created username did not match.");
    assert(createdPayload.user.email === validUser.email, "Created email did not match.");
    console.log("PASS create response contains safe user fields only");

    const createdId = createdPayload.user.id;
    assert(typeof createdId === "string" && ObjectId.isValid(createdId), "Create response ID is invalid.");
    const storedUser = await users.findOne({ _id: new ObjectId(createdId) });
    assert(storedUser && storedUser.passwordHash !== validUser.initialPassword, "Password was not hashed.");
    assert(/^\$2[aby]\$/.test(storedUser.passwordHash), "Stored password does not look like a bcrypt hash.");
    console.log("PASS created password is stored as a bcrypt hash");

    await expectStatus(
      "Duplicate username is rejected",
      await createRequest(validUser, adminCookie),
      409,
    );
    await expectStatus(
      "Invalid role is rejected",
      await createRequest({ ...validUser, username: `${testUsername}-role`, role: "SuperAdmin" }, adminCookie),
      400,
    );
    await expectStatus(
      "Invalid input is rejected",
      await createRequest({ ...validUser, username: `${testUsername}-input`, email: "not-an-email" }, adminCookie),
      400,
    );
    await expectStatus(
      "Browser supplied permission fields are rejected",
      await createRequest({ ...validUser, username: `${testUsername}-permissions`, permissions: ["manage_users"] }, adminCookie),
      400,
    );

    const listResponse = await fetch(`${baseUrl}/api/users`, {
      headers: { Cookie: adminCookie },
      cache: "no-store",
    });
    assert(listResponse.status === 200, "Admin user list request failed.");
    const listPayload = (await listResponse.json()) as { users?: Array<Record<string, unknown>> };
    const listedUser = listPayload.users?.find((user) => user.username === testUsername);
    assert(listedUser, "Newly created user did not appear in the database-backed list.");
    await assertSafeUser(listedUser);
    console.log("PASS user list contains the created account without password hashes");
  } finally {
    await users.deleteOne({ username: testUsername });
    await closeMongoConnection();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "User-management test failed.");
  process.exitCode = 1;
});

import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { ObjectId } from "mongodb";

import { COLLECTIONS, type MarksDocument, type RoleDocument, type SubjectDocument, type UserDocument } from "../lib/db-types";
import { closeMongoConnection, getDatabase } from "../lib/mongodb";
import { createSessionToken, SESSION_COOKIE_NAME } from "../lib/session";

loadEnvConfig(process.cwd());
const baseUrl = (process.env.TEST_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function request(path: string, options: { cookie?: string; method?: string; body?: unknown } = {}) {
  return fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: {
      ...(options.cookie ? { Cookie: options.cookie } : {}),
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
  });
}

async function signIn(username: string, password: string): Promise<string> {
  const response = await request("/api/auth/login", { method: "POST", body: { username, password } });
  assert(response.status === 200, `Expected ${username} login to return 200.`);
  const setCookie = response.headers.get("set-cookie");
  assert(setCookie, "Expected login to set a session cookie.");
  const cookie = setCookie.split(";", 1)[0];
  assert(cookie.startsWith(`${SESSION_COOKIE_NAME}=`), "Unexpected session cookie name.");
  return cookie;
}

async function expectStatus(name: string, response: Response, status: number) {
  assert(response.status === status, `${name}: expected HTTP ${status}, got ${response.status}.`);
  console.log(`PASS ${name} (HTTP ${status})`);
}

async function main() {
  const db = await getDatabase();
  const studentCookie = await signIn("student1", "Student@123");
  const teacherCookie = await signIn("teacher1", "Teacher@123");
  const adminCookie = await signIn("admin", "Admin@123");
  const studentSuffix = randomUUID().slice(0, 10);
  const ownSubjectName = `Student Own Record ${studentSuffix}`;
  const otherSubjectName = `Other Student Record ${studentSuffix}`;
  const now = new Date();
  const temporaryUsers: ObjectId[] = [];
  const temporarySubjects: ObjectId[] = [];
  const temporaryMarks: ObjectId[] = [];

  try {
    const studentRole = await db.collection<RoleDocument>(COLLECTIONS.roles).findOne({ name: "Student" });
    const teacher = await db.collection<UserDocument>(COLLECTIONS.users).findOne({ username: "teacher1", status: "active" });
    const signedInStudent = await db.collection<UserDocument>(COLLECTIONS.users).findOne({ username: "student1", status: "active" });
    assert(studentRole && teacher && signedInStudent, "Seeded Student or Teacher account is missing.");

    const temporaryRecordStudentId = new ObjectId();
    const emptyStudentId = new ObjectId();
    temporaryUsers.push(temporaryRecordStudentId, emptyStudentId);
    await db.collection<UserDocument>(COLLECTIONS.users).insertMany([
      {
        _id: temporaryRecordStudentId,
        username: `student-test-record-${temporaryRecordStudentId.toHexString()}`,
        displayName: "Temporary Student Records Test Account",
        passwordHash: "not-used-by-this-test",
        roleId: studentRole._id,
        status: "active",
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: emptyStudentId,
        username: `student-test-empty-${emptyStudentId.toHexString()}`,
        displayName: "Temporary Empty Student Test Account",
        passwordHash: "not-used-by-this-test",
        roleId: studentRole._id,
        status: "active",
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const ownSubjectId = new ObjectId();
    const otherSubjectId = new ObjectId();
    temporarySubjects.push(ownSubjectId, otherSubjectId);
    await db.collection<SubjectDocument>(COLLECTIONS.subjects).insertMany([
      { _id: ownSubjectId, teacherId: teacher._id, name: ownSubjectName, normalizedName: ownSubjectName.toLowerCase(), maxMarks: 100, createdAt: now, updatedAt: now },
      { _id: otherSubjectId, teacherId: teacher._id, name: otherSubjectName, normalizedName: otherSubjectName.toLowerCase(), maxMarks: 50, createdAt: now, updatedAt: now },
    ]);
    const ownMarkId = new ObjectId();
    const otherMarkId = new ObjectId();
    temporaryMarks.push(ownMarkId, otherMarkId);
    await db.collection<MarksDocument>(COLLECTIONS.marks).insertMany([
      { _id: ownMarkId, teacherId: teacher._id, studentId: signedInStudent._id, subjectId: ownSubjectId, marksObtained: 80, createdAt: now, updatedAt: now },
      { _id: otherMarkId, teacherId: teacher._id, studentId: temporaryRecordStudentId, subjectId: otherSubjectId, marksObtained: 25, createdAt: now, updatedAt: now },
    ]);

    const meResponse = await request("/api/auth/me", { cookie: studentCookie });
    await expectStatus("Student signs in and restores the Student profile", meResponse, 200);
    const mePayload = (await meResponse.json()) as { user?: { username?: string; displayName?: string; role?: string; email?: string } };
    assert(mePayload.user?.username === "student1" && mePayload.user.role === "Student", "Authenticated profile did not match the Student session.");

    const ownRecordsResponse = await request("/api/student/records", { cookie: studentCookie });
    await expectStatus("Student can read own academic records", ownRecordsResponse, 200);
    const ownPayload = (await ownRecordsResponse.json()) as {
      profile?: { username: string; role: string };
      summary?: { hasRecords: boolean; recordedSubjects: number; averagePercentage: number | null };
      records?: Array<Record<string, unknown> & { subject: string; marksObtained: number; maxMarks: number; percentage: number }>;
    };
    assert(ownPayload.profile?.username === "student1" && ownPayload.profile.role === "Student", "Own record response profile was incorrect.");
    assert(ownPayload.records?.some((record) => record.subject === ownSubjectName && record.marksObtained === 80 && record.maxMarks === 100 && record.percentage === 80), "Own academic result was missing or incorrectly calculated.");
    assert(!ownPayload.records?.some((record) => record.subject === otherSubjectName), "Another student's academic record was exposed.");
    assert(ownPayload.records?.every((record) => Object.keys(record).every((key) => ["subject", "marksObtained", "maxMarks", "percentage", "updatedAt"].includes(key))), "Academic response included identity or internal ID fields.");
    assert(ownPayload.summary?.hasRecords && ownPayload.summary.recordedSubjects >= 1 && ownPayload.summary.averagePercentage !== null, "Student summary did not reflect available records.");
    console.log("PASS student records contain only own results and calculated summary");

    const tamperedQueryResponse = await request(`/api/student/records?studentId=${temporaryRecordStudentId.toHexString()}`, { cookie: studentCookie });
    await expectStatus("Changing the requested student ID cannot change record scope", tamperedQueryResponse, 200);
    const tamperedPayload = (await tamperedQueryResponse.json()) as { records?: Array<{ subject: string }> };
    assert(JSON.stringify(tamperedPayload.records) === JSON.stringify(ownPayload.records), "A browser-supplied student ID changed the returned records.");
    await expectStatus("Student-specific URL path is not exposed", await request(`/api/student/records/${temporaryRecordStudentId.toHexString()}`, { cookie: studentCookie }), 404);

    const emptyToken = await createSessionToken(emptyStudentId.toHexString());
    const emptyResponse = await request("/api/student/records", { cookie: `${SESSION_COOKIE_NAME}=${emptyToken}` });
    await expectStatus("Student with no marks receives an empty records response", emptyResponse, 200);
    const emptyPayload = (await emptyResponse.json()) as { records?: unknown[]; summary?: StudentSummaryShape };
    assert(Array.isArray(emptyPayload.records) && emptyPayload.records.length === 0, "Empty student returned fabricated academic records.");
    assert(emptyPayload.summary?.hasRecords === false && emptyPayload.summary.averagePercentage === null && emptyPayload.summary.recordedSubjects === 0, "Empty student summary did not report no recorded results.");
    console.log("PASS empty student data contract supports the dashboard's friendly empty state");

    await expectStatus("Student cannot access the Teacher student directory", await request("/api/teacher/students", { cookie: studentCookie }), 403);
    await expectStatus("Student cannot access Teacher subjects", await request("/api/teacher/subjects", { cookie: studentCookie }), 403);
    await expectStatus("Student cannot access Teacher marks", await request("/api/teacher/marks", { cookie: studentCookie }), 403);
    await expectStatus("Student cannot access Teacher statistics", await request("/api/teacher/stats", { cookie: studentCookie }), 403);
    await expectStatus("Student cannot access Admin user management", await request("/api/users", { cookie: studentCookie }), 403);
    await expectStatus("Student cannot access Admin dashboard statistics", await request("/api/dashboard/stats", { cookie: studentCookie }), 403);
    await expectStatus("Student cannot create a subject", await request("/api/teacher/subjects", { cookie: studentCookie, method: "POST", body: { name: "Unauthorized Student Subject", maxMarks: 100 } }), 403);
    await expectStatus("Student cannot create or update marks", await request("/api/teacher/marks", { cookie: studentCookie, method: "POST", body: { studentId: signedInStudent._id.toHexString(), subjectId: ownSubjectId.toHexString(), marksObtained: 90 } }), 403);
    await expectStatus("Student cannot update subjects", await request("/api/teacher/subjects", { cookie: studentCookie, method: "PUT", body: { name: ownSubjectName, maxMarks: 100 } }), 405);
    await expectStatus("Student cannot delete subjects", await request("/api/teacher/subjects", { cookie: studentCookie, method: "DELETE" }), 405);
    await expectStatus("Student cannot update marks", await request("/api/teacher/marks", { cookie: studentCookie, method: "PATCH", body: { marksObtained: 100 } }), 405);
    await expectStatus("Student cannot delete marks", await request("/api/teacher/marks", { cookie: studentCookie, method: "DELETE" }), 405);
    await expectStatus("Student cannot write through the own-records endpoint", await request("/api/student/records", { cookie: studentCookie, method: "POST", body: { studentId: temporaryRecordStudentId.toHexString() } }), 405);
    await expectStatus("Admin user functionality remains available", await request("/api/users", { cookie: adminCookie }), 200);
    await expectStatus("Teacher academic summary remains available", await request("/api/teacher/stats", { cookie: teacherCookie }), 200);
  } finally {
    if (temporaryMarks.length) await db.collection<MarksDocument>(COLLECTIONS.marks).deleteMany({ _id: { $in: temporaryMarks } });
    if (temporarySubjects.length) await db.collection<SubjectDocument>(COLLECTIONS.subjects).deleteMany({ _id: { $in: temporarySubjects } });
    if (temporaryUsers.length) await db.collection<UserDocument>(COLLECTIONS.users).deleteMany({ _id: { $in: temporaryUsers } });
    await closeMongoConnection();
  }
}

type StudentSummaryShape = { hasRecords?: boolean; recordedSubjects?: number; averagePercentage?: number | null };

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Student integration checks failed.");
  process.exitCode = 1;
});

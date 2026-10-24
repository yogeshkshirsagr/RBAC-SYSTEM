import { randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import { loadEnvConfig } from "@next/env";

import { COLLECTIONS, type MarksDocument, type SubjectDocument, type UserDocument } from "../lib/db-types";
import { closeMongoConnection, getDatabase } from "../lib/mongodb";
import { SESSION_COOKIE_NAME } from "../lib/session";

const baseUrl = (process.env.TEST_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
loadEnvConfig(process.cwd());

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
  const response = await request("/api/auth/login", {
    method: "POST",
    body: { username, password },
  });
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
  const teacherCookie = await signIn("teacher1", "Teacher@123");
  const studentCookie = await signIn("student1", "Student@123");
  const adminCookie = await signIn("admin", "Admin@123");
  const subjectName = `Teacher Integration ${randomUUID().slice(0, 10)}`;
  const adminSubjectName = `Admin Scope Integration ${randomUUID().slice(0, 10)}`;
  let testSubjectId: ObjectId | undefined;
  let adminSubjectId: ObjectId | undefined;
  let testMarkId: ObjectId | undefined;
  let temporaryStudentId: ObjectId | undefined;

  try {
    await expectStatus("Unauthenticated teacher stats denied", await request("/api/teacher/stats"), 401);
    await expectStatus("Unauthenticated student list denied", await request("/api/teacher/students"), 401);
    await expectStatus("Unauthenticated subjects denied", await request("/api/teacher/subjects"), 401);
    await expectStatus("Unauthenticated marks denied", await request("/api/teacher/marks"), 401);

    const statsResponse = await request("/api/teacher/stats", { cookie: teacherCookie });
    await expectStatus("Teacher can read academic dashboard stats", statsResponse, 200);
    const statsPayload = (await statsResponse.json()) as {
      stats?: { totalStudents: number; totalSubjects: number; marksRecords: number };
    };
    assert(statsPayload.stats, "Teacher stats response omitted its statistics.");
    const studentRole = await db.collection(COLLECTIONS.roles).findOne({ name: "Student" });
    const signedInTeacher = await db.collection<UserDocument>(COLLECTIONS.users).findOne({ username: "teacher1", status: "active" });
    assert(studentRole && signedInTeacher, "Student role or seeded Teacher account is missing.");
    const [studentCount, subjectCount, marksCount] = await Promise.all([
      db.collection(COLLECTIONS.users).countDocuments({ roleId: studentRole._id, status: "active" }),
      db.collection(COLLECTIONS.subjects).countDocuments({ teacherId: signedInTeacher._id }),
      db.collection(COLLECTIONS.marks).countDocuments({ teacherId: signedInTeacher._id }),
    ]);
    assert(statsPayload.stats.totalStudents === studentCount, "Student total did not match MongoDB.");
    assert(statsPayload.stats.totalSubjects === subjectCount, "Teacher subject total did not match MongoDB.");
    assert(statsPayload.stats.marksRecords === marksCount, "Teacher mark total did not match MongoDB.");
    console.log("PASS teacher summary counts match MongoDB");

    temporaryStudentId = new ObjectId();
    const now = new Date();
    await db.collection<UserDocument>(COLLECTIONS.users).insertOne({
      _id: temporaryStudentId,
      username: `teacher-test-${temporaryStudentId.toHexString()}`,
      displayName: "Temporary Teacher Interface Test Student",
      passwordHash: "not-used-by-this-test",
      roleId: studentRole._id,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    const studentsResponse = await request("/api/teacher/students", { cookie: teacherCookie });
    await expectStatus("Teacher can list students", studentsResponse, 200);
    const studentsPayload = (await studentsResponse.json()) as {
      students?: Array<Record<string, unknown> & { id: string; username: string; name: string }>;
    };
    assert(Array.isArray(studentsPayload.students), "Student list was missing.");
    assert(studentsPayload.students.length > 0, "Expected at least one active student for integration checks.");
    assert(studentsPayload.students.every((student) => Object.keys(student).every((key) => ["id", "username", "name", "email"].includes(key))), "Student list returned unexpected fields.");
    const student = studentsPayload.students[0];
    const signedInStudent = await db.collection<UserDocument>(COLLECTIONS.users).findOne({ username: "student1" });
    assert(signedInStudent, "Seeded Student account is missing.");
    const anotherStudent = studentsPayload.students.find((entry) => entry.id !== signedInStudent._id.toHexString());
    assert(anotherStudent, "Could not prepare a distinct student record for the access-control check.");

    await expectStatus("Teacher can list own subjects", await request("/api/teacher/subjects", { cookie: teacherCookie }), 200);
    await expectStatus("Teacher can list own marks", await request("/api/teacher/marks", { cookie: teacherCookie }), 200);
    await expectStatus("Admin user management still works", await request("/api/users", { cookie: adminCookie }), 200);

    const adminSubjectResponse = await request("/api/teacher/subjects", { cookie: adminCookie, method: "POST", body: { name: adminSubjectName, maxMarks: 50 } });
    await expectStatus("Admin retains permission to create a scoped subject", adminSubjectResponse, 201);
    const adminSubjectPayload = (await adminSubjectResponse.json()) as { subject?: { id: string } };
    assert(adminSubjectPayload.subject, "Admin subject response omitted its subject.");
    adminSubjectId = new ObjectId(adminSubjectPayload.subject.id);
    const teacherSubjectsPayload = (await (await request("/api/teacher/subjects", { cookie: teacherCookie })).json()) as { subjects?: Array<{ id: string }> };
    assert(!teacherSubjectsPayload.subjects?.some((entry) => entry.id === adminSubjectId?.toHexString()), "Teacher could see a subject owned by another account.");
    await expectStatus("Teacher cannot write marks to another account's subject", await request("/api/teacher/marks", { cookie: teacherCookie, method: "POST", body: { studentId: student.id, subjectId: adminSubjectId.toHexString(), marksObtained: 10 } }), 400);

    await expectStatus("Student cannot list teacher student directory", await request("/api/teacher/students", { cookie: studentCookie }), 403);
    await expectStatus("Student cannot list teacher subjects", await request("/api/teacher/subjects", { cookie: studentCookie }), 403);
    await expectStatus("Student cannot create a subject", await request("/api/teacher/subjects", { cookie: studentCookie, method: "POST", body: { name: subjectName, maxMarks: 80 } }), 403);
    await expectStatus("Student cannot list teacher marks", await request("/api/teacher/marks", { cookie: studentCookie }), 403);
    await expectStatus("Student cannot modify marks", await request("/api/teacher/marks", { cookie: studentCookie, method: "POST", body: { studentId: student.id, subjectId: new ObjectId().toHexString(), marksObtained: 10 } }), 403);
    await expectStatus("Student cannot read another student's records", await request(`/api/teacher/students/${anotherStudent.id}`, { cookie: studentCookie }), 403);

    const invalidSubjectResponse = await request("/api/teacher/subjects", { cookie: teacherCookie, method: "POST", body: { name: "   ", maxMarks: 80 } });
    await expectStatus("Invalid subject input rejected", invalidSubjectResponse, 400);
    await expectStatus("Invalid subject maximum rejected", await request("/api/teacher/subjects", { cookie: teacherCookie, method: "POST", body: { name: subjectName, maxMarks: 0 } }), 400);
    await expectStatus("Browser supplied teacher scope is rejected", await request("/api/teacher/subjects", { cookie: teacherCookie, method: "POST", body: { name: subjectName, maxMarks: 80, teacherId: new ObjectId().toHexString() } }), 400);

    const createdSubjectResponse = await request("/api/teacher/subjects", { cookie: teacherCookie, method: "POST", body: { name: subjectName, maxMarks: 80 } });
    await expectStatus("Teacher can create a subject", createdSubjectResponse, 201);
    const createdSubjectPayload = (await createdSubjectResponse.json()) as { subject?: { id: string; maxMarks: number } };
    assert(createdSubjectPayload.subject, "Subject creation response omitted the created subject.");
    testSubjectId = new ObjectId(createdSubjectPayload.subject.id);
    assert(createdSubjectPayload.subject.maxMarks === 80, "Subject maximum did not match input.");

    const duplicateResponse = await request("/api/teacher/subjects", { cookie: teacherCookie, method: "POST", body: { name: subjectName.toUpperCase(), maxMarks: 80 } });
    await expectStatus("Case-insensitive duplicate subject rejected", duplicateResponse, 409);

    const createdMarkResponse = await request("/api/teacher/marks", { cookie: teacherCookie, method: "POST", body: { studentId: student.id, subjectId: testSubjectId.toHexString(), marksObtained: 60 } });
    await expectStatus("Teacher can create marks", createdMarkResponse, 201);
    const createdMarkPayload = (await createdMarkResponse.json()) as { mark?: { percentage: number } };
    assert(createdMarkPayload.mark?.percentage === 75, "Percentage was not calculated from stored marks and subject maximum.");
    const storedMark = await db.collection<MarksDocument>(COLLECTIONS.marks).findOne({
      teacherId: (await db.collection(COLLECTIONS.users).findOne({ username: "teacher1" }))!._id,
      studentId: new ObjectId(student.id),
      subjectId: testSubjectId,
    });
    assert(storedMark, "Created mark was not stored in MongoDB.");
    testMarkId = storedMark._id;

    const invalidHighMark = await request("/api/teacher/marks", { cookie: teacherCookie, method: "POST", body: { studentId: student.id, subjectId: testSubjectId.toHexString(), marksObtained: 81 } });
    await expectStatus("Marks above subject maximum rejected", invalidHighMark, 400);
    await expectStatus("Negative marks rejected", await request("/api/teacher/marks", { cookie: teacherCookie, method: "POST", body: { studentId: student.id, subjectId: testSubjectId.toHexString(), marksObtained: -1 } }), 400);
    await expectStatus("Nonexistent student rejected", await request("/api/teacher/marks", { cookie: teacherCookie, method: "POST", body: { studentId: new ObjectId().toHexString(), subjectId: testSubjectId.toHexString(), marksObtained: 10 } }), 400);
    await expectStatus("Nonexistent or unowned subject rejected", await request("/api/teacher/marks", { cookie: teacherCookie, method: "POST", body: { studentId: student.id, subjectId: new ObjectId().toHexString(), marksObtained: 10 } }), 400);

    const updatedMarkResponse = await request("/api/teacher/marks", { cookie: teacherCookie, method: "POST", body: { studentId: student.id, subjectId: testSubjectId.toHexString(), marksObtained: 70 } });
    await expectStatus("Existing marks are updated", updatedMarkResponse, 200);
    const updatedMarkPayload = (await updatedMarkResponse.json()) as { created?: boolean; mark?: { percentage: number } };
    assert(updatedMarkPayload.created === false && updatedMarkPayload.mark?.percentage === 87.5, "Existing mark was not updated or percentage was incorrect.");
    const duplicateCount = await db.collection<MarksDocument>(COLLECTIONS.marks).countDocuments({
      teacherId: (await db.collection(COLLECTIONS.users).findOne({ username: "teacher1" }))!._id,
      studentId: new ObjectId(student.id),
      subjectId: testSubjectId,
    });
    assert(duplicateCount === 1, "Mark update created a duplicate record.");
    console.log("PASS marks updates in place without creating duplicates");

    const profileResponse = await request(`/api/teacher/students/${student.id}`, { cookie: teacherCookie });
    await expectStatus("Teacher can view student academic records", profileResponse, 200);
    const profilePayload = (await profileResponse.json()) as { records?: Array<{ subject: string; marksObtained: number; maxMarks: number; percentage: number }> };
    assert(profilePayload.records?.some((record) => record.subject === subjectName && record.marksObtained === 70 && record.maxMarks === 80 && record.percentage === 87.5), "Student profile omitted the saved mark.");
    const finalMarksResponse = await request("/api/teacher/marks", { cookie: teacherCookie });
    const finalMarksPayload = (await finalMarksResponse.json()) as { marks?: Array<{ id: string }> };
    assert(finalMarksPayload.marks?.some((mark) => mark.id === testMarkId?.toHexString()), "Saved marks table omitted the test record.");
  } finally {
    if (testMarkId) await db.collection<MarksDocument>(COLLECTIONS.marks).deleteOne({ _id: testMarkId });
    if (testSubjectId) await db.collection<SubjectDocument>(COLLECTIONS.subjects).deleteOne({ _id: testSubjectId });
    if (adminSubjectId) await db.collection<SubjectDocument>(COLLECTIONS.subjects).deleteOne({ _id: adminSubjectId });
    if (temporaryStudentId) await db.collection<UserDocument>(COLLECTIONS.users).deleteOne({ _id: temporaryStudentId });
    await closeMongoConnection();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Teacher integration checks failed.");
  process.exitCode = 1;
});

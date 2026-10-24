import { NextResponse } from "next/server";
import { MongoServerError, ObjectId } from "mongodb";

import { authorizePermission } from "@/lib/authorization";
import { isObjectIdString, recordAcademicAudit } from "@/lib/academics";
import { COLLECTIONS, type MarksDocument, type RoleDocument, type SubjectDocument, type UserDocument } from "@/lib/db-types";
import { getDatabase } from "@/lib/mongodb";

export async function GET() {
  const authorization = await authorizePermission("view_student_records");
  if (!authorization.ok) return authorization.response;

  try {
    const db = await getDatabase();
    const marks = await db.collection<MarksDocument>(COLLECTIONS.marks)
      .find({ teacherId: authorization.principal.user._id })
      .sort({ updatedAt: -1 })
      .toArray();
    const studentIds = [...new Map(marks.map((mark) => [mark.studentId.toHexString(), mark.studentId])).values()];
    const subjectIds = [...new Map(marks.map((mark) => [mark.subjectId.toHexString(), mark.subjectId])).values()];
    const [students, subjects] = await Promise.all([
      studentIds.length
        ? db.collection<UserDocument>(COLLECTIONS.users)
            .find({ _id: { $in: studentIds }, status: "active" }, { projection: { username: 1, displayName: 1, roleId: 1 } })
            .toArray()
        : Promise.resolve([]),
      subjectIds.length
        ? db.collection<SubjectDocument>(COLLECTIONS.subjects)
            .find({ _id: { $in: subjectIds }, teacherId: authorization.principal.user._id })
            .toArray()
        : Promise.resolve([]),
    ]);
    const studentRole = await db.collection<RoleDocument>(COLLECTIONS.roles).findOne(
      { name: "Student" },
      { projection: { _id: 1 } },
    );
    if (!studentRole) {
      return NextResponse.json({ ok: false, error: "Marks are unavailable." }, { status: 503 });
    }
    const studentById = new Map(students.filter((student) => student.roleId.equals(studentRole._id)).map((student) => [student._id.toHexString(), student]));
    const subjectById = new Map(subjects.map((subject) => [subject._id.toHexString(), subject]));
    if (marks.some((mark) => !studentById.has(mark.studentId.toHexString()) || !subjectById.has(mark.subjectId.toHexString()))) {
      return NextResponse.json({ ok: false, error: "Marks are unavailable." }, { status: 503 });
    }

    return NextResponse.json(
      {
        ok: true,
        marks: marks.map((mark) => {
          const student = studentById.get(mark.studentId.toHexString())!;
          const subject = subjectById.get(mark.subjectId.toHexString())!;
          return {
            id: mark._id.toHexString(),
            studentId: student._id.toHexString(),
            studentName: student.displayName,
            studentUsername: student.username,
            subjectId: subject._id.toHexString(),
            subjectName: subject.name,
            marksObtained: mark.marksObtained,
            maxMarks: subject.maxMarks,
            percentage: Number(((mark.marksObtained / subject.maxMarks) * 100).toFixed(2)),
            updatedAt: mark.updatedAt.toISOString(),
          };
        }),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ ok: false, error: "Marks are unavailable." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const authorization = await authorizePermission("update_marks");
  if (!authorization.ok) return authorization.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some((key) => !["studentId", "subjectId", "marksObtained"].includes(key))) {
    return NextResponse.json({ ok: false, error: "Unexpected fields are not accepted." }, { status: 400 });
  }
  if (!isObjectIdString(input.studentId) || !isObjectIdString(input.subjectId)) {
    return NextResponse.json({ ok: false, error: "Select a valid student and subject." }, { status: 400 });
  }
  if (typeof input.marksObtained !== "number" || !Number.isFinite(input.marksObtained) || input.marksObtained < 0) {
    return NextResponse.json({ ok: false, error: "Marks must be a non-negative number." }, { status: 400 });
  }

  try {
    const db = await getDatabase();
    const studentRole = await db.collection<RoleDocument>(COLLECTIONS.roles).findOne(
      { name: "Student" },
      { projection: { _id: 1 } },
    );
    if (!studentRole) {
      return NextResponse.json({ ok: false, error: "Student records are unavailable." }, { status: 503 });
    }
    const [student, subject] = await Promise.all([
      db.collection<UserDocument>(COLLECTIONS.users).findOne({
        _id: new ObjectId(input.studentId),
        roleId: studentRole._id,
        status: "active",
      }, { projection: { username: 1, displayName: 1 } }),
      db.collection<SubjectDocument>(COLLECTIONS.subjects).findOne({
        _id: new ObjectId(input.subjectId),
        teacherId: authorization.principal.user._id,
      }, { projection: { name: 1, maxMarks: 1 } }),
    ]);
    if (!student || !subject) {
      return NextResponse.json({ ok: false, error: "Select a student and subject available to your account." }, { status: 400 });
    }
    if (input.marksObtained > subject.maxMarks) {
      return NextResponse.json({ ok: false, error: `Marks cannot exceed the subject maximum of ${subject.maxMarks}.` }, { status: 400 });
    }

    const now = new Date();
    const result = await db.collection<MarksDocument>(COLLECTIONS.marks).updateOne(
      {
        teacherId: authorization.principal.user._id,
        studentId: student._id,
        subjectId: new ObjectId(input.subjectId),
      },
      {
        $set: { marksObtained: input.marksObtained, updatedAt: now },
        $setOnInsert: {
          teacherId: authorization.principal.user._id,
          studentId: student._id,
          subjectId: new ObjectId(input.subjectId),
          createdAt: now,
        },
      },
      { upsert: true },
    );
    const created = result.upsertedCount === 1;
    await recordAcademicAudit(
      authorization.principal.user._id,
      authorization.principal.user.username,
      created ? "MARK_CREATED" : "MARK_UPDATED",
      `${created ? "Recorded" : "Updated"} marks for student '${student.username}' in '${subject.name}'.`,
    );

    return NextResponse.json(
      {
        ok: true,
        created,
        mark: {
          studentId: student._id.toHexString(),
          studentName: student.displayName,
          studentUsername: student.username,
          subjectId: input.subjectId,
          subjectName: subject.name,
          marksObtained: input.marksObtained,
          maxMarks: subject.maxMarks,
          percentage: Number(((input.marksObtained / subject.maxMarks) * 100).toFixed(2)),
          updatedAt: now.toISOString(),
        },
      },
      { status: created ? 201 : 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) {
      return NextResponse.json({ ok: false, error: "Marks could not be saved. Please try again." }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: "Marks could not be saved." }, { status: 503 });
  }
}

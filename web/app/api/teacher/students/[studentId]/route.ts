import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";

import { authorizePermission } from "@/lib/authorization";
import { isObjectIdString } from "@/lib/academics";
import { COLLECTIONS, type MarksDocument, type RoleDocument, type SubjectDocument, type UserDocument } from "@/lib/db-types";
import { getDatabase } from "@/lib/mongodb";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ studentId: string }> },
) {
  const authorization = await authorizePermission("view_student_records");
  if (!authorization.ok) return authorization.response;

  const { studentId } = await params;
  if (!isObjectIdString(studentId)) {
    return NextResponse.json({ ok: false, error: "Student record not found." }, { status: 404 });
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

    const student = await db.collection<UserDocument>(COLLECTIONS.users).findOne(
      { _id: new ObjectId(studentId), roleId: studentRole._id, status: "active" },
      { projection: { username: 1, displayName: 1, email: 1 } },
    );
    if (!student) {
      return NextResponse.json({ ok: false, error: "Student record not found." }, { status: 404 });
    }

    const marks = await db.collection<MarksDocument>(COLLECTIONS.marks)
      .find({ teacherId: authorization.principal.user._id, studentId: student._id })
      .sort({ updatedAt: -1 })
      .toArray();
    const subjectIds = [...new Map(marks.map((mark) => [mark.subjectId.toHexString(), mark.subjectId])).values()];
    const subjects = subjectIds.length
      ? await db.collection<SubjectDocument>(COLLECTIONS.subjects)
          .find({ _id: { $in: subjectIds }, teacherId: authorization.principal.user._id })
          .toArray()
      : [];
    const subjectById = new Map(subjects.map((subject) => [subject._id.toHexString(), subject]));
    if (marks.some((mark) => !subjectById.has(mark.subjectId.toHexString()))) {
      return NextResponse.json({ ok: false, error: "Academic records are unavailable." }, { status: 503 });
    }

    return NextResponse.json(
      {
        ok: true,
        student: {
          id: student._id.toHexString(),
          username: student.username,
          name: student.displayName,
          email: student.email ?? "",
        },
        records: marks.map((mark) => {
          const subject = subjectById.get(mark.subjectId.toHexString())!;
          return {
            id: mark._id.toHexString(),
            subject: subject.name,
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
    return NextResponse.json({ ok: false, error: "Student records are unavailable." }, { status: 503 });
  }
}

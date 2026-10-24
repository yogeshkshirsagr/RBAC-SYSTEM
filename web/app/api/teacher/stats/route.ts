import { NextResponse } from "next/server";

import { authorizePermission } from "@/lib/authorization";
import { COLLECTIONS, type RoleDocument, type UserDocument, type SubjectDocument, type MarksDocument } from "@/lib/db-types";
import { getDatabase } from "@/lib/mongodb";

export async function GET() {
  const authorization = await authorizePermission("view_student_records");
  if (!authorization.ok) return authorization.response;

  try {
    const db = await getDatabase();
    const studentRole = await db.collection<RoleDocument>(COLLECTIONS.roles).findOne(
      { name: "Student" },
      { projection: { _id: 1 } },
    );
    if (!studentRole) {
      return NextResponse.json({ ok: false, error: "Academic data is unavailable." }, { status: 503 });
    }

    const [totalStudents, totalSubjects, marksRecords] = await Promise.all([
      db.collection<UserDocument>(COLLECTIONS.users).countDocuments({
        roleId: studentRole._id,
        status: "active",
      }),
      db.collection<SubjectDocument>(COLLECTIONS.subjects).countDocuments({
        teacherId: authorization.principal.user._id,
      }),
      db.collection<MarksDocument>(COLLECTIONS.marks).countDocuments({
        teacherId: authorization.principal.user._id,
      }),
    ]);

    return NextResponse.json(
      { ok: true, stats: { totalStudents, totalSubjects, marksRecords } },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ ok: false, error: "Academic data is unavailable." }, { status: 503 });
  }
}

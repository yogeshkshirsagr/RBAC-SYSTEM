import { NextResponse } from "next/server";

import { authorizePermission } from "@/lib/authorization";
import { COLLECTIONS, type RoleDocument, type UserDocument } from "@/lib/db-types";
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
      return NextResponse.json({ ok: false, error: "Student records are unavailable." }, { status: 503 });
    }

    const students = await db.collection<UserDocument>(COLLECTIONS.users)
      .find(
        { roleId: studentRole._id, status: "active" },
        { projection: { username: 1, displayName: 1, email: 1 } },
      )
      .sort({ displayName: 1, username: 1 })
      .toArray();

    return NextResponse.json(
      {
        ok: true,
        students: students.map((student) => ({
          id: student._id.toHexString(),
          username: student.username,
          name: student.displayName,
          email: student.email ?? "",
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ ok: false, error: "Student records are unavailable." }, { status: 503 });
  }
}

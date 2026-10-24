import { NextResponse } from "next/server";

import { authorizePermission } from "@/lib/authorization";
import { COLLECTIONS, type MarksDocument, type SubjectDocument } from "@/lib/db-types";
import { getDatabase } from "@/lib/mongodb";

/** Return only records belonging to the current session principal. */
export async function GET() {
  const authorization = await authorizePermission("view_own_records");
  if (!authorization.ok) return authorization.response;

  try {
    const db = await getDatabase();
    const storedMarks = await db.collection<MarksDocument>(COLLECTIONS.marks)
      .find({ studentId: authorization.principal.user._id })
      .sort({ updatedAt: -1, createdAt: -1 })
      .toArray();

    const subjectIds = [...new Map(
      storedMarks.map((mark) => [mark.subjectId.toHexString(), mark.subjectId]),
    ).values()];
    const subjects = subjectIds.length
      ? await db.collection<SubjectDocument>(COLLECTIONS.subjects)
          .find({ _id: { $in: subjectIds } })
          .toArray()
      : [];
    const subjectsById = new Map(subjects.map((subject) => [subject._id.toHexString(), subject]));

    if (storedMarks.some((mark) => {
      const subject = subjectsById.get(mark.subjectId.toHexString());
      return !subject || !subject.teacherId.equals(mark.teacherId);
    })) {
      return NextResponse.json(
        { ok: false, error: "Academic records are unavailable." },
        { status: 503 },
      );
    }

    const records = storedMarks.map((mark) => {
      const subject = subjectsById.get(mark.subjectId.toHexString())!;
      return {
        subject: subject.name,
        marksObtained: mark.marksObtained,
        maxMarks: subject.maxMarks,
        percentage: Number(((mark.marksObtained / subject.maxMarks) * 100).toFixed(2)),
        updatedAt: mark.updatedAt.toISOString(),
      };
    });
    const distinctSubjectNames = new Set(
      subjects.map((subject) => subject.normalizedName),
    );
    // Overall average is the arithmetic mean of each recorded result's percentage.
    const averagePercentage = records.length
      ? Number((records.reduce((sum, record) => sum + record.percentage, 0) / records.length).toFixed(2))
      : null;

    return NextResponse.json(
      {
        ok: true,
        profile: {
          username: authorization.principal.user.username,
          displayName: authorization.principal.user.displayName,
          email: authorization.principal.user.email ?? "",
          role: authorization.principal.role.name,
        },
        summary: {
          hasRecords: records.length > 0,
          recordedSubjects: distinctSubjectNames.size,
          averagePercentage,
        },
        records,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: "Academic records are unavailable." },
      { status: 503 },
    );
  }
}

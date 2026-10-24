import type { ObjectId } from "mongodb";

export const COLLECTIONS = {
  users: "users",
  roles: "roles",
  permissions: "permissions",
  auditLogs: "audit_logs",
  subjects: "subjects",
  marks: "marks",
} as const;

export type RoleName = "Admin" | "Teacher" | "Student";

export type PermissionKey =
  | "manage_users"
  | "view_student_records"
  | "update_marks"
  | "view_own_records"
  | "view_security_logs";

export interface Timestamps {
  createdAt: Date;
  updatedAt: Date;
}

export interface UserDocument extends Timestamps {
  username: string;
  displayName: string;
  email?: string;
  passwordHash: string;
  roleId: ObjectId;
  status: "active" | "disabled";
}

export interface RoleDocument extends Timestamps {
  name: RoleName;
  description: string;
  permissionKeys: PermissionKey[];
}

export interface PermissionDocument extends Timestamps {
  key: PermissionKey;
  name: string;
  description: string;
  resource: string;
  action: string;
}

export interface AuditLogDocument {
  actorUserId: ObjectId | null;
  actorUsername: string;
  action: string;
  details: string;
  createdAt: Date;
}

export interface SubjectDocument extends Timestamps {
  teacherId: ObjectId;
  name: string;
  normalizedName: string;
  maxMarks: number;
}

export interface MarksDocument extends Timestamps {
  teacherId: ObjectId;
  studentId: ObjectId;
  subjectId: ObjectId;
  marksObtained: number;
}

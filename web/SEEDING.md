# Local MongoDB seed data

Run `npm run seed` from the `web/` directory. The script loads the existing
`.env.local` configuration and seeds the `rbac_system` database. It can be run
again safely: unique indexes and upserts prevent duplicate demo roles,
permissions, and users. Existing user passwords are not overwritten on reruns.

The seed creates these collections:

- `users`: lowercase `username`, `displayName`, optional `email`, `passwordHash`,
  `roleId` (an ObjectId reference to `roles`), `status`, `createdAt`, and `updatedAt`.
- `roles`: `name`, `description`, `permissionKeys`, `createdAt`, and `updatedAt`.
- `permissions`: stable `key`, display `name`, `description`, `resource`,
  `action`, and timestamps.
- `audit_logs`: `actorUserId` (ObjectId or null), `actorUsername`, `action`,
  `details`, and `createdAt`.
- `subjects`: teacher-owned `name`, normalized `normalizedName`, `maxMarks`,
  `teacherId` (ObjectId reference to `users`), and timestamps.
- `marks`: `studentId` and `subjectId` ObjectId references, `teacherId` for
  teacher scoping, `marksObtained`, and timestamps. The maximum is read from the
  referenced subject so it is not duplicated in each mark record.

MongoDB JSON Schema validators and indexes are installed by the seed script.
Roles refer to permissions by stable permission keys; users refer to roles by
ObjectId. Subject names and marks have unique indexes within each teacher's
scope. Academic collections start empty; no demo subjects, students, or marks
are inserted by the seed.

## Local-only demo credentials

These public demo passwords are for localhost development only. Do not reuse
them for real accounts or deploy them to a shared or production environment.

| Role | Username | Password |
| --- | --- | --- |
| Admin | `admin` | `Admin@123` |
| Teacher | `teacher1` | `Teacher@123` |
| Student | `student1` | `Student@123` |

Only bcrypt password hashes are stored in MongoDB. The seeded passwords are
not real secrets and must never be used outside local development.

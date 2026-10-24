"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Activity,
  ArrowLeft,
  BookOpen,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";

type TeacherUser = {
  id: string;
  username: string;
  displayName: string;
  role: "Admin" | "Teacher" | "Student";
};

type Student = { id: string; username: string; name: string; email: string };
type Subject = { id: string; name: string; maxMarks: number; createdAt: string };
type Mark = {
  id: string;
  studentId: string;
  studentName: string;
  studentUsername: string;
  subjectId: string;
  subjectName: string;
  marksObtained: number;
  maxMarks: number;
  percentage: number;
  updatedAt: string;
};
type StudentRecord = Omit<Mark, "studentId" | "studentName" | "studentUsername" | "subjectId"> & {
  subject: string;
};
type DashboardStats = { totalStudents: number; totalSubjects: number; marksRecords: number };
type PageName = "Overview" | "Student List" | "Subject Management" | "Marks Management" | "Settings";

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

function responseError(payload: { error?: unknown }, fallback: string): string {
  return typeof payload.error === "string" ? payload.error : fallback;
}

export default function TeacherWorkspace({ user, onLogout }: { user: TeacherUser; onLogout: () => void }) {
  const [activePage, setActivePage] = useState<PageName>("Overview");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentsError, setStudentsError] = useState("");
  const [studentQuery, setStudentQuery] = useState("");
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(false);
  const [subjectsError, setSubjectsError] = useState("");
  const [subjectName, setSubjectName] = useState("");
  const [subjectMaxMarks, setSubjectMaxMarks] = useState("100");
  const [isCreatingSubject, setIsCreatingSubject] = useState(false);
  const [subjectMessage, setSubjectMessage] = useState("");
  const [subjectError, setSubjectError] = useState("");
  const [marks, setMarks] = useState<Mark[]>([]);
  const [marksLoading, setMarksLoading] = useState(false);
  const [marksError, setMarksError] = useState("");
  const [marksQuery, setMarksQuery] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [marksObtained, setMarksObtained] = useState("");
  const [isSavingMarks, setIsSavingMarks] = useState(false);
  const [marksMessage, setMarksMessage] = useState("");
  const [marksFormError, setMarksFormError] = useState("");
  const [openedStudent, setOpenedStudent] = useState<Student | null>(null);
  const [studentRecords, setStudentRecords] = useState<StudentRecord[]>([]);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");

  const loadStats = useCallback(async () => {
    try {
      const response = await fetch("/api/teacher/stats", { cache: "no-store" });
      const payload = await readJson<{ stats?: DashboardStats; error?: unknown }>(response);
      setStatsError("");
      if (!response.ok || !payload.stats) throw new Error(responseError(payload, "Academic overview is unavailable."));
      setStats(payload.stats);
    } catch (error) {
      setStats(null);
      setStatsError(error instanceof Error ? error.message : "Academic overview is unavailable.");
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const loadStudents = useCallback(async () => {
    setStudentsLoading(true);
    setStudentsError("");
    try {
      const response = await fetch("/api/teacher/students", { cache: "no-store" });
      const payload = await readJson<{ students?: Student[]; error?: unknown }>(response);
      if (!response.ok || !Array.isArray(payload.students)) throw new Error(responseError(payload, "Student list is unavailable."));
      setStudents(payload.students);
    } catch (error) {
      setStudentsError(error instanceof Error ? error.message : "Student list is unavailable.");
    } finally {
      setStudentsLoading(false);
    }
  }, []);

  const loadSubjects = useCallback(async () => {
    setSubjectsLoading(true);
    setSubjectsError("");
    try {
      const response = await fetch("/api/teacher/subjects", { cache: "no-store" });
      const payload = await readJson<{ subjects?: Subject[]; error?: unknown }>(response);
      if (!response.ok || !Array.isArray(payload.subjects)) throw new Error(responseError(payload, "Subject list is unavailable."));
      setSubjects(payload.subjects);
    } catch (error) {
      setSubjectsError(error instanceof Error ? error.message : "Subject list is unavailable.");
    } finally {
      setSubjectsLoading(false);
    }
  }, []);

  const loadMarks = useCallback(async () => {
    setMarksLoading(true);
    setMarksError("");
    try {
      const response = await fetch("/api/teacher/marks", { cache: "no-store" });
      const payload = await readJson<{ marks?: Mark[]; error?: unknown }>(response);
      if (!response.ok || !Array.isArray(payload.marks)) throw new Error(responseError(payload, "Marks are unavailable."));
      setMarks(payload.marks);
    } catch (error) {
      setMarksError(error instanceof Error ? error.message : "Marks are unavailable.");
    } finally {
      setMarksLoading(false);
    }
  }, []);

  useEffect(() => { void Promise.resolve().then(loadStats); }, [loadStats]);
  function navigateTo(page: PageName) {
    setActivePage(page);
    setMobileMenuOpen(false);
    setOpenedStudent(null);
    if (page === "Student List" || page === "Marks Management") void loadStudents();
    if (page === "Subject Management" || page === "Marks Management") void loadSubjects();
    if (page === "Marks Management") void loadMarks();
  }

  const filteredStudents = useMemo(() => students.filter((student) =>
    `${student.name} ${student.username}`.toLowerCase().includes(studentQuery.trim().toLowerCase()),
  ), [students, studentQuery]);
  const filteredMarks = useMemo(() => marks.filter((mark) =>
    `${mark.studentName} ${mark.studentUsername} ${mark.subjectName}`.toLowerCase().includes(marksQuery.trim().toLowerCase()),
  ), [marks, marksQuery]);
  const selectedSubject = subjects.find((subject) => subject.id === selectedSubjectId);

  async function createSubject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isCreatingSubject) return;
    setIsCreatingSubject(true);
    setSubjectError("");
    setSubjectMessage("");
    try {
      const response = await fetch("/api/teacher/subjects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: subjectName, maxMarks: Number(subjectMaxMarks) }),
      });
      const payload = await readJson<{ subject?: Subject; error?: unknown }>(response);
      if (!response.ok || !payload.subject) throw new Error(responseError(payload, "Subject could not be created."));
      setSubjectMessage(`${payload.subject.name} was added successfully.`);
      setSubjectName("");
      setSubjectMaxMarks("100");
      setStatsLoading(true);
      await Promise.all([loadSubjects(), loadStats()]);
    } catch (error) {
      setSubjectError(error instanceof Error ? error.message : "Subject could not be created.");
    } finally {
      setIsCreatingSubject(false);
    }
  }

  async function saveMarks(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSavingMarks) return;
    setIsSavingMarks(true);
    setMarksFormError("");
    setMarksMessage("");
    const numericMarks = Number(marksObtained);
    if (!selectedStudentId || !selectedSubjectId || marksObtained.trim() === "" || !Number.isFinite(numericMarks)) {
      setMarksFormError("Choose a student and subject, then enter a valid mark.");
      setIsSavingMarks(false);
      return;
    }
    if (!selectedSubject || numericMarks < 0 || numericMarks > selectedSubject.maxMarks) {
      setMarksFormError(`Marks must be between 0 and ${selectedSubject?.maxMarks ?? "the subject maximum"}.`);
      setIsSavingMarks(false);
      return;
    }
    try {
      const response = await fetch("/api/teacher/marks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: selectedStudentId, subjectId: selectedSubjectId, marksObtained: numericMarks }),
      });
      const payload = await readJson<{ created?: boolean; error?: unknown }>(response);
      if (!response.ok) throw new Error(responseError(payload, "Marks could not be saved."));
      setMarksMessage(payload.created ? "Marks were saved." : "Existing marks were updated.");
      setMarksObtained("");
      setStatsLoading(true);
      await Promise.all([loadMarks(), loadStats()]);
    } catch (error) {
      setMarksFormError(error instanceof Error ? error.message : "Marks could not be saved.");
    } finally {
      setIsSavingMarks(false);
    }
  }

  async function openStudent(student: Student) {
    setOpenedStudent(student);
    setStudentRecords([]);
    setProfileError("");
    setProfileLoading(true);
    try {
      const response = await fetch(`/api/teacher/students/${encodeURIComponent(student.id)}`, { cache: "no-store" });
      const payload = await readJson<{ records?: StudentRecord[]; error?: unknown }>(response);
      if (!response.ok || !Array.isArray(payload.records)) throw new Error(responseError(payload, "Student records are unavailable."));
      setStudentRecords(payload.records);
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : "Student records are unavailable.");
    } finally {
      setProfileLoading(false);
    }
  }

  const navItems: Array<{ name: PageName; icon: typeof LayoutDashboard }> = [
    { name: "Overview", icon: LayoutDashboard },
    { name: "Student List", icon: Users },
    { name: "Subject Management", icon: BookOpen },
    { name: "Marks Management", icon: ClipboardList },
    { name: "Settings", icon: Settings },
  ];
  const metricValue = (value: number | undefined) => statsLoading ? "…" : value?.toLocaleString() ?? "—";

  return (
    <main className="dashboard-shell">
      <aside className={`sidebar ${mobileMenuOpen ? "sidebar-open" : ""}`}>
        <div className="brand sidebar-brand"><span className="brand-icon"><ShieldCheck /></span><span>Secure<span className="brand-accent">Access</span></span></div>
        <div className="workspace-label">TEACHER WORKSPACE</div>
        <nav aria-label="Teacher navigation">
          {navItems.map(({ name, icon: Icon }) => (
            <button key={name} className={`nav-link ${activePage === name ? "nav-active" : ""}`} onClick={() => navigateTo(name)}>
              <Icon size={19} /><span>{name}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="security-card"><div className="security-card-icon"><ShieldCheck size={19} /></div><strong>Academic access</strong><p>Student and marks routes check your current role permissions.</p><span><i /> Session verified</span></div>
          <div className="sidebar-version">RBAC SYSTEM <span>v1.0.0</span></div>
        </div>
      </aside>

      <section className="dashboard-main">
        <header className="topbar">
          <button className="mobile-menu-button" onClick={() => setMobileMenuOpen((open) => !open)} aria-label="Toggle menu"><Menu /></button>
          <div className="breadcrumb">Teacher workspace <span>/</span> <strong>{openedStudent ? "Student profile" : activePage}</strong></div>
          <div className="topbar-right">
            <div className="profile"><div className="profile-avatar">{user.username.slice(0, 1).toUpperCase()}</div><div className="profile-text"><strong>{user.username}</strong><span>Teacher</span></div></div>
            <button className="icon-button" title="Sign out" aria-label="Sign out" onClick={onLogout}><LogOut size={18} /></button>
          </div>
        </header>

        <div className="page-content">
          <div className="welcome-row">
            <div><div className="eyebrow">ACADEMIC WORKSPACE</div><h1>{openedStudent ? "Student profile" : activePage}</h1><p>Welcome, {user.displayName}. Manage your subjects and student marks.</p></div>
            <span className="date-chip"><span className="online-dot" /> Teacher access</span>
          </div>

          {activePage === "Overview" && <>
            <div className="stat-grid teacher-stat-grid" aria-busy={statsLoading}>
              <article className="stat-card"><div className="stat-top"><span>Active students</span><span className="stat-icon blue"><GraduationCap size={19} /></span></div><div className="stat-number">{metricValue(stats?.totalStudents)}</div><div className="stat-caption">Student accounts in MongoDB</div></article>
              <article className="stat-card"><div className="stat-top"><span>My subjects</span><span className="stat-icon purple"><BookOpen size={19} /></span></div><div className="stat-number">{metricValue(stats?.totalSubjects)}</div><div className="stat-caption">Subjects created by your account</div></article>
              <article className="stat-card"><div className="stat-top"><span>Marks records</span><span className="stat-icon green"><Activity size={19} /></span></div><div className="stat-number">{metricValue(stats?.marksRecords)}</div><div className="stat-caption">Saved records in your teacher scope</div></article>
            </div>
            {statsError && <p className="form-error" role="alert">{statsError}</p>}
            <section className="panel teacher-welcome-panel">
              <div className="teacher-welcome-icon"><BookOpen size={22} /></div>
              <div><h2>Your academic workspace</h2><p>Manage the students assigned to your academic workflow, create subjects, and record marks. Changes are saved to MongoDB and checked against your server-side permissions.</p></div>
              <button className="outline-button" onClick={() => setActivePage("Marks Management")}>Enter marks</button>
            </section>
          </>}

          {activePage === "Student List" && !openedStudent && <section className="panel users-panel">
            <div className="panel-heading"><div><h2>Student list</h2><p>Active student accounts</p></div><div className="table-actions"><label className="search-box"><Search size={16} /><input value={studentQuery} onChange={(event) => setStudentQuery(event.target.value)} placeholder="Search name or username" aria-label="Search students" /></label><button className="outline-button" onClick={() => void loadStudents()} disabled={studentsLoading}>{studentsLoading ? "Refreshing…" : "Refresh"}</button></div></div>
            {studentsLoading ? <p className="management-message" role="status">Loading student records…</p> : studentsError ? <p className="form-error" role="alert">{studentsError}</p> : students.length === 0 ? <p className="management-message">No active student accounts were found.</p> : filteredStudents.length === 0 ? <p className="management-message">No students match this search.</p> : <div className="table-wrap"><table><thead><tr><th>STUDENT</th><th>USERNAME</th><th>EMAIL</th><th>ACADEMIC RECORDS</th></tr></thead><tbody>{filteredStudents.map((student) => <tr key={student.id}><td><div className="user-cell"><span className="user-avatar">{student.name.slice(0, 1).toUpperCase()}</span><strong>{student.name}</strong></div></td><td>{student.username}</td><td>{student.email || "—"}</td><td><button className="text-action" onClick={() => void openStudent(student)}>View profile</button></td></tr>)}</tbody></table></div>}
          </section>}

          {activePage === "Student List" && openedStudent && <section className="panel">
            <div className="panel-heading"><div><h2>{openedStudent.name}</h2><p>{openedStudent.username}{openedStudent.email ? ` · ${openedStudent.email}` : ""}</p></div><button className="outline-button" onClick={() => { setOpenedStudent(null); setProfileError(""); }}><ArrowLeft size={15} /> Back to students</button></div>
            <div className="student-record-heading"><GraduationCap size={19} /><span>Academic records and marks</span></div>
            {profileLoading ? <p className="management-message" role="status">Loading this student’s records…</p> : profileError ? <p className="form-error" role="alert">{profileError}</p> : studentRecords.length === 0 ? <p className="management-message">No marks have been recorded for this student in your subjects yet.</p> : <div className="table-wrap"><table><thead><tr><th>SUBJECT</th><th>MARKS</th><th>MAXIMUM</th><th>PERCENTAGE</th><th>UPDATED</th></tr></thead><tbody>{studentRecords.map((record) => <tr key={record.id}><td>{record.subject}</td><td>{record.marksObtained}</td><td>{record.maxMarks}</td><td>{record.percentage}%</td><td>{new Date(record.updatedAt).toLocaleDateString()}</td></tr>)}</tbody></table></div>}
          </section>}

          {activePage === "Subject Management" && <>
            <section className="panel users-panel">
              <div className="panel-heading"><div><h2>Add a subject</h2><p>Set a subject name and its maximum mark value.</p></div></div>
              <form className="create-user-form" onSubmit={createSubject} aria-busy={isCreatingSubject}>
                <div className="teacher-form-grid">
                  <label>Subject name<input value={subjectName} onChange={(event) => setSubjectName(event.target.value)} required minLength={2} maxLength={100} placeholder="e.g. Mathematics" disabled={isCreatingSubject} /></label>
                  <label>Maximum marks<input type="number" value={subjectMaxMarks} onChange={(event) => setSubjectMaxMarks(event.target.value)} required min="0.01" max="1000000" step="any" disabled={isCreatingSubject} /></label>
                </div>
                {subjectError && <p className="form-error" role="alert">{subjectError}</p>}
                {subjectMessage && <p className="form-success" role="status">{subjectMessage}</p>}
                <button className="create-user-button" type="submit" disabled={isCreatingSubject}>{isCreatingSubject ? "Adding subject…" : "Add subject"}</button>
              </form>
            </section>
            <section className="panel users-panel">
              <div className="panel-heading"><div><h2>My subjects</h2><p>Subjects created by your account</p></div><button className="outline-button" onClick={() => void loadSubjects()} disabled={subjectsLoading}>{subjectsLoading ? "Refreshing…" : "Refresh"}</button></div>
              {subjectsLoading ? <p className="management-message" role="status">Loading subjects…</p> : subjectsError ? <p className="form-error" role="alert">{subjectsError}</p> : subjects.length === 0 ? <p className="management-message">No subjects yet — add your first subject.</p> : <div className="table-wrap"><table><thead><tr><th>SUBJECT</th><th>MAXIMUM MARKS</th><th>CREATED</th></tr></thead><tbody>{subjects.map((subject) => <tr key={subject.id}><td><strong>{subject.name}</strong></td><td>{subject.maxMarks}</td><td>{new Date(subject.createdAt).toLocaleDateString()}</td></tr>)}</tbody></table></div>}
            </section>
          </>}

          {activePage === "Marks Management" && <>
            <section className="panel users-panel">
              <div className="panel-heading"><div><h2>Enter student marks</h2><p>Choose a student and one of your subjects.</p></div></div>
              {subjectsError || studentsError ? <p className="form-error" role="alert">{subjectsError || studentsError}</p> : subjectsLoading || studentsLoading ? <p className="management-message" role="status">Loading students and subjects…</p> : subjects.length === 0 ? <p className="management-message">Add a subject before entering marks.</p> : students.length === 0 ? <p className="management-message">No active students are available for mark entry.</p> : <form className="create-user-form" onSubmit={saveMarks} aria-busy={isSavingMarks}>
                <div className="teacher-form-grid teacher-form-grid-three">
                  <label>Student<select value={selectedStudentId} onChange={(event) => setSelectedStudentId(event.target.value)} required disabled={isSavingMarks}><option value="">Select a student</option>{students.map((student) => <option key={student.id} value={student.id}>{student.name} ({student.username})</option>)}</select></label>
                  <label>Subject<select value={selectedSubjectId} onChange={(event) => setSelectedSubjectId(event.target.value)} required disabled={isSavingMarks}><option value="">Select a subject</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>
                  <label>Marks obtained<input type="number" value={marksObtained} onChange={(event) => setMarksObtained(event.target.value)} required min="0" max={selectedSubject?.maxMarks} step="any" placeholder={selectedSubject ? `0 – ${selectedSubject.maxMarks}` : "Select subject first"} disabled={isSavingMarks || !selectedSubject} /></label>
                </div>
                {selectedSubject && <p className="max-marks-note">Maximum for {selectedSubject.name}: <strong>{selectedSubject.maxMarks}</strong></p>}
                {marksFormError && <p className="form-error" role="alert">{marksFormError}</p>}
                {marksMessage && <p className="form-success" role="status">{marksMessage}</p>}
                <button className="create-user-button" type="submit" disabled={isSavingMarks || subjects.length === 0 || students.length === 0}>{isSavingMarks ? "Saving marks…" : "Save marks"}</button>
              </form>}
            </section>
            <section className="panel users-panel">
              <div className="panel-heading"><div><h2>Saved marks</h2><p>Current records from your teacher scope</p></div><div className="table-actions"><label className="search-box"><Search size={16} /><input value={marksQuery} onChange={(event) => setMarksQuery(event.target.value)} placeholder="Search student or subject" aria-label="Search marks" /></label><button className="outline-button" onClick={() => void loadMarks()} disabled={marksLoading}>{marksLoading ? "Refreshing…" : "Refresh"}</button></div></div>
              {marksLoading ? <p className="management-message" role="status">Loading marks…</p> : marksError ? <p className="form-error" role="alert">{marksError}</p> : marks.length === 0 ? <p className="management-message">No marks have been saved yet.</p> : filteredMarks.length === 0 ? <p className="management-message">No marks match this search.</p> : <div className="table-wrap"><table><thead><tr><th>STUDENT</th><th>SUBJECT</th><th>MARKS OBTAINED</th><th>MAXIMUM</th><th>PERCENTAGE</th></tr></thead><tbody>{filteredMarks.map((mark) => <tr key={mark.id}><td><span className="teacher-table-primary">{mark.studentName}</span><span className="teacher-table-secondary">{mark.studentUsername}</span></td><td>{mark.subjectName}</td><td>{mark.marksObtained}</td><td>{mark.maxMarks}</td><td><span className="percentage-chip">{mark.percentage}%</span></td></tr>)}</tbody></table></div>}
            </section>
          </>}

          {activePage === "Settings" && <section className="panel"><div className="panel-heading"><div><h2>Account settings</h2><p>Your authenticated workspace profile</p></div></div><div className="setting-row"><div><strong>Display name</strong><p>{user.displayName}</p></div><span className="role-tag teacher">Teacher</span></div><div className="setting-row"><div><strong>Username</strong><p>{user.username}</p></div><Users /></div><div className="panel-foot"><ShieldCheck size={16} /> Your role and access are verified from the signed-in session and current MongoDB permissions.</div></section>}

          {activePage === "Overview" && <div className="footer-note"><ShieldCheck size={16} /> Overview cards are calculated from student accounts and academic records stored in MongoDB.</div>}
        </div>
      </section>
    </main>
  );
}

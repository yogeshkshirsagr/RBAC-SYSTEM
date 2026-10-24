"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  BookOpen,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  ShieldCheck,
  UserRound,
} from "lucide-react";

type StudentUser = {
  id: string;
  username: string;
  displayName: string;
  email?: string;
  role: "Admin" | "Teacher" | "Student";
};

type AcademicRecord = {
  subject: string;
  marksObtained: number;
  maxMarks: number;
  percentage: number;
  updatedAt: string;
};

type StudentSummary = {
  hasRecords: boolean;
  recordedSubjects: number;
  averagePercentage: number | null;
};

type StudentPage = "Overview" | "My Academic Records" | "My Profile";

async function readPayload(response: Response) {
  return (await response.json()) as {
    error?: unknown;
    records?: AcademicRecord[];
    summary?: StudentSummary;
  };
}

function getError(payload: { error?: unknown }, fallback: string) {
  return typeof payload.error === "string" ? payload.error : fallback;
}

export default function StudentWorkspace({
  user,
  onLogout,
}: {
  user: StudentUser;
  onLogout: () => void;
}) {
  const [activePage, setActivePage] = useState<StudentPage>("Overview");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [records, setRecords] = useState<AcademicRecord[]>([]);
  const [summary, setSummary] = useState<StudentSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [subjectQuery, setSubjectQuery] = useState("");

  const loadRecords = useCallback(async () => {
    try {
      // The endpoint derives the student identity from the signed session; no ID is sent.
      const response = await fetch("/api/student/records", { cache: "no-store" });
      const payload = await readPayload(response);
      if (!response.ok || !Array.isArray(payload.records) || !payload.summary) {
        throw new Error(getError(payload, "Your academic records are unavailable."));
      }
      setRecords(payload.records);
      setSummary(payload.summary);
      setError("");
    } catch (loadError) {
      setRecords([]);
      setSummary(null);
      setError(loadError instanceof Error ? loadError.message : "Your academic records are unavailable.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void Promise.resolve().then(loadRecords); }, [loadRecords]);

  const filteredRecords = useMemo(
    () => records.filter((record) => record.subject.toLowerCase().includes(subjectQuery.trim().toLowerCase())),
    [records, subjectQuery],
  );
  const recentRecords = records.slice(0, 4);
  const displayValue = (value: number | null | undefined, suffix = "") => {
    if (isLoading) return "…";
    if (error || !summary?.hasRecords || value === null || value === undefined) return "—";
    return `${value.toLocaleString()}${suffix}`;
  };

  const navItems: Array<{ name: StudentPage; icon: typeof LayoutDashboard }> = [
    { name: "Overview", icon: LayoutDashboard },
    { name: "My Academic Records", icon: BookOpen },
    { name: "My Profile", icon: UserRound },
  ];

  return (
    <main className="dashboard-shell">
      <aside className={`sidebar ${mobileMenuOpen ? "sidebar-open" : ""}`}>
        <div className="brand sidebar-brand"><span className="brand-icon"><ShieldCheck /></span><span>Secure<span className="brand-accent">Access</span></span></div>
        <div className="workspace-label">STUDENT WORKSPACE</div>
        <nav aria-label="Student navigation">
          {navItems.map(({ name, icon: Icon }) => (
            <button
              key={name}
              className={`nav-link ${activePage === name ? "nav-active" : ""}`}
              onClick={() => { setActivePage(name); setMobileMenuOpen(false); }}
            >
              <Icon size={19} /><span>{name}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="security-card"><div className="security-card-icon"><ShieldCheck size={19} /></div><strong>Private records</strong><p>Your academic records are loaded for your signed-in account only.</p><span><i /> Session verified</span></div>
          <div className="sidebar-version">RBAC SYSTEM <span>v1.0.0</span></div>
        </div>
      </aside>

      <section className="dashboard-main">
        <header className="topbar">
          <button className="mobile-menu-button" onClick={() => setMobileMenuOpen((open) => !open)} aria-label="Toggle menu"><Menu /></button>
          <div className="breadcrumb">Student workspace <span>/</span> <strong>{activePage}</strong></div>
          <div className="topbar-right">
            <div className="profile"><div className="profile-avatar">{user.username.slice(0, 1).toUpperCase()}</div><div className="profile-text"><strong>{user.username}</strong><span>Student</span></div></div>
            <button className="icon-button" title="Sign out" aria-label="Sign out" onClick={onLogout}><LogOut size={18} /></button>
          </div>
        </header>

        <div className="page-content">
          <div className="welcome-row">
            <div><div className="eyebrow">STUDENT WORKSPACE</div><h1>{activePage === "Overview" ? "Academic overview" : activePage}</h1><p>Welcome back, {user.displayName}. Here is your academic progress.</p></div>
            <span className="date-chip"><span className="online-dot" /> Signed in as Student</span>
          </div>

          {error && <div className="student-load-error" role="alert"><span>{error}</span><button className="outline-button" onClick={() => { setIsLoading(true); void loadRecords(); }}>Try again</button></div>}

          {activePage === "Overview" && <>
            <div className="stat-grid student-stat-grid" aria-busy={isLoading}>
              <article className="stat-card"><div className="stat-top"><span>Subjects with results</span><span className="stat-icon blue"><BookOpen size={19} /></span></div><div className="stat-number">{displayValue(summary?.recordedSubjects)}</div><div className="stat-caption">Distinct subjects with recorded marks</div></article>
              <article className="stat-card"><div className="stat-top"><span>Average percentage</span><span className="stat-icon purple"><GraduationCap size={19} /></span></div><div className="stat-number">{displayValue(summary?.averagePercentage, "%")}</div><div className="stat-caption">Mean of your recorded result percentages</div></article>
            </div>

            <section className="panel student-recent-panel">
              <div className="panel-heading"><div><h2>Recent results</h2><p>Your most recently updated academic records</p></div><button className="outline-button" onClick={() => setActivePage("My Academic Records")}>My academic records <ArrowUpRight size={15} /></button></div>
              {isLoading ? <p className="management-message" role="status">Loading your academic records…</p> : error ? null : recentRecords.length === 0 ? <p className="student-empty-state"><BookOpen size={21} />No academic results available yet. Your results will appear here once your teacher records your marks.</p> : <div className="table-wrap"><table><thead><tr><th>SUBJECT</th><th>MARKS</th><th>MAXIMUM</th><th>PERCENTAGE</th><th>UPDATED</th></tr></thead><tbody>{recentRecords.map((record, index) => <tr key={`${record.subject}-${record.updatedAt}-${index}`}><td><strong>{record.subject}</strong></td><td>{record.marksObtained}</td><td>{record.maxMarks}</td><td><span className="percentage-chip">{record.percentage}%</span></td><td>{new Date(record.updatedAt).toLocaleDateString()}</td></tr>)}</tbody></table></div>}
            </section>
            {!isLoading && !error && records.length > 0 && <div className="footer-note"><ShieldCheck size={16} /> Your average is calculated as the arithmetic mean of each recorded result percentage.</div>}
          </>}

          {activePage === "My Academic Records" && <section className="panel users-panel">
            <div className="panel-heading"><div><h2>My academic records</h2><p>Results associated with your signed-in account</p></div><div className="table-actions"><label className="search-box"><Search size={16} /><input value={subjectQuery} onChange={(event) => setSubjectQuery(event.target.value)} placeholder="Filter by subject" aria-label="Filter by subject" /></label><button className="outline-button" onClick={() => { setIsLoading(true); void loadRecords(); }} disabled={isLoading}>{isLoading ? "Refreshing…" : "Refresh"}</button></div></div>
            {isLoading ? <p className="management-message" role="status">Loading your records…</p> : error ? null : records.length === 0 ? <p className="student-empty-state"><BookOpen size={21} />No academic results available yet. Your results will appear here once your teacher records your marks.</p> : filteredRecords.length === 0 ? <p className="management-message">No subjects match this filter.</p> : <div className="table-wrap"><table><thead><tr><th>SUBJECT</th><th>MARKS OBTAINED</th><th>MAXIMUM MARKS</th><th>PERCENTAGE</th></tr></thead><tbody>{filteredRecords.map((record, index) => <tr key={`${record.subject}-${record.updatedAt}-${index}`}><td><strong>{record.subject}</strong></td><td>{record.marksObtained}</td><td>{record.maxMarks}</td><td><span className="percentage-chip">{record.percentage}%</span></td></tr>)}</tbody></table></div>}
          </section>}

          {activePage === "My Profile" && <section className="panel student-profile-panel">
            <div className="panel-heading"><div><h2>My profile</h2><p>Read-only account information</p></div><span className="role-tag">Student</span></div>
            <div className="student-profile-grid">
              <div><span>DISPLAY NAME</span><strong>{user.displayName}</strong></div>
              <div><span>USERNAME</span><strong>{user.username}</strong></div>
              <div><span>EMAIL</span><strong>{user.email || "Not provided"}</strong></div>
              <div><span>ROLE</span><strong>Student</strong></div>
            </div>
            <div className="panel-foot"><ShieldCheck size={16} /> Profile details are read from your authenticated account.</div>
          </section>}
        </div>
      </section>
    </main>
  );
}

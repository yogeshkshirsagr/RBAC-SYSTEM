
"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  ShieldCheck, LayoutDashboard, Users, Shield, Activity,
  Settings, Search, Bell, ChevronDown, LockKeyhole,
  ArrowUpRight, LogOut, GraduationCap, BookOpen,
  CheckCircle2, XCircle, Menu
} from "lucide-react";
import TeacherWorkspace from "./components/TeacherWorkspace";
import StudentWorkspace from "./components/StudentWorkspace";

type Role = "Admin" | "Teacher" | "Student";
type PermissionKey =
  | "manage_users"
  | "view_student_records"
  | "update_marks"
  | "view_own_records"
  | "view_security_logs";

type AuthenticatedUser = {
  id: string;
  username: string;
  displayName: string;
  email?: string;
  role: Role;
};

type ManagedUser = {
  id: string;
  username: string;
  displayName: string;
  email: string;
  role: Role;
  status: "active" | "disabled";
  createdAt: string;
  updatedAt: string;
};

type DashboardStats = {
  totalUsers: number;
  roleCount: number;
  permissionCount: number;
  auditEventCount: number;
  roleDistribution: Array<{ role: Role; count: number }>;
  permissionMatrix: Array<{ key: PermissionKey; name: string; roles: Role[] }>;
  recentEvents: Array<{
    actorUsername: string;
    action: string;
    details: string;
    createdAt: string;
  }>;
};

function parseAuthenticatedUser(payload: unknown): AuthenticatedUser | null {
  if (!payload || typeof payload !== "object" || !("user" in payload)) return null;
  const user = payload.user;
  if (!user || typeof user !== "object") return null;

  const candidate = user as Record<string, unknown>;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.username !== "string" ||
    typeof candidate.displayName !== "string" ||
    (candidate.role !== "Admin" && candidate.role !== "Teacher" && candidate.role !== "Student")
  ) {
    return null;
  }

  return {
    id: candidate.id,
    username: candidate.username,
    displayName: candidate.displayName,
    email: typeof candidate.email === "string" ? candidate.email : "",
    role: candidate.role,
  };
}

const rolePresentation: Record<Role, { label: string; detail: string; icon: typeof ShieldCheck; color: string; className: string }> = {
  Admin: { label: "Administrators", detail: "Privileged access", icon: ShieldCheck, color: "#5478f5", className: "role-admin" },
  Teacher: { label: "Teachers", detail: "Academic access", icon: BookOpen, color: "#9b7af5", className: "role-teacher" },
  Student: { label: "Students", detail: "Personal records", icon: GraduationCap, color: "#2bb89a", className: "role-student" },
};

export default function Home() {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [activePage, setActivePage] = useState("Overview");
  const [query, setQuery] = useState("");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState("");
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState("");
  const [newUserError, setNewUserError] = useState("");
  const [newUserSuccess, setNewUserSuccess] = useState("");
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [newUser, setNewUser] = useState({
    name: "",
    username: "",
    email: "",
    initialPassword: "",
    role: "Teacher" as Role,
  });

  const loadManagedUsers = useCallback(async () => {
    setUsersLoading(true);
    setUsersError("");
    try {
      const response = await fetch("/api/users", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const payload = (await response.json()) as { error?: unknown; users?: unknown };
      if (!response.ok) {
        setUsersError(typeof payload.error === "string" ? payload.error : "Unable to load users.");
        return;
      }
      if (!Array.isArray(payload.users)) throw new Error("Invalid user list.");
      setManagedUsers(payload.users as ManagedUser[]);
    } catch {
      setUsersError("Unable to load users. Check your connection and try again.");
    } finally {
      setUsersLoading(false);
    }
  }, []);

  const loadDashboardStats = useCallback(async () => {
    setDashboardLoading(true);
    setDashboardError("");
    try {
      const response = await fetch("/api/dashboard/stats", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const payload = (await response.json()) as {
        error?: unknown;
        stats?: unknown;
      };
      if (!response.ok) {
        setDashboardStats(null);
        setDashboardError(
          typeof payload.error === "string" ? payload.error : "Dashboard data is unavailable.",
        );
        return;
      }
      if (!payload.stats || typeof payload.stats !== "object") {
        throw new Error("Invalid dashboard data.");
      }
      setDashboardStats(payload.stats as DashboardStats);
    } catch {
      setDashboardStats(null);
      setDashboardError("Unable to load dashboard data. Check your connection and try again.");
    } finally {
      setDashboardLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role !== "Admin") return;
    async function restoreManagedUsers() {
      await Promise.all([loadManagedUsers(), loadDashboardStats()]);
    }
    void restoreManagedUsers();
  }, [user, loadManagedUsers, loadDashboardStats]);

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isCreatingUser) return;

    setIsCreatingUser(true);
    setNewUserError("");
    setNewUserSuccess("");
    try {
      const response = await fetch("/api/users", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newUser),
      });
      const payload = (await response.json()) as {
        error?: unknown;
        user?: { username?: unknown };
      };
      if (!response.ok) {
        setNewUserError(typeof payload.error === "string" ? payload.error : "Unable to create user.");
        return;
      }

      const createdUsername = typeof payload.user?.username === "string" ? payload.user.username : newUser.username;
      setNewUserSuccess(`User ${createdUsername} was created.`);
      setNewUser({ name: "", username: "", email: "", initialPassword: "", role: "Teacher" });
      await Promise.all([loadManagedUsers(), loadDashboardStats()]);
    } catch {
      setNewUserError("Unable to reach the server. Check your connection and try again.");
    } finally {
      setIsCreatingUser(false);
    }
  }

  useEffect(() => {
    let isCurrent = true;

    async function restoreSession() {
      try {
        const response = await fetch("/api/auth/me", {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (response.status === 401) return;
        if (!response.ok) throw new Error("Session check failed.");

        const authenticatedUser = parseAuthenticatedUser(await response.json());
        if (!authenticatedUser) throw new Error("Invalid session profile.");
        if (isCurrent) setUser(authenticatedUser);
      } catch {
        if (isCurrent) setError("We couldn't verify your session. Please sign in again.");
      } finally {
        if (isCurrent) setIsCheckingSession(false);
      }
    }

    void restoreSession();
    return () => {
      isCurrent = false;
    };
  }, []);

  async function login(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isSubmitting || isCheckingSession) return;

    setIsSubmitting(true);
    setError("");
    try {
      const loginResponse = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!loginResponse.ok) {
        let message = "Unable to sign in. Please try again.";
        try {
          const responseBody = (await loginResponse.json()) as { error?: unknown };
          if (typeof responseBody.error === "string") message = responseBody.error;
        } catch {
          // Keep a generic message if the server response is not JSON.
        }
        setError(message);
        return;
      }

      const sessionResponse = await fetch("/api/auth/me", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!sessionResponse.ok) {
        try {
          await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
        } catch {
          // A failed profile lookup should not leave client state signed in.
        }
        setError("Your session could not be confirmed. Please sign in again.");
        return;
      }

      const authenticatedUser = parseAuthenticatedUser(await sessionResponse.json());
      if (!authenticatedUser) {
        setError("Your session could not be confirmed. Please sign in again.");
        return;
      }

      setUser(authenticatedUser);
      setPassword("");
      setActivePage("Overview");
    } catch {
      setError("Unable to reach the server. Check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function logout() {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    let logoutError = "";

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
      if (!response.ok) {
        logoutError = "We couldn't confirm sign out. Please try again.";
      }
    } catch {
      logoutError = "We couldn't reach the server to confirm sign out.";
    }

    setUser(null);
    setManagedUsers([]);
    setUsersError("");
    setDashboardStats(null);
    setDashboardError("");
    setUsername("");
    setPassword("");
    setActivePage("Overview");
    setError(logoutError);
    setIsLoggingOut(false);
  }

  if (isCheckingSession) {
    return (
      <main className="login-screen" aria-busy="true">
        <section className="login-form-area" style={{ gridColumn: "1 / -1" }}>
          <div className="login-form" role="status">
            <div className="login-lock"><LockKeyhole size={24} /></div>
            <span className="eyebrow">SECURE ACCESS</span>
            <h2>Restoring your session</h2>
            <p className="subtext">Please wait while we verify your sign-in.</p>
          </div>
        </section>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="login-screen">
        <section className="login-art">
          <div className="brand"><span className="brand-icon"><ShieldCheck /></span> Secure<span className="brand-accent">Access</span></div>
          <div className="art-content">
            <span className="eyebrow">ACCESS MANAGEMENT PLATFORM</span>
            <h1>One platform.<br />Every permission.<br /><span>Total control.</span></h1>
            <p>Manage identities, enforce access policies, and monitor security activity from one workspace.</p>
            <div className="art-feature"><ShieldCheck size={19} /> Role-based access control</div>
            <div className="art-feature"><Activity size={19} /> Centralized security monitoring</div>
          </div>
          <div className="art-footer">RBAC MANAGEMENT SYSTEM · 2026</div>
        </section>

        <section className="login-form-area">
          <div className="login-form">
            <div className="mobile-brand brand"><span className="brand-icon"><ShieldCheck /></span> Secure<span className="brand-accent">Access</span></div>
            <div className="login-lock"><LockKeyhole size={24} /></div>
            <span className="eyebrow">WELCOME BACK</span>
            <h2>Sign in to your workspace</h2>
            <p className="subtext">Enter your account details to continue.</p>

            <form onSubmit={login} aria-busy={isSubmitting}>
              <label htmlFor="username">Username</label>
              <input id="username" value={username} onChange={e => setUsername(e.target.value)} placeholder="Enter your username" autoComplete="username" required disabled={isSubmitting} />
              <label htmlFor="password">Password</label>
              <input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" autoComplete="current-password" required disabled={isSubmitting} />
              {error && <p className="form-error">{error}</p>}
              <button className="sign-in-button" type="submit" disabled={isSubmitting}>{isSubmitting ? "Signing in…" : "Sign in to dashboard"} <ArrowUpRight size={18} /></button>
            </form>

            <div className="demo-accounts">
              <strong>DEMO ACCOUNTS</strong>
              <button type="button" disabled={isSubmitting} onClick={() => { setUsername("admin"); setPassword("Admin@123"); }}>Admin <span>admin / Admin@123</span></button>
              <button type="button" disabled={isSubmitting} onClick={() => { setUsername("teacher1"); setPassword("Teacher@123"); }}>Teacher <span>teacher1 / Teacher@123</span></button>
              <button type="button" disabled={isSubmitting} onClick={() => { setUsername("student1"); setPassword("Student@123"); }}>Student <span>student1 / Student@123</span></button>
            </div>
            <p className="login-note">Educational prototype · Demo authentication only</p>
          </div>
        </section>
      </main>
    );
  }

  if (user.role === "Teacher") {
    return <TeacherWorkspace user={user} onLogout={() => void logout()} />;
  }
  if (user.role === "Student") {
    return <StudentWorkspace user={user} onLogout={() => void logout()} />;
  }

  const role = user.role;
  const signedIn = user.username;

  const nav = [
    { name: "Overview", icon: LayoutDashboard },
    ...(role === "Admin" ? [{ name: "User Management", icon: Users }] : []),
    ...(role === "Admin"
      ? [
          { name: "Roles & Permissions", icon: Shield },
          { name: "Security Activity", icon: Activity },
        ]
      : []),
  ];

  const visibleUsers = managedUsers.filter(u =>
    `${u.displayName} ${u.username} ${u.email} ${u.role}`.toLowerCase().includes(query.toLowerCase())
  );

  const dashboardValue = (value?: number) => {
    if (role !== "Admin") return "—";
    if (dashboardLoading) return "…";
    if (!dashboardStats) return "—";
    return value?.toLocaleString() ?? "—";
  };
  const dashboardStateMessage = dashboardLoading
    ? "Loading database records…"
    : dashboardError || (role !== "Admin" ? "Admin access required." : "Dashboard data is unavailable.");

  return (
    <main className="dashboard-shell">
      <aside className={`sidebar ${mobileMenu ? "sidebar-open" : ""}`}>
        <div className="brand sidebar-brand"><span className="brand-icon"><ShieldCheck /></span><span>Secure<span className="brand-accent">Access</span></span></div>
        <div className="workspace-label">WORKSPACE</div>
        <nav>
          {nav.map(item => {
            const Icon = item.icon;
            return <button key={item.name} className={`nav-link ${activePage === item.name ? "nav-active" : ""}`} onClick={() => { setActivePage(item.name); setMobileMenu(false); }}><Icon size={19} /><span>{item.name}</span></button>;
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="security-card"><div className="security-card-icon"><ShieldCheck size={19} /></div><strong>Security status</strong><p>Protected user APIs check permissions</p><span><i /> Session verified</span></div>
          <button className="nav-link" onClick={() => setActivePage("Settings")}><Settings size={19} /><span>Settings</span></button>
          <div className="sidebar-version">RBAC SYSTEM <span>v1.0.0</span></div>
        </div>
      </aside>

      <section className="dashboard-main">
        <header className="topbar">
          <button className="mobile-menu-button" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Toggle menu"><Menu /></button>
          <div className="breadcrumb">Workspace <span>/</span> <strong>{activePage}</strong></div>
          <div className="topbar-right">
            <button className="icon-button" aria-label="Notifications"><Bell size={19} /><i /></button>
            <div className="top-divider" />
            <div className="profile">
              <div className="profile-avatar">{signedIn.slice(0, 1).toUpperCase()}</div>
              <div className="profile-text"><strong>{signedIn}</strong><span>{role}</span></div>
              <ChevronDown size={15} />
            </div>
            <button className="icon-button" title="Logout" onClick={logout}><LogOut size={18} /></button>
          </div>
        </header>

        <div className="page-content">
          <div className="welcome-row">
            <div><div className="eyebrow">CONTROL CENTER</div><h1>{activePage === "Overview" ? "Dashboard overview" : activePage}</h1><p>Welcome back, {signedIn}. Here&apos;s what&apos;s happening in your workspace.</p></div>
            <span className="date-chip"><span className="online-dot" /> Signed in as {role}</span>
          </div>

          {activePage === "Overview" && <>
            <div className="stat-grid" aria-busy={dashboardLoading}>
              <article className="stat-card"><div className="stat-top"><span>Total users</span><span className="stat-icon blue"><Users size={19} /></span></div><div className="stat-number">{dashboardValue(dashboardStats?.totalUsers)}</div><div className="stat-caption">{role === "Admin" ? "MongoDB user records" : "Admin access required"}</div></article>
              <article className="stat-card"><div className="stat-top"><span>Defined roles</span><span className="stat-icon purple"><Shield size={19} /></span></div><div className="stat-number">{dashboardValue(dashboardStats?.roleCount)}</div><div className="stat-caption">{role === "Admin" ? "Roles stored in MongoDB" : "Admin access required"}</div></article>
              <article className="stat-card"><div className="stat-top"><span>Permissions</span><span className="stat-icon green"><ShieldCheck size={19} /></span></div><div className="stat-number">{dashboardValue(dashboardStats?.permissionCount)}</div><div className="stat-caption">{role === "Admin" ? "Permission records in MongoDB" : "Admin access required"}</div></article>
              <article className="stat-card"><div className="stat-top"><span>Security events</span><span className="stat-icon orange"><Activity size={19} /></span></div><div className="stat-number">{dashboardValue(dashboardStats?.auditEventCount)}</div><div className="stat-caption">{role === "Admin" ? "Recorded audit log entries" : "Admin access required"}</div></article>
            </div>

            <div className="content-grid">
              <section className="panel permission-panel">
                <div className="panel-heading"><div><h2>Permission overview</h2><p>Role assignments stored in MongoDB</p></div><span className="live-label"><i /> DATABASE POLICY</span></div>
                {dashboardStats ? <div className="table-wrap"><table><thead><tr><th>PERMISSION</th><th>ADMIN</th><th>TEACHER</th><th>STUDENT</th></tr></thead><tbody>{dashboardStats.permissionMatrix.map(permission => <tr key={permission.key}><td>{permission.name}</td>{(["Admin", "Teacher", "Student"] as const).map(roleName => { const allowed = permission.roles.includes(roleName); return <td key={roleName}><span className={`permission-pill ${allowed ? "allow" : "deny"}`}>{allowed ? <CheckCircle2 size={14} /> : <XCircle size={14} />}{allowed ? "Allow" : "Deny"}</span></td>; })}</tr>)}</tbody></table></div> : <p className="management-message" role={dashboardError ? "alert" : "status"}>{dashboardStateMessage}</p>}
                <div className="panel-foot"><ShieldCheck size={16} /> Permission assignments are read from MongoDB. The user-management API enforces its permission on the server.</div>
              </section>

              <section className="panel role-panel">
                <div className="panel-heading"><div><h2>Role distribution</h2><p>Accounts assigned to database roles</p></div></div>
                {dashboardStats ? dashboardStats.roleDistribution.map(entry => {
                  const presentation = rolePresentation[entry.role];
                  const Icon = presentation.icon;
                  const width = dashboardStats.totalUsers > 0 ? `${(entry.count / dashboardStats.totalUsers) * 100}%` : "0%";
                  return <div key={entry.role}>
                    <div className="role-stat"><div className={`role-symbol ${presentation.className}`}><Icon size={18} /></div><div className="role-info"><strong>{presentation.label}</strong><span>{presentation.detail}</span></div><strong>{entry.count.toLocaleString()}</strong></div>
                    <div className="distribution"><span style={{ width, background: presentation.color }} /></div>
                  </div>;
                }) : <p className="management-message" role={dashboardError ? "alert" : "status"}>{dashboardStateMessage}</p>}
                <div className="role-total"><span>Total user accounts</span><strong>{dashboardValue(dashboardStats?.totalUsers)}</strong></div>
              </section>
            </div>

            {role === "Admin" && <section className="panel users-panel">
              <div className="panel-heading"><div><h2>User directory</h2><p>Accounts stored in the database</p></div><div className="table-actions"><label className="search-box"><Search size={16} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search users..." /></label><button className="outline-button" onClick={() => setActivePage("User Management")}>Manage users <ArrowUpRight size={15} /></button></div></div>
              {usersLoading ? <p className="management-message">Loading users…</p> : usersError ? <p className="form-error" role="alert">{usersError}</p> : <div className="table-wrap"><table><thead><tr><th>USER</th><th>USERNAME</th><th>EMAIL</th><th>ROLE</th><th>STATUS</th></tr></thead><tbody>{visibleUsers.map(u=><tr key={u.id}><td><div className="user-cell"><span className="user-avatar">{u.displayName.slice(0, 1).toUpperCase()}</span><strong>{u.displayName}</strong></div></td><td>{u.username}</td><td>{u.email || "—"}</td><td><span className={`role-tag ${u.role.toLowerCase()}`}>{u.role}</span></td><td><span className="status-tag"><i />{u.status}</span></td></tr>)}</tbody></table></div>}
            </section>}

            <div className="footer-note"><ShieldCheck size={16} /> Dashboard statistics, role assignments, audit activity, and the Admin user directory are loaded from MongoDB. User-management requests are authorized on the server.</div>
          </>}

          {role === "Admin" && activePage === "User Management" && <>
            <section className="panel users-panel">
              <div className="panel-heading"><div><h2>Add user</h2><p>Create an account and assign one of the existing roles.</p></div></div>
              <form className="create-user-form" onSubmit={createUser} aria-busy={isCreatingUser}>
                <div className="user-create-grid">
                  <label>Name<input value={newUser.name} onChange={event => setNewUser({ ...newUser, name: event.target.value })} autoComplete="name" maxLength={100} required disabled={isCreatingUser} /></label>
                  <label>Username<input value={newUser.username} onChange={event => setNewUser({ ...newUser, username: event.target.value })} autoComplete="username" minLength={1} maxLength={64} pattern="[A-Za-z0-9._-]+" required disabled={isCreatingUser} /></label>
                  <label>Email<input type="email" value={newUser.email} onChange={event => setNewUser({ ...newUser, email: event.target.value })} autoComplete="email" maxLength={254} required disabled={isCreatingUser} /></label>
                  <label>Initial password<input type="password" value={newUser.initialPassword} onChange={event => setNewUser({ ...newUser, initialPassword: event.target.value })} autoComplete="new-password" minLength={8} maxLength={72} required disabled={isCreatingUser} /></label>
                  <label>Role<select value={newUser.role} onChange={event => setNewUser({ ...newUser, role: event.target.value as Role })} disabled={isCreatingUser}><option value="Admin">Admin</option><option value="Teacher">Teacher</option><option value="Student">Student</option></select></label>
                </div>
                {newUserError && <p className="form-error" role="alert">{newUserError}</p>}
                {newUserSuccess && <p className="form-success" role="status">{newUserSuccess}</p>}
                <button className="create-user-button" type="submit" disabled={isCreatingUser}>{isCreatingUser ? "Creating user…" : "Add user"}</button>
              </form>
            </section>

            <section className="panel users-panel">
              <div className="panel-heading"><div><h2>User directory</h2><p>Database accounts and assigned roles.</p></div><div className="table-actions"><label className="search-box"><Search size={16}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search users..." /></label><button className="outline-button" onClick={() => void loadManagedUsers()} disabled={usersLoading}>{usersLoading ? "Refreshing…" : "Refresh"}</button></div></div>
              {usersLoading ? <p className="management-message" role="status">Loading users…</p> : usersError ? <p className="form-error" role="alert">{usersError}</p> : <div className="table-wrap"><table><thead><tr><th>USER</th><th>USERNAME</th><th>EMAIL</th><th>ROLE</th><th>STATUS</th></tr></thead><tbody>{visibleUsers.map(u=><tr key={u.id}><td><div className="user-cell"><span className="user-avatar">{u.displayName.slice(0, 1).toUpperCase()}</span><strong>{u.displayName}</strong></div></td><td>{u.username}</td><td>{u.email || "—"}</td><td><span className={`role-tag ${u.role.toLowerCase()}`}>{u.role}</span></td><td><span className="status-tag"><i />{u.status}</span></td></tr>)}</tbody></table>{visibleUsers.length === 0 && <p className="management-message">No users match this search.</p>}</div>}
            </section>
          </>}

          {role === "Admin" && activePage === "Roles & Permissions" && <section className="panel permission-panel">
            <div className="panel-heading"><div><h2>Role policy matrix</h2><p>Current permission assignments from MongoDB</p></div></div>
            {dashboardStats ? <div className="table-wrap"><table><thead><tr><th>PERMISSION</th><th>ADMIN</th><th>TEACHER</th><th>STUDENT</th></tr></thead><tbody>{dashboardStats.permissionMatrix.map(permission => <tr key={permission.key}><td>{permission.name}</td>{(["Admin", "Teacher", "Student"] as const).map(roleName => <td key={roleName}><span className={`permission-pill ${permission.roles.includes(roleName) ? "allow" : "deny"}`}>{permission.roles.includes(roleName) ? "Allow" : "Deny"}</span></td>)}</tr>)}</tbody></table></div> : <p className="management-message" role={dashboardError ? "alert" : "status"}>{dashboardStateMessage}</p>}
          </section>}

          {role === "Admin" && activePage === "Security Activity" && <section className="panel">
            <div className="panel-heading"><div><h2>Security activity</h2><p>Most recent records from the audit log</p></div></div>
            {dashboardStats?.recentEvents.length ? dashboardStats.recentEvents.map((event, index) => <div className="activity-row" key={`${event.createdAt}-${event.actorUsername}-${index}`}><span className={`activity-icon activity-${index % 4}`}><Activity size={17}/></span><div><strong>{event.action}</strong><p>{event.details}</p><span>{event.actorUsername}</span></div><span className="activity-time">{new Date(event.createdAt).toLocaleString()}</span></div>) : <p className="management-message" role={dashboardError ? "alert" : "status"}>{dashboardStats ? "No audit log entries have been recorded." : dashboardStateMessage}</p>}
          </section>}

          {activePage === "Settings" && <section className="panel"><div className="panel-heading"><div><h2>Workspace settings</h2><p>Prototype configuration</p></div></div><div className="setting-row"><div><strong>Current account</strong><p>{signedIn}</p></div><span className="role-tag">{role}</span></div><div className="setting-row"><div><strong>Authorization model</strong><p>Role-Based Access Control</p></div><ShieldCheck /></div><div className="panel-foot">Security and account settings will be managed by the backend in the integrated version.</div></section>}
        </div>
      </section>
    </main>
  );
}

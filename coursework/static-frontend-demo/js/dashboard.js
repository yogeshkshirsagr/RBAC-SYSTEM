
const username = sessionStorage.getItem("demoUsername");
const role = sessionStorage.getItem("demoRole");

if (!username || !role) {
    window.location.replace("login.html");
} else {
    document.getElementById("profileName").textContent = username;
    document.getElementById("profileRole").textContent = role;
    document.getElementById("avatar").textContent =
        username.charAt(0).toUpperCase();

    document.getElementById("sessionInfo").textContent =
        `Signed in as ${username} with the ${role} role.`;

    const roleTitles = {
        Admin: "Administrator Dashboard",
        Teacher: "Teacher Dashboard",
        Student: "Student Dashboard"
    };

    document.getElementById("pageTitle").textContent =
        roleTitles[role] || "Dashboard";
}

document.getElementById("logoutButton").addEventListener("click", () => {
    sessionStorage.removeItem("demoUsername");
    sessionStorage.removeItem("demoRole");
    window.location.href = "login.html";
});

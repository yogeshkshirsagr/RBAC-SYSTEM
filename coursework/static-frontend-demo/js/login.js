
const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");

// Temporary UI demonstration only.
// This will be replaced with requests to the C++ backend.
const demoAccounts = {
    admin: { password: "Admin@123", role: "Admin" },
    teacher1: { password: "Teacher@123", role: "Teacher" },
    student1: { password: "Student@123", role: "Student" }
};

loginForm.addEventListener("submit", function (event) {
    event.preventDefault();

    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;
    const account = demoAccounts[username];

    if (!account || account.password !== password) {
        loginError.textContent = "Invalid username or password.";
        return;
    }

    // Only for the local frontend preview.
    sessionStorage.setItem("demoUsername", username);
    sessionStorage.setItem("demoRole", account.role);

    window.location.href = "index.html";
});

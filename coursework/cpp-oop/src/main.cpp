
#include <iostream>
#include <memory>
#include <string>
#include <exception>

#include "Database.h"
#include "AuthManager.h"
#include "AccessControl.h"

using namespace std;

int main()
{
    try
    {
        Database database("rbac.db");
        AuthManager auth(database);

        cout << "====================================\n";
        cout << "     RBAC MANAGEMENT SYSTEM\n";
        cout << "====================================\n";

        string username;
        string password;

        cout << "\nUsername: ";
        cin >> username;

        cout << "Password: ";
        cin >> password;

        unique_ptr<User> currentUser =
            auth.login(username, password);

        if (!currentUser)
        {
            cout << "\nLogin failed! Invalid credentials.\n";
            return 0;
        }

        cout << "\nLogin successful!\n";
        cout << "Welcome, "
             << currentUser->getUsername() << "!\n";

        cout << "Your role: "
             << currentUser->getRole() << '\n';

        currentUser->showMenu();

        cout << "\n--- Permission Verification ---\n";

        const string role = currentUser->getRole();

        bool canDelete = AccessControl::hasPermission(
            role, "delete_user"
        );

        bool canUpdateMarks = AccessControl::hasPermission(
            role, "update_marks"
        );

        cout << "Delete user: "
             << (canDelete ? "ALLOWED" : "DENIED") << '\n';

        cout << "Update marks: "
             << (canUpdateMarks ? "ALLOWED" : "DENIED") << '\n';

        database.recordAudit(
            currentUser->getUsername(),
            "LOGOUT",
            "User logged out"
        );

        cout << "\nLogout recorded successfully.\n";
    }
    catch (const exception& error)
    {
        cerr << "\nApplication error: "
             << error.what() << '\n';

        return 1;
    }

    return 0;
}

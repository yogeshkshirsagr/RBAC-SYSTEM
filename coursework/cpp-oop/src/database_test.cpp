
#include <iostream>
#include <stdexcept>
#include "Database.h"

int main()
{
    try
    {
        Database database("rbac.db");

        std::cout << "Database initialized successfully.\n";

        auto user = database.authenticate("admin", "Admin@123");

        if (user.has_value())
        {
            std::cout << "Login test successful!\n";
            std::cout << "Username: " << user->username << '\n';
            std::cout << "Role: " << user->role << '\n';

            database.recordAudit(
                user->username,
                "LOGIN",
                "Database authentication test successful"
            );

            std::cout << "Audit log recorded successfully.\n";
        }
        else
        {
            std::cout << "Login test failed: invalid credentials.\n";
        }
    }
    catch (const std::exception& error)
    {
        std::cerr << "Error: " << error.what() << '\n';
        return 1;
    }

    return 0;
}

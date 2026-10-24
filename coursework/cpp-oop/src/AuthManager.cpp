
#include "AuthManager.h"

#include "Admin.h"
#include "Teacher.h"
#include "Student.h"

#include <stdexcept>

AuthManager::AuthManager(Database& database)
    : database_(database)
{
}

std::unique_ptr<User> AuthManager::login(
    const std::string& username,
    const std::string& password
) const
{
    auto authenticated = database_.authenticate(username, password);

    if (!authenticated)
    {
        database_.recordAudit(
            username,
            "LOGIN",
            "Failed login attempt"
        );

        return nullptr;
    }

    database_.recordAudit(
        authenticated->username,
        "LOGIN",
        "Successful login"
    );

    if (authenticated->role == "Admin")
    {
        return std::make_unique<Admin>(authenticated->username);
    }

    if (authenticated->role == "Teacher")
    {
        return std::make_unique<Teacher>(authenticated->username);
    }

    if (authenticated->role == "Student")
    {
        return std::make_unique<Student>(authenticated->username);
    }

    throw std::runtime_error("Unknown user role in database");
}

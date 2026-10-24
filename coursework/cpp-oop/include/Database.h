
#ifndef DATABASE_H
#define DATABASE_H

#include <optional>
#include <string>
#include <sqlite3.h>

struct AuthenticatedUser
{
    std::string username;
    std::string role;
};

class Database
{
private:
    sqlite3* connection_ = nullptr;

    void initialize();
    void execute(const char* sql) const;

public:
    explicit Database(const std::string& path);
    ~Database();

    Database(const Database&) = delete;
    Database& operator=(const Database&) = delete;

    std::optional<AuthenticatedUser> authenticate(
        const std::string& username,
        const std::string& password
    ) const;

    void recordAudit(
        const std::string& username,
        const std::string& action,
        const std::string& details
    ) const;
};

#endif

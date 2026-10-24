#include "Database.h"

#include <memory>
#include <stdexcept>
#include <string>

namespace
{
struct StatementFinalizer
{
    void operator()(sqlite3_stmt* statement) const
    {
        if (statement != nullptr)
        {
            sqlite3_finalize(statement);
        }
    }
};

using Statement = std::unique_ptr<sqlite3_stmt, StatementFinalizer>;

[[noreturn]] void throwDatabaseError(sqlite3* connection, const std::string& action)
{
    const char* message = connection ? sqlite3_errmsg(connection) : "unknown error";
    throw std::runtime_error(action + ": " + message);
}

Statement prepare(sqlite3* connection, const char* sql)
{
    sqlite3_stmt* rawStatement = nullptr;
    if (sqlite3_prepare_v2(connection, sql, -1, &rawStatement, nullptr) != SQLITE_OK)
    {
        throwDatabaseError(connection, "Could not prepare SQLite statement");
    }
    return Statement(rawStatement);
}

void bindText(sqlite3* connection, sqlite3_stmt* statement, int index, const std::string& value)
{
    if (sqlite3_bind_text(statement, index, value.c_str(), -1, SQLITE_TRANSIENT) != SQLITE_OK)
    {
        throwDatabaseError(connection, "Could not bind SQLite text value");
    }
}
}

Database::Database(const std::string& path)
{
    if (sqlite3_open(path.c_str(), &connection_) != SQLITE_OK)
    {
        const std::string message = connection_ ? sqlite3_errmsg(connection_) : "out of memory";
        if (connection_ != nullptr)
        {
            sqlite3_close(connection_);
            connection_ = nullptr;
        }
        throw std::runtime_error("Could not open database '" + path + "': " + message);
    }

    try
    {
        initialize();
    }
    catch (...)
    {
        sqlite3_close(connection_);
        connection_ = nullptr;
        throw;
    }
}

Database::~Database()
{
    if (connection_ != nullptr)
    {
        sqlite3_close(connection_);
    }
}

void Database::execute(const char* sql) const
{
    char* errorMessage = nullptr;
    const int result = sqlite3_exec(connection_, sql, nullptr, nullptr, &errorMessage);
    if (result != SQLITE_OK)
    {
        const std::string message = errorMessage ? errorMessage : sqlite3_errmsg(connection_);
        sqlite3_free(errorMessage);
        throw std::runtime_error("SQLite statement failed: " + message);
    }
}

void Database::initialize()
{
    execute("PRAGMA foreign_keys = ON;");
    execute(
        "CREATE TABLE IF NOT EXISTS users ("
        "id INTEGER PRIMARY KEY, "
        "username TEXT NOT NULL UNIQUE, "
        "password TEXT NOT NULL, "
        "role TEXT NOT NULL CHECK(role IN ('Admin', 'Teacher', 'Student'))"
        ");"
    );
    execute(
        "CREATE TABLE IF NOT EXISTS audit_logs ("
        "id INTEGER PRIMARY KEY, "
        "username TEXT NOT NULL, "
        "action TEXT NOT NULL, "
        "details TEXT NOT NULL, "
        "created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP"
        ");"
    );

    execute(
        "INSERT OR IGNORE INTO users(username, password, role) VALUES"
        "('admin', 'Admin@123', 'Admin'),"
        "('teacher1', 'Teacher@123', 'Teacher'),"
        "('student1', 'Student@123', 'Student');"
    );
}

std::optional<AuthenticatedUser> Database::authenticate(
    const std::string& username,
    const std::string& password
) const
{
    Statement statement = prepare(
        connection_,
        "SELECT username, role FROM users WHERE username = ?1 AND password = ?2;"
    );
    bindText(connection_, statement.get(), 1, username);
    bindText(connection_, statement.get(), 2, password);

    const int result = sqlite3_step(statement.get());
    if (result == SQLITE_DONE)
    {
        return std::nullopt;
    }
    if (result != SQLITE_ROW)
    {
        throwDatabaseError(connection_, "Could not authenticate user");
    }

    const auto* dbUsername = reinterpret_cast<const char*>(sqlite3_column_text(statement.get(), 0));
    const auto* dbRole = reinterpret_cast<const char*>(sqlite3_column_text(statement.get(), 1));
    if (dbUsername == nullptr || dbRole == nullptr)
    {
        throw std::runtime_error("SQLite returned an incomplete user record");
    }
    return AuthenticatedUser{dbUsername, dbRole};
}

void Database::recordAudit(
    const std::string& username,
    const std::string& action,
    const std::string& details
) const
{
    Statement statement = prepare(
        connection_,
        "INSERT INTO audit_logs(username, action, details) VALUES(?1, ?2, ?3);"
    );
    bindText(connection_, statement.get(), 1, username);
    bindText(connection_, statement.get(), 2, action);
    bindText(connection_, statement.get(), 3, details);
    if (sqlite3_step(statement.get()) != SQLITE_DONE)
    {
        throwDatabaseError(connection_, "Could not write audit log");
    }
}

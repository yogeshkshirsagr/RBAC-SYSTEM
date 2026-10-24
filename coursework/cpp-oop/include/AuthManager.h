
#ifndef AUTHMANAGER_H
#define AUTHMANAGER_H

#include <memory>
#include <string>

#include "Database.h"
#include "User.h"

class AuthManager
{
private:
    Database& database_;

public:
    explicit AuthManager(Database& database);

    std::unique_ptr<User> login(
        const std::string& username,
        const std::string& password
    ) const;
};

#endif

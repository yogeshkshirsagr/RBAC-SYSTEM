
#include "User.h"

User::User(const string& username)
{
    this->username = username;
}

string User::getUsername() const
{
    return username;
}

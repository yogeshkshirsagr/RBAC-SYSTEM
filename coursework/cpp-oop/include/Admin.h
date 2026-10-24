
#ifndef ADMIN_H
#define ADMIN_H

#include "User.h"

class Admin : public User
{
public:
    Admin(const string& username);

    string getRole() const override;
    void showMenu() const override;
};

#endif

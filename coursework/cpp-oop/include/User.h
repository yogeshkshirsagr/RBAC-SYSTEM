
#ifndef USER_H
#define USER_H

#include <string>
using namespace std;

class User
{
private:
    string username;

public:
    User(const string& username);
    virtual ~User() = default;

    string getUsername() const;

    virtual string getRole() const = 0;
    virtual void showMenu() const = 0;
};

#endif

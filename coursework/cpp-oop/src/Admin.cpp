
#include <iostream>
#include "Admin.h"

using namespace std;

Admin::Admin(const string& username)
    : User(username)
{
}

string Admin::getRole() const
{
    return "Admin";
}

void Admin::showMenu() const
{
    cout << "\n--- ADMIN DASHBOARD ---\n";
    cout << "1. View all users\n";
    cout << "2. Add user\n";
    cout << "3. Delete user\n";
    cout << "4. View security logs\n";
    cout << "5. Logout\n";
}

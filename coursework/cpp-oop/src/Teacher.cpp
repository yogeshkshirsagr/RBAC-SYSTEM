
#include <iostream>
#include "Teacher.h"

using namespace std;

Teacher::Teacher(const string& username)
    : User(username)
{
}

string Teacher::getRole() const
{
    return "Teacher";
}

void Teacher::showMenu() const
{
    cout << "\n--- TEACHER DASHBOARD ---\n";
    cout << "1. View student records\n";
    cout << "2. Update marks\n";
    cout << "3. View profile\n";
    cout << "4. Logout\n";
}

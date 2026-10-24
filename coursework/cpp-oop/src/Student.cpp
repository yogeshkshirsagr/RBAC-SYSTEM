
#include <iostream>
#include "Student.h"

using namespace std;

Student::Student(const string& username)
    : User(username)
{
}

string Student::getRole() const
{
    return "Student";
}

void Student::showMenu() const
{
    cout << "\n--- STUDENT DASHBOARD ---\n";
    cout << "1. View my academic records\n";
    cout << "2. View profile\n";
    cout << "3. Logout\n";
}

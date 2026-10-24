
#ifndef STUDENT_H
#define STUDENT_H

#include "User.h"

class Student : public User
{
public:
    Student(const string& username);

    string getRole() const override;
    void showMenu() const override;
};

#endif

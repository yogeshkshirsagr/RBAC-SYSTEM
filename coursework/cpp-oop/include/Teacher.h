
#ifndef TEACHER_H
#define TEACHER_H

#include "User.h"

class Teacher : public User
{
public:
    Teacher(const string& username);

    string getRole() const override;
    void showMenu() const override;
};

#endif

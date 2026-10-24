
#include "AccessControl.h"

bool AccessControl::hasPermission(
    const string& role,
    const string& action
)
{
    if (role == "Admin")
{
    return action == "view_all_users" ||
           action == "add_user" ||
           action == "delete_user" ||
           action == "view_student_records" ||
           action == "update_marks" ||
           action == "view_own_records" ||
           action == "view_security_logs";
}

    if (role == "Teacher")
    {
        return action == "view_student_records" ||
               action == "update_marks" ||
               action == "view_own_records";
    }

    if (role == "Student")
    {
        return action == "view_own_records";
    }

    return false;
}


#ifndef ACCESSCONTROL_H
#define ACCESSCONTROL_H

#include <string>
using namespace std;

class AccessControl
{
public:
    static bool hasPermission(
        const string& role,
        const string& action
    );
};

#endif

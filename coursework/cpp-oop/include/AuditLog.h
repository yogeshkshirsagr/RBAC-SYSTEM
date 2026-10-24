#ifndef AUDITLOG_H
#define AUDITLOG_H

#include <string>

#include "Database.h"

class AuditLog
{
public:
    explicit AuditLog(const std::string& databasePath = "rbac.db");

    void record(
        const std::string& username,
        const std::string& action,
        const std::string& details
    ) const;

private:
    Database database_;
};

#endif

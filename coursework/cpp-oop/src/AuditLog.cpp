#include "AuditLog.h"

AuditLog::AuditLog(const std::string& databasePath)
    : database_(databasePath)
{
}

void AuditLog::record(
    const std::string& username,
    const std::string& action,
    const std::string& details
) const
{
    database_.recordAudit(username, action, details);
}

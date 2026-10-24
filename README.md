# SecureAccess — Role-Based Access Control System

SecureAccess is a web-based Role-Based Access Control (RBAC) system developed as a college OOP project. It demonstrates how application access and permissions can be managed according to user roles.

The system provides separate interfaces for Admins, Teachers, and Students, with role-specific functionality and protected resources.

## Key Features

### Admin
- Manage user accounts.
- View roles and permissions.
- Monitor security activity.
- Access administrative dashboard statistics.

### Teacher
- View and search student records.
- Create and manage subjects.
- Add and update student marks.
- View saved academic records.

### Student
- View personal academic records.
- Check marks and percentages.
- View profile information.
- Access only their own academic data.

## Technology Stack

- **Frontend:** Next.js, React, TypeScript
- **Backend:** Next.js API routes
- **Database:** MongoDB
- **Authentication & Authorization:** Session-based authentication and Role-Based Access Control
- **Version Control:** Git and GitHub

## Project Structure

```text
RBAC-SYSTEM/
├── web/          # Main web application
├── coursework/   # OOP and related coursework
├── docs/         # Project documentation
└── README.md     # Project overview and setup guide
```

## Getting Started

### Prerequisites
- Node.js and npm
- MongoDB access
- Git

### Run the Web Application

1. Clone the repository:

   ```bash
   git clone https://github.com/yogeshkshirsagr/RBAC-SYSTEM.git
   ```

2. Navigate to the web application:

   ```bash
   cd RBAC-SYSTEM/web
   ```

3. Install dependencies:

   ```bash
   npm install
   ```

4. Configure the required environment variables using the variable names expected by the application. See `.env.example` if provided. Never commit real database credentials or authentication secrets.

5. Start the development server:

   ```bash
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Security Principles

- Access is determined by user roles and permissions.
- Protected operations are authorized on the server.
- Students can access their own academic records only.
- Students cannot modify marks or manage subjects.
- Administrative functions are restricted to authorized users.

## Project Scope

SecureAccess focuses on authentication, authorization, role-specific dashboards, and basic academic record management. It is an educational project, not a complete college management system.

## Team Project

Developed as a college project to demonstrate Object-Oriented Programming concepts, web application development, database integration, and Role-Based Access Control.

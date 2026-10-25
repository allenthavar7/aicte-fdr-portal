# AICTE FDR Management Portal

A web-based **AICTE Fixed Deposit Receipt (FDR) Management Portal** designed to help educational institutions submit and manage FDR records while allowing AICTE officers to review and verify submitted FDRs.

---

## 📌 Project Overview

The AICTE FDR Portal provides a centralized system for managing security deposits and Fixed Deposit Receipts submitted by educational institutions.

### Main users

- **Institution**
  - Login to the portal
  - View institution dashboard
  - Submit FDRs
  - Upload FDR documents
  - View submitted FDRs
  - Track verification status

- **AICTE Officer**
  - Login using officer credentials
  - View submitted institutional FDRs
  - Review FDR information
  - Monitor verification status

### Application flow

```text
Institution
     │
     ▼
Login
     │
     ▼
Institution Dashboard
     │
     ├── My FDRs
     ├── Submit FDR
     ├── Documents
     └── Dashboard
             │
             ▼
       Submit FDR + Document
             │
             ▼
          Backend
             │
             ▼
          SQLite
             │
             ▼
       AICTE Officer
             │
             ▼
      Review Submitted FDR
```

---

# 🛠️ Technologies Used

## Frontend

- React
- Vite
- React Router
- JavaScript
- HTML
- CSS

## Backend

- Node.js
- Express.js
- SQLite
- Better-SQLite3
- JWT Authentication
- bcryptjs
- Multer

## Development Tools

- Visual Studio Code
- Git
- GitHub
- PowerShell

---

# 📁 Project Structure

```text
aicte-fdr-portal/
│
├── backend/
│   │
│   ├── src/
│   │   ├── database/
│   │   │   ├── database.js
│   │   │   ├── init.js
│   │   │   └── seed.js
│   │   │
│   │   ├── middleware/
│   │   │   └── auth.js
│   │   │
│   │   ├── routes/
│   │   │   ├── auth.js
│   │   │   ├── fdr.js
│   │   │   └── officer.js
│   │   │
│   │   ├── server.js
│   │   │
│   │   └── uploads/
│   │       └── fdr/
│   │
│   ├── package.json
│   ├── package-lock.json
│   ├── .env.example
│   └── tsconfig.json
│
├── frontend/
│   │
│   ├── src/
│   │   ├── components/
│   │   │   ├── FDRCard.jsx
│   │   │   ├── Sidebar.jsx
│   │   │   ├── StatCard.jsx
│   │   │   └── Topbar.jsx
│   │   │
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Documents.jsx
│   │   │   ├── FDRs.jsx
│   │   │   ├── Login.jsx
│   │   │   ├── OfficerDashboard.jsx
│   │   │   └── SubmitFDR.jsx
│   │   │
│   │   ├── api/
│   │   │   └── api.js
│   │   │
│   │   ├── services/
│   │   │   └── api.js
│   │   │
│   │   ├── App.jsx
│   │   ├── App.css
│   │   ├── index.css
│   │   └── main.jsx
│   │
│   ├── public/
│   ├── package.json
│   ├── package-lock.json
│   └── vite.config.js
│
├── .gitignore
└── README.md
```

---

# ⚙️ Requirements

Install the following before running the project:

### Node.js

Install Node.js from:

https://nodejs.org/

Check installation:

```bash
node --version
npm --version
```

### Git

Check installation:

```bash
git --version
```

---

# 📥 Getting the Project

Clone the GitHub repository:

```bash
git clone https://github.com/allenthavar7/aicte-fdr-portal.git
```

Enter the project:

```bash
cd aicte-fdr-portal
```

---

# 🔧 Backend Setup

Open a terminal in the project directory.

```bash
cd backend
```

Install backend dependencies:

```bash
npm install
```

---

# 🗄️ Database Setup

The project uses SQLite.

The database initialization and seed scripts are located in:

```text
backend/src/database/
```

### Initialize the database

Run:

```bash
node src/database/init.js
```

### Seed demo users

Run:

```bash
node src/database/seed.js
```

This creates the demo institution and officer accounts used by the application.

---

# 🚀 Start the Backend

From the `backend` directory:

```bash
npm start
```

The backend should run on:

```text
http://localhost:5000
```

The API base URL is:

```text
http://localhost:5000
```

---

# 💻 Frontend Setup

Open a **new terminal**.

From the project root:

```bash
cd frontend
```

Install frontend dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Vite will normally provide a URL similar to:

```text
http://localhost:5173/
```

Open that URL in the browser.

---

# 🔐 Demo Accounts

## Institution Account

```text
Name:
VJTI Engineering College

Email:
admin@vjti.ac.in

Password:
AICTE@12345

Role:
INSTITUTION
```

## AICTE Officer Account

```text
Name:
AICTE Regulation Officer

Email:
officer@aicte.gov.in

Role:
OFFICER
```

Use the password configured in the local database seed/setup.

> Do not use real production passwords in this repository.

---

# 🏫 Institution Features

After logging in as an institution, the user can access:

### Dashboard

Displays:

- Active FDRs
- Pending verification
- Expiring FDRs
- Total deposit amount
- Recent FDR submissions

### My FDRs

Displays FDR records belonging to the logged-in institution.

### Submit FDR

Institutions can submit a new FDR by providing:

- FDR number
- Bank name
- Amount
- Issue date
- Maturity date
- FDR document

The system accepts:

- PDF
- JPG
- PNG

Maximum upload size:

```text
5 MB
```

---

# 📝 Application Types

The portal supports different reasons for submitting an FDR/application, including:

- New Institution
- New Programme
- Increase Intake
- Renewal
- Replacement
- Modification
- Other

Application-specific information can include:

- Programme name
- Programme level
- Discipline
- Current intake
- Proposed intake
- Academic year

---

# 👨‍💼 AICTE Officer Features

The officer dashboard is intended to provide AICTE officials with an overview of submitted FDRs.

The officer can view information such as:

- FDR number
- Bank
- Amount
- Issue date
- Maturity date
- Institution
- Verification status

The backend provides officer-specific API routes for retrieving FDR records.

---

# 🔑 Authentication

The application uses:

- JWT for authentication
- bcrypt for password hashing
- Role-based access control

Available roles:

```text
INSTITUTION
OFFICER
ADMIN
```

After successful login, the frontend stores the authentication token locally and uses it when communicating with protected backend APIs.

---

# 📡 API Structure

## Authentication

### Login

```http
POST /api/auth/login
```

Example request:

```json
{
  "email": "admin@vjti.ac.in",
  "password": "AICTE@12345"
}
```

---

## Institution FDR

### Submit FDR

```http
POST /api/fdr
```

Requires:

```text
Authorization: Bearer <token>
```

The request uses multipart form data because a document can be uploaded.

### Get institution FDRs

```http
GET /api/fdr/my
```

Requires authentication.

---

## Officer

### Get submitted FDRs

```http
GET /api/officer/fdrs
```

Requires an authenticated officer token.

---

# 🗃️ Database Tables

The SQLite database contains tables for the main portal entities, including:

```text
users
institutions
applications
fdrs
documents
verifications
renewals
release_requests
notifications
audit_logs
```

These tables support:

- User management
- Institution records
- Application types
- FDR records
- Uploaded documents
- Verification history
- Renewals
- Release requests
- Notifications
- Audit tracking

---

# 📄 FDR Documents

Uploaded FDR documents are stored locally by the backend.

```text
backend/src/uploads/fdr/
```

These files are intentionally excluded from GitHub through `.gitignore`.

When another developer clones the repository, this directory can be recreated automatically when the backend receives its first upload.

---

# 🔒 Security Notes

Do not commit:

```text
.env
```

or other files containing:

- JWT secrets
- API keys
- database credentials
- production passwords
- private documents

The repository intentionally excludes local databases and uploaded FDR documents.

---

# 🧪 Running the Complete Application

You need **two terminals**.

### Terminal 1 - Backend

```bash
cd aicte-fdr-portal/backend
npm install
node src/database/init.js
node src/database/seed.js
npm start
```

Backend:

```text
http://localhost:5000
```

### Terminal 2 - Frontend

```bash
cd aicte-fdr-portal/frontend
npm install
npm run dev
```

Frontend:

```text
http://localhost:5173
```

---

# 👥 Development Workflow

When making changes:

```bash
git status
```

Then:

```bash
git add .
```

Commit:

```bash
git commit -m "Describe your changes"
```

Push:

```bash
git push
```

To get your teammate's latest changes:

```bash
git pull
```

---

# 🤝 Working With a Friend

Both developers can work on the same GitHub repository.

Recommended workflow:

```text
GitHub Repository
       │
       ├──────────────┐
       ▼              ▼
     You            Friend
       │              │
       ▼              ▼
    Changes        Changes
       │              │
       └──────┬───────┘
              ▼
           GitHub
```

Before starting work:

```bash
git pull
```

After making changes:

```bash
git add .
git commit -m "Describe changes"
git push
```

---

# 📌 Current Project Status

The project currently includes:

- React frontend
- Express backend
- SQLite database
- Institution authentication
- AICTE officer authentication
- Role-based access
- Institution dashboard
- Officer dashboard
- FDR submission
- FDR document upload
- FDR listing
- Application types
- FDR verification status
- Audit logging

Features such as renewals and notifications can be expanded in future development.

---

# 👨‍💻 Repository

GitHub:

https://github.com/allenthavar7/aicte-fdr-portal.git
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
  - Submit and track renewal requests
  - Read FDR, verification, and renewal notifications

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
│   │   │   ├── migrations.js
│   │   │   └── seed.js
│   │   │
│   │   ├── services/
│   │       │   ├── bankVerificationService.js
│   │       │   ├── complianceService.js
│   │       │   ├── ocrService.js
│   │       │   └── verificationService.js
│   │   │
│   │   ├── middleware/
│   │   │   └── auth.js
│   │   │
│   │   ├── routes/
│   │   │   ├── auth.js
│   │   │   ├── fdr.js
│   │   │   ├── institution.js
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
│   │   │   ├── Notifications.jsx
│   │   │   ├── Renewals.jsx
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

## Institution renewals and notifications

Institution accounts can open **Renewals** to view their renewal requests and FDR eligibility. The current prototype allows a renewal request for an active, unmatured FDR within 90 days of maturity, provided that FDR does not already have an open or completed renewal. The 90-day window is a product assumption and can be adjusted to match the applicable policy.

The institution renewal APIs are mounted at `/api/institution` and require an authenticated `INSTITUTION` account:

- `GET /renewals/eligible-fdrs` lists the signed-in institution's FDR eligibility.
- `GET /renewals` lists renewal requests and creates any due renewal reminders.
- `POST /renewals` submits a request with `fdrId`, `requestedMaturityDate`, and `reason`.
- `GET /renewals/:id` returns request details, linked documents, a verification summary, and an audit timeline.
- `GET /notifications` lists only the signed-in institution's notifications.
- `PATCH /notifications/:id/read` and `PATCH /notifications/read-all` update notification read state.

Officers can review submitted requests from the **Renewals** area in the Officer Workspace. Review decisions are recorded in `audit_logs` and notify the owning institution. The implementation extends the existing SQLite schema through startup migrations; it does not create a separate database.

After a request is approved, the institution submits the renewed receipt through the existing **Submit FDR** flow using application type `RENEWAL` and the previous FDR number. The portal links the new FDR to that approved request and records the completion in the audit timeline.

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

The backend also applies idempotent additive migrations at startup. These add
the application description and verification-result fields (including the mock
bank result) to the existing `applications` and `verifications` tables;
existing FDRs, documents, and other records are retained.

### Seed demo users

Run:

```bash
node src/database/seed.js
```

This creates the existing VJTI/officer demo accounts and loads the centralized
synthetic analytics fixture from `shared/officerDemoData.json`. The fixture adds
five institutions, ten non-login demo institution users, fourteen FDRs, three
linked renewal examples, and one release-request example. It is idempotent:
records are identified by their demo codes and FDR numbers. Demo FDR numbers
and institution names begin with `DEMO`; demo account addresses use the
non-deliverable `.invalid` domain. These records are illustrative, not AICTE
or bank records.

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
- Verification result, score, OCR confidence, and field comparisons
- Flagged/failed submissions in the review queue
- Authenticated FDR document previews

Officer dashboard summaries, analytics charts, institution totals, renewals,
and CSV export use the same SQLite FDR records. The seeded demonstration rows
are part of the local demo database and are clearly identified by their DEMO
prefix. The Dashboard and Reports & Analytics charts use Recharts tooltips and
derive status counts, bank distribution, and the upcoming six-calendar-month
expiry forecast from the loaded FDR records. The list refreshes on demand and
every 30 seconds.

### Automated verification and OCR status

Submissions are checked for valid dates and amounts, application ownership,
and duplicate FDR numbers. `backend/src/services/ocrService.js` uses
Tesseract.js locally for PDF, PNG, JPG, and JPEG documents. PDFs are rendered
with `pdf-to-img` before OCR; OCR reports a clear failure for documents over
10 pages so an officer can review them. Tesseract's English language data is
downloaded and cached on first use; the document itself is processed by the
backend. The PDF renderer requires Node.js 22.13 or later. OCR confidence below
80%, missing fields, unreadable documents, and OCR/data mismatches are visible
in the verification checks. An unreadable document is saved with a `FAILED`
verification result for officer review.

The deterministic comparison engine is in
`backend/src/services/verificationService.js`. The 100-point score is
deterministic and awards points only when a check passes:

- Institution Match: 10 (submission ownership)
- FDR Number Match: 20
- Bank Name Match: 15
- Amount Verification: 20
- Issue Date Match: 10
- Maturity Date Match: 10
- Document OCR: 10
- Bank Record Match: 5
- Duplicate FDR Check: 0 (a duplicate still flags the submission)

Each check is returned with `PASS`, `FAILED`, or `PENDING` and an explanation.
OCR failure returns `FAILED`; an OCR mismatch, duplicate, or mock-bank
mismatch returns `FLAGGED`. A missing configured mock-bank record is `PENDING`,
not a claim that a real bank rejected the FDR. Other incomplete checks remain
`PENDING` until all checks pass. Officer approval also requires all checks and
bank verification to pass. Officer decisions require a reason and are recorded
in `audit_logs`.

After submission, the institution sees an **Automated Verification Result**
with the backend result and score, OCR confidence/provider, a clearly labelled
mock-bank status, field-by-field OCR comparisons, and expandable OCR text. The
same saved result can be opened from **My FDRs**. OCR provider, extracted
fields, confidence details, and raw OCR text are retained in the existing
`verifications.extracted_data` JSON column; bank results and comparisons use
the existing verification columns.

### Bank verification prototype

`backend/src/services/bankVerificationService.js` separates the bank-provider
interface from the verification workflow. Every new FDR submission now checks
`MOCK_BANK_RECORDS_JSON` automatically. Configure it in the backend environment
as an array of records with `fdrNumber`, `bank`, `amount`, `issueDate`,
`maturityDate`, and `fdrStatus`, for example:

```dotenv
MOCK_BANK_RECORDS_JSON='[{"fdrNumber":"SBI/FDR/98231","bank":"State Bank of India","amount":1000000,"issueDate":"25/10/2026","maturityDate":"25/10/2027","fdrStatus":"ACTIVE"}]'
```

FDR number and bank identify the mock record; amount, issue date, maturity
date, and active status are then checked. A found record with mismatched
details or no matching record does not verify the FDR. This is a mock lookup,
not a real bank connection or confirmation. Keep test records in the backend
environment, not in source control. The older default provider remains
`PENDING` when called without configured records.

#### Synthetic end-to-end OCR demo

`backend/test/fixtures/sample-fdr-demo.pdf` is a clearly marked synthetic test
fixture, not a bank-issued FDR. Its values are:

| Field | Value |
|---|---|
| FDR number | `DEMO-FDR-2026-73942` |
| Bank | `AICTE Demo Bank (Test Only)` |
| Amount | `1000000` |
| Issue date | `26/10/2026` |
| Maturity date | `26/10/2027` |
| Status | `ACTIVE` |

`backend/test/fixtures/sample-fdr-demo-2.pdf` is a second synthetic test
fixture, also not a bank-issued FDR:

| Field | Value |
|---|---|
| FDR number | `DEMO-FDR-2026-84216` |
| Bank | `AICTE Demo Bank (Test Only)` |
| Amount | `875000` |
| Issue date | `27/10/2026` |
| Maturity date | `27/10/2027` |
| Status | `ACTIVE` |

To run the demo, use **New Institution** as the application type, enter the
values above exactly, and upload the corresponding fixture. Matching records
for both fixtures are included in the example environment and the local demo
environment. The FDR number must not already exist in the database. Restart
the backend after changing `MOCK_BANK_RECORDS_JSON`. When OCR, duplicate,
institution, and configured mock-bank checks all pass, the submission is
automatically marked `VERIFIED`. This is a simulated test only; it is not a
real bank confirmation or regulatory approval.

Run the backend service tests with `npm test` from `backend`.

### FDR timeline

FDR activity is recorded in the existing `audit_logs` table and retrieved in
chronological order. The Officer FDR detail modal shows submission, document,
OCR success or failure, bank check, automated verification, score, and officer
decision events. Older records receive timeline events from their existing FDR,
document, and verification rows when matching audit entries are absent; no new
timeline table is created.

### Institution compliance score

The officer detail modal can load a deterministic Institution Compliance
Score and show each factor. The backend formula is:

- Verified FDR rate × 40 points
- Not-flagged FDR rate × 10 points
- Valid stored-document rate × 20 points
- Non-duplicate FDR rate × 15 points
- Non-expired FDR rate × 10 points
- Non-failed-submission rate × 5 points

Each factor is rounded to a whole point; an institution with no FDRs scores
zero. Duplicate FDRs are counted within that institution. A stored document is
considered valid for this metric when its metadata is present and the file is
accessible under the backend FDR upload directory. This is a transparent
database rule, not an AI or risk score.

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
Application details are saved in the existing `applications` table and linked
to the FDR. Renewals and replacements also link to the prior institution FDR
when that reference is supplied.

### Get institution FDRs

```http
GET /api/fdr/my
```

Requires authentication.

Institutions can open their own uploaded documents using:

```http
GET /api/fdr/:id/documents/:documentId
```

The endpoint requires an institution token and checks that the FDR belongs to
the authenticated institution.

---

## Officer

### Get submitted FDRs

```http
GET /api/officer/fdrs
```

Requires an authenticated officer token.

### Get FDR activity timeline

```http
GET /api/officer/fdrs/:id/timeline
```

Requires an authenticated officer token.

### Get institution compliance score

```http
GET /api/officer/institutions/:id/compliance
```

Requires an authenticated officer token.

### Get live officer statistics

```http
GET /api/officer/stats
```

Requires an authenticated officer token.

### Record an officer review decision

```http
POST /api/officer/fdrs/:id/override
```

Requires an authenticated officer/admin token and a JSON body containing
`decision` (`APPROVE` or `REJECT`) and a non-empty `reason`.

Uploaded documents are available to officers through the protected
`GET /api/officer/fdrs/:id/documents/:documentId` route.

### Officer workspace APIs

The protected Officer Workspace also uses these routes:

```text
GET   /api/officer/dashboard
GET   /api/officer/verification-queue
GET   /api/officer/institutions
GET   /api/officer/institutions/:id
GET   /api/officer/release-requests
PATCH /api/officer/release-requests/:id
GET   /api/officer/notifications
PATCH /api/officer/notifications/read-all
PATCH /api/officer/notifications/:id/read
GET   /api/officer/audit-logs
GET   /api/officer/users
GET   /api/officer/renewals
GET   /api/officer/master-data
GET   /api/officer/me
PATCH /api/officer/me
GET   /api/officer/reports
POST  /api/officer/fdrs/:id/run-verification
POST  /api/officer/fdrs/:id/bank-verify
```

All routes require an authenticated `OFFICER` token unless otherwise noted.
The verification queue includes pending, flagged, or failed records, records
with failed/mismatched checks, failed bank results, and scores below 70/100.
Dashboard statistics and Reports & Analytics derive from the officer FDR API;
institution and renewal views use the related database records. The reports
expiry forecast buckets maturity dates into the six calendar months following
the current month, and its monthly totals and values are calculated from those
same FDR rows. Maturity risk uses the shared FDR priority calculation. The OCR
adapter remains unconfigured by default, and the default bank provider remains
a clearly labelled mock provider.

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
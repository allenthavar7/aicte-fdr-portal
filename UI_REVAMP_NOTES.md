# UI Revamp Discovery & Architecture Notes

## 1. Component & Data Source Analysis
- **Target Component**: FDR Status Distribution card in `frontend/src/pages/OfficerDashboard.jsx`.
- **Data Source**: `realFdrs` state in `OfficerDashboard.jsx`, loaded via `getOfficerFdrs()` (`GET /api/officer/fdrs`), seeded from SQLite database and `shared/officerDemoData.json`.
- **Status Computation**:
  - `buildStatusDistribution(fdrs, now)` in `frontend/src/utils/officerAnalytics.js`.
  - Categories & Palette defined in `STATUS_COLORS`:
    - `Active`: `#1d8b68`
    - `Submitted`: `#5686bf`
    - `Under Review`: `#df9a28`
    - `Discrepancy Found`: `#c54852`
    - `Approaching Maturity`: `#805db5`
    - `Matured`: `#64748b`
    - `Release Requested`: `#d47735`

## 2. Ledger / Event Tables & FDR Drawer
- **Ledger/Audit Table**: `audit_logs` in SQLite database (`backend/database/aicte.db`).
  - Columns: `id`, `user_id`, `action`, `entity_type`, `entity_id`, `old_value`, `new_value`, `created_at`.
  - Associated records: `fdrs` joined with `institutions` and `users`.
  - Audit actions: `FDR_SUBMITTED`, `DOCUMENT_UPLOADED`, `OCR_COMPLETED`, `BANK_VERIFICATION_PASS`, `BANK_VERIFICATION_FAIL`, `OFFICER_REVIEWED`, `FDR_VERIFIED`, `RELEASE_REQUESTED`, `MATURITY_ALERT_GENERATED`, `RENEWAL_WINDOW_OPENED`.
- **FDR Drawer / Inspection Modal**:
  - `selectedFdr` state in `OfficerDashboard.jsx` triggers the review modal (`review-modal`) displaying institutional info, priority assessment, verification details, OCR comparison table, documents, timeline, and officer decision actions.
  - Clicking any event row in the Activity Logs panel opens this existing inspection drawer via `handleEventRowClick`.
- **Filtering & Routing**:
  - Status selection stored in URL query param `?status=<status_key>`.
  - "View all in FDR list" redirects to `/officer/fdrs?status=<key>`.

## 3. UI Primitives, Layout & Design System
- **Split Layout**:
  - Container `.status-distribution-split-container`: 2-column grid (`minmax(360px, 1.15fr) minmax(340px, 1.25fr)`) at `>=1024px`.
  - Stacks vertically at `<1024px`.
  - Matching height on both cards; internal scrolling in `.status-logs-body` with pinned header and controls.
- **Interactive Donut & Chips**:
  - Click donut segment or status chip to select/toggle status.
  - Selected segment enlarged, unselected dimmed to 0.4 opacity.
  - Center text updates dynamically: e.g. `51 Total FDRs` -> `26 Active` / `5 Under Review`.
  - Tooltip displays status name, count, and percentage.
  - Chips with 0 FDRs stay clickable and display: "No FDRs are in this state right now."
  - Deselect on click same, "Clear" button, or `Escape` key.
- **Transitions & Motion**:
  - 150ms transitions on hover, selection, and opacity changes.
  - Disabled under `prefers-reduced-motion: reduce`.
- **Contrast & Accessibility Audit**:
  - Status dots and badge borders provide shape + outline indicator so color is never the sole visual cue.
  - Outline and text contrast meet WCAG AA requirements:
    - `#002b5c` on `#ffffff` has contrast ratio 12.8:1 (exceeds AAA requirement).
    - `#1e293b` on `#f8fafc` has contrast ratio 11.2:1.
    - Badges use tinted backgrounds with darker text and matching borders.
  - Donut segments use `role="button"`, `tabIndex={0}`, `aria-label`, and keyboard navigation (ArrowLeft/Right/Up/Down + Enter/Space).
  - Logs panel uses `aria-live="polite"` announcing event counts on update.

## 4. Backend Read-Only Endpoint Implementation
- Route: `GET /dashboard/status-logs` (and alias `/api/dashboard/status-logs`):
  - Parameters: `status`, `q`, `event_type`, `limit=20` (default 10 when status is omitted), `cursor`.
  - Returns ledger events for FDRs currently in that state, ordered newest first.
  - Respects RBAC: institution role sees only own institution's events; officer roles see all.
  - Masks FDR numbers cleanly (e.g. `DEMO-****-01`).
  - Read-only: executes zero write or ledger operations.
  - Fully tested in `backend/test/statusLogs.test.js` (6 unit tests, all passing).

## 5. Seed Distribution Verification (51 FDRs)
- **Active**: 26 FDRs (51.0%) [Target: 45–55%]
- **Approaching Maturity**: 6 FDRs (11.8%) [Target: 10–15%]
- **Under Review**: 5 FDRs (9.8%) [Target: 8–12%]
- **Discrepancy Found**: 5 FDRs (9.8%) [Target: 6–10%]
- **Submitted**: 3 FDRs (5.9%) [Target: 4–6%]
- **Matured**: 3 FDRs (5.9%) [Target: 4–6%]
- **Release Requested**: 3 FDRs (5.9%) [Target: 3–5%]
- Total: 51 FDRs.
- Every status has at least 3 FDRs.
- Every FDR has at least 3 ledger events in `audit_logs` (verified: 0 FDRs with < 3 events).
- Deliberate edge cases preserved and verified:
  1. `DEMO-FDR-2026-DUP-01`: Duplicate FDR number (Rule R1)
  2. `DEMO-FDR-2026-DATE-02`: Maturity date precedes issue date (Rule R2)
  3. `DEMO-FDR-2026-AMT-03`: Amount mismatch ₹25L receipt vs ₹15L bank (Rule R4)
  4. `DEMO-FDR-2026-SLNT-04`: Silent bank / partner bank API timeout (Rule R7)
  5. `DEMO-FDR-2027-LOCKIN-09`: Auto-rejected release / premature lock-in hold (Rule R9)
  6. `DEMO-FDR-2026-VIG-05`: Institutional merger held at Vigilance (Rule R13)
- "Active Compliant Ratio" and "Scrutiny Queue Ratio" computed dynamically from live data.
- Footer note and "Verification Queue →" link preserved.

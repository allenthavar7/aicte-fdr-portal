import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import InstitutionLayout from "../components/InstitutionLayout";
import {
  getEligibleInstitutionRenewalFdrs,
  getInstitutionFdrDocument,
  getInstitutionRenewal,
  getInstitutionRenewals,
  submitInstitutionRenewal
} from "../api/api";

function formatDate(value) {
  if (!value) return "—";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00`)
    : new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric"
      });
}

function formatAmount(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(Number(value) || 0);
}

function statusClass(value) {
  return String(value || "").toLowerCase().replaceAll("_", "-");
}

export default function Renewals() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [renewals, setRenewals] = useState([]);
  const [summary, setSummary] = useState({
    total: 0,
    pending: 0,
    under_review: 0,
    approved: 0,
    action_required: 0
  });
  const [eligibleFdrs, setEligibleFdrs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showApply, setShowApply] = useState(false);
  const [selectedFdrId, setSelectedFdrId] = useState("");
  const [requestedMaturityDate, setRequestedMaturityDate] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [selectedRenewal, setSelectedRenewal] = useState(null);
  const [documentError, setDocumentError] = useState("");
  const [notificationRefreshKey, setNotificationRefreshKey] = useState(0);

  const loadRenewals = useCallback(async () => {
    setLoading(true);
    setError("");
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/", { replace: true });
      return;
    }
    try {
      const [renewalResult, eligibleResult] = await Promise.all([
        getInstitutionRenewals(token),
        getEligibleInstitutionRenewalFdrs(token)
      ]);
      setRenewals(renewalResult.renewals || []);
      setSummary(renewalResult.summary || {});
      setEligibleFdrs(eligibleResult.fdrs || []);
    } catch (loadError) {
      setError(loadError.message || "Unable to load renewals. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    Promise.resolve().then(loadRenewals);
  }, [loadRenewals]);

  const selectedFdr = eligibleFdrs.find(
    (fdr) => String(fdr.id) === String(selectedFdrId)
  );

  function startRenewalRequest() {
    setError("");
    setSuccess("");
    setSelectedFdrId("");
    setRequestedMaturityDate("");
    setReason("");
    setShowApply(true);
  }

  async function submitRequest(event) {
    event.preventDefault();
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/", { replace: true });
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await submitInstitutionRenewal(token, {
        fdrId: Number(selectedFdrId),
        requestedMaturityDate,
        reason: reason.trim()
      });
      setShowApply(false);
      setSuccess("Renewal request submitted successfully.");
      setNotificationRefreshKey((value) => value + 1);
      await loadRenewals();
    } catch (submitError) {
      setError(submitError.message || "Unable to submit renewal request.");
    } finally {
      setSubmitting(false);
    }
  }

  const openRenewal = useCallback(async (renewalId) => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/", { replace: true });
      return;
    }
    setError("");
    try {
      const detail = await getInstitutionRenewal(token, renewalId);
      setSelectedRenewal(detail);
      setSearchParams({ renewal: String(renewalId) });
    } catch (loadError) {
      setError(loadError.message || "Unable to load renewal details.");
    }
  }, [navigate, setSearchParams]);

  useEffect(() => {
    const renewalId = Number(searchParams.get("renewal"));
    if (!renewalId || selectedRenewal?.renewal?.renewal_id === renewalId) return;
    Promise.resolve().then(() => openRenewal(renewalId));
  }, [searchParams, selectedRenewal, openRenewal]);

  async function openDocument(fdrId, document) {
    const documentWindow = window.open("", "_blank");
    if (!documentWindow) {
      setDocumentError("Allow pop-ups to open the uploaded FDR document.");
      return;
    }
    setDocumentError("");
    try {
      const token = localStorage.getItem("token");
      const file = await getInstitutionFdrDocument(token, fdrId, document.id);
      documentWindow.location.href = URL.createObjectURL(file);
    } catch (openError) {
      documentWindow.close();
      setDocumentError(openError.message || "Unable to open the FDR document.");
    }
  }

  const selectedDetail = selectedRenewal;

  return (
    <InstitutionLayout
      active="renewals"
      notificationRefreshKey={notificationRefreshKey}
    >
      <section className="dashboard-content institution-page-content">
        <div className="welcome-section">
          <div>
            <h2>Renewals</h2>
            <p>Review your renewal requests or request renewal of an eligible FDR.</p>
          </div>
          <button className="primary-button" type="button" onClick={startRenewalRequest}>
            Apply for Renewal
          </button>
        </div>

        {error && <div className="institution-message error" role="alert">{error}</div>}
        {success && <div className="institution-message" role="status">{success}</div>}

        <div className="institution-summary-grid">
          {[
            ["Total Renewals", summary.total],
            ["Pending", summary.pending],
            ["Under Review", summary.under_review],
            ["Approved", summary.approved],
            ["Action Required", summary.action_required]
          ].map(([label, value]) => (
            <div className="institution-summary-card" key={label}>
              <span>{label}</span><strong>{value || 0}</strong>
            </div>
          ))}
        </div>

        <section className="panel">
          <div className="panel-header">
            <div><h3>Renewal Requests</h3><p>{renewals.length} request(s)</p></div>
            <button className="text-button" type="button" onClick={loadRenewals}>Refresh</button>
          </div>
          {loading ? (
            <div className="institution-message" role="status">Loading renewals...</div>
          ) : renewals.length === 0 ? (
            <div className="institution-empty">No renewal requests found.</div>
          ) : (
            <div className="institution-table-wrap">
              <table className="institution-table">
                <thead>
                  <tr>
                    <th>Renewal ID</th><th>FDR Number</th><th>Bank</th>
                    <th>Amount</th><th>Current Maturity</th>
                    <th>Request Date</th><th>Status</th><th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {renewals.map((renewal) => (
                    <tr key={renewal.renewal_id}>
                      <td>#{renewal.renewal_id}</td>
                      <td><strong>{renewal.fdr_number}</strong></td>
                      <td>{renewal.bank_name}</td>
                      <td>{formatAmount(renewal.amount)}</td>
                      <td>{formatDate(renewal.maturity_date)}</td>
                      <td>{formatDate(renewal.request_date)}</td>
                      <td><span className={`institution-status ${statusClass(renewal.renewal_status)}`}>{String(renewal.renewal_status).replaceAll("_", " ")}</span></td>
                      <td><button className="text-button" type="button" onClick={() => openRenewal(renewal.renewal_id)}>View</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-header">
            <div><h3>FDR Renewal Eligibility</h3><p>Renewal requests are available within 90 days of maturity.</p></div>
          </div>
          <div className="institution-table-wrap">
            <table className="institution-table">
              <thead><tr><th>FDR</th><th>Bank</th><th>Amount</th><th>Maturity</th><th>Eligibility</th></tr></thead>
              <tbody>
                {eligibleFdrs.map((fdr) => (
                  <tr key={fdr.id}>
                    <td>{fdr.fdr_number}</td><td>{fdr.bank_name}</td>
                    <td>{formatAmount(fdr.amount)}</td><td>{formatDate(fdr.maturity_date)}</td>
                    <td>{fdr.eligible ? <span className="institution-status approved">Eligible</span> : <span title={fdr.ineligibility_reason} className="institution-status action-required">{fdr.ineligibility_reason}</span>}</td>
                  </tr>
                ))}
                {!eligibleFdrs.length && <tr><td colSpan="5">No FDR records are available.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </section>

      {showApply && (
        <div className="institution-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setShowApply(false);
        }}>
          <section className="institution-modal" role="dialog" aria-modal="true" aria-labelledby="renewal-form-title">
            <div className="institution-modal-header">
              <h2 id="renewal-form-title">Apply for Renewal</h2>
              <button className="institution-modal-close" type="button" onClick={() => setShowApply(false)} aria-label="Close">×</button>
            </div>
            <form className="institution-form" onSubmit={submitRequest}>
              <label>
                Select an eligible FDR
                <select required value={selectedFdrId} onChange={(event) => {
                  const id = event.target.value;
                  setSelectedFdrId(id);
                  const fdr = eligibleFdrs.find((item) => String(item.id) === id);
                  if (fdr?.maturity_date) {
                    const nextMaturity = new Date(`${fdr.maturity_date}T00:00:00.000Z`);
                    nextMaturity.setUTCFullYear(nextMaturity.getUTCFullYear() + 1);
                    setRequestedMaturityDate(nextMaturity.toISOString().slice(0, 10));
                  }
                }}>
                  <option value="">Choose FDR</option>
                  {eligibleFdrs.filter((fdr) => fdr.eligible).map((fdr) => (
                    <option key={fdr.id} value={fdr.id}>{fdr.fdr_number} · {fdr.bank_name}</option>
                  ))}
                </select>
              </label>
              {selectedFdr && (
                <div className="institution-detail-grid">
                  <div><small>Amount</small><strong>{formatAmount(selectedFdr.amount)}</strong></div>
                  <div><small>Current maturity</small><strong>{formatDate(selectedFdr.maturity_date)}</strong></div>
                  <div><small>Programme</small><strong>{selectedFdr.programme_name || "—"}</strong></div>
                  <div><small>Verification</small><strong>{selectedFdr.verification_status}</strong></div>
                </div>
              )}
              <label>Requested new maturity date<input required type="date" value={requestedMaturityDate} onChange={(event) => setRequestedMaturityDate(event.target.value)} /></label>
              <label>Renewal reason / information<textarea required maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Provide the reason or relevant details for this renewal request." /></label>
              {error && <div className="institution-message error" role="alert">{error}</div>}
              <div className="institution-toolbar">
                <button className="institution-secondary-button" type="button" onClick={() => setShowApply(false)}>Cancel</button>
                <button className="primary-button" type="submit" disabled={submitting || !eligibleFdrs.some((fdr) => fdr.eligible)}>{submitting ? "Submitting..." : "Submit Renewal Request"}</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {selectedDetail && (
        <div className="institution-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            setSelectedRenewal(null);
            setSearchParams({});
          }
        }}>
          <section className="institution-modal" role="dialog" aria-modal="true" aria-labelledby="renewal-details-title">
            <div className="institution-modal-header">
              <h2 id="renewal-details-title">Renewal #{selectedDetail.renewal.renewal_id}</h2>
              <button className="institution-modal-close" type="button" onClick={() => {
                setSelectedRenewal(null);
                setSearchParams({});
              }} aria-label="Close">×</button>
            </div>
            <div className="institution-detail-grid">
              <div><small>FDR number</small><strong>{selectedDetail.renewal.fdr_number}</strong></div>
              <div><small>Bank</small><strong>{selectedDetail.renewal.bank_name}</strong></div>
              <div><small>Amount</small><strong>{formatAmount(selectedDetail.renewal.amount)}</strong></div>
              <div><small>Issue date</small><strong>{formatDate(selectedDetail.renewal.issue_date)}</strong></div>
              <div><small>Current maturity</small><strong>{formatDate(selectedDetail.renewal.maturity_date)}</strong></div>
              <div><small>Requested maturity</small><strong>{formatDate(selectedDetail.renewal.requested_maturity_date)}</strong></div>
              <div><small>Request date</small><strong>{formatDate(selectedDetail.renewal.request_date)}</strong></div>
              <div><small>Renewal status</small><strong>{String(selectedDetail.renewal.renewal_status).replaceAll("_", " ")}</strong></div>
              <div><small>FDR verification</small><strong>{selectedDetail.renewal.verification_status}</strong></div>
              <div><small>Application type</small><strong>{selectedDetail.renewal.application_type?.replaceAll("_", " ") || "—"}</strong></div>
              <div><small>Programme</small><strong>{selectedDetail.renewal.programme_name || "—"}</strong></div>
              <div><small>Programme level / discipline</small><strong>{[selectedDetail.renewal.programme_level, selectedDetail.renewal.discipline].filter(Boolean).join(" · ") || "—"}</strong></div>
              <div><small>Academic year</small><strong>{selectedDetail.renewal.academic_year || "—"}</strong></div>
              <div><small>Application status</small><strong>{selectedDetail.renewal.application_status || "—"}</strong></div>
              <div><small>Renewal reason</small><strong>{selectedDetail.renewal.reason || "—"}</strong></div>
            </div>
            <h3>Uploaded FDR documents</h3>
            {documentError && <div className="institution-message error" role="alert">{documentError}</div>}
            {(selectedDetail.documents || []).map((document) => (
              <div className="institution-toolbar" key={document.id}>
                <span>{document.file_name} · {document.document_type} · {formatDate(document.uploaded_at)}</span>
                <button className="institution-secondary-button" type="button" onClick={() => openDocument(selectedDetail.renewal.fdr_id, document)}>Open Document</button>
              </div>
            ))}
            {!selectedDetail.documents?.length && <p>No uploaded documents are available.</p>}
            <h3>Activity</h3>
            {(selectedDetail.timeline || []).length ? (
              <div className="institution-timeline">{selectedDetail.timeline.map((event, index) => (
                <div className="institution-timeline-item" key={`${event.action}-${index}`}>
                  <strong>{event.action.replaceAll("_", " ")}</strong>
                  <small>{formatDate(event.created_at)}</small>
                </div>
              ))}</div>
            ) : <p>No activity has been recorded yet.</p>}
          </section>
        </div>
      )}
    </InstitutionLayout>
  );
}

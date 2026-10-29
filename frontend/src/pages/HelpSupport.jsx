import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import InstitutionLayout from "../components/InstitutionLayout";
import "./InstitutionWorkspace.css";

const FAQ_ITEMS = [
  {
    id: "faq-1",
    category: "Verification",
    question: "Why is my FDR verification still pending?",
    answer:
      "Your submission may still be undergoing automated verification or may require additional scrutiny. Check the verification status in My FDRs and review any notification or action-required message associated with the submission."
  },
  {
    id: "faq-2",
    category: "Verification",
    question: "Why does my submitted FDR show a mismatch?",
    answer:
      "A mismatch may occur when information entered during submission differs from the uploaded FDR document or available verification information. Review the flagged fields and correct the information where permitted."
  },
  {
    id: "faq-3",
    category: "OCR & Upload",
    question: "What happens if the OCR details are incorrect?",
    answer:
      "Review the extracted information against the original FDR document. If corrections are permitted, update the relevant submission information or follow the instructions provided in the verification message."
  },
  {
    id: "faq-4",
    category: "Bank Check",
    question: "What should I do if bank verification fails?",
    answer:
      "First verify that the FDR number, issuing bank, amount and dates were entered correctly. If the information is correct and verification still fails, contact the appropriate AICTE support channel for further assistance."
  },
  {
    id: "faq-5",
    category: "Renewals",
    question: "How can I renew an FDR?",
    answer:
      "Open the Renewals section to view FDRs approaching maturity and follow the available renewal or replacement workflow."
  },
  {
    id: "faq-6",
    category: "Portfolio",
    question: "Where can I see the status of my FDR?",
    answer:
      "Open My FDRs to view the current submission, verification and validity status of your FDR records."
  },
  {
    id: "faq-7",
    category: "Documents",
    question: "What documents should I upload?",
    answer:
      "Upload the documents requested by the portal for the relevant submission. Ensure that uploaded documents are clear, complete and correspond to the submitted FDR details."
  },
  {
    id: "faq-8",
    category: "Renewals",
    question: "What should I do if my FDR is approaching maturity?",
    answer:
      "AICTE regulations open the renewal window 90 days prior to deposit maturity. Navigate to the Renewals section to view eligible instruments and submit your renewal application with the revised maturity date or replacement deposit before the expiry date."
  },
  {
    id: "faq-9",
    category: "Clarifications",
    question: "What if my application requires clarification from AICTE?",
    answer:
      "If an AICTE officer marks your submission as requiring clarification or action, an alert will appear in your Notifications tab. Review the officer's specific notes and submit the requested clarifications or corrected documentation."
  },
  {
    id: "faq-10",
    category: "Compliance",
    question: "What are the essential requirements for the joint lien deposit certificate?",
    answer:
      "The fixed deposit receipt must be endorsed with a joint lien in the name of your institution and Member Secretary, AICTE. Ensure the certificate clearly states the FDR number, principal amount, issuing bank branch, issue date, and maturity date, and bears official bank signatures and stamps."
  }
];

export default function HelpSupport() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [openItems, setOpenItems] = useState({ "faq-1": true, "faq-2": true });

  const toggleAccordion = (id) => {
    setOpenItems((prev) => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const filteredFaqs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return FAQ_ITEMS.filter((item) => {
      const matchesCategory =
        selectedCategory === "ALL" || item.category.toUpperCase() === selectedCategory;
      const matchesQuery =
        !q ||
        item.question.toLowerCase().includes(q) ||
        item.answer.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q);
      return matchesCategory && matchesQuery;
    });
  }, [searchQuery, selectedCategory]);

  return (
    <InstitutionLayout active="help">
      <div className="institution-page-content">
        {/* HERO HEADER */}
        <section className="inst-help-hero">
          <div className="inst-help-hero-content">
            <h1>HELP &amp; SUPPORT</h1>
            <p className="inst-help-main-desc">
              Get assistance with FDR submission, verification, renewals and portal-related issues.
            </p>
            <p className="inst-help-sub-desc">
              Find answers to common questions or contact the appropriate support channel.
            </p>
          </div>
          <div className="inst-help-hero-badge">
            <span className="badge-dot" />
            <span>Institution Support Desk</span>
          </div>
        </section>

        {/* 5 QUICK HELP CARDS */}
        <div className="inst-help-section-title">
          <h2>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            Quick Help Categories
          </h2>
          <p>Direct shortcuts for common operational workflows</p>
        </div>

        <section className="inst-help-quick-grid">
          {/* CARD 1: FDR SUBMISSION */}
          <div className="inst-help-card">
            <div>
              <div className="inst-help-card-header">
                <div className="inst-help-card-icon">📄</div>
                <h3 className="inst-help-card-title">FDR Submission</h3>
              </div>
              <ul className="inst-help-card-topics">
                <li>Entering FDR details</li>
                <li>Uploading the FDR document</li>
                <li>Correcting submission information</li>
                <li>Understanding required fields</li>
              </ul>
            </div>
            <button
              className="inst-help-card-btn"
              type="button"
              onClick={() => navigate("/submit-fdr")}
            >
              Learn More →
            </button>
          </div>

          {/* CARD 2: FDR VERIFICATION */}
          <div className="inst-help-card">
            <div>
              <div className="inst-help-card-header">
                <div className="inst-help-card-icon">🔍</div>
                <h3 className="inst-help-card-title">FDR Verification</h3>
              </div>
              <ul className="inst-help-card-topics">
                <li>Verification status</li>
                <li>OCR extraction</li>
                <li>Data mismatch resolution</li>
                <li>Bank verification checks</li>
                <li>Flagged submissions</li>
              </ul>
            </div>
            <button
              className="inst-help-card-btn"
              type="button"
              onClick={() => navigate("/fdrs")}
            >
              View My FDRs →
            </button>
          </div>

          {/* CARD 3: RENEWALS */}
          <div className="inst-help-card">
            <div>
              <div className="inst-help-card-header">
                <div className="inst-help-card-icon">🔄</div>
                <h3 className="inst-help-card-title">Renewals</h3>
              </div>
              <ul className="inst-help-card-topics">
                <li>Upcoming maturity alerts</li>
                <li>Renewal submission process</li>
                <li>Replacement FDR certificates</li>
                <li>Renewal status tracking</li>
              </ul>
            </div>
            <button
              className="inst-help-card-btn"
              type="button"
              onClick={() => navigate("/renewals")}
            >
              View Renewals →
            </button>
          </div>

          {/* CARD 4: DOCUMENTS */}
          <div className="inst-help-card">
            <div>
              <div className="inst-help-card-header">
                <div className="inst-help-card-icon">📁</div>
                <h3 className="inst-help-card-title">Documents</h3>
              </div>
              <ul className="inst-help-card-topics">
                <li>Uploading documents</li>
                <li>Viewing submitted documents</li>
                <li>Resolving missing documents</li>
                <li>Document compliance status</li>
              </ul>
            </div>
            <button
              className="inst-help-card-btn"
              type="button"
              onClick={() => navigate("/documents")}
            >
              View Documents →
            </button>
          </div>

          {/* CARD 5: NOTIFICATIONS */}
          <div className="inst-help-card">
            <div>
              <div className="inst-help-card-header">
                <div className="inst-help-card-icon">🔔</div>
                <h3 className="inst-help-card-title">Notifications</h3>
              </div>
              <ul className="inst-help-card-topics">
                <li>Verification alerts</li>
                <li>Renewal reminders</li>
                <li>Action-required notifications</li>
                <li>Submission status updates</li>
              </ul>
            </div>
            <button
              className="inst-help-card-btn"
              type="button"
              onClick={() => navigate("/notifications")}
            >
              View Notifications →
            </button>
          </div>
        </section>

        {/* SUPPORT WORKFLOW SECTION */}
        <section className="inst-workflow-card">
          <div className="inst-workflow-card-header">
            <h3>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
              Standard Resolution Workflow: What Should I Do?
            </h3>
            <p>Step-by-step guidance to resolve discrepancies and portal-related inquiries</p>
          </div>

          <div className="inst-workflow-flow">
            <div className="inst-workflow-step">
              <span className="inst-workflow-step-num">1</span>
              <span className="inst-workflow-step-text">Problem Encountered</span>
            </div>
            <span className="inst-workflow-arrow">→</span>

            <div className="inst-workflow-step">
              <span className="inst-workflow-step-num">2</span>
              <span className="inst-workflow-step-text">Check FAQ &amp; Help</span>
            </div>
            <span className="inst-workflow-arrow">→</span>

            <div className="inst-workflow-step">
              <span className="inst-workflow-step-num">3</span>
              <span className="inst-workflow-step-text">Review FDR / Renewal / Docs</span>
            </div>
            <span className="inst-workflow-arrow">→</span>

            <div className="inst-workflow-step">
              <span className="inst-workflow-step-num">4</span>
              <span className="inst-workflow-step-text">Check Notifications</span>
            </div>
            <span className="inst-workflow-arrow">→</span>

            <div className="inst-workflow-step">
              <span className="inst-workflow-step-num">5</span>
              <span className="inst-workflow-step-text">Correct Information (if permitted)</span>
            </div>
            <span className="inst-workflow-arrow">→</span>

            <div className="inst-workflow-step">
              <span className="inst-workflow-step-num">6</span>
              <span className="inst-workflow-step-text">Contact Official Support</span>
            </div>
          </div>
        </section>

        {/* FREQUENTLY ASKED QUESTIONS */}
        <section className="inst-faq-container">
          <div className="inst-faq-header">
            <div>
              <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#002b5c", margin: "0 0 4px 0" }}>
                Frequently Asked Questions
              </h2>
              <p style={{ fontSize: "13px", color: "#64748b", margin: 0 }}>
                Practical answers to questions regarding submission, OCR, banking, and renewals
              </p>
            </div>

            <div className="inst-faq-search-box">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search questions (e.g., mismatch, bank, OCR)..."
                aria-label="Search FAQ"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: "14px" }}
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {filteredFaqs.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "#64748b" }}>
              <p style={{ margin: 0, fontWeight: 600 }}>No matching questions found for "{searchQuery}".</p>
              <p style={{ fontSize: "12px", marginTop: "4px" }}>Try clearing your search query or contact official AICTE support.</p>
            </div>
          ) : (
            <div className="inst-faq-list">
              {filteredFaqs.map((faq) => {
                const isOpen = !!openItems[faq.id];
                return (
                  <div key={faq.id} className="inst-faq-item" data-open={isOpen}>
                    <button
                      type="button"
                      className="inst-faq-summary"
                      onClick={() => toggleAccordion(faq.id)}
                      aria-expanded={isOpen}
                      style={{ width: "100%", border: "none", textAlign: "left" }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span className="inst-faq-badge-category">{faq.category}</span>
                        <span>{faq.question}</span>
                      </div>
                      <span className="inst-faq-toggle-icon" style={{ transform: isOpen ? "rotate(180deg)" : "none" }}>
                        ▾
                      </span>
                    </button>
                    {isOpen && <div className="inst-faq-answer">{faq.answer}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* CONTACT DETAILS & OFFICIAL HELPDESK SECTION */}
        <section className="inst-contact-section">
          <div className="inst-contact-header">
            <div className="inst-contact-icon-badge">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
            </div>
            <div className="inst-contact-title">
              <h3>Contact Details &amp; Official Helpdesk</h3>
              <p>Direct communication channels for AICTE Fixed Deposit Receipt (FDR) support</p>
            </div>
          </div>

          <div className="inst-contact-grid">
            {/* EMAIL CONTACT */}
            <div className="inst-contact-item">
              <div className="inst-contact-item-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
              </div>
              <div className="inst-contact-item-info">
                <span className="inst-contact-item-label">Official Support Email</span>
                <span className="inst-contact-item-val">
                  <a href="mailto:officer@aicte.gov.in">officer@aicte.gov.in</a>
                </span>
                <span className="inst-contact-item-desc">
                  Institutional queries, FDR discrepancies, renewals, and technical assistance.
                </span>
              </div>
            </div>

            {/* PHONE HELPLINE */}
            <div className="inst-contact-item">
              <div className="inst-contact-item-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
              </div>
              <div className="inst-contact-item-info">
                <span className="inst-contact-item-label">Helpdesk Telephone</span>
                <span className="inst-contact-item-val">
                  <a href="tel:01129581000">011-29581000</a> / <a href="tel:01129581333">011-29581333</a>
                </span>
                <span className="inst-contact-item-desc">
                  Central AICTE EPABX Lines (Ext. Approval &amp; Security Deposit Cell).
                </span>
              </div>
            </div>

            {/* OPERATIONAL HOURS */}
            <div className="inst-contact-item">
              <div className="inst-contact-item-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <div className="inst-contact-item-info">
                <span className="inst-contact-item-label">Operational Hours</span>
                <span className="inst-contact-item-val">Monday – Friday: 09:30 AM to 05:30 PM IST</span>
                <span className="inst-contact-item-desc">
                  Excluding Saturdays, Sundays, and Gazetted Central Government Holidays.
                </span>
              </div>
            </div>

            {/* HEADQUARTERS ADDRESS */}
            <div className="inst-contact-item">
              <div className="inst-contact-item-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
              </div>
              <div className="inst-contact-item-info">
                <span className="inst-contact-item-label">Nodal Headquarters</span>
                <span className="inst-contact-item-val">Nelson Mandela Marg, Vasant Kunj, New Delhi - 110070</span>
                <span className="inst-contact-item-desc">
                  All India Council for Technical Education (Approval Bureau — FDR Division).
                </span>
              </div>
            </div>
          </div>

          <div className="inst-contact-banner">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <span>
              <strong>Important:</strong> When contacting the helpdesk, please quote your <strong>Institution Name</strong>, <strong>AICTE Permanent Application ID</strong>, and relevant <strong>FDR Number</strong> for expedited assistance.
            </span>
          </div>
        </section>
      </div>
    </InstitutionLayout>
  );
}

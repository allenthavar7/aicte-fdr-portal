import { getFdrPriority } from "../utils/fdrPriority";
import "./FdrPriority.css";

export function FdrPriorityBadge({ priority, fdr, compact = false }) {
  const value = priority || getFdrPriority(fdr);
  const level = value.level || "Low";
  const className = `fdr-priority-badge fdr-priority-${level.toLowerCase()}`;
  const firstReason = value.reasons?.[0]?.label;

  return (
    <span
      className={className}
      title={`${level} priority (${value.score}/100)${
        firstReason ? ` — ${firstReason}` : ""
      }`}
      aria-label={`${level} priority, score ${value.score} out of 100${
        firstReason ? `. ${firstReason}` : ""
      }`}
    >
      {level} <strong>({value.score}/100)</strong>
      {!compact && value.reasons?.length > 0 && (
        <small>{value.reasons[0].label}</small>
      )}
    </span>
  );
}

export function FdrPrioritySummary({ priority, fdr }) {
  const value = priority || getFdrPriority(fdr);

  return (
    <section className="fdr-priority-summary" aria-label="FDR priority summary">
      <div className="fdr-priority-summary-header">
        <div>
          <span className="fdr-priority-eyebrow">Priority assessment</span>
          <h3>{value.level} priority</h3>
        </div>
        <strong className="fdr-priority-total">{value.score} / 100</strong>
      </div>
      <h4>Why this FDR needs attention</h4>
      {value.reasons?.length ? (
        <ul>
          {value.reasons.map((reason) => (
            <li key={reason.type}>
              <span>{reason.label}</span>
              <strong>+{reason.points}</strong>
            </li>
          ))}
        </ul>
      ) : (
        <p>No priority risks are recorded from the available FDR information.</p>
      )}
      <div className="fdr-priority-total-row">
        <span>Total priority score</span>
        <strong>{value.score} / 100</strong>
      </div>
    </section>
  );
}

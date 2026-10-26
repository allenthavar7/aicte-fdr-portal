const { calculateFdrPriority } = require("../../../shared/fdrPriority.mjs");

function parseJson(value, fallback) {
  return value ? JSON.parse(value) : fallback;
}

function addFdrPriority(db, records, getFdrId = (record) => record.id) {
  if (!records.length) {
    return records;
  }

  const fdrIds = [...new Set(records.map(getFdrId).filter(Number.isInteger))];
  if (!fdrIds.length) {
    return records;
  }

  const placeholders = fdrIds.map(() => "?").join(", ");
  const contexts = db.prepare(`
    SELECT f.id, f.maturity_date, f.status, f.verification_status,
      v.result, v.ocr_confidence, v.comparison_results, v.verification_checks,
      v.bank_verification_result,
      (SELECT COUNT(*) FROM documents d WHERE d.fdr_id = f.id) AS document_count
    FROM fdrs f
    LEFT JOIN verifications v ON v.id = (
      SELECT latest.id FROM verifications latest
      WHERE latest.fdr_id = f.id
      ORDER BY latest.verified_at DESC, latest.id DESC LIMIT 1
    )
    WHERE f.id IN (${placeholders})
  `).all(...fdrIds);
  const renewals = db.prepare(`
    SELECT old_fdr_id AS fdr_id, new_fdr_id, status,
      requested_maturity_date, renewal_date
    FROM renewals
    WHERE old_fdr_id IN (${placeholders})
  `).all(...fdrIds);
  const releaseRequests = db.prepare(`
    SELECT fdr_id, status, created_at, reason
    FROM release_requests
    WHERE fdr_id IN (${placeholders})
  `).all(...fdrIds);
  const contextsById = new Map();

  for (const context of contexts) {
    const verification = context.result || context.verification_status
      ? {
          result: context.result,
          ocr_confidence: context.ocr_confidence,
          comparisons: parseJson(context.comparison_results, []),
          checks: parseJson(context.verification_checks, []),
          bank_verification: parseJson(context.bank_verification_result, null)
        }
      : null;
    contextsById.set(context.id, {
      ...context,
      verification,
      renewals: renewals.filter((item) => item.fdr_id === context.id),
      release_requests: releaseRequests.filter(
        (item) => item.fdr_id === context.id
      )
    });
  }

  return records.map((record) => {
    const context = contextsById.get(getFdrId(record));
    if (!context) {
      return record;
    }
    const merged = {
      ...context,
      ...record,
      document_count: record.document_count ?? context.document_count,
      verification: record.verification || context.verification,
      renewals: context.renewals,
      release_requests: context.release_requests
    };
    return {
      ...record,
      priority: calculateFdrPriority(merged)
    };
  });
}

module.exports = { addFdrPriority };

const fs = require("fs");
const path = require("path");

const uploadDirectory = path.resolve(__dirname, "..", "uploads", "fdr");

function calculateInstitutionCompliance(db, institutionId) {
  const institution = db.prepare(`
    SELECT id, name
    FROM institutions
    WHERE id = ?
  `).get(institutionId);

  if (!institution) {
    return null;
  }

  const fdrs = db.prepare(`
    SELECT
      f.id,
      f.fdr_number,
      f.maturity_date,
      f.status,
      f.verification_status,
      (
        SELECT COUNT(*)
        FROM verifications v
        WHERE v.fdr_id = f.id
          AND upper(v.result) = 'FAILED'
      ) AS failed_verification_count
    FROM fdrs f
    WHERE f.institution_id = ?
  `).all(institutionId);

  const total = fdrs.length;
  const verified = fdrs.filter(
    (fdr) => String(fdr.verification_status).toUpperCase() === "VERIFIED"
  ).length;
  const flagged = fdrs.filter(
    (fdr) => String(fdr.verification_status).toUpperCase() === "FLAGGED"
  ).length;
  const failedSubmissions = fdrs.filter(
    (fdr) =>
      String(fdr.verification_status).toUpperCase() === "FAILED" ||
      fdr.failed_verification_count > 0
  ).length;
  const documentsPresent = fdrs.filter((fdr) => {
    const documents = db.prepare(`
      SELECT file_path
      FROM documents
      WHERE fdr_id = ?
        AND trim(file_name) <> ''
        AND trim(document_type) <> ''
        AND file_path IS NOT NULL
        AND trim(file_path) <> ''
      ORDER BY uploaded_at DESC, id DESC
    `).all(fdr.id);

    return documents.some((document) => {
      const documentPath = path.resolve(document.file_path);
      const relativePath = path.relative(uploadDirectory, documentPath);

      return (
        relativePath !== ".." &&
        !relativePath.startsWith(`..${path.sep}`) &&
        !path.isAbsolute(relativePath) &&
        fs.existsSync(documentPath)
      );
    });
  }).length;
  const duplicateNumberGroups = db.prepare(`
    SELECT COUNT(*) AS count
    FROM (
      SELECT lower(trim(fdr_number)) AS normalized_number
      FROM fdrs
      WHERE institution_id = ?
      GROUP BY lower(trim(fdr_number))
      HAVING COUNT(*) > 1
    )
  `).get(institutionId).count;
  const duplicateSubmissions = db.prepare(`
    SELECT COALESCE(SUM(duplicate_count), 0) AS count
    FROM (
      SELECT COUNT(*) AS duplicate_count
      FROM fdrs
      WHERE institution_id = ?
      GROUP BY lower(trim(fdr_number))
      HAVING COUNT(*) > 1
    )
  `).get(institutionId).count;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expired = fdrs.filter((fdr) => {
    const maturityDate = fdr.maturity_date
      ? new Date(`${fdr.maturity_date}T00:00:00`)
      : null;

    return (
      ["MATURED", "EXPIRED"].includes(String(fdr.status).toUpperCase()) ||
      Boolean(
        maturityDate &&
          !Number.isNaN(maturityDate.getTime()) &&
          maturityDate < today
      )
    );
  }).length;
  const rate = (count) => (total ? count / total : 0);
  const factors = [
    {
      key: "verified",
      label: "Verified FDRs",
      numerator: verified,
      denominator: total,
      points: Math.round(rate(verified) * 40),
      maximumPoints: 40
    },
    {
      key: "not_flagged",
      label: "Not Flagged",
      numerator: total - flagged,
      denominator: total,
      points: Math.round(rate(total - flagged) * 10),
      maximumPoints: 10
    },
    {
      key: "clean_documents",
      label: "Clean Documents",
      numerator: documentsPresent,
      denominator: total,
      points: Math.round(rate(documentsPresent) * 20),
      maximumPoints: 20
    },
    {
      key: "no_duplicates",
      label: "No Duplicate FDR Numbers",
      numerator: Math.max(total - duplicateSubmissions, 0),
      denominator: total,
      points: Math.round(rate(Math.max(total - duplicateSubmissions, 0)) * 15),
      maximumPoints: 15
    },
    {
      key: "not_expired",
      label: "No Expired FDRs",
      numerator: Math.max(total - expired, 0),
      denominator: total,
      points: Math.round(rate(Math.max(total - expired, 0)) * 10),
      maximumPoints: 10
    },
    {
      key: "no_failed",
      label: "No Failed Submissions",
      numerator: Math.max(total - failedSubmissions, 0),
      denominator: total,
      points: Math.round(rate(Math.max(total - failedSubmissions, 0)) * 5),
      maximumPoints: 5
    }
  ];

  return {
    institution,
    score: factors.reduce((sum, factor) => sum + factor.points, 0),
    maximumScore: 100,
    fdrCount: total,
    metrics: {
      verified,
      flagged,
      failedSubmissions,
      documentsPresent,
      duplicateNumberGroups,
      duplicateSubmissions,
      expired
    },
    factors,
    methodology:
      "Score = verified rate × 40 + not-flagged rate × 10 + valid stored-document rate × 20 + non-duplicate FDR rate × 15 + non-expired FDR rate × 10 + non-failed-submission rate × 5. Each factor is rounded to the nearest whole point; institutions with no FDRs score 0."
  };
}

module.exports = {
  calculateInstitutionCompliance
};

const fs = require("fs");
const os = require("os");
const path = require("path");
const { createWorker } = require("tesseract.js");

const OCR_CONFIDENCE_THRESHOLD = 80;
const MAX_PDF_PAGES = 10;
const REQUIRED_FIELDS = [
  "fdrNumber",
  "bankName",
  "amount",
  "issueDate",
  "maturityDate"
];

let workerPromise;

function getWorker() {
  if (!workerPromise) {
    const cachePath = path.join(
      os.homedir(),
      ".cache",
      "aicte-fdr-portal",
      "tesseract"
    );
    fs.mkdirSync(cachePath, { recursive: true });
    workerPromise = createWorker("eng", 1, { cachePath }).catch((error) => {
      workerPromise = null;
      throw error;
    });
  }

  return workerPromise;
}

function parseDate(value) {
  const text = String(value || "").trim();
  const isoDate = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const indianDate = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  const parts = isoDate
    ? [Number(isoDate[1]), Number(isoDate[2]), Number(isoDate[3])]
    : indianDate
      ? [Number(indianDate[3]), Number(indianDate[2]), Number(indianDate[1])]
      : null;

  if (parts) {
    const [year, month, day] = parts;
    const date = new Date(Date.UTC(year, month - 1, day));

    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      return null;
    }

    return date.toISOString().slice(0, 10);
  }

  const namedDate = new Date(text);
  return Number.isNaN(namedDate.getTime())
    ? null
    : namedDate.toISOString().slice(0, 10);
}

function getLabeledValue(lines, labelPattern) {
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(
      new RegExp(`^\\s*(?:${labelPattern})\\s*(?:[:#-]\\s*)?(.*)$`, "i")
    );

    if (!match) {
      continue;
    }

    const inlineValue = match[1].trim();
    if (inlineValue) {
      return { value: inlineValue, lineIndex: index };
    }

    const nextLine = lines[index + 1]?.trim();
    if (nextLine && !looksLikeAnotherLabel(nextLine)) {
      return { value: nextLine, lineIndex: index + 1 };
    }
  }

  return null;
}

function looksLikeAnotherLabel(line) {
  return /^(?:fdr|fixed\s+deposit\s+receipt|receipt|bank|principal\s+amount|deposit\s+amount|amount|date\s+of\s+issue|issue\s+date|maturity\s+date|date\s+of\s+maturity)\b/i.test(
    line
  );
}

function cleanTextValue(value) {
  return String(value || "")
    .replace(/\s{2,}/g, " ")
    .replace(/[|]+/g, "")
    .trim()
    .replace(/[\s,;:]+$/, "");
}

function parseAmount(value) {
  const match = String(value || "").match(
    /(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d{1,2})?)/i
  );

  if (!match) {
    return null;
  }

  const amount = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(amount) ? amount : null;
}

function extractLabeledFields(text, pageResults) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const labels = {
    fdrNumber:
      "(?:FDR\\s*(?:Number|No\\.?|#)|Fixed\\s+Deposit\\s+Receipt\\s*(?:Number|No\\.?|#)|Receipt\\s*(?:Number|No\\.?|#))",
    bankName: "(?:Bank\\s+Name|Bank)",
    amount: "(?:Principal\\s+Amount|Deposit\\s+Amount|Amount)",
    issueDate: "(?:Date\\s+of\\s+Issue|Issue\\s+Date)",
    maturityDate: "(?:Maturity\\s+Date|Date\\s+of\\s+Maturity)"
  };
  const confidenceByField = {};
  const extracted = {};

  for (const [field, labelPattern] of Object.entries(labels)) {
    const match = getLabeledValue(lines, labelPattern);
    const value = match?.value;
    let parsed = null;

    if (field === "amount") {
      parsed = parseAmount(value);
    } else if (field === "issueDate" || field === "maturityDate") {
      parsed = parseDate(value);
    } else if (value) {
      parsed = cleanTextValue(value);
    }

    extracted[field] = parsed;
    confidenceByField[field] = parsed === null
      ? 0
      : confidenceForLine(lines[match.lineIndex], pageResults);
  }

  return { extracted, confidenceByField };
}

function confidenceForLine(text, pageResults) {
  const normalizedLine = text.toLocaleLowerCase("en-IN").replace(/\s+/g, " ");
  const confidences = pageResults.flatMap((page) =>
    (page.lines || [])
      .filter(
        (line) =>
          line.text
            ?.toLocaleLowerCase("en-IN")
            .replace(/\s+/g, " ") === normalizedLine
      )
      .map((line) => line.confidence)
  );
  const confidence = confidences.find(Number.isFinite);

  if (confidence !== undefined) {
    return Math.round(confidence);
  }

  return Math.round(
    pageResults.reduce((sum, page) => sum + page.confidence, 0) /
      Math.max(pageResults.length, 1)
  );
}

async function recognizeImages(images) {
  const worker = await getWorker();
  const results = [];

  for (const image of images) {
    const { data } = await worker.recognize(image);
    results.push({
      text: data.text || "",
      confidence: Number.isFinite(data.confidence) ? data.confidence : 0,
      lines: data.lines || []
    });
  }

  return results;
}

async function getDocumentImages(filePath, extension) {
  if (extension !== ".pdf") {
    if (![".png", ".jpg", ".jpeg"].includes(extension)) {
      throw new Error("OCR supports PDF, PNG, JPG and JPEG documents.");
    }

    return [filePath];
  }

  const { pdf } = await import("pdf-to-img");
  const document = await pdf(filePath, { scale: 2 });

  try {
    if (!document.length) {
      throw new Error("The uploaded PDF contains no pages.");
    }
    if (document.length > MAX_PDF_PAGES) {
      throw new Error(
        `The uploaded PDF has ${document.length} pages; OCR supports up to ${MAX_PDF_PAGES} pages.`
      );
    }

    const images = [];
    for await (const image of document) {
      images.push(image);
    }
    return images;
  } finally {
    await document.destroy();
  }
}

async function extractFdrData(document) {
  const filePath =
    typeof document === "string" ? document : document?.path;
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error("An existing FDR document file is required for OCR.");
  }

  const extension = path
    .extname(typeof document === "string" ? filePath : document.originalname || filePath)
    .toLocaleLowerCase("en-IN");
  const images = await getDocumentImages(filePath, extension);
  const pageResults = await recognizeImages(images);
  const rawText = pageResults.map((page) => page.text).join("\n").trim();
  const confidence = pageResults.reduce(
    (sum, page) => sum + page.confidence,
    0
  ) / Math.max(pageResults.length, 1);
  const { extracted, confidenceByField } = extractLabeledFields(
    rawText,
    pageResults
  );
  const hasAllFields = REQUIRED_FIELDS.every(
    (field) => extracted[field] !== null
  );
  const status = !rawText
    ? "FAILED"
    : confidence < OCR_CONFIDENCE_THRESHOLD || !hasAllFields
      ? "LOW_CONFIDENCE"
      : "SUCCESS";
  const extractedWithAliases = {
    ...extracted,
    fdr_number: extracted.fdrNumber,
    bank_name: extracted.bankName,
    issue_date: extracted.issueDate,
    maturity_date: extracted.maturityDate
  };
  const confidenceDetails = {
    overall: Math.round(confidence),
    fdr_number: confidenceByField.fdrNumber,
    bank_name: confidenceByField.bankName,
    amount: confidenceByField.amount,
    issue_date: confidenceByField.issueDate,
    maturity_date: confidenceByField.maturityDate
  };

  return {
    provider: "TESSERACT.JS",
    status,
    extracted: extractedWithAliases,
    confidence: confidenceDetails,
    confidenceByField,
    rawText,
    raw_text: rawText,
    message:
      status === "SUCCESS"
        ? "OCR extracted all required FDR fields."
        : status === "FAILED"
          ? "OCR could not read text from the uploaded document."
          : "OCR read the document, but one or more required fields are missing or below the 80% confidence threshold."
  };
}

function serializeOcrExtraction(extraction) {
  return JSON.stringify({
    ...(extraction?.extracted || {}),
    ocrStatus: extraction?.status || "NOT_AVAILABLE",
    ocrProvider: extraction?.provider || "NOT_AVAILABLE",
    confidenceByField: extraction?.confidenceByField || {},
    rawText: extraction?.rawText || ""
  });
}

async function shutdownOcrWorker() {
  const activeWorker = workerPromise;
  workerPromise = null;

  if (activeWorker) {
    const worker = await activeWorker;
    await worker.terminate();
  }
}

module.exports = {
  extractFdrData,
  serializeOcrExtraction,
  shutdownOcrWorker
};

export const STUDENT_FEE_GROUPS = [
  { value: "standard", label: "Standard" },
  { value: "science", label: "Science" },
  { value: "arts", label: "Arts" },
  { value: "commercial", label: "Commercial" },
];

export const SCIENCE_SSS_SURCHARGE = 2000;
export const FEE_GROUP_EFFECTIVE_TERM = "Third Term";
export const FEE_GROUP_EFFECTIVE_YEAR = "2025/2026";

const TERM_ORDER = {
  "first term": 1,
  "second term": 2,
  "third term": 3,
};

export function normalizeFeeGroup(value) {
  const key = String(value || "").trim().toLowerCase();
  if (key === "science") return "science";
  if (key === "arts" || key === "art") return "arts";
  if (key === "commercial" || key === "commerce") return "commercial";
  return "standard";
}

export function getFeeGroupLabel(value) {
  const normalized = normalizeFeeGroup(value);
  return STUDENT_FEE_GROUPS.find((group) => group.value === normalized)?.label || "Standard";
}

function parseAcademicYearStart(yearText) {
  const match = String(yearText || "").trim().match(/^(\d{4})\/\d{4}$/);
  return match ? Number(match[1]) || 0 : 0;
}

export function isFeeGroupEffectiveForTerm(term, academicYear) {
  const requestedYear = parseAcademicYearStart(academicYear);
  const effectiveYear = parseAcademicYearStart(FEE_GROUP_EFFECTIVE_YEAR);
  if (!requestedYear || !effectiveYear) return false;
  if (requestedYear > effectiveYear) return true;
  if (requestedYear < effectiveYear) return false;

  const requestedTerm = TERM_ORDER[String(term || "").trim().toLowerCase()] || 0;
  const effectiveTerm = TERM_ORDER[String(FEE_GROUP_EFFECTIVE_TERM).trim().toLowerCase()] || 0;
  return requestedTerm >= effectiveTerm;
}

export function getStudentFeeAdjustments(student, { term, academicYear } = {}) {
  const grade = String(student?.grade || "").trim().toUpperCase();
  const feeGroup = normalizeFeeGroup(student?.fee_group);

  if (grade.startsWith("SSS") && feeGroup === "science" && isFeeGroupEffectiveForTerm(term, academicYear)) {
    return [{
      name: "Science surcharge",
      amount: SCIENCE_SSS_SURCHARGE,
      reason: `SSS Science students pay an additional fee from ${FEE_GROUP_EFFECTIVE_TERM} ${FEE_GROUP_EFFECTIVE_YEAR}.`,
    }];
  }

  return [];
}

import {
  SCIENCE_SSS_SURCHARGE,
  getStudentFeeAdjustments,
  isFeeGroupEffectiveForTerm,
  normalizeFeeGroup,
} from "@/lib/feeGroups";

const TERM_PRIORITY = {
  "first term": 1,
  "second term": 2,
  "third term": 3,
};

const normalizeText = (value) => String(value ?? "").trim().toLowerCase();

const isEmptyText = (value) => normalizeText(value).length === 0;

const parseAcademicYearStart = (yearText) => {
  const match = String(yearText ?? "").match(/^(\d{4})\/(\d{4})$/);
  if (!match) return -1;
  return Number(match[1]) || -1;
};

const sortByRecency = (records = []) => {
  return [...records].sort((a, b) => {
    const aUpdated = a?.updated_date ? Date.parse(a.updated_date) : 0;
    const bUpdated = b?.updated_date ? Date.parse(b.updated_date) : 0;
    if (aUpdated !== bUpdated) return bUpdated - aUpdated;

    const aCreated = a?.created_date ? Date.parse(a.created_date) : 0;
    const bCreated = b?.created_date ? Date.parse(b.created_date) : 0;
    if (aCreated !== bCreated) return bCreated - aCreated;

    return String(b?.id || "").localeCompare(String(a?.id || ""));
  });
};

export function getExactClassFee(classFees = [], { grade, term, academicYear } = {}) {
  const gradeKey = normalizeText(grade);
  const termKey = normalizeText(term);
  const yearKey = normalizeText(academicYear);
  if (!gradeKey) return null;

  const exact = classFees.filter((fee) => {
    if (normalizeText(fee?.grade) !== gradeKey) return false;
    return normalizeText(fee?.term) === termKey && normalizeText(fee?.academic_year) === yearKey;
  });
  return sortByRecency(exact)[0] || null;
}

export function getEffectiveClassFee(classFees = [], { grade, term, academicYear } = {}) {
  const gradeKey = normalizeText(grade);
  const termKey = normalizeText(term);
  const yearKey = normalizeText(academicYear);
  if (!gradeKey) return null;

  const gradeRecords = classFees.filter((fee) => normalizeText(fee?.grade) === gradeKey);
  if (gradeRecords.length === 0) return null;

  const exact = gradeRecords.filter(
    (fee) => normalizeText(fee?.term) === termKey && normalizeText(fee?.academic_year) === yearKey
  );
  if (exact.length) return sortByRecency(exact)[0];

  const termOnly = gradeRecords.filter(
    (fee) => normalizeText(fee?.term) === termKey && isEmptyText(fee?.academic_year)
  );
  if (termOnly.length) return sortByRecency(termOnly)[0];

  const yearOnly = gradeRecords.filter(
    (fee) => normalizeText(fee?.academic_year) === yearKey && isEmptyText(fee?.term)
  );
  if (yearOnly.length) return sortByRecency(yearOnly)[0];

  const legacyGlobal = gradeRecords.filter((fee) => isEmptyText(fee?.term) && isEmptyText(fee?.academic_year));
  if (legacyGlobal.length) return sortByRecency(legacyGlobal)[0];

  const sameTermAnyYear = gradeRecords.filter((fee) => normalizeText(fee?.term) === termKey);
  if (sameTermAnyYear.length) {
    const sorted = sortByRecency(sameTermAnyYear).sort((a, b) => {
      const aYear = parseAcademicYearStart(a?.academic_year);
      const bYear = parseAcademicYearStart(b?.academic_year);
      return bYear - aYear;
    });
    return sorted[0];
  }

  // Do not let a different term in the same academic year override a requested term.
  // This keeps historical term balances stable after a later term fee is created.
  if (!termKey) {
    const sameYearAnyTerm = gradeRecords.filter((fee) => normalizeText(fee?.academic_year) === yearKey);
    if (sameYearAnyTerm.length) {
      const sorted = sortByRecency(sameYearAnyTerm).sort((a, b) => {
        const aTermScore = TERM_PRIORITY[normalizeText(a?.term)] || 0;
        const bTermScore = TERM_PRIORITY[normalizeText(b?.term)] || 0;
        return bTermScore - aTermScore;
      });
      return sorted[0];
    }
  }

  if (termKey || yearKey) {
    return null;
  }

  return sortByRecency(gradeRecords)[0];
}

export function getStudentFeeSnapshot({
  student,
  classFees = [],
  term,
  academicYear,
  discountPct = 0,
  includeFeeGroups,
} = {}) {
  const feeGroupsApply =
    typeof includeFeeGroups === "boolean"
      ? includeFeeGroups
      : isFeeGroupEffectiveForTerm(term, academicYear);

  const classFee = getEffectiveClassFee(classFees, {
    grade: student?.grade,
    term,
    academicYear,
  });

  // EXACT schedule for this specific (grade, term, academicYear). If one exists,
  // it represents the school's explicit decision for this term — it must win
  // over the per-student `termly_tuition` snapshot, which gets baked in at
  // enrollment time and goes stale after promotion to a new term/year.
  // Without this, "This Term" keeps showing last term's fee even after the
  // admin updates the new term's class-fee schedule.
  const exactClassFee = getExactClassFee(classFees, {
    grade: student?.grade,
    term,
    academicYear,
  });

  const tuitionFromExactSchedule = Number(exactClassFee?.termly_tuition);
  const tuitionFromSchedule      = Number(classFee?.termly_tuition);
  const tuitionFromStudent       = Number(student?.termly_tuition);

  const hasExactSchedule   = Number.isFinite(tuitionFromExactSchedule) && tuitionFromExactSchedule >= 0;
  const hasStudentOverride = Number.isFinite(tuitionFromStudent) && tuitionFromStudent > 0;

  // Resolution priority:
  //   1. Exact schedule for THIS term + year (new-term promotion respects it).
  //   2. Per-student override (legacy / hardship cases where no schedule exists).
  //   3. Loose fallback schedule (same term different year, same grade etc.).
  //   4. Zero.
  let tuition;
  let tuitionSource;
  if (hasExactSchedule) {
    tuition = tuitionFromExactSchedule;
    tuitionSource = "schedule";
  } else if (hasStudentOverride) {
    tuition = tuitionFromStudent;
    tuitionSource = "student";
  } else if (Number.isFinite(tuitionFromSchedule)) {
    tuition = tuitionFromSchedule;
    tuitionSource = "schedule";
  } else {
    tuition = 0;
    tuitionSource = "schedule";
  }

  const scheduledOtherFees = Array.isArray(classFee?.other_fees) ? classFee.other_fees : [];
  const feeAdjustments = feeGroupsApply ? getStudentFeeAdjustments(student, { term, academicYear }) : [];
  const otherFees = [
    ...scheduledOtherFees,
    ...feeAdjustments.map((fee) => ({ name: fee.name, amount: fee.amount })),
  ];
  const otherTotal = otherFees.reduce((sum, fee) => sum + (Number(fee?.amount) || 0), 0);

  const pct = Math.max(0, Math.min(100, Number(discountPct) || 0));
  const discountedTuition = Math.round(Math.max(0, tuition) * (1 - pct / 100));
  const totalWithoutArrears = discountedTuition + otherTotal;

  return {
    classFee,
    tuition,
    tuitionSource,
    feeGroupsApply,
    discountPct: pct,
    discountedTuition,
    otherFees,
    feeAdjustments,
    otherTotal,
    totalWithoutArrears,
  };
}

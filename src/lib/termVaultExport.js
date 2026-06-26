/**
 * termVaultExport.js
 *
 * Generates and uploads PDF archives to the School Vault (Google Drive)
 * at the end of every term rollover.
 *
 * Documents produced:
 *  1. Exam Questions    â€“ one PDF per quiz  â†’ Exam Questions folder
 *  2. Financial Report  â€“ one PDF per class  â†’ Financial Documents folder
 *  3. Gradebooks        â€“ one PDF per class  â†’ Report Cards folder
 *  4. Staff Records     â€“ one PDF all staff  â†’ Staff Records folder
 *  5. Student Reg + Attendance â€“ one PDF    â†’ Registration Documents folder
 */

import { supabase } from "@/api/supabaseClient";
import { uploadToDrive, listDriveFiles, isDriveConnected } from "./googleDriveService";
import { applyStudentFeeGroups, loadPaymentDiscounts, loadStudentFeeGroups, loadStudentStartTerms, buildStudentBalanceRows } from "@/lib/paymentBalances";
import { formatDateInLagos, getLagosDateString } from "@/lib/timezone";
import { listSchoolDaysForTerm } from "@/lib/schoolCalendar";

// â”€â”€ Lookup a vault folder's Drive ID by partial name â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function getDriveFolderId(partialName) {
  const { data } = await supabase
    .from("vault_folders")
    .select("drive_folder_id")
    .ilike("name", `%${partialName}%`)
    .limit(1);
  return data?.[0]?.drive_folder_id || null;
}

// â”€â”€ Safe file name (strip chars that break Drive / OS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function safeName(name) {
  return name.replace(/[/\\?%*:|"<>]/g, "-").replace(/\s+/g, " ").trim();
}

// â”€â”€ Locale-independent currency formatter â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Uses "NGN" prefix instead of â‚¦ because jsPDF's built-in Helvetica font does
// not include the Naira sign (U+20A6) and renders it as a garbled character.
function naira(amount) {
  const n = Math.round(Number(amount) || 0);
  return "NGN " + n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function cleanPdfText(value) {
  if (Array.isArray(value)) return value.map(cleanPdfText);
  if (value === null || value === undefined || value === "") return "-";

  return String(value)
    .replace(/â€“|â€”|—|–/g, "-")
    .replace(/â€¦|…/g, "...")
    .replace(/âœ“|✓/g, "Done")
    .replace(/âœ—|✗/g, "X")
    .replace(/â†’|→/g, "->")
    .replace(/â‰¥|≥/g, ">=")
    .replace(/â‰ˆ|≈/g, "~")
    .replace(/âˆ’|−/g, "-")
    .replace(/â‚¦|₦/g, "NGN ")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// â”€â”€ Create a fresh jsPDF instance with the violet header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function createDoc(orientation = "portrait") {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const doc = new jsPDF({ orientation, unit: "mm", format: "a4" });
  const originalText = doc.text.bind(doc);
  doc.text = (text, ...args) => originalText(cleanPdfText(text), ...args);
  // Attach autoTable helper to doc so callers can use doc._tbl(opts)
  doc._tbl = (opts) => autoTable(doc, {
    ...opts,
    head: opts.head?.map((row) => row.map(cleanPdfText)),
    body: opts.body?.map((row) => row.map(cleanPdfText)),
  });
  return doc;
}

function addHeader(doc, title, subtitle = "", orientation = "portrait") {
  const pageW = orientation === "landscape" ? 297 : 210;
  doc.setFillColor(88, 28, 235);
  doc.rect(0, 0, pageW, 20, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(title, 14, 13);
  if (subtitle) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(subtitle, pageW - 14, 13, { align: "right" });
  }
  doc.setTextColor(0, 0, 0);
  return 27; // startY for first table
}

function docToBlob(doc) {
  return new Blob([doc.output("arraybuffer")], { type: "application/pdf" });
}

// â”€â”€ Per-run cache: folder id â†’ Map<lowerName, fileId> â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Stores file IDs so we can DELETE an old copy before re-uploading (overwrite).
const _existingFilesCache = {};

// When true, uploads create versioned files (<name>_YYYY-MM-DD_vN.pdf)
// instead of deleting and replacing the previous copy.
let _versionMode = false;

// Build the next versioned file name by scanning existing Drive files
// for the highest <base>_<date>_vN and returning N+1.
async function _versionedName(fileName, driveFolderId) {
  const ext  = fileName.includes(".") ? "." + fileName.split(".").pop() : "";
  const base = ext ? fileName.slice(0, -ext.length) : fileName;
  const date = new Date().toISOString().slice(0, 10);
  const prefix = (base + "_" + date + "_v").toLowerCase();
  const existing = await getExistingDriveFiles(driveFolderId);
  let max = 0;
  for (const name of existing.keys()) {
    if (name.startsWith(prefix)) {
      const n = parseInt(name.slice(prefix.length).replace(ext.toLowerCase(), ""), 10);
      if (!isNaN(n) && n > max) max = n;
    }
  }
  return base + "_" + date + "_v" + (max + 1) + ext;
}

async function getExistingDriveFiles(folderId) {
  if (!folderId) return new Map();
  if (_existingFilesCache[folderId]) return _existingFilesCache[folderId];
  try {
    const res = await listDriveFiles(folderId);
    const map = new Map(
      (res?.files || []).map((f) => [f.name.toLowerCase(), f.id])
    );
    _existingFilesCache[folderId] = map;
    return map;
  } catch {
    _existingFilesCache[folderId] = new Map();
    return _existingFilesCache[folderId];
  }
}

async function uploadDoc(doc, fileName, driveFolderId) {
  if (!driveFolderId) return;
  await _uploadWithOverwrite(docToBlob(doc), fileName, driveFolderId);
}

// Upload for pre-built Blobs (e.g. from html2canvas pipeline)
async function uploadBlob(blob, fileName, driveFolderId) {
  if (!driveFolderId) return;
  await _uploadWithOverwrite(blob, fileName, driveFolderId);
}

// Delete the old copy (if any) then upload fresh â€” prevents stale PDFs
async function _uploadWithOverwrite(blob, fileName, driveFolderId) {
  const { deleteDriveFile } = await import("./googleDriveService");
  const existing = await getExistingDriveFiles(driveFolderId);

  if (_versionMode) {
    const name = await _versionedName(fileName, driveFolderId);
    const up = await uploadToDrive({ name, blob, mimeType: "application/pdf", parentId: driveFolderId });
    if (up?.id) existing.set(name.toLowerCase(), up.id);
    return;
  }

  const key = fileName.toLowerCase();

  if (existing.has(key)) {
    try { await deleteDriveFile(existing.get(key)); } catch {}
    existing.delete(key);
  }

  const uploaded = await uploadToDrive({
    name: fileName,
    blob,
    mimeType: "application/pdf",
    parentId: driveFolderId,
  });
  // Track new file ID so a second call in the same run can overwrite it too
  if (uploaded?.id) existing.set(fileName.toLowerCase(), uploaded.id);
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// 1. EXAM QUESTIONS  (KaTeX â†’ html2canvas â†’ jsPDF so maths renders properly)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function exportExamQuestions(term, year, folderId) {
  // Bail early if Drive folder not configured - avoids silent no-ops
  if (!folderId) {
    console.warn("[VaultExport] Exam Questions folder not found in vault_folders - skipping");
    return 0;
  }

  const { data: quizzes } = await supabase
    .from("quizzes")
    .select("id, title, subject, grade, term, academic_year, test_type, duration_minutes")
    .eq("term", term)
    .eq("academic_year", year)
    .order("subject");

  if (!quizzes?.length) {
    console.warn(`[VaultExport] No quizzes found for term="${term}" year="${year}"`);
    return 0;
  }

  const { data: allQuestions } = await supabase
    .from("questions")
    .select("quiz_id, text, question_type, options, correct_option_index, marks, sort_order")
    .in("quiz_id", quizzes.map((q) => q.id))
    .order("sort_order")
    .limit(10000);

  const questionsByQuiz = {};
  (allQuestions || []).forEach((q) => {
    if (!questionsByQuiz[q.quiz_id]) questionsByQuiz[q.quiz_id] = [];
    questionsByQuiz[q.quiz_id].push(q);
  });

  const LABELS = ["A", "B", "C", "D", "E", "F"];
  // Keep LaTeX source readable by stripping the $...$ / $$...$$ delimiters.
  const stripMath = (s) => String(s ?? "").replace(/\$\$?/g, "").trim();

  // Group quizzes by subject + grade so each card (e.g. Maths JSS 2) produces a
  // single PDF with CA1 / CA2 / Exam as separate pages, not 3 separate files.
  const groups = {};
  for (const quiz of quizzes) {
    const key = `${quiz.subject || "Exam"}__${quiz.grade || ""}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(quiz);
  }

  // Order test types CA1 -> CA2 -> CA3 -> Exam; anything else in the middle.
  const TEST_ORDER = { "ca1": 1, "ca 1": 1, "ca2": 2, "ca 2": 2, "ca3": 3, "ca 3": 3, "exam": 9, "examination": 9 };
  const testRank = (t) => TEST_ORDER[String(t || "").toLowerCase().trim()] ?? 5;

  const buildBody = (questions) =>
    questions.map((q, i) => {
      const opts = Array.isArray(q.options)
        ? q.options
        : (() => { try { return JSON.parse(q.options); } catch { return []; } })();
      const optionsText =
        q.question_type === "essay"
          ? "(Essay)"
          : opts.length
          ? opts.map((o, idx) => `${LABELS[idx]}. ${stripMath(o)}`).join("   |   ")
          : "-";
      const answer =
        q.question_type !== "essay" && q.correct_option_index != null && opts.length
          ? LABELS[q.correct_option_index] || "-"
          : "-";
      return [
        String(i + 1),
        stripMath(q.text),
        optionsText,
        answer,
        q.marks != null ? String(q.marks) : "-",
      ];
    });

  let count = 0;

  for (const key of Object.keys(groups)) {
    // Wrap each card so one failure never blocks the rest
    try {
      const groupQuizzes = groups[key]
        .filter((q) => (questionsByQuiz[q.id] || []).length)
        .sort((a, b) => testRank(a.test_type) - testRank(b.test_type));
      if (!groupQuizzes.length) continue;

      const first = groupQuizzes[0];
      const doc = await createDoc("portrait");
      let firstPage = true;

      for (const quiz of groupQuizzes) {
        const questions = questionsByQuiz[quiz.id] || [];
        if (!questions.length) continue;

        if (!firstPage) doc.addPage();
        firstPage = false;

        const subtitle = [
          quiz.test_type || "Exam",
          term,
          year,
          quiz.duration_minutes ? `${quiz.duration_minutes} mins` : "",
        ].filter(Boolean).join("  |  ");
        const startY = addHeader(doc, `${quiz.subject || "Exam"} - ${quiz.grade || ""}`.trim(), subtitle, "portrait");

        doc._tbl({
          startY,
          head: [["#", "Question", "Options", "Ans", "Marks"]],
          body: buildBody(questions),
          styles: { fontSize: 8, cellPadding: 2, valign: "top", overflow: "linebreak" },
          headStyles: { fillColor: [88, 28, 235], textColor: 255 },
          alternateRowStyles: { fillColor: [245, 243, 255] },
          columnStyles: {
            0: { cellWidth: 10, halign: "center" },
            1: { cellWidth: 80 },
            2: { cellWidth: 62 },
            3: { cellWidth: 14, halign: "center", fontStyle: "bold", textColor: [22, 163, 74] },
            4: { cellWidth: 14, halign: "center" },
          },
        });
      }

      const fileName = safeName(`${first.subject} - ${first.grade} - ${term} - ${year}.pdf`);
      await uploadDoc(doc, fileName, folderId);
      count++;
    } catch (groupErr) {
      console.error(`[VaultExport] Failed to export quiz group "${key}":`, groupErr);
    }
  }
  return count;
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// 2. FINANCIAL REPORT  (one PDF per class, mirrors Payments page calculation)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function exportFinancialReport(term, year, folderId) {
  const [
    { data: students },
    { data: payments },
    { data: classFees },
    discounts,
    studentStartTerms,
    feeGroupRecords,
  ] = await Promise.all([
    supabase
      .from("students")
      .select("*")
      .eq("enrollment_status", "active")
      .order("grade, last_name")
      .limit(10000),
    // Fetch all payments for this term â€” includes carry-forward arrears rows
    supabase
      .from("payments")
      .select("*")
      .eq("term", term)
      .eq("academic_year", year)
      .limit(10000),
    supabase.from("class_fees").select("*").limit(500),
    loadPaymentDiscounts(),
    loadStudentStartTerms(),
    loadStudentFeeGroups(),
  ]);

  if (!students?.length) return 0;
  const studentsWithFeeGroups = applyStudentFeeGroups(students, feeGroupRecords);

  // Use the same balance calculator the Payments page uses
  const balanceRows = buildStudentBalanceRows({
    students: studentsWithFeeGroups,
    payments: payments || [],
    classFees: classFees || [],
    term,
    academicYear: year,
    grade: "all",
    discounts,
    startTermRecords: studentStartTerms,
  });

  // Group by class
  const byClass = {};
  balanceRows.forEach((r) => {
    const grade = r.student.grade || "Unknown";
    if (!byClass[grade]) byClass[grade] = [];
    byClass[grade].push(r);
  });

  let count = 0;
  for (const [grade, classRows] of Object.entries(byClass)) {
    // Sort alphabetically within class
    classRows.sort((a, b) =>
      `${a.student.last_name} ${a.student.first_name}`.localeCompare(
        `${b.student.last_name} ${b.student.first_name}`
      )
    );

    const doc = await createDoc("landscape");
    const startY = addHeader(doc, `Financial Report â€“ ${grade}`, `${term} | ${year}`, "landscape");

    const tableRows = classRows.map((r) => {
      const statusLabel =
        r.status === "Paid"    ? "PAID"    :
        r.status === "Partial" ? "PARTIAL" :
                                 "OUTSTANDING";
      return [
        r.student.reg_number || "â€”",
        `${r.student.first_name} ${r.student.last_name}`,
        r.discountPct > 0 ? `${r.discountPct}%` : "â€”",
        naira(r.totalFees),
        naira(r.totalPaid),
        naira(r.balance),
        statusLabel,
      ];
    });

    // Landscape A4 usable width â‰ˆ 277mm (297 âˆ’ 10mm margins each side)
    // Column widths sum to 277mm so the table fills the page exactly.
    // Money columns use halign:"right" which applies to BOTH header and data
    // so numbers sit directly under their column title.
    doc._tbl({
      startY,
      tableWidth: 277,
      head: [["Reg No", "Student Name", "Scholarship", "Term Fee", "Amount Paid", "Balance", "Status"]],
      body: tableRows,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [88, 28, 235], textColor: 255, halign: "center" },
      alternateRowStyles: { fillColor: [245, 243, 255] },
      columnStyles: {
        0: { cellWidth: 28, halign: "left"   }, // Reg No
        1: { cellWidth: 64, halign: "left"   }, // Student Name
        2: { cellWidth: 24, halign: "center" }, // Scholarship
        3: { cellWidth: 44, halign: "right"  }, // Term Fee
        4: { cellWidth: 44, halign: "right"  }, // Amount Paid
        5: { cellWidth: 40, halign: "right"  }, // Balance
        6: { cellWidth: 33, halign: "center" }, // Status
        // 28+64+24+44+44+40+33 = 277 âœ“
      },
      didParseCell: (data) => {
        // Right-align header cells for money columns too
        if (data.section === "head" && [3, 4, 5].includes(data.column.index)) {
          data.cell.styles.halign = "right";
        }
        if (data.column.index === 6 && data.section === "body") {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.textColor =
            data.cell.raw === "PAID"    ? [22, 163, 74]  :
            data.cell.raw === "PARTIAL" ? [202, 138, 4]  :
                                          [220, 38, 38];
        }
        if (data.column.index === 2 && data.section === "body" && data.cell.raw !== "â€”") {
          data.cell.styles.textColor = [88, 28, 235];
          data.cell.styles.fontStyle = "bold";
        }
      },
    });

    const fileName = safeName(`Financial Report - ${grade} - ${term} - ${year}.pdf`);
    await uploadDoc(doc, fileName, folderId);
    count++;
  }
  return count;
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// 3. GRADEBOOKS  (one PDF per class)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function exportGradebooks(term, year, folderId) {
  // Use a high explicit limit â€” Supabase defaults to 1000 rows when no limit
  // is set. 50 000 safely covers any school (500 students Ã— 20 subjects Ã— 5 classes).
  // Note: .order() must be called once per column; passing "col1, col2" as a
  // single string tries to sort by a column literally named "col1, col2" and fails.
  const [
    { data: entries, error: gradebookError },
    { data: activeStudents, error: studentsError },
    { data: subjects, error: subjectsError },
  ] = await Promise.all([
    supabase
      .from("gradebook_entries")
      .select("student_id, class, subject, ca_total, exam_score, total, cum_avg, grade_letter, remarks")
      .eq("term", term)
      .eq("academic_year", year)
      .order("class")
      .order("subject")
      .limit(50000),
    supabase
      .from("students")
      .select("id, first_name, last_name, reg_number, grade, enrollment_status")
      .eq("enrollment_status", "active")
      .limit(10000),
    supabase
      .from("subjects")
      .select("subject_name, grade_levels")
      .limit(10000),
  ]);

  if (gradebookError || studentsError || subjectsError) {
    console.error("[VaultExport] gradebook export fetch error:", {
      gradebookError,
      studentsError,
      subjectsError,
    });
    return 0;
  }

  const studentMap = {};
  (activeStudents || []).forEach((s) => { studentMap[s.id] = s; });

  const studentsByClass = {};
  (activeStudents || []).forEach((student) => {
    if (!student.grade) return;
    if (!studentsByClass[student.grade]) studentsByClass[student.grade] = [];
    studentsByClass[student.grade].push(student);
  });

  Object.values(studentsByClass).forEach((classStudents) => {
    classStudents.sort((a, b) =>
      `${a.last_name || ""} ${a.first_name || ""}`.localeCompare(`${b.last_name || ""} ${b.first_name || ""}`)
    );
  });

  const subjectsByClass = {};
  (subjects || []).forEach((subject) => {
    const name = subject.subject_name;
    if (!name) return;
    const grades = Array.isArray(subject.grade_levels) ? subject.grade_levels : [];
    grades.forEach((grade) => {
      if (!subjectsByClass[grade]) subjectsByClass[grade] = new Set();
      subjectsByClass[grade].add(name);
    });
  });

  // Group: class â†’ subject â†’ [entries]
  const byClass = {};
  (entries || []).forEach((e) => {
    if (!byClass[e.class]) byClass[e.class] = {};
    if (!byClass[e.class][e.subject]) byClass[e.class][e.subject] = [];
    byClass[e.class][e.subject].push(e);
  });

  const classes = [
    ...new Set([
      ...Object.keys(studentsByClass),
      ...Object.keys(subjectsByClass),
      ...Object.keys(byClass),
    ]),
  ].sort();

  let count = 0;

  for (const cls of classes) {
    const classStudents = studentsByClass[cls] || [];
    const subjectEntries = byClass[cls] || {};
    const subjectNames = [
      ...new Set([
        ...Array.from(subjectsByClass[cls] || []),
        ...Object.keys(subjectEntries),
      ]),
    ].sort();

    if (!classStudents.length || !subjectNames.length) continue;

    // One PDF per class â€” each subject gets its own page
    const doc = await createDoc("portrait");
    let firstPage = true;

    for (const subject of subjectNames) {
      const entriesByStudent = {};
      (subjectEntries[subject] || []).forEach((entry) => {
        entriesByStudent[entry.student_id] = entry;
      });

      if (!firstPage) doc.addPage();
      firstPage = false;

      const startY = addHeader(
        doc,
        `${subject} â€“ ${cls}`,
        `${term} | ${year}`,
        "portrait"
      );

      const rows = classStudents.map((s) => {
        const e = entriesByStudent[s.id] || {};
        return [
          s.reg_number || "â€”",
          `${s.first_name || ""} ${s.last_name || ""}`.trim(),
          e.ca_total    != null ? String(e.ca_total)    : "â€”",
          e.exam_score  != null ? String(e.exam_score)  : "â€”",
          e.total       != null ? String(e.total)       : "â€”",
          e.grade_letter || "â€”",
          e.remarks     || "â€”",
        ];
      });

      doc._tbl({
        startY,
        head: [["Reg No", "Student Name", "CA Score", "Exam Score", "Total", "Grade", "Remarks"]],
        body: rows,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [88, 28, 235], textColor: 255 },
        alternateRowStyles: { fillColor: [245, 243, 255] },
        columnStyles: {
          0: { cellWidth: 28 },
          1: { cellWidth: 60 },
          2: { cellWidth: 22, halign: "center" },
          3: { cellWidth: 25, halign: "center" },
          4: { cellWidth: 20, halign: "center" },
          5: { cellWidth: 18, halign: "center" },
          6: { cellWidth: "auto" },
        },
        didParseCell: (data) => {
          // Colour the Grade cell by value
          if (data.column.index === 5 && data.section === "body") {
            const g = String(data.cell.raw).trim().toUpperCase();
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.textColor =
              g === "A1" || g === "A"  ? [22, 163, 74]  :
              g === "F9" || g === "F"  ? [220, 38, 38]  :
                                         [88, 28, 235];
          }
        },
      });
    }

    const fileName = safeName(`${cls} Gradebook - ${term} - ${year}.pdf`);
    await uploadDoc(doc, fileName, folderId);
    count++;
  }
  return count;
}

// â”€â”€ Abbreviate a list of class names: ["JSS 1","JSS 2","JSS 3"] â†’ "JSS 1-3" â”€â”€
function abbreviateClasses(classes) {
  if (!classes || classes.length === 0) return "â€”";

  // Group by prefix (JSS, SSS, Primary, etc.)
  const groups = {};
  const others = [];
  classes.forEach((c) => {
    const m = String(c).trim().match(/^(JSS|SSS|Primary|KG|Nursery)\s*(\d+)$/i);
    if (m) {
      const prefix = m[1].toUpperCase();
      if (!groups[prefix]) groups[prefix] = new Set();
      groups[prefix].add(Number(m[2]));
    } else {
      others.push(c);
    }
  });

  const parts = Object.entries(groups).map(([prefix, numSet]) => {
    const sorted = [...numSet].sort((a, b) => a - b);
    if (sorted.length === 1) return `${prefix} ${sorted[0]}`;
    // Consecutive range?
    const consecutive = sorted.every((n, i) => i === 0 || n === sorted[i - 1] + 1);
    return consecutive
      ? `${prefix} ${sorted[0]}-${sorted[sorted.length - 1]}`
      : sorted.map((n) => `${prefix} ${n}`).join(", ");
  });

  return [...parts, ...others].join(", ") || "â€”";
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// 4. STAFF RECORDS  (all staff in one PDF)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function exportStaffRecords(term, year, folderId) {
  const [
    { data: teachers },
    { data: salaryConfigs },
    { data: subjectAssignments },
  ] = await Promise.all([
    supabase.from("teachers").select("*").order("last_name").limit(2000),
    supabase.from("payroll_salary_configs").select("*").limit(2000),
    // Get subjectâ†’grade assignments so we can show accurate subjects & classes per teacher
    supabase
      .from("class_assignments")
      .select("grade, subject, subject_teacher_id")
      .not("subject_teacher_id", "is", null)
      .limit(5000),
  ]);

  if (!teachers?.length) return 0;

  const salaryMap = {};
  (salaryConfigs || []).forEach((sc) => { salaryMap[sc.teacher_id] = sc; });

  // Build per-teacher subject & class lists from assignments
  const teacherSubjects = {};  // teacherId â†’ Set<subject>
  const teacherClasses  = {};  // teacherId â†’ Set<grade>
  (subjectAssignments || []).forEach((a) => {
    const tid = a.subject_teacher_id;
    if (!tid) return;
    if (!teacherSubjects[tid]) teacherSubjects[tid] = new Set();
    if (!teacherClasses[tid])  teacherClasses[tid]  = new Set();
    if (a.subject) teacherSubjects[tid].add(a.subject);
    if (a.grade)   teacherClasses[tid].add(a.grade);
  });

  const doc = await createDoc("landscape");
  const startY = addHeader(doc, "Staff Records", `${term} | ${year}`, "landscape");

  const rows = teachers.map((t) => {
    const sc = salaryMap[t.id] || {};

    // Subjects from assignments; fall back to subject_specialization if nothing assigned
    const assignedSubjects = teacherSubjects[t.id]
      ? [...teacherSubjects[t.id]].sort().join(", ")
      : (t.subject_specialization || "â€”");

    // Classes from assignments; fall back to classes_assigned field
    const assignedClasses = teacherClasses[t.id]
      ? abbreviateClasses([...teacherClasses[t.id]])
      : abbreviateClasses(t.classes_assigned || []);

    return [
      `${t.first_name} ${t.last_name}`,
      t.qualification || "â€”",
      assignedSubjects,
      assignedClasses,
      t.phone || "â€”",
      t.email || "â€”",
      sc.gross ? naira(sc.gross) : "â€”",
      sc.bank_name || "â€”",
      sc.account_number || "â€”",
    ];
  });

  doc._tbl({
    startY,
    head: [["Name", "Qualification", "Subject(s)", "Classes", "Phone", "Email", "Gross Salary", "Bank", "Acct No"]],
    body: rows,
    styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: [88, 28, 235], textColor: 255, fontSize: 7 },
    alternateRowStyles: { fillColor: [245, 243, 255] },
    // Landscape A4 usable width â‰ˆ 277 mm (297 âˆ’ 10mm left/right margins)
    // Total below = 277 mm
    columnStyles: {
      0: { cellWidth: 38 },                   // Name
      1: { cellWidth: 18 },                   // Qualification
      2: { cellWidth: 40 },                   // Subject(s)
      3: { cellWidth: 22 },                   // Classes
      4: { cellWidth: 24 },                   // Phone
      5: { cellWidth: 42 },                   // Email
      6: { cellWidth: 36, halign: "right" },  // Gross Salary  (NGN 1,000,000 needs room)
      7: { cellWidth: 30 },                   // Bank
      8: { cellWidth: 27 },                   // Acct No
    },
  });

  const fileName = safeName(`Staff Records - ${term} - ${year}.pdf`);
  await uploadDoc(doc, fileName, folderId);
  return 1;
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// 5. STUDENT REGISTRATION + ATTENDANCE  (one PDF, two pages)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function exportStudentRegistration(term, year, folderId) {
  const [{ data: students }, { data: attendance }, { data: calEvents }] = await Promise.all([
    supabase.from("students").select("*").order("grade, last_name").limit(10000),
    supabase
      .from("attendance")
      .select("student_id, status, attendance_date")
      .eq("term", term)
      .eq("academic_year", year)
      .limit(50000),
    supabase.from("school_calendar_events").select("*").limit(5000),
  ]);

  if (!students?.length) return 0;

  // Attendance: mirror the report-card logic (AcademicRecords.jsx).
  //  - total   = all school days in the term (from the school calendar)
  //  - present = school days elapsed so far MINUS absences/lates (students are
  //              assumed present unless explicitly marked absent or late)
  //  - absent  = absences + lates recorded on school days up to today
  const allDates        = listSchoolDaysForTerm(calEvents || [], term, year);
  const totalDays       = allDates.length;
  const today           = getLagosDateString();
  const datesUpToToday  = new Set(allDates.filter((d) => d <= today));
  const schoolDaysSoFar = datesUpToToday.size;

  const missMap = {}; // student_id -> { absent, late }
  (attendance || []).forEach((a) => {
    if (!a.attendance_date || !datesUpToToday.has(a.attendance_date)) return;
    if (!missMap[a.student_id]) missMap[a.student_id] = { absent: 0, late: 0 };
    if (a.status === "absent" || a.status === "Absent") missMap[a.student_id].absent++;
    else if (a.status === "late" || a.status === "Late") missMap[a.student_id].late++;
  });

  const doc = await createDoc("landscape");

  // â”€â”€ Page 1: Registration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  let startY = addHeader(doc, "Student Registration Record", `${term} | ${year}`, "landscape");

  doc._tbl({
    startY,
    head: [["Reg No", "Name", "Class", "Gender", "Status", "Parent/Guardian", "Parent Phone", "Address", "Enrolled"]],
    body: students.map((s) => [
      s.reg_number || "â€”",
      `${s.first_name} ${s.last_name}`,
      s.grade || "â€”",
      s.gender || "â€”",
      s.enrollment_status || "â€”",
      s.parent_name || "â€”",
      s.parent_phone || "â€”",
      s.address ? s.address.substring(0, 30) : "â€”",
      s.enrollment_date ? formatDateInLagos(s.enrollment_date, {}, "en-GB") : "â€”",
    ]),
    styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: [88, 28, 235], textColor: 255, fontSize: 7 },
    alternateRowStyles: { fillColor: [245, 243, 255] },
  });

  // â”€â”€ Page 2: Attendance â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  doc.addPage();
  startY = addHeader(doc, "Attendance Report", `${term} | ${year}`, "landscape");

  doc._tbl({
    startY,
    head: [["Reg No", "Name", "Class", "Total Days", "Present", "Absent", "Attendance %"]],
    body: students.map((s) => {
      const miss    = missMap[s.id] || { absent: 0, late: 0 };
      const present = Math.max(0, schoolDaysSoFar - miss.absent - miss.late);
      const absent  = miss.absent + miss.late;
      const pct     = totalDays > 0 ? `${Math.round((present / totalDays) * 100)}%` : "-";
      return [
        s.reg_number || "-",
        `${s.first_name} ${s.last_name}`,
        s.grade || "-",
        totalDays > 0 ? totalDays : "-",
        totalDays > 0 ? present : "-",
        totalDays > 0 ? absent : "-",
        pct,
      ];
    }),
    styles: { fontSize: 7.5, cellPadding: 2 },
    headStyles: { fillColor: [88, 28, 235], textColor: 255 },
    alternateRowStyles: { fillColor: [245, 243, 255] },
  });

  const fileName = safeName(`Student Registration - ${term} - ${year}.pdf`);
  await uploadDoc(doc, fileName, folderId);
  return 1;
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// MAIN ORCHESTRATOR
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
/**
 * Run all vault exports for a completed term.
 * @param {string} term  e.g. "First Term"
 * @param {string} year  e.g. "2025/2026"
 * @param {(msg: string) => void} onProgress  optional progress callback
 * @returns {object}  counts / errors per category
 */
export async function runTermVaultExport(term, year, onProgress = () => {}) {
  if (!isDriveConnected()) {
    onProgress("Drive not connected - Vault export skipped");
    return { skipped: true };
  }

  // Clear the per-run cache so this run sees fresh Drive file lists
  Object.keys(_existingFilesCache).forEach((k) => delete _existingFilesCache[k]);

  // Resolve folder IDs once
  const [examId, financialId, reportCardsId, staffId, registrationId] =
    await Promise.all([
      getDriveFolderId("Exam"),
      getDriveFolderId("Financial"),
      getDriveFolderId("Report Card"),
      getDriveFolderId("Staff"),
      getDriveFolderId("Registration"),
    ]);

  const results = {};

  const run = async (label, fn, folderId) => {
    try {
      onProgress(`Saving ${label} to Vault...`);
      results[label] = await fn(term, year, folderId);
    } catch (e) {
      console.error(`Vault export error [${label}]:`, e);
      results[`${label}_error`] = e.message;
    }
  };

  await run("Exam Questions", exportExamQuestions, examId);
  await run("Financial Report", exportFinancialReport, financialId);
  await run("Gradebooks", exportGradebooks, reportCardsId);
  await run("Staff Records", exportStaffRecords, staffId);
  await run("Student Registration", exportStudentRegistration, registrationId);

  onProgress("Vault export complete");
  return results;
}

/**
 * Save a single module's records to the Vault for the given term/year.
 * @param {"financial"|"gradebooks"|"exams"|"staff"|"students"} module
 */
export async function saveModuleToVault(module, term, year, onProgress = () => {}) {
  if (!isDriveConnected()) throw new Error("Google Drive is not connected. Go to Settings → General → School Info to connect.");

  Object.keys(_existingFilesCache).forEach((k) => delete _existingFilesCache[k]);

  const moduleMap = {
    financial:  { fn: exportFinancialReport,      folder: "Financial"     },
    gradebooks: { fn: exportGradebooks,           folder: "Report Card"   },
    exams:      { fn: exportExamQuestions,        folder: "Exam"          },
    staff:      { fn: exportStaffRecords,         folder: "Staff"         },
    students:   { fn: exportStudentRegistration,  folder: "Registration"  },
  };

  const entry = moduleMap[module];
  if (!entry) throw new Error(`Unknown module: ${module}`);

  const folderId = await getDriveFolderId(entry.folder);
  onProgress(`Saving to Vault...`);
  _versionMode = true;
  try {
    const result = await entry.fn(term, year, folderId);
    onProgress("Done");
    return result;
  } finally {
    _versionMode = false;
  }
}


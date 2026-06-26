import { formatDateInLagos } from "@/lib/timezone";
import { BRAND } from "@/config/brand";

/**
 * printReportCard — opens a printable A4 report card in a new window.
 */

const NEXT_CLASS = {
  "KG 1": "KG 2", "KG 2": "Nursery 1", "Nursery 1": "Nursery 2",
  "Nursery 2": "Primary 1", "Primary 1": "Primary 2", "Primary 2": "Primary 3",
  "Primary 3": "Primary 4", "Primary 4": "JSS 1",
  "JSS 1": "JSS 2", "JSS 2": "JSS 3", "JSS 3": "SSS 1",
  "SSS 1": "SSS 2", "SSS 2": "SSS 3", "SSS 3": "Graduated",
};

function generateTeacherComment(firstName, avg, sorted) {
  const withScores = sorted.filter(r => Number(r.total_score) > 0);
  if (withScores.length === 0) return "";
  const best  = [...withScores].sort((a, b) => Number(b.total_score) - Number(a.total_score))[0];
  const worst = [...withScores].sort((a, b) => Number(a.total_score) - Number(b.total_score))[0];
  const n = Number(avg);
  const perf = n >= 75 ? "an outstanding" : n >= 60 ? "a commendable" : n >= 50 ? "a satisfactory" : "a below-average";
  const encourage = n >= 75
    ? "Keep up the excellent work."
    : `More effort should be channelled into ${worst.subject_name} next term.`;
  return `${firstName} had ${perf} performance this term with an average of ${avg}%. ` +
    `${firstName} showed strength in ${best.subject_name}. ${encourage}`;
}

function generatePrincipalComment(firstName, avg) {
  const n = Number(avg);
  const verdict = n >= 75 ? "excellent academic performance"
    : n >= 60 ? "good academic performance"
    : n >= 50 ? "satisfactory academic performance"
    : "below-average academic performance";
  const charge = n >= 60
    ? "We encourage continued dedication and hard work."
    : "We urge greater commitment to studies in the coming term.";
  return `${firstName} demonstrated ${verdict} this term. ${charge}`;
}

export function printReportCard({
  student,
  results = [],
  term = "",
  academicYear = "",
  schoolName = BRAND.schoolName.toUpperCase(),
  attendance = null,   // { present: number, total: number }
  schoolLogoUrl = "",
  principalSignatureUrl = "",
  schoolStampUrl = "",
}) {
  const firstName = student?.first_name || "";
  const fullName  = `${firstName} ${student?.last_name || ""}`.trim();
  const grade     = student?.grade || "";
  const isThirdTerm = term === "Third Term";
  const nextClass   = NEXT_CLASS[grade] || "";
  const today       = formatDateInLagos(new Date(), { day: "2-digit", month: "long", year: "numeric" }, "en-GB");

  const sorted      = [...results].sort((a, b) => a.subject_name.localeCompare(b.subject_name));
  const totalScore  = Math.ceil(sorted.reduce((sum, r) => sum + (Number(r.total_score) || 0), 0));
  const avg         = sorted.length > 0 ? Math.ceil(totalScore / sorted.length) : 0;
  const subjectCount = sorted.length;

  const gradeRemark = (n) => {
    if (isNaN(n) || n === 0) return { label: "—", color: "#64748b" };
    if (n >= 75) return { label: "Distinction", color: "#16a34a" };
    if (n >= 60) return { label: "Credit",      color: "#2563eb" };
    if (n >= 50) return { label: "Pass",        color: "#d97706" };
    return              { label: "Below Average", color: "#dc2626" };
  };

  const { color: remarkColor } = gradeRemark(avg);

  const gradeColor = (g) => {
    if (!g) return "#64748b";
    const u = String(g).toUpperCase();
    if (u.startsWith("A")) return "#16a34a";
    if (u.startsWith("B")) return "#2563eb";
    if (u.startsWith("C")) return "#d97706";
    if (u.startsWith("D")) return "#ea580c";
    return "#dc2626";
  };

  const R = (v) => (v != null && v !== "" && Number(v) !== 0) ? Math.ceil(Number(v)) : "—";
  const RZ = (v) => (v != null && v !== "") ? Math.ceil(Number(v)) : "—"; // show 0

  const teacherComment   = "";
  const principalComment = "";

  const rows = sorted.map(r => `
    <tr>
      <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;font-size:13px;">${r.subject_name}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:13px;">${R(r.ca1_score)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:13px;">${R(r.ca2_score)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:13px;">${R(r.ca3_score)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:13px;color:#2563eb;font-weight:600;">${RZ(r.continuous_assessment ?? r.ca_score)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:13px;">${RZ(r.exam_score)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;text-align:center;font-weight:bold;font-size:13px;color:#16a34a;">${RZ(r.total_score)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:13px;color:#7c3aed;">${r.lt_cum > 0 ? R(r.lt_cum) : "—"}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:13px;color:#0369a1;">${r.cumulative_average > 0 ? R(r.cumulative_average) : "—"}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;text-align:center;">
        <span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:bold;color:${gradeColor(r.grade)};background:${gradeColor(r.grade)}18;">${r.grade || "—"}</span>
      </td>
      <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#64748b;">${r.remarks || r.remark || "—"}</td>
    </tr>
  `).join("");

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>Report Card — ${fullName}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body {
      font-family: Georgia, 'Times New Roman', serif;
      font-size: 13px;
      color: #1e293b;
      background: #fff;
      padding: 32px 40px;
    }
    @media print {
      body { padding: 16px 24px; }
      @page { margin: 12mm 16mm; size: A4; }
      button { display: none !important; }
    }
    .school-header {
      text-align: center;
      border-bottom: 3px double #1e3a8a;
      padding-bottom: 14px;
      margin-bottom: 18px;
    }
    .school-name {
      font-size: 22px; font-weight: bold; letter-spacing: 1px;
      color: #1e3a8a; text-transform: uppercase;
    }
    .report-title {
      font-size: 16px; font-weight: bold; letter-spacing: 3px;
      text-transform: uppercase; color: #475569; margin-top: 4px;
    }
    .info-grid {
      display: grid; grid-template-columns: 1fr 1fr;
      gap: 8px 24px; background: #f8fafc;
      border: 1px solid #e2e8f0; border-radius: 8px;
      padding: 14px 18px; margin-bottom: 20px;
    }
    .info-row { display: flex; gap: 8px; }
    .info-label { font-weight: bold; min-width: 110px; color: #475569; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
    .info-value { color: #1e293b; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    thead tr { background: #1e3a8a; color: #fff; }
    thead th { padding: 9px 10px; text-align: left; font-size: 12px; font-weight: bold; letter-spacing: 0.5px; text-transform: uppercase; }
    thead th:not(:first-child) { text-align: center; }
    tbody tr:nth-child(even) { background: #f8fafc; }
    .summary-box { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
    .summary-item { flex: 1; min-width: 100px; text-align: center; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 8px; }
    .summary-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; margin-bottom: 4px; }
    .summary-value { font-size: 20px; font-weight: bold; color: #1e3a8a; }
    .comment-section { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; margin-bottom: 12px; }
    .comment-title { font-size: 12px; font-weight: bold; text-transform: uppercase; color: #64748b; margin-bottom: 6px; }
    .comment-text {
      font-size: 13px; color: #334155; line-height: 1.75; white-space: pre-wrap;
      min-height: 108px; padding: 4px 0 18px;
      background-image: repeating-linear-gradient(to bottom, transparent 0, transparent 27px, #e2e8f0 27px, #e2e8f0 28px);
      background-position: left top;
      background-size: 100% 28px;
      outline: none;
      cursor: text;
    }
    @media screen {
      .comment-text:empty::before {
        content: attr(data-placeholder);
        color: #94a3b8;
        font-style: italic;
      }
    }
    @media print {
      .comment-text:empty::before {
        content: "";
      }
    }
    .promotion-banner {
      background: #dcfce7; border: 2px solid #16a34a; border-radius: 10px;
      padding: 14px 20px; margin-bottom: 16px; text-align: center;
    }
    .promotion-text { font-size: 16px; font-weight: bold; color: #15803d; letter-spacing: 1px; text-transform: uppercase; }
    .promotion-sub { font-size: 13px; color: #166534; margin-top: 4px; }
    .signature-row { display: flex; gap: 34px; margin-top: 20px; align-items: flex-end; }
    .sig-block { flex: 1; text-align: center; font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
    .sig-art {
      min-height: 86px; display: flex; align-items: flex-end; justify-content: center;
      margin-bottom: 6px;
    }
    /* Stamp variant: overlap the signature line below so the stamp visually
       sits on the line like a rubber-stamp impression, instead of floating
       above it. */
    .sig-art.stamp { margin-bottom: -30px; position: relative; z-index: 1; pointer-events: none; }
    .sig-line { border-top: 1px solid #94a3b8; margin: 0 auto 6px; }
    .sig-line.date { max-width: 180px; }
    .sig-line.signature { max-width: 190px; }
    .sig-line.stamp { max-width: 220px; position: relative; z-index: 0; }
    .sig-value { font-size: 12px; color: #1e293b; font-weight: bold; margin-bottom: 4px; }
    .print-btn { position: fixed; top: 16px; right: 16px; background: #1e3a8a; color: white; border: none; border-radius: 8px; padding: 10px 20px; font-size: 14px; cursor: pointer; font-family: sans-serif; }
    .print-btn:hover { background: #1e40af; }
  </style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">🖨 Print</button>

  <div class="school-header">
    ${schoolLogoUrl ? `<img src="${schoolLogoUrl}" style="height:70px;object-fit:contain;margin-bottom:8px;" alt="School Logo"/>` : ""}
    <div class="school-name">${schoolName}</div>
    <div class="report-title">Student Report Card</div>
  </div>

  <div class="info-grid">
    <div class="info-row">
      <span class="info-label">Student Name</span>
      <span class="info-value">${fullName}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Class</span>
      <span class="info-value">${grade}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Term</span>
      <span class="info-value">${term}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Academic Year</span>
      <span class="info-value">${academicYear}</span>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:22%;text-align:left;">Subject</th>
        <th style="width:6%;text-align:center;">CA 1<br><span style="font-weight:normal;font-size:10px;">/10</span></th>
        <th style="width:6%;text-align:center;">CA 2<br><span style="font-weight:normal;font-size:10px;">/10</span></th>
        <th style="width:6%;text-align:center;">CA 3<br><span style="font-weight:normal;font-size:10px;">/10</span></th>
        <th style="width:7%;text-align:center;">CA Total<br><span style="font-weight:normal;font-size:10px;">/30</span></th>
        <th style="width:6%;text-align:center;">Exam<br><span style="font-weight:normal;font-size:10px;">/70</span></th>
        <th style="width:6%;text-align:center;">Total<br><span style="font-weight:normal;font-size:10px;">/100</span></th>
        <th style="width:7%;text-align:center;">L.T. CUM<br><span style="font-weight:normal;font-size:10px;">/100</span></th>
        <th style="width:7%;text-align:center;">Cum Avg<br><span style="font-weight:normal;font-size:10px;">/100</span></th>
        <th style="width:7%;text-align:center;">Grade</th>
        <th style="text-align:left;">Remark</th>
      </tr>
    </thead>
    <tbody>
      ${rows || '<tr><td colspan="11" style="text-align:center;padding:20px;color:#94a3b8;">No results available for this term</td></tr>'}
    </tbody>
  </table>

  <div class="summary-box">
    <div class="summary-item">
      <div class="summary-label">Subjects Offered</div>
      <div class="summary-value">${subjectCount}</div>
    </div>
    <div class="summary-item">
      <div class="summary-label">Total Score</div>
      <div class="summary-value">${subjectCount > 0 ? totalScore : "—"}</div>
    </div>
    <div class="summary-item">
      <div class="summary-label">Average Score</div>
      <div class="summary-value" style="color:${remarkColor}">${avg}%</div>
    </div>
    <div class="summary-item">
      <div class="summary-label">Attendance Score</div>
      <div class="summary-value" style="font-size:15px;color:#1e3a8a;">${attendance ? `${attendance.present}/${attendance.total}` : "â€”"}</div>
      <div style="font-size:11px;color:#64748b;margin-top:2px;">Days attended / school-open days</div>
    </div>
  </div>

  ${isThirdTerm && nextClass ? `
  <div class="promotion-banner">
    <div class="promotion-text">🎉 Promoted to the Next Class</div>
    <div class="promotion-sub">${fullName} has been promoted to <strong>${nextClass}</strong> for the ${academicYear.split('/')[1] || ""} / ${String(Number((academicYear.split('/')[1] || 0)) + 1)} Academic Year.</div>
  </div>` : ""}

  <div class="comment-section">
    <div class="comment-title">Class Teacher's Comment</div>
    <div class="comment-text" contenteditable="true" data-placeholder="Click here to type the class teacher's comment, or leave this space blank and write by hand after printing.">${teacherComment}</div>
  </div>

  <div class="comment-section">
    <div class="comment-title">Principal's Comment</div>
    <div class="comment-text" contenteditable="true" data-placeholder="Click here to type the principal's comment, or leave this space blank and write by hand after printing.">${principalComment}</div>
  </div>

  <div class="signature-row">
    <div class="sig-block">
      <div class="sig-line date"></div>
      <div class="sig-value">${today}</div>
      Date
    </div>
    <div class="sig-block">
      <div class="sig-art">
        ${principalSignatureUrl ? `<img src="${principalSignatureUrl}" style="height:54px;object-fit:contain;" alt="Signature"/>` : `<div style="height:54px;"></div>`}
      </div>
      <div class="sig-line signature"></div>
      Principal's Signature
    </div>
    <div class="sig-block">
      <div class="sig-art stamp">
        ${schoolStampUrl ? `<img src="${schoolStampUrl}" style="height:140px;object-fit:contain;" alt="Stamp"/>` : `<div style="height:140px;"></div>`}
      </div>
      <div class="sig-line stamp"></div>
      School Stamp
    </div>
  </div>
</body>
</html>`;

  const win = window.open("", "_blank", "width=860,height=1150,toolbar=0,menubar=0");
  if (!win) {
    alert("Pop-up blocked! Please allow pop-ups to print report cards.");
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
}

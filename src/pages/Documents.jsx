/**
 * Documents.jsx
 * Generates: Student ID Card, Staff ID Card, Certificates (4 types),
 * Admission Letter, Transfer Letter, Attestation Letter,
 * Clearance Certificate, Student Transcript, Scholarship Notification Letter
 */
import React, { useState, useEffect } from "react";
import { BRAND } from "@/config/brand";
import { usePersistentState } from "@/hooks/usePersistentState";
import { Teacher, Subject } from "@/entities/all";
import { supabase } from "@/api/supabaseClient";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import { getStudentFeeSnapshot } from "@/lib/classFeeUtils";
import { applyStudentFeeGroups, getPaymentDiscountPct, loadPaymentDiscounts, loadStudentFeeGroups } from "@/lib/paymentBalances";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  GraduationCap, Printer, CreditCard, Award, Search, User,
  FileText, Users, BookOpen, ClipboardCheck, BadgeCheck, ArrowLeftRight, Loader2, Cloud, Check,
} from "lucide-react";
import {
  isDriveConnected, requestDriveToken, uploadToDrive, elementToPdfBlob, createDriveFolder,
} from "@/lib/googleDriveService";
import { getVaultDriveConfig } from "@/lib/vaultConfig";
import { formatDateInLagos, getLagosYear } from "@/lib/timezone";

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────
const PURPLE  = "#6b21a8";
const LIGHT_P = "#f5f0ff";
const TERM_ORDER = ["First Term", "Second Term", "Third Term"];

function IDRow({ label, value }) {
  return (
    <div style={{ display: "flex", gap: 4, marginBottom: 3 }}>
      <span style={{ fontSize: 9, color: "#64748b", minWidth: 38 }}>{label}:</span>
      <span style={{ fontSize: 10, fontWeight: 600, color: "#334155" }}>{value}</span>
    </div>
  );
}

// Shared letter-head used by all A4 letters
function LetterHead({ schoolName, schoolAddress, schoolPhone, schoolEmail, schoolLogoUrl, title }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, paddingBottom: 12, borderBottom: `3px solid ${PURPLE}` }}>
        <div style={{ width: 68, height: 68, borderRadius: "50%", border: `2px solid ${PURPLE}`, overflow: "hidden", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: LIGHT_P }}>
          {schoolLogoUrl
            ? <img src={schoolLogoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : <GraduationCap size={28} color={PURPLE} />}
        </div>
        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ fontSize: 17, fontWeight: 900, color: PURPLE, letterSpacing: 1, textTransform: "uppercase" }}>
            {schoolName || BRAND.schoolName}
          </div>
          {schoolAddress && <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>{schoolAddress}</div>}
          {(schoolPhone || schoolEmail) && (
            <div style={{ fontSize: 10, color: "#64748b", marginTop: 1 }}>
              {schoolPhone && `Tel: ${schoolPhone}`}{schoolPhone && schoolEmail && "  |  "}{schoolEmail && `Email: ${schoolEmail}`}
            </div>
          )}
        </div>
      </div>
      {title && (
        <div style={{ textAlign: "center", marginTop: 14 }}>
          <div style={{ display: "inline-block", background: PURPLE, color: "white", padding: "4px 32px", fontSize: 13, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase" }}>
            {title}
          </div>
        </div>
      )}
    </div>
  );
}

function SignatureBlock({ principalName, schoolStampUrl, date }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 32 }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ borderTop: `1px solid ${PURPLE}`, paddingTop: 4, minWidth: 120 }}>
          <div style={{ fontSize: 11 }}>{date}</div>
        </div>
        <div style={{ fontSize: 10, color: "#64748b", marginTop: 2, fontStyle: "italic" }}>Date</div>
      </div>
      <div style={{ textAlign: "center", position: "relative" }}>
        {/* Negative margin pulls the signature line up under the lower third of
            the stamp so it reads like a real rubber-stamp pressed onto the page,
            not a floating logo above the signature. */}
        <div style={{ width: 170, height: 170, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto -25px", overflow: "hidden", opacity: schoolStampUrl ? 1 : 0.5, position: "relative", zIndex: 1, pointerEvents: "none" }}>
          {schoolStampUrl
            ? <img src={schoolStampUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            : <span style={{ fontSize: 11, color: PURPLE, fontWeight: 700, textAlign: "center" }}>OFFICIAL{"\n"}STAMP</span>}
        </div>
        <div style={{ borderTop: `1px solid ${PURPLE}`, paddingTop: 3, minWidth: 170, position: "relative", zIndex: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1 }}>{principalName ? principalName.toUpperCase() : "PRINCIPAL"}</div>
        </div>
        <div style={{ fontSize: 10, color: "#64748b", fontStyle: "italic" }}>Principal / Head Teacher</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Student ID Card
// ─────────────────────────────────────────────────────────────────────────────
function IDCard({ student, year, schoolName, schoolLogoUrl }) {
  return (
    <div id="id-card-front" style={{ width: 324, height: 204, borderRadius: 12, overflow: "hidden", boxShadow: "0 4px 20px rgba(0,0,0,0.18)", fontFamily: "sans-serif", background: "white", border: "1px solid #e2e8f0", flexShrink: 0, display: "flex", flexDirection: "column" }}>
      {/* Header — fixed */}
      <div style={{ background: "linear-gradient(135deg,#4f46e5,#7c3aed)", padding: "8px 12px", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <div style={{ width: 26, height: 26, background: "rgba(255,255,255,0.2)", borderRadius: 6, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {schoolLogoUrl ? <img src={schoolLogoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <GraduationCap size={14} color="white" />}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ color: "white", fontWeight: 800, fontSize: 11, letterSpacing: 0.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{(schoolName || BRAND.schoolName).toUpperCase()}</div>
          <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 8.5 }}>Student ID Card</div>
        </div>
        <div style={{ marginLeft: "auto", color: "rgba(255,255,255,0.7)", fontSize: 8.5, flexShrink: 0 }}>{year}</div>
      </div>
      {/* Body — grows to fill remaining space */}
      <div style={{ display: "flex", gap: 12, padding: "10px 12px", alignItems: "flex-start", flex: 1, overflow: "hidden" }}>
        <div style={{ width: 62, height: 74, borderRadius: 7, overflow: "hidden", border: "2px solid #e2e8f0", flexShrink: 0, background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {student.photo_url ? <img src={student.photo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <User size={28} color="#94a3b8" />}
        </div>
        <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
          {/* Name clamped to 2 lines max */}
          <div style={{ fontWeight: 800, fontSize: 12, color: "#1e293b", lineHeight: 1.25, marginBottom: 5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {student.first_name} {student.last_name}
          </div>
          <IDRow label="Class"  value={student.grade} />
          <IDRow label="Reg No" value={student.reg_number || student.id?.slice(0, 8).toUpperCase()} />
          <IDRow label="Status" value={student.enrollment_status || "Active"} />
          {student.date_of_birth && <IDRow label="DOB" value={student.date_of_birth} />}
        </div>
      </div>
      {/* Footer — always pinned at bottom */}
      <div style={{ borderTop: "1px dashed #e2e8f0", padding: "5px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <div style={{ fontSize: 7.5, color: "#94a3b8" }}>If found, please return to the school.</div>
        <div style={{ width: 38, height: 13, background: "repeating-linear-gradient(90deg,#1e293b 0,#1e293b 2px,transparent 0,transparent 4px)" }} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Staff ID Card
// ─────────────────────────────────────────────────────────────────────────────
function StaffIDCard({ teacher, year, schoolName, schoolLogoUrl }) {
  return (
    <div id="staff-id-card" style={{ width: 324, height: 204, borderRadius: 12, overflow: "hidden", boxShadow: "0 4px 20px rgba(0,0,0,0.18)", fontFamily: "sans-serif", background: "white", border: "1px solid #e2e8f0", flexShrink: 0, display: "flex", flexDirection: "column" }}>
      {/* Header — fixed */}
      <div style={{ background: "linear-gradient(135deg,#0f766e,#0d9488)", padding: "8px 12px", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <div style={{ width: 26, height: 26, background: "rgba(255,255,255,0.2)", borderRadius: 6, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {schoolLogoUrl ? <img src={schoolLogoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <GraduationCap size={14} color="white" />}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ color: "white", fontWeight: 800, fontSize: 11, letterSpacing: 0.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{(schoolName || BRAND.schoolName).toUpperCase()}</div>
          <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 8.5 }}>Staff ID Card</div>
        </div>
        <div style={{ marginLeft: "auto", color: "rgba(255,255,255,0.7)", fontSize: 8.5, flexShrink: 0 }}>{year}</div>
      </div>
      {/* Body — grows to fill remaining space */}
      <div style={{ display: "flex", gap: 12, padding: "10px 12px", alignItems: "flex-start", flex: 1, overflow: "hidden" }}>
        <div style={{ width: 62, height: 74, borderRadius: 7, overflow: "hidden", border: "2px solid #e2e8f0", flexShrink: 0, background: "#f0fdf4", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {teacher.photo_url ? <img src={teacher.photo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <User size={28} color="#94a3b8" />}
        </div>
        <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
          {/* Name clamped to 2 lines max */}
          <div style={{ fontWeight: 800, fontSize: 12, color: "#1e293b", lineHeight: 1.25, marginBottom: 5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {teacher.first_name} {teacher.last_name}
          </div>
          <IDRow label="Role"    value="Teaching Staff" />
          <IDRow label="Subject" value={teacher.subject_specialization || "—"} />
          <IDRow label="ID"      value={teacher.employee_id || teacher.id?.slice(0, 8).toUpperCase()} />
          {teacher.qualification && <IDRow label="Qual." value={teacher.qualification} />}
        </div>
      </div>
      {/* Footer — always pinned at bottom */}
      <div style={{ borderTop: "1px dashed #e2e8f0", padding: "5px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <div style={{ fontSize: 7.5, color: "#94a3b8" }}>If found, please return to the school.</div>
        <div style={{ width: 38, height: 13, background: "repeating-linear-gradient(90deg,#0f766e 0,#0f766e 2px,transparent 0,transparent 4px)" }} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Certificate (School Leaving)
// ─────────────────────────────────────────────────────────────────────────────
function Certificate({ student, certType, date, year, subjects, conduct, officeHeld, extraCurricular, schoolName, schoolAddress, schoolLogoUrl, schoolStampUrl, principalName }) {
  const col1 = subjects.slice(0, 6);
  const col2 = subjects.slice(6, 12);
  const rows = Array.from({ length: 6 }, (_, i) => ({ left: col1[i] || "", right: col2[i] || "" }));

  const SubjectLine = ({ num, value }) => (
    <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 6 }}>
      <span style={{ fontSize: 11, fontWeight: 700, minWidth: 18 }}>{num}.</span>
      <div style={{ flex: 1, borderBottom: `1px solid ${PURPLE}`, paddingBottom: 1, minWidth: 120 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }}>{value}</span>
      </div>
    </div>
  );
  const FieldLine = ({ label, value }) => (
    <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 10 }}>
      <span style={{ fontSize: 12, fontStyle: "italic", whiteSpace: "nowrap" }}>{label}:</span>
      <div style={{ flex: 1, borderBottom: `1px solid ${PURPLE}`, paddingBottom: 1 }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.5 }}>{value.toUpperCase()}</span>
      </div>
    </div>
  );

  return (
    <div id="certificate" style={{ width: 620, background: "white", fontFamily: "Georgia, serif", boxSizing: "border-box", border: `6px solid ${PURPLE}`, outline: `2px solid ${PURPLE}`, outlineOffset: "-10px", position: "relative", padding: "24px 32px 20px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 10 }}>
        <div style={{ width: 72, height: 72, borderRadius: "50%", border: `3px solid ${PURPLE}`, flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: LIGHT_P }}>
          {schoolLogoUrl ? <img src={schoolLogoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <GraduationCap size={28} color={PURPLE} />}
        </div>
        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: PURPLE, letterSpacing: 1, lineHeight: 1.2, textTransform: "uppercase" }}>{schoolName || BRAND.schoolName}</div>
          {schoolAddress && <div style={{ fontSize: 11, color: "#334155", marginTop: 3 }}>{schoolAddress}</div>}
          <div style={{ display: "inline-block", margin: "8px auto 0", background: PURPLE, color: "white", padding: "3px 28px", fontSize: 13, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase" }}>{certType}</div>
        </div>
        <div style={{ width: 72, height: 86, border: `2px solid ${PURPLE}`, flexShrink: 0, background: "#f8f5ff", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {student.photo_url ? <img src={student.photo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <User size={32} color="#94a3b8" />}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>YEAR</span>
        <div style={{ borderBottom: `1px solid ${PURPLE}`, minWidth: 80, paddingBottom: 1 }}><span style={{ fontSize: 13, fontWeight: 700 }}>{year}</span></div>
      </div>
      <div style={{ fontSize: 16, fontStyle: "italic", textAlign: "center", marginBottom: 6, color: "#1e1b4b" }}>This is to certify that</div>
      <div style={{ textAlign: "center", marginBottom: 8 }}>
        <div style={{ display: "inline-block", borderBottom: `2px solid ${PURPLE}`, paddingBottom: 2, minWidth: 340 }}>
          <span style={{ fontSize: 16, fontWeight: 900, letterSpacing: 1.5, textTransform: "uppercase" }}>{student.last_name}&nbsp;&nbsp;{student.first_name}&nbsp;&nbsp;{student.middle_name || ""}</span>
        </div>
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.7, textAlign: "justify", marginBottom: 12, fontStyle: "italic" }}>
        Has completed the required course of study in the above named school and sat for the School Certificate Examination in the following Subjects:
      </div>
      <div style={{ display: "flex", gap: 32, marginBottom: 14 }}>
        <div style={{ flex: 1 }}>{rows.map((r, i) => <SubjectLine key={i} num={i + 1} value={r.left} />)}</div>
        <div style={{ flex: 1 }}>{rows.map((r, i) => <SubjectLine key={i} num={i + 7} value={r.right} />)}</div>
      </div>
      <FieldLine label="Conduct" value={conduct || "Satisfactory"} />
      <FieldLine label="Office held" value={officeHeld || ""} />
      <FieldLine label="Extra Curricular Activities" value={extraCurricular || ""} />
      <SignatureBlock principalName={principalName} schoolStampUrl={schoolStampUrl} date={date} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Simple Certificate (Achievement / Participation / Good Conduct)
// ─────────────────────────────────────────────────────────────────────────────
function SimpleCertificate({ student, certType, date, year, reason, schoolName, schoolLogoUrl, principalName }) {
  return (
    <div id="certificate" style={{ width: 620, background: "white", padding: "48px 56px", fontFamily: "Georgia, serif", boxSizing: "border-box", border: "12px double #4f46e5", position: "relative", minHeight: 480 }}>
      {[{ top: 6, left: 6 }, { top: 6, right: 6 }, { bottom: 6, left: 6 }, { bottom: 6, right: 6 }].map((pos, i) => (
        <div key={i} style={{ position: "absolute", width: 24, height: 24, border: "2px solid #7c3aed", borderRadius: 2, ...pos }} />
      ))}
      <div style={{ textAlign: "center", marginBottom: 8 }}>
        {schoolLogoUrl && <img src={schoolLogoUrl} alt="" style={{ height: 40, objectFit: "contain", marginBottom: 6 }} />}
        <div style={{ fontSize: 11, letterSpacing: 4, color: "#64748b", textTransform: "uppercase" }}>{schoolName || BRAND.schoolName}</div>
        <div style={{ width: 60, height: 2, background: "linear-gradient(90deg,transparent,#4f46e5,transparent)", margin: "8px auto" }} />
      </div>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ fontSize: 28, fontWeight: "bold", color: "#4f46e5", letterSpacing: 1 }}>{certType}</div>
      </div>
      <div style={{ textAlign: "center", fontSize: 14, color: "#334155", lineHeight: 2 }}>
        <div style={{ marginBottom: 4 }}>This is to certify that</div>
        <div style={{ fontSize: 22, fontWeight: "bold", color: "#1e293b", borderBottom: "1px solid #cbd5e1", display: "inline-block", minWidth: 280, paddingBottom: 2 }}>{student.first_name} {student.last_name}</div>
        <div style={{ marginTop: 8 }}>of <strong>{student.grade}</strong> has successfully distinguished themselves{reason ? ` — ${reason}` : ""}.</div>
        <div style={{ marginTop: 4 }}>Academic Year: <strong>{year}</strong></div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 48 }}>
        {["Class Teacher", principalName || "Head Teacher / Principal"].map(role => (
          <div key={role} style={{ textAlign: "center", minWidth: 160 }}>
            <div style={{ borderTop: "1px solid #475569", paddingTop: 6, fontSize: 11, color: "#475569" }}>{role}</div>
          </div>
        ))}
        <div style={{ textAlign: "center", minWidth: 100 }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", border: "1px dashed #94a3b8", margin: "0 auto 4px", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {schoolLogoUrl ? <img src={schoolLogoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 9, color: "#94a3b8" }}>SEAL</span>}
          </div>
        </div>
      </div>
      <div style={{ textAlign: "right", marginTop: 12, fontSize: 11, color: "#64748b" }}>Date: {date}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Admission / Offer Letter
// ─────────────────────────────────────────────────────────────────────────────
function AdmissionLetter({ student, schoolName, schoolAddress, schoolPhone, schoolEmail, schoolLogoUrl, schoolStampUrl, principalName, year, admissionDate, startDate, feeAmount, conditions }) {
  const Info = ({ label, value }) => (
    <tr>
      <td style={{ padding: "4px 8px", fontSize: 12, color: "#475569", fontStyle: "italic", whiteSpace: "nowrap" }}>{label}</td>
      <td style={{ padding: "4px 8px", fontSize: 12, fontWeight: 700, color: "#1e293b" }}>{value || "—"}</td>
    </tr>
  );
  return (
    <div id="admission-letter" style={{ width: 620, background: "white", padding: "32px 40px", fontFamily: "Georgia, serif", boxSizing: "border-box", minHeight: 800 }}>
      <LetterHead schoolName={schoolName} schoolAddress={schoolAddress} schoolPhone={schoolPhone} schoolEmail={schoolEmail} schoolLogoUrl={schoolLogoUrl} title="Offer of Admission" />
      <div style={{ fontSize: 12, color: "#475569", marginBottom: 4 }}>Ref: ADM/{year}/{student.reg_number || student.id?.slice(0, 6).toUpperCase()}</div>
      <div style={{ fontSize: 12, color: "#475569", marginBottom: 16 }}>Date: {admissionDate}</div>
      <div style={{ fontSize: 13, marginBottom: 16, lineHeight: 1.8 }}>
        <div style={{ fontWeight: 700 }}>Dear Parent / Guardian,</div>
        <div style={{ marginTop: 8 }}>
          We are delighted to inform you that your ward, <strong>{student.first_name} {student.last_name}</strong>,
          has been offered admission into <strong>{student.grade}</strong> for the <strong>{year}</strong> academic year.
        </div>
      </div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: PURPLE, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Student Details</div>
        <table style={{ width: "100%", borderCollapse: "collapse", border: `1px solid ${PURPLE}`, fontSize: 12 }}>
          <tbody>
            <Info label="Full Name"      value={`${student.first_name} ${student.last_name}${student.middle_name ? " " + student.middle_name : ""}`} />
            <Info label="Class Admitted" value={student.grade} />
            <Info label="Admission No."  value={student.reg_number || student.id?.slice(0, 8).toUpperCase()} />
            <Info label="Academic Year"  value={year} />
            {student.date_of_birth && <Info label="Date of Birth" value={student.date_of_birth} />}
          </tbody>
        </table>
      </div>
      {feeAmount && (
        <div style={{ marginBottom: 14, fontSize: 13, lineHeight: 1.8 }}>
          <strong>School Fees:</strong> The termly tuition fee is <strong>₦{Number(feeAmount).toLocaleString()}</strong>. Please ensure fees are paid before resumption.
        </div>
      )}
      <div style={{ marginBottom: 14, fontSize: 13, lineHeight: 1.8 }}>
        <strong>Resumption Date:</strong> Please report to the school on <strong>{startDate || "the first day of term"}</strong> by 8:00 AM.
      </div>
      {conditions && (
        <div style={{ marginBottom: 14, fontSize: 13, lineHeight: 1.8 }}>
          <strong>Conditions / Notes:</strong><br />{conditions}
        </div>
      )}
      <div style={{ fontSize: 13, marginBottom: 8, lineHeight: 1.8 }}>
        We look forward to having your ward as part of our school family. Please confirm acceptance within two (2) weeks.
      </div>
      <div style={{ fontSize: 13, marginBottom: 24, lineHeight: 1.8 }}>Yours faithfully,</div>
      <SignatureBlock principalName={principalName} schoolStampUrl={schoolStampUrl} date={admissionDate} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Transfer Letter
// ─────────────────────────────────────────────────────────────────────────────
function TransferLetter({ student, schoolName, schoolAddress, schoolPhone, schoolEmail, schoolLogoUrl, schoolStampUrl, principalName, transferDate, transferReason, destSchool, conduct }) {
  return (
    <div id="transfer-letter" style={{ width: 620, background: "white", padding: "32px 40px", fontFamily: "Georgia, serif", boxSizing: "border-box", minHeight: 800 }}>
      <LetterHead schoolName={schoolName} schoolAddress={schoolAddress} schoolPhone={schoolPhone} schoolEmail={schoolEmail} schoolLogoUrl={schoolLogoUrl} title="Transfer Certificate" />
      <div style={{ fontSize: 12, color: "#475569", marginBottom: 4 }}>Ref: TRF/{getLagosYear()}/{student.reg_number || student.id?.slice(0, 6).toUpperCase()}</div>
      <div style={{ fontSize: 12, color: "#475569", marginBottom: 16 }}>Date: {transferDate}</div>
      {destSchool && (
        <div style={{ fontSize: 13, marginBottom: 16 }}>
          <div style={{ fontWeight: 700 }}>The Principal,</div>
          <div>{destSchool}</div>
        </div>
      )}
      <div style={{ fontSize: 13, fontWeight: 700, textDecoration: "underline", marginBottom: 12 }}>
        RE: TRANSFER OF {`${student.first_name} ${student.last_name}`.toUpperCase()}
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.9, marginBottom: 14 }}>
        This is to certify that <strong>{student.first_name} {student.last_name}</strong> (Reg. No: <strong>{student.reg_number || student.id?.slice(0, 8).toUpperCase()}</strong>)
        was a bonafide student of this institution and was enrolled in <strong>{student.grade}</strong>.
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.9, marginBottom: 14 }}>
        {transferReason
          ? <>The student is transferring due to: <strong>{transferReason}</strong>.</>
          : "The student is hereby formally released from this institution."}
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.9, marginBottom: 14 }}>
        His/Her conduct and character during his/her stay in this institution was <strong>{conduct || "satisfactory"}</strong>. We wish him/her the very best in his/her future endeavours.
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.9, marginBottom: 24 }}>Yours faithfully,</div>
      <SignatureBlock principalName={principalName} schoolStampUrl={schoolStampUrl} date={transferDate} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Attestation Letter
// ─────────────────────────────────────────────────────────────────────────────
function AttestationLetter({ student, schoolName, schoolAddress, schoolPhone, schoolEmail, schoolLogoUrl, schoolStampUrl, principalName, year, term, attestDate, purpose }) {
  return (
    <div id="attestation-letter" style={{ width: 620, background: "white", padding: "32px 40px", fontFamily: "Georgia, serif", boxSizing: "border-box", minHeight: 800 }}>
      <LetterHead schoolName={schoolName} schoolAddress={schoolAddress} schoolPhone={schoolPhone} schoolEmail={schoolEmail} schoolLogoUrl={schoolLogoUrl} title="Letter of Attestation" />
      <div style={{ fontSize: 12, color: "#475569", marginBottom: 4 }}>Ref: ATT/{getLagosYear()}/{student.reg_number || student.id?.slice(0, 6).toUpperCase()}</div>
      <div style={{ fontSize: 12, color: "#475569", marginBottom: 20 }}>Date: {attestDate}</div>
      <div style={{ fontSize: 14, fontWeight: 700, textAlign: "center", marginBottom: 16, textDecoration: "underline" }}>TO WHOM IT MAY CONCERN</div>
      <div style={{ fontSize: 13, lineHeight: 1.9, marginBottom: 14 }}>
        This is to attest that <strong>{student.first_name} {student.last_name}</strong> (Reg. No: <strong>{student.reg_number || student.id?.slice(0, 8).toUpperCase()}</strong>)
        is a bonafide student of <strong>{schoolName || BRAND.schoolName}</strong>.
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.9, marginBottom: 14 }}>
        He/She is currently in <strong>{student.grade}</strong>, <strong>{term}</strong> of the <strong>{year}</strong> academic year and is in good standing with the school.
      </div>
      {purpose && (
        <div style={{ fontSize: 13, lineHeight: 1.9, marginBottom: 14 }}>
          This letter is issued for the purpose of: <strong>{purpose}</strong>.
        </div>
      )}
      <div style={{ fontSize: 13, lineHeight: 1.9, marginBottom: 14 }}>
        The school takes no responsibility for any act(s) committed by the above named student outside the school premises.
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.9, marginBottom: 24 }}>Yours faithfully,</div>
      <SignatureBlock principalName={principalName} schoolStampUrl={schoolStampUrl} date={attestDate} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Clearance Certificate
// ─────────────────────────────────────────────────────────────────────────────
function ClearanceCertificate({ student, schoolName, schoolAddress, schoolPhone, schoolEmail, schoolLogoUrl, schoolStampUrl, principalName, clearanceDate, departments }) {
  return (
    <div id="clearance-cert" style={{ width: 620, background: "white", padding: "32px 40px", fontFamily: "Georgia, serif", boxSizing: "border-box", minHeight: 720 }}>
      <LetterHead schoolName={schoolName} schoolAddress={schoolAddress} schoolPhone={schoolPhone} schoolEmail={schoolEmail} schoolLogoUrl={schoolLogoUrl} title="Clearance Certificate" />
      <div style={{ fontSize: 13, lineHeight: 1.9, marginBottom: 16 }}>
        This is to certify that <strong>{student.first_name} {student.last_name}</strong> (Reg. No: <strong>{student.reg_number || student.id?.slice(0, 8).toUpperCase()}</strong>),
        a student of <strong>{student.grade}</strong>, has been duly cleared from all departments of this institution and has no outstanding obligations.
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 24, fontSize: 12 }}>
        <thead>
          <tr style={{ background: PURPLE, color: "white" }}>
            <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 700 }}>S/N</th>
            <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 700 }}>Department</th>
            <th style={{ padding: "8px 12px", textAlign: "center", fontWeight: 700 }}>Status</th>
            <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 700 }}>Officer's Signature</th>
          </tr>
        </thead>
        <tbody>
          {departments.map((dept, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? "white" : "#faf5ff", borderBottom: "1px solid #e2e8f0" }}>
              <td style={{ padding: "8px 12px", color: "#64748b" }}>{i + 1}</td>
              <td style={{ padding: "8px 12px", fontWeight: 600, color: "#1e293b" }}>{dept.name}</td>
              <td style={{ padding: "8px 12px", textAlign: "center" }}>
                <span style={{ display: "inline-block", padding: "2px 12px", borderRadius: 20, background: dept.cleared ? "#dcfce7" : "#fee2e2", color: dept.cleared ? "#166534" : "#991b1b", fontWeight: 700, fontSize: 11 }}>
                  {dept.cleared ? "✓ Cleared" : "✗ Pending"}
                </span>
              </td>
              <td style={{ padding: "8px 12px", borderBottom: dept.officer ? "none" : "1px dashed #cbd5e1", fontSize: 11, color: "#475569" }}>{dept.officer || ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <SignatureBlock principalName={principalName} schoolStampUrl={schoolStampUrl} date={clearanceDate} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. Scholarship Notification Letter
// ─────────────────────────────────────────────────────────────────────────────
function ScholarshipNotificationLetter({ student, schoolName, schoolAddress, schoolPhone, schoolEmail, schoolLogoUrl, schoolStampUrl, principalName, notificationDate, effectiveTerm, effectiveYear, scholarshipPercent, scholarshipTitle, conditions, feeSummary }) {
  const pct = Math.max(0, Math.min(100, Number(scholarshipPercent) || 0));
  const tuition = Number(feeSummary?.tuition || 0);
  const totalPayable = Number(feeSummary?.totalWithoutArrears || 0);
  const scholarshipAmount = Math.round(tuition * (pct / 100));
  const awardLabel = pct >= 100 ? "full scholarship" : `${pct}% scholarship`;

  return (
    <div id="scholarship-letter" style={{ width: 620, background: "white", padding: "32px 40px", fontFamily: "Georgia, serif", boxSizing: "border-box", minHeight: 800 }}>
      <LetterHead schoolName={schoolName} schoolAddress={schoolAddress} schoolPhone={schoolPhone} schoolEmail={schoolEmail} schoolLogoUrl={schoolLogoUrl} title="Scholarship Notification Letter" />
      <div style={{ fontSize: 12, color: "#475569", marginBottom: 4 }}>Ref: SCH/{effectiveYear}/{student.reg_number || student.id?.slice(0, 6).toUpperCase()}</div>
      <div style={{ fontSize: 12, color: "#475569", marginBottom: 16 }}>Date: {notificationDate}</div>

      <div style={{ fontSize: 13, marginBottom: 16, lineHeight: 1.8 }}>
        <div style={{ fontWeight: 700 }}>Dear Parent / Guardian,</div>
        <div style={{ marginTop: 8 }}>
          We are pleased to inform you that <strong>{student.first_name} {student.last_name}</strong> of <strong>{student.grade}</strong> has been awarded a <strong>{awardLabel}</strong>{scholarshipTitle ? ` under the ${scholarshipTitle}` : ""} for <strong>{effectiveTerm} {effectiveYear}</strong>.
        </div>
      </div>

      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: PURPLE, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>Scholarship Details</div>
        <table style={{ width: "100%", borderCollapse: "collapse", border: `1px solid ${PURPLE}`, fontSize: 12 }}>
          <tbody>
            {[
              ["Student Name", `${student.first_name} ${student.last_name}${student.middle_name ? ` ${student.middle_name}` : ""}`],
              ["Class", student.grade],
              ["Registration No.", student.reg_number || student.id?.slice(0, 8).toUpperCase()],
              ["Scholarship", scholarshipTitle || "Tuition Scholarship"],
              ["Scholarship Rate", `${pct}%`],
              ["Effective Session", `${effectiveTerm} ${effectiveYear}`],
              ["Term Tuition", `₦${tuition.toLocaleString()}`],
              ["Scholarship Value", `₦${scholarshipAmount.toLocaleString()}`],
              ["Net Term Payable", `₦${totalPayable.toLocaleString()}`],
            ].map(([label, value]) => (
              <tr key={label}>
                <td style={{ padding: "6px 8px", fontSize: 12, color: "#475569", fontStyle: "italic", whiteSpace: "nowrap", width: "34%" }}>{label}</td>
                <td style={{ padding: "6px 8px", fontSize: 12, fontWeight: 700, color: "#1e293b" }}>{value || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: 13, lineHeight: 1.8, marginBottom: 16 }}>
        This award applies to the tuition component stated above. Please keep this letter as part of the student’s financial record and present it whenever verification is required by the school.
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: PURPLE, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Conditions / Notes</div>
        <div style={{ border: `1px solid ${PURPLE}`, background: LIGHT_P, padding: "12px 14px", fontSize: 12.5, lineHeight: 1.8, color: "#334155", minHeight: 88 }}>
          {conditions || "This scholarship remains subject to the school’s academic performance and conduct expectations."}
        </div>
      </div>

      <div style={{ fontSize: 13, lineHeight: 1.8 }}>
        We congratulate <strong>{student.first_name} {student.last_name}</strong> on this award and wish them continued success in their studies.
      </div>

      <SignatureBlock principalName={principalName} schoolStampUrl={schoolStampUrl} date={notificationDate} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. Student Transcript
// ─────────────────────────────────────────────────────────────────────────────
function StudentTranscript({ student, transcriptData, schoolName, schoolAddress, schoolLogoUrl, principalName, year }) {
  // Group results by academic_year → term
  const grouped = {};
  for (const r of transcriptData) {
    if (!grouped[r.academic_year]) grouped[r.academic_year] = {};
    if (!grouped[r.academic_year][r.term]) grouped[r.academic_year][r.term] = [];
    grouped[r.academic_year][r.term].push(r);
  }
  const years = Object.keys(grouped).sort();

  const formatWholeNumber = (value) => {
    if (value === null || value === undefined || value === "") return "—";
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? String(Math.round(numericValue)) : "—";
  };

  const GradeCell = ({ grade }) => {
    const green  = ["A", "A1"];
    const blue   = ["B", "B2", "B3"];
    const amber  = ["C", "C4", "C5", "C6"];
    const orange = ["D", "D7"];
    const color  = green.includes(grade) ? "#166534" : blue.includes(grade) ? "#1d4ed8" : amber.includes(grade) ? "#92400e" : orange.includes(grade) ? "#9a3412" : "#991b1b";
    const bg     = green.includes(grade) ? "#dcfce7" : blue.includes(grade) ? "#dbeafe" : amber.includes(grade) ? "#fef9c3" : orange.includes(grade) ? "#ffedd5" : "#fee2e2";
    return (
      <td style={{ padding: "5px 8px", textAlign: "center" }}>
        <span style={{ display: "inline-block", padding: "1px 7px", borderRadius: 10, background: bg, color, fontWeight: 800, fontSize: 10 }}>{grade || "—"}</span>
      </td>
    );
  };

  return (
    <div id="transcript" style={{ width: 680, background: "white", padding: "28px 36px", fontFamily: "Arial, sans-serif", boxSizing: "border-box" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 8, paddingBottom: 10, borderBottom: `3px solid ${PURPLE}` }}>
        <div style={{ width: 60, height: 60, borderRadius: "50%", border: `2px solid ${PURPLE}`, overflow: "hidden", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: LIGHT_P }}>
          {schoolLogoUrl ? <img src={schoolLogoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <GraduationCap size={24} color={PURPLE} />}
        </div>
        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: PURPLE, textTransform: "uppercase", letterSpacing: 1 }}>{schoolName || BRAND.schoolName}</div>
          {schoolAddress && <div style={{ fontSize: 10, color: "#475569" }}>{schoolAddress}</div>}
          <div style={{ fontSize: 13, fontWeight: 800, color: "#1e293b", marginTop: 4, letterSpacing: 1.5, textTransform: "uppercase" }}>Academic Transcript</div>
        </div>
      </div>

      {/* Student info */}
      <div style={{ display: "flex", gap: 20, marginBottom: 16, background: "#faf5ff", padding: "8px 12px", borderRadius: 6, border: `1px solid ${PURPLE}` }}>
        {[
          ["Name", `${student.first_name} ${student.last_name}${student.middle_name ? " " + student.middle_name : ""}`],
          ["Reg. No.", student.reg_number || student.id?.slice(0, 8).toUpperCase()],
          ["Current Class", student.grade],
          ["Status", student.enrollment_status || "Active"],
        ].map(([label, value]) => (
          <div key={label} style={{ flex: 1 }}>
            <div style={{ fontSize: 9, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#1e293b" }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Records */}
      {years.length === 0 ? (
        <div style={{ textAlign: "center", padding: 32, color: "#94a3b8", fontSize: 13 }}>No academic records found for this student.</div>
      ) : (
        years.map(yr => (
          <div key={yr} style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: PURPLE, background: LIGHT_P, padding: "4px 10px", borderLeft: `4px solid ${PURPLE}`, marginBottom: 6 }}>
              Academic Year: {yr}
            </div>
            {TERM_ORDER.filter(t => grouped[yr][t]).map(term => {
              const rows = grouped[yr][term];
              const avg = rows.length
                ? formatWholeNumber(rows.reduce((s, r) => s + (Number(r.total_score) || 0), 0) / rows.length)
                : "—";
              return (
                <div key={term} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", marginBottom: 3, textTransform: "uppercase", letterSpacing: 0.5 }}>{term}</div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                    <thead>
                      <tr style={{ background: "#f1f5f9" }}>
                        {["Subject", "CA", "Exam", "Total", "Grade", "Remarks"].map(h => (
                          <th key={h} style={{ padding: "5px 8px", textAlign: h === "Subject" ? "left" : "center", fontWeight: 700, color: "#475569", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.3 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid #f1f5f9", background: i % 2 === 0 ? "white" : "#fafafa" }}>
                          <td style={{ padding: "5px 8px", fontWeight: 600, color: "#1e293b" }}>{r.subject_name}</td>
                          <td style={{ padding: "5px 8px", textAlign: "center", color: "#475569" }}>{formatWholeNumber(r.continuous_assessment)}</td>
                          <td style={{ padding: "5px 8px", textAlign: "center", color: "#475569" }}>{formatWholeNumber(r.exam_score)}</td>
                          <td style={{ padding: "5px 8px", textAlign: "center", fontWeight: 700, color: "#1e293b" }}>{formatWholeNumber(r.total_score)}</td>
                          <GradeCell grade={r.grade} />
                          <td style={{ padding: "5px 8px", textAlign: "center", color: "#475569", fontSize: 10 }}>{r.remarks || "—"}</td>
                        </tr>
                      ))}
                      <tr style={{ background: "#f8f5ff", borderTop: `2px solid ${PURPLE}` }}>
                        <td colSpan={3} style={{ padding: "5px 8px", fontWeight: 700, fontSize: 11, color: PURPLE }}>Term Average</td>
                        <td style={{ padding: "5px 8px", textAlign: "center", fontWeight: 800, color: PURPLE }}>{avg}</td>
                        <td colSpan={2} />
                      </tr>
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        ))
      )}

      {/* Footer */}
      <div style={{ marginTop: 20, display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderTop: `1px solid ${PURPLE}`, paddingTop: 12 }}>
        <div style={{ fontSize: 10, color: "#64748b" }}>Generated: {formatDateInLagos(new Date(), { day: "numeric", month: "long", year: "numeric" }, "en-GB")}</div>
        <div style={{ textAlign: "center" }}>
          <div style={{ borderTop: `1px solid ${PURPLE}`, paddingTop: 4, minWidth: 140 }}>
            <div style={{ fontSize: 11, fontWeight: 900 }}>{principalName ? principalName.toUpperCase() : "PRINCIPAL"}</div>
          </div>
          <div style={{ fontSize: 10, color: "#64748b" }}>Principal / Head Teacher</div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Print helper
// ─────────────────────────────────────────────────────────────────────────────
function printElement(elementId, title) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const win = window.open("", "_blank");
  win.document.write(`<!DOCTYPE html><html><head><title>${title}</title>
    <style>
      body { margin: 0; display: flex; justify-content: center; padding: 20px; background: white; }
      @media print { body { padding: 0; } @page { size: A4 portrait; margin: 10mm; } }
    </style>
  </head><body>${el.outerHTML}</body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); win.close(); }, 400);
}

const CERT_TYPES = [
  "School Leaving Certificate",
  "Certificate of Achievement",
  "Certificate of Participation",
  "Certificate of Good Conduct",
];

const DEFAULT_DEPTS = [
  { name: "Finance / Fees",  cleared: true, officer: "" },
  { name: "Library",         cleared: true, officer: "" },
  { name: "Academic",        cleared: true, officer: "" },
  { name: "Sports / PE",     cleared: true, officer: "" },
  { name: "Administration",  cleared: true, officer: "" },
  { name: "Class Teacher",   cleared: true, officer: "" },
];

const todayFormatted = () =>
  formatDateInLagos(new Date(), { day: "numeric", month: "long", year: "numeric" }, "en-GB");

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────
export default function DocumentsPage() {
  const { year, term, schoolName, schoolAddress, schoolPhone, schoolEmail, schoolLogoUrl, schoolStampUrl, principalName } = useSchoolSettings();

  // ── Student picker ──
  const [students,    setStudents]    = useState([]);
  const [search,      setSearch]      = usePersistentState("documents_search", "");
  const [selectedId,  setSelectedId]  = useState(null);
  const [isLoading,   setIsLoading]   = useState(true);
  const [classFees,   setClassFees]   = useState([]);
  const [discounts,   setDiscounts]   = useState({});

  // ── Teacher picker (Staff ID) ──
  const [teachers,        setTeachers]        = useState([]);
  const [teacherSearch,   setTeacherSearch]   = useState("");
  const [selectedTchId,   setSelectedTchId]   = useState(null);
  const [teachersLoading, setTeachersLoading] = useState(false);

  // ── Tabs ──
  const [tab, setTab] = usePersistentState("documents_tab", "id");

  // ── Certificate ──
  const [certType,     setCertType]     = useState(CERT_TYPES[0]);
  const [certDate,     setCertDate]     = useState(todayFormatted());
  const [certSubjects, setCertSubjects] = useState("");
  const [certConduct,  setCertConduct]  = useState("Satisfactory");
  const [certOffice,   setCertOffice]   = useState("");
  const [certExtra,    setCertExtra]    = useState("");

  // ── Admission ──
  const [admissionDate, setAdmissionDate] = useState(todayFormatted());
  const [startDate,     setStartDate]     = useState("");
  const [feeAmount,     setFeeAmount]     = useState("");
  const [conditions,    setConditions]    = useState("");

  // ── Transfer ──
  const [transferDate,   setTransferDate]   = useState(todayFormatted());
  const [transferReason, setTransferReason] = useState("");
  const [destSchool,     setDestSchool]     = useState("");
  const [transferConduct, setTransferConduct] = useState("Satisfactory");

  // ── Attestation ──
  const [attestDate, setAttestDate] = useState(todayFormatted());
  const [purpose,    setPurpose]    = useState("");

  // ── Clearance ──
  const [clearanceDate, setClearanceDate] = useState(todayFormatted());
  const [clearanceDepts, setClearanceDepts] = useState(DEFAULT_DEPTS);

  // ── Scholarship letter ──
  const [scholarshipDate, setScholarshipDate] = useState(todayFormatted());
  const [scholarshipTitle, setScholarshipTitle] = useState("Merit Scholarship");
  const [scholarshipPercent, setScholarshipPercent] = useState("0");
  const [scholarshipTerm, setScholarshipTerm] = useState("");
  const [scholarshipYear, setScholarshipYear] = useState("");
  const [scholarshipNotes, setScholarshipNotes] = useState("");

  // ── Transcript ──
  const [transcriptData,    setTranscriptData]    = useState([]);
  const [transcriptLoading, setTranscriptLoading] = useState(false);

  // ── Drive save ──
  const [driveSaving,  setDriveSaving]  = useState(false);
  const [driveSaved,   setDriveSaved]   = useState(false);
  const [driveError,   setDriveError]   = useState("");

  // ── Load students ──
  useEffect(() => {
    Promise.all([
      supabase.from("students").select("*").order("first_name"),
      loadStudentFeeGroups().catch(() => ({})),
    ]).then(([{ data }, feeGroupRecords]) => {
      if (data) setStudents(applyStudentFeeGroups(data, feeGroupRecords));
      setIsLoading(false);
    }).catch(() => setIsLoading(false));
    supabase.from("class_fees").select("*").then(({ data }) => {
      if (data) setClassFees(data);
    });
    loadPaymentDiscounts().then((data) => setDiscounts(data || {})).catch((err) => console.error("Discounts load failed:", err));
  }, []);

  // ── Load teachers (when Staff ID tab opened) ──
  useEffect(() => {
    if (tab !== "staff_id") return;
    if (teachers.length > 0) return;
    setTeachersLoading(true);
    Teacher.list().then(data => {
      setTeachers(data || []);
      setTeachersLoading(false);
    }).catch(() => setTeachersLoading(false));
  }, [tab]);

  // ── Auto-load subjects for certificate ──
  useEffect(() => {
    if (!selectedId || tab !== "cert") return;
    const student = students.find(s => s.id === selectedId);
    if (!student?.grade) return;
    Subject.list()
      .then(all => {
        const forGrade = all
          .filter(s => Array.isArray(s.grade_levels) && s.grade_levels.includes(student.grade))
          .map(s => s.subject_name);
        if (forGrade.length) setCertSubjects(forGrade.join("\n"));
      })
      .catch((err) => console.error("Certificate subjects load failed:", err));
  }, [selectedId, students, tab]);

  // ── Load transcript data ──
  useEffect(() => {
    if (tab !== "transcript" || !selectedId) return;
    setTranscriptLoading(true);
    supabase
      .from("exam_results")
      .select("*")
      .eq("student_id", selectedId)
      .order("academic_year")
      .then(({ data }) => {
        setTranscriptData(data || []);
        setTranscriptLoading(false);
      });
  }, [tab, selectedId]);

  const filteredStudents = search.trim()
    ? students.filter(s => `${s.first_name} ${s.last_name} ${s.grade}`.toLowerCase().includes(search.toLowerCase()))
    : students;

  const filteredTeachers = teacherSearch.trim()
    ? teachers.filter(t => `${t.first_name} ${t.last_name} ${t.subject_specialization || ""}`.toLowerCase().includes(teacherSearch.toLowerCase()))
    : teachers;

  const selected    = students.find(s => s.id === selectedId);
  const selectedTch = teachers.find(t => t.id === selectedTchId);
  const subjectList = certSubjects.split("\n").map(s => s.trim()).filter(Boolean);
  const scholarshipFeeSummary = selected
    ? getStudentFeeSnapshot({
        student: selected,
        classFees,
        term: scholarshipTerm || term,
        academicYear: scholarshipYear || year,
        discountPct: Number(scholarshipPercent) || 0,
      })
    : null;

  useEffect(() => {
    setScholarshipTerm(term || "");
  }, [term]);

  useEffect(() => {
    setScholarshipYear(year || "");
  }, [year]);

  useEffect(() => {
    if (!selectedId) return;
    const pct = getPaymentDiscountPct(discounts, selectedId, scholarshipTerm || term, scholarshipYear || year);
    setScholarshipPercent(String(pct));
  }, [selectedId, discounts, scholarshipTerm, scholarshipYear, term, year]);

  const TABS = [
    { id: "id",          label: "Student ID",      icon: CreditCard },
    { id: "staff_id",    label: "Staff ID",         icon: Users },
    { id: "cert",        label: "Certificate",      icon: Award },
    { id: "admission",   label: "Admission Letter", icon: FileText },
    { id: "transfer",    label: "Transfer Letter",  icon: ArrowLeftRight },
    { id: "attestation", label: "Attestation",      icon: BadgeCheck },
    { id: "clearance",   label: "Clearance",        icon: ClipboardCheck },
    { id: "scholarship", label: "Scholarship Letter", icon: Award },
    { id: "transcript",  label: "Transcript",       icon: BookOpen },
  ];

  // Which tabs need teacher picker instead of student picker
  const isStaffTab    = tab === "staff_id";
  const printTargetId = {
    id: "id-card-front", staff_id: "staff-id-card", cert: "certificate",
    admission: "admission-letter", transfer: "transfer-letter",
    attestation: "attestation-letter", clearance: "clearance-cert", scholarship: "scholarship-letter", transcript: "transcript",
  }[tab];
  const canPrint = isStaffTab ? !!selectedTch : !!selected && (tab !== "scholarship" || Number(scholarshipPercent) > 0);

  const SAVED_DOCS_FOLDER = "Saved Documents";

  async function saveDocToDrive() {
    if (!canPrint) return;
    setDriveSaving(true);
    setDriveError("");
    setDriveSaved(false);
    try {
      // 1. Load drive config
      const cfg = await getVaultDriveConfig();
      if (!cfg?.google_client_id) throw new Error("Google Client ID not configured in School Vault → Google Drive");

      // 2. Ensure connected
      if (!isDriveConnected()) {
        await requestDriveToken(cfg.google_client_id, false);
      }

      // 3. Find or create the "Saved Documents" vault folder
      let { data: vaultFolder } = await supabase
        .from("vault_folders")
        .select("*")
        .eq("name", SAVED_DOCS_FOLDER)
        .maybeSingle();

      if (!vaultFolder) {
        // Create Google Drive folder inside the vault root
        let driveFolderId = null;
        if (cfg.root_folder_id) {
          const driveFolder = await createDriveFolder(SAVED_DOCS_FOLDER, cfg.root_folder_id);
          driveFolderId = driveFolder?.id || null;
        }

        // Create DB record
        const { data: newFolder, error: insertErr } = await supabase
          .from("vault_folders")
          .insert({
            name:            SAVED_DOCS_FOLDER,
            description:     "Documents saved from the Documents page",
            is_system:       false,
            drive_folder_id: driveFolderId,
          })
          .select()
          .single();

        if (insertErr) throw new Error("Could not create Saved Documents folder: " + insertErr.message);
        vaultFolder = newFolder;
      }

      if (!vaultFolder?.drive_folder_id) {
        throw new Error("Saved Documents folder is not linked to Google Drive. Please reconnect Drive in School Vault.");
      }

      // 4. Build PDF blob from rendered element
      const personName = isStaffTab
        ? `${selectedTch.first_name} ${selectedTch.last_name}`
        : `${selected.first_name} ${selected.last_name}`;
      const docLabel = TABS.find(t => t.id === tab)?.label || tab;
      const fileName  = `${docLabel} - ${personName} - ${year}.pdf`;
      const blob = await elementToPdfBlob(printTargetId, `${docLabel} - ${personName}`);

      // 5. Upload to Drive
      const uploaded = await uploadToDrive({
        name:     fileName,
        blob,
        mimeType: "application/pdf",
        parentId: vaultFolder.drive_folder_id,
      });

      // 6. Save metadata to vault_files
      await supabase.from("vault_files").insert({
        folder_id:     vaultFolder.id,
        name:          fileName,
        original_name: fileName,
        mime_type:     "application/pdf",
        drive_file_id: uploaded.id,
        drive_url:     uploaded.webViewLink,
        uploaded_by:   "documents_page",
        term,
        academic_year: year,
      });

      setDriveSaved(true);
      setTimeout(() => setDriveSaved(false), 4000);
    } catch (e) {
      setDriveError(e.message || "Save to Drive failed");
      setTimeout(() => setDriveError(""), 6000);
    }
    setDriveSaving(false);
  }

  return (
    <div className="p-6 md:p-8 min-h-screen">
      <div className="max-w-6xl mx-auto">

        <div className="mb-6">
          <h1 className="text-3xl font-bold text-slate-900 mb-1">Documents</h1>
          <p className="text-slate-500">Generate and print official school documents</p>
        </div>

        {/* Tab bar */}
        <div className="flex flex-wrap gap-2 mb-6">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                tab === t.id ? "bg-indigo-600 text-white shadow-sm" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}>
              <t.icon className="w-4 h-4" />{t.label}
            </button>
          ))}
        </div>

        <div className="grid lg:grid-cols-3 gap-6">

          {/* ── Left panel ── */}
          <div className="space-y-4">

            {/* Student OR Teacher picker */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
              <p className="text-sm font-semibold text-slate-700">
                {isStaffTab ? "Select Staff" : "Select Student"}
              </p>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder={isStaffTab ? "Search staff name..." : "Search name or class..."}
                  value={isStaffTab ? teacherSearch : search}
                  onChange={e => isStaffTab ? setTeacherSearch(e.target.value) : setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="max-h-60 overflow-y-auto space-y-1">
                {isStaffTab ? (
                  teachersLoading
                    ? <div className="text-center py-6 text-sm text-slate-400 flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</div>
                    : filteredTeachers.slice(0, 30).map(t => (
                      <button key={t.id} onClick={() => setSelectedTchId(t.id)}
                        className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                          selectedTchId === t.id ? "bg-teal-50 border border-teal-200 text-teal-800" : "hover:bg-slate-50 text-slate-700"
                        }`}>
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-teal-400 to-emerald-500 flex items-center justify-center flex-shrink-0">
                          <span className="text-white text-xs font-bold">{t.first_name?.[0]}{t.last_name?.[0]}</span>
                        </div>
                        <div>
                          <div className="font-medium leading-tight">{t.first_name} {t.last_name}</div>
                          <div className="text-xs text-slate-400">{t.subject_specialization || "Staff"}</div>
                        </div>
                      </button>
                    ))
                ) : (
                  isLoading
                    ? <div className="text-center py-6 text-sm text-slate-400">Loading...</div>
                    : filteredStudents.slice(0, 30).map(s => (
                      <button key={s.id} onClick={() => setSelectedId(s.id)}
                        className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                          selectedId === s.id ? "bg-indigo-50 border border-indigo-200 text-indigo-800" : "hover:bg-slate-50 text-slate-700"
                        }`}>
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-400 to-emerald-500 flex items-center justify-center flex-shrink-0">
                          <span className="text-white text-xs font-bold">{s.first_name?.[0]}{s.last_name?.[0]}</span>
                        </div>
                        <div>
                          <div className="font-medium leading-tight">{s.first_name} {s.last_name}</div>
                          <div className="text-xs text-slate-400">{s.grade}</div>
                        </div>
                      </button>
                    ))
                )}
              </div>
            </div>

            {/* Per-tab form fields */}
            {tab === "cert" && (
              <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
                <p className="text-sm font-semibold text-slate-700">Certificate Details</p>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600">Type</label>
                  <Select value={certType} onValueChange={setCertType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CERT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                {certType === "School Leaving Certificate" ? (<>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600">Subjects (one per line, max 12)</label>
                    <Textarea rows={5} placeholder="Mathematics&#10;English Language&#10;..." value={certSubjects} onChange={e => setCertSubjects(e.target.value)} className="text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600">Conduct</label>
                    <Input value={certConduct} onChange={e => setCertConduct(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600">Office Held</label>
                    <Input placeholder="e.g. Head Girl" value={certOffice} onChange={e => setCertOffice(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600">Extra Curricular</label>
                    <Input placeholder="e.g. Volleyball" value={certExtra} onChange={e => setCertExtra(e.target.value)} />
                  </div>
                </>) : (
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600">Reason (optional)</label>
                    <Input placeholder="e.g. outstanding performance..." value={certConduct} onChange={e => setCertConduct(e.target.value)} />
                  </div>
                )}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600">Date</label>
                  <Input value={certDate} onChange={e => setCertDate(e.target.value)} />
                </div>
              </div>
            )}

            {tab === "admission" && (
              <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
                <p className="text-sm font-semibold text-slate-700">Admission Details</p>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600">Letter Date</label>
                  <Input value={admissionDate} onChange={e => setAdmissionDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600">Resumption Date</label>
                  <Input placeholder="e.g. 7 January 2026" value={startDate} onChange={e => setStartDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600">Termly Fee (₦)</label>
                  <Input type="number" placeholder="e.g. 150000" value={feeAmount} onChange={e => setFeeAmount(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600">Conditions / Notes</label>
                  <Textarea rows={3} placeholder="Any special conditions..." value={conditions} onChange={e => setConditions(e.target.value)} className="text-sm" />
                </div>
              </div>
            )}

            {tab === "transfer" && (
              <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
                <p className="text-sm font-semibold text-slate-700">Transfer Details</p>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600">Date</label>
                  <Input value={transferDate} onChange={e => setTransferDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600">Destination School (optional)</label>
                  <Input placeholder="e.g. ABC International School" value={destSchool} onChange={e => setDestSchool(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600">Reason for Transfer (optional)</label>
                  <Input placeholder="e.g. Relocation" value={transferReason} onChange={e => setTransferReason(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600">Conduct</label>
                  <Input value={transferConduct} onChange={e => setTransferConduct(e.target.value)} />
                </div>
              </div>
            )}

            {tab === "attestation" && (
              <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
                <p className="text-sm font-semibold text-slate-700">Attestation Details</p>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600">Date</label>
                  <Input value={attestDate} onChange={e => setAttestDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600">Purpose</label>
                  <Input placeholder="e.g. Scholarship application, Bank account opening..." value={purpose} onChange={e => setPurpose(e.target.value)} />
                </div>
              </div>
            )}

            {tab === "clearance" && (
              <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
                <p className="text-sm font-semibold text-slate-700">Clearance Details</p>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600">Date</label>
                  <Input value={clearanceDate} onChange={e => setClearanceDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600">Departments</label>
                  <div className="space-y-2">
                    {clearanceDepts.map((dept, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={dept.cleared}
                          onChange={e => {
                            const d = [...clearanceDepts];
                            d[i] = { ...d[i], cleared: e.target.checked };
                            setClearanceDepts(d);
                          }}
                          className="w-4 h-4 accent-emerald-600"
                        />
                        <span className="text-xs flex-1 text-slate-700">{dept.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {tab === "scholarship" && (
              <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
                <p className="text-sm font-semibold text-slate-700">Scholarship Details</p>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600">Letter Date</label>
                  <Input value={scholarshipDate} onChange={e => setScholarshipDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600">Scholarship Title</label>
                  <Input value={scholarshipTitle} onChange={e => setScholarshipTitle(e.target.value)} placeholder="e.g. Merit Scholarship" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600">Rate (%)</label>
                    <Input type="number" min="0" max="100" value={scholarshipPercent} onChange={e => setScholarshipPercent(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600">Effective Term</label>
                    <Select value={scholarshipTerm} onValueChange={setScholarshipTerm}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TERM_ORDER.map(item => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600">Academic Year</label>
                  <Input value={scholarshipYear} onChange={e => setScholarshipYear(e.target.value)} placeholder="e.g. 2025/2026" />
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 space-y-1">
                  <p><strong>Tuition:</strong> ₦{Number(scholarshipFeeSummary?.tuition || 0).toLocaleString()}</p>
                  <p><strong>Net payable after scholarship:</strong> ₦{Number(scholarshipFeeSummary?.totalWithoutArrears || 0).toLocaleString()}</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600">Conditions / Notes</label>
                  <Textarea rows={4} value={scholarshipNotes} onChange={e => setScholarshipNotes(e.target.value)} placeholder="Add any scholarship conditions, duration, or review terms..." className="text-sm" />
                </div>
                {Number(scholarshipPercent) <= 0 && (
                  <p className="text-xs text-amber-600">Set a scholarship rate above 0% before printing this letter.</p>
                )}
              </div>
            )}
          </div>

          {/* ── Right preview panel ── */}
          <div className="lg:col-span-2">
            {!canPrint ? (
                <div className="bg-white rounded-2xl border border-dashed border-slate-300 flex items-center justify-center h-64">
                  <div className="text-center text-slate-400">
                    <User className="w-10 h-10 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">
                      {tab === "scholarship"
                        ? (selected ? "Set a scholarship rate above 0% to preview the letter" : "Select a student to preview")
                        : `Select a ${isStaffTab ? "staff member" : "student"} to preview`}
                    </p>
                  </div>
                </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className="text-sm font-semibold text-slate-700">Preview</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Save to Drive */}
                    <Button
                      onClick={saveDocToDrive}
                      disabled={driveSaving || !canPrint}
                      variant="outline"
                      size="sm"
                      className={`gap-1.5 text-xs border-blue-200 text-blue-600 hover:bg-blue-50 ${driveSaved ? "bg-emerald-50 border-emerald-200 text-emerald-600" : ""}`}
                    >
                      {driveSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> :
                       driveSaved  ? <Check className="w-3.5 h-3.5" /> :
                                     <Cloud className="w-3.5 h-3.5" />}
                      {driveSaved ? "Saved!" : "Save to Drive"}
                    </Button>
                    {/* Print */}
                    <Button
                      onClick={() => printElement(printTargetId, `${TABS.find(t => t.id === tab)?.label} - ${isStaffTab ? `${selectedTch.first_name} ${selectedTch.last_name}` : `${selected.first_name} ${selected.last_name}`}`)}
                      className="bg-indigo-600 hover:bg-indigo-700 gap-2 text-sm"
                    >
                      <Printer className="w-4 h-4" /> Print
                    </Button>
                  </div>
                </div>
                {driveError && (
                  <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{driveError}</p>
                )}

                {tab === "transcript" && transcriptLoading && (
                  <div className="flex items-center justify-center py-16 text-slate-400">
                    <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading transcript…
                  </div>
                )}

                {!transcriptLoading && (
                  <div className="overflow-x-auto flex justify-center">
                    {tab === "id" && <IDCard student={selected} year={year} schoolName={schoolName} schoolLogoUrl={schoolLogoUrl} />}

                    {tab === "staff_id" && <StaffIDCard teacher={selectedTch} year={year} schoolName={schoolName} schoolLogoUrl={schoolLogoUrl} />}

                    {tab === "cert" && (certType === "School Leaving Certificate"
                      ? <Certificate student={selected} certType={certType} date={certDate} year={year} subjects={subjectList} conduct={certConduct} officeHeld={certOffice} extraCurricular={certExtra} schoolName={schoolName} schoolAddress={schoolAddress} schoolLogoUrl={schoolLogoUrl} schoolStampUrl={schoolStampUrl} principalName={principalName} />
                      : <SimpleCertificate student={selected} certType={certType} date={certDate} year={year} reason={certConduct} schoolName={schoolName} schoolLogoUrl={schoolLogoUrl} principalName={principalName} />
                    )}

                    {tab === "admission" && <AdmissionLetter student={selected} schoolName={schoolName} schoolAddress={schoolAddress} schoolPhone={schoolPhone} schoolEmail={schoolEmail} schoolLogoUrl={schoolLogoUrl} schoolStampUrl={schoolStampUrl} principalName={principalName} year={year} admissionDate={admissionDate} startDate={startDate} feeAmount={feeAmount} conditions={conditions} />}

                    {tab === "transfer" && <TransferLetter student={selected} schoolName={schoolName} schoolAddress={schoolAddress} schoolPhone={schoolPhone} schoolEmail={schoolEmail} schoolLogoUrl={schoolLogoUrl} schoolStampUrl={schoolStampUrl} principalName={principalName} transferDate={transferDate} transferReason={transferReason} destSchool={destSchool} conduct={transferConduct} />}

                    {tab === "attestation" && <AttestationLetter student={selected} schoolName={schoolName} schoolAddress={schoolAddress} schoolPhone={schoolPhone} schoolEmail={schoolEmail} schoolLogoUrl={schoolLogoUrl} schoolStampUrl={schoolStampUrl} principalName={principalName} year={year} term={term} attestDate={attestDate} purpose={purpose} />}

                    {tab === "clearance" && <ClearanceCertificate student={selected} schoolName={schoolName} schoolAddress={schoolAddress} schoolPhone={schoolPhone} schoolEmail={schoolEmail} schoolLogoUrl={schoolLogoUrl} schoolStampUrl={schoolStampUrl} principalName={principalName} clearanceDate={clearanceDate} departments={clearanceDepts} />}

                    {tab === "scholarship" && <ScholarshipNotificationLetter student={selected} schoolName={schoolName} schoolAddress={schoolAddress} schoolPhone={schoolPhone} schoolEmail={schoolEmail} schoolLogoUrl={schoolLogoUrl} schoolStampUrl={schoolStampUrl} principalName={principalName} notificationDate={scholarshipDate} effectiveTerm={scholarshipTerm || term} effectiveYear={scholarshipYear || year} scholarshipPercent={scholarshipPercent} scholarshipTitle={scholarshipTitle} conditions={scholarshipNotes} feeSummary={scholarshipFeeSummary} />}

                    {tab === "transcript" && <StudentTranscript student={selected} transcriptData={transcriptData} schoolName={schoolName} schoolAddress={schoolAddress} schoolLogoUrl={schoolLogoUrl} principalName={principalName} year={year} />}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

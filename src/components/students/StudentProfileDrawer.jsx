import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  User, Phone, Mail, Calendar, BookOpen, CreditCard, GraduationCap,
  Edit, Loader2, Archive, RotateCcw, Clock, AlertCircle,
} from "lucide-react";
import { Payment } from "@/entities/Payment";
import { AcademicRecord } from "@/entities/AcademicRecord";
import { supabase } from "@/api/supabaseClient";
import { formatDateInLagos } from "@/lib/timezone";
import { format } from "date-fns";

const STATUS_STYLE = {
  active:     "bg-emerald-100 text-emerald-700 border-emerald-200",
  inactive:   "bg-slate-100 text-slate-600 border-slate-200",
  graduated:  "bg-blue-100 text-blue-700 border-blue-200",
  transferred:"bg-orange-100 text-orange-700 border-orange-200",
};

const PAYMENT_STATUS_STYLE = {
  paid:    "bg-emerald-100 text-emerald-700",
  partial: "bg-amber-100 text-amber-700",
  unpaid:  "bg-red-100 text-red-600",
  pending: "bg-slate-100 text-slate-500",
};

const GRADE_COLOR = {
  A: "text-emerald-700 font-bold",
  B: "text-blue-700 font-bold",
  C: "text-amber-700 font-bold",
  D: "text-orange-600 font-bold",
  E: "text-red-500 font-bold",
  F: "text-red-700 font-bold",
};

function gradeColor(grade) {
  const letter = (grade || "").charAt(0).toUpperCase();
  return GRADE_COLOR[letter] || "text-slate-700 font-semibold";
}

const TERM_ORDER = { "First Term": 1, "Second Term": 2, "Third Term": 3 };

export default function StudentProfileDrawer({ student, onClose, onEdit }) {
  const [activeTab, setActiveTab] = useState("profile");
  const [payments, setPayments] = useState([]);
  const [academicRecords, setAcademicRecords] = useState([]);
  const [subjectMap, setSubjectMap] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  // Load payments + academic records + subjects once when tab first opened
  useEffect(() => {
    if (!student || hasLoaded) return;
    setIsLoading(true);
    Promise.all([
      Payment.filter({ student_id: student.id }, "-payment_date").catch(() => []),
      AcademicRecord.filter({ student_id: student.id }).catch(() => []),
      supabase.from("subjects").select("id, subject_name").then(r => r.data || []).catch(() => []),
    ]).then(([pays, records, subjects]) => {
      setPayments(pays);
      setAcademicRecords(records);
      const smap = {};
      for (const s of subjects) smap[s.id] = s.subject_name;
      setSubjectMap(smap);
      setHasLoaded(true);
      setIsLoading(false);
    });
  }, [student, hasLoaded]);

  if (!student) return null;

  const fullName = `${student.first_name || ""} ${student.last_name || ""}`.trim();
  const initials = `${student.first_name?.[0] || ""}${student.last_name?.[0] || ""}`;
  const statusStyle = STATUS_STYLE[student.enrollment_status] || STATUS_STYLE.inactive;

  // Group academic records by year + term
  const groupedRecords = academicRecords.reduce((acc, r) => {
    const key = `${r.academic_year}||${r.term}`;
    if (!acc[key]) acc[key] = { year: r.academic_year, term: r.term, records: [] };
    acc[key].records.push(r);
    return acc;
  }, {});

  const sortedGroups = Object.values(groupedRecords).sort((a, b) => {
    if (b.year !== a.year) return (b.year || "").localeCompare(a.year || "");
    return (TERM_ORDER[b.term] || 0) - (TERM_ORDER[a.term] || 0);
  });

  const totalPaid = payments
    .filter(p => p.payment_status === "paid" || p.payment_status === "partial")
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);

  const tabs = [
    { id: "profile",  label: "Profile",          icon: User },
    { id: "payments", label: `Payments (${payments.length})`, icon: CreditCard },
    { id: "academic", label: `Academic (${academicRecords.length})`, icon: BookOpen },
  ];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0">
        {/* Header */}
        <div className="flex items-start gap-4 px-6 pt-6 pb-4 border-b border-slate-100">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-slate-500 to-slate-600 flex items-center justify-center flex-shrink-0 shadow-sm">
            <span className="text-white text-lg font-bold tracking-wide">{initials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-bold text-slate-900">{fullName}</h2>
              <Badge className={`${statusStyle} border text-xs font-medium capitalize`}>
                {student.enrollment_status}
              </Badge>
            </div>
            <p className="text-sm text-slate-500 mt-0.5">
              {student.grade || "No class"}{student.reg_number ? ` · ${student.reg_number}` : ""}
            </p>
            {student.archived_at && (
              <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                <Archive className="w-3 h-3" />
                Archived {formatDateInLagos(new Date(student.archived_at), { day: "2-digit", month: "short", year: "numeric" }, "en-GB")}
                {student.archive_reason ? ` · ${student.archive_reason}` : ""}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {onEdit && (
              <Button size="sm" variant="outline" onClick={() => { onClose(); onEdit(student); }}>
                <Edit className="w-3.5 h-3.5 mr-1.5" /> Edit Profile
              </Button>
            )}
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-0 border-b border-slate-100 px-6 bg-white">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin mr-2" />
              Loading records...
            </div>
          ) : (
            <>
              {/* ── Profile Tab ── */}
              {activeTab === "profile" && (
                <div className="space-y-4">
                  <Section title="Personal Information">
                    <InfoGrid>
                      <InfoItem label="Full Name" value={fullName} />
                      <InfoItem label="Gender" value={student.gender} />
                      <InfoItem label="Date of Birth" value={student.date_of_birth
                        ? format(new Date(student.date_of_birth + "T12:00:00"), "d MMMM yyyy")
                        : null} />
                      <InfoItem label="Registration No." value={student.reg_number} />
                      <InfoItem label="Class" value={student.grade} />
                      <InfoItem label="Enrollment Status" value={
                        <span className={`text-xs capitalize font-semibold px-2 py-0.5 rounded-full border ${statusStyle}`}>
                          {student.enrollment_status}
                        </span>
                      } />
                      <InfoItem label="Enrollment Date" value={student.enrollment_date
                        ? format(new Date(student.enrollment_date + "T12:00:00"), "d MMM yyyy")
                        : null} />
                      <InfoItem label="Fee Group" value={student.fee_group || "Standard"} />
                    </InfoGrid>
                  </Section>

                  <Section title="Parent / Guardian">
                    <InfoGrid>
                      <InfoItem label="Parent Name" value={student.parent_name} />
                      <InfoItem label="Phone" value={student.parent_phone} />
                      <InfoItem label="Email" value={student.parent_email} />
                      <InfoItem label="Address" value={student.address} fullWidth />
                    </InfoGrid>
                  </Section>

                  {student.archived_at && (
                    <Section title="Archive Details">
                      <InfoGrid>
                        <InfoItem label="Archived On" value={formatDateInLagos(new Date(student.archived_at), { day: "2-digit", month: "long", year: "numeric" }, "en-GB")} />
                        <InfoItem label="Reason" value={student.archive_reason || "—"} />
                        {student.reinstated_at && <>
                          <InfoItem label="Last Reinstated" value={formatDateInLagos(new Date(student.reinstated_at), { day: "2-digit", month: "long", year: "numeric" }, "en-GB")} />
                          <InfoItem label="Reinstatement Note" value={student.reinstatement_note || "—"} />
                        </>}
                      </InfoGrid>
                    </Section>
                  )}
                </div>
              )}

              {/* ── Payments Tab ── */}
              {activeTab === "payments" && (
                <div className="space-y-4">
                  {payments.length === 0 ? (
                    <Empty icon={CreditCard} message="No payment records found for this student." />
                  ) : (
                    <>
                      {/* Summary */}
                      <div className="grid grid-cols-3 gap-3">
                        <SummaryChip label="Total Payments" value={payments.length} color="bg-slate-50 border-slate-200" />
                        <SummaryChip label="Total Paid" value={`₦${totalPaid.toLocaleString()}`} color="bg-emerald-50 border-emerald-200" textColor="text-emerald-700" />
                        <SummaryChip
                          label="Paid in Full"
                          value={payments.filter(p => p.payment_status === "paid").length}
                          color="bg-blue-50 border-blue-200"
                          textColor="text-blue-700"
                        />
                      </div>

                      {/* Payment list */}
                      <div className="rounded-xl border border-slate-200 overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                              <Th>Date</Th>
                              <Th>Term / Year</Th>
                              <Th align="right">Amount</Th>
                              <Th>Status</Th>
                              <Th>Method</Th>
                              <Th>Notes</Th>
                            </tr>
                          </thead>
                          <tbody>
                            {payments.map((p, i) => (
                              <tr key={p.id} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/60"}>
                                <Td>{p.payment_date ? format(new Date(p.payment_date), "dd/MM/yyyy") : "—"}</Td>
                                <Td className="text-slate-500">{p.term} {p.academic_year}</Td>
                                <Td align="right" className="font-semibold text-slate-800">
                                  ₦{Number(p.amount || 0).toLocaleString()}
                                </Td>
                                <Td>
                                  <span className={`text-xs font-semibold capitalize px-2 py-0.5 rounded-full ${PAYMENT_STATUS_STYLE[p.payment_status] || "bg-slate-100 text-slate-500"}`}>
                                    {p.payment_status}
                                  </span>
                                </Td>
                                <Td className="capitalize text-slate-500">{p.payment_method || "—"}</Td>
                                <Td className="text-xs text-slate-400 max-w-[160px] truncate">{p.notes || "—"}</Td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ── Academic Records Tab ── */}
              {activeTab === "academic" && (
                <div className="space-y-5">
                  {sortedGroups.length === 0 ? (
                    <Empty icon={BookOpen} message="No academic records found for this student." />
                  ) : (
                    sortedGroups.map(group => {
                      const avg = group.records.length > 0
                        ? (group.records.reduce((s, r) => s + (Number(r.total_score) || 0), 0) / group.records.length).toFixed(1)
                        : null;
                      return (
                        <div key={`${group.year}||${group.term}`} className="rounded-xl border border-slate-200 overflow-hidden">
                          <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-200">
                            <span className="text-sm font-bold text-slate-700">
                              {group.term} — {group.year}
                            </span>
                            {avg && (
                              <span className="text-xs text-slate-500">
                                Avg: <strong className={gradeColor(group.records.find(r => Number(r.total_score) >= 70 ? "A" : Number(r.total_score) >= 60 ? "B" : "C")?.grade)}>
                                  {avg}%
                                </strong>
                                <span className="ml-2 text-slate-400">· {group.records.length} subject{group.records.length !== 1 ? "s" : ""}</span>
                              </span>
                            )}
                          </div>
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-white border-b border-slate-100">
                                <Th>Subject</Th>
                                <Th align="center">CA</Th>
                                <Th align="center">Exam</Th>
                                <Th align="center">Total</Th>
                                <Th align="center">Grade</Th>
                                <Th>Remarks</Th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.records
                                .sort((a, b) => (subjectMap[a.subject_id] || "").localeCompare(subjectMap[b.subject_id] || ""))
                                .map((r, i) => (
                                  <tr key={r.id} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/60"}>
                                    <Td className="font-medium text-slate-700">
                                      {subjectMap[r.subject_id] || "Unknown"}
                                    </Td>
                                    <Td align="center" className="text-slate-500">{r.continuous_assessment ?? "—"}</Td>
                                    <Td align="center" className="text-slate-500">{r.exam_score ?? "—"}</Td>
                                    <Td align="center" className="font-bold text-slate-800">{r.total_score ?? "—"}</Td>
                                    <Td align="center">
                                      <span className={gradeColor(r.grade)}>{r.grade || "—"}</span>
                                    </Td>
                                    <Td className="text-xs text-slate-400">{r.remarks || "—"}</Td>
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Small helpers ──

function Section({ title, children }) {
  return (
    <div>
      <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">{title}</h3>
      {children}
    </div>
  );
}

function InfoGrid({ children }) {
  return <div className="grid grid-cols-2 gap-x-6 gap-y-3">{children}</div>;
}

function InfoItem({ label, value, fullWidth }) {
  if (!value && value !== 0) return null;
  return (
    <div className={fullWidth ? "col-span-2" : ""}>
      <p className="text-xs text-slate-400 mb-0.5">{label}</p>
      <p className="text-sm font-medium text-slate-700">{value}</p>
    </div>
  );
}

function Empty({ icon: Icon, message }) {
  return (
    <div className="text-center py-16 text-slate-400">
      <Icon className="w-10 h-10 mx-auto mb-3 opacity-30" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

function SummaryChip({ label, value, color, textColor = "text-slate-700" }) {
  return (
    <div className={`rounded-xl border p-3 text-center ${color}`}>
      <p className="text-xs text-slate-500 mb-0.5">{label}</p>
      <p className={`text-lg font-bold ${textColor}`}>{value}</p>
    </div>
  );
}

function Th({ children, align = "left" }) {
  return (
    <th className={`px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 text-${align}`}>
      {children}
    </th>
  );
}

function Td({ children, align = "left", className = "" }) {
  return (
    <td className={`px-4 py-2.5 text-${align} ${className}`}>
      {children}
    </td>
  );
}

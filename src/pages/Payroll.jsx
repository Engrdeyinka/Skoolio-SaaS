import React, { useState, useEffect, useMemo, useCallback } from "react";
import { BRAND } from "@/config/brand";
import { usePersistentState } from "@/hooks/usePersistentState";
import { Teacher } from "@/entities/Teacher";
import { PayrollSalaryConfig } from "@/entities/PayrollSalaryConfig";
import { PayrollRun } from "@/entities/PayrollRun";
import { useAuth } from "@/lib/AuthContext";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import { useToast } from "@/components/ui/use-toast";
import { Toaster } from "@/components/ui/toaster";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Shield, Banknote, Plus, Pencil, Save, X, CheckCircle, Printer, Trash2,
  ChevronDown, ChevronUp, AlertTriangle, Users, DollarSign, TrendingUp,
  Eye, RefreshCw, Filter, Calendar, FileText, Clock,
} from "lucide-react";
import { BadgeCheck, Loader2, Send, AlertCircle } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { flutterwaveVerifyAccount } from "@/functions/flutterwaveVerifyAccount";
import { flutterwaveDisburse } from "@/functions/flutterwaveDisburse";
import { flutterwaveCheckStatus } from "@/functions/flutterwaveCheckStatus";
import { sendSMS } from "@/functions/sendSMS";
import { formatDateInLagos, getLagosMonthIndex, getLagosYear } from "@/lib/timezone";

// ── localStorage keys (legacy — used only for one-time migration) ─────────────
const LEGACY_SALARY_KEY = "payroll_salary_config";
const LEGACY_RUNS_KEY   = "payroll_runs";

// ── Constants ─────────────────────────────────────────────────────────────────
const fmt = (n) => `₦${Number(n || 0).toLocaleString()}`;

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const NG_BANKS = [
  { code: "044",    name: "Access Bank" },
  { code: "063",    name: "Access Bank (Diamond)" },
  { code: "050",    name: "Ecobank Nigeria" },
  { code: "070",    name: "Fidelity Bank" },
  { code: "011",    name: "First Bank of Nigeria" },
  { code: "214",    name: "FCMB" },
  { code: "058",    name: "Guaranty Trust Bank" },
  { code: "030",    name: "Heritage Bank" },
  { code: "301",    name: "Jaiz Bank" },
  { code: "082",    name: "Keystone Bank" },
  { code: "076",    name: "Polaris Bank" },
  { code: "101",    name: "Providus Bank" },
  { code: "221",    name: "Stanbic IBTC Bank" },
  { code: "068",    name: "Standard Chartered Bank" },
  { code: "232",    name: "Sterling Bank" },
  { code: "032",    name: "Union Bank of Nigeria" },
  { code: "033",    name: "United Bank For Africa" },
  { code: "215",    name: "Unity Bank" },
  { code: "035",    name: "Wema Bank" },
  { code: "057",    name: "Zenith Bank" },
  { code: "304",    name: "OPay" },
  { code: "305",    name: "PalmPay" },
  { code: "090175", name: "Moniepoint MFB" },
  { code: "50515",  name: "Kuda MFB" },
  { code: "100004", name: "Opay Digital Services" },
];

function calcNet(gross, other_deductions) {
  return Math.max(0, (Number(gross) || 0) - (Number(other_deductions) || 0));
}

function isActiveTeacher(teacher) {
  return (teacher?.employment_status || "active").toLowerCase() !== "inactive";
}

// ── Print individual payslip ──────────────────────────────────────────────────
function printPayslip({ teacherName, role, month, year, gross, other, net,
  bankName, accountNumber, accountName, schoolName }) {
  const displaySchool = (schoolName || BRAND.schoolName.toUpperCase()).toUpperCase();
  const fmtAmt = (n) =>
    Number(n || 0).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const today = formatDateInLagos(new Date(), {
    day: "2-digit", month: "long", year: "numeric",
  });

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>Payslip – ${teacherName}</title>
  <style>
    @page { size: A4; margin: 20mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 13px; color: #111; background: #fff; }
    .header { text-align: center; border-bottom: 3px solid #4c1d95; padding-bottom: 16px; margin-bottom: 20px; }
    .school-name { font-size: 20px; font-weight: 900; letter-spacing: 1px; color: #4c1d95; text-transform: uppercase; }
    .payslip-title { font-size: 14px; font-weight: 700; letter-spacing: 3px; color: #555; margin-top: 4px; }
    .period { font-size: 13px; color: #666; margin-top: 4px; }
    .section { margin-bottom: 18px; }
    .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #4c1d95; border-bottom: 1px solid #ddd6fe; padding-bottom: 4px; margin-bottom: 10px; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 20px; }
    .info-row { display: flex; justify-content: space-between; padding: 3px 0; font-size: 13px; }
    .info-label { color: #555; }
    .info-value { font-weight: 600; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { background: #4c1d95; color: #fff; padding: 8px 12px; text-align: left; font-size: 12px; }
    td { padding: 8px 12px; border-bottom: 1px solid #eee; }
    tr:nth-child(even) td { background: #faf5ff; }
    .amount { text-align: right; }
    .net-row td { font-weight: 700; font-size: 15px; background: #f3e8ff !important; border-top: 2px solid #4c1d95; }
    .bank-section { background: #f8f7ff; border: 1px solid #ddd6fe; border-radius: 6px; padding: 14px; margin-bottom: 18px; }
    .signature-section { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 30px; }
    .sig-box { border-top: 1px solid #999; padding-top: 8px; font-size: 12px; color: #555; }
    .footer { text-align: center; margin-top: 24px; font-size: 11px; color: #888; border-top: 1px dashed #ccc; padding-top: 10px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="school-name">${displaySchool}</div>
    <div class="payslip-title">EMPLOYEE PAYSLIP</div>
    <div class="period">Pay Period: ${month} ${year}</div>
  </div>
  <div class="section">
    <div class="section-title">Employee Details</div>
    <div class="info-grid">
      <div class="info-row"><span class="info-label">Name:</span><span class="info-value">${teacherName}</span></div>
      <div class="info-row"><span class="info-label">Role:</span><span class="info-value">${role || "—"}</span></div>
      <div class="info-row"><span class="info-label">Month:</span><span class="info-value">${month} ${year}</span></div>
      <div class="info-row"><span class="info-label">Date Issued:</span><span class="info-value">${today}</span></div>
    </div>
  </div>
  <div class="section">
    <div class="section-title">Earnings &amp; Deductions</div>
    <table>
      <thead><tr><th>Description</th><th style="text-align:right">Amount (₦)</th></tr></thead>
      <tbody>
        <tr><td>Gross Salary</td><td class="amount">${fmtAmt(gross)}</td></tr>
        ${Number(other) > 0 ? `<tr><td>Deductions</td><td class="amount" style="color:#dc2626">(${fmtAmt(other)})</td></tr>` : ""}
        <tr class="net-row"><td>NET PAY</td><td class="amount" style="color:#4c1d95">₦${fmtAmt(net)}</td></tr>
      </tbody>
    </table>
  </div>
  <div class="bank-section">
    <div class="section-title" style="margin-bottom:8px">Bank Details</div>
    <div class="info-grid">
      <div class="info-row"><span class="info-label">Bank Name:</span><span class="info-value">${bankName || "—"}</span></div>
      <div class="info-row"><span class="info-label">Account Number:</span><span class="info-value">${accountNumber || "—"}</span></div>
      <div class="info-row"><span class="info-label">Account Name:</span><span class="info-value">${accountName || "—"}</span></div>
    </div>
  </div>
  <div class="signature-section">
    <div class="sig-box">Prepared By (Accounts)</div>
    <div class="sig-box">Authorised By (Principal)</div>
  </div>
  <div class="footer">
    This is a computer-generated payslip. Please contact admin for any discrepancies.<br/>
    ${displaySchool} — Confidential
  </div>
</body>
</html>`;

  const win = window.open("", "_blank", "width=700,height=900,toolbar=0,menubar=0,scrollbars=1");
  if (!win) { alert("Pop-up blocked! Please allow pop-ups to print payslips."); return; }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}

// ── Print full payroll run report (all staff, one page) ───────────────────────
function printRunReport(run, schoolName) {
  const displaySchool = (run.schoolName || schoolName || BRAND.schoolName.toUpperCase()).toUpperCase();
  const fmtAmt = (n) =>
    Number(n || 0).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const today = formatDateInLagos(new Date(), {
    day: "2-digit", month: "long", year: "numeric",
  });
  const rows = (run.items || [])
    .filter(i => i.configured)
    .map(i => `
      <tr>
        <td>${i.teacherName}</td>
        <td>${i.role || "—"}</td>
        <td style="text-align:right">${fmtAmt(i.gross)}</td>
        <td style="text-align:right;color:#dc2626">${Number(i.other) > 0 ? `(${fmtAmt(i.other)})` : "—"}</td>
        <td style="text-align:right;font-weight:700;color:#4c1d95">${fmtAmt(i.net)}</td>
        <td>${i.bankName || "—"}</td>
        <td>${i.accountNumber || "—"}</td>
        <td>${i.accountName || "—"}</td>
      </tr>`)
    .join("");

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>Payroll Report – ${run.month} ${run.year}</title>
  <style>
    @page { size: A4 landscape; margin: 15mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #111; }
    .header { text-align: center; border-bottom: 3px solid #4c1d95; padding-bottom: 12px; margin-bottom: 16px; }
    .school-name { font-size: 18px; font-weight: 900; color: #4c1d95; text-transform: uppercase; }
    .report-title { font-size: 13px; font-weight: 700; letter-spacing: 2px; color: #555; margin-top: 4px; }
    .meta { font-size: 11px; color: #666; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 10px; }
    th { background: #4c1d95; color: #fff; padding: 7px 10px; text-align: left; }
    td { padding: 7px 10px; border-bottom: 1px solid #eee; }
    tr:nth-child(even) td { background: #faf5ff; }
    tfoot td { background: #4c1d95 !important; color: #fff; font-weight: 700; padding: 8px 10px; }
    .footer { text-align: center; margin-top: 16px; font-size: 10px; color: #888; }
    .sig { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 40px; margin-top: 30px; }
    .sig-box { border-top: 1px solid #999; padding-top: 6px; font-size: 10px; color: #555; }
  </style>
</head>
<body>
  <div class="header">
    <div class="school-name">${displaySchool}</div>
    <div class="report-title">PAYROLL SUMMARY REPORT</div>
    <div class="meta">Pay Period: ${run.month} ${run.year} &nbsp;|&nbsp; Status: ${run.status.toUpperCase()} &nbsp;|&nbsp; Printed: ${today}</div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Name</th><th>Role</th>
        <th style="text-align:right">Gross (₦)</th>
        <th style="text-align:right">Deductions</th>
        <th style="text-align:right">Net Pay (₦)</th>
        <th>Bank</th><th>Account No</th><th>Account Name</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr>
        <td colspan="2">TOTALS (${run.staffCount} staff)</td>
        <td style="text-align:right">${fmtAmt(run.total_gross)}</td>
        <td style="text-align:right">${fmtAmt((run.total_gross || 0) - (run.total_net || 0))}</td>
        <td style="text-align:right">${fmtAmt(run.total_net)}</td>
        <td colspan="3"></td>
      </tr>
    </tfoot>
  </table>
  <div class="sig">
    <div class="sig-box">Prepared By (Accounts)</div>
    <div class="sig-box">Reviewed By (Admin)</div>
    <div class="sig-box">Authorised By (Principal)</div>
  </div>
  <div class="footer">${displaySchool} — Payroll Report — Confidential</div>
</body>
</html>`;

  const win = window.open("", "_blank", "width=1000,height=800,toolbar=0,menubar=0,scrollbars=1");
  if (!win) { alert("Pop-up blocked! Please allow pop-ups for printing."); return; }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}

// ── Status Badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    draft:     "bg-slate-100 text-slate-600",
    approved:  "bg-blue-100 text-blue-700",
    disbursed: "bg-emerald-100 text-emerald-700",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${map[status] || map.draft}`}>
      {status}
    </span>
  );
}

// ── Create Payroll Run Modal ──────────────────────────────────────────────────
function CreateRunModal({ isOpen, onClose, teachers, salaryConfigMap, existingRuns, onCreate, schoolName }) {
  const currentYear = getLagosYear();
  const [month, setMonth]   = useState(MONTHS[getLagosMonthIndex()]);
  const [year, setYear]     = useState(String(currentYear));
  const [notes, setNotes]   = useState("");

  const duplicate = existingRuns.some(r => r.month === month && String(r.year) === String(year));

  const items = teachers.map((t) => {
    const cfg = salaryConfigMap[t.id] || {};
    const gross            = Number(cfg.gross) || 0;
    const other_deductions = Number(cfg.other_deductions) || 0;
    const net              = calcNet(gross, other_deductions);
    return {
      teacherId:    t.id,
      teacherName:  `${t.first_name || ""} ${t.last_name || ""}`.trim(),
      role:         t.role || t.subject || "Teacher",
      phone:        t.phone || "",
      gross,
      other:        other_deductions,
      net,
      bankName:     cfg.bank_name    || "",
      bankCode:     cfg.bank_code    || "",
      accountNumber: cfg.account_number || "",
      accountName:  cfg.account_name || "",
      flwVerified:  cfg.flw_verified || false,
      configured:   gross > 0,
    };
  });

  const totalGross      = items.reduce((s, i) => s + i.gross, 0);
  const totalNet        = items.reduce((s, i) => s + i.net, 0);
  const totalDeductions = totalGross - totalNet;
  const unconfigured    = items.filter((i) => !i.configured).length;

  function handleCreate() {
    const run = {
      month,
      year,
      notes,
      status:     "draft",
      items,
      staff_count: items.filter((i) => i.configured).length,
      total_gross: totalGross,
      total_net:   totalNet,
      school_name: schoolName || BRAND.schoolName.toUpperCase(),
    };
    onCreate(run);
    setNotes("");
  }

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-emerald-900">
            <Banknote className="w-5 h-5" />
            Create New Payroll Run
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Month</label>
              <select
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              >
                {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Year</label>
              <Input
                type="number" value={year}
                onChange={(e) => setYear(e.target.value)}
                min="2020" max="2100"
              />
            </div>
          </div>

          {duplicate && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              A payroll run for <strong>{month} {year}</strong> already exists. Creating another will result in a duplicate.
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="E.g. Includes 13th month bonus…"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none"
            />
          </div>

          {unconfigured > 0 && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-700">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              {unconfigured} staff member(s) have no salary configured and will show ₦0.
            </div>
          )}

          <div>
            <p className="text-sm font-semibold text-slate-700 mb-2">Payroll Preview</p>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-emerald-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-emerald-800">Staff</th>
                    <th className="px-3 py-2 text-right font-semibold text-emerald-800">Gross</th>
                    <th className="px-3 py-2 text-right font-semibold text-emerald-800">Deductions</th>
                    <th className="px-3 py-2 text-right font-semibold text-emerald-800">Net Pay</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.teacherId} className={`border-t border-slate-100 ${!item.configured ? "bg-amber-50" : ""}`}>
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-800">{item.teacherName}</div>
                        <div className="text-xs text-slate-500">{item.role}</div>
                        {!item.configured && <span className="text-xs text-amber-600 font-medium">No salary configured</span>}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-700">{fmt(item.gross)}</td>
                      <td className="px-3 py-2 text-right text-red-600">{fmt(item.other)}</td>
                      <td className="px-3 py-2 text-right font-semibold text-emerald-700">{fmt(item.net)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-emerald-50 font-bold text-sm">
                  <tr className="border-t-2 border-emerald-200">
                    <td className="px-3 py-2 text-emerald-800">Totals</td>
                    <td className="px-3 py-2 text-right text-emerald-800">{fmt(totalGross)}</td>
                    <td className="px-3 py-2 text-right text-red-600">{fmt(totalDeductions)}</td>
                    <td className="px-3 py-2 text-right text-emerald-800">{fmt(totalNet)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 mt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleCreate}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Plus className="w-4 h-4 mr-1" />
            {duplicate ? "Create Anyway" : "Create Payroll Run"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Run Detail Row (expanded) ─────────────────────────────────────────────────
function RunDetail({ run, schoolName, onDisburse, onRefreshStatus, disbursingRun, refreshingRun }) {
  const pendingRefs = (run.items || [])
    .filter(i => i.transferReference && (i.transferStatus === "PENDING" || i.transferStatus === "NEW"))
    .map(i => i.transferReference);

  return (
    <div className="px-4 pb-4 pt-2 bg-slate-50 border-t border-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Staff Payslip Detail — {run.month} {run.year}
        </p>
        <div className="flex gap-2">
          {pendingRefs.length > 0 && (
            <button
              onClick={() => onRefreshStatus(run)}
              disabled={refreshingRun === run.id}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-50 transition-colors"
            >
              {refreshingRun === run.id
                ? <><Loader2 className="w-3 h-3 animate-spin" /> Refreshing…</>
                : <><RefreshCw className="w-3 h-3" /> Refresh Status</>}
            </button>
          )}
          {run.status === "approved" && (
            <button
              onClick={() => onDisburse(run)}
              disabled={disbursingRun === run.id}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {disbursingRun === run.id
                ? <><Loader2 className="w-3 h-3 animate-spin" /> Disbursing…</>
                : <><Send className="w-3 h-3" /> Disburse via Flutterwave</>}
            </button>
          )}
          <button
            onClick={() => printRunReport(run, schoolName)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors"
          >
            <FileText className="w-3 h-3" /> Export PDF
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-xs">
          <thead className="bg-emerald-50">
            <tr>
              {["Staff","Role","Gross","Deductions","Net Pay","Bank","Acc No","Transfer",""].map((h) => (
                <th key={h} className="px-3 py-2 text-left font-semibold text-emerald-800 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {run.items.map((item) => (
              <tr key={item.teacherId} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-3 py-2 font-medium text-slate-800 whitespace-nowrap">{item.teacherName}</td>
                <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{item.role}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">{fmt(item.gross)}</td>
                <td className="px-3 py-2 text-right text-red-500 whitespace-nowrap">{fmt(item.other)}</td>
                <td className="px-3 py-2 text-right font-bold text-emerald-700 whitespace-nowrap">{fmt(item.net)}</td>
                <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{item.bankName || "—"}</td>
                <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{item.accountNumber || "—"}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {item.transferStatus === "SUCCESSFUL" ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                      <CheckCircle className="w-3 h-3" /> Sent
                    </span>
                  ) : item.transferStatus === "FAILED" ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded-full">
                      <AlertCircle className="w-3 h-3" /> Failed
                    </span>
                  ) : item.transferStatus === "NEW" || item.transferStatus === "PENDING" ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                      <Loader2 className="w-3 h-3 animate-spin" /> Processing
                    </span>
                  ) : item.bankCode && item.accountNumber ? (
                    <span className="text-xs text-slate-400">Ready</span>
                  ) : (
                    <span className="text-xs text-amber-500">No bank details</span>
                  )}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                    onClick={() => printPayslip({
                      teacherName: item.teacherName, role: item.role,
                      month: run.month, year: run.year,
                      gross: item.gross, other: item.other, net: item.net,
                      bankName: item.bankName, accountNumber: item.accountNumber,
                      accountName: item.accountName,
                      schoolName: run.school_name || run.schoolName || schoolName,
                    })}
                  >
                    <Printer className="w-3 h-3 mr-1" />Slip
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═════════════════════════════════════════════════════════════════════════════
export default function Payroll() {
  const { user }          = useAuth();
  const { schoolName, smsSenderId } = useSchoolSettings();
  const { toast }         = useToast();

  // ── Super admin guard ───────────────────────────────────────────────────────
  if (user?.school_role !== "super_admin") {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center space-y-3">
          <Shield className="w-16 h-16 text-slate-300 mx-auto" />
          <h2 className="text-xl font-bold text-slate-700">Access Restricted</h2>
          <p className="text-slate-500">This section is only accessible to Super Admins.</p>
        </div>
      </div>
    );
  }

  // ── State ───────────────────────────────────────────────────────────────────
  const [activeTab,         setActiveTab]         = usePersistentState("payroll_tab", "salaries");
  const [teachers,          setTeachers]          = useState([]);
  const [loadingTeachers,   setLoadingTeachers]   = useState(true);
  const [salaryConfigs,     setSalaryConfigs]     = useState([]);
  const [runs,              setRuns]              = useState([]);
  const [loadingData,       setLoadingData]       = useState(true);

  // inline edit rows
  const [editingRows,       setEditingRows]       = useState({});

  // modals / dialogs
  const [showCreateModal,   setShowCreateModal]   = useState(false);
  const [expandedRunId,     setExpandedRunId]     = useState(null);
  const [confirmApprove,    setConfirmApprove]    = useState(null);
  const [confirmDelete,     setConfirmDelete]     = useState(null);
  const [confirmBulkApprove, setConfirmBulkApprove] = useState(false);

  // transfer ops
  const [verifying,         setVerifying]         = useState({});
  const [disbursingRun,     setDisbursingRun]     = useState(null);
  const [refreshingRun,     setRefreshingRun]     = useState(null);

  // run list filters
  const [filterYear,        setFilterYear]        = usePersistentState("payroll_filter_year", "all");
  const [filterStatus,      setFilterStatus]      = usePersistentState("payroll_filter_status", "all");

  // absence calculator (per editing row)
  const [absenceDays,       setAbsenceDays]       = useState({});

  // derived map: teacherId → config record
  const salaryConfigMap = useMemo(
    () => Object.fromEntries(salaryConfigs.map(c => [c.teacher_id, c])),
    [salaryConfigs]
  );

  // ── Load data (Supabase + one-time localStorage migration) ──────────────────
  useEffect(() => {
    async function init() {
      // Load teachers
      Teacher.list()
        .then(data => setTeachers((data || []).filter(isActiveTeacher)))
        .catch(() => toast({ title: "Could not load staff", variant: "destructive" }))
        .finally(() => setLoadingTeachers(false));

      // Load salary configs + runs from Supabase
      try {
        const [configs, runsData] = await Promise.all([
          PayrollSalaryConfig.list('-created_at'),
          PayrollRun.list('-created_at'),
        ]);

        // One-time migration: if Supabase is empty but localStorage has data
        let finalConfigs = configs;
        if (configs.length === 0) {
          try {
            const local = JSON.parse(localStorage.getItem(LEGACY_SALARY_KEY) || "{}");
            if (Object.keys(local).length > 0) {
              const created = await Promise.all(
                Object.entries(local).map(([tid, cfg]) =>
                  PayrollSalaryConfig.create({
                    teacher_id:       tid,
                    gross:            cfg.gross            || 0,
                    other_deductions: cfg.other_deductions || 0,
                    bank_code:        cfg.bank_code        || "",
                    bank_name:        cfg.bank_name        || "",
                    account_number:   cfg.account_number   || "",
                    account_name:     cfg.account_name     || "",
                    flw_verified:     cfg.flw_verified      || false,
                  }).catch(() => null)
                )
              );
              finalConfigs = created.filter(Boolean);
              localStorage.removeItem(LEGACY_SALARY_KEY);
            }
          } catch { /* ignore migration errors */ }
        }

        let finalRuns = runsData;
        if (runsData.length === 0) {
          try {
            const localRuns = JSON.parse(localStorage.getItem(LEGACY_RUNS_KEY) || "[]");
            if (localRuns.length > 0) {
              const created = await Promise.all(
                localRuns.map(r =>
                  PayrollRun.create({
                    month:       r.month,
                    year:        r.year,
                    notes:       r.notes       || "",
                    status:      r.status      || "draft",
                    items:       r.items       || [],
                    staff_count: r.staffCount  || 0,
                    total_gross: r.totalGross  || 0,
                    total_net:   r.totalNet    || 0,
                    school_name: r.schoolName  || "",
                  }).catch(() => null)
                )
              );
              finalRuns = created.filter(Boolean).reverse();
              localStorage.removeItem(LEGACY_RUNS_KEY);
            }
          } catch { /* ignore */ }
        }

        setSalaryConfigs(finalConfigs);
        setRuns(finalRuns);
      } catch {
        toast({ title: "Could not load payroll data", variant: "destructive" });
      } finally {
        setLoadingData(false);
      }
    }
    init();
  }, []);

  // ── Salary config helpers ───────────────────────────────────────────────────
  const DEFAULT_CFG = {
    gross: 0, other_deductions: 0,
    bank_code: "", bank_name: "", account_number: "", account_name: "", flw_verified: false,
  };

  function getSalaryCfg(teacherId) {
    return salaryConfigMap[teacherId] || DEFAULT_CFG;
  }

  function startEdit(teacherId) {
    setEditingRows(prev => ({ ...prev, [teacherId]: { ...getSalaryCfg(teacherId) } }));
    setAbsenceDays(prev => ({ ...prev, [teacherId]: "" }));
  }

  function cancelEdit(teacherId) {
    setEditingRows(prev => { const n = { ...prev }; delete n[teacherId]; return n; });
  }

  function handleEditChange(teacherId, field, value) {
    setEditingRows(prev => ({ ...prev, [teacherId]: { ...prev[teacherId], [field]: value } }));
  }

  // Absence calculator: fill in deduction amount from absent days
  function applyAbsenceDeduction(teacherId) {
    const cfg   = editingRows[teacherId] || {};
    const gross = Number(cfg.gross) || 0;
    const days  = Number(absenceDays[teacherId]) || 0;
    if (gross <= 0 || days <= 0) return;
    const dailyRate  = gross / 22;
    const deduction  = Math.round(dailyRate * days);
    const prev       = Number(cfg.other_deductions) || 0;
    handleEditChange(teacherId, "other_deductions", prev + deduction);
    setAbsenceDays(prev => ({ ...prev, [teacherId]: "" }));
    toast({ title: `Absence deduction added`, description: `${days} day(s) × ₦${Math.round(dailyRate).toLocaleString()}/day = ₦${deduction.toLocaleString()}` });
  }

  async function saveRow(teacherId) {
    const cfg      = editingRows[teacherId];
    const existing = salaryConfigMap[teacherId];
    try {
      let saved;
      if (existing?.id) {
        saved = await PayrollSalaryConfig.update(existing.id, {
          gross:            cfg.gross,
          other_deductions: cfg.other_deductions,
          bank_code:        cfg.bank_code,
          bank_name:        cfg.bank_name,
          account_number:   cfg.account_number,
          account_name:     cfg.account_name,
          flw_verified:     cfg.flw_verified,
        });
        setSalaryConfigs(prev => prev.map(c => c.id === existing.id ? saved : c));
      } else {
        saved = await PayrollSalaryConfig.create({
          teacher_id:       teacherId,
          gross:            cfg.gross,
          other_deductions: cfg.other_deductions,
          bank_code:        cfg.bank_code,
          bank_name:        cfg.bank_name,
          account_number:   cfg.account_number,
          account_name:     cfg.account_name,
          flw_verified:     cfg.flw_verified,
        });
        setSalaryConfigs(prev => [...prev, saved]);
      }
      cancelEdit(teacherId);
      toast({ title: "Salary saved", description: "Staff salary configuration updated." });
    } catch (err) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    }
  }

  async function handleVerifyAccount(teacherId) {
    const cfg = editingRows[teacherId];
    if (!cfg?.account_number || !cfg?.bank_code) {
      toast({ title: "Missing details", description: "Enter account number and select a bank first.", variant: "destructive" });
      return;
    }
    setVerifying(prev => ({ ...prev, [teacherId]: true }));
    try {
      const verified = await flutterwaveVerifyAccount({ accountNumber: cfg.account_number, bankCode: cfg.bank_code });
      handleEditChange(teacherId, "account_name", verified.account_name);
      handleEditChange(teacherId, "flw_verified", true);
      toast({ title: "Account verified ✓", description: `${verified.account_name} confirmed via Flutterwave.`, className: "border-emerald-300 bg-emerald-50 text-emerald-900" });
    } catch (err) {
      toast({ title: "Verification failed", description: err.message, variant: "destructive" });
    } finally {
      setVerifying(prev => ({ ...prev, [teacherId]: false }));
    }
  }

  // ── Payroll run helpers ─────────────────────────────────────────────────────
  async function handleCreateRun(runData) {
    try {
      const saved = await PayrollRun.create(runData);
      setRuns(prev => [saved, ...prev]);
      setShowCreateModal(false);
      toast({ title: "Payroll run created", description: `${runData.month} ${runData.year} — draft saved.` });
    } catch (err) {
      toast({ title: "Could not create run", description: err.message, variant: "destructive" });
    }
  }

  async function approveRun(id) {
    try {
      const updated = await PayrollRun.update(id, { status: "approved" });
      setRuns(prev => prev.map(r => r.id === id ? updated : r));
      setConfirmApprove(null);
      toast({ title: "Payroll approved", description: "Run status set to Approved." });
    } catch (err) {
      toast({ title: "Approve failed", description: err.message, variant: "destructive" });
    }
  }

  async function handleBulkApprove() {
    const draftIds = runs.filter(r => r.status === "draft").map(r => r.id);
    if (draftIds.length === 0) return;
    try {
      const updated = await Promise.all(draftIds.map(id => PayrollRun.update(id, { status: "approved" })));
      setRuns(prev => prev.map(r => {
        const u = updated.find(u => u.id === r.id);
        return u || r;
      }));
      setConfirmBulkApprove(false);
      toast({ title: `${draftIds.length} run(s) approved` });
    } catch (err) {
      toast({ title: "Bulk approve failed", description: err.message, variant: "destructive" });
    }
  }

  async function deleteRun(id) {
    try {
      await PayrollRun.delete(id);
      setRuns(prev => prev.filter(r => r.id !== id));
      setConfirmDelete(null);
      toast({ title: "Payroll run deleted" });
    } catch (err) {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    }
  }

  async function handleDisburseRun(run) {
    setDisbursingRun(run.id);
    try {
      const validItems = run.items.filter(i => i.bankCode && i.accountNumber && i.net > 0);
      if (validItems.length === 0) {
        toast({ title: "No payable staff", description: "No staff with bank details and net pay > 0.", variant: "destructive" });
        return;
      }

      const transfers = validItems.map(item => ({
        accountNumber: item.accountNumber,
        bankCode:      item.bankCode,
        amountNaira:   item.net,
        narration:     `Salary - ${run.month} ${run.year}`,
        staffName:     item.teacherName,
      }));

      const result     = await flutterwaveDisburse(transfers);
      const statusMap  = {};
      (result.results || []).forEach(r => { statusMap[r.staffName] = r; });

      const updatedItems = run.items.map(item => ({
        ...item,
        transferReference: statusMap[item.teacherName]?.reference || item.transferReference,
        transferStatus:    statusMap[item.teacherName]?.status    || item.transferStatus || "PENDING",
        transferId:        statusMap[item.teacherName]?.id        || item.transferId,
      }));

      const updated = await PayrollRun.update(run.id, {
        status: "disbursed",
        items:  updatedItems,
      });
      setRuns(prev => prev.map(r => r.id === run.id ? updated : r));

      // SMS notifications to staff with phone numbers
      const toNotify = validItems.filter(i => i.phone);
      if (toNotify.length > 0) {
        await Promise.allSettled(
          toNotify.map(item =>
            sendSMS({
              phoneNumbers: [item.phone],
              message:      `Dear ${item.teacherName.split(" ")[0]}, your salary of ${fmt(item.net)} for ${run.month} ${run.year} has been transferred to your ${item.bankName || "bank"} account. — TOPS`,
              messageType:  "payroll",
              senderId:     smsSenderId || BRAND.smsSenderId,
            })
          )
        );
      }

      toast({
        title:       "Disbursement initiated",
        description: `${validItems.length} transfer${validItems.length !== 1 ? "s" : ""} sent via Flutterwave.${toNotify.length > 0 ? ` ${toNotify.length} staff notified by SMS.` : ""}`,
        className:   "border-emerald-300 bg-emerald-50 text-emerald-900",
      });
    } catch (err) {
      toast({ title: "Disbursement failed", description: err.message, variant: "destructive" });
    } finally {
      setDisbursingRun(null);
    }
  }

  async function handleRefreshStatus(run) {
    const pendingItems = run.items.filter(
      i => i.transferReference && (i.transferStatus === "PENDING" || i.transferStatus === "NEW")
    );
    if (pendingItems.length === 0) return;

    setRefreshingRun(run.id);
    try {
      const refs    = pendingItems.map(i => i.transferReference);
      const results = await flutterwaveCheckStatus(refs);
      const statusMap = Object.fromEntries(results.map(r => [r.reference, r.status]));

      const updatedItems = run.items.map(item =>
        item.transferReference && statusMap[item.transferReference]
          ? { ...item, transferStatus: statusMap[item.transferReference] }
          : item
      );

      const updated = await PayrollRun.update(run.id, { items: updatedItems });
      setRuns(prev => prev.map(r => r.id === run.id ? updated : r));
      toast({ title: "Status refreshed", description: "Transfer statuses updated from Flutterwave." });
    } catch (err) {
      toast({ title: "Refresh failed", description: err.message, variant: "destructive" });
    } finally {
      setRefreshingRun(null);
    }
  }

  function printAllPayslips(run) {
    run.items.forEach((item, i) =>
      setTimeout(() => printPayslip({
        teacherName: item.teacherName, role: item.role,
        month: run.month, year: run.year,
        gross: item.gross, other: item.other, net: item.net,
        bankName: item.bankName, accountNumber: item.accountNumber,
        accountName: item.accountName,
        schoolName: run.school_name || run.schoolName || schoolName,
      }), i * 300)
    );
  }

  // ── Derived summary stats ───────────────────────────────────────────────────
  const configuredCount      = teachers.filter(t => (salaryConfigMap[t.id]?.gross || 0) > 0).length;
  const totalMonthlyNet      = teachers.reduce((s, t) => {
    const cfg = salaryConfigMap[t.id] || {};
    return s + calcNet(cfg.gross, cfg.other_deductions);
  }, 0);
  const draftCount           = runs.filter(r => r.status === "draft").length;
  const lastDisbursedRun     = runs.find(r => r.status === "disbursed");
  const allYears             = [...new Set(runs.map(r => String(r.year)))].sort((a, b) => b - a);

  // ── Filtered runs ───────────────────────────────────────────────────────────
  const filteredRuns = useMemo(() => runs.filter(r => {
    if (filterYear   !== "all" && String(r.year)   !== filterYear)   return false;
    if (filterStatus !== "all" && r.status !== filterStatus) return false;
    return true;
  }), [runs, filterYear, filterStatus]);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      <Toaster />

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
            <Banknote className="w-8 h-8 text-emerald-600" />
            Payroll Management
          </h1>
          <p className="text-slate-500 mt-1 text-sm">Staff salaries, payroll runs, and payslip printing</p>
        </div>
        <Button
          onClick={() => setShowCreateModal(true)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-md"
        >
          <Plus className="w-4 h-4 mr-2" />
          Run New Payroll
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-emerald-600 to-emerald-700 text-white border-0 shadow-lg">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-emerald-200 text-xs font-medium uppercase tracking-wide">Staff Configured</p>
              <p className="text-3xl font-bold mt-1">{configuredCount}</p>
              <p className="text-emerald-200 text-xs">of {teachers.length} total</p>
            </div>
            <Users className="w-9 h-9 text-emerald-300 opacity-60" />
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white border-0 shadow-lg">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-emerald-100 text-xs font-medium uppercase tracking-wide">Monthly Net Payroll</p>
              <p className="text-xl font-bold mt-1">{fmt(totalMonthlyNet)}</p>
              <p className="text-emerald-100 text-xs">total net pay</p>
            </div>
            <TrendingUp className="w-9 h-9 text-emerald-200 opacity-60" />
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white border-0 shadow-lg">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-xs font-medium uppercase tracking-wide">Pending Approval</p>
              <p className="text-3xl font-bold mt-1">{draftCount}</p>
              <p className="text-blue-100 text-xs">{runs.filter(r=>r.status==="disbursed").length} disbursed</p>
            </div>
            <DollarSign className="w-9 h-9 text-blue-200 opacity-60" />
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-amber-500 to-orange-600 text-white border-0 shadow-lg">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-amber-100 text-xs font-medium uppercase tracking-wide">Last Disbursed</p>
              <p className="text-sm font-bold mt-1 leading-tight">
                {lastDisbursedRun ? `${lastDisbursedRun.month} ${lastDisbursedRun.year}` : "None yet"}
              </p>
              <p className="text-amber-100 text-xs">{lastDisbursedRun ? fmt(lastDisbursedRun.total_net) : "—"}</p>
            </div>
            <Clock className="w-9 h-9 text-amber-200 opacity-60" />
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {["salaries","runs"].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all capitalize ${
              activeTab === tab ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {tab === "salaries" ? "Staff Salaries" : `Payroll Runs${runs.length > 0 ? ` (${runs.length})` : ""}`}
          </button>
        ))}
      </div>

      {/* ── TAB 1: Staff Salaries ──────────────────────────────────────────── */}
      {activeTab === "salaries" && (
        <Card className="bg-white border border-slate-200 shadow-sm">
          <CardHeader className="border-b border-slate-100 pb-4">
            <CardTitle className="text-slate-800">Staff Salary Configuration</CardTitle>
            <p className="text-xs text-slate-500 mt-0.5">
              Edit each row to configure gross pay, deductions, and bank details. All data is saved to the cloud.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            {loadingTeachers || loadingData ? (
              <div className="p-8 text-center">
                <div className="w-8 h-8 border-4 border-emerald-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-slate-500 text-sm">Loading…</p>
              </div>
            ) : teachers.length === 0 ? (
              <div className="p-12 text-center">
                <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500">No teachers found.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-emerald-50">
                    <tr>
                      {["Name","Role","Gross (₦)","Deductions (₦)","Net Pay","Bank","Acc Number","Acc Name","Actions"].map(h => (
                        <th key={h} className="px-2 py-2.5 text-left text-xs font-semibold text-emerald-700 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {teachers.map(teacher => {
                      const isEditing  = !!editingRows[teacher.id];
                      const cfg        = isEditing ? editingRows[teacher.id] : getSalaryCfg(teacher.id);
                      const gross      = Number(cfg.gross) || 0;
                      const ded        = Number(cfg.other_deductions) || 0;
                      const net        = calcNet(gross, ded);
                      const fullName   = `${teacher.first_name || ""} ${teacher.last_name || ""}`.trim();
                      const dailyRate  = gross > 0 ? Math.round(gross / 22) : 0;
                      const absDays    = Number(absenceDays[teacher.id]) || 0;

                      return (
                        <tr key={teacher.id}
                          className={`border-t border-slate-100 transition-colors ${isEditing ? "bg-emerald-50/60" : "hover:bg-slate-50"}`}
                        >
                          <td className="px-2 py-2 font-medium text-slate-800 whitespace-nowrap text-sm">{fullName || "—"}</td>
                          <td className="px-2 py-2 text-slate-500 whitespace-nowrap text-xs">{teacher.role || teacher.subject || "Teacher"}</td>

                          {/* Gross */}
                          <td className="px-2 py-2 whitespace-nowrap">
                            {isEditing ? (
                              <Input type="number" min="0" value={cfg.gross}
                                onChange={e => handleEditChange(teacher.id, "gross", e.target.value)}
                                className="w-24 h-7 text-xs"
                              />
                            ) : (
                              <span className={`text-xs ${gross === 0 ? "text-slate-400 italic" : "text-slate-700"}`}>{fmt(gross)}</span>
                            )}
                          </td>

                          {/* Deductions with absence calculator */}
                          <td className="px-2 py-2 whitespace-nowrap">
                            {isEditing ? (
                              <div className="space-y-1">
                                <Input type="number" min="0" value={cfg.other_deductions}
                                  onChange={e => handleEditChange(teacher.id, "other_deductions", e.target.value)}
                                  className="w-24 h-7 text-xs"
                                />
                                {gross > 0 && (
                                  <div className="inline-flex items-center gap-0.5 bg-amber-50 border border-amber-200 rounded px-1 py-0.5 w-fit">
                                    <Calendar className="w-2.5 h-2.5 text-amber-600 flex-shrink-0" />
                                    <input
                                      type="number" min="1" max="31"
                                      value={absenceDays[teacher.id] || ""}
                                      onChange={e => setAbsenceDays(prev => ({ ...prev, [teacher.id]: e.target.value }))}
                                      placeholder="d"
                                      className="w-6 text-xs bg-transparent outline-none text-amber-700"
                                    />
                                    <button
                                      onClick={() => applyAbsenceDeduction(teacher.id)}
                                      disabled={absDays <= 0}
                                      className="text-xs text-amber-700 font-semibold hover:underline disabled:opacity-40 whitespace-nowrap"
                                      title={`Add absence deduction (₦${(dailyRate * absDays).toLocaleString()})`}
                                    >+Add</button>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-600">{fmt(ded)}</span>
                            )}
                          </td>

                          {/* Net */}
                          <td className="px-2 py-2 whitespace-nowrap font-semibold text-xs text-emerald-700">{fmt(net)}</td>

                          {/* Bank */}
                          <td className="px-2 py-2 whitespace-nowrap">
                            {isEditing ? (
                              <Select
                                value={cfg.bank_code || ""}
                                onValueChange={v => {
                                  const bank = NG_BANKS.find(b => b.code === v);
                                  handleEditChange(teacher.id, "bank_code", v);
                                  handleEditChange(teacher.id, "bank_name", bank?.name || "");
                                  handleEditChange(teacher.id, "flw_verified", false);
                                }}
                              >
                                <SelectTrigger className="w-32 h-7 text-xs">
                                  <SelectValue placeholder="Select bank" />
                                </SelectTrigger>
                                <SelectContent>
                                  {NG_BANKS.map(b => (
                                    <SelectItem key={b.code} value={b.code}>{b.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <span className="text-xs text-slate-600">{cfg.bank_name || "—"}</span>
                            )}
                          </td>

                          {/* Account Number */}
                          <td className="px-2 py-2 whitespace-nowrap">
                            {isEditing ? (
                              <div>
                                <Input type="text" value={cfg.account_number || ""}
                                  onChange={e => handleEditChange(teacher.id, "account_number", e.target.value)}
                                  placeholder="0000000000"
                                  className="w-24 h-7 text-xs"
                                />
                                <div className="flex items-center gap-1 mt-1">
                                  <button
                                    type="button"
                                    onClick={() => handleVerifyAccount(teacher.id)}
                                    disabled={verifying[teacher.id] || !cfg.account_number || !cfg.bank_code}
                                    className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                  >
                                    {verifying[teacher.id]
                                      ? <Loader2 className="w-3 h-3 animate-spin" />
                                      : <><BadgeCheck className="w-3 h-3" /><span>Verify</span></>}
                                  </button>
                                  {cfg.flw_verified && <BadgeCheck className="w-3 h-3 text-emerald-500" title="Verified" />}
                                </div>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-500">{cfg.account_number || "—"}</span>
                            )}
                          </td>

                          {/* Account Name */}
                          <td className="px-2 py-2 whitespace-nowrap">
                            {isEditing ? (
                              <Input type="text" value={cfg.account_name || ""}
                                onChange={e => handleEditChange(teacher.id, "account_name", e.target.value)}
                                placeholder="Account name"
                                className="w-28 h-7 text-xs"
                              />
                            ) : (
                              <div className="flex items-center gap-1">
                                <span className="text-xs text-slate-600">{cfg.account_name || "—"}</span>
                                {cfg.flw_verified && (
                                  <BadgeCheck className="w-3 h-3 text-emerald-500 flex-shrink-0" title="Verified" />
                                )}
                              </div>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="px-2 py-2 whitespace-nowrap">
                            {isEditing ? (
                              <div className="flex gap-1">
                                <Button size="sm" onClick={() => saveRow(teacher.id)}
                                  className="h-7 px-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs">
                                  <Save className="w-3 h-3 mr-1" />Save
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => cancelEdit(teacher.id)}
                                  className="h-7 px-2 text-xs">
                                  <X className="w-3 h-3" />
                                </Button>
                              </div>
                            ) : (
                              <Button size="sm" variant="outline" onClick={() => startEdit(teacher.id)}
                                className="h-7 px-2 text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50">
                                <Pencil className="w-3 h-3 mr-1" />Edit
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {!loadingTeachers && !loadingData && teachers.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-emerald-50 border-t border-emerald-100 text-sm">
                <span className="text-emerald-700 font-medium">
                  <span className="font-bold">{configuredCount}</span> of {teachers.length} staff configured
                </span>
                <span className="text-emerald-700 font-medium">
                  Total monthly net payroll: <span className="font-bold text-emerald-900">{fmt(totalMonthlyNet)}</span>
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── TAB 2: Payroll Runs ─────────────────────────────────────────────── */}
      {activeTab === "runs" && (
        <Card className="bg-white border border-slate-200 shadow-sm">
          <CardHeader className="border-b border-slate-100 pb-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="text-slate-800">Payroll Runs</CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">Manage, approve, and disburse monthly payroll runs.</p>
              </div>
              {draftCount > 0 && (
                <Button
                  size="sm"
                  className="h-8 px-3 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={() => setConfirmBulkApprove(true)}
                >
                  <CheckCircle className="w-3.5 h-3.5 mr-1" />
                  Approve All ({draftCount} draft{draftCount !== 1 ? "s" : ""})
                </Button>
              )}
            </div>

            {/* Filter bar */}
            {runs.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <Filter className="w-4 h-4 text-slate-400" />
                <select
                  value={filterYear}
                  onChange={e => setFilterYear(e.target.value)}
                  className="border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-400"
                >
                  <option value="all">All Years</option>
                  {allYears.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <select
                  value={filterStatus}
                  onChange={e => setFilterStatus(e.target.value)}
                  className="border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-400"
                >
                  <option value="all">All Statuses</option>
                  <option value="draft">Draft</option>
                  <option value="approved">Approved</option>
                  <option value="disbursed">Disbursed</option>
                </select>
                {(filterYear !== "all" || filterStatus !== "all") && (
                  <button
                    onClick={() => { setFilterYear("all"); setFilterStatus("all"); }}
                    className="text-xs text-emerald-600 hover:underline"
                  >Clear filters</button>
                )}
                <span className="text-xs text-slate-400 ml-1">
                  {filteredRuns.length} of {runs.length} shown
                </span>
              </div>
            )}
          </CardHeader>

          <CardContent className="p-0">
            {loadingData ? (
              <div className="p-8 text-center">
                <div className="w-8 h-8 border-4 border-emerald-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-slate-500 text-sm">Loading runs…</p>
              </div>
            ) : filteredRuns.length === 0 ? (
              <div className="p-12 text-center">
                <Banknote className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">
                  {runs.length === 0 ? "No payroll runs yet." : "No runs match the current filters."}
                </p>
                {runs.length === 0 && (
                  <p className="text-slate-400 text-sm mt-1">Click "Run New Payroll" to create one.</p>
                )}
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredRuns.map(run => {
                  const isExpanded  = expandedRunId === run.id;
                  const createdDate = formatDateInLagos(run.created_at || run.createdAt, {
                    day: "2-digit", month: "short", year: "numeric",
                  });
                  return (
                    <div key={run.id}>
                      <div className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors">
                        <button
                          onClick={() => setExpandedRunId(isExpanded ? null : run.id)}
                          className="text-emerald-500 hover:text-emerald-700 flex-shrink-0"
                        >
                          {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                        </button>

                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-slate-800">
                            {run.month} {run.year}
                            {run.notes && <span className="ml-2 text-xs text-slate-400 font-normal italic">{run.notes}</span>}
                          </div>
                          <div className="text-xs text-slate-500 flex flex-wrap gap-3 mt-0.5">
                            <span>{run.staff_count || run.staffCount} staff</span>
                            <span>Gross: <strong>{fmt(run.total_gross || run.totalGross)}</strong></span>
                            <span>Net: <strong className="text-emerald-700">{fmt(run.total_net || run.totalNet)}</strong></span>
                            <span>Created: {createdDate}</span>
                          </div>
                        </div>

                        <StatusBadge status={run.status} />

                        <div className="flex flex-wrap gap-1.5">
                          <Button size="sm" variant="outline"
                            className="h-7 px-2.5 text-xs border-slate-200 text-slate-600 hover:bg-slate-50"
                            onClick={() => setExpandedRunId(isExpanded ? null : run.id)}
                          >
                            <Eye className="w-3 h-3 mr-1" />View
                          </Button>

                          {run.status === "draft" && (
                            <Button size="sm"
                              className="h-7 px-2.5 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                              onClick={() => setConfirmApprove(run.id)}
                            >
                              <CheckCircle className="w-3 h-3 mr-1" />Approve
                            </Button>
                          )}

                          {run.status === "approved" && (
                            <Button size="sm"
                              className="h-7 px-2.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                              onClick={() => handleDisburseRun(run)}
                              disabled={disbursingRun === run.id}
                            >
                              {disbursingRun === run.id
                                ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Disbursing…</>
                                : <><Send className="w-3 h-3 mr-1" />Disburse</>}
                            </Button>
                          )}

                          <Button size="sm" variant="outline"
                            className="h-7 px-2.5 text-xs border-slate-200 text-slate-600 hover:bg-slate-50"
                            onClick={() => printRunReport(run, schoolName)}
                          >
                            <FileText className="w-3 h-3 mr-1" />Report
                          </Button>

                          {run.status === "draft" && (
                            <Button size="sm" variant="outline"
                              className="h-7 px-2 text-xs border-red-200 text-red-500 hover:bg-red-50"
                              onClick={() => setConfirmDelete(run.id)}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      </div>

                      {isExpanded && (
                        <RunDetail
                          run={run}
                          schoolName={schoolName}
                          onDisburse={handleDisburseRun}
                          onRefreshStatus={handleRefreshStatus}
                          disbursingRun={disbursingRun}
                          refreshingRun={refreshingRun}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Create Run Modal ─────────────────────────────────────────────────── */}
      <CreateRunModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        teachers={teachers}
        salaryConfigMap={salaryConfigMap}
        existingRuns={runs}
        onCreate={handleCreateRun}
        schoolName={schoolName}
      />

      {/* ── Confirm Approve ──────────────────────────────────────────────────── */}
      <Dialog open={!!confirmApprove} onOpenChange={() => setConfirmApprove(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Approve Payroll Run?</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-600">
            This will mark the run as <strong>Approved</strong>. You can then disburse via Flutterwave.
          </p>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => setConfirmApprove(null)}>Cancel</Button>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => approveRun(confirmApprove)}>
              <CheckCircle className="w-4 h-4 mr-1" />Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Confirm Bulk Approve ─────────────────────────────────────────────── */}
      <Dialog open={confirmBulkApprove} onOpenChange={() => setConfirmBulkApprove(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Approve All Draft Runs?</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-600">
            This will approve all <strong>{draftCount}</strong> draft payroll run{draftCount !== 1 ? "s" : ""} at once.
          </p>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => setConfirmBulkApprove(false)}>Cancel</Button>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={handleBulkApprove}>
              <CheckCircle className="w-4 h-4 mr-1" />Approve All
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Confirm Delete ───────────────────────────────────────────────────── */}
      <Dialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="text-red-600">Delete Payroll Run?</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-600">
            This is permanent and cannot be undone. Only draft runs can be deleted.
          </p>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={() => deleteRun(confirmDelete)}>
              <Trash2 className="w-4 h-4 mr-1" />Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import React, { useState, useEffect, useCallback } from "react";
import { BRAND } from "@/config/brand";
import { supabase } from "@/api/supabaseClient";
import { usePersistentState } from "@/hooks/usePersistentState";
import { Student } from "@/entities/Student";
import { sendBulkEmail } from "@/functions/sendBulkEmail";
import { sendSMS } from "@/functions/sendSMS";
import { sendWhatsApp } from "@/functions/sendWhatsApp";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Mail, MessageSquare, Send, Loader2, CheckCircle2, AlertCircle,
  Users, Phone, Inbox, BookOpen, Save, Trash2, ChevronDown, ChevronUp,
  ChevronLeft, ChevronRight, Pencil, Tag, Video, MessageCircle, History, Clock, Search, X,
} from "lucide-react";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import { loadSchoolSetting, saveSchoolSetting } from "@/lib/schoolSettingUtils";
import VirtualClassroom from "@/components/VirtualClassroom";
import { formatDateInLagos } from "@/lib/timezone";

// ── Constants ────────────────────────────────────────────────────────────────

const GRADE_GROUPS = [
  { label: "All", grades: null },
  { label: "KG", grades: ["KG 1", "KG 2", "Nursery 1", "Nursery 2"] },
  { label: "Primary", grades: ["Primary 1", "Primary 2", "Primary 3", "Primary 4"] },
  { label: "JSS", grades: ["JSS 1", "JSS 2", "JSS 3"] },
  { label: "SSS", grades: ["SSS 1", "SSS 2", "SSS 3"] },
];

const GROUP_COLORS = {
  All: "bg-slate-700 text-white border-slate-700",
  KG: "bg-pink-600 text-white border-pink-600",
  Primary: "bg-amber-500 text-white border-amber-500",
  JSS: "bg-blue-600 text-white border-blue-600",
  SSS: "bg-indigo-600 text-white border-indigo-600",
};

const GROUP_COLORS_INACTIVE = {
  All: "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100",
  KG: "bg-pink-50 text-pink-700 border-pink-200 hover:bg-pink-100",
  Primary: "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100",
  JSS: "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100",
  SSS: "bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100",
};

const AVATAR_COLORS = [
  "from-pink-400 to-rose-500", "from-blue-400 to-indigo-500",
  "from-amber-400 to-orange-500", "from-emerald-400 to-teal-500", "from-emerald-400 to-emerald-500",
];

const VARIABLES = [
  { tag: "{{school_name}}", label: "School Name" },
  { tag: "{{date}}", label: "Today's Date" },
  { tag: "{{term}}", label: "Term" },
  { tag: "{{year}}", label: "Academic Year" },
  { tag: "{{grade}}", label: "Grade/Class" },
];

// Default built-in templates
const DEFAULT_SMS_TEMPLATES = [
  {
    id: "sms_fee",
    name: "Fee Reminder",
    category: "Finance",
    body: "Dear Parent, this is a reminder that school fees for {{term}} {{year}} are now due. Kindly visit the school bursar's office to make payment. Thank you. — {{school_name}}",
  },
  {
    id: "sms_resumption",
    name: "School Resumption",
    category: "General",
    body: "Dear Parent, {{school_name}} resumes for {{term}} on {{date}}. Please ensure your ward is in school early and ready to learn. Thank you.",
  },
  {
    id: "sms_exam",
    name: "Exam Timetable",
    category: "Exams",
    body: "Dear Parent, {{term}} examinations begin on {{date}}. Please ensure your ward revises adequately. The exam timetable is available at the school office. — {{school_name}}",
  },
  {
    id: "sms_result",
    name: "Result Release",
    category: "Exams",
    body: "Dear Parent, {{term}} {{year}} results are now available. Please visit the school to collect your ward's report card. — {{school_name}}",
  },
  {
    id: "sms_pta",
    name: "PTA Meeting",
    category: "Events",
    body: "Dear Parent, you are cordially invited to our PTA meeting on {{date}}. Your presence is very important. Please make time to attend. — {{school_name}}",
  },
  {
    id: "sms_closure",
    name: "School Closure",
    category: "General",
    body: "Dear Parent, please be informed that {{school_name}} will be closed on {{date}}. We apologise for any inconvenience. School resumes normally afterwards.",
  },
];

const DEFAULT_EMAIL_TEMPLATES = [
  {
    id: "email_fee",
    name: "Fee Reminder",
    category: "Finance",
    subject: "{{term}} School Fees Reminder — {{school_name}}",
    body: `Dear Parent/Guardian,

We hope this message finds you well.

This is a friendly reminder that school fees for <strong>{{term}} {{year}}</strong> are now due. Kindly visit the school bursar's office at your earliest convenience to settle the outstanding balance.

If you have already made payment, please disregard this notice and submit your receipt to the accounts office.

Thank you for your continued support.

Warm regards,
The Management
{{school_name}}`,
  },
  {
    id: "email_resumption",
    name: "School Resumption",
    category: "General",
    subject: "School Resumes {{date}} — {{school_name}}",
    body: `Dear Parent/Guardian,

We are delighted to inform you that {{school_name}} will resume for <strong>{{term}}</strong> on <strong>{{date}}</strong>.

Please ensure your ward:
<ul>
  <li>Reports to school on time (by 7:45am)</li>
  <li>Is in full school uniform</li>
  <li>Has all required school materials</li>
</ul>

We look forward to welcoming your child back.

Warm regards,
The Management
{{school_name}}`,
  },
  {
    id: "email_exam",
    name: "Examination Notice",
    category: "Exams",
    subject: "{{term}} Examinations — {{date}} — {{school_name}}",
    body: `Dear Parent/Guardian,

This is to inform you that <strong>{{term}} {{year}} examinations</strong> will commence on <strong>{{date}}</strong>.

Please encourage your ward to:
<ul>
  <li>Revise all subjects thoroughly</li>
  <li>Get adequate rest before exam days</li>
  <li>Come to school early on exam days</li>
</ul>

The full timetable is available at the school office and on the school notice board.

Best regards,
The Academic Department
{{school_name}}`,
  },
  {
    id: "email_pta",
    name: "PTA Meeting Invitation",
    category: "Events",
    subject: "PTA Meeting — {{date}} — {{school_name}}",
    body: `Dear Parent/Guardian,

You are cordially invited to the <strong>Parent-Teacher Association (PTA) Meeting</strong> scheduled for <strong>{{date}}</strong>.

Your active participation is important to us and directly contributes to the improvement of our school community.

We look forward to your presence.

Warm regards,
The Management
{{school_name}}`,
  },
];

const TEMPLATE_STORAGE_KEY_SMS   = "comm_templates_sms";
const TEMPLATE_STORAGE_KEY_EMAIL = "comm_templates_email";

function loadCustomTemplatesFromCache(type) {
  try {
    const key = type === "sms" ? TEMPLATE_STORAGE_KEY_SMS : TEMPLATE_STORAGE_KEY_EMAIL;
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch { return []; }
}

async function loadCustomTemplates(type) {
  const col = type === "sms" ? "sms_templates" : "email_templates";
  const cacheKey = type === "sms" ? TEMPLATE_STORAGE_KEY_SMS : TEMPLATE_STORAGE_KEY_EMAIL;
  try {
    const db = await loadSchoolSetting(col);
    if (Array.isArray(db) && db.length > 0) {
      try { localStorage.setItem(cacheKey, JSON.stringify(db)); } catch {}
      return db;
    }
  } catch {}
  return loadCustomTemplatesFromCache(type);
}

async function saveCustomTemplates(type, templates) {
  const col = type === "sms" ? "sms_templates" : "email_templates";
  const cacheKey = type === "sms" ? TEMPLATE_STORAGE_KEY_SMS : TEMPLATE_STORAGE_KEY_EMAIL;
  try { localStorage.setItem(cacheKey, JSON.stringify(templates)); } catch {}
  await saveSchoolSetting(col, templates);
}

function getInitials(name = "") {
  return name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase() || "?";
}

// ── Variable resolver ────────────────────────────────────────────────────────

function resolveVars(text, vars) {
  return text
    .replace(/\{\{school_name\}\}/g, vars.schoolName || "Our School")
    .replace(/\{\{date\}\}/g, vars.date || formatDateInLagos(new Date(), { weekday: "long", day: "numeric", month: "long", year: "numeric" }, "en-GB"))
    .replace(/\{\{term\}\}/g, vars.term || "")
    .replace(/\{\{year\}\}/g, vars.year || "")
    .replace(/\{\{grade\}\}/g, vars.grade || "");
}

// ── Category badge ────────────────────────────────────────────────────────────

const CAT_COLORS = {
  Finance: "bg-emerald-100 text-emerald-700",
  General: "bg-slate-100 text-slate-600",
  Exams: "bg-blue-100 text-blue-700",
  Events: "bg-emerald-100 text-emerald-700",
  Custom: "bg-amber-100 text-amber-700",
};

// ── Main component ────────────────────────────────────────────────────────────

export default function Communications() {
  const { term: schoolTerm, year: schoolYear, schoolName, smsSenderId } = useSchoolSettings();

  const [students, setStudents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = usePersistentState("comms_tab", "sms");
  const [selectedGroup, setSelectedGroup] = usePersistentState("comms_group", "All");
  const [selectedGrade, setSelectedGrade] = usePersistentState("comms_grade", null); // specific class within group

  useEffect(() => {
    if (activeTab === "whatsapp") setActiveTab("sms");
  }, [activeTab, setActiveTab]);

  // Compose fields
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [smsMessage, setSmsMessage] = useState("");
  const [waMessage, setWaMessage] = useState("");

  // Direct SMS mode (individual numbers)
  const [smsMode, setSmsMode] = useState("bulk"); // "bulk" | "direct"
  const [directPhonesInput, setDirectPhonesInput] = useState(""); // comma-separated numbers

  // Individual student selection (null = all selected)
  const [selectedStudentIds, setSelectedStudentIds] = useState(null); // null means "all"

  // UI state
  const [isSending, setIsSending] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);

  // Templates state
  const [showTemplates, setShowTemplates] = useState(false);
  const [customSmsTemplates, setCustomSmsTemplates] = useState(() => loadCustomTemplatesFromCache("sms"));
  const [customEmailTemplates, setCustomEmailTemplates] = useState(() => loadCustomTemplatesFromCache("email"));

  // Sync templates from DB on mount (overrides cache with server data)
  useEffect(() => {
    loadCustomTemplates("sms").then(t => { if (t.length > 0) setCustomSmsTemplates(t); });
    loadCustomTemplates("email").then(t => { if (t.length > 0) setCustomEmailTemplates(t); });
  }, []);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [editingTemplate, setEditingTemplate] = useState(null); // for edit modal

  // Message history
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(0);
  const HISTORY_PAGE_SIZE = 10;

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const { data } = await supabase
        .from("message_history").select("*")
        .order("sent_at", { ascending: false }).limit(500);
      setHistory(data || []);
    } catch {}
    finally { setHistoryLoading(false); }
  }, []);

  useEffect(() => { if (activeTab === "history") { setHistoryPage(0); loadHistory(); } }, [activeTab, loadHistory]);

  const deleteHistoryEntry = async (id) => {
    setHistory(prev => prev.filter(h => h.id !== id));
    try {
      await supabase.from("message_history").delete().eq("id", id);
    } catch (e) {
      console.error("[History] Delete failed:", e);
      loadHistory(); // revert optimistic remove on failure
    }
  };

  const varValues = {
    schoolName: schoolName || "Our School",
    term: schoolTerm || "",
    year: schoolYear || "",
    date: formatDateInLagos(new Date(), { weekday: "long", day: "numeric", month: "long", year: "numeric" }, "en-GB"),
    grade: selectedGroup !== "All" ? selectedGroup : "",
  };

  useEffect(() => {
    Student.filter({ enrollment_status: "active" })
      .then(data => setStudents(data || []))
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const groupGrades = GRADE_GROUPS.find(g => g.label === selectedGroup)?.grades || [];

  const filteredStudents = students.filter(s => {
    if (selectedGroup === "All") return true;
    if (selectedGrade) return s.grade === selectedGrade;
    return groupGrades.includes(s.grade);
  });

  const studentName = (s) => `${s.first_name || ""} ${s.last_name || ""}`.trim() || "Unknown";

  const [studentSearch, setStudentSearch] = useState("");

  // When group/grade changes, reset individual selection and search
  useEffect(() => { setSelectedStudentIds(null); setStudentSearch(""); }, [selectedGroup, selectedGrade]);

  // Effective recipient students — respects individual selection
  const recipientStudents = selectedStudentIds === null
    ? filteredStudents
    : filteredStudents.filter(s => selectedStudentIds.has(s.id));

  const emailRecipients = [...new Set(recipientStudents.map(s => s.parent_email).filter(Boolean))];
  const phoneRecipients = [...new Set(recipientStudents.map(s => s.parent_phone).filter(Boolean))];
  const waRecipients    = phoneRecipients; // WhatsApp uses the same phone numbers

  const toggleStudent = (id) => {
    setSelectedStudentIds(prev => {
      const base = prev ?? new Set(filteredStudents.map(s => s.id));
      const next = new Set(base);
      if (next.has(id)) next.delete(id); else next.add(id);
      // If all selected again → revert to null (all)
      if (next.size === filteredStudents.length) return null;
      return next;
    });
  };

  const selectAll = () => setSelectedStudentIds(null);
  const deselectAll = () => setSelectedStudentIds(new Set());
  const totalWithEmail = [...new Set(students.map(s => s.parent_email).filter(Boolean))].length;
  const totalWithPhone = [...new Set(students.map(s => s.parent_phone).filter(Boolean))].length;
  const currentRecipients = activeTab === "email" ? emailRecipients : activeTab === "whatsapp" ? waRecipients : phoneRecipients;
  const recipientLabel = activeTab === "email" ? "email" : "phone";

  // Parse direct phone numbers (comma/newline/space separated)
  const parsedDirectPhones = directPhonesInput
    .split(/[\n,;]+/)
    .map(p => p.trim())
    .filter(p => p.length >= 7);

  const canSend = activeTab === "email"
    ? emailSubject.trim() && emailBody.trim() && emailRecipients.length > 0
    : activeTab === "whatsapp"
    ? waMessage.trim() && waRecipients.length > 0
    : smsMessage.trim() && (smsMode === "direct" ? parsedDirectPhones.length > 0 : phoneRecipients.length > 0);

  // All templates for current tab
  const builtInTemplates = activeTab === "email" ? DEFAULT_EMAIL_TEMPLATES : DEFAULT_SMS_TEMPLATES; // WhatsApp reuses SMS templates
  const customTemplates = activeTab === "email" ? customEmailTemplates : customSmsTemplates;
  const allTemplates = [...builtInTemplates, ...customTemplates.map(t => ({ ...t, isCustom: true }))];

  // ── Handlers ───────────────────────────────────────────────────────────────

  const insertVariable = (tag) => {
    if (activeTab === "sms") {
      setSmsMessage(prev => prev + tag);
    } else if (activeTab === "whatsapp") {
      setWaMessage(prev => prev + tag);
    } else {
      setEmailBody(prev => prev + tag);
    }
  };

  const applyTemplate = (tpl) => {
    const body = resolveVars(tpl.body, varValues);
    if (activeTab === "sms") {
      setSmsMessage(body);
    } else if (activeTab === "whatsapp") {
      setWaMessage(body);
    } else {
      setEmailSubject(resolveVars(tpl.subject || "", varValues));
      setEmailBody(body);
    }
    setResult(null);
    setError(null);
  };

  const openSaveDialog = () => {
    setSaveName("");
    setEditingTemplate(null);
    setSaveDialogOpen(true);
  };

  const openEditTemplate = (tpl) => {
    setEditingTemplate(tpl);
    setSaveName(tpl.name);
    setSaveDialogOpen(true);
  };

  const saveTemplate = () => {
    if (!saveName.trim()) return;
    // WhatsApp templates share the SMS storage
    const type = activeTab === "whatsapp" ? "sms" : activeTab;
    const currentBody = activeTab === "sms" ? smsMessage : activeTab === "whatsapp" ? waMessage : emailBody;
    const existing = type === "sms" ? customSmsTemplates : customEmailTemplates;

    if (editingTemplate) {
      // Edit existing custom template
      const updated = existing.map(t => t.id === editingTemplate.id
        ? { ...t, name: saveName.trim(), body: currentBody, subject: type === "email" ? emailSubject : undefined }
        : t
      );
      if (type === "sms") { setCustomSmsTemplates(updated); saveCustomTemplates("sms", updated); }
      else { setCustomEmailTemplates(updated); saveCustomTemplates("email", updated); }
    } else {
      // New template
      const newTpl = {
        id: `custom_${Date.now()}`,
        name: saveName.trim(),
        category: "Custom",
        body: currentBody,
        ...(type === "email" ? { subject: emailSubject } : {}),
      };
      const updated = [...existing, newTpl];
      if (type === "sms") { setCustomSmsTemplates(updated); saveCustomTemplates("sms", updated); }
      else { setCustomEmailTemplates(updated); saveCustomTemplates("email", updated); }
    }
    setSaveDialogOpen(false);
  };

  const deleteCustomTemplate = (id) => {
    if (activeTab === "email") {
      const updated = customEmailTemplates.filter(t => t.id !== id);
      setCustomEmailTemplates(updated); saveCustomTemplates("email", updated);
    } else {
      // sms + whatsapp share the same template store
      const updated = customSmsTemplates.filter(t => t.id !== id);
      setCustomSmsTemplates(updated); saveCustomTemplates("sms", updated);
    }
  };

  const handleSendConfirmed = async () => {
    setShowConfirm(false);
    setIsSending(true);
    setResult(null);
    setError(null);
    try {
      let response;
      if (activeTab === "email") {
        response = await sendBulkEmail({ emails: emailRecipients, subject: emailSubject, body: emailBody });
      } else if (activeTab === "whatsapp") {
        response = await sendWhatsApp({ phoneNumbers: waRecipients, message: waMessage, senderId: smsSenderId || BRAND.smsSenderId });
      } else {
        const numbers = smsMode === "direct" ? parsedDirectPhones : phoneRecipients;
        response = await sendSMS({ phoneNumbers: numbers, message: smsMessage, messageType: smsMode === "direct" ? "single" : "bulk", senderId: smsSenderId || BRAND.smsSenderId });
      }
      if (response.data?.success) {
        setResult(response.data);
        if (activeTab === "email") { setEmailSubject(""); setEmailBody(""); }
        else if (activeTab === "whatsapp") { setWaMessage(""); }
        else { setSmsMessage(""); }
      } else {
        throw new Error(response.data?.error || "Failed to send message.");
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setIsSending(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Communications</h1>
        <p className="text-slate-500 text-sm mt-1">Send SMS and email messages to parents</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="border-0 shadow-sm bg-white/80 backdrop-blur">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
              <Mail className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{isLoading ? "—" : totalWithEmail}</p>
              <p className="text-xs text-slate-500">Parents with email</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm bg-white/80 backdrop-blur">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
              <Phone className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{isLoading ? "—" : totalWithPhone}</p>
              <p className="text-xs text-slate-500">Parents with phone</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tab bar */}
      <div className="flex gap-2 p-1 bg-slate-100 rounded-xl w-fit flex-wrap">
        {[
          { key: "sms",       label: "SMS",               icon: MessageSquare  },
          { key: "email",     label: "Email",              icon: Mail           },
          { key: "virtual",   label: "Virtual Classrooms", icon: Video          },
          { key: "history",   label: "History",             icon: History        },
        ].map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => { setActiveTab(key); setResult(null); setError(null); }}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      {/* ── Virtual Classrooms tab ── */}
      {activeTab === "virtual" && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <VirtualClassroom />
        </div>
      )}

      {/* ── History tab ── */}
      {activeTab === "history" && (() => {
        const totalPages = Math.ceil(history.length / HISTORY_PAGE_SIZE);
        const pageItems = history.slice(historyPage * HISTORY_PAGE_SIZE, (historyPage + 1) * HISTORY_PAGE_SIZE);
        const MAX_VISIBLE_HISTORY_PAGES = 10;
        const pageWindowStart = Math.floor(historyPage / MAX_VISIBLE_HISTORY_PAGES) * MAX_VISIBLE_HISTORY_PAGES;
        const pageWindowEnd = Math.min(pageWindowStart + MAX_VISIBLE_HISTORY_PAGES, totalPages);
        const visiblePages = Array.from(
          { length: pageWindowEnd - pageWindowStart },
          (_, index) => pageWindowStart + index
        );
        return (
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-slate-500" />
                <span className="text-sm font-semibold text-slate-800">Sent Messages</span>
                {history.length > 0 && <span className="text-xs text-slate-400">({history.length})</span>}
              </div>
              <button onClick={loadHistory} className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1">
                <Loader2 className={`w-3 h-3 ${historyLoading ? "animate-spin" : "hidden"}`} />
                Refresh
              </button>
            </div>

            {historyLoading ? (
              <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
            ) : history.length === 0 ? (
              <div className="flex flex-col items-center py-16 gap-3">
                <Inbox className="w-10 h-10 text-slate-200" />
                <p className="text-sm text-slate-400">No messages sent yet</p>
              </div>
            ) : (
              <>
                <div className="divide-y divide-slate-100">
                  {pageItems.map(h => {
                    const typeColor = h.type === "email" ? "bg-blue-100 text-blue-700" : h.type === "whatsapp" ? "bg-green-100 text-green-700" : "bg-emerald-100 text-emerald-700";
                    const TypeIcon = h.type === "email" ? Mail : h.type === "whatsapp" ? MessageCircle : MessageSquare;
                    const statusColor = h.status === "sent" ? "text-emerald-600" : h.status === "partial" ? "text-amber-600" : "text-red-600";
                    const sentAt = new Date(h.sent_at);
                    const dateStr = sentAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
                    const timeStr = sentAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
                    return (
                      <div key={h.id} className="px-5 py-4 hover:bg-slate-50 transition-colors group">
                        <div className="flex items-start gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${typeColor.replace("text-", "bg-").replace("-700", "-100")}`}>
                            <TypeIcon className={`w-4 h-4 ${typeColor.split(" ")[1]}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${typeColor}`}>
                                {h.type.toUpperCase()}
                              </span>
                              {h.subject && <span className="text-sm font-semibold text-slate-800 truncate">{h.subject}</span>}
                              <span className={`text-xs font-medium ml-auto ${statusColor}`}>
                                {h.status === "sent" ? "Delivered" : h.status === "partial" ? `Partial (${h.failed_count} failed)` : "Failed"}
                              </span>
                            </div>
                            <p className="text-sm text-slate-600 mt-1 line-clamp-2">{h.body}</p>
                            <div className="flex items-center gap-3 mt-2 flex-wrap">
                              <span className="text-xs text-slate-400 flex items-center gap-1">
                                <Users className="w-3 h-3" /> {h.recipient_count} recipient{h.recipient_count !== 1 ? "s" : ""}
                                {h.group_label && h.group_label !== "All" && ` · ${h.grade_label || h.group_label}`}
                              </span>
                              <span className="text-xs text-slate-400 flex items-center gap-1">
                                <Clock className="w-3 h-3" /> {dateStr} at {timeStr}
                              </span>
                              {h.sent_by && <span className="text-xs text-slate-400">{h.sent_by}</span>}
                            </div>
                          </div>
                          <button
                            onClick={() => deleteHistoryEntry(h.id)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500 flex-shrink-0">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="relative px-5 py-3 border-t border-slate-100 flex items-center justify-center">
                    <p className="absolute left-5 text-xs text-slate-400">
                      {historyPage * HISTORY_PAGE_SIZE + 1}-{Math.min((historyPage + 1) * HISTORY_PAGE_SIZE, history.length)} of {history.length}
                    </p>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setHistoryPage(p => p - 1)} disabled={historyPage === 0}
                        className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed">
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                      {visiblePages.map((i) => (
                        <button key={i} onClick={() => setHistoryPage(i)}
                          className={`w-7 h-7 flex items-center justify-center rounded-lg text-xs font-semibold transition-colors ${i === historyPage ? "bg-slate-800 text-white" : "border border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
                          {i + 1}
                        </button>
                      ))}
                      <button
                        onClick={() => setHistoryPage(p => p + 1)} disabled={historyPage >= totalPages - 1}
                        className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed">
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        );
      })()}

      {/* Templates section — only for SMS / WhatsApp / Email tabs */}
      {activeTab !== "virtual" && activeTab !== "history" && (
      <>
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <button
          onClick={() => setShowTemplates(p => !p)}
          className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-emerald-500" />
            <span className="text-sm font-semibold text-slate-800">Message Templates</span>
            <Badge className="bg-emerald-100 text-emerald-700 border-0 text-xs">{allTemplates.length}</Badge>
          </div>
          {showTemplates ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>

        <AnimatePresence>
          {showTemplates && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="px-5 pb-5 border-t border-slate-100">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
                  {allTemplates.map((tpl) => (
                    <div key={tpl.id}
                      className="border border-slate-200 rounded-xl p-3.5 bg-slate-50 hover:bg-white hover:border-emerald-200 hover:shadow-sm transition-all group flex flex-col gap-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{tpl.name}</p>
                          <span className={`inline-block text-xs px-2 py-0.5 rounded-full mt-1 font-medium ${CAT_COLORS[tpl.category] || CAT_COLORS.Custom}`}>
                            {tpl.category}
                          </span>
                        </div>
                        {tpl.isCustom && (
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => openEditTemplate(tpl)} className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => deleteCustomTemplate(tpl.id)} className="p-1 rounded hover:bg-red-100 text-slate-400 hover:text-red-600">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 line-clamp-2 flex-1">{tpl.body}</p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => applyTemplate(tpl)}
                        className="w-full text-xs h-7 border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:border-emerald-300 mt-1"
                      >
                        Use Template
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Main compose + recipients */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

        {/* Recipients */}
        <Card className="lg:col-span-2 border-0 shadow-sm bg-white/80 backdrop-blur">
          <CardHeader className="pb-3 border-b border-slate-100">
            <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-500" /> Recipients
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Filter by grade</p>
              <div className="flex flex-wrap gap-2">
                {GRADE_GROUPS.map(({ label }) => (
                  <button key={label} onClick={() => { setSelectedGroup(label); setSelectedGrade(null); }}
                    className={`text-xs font-semibold px-3 py-1 rounded-full border transition-all ${selectedGroup === label && !selectedGrade ? GROUP_COLORS[label] : GROUP_COLORS_INACTIVE[label]}`}>
                    {label}
                  </button>
                ))}
              </div>

              {/* Individual class chips — only show when a group (not All) is selected */}
              {selectedGroup !== "All" && groupGrades.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-slate-100">
                  {groupGrades.map(grade => (
                    <button
                      key={grade}
                      onClick={() => setSelectedGrade(selectedGrade === grade ? null : grade)}
                      className={`text-xs font-medium px-2.5 py-1 rounded-full border transition-all ${
                        selectedGrade === grade
                          ? GROUP_COLORS[selectedGroup]
                          : GROUP_COLORS_INACTIVE[selectedGroup]
                      }`}
                    >
                      {grade}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className={`rounded-lg p-3 flex items-center gap-3 ${
              activeTab === "email" ? "bg-blue-50 border border-blue-100"
              : activeTab === "whatsapp" ? "bg-green-50 border border-green-100"
              : "bg-emerald-50 border border-emerald-100"
            }`}>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                activeTab === "email" ? "bg-blue-100"
                : activeTab === "whatsapp" ? "bg-green-100"
                : "bg-emerald-100"
              }`}>
                {activeTab === "email"
                  ? <Mail className="w-4 h-4 text-blue-600" />
                  : activeTab === "whatsapp"
                  ? <MessageCircle className="w-4 h-4 text-green-600" />
                  : <MessageSquare className="w-4 h-4 text-emerald-600" />}
              </div>
              <div>
                <p className={`text-lg font-bold ${
                  activeTab === "email" ? "text-blue-700"
                  : activeTab === "whatsapp" ? "text-green-700"
                  : "text-emerald-700"
                }`}>{currentRecipients.length}</p>
                <p className="text-xs text-slate-500">
                  {recipientLabel} recipient{currentRecipients.length !== 1 ? "s" : ""}
                  {selectedStudentIds !== null && <span className="text-amber-600 ml-1">(custom selection)</span>}
                </p>
              </div>
            </div>
            {isLoading ? (
              <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-10 bg-slate-100 rounded-lg animate-pulse" />)}</div>
            ) : filteredStudents.length === 0 ? (
              <div className="text-center py-6">
                <Inbox className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-400">No students in this group</p>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Search input */}
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                  <input
                    value={studentSearch}
                    onChange={e => setStudentSearch(e.target.value)}
                    placeholder="Search student or phone..."
                    className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-emerald-300 focus:border-emerald-300"
                  />
                  {studentSearch && (
                    <button onClick={() => setStudentSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Header row with select all / deselect all */}
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Students
                    <span className="ml-1.5 normal-case font-normal text-slate-300">
                      ({filteredStudents.filter(s => activeTab === "email" ? s.parent_email : s.parent_phone).length} have {activeTab === "whatsapp" ? "phone" : recipientLabel})
                    </span>
                  </p>
                  <div className="flex items-center gap-2">
                    <button onClick={selectAll} className="text-[10px] text-blue-600 hover:underline font-medium">All</button>
                    <span className="text-slate-300 text-xs">·</span>
                    <button onClick={deselectAll} className="text-[10px] text-slate-400 hover:underline font-medium">None</button>
                  </div>
                </div>

                {/* Scrollable student list */}
                <div className="overflow-y-auto max-h-[340px] space-y-0.5 pr-1 -mr-1">
                  {filteredStudents.filter(s => {
                    if (!studentSearch.trim()) return true;
                    const q = studentSearch.toLowerCase();
                    return studentName(s).toLowerCase().includes(q) || (s.parent_phone || "").includes(q) || (s.parent_email || "").toLowerCase().includes(q);
                  }).map((student, idx) => {
                    const contact = activeTab === "email" ? student.parent_email : student.parent_phone; // phone for both sms + whatsapp
                    const name = studentName(student);
                    const isSelected = selectedStudentIds === null || selectedStudentIds.has(student.id);
                    return (
                      <button
                        key={student.id}
                        onClick={() => toggleStudent(student.id)}
                        className={`w-full flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-all ${
                          isSelected
                            ? contact
                              ? "bg-emerald-50/60 hover:bg-emerald-50 border border-emerald-100"
                              : "bg-slate-50 border border-slate-100 opacity-50"
                            : "bg-white border border-slate-100 opacity-40 hover:opacity-70"
                        }`}
                      >
                        {/* Checkbox indicator */}
                        <div className={`w-3.5 h-3.5 rounded-sm border flex-shrink-0 flex items-center justify-center transition-all ${
                          isSelected ? "bg-emerald-500 border-emerald-500" : "border-slate-300 bg-white"
                        }`}>
                          {isSelected && (
                            <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 10">
                              <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </div>
                        {/* Avatar */}
                        <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${AVATAR_COLORS[idx % AVATAR_COLORS.length]} flex items-center justify-center flex-shrink-0`}>
                          <span className="text-white text-xs font-bold">{getInitials(name)}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="text-xs font-semibold text-slate-700 truncate">{name}</p>
                            <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full flex-shrink-0">{student.grade}</span>
                          </div>
                          <p className="text-xs text-slate-400 truncate">
                            {contact || <span className="italic text-slate-300">No {recipientLabel}</span>}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Selection summary */}
                {selectedStudentIds !== null && (
                  <p className="text-xs text-center font-medium text-emerald-700 bg-emerald-50 rounded-lg py-1.5 border border-emerald-100">
                    {selectedStudentIds.size} of {filteredStudents.length} selected
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Compose */}
        <Card className="lg:col-span-3 border-0 shadow-sm bg-white/80 backdrop-blur">
          <CardHeader className="pb-3 border-b border-slate-100">
            <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
              {activeTab === "email"
                ? <><Mail className="w-4 h-4 text-blue-500" /> Compose Email</>
                : activeTab === "whatsapp"
                ? <><MessageCircle className="w-4 h-4 text-green-600" /> Compose WhatsApp</>
                : <><MessageSquare className="w-4 h-4 text-emerald-500" /> Compose SMS</>}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5 space-y-4">

            {/* SMS mode toggle — only shown for SMS tab */}
            {activeTab === "sms" && (
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit">
                <button
                  onClick={() => setSmsMode("bulk")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${smsMode === "bulk" ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                >
                  <Users className="w-3.5 h-3.5" /> Bulk (by class)
                </button>
                <button
                  onClick={() => setSmsMode("direct")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${smsMode === "direct" ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                >
                  <Phone className="w-3.5 h-3.5" /> Direct numbers
                </button>
              </div>
            )}

            {/* Direct number input — only when in direct mode */}
            {activeTab === "sms" && smsMode === "direct" && (
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold text-slate-700">Phone Numbers</Label>
                <Textarea
                  value={directPhonesInput}
                  onChange={e => setDirectPhonesInput(e.target.value)}
                  placeholder={"Enter phone numbers, one per line or comma-separated:\n08012345678\n07098765432, 09011223344"}
                  className="bg-slate-50/70 border-slate-200 min-h-[80px] resize-none font-mono text-sm"
                />
                {parsedDirectPhones.length > 0 && (
                  <p className="text-xs text-emerald-600 font-medium">{parsedDirectPhones.length} number{parsedDirectPhones.length !== 1 ? "s" : ""} entered</p>
                )}
              </div>
            )}

            {/* Variable chips */}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                <Tag className="w-3 h-3" /> Insert variable
              </p>
              <div className="flex flex-wrap gap-1.5">
                {VARIABLES.map(v => (
                  <button key={v.tag} onClick={() => insertVariable(v.tag)}
                    className="text-xs px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 font-mono transition-colors">
                    {v.tag}
                  </button>
                ))}
              </div>
            </div>

            <AnimatePresence mode="wait">
              {activeTab === "email" ? (
                <motion.div key="email" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-sm font-semibold text-slate-700">Subject</Label>
                    <Input value={emailSubject} onChange={e => setEmailSubject(e.target.value)}
                      placeholder="e.g. {{term}} School Fees Reminder" className="bg-slate-50/70 border-slate-200" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-semibold text-slate-700">Message</Label>
                    <Textarea value={emailBody} onChange={e => setEmailBody(e.target.value)}
                      placeholder="Dear Parent,&#10;&#10;Write your message here..." className="bg-slate-50/70 border-slate-200 min-h-[180px] resize-none" />
                    <p className="text-xs text-slate-400">You can use basic HTML for formatting (bold, italic, links)</p>
                  </div>
                </motion.div>
              ) : activeTab === "whatsapp" ? (
                <motion.div key="whatsapp" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="space-y-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-semibold text-slate-700">Message</Label>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                        WhatsApp
                      </span>
                    </div>
                    <Textarea value={waMessage} onChange={e => setWaMessage(e.target.value)}
                      placeholder="Dear Parent, ..." className="bg-slate-50/70 border-slate-200 min-h-[180px] resize-none" />
                    <p className="text-xs text-slate-400 flex items-center gap-1">
                      <MessageCircle className="w-3 h-3 text-green-600" />
                      Messages are delivered via WhatsApp to parents' phone numbers.
                    </p>
                  </div>
                </motion.div>
              ) : (
                <motion.div key="sms" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="space-y-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-semibold text-slate-700">Message</Label>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${smsMessage.length > 160 ? "bg-red-100 text-red-600" : smsMessage.length > 130 ? "bg-amber-100 text-amber-600" : "bg-slate-100 text-slate-500"}`}>
                        {smsMessage.length}/160
                      </span>
                    </div>
                    <Textarea value={smsMessage} onChange={e => setSmsMessage(e.target.value)}
                      placeholder="Dear Parent, ..." className="bg-slate-50/70 border-slate-200 min-h-[180px] resize-none" />
                    {smsMessage.length > 160 && (
                      <p className="text-xs text-amber-600 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        Exceeds 160 characters — counts as {Math.ceil(smsMessage.length / 160)} SMS credits per recipient
                      </p>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Feedback */}
            <AnimatePresence>
              {error && (
                <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-red-700">{error}</p>
                </motion.div>
              )}
              {result && (
                <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="flex items-start gap-2 p-3 bg-green-50 border border-green-100 rounded-lg">
                  <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-green-800">{result.message}</p>
                    {result.failed > 0 && <p className="text-xs text-amber-600 mt-0.5">{result.failed} recipients could not be reached.</p>}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Actions */}
            <div className="pt-2 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <p className="text-xs text-slate-400">
                  {currentRecipients.length > 0
                    ? <><span className="font-semibold text-slate-600">{currentRecipients.length}</span> {recipientLabel}{currentRecipients.length !== 1 ? "s" : ""}</>
                    : <span className="text-amber-600">No recipients found</span>}
                </p>
                <Button variant="ghost" size="sm" onClick={openSaveDialog}
                  disabled={activeTab === "email" ? !emailBody.trim() : activeTab === "whatsapp" ? !waMessage.trim() : !smsMessage.trim()}
                  className="text-xs gap-1.5 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 h-7 px-2">
                  <Save className="w-3.5 h-3.5" /> Save as template
                </Button>
              </div>
              <Button
                onClick={() => { setResult(null); setError(null); setShowConfirm(true); }}
                disabled={!canSend || isSending}
                className={`gap-2 ${
                  activeTab === "email"     ? "bg-blue-600 hover:bg-blue-700"
                  : activeTab === "whatsapp" ? "bg-green-600 hover:bg-green-700"
                  :                            "bg-emerald-600 hover:bg-emerald-700"
                }`}>
                {isSending
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</>
                  : <><Send className="w-4 h-4" /> Send {activeTab === "email" ? "Email" : activeTab === "whatsapp" ? "WhatsApp" : "SMS"}</>}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Confirm send dialog */}
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {activeTab === "email"
                ? <><Mail className="w-5 h-5 text-blue-600" /> Confirm Email Send</>
                : activeTab === "whatsapp"
                ? <><MessageCircle className="w-5 h-5 text-green-600" /> Confirm WhatsApp Send</>
                : <><MessageSquare className="w-5 h-5 text-emerald-600" /> Confirm SMS Send</>}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                {activeTab === "sms" && smsMode === "direct"
                  ? <>You are about to send an SMS to <strong>{parsedDirectPhones.length} number{parsedDirectPhones.length !== 1 ? "s" : ""}</strong>.</>
                  : <>You are about to send a {activeTab === "email" ? "bulk email" : activeTab === "whatsapp" ? "WhatsApp message" : "bulk SMS"} to{" "}
                      <strong>{currentRecipients.length} {activeTab === "whatsapp" ? "phone" : recipientLabel}{currentRecipients.length !== 1 ? "s" : ""}</strong>
                      {selectedGroup !== "All" && <> in <strong>{selectedGroup}</strong></>}.</>
                }
              </span>
              {activeTab === "email" && emailSubject && <span className="block text-slate-600">Subject: <em>&quot;{emailSubject}&quot;</em></span>}
              {activeTab === "sms" && smsMessage.length > 160 && (
                <span className="block text-amber-600">&#9888; This will use {Math.ceil(smsMessage.length / 160)} SMS credits per recipient.</span>
              )}
              <span className="block text-slate-500">This action cannot be undone.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSendConfirmed}
              className={
                activeTab === "email"     ? "bg-blue-600 hover:bg-blue-700"
                : activeTab === "whatsapp" ? "bg-green-600 hover:bg-green-700"
                :                            "bg-emerald-600 hover:bg-emerald-700"
              }>
              Yes, Send Now
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      </>
      )} {/* end activeTab !== "virtual" && !== "history" */}

      {/* Save template dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Save className="w-4 h-4 text-emerald-500" />
              {editingTemplate ? "Rename Template" : "Save as Template"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <Label className="text-sm font-medium text-slate-700">Template Name</Label>
            <Input
              value={saveName}
              onChange={e => setSaveName(e.target.value)}
              placeholder="e.g. End of Term Notice"
              onKeyDown={e => { if (e.key === "Enter") saveTemplate(); }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveTemplate} disabled={!saveName.trim()} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


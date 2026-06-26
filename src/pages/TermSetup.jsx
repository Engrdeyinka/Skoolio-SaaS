import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import { SchoolCalendarEvent } from "@/entities/SchoolCalendarEvent";
import { ClassFee } from "@/entities/ClassFee";
import { TimetableSlot } from "@/entities/TimetableSlot";
import { createPageUrl } from "@/utils";
import { Link } from "react-router-dom";
import { CheckCircle2, CalendarDays, CreditCard, LayoutGrid, FileText, Settings2 } from "lucide-react";
import { getResultsWorkflowStatus } from "@/lib/resultsWorkflow";
import { toast } from "sonner";

const TERMS = ["First Term", "Second Term", "Third Term"];

function StepCard({ title, text, ready, actionLabel, actionUrl, icon: Icon, detail }) {
  return (
    <Card className="border-slate-200">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${ready ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-500"}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <p className="font-semibold text-slate-900">{title}</p>
              <p className="mt-1 text-sm text-slate-500">{text}</p>
              {detail ? <p className="mt-2 text-sm font-medium text-slate-700">{detail}</p> : null}
            </div>
          </div>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${ready ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
            {ready ? "Ready" : "Needs work"}
          </span>
        </div>
        <div className="mt-4">
          <Button asChild variant="outline" className="border-slate-200">
            <Link to={actionUrl}>{actionLabel}</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function TermSetup() {
  const { term, year, save } = useSchoolSettings();
  const [selectedTerm, setSelectedTerm] = useState(term || "Second Term");
  const [selectedYear, setSelectedYear] = useState(year || "2025/2026");
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [classFees, setClassFees] = useState([]);
  const [slots, setSlots] = useState([]);
  const [workflow, setWorkflow] = useState({ status: "draft" });

  useEffect(() => {
    setSelectedTerm(term || "Second Term");
  }, [term]);

  useEffect(() => {
    setSelectedYear(year || "2025/2026");
  }, [year]);

  useEffect(() => {
    Promise.all([
      SchoolCalendarEvent.list("-event_date").catch(() => []),
      ClassFee.list().catch(() => []),
      TimetableSlot.list("-created_date").catch(() => []),
      getResultsWorkflowStatus(selectedTerm, selectedYear).catch(() => ({ status: "draft" })),
    ]).then(([events, fees, timetableSlots, resultsWorkflow]) => {
      setCalendarEvents(events || []);
      setClassFees(fees || []);
      setSlots(timetableSlots || []);
      setWorkflow(resultsWorkflow || { status: "draft" });
    });
  }, [selectedTerm, selectedYear]);

  const readiness = useMemo(() => {
    const scopedEvents = calendarEvents.filter((event) => event.term === selectedTerm && event.academic_year === selectedYear);
    const termStart = scopedEvents.some((event) => String(event.event_type || "").toLowerCase() === "term_start");
    const termEnd = scopedEvents.some((event) => String(event.event_type || "").toLowerCase() === "term_end");
    const feeCount = classFees.filter((fee) => fee.term === selectedTerm && fee.academic_year === selectedYear).length;
    const slotCount = slots.filter((slot) => slot.term === selectedTerm && slot.academic_year === selectedYear).length;

    return {
      calendarReady: termStart && termEnd,
      feeReady: feeCount > 0,
      timetableReady: slotCount > 0,
      resultsReady: ["approved", "published", "locked"].includes(workflow.status),
      feeCount,
      slotCount,
      workflowStatus: workflow.status,
    };
  }, [calendarEvents, classFees, slots, selectedTerm, selectedYear, workflow.status]);

  const handleSaveCurrent = async () => {
    await save({ current_term: selectedTerm, current_year: selectedYear });
    toast.success(`Current term set to ${selectedTerm} ${selectedYear}.`);
  };

  return (
    <div className="p-6 md:p-8 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-blue-500">Operations</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Term Setup Wizard</h1>
          <p className="mt-2 text-slate-600">Prepare a term the same way every time: set dates, fees, timetable, and result release status.</p>
        </div>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-lg text-slate-900">Active Term</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-[220px_220px_auto] gap-4 items-end">
            <div>
              <Label>Term</Label>
              <Select value={selectedTerm} onValueChange={setSelectedTerm}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TERMS.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Academic Year</Label>
              <Input value={selectedYear} onChange={(event) => setSelectedYear(event.target.value)} className="mt-1.5" />
            </div>
            <Button onClick={handleSaveCurrent} className="bg-blue-600 hover:bg-blue-700 w-full md:w-auto">
              <Settings2 className="w-4 h-4 mr-2" />
              Make This Current Term
            </Button>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <StepCard
            title="Calendar Window"
            text="Term start, term end, and closure dates should already exist before attendance and results open."
            ready={readiness.calendarReady}
            actionLabel="Open Calendar"
            actionUrl={createPageUrl("Events")}
            icon={CalendarDays}
            detail={readiness.calendarReady ? `${selectedTerm} has both term start and term end.` : `Add term start and term end for ${selectedTerm}.`}
          />
          <StepCard
            title="Fee Schedule"
            text="Every class should have fee records for this term and year before payment notices go out."
            ready={readiness.feeReady}
            actionLabel="Open Payments"
            actionUrl={createPageUrl("Payments")}
            icon={CreditCard}
            detail={readiness.feeReady ? `${readiness.feeCount} fee record(s) found.` : "No fee records found for this term yet."}
          />
          <StepCard
            title="Timetable Published"
            text="A timetable should be ready before classes resume so staff and students see the same term schedule."
            ready={readiness.timetableReady}
            actionLabel="Open Timetable"
            actionUrl={createPageUrl("Timetable")}
            icon={LayoutGrid}
            detail={readiness.timetableReady ? `${readiness.slotCount} timetable slot(s) found.` : "No timetable slots found for this term."}
          />
          <StepCard
            title="Results Workflow"
            text="Results should move from draft to review, approval, publication, and final lock."
            ready={readiness.resultsReady}
            actionLabel="Open Results Workflow"
            actionUrl={createPageUrl("ResultsWorkflow")}
            icon={FileText}
            detail={`Current status: ${readiness.workflowStatus}`}
          />
        </div>

        <Card className="border-emerald-200 bg-emerald-50/60">
          <CardContent className="p-5 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5" />
            <div>
              <p className="font-semibold text-emerald-900">What this page helps with</p>
              <p className="mt-1 text-sm text-emerald-800">
                This is the operational checklist for the term. It does not replace Calendar, Payments, Timetable, or Academic Records; it keeps them aligned.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

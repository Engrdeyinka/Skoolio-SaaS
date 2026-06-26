import React, { useState, useEffect } from "react";
import { SchoolCalendarEvent } from "@/entities/SchoolCalendarEvent";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { Button } from "@/components/ui/button";

import AcademicCalendar from "../components/events/AcademicCalendar";

export default function EventsPage() {
  const navigate = useNavigate();
  const [calEvents,  setCalEvents]  = useState([]);
  const [calLoading, setCalLoading] = useState(true);
  const [calError,   setCalError]   = useState(null);

  const loadCalEvents = async () => {
    setCalLoading(true);
    setCalError(null);
    try {
      const data = await SchoolCalendarEvent.list("-event_date");
      setCalEvents(data);
    } catch (e) {
      console.error(e);
      setCalError("Could not load calendar events. Check your connection and try again.");
    }
    setCalLoading(false);
  };

  useEffect(() => { loadCalEvents(); }, []);

  return (
    <div className="p-6 md:p-8">
      <Toaster />
      <div className="max-w-7xl mx-auto">

        {/* Page header */}
        <div className="mb-6">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors mb-3"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <h1 className="text-3xl lg:text-4xl font-bold text-slate-900 mb-1">Academic Calendar</h1>
          <p className="text-slate-600">Manage term dates, holidays, and school events</p>
        </div>

        {/* Calendar */}
        {calLoading ? (
          <div className="flex justify-center py-20">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : calError ? (
          <div className="text-center py-20 border-2 border-dashed border-red-100 rounded-2xl">
            <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
            <p className="text-red-600 font-medium mb-4">{calError}</p>
            <Button variant="outline" onClick={loadCalEvents}>Retry</Button>
          </div>
        ) : (
          <AcademicCalendar
            events={calEvents}
            onEventAdded={loadCalEvents}
          />
        )}

      </div>
    </div>
  );
}

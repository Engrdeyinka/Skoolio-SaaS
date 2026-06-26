import { addDays, format } from "date-fns";

export const CLOSED_CALENDAR_TYPES = ["holiday", "vacation", "mid_term"];

export function normalizeCalendarValue(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

export function matchesCalendarValue(eventValue, selectedValue) {
  const normalizedEvent = normalizeCalendarValue(eventValue);
  if (!normalizedEvent) return true;
  return normalizedEvent === normalizeCalendarValue(selectedValue);
}

export function hasCalendarType(event, expectedType) {
  return normalizeCalendarValue(event?.event_type) === normalizeCalendarValue(expectedType);
}

export function eventMatchesScope(event, term, academicYear) {
  if (!event) return false;
  return matchesCalendarValue(event?.term, term) && matchesCalendarValue(event?.academic_year, academicYear);
}

export function dateRangeIncludes(dateStr, startDate, endDate) {
  if (!dateStr || !startDate) return false;
  const finalDate = endDate || startDate;
  return dateStr >= startDate && dateStr <= finalDate;
}

export function isWeekdayIso(dateStr) {
  const day = new Date(`${dateStr}T12:00:00`).getDay();
  return day >= 1 && day <= 5;
}

export function buildAcademicYearTermWindows(events, academicYear) {
  const yearEvents = (events || []).filter((event) => matchesCalendarValue(event?.academic_year, academicYear));
  const starts = yearEvents
    .filter((event) => hasCalendarType(event, "term_start") && event?.event_date)
    .sort((a, b) => (a?.event_date || "").localeCompare(b?.event_date || ""));
  const ends = yearEvents
    .filter((event) => hasCalendarType(event, "term_end") && event?.event_date)
    .sort((a, b) => (a?.event_date || "").localeCompare(b?.event_date || ""));

  return starts
    .map((startEvent) => {
      const matchingEnd = ends.find((endEvent) =>
        matchesCalendarValue(endEvent?.term, startEvent?.term) &&
        endEvent?.event_date >= startEvent?.event_date
      );
      if (!matchingEnd) return null;
      return {
        term: startEvent?.term || "",
        academic_year: startEvent?.academic_year || academicYear,
        start_date: startEvent.event_date,
        end_date: matchingEnd.event_date,
      };
    })
    .filter(Boolean);
}

export function getScopedCalendarEvents(events, term, academicYear) {
  return (events || []).filter((event) => eventMatchesScope(event, term, academicYear));
}

export function getScopedTermWindow(events, term, academicYear) {
  const scoped = getScopedCalendarEvents(events, term, academicYear);
  const termStart = [...scoped]
    .filter((event) => hasCalendarType(event, "term_start"))
    .sort((a, b) => (a?.event_date || "").localeCompare(b?.event_date || ""))[0] || null;
  const termEnd = [...scoped]
    .filter((event) => hasCalendarType(event, "term_end"))
    .sort((a, b) => (b?.event_date || "").localeCompare(a?.event_date || ""))[0] || null;

  return {
    termStart,
    termEnd,
    scopedEvents: scoped,
  };
}

export function getSchoolDayStatus(date, events, term, academicYear) {
  const academicYearEvents = (events || []).filter((event) => matchesCalendarValue(event?.academic_year, academicYear));
  const termWindows = buildAcademicYearTermWindows(events || [], academicYear);
  const { termStart, termEnd } = getScopedTermWindow(events || [], term, academicYear);

  const closureEvent = academicYearEvents.find((event) =>
    CLOSED_CALENDAR_TYPES.some((type) => hasCalendarType(event, type)) &&
    dateRangeIncludes(date, event?.event_date, event?.end_date)
  );

  if (closureEvent) {
    return {
      closed: true,
      reason: hasCalendarType(closureEvent, "mid_term")
        ? "Mid-term break"
        : hasCalendarType(closureEvent, "vacation")
        ? "Vacation"
        : "Holiday",
      matchedEvent: closureEvent,
    };
  }

  const insideAnyTermWindow = termWindows.some((window) =>
    dateRangeIncludes(date, window.start_date, window.end_date)
  );

  if (termWindows.length > 0 && !insideAnyTermWindow) {
    if (termStart?.event_date && date < termStart.event_date) {
      return { closed: true, reason: "Term not started", matchedEvent: termStart };
    }
    if (termEnd?.event_date && date > termEnd.event_date) {
      return { closed: true, reason: "Term ended", matchedEvent: termEnd };
    }
    return { closed: true, reason: "School on break", matchedEvent: null };
  }

  if (termStart?.event_date && date < termStart.event_date) {
    return { closed: true, reason: "Term not started", matchedEvent: termStart };
  }
  if (termEnd?.event_date && date > termEnd.event_date) {
    return { closed: true, reason: "Term ended", matchedEvent: termEnd };
  }

  return { closed: false, reason: null, matchedEvent: null };
}

export function listSchoolDaysForTerm(events, term, academicYear, untilDate) {
  const { termStart, termEnd } = getScopedTermWindow(events || [], term, academicYear);
  if (!termStart?.event_date || !termEnd?.event_date) return [];

  const finalDate = untilDate && untilDate < termEnd.event_date ? untilDate : termEnd.event_date;
  const days = [];
  let cursor = termStart.event_date;

  while (cursor <= finalDate) {
    const status = getSchoolDayStatus(cursor, events || [], term, academicYear);
    if (isWeekdayIso(cursor) && !status.closed) {
      days.push(cursor);
    }
    cursor = format(addDays(new Date(`${cursor}T12:00:00`), 1), "yyyy-MM-dd");
  }

  return days;
}

export function getUpcomingCalendarEvents(events, academicYear, fromDate) {
  return (events || [])
    .filter((event) =>
      matchesCalendarValue(event?.academic_year, academicYear) &&
      event?.event_date &&
      event.event_date >= fromDate
    )
    .sort((a, b) => (a?.event_date || "").localeCompare(b?.event_date || ""));
}


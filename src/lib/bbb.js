import { BRAND } from "@/config/brand";
/**
 * src/lib/bbb.js — BigBlueButton client-side utilities
 *
 * All signing happens server-side in /api/bbb.js.
 * This file only builds the query strings and calls our own proxy.
 *
 * Meeting passwords are derived deterministically from the meetingId + a
 * client-side salt so no DB storage is needed.
 * Set VITE_BBB_SALT in your .env to a random string for your school.
 */

const SALT = import.meta.env.VITE_BBB_SALT || 'tunmise-overcomer-bbb';

async function fetchBbbJson(url) {
  const res = await fetch(url);
  const text = await res.text();

  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    const snippet = text.trim().slice(0, 80);
    const looksLikeSource = snippet.startsWith('/**') || snippet.startsWith('import ');
    throw new Error(
      looksLikeSource
        ? 'The /api/bbb route is not running locally. Start the app with `npx vercel dev` instead of `npm run dev`, or deploy it to Vercel so the serverless API can run.'
        : `The /api/bbb route returned non-JSON content: ${snippet || res.statusText}`
    );
  }

  if (!res.ok) {
    throw new Error(data.error || `The /api/bbb route returned HTTP ${res.status}`);
  }

  return data;
}

/** Derive stable attendee & moderator passwords from a meeting ID */
function derivePasswords(meetingId) {
  const raw  = btoa(meetingId + '||' + SALT).replace(/[^a-zA-Z0-9]/g, '');
  const att  = raw.slice(0, 12)  || 'attendee123';
  const mod  = raw.slice(12, 24) || 'moderator456';
  return { attendeePW: att, moderatorPW: mod };
}

/** Normalise any string to a safe BBB meeting ID */
export function toMeetingId(label) {
  return label
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 64);
}

/**
 * Create a BBB meeting (safe to call even if it already exists —
 * BBB just returns the existing meeting).
 */
export async function createMeeting(meetingId, name) {
  const { attendeePW, moderatorPW } = derivePasswords(meetingId);
  const params = new URLSearchParams({
    action:                   'create',
    meetingID:                meetingId,
    name,
    attendeePW,
    moderatorPW,
    record:                   'false',
    autoStartRecording:       'false',
    allowStartStopRecording:  'false',
    muteOnStart:              'false',
    welcome:                  `<br>Welcome to <b>${name}</b> — ${BRAND.schoolName}`,
  });
  return fetchBbbJson(`/api/bbb?${params}`);
}

/** Check whether a meeting is currently live */
export async function isMeetingRunning(meetingId) {
  try {
    const params = new URLSearchParams({ action: 'isMeetingRunning', meetingID: meetingId });
    const data   = await fetchBbbJson(`/api/bbb?${params}`);
    return data.running === true;
  } catch {
    return false;
  }
}

/** Get participant count for a running meeting */
export async function getMeetingInfo(meetingId) {
  try {
    const params = new URLSearchParams({ action: 'getMeetingInfo', meetingID: meetingId });
    return fetchBbbJson(`/api/bbb?${params}`);
  } catch {
    return null;
  }
}

/**
 * Build the URL that sends a user into a BBB room.
 * role: 'moderator' | 'attendee'
 * The server-side proxy handles the redirect to the real BBB URL.
 */
export function buildJoinUrl(meetingId, fullName, role = 'attendee') {
  const { attendeePW, moderatorPW } = derivePasswords(meetingId);
  const params = new URLSearchParams({
    action:    'join',
    meetingID: meetingId,
    fullName,
    password:  role === 'moderator' ? moderatorPW : attendeePW,
    _redirect: '1',
  });
  return `/api/bbb?${params}`;
}

/**
 * Create the meeting (if needed) then open the join URL in a new tab.
 * role: 'moderator' | 'attendee'
 */
export async function startAndJoin(meetingId, name, fullName, role = 'attendee') {
  const created = await createMeeting(meetingId, name);
  if (created.returncode !== 'SUCCESS' && created.messageKey !== 'idNotUnique') {
    throw new Error(created.message || 'Failed to create meeting');
  }
  const url = buildJoinUrl(meetingId, fullName, role);
  window.open(url, '_blank', 'noopener,noreferrer');
}

/** End a meeting (requires moderator password) */
export async function endMeeting(meetingId) {
  const { moderatorPW } = derivePasswords(meetingId);
  const params = new URLSearchParams({
    action:    'end',
    meetingID: meetingId,
    password:  moderatorPW,
  });
  return fetchBbbJson(`/api/bbb?${params}`);
}

export async function checkBbbApi() {
  return fetchBbbJson('/api/bbb?action=getMeetings');
}

/** Pre-defined rooms for the school — stable IDs so passwords never change */
export const SCHOOL_ROOMS = [
  {
    id:          'all-school-assembly',
    name:        'All School Assembly',
    description: 'Whole-school meetings, morning assembly and announcements',
    grade:       'All',
    color:       'bg-violet-50 border-violet-200',
    dot:         'bg-violet-500',
    textColor:   'text-violet-800',
  },
  {
    id:          'jss-1-classroom',
    name:        'JSS 1 Classroom',
    description: 'Live virtual classes for JSS 1',
    grade:       'JSS 1',
    color:       'bg-blue-50 border-blue-200',
    dot:         'bg-blue-500',
    textColor:   'text-blue-800',
  },
  {
    id:          'jss-2-classroom',
    name:        'JSS 2 Classroom',
    description: 'Live virtual classes for JSS 2',
    grade:       'JSS 2',
    color:       'bg-indigo-50 border-indigo-200',
    dot:         'bg-indigo-500',
    textColor:   'text-indigo-800',
  },
  {
    id:          'jss-3-classroom',
    name:        'JSS 3 Classroom',
    description: 'Live virtual classes for JSS 3',
    grade:       'JSS 3',
    color:       'bg-violet-50 border-violet-200',
    dot:         'bg-violet-500',
    textColor:   'text-violet-800',
  },
  {
    id:          'sss-1-classroom',
    name:        'SSS 1 Classroom',
    description: 'Live virtual classes for SSS 1',
    grade:       'SSS 1',
    color:       'bg-emerald-50 border-emerald-200',
    dot:         'bg-emerald-500',
    textColor:   'text-emerald-800',
  },
  {
    id:          'sss-2-classroom',
    name:        'SSS 2 Classroom',
    description: 'Live virtual classes for SSS 2',
    grade:       'SSS 2',
    color:       'bg-teal-50 border-teal-200',
    dot:         'bg-teal-500',
    textColor:   'text-teal-800',
  },
  {
    id:          'sss-3-classroom',
    name:        'SSS 3 Classroom',
    description: 'Live virtual classes for SSS 3',
    grade:       'SSS 3',
    color:       'bg-cyan-50 border-cyan-200',
    dot:         'bg-cyan-500',
    textColor:   'text-cyan-800',
  },
  {
    id:          'staff-meeting-room',
    name:        'Staff Room',
    description: 'Teacher meetings, staff briefings and professional development',
    grade:       'Staff',
    color:       'bg-amber-50 border-amber-200',
    dot:         'bg-amber-500',
    textColor:   'text-amber-800',
  },
];

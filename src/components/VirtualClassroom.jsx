/**
 * VirtualClassroom.jsx
 * Displays the school's BigBlueButton rooms with live status,
 * Start (moderator) and Join (attendee) buttons.
 * Used in Communications → Virtual Classrooms tab.
 */
import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Video, VideoOff, Users, Loader2, Play, StopCircle,
  ExternalLink, RefreshCw, AlertTriangle, Info,
} from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import {
  SCHOOL_ROOMS, isMeetingRunning, startAndJoin, endMeeting, getMeetingInfo, checkBbbApi,
} from "@/lib/bbb";

function StatusDot({ live }) {
  return live ? (
    <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
      <span className="relative flex h-2.5 w-2.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
      </span>
      LIVE
    </span>
  ) : (
    <span className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
      <span className="h-2.5 w-2.5 rounded-full bg-slate-300 inline-block" />
      Offline
    </span>
  );
}

function RoomCard({ room, userRole, fullName, onStatusChange }) {
  const [live,        setLive]        = useState(false);
  const [participants, setParticipants] = useState(0);
  const [loading,     setLoading]     = useState(false);
  const [checking,    setChecking]    = useState(true);

  const isModeratorRole = ["admin", "super_admin", "teacher"].includes(userRole);

  const checkStatus = useCallback(async () => {
    setChecking(true);
    const running = await isMeetingRunning(room.id);
    setLive(running);
    if (running) {
      const info = await getMeetingInfo(room.id);
      setParticipants(info?.participantCount || 0);
    } else {
      setParticipants(0);
    }
    setChecking(false);
    onStatusChange?.(room.id, running);
  }, [room.id, onStatusChange]);

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 30_000); // poll every 30 s
    return () => clearInterval(interval);
  }, [checkStatus]);

  async function handleJoin() {
    setLoading(true);
    try {
      const role = isModeratorRole ? 'moderator' : 'attendee';
      await startAndJoin(room.id, room.name, fullName || 'Student', role);
      // Refresh status after a short delay
      setTimeout(checkStatus, 3000);
    } catch (err) {
      alert(`Could not join: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleEnd() {
    if (!window.confirm(`End the "${room.name}" meeting? All participants will be disconnected.`)) return;
    setLoading(true);
    await endMeeting(room.id);
    setTimeout(checkStatus, 2000);
    setLoading(false);
  }

  return (
    <div className={`rounded-2xl border-2 p-4 flex flex-col gap-3 transition-all duration-200 ${room.color} ${live ? 'shadow-md' : ''}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className={`w-10 h-10 rounded-xl ${room.dot} flex items-center justify-center flex-shrink-0 shadow-sm`}>
          {live ? <Video className="w-5 h-5 text-white" /> : <VideoOff className="w-5 h-5 text-white opacity-70" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`font-bold text-sm leading-tight ${room.textColor}`}>{room.name}</p>
          <p className="text-xs opacity-60 mt-0.5 line-clamp-1">{room.description}</p>
        </div>
        <button onClick={checkStatus} className="p-1 rounded-lg hover:bg-black/5 transition-colors flex-shrink-0" title="Refresh status">
          <RefreshCw className={`w-3.5 h-3.5 opacity-40 ${checking ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Status row */}
      <div className="flex items-center justify-between">
        <StatusDot live={live} />
        {live && participants > 0 && (
          <span className="flex items-center gap-1 text-xs text-slate-500">
            <Users className="w-3 h-3" />{participants} online
          </span>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 mt-auto">
        <Button
          size="sm"
          onClick={handleJoin}
          disabled={loading}
          className={`flex-1 text-xs font-bold gap-1.5 h-8 ${
            live
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
              : isModeratorRole
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
              : 'bg-white/80 hover:bg-white text-slate-700 border border-slate-300'
          }`}
        >
          {loading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Play className="w-3.5 h-3.5" />
          )}
          {live ? "Join Live" : isModeratorRole ? "Start Meeting" : "Join"}
          <ExternalLink className="w-3 h-3 opacity-60" />
        </Button>

        {isModeratorRole && live && (
          <Button
            size="sm"
            onClick={handleEnd}
            disabled={loading}
            variant="outline"
            className="h-8 px-2 border-red-200 text-red-600 hover:bg-red-50"
            title="End meeting"
          >
            <StopCircle className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

export default function VirtualClassroom() {
  const { user: authUser } = useAuth();
  const [bbbAvailable,  setBbbAvailable]  = useState(null); // null = checking
  const [bbbError,      setBbbError]      = useState("");
  const [liveRooms,     setLiveRooms]     = useState(new Set());
  const [filterGrade,   setFilterGrade]   = useState("All");

  const userRole = authUser?.school_role || "student";
  const fullName = authUser?.full_name || "User";

  // Check if BBB is configured by hitting the API with a noop
  useEffect(() => {
    checkBbbApi()
      .then(() => {
        setBbbAvailable(true);
        setBbbError("");
      })
      .catch((err) => {
        setBbbAvailable(false);
        setBbbError(err.message || "BigBlueButton is not configured.");
      });
  }, []);

  const handleStatusChange = useCallback((roomId, running) => {
    setLiveRooms(prev => {
      const next = new Set(prev);
      if (running) next.add(roomId); else next.delete(roomId);
      return next;
    });
  }, []);

  const gradeFilters = ["All", "JSS", "SSS", "Staff"];
  const filteredRooms = SCHOOL_ROOMS.filter(r => {
    if (filterGrade === "All")  return true;
    if (filterGrade === "JSS")  return r.grade.startsWith("JSS") || r.grade === "All";
    if (filterGrade === "SSS")  return r.grade.startsWith("SSS") || r.grade === "All";
    if (filterGrade === "Staff") return r.grade === "Staff";
    return true;
  });

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Video className="w-5 h-5 text-emerald-500" />
            Virtual Classrooms
          </h2>
          <p className="text-sm text-slate-500">BigBlueButton — open-source video conferencing for schools</p>
        </div>
        {liveRooms.size > 0 && (
          <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold px-3 py-1.5 rounded-full">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse inline-block" />
            {liveRooms.size} room{liveRooms.size !== 1 ? "s" : ""} live now
          </div>
        )}
      </div>

      {/* BBB not configured warning */}
      {bbbAvailable === false && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">BigBlueButton not configured</p>
            <p className="text-xs text-amber-700 mt-1">
              {bbbError || (
                <>
                  Add <code className="bg-amber-100 px-1 rounded">BBB_URL</code> and{" "}
                  <code className="bg-amber-100 px-1 rounded">BBB_SECRET</code> to your Vercel environment variables,
                  and set <code className="bg-amber-100 px-1 rounded">VITE_BBB_SALT</code> in your <code>.env</code> file.
                </>
              )}
              {" "}You can get a free BBB server at{" "}
              <a href="https://bigbluebutton.org/free-trial" target="_blank" rel="noreferrer" className="underline font-medium">bigbluebutton.org</a>.
            </p>
          </div>
        </div>
      )}

      {/* Setup tip for admins */}
      {bbbAvailable === true && ["admin", "super_admin"].includes(userRole) && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start gap-2">
          <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-blue-700">
            <strong>Teachers</strong> click <em>Start Meeting</em> to open a room as host.{" "}
            <strong>Students</strong> click <em>Join</em> — they wait in the lobby until a teacher starts.
            Rooms auto-close when the last moderator leaves.
          </p>
        </div>
      )}

      {/* Grade filter */}
      <div className="flex gap-2 flex-wrap">
        {gradeFilters.map(f => (
          <button key={f} onClick={() => setFilterGrade(f)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all ${
              filterGrade === f
                ? "bg-emerald-600 text-white border-emerald-600"
                : "bg-white text-slate-600 border-slate-200 hover:border-emerald-300 hover:text-emerald-700"
            }`}>
            {f}
          </button>
        ))}
      </div>

      {/* Room grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredRooms.map(room => (
          <RoomCard
            key={room.id}
            room={room}
            userRole={userRole}
            fullName={fullName}
            onStatusChange={handleStatusChange}
          />
        ))}
      </div>

      <p className="text-xs text-slate-400 text-center">
        Clicking <em>Start / Join</em> opens BigBlueButton in a new browser tab.
        Rooms stay live as long as at least one participant is connected.
      </p>
    </div>
  );
}

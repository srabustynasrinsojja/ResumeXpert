/**
 * useProcessingJob — polls GET /processing-jobs/{id} until it resolves.
 * Reusable for any long-running backend task started via BackgroundTasks
 * (resume parsing today; bulk zip screening can use the same hook later).
 */
import { useEffect, useRef, useState } from "react";
import { getProcessingJob } from "../api/client";

const POLL_INTERVAL_MS = 1500;
const SAFETY_TIMEOUT_MS = 60000; // never poll silently forever

export function useProcessingJob() {
  const [job, setJob] = useState(null);       // { status, progress_pct, result, error_message }
  const [timedOut, setTimedOut] = useState(false);
  const intervalRef = useRef(null);
  const timeoutRef = useRef(null);
  const startedAtRef = useRef(null);

  function clearTimers() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }

  function start(jobId) {
    clearTimers();
    setTimedOut(false);
    setJob({ status: "queued", progress_pct: 0 });
    startedAtRef.current = Date.now();

    intervalRef.current = setInterval(async () => {
      try {
        const result = await getProcessingJob(jobId);
        setJob(result);
        if (result.status === "done" || result.status === "error") {
          clearTimers();
        }
      } catch (e) {
        setJob({ status: "error", error_message: e.message });
        clearTimers();
      }
    }, POLL_INTERVAL_MS);

    timeoutRef.current = setTimeout(() => {
      clearTimers();
      setTimedOut(true);
    }, SAFETY_TIMEOUT_MS);
  }

  function reset() {
    clearTimers();
    setJob(null);
    setTimedOut(false);
  }

  useEffect(() => clearTimers, []);

  return { job, timedOut, start, reset };
}

/** Animated processing indicator — a moving progress bar, not a static spinner,
 * since a static spinner past ~5s reads as "frozen" rather than "working". */
export function ProcessingIndicator({ label, progressPct = 0 }) {
  return (
    <div style={{ padding: "4px 0" }}>
      <p style={{ fontSize: 13, color: "rgba(232,220,168,.8)", marginBottom: 8 }}>{label}</p>
      <div style={{ height: 6, borderRadius: 99, background: "rgba(201,168,76,.12)", overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${Math.max(6, progressPct)}%`,
          background: "linear-gradient(90deg,#c9a84c,#deba52)",
          transition: "width .4s ease",
        }} />
      </div>
    </div>
  );
}

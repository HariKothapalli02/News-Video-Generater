import React from "react";

export default function ProgressBar({ progress, height = "h-2", colorClass = "bg-white" }) {
  const safeProgress = Math.min(100, Math.max(0, Number(progress) || 0));
  return (
    <div className={`w-full bg-zinc-900 border border-zinc-800 rounded-none overflow-hidden ${height}`}>
      <div
        className={`${colorClass} h-full transition-all duration-300 ease-out rounded-none`}
        style={{ width: `${safeProgress}%` }}
      ></div>
    </div>
  );
}


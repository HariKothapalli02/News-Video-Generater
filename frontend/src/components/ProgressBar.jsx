import React from "react";

export default function ProgressBar({ progress, height = "h-2", colorClass = "bg-primary" }) {
  return (
    <div className={`w-full bg-slate-800 rounded-full overflow-hidden ${height}`}>
      <div
        className={`${colorClass} h-full transition-all duration-500 ease-out rounded-full`}
        style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
      ></div>
    </div>
  );
}

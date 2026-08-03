import React from "react";
import { User, Activity, AlertCircle, CheckCircle2 } from "lucide-react";
import { useAuthStore } from "../store/authStore";
import { useVideoStore } from "../store/videoStore";

export default function Header({ title }) {
  const username = useAuthStore((state) => state.username);
  const socketConnected = useVideoStore((state) => state.socketConnected);
  const activeJob = useVideoStore((state) => state.activeJob);

  return (
    <header className="h-16 border-b border-slate-800 bg-[#0B0F19]/80 backdrop-blur flex items-center justify-between px-8 fixed top-0 right-0 left-64 z-10">
      {/* Page Title */}
      <h1 className="font-semibold text-lg text-white font-sans">{title}</h1>

      {/* Right Utilities */}
      <div className="flex items-center gap-6">
        {/* Status Indicators */}
        <div className="flex items-center gap-4 border-r border-slate-800 pr-6">
          {/* Socket.IO Connection */}
          <div className="flex items-center gap-1.5 bg-slate-900 px-3 py-1.5 rounded-full border border-slate-800 text-[11px] font-medium text-slate-300">
            <span
              className={`w-2 h-2 rounded-full ${
                socketConnected ? "bg-success" : "bg-error"
              }`}
            ></span>
            <span>{socketConnected ? "Socket Live" : "Offline"}</span>
          </div>

          {/* Render Queue Status */}
          <div className="flex items-center gap-1.5 bg-slate-900 px-3 py-1.5 rounded-full border border-slate-800 text-[11px] font-medium text-slate-300">
            {activeJob ? (
              <>
                <Activity className="w-3.5 h-3.5 text-primary animate-spin" />
                <span>Job: {activeJob.status}</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                <span>Queue: Idle</span>
              </>
            )}
          </div>
        </div>

        {/* User Account Info */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
            <User className="w-4 h-4 text-slate-300" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-white">{username || "Administrator"}</span>
            <span className="text-[10px] text-slate-500 font-medium">Super Admin</span>
          </div>
        </div>
      </div>
    </header>
  );
}

import React from "react";
import { User, Activity, CheckCircle2, Menu } from "lucide-react";
import { useAuthStore } from "../store/authStore";
import { useVideoStore } from "../store/videoStore";

export default function Header({ title, onToggleSidebar }) {
  const username = useAuthStore((state) => state.username);
  const socketConnected = useVideoStore((state) => state.socketConnected);
  const activeJob = useVideoStore((state) => state.activeJob);

  return (
    <header className="h-16 border-b border-zinc-800 bg-black/90 backdrop-blur flex items-center justify-between px-4 sm:px-8 fixed top-0 right-0 left-0 lg:left-64 z-30 transition-all duration-200">
      {/* Left Area: Mobile Hamburger + Page Title */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="lg:hidden p-2 text-zinc-300 hover:text-white bg-zinc-950 border border-zinc-800 rounded-none cursor-pointer"
          title="Toggle Navigation Menu"
        >
          <Menu className="w-4 h-4" />
        </button>

        <h1 className="font-semibold text-sm sm:text-base text-white font-mono uppercase tracking-wider truncate">
          {title}
        </h1>
      </div>

      {/* Right Utilities */}
      <div className="flex items-center gap-3 sm:gap-6">
        {/* Status Indicators */}
        <div className="flex items-center gap-2 sm:gap-3 border-r border-zinc-800 pr-3 sm:pr-6">
          {/* Socket.IO Connection */}
          <div className="flex items-center gap-1.5 bg-zinc-950 px-2.5 py-1 rounded-none border border-zinc-800 text-[10px] sm:text-[11px] font-mono text-zinc-300">
            <span
              className={`w-1.5 h-1.5 rounded-none ${
                socketConnected ? "bg-white" : "bg-red-500 animate-pulse"
              }`}
            ></span>
            <span className="hidden sm:inline">{socketConnected ? "SOCKET: LIVE" : "SOCKET: OFFLINE"}</span>
            <span className="sm:hidden">{socketConnected ? "LIVE" : "OFF"}</span>
          </div>

          {/* Render Queue Status */}
          <div className="hidden md:flex items-center gap-1.5 bg-zinc-950 px-2.5 py-1 rounded-none border border-zinc-800 text-[11px] font-mono text-zinc-300">
            {activeJob ? (
              <>
                <Activity className="w-3.5 h-3.5 text-white animate-spin" />
                <span className="truncate max-w-[140px]">JOB: {activeJob.status.toUpperCase()}</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-zinc-400" />
                <span>QUEUE: IDLE</span>
              </>
            )}
          </div>
        </div>

        {/* User Account Info */}
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-none bg-zinc-900 border border-zinc-700 flex items-center justify-center text-white">
            <User className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-zinc-300" />
          </div>
          <div className="hidden sm:flex flex-col">
            <span className="text-xs font-semibold text-white font-mono leading-tight">{username || "ADMIN"}</span>
            <span className="text-[9px] text-zinc-500 font-mono uppercase tracking-wider">SUPER_USER</span>
          </div>
        </div>
      </div>
    </header>
  );
}

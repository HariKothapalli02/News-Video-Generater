import React from "react";
import {
  LayoutDashboard,
  Video,
  History,
  Cpu,
  Settings,
  LogOut,
  Sparkles,
  Loader2
} from "lucide-react";
import { useAuthStore } from "../store/authStore";
import { useVideoStore } from "../store/videoStore";

export default function Sidebar({ currentPage, setCurrentPage }) {
  const logout = useAuthStore((state) => state.logout);
  const activeJob = useVideoStore((state) => state.activeJob);

  const menuItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "generate", label: "Generate Video", icon: Video },
    { id: "history", label: "Video History", icon: History },
    { id: "system", label: "System Status", icon: Cpu },
    { id: "settings", label: "Settings", icon: Settings }
  ];

  return (
    <aside className="w-64 border-r border-slate-800 bg-[#0B0F19] flex flex-col h-screen fixed left-0 top-0 z-20">
      {/* Brand Header */}
      <div className="h-16 flex items-center px-6 border-b border-slate-800 gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-violet-600 flex items-center justify-center glow-primary">
          <Sparkles className="w-4.5 h-4.5 text-white" />
        </div>
        <span className="font-semibold text-lg text-white font-sans tracking-wide">
          ByteWire <span className="text-primary font-bold text-xs px-1.5 py-0.5 rounded bg-primary/10 ml-1">AI</span>
        </span>
      </div>

      {/* Navigation Menu */}
      <nav className="flex-1 px-4 py-6 space-y-1.5">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setCurrentPage(item.id)}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                isActive
                  ? "bg-primary text-white glow-primary"
                  : "text-slate-400 hover:bg-slate-800/50 hover:text-white"
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon className={`w-4.5 h-4.5 ${isActive ? "text-white" : "text-slate-400 group-hover:text-white"}`} />
                <span>{item.label}</span>
              </div>
              {item.id === "generate" && activeJob && (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Render Alert Card */}
      {activeJob && (
        <div className="px-4 mb-4">
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400">Rendering Video</span>
              <span className="text-[10px] text-primary bg-primary/10 font-bold px-2 py-0.5 rounded-full animate-pulse">
                {activeJob.progress}%
              </span>
            </div>
            <div className="text-xs text-white font-medium truncate">{activeJob.title}</div>
            <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden">
              <div
                className="bg-primary h-full transition-all duration-300 rounded-full"
                style={{ width: `${activeJob.progress}%` }}
              ></div>
            </div>
            <button
              onClick={() => setCurrentPage("generate")}
              className="text-[11px] font-semibold text-primary hover:text-white text-left transition-colors"
            >
              View live pipeline logs →
            </button>
          </div>
        </div>
      )}

      {/* User Actions */}
      <div className="p-4 border-t border-slate-800">
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:bg-red-950/20 hover:text-red-400 transition-colors"
        >
          <LogOut className="w-4.5 h-4.5" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}

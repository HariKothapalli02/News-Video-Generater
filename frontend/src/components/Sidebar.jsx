import React from "react";
import {
  LayoutDashboard,
  Video,
  History,
  Cpu,
  Settings,
  LogOut,
  Sparkles,
  Loader2,
  X
} from "lucide-react";
import { useAuthStore } from "../store/authStore";
import { useVideoStore } from "../store/videoStore";

export default function Sidebar({ currentPage, setCurrentPage, isOpen, onClose }) {
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
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Main Sidebar Element */}
      <aside
        className={`w-64 border-r border-zinc-800 bg-black flex flex-col h-screen fixed left-0 top-0 z-50 transition-transform duration-200 ease-in-out ${
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        {/* Brand Header */}
        <div className="h-16 flex items-center justify-between px-6 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-none bg-white text-black flex items-center justify-center font-black tracking-tighter text-xs border border-white">
              BW
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-base text-white tracking-wider font-mono">
                BYTEWIRE
              </span>
              <span className="text-[10px] bg-zinc-900 border border-zinc-700 text-zinc-300 font-mono px-1 py-0.2 rounded-none">
                PRO
              </span>
            </div>
          </div>

          {/* Close button for mobile screens */}
          <button
            onClick={onClose}
            className="lg:hidden p-1.5 text-zinc-400 hover:text-white border border-zinc-800 bg-zinc-950 rounded-none cursor-pointer"
            title="Close menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Menu */}
        <nav className="flex-1 px-3 py-6 space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setCurrentPage(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-none text-xs uppercase tracking-wider font-semibold transition-colors duration-150 cursor-pointer ${
                  isActive
                    ? "bg-white text-black border border-white"
                    : "text-zinc-400 hover:bg-zinc-900 hover:text-white border border-transparent"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${isActive ? "text-black" : "text-zinc-400"}`} />
                  <span>{item.label}</span>
                </div>
                {item.id === "generate" && activeJob && (
                  <Loader2 className={`w-3.5 h-3.5 animate-spin ${isActive ? "text-black" : "text-white"}`} />
                )}
              </button>
            );
          })}
        </nav>

        {/* Active Pipeline Card */}
        {activeJob && (
          <div className="px-3 mb-4">
            <div className="p-3.5 rounded-none bg-zinc-950 border border-zinc-800 flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">Rendering Video</span>
                <span className="text-[10px] font-mono text-black bg-white font-bold px-1.5 py-0.5 rounded-none">
                  {activeJob.progress}%
                </span>
              </div>
              <div className="text-xs text-white font-medium truncate font-mono">{activeJob.title}</div>
              <div className="w-full bg-zinc-900 h-1.5 rounded-none overflow-hidden border border-zinc-800">
                <div
                  className="bg-white h-full transition-all duration-300 rounded-none"
                  style={{ width: `${activeJob.progress}%` }}
                ></div>
              </div>
              <button
                onClick={() => setCurrentPage("generate")}
                className="text-[10px] uppercase font-mono tracking-wider text-zinc-400 hover:text-white text-left transition-colors cursor-pointer"
              >
                View Pipeline Stream →
              </button>
            </div>
          </div>
        )}

        {/* User Actions */}
        <div className="p-3 border-t border-zinc-800">
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-none text-xs uppercase tracking-wider font-semibold text-zinc-400 hover:bg-zinc-900 hover:text-white border border-transparent transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>
    </>
  );
}

import React from "react";
import {
  Video,
  Flame,
  Activity,
  Cpu,
  Database,
  HardDrive,
  Clock
} from "lucide-react";
import ProgressBar from "./ProgressBar";

export default function Statistics({ stats }) {
  if (!stats) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {/* Total Videos Card */}
      <div className="bg-card rounded-xl border border-slate-800 p-5 flex items-center justify-between glow-card">
        <div className="space-y-2">
          <span className="text-xs font-semibold text-slate-400 tracking-wider uppercase">Total Videos</span>
          <div className="text-3xl font-extrabold text-white font-sans">{stats.totalVideos}</div>
        </div>
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
          <Video className="w-6 h-6 text-primary" />
        </div>
      </div>

      {/* Generated Today Card */}
      <div className="bg-card rounded-xl border border-slate-800 p-5 flex items-center justify-between glow-card">
        <div className="space-y-2">
          <span className="text-xs font-semibold text-slate-400 tracking-wider uppercase">Generated Today</span>
          <div className="text-3xl font-extrabold text-white font-sans">{stats.generatedToday}</div>
        </div>
        <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
          <Flame className="w-6 h-6 text-emerald-400 animate-pulse" />
        </div>
      </div>

      {/* Current Status Card */}
      <div className="bg-card rounded-xl border border-slate-800 p-5 flex items-center justify-between glow-card">
        <div className="space-y-2">
          <span className="text-xs font-semibold text-slate-400 tracking-wider uppercase">Current Status</span>
          <div className={`text-lg font-bold font-sans ${stats.currentJob === "Rendering" ? "text-primary animate-pulse" : "text-slate-300"}`}>
            {stats.currentJob === "Rendering" ? "Rendering Video" : "Queue Idle"}
          </div>
        </div>
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center border ${
          stats.currentJob === "Rendering" 
            ? "bg-primary/10 border-primary/20" 
            : "bg-slate-800/50 border-slate-700/60"
        }`}>
          <Activity className={`w-6 h-6 ${stats.currentJob === "Rendering" ? "text-primary animate-spin" : "text-slate-400"}`} />
        </div>
      </div>

      {/* Average Time Card */}
      <div className="bg-card rounded-xl border border-slate-800 p-5 flex items-center justify-between glow-card">
        <div className="space-y-2">
          <span className="text-xs font-semibold text-slate-400 tracking-wider uppercase">Avg Render Time</span>
          <div className="text-2xl font-extrabold text-white font-sans">{stats.avgTime || "3m 24s"}</div>
        </div>
        <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
          <Clock className="w-6 h-6 text-amber-400" />
        </div>
      </div>

      {/* System Resources Section */}
      <div className="col-span-1 md:col-span-2 lg:col-span-4 bg-card rounded-xl border border-slate-800 p-6 glow-card">
        <h3 className="font-semibold text-sm text-white mb-6 tracking-wide border-b border-slate-850 pb-3 flex items-center gap-2">
          <Cpu className="w-4 h-4 text-primary" />
          <span>System Resources Usage</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* CPU Gauge */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs font-semibold text-slate-400">
              <span className="flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-blue-400" /> CPU Usage
              </span>
              <span className="text-white">{stats.cpu}%</span>
            </div>
            <ProgressBar
              progress={stats.cpu}
              colorClass={stats.cpu > 80 ? "bg-error glow-primary" : stats.cpu > 50 ? "bg-warning" : "bg-primary"}
            />
          </div>

          {/* RAM Gauge */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs font-semibold text-slate-400">
              <span className="flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-emerald-400" /> RAM Usage
              </span>
              <span className="text-white">{stats.ram}% <span className="text-[10px] text-slate-500 font-medium">({stats.ramDetail || "4.2 GB"})</span></span>
            </div>
            <ProgressBar
              progress={stats.ram}
              colorClass={stats.ram > 85 ? "bg-error" : stats.ram > 65 ? "bg-warning" : "bg-success"}
            />
          </div>

          {/* Disk Gauge */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs font-semibold text-slate-400">
              <span className="flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-pink-400" /> Disk Usage
              </span>
              <span className="text-white">{stats.disk}% <span className="text-[10px] text-slate-500 font-medium">({stats.diskDetail || "45 GB"})</span></span>
            </div>
            <ProgressBar
              progress={stats.disk}
              colorClass={stats.disk > 90 ? "bg-error" : stats.disk > 75 ? "bg-warning" : "bg-pink-500"}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

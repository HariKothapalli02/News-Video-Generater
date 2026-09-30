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
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
      {/* Total Videos Card */}
      <div className="bg-zinc-950 rounded-none border border-zinc-800 p-5 flex items-center justify-between">
        <div className="space-y-1.5">
          <span className="text-[10px] font-mono font-bold text-zinc-400 tracking-wider uppercase">Total Videos</span>
          <div className="text-3xl font-black text-white font-mono">{stats.totalVideos}</div>
        </div>
        <div className="w-12 h-12 rounded-none bg-black flex items-center justify-center border border-zinc-800 text-white">
          <Video className="w-5 h-5 text-white" />
        </div>
      </div>

      {/* Generated Today Card */}
      <div className="bg-zinc-950 rounded-none border border-zinc-800 p-5 flex items-center justify-between">
        <div className="space-y-1.5">
          <span className="text-[10px] font-mono font-bold text-zinc-400 tracking-wider uppercase">Generated Today</span>
          <div className="text-3xl font-black text-white font-mono">{stats.generatedToday}</div>
        </div>
        <div className="w-12 h-12 rounded-none bg-black flex items-center justify-center border border-zinc-800 text-white">
          <Flame className="w-5 h-5 text-white animate-pulse" />
        </div>
      </div>

      {/* Current Status Card */}
      <div className="bg-zinc-950 rounded-none border border-zinc-800 p-5 flex items-center justify-between">
        <div className="space-y-1.5">
          <span className="text-[10px] font-mono font-bold text-zinc-400 tracking-wider uppercase">Engine Status</span>
          <div className={`text-base font-bold font-mono uppercase ${stats.currentJob === "Rendering" ? "text-white animate-pulse" : "text-zinc-400"}`}>
            {stats.currentJob === "Rendering" ? "Rendering Active" : "Queue Idle"}
          </div>
        </div>
        <div className="w-12 h-12 rounded-none bg-black flex items-center justify-center border border-zinc-800">
          <Activity className={`w-5 h-5 ${stats.currentJob === "Rendering" ? "text-white animate-spin" : "text-zinc-500"}`} />
        </div>
      </div>

      {/* Average Time Card */}
      <div className="bg-zinc-950 rounded-none border border-zinc-800 p-5 flex items-center justify-between">
        <div className="space-y-1.5">
          <span className="text-[10px] font-mono font-bold text-zinc-400 tracking-wider uppercase">Avg Render Duration</span>
          <div className="text-2xl font-black text-white font-mono">{stats.avgTime || "3m 24s"}</div>
        </div>
        <div className="w-12 h-12 rounded-none bg-black flex items-center justify-center border border-zinc-800 text-white">
          <Clock className="w-5 h-5 text-white" />
        </div>
      </div>

      {/* System Resources Section */}
      <div className="col-span-1 sm:col-span-2 lg:col-span-4 bg-zinc-950 rounded-none border border-zinc-800 p-5 sm:p-6">
        <h3 className="font-bold text-xs text-white mb-5 tracking-wider uppercase font-mono border-b border-zinc-800 pb-3 flex items-center gap-2">
          <Cpu className="w-4 h-4 text-white" />
          <span>System Resource Allocation</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* CPU Gauge */}
          <div className="space-y-2 bg-black border border-zinc-850 p-4 rounded-none">
            <div className="flex justify-between items-center text-xs font-mono text-zinc-400">
              <span className="flex items-center gap-1.5 uppercase">
                <Cpu className="w-3.5 h-3.5 text-zinc-300" /> CPU Core
              </span>
              <span className="text-white font-bold">{stats.cpu}%</span>
            </div>
            <ProgressBar
              progress={stats.cpu}
              colorClass={stats.cpu > 80 ? "bg-red-500" : "bg-white"}
            />
          </div>

          {/* RAM Gauge */}
          <div className="space-y-2 bg-black border border-zinc-850 p-4 rounded-none">
            <div className="flex justify-between items-center text-xs font-mono text-zinc-400">
              <span className="flex items-center gap-1.5 uppercase">
                <Database className="w-3.5 h-3.5 text-zinc-300" /> RAM Memory
              </span>
              <span className="text-white font-bold">
                {stats.ram}% <span className="text-[10px] text-zinc-500 font-normal">({stats.ramDetail || "4.2 GB"})</span>
              </span>
            </div>
            <ProgressBar
              progress={stats.ram}
              colorClass={stats.ram > 85 ? "bg-red-500" : "bg-white"}
            />
          </div>

          {/* Disk Gauge */}
          <div className="space-y-2 bg-black border border-zinc-850 p-4 rounded-none">
            <div className="flex justify-between items-center text-xs font-mono text-zinc-400">
              <span className="flex items-center gap-1.5 uppercase">
                <HardDrive className="w-3.5 h-3.5 text-zinc-300" /> Disk Usage
              </span>
              <span className="text-white font-bold">
                {stats.disk}% <span className="text-[10px] text-zinc-500 font-normal">({stats.diskDetail || "45 GB"})</span>
              </span>
            </div>
            <ProgressBar
              progress={stats.disk}
              colorClass={stats.disk > 90 ? "bg-red-500" : "bg-white"}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

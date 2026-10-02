import React, { useEffect, useState } from "react";
import { useVideoStore } from "../store/videoStore";
import Loader from "../components/Loader";
import ProgressBar from "../components/ProgressBar";
import {
  Cpu,
  Database,
  HardDrive,
  Clock,
  RotateCcw,
  Trash2,
  Server,
  Activity
} from "lucide-react";

export default function SystemStatus() {
  const { stats, fetchStats, clearStorage, cleanupStorage, restartService } = useVideoStore();
  const [clearingScratch, setClearingScratch] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);
  const [restarting, setRestarting] = useState(false);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(() => {
      fetchStats();
    }, 8000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  const handleClearScratch = async () => {
    if (
      window.confirm(
        "Purge all downloaded raw Pexels video clips and intermediate scratch rendering files from disk?\n\n(Final completed videos and project history will be preserved)."
      )
    ) {
      setClearingScratch(true);
      try {
        const res = await cleanupStorage("scratch");
        alert(res?.msg || "Downloaded clips and scratch cache purged successfully!");
      } catch (err) {
        alert("Failed to clear scratch cache: " + err.message);
      } finally {
        setClearingScratch(false);
      }
    }
  };

  const handleClearAllMp4 = async () => {
    if (
      window.confirm(
        "WARNING: This will permanently delete ALL generated full .mp4 videos, sliced 9:16 shorts, and downloaded clips from local disk storage to liberate maximum memory and drive space.\n\nProject metadata, scripts, and logs in the database will remain intact.\n\nProceed?"
      )
    ) {
      setClearingAll(true);
      try {
        const res = await cleanupStorage("all_mp4");
        alert(res?.msg || "All video MP4 files and clips purged successfully!");
      } catch (err) {
        alert("Failed to purge video files: " + err.message);
      } finally {
        setClearingAll(false);
      }
    }
  };

  const handleRestartService = async () => {
    if (window.confirm("WARNING: This will immediately kill the active rendering Python script, reset all ongoing generation jobs, and clear the queue manager locks. Proceed?")) {
      setRestarting(true);
      const success = await restartService();
      setRestarting(false);
      if (success) {
        alert("Queue service restarted successfully!");
      }
    }
  };

  if (!stats) {
    return <Loader label="POLLING HOST TELEMETRY PROBES..." />;
  }

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Headline */}
      <div className="flex flex-col gap-1 border-b border-zinc-800 pb-3">
        <div className="flex items-center gap-2">
          <Server className="w-4 h-4 text-white" />
          <h2 className="text-base font-bold text-white tracking-wider font-mono uppercase">
            System Telemetry & Controls
          </h2>
        </div>
        <p className="text-xs text-zinc-400 font-mono">
          Host allocation metrics, subprocess queue locks, and disk operations
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Hardware telemetry (col-8) */}
        <div className="lg:col-span-8 space-y-5 bg-zinc-950 border border-zinc-800 rounded-none p-5 sm:p-6">
          <h3 className="font-bold text-xs text-white uppercase font-mono tracking-wider mb-4 border-b border-zinc-800 pb-2 flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-white" />
            <span>Hardware Allocation Probes</span>
          </h3>

          <div className="space-y-5">
            {/* CPU */}
            <div className="space-y-2 bg-black border border-zinc-850 rounded-none p-4 font-mono">
              <div className="flex justify-between items-center text-xs">
                <span className="flex items-center gap-2 text-zinc-300 uppercase">
                  <Cpu className="w-4 h-4 text-white" /> CPU Processor Utilization
                </span>
                <span className="text-white text-sm font-bold">{stats.cpu}%</span>
              </div>
              <ProgressBar
                progress={stats.cpu}
                height="h-2.5"
                colorClass={stats.cpu > 75 ? "bg-red-500" : "bg-white"}
              />
            </div>

            {/* RAM */}
            <div className="space-y-2 bg-black border border-zinc-850 rounded-none p-4 font-mono">
              <div className="flex justify-between items-center text-xs">
                <span className="flex items-center gap-2 text-zinc-300 uppercase">
                  <Database className="w-4 h-4 text-white" /> RAM Memory Allocation
                </span>
                <span className="text-white text-sm font-bold">
                  {stats.ram}% <span className="text-[10px] text-zinc-500 font-normal">({stats.ramDetail})</span>
                </span>
              </div>
              <ProgressBar
                progress={stats.ram}
                height="h-2.5"
                colorClass={stats.ram > 80 ? "bg-red-500" : "bg-white"}
              />
            </div>

            {/* Disk */}
            <div className="space-y-2 bg-black border border-zinc-850 rounded-none p-4 font-mono">
              <div className="flex justify-between items-center text-xs">
                <span className="flex items-center gap-2 text-zinc-300 uppercase">
                  <HardDrive className="w-4 h-4 text-white" /> Disk Storage Capacity
                </span>
                <span className="text-white text-sm font-bold">
                  {stats.disk}% <span className="text-[10px] text-zinc-500 font-normal">({stats.diskDetail})</span>
                </span>
              </div>
              <ProgressBar
                progress={stats.disk}
                height="h-2.5"
                colorClass={stats.disk > 90 ? "bg-red-500" : "bg-white"}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 border-t border-zinc-800 pt-5 mt-5 font-mono">
            <div className="flex items-center gap-3 bg-black p-3 rounded-none border border-zinc-850">
              <Clock className="w-4 h-4 text-zinc-400" />
              <div className="flex flex-col">
                <span className="text-[9px] font-bold text-zinc-500 uppercase">System Uptime</span>
                <span className="text-xs font-bold text-white">{stats.uptime || "Operational"}</span>
              </div>
            </div>
            <div className="flex items-center gap-3 bg-black p-3 rounded-none border border-zinc-850">
              <Activity className="w-4 h-4 text-zinc-400" />
              <div className="flex flex-col">
                <span className="text-[9px] font-bold text-zinc-500 uppercase">Engine Threads</span>
                <span className="text-xs font-bold text-white">{stats.currentJob === "Rendering" ? "Active Render" : "Idle"}</span>
              </div>
            </div>
          </div>
        </div>

        {/* System Operations controls (col-4) */}
        <div className="lg:col-span-4 space-y-5">
          <div className="bg-zinc-950 border border-zinc-800 rounded-none p-5 space-y-4 font-mono">
            <h3 className="font-bold text-xs text-white uppercase tracking-wider border-b border-zinc-800 pb-2">
              Maintenance Operations
            </h3>

            <p className="text-xs text-zinc-400 leading-relaxed">
              Execute routine server management operations below. Ensure no critical video render tasks are executing prior to invocation.
            </p>

            {/* Purge Scratch Footage Operation */}
            <div className="border border-zinc-850 p-4 rounded-none space-y-2 bg-black">
              <div className="flex items-center gap-2 text-xs font-bold text-white">
                <Trash2 className="w-4 h-4 text-amber-400" />
                <span className="uppercase">Purge Raw Footage & Scratch</span>
              </div>
              <p className="text-[10px] text-zinc-500 leading-relaxed">
                Deletes all raw Pexels video downloads and temp rendering chunks in scratch folders. Keeps completed videos intact.
              </p>
              <button
                onClick={handleClearScratch}
                disabled={clearingScratch || stats.currentJob === "Rendering"}
                className="w-full py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 text-xs font-bold font-mono uppercase tracking-wider rounded-none transition-colors cursor-pointer disabled:opacity-40"
              >
                {clearingScratch ? "Purging Scratch..." : "Purge Temp Footage (Scratch)"}
              </button>
            </div>

            {/* Clear All MP4 Storage Operation */}
            <div className="border border-zinc-850 p-4 rounded-none space-y-2 bg-black">
              <div className="flex items-center gap-2 text-xs font-bold text-white">
                <Trash2 className="w-4 h-4 text-red-400" />
                <span className="uppercase">Flush All MP4 Videos & Cache</span>
              </div>
              <p className="text-[10px] text-zinc-500 leading-relaxed">
                Permanently wipes all generated full MP4 videos, sliced vertical shorts, and preview images to liberate maximum disk storage.
              </p>
              <button
                onClick={handleClearAllMp4}
                disabled={clearingAll || stats.currentJob === "Rendering"}
                className="w-full py-2 bg-transparent hover:bg-red-950 hover:text-red-200 hover:border-red-800 text-red-400 border border-zinc-750 text-xs font-bold font-mono uppercase tracking-wider rounded-none transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {clearingAll ? "Flushing All MP4s..." : "Wipe All MP4 Videos"}
              </button>
            </div>

            {/* Restart Queue Operation */}
            <div className="border border-zinc-850 p-4 rounded-none space-y-2.5 bg-black">
              <div className="flex items-center gap-2 text-xs font-bold text-white">
                <RotateCcw className="w-4 h-4 text-white" />
                <span className="uppercase">Reboot Pipeline Queue</span>
              </div>
              <p className="text-[10px] text-zinc-500 leading-relaxed">
                Terminates orphaned worker subprocesses, releases queue semaphores, and resets engine scheduler locks.
              </p>
              <button
                onClick={handleRestartService}
                disabled={restarting}
                className="w-full py-2 bg-white hover:bg-zinc-200 text-black text-xs font-bold font-mono uppercase tracking-wider rounded-none border border-white transition-colors cursor-pointer disabled:opacity-40"
              >
                {restarting ? "Rebooting Worker..." : "Restart Engine Service"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


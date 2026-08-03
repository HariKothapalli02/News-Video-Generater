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
  AlertTriangle,
  Server,
  Activity
} from "lucide-react";

export default function SystemStatus() {
  const { stats, fetchStats, clearStorage, restartService } = useVideoStore();
  const [clearing, setClearing] = useState(false);
  const [restarting, setRestarting] = useState(false);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(() => {
      fetchStats();
    }, 8000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  const handleClearCache = async () => {
    if (window.confirm("WARNING: This will permanently delete all generated video files (.mp4) and thumbnails (.png) from local disk storage. The database records will NOT be deleted, but downloading them will no longer be possible. Proceed?")) {
      setClearing(true);
      const success = await clearStorage();
      setClearing(false);
      if (success) {
        alert("Local storage disk cache cleared successfully!");
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
    return <Loader label="Interrogating system telemetry probes..." />;
  }

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Headline */}
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-bold text-white tracking-wide flex items-center gap-2">
          <Server className="w-5 h-5 text-primary" />
          <span>System Status & Operations</span>
        </h2>
        <p className="text-xs text-slate-400 font-medium">
          Monitor server hardware allocations, queue locks, and perform cache cleanup operations
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Hardware telemetry (col-8) */}
        <div className="lg:col-span-8 space-y-6 bg-card border border-slate-800 rounded-2xl p-6 glow-card">
          <h3 className="font-semibold text-sm text-white mb-6 border-b border-slate-850 pb-3 flex items-center gap-2">
            <Activity className="w-4.5 h-4.5 text-primary" />
            <span>Resource Monitor Telemetry</span>
          </h3>

          <div className="space-y-6">
            {/* CPU */}
            <div className="space-y-2 bg-slate-900/35 border border-slate-850/65 rounded-xl p-4">
              <div className="flex justify-between items-center text-xs font-semibold text-slate-450">
                <span className="flex items-center gap-2 text-slate-350">
                  <Cpu className="w-4.5 h-4.5 text-blue-450" /> CPU Core Load
                </span>
                <span className="text-white text-sm font-bold">{stats.cpu}%</span>
              </div>
              <ProgressBar
                progress={stats.cpu}
                height="h-3"
                colorClass={stats.cpu > 75 ? "bg-error" : stats.cpu > 45 ? "bg-warning" : "bg-primary"}
              />
            </div>

            {/* RAM */}
            <div className="space-y-2 bg-slate-900/35 border border-slate-850/65 rounded-xl p-4">
              <div className="flex justify-between items-center text-xs font-semibold text-slate-450">
                <span className="flex items-center gap-2 text-slate-350">
                  <Database className="w-4.5 h-4.5 text-success" /> RAM Memory Allocation
                </span>
                <span className="text-white text-sm font-bold">
                  {stats.ram}% <span className="text-[10px] text-slate-500 font-medium ml-1">({stats.ramDetail})</span>
                </span>
              </div>
              <ProgressBar
                progress={stats.ram}
                height="h-3"
                colorClass={stats.ram > 80 ? "bg-error" : stats.ram > 60 ? "bg-warning" : "bg-success"}
              />
            </div>

            {/* Disk */}
            <div className="space-y-2 bg-slate-900/35 border border-slate-850/65 rounded-xl p-4">
              <div className="flex justify-between items-center text-xs font-semibold text-slate-450">
                <span className="flex items-center gap-2 text-slate-350">
                  <HardDrive className="w-4.5 h-4.5 text-pink-400" /> Disk Storage Capacity
                </span>
                <span className="text-white text-sm font-bold">
                  {stats.disk}% <span className="text-[10px] text-slate-500 font-medium ml-1">({stats.diskDetail})</span>
                </span>
              </div>
              <ProgressBar
                progress={stats.disk}
                height="h-3"
                colorClass={stats.disk > 90 ? "bg-error" : stats.disk > 75 ? "bg-warning" : "bg-pink-500"}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 border-t border-slate-850 pt-6 mt-6">
            <div className="flex items-center gap-3 bg-slate-900/20 p-3 rounded-lg border border-slate-850">
              <Clock className="w-4.5 h-4.5 text-slate-400" />
              <div className="flex flex-col">
                <span className="text-[10px] font-semibold text-slate-500 uppercase">System Uptime</span>
                <span className="text-xs font-bold text-white">{stats.uptime || "Unknown"}</span>
              </div>
            </div>
            <div className="flex items-center gap-3 bg-slate-900/20 p-3 rounded-lg border border-slate-850">
              <Activity className="w-4.5 h-4.5 text-slate-400" />
              <div className="flex flex-col">
                <span className="text-[10px] font-semibold text-slate-500 uppercase">Active Threads</span>
                <span className="text-xs font-bold text-white">{stats.currentJob === "Rendering" ? "Rendering Active" : "Idle"}</span>
              </div>
            </div>
          </div>
        </div>

        {/* System Operations controls (col-4) */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-card border border-slate-800 rounded-2xl p-5 space-y-5 glow-card">
            <h3 className="font-semibold text-xs text-slate-400 tracking-wider uppercase border-b border-slate-850 pb-2">
              Administrative Control
            </h3>

            <p className="text-xs text-slate-450 leading-relaxed font-medium">
              Execute routine server maintenance operations below. Make sure no rendering operations are active before running cleanup.
            </p>

            {/* Clear Storage Operation */}
            <div className="border border-slate-850 p-4 rounded-xl space-y-3.5 bg-slate-900/25">
              <div className="flex items-center gap-2 text-xs font-bold text-white">
                <Trash2 className="w-4.5 h-4.5 text-pink-400" />
                <span>Wipe Disk Video Cache</span>
              </div>
              <p className="text-[10px] text-slate-500 leading-relaxed font-medium">
                Deletes all generated `.mp4` and `.png` image previews inside the `/videos` and `/thumbnail` storage directories to free up local disk space.
              </p>
              <button
                onClick={handleClearCache}
                disabled={clearing || stats.currentJob === "Rendering"}
                className="w-full py-2 bg-pink-600/10 hover:bg-pink-600 text-pink-400 hover:text-white border border-pink-600/25 hover:border-pink-600 text-xs font-bold rounded-lg transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {clearing ? "Wiping Disk..." : "Clear Cache Storage"}
              </button>
            </div>

            {/* Restart Queue Operation */}
            <div className="border border-slate-850 p-4 rounded-xl space-y-3.5 bg-slate-900/25">
              <div className="flex items-center gap-2 text-xs font-bold text-white">
                <RotateCcw className="w-4.5 h-4.5 text-amber-400" />
                <span>Reboot Queue Manager</span>
              </div>
              <p className="text-[10px] text-slate-500 leading-relaxed font-medium">
                Kills any active subprocess script tasks, forces the queue locks to unlock, and updates active tasks back to Stopped.
              </p>
              <button
                onClick={handleRestartService}
                disabled={restarting}
                className="w-full py-2 bg-amber-600/10 hover:bg-amber-600 text-amber-405 hover:text-white border border-amber-600/25 hover:border-amber-600 text-xs font-bold rounded-lg transition-all cursor-pointer disabled:opacity-40"
              >
                {restarting ? "Resetting State..." : "Restart Render Service"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

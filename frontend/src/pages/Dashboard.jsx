import React, { useEffect } from "react";
import { useVideoStore } from "../store/videoStore";
import Statistics from "../components/Statistics";
import RecentVideos from "../components/RecentVideos";
import Loader from "../components/Loader";
import { Activity, LayoutDashboard, ArrowRight } from "lucide-react";

export default function Dashboard({ setCurrentPage, setSelectedVideoId }) {
  const {
    history,
    stats,
    activeJob,
    fetchHistory,
    fetchStats,
    connectSocket
  } = useVideoStore();

  useEffect(() => {
    fetchHistory();
    fetchStats();
    connectSocket();
    
    // Poll stats every 10 seconds for real-time CPU/RAM updates
    const interval = setInterval(() => {
      fetchStats();
    }, 10000);

    return () => {
      clearInterval(interval);
    };
  }, [fetchHistory, fetchStats, connectSocket]);

  const handleViewVideo = (id) => {
    setSelectedVideoId(id);
    setCurrentPage("details");
  };

  if (!stats && history.length === 0) {
    return <Loader label="CONNECTING TO ENGINE TELEMETRY..." />;
  }

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Top Banner Callout for ongoing render */}
      {activeJob && (
        <div className="bg-zinc-950 border border-zinc-800 rounded-none p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-none bg-black flex items-center justify-center border border-zinc-800">
              <Activity className="w-5 h-5 text-white animate-pulse" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-none bg-white animate-ping"></span>
                <h4 className="text-xs font-bold text-white uppercase font-mono tracking-wider">
                  Rendering Pipeline Active
                </h4>
              </div>
              <p className="text-xs text-zinc-400 font-mono">
                GENERATING: <span className="text-white font-bold">{activeJob.title}</span> ({activeJob.status})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-base font-black text-white font-mono">{activeJob.progress}%</span>
            <button
              onClick={() => setCurrentPage("generate")}
              className="bg-white hover:bg-zinc-200 text-black px-4 py-2 rounded-none text-xs font-bold uppercase tracking-wider font-mono transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <span>Monitor Stream</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Dashboard Headline */}
      <div className="flex flex-col gap-1 border-b border-zinc-800 pb-3">
        <div className="flex items-center gap-2">
          <LayoutDashboard className="w-4 h-4 text-white" />
          <h2 className="text-base font-bold text-white tracking-wider font-mono uppercase">
            Platform Telemetry
          </h2>
        </div>
        <p className="text-xs text-zinc-400 font-mono">
          Full HD 1080p automated video generator controller
        </p>
      </div>

      {/* Statistics widgets */}
      <Statistics stats={stats} />

      {/* Recent Videos table */}
      <RecentVideos videos={history} onView={handleViewVideo} />
    </div>
  );
}


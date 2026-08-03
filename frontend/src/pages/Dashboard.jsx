import React, { useEffect } from "react";
import { useVideoStore } from "../store/videoStore";
import Statistics from "../components/Statistics";
import RecentVideos from "../components/RecentVideos";
import Loader from "../components/Loader";
import { Activity, Play, Sparkles } from "lucide-react";

export default function Dashboard({ setCurrentPage, setSelectedVideoId }) {
  const {
    history,
    stats,
    activeJob,
    fetchHistory,
    fetchStats,
    connectSocket,
    disconnectSocket
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
    return <Loader label="Bootstrapping administrative dashboards..." />;
  }

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Top Banner Callout for ongoing render */}
      {activeJob && (
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-5 flex items-center justify-between glow-primary">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center border border-primary/20">
              <Activity className="w-5 h-5 text-primary animate-pulse" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-semibold text-white">Rendering pipeline active</h4>
              <p className="text-xs text-slate-400">
                Generating: <span className="text-white font-medium">{activeJob.title}</span> ({activeJob.status})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-sm font-bold text-primary font-sans">{activeJob.progress}%</span>
            <button
              onClick={() => setCurrentPage("generate")}
              className="bg-primary hover:bg-blue-600 px-4 py-2 rounded-lg text-xs font-semibold text-white shadow-lg shadow-primary/20 transition-all duration-200 cursor-pointer"
            >
              Monitor logs
            </button>
          </div>
        </div>
      )}

      {/* Dashboard Headline */}
      <div className="flex flex-col gap-1.5">
        <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          <span>Platform Overview</span>
        </h2>
        <p className="text-xs text-slate-400 font-medium">
          Automated YouTube news workflow controller console
        </p>
      </div>

      {/* Statistics widgets */}
      <Statistics stats={stats} />

      {/* Recent Videos table */}
      <RecentVideos videos={history} onView={handleViewVideo} />
    </div>
  );
}

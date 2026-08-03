import React, { useEffect } from "react";
import { useVideoStore } from "../store/videoStore";
import VideoCard from "../components/VideoCard";
import Loader from "../components/Loader";
import { Film, Trash2, History as HistoryIcon, Sparkles } from "lucide-react";

export default function History({ setCurrentPage, setSelectedVideoId }) {
  const { history, fetchHistory, deleteVideo, connectSocket, loading } = useVideoStore();

  useEffect(() => {
    fetchHistory();
    connectSocket();
  }, [fetchHistory, connectSocket]);

  const handleView = (id) => {
    setSelectedVideoId(id);
    setCurrentPage("details");
  };

  const handleDelete = async (id) => {
    if (window.confirm("Are you sure you want to permanently delete this video, including its local filesystem MP4 file and thumbnail?")) {
      await deleteVideo(id);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Page Header */}
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-bold text-white tracking-wide flex items-center gap-2">
          <HistoryIcon className="w-5 h-5 text-primary" />
          <span>Generation History</span>
        </h2>
        <p className="text-xs text-slate-400 font-medium">
          Manage generated scripts, download finished MP4 rendering, or clear records
        </p>
      </div>

      {loading && history.length === 0 ? (
        <Loader label="Retrieving generation history repository..." />
      ) : history.length === 0 ? (
        <div className="bg-card border border-slate-800 rounded-2xl p-16 flex flex-col items-center justify-center text-center gap-4 glow-card">
          <div className="w-16 h-16 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-center">
            <Film className="w-8 h-8 text-slate-500" />
          </div>
          <div className="space-y-1 max-w-sm">
            <h3 className="font-bold text-white text-sm">No news updates recorded</h3>
            <p className="text-xs text-slate-400 leading-relaxed font-medium">
              You haven't generated any videos yet. Go to "Generate Video" to execute the pipeline.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {history.map((video) => (
            <VideoCard
              key={video._id}
              video={video}
              onView={handleView}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

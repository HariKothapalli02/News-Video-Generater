import React, { useEffect } from "react";
import { useVideoStore } from "../store/videoStore";
import VideoCard from "../components/VideoCard";
import Loader from "../components/Loader";
import { Film, History as HistoryIcon } from "lucide-react";

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
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Page Header */}
      <div className="flex flex-col gap-1 border-b border-zinc-800 pb-3">
        <div className="flex items-center gap-2">
          <HistoryIcon className="w-4 h-4 text-white" />
          <h2 className="text-base font-bold text-white tracking-wider font-mono uppercase">
            Generation Archives
          </h2>
        </div>
        <p className="text-xs text-zinc-400 font-mono">
          Manage rendered Full HD videos, inspect scripts and download files
        </p>
      </div>

      {loading && history.length === 0 ? (
        <Loader label="SCANNING ARCHIVE STORAGE..." />
      ) : history.length === 0 ? (
        <div className="bg-zinc-950 border border-zinc-800 rounded-none p-12 sm:p-16 flex flex-col items-center justify-center text-center gap-4">
          <div className="w-12 h-12 rounded-none bg-black border border-zinc-800 flex items-center justify-center text-white">
            <Film className="w-6 h-6 text-zinc-400" />
          </div>
          <div className="space-y-1 max-w-sm">
            <h3 className="font-bold text-white text-xs font-mono uppercase tracking-wider">No Archive Records</h3>
            <p className="text-xs text-zinc-500 leading-relaxed font-mono">
              No videos generated yet. Navigate to "Generate Video" to execute the pipeline.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
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


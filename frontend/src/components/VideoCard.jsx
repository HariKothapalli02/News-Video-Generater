import React from "react";
import {
  Calendar,
  Download,
  Eye,
  Trash2,
  Play,
  Film
} from "lucide-react";
import StatusBadge from "./StatusBadge";

export default function VideoCard({ video, onView, onDelete }) {
  const isCompleted = video.status === "Completed";
  
  // Format creation date
  const formatDate = (dateStr) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric"
      });
    } catch (_) {
      return dateStr;
    }
  };

  // Format video duration
  const formatDuration = (seconds) => {
    if (!seconds) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const thumbUrl = video.thumbnail ? video.thumbnail : null;
  const downloadUrl = `/api/download/${video._id}`;

  return (
    <div className="bg-zinc-950 rounded-none overflow-hidden border border-zinc-800 hover:border-zinc-500 transition-all duration-200 flex flex-col group">
      {/* Thumbnail / Status Container */}
      <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden border-b border-zinc-800">
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt={video.title}
            className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-300 rounded-none"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-zinc-600">
            <Film className="w-8 h-8 text-zinc-700" />
            <span className="text-[10px] font-mono tracking-wider">NO PREVIEW FRAME</span>
          </div>
        )}

        {/* Floating Duration Badge */}
        {isCompleted && video.duration > 0 && (
          <div className="absolute bottom-2 right-2 bg-black/95 border border-zinc-800 px-1.5 py-0.5 rounded-none text-[10px] font-mono font-bold text-white tracking-wider">
            {formatDuration(video.duration)}
          </div>
        )}

        {/* Shorts Ready Badge */}
        {video.shorts && video.shorts.length > 0 && (
          <div className="absolute top-2 left-2 bg-white text-black px-1.5 py-0.5 rounded-none text-[9px] font-mono font-bold tracking-wider uppercase">
            {video.shorts.length} Shorts Ready
          </div>
        )}

        {/* Published on YouTube Badge */}
        {(video.isPosted || video.youtubeVideoId) && (
          <div className="absolute top-2 right-2 bg-red-600 text-white px-1.5 py-0.5 rounded-none text-[9px] font-mono font-bold tracking-wider uppercase flex items-center gap-1 shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            <span>Published</span>
          </div>
        )}

        {/* Hover overlay play screen */}
        {isCompleted && thumbUrl && (
          <div
            className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity duration-200 cursor-pointer"
            onClick={() => onView(video._id)}
          >
            <div className="w-10 h-10 rounded-none bg-white text-black flex items-center justify-center border border-white">
              <Play className="w-4 h-4 fill-current ml-0.5" />
            </div>
          </div>
        )}
      </div>

      {/* Info Body */}
      <div className="p-4 flex-1 flex flex-col justify-between gap-3">
        <div className="space-y-1.5">
          <h3 className="font-semibold text-xs text-white line-clamp-1 group-hover:underline font-mono">
            {video.title}
          </h3>
          <div className="flex items-center gap-2 text-[11px] text-zinc-400 font-mono">
            <span className="uppercase">{video.subject}</span>
            <span>•</span>
            <span className="uppercase text-zinc-500">{video.language}</span>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-zinc-900 pt-3">
          <div className="flex items-center gap-1.5 text-zinc-500 text-[10px] font-mono">
            <Calendar className="w-3 h-3" />
            <span>{formatDate(video.createdAt)}</span>
          </div>
          <StatusBadge status={video.status} />
        </div>
      </div>

      {/* Action Footer */}
      <div className="bg-black border-t border-zinc-800 px-3.5 py-2.5 flex gap-2">
        <button
          onClick={() => onView(video._id)}
          className="flex-1 flex items-center justify-center gap-1.5 bg-zinc-900 hover:bg-white hover:text-black text-white border border-zinc-800 rounded-none py-1.5 text-[11px] font-mono uppercase tracking-wider transition-colors cursor-pointer"
        >
          <Eye className="w-3 h-3" />
          <span>Inspect</span>
        </button>

        {isCompleted ? (
          <a
            href={downloadUrl}
            target="_blank"
            rel="noreferrer"
            className="flex-1 flex items-center justify-center gap-1.5 bg-white hover:bg-zinc-200 text-black border border-white rounded-none py-1.5 text-[11px] font-mono font-bold uppercase tracking-wider transition-colors text-center cursor-pointer"
          >
            <Download className="w-3 h-3" />
            <span>MP4</span>
          </a>
        ) : (
          <button
            disabled
            className="flex-1 flex items-center justify-center gap-1.5 bg-zinc-950 text-zinc-650 border border-zinc-900 rounded-none py-1.5 text-[11px] font-mono uppercase tracking-wider cursor-not-allowed opacity-30"
          >
            <Download className="w-3 h-3" />
            <span>MP4</span>
          </button>
        )}

        <button
          onClick={() => onDelete(video._id)}
          className="bg-black hover:bg-red-950/40 border border-zinc-800 hover:border-red-900 text-zinc-400 hover:text-red-400 p-2 rounded-none transition-colors cursor-pointer"
          title="Delete video"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

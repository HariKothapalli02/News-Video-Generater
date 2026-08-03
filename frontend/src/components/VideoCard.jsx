import React from "react";
import {
  Calendar,
  Clock,
  Download,
  Eye,
  Trash2,
  AlertTriangle,
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
    const s = seconds % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const thumbUrl = video.thumbnail ? `http://localhost:5000${video.thumbnail}` : null;
  const downloadUrl = `http://localhost:5000/api/download/${video._id}`;

  return (
    <div className="bg-card rounded-xl overflow-hidden border border-slate-800 hover:border-slate-700 transition-all duration-300 flex flex-col group glow-card">
      {/* Thumbnail / Status Container */}
      <div className="relative aspect-video bg-slate-950 flex items-center justify-center overflow-hidden border-b border-slate-800">
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt={video.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-slate-600">
            <Film className="w-10 h-10 animate-pulse text-slate-700" />
            <span className="text-[11px] font-medium tracking-wide">No preview frame</span>
          </div>
        )}

        {/* Floating Duration Badge */}
        {isCompleted && video.duration > 0 && (
          <div className="absolute bottom-2.5 right-2.5 bg-black/85 backdrop-blur-sm border border-slate-800 px-2 py-0.5 rounded text-[10px] font-bold text-white tracking-wide">
            {formatDuration(video.duration)}
          </div>
        )}

        {/* Hover overlay play screen */}
        {isCompleted && thumbUrl && (
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity duration-300 cursor-pointer" onClick={() => onView(video._id)}>
            <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center shadow-lg text-white scale-90 group-hover:scale-100 transition-all duration-300">
              <Play className="w-4.5 h-4.5 fill-current ml-0.5" />
            </div>
          </div>
        )}
      </div>

      {/* Info Body */}
      <div className="p-4 flex-1 flex flex-col justify-between gap-4">
        <div className="space-y-2">
          <h3 className="font-semibold text-sm text-white line-clamp-1 group-hover:text-primary transition-colors duration-200">
            {video.title}
          </h3>
          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
            <span>Subject: {video.subject}</span>
            <span>•</span>
            <span className="capitalize">{video.language}</span>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-slate-800/60 pt-3">
          <div className="flex items-center gap-1.5 text-slate-500 text-[11px] font-medium">
            <Calendar className="w-3.5 h-3.5" />
            <span>{formatDate(video.createdAt)}</span>
          </div>
          <StatusBadge status={video.status} />
        </div>
      </div>

      {/* Action Footer */}
      <div className="bg-slate-900/40 border-t border-slate-800/80 px-4 py-3 flex gap-2">
        <button
          onClick={() => onView(video._id)}
          className="flex-1 flex items-center justify-center gap-1.5 bg-slate-800/80 hover:bg-slate-800 text-white border border-slate-700/60 hover:border-slate-600 rounded-lg py-2 text-xs font-semibold transition-all duration-200"
        >
          <Eye className="w-3.5 h-3.5" />
          <span>View</span>
        </button>

        {isCompleted ? (
          <a
            href={downloadUrl}
            target="_blank"
            rel="noreferrer"
            className="flex-1 flex items-center justify-center gap-1.5 bg-primary/10 hover:bg-primary text-primary hover:text-white border border-primary/20 hover:border-primary rounded-lg py-2 text-xs font-semibold transition-all duration-200 text-center"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download</span>
          </a>
        ) : (
          <button
            disabled
            className="flex-1 flex items-center justify-center gap-1.5 bg-slate-800/30 text-slate-600 border border-slate-800/50 rounded-lg py-2 text-xs font-semibold cursor-not-allowed"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download</span>
          </button>
        )}

        <button
          onClick={() => onDelete(video._id)}
          className="bg-slate-850 hover:bg-red-950/25 border border-slate-750 hover:border-red-900/30 text-slate-400 hover:text-red-400 p-2.5 rounded-lg transition-all duration-200"
          title="Delete video"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

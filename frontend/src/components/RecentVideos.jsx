import React from "react";
import { Eye, Download, Play, Film } from "lucide-react";
import StatusBadge from "./StatusBadge";

export default function RecentVideos({ videos, onView }) {
  if (!videos || videos.length === 0) {
    return (
      <div className="bg-card border border-slate-800 rounded-xl p-8 flex flex-col items-center justify-center text-slate-500 text-sm gap-2">
        <Film className="w-8 h-8 text-slate-700" />
        <span>No videos generated yet. Head over to Generate Video.</span>
      </div>
    );
  }

  const formatDuration = (seconds) => {
    if (!seconds) return "--";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const getThumbUrl = (v) => {
    return v.thumbnail ? `http://localhost:5000${v.thumbnail}` : null;
  };

  return (
    <div className="bg-card border border-slate-800 rounded-xl overflow-hidden glow-card">
      <div className="px-6 py-4 border-b border-slate-850 flex items-center justify-between">
        <h3 className="font-semibold text-sm text-white tracking-wide">Recently Generated Videos</h3>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-850 text-slate-400 text-[11px] font-bold uppercase tracking-wider bg-slate-900/20">
              <th className="px-6 py-3.5 w-16">Preview</th>
              <th className="px-6 py-3.5">Title</th>
              <th className="px-6 py-3.5">Subject</th>
              <th className="px-6 py-3.5">Language</th>
              <th className="px-6 py-3.5">Duration</th>
              <th className="px-6 py-3.5">Status</th>
              <th className="px-6 py-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-850">
            {videos.slice(0, 5).map((v) => {
              const thumb = getThumbUrl(v);
              const downloadUrl = `http://localhost:5000/api/download/${v._id}`;
              const isCompleted = v.status === "Completed";

              return (
                <tr
                  key={v._id}
                  className="hover:bg-slate-800/25 transition-colors group text-sm text-slate-350"
                >
                  <td className="px-6 py-3">
                    <div className="w-14 aspect-video bg-slate-950 rounded overflow-hidden border border-slate-800 flex items-center justify-center relative">
                      {thumb ? (
                        <img src={thumb} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Film className="w-3.5 h-3.5 text-slate-700" />
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-3 font-medium text-white max-w-xs truncate group-hover:text-primary transition-colors">
                    {v.title}
                  </td>
                  <td className="px-6 py-3 capitalize">{v.subject}</td>
                  <td className="px-6 py-3 capitalize">{v.language}</td>
                  <td className="px-6 py-3">{formatDuration(v.duration)}</td>
                  <td className="px-6 py-3">
                    <StatusBadge status={v.status} />
                  </td>
                  <td className="px-6 py-3 text-right">
                    <div className="flex items-center justify-end gap-2.5">
                      <button
                        onClick={() => onView(v._id)}
                        className="p-1.5 rounded bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white transition-colors"
                        title="View details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>

                      {isCompleted ? (
                        <a
                          href={downloadUrl}
                          className="p-1.5 rounded bg-primary/10 hover:bg-primary text-primary hover:text-white transition-colors"
                          title="Download video"
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Download className="w-4 h-4" />
                        </a>
                      ) : (
                        <button
                          disabled
                          className="p-1.5 rounded bg-slate-800/20 text-slate-650 cursor-not-allowed"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

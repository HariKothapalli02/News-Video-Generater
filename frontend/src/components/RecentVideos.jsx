import React from "react";
import { Eye, Download, Film } from "lucide-react";
import StatusBadge from "./StatusBadge";

export default function RecentVideos({ videos, onView }) {
  if (!videos || videos.length === 0) {
    return (
      <div className="bg-zinc-950 border border-zinc-800 rounded-none p-8 flex flex-col items-center justify-center text-zinc-500 text-xs font-mono gap-2">
        <Film className="w-8 h-8 text-zinc-700" />
        <span>NO VIDEOS GENERATED YET. NAVIGATE TO GENERATE VIDEO TO TRIGGER PIPELINE.</span>
      </div>
    );
  }

  const formatDuration = (seconds) => {
    if (!seconds) return "--";
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const getThumbUrl = (v) => {
    return v.thumbnail ? v.thumbnail : null;
  };

  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-none overflow-hidden">
      <div className="px-5 py-3.5 border-b border-zinc-800 flex items-center justify-between">
        <h3 className="font-bold text-xs text-white uppercase tracking-wider font-mono">
          Recent Generated Video Logs
        </h3>
        <span className="text-[10px] font-mono text-zinc-500">
          SHOWING TOP {Math.min(5, videos.length)}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[650px]">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-400 text-[10px] font-mono font-bold uppercase tracking-wider bg-black">
              <th className="px-5 py-3 w-16">Preview</th>
              <th className="px-5 py-3">Title</th>
              <th className="px-5 py-3">Subject</th>
              <th className="px-5 py-3">Language</th>
              <th className="px-5 py-3">Duration</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-850">
            {videos.slice(0, 5).map((v) => {
              const thumb = getThumbUrl(v);
              const downloadUrl = `/api/download/${v._id}`;
              const isCompleted = v.status === "Completed";

              return (
                <tr
                  key={v._id}
                  className="hover:bg-zinc-900/50 transition-colors group text-xs text-zinc-300 font-mono"
                >
                  <td className="px-5 py-2.5">
                    <div className="w-16 aspect-video bg-black rounded-none overflow-hidden border border-zinc-800 flex items-center justify-center relative">
                      {thumb ? (
                        <img src={thumb} alt="" className="w-full h-full object-cover rounded-none" />
                      ) : (
                        <Film className="w-3.5 h-3.5 text-zinc-700" />
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-2.5 font-medium text-white max-w-xs truncate group-hover:underline">
                    {v.title}
                  </td>
                  <td className="px-5 py-2.5 uppercase text-zinc-400 text-[11px]">{v.subject}</td>
                  <td className="px-5 py-2.5 uppercase text-zinc-400 text-[11px]">{v.language}</td>
                  <td className="px-5 py-2.5">{formatDuration(v.duration)}</td>
                  <td className="px-5 py-2.5">
                    <StatusBadge status={v.status} />
                  </td>
                  <td className="px-5 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => onView(v._id)}
                        className="p-1.5 rounded-none bg-black hover:bg-white hover:text-black border border-zinc-800 text-zinc-300 transition-colors cursor-pointer"
                        title="View details"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>

                      {isCompleted ? (
                        <a
                          href={downloadUrl}
                          className="p-1.5 rounded-none bg-white hover:bg-zinc-200 text-black border border-white transition-colors cursor-pointer"
                          title="Download Full HD MP4"
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>
                      ) : (
                        <button
                          disabled
                          className="p-1.5 rounded-none bg-zinc-900 border border-zinc-800 text-zinc-650 cursor-not-allowed opacity-40"
                        >
                          <Download className="w-3.5 h-3.5" />
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


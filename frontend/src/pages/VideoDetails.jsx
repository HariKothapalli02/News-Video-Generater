import React, { useEffect, useState } from "react";
import axios from "axios";
import {
  ArrowLeft,
  Download,
  Terminal,
  FileText,
  RotateCcw,
  FileVideo
} from "lucide-react";
import { useVideoStore } from "../store/videoStore";
import Loader from "../components/Loader";
import StatusBadge from "../components/StatusBadge";

export default function VideoDetails({ id, onBack }) {
  const [video, setVideo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("script"); // script | logs

  const { retryVideo, getHeaders } = useVideoStore();

  const fetchVideoDetails = async () => {
    setLoading(true);
    try {
      const headers = getHeaders();
      const baseUrl = import.meta.env.VITE_API_URL || (window.location.port ? `${window.location.protocol}//${window.location.hostname}:5000/api` : "/api");
      const res = await axios.get(`${baseUrl}/video/${id}`, headers);
      setVideo(res.data);
    } catch (err) {
      console.error("Error fetching video details:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVideoDetails();
  }, [id]);

  const handleRetry = async () => {
    if (video) {
      const success = await retryVideo(video._id);
      if (success) {
        onBack();
      }
    }
  };

  if (loading) {
    return <Loader label="QUERYING ARCHIVE METADATA..." />;
  }

  if (!video) {
    return (
      <div className="space-y-4 text-center py-12 text-zinc-500 font-mono">
        <p>RECORD NOT FOUND IN DATABASE ARCHIVES.</p>
        <button onClick={onBack} className="text-white underline font-bold flex items-center gap-1.5 justify-center cursor-pointer">
          <ArrowLeft className="w-4 h-4" /> RETURN TO LIST
        </button>
      </div>
    );
  }

  const isCompleted = video.status === "Completed";
  const isFailed = video.status === "Failed" || video.status === "Stopped";
  
  const videoUrl = isCompleted ? video.videoPath : null;
  const thumbUrl = video.thumbnail ? video.thumbnail : null;
  const downloadUrl = `/api/download/${video._id}`;

  const timelineSteps = [
    { key: "RSS", label: "RSS Collection", minProgress: 10 },
    { key: "Gemini", label: "Gemini Selection", minProgress: 20 },
    { key: "Script", label: "Script Generation", minProgress: 30 },
    { key: "Piper", label: "Piper Voice", minProgress: 45 },
    { key: "Whisper", label: "Whisper Subtitles", minProgress: 60 },
    { key: "Pexels", label: "Pexels 3-Clip Sync", minProgress: 70 },
    { key: "MoviePy", label: "MoviePy Rendering", minProgress: 85 },
    { key: "Completed", label: "Completed", minProgress: 100 }
  ];

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Top Breadcrumb Nav */}
      <div className="flex items-center gap-3 border-b border-zinc-800 pb-3">
        <button
          onClick={onBack}
          className="p-2 rounded-none bg-black border border-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500">Video Inspector</span>
          <h2 className="text-sm sm:text-base font-bold text-white tracking-wide font-mono uppercase">{video.title}</h2>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT: Video Player & Timeline Checklist */}
        <div className="lg:col-span-5 space-y-5">
          {/* Player Box */}
          <div className="bg-black border border-zinc-800 rounded-none overflow-hidden relative aspect-video flex items-center justify-center">
            {isCompleted && videoUrl ? (
              <video
                src={videoUrl}
                controls
                poster={thumbUrl || undefined}
                className="w-full h-full object-cover rounded-none"
              />
            ) : (
              <div className="flex flex-col items-center gap-3 text-center p-6 text-zinc-500">
                <FileVideo className="w-10 h-10 text-zinc-700 animate-pulse" />
                <div className="space-y-1">
                  <h4 className="text-white text-xs font-mono font-bold uppercase">Video Stream Unavailable</h4>
                  <p className="text-[10px] text-zinc-500 max-w-[220px] leading-relaxed font-mono">
                    {isFailed
                      ? "The render run aborted or failed. Trigger retry to recompile."
                      : "The video compile run is currently rendering in the engine pipeline."}
                  </p>
                </div>
                <StatusBadge status={video.status} />
              </div>
            )}
          </div>

          {/* Progress Timeline Checklist */}
          <div className="bg-zinc-950 border border-zinc-800 rounded-none p-4 space-y-3">
            <h3 className="font-bold text-[10px] font-mono text-zinc-400 tracking-wider uppercase border-b border-zinc-800 pb-2">
              Execution Timeline
            </h3>
            <div className="space-y-2.5">
              {timelineSteps.map((step) => {
                const passed = video.progress >= step.minProgress || (isCompleted && step.key === "Completed");
                
                return (
                  <div key={step.key} className="flex items-center justify-between text-xs font-mono">
                    <span className={passed ? "text-zinc-300 font-medium" : "text-zinc-600"}>
                      {step.label}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.2 rounded-none border ${
                        passed ? "bg-white text-black border-white" : "border-zinc-800 text-zinc-700 bg-black"
                      }`}
                    >
                      {passed ? "✓" : "·"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* RIGHT: Tabs (Script / Logs) */}
        <div className="lg:col-span-7 bg-zinc-950 border border-zinc-800 rounded-none overflow-hidden flex flex-col h-[520px]">
          {/* Tab Selection bar */}
          <div className="h-11 border-b border-zinc-800 bg-black px-4 flex items-center justify-between">
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab("script")}
                className={`flex items-center gap-1.5 h-11 text-xs font-mono uppercase tracking-wider border-b-2 px-2 transition-all cursor-pointer ${
                  activeTab === "script"
                    ? "border-white text-white font-bold"
                    : "border-transparent text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Script Content</span>
              </button>
              <button
                onClick={() => setActiveTab("logs")}
                className={`flex items-center gap-1.5 h-11 text-xs font-mono uppercase tracking-wider border-b-2 px-2 transition-all cursor-pointer ${
                  activeTab === "logs"
                    ? "border-white text-white font-bold"
                    : "border-transparent text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>Pipeline Logs</span>
              </button>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-2">
              {isCompleted ? (
                <a
                  href={downloadUrl}
                  className="flex items-center gap-1.5 bg-white hover:bg-zinc-200 px-3 py-1 text-black rounded-none text-xs font-mono font-bold uppercase tracking-wider transition-colors cursor-pointer"
                  target="_blank"
                  rel="noreferrer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download MP4</span>
                </a>
              ) : isFailed ? (
                <button
                  onClick={handleRetry}
                  className="flex items-center gap-1.5 bg-zinc-900 hover:bg-white hover:text-black border border-zinc-700 px-3 py-1 text-white rounded-none text-xs font-mono font-bold uppercase tracking-wider transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Retry Pipeline</span>
                </button>
              ) : null}
            </div>
          </div>

          {/* Content Pane */}
          <div className="flex-1 p-5 overflow-y-auto leading-relaxed text-xs text-zinc-300 font-mono bg-zinc-950">
            {activeTab === "script" ? (
              video.script ? (
                <div className="whitespace-pre-wrap select-text text-zinc-300 leading-relaxed font-mono">
                  {video.script}
                </div>
              ) : (
                <div className="text-zinc-600 text-xs italic flex flex-col items-center justify-center h-full py-12 gap-1 font-mono">
                  <span>SCRIPT DOCUMENT NOT POPULATED.</span>
                  <span>CURRENT PIPELINE STEP: {video.status}</span>
                </div>
              )
            ) : (
              <div className="font-mono text-xs text-zinc-350 space-y-1 bg-black p-4 rounded-none border border-zinc-850 h-full overflow-y-auto select-text">
                {video.logs ? (
                  video.logs.split("\n").map((line, idx) => (
                    <div key={idx} className="whitespace-pre-wrap select-text">
                      {line.startsWith("[PYTHON STDERR]") ? (
                        <span className="text-red-400 font-mono">{line}</span>
                      ) : line.startsWith("[PYTHON ERROR]") ? (
                        <span className="text-red-500 font-bold font-mono">{line}</span>
                      ) : line.startsWith("@STATUS") ? (
                        <span className="text-white font-bold font-mono">{line}</span>
                      ) : line.startsWith("[LOG]") ? (
                        <span className="text-zinc-300 font-mono">{line}</span>
                      ) : (
                        <span className="text-zinc-500 font-mono">{line}</span>
                      )}
                    </div>
                  ))
                ) : (
                  <span className="text-zinc-650 italic font-mono">No console logs available.</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

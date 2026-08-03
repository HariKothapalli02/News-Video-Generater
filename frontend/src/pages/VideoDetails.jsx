import React, { useEffect, useState } from "react";
import axios from "axios";
import {
  ArrowLeft,
  Download,
  Terminal,
  FileText,
  Clock,
  Play,
  RotateCcw,
  Sparkles,
  CheckCircle,
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
        onBack(); // Go back to generate or dashboard to view live progress
      }
    }
  };

  if (loading) {
    return <Loader label="Retrieving generation metadata records..." />;
  }

  if (!video) {
    return (
      <div className="space-y-4 text-center py-12 text-slate-500">
        <p>Video record not found in database.</p>
        <button onClick={onBack} className="text-primary font-semibold flex items-center gap-1.5 justify-center">
          <ArrowLeft className="w-4 h-4" /> Go Back
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
    { key: "Pexels", label: "Pexels Downloads", minProgress: 70 },
    { key: "MoviePy", label: "MoviePy Rendering", minProgress: 85 },
    { key: "Completed", label: "Completed", minProgress: 100 }
  ];

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Top Breadcrumb Nav */}
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="p-2 rounded-lg bg-card border border-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4.5 h-4.5" />
        </button>
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Project Details</span>
          <h2 className="text-lg font-bold text-white tracking-wide">{video.title}</h2>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* LEFT: Video Player & Timeline Checklist */}
        <div className="lg:col-span-5 space-y-6">
          {/* Player Box */}
          <div className="bg-slate-950 border border-slate-900 rounded-2xl overflow-hidden shadow-2xl relative aspect-video flex items-center justify-center glow-card">
            {isCompleted && videoUrl ? (
              <video
                src={videoUrl}
                controls
                poster={thumbUrl || undefined}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="flex flex-col items-center gap-3 text-center p-6 text-slate-500">
                <FileVideo className="w-12 h-12 text-slate-700 animate-pulse" />
                <div className="space-y-1">
                  <h4 className="text-white text-xs font-semibold">Video preview unavailable</h4>
                  <p className="text-[10px] text-slate-500 max-w-[200px] leading-relaxed">
                    {isFailed
                      ? "The render run aborted or failed. Click retry to run the pipeline again."
                      : "The video compile run is currently rendering in the queue."}
                  </p>
                </div>
                <StatusBadge status={video.status} />
              </div>
            )}
          </div>

          {/* Progress Timeline Checklist */}
          <div className="bg-card border border-slate-800 rounded-2xl p-5 space-y-4 glow-card">
            <h3 className="font-semibold text-xs text-slate-400 tracking-wider uppercase border-b border-slate-850 pb-2">
              Progress Timeline
            </h3>
            <div className="space-y-3.5">
              {timelineSteps.map((step) => {
                const passed = video.progress >= step.minProgress || (isCompleted && step.key === "Completed");
                
                return (
                  <div key={step.key} className="flex items-center justify-between text-xs">
                    <span className={`font-medium ${passed ? "text-slate-350" : "text-slate-650"}`}>
                      {step.label}
                    </span>
                    <span
                      className={`font-semibold ${
                        passed ? "text-success bg-success/10 px-2 py-0.5 rounded-full" : "text-slate-700"
                      }`}
                    >
                      {passed ? "✓" : "○"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* RIGHT: Tabs (Script / Logs) */}
        <div className="lg:col-span-7 bg-card border border-slate-800 rounded-2xl overflow-hidden flex flex-col glow-card h-[550px]">
          {/* Tab Selection bar */}
          <div className="h-12 border-b border-slate-850 bg-slate-900/30 px-6 flex items-center justify-between">
            <div className="flex gap-4">
              <button
                onClick={() => setActiveTab("script")}
                className={`flex items-center gap-2 h-12 text-xs font-semibold border-b-2 px-1 transition-all cursor-pointer ${
                  activeTab === "script"
                    ? "border-primary text-primary"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Generated Script</span>
              </button>
              <button
                onClick={() => setActiveTab("logs")}
                className={`flex items-center gap-2 h-12 text-xs font-semibold border-b-2 px-1 transition-all cursor-pointer ${
                  activeTab === "logs"
                    ? "border-primary text-primary"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>Generation Logs</span>
              </button>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-2">
              {isCompleted ? (
                <a
                  href={downloadUrl}
                  className="flex items-center gap-1.5 bg-primary hover:bg-blue-600 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all shadow-md shadow-primary/10 cursor-pointer"
                  target="_blank"
                  rel="noreferrer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download MP4</span>
                </a>
              ) : isFailed ? (
                <button
                  onClick={handleRetry}
                  className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Retry Job</span>
                </button>
              ) : null}
            </div>
          </div>

          {/* Content Pane */}
          <div className="flex-1 p-6 overflow-y-auto leading-relaxed text-sm text-slate-300 font-sans selection:bg-primary/20 selection:text-white">
            {activeTab === "script" ? (
              video.script ? (
                <div className="whitespace-pre-wrap font-sans text-sm select-text text-slate-300">
                  {video.script}
                </div>
              ) : (
                <div className="text-slate-650 text-xs italic flex flex-col items-center justify-center h-full py-12 gap-1">
                  <span>Script document not generated yet.</span>
                  <span>Pipeline is currently at step: {video.status}</span>
                </div>
              )
            ) : (
              <div className="font-mono text-xs text-slate-350 space-y-1 bg-slate-950 p-4 rounded-xl border border-slate-900 h-full overflow-y-auto select-text">
                {video.logs ? (
                  video.logs.split("\n").map((line, idx) => (
                    <div key={idx} className="whitespace-pre-wrap select-text">
                      {line.startsWith("[PYTHON STDERR]") ? (
                        <span className="text-error font-medium">{line}</span>
                      ) : line.startsWith("[PYTHON ERROR]") ? (
                        <span className="text-error font-bold">{line}</span>
                      ) : line.startsWith("[SYSTEM]") ? (
                        <span className="text-primary font-semibold">{line}</span>
                      ) : (
                        <span>{line}</span>
                      )}
                    </div>
                  ))
                ) : (
                  <span className="text-slate-650 italic">No execution logs written.</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

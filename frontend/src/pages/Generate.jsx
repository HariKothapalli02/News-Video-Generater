import React, { useState, useEffect, useRef } from "react";
import { useVideoStore } from "../store/videoStore";
import {
  Sparkles,
  Play,
  Square,
  RefreshCw,
  Terminal,
  Activity,
  CheckCircle2,
  Hourglass,
  Clock
} from "lucide-react";
import ProgressBar from "../components/ProgressBar";

export default function Generate() {
  const {
    activeJob,
    stats,
    generateVideo,
    stopGeneration,
    fetchActiveJob,
    fetchStats,
    connectSocket,
    disconnectSocket,
    clearActiveJob,
    error,
    clearError
  } = useVideoStore();

  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("technology news");
  const [customPrompt, setCustomPrompt] = useState("");
  const [language, setLanguage] = useState("english");
  const [useMusic, setUseMusic] = useState(true);
  const [useSubtitles, setUseSubtitles] = useState(true);
  const [videoType, setVideoType] = useState("tech_news");
  const [customScript, setCustomScript] = useState("");

  const logsEndRef = useRef(null);

  useEffect(() => {
    fetchActiveJob();
    fetchStats();
    connectSocket();
    clearError();
  }, [fetchActiveJob, fetchStats, connectSocket, clearError]);

  // Auto-scroll logs terminal
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [activeJob?.logs]);

  const handleGenerate = async (e) => {
    e.preventDefault();
    if (!title) return;
    if (videoType !== "specific_content" && !subject) return;

    clearError();
    const success = await generateVideo({
      title,
      subject: videoType === "specific_content" ? "custom script" : subject,
      language,
      useMusic,
      useSubtitles,
      customPrompt: videoType === "specific_content" ? "" : customPrompt,
      videoType,
      customScript: videoType === "specific_content" ? customScript : ""
    });

    if (success) {
      // Clear inputs
      setTitle("");
      setCustomPrompt("");
      setCustomScript("");
    }
  };

  const handleClear = () => {
    setTitle("");
    setSubject("technology news");
    setCustomPrompt("");
    setLanguage("english");
    setUseMusic(true);
    setUseSubtitles(true);
    setVideoType("tech_news");
    setCustomScript("");
    clearError();
  };

  // Timeline checklist steps
  const steps = [
    { key: "RSS Scrape", label: "RSS Collection", minProgress: 10 },
    { key: "Gemini Filter", label: "Gemini Selection", minProgress: 20 },
    { key: "Script Generation", label: "Script Generation", minProgress: 30 },
    { key: "Piper Voice", label: "Piper Voice Synthesizer", minProgress: 45 },
    { key: "Whisper Subtitles", label: "Whisper Subtitles Transcriber", minProgress: 60 },
    { key: "Pexels Downloads", label: "Pexels Footage Sync", minProgress: 70 },
    { key: "MoviePy Rendering", label: "MoviePy Rendering", minProgress: 85 },
    { key: "Completed", label: "Completed", minProgress: 100 }
  ];

  // Calculate estimated remaining time
  const getRemainingTime = () => {
    if (!activeJob) return null;
    
    // Default estimated render duration is 180s if stats are not loaded
    let totalEstimatedSeconds = 180;
    if (stats?.avgTime) {
      const match = stats.avgTime.match(/(\d+)m\s+(\d+)s/);
      if (match) {
        totalEstimatedSeconds = parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
      }
    }

    const elapsedPercent = activeJob.progress / 100;
    const remainingSeconds = Math.max(0, Math.round(totalEstimatedSeconds * (1 - elapsedPercent)));
    
    if (remainingSeconds === 0) return "Finishing up...";
    const m = Math.floor(remainingSeconds / 60);
    const s = remainingSeconds % 60;
    return `~ ${m}m ${s}s remaining`;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-fadeIn">
      {/* LEFT: Generation Options Form */}
      <div className="lg:col-span-5 space-y-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-bold text-white tracking-wide">Generate YouTube Script & Video</h2>
          <p className="text-xs text-slate-400 font-medium">
            Configure subjects, speech synthesizers and start news processing pipeline
          </p>
        </div>

        <form onSubmit={handleGenerate} className="bg-card border border-slate-800 rounded-2xl p-6 space-y-5 glow-card">
          {/* Title */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-350 uppercase tracking-wider block">
              Video Title
            </label>
            <input
              type="text"
              required
              disabled={!!activeJob}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Meta Launches LLaMA 4, Stock Market Fluctuations"
              className="w-full px-4 py-2.5 bg-slate-900 border border-slate-850 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors disabled:opacity-55 disabled:cursor-not-allowed"
            />
          </div>

          {/* Video Type Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-350 uppercase tracking-wider block">
              Video Type
            </label>
            <select
              disabled={!!activeJob}
              value={videoType}
              onChange={(e) => setVideoType(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-900 border border-slate-850 rounded-xl text-sm text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors disabled:opacity-55 disabled:cursor-not-allowed cursor-pointer"
            >
              <option value="tech_news">Technology News</option>
              <option value="trending_news">Trending News (India National)</option>
              <option value="specific_content">Specific Content (Direct Script)</option>
            </select>
          </div>

          {/* Subject Focus */}
          {videoType !== "specific_content" && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-350 uppercase tracking-wider block">
                Video Subject Topic
              </label>
              <input
                type="text"
                required
                disabled={!!activeJob}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. artificial intelligence updates, space tech, finance news"
                className="w-full px-4 py-2.5 bg-slate-900 border border-slate-850 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors disabled:opacity-55 disabled:cursor-not-allowed"
              />
            </div>
          )}

          {/* Language Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-350 uppercase tracking-wider block">
              Narration Language
            </label>
            <select
              disabled={!!activeJob}
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-900 border border-slate-850 rounded-xl text-sm text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors disabled:opacity-55 disabled:cursor-not-allowed cursor-pointer"
            >
              <option value="english">English (US Male Medium ONNX)</option>
              <option value="hindi">Hindi (Rohan Medium ONNX)</option>
              <option value="telugu">Telugu (Padmavathi Medium ONNX)</option>
            </select>
          </div>

          {/* Custom Script Content (only for specific content) */}
          {videoType === "specific_content" && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-350 uppercase tracking-wider block">
                Custom Script Content
              </label>
              <textarea
                required
                disabled={!!activeJob}
                value={customScript}
                onChange={(e) => setCustomScript(e.target.value)}
                placeholder="Paste your complete script file content here... It should follow the structural layout with Fact 1, Fact 2, etc."
                rows={6}
                className="w-full px-4 py-2.5 bg-slate-900 border border-slate-850 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors resize-none disabled:opacity-55 disabled:cursor-not-allowed"
              />
            </div>
          )}

          {/* Custom Prompt Instructions (only for scraped news) */}
          {videoType !== "specific_content" && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-350 uppercase tracking-wider block">
                Custom Prompt Instructions (Optional)
              </label>
              <textarea
                disabled={!!activeJob}
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="e.g. Keep the script extremely funny. Use analogies. Focus heavily on space launches."
                rows={3}
                className="w-full px-4 py-2.5 bg-slate-900 border border-slate-850 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors resize-none disabled:opacity-55 disabled:cursor-not-allowed"
              />
            </div>
          )}

          {/* Toggles */}
          <div className="grid grid-cols-2 gap-4 border-t border-slate-850 pt-4">
            <label className="flex items-center justify-between p-3 bg-slate-900/50 rounded-xl border border-slate-850 cursor-pointer select-none">
              <span className="text-xs font-semibold text-slate-300">Back Music</span>
              <input
                type="checkbox"
                disabled={!!activeJob}
                checked={useMusic}
                onChange={(e) => setUseMusic(e.target.checked)}
                className="w-4.5 h-4.5 text-primary bg-slate-950 border-slate-800 rounded focus:ring-primary cursor-pointer disabled:opacity-50"
              />
            </label>

            <label className="flex items-center justify-between p-3 bg-slate-900/50 rounded-xl border border-slate-850 cursor-pointer select-none">
              <span className="text-xs font-semibold text-slate-300">SRT Subtitles</span>
              <input
                type="checkbox"
                disabled={!!activeJob}
                checked={useSubtitles}
                onChange={(e) => setUseSubtitles(e.target.checked)}
                className="w-4.5 h-4.5 text-primary bg-slate-950 border-slate-800 rounded focus:ring-primary cursor-pointer disabled:opacity-50"
              />
            </label>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-2.5 border-t border-slate-850 pt-4">
            {error && (
              <div className="p-3 bg-red-950/20 border border-red-900/30 text-red-400 rounded-xl text-xs font-medium">
                {error}
              </div>
            )}

            {!activeJob ? (
              <button
                type="submit"
                className="w-full py-3 bg-primary hover:bg-blue-600 active:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-primary/20 hover:shadow-primary/30 cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Generate Video</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={stopGeneration}
                className="w-full py-3 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white text-xs font-bold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-red-600/20 hover:shadow-red-600/30 cursor-pointer animate-pulse"
              >
                <Square className="w-4 h-4 fill-current" />
                <span>Stop Generation</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleClear}
              disabled={!!activeJob}
              className="w-full py-2.5 bg-slate-850 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-750 rounded-xl text-xs font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              Clear Form
            </button>
          </div>
        </form>
      </div>

      {/* RIGHT: Live Pipeline Progress Logs */}
      <div className="lg:col-span-7 space-y-6 flex flex-col h-full">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-bold text-white tracking-wide">Live Pipeline Monitor</h2>
            <p className="text-xs text-slate-400 font-medium">
              Check process milestones, execution checklists and stdout logs stream
            </p>
          </div>
          {activeJob && (
            <div className="flex items-center gap-1.5 text-xs text-primary font-bold bg-primary/10 px-3 py-1.5 rounded-full animate-pulse">
              <Clock className="w-3.5 h-3.5" />
              <span>{getRemainingTime()}</span>
            </div>
          )}
        </div>

        {activeJob ? (
          <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-6 h-full min-h-[500px]">
            {/* Steps Timeline (Checklist) */}
            <div className="md:col-span-5 bg-card border border-slate-800 rounded-2xl p-5 flex flex-col justify-between glow-card">
              <div className="space-y-4">
                <h3 className="font-semibold text-xs text-slate-400 tracking-wider uppercase border-b border-slate-850 pb-2">
                  Timeline Progress
                </h3>
                <div className="space-y-4">
                  {steps.map((step) => {
                    const isCompleted = activeJob.progress >= step.minProgress;
                    const isCurrent =
                      activeJob.progress >= step.minProgress - 15 &&
                      activeJob.progress < step.minProgress;
                    
                    let badgeStyle = "text-slate-600";
                    let textStyle = "text-slate-500";
                    
                    if (isCompleted) {
                      badgeStyle = "text-success bg-success/10 border-success/20";
                      textStyle = "text-slate-300 font-medium";
                    } else if (isCurrent) {
                      badgeStyle = "text-primary bg-primary/10 border-primary/20 animate-pulse";
                      textStyle = "text-white font-semibold";
                    }

                    return (
                      <div key={step.key} className="flex items-center gap-3.5 text-xs">
                        <div
                          className={`w-6 h-6 rounded-full border flex items-center justify-center font-bold text-[10px] ${badgeStyle}`}
                        >
                          {isCompleted ? "✓" : isCurrent ? "●" : "○"}
                        </div>
                        <span className={textStyle}>{step.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="border-t border-slate-850 pt-4 mt-6 space-y-3">
                <div className="flex justify-between items-center text-xs font-semibold text-slate-400">
                  <span>Current Step: {activeJob.status}</span>
                  <span className="text-white">{activeJob.progress}%</span>
                </div>
                <ProgressBar progress={activeJob.progress} height="h-2" />
              </div>
            </div>

            {/* Standard Output Logs Terminal */}
            <div className="md:col-span-7 bg-slate-950 border border-slate-900 rounded-2xl flex flex-col overflow-hidden glow-card">
              {/* Header */}
              <div className="h-10 border-b border-slate-900 bg-slate-900/40 px-4 flex items-center gap-2 text-slate-400 font-mono text-[10px] font-bold uppercase tracking-wider">
                <Terminal className="w-3.5 h-3.5 text-primary" />
                <span>Standard Output Terminal Stream</span>
              </div>

              {/* Logs */}
              <div className="flex-1 p-4 font-mono text-[11px] leading-relaxed text-slate-300 overflow-y-auto space-y-1 h-[400px] select-text">
                {activeJob.logs ? (
                  activeJob.logs.split("\n").map((line, idx) => (
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
                  <div className="text-slate-600 animate-pulse">Awaiting pipeline trigger logs...</div>
                )}
                <div ref={logsEndRef} />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 bg-card border border-slate-800 rounded-2xl p-12 flex flex-col items-center justify-center text-center gap-4 glow-card min-h-[450px]">
            <div className="w-16 h-16 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-center">
              <Terminal className="w-8 h-8 text-slate-500" />
            </div>
            <div className="space-y-1.5 max-w-sm">
              <h3 className="font-bold text-white text-sm">Pipeline monitor dormant</h3>
              <p className="text-xs text-slate-400 leading-relaxed font-medium">
                Configure option variables and select "Generate Video" to trigger the automatic workflow script. Live output logs will stream here in real time.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

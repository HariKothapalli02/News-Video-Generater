import React, { useState, useEffect, useRef } from "react";
import { useVideoStore } from "../store/videoStore";
import {
  Play,
  Square,
  Terminal,
  Clock,
  Radio,
  FileCode,
  Sliders,
  RotateCcw
} from "lucide-react";
import ProgressBar from "../components/ProgressBar";

export default function Generate() {
  const {
    activeJob,
    stats,
    generateVideo,
    stopGeneration,
    retryVideo,
    fetchActiveJob,
    fetchStats,
    connectSocket,
    clearError,
    error
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
      language: "english", // Strictly English only
      useMusic,
      useSubtitles,
      customPrompt: videoType === "specific_content" ? "" : customPrompt,
      videoType,
      customScript: videoType === "specific_content" ? customScript : ""
    });

    if (success) {
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
    { key: "Pexels Downloads", label: "Pexels Footage Sync (3 Clips/Scene)", minProgress: 70 },
    { key: "MoviePy Rendering", label: "MoviePy Rendering & Transitions", minProgress: 85 },
    { key: "Completed", label: "Completed", minProgress: 100 }
  ];

  // Calculate estimated remaining time
  const getRemainingTime = () => {
    if (!activeJob) return null;
    let totalEstimatedSeconds = 180;
    if (stats?.avgTime) {
      const match = stats.avgTime.match(/(\d+)m\s+(\d+)s/);
      if (match) {
        totalEstimatedSeconds = parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
      }
    }

    const elapsedPercent = activeJob.progress / 100;
    const remainingSeconds = Math.max(0, Math.round(totalEstimatedSeconds * (1 - elapsedPercent)));
    
    if (remainingSeconds === 0) return "FINALIZING RENDER...";
    const m = Math.floor(remainingSeconds / 60);
    const s = remainingSeconds % 60;
    return `~ ${m}M ${s}S REMAINING`;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fadeIn pb-12">
      {/* LEFT: Generation Options Form */}
      <div className="lg:col-span-5 space-y-4">
        <div className="flex flex-col gap-1 border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-white" />
            <h2 className="text-base font-bold text-white tracking-wider font-mono uppercase">
              Pipeline Parameters
            </h2>
          </div>
          <p className="text-xs text-zinc-400 font-mono">
            Full HD 1080p generation with 3 clips per scene & synced captions
          </p>
        </div>

        <form onSubmit={handleGenerate} className="bg-zinc-950 border border-zinc-800 rounded-none p-5 space-y-4">
          {/* Title */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-mono font-bold text-zinc-300 uppercase tracking-wider block">
              Video Title *
            </label>
            <input
              type="text"
              required
              disabled={!!activeJob}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Meta Launches LLaMA 4, Stock Market Fluctuations"
              className="w-full px-3.5 py-2.5 bg-black border border-zinc-800 rounded-none text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-mono"
            />
          </div>

          {/* Video Type Selector */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-mono font-bold text-zinc-300 uppercase tracking-wider block">
              Source Pipeline Mode
            </label>
            <select
              disabled={!!activeJob}
              value={videoType}
              onChange={(e) => setVideoType(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-black border border-zinc-800 rounded-none text-xs text-white focus:outline-none focus:border-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer font-mono"
            >
              <option value="tech_news">Technology News (Global RSS Feeds)</option>
              <option value="trending_news">Trending News (India National Feeds)</option>
              <option value="specific_content">Specific Content (Direct Custom Script)</option>
            </select>
          </div>

          {/* Subject Focus */}
          {videoType !== "specific_content" && (
            <div className="space-y-1.5">
              <label className="text-[11px] font-mono font-bold text-zinc-300 uppercase tracking-wider block">
                Subject Focus Topic
              </label>
              <input
                type="text"
                required
                disabled={!!activeJob}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. artificial intelligence updates, space tech, quantum computing"
                className="w-full px-3.5 py-2.5 bg-black border border-zinc-800 rounded-none text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-mono"
              />
            </div>
          )}

          {/* Narration Language (English Only) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-mono font-bold text-zinc-300 uppercase tracking-wider block">
                Narration Language
              </label>
              <span className="text-[9px] font-mono text-zinc-500 uppercase">ENGLISH ONLY</span>
            </div>
            <select
              disabled={!!activeJob}
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-black border border-zinc-800 rounded-none text-xs text-white focus:outline-none focus:border-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer font-mono"
            >
              <option value="english">English (US Male Medium ONNX)</option>
            </select>
          </div>

          {/* Custom Script Content (only for specific content) */}
          {videoType === "specific_content" && (
            <div className="space-y-1.5">
              <label className="text-[11px] font-mono font-bold text-zinc-300 uppercase tracking-wider block">
                Custom Script Content
              </label>
              <textarea
                required
                disabled={!!activeJob}
                value={customScript}
                onChange={(e) => setCustomScript(e.target.value)}
                placeholder="Paste your complete script file content here... It should follow the structural layout with Fact 1, Fact 2, etc."
                rows={5}
                className="w-full px-3.5 py-2.5 bg-black border border-zinc-800 rounded-none text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-white transition-colors resize-none disabled:opacity-50 disabled:cursor-not-allowed font-mono"
              />
            </div>
          )}

          {/* Custom Prompt Instructions (only for scraped news) */}
          {videoType !== "specific_content" && (
            <div className="space-y-1.5">
              <label className="text-[11px] font-mono font-bold text-zinc-300 uppercase tracking-wider block">
                Custom Prompt Directives (Optional)
              </label>
              <textarea
                disabled={!!activeJob}
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="e.g. Keep narration punchy and authoritative. Emphasize breakthrough engineering metrics."
                rows={3}
                className="w-full px-3.5 py-2.5 bg-black border border-zinc-800 rounded-none text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-white transition-colors resize-none disabled:opacity-50 disabled:cursor-not-allowed font-mono"
              />
            </div>
          )}

          {/* Audio & Subtitle Toggles */}
          <div className="grid grid-cols-2 gap-3 border-t border-zinc-800 pt-3">
            <label className="flex items-center justify-between p-3 bg-black rounded-none border border-zinc-800 cursor-pointer select-none">
              <span className="text-[11px] font-mono font-semibold text-zinc-300 uppercase">Music Track</span>
              <input
                type="checkbox"
                disabled={!!activeJob}
                checked={useMusic}
                onChange={(e) => setUseMusic(e.target.checked)}
                className="w-4 h-4 rounded-none accent-white bg-black border-zinc-700 cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between p-3 bg-black rounded-none border border-zinc-800 cursor-pointer select-none">
              <span className="text-[11px] font-mono font-semibold text-zinc-300 uppercase">Subtitles</span>
              <input
                type="checkbox"
                disabled={!!activeJob}
                checked={useSubtitles}
                onChange={(e) => setUseSubtitles(e.target.checked)}
                className="w-4 h-4 rounded-none accent-white bg-black border-zinc-700 cursor-pointer"
              />
            </label>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-2.5 border-t border-zinc-800 pt-3">
            {error && (
              <div className="p-3 bg-black border border-red-800 text-red-400 rounded-none text-xs font-mono">
                [ERROR]: {error}
              </div>
            )}

            {!activeJob || activeJob.status === "Completed" ? (
              <button
                type="submit"
                className="w-full py-3 bg-white hover:bg-zinc-200 active:bg-zinc-300 text-black text-xs font-bold font-mono uppercase tracking-wider rounded-none border border-white transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-white/5"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Launch Video Generation</span>
              </button>
            ) : activeJob.status === "Failed" || activeJob.status === "Stopped" ? (
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => retryVideo(activeJob.id || activeJob._id)}
                  className="w-full py-3 bg-white hover:bg-zinc-200 text-black text-xs font-bold font-mono uppercase tracking-wider rounded-none border border-white transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-white/5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Resume & Retry Pipeline</span>
                </button>
                <button
                  type="submit"
                  className="w-full py-2 bg-transparent hover:bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800 text-[11px] font-mono uppercase tracking-wider transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Play className="w-3 h-3 fill-current" />
                  <span>Start Fresh Generation</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={stopGeneration}
                className="w-full py-3 bg-red-600 hover:bg-red-700 text-white text-xs font-bold font-mono uppercase tracking-wider rounded-none border border-red-500 transition-colors flex items-center justify-center gap-2 cursor-pointer animate-pulse"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Abort Pipeline</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleClear}
              disabled={!!activeJob}
              className="w-full py-2 bg-transparent hover:bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800 rounded-none text-xs font-mono uppercase tracking-wider transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              Reset Parameters
            </button>
          </div>
        </form>
      </div>

      {/* RIGHT: Live Pipeline Progress Logs */}
      <div className="lg:col-span-7 space-y-4 flex flex-col h-full">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-white" />
            <h2 className="text-base font-bold text-white tracking-wider font-mono uppercase">
              Telemetry & Timeline
            </h2>
          </div>
          {activeJob && (
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-black font-bold bg-white px-2.5 py-1 rounded-none border border-white">
              <Clock className="w-3 h-3" />
              <span>{getRemainingTime()}</span>
            </div>
          )}
        </div>

        {activeJob ? (
          <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-4 h-full min-h-[500px]">
            {/* Steps Timeline (Checklist) */}
            <div className="md:col-span-5 bg-zinc-950 border border-zinc-800 rounded-none p-4 flex flex-col justify-between">
              <div className="space-y-3">
                <h3 className="font-bold text-[10px] font-mono text-zinc-400 tracking-wider uppercase border-b border-zinc-800 pb-2">
                  Pipeline Checklist
                </h3>
                <div className="space-y-3">
                  {steps.map((step) => {
                    const isCompleted = activeJob.progress >= step.minProgress;
                    const isCurrent =
                      activeJob.progress >= step.minProgress - 15 &&
                      activeJob.progress < step.minProgress;
                    
                    return (
                      <div key={step.key} className="flex items-center gap-3 text-xs font-mono">
                        <div
                          className={`w-5 h-5 rounded-none border flex items-center justify-center font-bold text-[9px] ${
                            isCompleted
                              ? "bg-white text-black border-white"
                              : isCurrent
                              ? "bg-zinc-800 text-white border-white animate-pulse"
                              : "border-zinc-800 text-zinc-600 bg-black"
                          }`}
                        >
                          {isCompleted ? "✓" : isCurrent ? "▶" : "·"}
                        </div>
                        <span className={isCompleted ? "text-zinc-300" : isCurrent ? "text-white font-bold" : "text-zinc-600"}>
                          {step.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="border-t border-zinc-800 pt-3 mt-4 space-y-2">
                <div className="flex justify-between items-center text-[10px] font-mono text-zinc-400 uppercase">
                  <span>Phase: {activeJob.status}</span>
                  <span className="text-white font-bold">{activeJob.progress}%</span>
                </div>
                <ProgressBar progress={activeJob.progress} height="h-2" />
              </div>
            </div>

            {/* Standard Output Logs Terminal */}
            <div className="md:col-span-7 bg-black border border-zinc-800 rounded-none flex flex-col overflow-hidden">
              {/* Header */}
              <div className="h-9 border-b border-zinc-800 bg-zinc-950 px-3.5 flex items-center gap-2 text-zinc-400 font-mono text-[10px] font-bold uppercase tracking-wider">
                <Terminal className="w-3.5 h-3.5 text-white" />
                <span>Console Stream (stdout)</span>
              </div>

              {/* Logs */}
              <div className="flex-1 p-3.5 font-mono text-[11px] leading-relaxed text-zinc-300 overflow-y-auto space-y-1 h-[420px] select-text bg-black">
                {activeJob.logs ? (
                  activeJob.logs.split("\n").map((line, idx) => (
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
                  <div className="text-zinc-600 font-mono animate-pulse">Awaiting pipeline trigger logs...</div>
                )}
                <div ref={logsEndRef} />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 bg-zinc-950 border border-zinc-800 rounded-none p-10 flex flex-col items-center justify-center text-center gap-3 min-h-[450px]">
            <div className="w-12 h-12 rounded-none bg-black border border-zinc-800 flex items-center justify-center text-white">
              <FileCode className="w-6 h-6 text-zinc-400" />
            </div>
            <div className="space-y-1 max-w-sm">
              <h3 className="font-bold text-white text-xs font-mono uppercase tracking-wider">Pipeline Idle</h3>
              <p className="text-xs text-zinc-500 leading-relaxed font-mono">
                Select parameters on the left and click "Launch Video Generation" to run the RSS scrape, TTS voice synthesizer, 3-clip footage downloader, and 1080p video compiler.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

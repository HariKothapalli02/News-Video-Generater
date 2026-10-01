import React, { useEffect, useState } from "react";
import axios from "axios";
import {
  ArrowLeft,
  Download,
  Terminal,
  FileText,
  RotateCcw,
  FileVideo,
  Copy,
  Check,
  Sparkles,
  Scissors,
  Tag,
  Share2,
  Film,
  Play,
  Hash
} from "lucide-react";
import { useVideoStore } from "../store/videoStore";
import Loader from "../components/Loader";
import StatusBadge from "../components/StatusBadge";

export default function VideoDetails({ id, onBack }) {
  const [video, setVideo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("shorts"); // shorts | metadata | script | logs
  const [copiedKey, setCopiedKey] = useState(null);
  const [generatingShorts, setGeneratingShorts] = useState(false);
  const [generatingMetadata, setGeneratingMetadata] = useState(false);

  const { retryVideo, getHeaders, generateShorts, generateMetadata, activeJob } = useVideoStore();

  const fetchVideoDetails = async () => {
    try {
      const headers = getHeaders();
      const baseUrl = import.meta.env.VITE_API_URL || (window.location.port ? `${window.location.protocol}//${window.location.hostname}:5000/api` : "/api");
      const res = await axios.get(`${baseUrl}/video/${id}`, headers);
      setVideo(res.data);
      // Default to shorts tab if shorts exist, else metadata or script
      if (res.data?.shorts?.length > 0) {
        setActiveTab("shorts");
      } else if (res.data?.youtubeMetadata?.title) {
        setActiveTab("metadata");
      }
    } catch (err) {
      console.error("Error fetching video details:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVideoDetails();
  }, [id]);

  // Sync if WebSocket job_update updates this video
  useEffect(() => {
    if (activeJob && (activeJob.id === id || activeJob._id === id)) {
      setVideo((prev) => ({
        ...prev,
        ...activeJob,
        status: activeJob.status || prev?.status,
        progress: activeJob.progress !== undefined ? activeJob.progress : prev?.progress,
        shorts: activeJob.shorts || prev?.shorts,
        youtubeMetadata: activeJob.youtubeMetadata || prev?.youtubeMetadata,
        facts: activeJob.facts || prev?.facts
      }));
      if (activeJob.shorts?.length > 0) {
        setGeneratingShorts(false);
      }
    }
  }, [activeJob, id]);

  const handleCopy = (text, key) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleRetry = async () => {
    if (video) {
      const success = await retryVideo(video._id);
      if (success) {
        onBack();
      }
    }
  };

  const handleGenerateShorts = async () => {
    if (!video) return;
    setGeneratingShorts(true);
    setActiveTab("shorts");
    const result = await generateShorts(video._id);
    if (!result) {
      setGeneratingShorts(false);
    }
  };

  const handleGenerateMetadata = async () => {
    if (!video) return;
    setGeneratingMetadata(true);
    const result = await generateMetadata(video._id);
    setGeneratingMetadata(false);
    if (result?.youtubeMetadata) {
      setVideo((prev) => ({ ...prev, youtubeMetadata: result.youtubeMetadata }));
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
  const hasShorts = video.shorts && video.shorts.length > 0;
  const hasMetadata = video.youtubeMetadata && video.youtubeMetadata.title;

  const videoUrl = isCompleted ? video.videoPath : null;
  const thumbUrl = video.thumbnail ? video.thumbnail : null;
  const downloadUrl = `/api/download/${video._id}`;

  const timelineSteps = [
    { key: "RSS", label: "RSS Collection", minProgress: 10 },
    { key: "Gemini", label: "Gemini Selection", minProgress: 20 },
    { key: "Script", label: "Script Generation", minProgress: 30 },
    { key: "Piper", label: "Piper Voice", minProgress: 45 },
    { key: "Whisper", label: "Whisper Subtitles", minProgress: 60 },
    { key: "Pexels", label: "Pexels Clip Sync", minProgress: 70 },
    { key: "MoviePy", label: "MoviePy Rendering", minProgress: 85 },
    { key: "Completed", label: "Completed (Metadata & Shorts Ready)", minProgress: 100 }
  ];

  return (
    <div className="space-y-6 animate-fadeIn pb-16">
      {/* Top Breadcrumb Nav */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-none bg-black border border-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500">Video Inspector</span>
              {hasShorts && (
                <span className="text-[9px] font-mono px-1.5 py-0.2 bg-white text-black font-bold uppercase tracking-wider">
                  10 Shorts Ready
                </span>
              )}
            </div>
            <h2 className="text-sm sm:text-base font-bold text-white tracking-wide font-mono uppercase">{video.title}</h2>
          </div>
        </div>

        {/* Global Action Header */}
        <div className="flex items-center gap-2">
          {isCompleted && !hasShorts && (
            <button
              onClick={handleGenerateShorts}
              disabled={generatingShorts}
              className="flex items-center gap-1.5 bg-zinc-900 hover:bg-white hover:text-black border border-zinc-700 px-3 py-1.5 text-white rounded-none text-xs font-mono font-bold uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-50"
            >
              <Scissors className="w-3.5 h-3.5" />
              <span>{generatingShorts ? "Extracting Shorts..." : "Turn into 10 Shorts (9:16)"}</span>
            </button>
          )}

          {isCompleted && (
            <a
              href={downloadUrl}
              className="flex items-center gap-1.5 bg-white hover:bg-zinc-200 px-3 py-1.5 text-black rounded-none text-xs font-mono font-bold uppercase tracking-wider transition-colors cursor-pointer"
              target="_blank"
              rel="noreferrer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Full MP4</span>
            </a>
          )}

          {isFailed && (
            <button
              onClick={handleRetry}
              className="flex items-center gap-1.5 bg-zinc-900 hover:bg-white hover:text-black border border-zinc-700 px-3 py-1.5 text-white rounded-none text-xs font-mono font-bold uppercase tracking-wider transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Retry Pipeline</span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT: Full Video Player & Timeline */}
        <div className="lg:col-span-5 space-y-5">
          {/* Main 16:9 Video Player */}
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
                  <h4 className="text-white text-xs font-mono font-bold uppercase">Video Stream Processing</h4>
                  <p className="text-[10px] text-zinc-500 max-w-[220px] leading-relaxed font-mono">
                    {isFailed
                      ? "The render aborted or encountered an error. Click retry to recompile."
                      : "The video compile run is actively rendering in the pipeline."}
                  </p>
                </div>
                <StatusBadge status={video.status} />
              </div>
            )}
          </div>

          {/* Quick Meta Stats */}
          <div className="bg-black border border-zinc-800 p-3 grid grid-cols-3 gap-2 text-center text-xs font-mono">
            <div>
              <span className="text-[10px] text-zinc-500 uppercase block">Duration</span>
              <span className="font-bold text-white">{video.duration ? `${Math.floor(video.duration / 60)}m ${Math.round(video.duration % 60)}s` : "N/A"}</span>
            </div>
            <div>
              <span className="text-[10px] text-zinc-500 uppercase block">Aspect Ratio</span>
              <span className="font-bold text-white">16:9 (Full HD)</span>
            </div>
            <div>
              <span className="text-[10px] text-zinc-500 uppercase block">Shorts Count</span>
              <span className="font-bold text-white">{video.shorts?.length || 0} / 10</span>
            </div>
          </div>

          {/* Progress Timeline Checklist */}
          <div className="bg-zinc-950 border border-zinc-800 rounded-none p-4 space-y-3">
            <h3 className="font-bold text-[10px] font-mono text-zinc-400 tracking-wider uppercase border-b border-zinc-800 pb-2">
              Pipeline Execution Status
            </h3>
            <div className="space-y-2">
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

        {/* RIGHT: Multi-Tab Workspace (10 Shorts, YouTube Metadata, Script, Logs) */}
        <div className="lg:col-span-7 bg-zinc-950 border border-zinc-800 rounded-none overflow-hidden flex flex-col min-h-[600px]">
          {/* Tab Selection Bar */}
          <div className="border-b border-zinc-800 bg-black px-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-2 overflow-x-auto">
              {/* Shorts Tab */}
              <button
                onClick={() => setActiveTab("shorts")}
                className={`flex items-center gap-1.5 h-11 text-xs font-mono uppercase tracking-wider border-b-2 px-2.5 transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === "shorts"
                    ? "border-white text-white font-bold"
                    : "border-transparent text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Scissors className="w-3.5 h-3.5" />
                <span>10 Shorts (9:16)</span>
                {video.shorts?.length > 0 && (
                  <span className="text-[9px] px-1 bg-white text-black font-bold">10</span>
                )}
              </button>

              {/* YouTube Metadata Tab */}
              <button
                onClick={() => setActiveTab("metadata")}
                className={`flex items-center gap-1.5 h-11 text-xs font-mono uppercase tracking-wider border-b-2 px-2.5 transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === "metadata"
                    ? "border-white text-white font-bold"
                    : "border-transparent text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>YouTube Metadata</span>
              </button>

              {/* Script Tab */}
              <button
                onClick={() => setActiveTab("script")}
                className={`flex items-center gap-1.5 h-11 text-xs font-mono uppercase tracking-wider border-b-2 px-2.5 transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === "script"
                    ? "border-white text-white font-bold"
                    : "border-transparent text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Script Content</span>
              </button>

              {/* Logs Tab */}
              <button
                onClick={() => setActiveTab("logs")}
                className={`flex items-center gap-1.5 h-11 text-xs font-mono uppercase tracking-wider border-b-2 px-2.5 transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === "logs"
                    ? "border-white text-white font-bold"
                    : "border-transparent text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>Logs</span>
              </button>
            </div>
          </div>

          {/* Content Pane */}
          <div className="flex-1 p-5 overflow-y-auto leading-relaxed text-xs text-zinc-300 font-mono bg-zinc-950">
            {/* ========================================================================= */}
            {/* TAB 1: 10 VERTICAL SHORTS (9:16) */}
            {/* ========================================================================= */}
            {activeTab === "shorts" && (
              <div className="space-y-6">
                {generatingShorts ? (
                  <div className="p-8 text-center bg-black border border-zinc-800 rounded-none space-y-3">
                    <Loader label="EXTRACTING 10 VERTICAL 9:16 SHORTS & METADATA VIA FFMPEG..." />
                    <p className="text-zinc-400 text-xs">
                      Slicing individual fact segments, converting resolution to 1080x1920 (9:16), and generating YouTube Shorts titles, descriptions, and tags with Gemini AI.
                    </p>
                  </div>
                ) : !hasShorts ? (
                  <div className="p-8 text-center bg-black border border-zinc-800 rounded-none space-y-4">
                    <Scissors className="w-10 h-10 text-zinc-600 mx-auto" />
                    <div className="space-y-1">
                      <h4 className="text-white text-sm font-bold uppercase">10 Shorts Not Yet Extracted</h4>
                      <p className="text-xs text-zinc-400 max-w-md mx-auto leading-relaxed">
                        Convert this full news video into 10 separate vertical YouTube Shorts (9:16 format, 1080x1920) corresponding to each topic, complete with AI-generated titles, descriptions, and hashtags.
                      </p>
                    </div>
                    {isCompleted ? (
                      <button
                        onClick={handleGenerateShorts}
                        className="px-5 py-2.5 bg-white hover:bg-zinc-200 text-black font-bold uppercase tracking-wider text-xs rounded-none transition-colors cursor-pointer inline-flex items-center gap-2"
                      >
                        <Scissors className="w-4 h-4" />
                        <span>Turn into 10 Shorts Now</span>
                      </button>
                    ) : (
                      <span className="text-zinc-500 text-xs block">
                        Wait for full video rendering to complete before extracting shorts.
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                      <div>
                        <h4 className="text-white font-bold uppercase text-xs">Extracted 9:16 Vertical Shorts</h4>
                        <p className="text-[11px] text-zinc-400">10 individual shorts formatted for YouTube Shorts / Reels (1080x1920)</p>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-white text-black uppercase">
                        {video.shorts.length} Shorts Available
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      {video.shorts.map((short, idx) => {
                        const shortDownloadUrl = `/api/download/${video._id}/short/${short.factIndex || idx + 1}`;
                        const meta = short.youtubeMetadata || {};

                        return (
                          <div
                            key={idx}
                            className="bg-black border border-zinc-800 rounded-none overflow-hidden flex flex-col justify-between hover:border-zinc-600 transition-colors"
                          >
                            {/* Short Video Player (9:16 Aspect Ratio) */}
                            <div className="relative aspect-[9/16] bg-zinc-950 flex items-center justify-center overflow-hidden border-b border-zinc-800 max-h-[380px]">
                              {short.videoPath ? (
                                <video
                                  src={short.videoPath}
                                  controls
                                  poster={short.thumbnail}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="text-zinc-600 text-center p-4">
                                  <Film className="w-8 h-8 mx-auto mb-1 opacity-50" />
                                  <span>Short {short.factIndex || idx + 1}</span>
                                </div>
                              )}
                              <div className="absolute top-2 left-2 bg-black/90 border border-zinc-700 px-2 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider">
                                Fact #{short.factIndex || idx + 1}
                              </div>
                              <div className="absolute top-2 right-2 bg-white text-black px-1.5 py-0.2 text-[9px] font-bold uppercase">
                                9:16 • {short.duration ? `${Math.round(short.duration)}s` : "25s"}
                              </div>
                            </div>

                            {/* Short Metadata & Details */}
                            <div className="p-3.5 space-y-3 flex-1 flex flex-col justify-between">
                              <div className="space-y-2">
                                <div className="flex items-start justify-between gap-2">
                                  <h5 className="font-bold text-white text-xs line-clamp-2">
                                    {meta.title || short.title || `Short #${idx + 1}`}
                                  </h5>
                                  <button
                                    onClick={() => handleCopy(meta.title || short.title, `stitle_${idx}`)}
                                    title="Copy Title"
                                    className="p-1 hover:bg-zinc-800 text-zinc-400 hover:text-white shrink-0"
                                  >
                                    {copiedKey === `stitle_${idx}` ? <Check className="w-3.5 h-3.5 text-white" /> : <Copy className="w-3.5 h-3.5" />}
                                  </button>
                                </div>

                                {/* Short Description */}
                                <div className="bg-zinc-950 border border-zinc-900 p-2 text-[11px] text-zinc-400 space-y-1">
                                  <div className="flex items-center justify-between text-[10px] text-zinc-500 uppercase font-bold">
                                    <span>Shorts Description</span>
                                    <button
                                      onClick={() => handleCopy(meta.description, `sdesc_${idx}`)}
                                      className="text-zinc-400 hover:text-white"
                                    >
                                      {copiedKey === `sdesc_${idx}` ? "Copied" : "Copy"}
                                    </button>
                                  </div>
                                  <p className="line-clamp-2">{meta.description || short.scriptText}</p>
                                </div>

                                {/* Short Tags */}
                                {meta.tags && meta.tags.length > 0 && (
                                  <div className="space-y-1">
                                    <div className="flex items-center justify-between text-[10px] text-zinc-500 uppercase font-bold">
                                      <span>Tags ({meta.tags.length})</span>
                                      <button
                                        onClick={() => handleCopy(meta.tags.join(", "), `stags_${idx}`)}
                                        className="text-zinc-400 hover:text-white"
                                      >
                                        {copiedKey === `stags_${idx}` ? "Copied" : "Copy All"}
                                      </button>
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                      {meta.tags.slice(0, 6).map((t, tidx) => (
                                        <span key={tidx} className="px-1.5 py-0.2 bg-zinc-900 border border-zinc-800 text-[10px] text-zinc-300">
                                          #{t}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>

                              {/* Download Button */}
                              <div className="pt-2 border-t border-zinc-900 flex justify-end">
                                <a
                                  href={shortDownloadUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="w-full text-center py-2 bg-zinc-900 hover:bg-white hover:text-black border border-zinc-800 text-white font-bold text-xs uppercase transition-colors inline-flex items-center justify-center gap-1.5"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                  <span>Download Short #{short.factIndex || idx + 1} (9:16)</span>
                                </a>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ========================================================================= */}
            {/* TAB 2: YOUTUBE METADATA (1 API CALL GENERATION) */}
            {/* ========================================================================= */}
            {activeTab === "metadata" && (
              <div className="space-y-6">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                  <div>
                    <h4 className="text-white font-bold uppercase text-xs">Full Video YouTube SEO Metadata</h4>
                    <p className="text-[11px] text-zinc-400">Generated in 1 Gemini AI request: Primary Title, A/B Variations, Chapters Description, and Tags</p>
                  </div>
                  <button
                    onClick={handleGenerateMetadata}
                    disabled={generatingMetadata}
                    className="flex items-center gap-1.5 px-3 py-1 bg-zinc-900 hover:bg-white hover:text-black border border-zinc-700 text-white text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{generatingMetadata ? "Generating..." : "Regenerate Metadata"}</span>
                  </button>
                </div>

                {!hasMetadata ? (
                  <div className="p-8 text-center bg-black border border-zinc-800 rounded-none space-y-3">
                    <Sparkles className="w-8 h-8 text-zinc-600 mx-auto" />
                    <p className="text-zinc-400 text-xs">YouTube metadata not yet generated for this video record.</p>
                    <button
                      onClick={handleGenerateMetadata}
                      disabled={generatingMetadata}
                      className="px-4 py-2 bg-white text-black font-bold uppercase text-xs hover:bg-zinc-200"
                    >
                      Generate Metadata Now
                    </button>
                  </div>
                ) : (
                  <div className="space-y-5">
                    {/* Primary Title */}
                    <div className="bg-black border border-zinc-800 p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                          <Tag className="w-3.5 h-3.5" /> Primary High-CTR Title
                        </span>
                        <button
                          onClick={() => handleCopy(video.youtubeMetadata.title, "main_title")}
                          className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-white cursor-pointer"
                        >
                          {copiedKey === "main_title" ? <Check className="w-3.5 h-3.5 text-white" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copiedKey === "main_title" ? "Copied" : "Copy Title"}</span>
                        </button>
                      </div>
                      <p className="text-white text-sm font-bold bg-zinc-950 p-2.5 border border-zinc-900 select-text">
                        {video.youtubeMetadata.title}
                      </p>
                    </div>

                    {/* Alternative Titles */}
                    {video.youtubeMetadata.titles && video.youtubeMetadata.titles.length > 0 && (
                      <div className="bg-black border border-zinc-800 p-4 space-y-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">
                          Alternative Title Ideas (For A/B Testing & Thumbnails)
                        </span>
                        <div className="space-y-1.5">
                          {video.youtubeMetadata.titles.map((altTitle, idx) => (
                            <div key={idx} className="flex items-center justify-between bg-zinc-950 p-2 border border-zinc-900 text-xs">
                              <span className="text-zinc-200 select-text">{altTitle}</span>
                              <button
                                onClick={() => handleCopy(altTitle, `alt_${idx}`)}
                                className="p-1 text-zinc-400 hover:text-white"
                              >
                                {copiedKey === `alt_${idx}` ? <Check className="w-3.5 h-3.5 text-white" /> : <Copy className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Description with Timestamps */}
                    <div className="bg-black border border-zinc-800 p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5" /> Full Video Description (SEO & Chapter Timestamps)
                        </span>
                        <button
                          onClick={() => handleCopy(video.youtubeMetadata.description, "desc")}
                          className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-white cursor-pointer"
                        >
                          {copiedKey === "desc" ? <Check className="w-3.5 h-3.5 text-white" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copiedKey === "desc" ? "Copied Description" : "Copy Description"}</span>
                        </button>
                      </div>
                      <div className="bg-zinc-950 p-3 border border-zinc-900 max-h-56 overflow-y-auto whitespace-pre-wrap select-text text-zinc-300 leading-relaxed">
                        {video.youtubeMetadata.description}
                      </div>
                    </div>

                    {/* Video Tags */}
                    {video.youtubeMetadata.tags && video.youtubeMetadata.tags.length > 0 && (
                      <div className="bg-black border border-zinc-800 p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                            <Hash className="w-3.5 h-3.5" /> Video Tags ({video.youtubeMetadata.tags.length})
                          </span>
                          <button
                            onClick={() => handleCopy(video.youtubeMetadata.tags.join(", "), "tags_all")}
                            className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-white cursor-pointer"
                          >
                            {copiedKey === "tags_all" ? <Check className="w-3.5 h-3.5 text-white" /> : <Copy className="w-3.5 h-3.5" />}
                            <span>{copiedKey === "tags_all" ? "Copied All" : "Copy Comma-Separated Tags"}</span>
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1.5 bg-zinc-950 p-3 border border-zinc-900">
                          {video.youtubeMetadata.tags.map((t, idx) => (
                            <span
                              key={idx}
                              onClick={() => handleCopy(t, `tag_${idx}`)}
                              title="Click to copy tag"
                              className="px-2 py-0.5 bg-black border border-zinc-800 hover:border-zinc-500 text-zinc-300 text-[11px] cursor-pointer"
                            >
                              {copiedKey === `tag_${idx}` ? "✓ " : ""}{t}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ========================================================================= */}
            {/* TAB 3: SCRIPT CONTENT */}
            {/* ========================================================================= */}
            {activeTab === "script" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                  <span className="text-[10px] font-bold uppercase text-zinc-500">Full Video Script</span>
                  {video.script && (
                    <button
                      onClick={() => handleCopy(video.script, "script")}
                      className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-white"
                    >
                      {copiedKey === "script" ? <Check className="w-3.5 h-3.5 text-white" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedKey === "script" ? "Copied" : "Copy Script"}</span>
                    </button>
                  )}
                </div>
                {video.script ? (
                  <div className="whitespace-pre-wrap select-text text-zinc-300 leading-relaxed font-mono bg-black p-4 border border-zinc-850">
                    {video.script}
                  </div>
                ) : (
                  <div className="text-zinc-600 text-xs italic flex flex-col items-center justify-center py-12 gap-1 font-mono">
                    <span>SCRIPT DOCUMENT NOT POPULATED.</span>
                    <span>CURRENT PIPELINE STEP: {video.status}</span>
                  </div>
                )}
              </div>
            )}

            {/* ========================================================================= */}
            {/* TAB 4: PIPELINE LOGS */}
            {/* ========================================================================= */}
            {activeTab === "logs" && (
              <div className="font-mono text-xs text-zinc-350 space-y-1 bg-black p-4 rounded-none border border-zinc-850 h-full overflow-y-auto select-text min-h-[400px]">
                {video.logs ? (
                  video.logs.split("\n").map((line, idx) => (
                    <div key={idx} className="whitespace-pre-wrap select-text">
                      {line.startsWith("[PYTHON STDERR]") ? (
                        <span className="text-red-400 font-mono">{line}</span>
                      ) : line.startsWith("[PYTHON ERROR]") ? (
                        <span className="text-red-500 font-bold font-mono">{line}</span>
                      ) : line.startsWith("@STATUS") ? (
                        <span className="text-white font-bold font-mono">{line}</span>
                      ) : line.startsWith("@FACTS") || line.startsWith("@SHORTS") || line.startsWith("@METADATA") ? (
                        <span className="text-blue-400 font-mono">{line.substring(0, 80)}...</span>
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

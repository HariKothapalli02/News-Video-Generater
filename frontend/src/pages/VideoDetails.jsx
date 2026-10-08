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
  CheckCircle,
  Sparkles,
  Scissors,
  Tag,
  Share2,
  Film,
  Play,
  Hash,
  ExternalLink,
  Trash2
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
  const [postingShortIndex, setPostingShortIndex] = useState(null);
  const [postStatus, setPostStatus] = useState({});
  const [postingFullVideo, setPostingFullVideo] = useState(false);
  const [fullVideoPostStatus, setFullVideoPostStatus] = useState(null);
  const [manualUrlInput, setManualUrlInput] = useState("");
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualModalTarget, setManualModalTarget] = useState(null);

  const { retryVideo, getHeaders, generateShorts, generateMetadata, postReel, postFullVideo, markVideoPosted, toggleUploadStatus, deleteVideoMedia, activeJob } = useVideoStore();

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

  const handlePostReel = async (shortIdx) => {
    if (!video) return;
    const shortObj = (video.shorts || []).find((s, idx) => (s.factIndex === shortIdx || idx + 1 === shortIdx));
    if (shortObj?.isPosted || shortObj?.youtubeShortId) {
      const confirmReupload = window.confirm(`Short #${shortIdx} is ALREADY published to YouTube. Are you sure you want to re-upload it?`);
      if (!confirmReupload) return;
    }
    setPostingShortIndex(shortIdx);
    try {
      const data = await postReel(video._id, shortIdx);
      const ytId = data?.youtubeShortId;
      const ytUrl = data?.youtubeShortUrl || (ytId ? `https://www.youtube.com/shorts/${ytId}` : null);

      setVideo((prev) => {
        if (!prev || !prev.shorts) return prev;
        const updatedShorts = prev.shorts.map((s, idx) => {
          if (s.factIndex === shortIdx || idx + 1 === shortIdx) {
            return {
              ...s,
              isPosted: true,
              isUploading: false,
              postedAt: new Date(),
              youtubeShortId: ytId || s.youtubeShortId,
              youtubeShortUrl: ytUrl || s.youtubeShortUrl
            };
          }
          return s;
        });
        return { ...prev, shorts: updatedShorts };
      });

      setPostStatus((prev) => ({
        ...prev,
        [shortIdx]: {
          status: "success",
          msg: data?.msg || `Short #${shortIdx} published to YouTube!`,
          url: ytUrl
        }
      }));
    } catch (err) {
      console.error("Error posting reel:", err);
      setPostStatus((prev) => ({
        ...prev,
        [shortIdx]: {
          status: "error",
          msg: err.message || "Failed to post reel. Check YouTube/n8n connection."
        }
      }));
    } finally {
      setPostingShortIndex(null);
    }
  };

  const handlePostFullVideo = async () => {
    if (!video) return;
    if (video.isPosted || video.youtubeVideoId) {
      const confirmReupload = window.confirm("This full video is ALREADY published to YouTube. Are you sure you want to re-upload it?");
      if (!confirmReupload) return;
    }
    setPostingFullVideo(true);
    setFullVideoPostStatus(null);
    try {
      const data = await postFullVideo(video._id);
      const ytId = data?.youtubeVideoId;
      const ytUrl = data?.youtubeUrl || (ytId ? `https://www.youtube.com/watch?v=${ytId}` : null);

      setVideo((prev) => ({
        ...prev,
        isPosted: true,
        isUploading: false,
        postedAt: new Date(),
        youtubeVideoId: ytId || prev.youtubeVideoId,
        youtubeUrl: ytUrl || prev.youtubeUrl
      }));

      setFullVideoPostStatus({
        status: "success",
        msg: data?.msg || "Full video published to YouTube!",
        url: ytUrl
      });
    } catch (err) {
      console.error("Error posting full video:", err);
      setFullVideoPostStatus({
        status: "error",
        msg: err.message || "Failed to post full video to YouTube. Check YouTube/n8n connection."
      });
    } finally {
      setPostingFullVideo(false);
    }
  };

  const handleManualMarkPosted = async (targetShortIndex = null) => {
    if (!video) return;
    const url = manualUrlInput.trim();
    try {
      let ytId = "";
      if (url) {
        const m = url.match(/(?:watch\?v=|shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
        if (m) ytId = m[1];
      }
      await markVideoPosted(video._id, {
        isPosted: true,
        youtubeUrl: url,
        youtubeVideoId: ytId,
        shortIndex: targetShortIndex
      });

      if (targetShortIndex) {
        setVideo((prev) => {
          if (!prev?.shorts) return prev;
          const updatedShorts = prev.shorts.map((s, idx) => {
            if (s.factIndex === targetShortIndex || idx + 1 === targetShortIndex) {
              return {
                ...s,
                isPosted: true,
                postedAt: new Date(),
                youtubeShortId: ytId || s.youtubeShortId,
                youtubeShortUrl: url || s.youtubeShortUrl || (ytId ? `https://www.youtube.com/shorts/${ytId}` : "")
              };
            }
            return s;
          });
          return { ...prev, shorts: updatedShorts };
        });
      } else {
        setVideo((prev) => ({
          ...prev,
          isPosted: true,
          postedAt: new Date(),
          youtubeVideoId: ytId || prev.youtubeVideoId,
          youtubeUrl: url || prev.youtubeUrl || (ytId ? `https://www.youtube.com/watch?v=${ytId}` : "")
        }));
      }

      setShowManualModal(false);
      setManualUrlInput("");
      setManualModalTarget(null);
    } catch (err) {
      alert("Error marking as posted: " + err.message);
    }
  };

  const handleToggleUpload = async (shortIndex = null) => {
    try {
      const res = await toggleUploadStatus(video._id, shortIndex !== null ? { shortIndex } : {});
      if (res?.video) {
        setVideo(res.video);
      }
    } catch (err) {
      alert("Failed to update upload permission: " + err.message);
    }
  };

  const handleDeleteMedia = async () => {
    if (
      window.confirm(
        "WARNING: This will delete the generated full video (.mp4) and shorts (.mp4) from local disk storage to liberate server memory and disk space.\n\nProject metadata, script logs, and subtitles will remain intact.\n\nProceed?"
      )
    ) {
      try {
        const res = await deleteVideoMedia(video._id);
        alert(res?.msg || "Video MP4 files purged from disk successfully.");
        fetchVideoDetails();
      } catch (err) {
        alert("Failed to delete video files: " + err.message);
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
                  {video.shorts.length} Shorts Ready
                </span>
              )}
            </div>
            <h2 className="text-sm sm:text-base font-bold text-white tracking-wide font-mono uppercase">{video.title}</h2>
          </div>
        </div>

        {/* Global Action Header */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Post Full Video Button */}
          {isCompleted && (
            <button
              onClick={handlePostFullVideo}
              disabled={postingFullVideo}
              title="Post the full 16:9 HD video directly to YouTube with complete metadata"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-none text-xs font-mono font-bold uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                video.isPosted || video.youtubeVideoId
                  ? "bg-emerald-950/80 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-700/60"
                  : "bg-red-600 hover:bg-red-500 text-white border border-red-600 shadow-sm"
              }`}
            >
              {postingFullVideo || video.isUploading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent animate-spin rounded-full" />
                  <span>Posting Video...</span>
                </>
              ) : video.isPosted || video.youtubeVideoId ? (
                <>
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Published to YouTube</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Post Full Video</span>
                </>
              )}
            </button>
          )}

          {isCompleted && !hasShorts && (
            <button
              onClick={handleGenerateShorts}
              disabled={generatingShorts}
              className="flex items-center gap-1.5 bg-zinc-900 hover:bg-white hover:text-black border border-zinc-700 px-3 py-1.5 text-white rounded-none text-xs font-mono font-bold uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-50"
            >
              <Scissors className="w-3.5 h-3.5" />
              <span>{generatingShorts ? "Extracting Shorts..." : "Turn into Shorts (9:16)"}</span>
            </button>
          )}

          {isCompleted && (video.videoPath || video.shorts?.some((s) => s.videoPath)) && (
            <button
              onClick={handleDeleteMedia}
              className="flex items-center gap-1.5 bg-zinc-900 hover:bg-red-950 hover:text-red-300 hover:border-red-800 border border-zinc-800 px-3 py-1.5 text-zinc-400 rounded-none text-xs font-mono font-bold uppercase tracking-wider transition-colors cursor-pointer"
              title="Delete generated MP4 video files from disk to free memory & storage"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear MP4 Files</span>
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

          {/* Full Video YouTube Publishing Action & Status Card */}
          {isCompleted && (
            <div className="bg-black border border-zinc-800 p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400">
                  YouTube Broadcast (Full 16:9 Video)
                </span>
                {video.disableAutoUpload ? (
                  <span className="flex items-center gap-1.5 text-[9px] font-mono text-red-400 font-bold uppercase">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                    Upload Blocked (Local Only)
                  </span>
                ) : (video.isPosted || video.youtubeVideoId || video.youtubeUrl) ? (
                  <span className="flex items-center gap-1.5 text-[9px] font-mono text-emerald-400 font-bold uppercase">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Published
                  </span>
                ) : (
                  <span className="text-[9px] font-mono text-amber-400 font-bold uppercase">
                    Ready to Publish
                  </span>
                )}
              </div>

              {/* YouTube Link if published */}
              {(video.youtubeUrl || video.youtubeVideoId) && (
                <div className="flex items-center justify-between text-[11px] bg-red-950/30 border border-red-900/60 px-2.5 py-1.5 text-zinc-300">
                  <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>PUBLISHED ON YOUTUBE</span>
                  </div>
                  <a
                    href={video.youtubeUrl || `https://www.youtube.com/watch?v=${video.youtubeVideoId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-red-400 hover:text-red-300 font-bold inline-flex items-center gap-1 underline"
                  >
                    <span>Watch Full Video</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}

              {/* Notification Banner on Post */}
              {fullVideoPostStatus && (
                <div className={`p-2 text-xs font-mono border ${
                  fullVideoPostStatus.status === "success"
                    ? "bg-emerald-950/50 border-emerald-800 text-emerald-300"
                    : "bg-red-950/50 border-red-800 text-red-300"
                }`}>
                  <p>{fullVideoPostStatus.msg}</p>
                </div>
              )}

              {/* Action Buttons: Post Full Video & Mark as Uploaded */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handlePostFullVideo}
                  disabled={postingFullVideo}
                  className={`py-2 px-2.5 text-center font-bold text-xs uppercase tracking-wider transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                    video.isPosted || video.youtubeVideoId
                      ? "bg-emerald-950/80 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-700/60"
                      : "bg-red-600 hover:bg-red-500 text-white border border-red-600 shadow-sm"
                  }`}
                >
                  {postingFullVideo || video.isUploading ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent animate-spin rounded-full" />
                      <span>Posting...</span>
                    </>
                  ) : video.isPosted || video.youtubeVideoId ? (
                    <>
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Published ✅</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Post Full Video</span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => {
                    setManualModalTarget(null);
                    setManualUrlInput(video.youtubeUrl || (video.youtubeVideoId ? `https://www.youtube.com/watch?v=${video.youtubeVideoId}` : ""));
                    setShowManualModal(true);
                  }}
                  className="py-2 px-2.5 text-center bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white font-bold text-xs uppercase transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  title="If you manually uploaded this video to YouTube outside ByteWire, link it here so automated scheduling skips it"
                >
                  <span>Manual Upload</span>
                </button>
              </div>

              {/* Toggle YouTube Auto-Upload Permission */}
              <div className="pt-2 border-t border-zinc-900 flex items-center justify-between text-xs font-mono">
                <span className="text-[10px] text-zinc-500">
                  {video.disableAutoUpload ? "Auto-upload blocked (Local only)" : "Auto-publishing allowed"}
                </span>
                <button
                  onClick={() => handleToggleUpload(null)}
                  className={`text-[10px] uppercase font-bold px-2 py-1 border transition-colors cursor-pointer ${
                    video.disableAutoUpload
                      ? "bg-zinc-900 hover:bg-emerald-950 border-emerald-800 text-emerald-400"
                      : "bg-zinc-900 hover:bg-red-950 border-zinc-800 text-zinc-400 hover:text-red-300"
                  }`}
                  title={
                    video.disableAutoUpload
                      ? "Click to allow automated daily upload to YouTube"
                      : "Click to block automated upload (keep strictly offline)"
                  }
                >
                  {video.disableAutoUpload ? "✓ Enable YT Upload" : "🚫 Block YT Upload"}
                </button>
              </div>
            </div>
          )}

          {/* Quick Meta Stats */}
          <div className="bg-black border border-zinc-800 p-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs font-mono">
            <div>
              <span className="text-[10px] text-zinc-500 uppercase block">Duration</span>
              <span className="font-bold text-white">{video.duration ? `${Math.floor(video.duration / 60)}m ${Math.round(video.duration % 60)}s` : "N/A"}</span>
            </div>
            <div>
              <span className="text-[10px] text-zinc-500 uppercase block">Aspect Ratio</span>
              <span className="font-bold text-white">16:9 (Full HD)</span>
            </div>
            <div>
              <span className="text-[10px] text-zinc-500 uppercase block">News Stories</span>
              <span className="font-bold text-white">{video.facts?.length || 10} Stories</span>
            </div>
            <div>
              <span className="text-[10px] text-zinc-500 uppercase block">Viral Shorts</span>
              <span className="font-bold text-white">{video.shorts?.length || 0} / 3</span>
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
                <span>Shorts (9:16)</span>
                {video.shorts?.length > 0 && (
                  <span className="text-[9px] px-1 bg-white text-black font-bold">{video.shorts.length}</span>
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
            {/* TAB 1: VERTICAL SHORTS (9:16) */}
            {/* ========================================================================= */}
            {activeTab === "shorts" && (
              <div className="space-y-6">
                {generatingShorts ? (
                  <div className="p-8 text-center bg-black border border-zinc-800 rounded-none space-y-3">
                    <Loader label="SLICING 9:16 SHORTS & GENERATING METADATA VIA FFMPEG..." />
                    <p className="text-zinc-400 text-xs">
                      Reshaping to 1080x1920 (9:16), slicing fact segments, and generating YouTube Shorts titles, descriptions, and tags with Gemini AI.
                    </p>
                  </div>
                ) : !hasShorts ? (
                  <div className="p-8 text-center bg-black border border-zinc-800 rounded-none space-y-4">
                    <Scissors className="w-10 h-10 text-zinc-600 mx-auto" />
                    <div className="space-y-1">
                      <h4 className="text-white text-sm font-bold uppercase">Vertical Shorts Not Yet Extracted</h4>
                      <p className="text-xs text-zinc-400 max-w-md mx-auto leading-relaxed">
                        Convert this full news video into vertical YouTube Shorts (9:16 format, 1080x1920) corresponding to each story, complete with AI-generated titles, descriptions, and hashtags.
                      </p>
                    </div>
                    {isCompleted ? (
                      <button
                        onClick={handleGenerateShorts}
                        className="px-5 py-2.5 bg-white hover:bg-zinc-200 text-black font-bold uppercase tracking-wider text-xs rounded-none transition-colors cursor-pointer inline-flex items-center gap-2"
                      >
                        <Scissors className="w-4 h-4" />
                        <span>Extract 9:16 Shorts Now</span>
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
                        <p className="text-[11px] text-zinc-400">
                          {video.shorts.length} vertical shorts extracted from Top 3 viral stories (1080x1920)
                        </p>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-white text-black uppercase">
                        {video.shorts.length} Shorts Ready
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

                              {/* Action Controls: Post Reel & Download */}
                              <div className="pt-2.5 border-t border-zinc-900 space-y-2">
                                {/* Post Status Toast */}
                                {postStatus[short.factIndex || idx + 1] && (
                                  <div
                                    className={`p-2 text-[11px] font-mono border flex items-center justify-between gap-2 ${
                                      postStatus[short.factIndex || idx + 1].status === "success"
                                        ? "bg-emerald-950/60 border-emerald-700 text-emerald-300"
                                        : "bg-red-950/60 border-red-700 text-red-300"
                                    }`}
                                  >
                                    <span className="truncate">{postStatus[short.factIndex || idx + 1].msg}</span>
                                    {postStatus[short.factIndex || idx + 1].url && (
                                      <a
                                        href={postStatus[short.factIndex || idx + 1].url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="underline font-bold text-white shrink-0 inline-flex items-center gap-1 hover:text-emerald-200"
                                      >
                                        <span>Watch</span>
                                        <ExternalLink className="w-3 h-3" />
                                      </a>
                                    )}
                                  </div>
                                )}

                                {/* Published on YouTube indicator */}
                                {(short.youtubeShortUrl || short.youtubeShortId) && (
                                  <div className="flex items-center justify-between text-[10px] bg-red-950/30 border border-red-900/60 px-2.5 py-1.5 text-zinc-300">
                                    <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                      <span>PUBLISHED ON YOUTUBE</span>
                                    </div>
                                    <a
                                      href={short.youtubeShortUrl || `https://www.youtube.com/shorts/${short.youtubeShortId}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-red-400 hover:text-red-300 font-bold inline-flex items-center gap-1 underline"
                                    >
                                      <span>Watch Short</span>
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  </div>
                                )}

                                {/* Action Buttons Grid: POST THIS REEL + DOWNLOAD */}
                                <div className="grid grid-cols-2 gap-2">
                                  {/* POST THIS REEL BUTTON */}
                                  <button
                                    onClick={() => handlePostReel(short.factIndex || idx + 1)}
                                    disabled={postingShortIndex === (short.factIndex || idx + 1)}
                                    title="Publish this individual 9:16 Short to YouTube with full AI title, hashtags, description & tags"
                                    className={`py-2 px-2.5 text-center font-bold text-xs uppercase tracking-wider transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                                      short.youtubeShortId || short.isPosted
                                        ? "bg-emerald-950/80 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-700/60"
                                        : "bg-red-600 hover:bg-red-500 text-white border border-red-600 shadow-sm"
                                    }`}
                                  >
                                    {postingShortIndex === (short.factIndex || idx + 1) || short.isUploading ? (
                                      <>
                                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent animate-spin rounded-full" />
                                        <span>Posting...</span>
                                      </>
                                    ) : short.youtubeShortId || short.isPosted ? (
                                      <>
                                        <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                                        <span>Published ✅</span>
                                      </>
                                    ) : (
                                      <>
                                        <Play className="w-3.5 h-3.5 fill-current" />
                                        <span>Post This Reel</span>
                                      </>
                                    )}
                                  </button>

                                  {/* DOWNLOAD SHORT BUTTON */}
                                  <a
                                    href={shortDownloadUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="py-2 px-2.5 text-center bg-zinc-900 hover:bg-white hover:text-black border border-zinc-800 text-white font-bold text-xs uppercase transition-colors inline-flex items-center justify-center gap-1.5"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                    <span>Download (9:16)</span>
                                  </a>
                                </div>

                                <div className="flex items-center justify-between text-[10px] font-mono pt-1">
                                  <button
                                    onClick={() => handleToggleUpload(short.factIndex || idx + 1)}
                                    className={`underline cursor-pointer ${
                                      short.disableAutoUpload
                                        ? "text-red-400 hover:text-red-300 font-bold"
                                        : "text-zinc-500 hover:text-zinc-300"
                                    }`}
                                    title={
                                      short.disableAutoUpload
                                        ? "Auto-upload is blocked for this short. Click to allow."
                                        : "Click to block automated upload for this short."
                                    }
                                  >
                                    {short.disableAutoUpload ? "🚫 Upload Blocked (Allow)" : "Block YT Upload"}
                                  </button>

                                  <button
                                    onClick={() => {
                                      setManualModalTarget(short.factIndex || idx + 1);
                                      setManualUrlInput(
                                        short.youtubeShortUrl ||
                                          (short.youtubeShortId
                                            ? `https://www.youtube.com/shorts/${short.youtubeShortId}`
                                            : "")
                                      );
                                      setShowManualModal(true);
                                    }}
                                    className="text-[10px] text-zinc-500 hover:text-zinc-300 underline cursor-pointer"
                                  >
                                    {short.isPosted ? "Edit Manual Upload Link" : "Mark as Manually Uploaded"}
                                  </button>
                                </div>
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
                  <div className="flex items-center gap-2">
                    {isCompleted && (
                      <button
                        onClick={handlePostFullVideo}
                        disabled={postingFullVideo}
                        className={`flex items-center gap-1.5 px-3 py-1 text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-50 cursor-pointer ${
                          video.isPosted || video.youtubeVideoId
                            ? "bg-red-950 hover:bg-red-900 text-red-200 border border-red-800"
                            : "bg-red-600 hover:bg-red-500 text-white shadow-sm"
                        }`}
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>{postingFullVideo ? "Posting..." : video.isPosted ? "Re-Post Full Video" : "Publish Full Video"}</span>
                      </button>
                    )}
                    <button
                      onClick={handleGenerateMetadata}
                      disabled={generatingMetadata}
                      className="flex items-center gap-1.5 px-3 py-1 bg-zinc-900 hover:bg-white hover:text-black border border-zinc-700 text-white text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>{generatingMetadata ? "Generating..." : "Regenerate Metadata"}</span>
                    </button>
                  </div>
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
      {/* Manual Upload Linking Modal */}
      {showManualModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-zinc-700 max-w-md w-full p-5 space-y-4 font-mono shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <h3 className="text-white text-sm font-bold uppercase">
                {manualModalTarget ? `Link Manual Short #${manualModalTarget}` : "Link Manual Full Video Upload"}
              </h3>
              <button
                onClick={() => setShowManualModal(false)}
                className="text-zinc-500 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              If you manually uploaded this {manualModalTarget ? "Short" : "Full Video"} to YouTube Studio, paste the YouTube URL or Video ID below. ByteWire will mark it as published and skip automatic scheduled uploads.
            </p>
            <div className="space-y-1">
              <label className="text-[10px] text-zinc-500 uppercase font-bold">YouTube URL or ID</label>
              <input
                type="text"
                value={manualUrlInput}
                onChange={(e) => setManualUrlInput(e.target.value)}
                placeholder={manualModalTarget ? "https://youtube.com/shorts/..." : "https://youtube.com/watch?v=..."}
                className="w-full bg-black border border-zinc-700 px-3 py-2 text-white text-xs focus:border-white focus:outline-none"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                onClick={() => setShowManualModal(false)}
                className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs uppercase cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => handleManualMarkPosted(manualModalTarget)}
                className="px-4 py-1.5 bg-white hover:bg-zinc-200 text-black font-bold text-xs uppercase cursor-pointer"
              >
                Save & Skip Auto-Publish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

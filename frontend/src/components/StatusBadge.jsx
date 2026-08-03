import React from "react";
import {
  Clock,
  Search,
  Sparkles,
  FileText,
  Mic,
  Subtitles,
  Download,
  Film,
  CheckCircle,
  XCircle,
  AlertOctagon
} from "lucide-react";

export default function StatusBadge({ status }) {
  const getStatusConfig = () => {
    switch (status) {
      case "Pending":
        return {
          bg: "bg-slate-900/60 text-slate-400 border-slate-800",
          icon: Clock,
          label: "Pending"
        };
      case "Collecting RSS":
        return {
          bg: "bg-blue-950/20 text-blue-400 border-blue-900/30",
          icon: Search,
          label: "RSS Scrape"
        };
      case "Selecting News":
        return {
          bg: "bg-indigo-950/20 text-indigo-400 border-indigo-900/30",
          icon: Sparkles,
          label: "Gemini Filter"
        };
      case "Generating Script":
        return {
          bg: "bg-purple-950/20 text-purple-400 border-purple-900/30",
          icon: FileText,
          label: "Script Writing"
        };
      case "Generating Voice":
        return {
          bg: "bg-amber-950/20 text-amber-400 border-amber-900/30",
          icon: Mic,
          label: "Piper TTS"
        };
      case "Generating Subtitles":
        return {
          bg: "bg-teal-950/20 text-teal-400 border-teal-900/30",
          icon: Subtitles,
          label: "Whisper SRT"
        };
      case "Downloading Clips":
        return {
          bg: "bg-cyan-950/20 text-cyan-400 border-cyan-900/30",
          icon: Download,
          label: "Pexels Sync"
        };
      case "Rendering":
        return {
          bg: "bg-pink-950/20 text-pink-400 border-pink-900/30",
          icon: Film,
          label: "MoviePy Rendering"
        };
      case "Completed":
        return {
          bg: "bg-emerald-950/20 text-emerald-400 border-emerald-900/30",
          icon: CheckCircle,
          label: "Completed"
        };
      case "Failed":
        return {
          bg: "bg-red-950/20 text-red-400 border-red-900/30",
          icon: XCircle,
          label: "Failed"
        };
      case "Stopped":
        return {
          bg: "bg-orange-950/20 text-orange-400 border-orange-900/30",
          icon: AlertOctagon,
          label: "Aborted"
        };
      default:
        return {
          bg: "bg-slate-900 text-slate-400 border-slate-800",
          icon: Clock,
          label: status
        };
    }
  };

  const { bg, icon: Icon, label } = getStatusConfig();

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium tracking-wide ${bg}`}
    >
      <Icon className="w-3.5 h-3.5" />
      <span>{label}</span>
    </span>
  );
}

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
          bg: "bg-black text-zinc-400 border-zinc-800",
          icon: Clock,
          label: "PENDING"
        };
      case "Collecting RSS":
        return {
          bg: "bg-zinc-950 text-white border-zinc-700",
          icon: Search,
          label: "RSS SCRAPE"
        };
      case "Selecting News":
        return {
          bg: "bg-zinc-950 text-white border-zinc-700",
          icon: Sparkles,
          label: "GEMINI SELECT"
        };
      case "Generating Script":
        return {
          bg: "bg-zinc-950 text-white border-zinc-700",
          icon: FileText,
          label: "SCRIPT WRITING"
        };
      case "Generating Voice":
        return {
          bg: "bg-zinc-950 text-white border-zinc-700",
          icon: Mic,
          label: "PIPER TTS"
        };
      case "Generating Subtitles":
        return {
          bg: "bg-zinc-950 text-white border-zinc-700",
          icon: Subtitles,
          label: "WHISPER SRT"
        };
      case "Downloading Clips":
        return {
          bg: "bg-zinc-950 text-white border-zinc-700",
          icon: Download,
          label: "PEXELS SYNC"
        };
      case "Rendering":
        return {
          bg: "bg-white text-black border-white animate-pulse font-bold",
          icon: Film,
          label: "RENDERING"
        };
      case "Completed":
        return {
          bg: "bg-black text-white border-white",
          icon: CheckCircle,
          label: "COMPLETED"
        };
      case "Failed":
        return {
          bg: "bg-black text-red-400 border-red-900/60",
          icon: XCircle,
          label: "FAILED"
        };
      case "Stopped":
        return {
          bg: "bg-black text-zinc-400 border-zinc-800",
          icon: AlertOctagon,
          label: "ABORTED"
        };
      default:
        return {
          bg: "bg-black text-zinc-400 border-zinc-800",
          icon: Clock,
          label: (status || "UNKNOWN").toUpperCase()
        };
    }
  };

  const { bg, icon: Icon, label } = getStatusConfig();

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-none border text-[10px] font-mono tracking-wider ${bg}`}
    >
      <Icon className="w-3 h-3 flex-shrink-0" />
      <span>{label}</span>
    </span>
  );
}


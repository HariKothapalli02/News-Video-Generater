import React from "react";
import { Loader2 } from "lucide-react";

export default function Loader({ label = "Loading data streams...", size = "w-6 h-6" }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 gap-3">
      <Loader2 className={`${size} animate-spin text-white`} />
      <span className="text-xs font-mono tracking-wider text-zinc-400 uppercase">
        {label}
      </span>
    </div>
  );
}


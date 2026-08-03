import React from "react";
import { Loader2 } from "lucide-react";

export default function Loader({ label = "Loading data streams...", size = "w-8 h-8" }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 gap-3">
      <Loader2 className={`${size} animate-spin text-primary`} />
      <span className="text-sm font-medium text-slate-400 font-sans tracking-wide">
        {label}
      </span>
    </div>
  );
}

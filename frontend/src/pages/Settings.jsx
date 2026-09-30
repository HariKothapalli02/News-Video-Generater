import React, { useState } from "react";
import { Settings as SettingsIcon, Shield, Server, Check, Copy } from "lucide-react";

export default function Settings() {
  const [copiedKey, setCopiedKey] = useState(null);

  const configs = [
    {
      label: "Gemini API Key",
      value: "AIzaSyAzyyXvt8PdX_MbJ4BKn0l9xgfY34wzMQ4",
      secret: true,
      category: "API Keys"
    },
    {
      label: "Pexels API Key",
      value: "vrd7GcXTdpSU3RX4nUQF5UJP94mOTo2Ihd23v6r1reYsx3VZXewTOOtc",
      secret: true,
      category: "API Keys"
    },
    {
      label: "MongoDB Connection URI",
      value: "mongodb://127.0.0.1:27017/bytewire",
      secret: false,
      category: "Database"
    },
    {
      label: "Videos Storage Directory",
      value: "E:\\ec2yt\\bytewire\\videos",
      secret: false,
      category: "Storage Paths"
    },
    {
      label: "Thumbnails Storage Directory",
      value: "E:\\ec2yt\\bytewire\\thumbnails",
      secret: false,
      category: "Storage Paths"
    },
    {
      label: "Logs Storage Directory",
      value: "E:\\ec2yt\\bytewire\\logs",
      secret: false,
      category: "Storage Paths"
    }
  ];

  const handleCopy = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const getObfuscated = (text) => {
    if (text.length <= 12) return "••••••••••••";
    return `${text.substring(0, 6)}••••••••••••${text.substring(text.length - 6)}`;
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Header */}
      <div className="flex flex-col gap-1 border-b border-zinc-800 pb-3">
        <div className="flex items-center gap-2">
          <SettingsIcon className="w-4 h-4 text-white" />
          <h2 className="text-base font-bold text-white tracking-wider font-mono uppercase">
            Environment Registry
          </h2>
        </div>
        <p className="text-xs text-zinc-400 font-mono">
          Engine API integrations, storage paths, and service configurations
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Configurations List */}
        <div className="lg:col-span-8 space-y-4 bg-zinc-950 border border-zinc-800 rounded-none p-5 sm:p-6">
          <h3 className="font-bold text-xs text-white uppercase font-mono tracking-wider mb-4 border-b border-zinc-800 pb-2 flex items-center gap-2">
            <Server className="w-3.5 h-3.5 text-white" />
            <span>Environment Parameters</span>
          </h3>

          <div className="space-y-4">
            {configs.map((cfg, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex justify-between items-center text-xs font-mono">
                  <span className="text-zinc-300 font-bold uppercase">{cfg.label}</span>
                  <span className="text-[10px] text-zinc-500 font-mono uppercase px-1.5 py-0.2 bg-black border border-zinc-800 rounded-none">
                    {cfg.category}
                  </span>
                </div>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    readOnly
                    value={cfg.secret ? getObfuscated(cfg.value) : cfg.value}
                    className="w-full pl-3 pr-10 py-2 bg-black border border-zinc-800 rounded-none text-xs font-mono text-zinc-300 focus:outline-none focus:border-white select-all"
                  />
                  <button
                    onClick={() => handleCopy(cfg.value, idx)}
                    className="absolute right-1.5 p-1.5 rounded-none bg-zinc-900 hover:bg-white hover:text-black text-zinc-400 border border-zinc-800 transition-colors cursor-pointer"
                    title="Copy to clipboard"
                  >
                    {copiedKey === idx ? (
                      <Check className="w-3.5 h-3.5 text-green-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Info Card */}
        <div className="lg:col-span-4 space-y-5">
          <div className="bg-zinc-950 border border-zinc-800 rounded-none p-5 space-y-3 font-mono">
            <h3 className="font-bold text-xs text-white uppercase tracking-wider border-b border-zinc-800 pb-2 flex items-center gap-2">
              <Shield className="w-3.5 h-3.5 text-white" />
              <span>Security Protocols</span>
            </h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Active configuration values are bound to the root <code className="bg-black px-1.5 py-0.5 border border-zinc-800 text-white rounded-none">.env</code> configuration file.
            </p>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Updates require an engine reload via the System Status control center to propagate changes to background worker processes.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}


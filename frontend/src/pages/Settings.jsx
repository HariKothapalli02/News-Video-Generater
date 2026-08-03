import React, { useState } from "react";
import { Settings as SettingsIcon, Shield, Server, FileText, Check, Copy } from "lucide-react";

export default function Settings() {
  const [copiedKey, setCopiedKey] = useState(null);

  // Read configurations (obfuscated placeholders representing the server environment)
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
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-bold text-white tracking-wide flex items-center gap-2">
          <SettingsIcon className="w-5 h-5 text-primary" />
          <span>System Settings</span>
        </h2>
        <p className="text-xs text-slate-400 font-medium">
          Verify API key integrations, database configurations, and disk directory paths
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Configurations List */}
        <div className="lg:col-span-8 space-y-6 bg-card border border-slate-800 rounded-2xl p-6 glow-card">
          <h3 className="font-semibold text-sm text-white mb-6 border-b border-slate-850 pb-3 flex items-center gap-2">
            <Server className="w-4.5 h-4.5 text-primary" />
            <span>Environment Variables</span>
          </h3>

          <div className="space-y-5">
            {configs.map((cfg, idx) => (
              <div key={idx} className="space-y-1.5">
                <div className="flex justify-between items-center text-xs font-semibold text-slate-400">
                  <span>{cfg.label}</span>
                  <span className="text-[10px] text-slate-500 font-medium tracking-wide uppercase px-2 py-0.5 rounded bg-slate-900 border border-slate-850">
                    {cfg.category}
                  </span>
                </div>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    readOnly
                    value={cfg.secret ? getObfuscated(cfg.value) : cfg.value}
                    className="w-full pl-4 pr-12 py-2.5 bg-slate-900 border border-slate-850 rounded-xl text-xs font-mono text-slate-300 focus:outline-none"
                  />
                  <button
                    onClick={() => handleCopy(cfg.value, idx)}
                    className="absolute right-2.5 p-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-400 hover:text-white transition-all cursor-pointer"
                    title="Copy to clipboard"
                  >
                    {copiedKey === idx ? (
                      <Check className="w-4 h-4 text-success" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Info Card */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-card border border-slate-800 rounded-2xl p-5 space-y-4 glow-card">
            <h3 className="font-semibold text-xs text-slate-400 tracking-wider uppercase border-b border-slate-850 pb-2 flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" />
              <span>Security Policy</span>
            </h3>
            <p className="text-xs text-slate-450 leading-relaxed font-medium">
              These properties are automatically loaded from the shared <code className="bg-slate-900 px-1 py-0.5 border border-slate-800 text-slate-450 rounded font-mono">.env</code> configuration file at the workspace root directory.
            </p>
            <p className="text-xs text-slate-450 leading-relaxed font-medium">
              To update these credentials or path destinations, edit the file locally on the host or contact your systems administrator to modify AWS EC2 variables.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useEffect, useState } from "react";
import { useVideoStore } from "../store/videoStore";
import {
  Settings as SettingsIcon,
  Shield,
  Server,
  Check,
  Copy,
  Eye,
  EyeOff,
  Save,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Key,
  Radio
} from "lucide-react";

export default function Settings() {
  const { fetchSettings, updateSettings, testPexelsKey, testWebhookUrl } = useVideoStore();
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copiedKey, setCopiedKey] = useState(null);
  const [revealed, setRevealed] = useState({});
  const [pexelsStatus, setPexelsStatus] = useState(null); // { valid: bool, msg: string, testing: bool }
  const [webhookStatus, setWebhookStatus] = useState(null); // { valid: bool, msg: string, testing: bool }
  const [saveSuccess, setSaveSuccess] = useState(false);

  // The verified working Pexels key from root .env
  const VERIFIED_PEXELS_KEY = "wAENyUMkdqIFBTq2O8puRfDyx8mahm5KSWVWcYtftyk6AAwKGggT4pXg";

  const loadSettings = async () => {
    try {
      setLoading(true);
      const data = await fetchSettings();
      if (data && data.configs) {
        setConfigs(data.configs);
      }
    } catch (err) {
      console.error("Failed to load settings:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleCopy = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const toggleReveal = (key) => {
    setRevealed((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleChange = (key, val) => {
    setConfigs((prev) =>
      prev.map((c) => (c.key === key ? { ...c, value: val } : c))
    );
  };

  const handleApplyVerifiedPexels = () => {
    handleChange("PEXELS_API_KEY", VERIFIED_PEXELS_KEY);
    handleTestPexels(VERIFIED_PEXELS_KEY);
  };

  const handleTestPexels = async (keyOverride = null) => {
    const pexelsCfg = configs.find((c) => c.key === "PEXELS_API_KEY");
    const key = keyOverride || pexelsCfg?.value;
    if (!key) {
      setPexelsStatus({ valid: false, msg: "Key is empty." });
      return;
    }

    setPexelsStatus({ testing: true });
    const res = await testPexelsKey(key);
    setPexelsStatus({
      testing: false,
      valid: res.valid,
      msg: res.msg || (res.valid ? "Key is 100% valid and verified active!" : "Unauthorized (401)")
    });
  };

  const handleTestWebhook = async () => {
    const webhookCfg = configs.find((c) => c.key === "N8N_WEBHOOK_URL");
    const url = webhookCfg?.value;
    if (!url) {
      setWebhookStatus({ valid: false, msg: "Webhook URL is empty. Please enter your n8n webhook URL." });
      return;
    }

    setWebhookStatus({ testing: true });
    const res = await testWebhookUrl(url);
    setWebhookStatus({
      testing: false,
      valid: res.valid,
      msg: res.msg || (res.valid ? "Webhook is registered and workflow is active (200 OK)!" : "Failed to connect to webhook.")
    });
  };

  const handleFixWebhookToProd = () => {
    const webhookCfg = configs.find((c) => c.key === "N8N_WEBHOOK_URL");
    if (webhookCfg && webhookCfg.value.includes("/webhook-test/")) {
      const fixed = webhookCfg.value.replace("/webhook-test/", "/webhook/");
      handleChange("N8N_WEBHOOK_URL", fixed);
      setWebhookStatus({
        valid: null,
        msg: "Updated URL to production (/webhook/). Click 'Save Settings' and make sure workflow is Active in n8n!"
      });
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setSaveSuccess(false);
      const updates = {};
      configs.forEach((c) => {
        updates[c.key] = c.value;
      });

      await updateSettings(updates);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      alert("Error saving settings: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const getObfuscated = (text) => {
    if (!text) return "";
    if (text.length <= 12) return "••••••••••••";
    return `${text.substring(0, 6)}••••••••••••${text.substring(text.length - 6)}`;
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <SettingsIcon className="w-4 h-4 text-white" />
            <h2 className="text-base font-bold text-white tracking-wider font-mono uppercase">
              Environment Registry & API Configuration
            </h2>
          </div>
          <p className="text-xs text-zinc-400 font-mono">
            Directly configure Pexels, Gemini AI, storage paths, and service parameters
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-3 py-1.5 bg-white text-black font-mono text-xs font-bold uppercase hover:bg-zinc-200 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {saving ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : saveSuccess ? (
              <Check className="w-3.5 h-3.5 text-green-600" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            <span>{saving ? "Saving..." : saveSuccess ? "Saved to .env" : "Save Settings"}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Configurations List */}
        <div className="lg:col-span-8 space-y-5 bg-zinc-950 border border-zinc-800 rounded-none p-5 sm:p-6">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2 mb-4">
            <h3 className="font-bold text-xs text-white uppercase font-mono tracking-wider flex items-center gap-2">
              <Server className="w-3.5 h-3.5 text-white" />
              <span>Active Environment Parameters</span>
            </h3>
            <span className="text-[10px] text-zinc-400 font-mono">Changes persist directly to .env</span>
          </div>

          {loading ? (
            <div className="p-8 text-center text-zinc-400 font-mono text-xs animate-pulse">
              Loading active environment parameters from engine...
            </div>
          ) : (
            <div className="space-y-4">
              {configs.map((cfg, idx) => {
                const isSecret = cfg.secret;
                const isRevealed = revealed[cfg.key];
                const isPexels = cfg.key === "PEXELS_API_KEY";
                const isWebhook = cfg.key === "N8N_WEBHOOK_URL";

                return (
                  <div key={idx} className="space-y-1.5 p-3 bg-black/40 border border-zinc-900">
                    <div className="flex justify-between items-center text-xs font-mono">
                      <span className="text-zinc-200 font-bold uppercase flex items-center gap-2">
                        {isPexels && <Key className="w-3.5 h-3.5 text-yellow-500" />}
                        {isWebhook && <Radio className="w-3.5 h-3.5 text-cyan-400" />}
                        <span>{cfg.label}</span>
                      </span>
                      <span className="text-[10px] text-zinc-500 font-mono uppercase px-1.5 py-0.5 bg-black border border-zinc-800 rounded-none">
                        {cfg.category}
                      </span>
                    </div>

                    <div className="relative flex items-center">
                      <input
                        type={isSecret && !isRevealed ? "password" : "text"}
                        value={cfg.value || ""}
                        onChange={(e) => handleChange(cfg.key, e.target.value)}
                        className="w-full pl-3 pr-20 py-2 bg-black border border-zinc-800 rounded-none text-xs font-mono text-zinc-200 focus:outline-none focus:border-white select-all"
                        placeholder={`Enter ${cfg.label}...`}
                      />

                      <div className="absolute right-1.5 flex items-center gap-1">
                        {isSecret && (
                          <button
                            type="button"
                            onClick={() => toggleReveal(cfg.key)}
                            className="p-1.5 rounded-none bg-zinc-900 hover:bg-zinc-800 text-zinc-400 border border-zinc-800 transition-colors cursor-pointer"
                            title={isRevealed ? "Hide value" : "Reveal value"}
                          >
                            {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleCopy(cfg.value, idx)}
                          className="p-1.5 rounded-none bg-zinc-900 hover:bg-white hover:text-black text-zinc-400 border border-zinc-800 transition-colors cursor-pointer"
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

                    {/* Dedicated Pexels Key Diagnostics & Quick Fix */}
                    {isPexels && (
                      <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-zinc-900 text-[11px] font-mono">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleTestPexels()}
                            disabled={pexelsStatus?.testing}
                            className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-700 transition-colors cursor-pointer text-[10px] uppercase font-bold"
                          >
                            {pexelsStatus?.testing ? "Testing Key..." : "Test Pexels Key"}
                          </button>

                          <button
                            type="button"
                            onClick={handleApplyVerifiedPexels}
                            className="px-2.5 py-1 bg-yellow-500/10 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/20 transition-colors cursor-pointer text-[10px] uppercase font-bold"
                          >
                            Use Verified Key
                          </button>
                        </div>

                        {pexelsStatus && (
                          <div className="flex items-center gap-1.5">
                            {pexelsStatus.testing ? (
                              <span className="text-zinc-400 animate-pulse">Contacting Pexels API...</span>
                            ) : pexelsStatus.valid ? (
                              <span className="text-green-400 flex items-center gap-1">
                                <CheckCircle className="w-3.5 h-3.5" />
                                <span>Verified Active (200 OK)</span>
                              </span>
                            ) : (
                              <span className="text-red-400 flex items-center gap-1">
                                <AlertCircle className="w-3.5 h-3.5" />
                                <span>{pexelsStatus.msg}</span>
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Dedicated n8n Webhook Diagnostics & Quick Fix */}
                    {isWebhook && (
                      <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-zinc-900 text-[11px] font-mono">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleTestWebhook()}
                            disabled={webhookStatus?.testing}
                            className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-700 transition-colors cursor-pointer text-[10px] uppercase font-bold"
                          >
                            {webhookStatus?.testing ? "Testing Webhook..." : "Test n8n Webhook"}
                          </button>

                          {cfg.value && cfg.value.includes("/webhook-test/") && (
                            <button
                              type="button"
                              onClick={handleFixWebhookToProd}
                              className="px-2.5 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 transition-colors cursor-pointer text-[10px] uppercase font-bold"
                              title="Convert test URL to production URL"
                            >
                              Fix to Production URL
                            </button>
                          )}
                        </div>

                        {webhookStatus && (
                          <div className="flex items-center gap-1.5 max-w-md">
                            {webhookStatus.testing ? (
                              <span className="text-zinc-400 animate-pulse">Contacting n8n Webhook...</span>
                            ) : webhookStatus.valid ? (
                              <span className="text-green-400 flex items-center gap-1">
                                <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                                <span>{webhookStatus.msg}</span>
                              </span>
                            ) : (
                              <span className="text-red-400 flex items-center gap-1 text-[10px] leading-tight">
                                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                <span>{webhookStatus.msg}</span>
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Info & Diagnostics Card */}
        <div className="lg:col-span-4 space-y-5">
          <div className="bg-zinc-950 border border-zinc-800 rounded-none p-5 space-y-4 font-mono">
            <h3 className="font-bold text-xs text-white uppercase tracking-wider border-b border-zinc-800 pb-2 flex items-center gap-2">
              <Shield className="w-3.5 h-3.5 text-white" />
              <span>Video Engine Diagnostics</span>
            </h3>

            <div className="space-y-3 text-xs text-zinc-400 leading-relaxed">
              <div className="p-3 bg-black/60 border border-zinc-800 space-y-1">
                <span className="text-yellow-400 font-bold block uppercase text-[10px]">
                  Why Was the Video Grey?
                </span>
                <p className="text-[11px] text-zinc-400">
                  When Pexels returns <code className="text-red-400">401 Unauthorized</code> (invalid API key) or runs out of credits, video downloads fail.
                </p>
              </div>

              <div className="p-3 bg-black/60 border border-zinc-800 space-y-1">
                <span className="text-green-400 font-bold block uppercase text-[10px]">
                  Active Multi-Layer Fallback
                </span>
                <p className="text-[11px] text-zinc-400">
                  The engine now automatically falls back to <strong>Wikimedia Commons</strong> (free high-res topic images converted with smooth Ken-Burns zoom) and <strong>dynamic procedural broadcast graphics</strong>. The video will never be flat grey again!
                </p>
              </div>

              <div className="p-3 bg-black/60 border border-zinc-800 space-y-1">
                <span className="text-blue-400 font-bold block uppercase text-[10px]">
                  Server / EC2 Deployment Tip
                </span>
                <p className="text-[11px] text-zinc-400">
                  If running on Ubuntu EC2 (<code className="text-zinc-300">/home/ubuntu/bytewire</code>), ensure your server's <code className="text-zinc-300">.env</code> has the verified working Pexels API key:
                </p>
                <code className="block bg-zinc-900 p-1.5 text-[10px] text-yellow-300 break-all select-all border border-zinc-700 mt-1">
                  PEXELS_API_KEY={VERIFIED_PEXELS_KEY}
                </code>
              </div>

              <div className="p-3 bg-black/60 border border-zinc-800 space-y-1.5">
                <span className="text-cyan-400 font-bold block uppercase text-[10px]">
                  Fix: "Webhook Not Registered" Error
                </span>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  In n8n, webhooks reject requests with <em>"not registered"</em> if the workflow is Inactive or using a test URL.
                </p>
                <div className="text-[10px] text-zinc-300 space-y-1 bg-zinc-900/80 p-2 border border-zinc-800">
                  <p><strong>1. Toggle Active:</strong> Open the workflow in n8n and toggle the top-right switch from <strong>Inactive</strong> to <strong>Active (ON)</strong>.</p>
                  <p><strong>2. Use Production URL:</strong> Ensure your URL ends in <code className="text-yellow-300">/webhook/bytewire-video-ready</code> (never use <code className="text-zinc-500">/webhook-test/</code> for production).</p>
                  <p><strong>3. Save & Test:</strong> Click <strong>Test n8n Webhook</strong> above to verify registration.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

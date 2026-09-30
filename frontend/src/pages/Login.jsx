import React, { useState, useEffect } from "react";
import { useAuthStore } from "../store/authStore";
import { Loader2, Lock, User, AlertCircle, Shield } from "lucide-react";

export default function Login() {
  const [usernameInput, setUsernameInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const { login, loading, error, clearError } = useAuthStore();

  useEffect(() => {
    clearError();
  }, [clearError]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!usernameInput || !passwordInput) return;
    await login(usernameInput, passwordInput);
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4 relative overflow-hidden font-mono">
      <div className="w-full max-w-sm bg-zinc-950 border border-zinc-800 rounded-none p-6 sm:p-8 shadow-2xl relative z-10">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-none bg-white text-black flex items-center justify-center font-black tracking-tighter text-sm border border-white">
            BW
          </div>
          <div>
            <h2 className="text-base font-bold text-white font-mono tracking-widest uppercase">
              ByteWire Access
            </h2>
            <p className="text-[11px] text-zinc-500 font-mono mt-0.5">
              Automated Video Generation Console
            </p>
          </div>
        </div>

        {/* Error Callout */}
        {error && (
          <div className="mb-5 p-3 rounded-none bg-black border border-red-900/60 flex gap-2.5 text-xs text-red-400 font-mono items-start">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Credentials Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Username */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono font-bold text-zinc-300 uppercase tracking-wider block">
              Username
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-zinc-500">
                <User className="w-3.5 h-3.5" />
              </span>
              <input
                type="text"
                required
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                placeholder="admin"
                className="w-full pl-9 pr-3 py-2 bg-black border border-zinc-800 rounded-none text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-white transition-colors"
              />
            </div>
          </div>

          {/* Password */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono font-bold text-zinc-300 uppercase tracking-wider block">
              Password
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-zinc-500">
                <Lock className="w-3.5 h-3.5" />
              </span>
              <input
                type="password"
                required
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-9 pr-3 py-2 bg-black border border-zinc-800 rounded-none text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-white transition-colors"
              />
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-white hover:bg-zinc-200 active:bg-zinc-300 text-black text-xs font-bold font-mono uppercase tracking-wider rounded-none border border-white transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed mt-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Verifying...</span>
              </>
            ) : (
              <span>Authenticate Session</span>
            )}
          </button>
        </form>

        {/* Setup notice */}
        <div className="mt-6 text-center text-[10px] text-zinc-600 border-t border-zinc-900 pt-3">
          Default: <code className="text-zinc-400">admin / admin123</code>
        </div>
      </div>
    </div>
  );
}

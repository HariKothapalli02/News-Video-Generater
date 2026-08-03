import React, { useState, useEffect } from "react";
import { useAuthStore } from "../store/authStore";
import { Sparkles, Loader2, Lock, User, AlertCircle } from "lucide-react";

export default function Login() {
  const [usernameInput, setUsernameInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const { login, loading, error, clearError } = useAuthStore();

  useEffect(() => {
    // Clear errors when entering login screen
    clearError();
  }, [clearError]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!usernameInput || !passwordInput) return;
    await login(usernameInput, passwordInput);
  };

  return (
    <div className="min-h-screen bg-[#0B0F19] flex items-center justify-center px-4 relative overflow-hidden">
      {/* Decorative Blur Backgrounds */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-[100px] pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-violet-600/10 rounded-full blur-[100px] pointer-events-none"></div>

      <div className="w-full max-w-md bg-[#141A24] border border-slate-800 rounded-2xl p-8 shadow-2xl relative z-10 glow-card">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-violet-600 flex items-center justify-center shadow-lg shadow-primary/20 glow-primary">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-white font-sans tracking-tight mt-2">
            Welcome to ByteWire
          </h2>
          <p className="text-xs text-slate-400 font-medium">
            AI-Powered YouTube News Generation Platform
          </p>
        </div>

        {/* Error Callout */}
        {error && (
          <div className="mb-6 p-3.5 rounded-xl bg-red-950/20 border border-red-900/30 flex gap-3 text-xs text-red-400 font-medium items-start">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Credentials Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Username */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
              Username
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500">
                <User className="w-4 h-4" />
              </span>
              <input
                type="text"
                required
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                placeholder="Enter admin username"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-850 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all duration-200"
              />
            </div>
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
              Password
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500">
                <Lock className="w-4 h-4" />
              </span>
              <input
                type="password"
                required
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="Enter admin password"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-850 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all duration-200"
              />
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 bg-primary hover:bg-blue-600 active:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-primary/20 hover:shadow-primary/30 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Verifying Identity...</span>
              </>
            ) : (
              <span>Sign In to Dashboard</span>
            )}
          </button>
        </form>

        {/* Setup notice */}
        <div className="mt-8 text-center text-[10px] text-slate-500 border-t border-slate-850 pt-4 font-medium">
          Default developer configuration: <code className="bg-slate-900 px-1 py-0.5 rounded border border-slate-800 text-slate-400">admin / admin123</code>
        </div>
      </div>
    </div>
  );
}

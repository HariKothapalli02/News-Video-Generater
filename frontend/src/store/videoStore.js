import { create } from "zustand";
import axios from "axios";
import { io } from "socket.io-client";

const API_URL = import.meta.env.VITE_API_URL || (window.location.port ? `${window.location.protocol}//${window.location.hostname}:5000/api` : "/api");
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || (window.location.port ? `${window.location.protocol}//${window.location.hostname}:5000` : "");

export const useVideoStore = create((set, get) => {
  let socket = null;

  return {
    history: [],
    activeJob: null, // { id, title, status, progress, script, duration, logs }
    stats: null,
    loading: false,
    error: null,
    socketConnected: false,

    getHeaders: () => {
      const token = localStorage.getItem("token");
      return {
        headers: {
          Authorization: `Bearer ${token}`
        }
      };
    },

    connectSocket: () => {
      if (socket) return;

      console.log("Connecting to WebSocket server...");
      socket = io(SOCKET_URL);

      socket.on("connect", () => {
        console.log("WebSocket connected.");
        set({ socketConnected: true });
      });

      socket.on("disconnect", () => {
        console.log("WebSocket disconnected.");
        set({ socketConnected: false });
      });

      socket.on("job_update", (update) => {
        console.log("Received job update:", update);
        set({ activeJob: update });

        // If the state changes to terminal, refresh statistics and history list
        if (
          update.status === "Completed" ||
          update.status === "Failed" ||
          update.status === "Stopped"
        ) {
          get().fetchHistory();
          get().fetchStats();
        }
      });
    },

    disconnectSocket: () => {
      if (socket) {
        socket.disconnect();
        socket = null;
        set({ socketConnected: false });
      }
    },

    fetchHistory: async () => {
      try {
        const res = await axios.get(`${API_URL}/history`, get().getHeaders());
        set({ history: res.data });
      } catch (err) {
        set({ error: err.response?.data?.msg || "Failed to retrieve history." });
      }
    },

    fetchActiveJob: async () => {
      try {
        const res = await axios.get(`${API_URL}/status`, get().getHeaders());
        if (res.data.active) {
          set({ activeJob: res.data.job });
        } else {
          set({ activeJob: null });
        }
      } catch (err) {
        set({ error: err.response?.data?.msg || "Failed to fetch active job status." });
      }
    },

    fetchStats: async () => {
      try {
        const res = await axios.get(`${API_URL}/system`, get().getHeaders());
        set({ stats: res.data });
      } catch (err) {
        set({ error: err.response?.data?.msg || "Failed to fetch system metrics." });
      }
    },

    generateVideo: async (options) => {
      set({ loading: true, error: null });
      try {
        const res = await axios.post(`${API_URL}/generate`, options, get().getHeaders());
        set({ activeJob: res.data, loading: false });
        get().fetchHistory();
        return true;
      } catch (err) {
        const msg = err.response?.data?.msg || "Failed to trigger news generation.";
        set({ error: msg, loading: false });
        return false;
      }
    },

    stopGeneration: async () => {
      try {
        await axios.post(`${API_URL}/stop`, {}, get().getHeaders());
        return true;
      } catch (err) {
        set({ error: err.response?.data?.msg || "Failed to stop rendering process." });
        return false;
      }
    },

    deleteVideo: async (id) => {
      try {
        await axios.delete(`${API_URL}/video/${id}`, get().getHeaders());
        set((state) => ({
          history: state.history.filter((v) => v._id !== id)
        }));
        get().fetchStats();
        return true;
      } catch (err) {
        set({ error: err.response?.data?.msg || "Failed to delete video." });
        return false;
      }
    },

    retryVideo: async (id) => {
      try {
        const res = await axios.post(`${API_URL}/retry/${id}`, {}, get().getHeaders());
        set({ activeJob: res.data.video });
        get().fetchHistory();
        return true;
      } catch (err) {
        set({ error: err.response?.data?.msg || "Failed to retry generation." });
        return false;
      }
    },

    clearStorage: async () => {
      try {
        await axios.post(`${API_URL}/clear-storage`, {}, get().getHeaders());
        get().fetchHistory();
        get().fetchStats();
        return true;
      } catch (err) {
        set({ error: err.response?.data?.msg || "Failed to clear disk storage cache." });
        return false;
      }
    },

    restartService: async () => {
      try {
        await axios.post(`${API_URL}/restart-service`, {}, get().getHeaders());
        set({ activeJob: null });
        get().fetchHistory();
        get().fetchStats();
        return true;
      } catch (err) {
        set({ error: err.response?.data?.msg || "Failed to restart background processor." });
        return false;
      }
    },

    clearActiveJob: () => set({ activeJob: null }),
    clearError: () => set({ error: null })
  };
});
export default useVideoStore;

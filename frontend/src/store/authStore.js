import { create } from "zustand";
import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || (window.location.port ? `${window.location.protocol}//${window.location.hostname}:5000/api` : "/api");

export const useAuthStore = create((set) => ({
  token: localStorage.getItem("token") || null,
  username: localStorage.getItem("username") || null,
  isAuthenticated: !!localStorage.getItem("token"),
  loading: false,
  error: null,

  login: async (username, password) => {
    set({ loading: true, error: null });
    try {
      const response = await axios.post(`${API_URL}/login`, { username, password });
      const { token, username: resUser } = response.data;

      localStorage.setItem("token", token);
      localStorage.setItem("username", resUser);

      set({
        token,
        username: resUser,
        isAuthenticated: true,
        loading: false,
        error: null
      });
      return true;
    } catch (err) {
      const msg = err.response?.data?.msg || "Login failed. Check your admin credentials.";
      set({ error: msg, loading: false });
      return false;
    }
  },

  logout: () => {
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    set({
      token: null,
      username: null,
      isAuthenticated: false,
      error: null
    });
  },

  clearError: () => set({ error: null })
}));

// Axios interceptor to catch invalid tokens and trigger logout redirection
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      console.warn("Invalid token detected, clearing session states.");
      useAuthStore.getState().logout();
    }
    return Promise.reject(error);
  }
);

export default useAuthStore;

import React, { useState, useEffect } from "react";
import { useAuthStore } from "./store/authStore";
import { useVideoStore } from "./store/videoStore";
import Login from "./pages/Login";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import Dashboard from "./pages/Dashboard";
import Generate from "./pages/Generate";
import History from "./pages/History";
import VideoDetails from "./pages/VideoDetails";
import SystemStatus from "./pages/SystemStatus";
import Settings from "./pages/Settings";

export default function App() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const connectSocket = useVideoStore((state) => state.connectSocket);
  const [currentPage, setCurrentPage] = useState("dashboard");
  const [selectedVideoId, setSelectedVideoId] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      connectSocket();
    }
  }, [isAuthenticated, connectSocket]);

  if (!isAuthenticated) {
    return <Login />;
  }

  // Determine current page title
  const getPageTitle = () => {
    switch (currentPage) {
      case "dashboard":
        return "Dashboard Overview";
      case "generate":
        return "Video Generator";
      case "history":
        return "Video History Manager";
      case "system":
        return "System Resources Telemetry";
      case "settings":
        return "Configurations Console";
      case "details":
        return "Project Details Inspector";
      default:
        return "ByteWire Console";
    }
  };

  const handleBackToHistory = () => {
    setCurrentPage("history");
    setSelectedVideoId(null);
  };

  const handleNavigate = (pageId) => {
    setCurrentPage(pageId);
    setSidebarOpen(false);
  };

  return (
    <div className="min-h-screen bg-black text-white flex font-sans selection:bg-white selection:text-black">
      {/* Sidebar Layout Navigation */}
      <Sidebar
        currentPage={currentPage}
        setCurrentPage={handleNavigate}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col pl-0 lg:pl-64 min-h-screen relative transition-all duration-200">
        {/* Floating Header */}
        <Header
          title={getPageTitle()}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          isSidebarOpen={sidebarOpen}
        />

        {/* Inner page scrollable viewport */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 pt-20 sm:pt-24 overflow-y-auto">
          {currentPage === "dashboard" && (
            <Dashboard
              setCurrentPage={handleNavigate}
              setSelectedVideoId={setSelectedVideoId}
            />
          )}
          {currentPage === "generate" && <Generate />}
          {currentPage === "history" && (
            <History
              setCurrentPage={handleNavigate}
              setSelectedVideoId={setSelectedVideoId}
            />
          )}
          {currentPage === "system" && <SystemStatus />}
          {currentPage === "settings" && <Settings />}
          {currentPage === "details" && (
            <VideoDetails id={selectedVideoId} onBack={handleBackToHistory} />
          )}
        </main>
      </div>
    </div>
  );
}

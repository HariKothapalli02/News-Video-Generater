import React, { useState } from "react";
import { useAuthStore } from "./store/authStore";
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
  const [currentPage, setCurrentPage] = useState("dashboard");
  const [selectedVideoId, setSelectedVideoId] = useState(null);

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

  return (
    <div className="min-h-screen bg-background text-gray-100 flex font-sans">
      {/* Sidebar Layout Navigation */}
      <Sidebar currentPage={currentPage} setCurrentPage={setCurrentPage} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col pl-64 min-h-screen relative">
        {/* Floating Header */}
        <Header title={getPageTitle()} />

        {/* Inner page scrollable viewport */}
        <main className="flex-1 p-8 pt-24 overflow-y-auto">
          {currentPage === "dashboard" && (
            <Dashboard
              setCurrentPage={setCurrentPage}
              setSelectedVideoId={setSelectedVideoId}
            />
          )}
          {currentPage === "generate" && <Generate />}
          {currentPage === "history" && (
            <History
              setCurrentPage={setCurrentPage}
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

import { useState } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import Dashboard from "@/pages/Dashboard";
import Jobs from "@/pages/Jobs";
import Insights from "@/pages/Insights";
import Storage from "@/pages/Storage";
import Clients from "@/pages/Clients";
import API from "@/pages/API";
import Settings from "@/pages/Settings";

const Index = () => {
  const [activeSection, setActiveSection] = useState("dashboard");

  const renderContent = () => {
    switch (activeSection) {
      case "dashboard":
        return <Dashboard />;
      case "jobs":
        return <Jobs />;
      case "insights":
        return <Insights />;
      case "storage":
        return <Storage />;
      case "clients":
        return <Clients />;
      case "api":
        return <API />;
      case "settings":
        return <Settings />;
      default:
        return <Dashboard />;
    }
  };

  const getHeaderInfo = () => {
    switch (activeSection) {
      case "dashboard":
        return { title: "Dashboard", subtitle: "Smart Ingestion Engine — Real-time monitoring" };
      case "jobs":
        return { title: "Jobs", subtitle: "Manage ingestion jobs" };
      case "insights":
        return { title: "Insights", subtitle: "Analyze extracted content" };
      case "storage":
        return { title: "Storage", subtitle: "Manage stored data" };
      case "clients":
        return { title: "API Clients", subtitle: "Manage external integrations" };
      case "api":
        return { title: "API Reference", subtitle: "Explore endpoints" };
      case "settings":
        return { title: "Settings", subtitle: "Configure preferences" };
      default:
        return { title: "Dashboard", subtitle: "" };
    }
  };

  const headerInfo = getHeaderInfo();

  return (
    <div className="min-h-screen bg-background">
      {/* Background Grid Pattern */}
      <div className="fixed inset-0 bg-grid-pattern bg-grid opacity-30 pointer-events-none" />
      
      {/* Ambient Glow */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-gradient-radial from-primary/10 via-transparent to-transparent pointer-events-none" />

      <Sidebar activeSection={activeSection} onSectionChange={setActiveSection} />
      
      <main className="pl-64 min-h-screen transition-all duration-300">
        <Header 
          title={headerInfo.title} 
          subtitle={headerInfo.subtitle} 
        />

        <div className="p-6">
          {renderContent()}
        </div>
      </main>
    </div>
  );
};

export default Index;
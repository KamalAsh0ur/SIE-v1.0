import { useState } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { JobsTable } from "@/components/dashboard/JobsTable";
import { PipelineFlow } from "@/components/dashboard/PipelineFlow";
import { SentimentChart } from "@/components/dashboard/SentimentChart";
import { EventStream } from "@/components/dashboard/EventStream";
import { APIReference } from "@/components/dashboard/APIReference";
import { 
  Inbox, 
  TrendingUp, 
  Database, 
  Clock,
  Cpu,
  HardDrive
} from "lucide-react";

const Index = () => {
  const [activeSection, setActiveSection] = useState("dashboard");

  return (
    <div className="min-h-screen bg-background">
      {/* Background Grid Pattern */}
      <div className="fixed inset-0 bg-grid-pattern bg-grid opacity-30 pointer-events-none" />
      
      {/* Ambient Glow */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-gradient-radial from-primary/10 via-transparent to-transparent pointer-events-none" />

      <Sidebar activeSection={activeSection} onSectionChange={setActiveSection} />
      
      <main className="pl-64 min-h-screen transition-all duration-300">
        <Header 
          title="Dashboard" 
          subtitle="Smart Ingestion Engine — Real-time monitoring" 
        />

        <div className="p-6 space-y-6">
          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatsCard
              title="Active Jobs"
              value="24"
              change={{ value: 12, trend: "up" }}
              icon={Inbox}
              delay={0}
            />
            <StatsCard
              title="Processed Today"
              value="12,847"
              change={{ value: 8, trend: "up" }}
              icon={TrendingUp}
              delay={100}
            />
            <StatsCard
              title="Avg. Process Time"
              value="287ms"
              change={{ value: 15, trend: "down" }}
              icon={Clock}
              delay={200}
            />
            <StatsCard
              title="Storage Used"
              value="2.4 TB"
              change={{ value: 3, trend: "neutral" }}
              icon={Database}
              delay={300}
            />
          </div>

          {/* Pipeline Flow */}
          <PipelineFlow />

          {/* Main Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Jobs Table - Takes 2 columns */}
            <div className="lg:col-span-2">
              <JobsTable />
            </div>

            {/* Event Stream */}
            <div className="h-[400px]">
              <EventStream />
            </div>
          </div>

          {/* Bottom Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SentimentChart />
            <APIReference />
          </div>

          {/* System Metrics Footer */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="glass-card p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
                <Cpu className="w-5 h-5 text-success" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">CPU Usage</p>
                <p className="text-lg font-semibold text-foreground">34%</p>
              </div>
            </div>
            <div className="glass-card p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <HardDrive className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Memory</p>
                <p className="text-lg font-semibold text-foreground">4.2 GB</p>
              </div>
            </div>
            <div className="glass-card p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                <Database className="w-5 h-5 text-accent" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Queue Length</p>
                <p className="text-lg font-semibold text-foreground">847</p>
              </div>
            </div>
            <div className="glass-card p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-success" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Throughput</p>
                <p className="text-lg font-semibold text-foreground">1.2k/min</p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;

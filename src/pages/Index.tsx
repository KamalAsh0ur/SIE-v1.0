import { useState } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { JobsTable } from "@/components/dashboard/JobsTable";
import { PipelineFlow } from "@/components/dashboard/PipelineFlow";
import { SentimentChart } from "@/components/dashboard/SentimentChart";
import { EventStream } from "@/components/dashboard/EventStream";
import { APIReference } from "@/components/dashboard/APIReference";
import { useDashboardStats } from "@/hooks/useDashboardData";
import { 
  Inbox, 
  TrendingUp, 
  CheckCircle,
  AlertCircle,
  Cpu,
  HardDrive
} from "lucide-react";

const Index = () => {
  const [activeSection, setActiveSection] = useState("dashboard");
  const { stats, loading } = useDashboardStats();

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
              title="Total Jobs"
              value={loading ? "..." : stats.totalJobs.toString()}
              icon={Inbox}
              delay={0}
            />
            <StatsCard
              title="Completed"
              value={loading ? "..." : stats.completedJobs.toString()}
              change={stats.totalJobs > 0 ? { value: Number(stats.successRate), trend: "up" as const } : undefined}
              icon={CheckCircle}
              delay={100}
            />
            <StatsCard
              title="Processing"
              value={loading ? "..." : stats.processingJobs.toString()}
              icon={TrendingUp}
              delay={200}
            />
            <StatsCard
              title="Failed"
              value={loading ? "..." : stats.failedJobs.toString()}
              change={stats.failedJobs > 0 ? { value: stats.failedJobs, trend: "down" as const } : undefined}
              icon={AlertCircle}
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
                <p className="text-xs text-muted-foreground">Success Rate</p>
                <p className="text-lg font-semibold text-foreground">{stats.successRate}%</p>
              </div>
            </div>
            <div className="glass-card p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <HardDrive className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Positive</p>
                <p className="text-lg font-semibold text-foreground">{stats.sentimentCounts.positive || 0}</p>
              </div>
            </div>
            <div className="glass-card p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-accent" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Negative</p>
                <p className="text-lg font-semibold text-foreground">{stats.sentimentCounts.negative || 0}</p>
              </div>
            </div>
            <div className="glass-card p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-success" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Neutral</p>
                <p className="text-lg font-semibold text-foreground">{stats.sentimentCounts.neutral || 0}</p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;
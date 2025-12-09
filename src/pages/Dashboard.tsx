import { StatsCard } from "@/components/dashboard/StatsCard";
import { JobsTable } from "@/components/dashboard/JobsTable";
import { PipelineFlow } from "@/components/dashboard/PipelineFlow";
import { SentimentChart } from "@/components/dashboard/SentimentChart";
import { EventStream } from "@/components/dashboard/EventStream";
import { APIReference } from "@/components/dashboard/APIReference";
import { useDashboardStats } from "@/hooks/useDashboardData";
import { 
  Inbox, 
  CheckCircle,
  Loader2,
  AlertCircle
} from "lucide-react";

export default function Dashboard() {
  const { stats, loading } = useDashboardStats();

  return (
    <div className="space-y-6">
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
          icon={Loader2}
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
    </div>
  );
}
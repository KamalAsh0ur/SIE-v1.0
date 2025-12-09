import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { ArrowRight, CheckCircle2, Loader2, Circle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface PipelineStep {
  id: string;
  name: string;
  status: "complete" | "processing" | "pending";
  count: number;
}

const statusIcon = {
  complete: <CheckCircle2 className="w-5 h-5 text-success" />,
  processing: <Loader2 className="w-5 h-5 text-primary animate-spin" />,
  pending: <Circle className="w-5 h-5 text-muted-foreground" />,
};

export const PipelineFlow = () => {
  const [steps, setSteps] = useState<PipelineStep[]>([
    { id: "pending", name: "Pending", status: "pending", count: 0 },
    { id: "ingesting", name: "Ingesting", status: "pending", count: 0 },
    { id: "processing", name: "Processing", status: "pending", count: 0 },
    { id: "enriching", name: "Enriching", status: "pending", count: 0 },
    { id: "completed", name: "Completed", status: "pending", count: 0 },
  ]);
  const [totalJobs, setTotalJobs] = useState(0);
  const [completedJobs, setCompletedJobs] = useState(0);

  useEffect(() => {
    const fetchPipelineStats = async () => {
      const { data: jobs } = await supabase
        .from('ingestion_jobs')
        .select('status');

      if (jobs) {
        const statusCounts: Record<string, number> = {
          pending: 0,
          ingesting: 0,
          processing: 0,
          enriching: 0,
          completed: 0,
          failed: 0,
        };

        jobs.forEach(job => {
          statusCounts[job.status] = (statusCounts[job.status] || 0) + 1;
        });

        const newSteps: PipelineStep[] = [
          { 
            id: "pending", 
            name: "Pending", 
            status: statusCounts.pending > 0 ? "processing" : (statusCounts.ingesting > 0 || statusCounts.processing > 0 ? "complete" : "pending"),
            count: statusCounts.pending 
          },
          { 
            id: "ingesting", 
            name: "Ingesting", 
            status: statusCounts.ingesting > 0 ? "processing" : (statusCounts.processing > 0 || statusCounts.enriching > 0 || statusCounts.completed > 0 ? "complete" : "pending"),
            count: statusCounts.ingesting 
          },
          { 
            id: "processing", 
            name: "Processing", 
            status: statusCounts.processing > 0 ? "processing" : (statusCounts.enriching > 0 || statusCounts.completed > 0 ? "complete" : "pending"),
            count: statusCounts.processing 
          },
          { 
            id: "enriching", 
            name: "Enriching", 
            status: statusCounts.enriching > 0 ? "processing" : (statusCounts.completed > 0 ? "complete" : "pending"),
            count: statusCounts.enriching 
          },
          { 
            id: "completed", 
            name: "Completed", 
            status: statusCounts.completed > 0 ? "complete" : "pending",
            count: statusCounts.completed 
          },
        ];

        setSteps(newSteps);
        setTotalJobs(jobs.length);
        setCompletedJobs(statusCounts.completed);
      }
    };

    fetchPipelineStats();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('pipeline-flow-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ingestion_jobs' },
        () => fetchPipelineStats()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const progressPercent = totalJobs > 0 ? Math.round((completedJobs / totalJobs) * 100) : 0;

  return (
    <div className="glass-card p-6">
      <div className="mb-6">
        <h3 className="font-semibold text-foreground">Processing Pipeline</h3>
        <p className="text-xs text-muted-foreground mt-1">Real-time data flow through SIE stages</p>
      </div>

      <div className="flex items-center justify-between overflow-x-auto pb-2 scrollbar-thin">
        {steps.map((step, index) => (
          <div key={step.id} className="flex items-center">
            <div 
              className={cn(
                "flex flex-col items-center min-w-[100px] transition-all duration-300",
                step.status === "processing" && "scale-105"
              )}
            >
              <div className={cn(
                "w-12 h-12 rounded-xl flex items-center justify-center mb-2 transition-all",
                step.status === "complete" && "bg-success/10 border border-success/30",
                step.status === "processing" && "bg-primary/10 border border-primary/30 shadow-lg shadow-primary/20",
                step.status === "pending" && "bg-muted border border-border"
              )}>
                {statusIcon[step.status]}
              </div>
              
              <span className={cn(
                "text-xs font-medium text-center",
                step.status === "complete" && "text-success",
                step.status === "processing" && "text-primary",
                step.status === "pending" && "text-muted-foreground"
              )}>
                {step.name}
              </span>
              
              <span className="text-[10px] text-muted-foreground mt-0.5">
                {step.count} {step.count === 1 ? 'job' : 'jobs'}
              </span>
            </div>

            {index < steps.length - 1 && (
              <ArrowRight className={cn(
                "w-4 h-4 mx-2 flex-shrink-0 transition-colors",
                steps[index + 1].status !== "pending" ? "text-primary" : "text-muted-foreground/50"
              )} />
            )}
          </div>
        ))}
      </div>

      {/* Progress Bar */}
      <div className="mt-6">
        <div className="flex justify-between text-xs mb-2">
          <span className="text-muted-foreground">Completion Rate</span>
          <span className="text-primary font-medium">{progressPercent}%</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-primary to-blue-500 rounded-full transition-all duration-1000"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          {completedJobs} of {totalJobs} jobs completed
        </p>
      </div>
    </div>
  );
};
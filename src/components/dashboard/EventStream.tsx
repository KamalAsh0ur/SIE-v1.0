import { cn } from "@/lib/utils";
import { Zap, CheckCircle, AlertCircle, Clock, ArrowUpRight, Loader2 } from "lucide-react";
import { usePipelineEvents } from "@/hooks/useDashboardData";
import { formatDistanceToNow } from "date-fns";

const eventIcons: Record<string, typeof Clock> = {
  "job_created": Clock,
  "status_change": ArrowUpRight,
  "job_completed": CheckCircle,
  "job_failed": AlertCircle,
};

const eventColors: Record<string, string> = {
  "job_created": "text-primary border-primary/30 bg-primary/10",
  "status_change": "text-accent border-accent/30 bg-accent/10",
  "job_completed": "text-success border-success/30 bg-success/10",
  "job_failed": "text-destructive border-destructive/30 bg-destructive/10",
};

const stageLabels: Record<string, string> = {
  "ingestion": "Ingesting",
  "processing": "Processing",
  "enrichment": "Enriching",
  "completed": "Completed",
  "error": "Error",
};

export const EventStream = () => {
  const { events, loading } = usePipelineEvents();

  if (loading) {
    return (
      <div className="glass-card h-full flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
        <span className="ml-2 text-muted-foreground text-sm">Loading events...</span>
      </div>
    );
  }

  return (
    <div className="glass-card h-full flex flex-col">
      <div className="p-4 border-b border-border flex items-center gap-2">
        <Zap className="w-4 h-4 text-primary" />
        <h3 className="font-semibold text-foreground">Event Stream</h3>
        <span className="ml-auto flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
          <span className="text-xs text-muted-foreground">Live</span>
        </span>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-2">
        {events.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm py-8">
            No events yet. Submit a job to see pipeline events.
          </div>
        ) : (
          events.map((event, index) => {
            const Icon = eventIcons[event.event_type] || ArrowUpRight;
            const colorClass = eventColors[event.event_type] || "text-muted-foreground border-border bg-muted/20";
            
            return (
              <div
                key={event.id}
                className={cn(
                  "p-3 rounded-lg border transition-all duration-300 animate-slide-in-right",
                  colorClass
                )}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="flex items-start gap-3">
                  <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{event.message}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {event.job_id && (
                        <code className="text-[10px] font-mono opacity-70">{event.job_id.slice(0, 8)}</code>
                      )}
                      <span className="text-[10px] opacity-70 px-1.5 py-0.5 rounded bg-background/50">
                        {stageLabels[event.stage] || event.stage}
                      </span>
                      <span className="text-[10px] opacity-60">
                        {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
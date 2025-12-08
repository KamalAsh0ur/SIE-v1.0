import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Zap, CheckCircle, AlertCircle, Clock, ArrowUpRight } from "lucide-react";

interface StreamEvent {
  id: string;
  type: "job.accepted" | "partial_result" | "complete" | "error";
  message: string;
  timestamp: Date;
  jobId?: string;
}

const eventIcons = {
  "job.accepted": Clock,
  "partial_result": ArrowUpRight,
  "complete": CheckCircle,
  "error": AlertCircle,
};

const eventColors = {
  "job.accepted": "text-primary border-primary/30 bg-primary/10",
  "partial_result": "text-accent border-accent/30 bg-accent/10",
  "complete": "text-success border-success/30 bg-success/10",
  "error": "text-destructive border-destructive/30 bg-destructive/10",
};

export const EventStream = () => {
  const [events, setEvents] = useState<StreamEvent[]>([
    { id: "1", type: "complete", message: "Job job_8a7f3c completed successfully", timestamp: new Date(Date.now() - 120000), jobId: "job_8a7f3c" },
    { id: "2", type: "partial_result", message: "Processing batch 5/8 for job_2b9d4e", timestamp: new Date(Date.now() - 60000), jobId: "job_2b9d4e" },
    { id: "3", type: "job.accepted", message: "New ingestion job queued: job_5c1e6f", timestamp: new Date(Date.now() - 30000), jobId: "job_5c1e6f" },
    { id: "4", type: "error", message: "Rate limit exceeded for meta_api scraper", timestamp: new Date(Date.now() - 15000) },
  ]);

  // Simulate new events
  useEffect(() => {
    const interval = setInterval(() => {
      const eventTypes: StreamEvent["type"][] = ["job.accepted", "partial_result", "complete"];
      const randomType = eventTypes[Math.floor(Math.random() * eventTypes.length)];
      const messages = {
        "job.accepted": "New ingestion job queued",
        "partial_result": "Processing batch data",
        "complete": "Job completed successfully",
        "error": "Processing error detected",
      };

      const newEvent: StreamEvent = {
        id: Date.now().toString(),
        type: randomType,
        message: messages[randomType],
        timestamp: new Date(),
        jobId: `job_${Math.random().toString(36).substring(2, 8)}`,
      };

      setEvents((prev) => [newEvent, ...prev.slice(0, 9)]);
    }, 8000);

    return () => clearInterval(interval);
  }, []);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

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
        {events.map((event, index) => {
          const Icon = eventIcons[event.type];
          return (
            <div
              key={event.id}
              className={cn(
                "p-3 rounded-lg border transition-all duration-300 animate-slide-in-right",
                eventColors[event.type]
              )}
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className="flex items-start gap-3">
                <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{event.message}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {event.jobId && (
                      <code className="text-[10px] font-mono opacity-70">{event.jobId}</code>
                    )}
                    <span className="text-[10px] opacity-60">{formatTime(event.timestamp)}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

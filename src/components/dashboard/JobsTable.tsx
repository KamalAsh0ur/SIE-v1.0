import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye, RotateCcw, Trash2 } from "lucide-react";

interface Job {
  id: string;
  source: string;
  status: "queued" | "processing" | "complete" | "error";
  items: number;
  created: string;
  priority: "low" | "normal" | "high";
}

const mockJobs: Job[] = [
  { id: "job_8a7f3c", source: "meta_api", status: "complete", items: 1247, created: "2 min ago", priority: "high" },
  { id: "job_2b9d4e", source: "youtube_api", status: "processing", items: 892, created: "5 min ago", priority: "normal" },
  { id: "job_5c1e6f", source: "scraped", status: "queued", items: 0, created: "8 min ago", priority: "low" },
  { id: "job_9d3f7g", source: "meta_api", status: "error", items: 156, created: "12 min ago", priority: "high" },
  { id: "job_4e2h8i", source: "youtube_api", status: "complete", items: 2341, created: "15 min ago", priority: "normal" },
];

const statusVariant: Record<Job["status"], "status" | "processing" | "success" | "error"> = {
  queued: "status",
  processing: "processing",
  complete: "success",
  error: "error",
};

const priorityColors: Record<Job["priority"], string> = {
  low: "text-muted-foreground",
  normal: "text-foreground",
  high: "text-accent",
};

export const JobsTable = () => {
  return (
    <div className="glass-card overflow-hidden">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-foreground">Recent Jobs</h3>
          <p className="text-xs text-muted-foreground">Latest ingestion jobs and their status</p>
        </div>
        <Button variant="outline" size="sm">View All</Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Job ID</th>
              <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Source</th>
              <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Status</th>
              <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Items</th>
              <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Priority</th>
              <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Created</th>
              <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {mockJobs.map((job, index) => (
              <tr 
                key={job.id} 
                className="hover:bg-muted/20 transition-colors animate-fade-in"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <td className="px-4 py-3">
                  <code className="text-xs font-mono text-primary">{job.id}</code>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-foreground">{job.source}</span>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={statusVariant[job.status]} className="capitalize">
                    {job.status}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-foreground font-medium">{job.items.toLocaleString()}</span>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-sm font-medium capitalize ${priorityColors[job.priority]}`}>
                    {job.priority}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-muted-foreground">{job.created}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                      <RotateCcw className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

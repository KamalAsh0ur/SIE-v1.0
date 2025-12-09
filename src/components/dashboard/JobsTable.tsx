import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye, RotateCcw, Loader2, ExternalLink } from "lucide-react";
import { useJobs } from "@/hooks/useDashboardData";
import { IngestionJob } from "@/lib/api";
import { formatDistanceToNow } from "date-fns";

const statusVariant: Record<IngestionJob["status"], "status" | "processing" | "success" | "error"> = {
  pending: "status",
  ingesting: "processing",
  processing: "processing",
  enriching: "processing",
  completed: "success",
  failed: "error",
};

const priorityColors: Record<number, string> = {
  1: "text-muted-foreground",
  2: "text-muted-foreground",
  3: "text-muted-foreground",
  4: "text-muted-foreground",
  5: "text-foreground",
  6: "text-foreground",
  7: "text-accent",
  8: "text-accent",
  9: "text-accent",
  10: "text-accent",
};

const getPriorityLabel = (priority: number): string => {
  if (priority <= 3) return "low";
  if (priority <= 6) return "normal";
  return "high";
};

export const JobsTable = () => {
  const { jobs, loading, error, refetch } = useJobs();

  const formatUrl = (url: string): string => {
    try {
      const parsed = new URL(url);
      return parsed.hostname.replace('www.', '');
    } catch {
      return url.slice(0, 30);
    }
  };

  if (loading) {
    return (
      <div className="glass-card p-8 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="ml-2 text-muted-foreground">Loading jobs...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-card p-8 text-center">
        <p className="text-destructive mb-4">{error}</p>
        <Button variant="outline" onClick={refetch}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="glass-card overflow-hidden">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-foreground">Recent Jobs</h3>
          <p className="text-xs text-muted-foreground">Latest ingestion jobs and their status</p>
        </div>
        <Button variant="outline" size="sm" onClick={refetch}>
          <RotateCcw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {jobs.length === 0 ? (
        <div className="p-8 text-center text-muted-foreground">
          <p>No jobs yet. Submit a URL to start scraping.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Job ID</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Source</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Platform</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Status</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Progress</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Priority</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Created</th>
                <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {jobs.map((job, index) => (
                <tr 
                  key={job.id} 
                  className="hover:bg-muted/20 transition-colors animate-fade-in"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <td className="px-4 py-3">
                    <code className="text-xs font-mono text-primary">{job.id.slice(0, 8)}</code>
                  </td>
                  <td className="px-4 py-3">
                    <a 
                      href={job.source_url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-sm text-foreground hover:text-primary flex items-center gap-1"
                    >
                      {formatUrl(job.source_url)}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-foreground capitalize">{job.platform}</span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={statusVariant[job.status]} className="capitalize">
                      {job.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-primary transition-all duration-500"
                          style={{ width: `${job.progress || 0}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">{job.progress || 0}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-sm font-medium capitalize ${priorityColors[job.priority] || 'text-foreground'}`}>
                      {getPriorityLabel(job.priority)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                        <Eye className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
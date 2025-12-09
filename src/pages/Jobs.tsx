import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Eye, RotateCcw, Loader2, ExternalLink, Search, Plus, Filter } from "lucide-react";
import { useJobs } from "@/hooks/useDashboardData";
import { IngestionJob, submitIngestionJob } from "@/lib/api";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

const statusVariant: Record<IngestionJob["status"], "status" | "processing" | "success" | "error"> = {
  pending: "status",
  ingesting: "processing",
  processing: "processing",
  enriching: "processing",
  completed: "success",
  failed: "error",
};

const priorityColors: Record<number, string> = {
  1: "text-muted-foreground", 2: "text-muted-foreground", 3: "text-muted-foreground",
  4: "text-muted-foreground", 5: "text-foreground", 6: "text-foreground",
  7: "text-accent", 8: "text-accent", 9: "text-accent", 10: "text-accent",
};

const getPriorityLabel = (priority: number): string => {
  if (priority <= 3) return "low";
  if (priority <= 6) return "normal";
  return "high";
};

export default function Jobs() {
  const { jobs, loading, error, refetch } = useJobs();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newJobUrl, setNewJobUrl] = useState("");
  const [newJobPriority, setNewJobPriority] = useState("5");

  const filteredJobs = jobs.filter(job => {
    const matchesSearch = job.source_url.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || job.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleSubmitJob = async () => {
    if (!newJobUrl.trim()) {
      toast.error("Please enter a URL");
      return;
    }

    try {
      new URL(newJobUrl);
    } catch {
      toast.error("Please enter a valid URL");
      return;
    }

    setIsSubmitting(true);
    const result = await submitIngestionJob({
      source_url: newJobUrl.trim(),
      priority: parseInt(newJobPriority),
    });

    if (result.success) {
      toast.success("Job submitted successfully");
      setNewJobUrl("");
      setDialogOpen(false);
      refetch();
    } else {
      toast.error(result.error || "Failed to submit job");
    }
    setIsSubmitting(false);
  };

  const formatUrl = (url: string): string => {
    try {
      const parsed = new URL(url);
      return parsed.hostname.replace('www.', '') + parsed.pathname.slice(0, 30);
    } catch {
      return url.slice(0, 40);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Jobs</h1>
          <p className="text-sm text-muted-foreground">Manage and monitor ingestion jobs</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              New Job
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Submit New Ingestion Job</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="url">URL to scrape</Label>
                <Input
                  id="url"
                  type="url"
                  placeholder="https://example.com/article"
                  value={newJobUrl}
                  onChange={(e) => setNewJobUrl(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="priority">Priority</Label>
                <Select value={newJobPriority} onValueChange={setNewJobPriority}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Low (1)</SelectItem>
                    <SelectItem value="3">Low (3)</SelectItem>
                    <SelectItem value="5">Normal (5)</SelectItem>
                    <SelectItem value="7">High (7)</SelectItem>
                    <SelectItem value="10">Critical (10)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button 
                onClick={handleSubmitJob} 
                disabled={isSubmitting} 
                className="w-full"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  "Submit Job"
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="glass-card p-4 flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by URL or Job ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="ingesting">Ingesting</SelectItem>
              <SelectItem value="processing">Processing</SelectItem>
              <SelectItem value="enriching">Enriching</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={refetch}>
            <RotateCcw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Jobs Table */}
      <div className="glass-card overflow-hidden">
        {loading ? (
          <div className="p-8 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="ml-2 text-muted-foreground">Loading jobs...</span>
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <p className="text-destructive mb-4">{error}</p>
            <Button variant="outline" onClick={refetch}>Retry</Button>
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            {jobs.length === 0 ? (
              <div>
                <p className="mb-4">No jobs yet. Submit a URL to start scraping.</p>
                <Button onClick={() => setDialogOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create First Job
                </Button>
              </div>
            ) : (
              <p>No jobs match your filters.</p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Job ID</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Source URL</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Platform</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Status</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Progress</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Priority</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Created</th>
                  <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredJobs.map((job, index) => (
                  <tr 
                    key={job.id} 
                    className="hover:bg-muted/20 transition-colors animate-fade-in"
                    style={{ animationDelay: `${index * 30}ms` }}
                  >
                    <td className="px-4 py-3">
                      <code className="text-xs font-mono text-primary">{job.id.slice(0, 8)}</code>
                    </td>
                    <td className="px-4 py-3 max-w-[300px]">
                      <a 
                        href={job.source_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-sm text-foreground hover:text-primary flex items-center gap-1 truncate"
                        title={job.source_url}
                      >
                        {formatUrl(job.source_url)}
                        <ExternalLink className="w-3 h-3 flex-shrink-0" />
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
                        <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-primary transition-all duration-500"
                            style={{ width: `${job.progress || 0}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground w-8">{job.progress || 0}%</span>
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
    </div>
  );
}
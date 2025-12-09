import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Database, FileText, HardDrive, Trash2, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

interface StorageStats {
  totalJobs: number;
  totalInsights: number;
  totalEvents: number;
  contentSize: number;
}

export default function Storage() {
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [recentContent, setRecentContent] = useState<Array<{
    id: string;
    source_url: string;
    platform: string;
    raw_content: string | null;
    created_at: string;
  }>>([]);
  const [loading, setLoading] = useState(true);

  const fetchStorageData = async () => {
    setLoading(true);
    
    // Get counts
    const [jobsRes, insightsRes, eventsRes, contentRes] = await Promise.all([
      supabase.from('ingestion_jobs').select('*', { count: 'exact', head: true }),
      supabase.from('insights').select('*', { count: 'exact', head: true }),
      supabase.from('pipeline_events').select('*', { count: 'exact', head: true }),
      supabase.from('ingestion_jobs').select('id, source_url, platform, raw_content, created_at')
        .not('raw_content', 'is', null)
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    // Calculate approximate content size
    let contentSize = 0;
    if (contentRes.data) {
      contentRes.data.forEach(job => {
        if (job.raw_content) {
          contentSize += new Blob([job.raw_content]).size;
        }
      });
    }

    setStats({
      totalJobs: jobsRes.count || 0,
      totalInsights: insightsRes.count || 0,
      totalEvents: eventsRes.count || 0,
      contentSize,
    });

    setRecentContent(contentRes.data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchStorageData();
  }, []);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const clearOldEvents = async () => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { error } = await supabase
      .from('pipeline_events')
      .delete()
      .lt('created_at', thirtyDaysAgo.toISOString());

    if (error) {
      toast.error("Failed to clear old events");
    } else {
      toast.success("Old events cleared");
      fetchStorageData();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="ml-2 text-muted-foreground">Loading storage data...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Storage</h1>
          <p className="text-sm text-muted-foreground">Manage stored content and data</p>
        </div>
        <Button variant="outline" onClick={fetchStorageData}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass-card p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Database className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{stats?.totalJobs || 0}</p>
              <p className="text-xs text-muted-foreground">Total Jobs</p>
            </div>
          </div>
        </div>

        <div className="glass-card p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
              <FileText className="w-5 h-5 text-success" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{stats?.totalInsights || 0}</p>
              <p className="text-xs text-muted-foreground">Insights</p>
            </div>
          </div>
        </div>

        <div className="glass-card p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
              <HardDrive className="w-5 h-5 text-accent" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{stats?.totalEvents || 0}</p>
              <p className="text-xs text-muted-foreground">Events</p>
            </div>
          </div>
        </div>

        <div className="glass-card p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Database className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{formatBytes(stats?.contentSize || 0)}</p>
              <p className="text-xs text-muted-foreground">Content Size</p>
            </div>
          </div>
        </div>
      </div>

      {/* Data Management */}
      <div className="glass-card p-6">
        <h3 className="font-semibold text-foreground mb-4">Data Management</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
            <div>
              <p className="text-sm font-medium text-foreground">Pipeline Events</p>
              <p className="text-xs text-muted-foreground">{stats?.totalEvents || 0} events stored</p>
            </div>
            <Button variant="outline" size="sm" onClick={clearOldEvents}>
              <Trash2 className="w-4 h-4 mr-2" />
              Clear 30+ Days
            </Button>
          </div>
        </div>
      </div>

      {/* Recent Scraped Content */}
      <div className="glass-card p-6">
        <h3 className="font-semibold text-foreground mb-4">Recent Scraped Content</h3>
        {recentContent.length === 0 ? (
          <p className="text-muted-foreground text-sm">No scraped content yet.</p>
        ) : (
          <div className="space-y-3">
            {recentContent.map((item) => (
              <div key={item.id} className="p-3 rounded-lg bg-muted/30 border border-border">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="capitalize text-xs">
                      {item.platform}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {item.raw_content ? formatBytes(new Blob([item.raw_content]).size) : '0 B'}
                  </span>
                </div>
                <a 
                  href={item.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline truncate block"
                >
                  {item.source_url}
                </a>
                {item.raw_content && (
                  <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                    {item.raw_content.slice(0, 200)}...
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
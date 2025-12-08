import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Copy, Check } from "lucide-react";
import { useState } from "react";

interface Endpoint {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  description: string;
}

const endpoints: Endpoint[] = [
  { method: "POST", path: "/ingest", description: "Submit ingestion jobs" },
  { method: "GET", path: "/insights/:job_id", description: "Retrieve processed insights" },
  { method: "GET", path: "/jobs/:job_id/status", description: "Check job status" },
  { method: "GET", path: "/events/stream", description: "SSE event subscription" },
];

const methodColors = {
  GET: "bg-success/10 text-success border-success/30",
  POST: "bg-primary/10 text-primary border-primary/30",
  PUT: "bg-accent/10 text-accent border-accent/30",
  DELETE: "bg-destructive/10 text-destructive border-destructive/30",
};

export const APIReference = () => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="glass-card p-6">
      <div className="mb-4">
        <h3 className="font-semibold text-foreground">API Endpoints</h3>
        <p className="text-xs text-muted-foreground mt-1">Quick reference for SIE API</p>
      </div>

      <div className="space-y-2">
        {endpoints.map((endpoint, index) => (
          <div
            key={index}
            className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border hover:border-primary/30 transition-colors group"
          >
            <Badge className={cn("text-[10px] uppercase font-bold px-2", methodColors[endpoint.method])}>
              {endpoint.method}
            </Badge>
            <code className="text-sm font-mono text-foreground flex-1">{endpoint.path}</code>
            <span className="text-xs text-muted-foreground hidden sm:block">{endpoint.description}</span>
            <button
              onClick={() => copyToClipboard(endpoint.path, index)}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-muted rounded"
            >
              {copiedIndex === index ? (
                <Check className="w-4 h-4 text-success" />
              ) : (
                <Copy className="w-4 h-4 text-muted-foreground" />
              )}
            </button>
          </div>
        ))}
      </div>

      {/* API Key Info */}
      <div className="mt-4 p-3 rounded-lg bg-primary/5 border border-primary/20">
        <p className="text-xs text-muted-foreground">
          <span className="text-primary font-medium">Authentication:</span> Bearer token required for all endpoints.
        </p>
      </div>
    </div>
  );
};

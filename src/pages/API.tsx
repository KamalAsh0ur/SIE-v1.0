import { useState } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy, Check, Code2, Play, Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

interface Endpoint {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  description: string;
  requestBody?: string;
  responseExample?: string;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

const endpoints: Endpoint[] = [
  { 
    method: "POST", 
    path: "/functions/v1/ingest", 
    description: "Submit a new ingestion job for web scraping",
    requestBody: `{
  "source_url": "https://example.com/article",
  "platform": "news",
  "priority": 5,
  "metadata": {}
}`,
    responseExample: `{
  "success": true,
  "job_id": "uuid-here",
  "status": "pending",
  "message": "Ingestion job queued successfully"
}`
  },
  { 
    method: "GET", 
    path: "/functions/v1/jobs", 
    description: "List all ingestion jobs with optional filtering",
    responseExample: `{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}`
  },
  { 
    method: "GET", 
    path: "/functions/v1/insights", 
    description: "Retrieve processed insights and sentiment analysis",
    responseExample: `{
  "success": true,
  "data": [{
    "id": "uuid",
    "sentiment": "positive",
    "sentiment_score": 0.85,
    "keywords": ["tech", "innovation"],
    "summary": "..."
  }]
}`
  },
  { 
    method: "GET", 
    path: "/functions/v1/events", 
    description: "Get pipeline events (SSE stream available)",
    responseExample: `{
  "success": true,
  "data": [{
    "id": "uuid",
    "event_type": "job_completed",
    "stage": "completed",
    "message": "Job completed successfully"
  }]
}`
  },
];

const methodColors = {
  GET: "bg-success/10 text-success border-success/30",
  POST: "bg-primary/10 text-primary border-primary/30",
  PUT: "bg-accent/10 text-accent border-accent/30",
  DELETE: "bg-destructive/10 text-destructive border-destructive/30",
};

export default function API() {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [selectedEndpoint, setSelectedEndpoint] = useState<Endpoint>(endpoints[0]);
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState<string | null>(null);

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const testEndpoint = async () => {
    setIsLoading(true);
    setResponse(null);

    try {
      const url = `${SUPABASE_URL}${selectedEndpoint.path}`;
      const options: RequestInit = {
        method: selectedEndpoint.method,
        headers: {
          "Content-Type": "application/json",
        },
      };

      if (selectedEndpoint.requestBody && selectedEndpoint.method === "POST") {
        options.body = selectedEndpoint.requestBody;
      }

      const res = await fetch(url, options);
      const data = await res.json();
      setResponse(JSON.stringify(data, null, 2));
    } catch (error) {
      setResponse(JSON.stringify({ error: "Request failed", details: String(error) }, null, 2));
    }

    setIsLoading(false);
  };

  const curlExample = `curl -X ${selectedEndpoint.method} \\
  "${SUPABASE_URL}${selectedEndpoint.path}" \\
  -H "Content-Type: application/json"${selectedEndpoint.requestBody ? ` \\
  -d '${selectedEndpoint.requestBody.replace(/\n/g, "").replace(/\s+/g, " ")}'` : ""}`;

  const jsExample = `const response = await fetch(
  "${SUPABASE_URL}${selectedEndpoint.path}",
  {
    method: "${selectedEndpoint.method}",
    headers: { "Content-Type": "application/json" }${selectedEndpoint.requestBody ? `,
    body: JSON.stringify(${selectedEndpoint.requestBody.replace(/\n/g, "").replace(/\s+/g, " ")})` : ""}
  }
);
const data = await response.json();`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">API Reference</h1>
        <p className="text-sm text-muted-foreground">Explore and test the SIE API endpoints</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Endpoints List */}
        <div className="lg:col-span-1 space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Endpoints</h3>
          {endpoints.map((endpoint, index) => (
            <button
              key={index}
              onClick={() => {
                setSelectedEndpoint(endpoint);
                setResponse(null);
              }}
              className={cn(
                "w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left",
                selectedEndpoint === endpoint
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50 bg-card"
              )}
            >
              <Badge className={cn("text-[10px] uppercase font-bold px-2", methodColors[endpoint.method])}>
                {endpoint.method}
              </Badge>
              <div className="flex-1 min-w-0">
                <code className="text-xs font-mono text-foreground truncate block">{endpoint.path}</code>
                <p className="text-xs text-muted-foreground truncate">{endpoint.description}</p>
              </div>
            </button>
          ))}
        </div>

        {/* Endpoint Details */}
        <div className="lg:col-span-2 space-y-4">
          <div className="glass-card p-5">
            <div className="flex items-center gap-3 mb-4">
              <Badge className={cn("text-xs uppercase font-bold", methodColors[selectedEndpoint.method])}>
                {selectedEndpoint.method}
              </Badge>
              <code className="text-sm font-mono text-foreground">{selectedEndpoint.path}</code>
            </div>
            <p className="text-sm text-muted-foreground mb-4">{selectedEndpoint.description}</p>
            
            <Button onClick={testEndpoint} disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Test Endpoint
                </>
              )}
            </Button>
          </div>

          {/* Code Examples */}
          <Tabs defaultValue="curl" className="glass-card p-5">
            <TabsList className="mb-4">
              <TabsTrigger value="curl">cURL</TabsTrigger>
              <TabsTrigger value="javascript">JavaScript</TabsTrigger>
              {selectedEndpoint.requestBody && <TabsTrigger value="body">Request Body</TabsTrigger>}
              <TabsTrigger value="response">Response</TabsTrigger>
            </TabsList>

            <TabsContent value="curl">
              <div className="relative">
                <pre className="bg-muted/50 p-4 rounded-lg overflow-x-auto text-xs font-mono text-foreground">
                  {curlExample}
                </pre>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-2 right-2"
                  onClick={() => copyToClipboard(curlExample, 100)}
                >
                  {copiedIndex === 100 ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="javascript">
              <div className="relative">
                <pre className="bg-muted/50 p-4 rounded-lg overflow-x-auto text-xs font-mono text-foreground">
                  {jsExample}
                </pre>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-2 right-2"
                  onClick={() => copyToClipboard(jsExample, 101)}
                >
                  {copiedIndex === 101 ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </TabsContent>

            {selectedEndpoint.requestBody && (
              <TabsContent value="body">
                <pre className="bg-muted/50 p-4 rounded-lg overflow-x-auto text-xs font-mono text-foreground">
                  {selectedEndpoint.requestBody}
                </pre>
              </TabsContent>
            )}

            <TabsContent value="response">
              <pre className="bg-muted/50 p-4 rounded-lg overflow-x-auto text-xs font-mono text-foreground max-h-[300px]">
                {response || selectedEndpoint.responseExample || "Test the endpoint to see a response"}
              </pre>
            </TabsContent>
          </Tabs>

          {/* Base URL Info */}
          <div className="glass-card p-4 flex items-center gap-3">
            <Code2 className="w-5 h-5 text-primary" />
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">Base URL</p>
              <code className="text-sm font-mono text-foreground">{SUPABASE_URL}</code>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => copyToClipboard(SUPABASE_URL, 102)}
            >
              {copiedIndex === 102 ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
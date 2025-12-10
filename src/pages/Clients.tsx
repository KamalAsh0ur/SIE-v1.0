import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Copy, Plus, Trash2, Key, Activity, Shield, Globe } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

interface ApiClient {
  id: string;
  name: string;
  api_key: string;
  description: string | null;
  is_active: boolean;
  rate_limit_per_minute: number;
  allowed_endpoints: string[];
  webhook_url: string | null;
  created_at: string;
}

export default function Clients() {
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newClient, setNewClient] = useState({ name: "", description: "", webhook_url: "" });

  const { data: clients, isLoading } = useQuery({
    queryKey: ["api-clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("api_clients")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ApiClient[];
    },
  });

  const { data: usageStats } = useQuery({
    queryKey: ["api-usage-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("api_usage_logs")
        .select("client_id, endpoint")
        .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
      if (error) throw error;
      return data;
    },
  });

  const createClient = useMutation({
    mutationFn: async (client: { name: string; description: string; webhook_url: string }) => {
      const { data, error } = await supabase
        .from("api_clients")
        .insert({
          name: client.name,
          description: client.description || null,
          webhook_url: client.webhook_url || null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-clients"] });
      setIsCreateOpen(false);
      setNewClient({ name: "", description: "", webhook_url: "" });
      toast.success("API client created successfully");
    },
    onError: (error) => {
      toast.error("Failed to create client: " + error.message);
    },
  });

  const toggleClient = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("api_clients")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-clients"] });
      toast.success("Client status updated");
    },
  });

  const deleteClient = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("api_clients").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-clients"] });
      toast.success("Client deleted");
    },
  });

  const copyApiKey = (key: string) => {
    navigator.clipboard.writeText(key);
    toast.success("API key copied to clipboard");
  };

  const getClientUsage = (clientId: string) => {
    return usageStats?.filter((u) => u.client_id === clientId).length || 0;
  };

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-background">
      <div className="flex-1 p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">API Clients</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Manage external applications connecting to SIE
            </p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                New Client
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create API Client</DialogTitle>
                <DialogDescription>
                  Create a new API client for external application integration
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Client Name</Label>
                  <Input
                    id="name"
                    placeholder="My Application"
                    value={newClient.name}
                    onChange={(e) => setNewClient({ ...newClient, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    placeholder="Describe what this client is used for..."
                    value={newClient.description}
                    onChange={(e) => setNewClient({ ...newClient, description: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="webhook">Webhook URL (optional)</Label>
                  <Input
                    id="webhook"
                    placeholder="https://your-app.com/webhook"
                    value={newClient.webhook_url}
                    onChange={(e) => setNewClient({ ...newClient, webhook_url: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => createClient.mutate(newClient)}
                  disabled={!newClient.name || createClient.isPending}
                >
                  Create Client
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="glass-card">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Key className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{clients?.length || 0}</p>
                  <p className="text-xs text-muted-foreground">Total Clients</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-success/10">
                  <Shield className="w-5 h-5 text-success" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {clients?.filter((c) => c.is_active).length || 0}
                  </p>
                  <p className="text-xs text-muted-foreground">Active Clients</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-warning/10">
                  <Activity className="w-5 h-5 text-warning" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{usageStats?.length || 0}</p>
                  <p className="text-xs text-muted-foreground">Requests (24h)</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Clients List */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-lg">Registered Clients</CardTitle>
            <CardDescription>
              External applications with API access to SIE
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : clients?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Globe className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No API clients registered yet</p>
                <p className="text-sm">Create your first client to get started</p>
              </div>
            ) : (
              <div className="space-y-4">
                {clients?.map((client) => (
                  <div
                    key={client.id}
                    className="p-4 rounded-lg border border-border bg-muted/30 space-y-3"
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-foreground">{client.name}</h3>
                          <Badge variant={client.is_active ? "default" : "secondary"}>
                            {client.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                        {client.description && (
                          <p className="text-sm text-muted-foreground">{client.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={client.is_active}
                          onCheckedChange={(checked) =>
                            toggleClient.mutate({ id: client.id, is_active: checked })
                          }
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteClient.mutate(client.id)}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 p-2 rounded bg-background/50 font-mono text-sm">
                      <Key className="w-4 h-4 text-muted-foreground" />
                      <code className="flex-1 truncate">{client.api_key}</code>
                      <Button variant="ghost" size="sm" onClick={() => copyApiKey(client.api_key)}>
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>

                    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                      <span>Rate: {client.rate_limit_per_minute} req/min</span>
                      <span>Endpoints: {client.allowed_endpoints.join(", ")}</span>
                      <span>Requests (24h): {getClientUsage(client.id)}</span>
                      {client.webhook_url && <span>Webhook: {client.webhook_url}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* API Usage Guide */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-lg">Integration Guide</CardTitle>
            <CardDescription>How to use the SIE API in your application</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 rounded-lg bg-muted/50 font-mono text-sm space-y-2">
              <p className="text-muted-foreground"># Submit an ingestion job</p>
              <code className="block text-foreground">
                curl -X POST {import.meta.env.VITE_SUPABASE_URL}/functions/v1/ingest \
              </code>
              <code className="block text-foreground pl-4">
                -H "X-API-Key: your_api_key" \
              </code>
              <code className="block text-foreground pl-4">
                -H "Content-Type: application/json" \
              </code>
              <code className="block text-foreground pl-4">
                -d '{`{"source_url": "https://example.com"}`}'
              </code>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {["ingest", "jobs", "insights", "events"].map((endpoint) => (
                <div key={endpoint} className="p-3 rounded border border-border text-center">
                  <code className="text-sm text-primary">/functions/v1/{endpoint}</code>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
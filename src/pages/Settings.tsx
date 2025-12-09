import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Save, Key, Bell, Zap, Database, Shield } from "lucide-react";

export default function Settings() {
  const [settings, setSettings] = useState({
    autoRetry: true,
    maxRetries: "3",
    defaultPriority: "5",
    notifyOnComplete: true,
    notifyOnError: true,
    realtimeUpdates: true,
  });

  const handleSave = () => {
    // In production, this would save to a backend/database
    localStorage.setItem('sie_settings', JSON.stringify(settings));
    toast.success("Settings saved successfully");
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">Configure your SIE preferences</p>
      </div>

      {/* API Configuration */}
      <div className="glass-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Key className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">API Configuration</h3>
            <p className="text-xs text-muted-foreground">Manage API keys and endpoints</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="firecrawl">Firecrawl API Key</Label>
            <Input
              id="firecrawl"
              type="password"
              value="••••••••••••••••"
              disabled
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Managed via environment secrets. Contact admin to update.
            </p>
          </div>
        </div>
      </div>

      {/* Processing Settings */}
      <div className="glass-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
            <Zap className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Processing</h3>
            <p className="text-xs text-muted-foreground">Job processing preferences</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Auto-retry failed jobs</Label>
              <p className="text-xs text-muted-foreground">Automatically retry jobs that fail</p>
            </div>
            <Switch
              checked={settings.autoRetry}
              onCheckedChange={(checked) => setSettings(s => ({ ...s, autoRetry: checked }))}
            />
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="maxRetries">Max Retries</Label>
              <Input
                id="maxRetries"
                type="number"
                min="1"
                max="10"
                value={settings.maxRetries}
                onChange={(e) => setSettings(s => ({ ...s, maxRetries: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="defaultPriority">Default Priority</Label>
              <Input
                id="defaultPriority"
                type="number"
                min="1"
                max="10"
                value={settings.defaultPriority}
                onChange={(e) => setSettings(s => ({ ...s, defaultPriority: e.target.value }))}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Notifications */}
      <div className="glass-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
            <Bell className="w-5 h-5 text-success" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Notifications</h3>
            <p className="text-xs text-muted-foreground">Alert preferences</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Notify on completion</Label>
              <p className="text-xs text-muted-foreground">Get notified when jobs complete</p>
            </div>
            <Switch
              checked={settings.notifyOnComplete}
              onCheckedChange={(checked) => setSettings(s => ({ ...s, notifyOnComplete: checked }))}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <Label>Notify on errors</Label>
              <p className="text-xs text-muted-foreground">Get notified when jobs fail</p>
            </div>
            <Switch
              checked={settings.notifyOnError}
              onCheckedChange={(checked) => setSettings(s => ({ ...s, notifyOnError: checked }))}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <Label>Real-time updates</Label>
              <p className="text-xs text-muted-foreground">Enable live dashboard updates</p>
            </div>
            <Switch
              checked={settings.realtimeUpdates}
              onCheckedChange={(checked) => setSettings(s => ({ ...s, realtimeUpdates: checked }))}
            />
          </div>
        </div>
      </div>

      {/* System Info */}
      <div className="glass-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Database className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">System Information</h3>
            <p className="text-xs text-muted-foreground">Backend status and configuration</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="p-3 rounded-lg bg-muted/30">
            <p className="text-muted-foreground text-xs">Backend</p>
            <p className="font-medium text-foreground">Lovable Cloud</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/30">
            <p className="text-muted-foreground text-xs">Scraper</p>
            <p className="font-medium text-foreground">Firecrawl API</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/30">
            <p className="text-muted-foreground text-xs">Status</p>
            <p className="font-medium text-success flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-success" />
              Online
            </p>
          </div>
          <div className="p-3 rounded-lg bg-muted/30">
            <p className="text-muted-foreground text-xs">Version</p>
            <p className="font-medium text-foreground">1.0.0</p>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave}>
          <Save className="w-4 h-4 mr-2" />
          Save Settings
        </Button>
      </div>
    </div>
  );
}
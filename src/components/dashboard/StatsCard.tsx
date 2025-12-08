import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface StatsCardProps {
  title: string;
  value: string | number;
  change?: {
    value: number;
    trend: "up" | "down" | "neutral";
  };
  icon: LucideIcon;
  iconColor?: string;
  delay?: number;
}

export const StatsCard = ({ 
  title, 
  value, 
  change, 
  icon: Icon, 
  iconColor = "text-primary",
  delay = 0 
}: StatsCardProps) => {
  return (
    <div 
      className="stat-card group hover:border-primary/30 transition-all duration-300"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between mb-4">
        <div className={cn(
          "w-10 h-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110",
          "bg-gradient-to-br from-primary/20 to-primary/5"
        )}>
          <Icon className={cn("w-5 h-5", iconColor)} />
        </div>
        
        {change && (
          <div className={cn(
            "text-xs font-medium flex items-center gap-1 px-2 py-1 rounded-full",
            change.trend === "up" && "text-success bg-success/10",
            change.trend === "down" && "text-destructive bg-destructive/10",
            change.trend === "neutral" && "text-muted-foreground bg-muted"
          )}>
            {change.trend === "up" && "↑"}
            {change.trend === "down" && "↓"}
            {Math.abs(change.value)}%
          </div>
        )}
      </div>

      <div className="space-y-1">
        <h3 className="text-2xl font-bold text-foreground tracking-tight">{value}</h3>
        <p className="text-sm text-muted-foreground">{title}</p>
      </div>

      {/* Subtle glow effect on hover */}
      <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        <div className="absolute inset-0 rounded-xl bg-gradient-radial from-primary/5 to-transparent" />
      </div>
    </div>
  );
};

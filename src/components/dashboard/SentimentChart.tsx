import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { useInsights } from "@/hooks/useDashboardData";
import { Loader2 } from "lucide-react";
import { useMemo } from "react";

const COLORS = {
  positive: "hsl(150, 70%, 45%)",
  negative: "hsl(0, 75%, 55%)",
  neutral: "hsl(215, 20%, 55%)",
  mixed: "hsl(45, 85%, 55%)",
};

export const SentimentChart = () => {
  const { insights, loading } = useInsights();

  const sentimentData = useMemo(() => {
    const counts = { positive: 0, negative: 0, neutral: 0, mixed: 0 };
    insights.forEach(insight => {
      if (insight.sentiment in counts) {
        counts[insight.sentiment as keyof typeof counts]++;
      }
    });
    return Object.entries(counts).map(([name, value]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value,
      color: COLORS[name as keyof typeof COLORS],
    })).filter(d => d.value > 0);
  }, [insights]);

  const trendData = useMemo(() => {
    // Group insights by hour for the last 24 hours
    const now = new Date();
    const hourlyData: Record<string, { positive: number; negative: number; neutral: number }> = {};
    
    for (let i = 6; i >= 0; i--) {
      const hour = new Date(now.getTime() - i * 4 * 60 * 60 * 1000);
      const key = hour.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      hourlyData[key] = { positive: 0, negative: 0, neutral: 0 };
    }

    insights.forEach(insight => {
      const created = new Date(insight.created_at);
      const hourDiff = (now.getTime() - created.getTime()) / (1000 * 60 * 60);
      if (hourDiff <= 24) {
        const key = Object.keys(hourlyData)[Math.min(Math.floor(hourDiff / 4), 6)];
        if (key && insight.sentiment !== 'mixed') {
          hourlyData[key][insight.sentiment as 'positive' | 'negative' | 'neutral']++;
        }
      }
    });

    return Object.entries(hourlyData).map(([time, data]) => ({
      time,
      ...data,
    })).reverse();
  }, [insights]);

  if (loading) {
    return (
      <div className="glass-card p-6 flex items-center justify-center h-[300px]">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
        <span className="ml-2 text-muted-foreground text-sm">Loading sentiment data...</span>
      </div>
    );
  }

  const hasData = insights.length > 0;

  return (
    <div className="glass-card p-6">
      <div className="mb-6">
        <h3 className="font-semibold text-foreground">Sentiment Analysis</h3>
        <p className="text-xs text-muted-foreground mt-1">
          {hasData ? `Based on ${insights.length} analyzed jobs` : 'No data yet'}
        </p>
      </div>

      {!hasData ? (
        <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
          Submit jobs to see sentiment analysis
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {/* Pie Chart */}
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={sentimentData}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={70}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {sentimentData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{
                    backgroundColor: 'hsl(222, 47%, 9%)',
                    border: '1px solid hsl(222, 30%, 18%)',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Area Chart */}
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="positiveGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.positive} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={COLORS.positive} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="negativeGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.negative} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={COLORS.negative} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis 
                  dataKey="time" 
                  axisLine={false} 
                  tickLine={false}
                  tick={{ fill: 'hsl(215, 20%, 55%)', fontSize: 9 }}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false}
                  tick={{ fill: 'hsl(215, 20%, 55%)', fontSize: 9 }}
                />
                <Tooltip 
                  contentStyle={{
                    backgroundColor: 'hsl(222, 47%, 9%)',
                    border: '1px solid hsl(222, 30%, 18%)',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="positive"
                  stroke={COLORS.positive}
                  fill="url(#positiveGradient)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="negative"
                  stroke={COLORS.negative}
                  fill="url(#negativeGradient)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 mt-4">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-success" />
          <span className="text-xs text-muted-foreground">Positive</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-destructive" />
          <span className="text-xs text-muted-foreground">Negative</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-muted-foreground" />
          <span className="text-xs text-muted-foreground">Neutral</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.mixed }} />
          <span className="text-xs text-muted-foreground">Mixed</span>
        </div>
      </div>
    </div>
  );
};
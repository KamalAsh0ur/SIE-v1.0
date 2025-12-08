import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const data = [
  { time: "00:00", positive: 65, negative: 20, neutral: 15 },
  { time: "04:00", positive: 58, negative: 25, neutral: 17 },
  { time: "08:00", positive: 72, negative: 15, neutral: 13 },
  { time: "12:00", positive: 68, negative: 22, neutral: 10 },
  { time: "16:00", positive: 75, negative: 12, neutral: 13 },
  { time: "20:00", positive: 82, negative: 10, neutral: 8 },
  { time: "Now", positive: 78, negative: 14, neutral: 8 },
];

export const SentimentChart = () => {
  return (
    <div className="glass-card p-6">
      <div className="mb-6">
        <h3 className="font-semibold text-foreground">Sentiment Analysis</h3>
        <p className="text-xs text-muted-foreground mt-1">24-hour sentiment distribution</p>
      </div>

      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="positiveGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(150, 70%, 45%)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(150, 70%, 45%)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="negativeGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(0, 75%, 55%)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(0, 75%, 55%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis 
              dataKey="time" 
              axisLine={false} 
              tickLine={false}
              tick={{ fill: 'hsl(215, 20%, 55%)', fontSize: 10 }}
            />
            <YAxis 
              axisLine={false} 
              tickLine={false}
              tick={{ fill: 'hsl(215, 20%, 55%)', fontSize: 10 }}
            />
            <Tooltip 
              contentStyle={{
                backgroundColor: 'hsl(222, 47%, 9%)',
                border: '1px solid hsl(222, 30%, 18%)',
                borderRadius: '8px',
                fontSize: '12px',
              }}
              labelStyle={{ color: 'hsl(210, 40%, 96%)' }}
            />
            <Area
              type="monotone"
              dataKey="positive"
              stroke="hsl(150, 70%, 45%)"
              fill="url(#positiveGradient)"
              strokeWidth={2}
            />
            <Area
              type="monotone"
              dataKey="negative"
              stroke="hsl(0, 75%, 55%)"
              fill="url(#negativeGradient)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

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
      </div>
    </div>
  );
};

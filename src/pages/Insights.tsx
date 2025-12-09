import { useState } from "react";
import { useInsights } from "@/hooks/useDashboardData";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Search, Filter, TrendingUp, TrendingDown, Minus, ExternalLink, Tag } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const sentimentConfig = {
  positive: { color: "text-success", bg: "bg-success/10", icon: TrendingUp },
  negative: { color: "text-destructive", bg: "bg-destructive/10", icon: TrendingDown },
  neutral: { color: "text-muted-foreground", bg: "bg-muted", icon: Minus },
  mixed: { color: "text-accent", bg: "bg-accent/10", icon: TrendingUp },
};

export default function Insights() {
  const { insights, loading } = useInsights();
  const [searchQuery, setSearchQuery] = useState("");
  const [sentimentFilter, setSentimentFilter] = useState<string>("all");

  const filteredInsights = insights.filter(insight => {
    const matchesSearch = 
      insight.summary?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      insight.keywords?.some(k => k.toLowerCase().includes(searchQuery.toLowerCase())) ||
      insight.topics?.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesSentiment = sentimentFilter === "all" || insight.sentiment === sentimentFilter;
    return matchesSearch && matchesSentiment;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Insights</h1>
        <p className="text-sm text-muted-foreground">Analyze extracted content and sentiment</p>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Object.entries(sentimentConfig).map(([sentiment, config]) => {
          const count = insights.filter(i => i.sentiment === sentiment).length;
          const Icon = config.icon;
          return (
            <div key={sentiment} className={`glass-card p-4 ${config.bg}`}>
              <div className="flex items-center gap-3">
                <Icon className={`w-5 h-5 ${config.color}`} />
                <div>
                  <p className="text-2xl font-bold text-foreground">{count}</p>
                  <p className={`text-xs capitalize ${config.color}`}>{sentiment}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="glass-card p-4 flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by keyword, topic, or summary..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={sentimentFilter} onValueChange={setSentimentFilter}>
          <SelectTrigger className="w-[150px]">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Sentiment" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sentiments</SelectItem>
            <SelectItem value="positive">Positive</SelectItem>
            <SelectItem value="negative">Negative</SelectItem>
            <SelectItem value="neutral">Neutral</SelectItem>
            <SelectItem value="mixed">Mixed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Insights Grid */}
      {loading ? (
        <div className="glass-card p-8 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span className="ml-2 text-muted-foreground">Loading insights...</span>
        </div>
      ) : filteredInsights.length === 0 ? (
        <div className="glass-card p-8 text-center text-muted-foreground">
          {insights.length === 0 ? (
            <p>No insights yet. Submit jobs to generate insights.</p>
          ) : (
            <p>No insights match your filters.</p>
          )}
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredInsights.map((insight, index) => {
            const config = sentimentConfig[insight.sentiment];
            const Icon = config.icon;
            const job = insight.ingestion_jobs;

            return (
              <div
                key={insight.id}
                className="glass-card p-5 animate-fade-in"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg ${config.bg} flex items-center justify-center`}>
                      <Icon className={`w-5 h-5 ${config.color}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={`capitalize ${config.color}`}>
                          {insight.sentiment}
                        </Badge>
                        {insight.sentiment_score !== null && (
                          <span className="text-xs text-muted-foreground">
                            Score: {(insight.sentiment_score * 100).toFixed(0)}%
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(insight.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                  {job && (
                    <a
                      href={job.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                    >
                      View Source
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>

                {/* Summary */}
                {insight.summary && (
                  <p className="text-sm text-foreground mb-4 line-clamp-3">{insight.summary}</p>
                )}

                {/* Keywords & Topics */}
                <div className="flex flex-wrap gap-2 mb-3">
                  {insight.topics?.map((topic, i) => (
                    <Badge key={`topic-${i}`} variant="secondary" className="text-xs">
                      {topic}
                    </Badge>
                  ))}
                </div>

                {insight.keywords && insight.keywords.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <Tag className="w-3 h-3 text-muted-foreground" />
                    {insight.keywords.slice(0, 8).map((keyword, i) => (
                      <span key={i} className="text-xs text-muted-foreground">
                        {keyword}{i < Math.min(insight.keywords!.length - 1, 7) && ","}
                      </span>
                    ))}
                    {insight.keywords.length > 8 && (
                      <span className="text-xs text-muted-foreground">
                        +{insight.keywords.length - 8} more
                      </span>
                    )}
                  </div>
                )}

                {/* Entities */}
                {insight.entities && insight.entities.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <p className="text-xs text-muted-foreground mb-2">Entities:</p>
                    <div className="flex flex-wrap gap-2">
                      {insight.entities.map((entity, i) => (
                        <span 
                          key={i} 
                          className="text-xs px-2 py-1 rounded bg-primary/10 text-primary"
                        >
                          {entity.name} ({entity.type})
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
/**
 * React Hooks for SIE Backend
 * 
 * Custom hooks for fetching and subscribing to data from the Python backend.
 */

import { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
    sieBackend,
    JobSummary,
    JobDetail,
    NormalizedPost,
    JobEvent,
    InsightsResponse,
    getDashboardStats,
} from '@/lib/backend-api';

// Also import Supabase client for real-time subscriptions (legacy support)
import { supabase } from '@/integrations/supabase/client';

// Legacy types for backward compatibility
export interface LegacyJob {
    id: string;
    source_url: string;
    platform: string;
    status: 'pending' | 'ingesting' | 'processing' | 'enriching' | 'completed' | 'failed';
    priority: number;
    metadata: Record<string, unknown>;
    raw_content: string | null;
    error_message: string | null;
    progress: number;
    created_at: string;
    updated_at: string;
    started_at: string | null;
    completed_at: string | null;
}

export interface LegacyInsight {
    id: string;
    job_id: string;
    sentiment: 'positive' | 'negative' | 'neutral' | 'mixed';
    sentiment_score: number;
    entities: Array<{ type: string; name: string; confidence: number }>;
    keywords: string[];
    summary: string;
    topics: string[];
    engagement_metrics: Record<string, unknown>;
    language: string;
    ocr_text: string | null;
    confidence_scores: Record<string, number> | null;
    created_at: string;
}

export interface LegacyPipelineEvent {
    id: string;
    job_id: string | null;
    event_type: string;
    stage: string;
    message: string;
    metadata: Record<string, unknown>;
    created_at: string;
}

/**
 * Convert new JobSummary to legacy format
 */
function convertJobToLegacy(job: JobSummary): LegacyJob {
    return {
        id: job.job_id,
        source_url: '',
        platform: job.source_type as string,
        status: job.status as LegacyJob['status'],
        priority: job.priority === 'high' ? 10 : job.priority === 'low' ? 1 : 5,
        metadata: {},
        raw_content: null,
        error_message: job.error_message || null,
        progress: (job.items_total > 0 ? (job.items_processed / job.items_total) * 100 : 0),
        created_at: job.created_at,
        updated_at: job.updated_at,
        started_at: null,
        completed_at: null,
    };
}

/**
 * Convert NormalizedPost to legacy insight format
 */
function convertInsightToLegacy(insight: NormalizedPost): LegacyInsight {
    return {
        id: insight.post_id,
        job_id: insight.job_id,
        sentiment: insight.sentiment,
        sentiment_score: insight.sentiment_score,
        entities: insight.entities,
        keywords: insight.keywords,
        summary: insight.content_text.substring(0, 200),
        topics: insight.topics,
        engagement_metrics: {},
        language: insight.language,
        ocr_text: insight.ocr_text || null,
        confidence_scores: {
            sentiment: insight.confidence_scores.sentiment,
            language: insight.confidence_scores.language,
            topics: insight.confidence_scores.topics,
            entities: insight.confidence_scores.entities,
        },
        created_at: insight.created_at,
    };
}

/**
 * Convert JobEvent to legacy pipeline event format
 */
function convertEventToLegacy(event: JobEvent): LegacyPipelineEvent {
    return {
        id: `${event.job_id}-${event.timestamp}`,
        job_id: event.job_id,
        event_type: event.event_type,
        stage: event.event_type.split('.')[0] || event.event_type,
        message: event.message || '',
        metadata: event.data || {},
        created_at: event.timestamp,
    };
}

// ============================================================================
// Jobs Hook
// ============================================================================

export function useJobs() {
    const [jobs, setJobs] = useState<LegacyJob[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchJobs = useCallback(async () => {
        setLoading(true);
        try {
            const result = await sieBackend.listJobs({ limit: 10 });
            setJobs(result.jobs.map(convertJobToLegacy));
            setError(null);
        } catch (err) {
            setError((err as Error).message);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchJobs();

        // Subscribe to SSE events for real-time updates
        const unsubscribe = sieBackend.subscribeToEvents((event) => {
            if (event.event_type === 'complete' || event.event_type === 'error') {
                fetchJobs(); // Refresh jobs list when a job completes
            }
        });

        return unsubscribe;
    }, [fetchJobs]);

    return { jobs, loading, error, refetch: fetchJobs };
}

// ============================================================================
// Pipeline Events Hook
// ============================================================================

export function usePipelineEvents() {
    const [events, setEvents] = useState<LegacyPipelineEvent[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchEvents = async () => {
            try {
                const result = await sieBackend.getRecentEvents();
                setEvents(result.events.map(convertEventToLegacy));
            } catch (err) {
                console.error('Failed to fetch events:', err);
            }
            setLoading(false);
        };

        fetchEvents();

        // Subscribe to SSE for real-time events
        const unsubscribe = sieBackend.subscribeToEvents((event) => {
            setEvents(prev => [convertEventToLegacy(event), ...prev.slice(0, 19)]);
        });

        return unsubscribe;
    }, []);

    return { events, loading };
}

// ============================================================================
// Dashboard Stats Hook
// ============================================================================

export function useDashboardStats() {
    const [stats, setStats] = useState({
        totalJobs: 0,
        completedJobs: 0,
        processingJobs: 0,
        failedJobs: 0,
        successRate: '0',
        sentimentCounts: {} as Record<string, number>
    });
    const [loading, setLoading] = useState(true);

    const fetchStats = useCallback(async () => {
        try {
            const result = await getDashboardStats();
            setStats(result);
        } catch (err) {
            console.error('Failed to fetch stats:', err);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchStats();

        // Subscribe to SSE for auto-refresh
        const unsubscribe = sieBackend.subscribeToEvents((event) => {
            if (event.event_type === 'complete' || event.event_type === 'error') {
                fetchStats();
            }
        });

        return unsubscribe;
    }, [fetchStats]);

    return { stats, loading, refetch: fetchStats };
}

// ============================================================================
// Insights Hook
// ============================================================================

export function useInsights() {
    const [insights, setInsights] = useState<LegacyInsight[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchInsights = async () => {
            try {
                // Fetch insights from all completed jobs
                const { jobs } = await sieBackend.listJobs({ status: 'completed', limit: 10 });

                const allInsights: LegacyInsight[] = [];
                for (const job of jobs) {
                    try {
                        const result = await sieBackend.getInsights(job.job_id);
                        allInsights.push(...result.results.map(convertInsightToLegacy));
                    } catch {
                        // Skip jobs without insights
                    }
                }

                setInsights(allInsights.slice(0, 50));
            } catch (err) {
                console.error('Failed to fetch insights:', err);
            }
            setLoading(false);
        };

        fetchInsights();

        // Subscribe to job completions to refresh insights
        const unsubscribe = sieBackend.subscribeToEvents((event) => {
            if (event.event_type === 'complete') {
                fetchInsights();
            }
        });

        return unsubscribe;
    }, []);

    return { insights, loading };
}

// ============================================================================
// Job Details Hook (with React Query)
// ============================================================================

export function useJobDetails(jobId: string) {
    return useQuery({
        queryKey: ['job', jobId],
        queryFn: () => sieBackend.getJob(jobId),
        enabled: !!jobId,
        refetchInterval: (query) => {
            // Poll every 2 seconds while job is in progress
            const data = query.state.data;
            if (data && !['completed', 'failed'].includes(data.status)) {
                return 2000;
            }
            return false;
        },
    });
}

// ============================================================================
// Job Insights Hook (with React Query)
// ============================================================================

export function useJobInsights(jobId: string, options?: {
    page?: number;
    limit?: number;
    sentiment?: string;
}) {
    return useQuery({
        queryKey: ['insights', jobId, options],
        queryFn: () => sieBackend.getInsights(jobId, options),
        enabled: !!jobId,
    });
}

// ============================================================================
// Submit Job Hook
// ============================================================================

export function useSubmitJob() {
    const queryClient = useQueryClient();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submitJob = async (params: {
        source_url: string;
        keywords?: string[];
        accounts?: string[];
        priority?: 'low' | 'normal' | 'high';
    }) => {
        setIsSubmitting(true);
        setError(null);

        try {
            const response = await sieBackend.submitJob({
                source_type: 'scraped',
                tenant: 'default',
                keywords: params.keywords,
                accounts: params.accounts || (params.source_url ? [params.source_url] : undefined),
                mode: 'realtime',
                priority: params.priority || 'normal',
            });

            // Invalidate jobs cache
            queryClient.invalidateQueries({ queryKey: ['jobs'] });

            return { success: true, jobId: response.job_id };
        } catch (err) {
            const message = (err as Error).message;
            setError(message);
            return { success: false, error: message };
        } finally {
            setIsSubmitting(false);
        }
    };

    return { submitJob, isSubmitting, error };
}

// Re-export legacy functions for backward compatibility
export { getDashboardStats } from '@/lib/backend-api';

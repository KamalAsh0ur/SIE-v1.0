import { useState, useEffect, useCallback } from 'react';
import { 
  getJobs, 
  getPipelineEvents, 
  getDashboardStats, 
  getInsights,
  subscribeToJobs, 
  subscribeToEvents,
  IngestionJob,
  PipelineEvent,
  Insight
} from '@/lib/api';

export function useJobs() {
  const [jobs, setJobs] = useState<IngestionJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    const result = await getJobs({ limit: 10 });
    if ('error' in result) {
      setError(result.error);
    } else {
      setJobs(result.data);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchJobs();

    // Subscribe to realtime updates
    const unsubscribe = subscribeToJobs((updatedJob) => {
      setJobs(prev => {
        const index = prev.findIndex(j => j.id === updatedJob.id);
        if (index >= 0) {
          const newJobs = [...prev];
          newJobs[index] = updatedJob;
          return newJobs;
        }
        // New job, add to front
        return [updatedJob, ...prev.slice(0, 9)];
      });
    });

    return unsubscribe;
  }, [fetchJobs]);

  return { jobs, loading, error, refetch: fetchJobs };
}

export function usePipelineEvents() {
  const [events, setEvents] = useState<PipelineEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchEvents = async () => {
      const result = await getPipelineEvents(undefined, 20);
      if (result.success && result.data) {
        setEvents(result.data);
      }
      setLoading(false);
    };

    fetchEvents();

    // Subscribe to realtime events
    const unsubscribe = subscribeToEvents((newEvent) => {
      setEvents(prev => [newEvent, ...prev.slice(0, 19)]);
    });

    return unsubscribe;
  }, []);

  return { events, loading };
}

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
    const result = await getDashboardStats();
    setStats(result);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchStats();

    // Refresh stats when jobs change
    const unsubscribe = subscribeToJobs(() => {
      fetchStats();
    });

    return unsubscribe;
  }, [fetchStats]);

  return { stats, loading, refetch: fetchStats };
}

export function useInsights() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchInsights = async () => {
      const result = await getInsights();
      if (result.success && Array.isArray(result.data)) {
        setInsights(result.data);
      }
      setLoading(false);
    };

    fetchInsights();

    // Subscribe to job completions to refresh insights
    const unsubscribe = subscribeToJobs((job) => {
      if (job.status === 'completed') {
        fetchInsights();
      }
    });

    return unsubscribe;
  }, []);

  return { insights, loading };
}
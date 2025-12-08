import { supabase } from '@/integrations/supabase/client'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

export interface IngestionJob {
  id: string
  source_url: string
  platform: 'twitter' | 'reddit' | 'news' | 'linkedin' | 'instagram' | 'youtube' | 'custom'
  status: 'pending' | 'ingesting' | 'processing' | 'enriching' | 'completed' | 'failed'
  priority: number
  metadata: Record<string, unknown>
  raw_content: string | null
  error_message: string | null
  progress: number
  created_at: string
  updated_at: string
  started_at: string | null
  completed_at: string | null
}

export interface Insight {
  id: string
  job_id: string
  sentiment: 'positive' | 'negative' | 'neutral' | 'mixed'
  sentiment_score: number
  entities: Array<{ type: string; name: string; confidence: number }>
  keywords: string[]
  summary: string
  topics: string[]
  engagement_metrics: Record<string, unknown>
  language: string
  created_at: string
  ingestion_jobs?: IngestionJob
}

export interface PipelineEvent {
  id: string
  job_id: string | null
  event_type: string
  stage: string
  message: string
  metadata: Record<string, unknown>
  created_at: string
}

export interface PaginatedResponse<T> {
  success: boolean
  data: T[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

// Submit a new ingestion job
export async function submitIngestionJob(params: {
  source_url: string
  platform?: IngestionJob['platform']
  priority?: number
  metadata?: Record<string, unknown>
}): Promise<{ success: boolean; job_id?: string; error?: string }> {
  const { data, error } = await supabase.functions.invoke('ingest', {
    body: params
  })

  if (error) {
    console.error('Error submitting job:', error)
    return { success: false, error: error.message }
  }

  return data
}

// Get job status
export async function getJobStatus(jobId: string): Promise<{ success: boolean; data?: Partial<IngestionJob>; error?: string }> {
  const { data, error } = await supabase.functions.invoke('jobs', {
    body: null,
    method: 'GET'
  })

  // Since we can't pass path params easily, use direct query
  const { data: job, error: queryError } = await supabase
    .from('ingestion_jobs')
    .select('id, status, progress, error_message, created_at, started_at, completed_at')
    .eq('id', jobId)
    .single()

  if (queryError) {
    return { success: false, error: queryError.message }
  }

  return { success: true, data: job as Partial<IngestionJob> }
}

// Get all jobs
export async function getJobs(params?: {
  status?: IngestionJob['status']
  platform?: IngestionJob['platform']
  page?: number
  limit?: number
}): Promise<PaginatedResponse<IngestionJob> | { success: false; error: string }> {
  let query = supabase
    .from('ingestion_jobs')
    .select('*', { count: 'exact' })

  if (params?.status) {
    query = query.eq('status', params.status)
  }
  if (params?.platform) {
    query = query.eq('platform', params.platform)
  }

  const page = params?.page || 1
  const limit = params?.limit || 20
  const offset = (page - 1) * limit

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    return { success: false, error: error.message }
  }

  return {
    success: true,
    data: data as IngestionJob[],
    pagination: {
      page,
      limit,
      total: count || 0,
      totalPages: Math.ceil((count || 0) / limit)
    }
  }
}

// Get insights
export async function getInsights(jobId?: string): Promise<{ success: boolean; data?: Insight | Insight[]; error?: string }> {
  if (jobId) {
    const { data, error } = await supabase
      .from('insights')
      .select(`
        *,
        ingestion_jobs (*)
      `)
      .eq('job_id', jobId)
      .single()

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true, data: data as unknown as Insight }
  }

  const { data, error } = await supabase
    .from('insights')
    .select(`
      *,
      ingestion_jobs (*)
    `)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, data: data as unknown as Insight[] }
}

// Get pipeline events
export async function getPipelineEvents(jobId?: string, limit = 50): Promise<{ success: boolean; data?: PipelineEvent[]; error?: string }> {
  let query = supabase
    .from('pipeline_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (jobId) {
    query = query.eq('job_id', jobId)
  }

  const { data, error } = await query

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, data: data as PipelineEvent[] }
}

// Subscribe to real-time events
export function subscribeToEvents(callback: (event: PipelineEvent) => void) {
  const channel = supabase
    .channel('pipeline-events')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'pipeline_events'
      },
      (payload) => {
        callback(payload.new as PipelineEvent)
      }
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}

// Subscribe to job updates
export function subscribeToJobs(callback: (job: IngestionJob) => void) {
  const channel = supabase
    .channel('job-updates')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'ingestion_jobs'
      },
      (payload) => {
        callback(payload.new as IngestionJob)
      }
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}

// Get dashboard stats
export async function getDashboardStats() {
  const [jobsResult, insightsResult] = await Promise.all([
    supabase.from('ingestion_jobs').select('status', { count: 'exact' }),
    supabase.from('insights').select('sentiment', { count: 'exact' })
  ])

  const statusCounts: Record<string, number> = {}
  const sentimentCounts: Record<string, number> = {}

  if (jobsResult.data) {
    for (const job of jobsResult.data) {
      statusCounts[job.status] = (statusCounts[job.status] || 0) + 1
    }
  }

  if (insightsResult.data) {
    for (const insight of insightsResult.data) {
      sentimentCounts[insight.sentiment] = (sentimentCounts[insight.sentiment] || 0) + 1
    }
  }

  const totalJobs = jobsResult.count || 0
  const completedJobs = statusCounts['completed'] || 0
  const processingJobs = (statusCounts['ingesting'] || 0) + (statusCounts['processing'] || 0) + (statusCounts['enriching'] || 0)

  return {
    totalJobs,
    completedJobs,
    processingJobs,
    failedJobs: statusCounts['failed'] || 0,
    successRate: totalJobs > 0 ? ((completedJobs / totalJobs) * 100).toFixed(1) : '0',
    sentimentCounts
  }
}

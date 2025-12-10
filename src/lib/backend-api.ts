/**
 * SIE Backend API Client
 * 
 * Communicates with the Python FastAPI backend.
 * This replaces the Supabase Edge Functions for SRS compliance.
 */

// Backend URL - configurable via environment
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'

// API Key for authentication
const API_KEY = import.meta.env.VITE_API_KEY || 'dev-api-key-12345'

// ============================================================================
// Types
// ============================================================================

export interface IngestRequest {
    source_type: 'meta_api' | 'youtube_api' | 'scraped'
    items?: IngestItem[]
    accounts?: string[]
    keywords?: string[]
    date_range?: {
        start: string
        end: string
    }
    mode: 'historical' | 'realtime' | 'scheduled'
    tenant: string
    priority: 'low' | 'normal' | 'high'
}

export interface IngestItem {
    id?: string
    content?: string
    url?: string
    author?: string
    timestamp?: string
    metadata?: Record<string, unknown>
}

export interface IngestResponse {
    job_id: string
    accepted_at: string
    status: string
    message: string
}

export interface JobSummary {
    job_id: string
    tenant: string
    source_type: string
    status: JobStatus
    priority: string
    items_total: number
    items_processed: number
    created_at: string
    updated_at: string
    error_message?: string
}

export interface JobDetail extends JobSummary {
    mode: string
    items_success: number
    items_failed: number
    progress_percent: number
    started_at?: string
    completed_at?: string
    accounts?: string[]
    keywords?: string[]
    retry_count: number
    processing_time_ms?: number
}

export interface JobStatusResponse {
    job_id: string
    status: JobStatus
    progress_percent: number
    items_processed: number
    items_total: number
    estimated_time_remaining?: number
}

export type JobStatus = 'pending' | 'ingesting' | 'processing' | 'enriching' | 'completed' | 'failed'

export interface NormalizedPost {
    post_id: string
    job_id: string
    tenant: string
    content_text: string
    ocr_text?: string
    sentiment: 'positive' | 'negative' | 'neutral' | 'mixed'
    sentiment_score: number
    entities: Entity[]
    topics: string[]
    keywords: string[]
    language: string
    author?: string
    author_id?: string
    published_at?: string
    media?: MediaMetadata[]
    provenance: Provenance
    confidence_scores: ConfidenceScores
    is_spam: boolean
    is_duplicate: boolean
    created_at: string
    processed_at: string
}

export interface Entity {
    type: string
    name: string
    confidence: number
}

export interface MediaMetadata {
    type: string
    url?: string
    thumbnail?: string
    title?: string
    description?: string
}

export interface Provenance {
    source_url: string
    platform: string
    fetch_method: string
    fetched_at: string
    original_id?: string
}

export interface ConfidenceScores {
    sentiment: number
    language: number
    topics: number
    entities: number
    spam?: number
}

export interface InsightsResponse {
    results: NormalizedPost[]
    pagination: {
        page: number
        limit: number
        total: number
        total_pages: number
    }
    job_status: 'partial' | 'complete' | 'error'
}

export interface InsightsSummary {
    total_posts: number
    sentiment_breakdown: Record<string, number>
    top_topics: Array<{ topic: string; count: number }>
    top_entities: Array<{ entity: string; count: number }>
    languages: Array<{ language: string; count: number }>
    spam_rate: number
    duplicate_rate: number
}

export interface JobEvent {
    event_type: string
    job_id: string
    tenant: string
    timestamp: string
    data?: Record<string, unknown>
    message?: string
}

export interface Pagination {
    page: number
    limit: number
    total: number
    total_pages: number
}

// ============================================================================
// API Client
// ============================================================================

class SIEBackendClient {
    private baseUrl: string
    private apiKey: string

    constructor(baseUrl: string = BACKEND_URL, apiKey: string = API_KEY) {
        this.baseUrl = baseUrl.replace(/\/$/, '') // Remove trailing slash
        this.apiKey = apiKey
    }

    private async request<T>(
        endpoint: string,
        options: RequestInit = {}
    ): Promise<T> {
        const url = `${this.baseUrl}${endpoint}`

        const headers: HeadersInit = {
            'Content-Type': 'application/json',
            'X-API-Key': this.apiKey,
            ...options.headers,
        }

        const response = await fetch(url, {
            ...options,
            headers,
        })

        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: response.statusText }))
            throw new Error(error.detail || `API Error: ${response.status}`)
        }

        return response.json()
    }

    // ===========================================================================
    // Health
    // ===========================================================================

    async health(): Promise<{ status: string; version: string; timestamp: string }> {
        return this.request('/health')
    }

    // ===========================================================================
    // Ingestion (SRS §3.1)
    // ===========================================================================

    async submitJob(request: IngestRequest): Promise<IngestResponse> {
        return this.request('/ingest', {
            method: 'POST',
            body: JSON.stringify(request),
        })
    }

    async submitBatchJobs(requests: IngestRequest[]): Promise<IngestResponse[]> {
        return this.request('/ingest/batch', {
            method: 'POST',
            body: JSON.stringify(requests),
        })
    }

    // ===========================================================================
    // Jobs
    // ===========================================================================

    async listJobs(params?: {
        tenant?: string
        status?: JobStatus
        source_type?: string
        priority?: string
        page?: number
        limit?: number
    }): Promise<{ jobs: JobSummary[]; pagination: Pagination }> {
        const searchParams = new URLSearchParams()
        if (params?.tenant) searchParams.set('tenant', params.tenant)
        if (params?.status) searchParams.set('status', params.status)
        if (params?.source_type) searchParams.set('source_type', params.source_type)
        if (params?.priority) searchParams.set('priority', params.priority)
        if (params?.page) searchParams.set('page', params.page.toString())
        if (params?.limit) searchParams.set('limit', params.limit.toString())

        const query = searchParams.toString()
        return this.request(`/jobs${query ? '?' + query : ''}`)
    }

    async getJob(jobId: string): Promise<JobDetail> {
        return this.request(`/jobs/${jobId}`)
    }

    async getJobStatus(jobId: string): Promise<JobStatusResponse> {
        return this.request(`/jobs/${jobId}/status`)
    }

    async cancelJob(jobId: string): Promise<void> {
        await this.request(`/jobs/${jobId}`, { method: 'DELETE' })
    }

    // ===========================================================================
    // Insights (SRS §3.4)
    // ===========================================================================

    async getInsights(jobId: string, params?: {
        page?: number
        limit?: number
        sentiment?: string
        topic?: string
        language?: string
        exclude_spam?: boolean
        exclude_duplicates?: boolean
    }): Promise<InsightsResponse> {
        const searchParams = new URLSearchParams()
        if (params?.page) searchParams.set('page', params.page.toString())
        if (params?.limit) searchParams.set('limit', params.limit.toString())
        if (params?.sentiment) searchParams.set('sentiment', params.sentiment)
        if (params?.topic) searchParams.set('topic', params.topic)
        if (params?.language) searchParams.set('language', params.language)
        if (params?.exclude_spam !== undefined) searchParams.set('exclude_spam', params.exclude_spam.toString())
        if (params?.exclude_duplicates !== undefined) searchParams.set('exclude_duplicates', params.exclude_duplicates.toString())

        const query = searchParams.toString()
        return this.request(`/insights/${jobId}${query ? '?' + query : ''}`)
    }

    async getInsightsSummary(jobId: string): Promise<InsightsSummary> {
        return this.request(`/insights/${jobId}/summary`)
    }

    // ===========================================================================
    // Events (SRS §3.5)
    // ===========================================================================

    async getRecentEvents(jobId?: string, limit = 50): Promise<{ events: JobEvent[] }> {
        const searchParams = new URLSearchParams()
        if (jobId) searchParams.set('job_id', jobId)
        if (limit) searchParams.set('limit', limit.toString())

        const query = searchParams.toString()
        return this.request(`/events/recent${query ? '?' + query : ''}`)
    }

    subscribeToEvents(
        callback: (event: JobEvent) => void,
        options?: { jobId?: string; tenant?: string }
    ): () => void {
        const searchParams = new URLSearchParams()
        if (options?.jobId) searchParams.set('job_id', options.jobId)
        if (options?.tenant) searchParams.set('tenant', options.tenant)

        const query = searchParams.toString()
        const url = `${this.baseUrl}/events/stream${query ? '?' + query : ''}`

        const eventSource = new EventSource(url)

        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data) as JobEvent
                callback(data)
            } catch (e) {
                console.error('Failed to parse SSE event:', e)
            }
        }

        // Listen for specific event types
        const eventTypes = ['job.accepted', 'partial_result', 'complete', 'error']
        eventTypes.forEach((type) => {
            eventSource.addEventListener(type, (event: MessageEvent) => {
                try {
                    const data = JSON.parse(event.data) as JobEvent
                    callback(data)
                } catch (e) {
                    console.error(`Failed to parse ${type} event:`, e)
                }
            })
        })

        eventSource.onerror = (error) => {
            console.error('SSE connection error:', error)
        }

        // Return cleanup function
        return () => {
            eventSource.close()
        }
    }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const sieBackend = new SIEBackendClient()

// ============================================================================
// Helper Functions (for backward compatibility)
// ============================================================================

/**
 * Submit an ingestion job to the backend.
 * 
 * @example
 * ```ts
 * const result = await submitIngestionJob({
 *   source_url: 'https://example.com',
 *   platform: 'custom'
 * })
 * ```
 */
export async function submitIngestionJob(params: {
    source_url: string
    platform?: string
    priority?: number
    metadata?: Record<string, unknown>
}): Promise<{ success: boolean; job_id?: string; error?: string }> {
    try {
        // Convert old format to new format
        const request: IngestRequest = {
            source_type: 'scraped',
            tenant: 'default',
            accounts: params.source_url ? [params.source_url] : undefined,
            mode: 'realtime',
            priority: params.priority && params.priority > 7 ? 'high' : params.priority && params.priority < 3 ? 'low' : 'normal',
        }

        const response = await sieBackend.submitJob(request)
        return { success: true, job_id: response.job_id }
    } catch (error) {
        return { success: false, error: (error as Error).message }
    }
}

/**
 * Get dashboard statistics.
 */
export async function getDashboardStats(): Promise<{
    totalJobs: number
    completedJobs: number
    processingJobs: number
    failedJobs: number
    successRate: string
    sentimentCounts: Record<string, number>
}> {
    try {
        const { jobs, pagination } = await sieBackend.listJobs({ limit: 1000 })

        const statusCounts: Record<string, number> = {}
        for (const job of jobs) {
            statusCounts[job.status] = (statusCounts[job.status] || 0) + 1
        }

        const totalJobs = pagination.total
        const completedJobs = statusCounts['completed'] || 0
        const processingJobs = (statusCounts['ingesting'] || 0) +
            (statusCounts['processing'] || 0) +
            (statusCounts['enriching'] || 0)
        const failedJobs = statusCounts['failed'] || 0

        return {
            totalJobs,
            completedJobs,
            processingJobs,
            failedJobs,
            successRate: totalJobs > 0 ? ((completedJobs / totalJobs) * 100).toFixed(1) : '0',
            sentimentCounts: {} // Would need to aggregate from insights
        }
    } catch (error) {
        console.error('Failed to get dashboard stats:', error)
        return {
            totalJobs: 0,
            completedJobs: 0,
            processingJobs: 0,
            failedJobs: 0,
            successRate: '0',
            sentimentCounts: {}
        }
    }
}

export default sieBackend

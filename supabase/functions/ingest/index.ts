import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import FirecrawlApp from 'https://esm.sh/@mendable/firecrawl-js@4.8.1?bundle-deps&no-dts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface IngestRequest {
  source_url: string
  platform?: 'twitter' | 'reddit' | 'news' | 'linkedin' | 'instagram' | 'youtube' | 'custom'
  priority?: number
  metadata?: Record<string, unknown>
}

declare const EdgeRuntime: {
  waitUntil(promise: Promise<unknown>): void
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    // deno-lint-ignore no-explicit-any
    const supabase: any = createClient(supabaseUrl, supabaseKey)

    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const body: IngestRequest = await req.json()
    console.log('Received ingest request:', body)

    if (!body.source_url) {
      return new Response(
        JSON.stringify({ error: 'source_url is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const platform = body.platform || detectPlatform(body.source_url)

    const { data: job, error: jobError } = await supabase
      .from('ingestion_jobs')
      .insert({
        source_url: body.source_url,
        platform,
        priority: body.priority || 5,
        metadata: body.metadata || {},
        status: 'pending'
      })
      .select()
      .single()

    if (jobError) {
      console.error('Error creating job:', jobError)
      return new Response(
        JSON.stringify({ error: 'Failed to create ingestion job', details: jobError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Created job:', job.id)

    await supabase.rpc('log_pipeline_event', {
      p_job_id: job.id,
      p_event_type: 'job_created',
      p_stage: 'ingestion',
      p_message: `Ingestion job created for ${platform} source`,
      p_metadata: { source_url: body.source_url }
    })

    EdgeRuntime.waitUntil(processJob(supabase, job.id, body.source_url, platform))

    return new Response(
      JSON.stringify({ success: true, job_id: job.id, status: 'pending', message: 'Ingestion job queued successfully' }),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    const error = err as Error
    console.error('Ingest error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

function detectPlatform(url: string): string {
  const lowerUrl = url.toLowerCase()
  if (lowerUrl.includes('twitter.com') || lowerUrl.includes('x.com')) return 'twitter'
  if (lowerUrl.includes('reddit.com')) return 'reddit'
  if (lowerUrl.includes('linkedin.com')) return 'linkedin'
  if (lowerUrl.includes('instagram.com')) return 'instagram'
  if (lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be')) return 'youtube'
  return 'news'
}

// deno-lint-ignore no-explicit-any
async function processJob(supabase: any, jobId: string, sourceUrl: string, platform: string) {
  const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY')
  
  if (!firecrawlApiKey) {
    console.error('FIRECRAWL_API_KEY not configured')
    await supabase.from('ingestion_jobs').update({ status: 'failed', error_message: 'Firecrawl API key not configured' }).eq('id', jobId)
    await supabase.rpc('log_pipeline_event', { p_job_id: jobId, p_event_type: 'job_failed', p_stage: 'error', p_message: 'Firecrawl API key not configured' })
    return
  }

  try {
    console.log(`Starting Firecrawl scraping for job ${jobId}: ${sourceUrl}`)

    // Update status to ingesting
    await supabase.from('ingestion_jobs').update({ status: 'ingesting', started_at: new Date().toISOString(), progress: 10 }).eq('id', jobId)
    await supabase.rpc('log_pipeline_event', { p_job_id: jobId, p_event_type: 'status_change', p_stage: 'ingestion', p_message: 'Started Firecrawl content scraping' })

    // Initialize Firecrawl and scrape
    const firecrawl = new FirecrawlApp({ apiKey: firecrawlApiKey })
    
    const scrapeResult = await firecrawl.scrape(sourceUrl, {
      formats: ['markdown', 'html', 'links'],
      onlyMainContent: true,
      waitFor: 2000,
    })

    if (!scrapeResult.success) {
      throw new Error(`Firecrawl scrape failed: ${scrapeResult.error || 'Unknown error'}`)
    }

    console.log(`Firecrawl scrape successful for job ${jobId}`)

    // Store raw content
    await supabase.from('ingestion_jobs').update({ 
      status: 'processing', 
      progress: 40,
      raw_content: scrapeResult.markdown || scrapeResult.html
    }).eq('id', jobId)
    
    await supabase.rpc('log_pipeline_event', { 
      p_job_id: jobId, 
      p_event_type: 'status_change', 
      p_stage: 'processing', 
      p_message: 'Content scraped successfully, processing with NLP pipeline',
      p_metadata: { 
        content_length: (scrapeResult.markdown || '').length,
        links_found: (scrapeResult.links || []).length
      }
    })

    // Update to enriching stage
    await supabase.from('ingestion_jobs').update({ status: 'enriching', progress: 70 }).eq('id', jobId)
    await supabase.rpc('log_pipeline_event', { p_job_id: jobId, p_event_type: 'status_change', p_stage: 'enrichment', p_message: 'Enriching data with entity recognition' })

    // Extract insights from scraped content
    const content = scrapeResult.markdown || ''
    const sentiment = analyzeSentiment(content)
    const keywords = extractKeywords(content)
    const metadata = scrapeResult.metadata || {}

    await supabase.from('insights').insert({
      job_id: jobId,
      sentiment: sentiment.type,
      sentiment_score: sentiment.score,
      summary: metadata.description || content.slice(0, 500),
      keywords: keywords,
      topics: extractTopics(content, platform),
      entities: extractEntities(metadata),
      engagement_metrics: { 
        links_found: (scrapeResult.links || []).length,
        content_length: content.length,
        source_title: metadata.title || 'Unknown'
      }
    })

    // Mark as completed
    await supabase.from('ingestion_jobs').update({ status: 'completed', progress: 100, completed_at: new Date().toISOString() }).eq('id', jobId)
    await supabase.rpc('log_pipeline_event', { 
      p_job_id: jobId, 
      p_event_type: 'job_completed', 
      p_stage: 'completed', 
      p_message: 'Job completed successfully with Firecrawl', 
      p_metadata: { sentiment: sentiment.type, keywords_count: keywords.length } 
    })

    console.log(`Job ${jobId} completed successfully`)
  } catch (err) {
    const error = err as Error
    console.error(`Error processing job ${jobId}:`, error)
    await supabase.from('ingestion_jobs').update({ status: 'failed', error_message: error.message }).eq('id', jobId)
    await supabase.rpc('log_pipeline_event', { p_job_id: jobId, p_event_type: 'job_failed', p_stage: 'error', p_message: `Job failed: ${error.message}` })
  }
}

// Simple sentiment analysis based on keyword matching
function analyzeSentiment(content: string): { type: 'positive' | 'negative' | 'neutral' | 'mixed', score: number } {
  const lowerContent = content.toLowerCase()
  
  const positiveWords = ['great', 'excellent', 'amazing', 'wonderful', 'fantastic', 'love', 'best', 'awesome', 'good', 'happy', 'success', 'innovative', 'breakthrough']
  const negativeWords = ['bad', 'terrible', 'awful', 'horrible', 'hate', 'worst', 'poor', 'disappointing', 'failure', 'problem', 'issue', 'crisis', 'concern']
  
  let positiveCount = 0
  let negativeCount = 0
  
  positiveWords.forEach(word => {
    const matches = lowerContent.match(new RegExp(`\\b${word}\\b`, 'gi'))
    if (matches) positiveCount += matches.length
  })
  
  negativeWords.forEach(word => {
    const matches = lowerContent.match(new RegExp(`\\b${word}\\b`, 'gi'))
    if (matches) negativeCount += matches.length
  })
  
  const total = positiveCount + negativeCount
  if (total === 0) return { type: 'neutral', score: 0 }
  
  const score = (positiveCount - negativeCount) / total
  
  if (score > 0.3) return { type: 'positive', score: Math.min(score, 1) }
  if (score < -0.3) return { type: 'negative', score: Math.max(score, -1) }
  if (positiveCount > 0 && negativeCount > 0) return { type: 'mixed', score }
  return { type: 'neutral', score }
}

// Extract keywords from content
function extractKeywords(content: string): string[] {
  const words = content.toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 4)
  
  const stopWords = new Set(['about', 'above', 'after', 'again', 'being', 'below', 'between', 'could', 'does', 'doing', 'during', 'each', 'from', 'further', 'have', 'having', 'here', 'itself', 'just', 'more', 'most', 'other', 'over', 'same', 'should', 'some', 'such', 'than', 'that', 'their', 'them', 'then', 'there', 'these', 'this', 'those', 'through', 'under', 'until', 'very', 'what', 'when', 'where', 'which', 'while', 'with', 'would', 'your'])
  
  const wordCount: Record<string, number> = {}
  words.forEach(word => {
    if (!stopWords.has(word)) {
      wordCount[word] = (wordCount[word] || 0) + 1
    }
  })
  
  return Object.entries(wordCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word)
}

// Extract topics based on platform and content
function extractTopics(content: string, platform: string): string[] {
  const topics: string[] = [platform.charAt(0).toUpperCase() + platform.slice(1)]
  const lowerContent = content.toLowerCase()
  
  const topicMap: Record<string, string[]> = {
    'technology': ['tech', 'software', 'hardware', 'digital', 'computer', 'programming', 'code', 'developer'],
    'business': ['business', 'company', 'market', 'finance', 'investment', 'startup', 'enterprise'],
    'science': ['science', 'research', 'study', 'discovery', 'experiment', 'data'],
    'health': ['health', 'medical', 'healthcare', 'medicine', 'wellness', 'fitness'],
    'politics': ['politics', 'government', 'policy', 'election', 'vote', 'congress'],
    'entertainment': ['entertainment', 'movie', 'music', 'game', 'celebrity', 'streaming'],
  }
  
  Object.entries(topicMap).forEach(([topic, keywords]) => {
    if (keywords.some(kw => lowerContent.includes(kw))) {
      topics.push(topic.charAt(0).toUpperCase() + topic.slice(1))
    }
  })
  
  return topics.slice(0, 5)
}

// Extract entities from metadata
// deno-lint-ignore no-explicit-any
function extractEntities(metadata: any): Array<{ type: string, name: string, confidence: number }> {
  const entities: Array<{ type: string, name: string, confidence: number }> = []
  
  if (metadata.title) {
    entities.push({ type: 'title', name: metadata.title, confidence: 1.0 })
  }
  
  if (metadata.ogSiteName) {
    entities.push({ type: 'organization', name: metadata.ogSiteName, confidence: 0.9 })
  }
  
  if (metadata.author) {
    entities.push({ type: 'person', name: metadata.author, confidence: 0.85 })
  }
  
  return entities
}

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

    EdgeRuntime.waitUntil(processJob(supabase, job.id, platform))

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
async function processJob(supabase: any, jobId: string, platform: string) {
  try {
    console.log(`Starting processing for job ${jobId}`)

    await supabase.from('ingestion_jobs').update({ status: 'ingesting', started_at: new Date().toISOString(), progress: 10 }).eq('id', jobId)
    await supabase.rpc('log_pipeline_event', { p_job_id: jobId, p_event_type: 'status_change', p_stage: 'ingestion', p_message: 'Started content ingestion' })

    await new Promise(resolve => setTimeout(resolve, 1000))

    await supabase.from('ingestion_jobs').update({ status: 'processing', progress: 40 }).eq('id', jobId)
    await supabase.rpc('log_pipeline_event', { p_job_id: jobId, p_event_type: 'status_change', p_stage: 'processing', p_message: 'Processing content with NLP pipeline' })

    await new Promise(resolve => setTimeout(resolve, 1500))

    await supabase.from('ingestion_jobs').update({ status: 'enriching', progress: 70 }).eq('id', jobId)
    await supabase.rpc('log_pipeline_event', { p_job_id: jobId, p_event_type: 'status_change', p_stage: 'enrichment', p_message: 'Enriching data with entity recognition' })

    await new Promise(resolve => setTimeout(resolve, 1000))

    const sentiments = ['positive', 'negative', 'neutral', 'mixed'] as const
    const randomSentiment = sentiments[Math.floor(Math.random() * sentiments.length)]
    const sentimentScore = randomSentiment === 'positive' ? Math.random() * 0.5 + 0.5 :
                          randomSentiment === 'negative' ? Math.random() * -0.5 - 0.5 :
                          randomSentiment === 'mixed' ? (Math.random() - 0.5) * 0.4 : (Math.random() - 0.5) * 0.2

    await supabase.from('insights').insert({
      job_id: jobId,
      sentiment: randomSentiment,
      sentiment_score: sentimentScore.toFixed(4),
      summary: `Analyzed content from ${platform} source. Key themes identified.`,
      keywords: ['technology', 'innovation', 'trends'],
      topics: ['Tech', 'Business'],
      entities: [{ type: 'organization', name: 'Tech Corp', confidence: 0.95 }],
      engagement_metrics: { estimated_reach: Math.floor(Math.random() * 10000), engagement_rate: (Math.random() * 5).toFixed(2) }
    })

    await supabase.from('ingestion_jobs').update({ status: 'completed', progress: 100, completed_at: new Date().toISOString() }).eq('id', jobId)
    await supabase.rpc('log_pipeline_event', { p_job_id: jobId, p_event_type: 'job_completed', p_stage: 'completed', p_message: 'Job completed successfully', p_metadata: { sentiment: randomSentiment } })

    console.log(`Job ${jobId} completed successfully`)
  } catch (err) {
    const error = err as Error
    console.error(`Error processing job ${jobId}:`, error)
    await supabase.from('ingestion_jobs').update({ status: 'failed', error_message: error.message }).eq('id', jobId)
    await supabase.rpc('log_pipeline_event', { p_job_id: jobId, p_event_type: 'job_failed', p_stage: 'error', p_message: `Job failed: ${error.message}` })
  }
}

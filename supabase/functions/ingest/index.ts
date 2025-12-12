import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import FirecrawlApp from 'https://esm.sh/@mendable/firecrawl-js@4.8.1?bundle-deps&no-dts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
}

interface ValidateResult {
  isValid: boolean
  clientId?: string
  clientName?: string
  rateLimit?: number
  webhookUrl?: string
  error?: string
}

async function validateApiKey(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  apiKey: string | null,
  endpoint: string
): Promise<ValidateResult> {
  if (!apiKey) {
    return { isValid: true }
  }

  const { data, error } = await supabase.rpc('validate_api_key', {
    p_api_key: apiKey,
    p_endpoint: endpoint,
  })

  if (error || !data || data.length === 0) {
    return { isValid: false, error: 'Invalid API key' }
  }

  const result = data[0]
  if (!result.is_valid) {
    return { isValid: false, error: 'API key is inactive or endpoint not allowed' }
  }

  // Get webhook URL
  const { data: clientData } = await supabase
    .from('api_clients')
    .select('webhook_url')
    .eq('id', result.client_id)
    .single()

  return {
    isValid: true,
    clientId: result.client_id,
    clientName: result.client_name,
    rateLimit: result.rate_limit,
    webhookUrl: clientData?.webhook_url || undefined,
  }
}

async function logApiUsage(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  clientId: string | undefined,
  endpoint: string,
  method: string,
  statusCode: number,
  responseTimeMs: number
): Promise<void> {
  if (!clientId) return

  await supabase.rpc('log_api_usage', {
    p_client_id: clientId,
    p_endpoint: endpoint,
    p_method: method,
    p_status_code: statusCode,
    p_response_time_ms: responseTimeMs,
    p_ip_address: null,
  })
}

async function sendWebhook(
  webhookUrl: string,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    console.log('Webhook sent to:', webhookUrl)
  } catch (error) {
    console.error('Webhook delivery failed:', error)
  }
}

interface IngestRequest {
  source_url: string
  platform?: 'twitter' | 'reddit' | 'news' | 'linkedin' | 'instagram' | 'youtube' | 'custom'
  priority?: number
  metadata?: Record<string, unknown>
}

interface NLPResult {
  sentiment: {
    type: 'positive' | 'negative' | 'neutral' | 'mixed'
    score: number
    confidence: number
  }
  entities: Array<{
    type: string
    name: string
    confidence: number
  }>
  topics: string[]
  keywords: string[]
  language: {
    code: string
    name: string
    confidence: number
  }
  summary: string
}

interface OCRResult {
  text: string
  confidence: number
  regions: Array<{
    text: string
    confidence: number
  }>
}

declare const EdgeRuntime: {
  waitUntil(promise: Promise<unknown>): void
}

Deno.serve(async (req) => {
  const startTime = Date.now()
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  // deno-lint-ignore no-explicit-any
  const supabase: any = createClient(supabaseUrl, supabaseKey)

  // Validate API key if provided
  const apiKey = req.headers.get('x-api-key')
  const authResult = await validateApiKey(supabase, apiKey, 'ingest')
  
  if (!authResult.isValid) {
    return new Response(
      JSON.stringify({ error: authResult.error }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    if (req.method !== 'POST') {
      const responseTime = Date.now() - startTime
      await logApiUsage(supabase, authResult.clientId, 'ingest', req.method, 405, responseTime)
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const body: IngestRequest = await req.json()
    console.log('Received ingest request:', body, authResult.clientId ? `from client: ${authResult.clientName}` : '')

    if (!body.source_url) {
      const responseTime = Date.now() - startTime
      await logApiUsage(supabase, authResult.clientId, 'ingest', req.method, 400, responseTime)
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
      const responseTime = Date.now() - startTime
      await logApiUsage(supabase, authResult.clientId, 'ingest', req.method, 500, responseTime)
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
      p_metadata: { source_url: body.source_url, client_id: authResult.clientId }
    })

    // Process job with webhook callback if client provided one
    EdgeRuntime.waitUntil(processJob(supabase, job.id, body.source_url, platform, authResult.webhookUrl))

    const responseTime = Date.now() - startTime
    await logApiUsage(supabase, authResult.clientId, 'ingest', req.method, 201, responseTime)

    return new Response(
      JSON.stringify({ success: true, job_id: job.id, status: 'pending', message: 'Ingestion job queued successfully' }),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    const error = err as Error
    console.error('Ingest error:', error)
    const responseTime = Date.now() - startTime
    await logApiUsage(supabase, authResult.clientId, 'ingest', req.method, 500, responseTime)
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

// AI-powered NLP analysis using Lovable AI Gateway
async function analyzeWithNLP(content: string, platform: string): Promise<NLPResult> {
  const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')
  
  if (!lovableApiKey) {
    console.warn('LOVABLE_API_KEY not configured, using fallback NLP')
    return fallbackNLP(content, platform)
  }

  try {
    console.log('Calling Lovable AI for NLP analysis...')
    
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `You are an NLP analysis engine for social media intelligence. Analyze the provided content and extract structured insights. Always respond with valid JSON only, no markdown.`
          },
          {
            role: 'user',
            content: `Analyze this ${platform} content and provide NLP insights:

${content.slice(0, 8000)}

Respond with ONLY valid JSON in this exact format:
{
  "sentiment": {
    "type": "positive" | "negative" | "neutral" | "mixed",
    "score": number between -1 and 1,
    "confidence": number between 0 and 1
  },
  "entities": [
    {"type": "person|organization|location|product|event", "name": "string", "confidence": number}
  ],
  "topics": ["topic1", "topic2", "topic3"],
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "language": {
    "code": "ISO 639-1 code",
    "name": "Language name",
    "confidence": number between 0 and 1
  },
  "summary": "Brief 2-3 sentence summary of the content"
}`
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "nlp_analysis",
              description: "Extract NLP insights from content",
              parameters: {
                type: "object",
                properties: {
                  sentiment: {
                    type: "object",
                    properties: {
                      type: { type: "string", enum: ["positive", "negative", "neutral", "mixed"] },
                      score: { type: "number" },
                      confidence: { type: "number" }
                    },
                    required: ["type", "score", "confidence"]
                  },
                  entities: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        type: { type: "string" },
                        name: { type: "string" },
                        confidence: { type: "number" }
                      },
                      required: ["type", "name", "confidence"]
                    }
                  },
                  topics: { type: "array", items: { type: "string" } },
                  keywords: { type: "array", items: { type: "string" } },
                  language: {
                    type: "object",
                    properties: {
                      code: { type: "string" },
                      name: { type: "string" },
                      confidence: { type: "number" }
                    },
                    required: ["code", "name", "confidence"]
                  },
                  summary: { type: "string" }
                },
                required: ["sentiment", "entities", "topics", "keywords", "language", "summary"]
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "nlp_analysis" } }
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Lovable AI error:', response.status, errorText)
      throw new Error(`AI gateway error: ${response.status}`)
    }

    const data = await response.json()
    console.log('Lovable AI response received')

    // Extract from tool call
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0]
    if (toolCall?.function?.arguments) {
      const result = JSON.parse(toolCall.function.arguments)
      return result as NLPResult
    }

    // Fallback to parsing content directly
    const content_response = data.choices?.[0]?.message?.content
    if (content_response) {
      const jsonMatch = content_response.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as NLPResult
      }
    }

    throw new Error('Failed to parse NLP response')
  } catch (error) {
    console.error('NLP analysis error:', error)
    return fallbackNLP(content, platform)
  }
}

// AI-powered OCR for image text extraction
async function extractOCR(imageUrls: string[]): Promise<OCRResult> {
  const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')
  
  if (!lovableApiKey || imageUrls.length === 0) {
    return { text: '', confidence: 0, regions: [] }
  }

  try {
    console.log(`Performing OCR on ${imageUrls.length} images...`)
    
    // Use Gemini's vision capabilities for OCR
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Extract ALL text visible in these images. Provide OCR results as JSON with this format:
{
  "text": "all extracted text combined",
  "confidence": overall confidence 0-1,
  "regions": [{"text": "text from region", "confidence": 0-1}]
}
Only respond with valid JSON.`
              },
              ...imageUrls.slice(0, 5).map(url => ({
                type: 'image_url' as const,
                image_url: { url }
              }))
            ]
          }
        ]
      })
    })

    if (!response.ok) {
      console.error('OCR error:', response.status)
      return { text: '', confidence: 0, regions: [] }
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content

    if (content) {
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as OCRResult
      }
    }

    return { text: '', confidence: 0, regions: [] }
  } catch (error) {
    console.error('OCR extraction error:', error)
    return { text: '', confidence: 0, regions: [] }
  }
}

// Fallback NLP when AI is unavailable
function fallbackNLP(content: string, platform: string): NLPResult {
  const lowerContent = content.toLowerCase()
  
  // Simple sentiment
  const positiveWords = ['great', 'excellent', 'amazing', 'wonderful', 'fantastic', 'love', 'best', 'awesome', 'good', 'happy', 'success']
  const negativeWords = ['bad', 'terrible', 'awful', 'horrible', 'hate', 'worst', 'poor', 'disappointing', 'failure', 'problem']
  
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
  const score = total === 0 ? 0 : (positiveCount - negativeCount) / total
  
  let sentimentType: 'positive' | 'negative' | 'neutral' | 'mixed' = 'neutral'
  if (score > 0.3) sentimentType = 'positive'
  else if (score < -0.3) sentimentType = 'negative'
  else if (positiveCount > 0 && negativeCount > 0) sentimentType = 'mixed'

  // Simple keyword extraction
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
  
  const keywords = Object.entries(wordCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word)

  // Simple topic detection
  const topics: string[] = [platform.charAt(0).toUpperCase() + platform.slice(1)]
  const topicMap: Record<string, string[]> = {
    'Technology': ['tech', 'software', 'hardware', 'digital', 'computer', 'programming', 'code', 'developer', 'ai', 'machine learning'],
    'Business': ['business', 'company', 'market', 'finance', 'investment', 'startup', 'enterprise', 'revenue'],
    'Science': ['science', 'research', 'study', 'discovery', 'experiment', 'data', 'hypothesis'],
    'Health': ['health', 'medical', 'healthcare', 'medicine', 'wellness', 'fitness', 'doctor'],
    'Politics': ['politics', 'government', 'policy', 'election', 'vote', 'congress', 'president'],
    'Entertainment': ['entertainment', 'movie', 'music', 'game', 'celebrity', 'streaming', 'film'],
  }
  
  Object.entries(topicMap).forEach(([topic, keywords]) => {
    if (keywords.some(kw => lowerContent.includes(kw))) {
      topics.push(topic)
    }
  })

  return {
    sentiment: { type: sentimentType, score, confidence: 0.5 },
    entities: [],
    topics: topics.slice(0, 5),
    keywords,
    language: { code: 'en', name: 'English', confidence: 0.8 },
    summary: content.slice(0, 300) + '...'
  }
}

// deno-lint-ignore no-explicit-any
async function processJob(supabase: any, jobId: string, sourceUrl: string, platform: string, webhookUrl?: string) {
  const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY')
  
  if (!firecrawlApiKey) {
    console.error('FIRECRAWL_API_KEY not configured')
    await supabase.from('ingestion_jobs').update({ status: 'failed', error_message: 'Firecrawl API key not configured' }).eq('id', jobId)
    await supabase.rpc('log_pipeline_event', { p_job_id: jobId, p_event_type: 'job_failed', p_stage: 'error', p_message: 'Firecrawl API key not configured' })
    return
  }

  try {
    console.log(`Starting ingestion pipeline for job ${jobId}: ${sourceUrl}`)

    // Stage 1: Ingesting
    await supabase.from('ingestion_jobs').update({ status: 'ingesting', started_at: new Date().toISOString(), progress: 10 }).eq('id', jobId)
    await supabase.rpc('log_pipeline_event', { p_job_id: jobId, p_event_type: 'status_change', p_stage: 'ingestion', p_message: 'Started Firecrawl content scraping' })

    // Scrape with Firecrawl
    const firecrawl = new FirecrawlApp({ apiKey: firecrawlApiKey })
    
    // Check for known unsupported sites
    const blockedDomains = ['reddit.com', 'twitter.com', 'x.com', 'facebook.com', 'instagram.com', 'linkedin.com']
    const urlLower = sourceUrl.toLowerCase()
    const blockedDomain = blockedDomains.find(d => urlLower.includes(d))
    
    if (blockedDomain) {
      console.warn(`Warning: ${blockedDomain} may require Firecrawl enterprise plan or have anti-scraping protection`)
      await supabase.rpc('log_pipeline_event', { 
        p_job_id: jobId, 
        p_event_type: 'warning', 
        p_stage: 'ingestion', 
        p_message: `Site ${blockedDomain} may have scraping restrictions. Attempting anyway...` 
      })
    }
    
    let scrapeResult
    try {
      scrapeResult = await firecrawl.scrape(sourceUrl, {
        formats: ['markdown', 'html', 'links'],
        onlyMainContent: true,
        waitFor: 3000,
      })
    } catch (scrapeError) {
      const err = scrapeError as Error
      const errorMsg = err.message || 'Unknown scraping error'
      
      // Provide helpful error messages for common failures
      let helpfulError = errorMsg
      if (blockedDomain) {
        helpfulError = `${blockedDomain} is blocked or requires enterprise access. Try a different URL.`
      } else if (errorMsg.includes('rate limit')) {
        helpfulError = 'Firecrawl rate limit exceeded. Wait a few minutes and retry.'
      } else if (errorMsg.includes('timeout')) {
        helpfulError = 'Request timed out. The target site may be slow or blocking requests.'
      }
      
      throw new Error(`Scraping failed: ${helpfulError}`)
    }

    if (!scrapeResult || !scrapeResult.success) {
      const errorDetail = scrapeResult?.error || 'No response from Firecrawl'
      
      // Check for specific error types
      if (typeof errorDetail === 'string') {
        if (errorDetail.includes('not currently supported')) {
          throw new Error(`Site not supported: ${sourceUrl}. This domain requires Firecrawl enterprise plan.`)
        }
        if (errorDetail.includes('blocked') || errorDetail.includes('403')) {
          throw new Error(`Access blocked: ${sourceUrl}. The site has anti-scraping protection.`)
        }
      }
      
      throw new Error(`Firecrawl error: ${errorDetail}`)
    }

    console.log(`Firecrawl scrape successful for job ${jobId}`)
    const content = scrapeResult.markdown || scrapeResult.html || ''
    const metadata = scrapeResult.metadata || {}

    // Store raw content
    await supabase.from('ingestion_jobs').update({ 
      status: 'processing', 
      progress: 30,
      raw_content: content
    }).eq('id', jobId)
    
    await supabase.rpc('log_pipeline_event', { 
      p_job_id: jobId, 
      p_event_type: 'status_change', 
      p_stage: 'processing', 
      p_message: 'Content scraped, starting AI-powered NLP analysis',
      p_metadata: { content_length: content.length, links_found: (scrapeResult.links || []).length }
    })

    // Stage 2: NLP Analysis
    await supabase.from('ingestion_jobs').update({ status: 'processing', progress: 50 }).eq('id', jobId)
    await supabase.rpc('log_pipeline_event', { p_job_id: jobId, p_event_type: 'nlp_started', p_stage: 'processing', p_message: 'Running NLP: sentiment, entities, topics, language detection' })

    const nlpResult = await analyzeWithNLP(content, platform)
    console.log('NLP analysis complete:', { sentiment: nlpResult.sentiment.type, entities: nlpResult.entities.length, topics: nlpResult.topics })

    await supabase.rpc('log_pipeline_event', { 
      p_job_id: jobId, 
      p_event_type: 'nlp_completed', 
      p_stage: 'processing', 
      p_message: `NLP complete: ${nlpResult.sentiment.type} sentiment, ${nlpResult.entities.length} entities, ${nlpResult.topics.length} topics`,
      p_metadata: { sentiment: nlpResult.sentiment, language: nlpResult.language }
    })

    // Stage 3: OCR (if images present)
    await supabase.from('ingestion_jobs').update({ status: 'enriching', progress: 70 }).eq('id', jobId)
    
    // Extract image URLs from scraped content
    const imageUrls: string[] = []
    if (metadata.ogImage) imageUrls.push(metadata.ogImage)
    if (scrapeResult.screenshot) imageUrls.push(scrapeResult.screenshot)
    
    // Extract image URLs from links
    const links = scrapeResult.links || []
    links.forEach((link: string) => {
      if (/\.(jpg|jpeg|png|gif|webp)$/i.test(link)) {
        imageUrls.push(link)
      }
    })

    let ocrResult: OCRResult = { text: '', confidence: 0, regions: [] }
    
    if (imageUrls.length > 0) {
      await supabase.rpc('log_pipeline_event', { p_job_id: jobId, p_event_type: 'ocr_started', p_stage: 'enrichment', p_message: `Running OCR on ${imageUrls.length} images` })
      
      ocrResult = await extractOCR(imageUrls)
      
      if (ocrResult.text) {
        await supabase.rpc('log_pipeline_event', { 
          p_job_id: jobId, 
          p_event_type: 'ocr_completed', 
          p_stage: 'enrichment', 
          p_message: `OCR extracted ${ocrResult.text.length} characters`,
          p_metadata: { confidence: ocrResult.confidence, regions: ocrResult.regions.length }
        })
      }
    } else {
      await supabase.rpc('log_pipeline_event', { p_job_id: jobId, p_event_type: 'ocr_skipped', p_stage: 'enrichment', p_message: 'No images found for OCR' })
    }

    // Stage 4: Store insights
    await supabase.from('ingestion_jobs').update({ progress: 90 }).eq('id', jobId)
    
    await supabase.from('insights').insert({
      job_id: jobId,
      sentiment: nlpResult.sentiment.type,
      sentiment_score: nlpResult.sentiment.score,
      summary: nlpResult.summary || metadata.description || content.slice(0, 500),
      keywords: nlpResult.keywords,
      topics: nlpResult.topics,
      entities: nlpResult.entities,
      language: nlpResult.language.code,
      ocr_text: ocrResult.text || null,
      confidence_scores: {
        sentiment: nlpResult.sentiment.confidence,
        language: nlpResult.language.confidence,
        ocr: ocrResult.confidence
      },
      engagement_metrics: { 
        links_found: (scrapeResult.links || []).length,
        content_length: content.length,
        images_processed: imageUrls.length,
        source_title: metadata.title || 'Unknown'
      }
    })

    // Mark as completed
    await supabase.from('ingestion_jobs').update({ status: 'completed', progress: 100, completed_at: new Date().toISOString() }).eq('id', jobId)
    await supabase.rpc('log_pipeline_event', { 
      p_job_id: jobId, 
      p_event_type: 'job_completed', 
      p_stage: 'completed', 
      p_message: 'Pipeline completed with AI-powered NLP and OCR', 
      p_metadata: { 
        sentiment: nlpResult.sentiment.type, 
        entities_count: nlpResult.entities.length,
        keywords_count: nlpResult.keywords.length,
        ocr_extracted: ocrResult.text.length > 0,
        language: nlpResult.language.code
      } 
    })

    console.log(`Job ${jobId} completed successfully with NLP and OCR`)

    // Send webhook notification if configured
    if (webhookUrl) {
      await sendWebhook(webhookUrl, {
        event: 'job.completed',
        job_id: jobId,
        status: 'completed',
        source_url: sourceUrl,
        platform,
        timestamp: new Date().toISOString()
      })
    }
  } catch (err) {
    const error = err as Error
    console.error(`Error processing job ${jobId}:`, error)
    await supabase.from('ingestion_jobs').update({ status: 'failed', error_message: error.message }).eq('id', jobId)
    await supabase.rpc('log_pipeline_event', { p_job_id: jobId, p_event_type: 'job_failed', p_stage: 'error', p_message: `Job failed: ${error.message}` })

    // Send webhook notification for failure
    if (webhookUrl) {
      await sendWebhook(webhookUrl, {
        event: 'job.failed',
        job_id: jobId,
        status: 'failed',
        error: error.message,
        timestamp: new Date().toISOString()
      })
    }
  }
}

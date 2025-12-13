import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const url = new URL(req.url)
    const isStream = url.pathname.endsWith('/stream')

    if (isStream) {
      // SSE streaming endpoint
      console.log('Starting SSE stream for events')

      const encoder = new TextEncoder()
      let lastEventId: string | null = null

      const stream = new ReadableStream({
        async start(controller) {
          // Send initial connection event
          controller.enqueue(encoder.encode(`event: connected\ndata: ${JSON.stringify({ message: 'Connected to event stream' })}\n\n`))

          // Poll for new events every 2 seconds
          const pollInterval = setInterval(async () => {
            try {
              let query = supabase
                .from('pipeline_events')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(10)

              if (lastEventId) {
                query = query.gt('id', lastEventId)
              }

              const { data: events, error } = await query

              if (error) {
                console.error('Error polling events:', error)
                return
              }

              if (events && events.length > 0) {
                lastEventId = events[0].id
                for (const event of events.reverse()) {
                  const sseMessage = `event: ${event.event_type}\ndata: ${JSON.stringify(event)}\n\n`
                  controller.enqueue(encoder.encode(sseMessage))
                }
              }
            } catch (pollError) {
              console.error('Polling error:', pollError)
            }
          }, 2000)

          // Keep connection alive with heartbeat
          const heartbeatInterval = setInterval(() => {
            controller.enqueue(encoder.encode(`: heartbeat\n\n`))
          }, 15000)

          // Clean up on close
          req.signal.addEventListener('abort', () => {
            clearInterval(pollInterval)
            clearInterval(heartbeatInterval)
            controller.close()
          })
        }
      })

      return new Response(stream, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/event-stream',
        }
      })
    }

    // Regular GET for recent events
    const jobId = url.searchParams.get('job_id')
    const limit = parseInt(url.searchParams.get('limit') || '50')

    console.log('Fetching events:', { jobId, limit })

    let query = supabase
      .from('pipeline_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (jobId) {
      query = query.eq('job_id', jobId)
    }

    const { data: events, error } = await query

    if (error) {
      console.error('Error fetching events:', error)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch events', details: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: true, data: events }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    const error = err as Error
    console.error('Events error:', error.message, error.stack)
    return new Response(
      JSON.stringify({ error: 'An error occurred processing your request.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

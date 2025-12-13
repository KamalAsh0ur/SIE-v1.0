import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const sieApiKeyId = Deno.env.get('SIE_API_KEY_ID');
    const sieApiKeySecret = Deno.env.get('SIE_API_KEY_SECRET');
    const sieApiUrl = Deno.env.get('SIE_API_URL');

    if (!sieApiKeyId || !sieApiKeySecret || !sieApiUrl) {
      console.error('Missing SIE API credentials');
      return new Response(
        JSON.stringify({ error: 'SIE API credentials not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { endpoint, method = 'GET', body } = await req.json();

    if (!endpoint) {
      return new Response(
        JSON.stringify({ error: 'Endpoint is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const url = `${sieApiUrl}${endpoint}`;
    console.log(`Making ${method} request to SIE API: ${url}`);

    const requestOptions: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key-ID': sieApiKeyId,
        'X-API-Key-Secret': sieApiKeySecret,
      },
    };

    if (body && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
      requestOptions.body = JSON.stringify(body);
    }

    const response = await fetch(url, requestOptions);
    const responseData = await response.json();

    console.log(`SIE API response status: ${response.status}`);

    return new Response(
      JSON.stringify({
        status: response.status,
        data: responseData,
      }),
      {
        status: response.ok ? 200 : response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: unknown) {
    console.error('Error calling SIE API:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

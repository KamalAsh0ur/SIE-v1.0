import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
};

interface ValidateResult {
  isValid: boolean;
  clientId?: string;
  clientName?: string;
  rateLimit?: number;
  error?: string;
}

export async function validateApiKey(
  req: Request,
  endpoint: string
): Promise<ValidateResult> {
  const apiKey = req.headers.get('x-api-key');
  
  // If no API key, allow through (for backward compatibility with anon key auth)
  if (!apiKey) {
    return { isValid: true };
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data, error } = await supabase.rpc('validate_api_key', {
    p_api_key: apiKey,
    p_endpoint: endpoint,
  });

  if (error || !data || data.length === 0) {
    return { isValid: false, error: 'Invalid API key' };
  }

  const result = data[0];
  if (!result.is_valid) {
    return { isValid: false, error: 'API key is inactive or endpoint not allowed' };
  }

  return {
    isValid: true,
    clientId: result.client_id,
    clientName: result.client_name,
    rateLimit: result.rate_limit,
  };
}

export async function logApiUsage(
  clientId: string | undefined,
  endpoint: string,
  method: string,
  statusCode: number,
  responseTimeMs: number,
  ipAddress?: string
): Promise<void> {
  if (!clientId) return;

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  await supabase.rpc('log_api_usage', {
    p_client_id: clientId,
    p_endpoint: endpoint,
    p_method: method,
    p_status_code: statusCode,
    p_response_time_ms: responseTimeMs,
    p_ip_address: ipAddress || null,
  });
}

export async function sendWebhook(
  webhookUrl: string,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.error('Webhook delivery failed:', error);
  }
}
import { supabase } from "@/integrations/supabase/client";

interface SIEApiResponse<T = unknown> {
  status: number;
  data: T;
}

interface SIEApiError {
  error: string;
  code?: string;
  message?: string;
}

type SIEMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export class SIENotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SIENotConfiguredError';
  }
}

/**
 * SIE API Client - Frontend service to interact with the external SIE API
 * through the sie-api edge function.
 */
export const sieApi = {
  /**
   * Check if SIE API is configured
   */
  async isConfigured(): Promise<boolean> {
    try {
      await this.request('/health', 'GET');
      return true;
    } catch (err) {
      if (err instanceof SIENotConfiguredError) {
        return false;
      }
      // Other errors might still mean it's configured but having issues
      return true;
    }
  },

  /**
   * Make a request to the SIE API
   */
  async request<T = unknown>(
    endpoint: string,
    method: SIEMethod = 'GET',
    body?: Record<string, unknown>
  ): Promise<SIEApiResponse<T>> {
    const { data, error } = await supabase.functions.invoke<SIEApiResponse<T> | SIEApiError>('sie-api', {
      body: { endpoint, method, body },
    });

    if (error) {
      throw new Error(error.message || 'Failed to call SIE API');
    }

    if (data && 'error' in data) {
      // Check for configuration error
      if ('code' in data && data.code === 'SIE_NOT_CONFIGURED') {
        throw new SIENotConfiguredError(data.message || 'SIE API not configured');
      }
      throw new Error(data.error);
    }

    return data as SIEApiResponse<T>;
  },

  /**
   * GET request to SIE API
   */
  async get<T = unknown>(endpoint: string): Promise<T> {
    const response = await this.request(endpoint, 'GET') as SIEApiResponse<T>;
    return response.data;
  },

  /**
   * POST request to SIE API
   */
  async post<T = unknown>(endpoint: string, body: Record<string, unknown>): Promise<T> {
    const response = await this.request(endpoint, 'POST', body) as SIEApiResponse<T>;
    return response.data;
  },

  /**
   * PUT request to SIE API
   */
  async put<T = unknown>(endpoint: string, body: Record<string, unknown>): Promise<T> {
    const response = await this.request(endpoint, 'PUT', body) as SIEApiResponse<T>;
    return response.data;
  },

  /**
   * PATCH request to SIE API
   */
  async patch<T = unknown>(endpoint: string, body: Record<string, unknown>): Promise<T> {
    const response = await this.request(endpoint, 'PATCH', body) as SIEApiResponse<T>;
    return response.data;
  },

  /**
   * DELETE request to SIE API
   */
  async delete<T = unknown>(endpoint: string): Promise<T> {
    const response = await this.request(endpoint, 'DELETE') as SIEApiResponse<T>;
    return response.data;
  },
};

/**
 * React Query hook helpers for SIE API
 */
export const sieApiKeys = {
  all: ['sie-api'] as const,
  endpoint: (endpoint: string) => [...sieApiKeys.all, endpoint] as const,
};

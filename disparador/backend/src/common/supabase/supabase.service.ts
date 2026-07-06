import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  private client: SupabaseClient;

  constructor(private config: ConfigService) {
    this.client = createClient(
      config.get<string>('SUPABASE_URL')!,
      config.get<string>('SUPABASE_SERVICE_ROLE_KEY')!, // service role bypassa RLS
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
  }

  get db(): SupabaseClient {
    return this.client;
  }

  /** Retorna cliente com anon key (respeita RLS) */
  anonClient(): SupabaseClient {
    return createClient(
      this.config.get<string>('SUPABASE_URL')!,
      this.config.get<string>('SUPABASE_ANON_KEY')!,
    );
  }
}

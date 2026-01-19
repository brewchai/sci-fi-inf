import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Create client only if env vars are present
let supabase: SupabaseClient | null = null;

if (supabaseUrl && supabaseAnonKey) {
    supabase = createClient(supabaseUrl, supabaseAnonKey);
}

// Export a getter function that throws if not configured
export function getSupabase(): SupabaseClient {
    if (!supabase) {
        throw new Error('Supabase is not configured. Check your environment variables.');
    }
    return supabase;
}

// Export for backward compatibility (pages may import this directly)
export { supabase };

export type Profile = {
    id: string;
    email: string;
    user_type: 'student' | 'professional' | 'researcher' | 'hobbyist' | null;
    age: number | null;
    interests: string[];
    subscription_status: 'trial' | 'active' | 'canceled' | 'expired';
    created_at: string;
};

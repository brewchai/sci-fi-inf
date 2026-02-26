'use client';

import { useState, useEffect } from 'react';
import { getSupabase } from '@/lib/supabase';

/**
 * Only renders children when the user is NOT logged in.
 * Used to hide signup/login CTAs for authenticated users.
 */
export function GuestOnly({ children }: { children: React.ReactNode }) {
    const [isGuest, setIsGuest] = useState<boolean | null>(null);

    useEffect(() => {
        async function checkAuth() {
            try {
                const supabase = getSupabase();
                const { data: { user } } = await supabase.auth.getUser();
                setIsGuest(!user);
            } catch {
                setIsGuest(true);
            }
        }
        checkAuth();
    }, []);

    // Don't render anything while checking (prevents flash)
    if (isGuest === null) return null;
    if (!isGuest) return null;

    return <>{children}</>;
}

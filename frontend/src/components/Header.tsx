'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { BookOpen } from 'lucide-react';
import { getSupabase } from '@/lib/supabase';
import styles from './Header.module.css';

export function Header() {
    const router = useRouter();
    const pathname = usePathname();
    const [user, setUser] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const checkUser = async () => {
            try {
                const { data: { user } } = await getSupabase().auth.getUser();
                setUser(user);
            } catch {
                setUser(null);
            } finally {
                setLoading(false);
            }
        };

        checkUser();

        // Listen for auth state changes
        const { data: { subscription } } = getSupabase().auth.onAuthStateChange(
            (_event, session) => {
                setUser(session?.user ?? null);
            }
        );

        return () => subscription.unsubscribe();
    }, []);

    const handleSignOut = async () => {
        await getSupabase().auth.signOut();
        router.push('/');
    };

    return (
        <header className={styles.header}>
            <div className={styles.headerInner}>
                <Link href="/" className={styles.logo}>
                    <span className={styles.logoIcon}>
                        <BookOpen size={18} />
                    </span>
                    The Eureka Feed
                </Link>

                <nav className={styles.nav}>
                    {!loading && (
                        user ? (
                            <>
                                <Link href="/feed" className={styles.navLink}>My Feed</Link>
                                {pathname !== '/feed' && <Link href="/episodes" className={styles.navLink}>Archive</Link>}
                                <Link href="/faq" className={styles.navLink}>FAQ</Link>
                                <button onClick={handleSignOut} className={styles.navLink}>
                                    Sign Out
                                </button>
                            </>
                        ) : (
                            <>
                                <Link href="/#how-it-works" className={styles.navLink}>How It Works</Link>
                                <Link href="/episodes" className={styles.navLink}>Archive</Link>
                                <Link href="/faq" className={styles.navLink}>FAQ</Link>
                                <Link href="/login" className={styles.navLink}>Start Listening</Link>
                            </>
                        )
                    )}
                </nav>
            </div>
        </header>
    );
}

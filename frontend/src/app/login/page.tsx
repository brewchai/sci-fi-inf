'use client';

import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { BookOpen, Mail, Check, Loader2 } from 'lucide-react';
import { getSupabase } from '@/lib/supabase';
import styles from './page.module.css';

function LoginForm() {
    const searchParams = useSearchParams();
    const isSignup = searchParams.get('signup') === 'true';
    const plan = searchParams.get('plan') || 'monthly';

    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const { error } = await getSupabase().auth.signInWithOtp({
                email,
                options: {
                    emailRedirectTo: `${window.location.origin}/onboarding`,
                },
            });

            if (error) throw error;
            setSuccess(true);
        } catch (err: any) {
            setError(err.message || 'Something went wrong. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <div className={styles.loginPage}>
                <div className={styles.loginCard}>
                    <Link href="/" className={styles.loginLogo}>
                        <BookOpen size={24} />
                        Eureka Brief
                    </Link>

                    <div className={styles.successMessage}>
                        <div className={styles.successIcon}>
                            <Mail size={28} />
                        </div>
                        <h2>Check your email</h2>
                        <p>
                            We sent a magic link to <strong>{email}</strong>.<br />
                            Click the link to sign in—no password needed.
                        </p>
                        <button
                            onClick={() => setSuccess(false)}
                            className="btn btn-secondary"
                        >
                            Use a different email
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.loginPage}>
            <div className={styles.loginCard}>
                <Link href="/" className={styles.loginLogo}>
                    <BookOpen size={24} />
                    Eureka Brief
                </Link>

                <h1 className={styles.loginTitle}>
                    {isSignup ? 'Create your account' : 'Welcome back'}
                </h1>
                <p className={styles.loginSubtitle}>
                    {isSignup
                        ? 'Start your journey into daily discoveries'
                        : 'Sign in to access your personalized feed'}
                </p>

                {error && <div className={styles.errorMessage}>{error}</div>}

                <form onSubmit={handleSubmit} className={styles.form}>
                    <div className={styles.inputGroup}>
                        <label htmlFor="email">Email address</label>
                        <input
                            id="email"
                            type="email"
                            placeholder="you@example.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            autoComplete="email"
                        />
                    </div>

                    <button
                        type="submit"
                        className={`btn btn-primary ${styles.submitBtn}`}
                        disabled={loading || !email}
                    >
                        {loading ? (
                            <>
                                <Loader2 size={18} className="spin" /> Sending link...
                            </>
                        ) : (
                            <>
                                <Mail size={18} /> Continue with Email
                            </>
                        )}
                    </button>
                </form>

                <div className={styles.divider}>or</div>

                <p className={styles.switchText}>
                    {isSignup ? (
                        <>Already have an account? <Link href="/login">Sign in</Link></>
                    ) : (
                        <>New here? <Link href="/login?signup=true">Create an account</Link></>
                    )}
                </p>
            </div>
        </div>
    );
}

export default function LoginPage() {
    return (
        <Suspense fallback={<div className={styles.loginPage}><Loader2 className="spin" /></div>}>
            <LoginForm />
        </Suspense>
    );
}

'use client';

import { useState } from 'react';
import { Send, ArrowLeft, CheckCircle } from 'lucide-react';
import Link from 'next/link';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { API_URL } from '@/lib/api';
import styles from './page.module.css';

export default function ContactPage() {
    const [email, setEmail] = useState('');
    const [message, setMessage] = useState('');
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [errorMessage, setErrorMessage] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setStatus('loading');
        setErrorMessage('');

        try {
            const res = await fetch(`${API_URL}/contact`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, message }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.detail || 'Something went wrong');
            }

            setStatus('success');
            setEmail('');
            setMessage('');
        } catch (err) {
            setStatus('error');
            setErrorMessage(err instanceof Error ? err.message : 'Something went wrong');
        }
    };

    return (
        <>
            <Header />
            <main className={styles.main}>
                <div className={styles.container}>
                    <Link href="/" className={styles.backLink}>
                        <ArrowLeft size={18} /> Back to Home
                    </Link>

                    <h1 className={styles.title}>Get in Touch</h1>
                    <p className={styles.subtitle}>
                        Questions, feedback, or just want to say hi? We'd love to hear from you.
                    </p>

                    {status === 'success' ? (
                        <div className={styles.successBox}>
                            <CheckCircle size={48} />
                            <h2>Message Sent!</h2>
                            <p>Thanks for reaching out. We'll get back to you soon.</p>
                            <Link href="/" className="btn btn-primary">
                                Back to Home
                            </Link>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className={styles.form}>
                            <div className={styles.field}>
                                <label htmlFor="email">Your Email</label>
                                <input
                                    id="email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="you@example.com"
                                    required
                                />
                            </div>

                            <div className={styles.field}>
                                <label htmlFor="message">Message</label>
                                <textarea
                                    id="message"
                                    value={message}
                                    onChange={(e) => setMessage(e.target.value)}
                                    placeholder="What's on your mind?"
                                    rows={5}
                                    required
                                />
                            </div>

                            {status === 'error' && (
                                <div className={styles.errorBox}>
                                    {errorMessage}
                                </div>
                            )}

                            <button
                                type="submit"
                                className="btn btn-primary btn-large"
                                disabled={status === 'loading'}
                            >
                                {status === 'loading' ? 'Sending...' : (
                                    <>Send Message <Send size={18} /></>
                                )}
                            </button>
                        </form>
                    )}
                </div>
            </main>
            <Footer />
        </>
    );
}

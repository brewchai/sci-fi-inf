'use client';

import { useState, useEffect } from 'react';
import { fetchHarvestedTweets, SocialPost } from '@/lib/api';
import Link from 'next/link';

export default function SecretHarvestPage() {
    const [posts, setPosts] = useState<SocialPost[]>([]);
    const [loading, setLoading] = useState(true);
    const [copiedId, setCopiedId] = useState<number | null>(null);

    useEffect(() => {
        const loadPosts = async () => {
            try {
                const data = await fetchHarvestedTweets();
                setPosts(data);
            } catch (error) {
                console.error('Failed to load tweets', error);
            } finally {
                setLoading(false);
            }
        };

        loadPosts();
    }, []);

    const copyToClipboard = async (content: string, id: number) => {
        try {
            await navigator.clipboard.writeText(content);
            setCopiedId(id);
            setTimeout(() => setCopiedId(null), 2000);
        } catch (err) {
            console.error('Failed to copy', err);
        }
    };

    if (loading) {
        return (
            <div style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#0a0a0f',
                color: '#d4a853'
            }}>
                Loading harvest...
            </div>
        );
    }

    const totalTweets = posts.reduce((acc, post) => {
        return acc + post.content.split('---').filter(t => t.trim().length > 0).length;
    }, 0);

    return (
        <div style={{ background: '#0a0a0f', minHeight: '100vh', color: '#f5f5f7', padding: '4rem 2rem' }}>
            <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
                <header style={{ marginBottom: '4rem', textAlign: 'center' }}>
                    <h1 style={{
                        fontFamily: "'Playfair Display', serif",
                        fontSize: '3rem',
                        marginBottom: '1rem',
                        color: '#d4a853'
                    }}>
                        The Harvest 🌾
                    </h1>
                    <p style={{ color: '#a0a0b0' }}>
                        {totalTweets} viral tweets ready for deployment (from {posts.length} papers).
                    </p>
                    <Link href="/feed" style={{ display: 'inline-block', marginTop: '1rem', color: '#6b6b7b', textDecoration: 'none' }}>
                        ← Back to minimal world
                    </Link>
                </header>

                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                    gap: '2rem'
                }}>
                    {posts.flatMap((post) =>
                        post.content.split('---')
                            .map(t => t.trim())
                            .filter(t => t.length > 0)
                            .map((tweetText, index) => (
                                <div key={`${post.id}-${index}`} style={{
                                    background: '#16161f',
                                    border: '1px solid rgba(255, 255, 255, 0.08)',
                                    borderRadius: '12px',
                                    padding: '1.5rem',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '1rem',
                                    transition: 'border-color 0.2s'
                                }}>
                                    <div style={{ fontSize: '0.75rem', color: '#d4a853', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        From: {post.paper_title.substring(0, 40)}...
                                    </div>

                                    <div style={{
                                        flex: 1,
                                        whiteSpace: 'pre-wrap',
                                        fontSize: '0.9375rem',
                                        lineHeight: '1.6',
                                        color: '#e5e5e5'
                                    }}>
                                        {tweetText}
                                    </div>

                                    <button
                                        onClick={() => copyToClipboard(tweetText, post.id * 100 + index)}
                                        style={{
                                            background: copiedId === (post.id * 100 + index) ? '#4ade80' : 'rgba(212, 168, 83, 0.1)',
                                            color: copiedId === (post.id * 100 + index) ? '#052e16' : '#d4a853',
                                            border: 'none',
                                            padding: '0.75rem',
                                            borderRadius: '8px',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            transition: 'all 0.2s',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '0.5rem'
                                        }}
                                    >
                                        {copiedId === (post.id * 100 + index) ? 'Copied!' : 'Copy Tweet'}
                                    </button>
                                </div>
                            ))
                    )}
                </div>
            </div>
        </div>
    );
}

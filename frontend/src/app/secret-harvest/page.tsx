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
                        {posts.length} viral tweets ready for deployment.
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
                    {posts.map((post) => (
                        <div key={post.id} style={{
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
                                From: {post.paper_title.substring(0, 50)}...
                            </div>

                            <div style={{
                                flex: 1,
                                whiteSpace: 'pre-wrap',
                                fontSize: '0.9375rem',
                                lineHeight: '1.6',
                                color: '#e5e5e5'
                            }}>
                                {post.content}
                            </div>

                            <button
                                onClick={() => copyToClipboard(post.content, post.id)}
                                style={{
                                    background: copiedId === post.id ? '#4ade80' : 'rgba(212, 168, 83, 0.1)',
                                    color: copiedId === post.id ? '#052e16' : '#d4a853',
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
                                {copiedId === post.id ? 'Copied!' : 'Copy Tweet'}
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

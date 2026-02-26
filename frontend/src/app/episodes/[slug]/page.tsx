'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowRight, Lock, ArrowLeft, BookOpen, Headphones, Loader2 } from 'lucide-react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import {
    fetchPublicEpisodeBySlug,
    fetchPublicEpisodeByDate,
    fetchEpisodeBySlug,
    PublicEpisode,
    PodcastEpisode,
} from '@/lib/api';
import { getSupabase } from '@/lib/supabase';
import styles from './page.module.css';

function formatDate(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
}

function formatDuration(seconds: number | null): string {
    if (!seconds) return '';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

// Unified episode shape for rendering
type EpisodeData = {
    title: string;
    episode_date: string;
    script: string | null;
    audio_url: string | null;
    duration_seconds: number | null;
    is_public: boolean; // true if full content available (either public or logged-in)
};

export default function EpisodePage() {
    const params = useParams();
    const slug = params.slug as string;
    const [episode, setEpisode] = useState<EpisodeData | null>(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);

    useEffect(() => {
        let cancelled = false;

        async function loadEpisode() {
            setLoading(true);
            const isDate = /^\d{4}-\d{2}-\d{2}$/.test(slug);

            // Step 1: Check if user is logged in
            let isLoggedIn = false;
            try {
                const supabase = getSupabase();
                const { data: { user } } = await supabase.auth.getUser();
                isLoggedIn = !!user;
            } catch {
                // Not logged in
            }

            // Step 2: If logged in, fetch full episode via authenticated endpoint
            if (isLoggedIn && !isDate) {
                try {
                    const fullEpisode: PodcastEpisode = await fetchEpisodeBySlug(slug);
                    if (!cancelled) {
                        setEpisode({
                            title: fullEpisode.title,
                            episode_date: fullEpisode.episode_date,
                            script: fullEpisode.script,
                            audio_url: fullEpisode.audio_url,
                            duration_seconds: fullEpisode.duration_seconds,
                            is_public: true, // Logged in = full access
                        });
                        setLoading(false);
                        return;
                    }
                } catch {
                    // Fall through to public endpoint
                }
            }

            // Step 3: Fall back to public endpoint
            try {
                const publicEp: PublicEpisode = isDate
                    ? await fetchPublicEpisodeByDate(slug)
                    : await fetchPublicEpisodeBySlug(slug);

                if (!cancelled) {
                    setEpisode({
                        title: publicEp.title,
                        episode_date: publicEp.episode_date,
                        script: publicEp.script,
                        audio_url: publicEp.audio_url,
                        duration_seconds: publicEp.duration_seconds,
                        is_public: publicEp.is_public,
                    });
                }
            } catch {
                if (!cancelled) setNotFound(true);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        loadEpisode();
        return () => { cancelled = true; };
    }, [slug]);

    // Loading state
    if (loading) {
        return (
            <>
                <Header />
                <main className={styles.main}>
                    <section className={styles.episodeSection}>
                        <div className={styles.gatedSection}>
                            <Loader2 size={32} className={styles.lockIcon} style={{ animation: 'spin 1s linear infinite' }} />
                            <p>Loading episode...</p>
                        </div>
                    </section>
                </main>
                <Footer />
                <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
            </>
        );
    }

    // Not found
    if (notFound || !episode) {
        return (
            <>
                <Header />
                <main className={styles.main}>
                    <section className={styles.episodeSection}>
                        <div className={styles.gatedSection}>
                            <h2>Episode Not Found</h2>
                            <p>We couldn&apos;t find an episode with this URL.</p>
                            <Link href="/episodes" className={styles.loginButton}>
                                Browse Episodes <ArrowRight size={18} />
                            </Link>
                        </div>
                    </section>
                </main>
                <Footer />
            </>
        );
    }

    const dateStr = episode.episode_date;

    // Gated episode — not logged in and episode is recent
    if (!episode.is_public) {
        return (
            <>
                <Header />
                <main className={styles.main}>
                    <section className={styles.episodeSection}>
                        <nav className={styles.breadcrumb}>
                            <Link href="/episodes">Episodes</Link>
                            <span>/</span>
                            <span>{formatDate(dateStr)}</span>
                        </nav>

                        <div className={styles.episodeHeader}>
                            <div className={styles.episodeDate}>{formatDate(dateStr)}</div>
                            <h1 className={styles.episodeTitle}>{episode.title}</h1>
                        </div>

                        <div className={styles.gatedSection}>
                            <Lock size={40} className={styles.lockIcon} />
                            <h2>This episode is exclusive</h2>
                            <p>Recent episodes are available to logged-in members. Log in to listen and read the full transcript.</p>
                            <Link href="/login" className={styles.loginButton}>
                                Log In to Listen <ArrowRight size={18} />
                            </Link>
                        </div>

                        <Link href="/episodes" className={styles.archiveLink}>
                            <ArrowLeft size={16} />
                            Browse free episodes in the archive
                        </Link>
                    </section>
                </main>
                <Footer />
            </>
        );
    }

    // Full episode content (logged in OR old public episode)
    const paragraphs = episode.script
        ? episode.script.split('\n').filter((p) => p.trim().length > 0)
        : [];

    return (
        <>
            <Header />
            <main className={styles.main}>
                <section className={styles.episodeSection}>
                    <nav className={styles.breadcrumb}>
                        <Link href="/episodes">Episodes</Link>
                        <span>/</span>
                        <span>{formatDate(dateStr)}</span>
                    </nav>

                    <div className={styles.episodeHeader}>
                        <div className={styles.episodeDate}>{formatDate(dateStr)}</div>
                        <h1 className={styles.episodeTitle}>{episode.title}</h1>
                        <div className={styles.episodeMeta}>
                            {episode.duration_seconds && (
                                <span>🎧 {formatDuration(episode.duration_seconds)}</span>
                            )}
                            <span>📖 Full transcript below</span>
                        </div>
                    </div>

                    {episode.audio_url && (
                        <div className={styles.audioSection}>
                            <audio
                                controls
                                preload="metadata"
                                className={styles.audioPlayer}
                                src={episode.audio_url}
                            >
                                Your browser does not support the audio element.
                            </audio>
                        </div>
                    )}

                    {paragraphs.length > 0 && (
                        <div className={styles.transcriptSection}>
                            <div className={styles.transcriptLabel}>Transcript</div>
                            <div className={styles.transcriptContent}>
                                {paragraphs.map((p, i) => (
                                    <p key={i}>{p}</p>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className={styles.ctaSection}>
                        <div className={styles.ctaCard}>
                            <BookOpen size={24} className={styles.ctaIcon} />
                            <h3>Read the source papers</h3>
                            <p>Sign up to access the original research papers discussed in this episode, with direct links and summaries.</p>
                            <Link href="/login" className={styles.ctaButton}>
                                Sign Up Free <ArrowRight size={16} />
                            </Link>
                        </div>
                        <div className={styles.ctaCard}>
                            <Headphones size={24} className={styles.ctaIcon} />
                            <h3>Get today&apos;s episode</h3>
                            <p>Members get new episodes every morning — the latest research delivered before your first coffee.</p>
                            <Link href="/login" className={styles.ctaButton}>
                                Start Listening <ArrowRight size={16} />
                            </Link>
                        </div>
                    </div>

                    <Link href="/episodes" className={styles.archiveLink}>
                        <ArrowLeft size={16} />
                        Back to episode archive
                    </Link>
                </section>
            </main>
            <Footer />
        </>
    );
}

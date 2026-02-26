import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Headphones, FileText, Lock } from 'lucide-react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { GuestOnly } from '@/components/GuestOnly';
import { fetchPublicEpisodes } from '@/lib/api';
import styles from './page.module.css';

export const metadata: Metadata = {
    title: 'Episode Archive | The Eureka Feed',
    description: 'Browse past episodes of The Eureka Feed — daily science research explained in 3 minutes. Full transcripts and audio available.',
    alternates: {
        canonical: 'https://www.theeurekafeed.com/episodes',
    },
};

function formatDate(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}

function getPreview(script: string | null): string {
    if (!script) return 'Listen to this episode for the full story.';
    // Grab first meaningful sentence from the transcript
    const lines = script.split('\n').filter(l => l.trim().length > 30);
    const first = lines[0] || script.substring(0, 200);
    return first.length > 160 ? first.substring(0, 157) + '...' : first;
}

function formatDuration(seconds: number | null): string {
    if (!seconds) return '~3 min';
    const m = Math.floor(seconds / 60);
    return `${m} min`;
}

export const dynamic = 'force-dynamic';

export default async function EpisodesPage() {
    let episodes: Awaited<ReturnType<typeof fetchPublicEpisodes>> = [];

    try {
        episodes = await fetchPublicEpisodes();

        // Limit to specific 3 samples as requested
        const targetTitles = [
            "AI Predicts Neurotoxicity from Molecular Clues",
            "Unraveling Cosmic Mysteries: The UFO Forest Revealed",
            "Unlocking High-Performance Solar Cells with 2D Seeds"
        ];

        episodes = episodes.filter(ep => targetTitles.includes(ep.title));
    } catch {
        // API might be down
    }

    return (
        <>
            <Header />
            <main className={styles.main}>
                {/* Hero */}
                <section className={styles.heroSection}>
                    <h1>Episode Archive</h1>
                    <p className={styles.heroSub}>
                        Every episode with full transcripts and audio — free and open.
                    </p>
                </section>

                {/* New Episodes CTA — only for guests */}
                <GuestOnly>
                    <section className={styles.ctaBanner}>
                        <div className={styles.ctaContent}>
                            <div className={styles.ctaIcon}><Lock size={20} /></div>
                            <div className={styles.ctaText}>
                                <strong>Want today&apos;s episode?</strong>
                                <span>The latest episodes are available exclusively to members. Sign up free to listen.</span>
                            </div>
                            <Link href="/login" className={styles.ctaButton}>
                                Get Access <ArrowRight size={16} />
                            </Link>
                        </div>
                    </section>
                </GuestOnly>

                {/* Episode List */}
                <section className={styles.archiveSection}>
                    {episodes.length > 0 ? (
                        <div className={styles.episodeList}>
                            {episodes.map((ep) => (
                                <Link
                                    key={ep.id}
                                    href={`/episodes/${ep.slug || ep.episode_date}`}
                                    className={styles.episodeCard}
                                >
                                    <div className={styles.episodeDateBadge}>
                                        {new Date(ep.episode_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                    </div>
                                    <div className={styles.episodeBody}>
                                        <h2 className={styles.episodeTitle}>{ep.title}</h2>
                                        <p className={styles.episodePreview}>{getPreview(ep.script)}</p>
                                        <div className={styles.episodeMeta}>
                                            <span className={styles.metaTag}>
                                                <Headphones size={14} />
                                                {formatDuration(ep.duration_seconds)}
                                            </span>
                                            {ep.script && (
                                                <span className={styles.metaTag}>
                                                    <FileText size={14} />
                                                    Transcript
                                                </span>
                                            )}
                                            <span className={styles.metaDate}>{formatDate(ep.episode_date)}</span>
                                        </div>
                                    </div>
                                    <ArrowRight size={18} className={styles.episodeArrow} />
                                </Link>
                            ))}
                        </div>
                    ) : (
                        <div className={styles.emptyState}>
                            <p>No archived episodes available yet. New episodes become public after 2 weeks.</p>
                        </div>
                    )}
                </section>
                {/* Join CTA — only for guests */}
                <GuestOnly>
                    <section className={styles.joinCta}>
                        <div className={styles.joinCtaInner}>
                            <Headphones size={36} className={styles.joinCtaIcon} />
                            <h2>Want access to every episode?</h2>
                            <p>
                                These 3 samples are just a taste. Members get a fresh research briefing
                                every morning — audio + full transcript, delivered daily.
                            </p>
                            <Link href="/login?signup=true" className={styles.joinCtaButton}>
                                Join Free — Start Listening <ArrowRight size={18} />
                            </Link>
                        </div>
                    </section>
                </GuestOnly>
            </main>
            <Footer />
        </>
    );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Lock, ArrowLeft, BookOpen, Headphones } from 'lucide-react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { fetchPublicEpisodeBySlug, fetchPublicEpisodeByDate } from '@/lib/api';
import styles from './page.module.css';

type Props = {
    params: { slug: string };
};

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

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { slug } = params;

    try {
        const episode = await fetchPublicEpisodeBySlug(slug);
        const formattedDate = formatDate(episode.episode_date);

        return {
            title: episode.title,
            description: `Listen to The Eureka Feed for ${formattedDate} — the latest academic research explained in 3 minutes. Full transcript included.`,
            openGraph: {
                title: episode.title,
                description: `The Eureka Feed — ${formattedDate}. Daily science research podcast with full transcript.`,
                url: `https://www.theeurekafeed.com/episodes/${slug}`,
                type: 'article',
            },
            alternates: {
                canonical: `https://www.theeurekafeed.com/episodes/${slug}`,
            },
        };
    } catch {
        return {
            title: 'Episode Not Found',
            description: 'The Eureka Feed episode.',
        };
    }
}

export const dynamic = 'force-dynamic'; // always fetch fresh from backend

// JSON-LD structured data for a podcast episode
function EpisodeJsonLd({ title, dateStr, script, audioUrl, duration, slug }: {
    title: string;
    dateStr: string;
    script: string | null;
    audioUrl: string | null;
    duration: number | null;
    slug: string;
}) {
    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'PodcastEpisode',
        name: title,
        datePublished: dateStr,
        description: `Daily science research briefing for ${formatDate(dateStr)}. The latest academic papers explained in simple terms.`,
        url: `https://www.theeurekafeed.com/episodes/${slug}`,
        partOfSeries: {
            '@type': 'PodcastSeries',
            name: 'The Eureka Feed',
            url: 'https://www.theeurekafeed.com',
        },
        ...(audioUrl && {
            associatedMedia: {
                '@type': 'MediaObject',
                contentUrl: audioUrl,
                ...(duration && { duration: `PT${Math.floor(duration / 60)}M${duration % 60}S` }),
            },
        }),
        ...(script && {
            transcript: script.substring(0, 500) + '...',
        }),
    };

    return (
        <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
    );
}

export default async function EpisodePage({ params }: Props) {
    const { slug } = params;
    const isDate = /^\d{4}-\d{2}-\d{2}$/.test(slug);

    let episode;
    try {
        if (isDate) {
            episode = await fetchPublicEpisodeByDate(slug);
        } else {
            episode = await fetchPublicEpisodeBySlug(slug);
        }
    } catch {
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

    // We get dateStr from the episode itself now
    const dateStr = episode.episode_date;

    // Gated episode — show login CTA
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

    // Public episode — full content
    const paragraphs = episode.script
        ? episode.script.split('\n').filter((p) => p.trim().length > 0)
        : [];

    return (
        <>
            <EpisodeJsonLd
                title={episode.title}
                dateStr={dateStr}
                script={episode.script}
                audioUrl={episode.audio_url}
                duration={episode.duration_seconds}
                slug={slug}
            />
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

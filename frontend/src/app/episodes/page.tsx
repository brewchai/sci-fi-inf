import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { fetchPublicEpisodes } from '@/lib/api';
import styles from './page.module.css';

export const metadata: Metadata = {
    title: 'Episode Archive',
    description: 'Browse past episodes of The Eureka Feed — daily science research explained in 3 minutes. Full transcripts and audio available.',
    alternates: {
        canonical: 'https://www.theeurekafeed.com/episodes',
    },
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

export const revalidate = 3600; // revalidate every hour

export default async function EpisodesPage() {
    let episodes: Awaited<ReturnType<typeof fetchPublicEpisodes>> = [];

    try {
        episodes = await fetchPublicEpisodes();
    } catch {
        // API might be down during build
    }

    return (
        <>
            <Header />
            <main className={styles.main}>
                <section className={styles.archiveSection}>
                    <div className={styles.sectionHeader}>
                        <h1>Episode Archive</h1>
                        <p>Past episodes with full transcripts and audio</p>
                    </div>

                    {episodes.length > 0 ? (
                        <div className={styles.episodeList}>
                            {episodes.map((ep) => (
                                <Link
                                    key={ep.id}
                                    href={`/episodes/${ep.episode_date}`}
                                    className={styles.episodeCard}
                                >
                                    <div className={styles.episodeInfo}>
                                        <div className={styles.episodeTitle}>{ep.title}</div>
                                        <div className={styles.episodeDate}>{formatDate(ep.episode_date)}</div>
                                    </div>
                                    <ArrowRight size={18} className={styles.episodeArrow} />
                                </Link>
                            ))}
                        </div>
                    ) : (
                        <div className={styles.emptyState}>
                            <p>No archived episodes available yet. Check back soon!</p>
                        </div>
                    )}
                </section>
            </main>
            <Footer />
        </>
    );
}

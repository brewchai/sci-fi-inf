import type { Metadata } from 'next';
import { fetchPublicEpisodeBySlug, fetchPublicEpisodeByDate } from '@/lib/api';

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

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { slug } = params;

    try {
        const isDate = /^\d{4}-\d{2}-\d{2}$/.test(slug);
        const episode = isDate
            ? await fetchPublicEpisodeByDate(slug)
            : await fetchPublicEpisodeBySlug(slug);
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

export default function EpisodeLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}

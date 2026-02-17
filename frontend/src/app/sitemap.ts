import { MetadataRoute } from 'next';
import { fetchPublicEpisodes } from '@/lib/api';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const baseUrl = 'https://www.theeurekafeed.com';

    // Static pages
    const staticPages: MetadataRoute.Sitemap = [
        {
            url: baseUrl,
            lastModified: new Date(),
            changeFrequency: 'daily',
            priority: 1,
        },
        {
            url: `${baseUrl}/episodes`,
            lastModified: new Date(),
            changeFrequency: 'daily',
            priority: 0.8,
        },
        {
            url: `${baseUrl}/faq`,
            lastModified: new Date(),
            changeFrequency: 'monthly',
            priority: 0.5,
        },
        {
            url: `${baseUrl}/contact`,
            lastModified: new Date(),
            changeFrequency: 'monthly',
            priority: 0.3,
        },
        {
            url: `${baseUrl}/privacy`,
            lastModified: new Date('2026-01-15'),
            changeFrequency: 'yearly',
            priority: 0.2,
        },
        {
            url: `${baseUrl}/terms`,
            lastModified: new Date('2026-01-15'),
            changeFrequency: 'yearly',
            priority: 0.2,
        },
    ];

    // Dynamic episode pages
    let episodePages: MetadataRoute.Sitemap = [];
    try {
        const episodes = await fetchPublicEpisodes();
        episodePages = episodes.map((ep) => ({
            url: `${baseUrl}/episodes/${ep.episode_date}`,
            lastModified: new Date(ep.episode_date + 'T00:00:00'),
            changeFrequency: 'monthly' as const,
            priority: 0.7,
        }));
    } catch {
        // API might be down during build — static pages still get included
    }

    return [...staticPages, ...episodePages];
}

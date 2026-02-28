export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

export type Category = {
    slug: string;
    display_name: string;
    emoji: string;
    description: string;
};

export type Paper = {
    id: number;
    title: string;
    headline: string | null;
    eli5_summary: string | null;
    key_takeaways: string[];
    publication_date: string;
    curation_score: number | null;
    doi: string | null;
    pdf_url: string | null;
    why_it_matters: string;
    field: string;
    category: string | null;
};

export type PodcastEpisode = {
    id: number;
    episode_date: string;
    title: string;
    paper_ids: number[];
    script: string | null;
    audio_url: string | null;
    duration_seconds: number | null;
    status: string;
};

export type EpisodeDate = {
    id: number;
    episode_date: string;
    title: string;
    duration_seconds: number | null;
    slug: string | null;
};

export type CarouselSlide = {
    paper_id: number;
    category: string;
    headline: string;
    takeaways: string[];
};

export async function fetchCategories(): Promise<Category[]> {
    const res = await fetch(`${API_URL}/papers/categories`);
    if (!res.ok) throw new Error('Failed to fetch categories');
    return res.json();
}

export async function fetchLatestEdition(category?: string): Promise<Paper[]> {
    const url = category
        ? `${API_URL}/papers/latest-edition?category=${category}`
        : `${API_URL}/papers/latest-edition`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch papers');
    return res.json();
}

export async function fetchPaper(id: number): Promise<Paper> {
    const res = await fetch(`${API_URL}/papers/${id}`);
    if (!res.ok) throw new Error('Failed to fetch paper');
    return res.json();
}

export async function fetchLatestPodcast(): Promise<PodcastEpisode> {
    const res = await fetch(`${API_URL}/podcast/latest`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch latest podcast');
    return res.json();
}

export async function fetchPodcastEpisodes(limit: number = 20): Promise<PodcastEpisode[]> {
    const res = await fetch(`${API_URL}/podcast/list?limit=${limit}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch podcast episodes');
    return res.json();
}

export async function fetchPapers(ids: number[]): Promise<Paper[]> {
    const papers = await Promise.all(
        ids.map(async (id) => {
            try {
                const res = await fetch(`${API_URL}/papers/${id}`);
                if (!res.ok) return null;
                return res.json();
            } catch {
                return null;
            }
        })
    );
    return papers.filter((p): p is Paper => p !== null);
}

export async function fetchEpisodeDates(limit: number = 30): Promise<EpisodeDate[]> {
    const res = await fetch(`${API_URL}/podcast/dates?limit=${limit}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch episode dates');
    return res.json();
}

export async function fetchEpisodeById(id: number): Promise<PodcastEpisode> {
    const res = await fetch(`${API_URL}/podcast/${id}`);
    if (!res.ok) throw new Error('Failed to fetch episode');
    return res.json();
}

export async function fetchEpisodeBySlug(slug: string): Promise<PodcastEpisode> {
    const res = await fetch(`${API_URL}/podcast/by-slug/${slug}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch episode');
    return res.json();
}

export async function fetchCarouselSlides(episodeId: number): Promise<CarouselSlide[]> {
    const res = await fetch(`${API_URL}/podcast/${episodeId}/generate-carousel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store'
    });
    if (!res.ok) throw new Error('Failed to generate carousel slides');
    return res.json();
}

export async function fetchPaperCarouselContent(paperId: number): Promise<CarouselSlide> {
    const res = await fetch(`${API_URL}/podcast/paper/${paperId}/generate-carousel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store'
    });
    if (!res.ok) throw new Error('Failed to generate carousel slide for paper');
    return res.json();
}

// Public episode types/functions (for SEO pages)
export type PublicEpisode = {
    id: number;
    episode_date: string;
    title: string;
    script: string | null;
    audio_url: string | null;
    duration_seconds: number | null;
    slug: string | null;
    is_public: boolean;
};

export async function fetchPublicEpisodes(limit: number = 50): Promise<PublicEpisode[]> {
    const res = await fetch(`${API_URL}/podcast/public?limit=${limit}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch public episodes');
    return res.json();
}

export async function fetchPublicEpisodeByDate(episodeDate: string): Promise<PublicEpisode> {
    const res = await fetch(`${API_URL}/podcast/public/${episodeDate}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch episode');
    return res.json();
}

export async function fetchPublicEpisodeBySlug(slug: string): Promise<PublicEpisode> {
    const res = await fetch(`${API_URL}/podcast/public/slug/${slug}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch episode');
    return res.json();
}
// Stats
export type PodcastStats = {
    episodes: number;
    papers_scanned: number;
};

export async function fetchPodcastStats(): Promise<PodcastStats> {
    try {
        const res = await fetch(`${API_URL}/podcast/stats`, { cache: 'no-store' });
        if (!res.ok) return { episodes: 0, papers_scanned: 25000 };
        return res.json();
    } catch {
        return { episodes: 0, papers_scanned: 25000 };
    }
}

// Social Harvesting
export interface SocialPost {
    id: number;
    content: string;
    paper_title: string;
    created_at: string;
}

export async function fetchHarvestedTweets(): Promise<SocialPost[]> {
    const res = await fetch(`${API_URL}/social/harvest`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch tweets');
    return res.json();
}

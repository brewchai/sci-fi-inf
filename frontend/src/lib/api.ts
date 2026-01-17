const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

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

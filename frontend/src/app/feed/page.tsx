'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
    BookOpen,
    ExternalLink,
    FileText,
    Loader2,
    Sparkles,
    ChevronRight
} from 'lucide-react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { fetchLatestEdition, Paper } from '@/lib/api';
import styles from './page.module.css';

const categories = [
    { slug: 'all', emoji: '✨', name: 'All Topics' },
    { slug: 'ai_tech', emoji: '🤖', name: 'AI & Tech' },
    { slug: 'health_medicine', emoji: '💊', name: 'Health' },
    { slug: 'brain_mind', emoji: '🧠', name: 'Brain' },
    { slug: 'climate_environment', emoji: '🌍', name: 'Climate' },
    { slug: 'biology', emoji: '🧬', name: 'Biology' },
    { slug: 'physics', emoji: '⚛️', name: 'Physics' },
    { slug: 'economics', emoji: '💰', name: 'Economics' },
];

function formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

export default function FeedPage() {
    const [papers, setPapers] = useState<Paper[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeCategory, setActiveCategory] = useState('all');

    useEffect(() => {
        async function loadPapers() {
            setLoading(true);
            try {
                const category = activeCategory === 'all' ? undefined : activeCategory;
                const data = await fetchLatestEdition(category);
                setPapers(data);
            } catch (error) {
                console.error('Error loading papers:', error);
                setPapers([]);
            } finally {
                setLoading(false);
            }
        }
        loadPapers();
    }, [activeCategory]);

    return (
        <>
            <Header />
            <main className={styles.feedPage}>
                <div className={styles.feedHeader}>
                    <div className={styles.feedHeaderInner}>
                        <div className={styles.greeting}>
                            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                        </div>
                        <h1 className={styles.feedTitle}>Today's Discoveries</h1>

                        <div className={styles.categoryFilters}>
                            {categories.map((cat) => (
                                <button
                                    key={cat.slug}
                                    className={`${styles.categoryChip} ${activeCategory === cat.slug ? styles.active : ''}`}
                                    onClick={() => setActiveCategory(cat.slug)}
                                >
                                    {cat.emoji} {cat.name}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className={styles.feedContent}>
                    {loading ? (
                        <div className={styles.loading}>
                            <Loader2 size={24} className={styles.spin} />
                            Loading discoveries...
                        </div>
                    ) : papers.length === 0 ? (
                        <div className={styles.emptyState}>
                            <div className={styles.emptyIcon}>
                                <BookOpen size={32} />
                            </div>
                            <h2>No papers yet</h2>
                            <p>Check back soon for fresh discoveries in this category.</p>
                        </div>
                    ) : (
                        <div className={styles.papersList}>
                            {papers.map((paper) => (
                                <article key={paper.id} className={styles.paperCard}>
                                    <div className={styles.paperMeta}>
                                        {paper.category && (
                                            <span className={styles.paperCategory}>
                                                {categories.find(c => c.slug === paper.category)?.emoji} {paper.field || paper.category}
                                            </span>
                                        )}
                                        <span>{formatDate(paper.publication_date)}</span>
                                    </div>

                                    <h2 className={styles.paperTitle}>
                                        {paper.headline || paper.title}
                                    </h2>

                                    {paper.eli5_summary && (
                                        <p className={styles.paperSummary}>{paper.eli5_summary}</p>
                                    )}

                                    {paper.key_takeaways && paper.key_takeaways.length > 0 && (
                                        <div className={styles.paperTakeaways}>
                                            <h4>Key Takeaways</h4>
                                            <ul>
                                                {paper.key_takeaways.map((takeaway, i) => (
                                                    <li key={i}>
                                                        <ChevronRight size={14} />
                                                        {takeaway}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}

                                    {paper.why_it_matters && (
                                        <p className={styles.paperSummary}>
                                            <strong style={{ color: 'var(--accent)' }}>Why it matters:</strong> {paper.why_it_matters}
                                        </p>
                                    )}

                                    <div className={styles.paperActions}>
                                        {paper.doi && (
                                            <a href={paper.doi} target="_blank" rel="noopener noreferrer">
                                                <ExternalLink size={16} /> View Original
                                            </a>
                                        )}
                                        {paper.pdf_url && (
                                            <a href={paper.pdf_url} target="_blank" rel="noopener noreferrer">
                                                <FileText size={16} /> Download PDF
                                            </a>
                                        )}
                                    </div>
                                </article>
                            ))}
                        </div>
                    )}
                </div>
            </main>
            <Footer />
        </>
    );
}

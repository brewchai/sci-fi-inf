'use client';

import { useState, useEffect, useRef } from 'react';
import html2canvas from 'html2canvas';
import { Download, Loader2, ArrowRight } from 'lucide-react';
import { fetchEpisodeDates, fetchEpisodeBySlug, fetchPapers, EpisodeDate, PodcastEpisode, Paper } from '@/lib/api';
import styles from './page.module.css';

export default function CarouselGenerator() {
    const slideRefs = useRef<(HTMLDivElement | null)[]>([]);

    const [episodesList, setEpisodesList] = useState<EpisodeDate[]>([]);
    const [selectedSlug, setSelectedSlug] = useState<string>('');

    const [episode, setEpisode] = useState<PodcastEpisode | null>(null);
    const [papers, setPapers] = useState<Paper[]>([]);

    const [loadingList, setLoadingList] = useState(true);
    const [loadingData, setLoadingData] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [downloading, setDownloading] = useState(false);

    useEffect(() => {
        async function init() {
            try {
                const dates = await fetchEpisodeDates(50);
                setEpisodesList(dates);
            } catch (err) {
                console.error(err);
                setError('Failed to load recent episodes. Check if the backend is running.');
            } finally {
                setLoadingList(false);
            }
        }
        init();
    }, []);

    useEffect(() => {
        if (!selectedSlug) {
            setEpisode(null);
            setPapers([]);
            return;
        }

        async function loadData() {
            try {
                setLoadingData(true);
                setError(null);

                // Fetch full episode details
                const ep = await fetchEpisodeBySlug(selectedSlug);
                setEpisode(ep);

                // Fetch associated papers
                if (ep.paper_ids && ep.paper_ids.length > 0) {
                    const fetchedPapers = await fetchPapers(ep.paper_ids);
                    setPapers(fetchedPapers);
                } else {
                    setPapers([]);
                }
            } catch (err) {
                console.error(err);
                setError('Failed to load data for the selected episode.');
            } finally {
                setLoadingData(false);
            }
        }
        loadData();
    }, [selectedSlug]);

    const handleDownloadAll = async () => {
        if (!slideRefs.current.length || !episode) return;
        setDownloading(true);

        try {
            const slugDate = episode.episode_date;
            for (let i = 0; i < slideRefs.current.length; i++) {
                const slideElement = slideRefs.current[i];
                if (!slideElement) continue;

                const canvas = await html2canvas(slideElement, {
                    scale: 2, // high resolution
                    useCORS: true,
                    backgroundColor: '#0a0a0f', // var(--bg-primary)
                });

                const dataUrl = canvas.toDataURL('image/png');
                const link = document.createElement('a');
                link.download = `carousel-${slugDate}-slide-${i + 1}.png`;
                link.href = dataUrl;
                link.click();

                // slight delay to prevent browser from blocking multiple rapid downloads
                await new Promise((resolve) => setTimeout(resolve, 500));
            }
        } catch (err) {
            console.error('Error generating images', err);
            alert('Failed to generate images. Check console for details.');
        } finally {
            setDownloading(false);
        }
    };

    const formatDate = (dateStr: string) => {
        const d = new Date(dateStr + 'T00:00:00');
        return d.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
    };

    return (
        <main className={styles.main}>
            <div className={styles.header}>
                <h1 className={styles.title}>Instagram Carousel Generator</h1>
                <p>Select an episode below to generate the template.</p>
            </div>

            <div className={styles.selectorContainer}>
                {loadingList ? (
                    <p><Loader2 size={16} className={styles.spinAnimation} style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '8px' }} /> Loading episodes...</p>
                ) : (
                    <select
                        className={styles.select}
                        value={selectedSlug}
                        onChange={(e) => setSelectedSlug(e.target.value)}
                    >
                        <option value="">-- Choose an episode --</option>
                        {episodesList.map(ep => (
                            <option key={ep.id} value={ep.slug || ep.episode_date}>
                                {formatDate(ep.episode_date)} - {ep.title}
                            </option>
                        ))}
                    </select>
                )}
            </div>

            {loadingData && (
                <div className={styles.loadingContainer}>
                    <Loader2 size={48} className={styles.spinAnimation} />
                    <h2>Loading episode data...</h2>
                </div>
            )}

            {error && !loadingData && (
                <div className={styles.errorContainer}>
                    <h2>Error</h2>
                    <p>{error}</p>
                </div>
            )}

            {episode && !loadingData && (
                <>
                    <div className={styles.controls}>
                        <button
                            className={styles.downloadButton}
                            onClick={handleDownloadAll}
                            disabled={downloading}
                        >
                            {downloading ? (
                                <><Loader2 size={20} className={styles.spinAnimation} /> Generating PNGs...</>
                            ) : (
                                <><Download size={20} /> Download All Slides</>
                            )}
                        </button>
                    </div>

                    <div className={styles.carouselContainer}>
                        {/* Cover Slide */}
                        <div
                            className={`${styles.slide} ${styles.coverSlide}`}
                            ref={(el) => { slideRefs.current[0] = el; }}
                        >
                            <div className={styles.slideBackground}></div>
                            <div className={styles.slideContent}>
                                <div className={styles.coverBrandName}>The Eureka Feed</div>
                                <div className={styles.coverEpisodeTitle}>{episode.title || 'Daily Scientific Discoveries'}</div>
                                <div className={styles.coverSubtitle}>{formatDate(episode.episode_date)}</div>

                                <div className={styles.slideFooter} style={{ justifyContent: 'center', marginTop: 'auto', border: 'none' }}>
                                    <div className={styles.footerSwipe}>Swipe to learn <ArrowRight size={24} /></div>
                                </div>
                            </div>
                        </div>

                        {/* Paper Slides */}
                        {papers.map((paper, idx) => (
                            <div
                                key={paper.id}
                                className={styles.slide}
                                ref={(el) => { slideRefs.current[idx + 1] = el; }}
                            >
                                <div className={styles.slideBackground}></div>
                                <div className={styles.slideContent}>
                                    <div className={styles.slideHeader}>
                                        <div className={styles.brandName}>The Eureka Feed</div>
                                        <div className={styles.slideCount}>{idx + 1} / {papers.length}</div>
                                    </div>

                                    {paper.category && <div className={styles.paperCategory}>{paper.category}</div>}

                                    <div className={styles.paperTitle}>
                                        {paper.headline || paper.title}
                                    </div>

                                    <ul className={styles.takeawaysList}>
                                        {paper.key_takeaways.slice(0, 3).map((takeaway, tkIdx) => (
                                            <li key={tkIdx} className={styles.takeawayItem}>
                                                <div className={styles.takeawayNumber}>{tkIdx + 1}</div>
                                                <div className={styles.takeawayText}>{takeaway}</div>
                                            </li>
                                        ))}
                                    </ul>

                                    <div className={styles.slideFooter}>
                                        <div className={styles.footerWebsite}>theeurekafeed.com</div>
                                        <div className={styles.footerSwipe}>
                                            {idx === papers.length - 1 ? 'Listen to the full episode' : <><ArrowRight size={24} /> Swipe</>}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </main>
    );
}

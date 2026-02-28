'use client';

import { useState, useEffect, useRef } from 'react';
import html2canvas from 'html2canvas';
import { Download, Loader2, ArrowRight, RefreshCw } from 'lucide-react';
import { fetchEpisodeDates, fetchEpisodeBySlug, fetchCarouselSlides, EpisodeDate, PodcastEpisode, CarouselSlide } from '@/lib/api';
import styles from './page.module.css';

export default function CarouselGenerator() {
    const slideRefs = useRef<(HTMLDivElement | null)[]>([]);

    const [episodesList, setEpisodesList] = useState<EpisodeDate[]>([]);
    const [selectedSlug, setSelectedSlug] = useState<string>('');

    const [episode, setEpisode] = useState<PodcastEpisode | null>(null);
    const [slides, setSlides] = useState<CarouselSlide[]>([]);

    const [loadingList, setLoadingList] = useState(true);
    const [loadingData, setLoadingData] = useState(false);
    const [regenerating, setRegenerating] = useState(false);
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

    async function loadData(forceRegenerate: boolean = false) {
        if (!selectedSlug) {
            setEpisode(null);
            setSlides([]);
            return;
        }

        try {
            if (forceRegenerate) {
                setRegenerating(true);
            } else {
                setLoadingData(true);
            }
            setError(null);

            // Fetch full episode details
            const ep = await fetchEpisodeBySlug(selectedSlug);
            setEpisode(ep);

            // Fetch dynamic on-the-fly slides via LLM
            if (ep.id) {
                const fetchedSlides = await fetchCarouselSlides(ep.id);
                setSlides(fetchedSlides);
            } else {
                setSlides([]);
            }
        } catch (err) {
            console.error(err);
            setError('Failed to load or generate data for the selected episode.');
        } finally {
            setLoadingData(false);
            setRegenerating(false);
        }
    }

    // Load when slug changes
    useEffect(() => {
        loadData(false);
    }, [selectedSlug]);

    const handleRegenerate = () => {
        loadData(true);
    };

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
                <p>Select an episode below to generate AI-tailored Instagram templates.</p>
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
                    <h2>Generating punchy slides with AI...</h2>
                    <p>This usually takes 5-10 seconds.</p>
                </div>
            )}

            {error && !loadingData && (
                <div className={styles.errorContainer}>
                    <h2>Error</h2>
                    <p>{error}</p>
                </div>
            )}

            {episode && !loadingData && slides.length > 0 && (
                <>
                    <div className={styles.controls} style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                        <button
                            className={styles.downloadButton}
                            onClick={handleRegenerate}
                            disabled={regenerating || downloading}
                            style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border)' }}
                        >
                            {regenerating ? (
                                <><Loader2 size={20} className={styles.spinAnimation} /> Thinking...</>
                            ) : (
                                <><RefreshCw size={20} /> Regenerate Text</>
                            )}
                        </button>
                        <button
                            className={styles.downloadButton}
                            onClick={handleDownloadAll}
                            disabled={downloading || regenerating}
                        >
                            {downloading ? (
                                <><Loader2 size={20} className={styles.spinAnimation} /> Generating PNGs...</>
                            ) : (
                                <><Download size={20} /> Download All Slides</>
                            )}
                        </button>
                    </div>

                    <div className={styles.carouselContainer} style={{ opacity: regenerating ? 0.5 : 1, transition: 'opacity 0.2s' }}>
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

                        {/* AI Generated Paper Slides */}
                        {slides.map((slide, idx) => (
                            <div
                                key={`${slide.paper_id}-${idx}`}
                                className={styles.slide}
                                ref={(el) => { slideRefs.current[idx + 1] = el; }}
                            >
                                <div className={styles.slideBackground}></div>
                                <div className={styles.slideContent}>
                                    <div className={styles.slideHeader}>
                                        <div className={styles.brandName}>The Eureka Feed</div>
                                        <div className={styles.slideCount}>{idx + 1} / {slides.length}</div>
                                    </div>

                                    {slide.category && <div className={styles.paperCategory}>{slide.category}</div>}

                                    <div className={styles.paperTitle} style={{ fontSize: slide.headline.length > 50 ? '3.2rem' : '4.2rem' }}>
                                        {slide.headline}
                                    </div>

                                    <ul className={styles.takeawaysList}>
                                        {slide.takeaways.map((takeaway, tkIdx) => (
                                            <li key={tkIdx} className={styles.takeawayItem}>
                                                <div className={styles.takeawayNumber}>{tkIdx + 1}</div>
                                                <div className={styles.takeawayText} style={{ fontSize: takeaway.length > 100 ? '2rem' : '2.2rem' }}>
                                                    {takeaway}
                                                </div>
                                            </li>
                                        ))}
                                    </ul>

                                    <div className={styles.slideFooter}>
                                        <div className={styles.footerWebsite}>theeurekafeed.com</div>
                                        <div className={styles.footerSwipe}>
                                            {idx === slides.length - 1 ? 'Listen to the full episode' : <><ArrowRight size={24} /> Swipe</>}
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

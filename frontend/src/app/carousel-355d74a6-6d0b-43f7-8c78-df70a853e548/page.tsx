'use client';

import { useState, useEffect, useRef } from 'react';
import html2canvas from 'html2canvas';
import { Download, Loader2, RefreshCw, FileText, Copy, Check, ArrowRight } from 'lucide-react';
import { fetchEpisodeDates, fetchEpisodeBySlug, fetchPapers, fetchPaperCarouselContent, EpisodeDate, PodcastEpisode, Paper, CarouselSlide } from '@/lib/api';
import styles from './page.module.css';

export default function CarouselGenerator() {
    const slideRefs = useRef<(HTMLDivElement | null)[]>([]);

    const [episodesList, setEpisodesList] = useState<EpisodeDate[]>([]);
    const [selectedSlug, setSelectedSlug] = useState<string>('');

    const [episode, setEpisode] = useState<PodcastEpisode | null>(null);
    const [papers, setPapers] = useState<Paper[]>([]);

    const [selectedPaperId, setSelectedPaperId] = useState<number | null>(null);
    const [slideData, setSlideData] = useState<CarouselSlide | null>(null);

    const [loadingList, setLoadingList] = useState(true);
    const [loadingPapers, setLoadingPapers] = useState(false);
    const [loadingSlide, setLoadingSlide] = useState(false);

    const [error, setError] = useState<string | null>(null);
    const [downloading, setDownloading] = useState(false);
    const [copied, setCopied] = useState(false);

    // Initial load of episodes
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

    // When episode changes, fetch papers
    useEffect(() => {
        async function loadEpisodePapers() {
            if (!selectedSlug) {
                setEpisode(null);
                setPapers([]);
                setSelectedPaperId(null);
                setSlideData(null);
                return;
            }

            try {
                setLoadingPapers(true);
                setError(null);
                setSelectedPaperId(null);
                setSlideData(null);

                const ep = await fetchEpisodeBySlug(selectedSlug);
                setEpisode(ep);

                if (ep.paper_ids && ep.paper_ids.length > 0) {
                    const fetchedPapers = await fetchPapers(ep.paper_ids);
                    setPapers(fetchedPapers);
                } else {
                    setPapers([]);
                }
            } catch (err) {
                console.error(err);
                setError('Failed to load papers for the selected episode.');
            } finally {
                setLoadingPapers(false);
            }
        }

        loadEpisodePapers();
    }, [selectedSlug]);

    // When a paper is selected (or regenerate is clicked), fetch the AI slide copy
    async function loadPaperSlide(paperId: number) {
        try {
            setLoadingSlide(true);
            setError(null);

            const slide = await fetchPaperCarouselContent(paperId);
            setSlideData(slide);
            setTimeout(() => { slideRefs.current = []; }, 0); // clear refs on new data
        } catch (err) {
            console.error(err);
            setError('Failed to generate slide content for this paper.');
        } finally {
            setLoadingSlide(false);
        }
    }

    const handleSelectPaper = (id: number) => {
        setSelectedPaperId(id);
        loadPaperSlide(id);
    };

    const handleRegenerate = () => {
        if (selectedPaperId) {
            loadPaperSlide(selectedPaperId);
        }
    };

    const handleCopy = () => {
        if (!slideData) return;
        const text = `🚨 New research just dropped!\n\n${slideData.headline}\n\n${slideData.caption || 'We break down the methodology, findings, and what it all means.'}\n\nListen to the full deep dive at theeurekafeed.com/episodes/${selectedSlug}\n\n#Science #Research #TheEurekaFeed`;
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleDownloadAll = async () => {
        if (!slideRefs.current.length || !slideData) return;
        setDownloading(true);

        try {
            const files: File[] = [];
            const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

            for (let i = 0; i < slideRefs.current.length; i++) {
                const slideElement = slideRefs.current[i];
                if (!slideElement) continue;

                // Create a pristine, isolated container to prevent html2canvas bounds/scaling issues
                const cloneContainer = document.createElement('div');
                Object.assign(cloneContainer.style, {
                    position: 'fixed',
                    top: '0',
                    left: '0',
                    width: '1080px',
                    height: '1080px',
                    zIndex: '-9999',
                    opacity: '0.001',
                    pointerEvents: 'none'
                });

                const clone = slideElement.cloneNode(true) as HTMLElement;
                Object.assign(clone.style, {
                    transform: 'none',
                    position: 'relative',
                    top: '0', left: '0', margin: '0',
                    boxShadow: 'none'
                });

                cloneContainer.appendChild(clone);
                document.body.appendChild(cloneContainer);

                // Allow briefly for any DOM settling 
                await new Promise((resolve) => setTimeout(resolve, 50));

                const canvas = await html2canvas(clone, {
                    scale: 2, // high resolution 2160x2160 output
                    useCORS: true,
                    backgroundColor: '#0a0a0f', // var(--bg-primary)
                    logging: false
                });

                document.body.removeChild(cloneContainer);

                if (isMobile && typeof navigator.share === 'function') {
                    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
                    if (blob) {
                        files.push(new File([blob], `paper-${slideData.paper_id}-slide-${i + 1}.png`, { type: 'image/png' }));
                    }
                } else {
                    const dataUrl = canvas.toDataURL('image/png');
                    const link = document.createElement('a');
                    link.download = `paper-${slideData.paper_id}-slide-${i + 1}.png`;
                    link.href = dataUrl;
                    link.click();
                    await new Promise((resolve) => setTimeout(resolve, 500));
                }
            }

            if (isMobile && typeof navigator.share === 'function' && files.length > 0) {
                try {
                    await navigator.share({
                        files: files,
                        title: 'Instagram Carousel',
                        text: 'Instagram Carousel Slides',
                    });
                } catch (shareError) {
                    console.error('Error sharing', shareError);
                    // Fallback to auto-trigger download links if share is cancelled/fails
                    for (let i = 0; i < files.length; i++) {
                        const url = URL.createObjectURL(files[i]);
                        const link = document.createElement('a');
                        link.download = files[i].name;
                        link.href = url;
                        link.click();
                        URL.revokeObjectURL(url);
                        await new Promise((resolve) => setTimeout(resolve, 500));
                    }
                }
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
                <p>Generate meatier, multi-slide carousels for individual papers.</p>
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

            {loadingPapers && (
                <div className={styles.loadingContainer}>
                    <Loader2 size={32} className={styles.spinAnimation} />
                    <h2>Loading papers...</h2>
                </div>
            )}

            {/* Paper Selection Grid */}
            {episode && papers.length > 0 && !loadingPapers && (
                <div className={styles.paperSelectionGrid}>
                    <h3 style={{ gridColumn: '1 / -1', marginBottom: '1rem', color: 'var(--text-secondary)' }}>Select a paper to generate its carousel:</h3>
                    {papers.map((paper) => (
                        <button
                            key={paper.id}
                            className={`${styles.paperButton} ${selectedPaperId === paper.id ? styles.paperButtonActive : ''}`}
                            onClick={() => handleSelectPaper(paper.id)}
                        >
                            <FileText size={20} className={styles.paperIcon} />
                            <div className={styles.paperButtonTitle}>{paper.title}</div>
                        </button>
                    ))}
                </div>
            )}

            {loadingSlide && (
                <div className={styles.loadingContainer}>
                    <Loader2 size={48} className={styles.spinAnimation} />
                    <h2>Cooking up the hook and takeaways...</h2>
                    <p>Writing meatier content with AI...</p>
                </div>
            )}

            {error && !loadingSlide && !loadingPapers && (
                <div className={styles.errorContainer}>
                    <h2>Error</h2>
                    <p>{error}</p>
                </div>
            )}

            {/* Slide Rendering */}
            {selectedPaperId && slideData && !loadingSlide && (
                <>
                    <div className={styles.copyContainer}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h3 style={{ margin: 0 }}>Instagram Caption</h3>
                            <button
                                onClick={handleCopy}
                                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}
                            >
                                {copied ? <Check size={16} color="var(--accent)" /> : <Copy size={16} />}
                                {copied ? <span style={{ color: 'var(--accent)' }}>Copied!</span> : 'Copy Text'}
                            </button>
                        </div>
                        <textarea
                            readOnly
                            className={styles.copyArea}
                            value={`🚨 New research just dropped!\n\n${slideData.headline}\n\n${slideData.caption || 'We break down the methodology, findings, and what it all means.'}\n\nListen to the full deep dive at theeurekafeed.com/episodes/${selectedSlug}\n\n#Science #Research #TheEurekaFeed`}
                        />
                    </div>

                    <div className={styles.controls} style={{ display: 'flex', gap: '1rem', justifyContent: 'center', margin: '0 0 3rem 0' }}>
                        <button
                            className={styles.regenerateButton}
                            onClick={handleRegenerate}
                            disabled={downloading}
                        >
                            <RefreshCw size={20} /> Regenerate Text
                        </button>
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

                    <div className={styles.carouselContainer} style={{ opacity: downloading ? 0.7 : 1, transition: 'opacity 0.2s' }}>

                        {/* Slide 1: The Hook / Headline Slide */}
                        <div className={styles.slideWrapper}>
                            <div
                                className={`${styles.slide} ${styles.hookSlide}`}
                                ref={(el) => { slideRefs.current[0] = el; }}
                            >
                                <div className={styles.slideBackground}></div>
                                <div className={styles.slideContent} style={{ justifyContent: 'center' }}>
                                    <div className={styles.slideHeader}>
                                        <div className={styles.brandName}>The Eureka Feed</div>
                                        <div className={styles.slideCount}>1 / {slideData.takeaways.length + 2}</div>
                                    </div>

                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                        <div className={styles.newResearchBadge}>🚨 New Research Just Dropped</div>
                                        {slideData.category && <div className={styles.paperCategory}>{slideData.category}</div>}
                                        <div className={styles.hookHeadline}>
                                            {slideData.headline}
                                        </div>
                                    </div>

                                    <div className={styles.slideFooter}>
                                        <div className={styles.footerWebsite}>theeurekafeed.com</div>
                                        <div className={styles.footerSwipe}>Swipe <ArrowRight size={24} /></div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Slides 2+: The Individual Takeaways */}
                        {slideData.takeaways.map((takeaway, idx) => (
                            <div className={styles.slideWrapper} key={`takeaway-${idx}`}>
                                <div
                                    className={styles.slide}
                                    ref={(el) => { slideRefs.current[idx + 1] = el; }}
                                >
                                    <div className={styles.slideBackground}></div>
                                    <div className={styles.slideContent}>
                                        <div className={styles.slideHeader}>
                                            <div className={styles.brandName}>The Eureka Feed</div>
                                            <div className={styles.slideCount}>{idx + 2} / {slideData.takeaways.length + 2}</div>
                                        </div>

                                        <div className={styles.standaloneTakeawayWrapper}>
                                            <div className={styles.standaloneTakeawayText}>
                                                {takeaway}
                                            </div>
                                        </div>

                                        <div className={styles.slideFooter}>
                                            <div className={styles.footerWebsite}>theeurekafeed.com</div>
                                            <div className={styles.footerSwipe}>
                                                Swipe <ArrowRight size={24} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}

                        {/* Final Slide: Static CTA */}
                        <div className={styles.slideWrapper}>
                            <div
                                className={styles.slide}
                                ref={(el) => { slideRefs.current[slideData.takeaways.length + 1] = el; }}
                            >
                                <div className={styles.slideBackground}></div>
                                <div className={styles.slideContent}>
                                    <div className={styles.slideHeader}>
                                        <div className={styles.brandName}>The Eureka Feed</div>
                                        <div className={styles.slideCount}>{slideData.takeaways.length + 2} / {slideData.takeaways.length + 2}</div>
                                    </div>

                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'center' }}>
                                        <div className={styles.hookHeadline} style={{ fontSize: '5.5rem', marginBottom: '40px' }}>
                                            Check description for more information about the paper 👇
                                        </div>

                                        <div style={{ padding: '60px 40px', background: 'rgba(100, 255, 218, 0.05)', borderRadius: '30px', border: '1px solid rgba(100, 255, 218, 0.15)' }}>
                                            <div style={{ color: 'var(--text-secondary)', fontSize: '2.8rem', marginBottom: '20px' }}>
                                                We drop the latest research every single day.
                                            </div>
                                            <div style={{ color: 'var(--accent)', fontSize: '3rem', fontWeight: '700', letterSpacing: '0.02em' }}>
                                                Follow @the.eureka.feed for more.
                                            </div>
                                        </div>
                                    </div>

                                    {/* Footer without Swipe */}
                                    <div className={styles.slideFooter}>
                                        <div className={styles.footerWebsite}>theeurekafeed.com</div>
                                        <div className={styles.footerSwipe} style={{ opacity: 0, pointerEvents: 'none' }}>
                                            Swipe <ArrowRight size={24} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </main>
    );
}

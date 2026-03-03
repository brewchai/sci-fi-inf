'use client';

import { useState, useEffect, useRef } from 'react';
import html2canvas from 'html2canvas';
import { Download, Loader2, RefreshCw, FileText, Copy, Check, ArrowRight, Music } from 'lucide-react';
import { fetchEpisodeDates, fetchEpisodeBySlug, fetchPapers, fetchPaperCarouselContent, generateAudiogramSlide, EpisodeDate, PodcastEpisode, Paper, CarouselSlide } from '@/lib/api';
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

    // Audiogram state
    const [audiogramUrl, setAudiogramUrl] = useState<string | null>(null);
    const [generatingAudiogramSlide, setGeneratingAudiogramSlide] = useState(false);
    const [audiogramError, setAudiogramError] = useState<string | null>(null);
    const [audioStart, setAudioStart] = useState(0);
    const [audioDuration, setAudioDuration] = useState(8);
    const [audiogramHeadline, setAudiogramHeadline] = useState('');

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
            // Auto-fill audiogram headline from slide data
            if (slide.headline) setAudiogramHeadline(slide.headline);
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

    // Audiogram generation
    const handleGenerateAudiogramSlide = async () => {
        if (!episode || !audiogramHeadline.trim()) return;
        setGeneratingAudiogramSlide(true);
        setAudiogramError(null);
        setAudiogramUrl(null);
        try {
            const result = await generateAudiogramSlide(
                episode.id,
                audiogramHeadline,
                slideData?.category || 'NEW RESEARCH',
                audioStart,
                audioDuration,
            );
            setAudiogramUrl(result.video_url);
        } catch (err: any) {
            setAudiogramError(err.message || 'Failed to generate audiogram');
        } finally {
            setGeneratingAudiogramSlide(false);
        }
    };

    // Parse transcript into sentences with estimated timestamps
    // Approx 150 words per minute = 2.5 words per second
    const transcriptSentences = (() => {
        if (!episode?.script) return [];
        const sentences = episode.script
            .split(/(?<=[.!?])\s+/)
            .filter(s => s.trim().length > 0);
        let wordsSoFar = 0;
        return sentences.map(sentence => {
            const startSec = Math.round(wordsSoFar / 2.5);
            const wordCount = sentence.split(/\s+/).length;
            wordsSoFar += wordCount;
            const endSec = Math.round(wordsSoFar / 2.5);
            return { text: sentence, startSec, endSec };
        });
    })();

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

                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'center', gap: '60px' }}>
                                        <div style={{ fontSize: '3.5rem', fontWeight: 600, color: '#ffffff', lineHeight: 1.3 }}>
                                            Check description for more information about the paper 👇
                                        </div>

                                        <div style={{ padding: '60px 50px', background: 'rgba(100, 255, 218, 0.05)', borderRadius: '30px', border: '1px solid rgba(100, 255, 218, 0.15)' }}>
                                            <div style={{ color: '#ffffff', fontSize: '3.2rem', fontWeight: 600, marginBottom: '30px', lineHeight: 1.3 }}>
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

            {/* Audiogram Generator — appears once an episode is selected (independent of slides) */}
            {episode && (
                <div style={{
                    marginTop: '3rem',
                    padding: '2rem',
                    background: 'var(--bg-secondary)',
                    borderRadius: '16px',
                    border: '1px solid var(--border)',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                        <Music size={24} style={{ color: 'var(--accent)' }} />
                        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Audiogram Slide 1</h2>
                    </div>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.95rem' }}>
                        Generate a video version of Slide 1 with your podcast audio and an animated waveform.
                        Click on any sentence in the transcript below to set the start time.
                    </p>

                    {/* Transcript viewer */}
                    {transcriptSentences.length > 0 && (
                        <div style={{ marginBottom: '1.5rem' }}>
                            <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem' }}>Episode Transcript</label>
                            <div style={{
                                maxHeight: '200px',
                                overflowY: 'auto',
                                padding: '1rem',
                                background: 'var(--bg-primary)',
                                borderRadius: '10px',
                                border: '1px solid var(--border)',
                                fontSize: '0.9rem',
                                lineHeight: 1.7,
                            }}>
                                {transcriptSentences.map((s, i) => {
                                    const isInRange = s.startSec >= audioStart && s.startSec < audioStart + audioDuration;
                                    return (
                                        <span
                                            key={i}
                                            onClick={() => setAudioStart(s.startSec)}
                                            style={{
                                                cursor: 'pointer',
                                                color: isInRange ? 'var(--accent)' : 'var(--text-secondary)',
                                                fontWeight: isInRange ? 600 : 400,
                                                transition: 'color 0.2s',
                                                borderBottom: isInRange ? '1px solid var(--accent)' : 'none',
                                            }}
                                            title={`Starts at ~${s.startSec}s`}
                                        >
                                            <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', opacity: 0.5, marginRight: '4px' }}>
                                                {Math.floor(s.startSec / 60)}:{String(s.startSec % 60).padStart(2, '0')}
                                            </span>
                                            {s.text}{' '}
                                        </span>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {!episode.audio_url ? (
                        <p style={{ color: '#ff6b6b' }}>⚠ This episode has no audio URL. Generate the podcast first.</p>
                    ) : (
                        <>
                            {/* Headline input */}
                            <div style={{ marginBottom: '1.5rem' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>Headline text</label>
                                <input
                                    type="text"
                                    value={audiogramHeadline}
                                    onChange={(e) => setAudiogramHeadline(e.target.value)}
                                    placeholder="Enter your headline for the audiogram..."
                                    style={{
                                        padding: '0.6rem 0.8rem',
                                        fontSize: '1rem',
                                        borderRadius: '8px',
                                        border: '1px solid var(--border)',
                                        background: 'var(--bg-primary)',
                                        color: 'var(--text-primary)',
                                        width: '100%',
                                        maxWidth: '500px',
                                        fontFamily: 'inherit',
                                    }}
                                />
                            </div>
                            <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>Start time (seconds)</label>
                                    <input
                                        type="number"
                                        min={0}
                                        step={1}
                                        value={audioStart}
                                        onChange={(e) => setAudioStart(Math.max(0, Number(e.target.value)))}
                                        style={{
                                            padding: '0.6rem 0.8rem',
                                            fontSize: '1rem',
                                            borderRadius: '8px',
                                            border: '1px solid var(--border)',
                                            background: 'var(--bg-primary)',
                                            color: 'var(--text-primary)',
                                            width: '120px',
                                            fontFamily: 'inherit',
                                        }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>Duration (seconds)</label>
                                    <input
                                        type="number"
                                        min={3}
                                        max={30}
                                        step={1}
                                        value={audioDuration}
                                        onChange={(e) => setAudioDuration(Math.min(30, Math.max(3, Number(e.target.value))))}
                                        style={{
                                            padding: '0.6rem 0.8rem',
                                            fontSize: '1rem',
                                            borderRadius: '8px',
                                            border: '1px solid var(--border)',
                                            background: 'var(--bg-primary)',
                                            color: 'var(--text-primary)',
                                            width: '120px',
                                            fontFamily: 'inherit',
                                        }}
                                    />
                                </div>
                            </div>
                            <button
                                onClick={handleGenerateAudiogramSlide}
                                disabled={generatingAudiogramSlide}
                                style={{
                                    padding: '0.75rem 1.5rem',
                                    fontSize: '1rem',
                                    fontWeight: 600,
                                    borderRadius: '10px',
                                    border: 'none',
                                    background: 'var(--accent)',
                                    color: '#000',
                                    cursor: generatingAudiogramSlide ? 'wait' : 'pointer',
                                    opacity: generatingAudiogramSlide ? 0.6 : 1,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                }}
                            >
                                {generatingAudiogramSlide ? (
                                    <><Loader2 size={18} className="animate-spin" /> Generating...</>
                                ) : (
                                    <><Music size={18} /> Generate Audiogram Slide</>
                                )}
                            </button>

                            {audiogramError && (
                                <p style={{ color: '#ff6b6b', marginTop: '1rem' }}>❌ {audiogramError}</p>
                            )}

                            {audiogramUrl && (
                                <div style={{ marginTop: '1.5rem' }}>
                                    <video
                                        src={audiogramUrl}
                                        controls
                                        autoPlay
                                        style={{
                                            width: '432px',
                                            height: '432px',
                                            borderRadius: '12px',
                                            background: '#000',
                                        }}
                                    />
                                    <div style={{ marginTop: '1rem' }}>
                                        <a
                                            href={audiogramUrl}
                                            download={`audiogram-slide1.mp4`}
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '0.5rem',
                                                padding: '0.6rem 1.2rem',
                                                background: 'var(--bg-tertiary)',
                                                color: 'var(--text-primary)',
                                                borderRadius: '8px',
                                                textDecoration: 'none',
                                                fontWeight: 600,
                                                fontSize: '0.95rem',
                                            }}
                                        >
                                            <Download size={16} /> Download Audiogram
                                        </a>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </main>
    );
}

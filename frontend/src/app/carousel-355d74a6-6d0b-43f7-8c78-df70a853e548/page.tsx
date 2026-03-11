'use client';

import { useState, useEffect, useRef } from 'react';
import html2canvas from 'html2canvas';
import { Download, Loader2, RefreshCw, FileText, Copy, Check, ArrowRight, Film, Sparkles, Award, GripVertical, X, Layers, ChevronDown, ChevronRight } from 'lucide-react';
import { fetchEpisodeDates, fetchEpisodeBySlug, fetchPapers, fetchPaperCarouselContent, generateReel, generateReelScript, extractVisualQueries, fetchVisuals, extractScenePrompts, compileAudioTimeline, generatePromptsFromAnchors, fetchTopPapers, fetchTopScientists, fetchDailyScience, analyzeTopPapers, analyzeDailyScience, generateImagePrompt, generateImage, fetchImageStyles, rewriteVoiceScript, EpisodeDate, PodcastEpisode, Paper, CarouselSlide, ImpactAnalysis, VisualClip, TimelinePrompt, AnchorWord, WordTimestamp, ImageStyle, API_BASE_URL } from '@/lib/api';
import styles from './page.module.css';

const CTA_PRESETS = [
    { label: 'Select a closing statement...', value: '' },
    { label: 'Peer-reviewed, faster than anyone', value: 'We bring you peer-reviewed research from the world\'s top institutions, faster than anyone else.' },
    { label: 'Leading researchers, delivered daily', value: 'Straight from leading researchers and reputable journals, delivered to you daily.' },
    { label: 'Harvard to Nature to MIT', value: 'From Harvard to Nature to MIT \u2014 we harvest the latest papers and bring them to you before anyone else.' },
    { label: 'Cutting-edge daily episodes', value: 'We turn cutting-edge research from top authors into daily episodes.' },
    { label: 'No clickbait, real science', value: 'No clickbait, just real science from real researchers. We deliver it faster than anyone.' },
];

const BACKGROUND_VIDEOS = [
    { label: 'None (Default Black/Grey)', value: '' },
    { label: 'Particle Flow (180623)', value: '180623-864656649.mp4' },
    { label: 'Abstract Lines (250463)', value: '250463.mov' },
    { label: 'Data Nodes (295773)', value: '295773.mov' },
    { label: 'Digital Grid (313598)', value: '313598.mp4' },
    { label: 'DVD Bounce (120s)', value: 'dvd-bounce-120s.mp4' },
    { label: 'DVD Bounce (10s Test)', value: 'dvd-bounce-10s.mp4' },
];

export default function CarouselGenerator() {
    const slideRefs = useRef<(HTMLDivElement | null)[]>([]);
    const audioPreviewRef = useRef<HTMLAudioElement | null>(null);
    const transitionTimelineRef = useRef<HTMLDivElement | null>(null);

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

    const [audioStart, setAudioStart] = useState(0);
    const [useHdTts, setUseHdTts] = useState(true);

    // Reel state
    const [reelUrl, setReelUrl] = useState<string | null>(null);
    const [generatingReel, setGeneratingReel] = useState(false);
    const [reelError, setReelError] = useState<string | null>(null);
    const [reelDuration, setReelDuration] = useState(30);
    const [reelHeadline, setReelHeadline] = useState('');
    const [reelScript, setReelScript] = useState('');
    const [generatingScript, setGeneratingScript] = useState(false);
    const [rewritingVoiceScript, setRewritingVoiceScript] = useState(false);
    const [closingStatement, setClosingStatement] = useState('');
    const [bgVideo, setBgVideo] = useState('');
    const [overlayVideo, setOverlayVideo] = useState('');
    const [reelVoice, setReelVoice] = useState('nova');
    const [searchQueries, setSearchQueries] = useState('');
    const [fetchingQueries, setFetchingQueries] = useState(false);

    // Advanced Reel AI Visuals State
    const [anchorTimeline, setAnchorTimeline] = useState<TimelinePrompt[]>([]);
    const [extractingTimeline, setExtractingTimeline] = useState(false);
    const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);
    const [audioPreviewDuration, setAudioPreviewDuration] = useState(0);
    const [audioPreviewCurrentTime, setAudioPreviewCurrentTime] = useState(0);
    const [draggingTransitionIdx, setDraggingTransitionIdx] = useState<number | null>(null);
    const [wordTimestamps, setWordTimestamps] = useState<WordTimestamp[]>([]);
    const [generatedReelImages, setGeneratedReelImages] = useState<string[]>([]);
    const [generatingReelImages, setGeneratingReelImages] = useState(false);
    const [anchorWords, setAnchorWords] = useState<AnchorWord[]>([]);
    const [generatingPrompts, setGeneratingPrompts] = useState(false);
    const [regeneratingImageIdx, setRegeneratingImageIdx] = useState<number | null>(null);
    const [visualStyle, setVisualStyle] = useState('photojournalism');
    const [imageStyles, setImageStyles] = useState<ImageStyle[]>([]);

    // Load style presets from backend on mount
    useEffect(() => {
        fetchImageStyles().then(result => {
            setImageStyles(result.styles);
            setVisualStyle(result.default);
        }).catch(() => { });
    }, []);

    // AI Image Generation Flow (Custom Tab)
    const [aiImagePrompt, setAiImagePrompt] = useState('');
    const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
    const [isGeneratingImage, setIsGeneratingImage] = useState(false);
    const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
    const [fetchedClips, setFetchedClips] = useState<VisualClip[]>([]);
    const [approvedClips, setApprovedClips] = useState<VisualClip[]>([]);
    const [fetchingVisuals, setFetchingVisuals] = useState(false);
    const [reelSpeed, setReelSpeed] = useState(1.0);
    const [elevenlabsStability, setElevenlabsStability] = useState(0.3);
    const [elevenlabsSimilarityBoost, setElevenlabsSimilarityBoost] = useState(0.75);
    const [elevenlabsStyle, setElevenlabsStyle] = useState(0.4);
    const [ttsProvider, setTtsProvider] = useState('openai');
    const [includeWaveform, setIncludeWaveform] = useState(true);

    // Engine Tabs & Inputs
    type EngineTab = 'latest' | 'top-papers' | 'top-scientists' | 'daily-science' | 'custom';
    const [activeTab, setActiveTab] = useState<EngineTab>('latest');
    const isCustomTab = activeTab === 'custom';

    useEffect(() => {
        if (!isCustomTab) return;
        const hasArchival = imageStyles.some(style => style.slug === 'archival_bw');
        if (!hasArchival) return;
        if (visualStyle === 'photojournalism') {
            setVisualStyle('archival_bw');
        }
    }, [isCustomTab, imageStyles, visualStyle]);

    // Custom tab state
    const [customCategory, setCustomCategory] = useState('SCIENCE');
    const [customYear, setCustomYear] = useState('');
    const [customCaption, setCustomCaption] = useState('');
    const [customSlidesReady, setCustomSlidesReady] = useState(false);

    const [engineCategory, setEngineCategory] = useState('ai_tech');
    const [engineStartDate, setEngineStartDate] = useState('');
    const [engineEndDate, setEngineEndDate] = useState('');
    const [engineQuery, setEngineQuery] = useState('');
    const [engineSort, setEngineSort] = useState('cited_by_count:desc');
    const [fetchingEngine, setFetchingEngine] = useState(false);

    // Impact analysis
    const [impactAnalysis, setImpactAnalysis] = useState<ImpactAnalysis | null>(null);
    const [analyzingImpact, setAnalyzingImpact] = useState(false);

    // Configurable slide title (badge text on Slide 1)
    const [slideTitle, setSlideTitle] = useState('');

    // Editable slide text (mirrors slideData, user can override)
    const [editedHeadline, setEditedHeadline] = useState('');
    const [editedTakeaways, setEditedTakeaways] = useState<string[]>([]);
    const [editedOutro, setEditedOutro] = useState('We highlight the most impactful research across every field.');
    const [editedOutroFollow, setEditedOutroFollow] = useState('Follow @the.eureka.feed for more.');
    const [showTag, setShowTag] = useState(true);

    // Collapsible section states
    const [isSlideSectionOpen, setIsSlideSectionOpen] = useState(true);
    const [isReelSectionOpen, setIsReelSectionOpen] = useState(true);
    const [isCustomInputOpen, setIsCustomInputOpen] = useState(true);

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

    const timelineDuration = Math.max(
        audioPreviewDuration,
        reelDuration,
        wordTimestamps.length > 0 ? wordTimestamps[wordTimestamps.length - 1].end : 0,
        anchorTimeline.length > 0 ? anchorTimeline[anchorTimeline.length - 1].start_time_seconds : 0
    );

    const normaliseTimelineWord = (word: string) => word.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '');

    const clampTransitionTime = (items: TimelinePrompt[], idx: number, proposedTime: number) => {
        const previousBound = idx > 0 ? items[idx - 1].start_time_seconds + 0.05 : 0;
        const nextBound = idx < items.length - 1 ? items[idx + 1].start_time_seconds - 0.05 : timelineDuration;
        if (nextBound <= previousBound) return previousBound;
        return Math.min(Math.max(proposedTime, previousBound), nextBound);
    };

    const syncAnchorWordAtIndex = (idx: number, snappedWord: WordTimestamp | null, snappedTime: number) => {
        setAnchorWords(prev => {
            if (idx >= prev.length) return prev;
            const next = [...prev];
            next[idx] = {
                ...next[idx],
                word: snappedWord ? normaliseTimelineWord(snappedWord.word) || next[idx].word : next[idx].word,
                start_time_seconds: snappedTime,
                end_time_seconds: snappedWord ? snappedWord.end : next[idx].end_time_seconds,
            };
            return next;
        });
    };

    const updateTransitionFromTime = (idx: number, rawTime: number) => {
        let snappedWordForSync: WordTimestamp | null = null;
        let snappedTimeForSync = rawTime;

        setAnchorTimeline(prev => {
            if (idx < 0 || idx >= prev.length) return prev;
            const next = [...prev];
            const clampedTime = clampTransitionTime(next, idx, rawTime);
            let snappedTime = clampedTime;
            let snappedWord: WordTimestamp | null = null;

            if (wordTimestamps.length > 0) {
                const previousBound = idx > 0 ? next[idx - 1].start_time_seconds + 0.05 : 0;
                const nextBound = idx < next.length - 1 ? next[idx + 1].start_time_seconds - 0.05 : timelineDuration;
                const candidates = wordTimestamps.filter(w => w.start >= previousBound && w.start <= nextBound);
                const pool = candidates.length > 0 ? candidates : wordTimestamps;
                snappedWord = pool.reduce((best, current) => {
                    return Math.abs(current.start - clampedTime) < Math.abs(best.start - clampedTime) ? current : best;
                }, pool[0]);
                snappedTime = clampTransitionTime(next, idx, snappedWord.start);
            }

            next[idx] = {
                ...next[idx],
                start_time_seconds: snappedTime,
                anchor_word: snappedWord ? normaliseTimelineWord(snappedWord.word) || next[idx].anchor_word : next[idx].anchor_word,
            };

            snappedWordForSync = snappedWord;
            snappedTimeForSync = snappedTime;
            return next;
        });

        syncAnchorWordAtIndex(idx, snappedWordForSync, snappedTimeForSync);
    };

    const updateTransitionFromClientX = (idx: number, clientX: number) => {
        const track = transitionTimelineRef.current;
        if (!track || timelineDuration <= 0) return;
        const rect = track.getBoundingClientRect();
        const relativeX = Math.min(Math.max(clientX - rect.left, 0), rect.width);
        const relativeTime = (relativeX / rect.width) * timelineDuration;
        updateTransitionFromTime(idx, relativeTime);
    };

    useEffect(() => {
        if (draggingTransitionIdx === null) return;

        const handlePointerMove = (event: PointerEvent) => {
            updateTransitionFromClientX(draggingTransitionIdx, event.clientX);
        };

        const handlePointerUp = () => {
            setDraggingTransitionIdx(null);
        };

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);

        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
        };
    }, [draggingTransitionIdx, timelineDuration, wordTimestamps, anchorTimeline]);

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
            const slide = await fetchPaperCarouselContent(paperId, activeTab);
            setSlideData(slide);

            setEditedHeadline(slide.headline || '');
            setEditedTakeaways([...slide.takeaways]);
            setEditedOutro(
                activeTab === 'top-papers'
                    ? 'We highlight the most impactful research across every field.'
                    : activeTab === 'daily-science'
                        ? 'Science that shapes everyday life, explained in seconds.'
                        : activeTab === 'custom'
                            ? 'Science that matters, explained simply.'
                            : 'We drop the latest research every single day.'
            );
            setEditedOutroFollow('Follow @the.eureka.feed for more.');
            if (slide.headline) setReelHeadline(slide.headline);
            setTimeout(() => { slideRefs.current = []; }, 0);
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

    const handleFetchTopPapers = async () => {
        try {
            setFetchingEngine(true);
            setError(null);
            setSelectedPaperId(null);
            setSlideData(null);
            setImpactAnalysis(null);
            const fetched = await fetchTopPapers(engineCategory, engineStartDate, engineEndDate);
            setPapers(fetched);

            if (fetched.length > 0) {
                setAnalyzingImpact(true);
                try {
                    const analysis = await analyzeTopPapers(fetched.map(p => p.id));
                    setImpactAnalysis(analysis);
                } catch (err) {
                    console.error('Impact analysis failed:', err);
                } finally {
                    setAnalyzingImpact(false);
                }
            }
        } catch (err) {
            console.error(err);
            setError('Failed to fetch top papers.');
        } finally {
            setFetchingEngine(false);
        }
    };

    const handleFetchScientists = async () => {
        try {
            setFetchingEngine(true);
            setError(null);
            setSelectedPaperId(null);
            setSlideData(null);
            const fetched = await fetchTopScientists(engineQuery, engineSort);
            // Assuming this returns a list of papers representing their work for now
            setPapers(fetched);
        } catch (err) {
            console.error(err);
            setError('Failed to fetch scientists/papers.');
        } finally {
            setFetchingEngine(false);
        }
    };

    const handleFetchDailyScience = async () => {
        if (!engineQuery.trim()) return;
        setFetchingEngine(true);
        setError(null);
        try {
            const results = await fetchDailyScience(engineQuery, engineStartDate || undefined);
            setPapers(results);
            if (results.length > 0) {
                // Focus on top result
                setSelectedPaperId(results[0].id);
                const content = await fetchPaperCarouselContent(results[0].id);
                setSlideData(content);
                setEditedHeadline(content.headline);
                setEditedTakeaways(content.takeaways);
                setEditedOutro(
                    activeTab === 'top-papers'
                        ? 'We highlight the most impactful research across every field.'
                        : activeTab === 'daily-science'
                            ? 'Science that shapes everyday life, explained in seconds.'
                            : activeTab === 'custom'
                                ? 'Science that matters, explained simply.'
                                : 'We drop the latest research every single day.'
                );
                setEditedOutroFollow('Follow @the.eureka.feed for more.');
            }
        } catch (err) {
            console.error('Error fetching daily science', err);
            setError('Failed to fetch daily science papers');
        } finally {
            setFetchingEngine(false);
        }
    };

    // AI Image Generation Handlers
    const handleGenerateImagePrompt = async () => {
        // Collect text from headline and slide 2 (takeaway 1) for context
        const contextText = `${editedHeadline} ${editedTakeaways[0] || ''}`;
        if (!contextText.trim()) return;

        setIsGeneratingPrompt(true);
        try {
            const { prompt } = await generateImagePrompt(contextText);
            setAiImagePrompt(prompt);
        } catch (err) {
            console.error('Error generating image prompt', err);
            alert('Failed to generate prompt');
        } finally {
            setIsGeneratingPrompt(false);
        }
    };

    const handleGenerateImage = async () => {
        if (!aiImagePrompt.trim()) return;

        setIsGeneratingImage(true);
        try {
            const { image_url } = await generateImage(aiImagePrompt);
            // Prefix with backend host if needed, but our API returns /static/...
            // Since we're on localhost:3000 and backend is 8000
            const fullUrl = `http://localhost:8000${image_url}`;
            setGeneratedImageUrl(fullUrl);
        } catch (err) {
            console.error('Error generating image', err);
            alert('Failed to generate image. Did you add TOGETHER_API_KEYS?');
        } finally {
            setIsGeneratingImage(false);
        }
    };

    const buildCaptionText = () => {
        if (!slideData) return '';
        const selectedPaper = papers.find(p => p.id === selectedPaperId);
        const listenLine = selectedSlug ? `\n\nListen to the full deep dive at theeurekafeed.com/episodes/${selectedSlug}` : '';
        const paperLink = selectedPaper?.doi ? `\n\n📄 Read the paper: ${selectedPaper.doi}` : '';

        if (activeTab === 'top-papers') {
            const year = selectedPaper?.publication_date ? new Date(selectedPaper.publication_date).getFullYear() : '';
            const yearLine = year ? ` (${year})` : '';
            const fwci = selectedPaper?.metrics?.fwci as number | null;
            const fwciLine = fwci != null ? ` | FWCI ${fwci.toFixed(1)}` : '';
            return `🏆 Paper Highlight${yearLine}${fwciLine}\n\n${editedHeadline}\n\n${slideData.caption || 'We break down the methodology, findings, and what it all means.'}${paperLink}${listenLine}\n\n#Science #Research #PaperHighlight #TheEurekaFeed`;
        }

        if (activeTab === 'daily-science') {
            const tag = slideTitle.trim() || 'Daily Science';
            return `🔬 ${tag}\n\n${editedHeadline}\n\n${slideData.caption || 'We break down the methodology, findings, and what it all means.'}${paperLink}${listenLine}\n\n#Science #Research #DailyScience #TheEurekaFeed`;
        }

        return `🚨 New research just dropped!\n\n${editedHeadline}\n\n${slideData.caption || 'We break down the methodology, findings, and what it all means.'}${paperLink}${listenLine}\n\n#Science #Research #TheEurekaFeed`;
    };

    const handleCopy = () => {
        if (!slideData) return;
        navigator.clipboard.writeText(buildCaptionText());
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleDownloadAll = async () => {
        if (!slideRefs.current.length || (!slideData && activeTab !== 'custom')) return;
        setDownloading(true);

        try {
            const files: File[] = [];
            const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

            for (let i = 0; i < slideRefs.current.length; i++) {
                const slideElement = slideRefs.current[i];
                if (!slideElement) continue;

                const cloneContainer = document.createElement('div');
                Object.assign(cloneContainer.style, {
                    position: 'fixed',
                    top: '0',
                    left: '-2000px', // Off-screen instead of opacity
                    width: '1080px',
                    height: '1080px',
                    zIndex: '-9999',
                    opacity: '1', // Ensure full opacity
                    pointerEvents: 'none'
                });

                const clone = slideElement.cloneNode(true) as HTMLElement;
                Object.assign(clone.style, {
                    transform: 'none',
                    position: 'relative',
                    top: '0', left: '0', margin: '0',
                    boxShadow: 'none',
                    opacity: '1' // Force opacity on clone as well
                });
                // Force exact colors instead of relying on CSS vars catching during clone
                clone.style.backgroundColor = '#0a0a0f'; // Dark slide base
                clone.style.color = '#ffffff';

                // Preload background image as base64 to bypass html2canvas CORS/taint issues
                if (slideData?.imageUrl) {
                    try {
                        const bgDiv = clone.querySelector(`.${styles.slideBackground}`) as HTMLElement;
                        if (bgDiv) {
                            const oldBg = bgDiv.style.backgroundImage || window.getComputedStyle(bgDiv).backgroundImage;

                            const res = await fetch(slideData.imageUrl);
                            const blob = await res.blob();
                            const base64 = await new Promise<string>((resolve) => {
                                const reader = new FileReader();
                                reader.onloadend = () => resolve(reader.result as string);
                                reader.readAsDataURL(blob);
                            });

                            // Re-apply original background but swap the url() part
                            if (oldBg && oldBg !== 'none') {
                                // Find any url(...) and replace its contents with the base64 string
                                const newBg = oldBg.replace(/url\([^)]+\)/g, `url(${base64})`);
                                bgDiv.style.backgroundImage = newBg;
                            } else {
                                // Fallback if no existing gradient
                                bgDiv.style.backgroundImage = `url(${base64})`;
                            }
                            bgDiv.style.opacity = '1';
                        }
                    } catch (e) {
                        console.error('Failed to preload background image for canvas', e);
                    }
                }

                cloneContainer.appendChild(clone);
                document.body.appendChild(cloneContainer);

                // Allow briefly for any DOM settling 
                await new Promise((resolve) => setTimeout(resolve, 300)); // Doubled delay to 300ms

                const canvas = await html2canvas(clone, {
                    scale: 2, // high resolution 2160x2160 output
                    useCORS: true,
                    allowTaint: true,
                    backgroundColor: '#0a0a0f', // Explicitly dark instead of relying on CSS inheritance
                    logging: false,
                    width: 1080,
                    height: 1080,
                    windowWidth: 1080,
                    windowHeight: 1080
                });

                document.body.removeChild(cloneContainer);

                const filePrefix = slideData?.paper_id ? `paper-${slideData.paper_id}` : 'custom';
                if (isMobile && typeof navigator.share === 'function') {
                    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
                    if (blob) {
                        files.push(new File([blob], `${filePrefix}-slide-${i + 1}.png`, { type: 'image/png' }));
                    }
                } else {
                    const dataUrl = canvas.toDataURL('image/png');
                    const link = document.createElement('a');
                    link.download = `${filePrefix}-slide-${i + 1}.png`;
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
                <h1 className={styles.title}>Content Creation Engine</h1>
                <p>Generate meatier, multi-slide carousels and reels across all scientific verticals.</p>
            </div>

            <div className={styles.tabsContainer}>
                {(['latest', 'top-papers', 'top-scientists', 'daily-science', 'custom'] as const).map(tab => (
                    <button
                        key={tab}
                        className={activeTab === tab ? styles.tabActive : styles.tab}
                        onClick={() => {
                            if (activeTab === tab) return;
                            setActiveTab(tab);
                            setPapers([]);
                            setSelectedPaperId(null);
                            setSlideData(null);
                            setImpactAnalysis(null);
                            setReelUrl(null);
                            setReelScript('');
                            setReelHeadline('');
                            setSlideTitle('');
                            setEditedHeadline('');
                            setEditedTakeaways([]);
                            setCustomCaption('');
                            setCustomSlidesReady(false);
                            setCustomYear('');
                            setCustomCategory('SCIENCE');
                            setError(null);
                        }}
                    >
                        {tab === 'latest' ? 'Latest Research' : tab === 'top-papers' ? 'Top Papers' : tab === 'top-scientists' ? 'Top Scientists' : tab === 'daily-science' ? 'Daily Science' : 'Custom'}
                    </button>
                ))}
            </div>

            {activeTab === 'latest' && (
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
            )}

            {activeTab === 'top-papers' && (
                <div className={styles.engineFilters}>
                    <div className={styles.filterGroup}>
                        <label>Category / Field</label>
                        <select
                            className={styles.engineInput}
                            value={engineCategory}
                            onChange={(e) => setEngineCategory(e.target.value)}
                        >
                            <option value="ai_tech">AI & Technology</option>
                            <option value="health_medicine">Health & Medicine</option>
                            <option value="brain_mind">Brain & Mind</option>
                            <option value="climate_environment">Climate & Environment</option>
                            <option value="biology">Biology & Genetics</option>
                            <option value="physics">Physics & Space</option>
                        </select>
                    </div>
                    <div className={styles.filterGroup}>
                        <label>Start Year/Date</label>
                        <input
                            type="text"
                            className={styles.engineInput}
                            placeholder="e.g. 2015 or 2015-01-01"
                            value={engineStartDate}
                            onChange={(e) => setEngineStartDate(e.target.value)}
                        />
                    </div>
                    <div className={styles.filterGroup}>
                        <label>End Year/Date</label>
                        <input
                            type="text"
                            className={styles.engineInput}
                            placeholder="e.g. 2024"
                            value={engineEndDate}
                            onChange={(e) => setEngineEndDate(e.target.value)}
                        />
                    </div>
                    <button className={styles.engineButton} onClick={handleFetchTopPapers} disabled={fetchingEngine}>
                        {fetchingEngine ? <Loader2 size={16} className={styles.spinAnimation} /> : <Sparkles size={16} />}
                        Fetch Top Papers
                    </button>
                </div>
            )}

            {activeTab === 'top-scientists' && (
                <div className={styles.engineFilters}>
                    <div className={styles.filterGroup}>
                        <label>Scientist Name or Field</label>
                        <input
                            type="text"
                            className={styles.engineInput}
                            placeholder="e.g. Marie Curie or Physics"
                            value={engineQuery}
                            onChange={(e) => setEngineQuery(e.target.value)}
                        />
                    </div>
                    <div className={styles.filterGroup}>
                        <label>Sort By</label>
                        <select
                            className={styles.engineInput}
                            value={engineSort}
                            onChange={(e) => setEngineSort(e.target.value)}
                        >
                            <option value="cited_by_count:desc">Highest Impact (Citations)</option>
                            <option value="works_count:desc">Most Published (Works Count)</option>
                        </select>
                    </div>
                    <button className={styles.engineButton} onClick={handleFetchScientists} disabled={fetchingEngine}>
                        {fetchingEngine ? <Loader2 size={16} className={styles.spinAnimation} /> : <Sparkles size={16} />}
                        Fetch Scientists
                    </button>
                </div>
            )}

            {activeTab === 'daily-science' && (
                <div className={styles.engineFilters}>
                    <div className={styles.filterGroup}>
                        <label>Keywords / Concept</label>
                        <input
                            type="text"
                            className={styles.engineInput}
                            placeholder="e.g. Sleep, Nutrition, Caffeine"
                            value={engineQuery}
                            onChange={(e) => setEngineQuery(e.target.value)}
                        />
                    </div>
                    <div className={styles.filterGroup}>
                        <label>Start Year/Date</label>
                        <input
                            type="text"
                            className={styles.engineInput}
                            placeholder="Optional"
                            value={engineStartDate}
                            onChange={(e) => setEngineStartDate(e.target.value)}
                        />
                    </div>
                    <div className={styles.filterGroup}>
                        <label>Slide Title (Badge)</label>
                        <input
                            type="text"
                            className={styles.engineInput}
                            placeholder="e.g. Daily Science, Deep Dive, Did You Know?"
                            value={slideTitle}
                            onChange={(e) => setSlideTitle(e.target.value)}
                        />
                    </div>
                    <button className={styles.engineButton} onClick={handleFetchDailyScience} disabled={fetchingEngine}>
                        {fetchingEngine ? <Loader2 size={16} className={styles.spinAnimation} /> : <Sparkles size={16} />}
                        Fetch Papers
                    </button>
                </div>
            )}

            {activeTab === 'custom' && (
                <div style={{
                    padding: '2rem',
                    background: 'var(--bg-secondary)',
                    borderRadius: '16px',
                    border: '1px solid var(--border)',
                    marginBottom: '2rem'
                }}>
                    <div
                        onClick={() => setIsCustomInputOpen(!isCustomInputOpen)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            cursor: 'pointer',
                            userSelect: 'none',
                            marginBottom: isCustomInputOpen ? '1.5rem' : '0'
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <Sparkles size={24} style={{ color: 'var(--accent)' }} />
                            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Story Deck</h2>
                        </div>
                        <ChevronDown
                            size={24}
                            style={{
                                color: 'var(--text-secondary)',
                                transform: isCustomInputOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                                transition: 'transform 0.2s ease'
                            }}
                        />
                    </div>

                    {isCustomInputOpen && (
                        <div className={styles.engineFilters} style={{ flexDirection: 'column', gap: '1rem' }}>
                            <p style={{ margin: '0 0 0.5rem', color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.6 }}>
                                Shape the carousel story here. This section is only for the custom workflow and feeds the reel studio below.
                            </p>
                            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                                <div className={styles.filterGroup}>
                                    <label>Slide Badge</label>
                                    <input
                                        type="text"
                                        className={styles.engineInput}
                                        placeholder="e.g. VIRAL SCIENCE, DEEP DIVE"
                                        value={slideTitle}
                                        onChange={(e) => setSlideTitle(e.target.value)}
                                    />
                                </div>
                                <div className={styles.filterGroup}>
                                    <label>Category</label>
                                    <input
                                        type="text"
                                        className={styles.engineInput}
                                        placeholder="e.g. PHYSICS, HEALTH"
                                        value={customCategory}
                                        onChange={(e) => setCustomCategory(e.target.value)}
                                    />
                                </div>
                                <div className={styles.filterGroup}>
                                    <label>Published Year</label>
                                    <input
                                        type="text"
                                        className={styles.engineInput}
                                        placeholder="e.g. 2024"
                                        value={customYear}
                                        onChange={(e) => setCustomYear(e.target.value)}
                                    />
                                </div>
                            </div>
                            <div className={styles.filterGroup} style={{ width: '100%' }}>
                                <label>Slide 1 — Headline</label>
                                <input
                                    type="text"
                                    className={styles.engineInput}
                                    placeholder="Your punchy headline for the first slide"
                                    value={editedHeadline}
                                    onChange={(e) => setEditedHeadline(e.target.value)}
                                    style={{ width: '100%' }}
                                />
                            </div>
                            <div className={styles.filterGroup} style={{ width: '100%' }}>
                                <label>Slide 2</label>
                                <textarea
                                    className={styles.engineInput}
                                    placeholder="Text for slide 2..."
                                    value={editedTakeaways[0] || ''}
                                    onChange={(e) => {
                                        const t = [...editedTakeaways];
                                        t[0] = e.target.value;
                                        setEditedTakeaways(t.length ? t : [e.target.value]);
                                    }}
                                    rows={3}
                                    style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
                                />
                            </div>
                            <div className={styles.filterGroup} style={{ width: '100%' }}>
                                <label>Slide 3</label>
                                <textarea
                                    className={styles.engineInput}
                                    placeholder="Text for slide 3..."
                                    value={editedTakeaways[1] || ''}
                                    onChange={(e) => {
                                        const t = [...editedTakeaways];
                                        while (t.length < 2) t.push('');
                                        t[1] = e.target.value;
                                        setEditedTakeaways(t);
                                    }}
                                    rows={3}
                                    style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
                                />
                            </div>
                            <div className={styles.filterGroup} style={{ width: '100%' }}>
                                <label>Slide 4</label>
                                <textarea
                                    className={styles.engineInput}
                                    placeholder="Text for slide 4..."
                                    value={editedTakeaways[2] || ''}
                                    onChange={(e) => {
                                        const t = [...editedTakeaways];
                                        while (t.length < 3) t.push('');
                                        t[2] = e.target.value;
                                        setEditedTakeaways(t);
                                    }}
                                    rows={3}
                                    style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
                                />
                            </div>
                            <div className={styles.filterGroup} style={{ width: '100%' }}>
                                <label>Instagram Caption</label>
                                <textarea
                                    className={styles.engineInput}
                                    placeholder="Write your Instagram caption here..."
                                    value={customCaption}
                                    onChange={(e) => setCustomCaption(e.target.value)}
                                    rows={6}
                                    style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
                                />
                            </div>

                            {/* AI Image Generation Section */}
                            <div className={styles.aiImageSection} style={{
                                marginTop: '2rem',
                                marginBottom: '2rem',
                                padding: '1.5rem',
                                background: 'linear-gradient(145deg, rgba(100, 255, 218, 0.05), rgba(100, 255, 218, 0.02))',
                                border: '1px solid rgba(100, 255, 218, 0.2)',
                                boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
                                borderRadius: '12px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '1rem'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: aiImagePrompt ? '1rem' : '0' }}>
                                    <h3 style={{ margin: 0, fontSize: '1rem', color: '#64ffda', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
                                        <Sparkles size={18} /> AI Slide Visuals (Optional)
                                    </h3>
                                    {!aiImagePrompt && (
                                        <button
                                            className={styles.engineButtonSmall}
                                            onClick={handleGenerateImagePrompt}
                                            disabled={isGeneratingPrompt || !editedHeadline}
                                        >
                                            {isGeneratingPrompt ? <Loader2 size={14} className={styles.spinAnimation} /> : <FileText size={14} />}
                                            Auto-Draft AI Prompt
                                        </button>
                                    )}
                                </div>

                                {aiImagePrompt && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        <label style={{ fontSize: '0.75rem', opacity: 0.7 }}>Visual Prompt (LLM Optimized)</label>
                                        <textarea
                                            className={styles.engineInput}
                                            value={aiImagePrompt}
                                            onChange={(e) => setAiImagePrompt(e.target.value)}
                                            rows={2}
                                            style={{ width: '100%', fontSize: '0.85rem' }}
                                        />
                                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                                            <button
                                                className={styles.engineButton}
                                                onClick={handleGenerateImage}
                                                disabled={isGeneratingImage || !aiImagePrompt}
                                                style={{ flex: 1 }}
                                            >
                                                {isGeneratingImage ? <Loader2 size={16} className={styles.spinAnimation} /> : <Film size={16} />}
                                                Generate 1024x1024 Visual
                                            </button>
                                            <button
                                                className={styles.engineButtonSecondary}
                                                onClick={() => { setAiImagePrompt(''); setGeneratedImageUrl(null); }}
                                                style={{ padding: '0.5rem' }}
                                            >
                                                <X size={16} />
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {generatedImageUrl && (
                                    <div style={{ marginTop: '1rem', textAlign: 'center' }}>
                                        <p style={{ fontSize: '0.75rem', marginBottom: '0.5rem', color: '#64ffda' }}>✓ Image Ready!</p>
                                        <div style={{
                                            width: '100%',
                                            aspectRatio: '1/1',
                                            borderRadius: '8px',
                                            overflow: 'hidden',
                                            border: '1px solid rgba(100, 255, 218, 0.3)',
                                            marginBottom: '0.8rem'
                                        }}>
                                            <img src={generatedImageUrl} alt="AI Generated" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        </div>
                                        <p style={{ fontSize: '0.7rem', opacity: 0.6, fontStyle: 'italic' }}>
                                            This image will be applied as the background for your generated slides.
                                        </p>
                                    </div>
                                )}
                            </div>

                            <button
                                className={styles.engineButton}
                                style={{ width: '100%', padding: '1.2rem', fontSize: '1.1rem', display: 'flex', justifyContent: 'center' }}
                                onClick={() => {
                                    const takeaways = editedTakeaways.filter(t => t.trim());
                                    if (!editedHeadline.trim() || takeaways.length === 0) {
                                        setError('Provide at least a headline and one slide text.');
                                        return;
                                    }
                                    setSlideData({
                                        paper_id: 0,
                                        category: customCategory || 'SCIENCE',
                                        headline: editedHeadline,
                                        takeaways: takeaways,
                                        caption: customCaption,
                                        imageUrl: generatedImageUrl || undefined
                                    });
                                    setCustomSlidesReady(true);
                                    setError(null);
                                    setIsCustomInputOpen(false);
                                }}
                            >
                                <Sparkles size={20} /> Generate & Review Slides
                            </button>
                        </div>
                    )}
                </div>
            )}

            {loadingPapers && (
                <div className={styles.loadingContainer}>
                    <Loader2 size={32} className={styles.spinAnimation} />
                    <h2>Loading papers...</h2>
                </div>
            )}

            {/* Impact analysis loading */}
            {analyzingImpact && (
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6rem',
                    justifyContent: 'center',
                    padding: '0.8rem 1.2rem',
                    background: 'rgba(100, 255, 218, 0.05)',
                    border: '1px solid rgba(100, 255, 218, 0.15)',
                    borderRadius: '10px',
                    marginBottom: '1rem',
                    color: 'var(--accent)',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                }}>
                    <Loader2 size={16} className={styles.spinAnimation} />
                    Analyzing impact across papers...
                </div>
            )}

            {/* Paper Selection Grid */}
            {papers.length > 0 && !loadingPapers && !fetchingEngine && (
                <div className={styles.paperSelectionGrid}>
                    <h3 style={{ gridColumn: '1 / -1', marginBottom: '1rem', color: 'var(--text-secondary)' }}>Select a paper to generate content:</h3>
                    {papers.map((paper) => {
                        const citedBy = paper.metrics?.cited_by_count ?? 0;
                        const fwci = paper.metrics?.fwci as number | null;
                        const paperNote = impactAnalysis?.paper_notes?.find((n: any) => n.id === paper.id);
                        const isTopPick = impactAnalysis?.top_pick_id === paper.id;
                        const noteText = isTopPick ? impactAnalysis?.top_pick_reason : paperNote?.note;
                        return (
                            <button
                                key={paper.id}
                                className={`${styles.paperButton} ${selectedPaperId === paper.id ? styles.paperButtonActive : ''}`}
                                onClick={() => handleSelectPaper(paper.id)}
                                style={{
                                    flexDirection: 'column',
                                    gap: '0.5rem',
                                    ...(isTopPick ? { borderColor: 'var(--accent)', boxShadow: '0 0 16px rgba(100, 255, 218, 0.12)' } : {}),
                                }}
                            >
                                {isTopPick && (
                                    <div style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.35rem',
                                        fontSize: '0.7rem',
                                        fontWeight: 700,
                                        color: '#000',
                                        background: 'var(--accent)',
                                        padding: '0.2rem 0.6rem',
                                        borderRadius: '4px',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.06em',
                                        alignSelf: 'flex-start',
                                    }}>
                                        <Award size={12} /> AI Top Pick
                                    </div>
                                )}

                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem' }}>
                                    <FileText size={18} className={styles.paperIcon} style={{ flexShrink: 0, marginTop: '0.15rem' }} />
                                    <div className={styles.paperButtonTitle}>{paper.title}</div>
                                </div>

                                {(activeTab === 'top-papers' || activeTab === 'daily-science') && (citedBy > 0 || fwci != null) && (
                                    <div style={{
                                        display: 'flex',
                                        gap: '0.75rem',
                                        fontSize: '0.78rem',
                                        fontWeight: 600,
                                        paddingTop: '0.25rem',
                                        borderTop: '1px solid var(--border)',
                                        width: '100%',
                                    }}>
                                        {citedBy > 0 && (
                                            <span style={{ color: 'var(--accent)' }}>
                                                {citedBy.toLocaleString()} citations
                                            </span>
                                        )}
                                        {fwci != null && (
                                            <span
                                                style={{ color: fwci >= 5 ? '#ffd700' : fwci >= 1 ? 'var(--text-secondary)' : '#ff6b6b' }}
                                                title="Field-Weighted Citation Impact. 1.0 = field average."
                                            >
                                                FWCI {fwci.toFixed(1)}
                                            </span>
                                        )}
                                    </div>
                                )}

                                {(activeTab === 'top-papers' || activeTab === 'daily-science') && noteText && (
                                    <div style={{
                                        fontSize: '0.78rem',
                                        color: 'var(--text-secondary)',
                                        lineHeight: 1.5,
                                        width: '100%',
                                    }}>
                                        {noteText}
                                    </div>
                                )}
                            </button>
                        );
                    })}
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
            {((selectedPaperId && slideData && !loadingSlide) || (activeTab === 'custom' && customSlidesReady)) && (
                <div style={{
                    padding: '2rem',
                    background: 'var(--bg-secondary)',
                    borderRadius: '16px',
                    border: '1px solid var(--border)',
                    marginBottom: '2rem'
                }}>
                    <div
                        onClick={() => setIsSlideSectionOpen(!isSlideSectionOpen)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            cursor: 'pointer',
                            userSelect: 'none'
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <Layers size={24} style={{ color: 'var(--accent)' }} />
                            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Carousel Slides</h2>
                        </div>
                        <ChevronDown
                            size={24}
                            style={{
                                color: 'var(--text-secondary)',
                                transform: isSlideSectionOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                                transition: 'transform 0.2s ease'
                            }}
                        />
                    </div>

                    {isSlideSectionOpen && (
                        <div style={{ marginTop: '1.5rem' }}>

                            <div className={styles.copyContainer}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                    <h3 style={{ margin: 0 }}>Instagram Caption</h3>
                                    <button
                                        onClick={() => {
                                            const text = activeTab === 'custom' ? customCaption : buildCaptionText();
                                            navigator.clipboard.writeText(text);
                                            setCopied(true);
                                            setTimeout(() => setCopied(false), 2000);
                                        }}
                                        style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}
                                    >
                                        {copied ? <Check size={16} color="var(--accent)" /> : <Copy size={16} />}
                                        {copied ? <span style={{ color: 'var(--accent)' }}>Copied!</span> : 'Copy Text'}
                                    </button>
                                </div>
                                <textarea
                                    readOnly={activeTab !== 'custom'}
                                    className={styles.copyArea}
                                    value={activeTab === 'custom' ? customCaption : buildCaptionText()}
                                    onChange={activeTab === 'custom' ? (e) => setCustomCaption(e.target.value) : undefined}
                                />
                            </div>

                            <div className={styles.controls} style={{ display: 'flex', gap: '1rem', justifyContent: 'center', margin: '0 0 3rem 0' }}>
                                {activeTab !== 'custom' && (
                                    <button
                                        className={styles.regenerateButton}
                                        onClick={handleRegenerate}
                                        disabled={downloading}
                                    >
                                        <RefreshCw size={20} /> Regenerate Text
                                    </button>
                                )}
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
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <div className={styles.slideWrapper}>
                                        <div
                                            className={`${styles.slide} ${styles.hookSlide}`}
                                            ref={(el) => { slideRefs.current[0] = el; }}
                                        >
                                            <div
                                                className={styles.slideBackground}
                                                style={slideData?.imageUrl ? {
                                                    backgroundImage: `linear-gradient(to bottom, rgba(10, 10, 15, 0.1) 0%, rgba(10, 10, 15, 0.8) 70%, rgba(10, 10, 15, 0.95) 100%), url(${slideData.imageUrl})`,
                                                    backgroundSize: 'cover',
                                                    backgroundPosition: 'center',
                                                } : {}}
                                            ></div>
                                            <div className={styles.slideContent} style={{ justifyContent: 'center' }}>
                                                <div className={styles.slideHeader}>
                                                    <div className={styles.brandName}>The Eureka Feed</div>
                                                    <div className={styles.slideCount}>1 / {editedTakeaways.length + 2}</div>
                                                </div>

                                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-start' }}>
                                                    {showTag && (() => {
                                                        const badgeText = activeTab === 'top-papers'
                                                            ? '🏆 PAPER HIGHLIGHT'
                                                            : activeTab === 'daily-science'
                                                                ? (slideTitle.trim() || '🔬 DAILY SCIENCE')
                                                                : activeTab === 'custom'
                                                                    ? (slideTitle.trim() || '🔬 CUSTOM')
                                                                    : '🚨 New Research Just Dropped';
                                                        const badgeColor = activeTab === 'top-papers' ? '#ffd700'
                                                            : activeTab === 'latest' ? '#ffffff'
                                                                : '#64d8ff';
                                                        const badgeBg = activeTab === 'top-papers'
                                                            ? 'linear-gradient(135deg, rgba(255, 215, 0, 0.2), rgba(100, 255, 218, 0.1))'
                                                            : activeTab === 'latest'
                                                                ? 'linear-gradient(135deg, rgba(255, 255, 255, 0.12), rgba(100, 255, 218, 0.08))'
                                                                : 'linear-gradient(135deg, rgba(100, 200, 255, 0.2), rgba(100, 255, 218, 0.1))';
                                                        const badgeBorder = activeTab === 'top-papers'
                                                            ? '3px solid rgba(255, 215, 0, 0.5)'
                                                            : activeTab === 'latest'
                                                                ? '3px solid rgba(255, 255, 255, 0.3)'
                                                                : '3px solid rgba(100, 200, 255, 0.5)';
                                                        return (
                                                            <div className={styles.slideBadge} style={{
                                                                background: badgeBg,
                                                                border: badgeBorder,
                                                                color: badgeColor,
                                                            }}>
                                                                {badgeText}
                                                            </div>
                                                        );
                                                    })()}

                                                    <div style={{ flex: 1 }}></div>

                                                    <div className={styles.hookHeadline}>
                                                        {editedHeadline}
                                                    </div>
                                                    {activeTab === 'top-papers' && (() => {
                                                        const selectedPaper = papers.find(p => p.id === selectedPaperId);
                                                        const fwci = selectedPaper?.metrics?.fwci as number | null;
                                                        return fwci != null ? (
                                                            <div style={{
                                                                marginTop: '36px',
                                                                display: 'flex',
                                                                alignItems: 'baseline',
                                                                gap: '12px',
                                                            }}>
                                                                <span style={{
                                                                    fontSize: '3rem',
                                                                    fontWeight: 800,
                                                                    color: '#ffd700',
                                                                    lineHeight: 1,
                                                                }}>
                                                                    {fwci.toFixed(1)}
                                                                </span>
                                                                <span style={{
                                                                    fontSize: '1.5rem',
                                                                    fontWeight: 600,
                                                                    color: 'rgba(255, 255, 255, 0.6)',
                                                                }}>
                                                                    FWCI — {fwci >= 10 ? 'exceptional' : fwci >= 5 ? 'outstanding' : fwci >= 2 ? 'high' : 'above average'} field impact
                                                                </span>
                                                            </div>
                                                        ) : null;
                                                    })()}
                                                </div>

                                                <div className={styles.slideFooter} style={{ justifyContent: 'center' }}>
                                                    <div className={styles.footerSwipeLarge}>Swipe <ArrowRight size={24} /></div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <textarea
                                        value={editedHeadline}
                                        onChange={(e) => setEditedHeadline(e.target.value)}
                                        rows={2}
                                        style={{
                                            marginTop: '0.5rem',
                                            width: '100%',
                                            maxWidth: '432px',
                                            padding: '0.6rem 0.8rem',
                                            fontSize: '0.85rem',
                                            borderRadius: '8px',
                                            border: '1px solid var(--border)',
                                            background: 'var(--bg-primary)',
                                            color: 'var(--text-primary)',
                                            fontFamily: 'inherit',
                                            resize: 'vertical',
                                            lineHeight: 1.5,
                                        }}
                                        placeholder="Edit headline..."
                                    />
                                    <div style={{ display: 'flex', alignItems: 'center', marginTop: '1rem', gap: '0.5rem', color: 'var(--text-secondary)' }}>
                                        <input
                                            type="checkbox"
                                            id="showTagToggle"
                                            checked={showTag}
                                            onChange={(e) => setShowTag(e.target.checked)}
                                            style={{ accentColor: 'var(--accent)', width: '16px', height: '16px', cursor: 'pointer' }}
                                        />
                                        <label htmlFor="showTagToggle" style={{ cursor: 'pointer', fontSize: '0.9rem', userSelect: 'none' }}>
                                            Show Category Tag on Slide 1
                                        </label>
                                    </div>
                                </div>

                                {/* Slides 2+: The Individual Takeaways */}
                                {editedTakeaways.map((takeaway, idx) => {
                                    const selectedPaperForSlide = papers.find(p => p.id === selectedPaperId);
                                    const pubYear = activeTab === 'custom'
                                        ? (customYear.trim() || null)
                                        : (selectedPaperForSlide?.publication_date ? new Date(selectedPaperForSlide.publication_date).getFullYear() : null);
                                    return (
                                        <div style={{ display: 'flex', flexDirection: 'column' }} key={`takeaway-${idx}`}>
                                            <div className={styles.slideWrapper}>
                                                <div
                                                    className={styles.slide}
                                                    ref={(el) => { slideRefs.current[idx + 1] = el; }}
                                                >
                                                    <div
                                                        className={styles.slideBackground}
                                                        style={slideData?.imageUrl ? {
                                                            backgroundImage: `linear-gradient(to bottom, rgba(10, 10, 15, 0.3) 0%, rgba(10, 10, 15, 0.8) 60%, rgba(10, 10, 15, 0.95) 100%), url(${slideData.imageUrl})`,
                                                            backgroundSize: 'cover',
                                                            backgroundPosition: 'center',
                                                        } : {}}
                                                    ></div>
                                                    <div className={styles.slideContent}>
                                                        <div className={styles.slideHeader}>
                                                            <div className={styles.brandName}>The Eureka Feed</div>
                                                            <div className={styles.slideCount}>{idx + 2} / {editedTakeaways.length + 2}</div>
                                                        </div>

                                                        <div className={styles.standaloneTakeawayWrapper}>
                                                            {(activeTab === 'top-papers' || activeTab === 'daily-science' || activeTab === 'custom') && idx === 0 && pubYear && (
                                                                <div className={styles.publishedYear}>
                                                                    Published in {pubYear}
                                                                </div>
                                                            )}
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
                                            <textarea
                                                value={takeaway}
                                                onChange={(e) => {
                                                    const updated = [...editedTakeaways];
                                                    updated[idx] = e.target.value;
                                                    setEditedTakeaways(updated);
                                                }}
                                                rows={3}
                                                style={{
                                                    marginTop: '0.5rem',
                                                    width: '100%',
                                                    maxWidth: '432px',
                                                    padding: '0.6rem 0.8rem',
                                                    fontSize: '0.85rem',
                                                    borderRadius: '8px',
                                                    border: '1px solid var(--border)',
                                                    background: 'var(--bg-primary)',
                                                    color: 'var(--text-primary)',
                                                    fontFamily: 'inherit',
                                                    resize: 'vertical',
                                                    lineHeight: 1.5,
                                                }}
                                                placeholder={`Edit slide ${idx + 2} text...`}
                                            />
                                        </div>
                                    );
                                })}

                                {/* Final Slide: Static CTA */}
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <div className={styles.slideWrapper}>
                                        <div
                                            className={styles.slide}
                                            ref={(el) => { slideRefs.current[editedTakeaways.length + 1] = el; }}
                                        >
                                            <div
                                                className={styles.slideBackground}
                                                style={slideData?.imageUrl ? {
                                                    backgroundImage: `linear-gradient(to bottom, rgba(10, 10, 15, 0.1) 0%, rgba(10, 10, 15, 0.8) 70%, rgba(10, 10, 15, 0.95) 100%), url(${slideData.imageUrl})`,
                                                    backgroundSize: 'cover',
                                                    backgroundPosition: 'center',
                                                } : {}}
                                            ></div>
                                            <div className={styles.slideContent}>
                                                <div className={styles.slideHeader}>
                                                    <div className={styles.brandName}>The Eureka Feed</div>
                                                    <div className={styles.slideCount}>{editedTakeaways.length + 2} / {editedTakeaways.length + 2}</div>
                                                </div>

                                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', paddingBottom: '20px', textAlign: 'center', gap: '40px' }}>
                                                    <div style={{ fontSize: '3.5rem', fontWeight: 600, color: '#ffffff', lineHeight: 1.3 }}>
                                                        Check description for more information about the paper 👇
                                                    </div>

                                                    <div style={{ padding: '50px', background: 'rgba(100, 255, 218, 0.05)', borderRadius: '30px', border: '1px solid rgba(100, 255, 218, 0.15)' }}>
                                                        <div style={{ color: '#ffffff', fontSize: '3.2rem', fontWeight: 600, marginBottom: '20px', lineHeight: 1.3 }}>
                                                            {editedOutro}
                                                        </div>
                                                        <div style={{ color: 'var(--accent)', fontSize: '3rem', fontWeight: '700', letterSpacing: '0.02em' }}>
                                                            {editedOutroFollow}
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
                                    <textarea
                                        value={editedOutro}
                                        onChange={(e) => setEditedOutro(e.target.value)}
                                        rows={3}
                                        style={{
                                            marginTop: '0.5rem',
                                            width: '100%',
                                            maxWidth: '432px',
                                            padding: '0.6rem 0.8rem',
                                            fontSize: '0.85rem',
                                            borderRadius: '8px',
                                            border: '1px solid var(--border)',
                                            background: 'var(--bg-primary)',
                                            color: 'var(--text-primary)',
                                            fontFamily: 'inherit',
                                            resize: 'vertical',
                                            lineHeight: 1.5,
                                        }}
                                        placeholder="Edit final slide outro..."
                                    />
                                    <textarea
                                        value={editedOutroFollow}
                                        onChange={(e) => setEditedOutroFollow(e.target.value)}
                                        rows={2}
                                        style={{
                                            marginTop: '0.5rem',
                                            width: '100%',
                                            maxWidth: '432px',
                                            padding: '0.6rem 0.8rem',
                                            fontSize: '0.85rem',
                                            borderRadius: '8px',
                                            border: '1px solid var(--border)',
                                            background: 'var(--bg-primary)',
                                            color: 'var(--text-primary)',
                                            fontFamily: 'inherit',
                                            resize: 'vertical',
                                            lineHeight: 1.5,
                                        }}
                                        placeholder="Edit follow text..."
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}


            {/* Reel Generator */}
            {(episode || ((activeTab === 'top-papers' || activeTab === 'daily-science') && selectedPaperId) || activeTab === 'custom') && (
                <div style={{
                    marginTop: '3rem',
                    padding: '2rem',
                    background: 'var(--bg-secondary)',
                    borderRadius: '16px',
                    border: '1px solid var(--border)',
                }}>
                    <div
                        onClick={() => setIsReelSectionOpen(!isReelSectionOpen)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            cursor: 'pointer',
                            userSelect: 'none'
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <Film size={24} style={{ color: 'var(--accent)' }} />
                            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>{isCustomTab ? 'Narrated Reel Studio' : 'Waveform Reel'}</h2>
                        </div>
                        <ChevronDown
                            size={24}
                            style={{
                                color: 'var(--text-secondary)',
                                transform: isReelSectionOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                                transition: 'transform 0.2s ease'
                            }}
                        />
                    </div>

                    {isReelSectionOpen && (
                        <div style={{ marginTop: '1.5rem' }}>
                            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.95rem' }}>
                                {isCustomTab
                                    ? 'Build the custom reel in stages: write the narration, choose the voice, compile the audio, shape the visual timeline, then assemble the final video.'
                                    : 'Generate a vertical 9:16 reel with animated waveform, word-by-word captions synced to audio, and catchy transitions.'}
                                {episode ? ' Click on any sentence in the transcript below to set the start time.' : ' Write or generate a narration script below.'}
                            </p>

                            {/* Transcript viewer — only for episodes */}
                            {episode && transcriptSentences.length > 0 && (
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
                                            const isInRange = s.startSec >= audioStart && s.startSec < audioStart + reelDuration;
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

                            {episode && !episode.audio_url ? (
                                <p style={{ color: '#ff6b6b' }}>⚠ This episode has no audio URL.</p>
                            ) : (
                                <>
                                    <div style={{ marginBottom: '1.5rem' }}>
                                        <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                                            Reel headline {isCustomTab && <span style={{ opacity: 0.7 }}>(optional)</span>}
                                        </label>
                                        <input
                                            type="text"
                                            value={reelHeadline}
                                            onChange={(e) => setReelHeadline(e.target.value)}
                                            placeholder={isCustomTab ? 'Optional overlay headline for the final reel' : 'Enter a catchy hook headline...'}
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

                                    {isCustomTab ? (
                                        <div style={{ marginBottom: '1.5rem', background: 'var(--bg-primary)', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border)' }}>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.7fr) minmax(280px, 1fr)', gap: '1.25rem', alignItems: 'start' }}>
                                                <div>
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem', gap: '0.75rem', flexWrap: 'wrap' }}>
                                                        <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Narration script</label>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                            <button
                                                                onClick={async () => {
                                                                    if (!reelScript.trim()) return;
                                                                    setRewritingVoiceScript(true);
                                                                    try {
                                                                        const result = await rewriteVoiceScript(reelScript);
                                                                        setReelScript(result.rewritten_script);
                                                                    } catch (err: any) {
                                                                        console.error(err);
                                                                        setReelError(err.message || 'Failed to rewrite script for voice');
                                                                    } finally {
                                                                        setRewritingVoiceScript(false);
                                                                    }
                                                                }}
                                                                disabled={rewritingVoiceScript || !reelScript.trim()}
                                                                style={{
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: '0.4rem',
                                                                    padding: '0.3rem 0.7rem',
                                                                    fontSize: '0.8rem',
                                                                    fontWeight: 600,
                                                                    borderRadius: '6px',
                                                                    border: '1px solid var(--border)',
                                                                    background: 'var(--bg-secondary)',
                                                                    color: 'var(--text-primary)',
                                                                    cursor: rewritingVoiceScript || !reelScript.trim() ? 'not-allowed' : 'pointer',
                                                                    opacity: rewritingVoiceScript || !reelScript.trim() ? 0.6 : 1,
                                                                }}
                                                            >
                                                                {rewritingVoiceScript ? (
                                                                    <><Loader2 size={14} className="animate-spin" /> Rewriting...</>
                                                                ) : (
                                                                    <><RefreshCw size={14} /> Rewrite for Voice</>
                                                                )}
                                                            </button>
                                                            {selectedPaperId && (
                                                                <button
                                                                    onClick={async () => {
                                                                        if (!selectedPaperId) return;
                                                                        setGeneratingScript(true);
                                                                        try {
                                                                            const result = await generateReelScript(selectedPaperId, activeTab);
                                                                            setReelScript(result.script);
                                                                            if (result.headline) setReelHeadline(result.headline);
                                                                        } catch (err: any) {
                                                                            console.error(err);
                                                                        } finally {
                                                                            setGeneratingScript(false);
                                                                        }
                                                                    }}
                                                                    disabled={generatingScript}
                                                                    style={{
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        gap: '0.4rem',
                                                                        padding: '0.3rem 0.7rem',
                                                                        fontSize: '0.8rem',
                                                                        fontWeight: 600,
                                                                        borderRadius: '6px',
                                                                        border: '1px solid var(--border)',
                                                                        background: 'var(--bg-secondary)',
                                                                        color: 'var(--accent)',
                                                                        cursor: generatingScript ? 'wait' : 'pointer',
                                                                        opacity: generatingScript ? 0.6 : 1,
                                                                    }}
                                                                >
                                                                    {generatingScript ? (
                                                                        <><Loader2 size={14} className="animate-spin" /> Generating...</>
                                                                    ) : (
                                                                        <><Sparkles size={14} /> Generate Script</>
                                                                    )}
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <textarea
                                                        value={reelScript}
                                                        onChange={(e) => setReelScript(e.target.value)}
                                                        placeholder="Paste or write your reel narration here, or click 'Generate Script' to auto-generate from the selected paper..."
                                                        rows={9}
                                                        style={{
                                                            padding: '0.8rem',
                                                            fontSize: '0.95rem',
                                                            borderRadius: '8px',
                                                            border: '1px solid var(--border)',
                                                            background: 'var(--bg-secondary)',
                                                            color: 'var(--text-primary)',
                                                            width: '100%',
                                                            fontFamily: 'inherit',
                                                            resize: 'vertical',
                                                            lineHeight: 1.6,
                                                        }}
                                                    />
                                                    <div style={{
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        alignItems: 'center',
                                                        marginTop: '0.5rem',
                                                        fontSize: '0.8rem',
                                                        color: 'var(--text-secondary)'
                                                    }}>
                                                        <span>{reelScript.trim() ? reelScript.trim().split(/\s+/).length : 0} words • {reelScript.length} characters</span>
                                                        <span>
                                                            Estimated duration: <strong style={{ color: reelScript.trim() ? 'var(--accent)' : 'inherit' }}>
                                                                ~{Math.round((reelScript.trim() ? reelScript.trim().split(/\s+/).length : 0) / 2.5)}s
                                                            </strong>
                                                        </span>
                                                    </div>
                                                </div>

                                                <div>
                                                    <div style={{ marginBottom: '0.85rem' }}>
                                                        <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>Voice Setup</h3>
                                                        <p style={{ margin: '0.35rem 0 0', color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.5 }}>
                                                            Keep the narration and voice choices together while shaping the read.
                                                        </p>
                                                    </div>
                                                    <div style={{ display: 'grid', gap: '0.85rem' }}>
                                                        <div>
                                                            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>TTS Provider</label>
                                                            <select
                                                                value={ttsProvider}
                                                                onChange={(e) => {
                                                                    setTtsProvider(e.target.value);
                                                                    setReelVoice(e.target.value === 'elevenlabs' ? 'science_narrator' : 'nova');
                                                                }}
                                                                style={{
                                                                    padding: '0.6rem 0.8rem',
                                                                    fontSize: '1rem',
                                                                    borderRadius: '8px',
                                                                    border: '1px solid var(--border)',
                                                                    background: 'var(--bg-secondary)',
                                                                    color: 'var(--text-primary)',
                                                                    width: '100%',
                                                                    fontFamily: 'inherit',
                                                                }}
                                                            >
                                                                <option value="openai">OpenAI</option>
                                                                <option value="elevenlabs">ElevenLabs</option>
                                                            </select>
                                                        </div>
                                                        <div>
                                                            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>Voice</label>
                                                            <select
                                                                value={reelVoice}
                                                                onChange={(e) => setReelVoice(e.target.value)}
                                                                style={{
                                                                    padding: '0.6rem 0.8rem',
                                                                    fontSize: '1rem',
                                                                    borderRadius: '8px',
                                                                    border: '1px solid var(--border)',
                                                                    background: 'var(--bg-secondary)',
                                                                    color: 'var(--text-primary)',
                                                                    width: '100%',
                                                                    fontFamily: 'inherit',
                                                                }}
                                                            >
                                                                {ttsProvider === 'openai' ? (
                                                                    <>
                                                                        <option value="nova">Nova (Female)</option>
                                                                        <option value="onyx">Onyx (Male)</option>
                                                                        <option value="fable">Fable (British)</option>
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <option value="science_narrator">Custom Science Narrator</option>
                                                                        <option value="brian">Brian (Deep narrator)</option>
                                                                        <option value="matilda">Matilda (Warm female)</option>
                                                                        <option value="charlie">Charlie (Casual Aussie)</option>
                                                                        <option value="dave">Dave (British)</option>
                                                                        <option value="lily">Lily (Female narrator)</option>
                                                                        <option value="adam">Adam (Deep male)</option>
                                                                    </>
                                                                )}
                                                            </select>
                                                        </div>
                                                        <div>
                                                            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>Speed ({reelSpeed.toFixed(2)}x)</label>
                                                            <input
                                                                type="range"
                                                                min={0.5}
                                                                max={2.0}
                                                                step={0.05}
                                                                value={reelSpeed}
                                                                onChange={(e) => setReelSpeed(Number(e.target.value))}
                                                                style={{ width: '100%', accentColor: 'var(--accent)' }}
                                                            />
                                                        </div>
                                                        {ttsProvider === 'elevenlabs' && (
                                                            <>
                                                                <div>
                                                                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                                                                        Stability ({elevenlabsStability.toFixed(2)})
                                                                    </label>
                                                                    <input
                                                                        type="range"
                                                                        min={0}
                                                                        max={1}
                                                                        step={0.01}
                                                                        value={elevenlabsStability}
                                                                        onChange={(e) => setElevenlabsStability(Number(e.target.value))}
                                                                        style={{ width: '100%', accentColor: 'var(--accent)' }}
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                                                                        Similarity Boost ({elevenlabsSimilarityBoost.toFixed(2)})
                                                                    </label>
                                                                    <input
                                                                        type="range"
                                                                        min={0}
                                                                        max={1}
                                                                        step={0.01}
                                                                        value={elevenlabsSimilarityBoost}
                                                                        onChange={(e) => setElevenlabsSimilarityBoost(Number(e.target.value))}
                                                                        style={{ width: '100%', accentColor: 'var(--accent)' }}
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                                                                        Style ({elevenlabsStyle.toFixed(2)})
                                                                    </label>
                                                                    <input
                                                                        type="range"
                                                                        min={0}
                                                                        max={1}
                                                                        step={0.01}
                                                                        value={elevenlabsStyle}
                                                                        onChange={(e) => setElevenlabsStyle(Number(e.target.value))}
                                                                        style={{ width: '100%', accentColor: 'var(--accent)' }}
                                                                    />
                                                                </div>
                                                            </>
                                                        )}
                                                        <label style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '0.5rem',
                                                            cursor: 'pointer',
                                                            fontSize: '0.9rem',
                                                            marginTop: '0.25rem',
                                                        }}>
                                                            <input
                                                                type="checkbox"
                                                                checked={useHdTts}
                                                                onChange={(e) => setUseHdTts(e.target.checked)}
                                                                style={{ width: '18px', height: '18px', accentColor: 'var(--accent)' }}
                                                            />
                                                            <span style={{ fontWeight: 600 }}>Use HD TTS</span>
                                                            <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                                                                for cleaner narration
                                                            </span>
                                                        </label>
                                                    </div>
                                                </div>
                                            </div>
                                            <div style={{ marginTop: '1.25rem', paddingTop: '1.1rem', borderTop: '1px solid var(--border)' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                                                    <div>
                                                        <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--accent)' }}>Step 1: Compile Audio</h3>
                                                        <p style={{ margin: '0.35rem 0 0', color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.5, maxWidth: '640px' }}>
                                                            Lock the narration first. After this, the scene planning section uses the compiled voice pacing for anchors, prompts, and image timing.
                                                        </p>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={async () => {
                                                            if (!reelScript.trim()) {
                                                                alert('Enter a narration script first.');
                                                                return;
                                                            }
                                                            setExtractingTimeline(true);
                                                            setGeneratedReelImages([]);
                                                            try {
                                                                const { audio_url, timeline, duration, word_timestamps, rewritten_script } = await compileAudioTimeline(
                                                                    reelScript,
                                                                    reelVoice,
                                                                    ttsProvider,
                                                                    reelSpeed,
                                                                    elevenlabsStability,
                                                                    elevenlabsSimilarityBoost,
                                                                    elevenlabsStyle,
                                                                );
                                                                setReelScript(rewritten_script);
                                                                setAnchorWords(timeline);
                                                                setAnchorTimeline([]);
                                                                setAudioPreviewUrl(`${API_BASE_URL.replace('/api/v1', '')}${audio_url}`);
                                                                setReelDuration(Math.ceil(duration));
                                                                setWordTimestamps(word_timestamps);
                                                            } catch (err: any) {
                                                                console.error(err);
                                                                setReelError(err.message || 'Failed to compile audio timeline');
                                                            } finally {
                                                                setExtractingTimeline(false);
                                                            }
                                                        }}
                                                        disabled={extractingTimeline}
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '0.5rem',
                                                            padding: '0.7rem 1.2rem',
                                                            fontSize: '0.92rem',
                                                            fontWeight: 600,
                                                            borderRadius: '8px',
                                                            border: '1px solid var(--accent)',
                                                            background: 'rgba(100, 255, 218, 0.1)',
                                                            color: 'var(--accent)',
                                                            cursor: extractingTimeline ? 'wait' : 'pointer',
                                                            whiteSpace: 'nowrap',
                                                        }}
                                                    >
                                                        {extractingTimeline ? <Loader2 size={16} className={styles.spinAnimation} /> : <Sparkles size={16} />}
                                                        {extractingTimeline ? 'Compiling Audio & Timeline...' : 'Compile Audio & Timeline'}
                                                    </button>
                                                </div>
                                                {audioPreviewUrl && (
                                                    <div style={{ padding: '1rem', background: '#111', borderRadius: '10px', border: '1px solid #333' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                                                            <div>
                                                                <h4 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--accent)' }}>Audio Ready</h4>
                                                                <p style={{ margin: '0.35rem 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                                                    Listen here first. Then move into anchor review, prompt writing, and image generation.
                                                                </p>
                                                            </div>
                                                            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', padding: '0.3rem 0.55rem', borderRadius: '999px', background: 'rgba(255,255,255,0.04)' }}>
                                                                {reelDuration}s compiled
                                                            </span>
                                                        </div>
                                                        <audio
                                                            ref={audioPreviewRef}
                                                            controls
                                                            src={audioPreviewUrl.startsWith('/') ? `${API_BASE_URL.replace('/api/v1', '')}${audioPreviewUrl}` : audioPreviewUrl}
                                                            style={{ width: '100%', height: '40px' }}
                                                            onTimeUpdate={(e) => setAudioPreviewCurrentTime(e.currentTarget.currentTime)}
                                                            onLoadedMetadata={(e) => setAudioPreviewDuration(e.currentTarget.duration || 0)}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={{ marginBottom: '1.5rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem', maxWidth: '600px' }}>
                                                <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Narration script</label>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <button
                                                        onClick={async () => {
                                                            if (!reelScript.trim()) return;
                                                            setRewritingVoiceScript(true);
                                                            try {
                                                                const result = await rewriteVoiceScript(reelScript);
                                                                setReelScript(result.rewritten_script);
                                                            } catch (err: any) {
                                                                console.error(err);
                                                                setReelError(err.message || 'Failed to rewrite script for voice');
                                                            } finally {
                                                                setRewritingVoiceScript(false);
                                                            }
                                                        }}
                                                        disabled={rewritingVoiceScript || !reelScript.trim()}
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '0.4rem',
                                                            padding: '0.3rem 0.7rem',
                                                            fontSize: '0.8rem',
                                                            fontWeight: 600,
                                                            borderRadius: '6px',
                                                            border: '1px solid var(--border)',
                                                            background: 'var(--bg-primary)',
                                                            color: 'var(--text-primary)',
                                                            cursor: rewritingVoiceScript || !reelScript.trim() ? 'not-allowed' : 'pointer',
                                                            opacity: rewritingVoiceScript || !reelScript.trim() ? 0.6 : 1,
                                                        }}
                                                    >
                                                        {rewritingVoiceScript ? (
                                                            <><Loader2 size={14} className="animate-spin" /> Rewriting...</>
                                                        ) : (
                                                            <><RefreshCw size={14} /> Rewrite for Voice</>
                                                        )}
                                                    </button>
                                                    {selectedPaperId && (
                                                        <button
                                                            onClick={async () => {
                                                                if (!selectedPaperId) return;
                                                                setGeneratingScript(true);
                                                                try {
                                                                    const result = await generateReelScript(selectedPaperId, activeTab);
                                                                    setReelScript(result.script);
                                                                    if (result.headline) setReelHeadline(result.headline);
                                                                } catch (err: any) {
                                                                    console.error(err);
                                                                } finally {
                                                                    setGeneratingScript(false);
                                                                }
                                                            }}
                                                            disabled={generatingScript}
                                                            style={{
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '0.4rem',
                                                                padding: '0.3rem 0.7rem',
                                                                fontSize: '0.8rem',
                                                                fontWeight: 600,
                                                                borderRadius: '6px',
                                                                border: '1px solid var(--border)',
                                                                background: 'var(--bg-primary)',
                                                                color: 'var(--accent)',
                                                                cursor: generatingScript ? 'wait' : 'pointer',
                                                                opacity: generatingScript ? 0.6 : 1,
                                                            }}
                                                        >
                                                            {generatingScript ? (
                                                                <><Loader2 size={14} className="animate-spin" /> Generating...</>
                                                            ) : (
                                                                <><Sparkles size={14} /> Generate Script</>
                                                            )}
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                            <textarea
                                                value={reelScript}
                                                onChange={(e) => setReelScript(e.target.value)}
                                                placeholder="Paste or write your reel narration here, or click 'Generate Script' to auto-generate from the selected paper..."
                                                rows={6}
                                                style={{
                                                    padding: '0.8rem',
                                                    fontSize: '0.95rem',
                                                    borderRadius: '8px',
                                                    border: '1px solid var(--border)',
                                                    background: 'var(--bg-primary)',
                                                    color: 'var(--text-primary)',
                                                    width: '100%',
                                                    maxWidth: '600px',
                                                    fontFamily: 'inherit',
                                                    resize: 'vertical',
                                                    lineHeight: 1.6,
                                                }}
                                            />
                                            <div style={{
                                                maxWidth: '600px',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                marginTop: '0.5rem',
                                                fontSize: '0.8rem',
                                                color: 'var(--text-secondary)'
                                            }}>
                                                <span>{reelScript.trim() ? reelScript.trim().split(/\s+/).length : 0} words • {reelScript.length} characters</span>
                                                <span>
                                                    Estimated duration: <strong style={{ color: reelScript.trim() ? 'var(--accent)' : 'inherit' }}>
                                                        ~{Math.round((reelScript.trim() ? reelScript.trim().split(/\s+/).length : 0) / 2.5)}s
                                                    </strong>
                                                </span>
                                            </div>
                                        </div>
                                    )}

                                    {/* Advanced AI Visuals for Reels */}
                                    <div style={{ marginBottom: '1.5rem', background: 'var(--bg-primary)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                                            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0, color: 'var(--accent)' }}>{isCustomTab ? 'Scene Planning & Images' : 'Advanced AI Visuals'}</h3>
                                        </div>
                                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                                            {isCustomTab
                                                ? 'After audio is compiled, review anchors, generate prompts, then render the images that drive the reel.'
                                                : 'Automatically generate highly cinematic AI images timed perfectly to the pacing of your script.'}
                                        </p>
                                        {isCustomTab && !audioPreviewUrl && (
                                            <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: '1px dashed var(--border)', color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.6 }}>
                                                Compile the narration in Step 1 above first. This section is only for what comes next: anchors, prompt generation, and scene images.
                                            </div>
                                        )}

                                        {/* (Anchor Words selection block was here) */}
                                        {anchorWords.length > 0 && (
                                            <div style={{ marginTop: '2rem', padding: '1.5rem', background: 'var(--bg-tertiary)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                                                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <Sparkles size={18} style={{ color: 'var(--accent)' }} /> Step 2: Review Anchor Words
                                                </h3>
                                                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                                                    The AI has selected these words to anchor your visuals. You can edit the words or click "Generate Prompts" to continue.
                                                </p>
                                                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '1.25rem' }}>
                                                    <div>
                                                        <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>Image style preset</label>
                                                        <select
                                                            value={visualStyle}
                                                            onChange={e => setVisualStyle(e.target.value)}
                                                            title="Visual style applied to generated scene images"
                                                            style={{
                                                                background: 'var(--bg-secondary)',
                                                                border: '1px solid var(--border)',
                                                                color: 'var(--text-primary)',
                                                                padding: '0.6rem 0.8rem',
                                                                borderRadius: '8px',
                                                                fontSize: '0.9rem',
                                                                cursor: 'pointer',
                                                                minWidth: '220px',
                                                            }}
                                                        >
                                                            {imageStyles.length > 0 ? imageStyles.map(s => (
                                                                <option key={s.slug} value={s.slug}>{s.label}</option>
                                                            )) : (
                                                                <>
                                                                    <option value="archival_bw">🎞 Archival B&W</option>
                                                                    <option value="photojournalism">📷 Photojournalism</option>
                                                                </>
                                                            )}
                                                        </select>
                                                    </div>
                                                    {isCustomTab && (
                                                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.83rem', maxWidth: '420px', lineHeight: 1.5 }}>
                                                            Choose the image look here before prompt generation. Custom mode stays defaulted to archival so the first pass remains grounded.
                                                        </div>
                                                    )}
                                                </div>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.5rem' }}>
                                                    {anchorWords.map((anchor, idx) => (
                                                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.75rem', background: 'var(--bg-primary)', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '0.9rem' }}>
                                                            <span style={{ opacity: 0.5, fontSize: '0.75rem', fontWeight: 700 }}>{idx + 1}</span>
                                                            <input
                                                                type="text"
                                                                value={anchor.word}
                                                                onChange={(e) => {
                                                                    const val = e.target.value.trim();
                                                                    const next = [...anchorWords];
                                                                    let newStart = next[idx].start_time_seconds;
                                                                    let newEnd = next[idx].end_time_seconds;
                                                                    // Search the ENTIRE transcript — user may pick a word earlier or later than the previous anchor
                                                                    if (val && wordTimestamps.length > 0) {
                                                                        const normalise = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
                                                                        const normVal = normalise(val);
                                                                        // Prefer the occurrence closest to where this anchor "should" be (based on idx / total)
                                                                        const matches = wordTimestamps.filter(w => normalise(w.word) === normVal);
                                                                        if (matches.length > 0) {
                                                                            // Pick the occurrence whose position is closest to the fractional position of this anchor
                                                                            const totalDuration = wordTimestamps[wordTimestamps.length - 1].end;
                                                                            const idealTime = (idx / Math.max(next.length - 1, 1)) * totalDuration;
                                                                            const best = matches.reduce((a, b) =>
                                                                                Math.abs(a.start - idealTime) <= Math.abs(b.start - idealTime) ? a : b
                                                                            );
                                                                            newStart = best.start;
                                                                            newEnd = best.end;
                                                                        }
                                                                    }
                                                                    next[idx] = { ...next[idx], word: val || next[idx].word, start_time_seconds: newStart, end_time_seconds: newEnd };
                                                                    setAnchorWords(next);
                                                                }}
                                                                style={{ background: 'transparent', border: 'none', color: 'var(--accent)', fontWeight: 600, width: '100px', outline: 'none' }}
                                                            />
                                                            <span style={{ opacity: 0.4, fontSize: '0.8rem' }}>{anchor.start_time_seconds.toFixed(2)}s</span>
                                                            <button
                                                                type="button"
                                                                onClick={() => setAnchorWords(anchorWords.filter((_, i) => i !== idx))}
                                                                title="Remove anchor"
                                                                style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', padding: '0 2px', fontSize: '0.85rem', lineHeight: 1 }}
                                                            >✕</button>
                                                        </div>
                                                    ))}
                                                </div>
                                                <button
                                                    onClick={async () => {
                                                        setGeneratingPrompts(true);
                                                        try {
                                                            const { timeline } = await generatePromptsFromAnchors(reelScript, anchorWords);
                                                            const mapped: TimelinePrompt[] = timeline.map((item, idx) => ({
                                                                prompt: item.image_url,
                                                                anchor_word: anchorWords[idx].word,
                                                                start_time_seconds: item.start_time_seconds,
                                                                effect_transition_name: item.effect_transition_name,
                                                            }));
                                                            setAnchorTimeline(mapped);
                                                        } catch (err) {
                                                            console.error(err);
                                                        } finally {
                                                            setGeneratingPrompts(false);
                                                        }
                                                    }}
                                                    disabled={generatingPrompts}
                                                    style={{
                                                        padding: '0.7rem 1.4rem',
                                                        fontSize: '0.95rem',
                                                        fontWeight: 600,
                                                        borderRadius: '10px',
                                                        border: 'none',
                                                        background: 'var(--accent)',
                                                        color: '#000',
                                                        cursor: generatingPrompts ? 'wait' : 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '0.5rem'
                                                    }}
                                                >
                                                    {generatingPrompts ? <><Loader2 size={18} className="animate-spin" /> Writing Scene Prompts...</> : <><Sparkles size={18} /> Step 3: Generate Prompts for Anchors</>}
                                                </button>
                                            </div>
                                        )}

                                        {anchorTimeline.length > 0 && (
                                            <div style={{ marginTop: '2.5rem' }}>
                                                <div style={{ padding: '1rem', background: '#111', borderRadius: '8px', marginBottom: '2rem', border: '1px solid #333' }}>
                                                    <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', color: 'var(--accent)' }}>Scene Timeline Editor</h4>

                                                    {timelineDuration > 0 && (
                                                        <div className={styles.transitionEditor}>
                                                            <div className={styles.transitionEditorHeader}>
                                                                <div>
                                                                    <h5 style={{ margin: 0, fontSize: '0.9rem', color: '#fff' }}>Transition Timing Lane</h5>
                                                                    <p style={{ margin: '0.3rem 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                                                        Drag each marker to move the image switch on the voice-over. Markers snap to the nearest spoken word.
                                                                    </p>
                                                                </div>
                                                                <span className={styles.transitionTimeBadge}>
                                                                    {audioPreviewCurrentTime.toFixed(2)}s / {timelineDuration.toFixed(2)}s
                                                                </span>
                                                            </div>

                                                            <div
                                                                ref={transitionTimelineRef}
                                                                className={styles.transitionTrack}
                                                                onPointerDown={(event) => {
                                                                    if (event.target !== transitionTimelineRef.current) return;
                                                                    const track = transitionTimelineRef.current;
                                                                    if (!track || !audioPreviewRef.current || timelineDuration <= 0) return;
                                                                    const rect = track.getBoundingClientRect();
                                                                    const ratio = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
                                                                    const nextTime = ratio * timelineDuration;
                                                                    audioPreviewRef.current.currentTime = nextTime;
                                                                    setAudioPreviewCurrentTime(nextTime);
                                                                }}
                                                            >
                                                                <div
                                                                    className={styles.transitionPlayhead}
                                                                    style={{ left: `${Math.min((audioPreviewCurrentTime / timelineDuration) * 100, 100)}%` }}
                                                                />

                                                                {anchorTimeline.map((item, idx) => {
                                                                    const left = timelineDuration > 0 ? (item.start_time_seconds / timelineDuration) * 100 : 0;
                                                                    const nextSceneStart = anchorTimeline[idx + 1]?.start_time_seconds ?? timelineDuration;
                                                                    const width = timelineDuration > 0 ? ((nextSceneStart - item.start_time_seconds) / timelineDuration) * 100 : 0;
                                                                    const previewText = wordTimestamps
                                                                        .filter(w => w.start >= item.start_time_seconds - 0.05 && w.start < nextSceneStart - 0.05)
                                                                        .slice(0, 8)
                                                                        .map(w => w.word)
                                                                        .join(' ');

                                                                    return (
                                                                        <div key={`${item.anchor_word}-${idx}`}>
                                                                            <div
                                                                                className={styles.transitionSegment}
                                                                                style={{
                                                                                    left: `${left}%`,
                                                                                    width: `${Math.max(width, 4)}%`,
                                                                                    opacity: idx === draggingTransitionIdx ? 0.95 : 0.72,
                                                                                }}
                                                                            >
                                                                                <span>{previewText || item.anchor_word}</span>
                                                                            </div>
                                                                            <button
                                                                                type="button"
                                                                                className={styles.transitionMarker}
                                                                                style={{ left: `${left}%` }}
                                                                                onPointerDown={(event) => {
                                                                                    event.preventDefault();
                                                                                    event.stopPropagation();
                                                                                    setDraggingTransitionIdx(idx);
                                                                                    updateTransitionFromClientX(idx, event.clientX);
                                                                                }}
                                                                                title={`Scene ${idx + 1} at ${item.start_time_seconds.toFixed(2)}s`}
                                                                            >
                                                                                <span className={styles.transitionMarkerIndex}>{idx + 1}</span>
                                                                                <span className={styles.transitionMarkerLabel}>{item.anchor_word}</span>
                                                                            </button>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>

                                                <h4 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                                                    {isCustomTab ? 'Step 3: Review Prompts and Scene Frames' : 'Step 4: Review Actionable Prompts'}
                                                </h4>
                                                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                                                    {isCustomTab
                                                        ? 'Refine the prompt, inspect the transcript slice, and keep the generated frame right beside the scene it belongs to.'
                                                        : 'These prompts are biologically tied to your chosen anchor words. Review them before image generation.'}
                                                </p>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem', maxHeight: '600px', overflowY: 'auto', paddingRight: '0.75rem' }}>
                                                    {anchorTimeline.map((item, idx) => (
                                                        <div key={idx} style={{
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            gap: '0.5rem',
                                                            background: 'var(--bg-secondary)',
                                                            padding: '1rem',
                                                            borderRadius: '8px',
                                                            border: idx < 3 ? '1px solid var(--accent)' : '1px solid var(--border)'
                                                        }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: idx < 3 ? 'var(--accent)' : 'var(--text-primary)' }}>
                                                                    {idx < 3 ? `JAR Hook ${idx + 1}` : `Scene ${idx + 1}`}
                                                                </span>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                    <span style={{ fontSize: '0.75rem', color: '#888' }}>
                                                                        Anchor:
                                                                    </span>
                                                                    <input
                                                                        type="text"
                                                                        value={item.anchor_word}
                                                                        onChange={(e) => {
                                                                            const val = e.target.value.trim();
                                                                            const arr = [...anchorTimeline];
                                                                            arr[idx] = { ...arr[idx], anchor_word: val };

                                                                            if (val && wordTimestamps.length > 0) {
                                                                                const prevTime = idx > 0 ? arr[idx - 1].start_time_seconds : 0;
                                                                                // find first occurrence after previous scene
                                                                                const match = wordTimestamps.find(w =>
                                                                                    w.word.toLowerCase() === val.toLowerCase() && w.start >= prevTime
                                                                                );
                                                                                if (match) {
                                                                                    arr[idx].start_time_seconds = match.start;
                                                                                }
                                                                            }
                                                                            setAnchorTimeline(arr);
                                                                        }}
                                                                        style={{
                                                                            background: '#222',
                                                                            color: '#fff',
                                                                            border: '1px solid #444',
                                                                            borderRadius: '4px',
                                                                            padding: '0.2rem 0.4rem',
                                                                            fontSize: '0.75rem',
                                                                            width: '80px',
                                                                            textAlign: 'center'
                                                                        }}
                                                                    />
                                                                    <span style={{ fontSize: '0.75rem', color: '#888', background: '#222', padding: '0.2rem 0.6rem', borderRadius: '12px' }}>
                                                                        @ {item.start_time_seconds.toFixed(2)}s
                                                                    </span>
                                                                </div>
                                                            </div>

                                                            {/* Script Overlay Segment (derived dynamically) */}
                                                            <div style={{ padding: '0.5rem', background: '#1a1a1a', borderRadius: '6px', fontSize: '0.8rem', color: '#ddd', borderLeft: '2px solid #555', fontStyle: 'italic' }}>
                                                                "{(() => {
                                                                    if (!wordTimestamps || wordTimestamps.length === 0) return 'Loading transcript...';
                                                                    const startT = item.start_time_seconds;
                                                                    const endT = anchorTimeline[idx + 1] ? anchorTimeline[idx + 1].start_time_seconds : 9999;
                                                                    const seg = wordTimestamps.filter(w => w.start >= startT - 0.05 && w.start < endT - 0.05);
                                                                    return seg.map(w => w.word).join(' ') || item.anchor_word;
                                                                })()}"
                                                            </div>

                                                            <div style={{ display: 'grid', gridTemplateColumns: isCustomTab ? 'minmax(0, 1fr) 180px' : '1fr', gap: '1rem', alignItems: 'start' }}>
                                                                <textarea
                                                                    value={item.prompt}
                                                                    onChange={(e) => {
                                                                        const arr = [...anchorTimeline];
                                                                        arr[idx] = { ...arr[idx], prompt: e.target.value };
                                                                        setAnchorTimeline(arr);
                                                                    }}
                                                                    rows={4}
                                                                    style={{
                                                                        width: '100%',
                                                                        padding: '0.6rem',
                                                                        fontSize: '0.85rem',
                                                                        borderRadius: '6px',
                                                                        border: '1px solid #333',
                                                                        background: '#111',
                                                                        color: 'var(--text-primary)',
                                                                        resize: 'vertical'
                                                                    }}
                                                                />

                                                                {isCustomTab && (
                                                                    <div style={{
                                                                        background: '#0f0f12',
                                                                        border: '1px solid #333',
                                                                        borderRadius: '8px',
                                                                        overflow: 'hidden'
                                                                    }}>
                                                                        <div style={{ aspectRatio: '9 / 16', background: '#151515', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                                                                            {generatedReelImages[idx] ? (
                                                                                <img
                                                                                    src={generatedReelImages[idx].startsWith('/') ? `${API_BASE_URL}${generatedReelImages[idx]}` : generatedReelImages[idx]}
                                                                                    alt={`Scene ${idx + 1}`}
                                                                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                                                />
                                                                            ) : (
                                                                                <div style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.75rem', lineHeight: 1.5 }}>
                                                                                    No image yet
                                                                                </div>
                                                                            )}
                                                                            <div style={{ position: 'absolute', top: '0.5rem', left: '0.5rem', background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: '0.7rem', padding: '0.2rem 0.5rem', borderRadius: '999px', fontWeight: 600 }}>
                                                                                {item.start_time_seconds.toFixed(2)}s
                                                                            </div>
                                                                        </div>
                                                                        <button
                                                                            type="button"
                                                                            onClick={async () => {
                                                                                setRegeneratingImageIdx(idx);
                                                                                try {
                                                                                    const result = await generateImage(anchorTimeline[idx]?.prompt ?? '', visualStyle);
                                                                                    const next = [...generatedReelImages];
                                                                                    while (next.length < anchorTimeline.length) next.push('');
                                                                                    next[idx] = result.image_url;
                                                                                    setGeneratedReelImages(next);
                                                                                } catch (e: any) {
                                                                                    alert('Failed to generate image: ' + e.message);
                                                                                } finally {
                                                                                    setRegeneratingImageIdx(null);
                                                                                }
                                                                            }}
                                                                            disabled={regeneratingImageIdx === idx}
                                                                            style={{
                                                                                width: '100%',
                                                                                border: 'none',
                                                                                borderTop: '1px solid #333',
                                                                                background: 'var(--bg-primary)',
                                                                                color: 'var(--text-primary)',
                                                                                padding: '0.6rem 0.75rem',
                                                                                fontSize: '0.78rem',
                                                                                fontWeight: 600,
                                                                                cursor: regeneratingImageIdx === idx ? 'wait' : 'pointer',
                                                                                display: 'flex',
                                                                                alignItems: 'center',
                                                                                justifyContent: 'center',
                                                                                gap: '0.35rem',
                                                                            }}
                                                                        >
                                                                            {regeneratingImageIdx === idx ? <Loader2 size={12} className={styles.spinAnimation} /> : <RefreshCw size={12} />}
                                                                            {generatedReelImages[idx] ? 'Regenerate image' : 'Generate image'}
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {anchorTimeline.length > 0 && (
                                            <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border)' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                                    <div>
                                                        <h4 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.2rem' }}>
                                                            {isCustomTab ? 'Step 4: Generate Scene Images' : 'Step 5: Generate & Review Cinematic Images'}
                                                        </h4>
                                                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
                                                            {isCustomTab ? 'Generate all scene images in one pass. They populate beside each prompt card and feed the final reel.' : 'Click to batch render all scenes mapped to the timeline.'}
                                                        </p>
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                        <button
                                                            type="button"
                                                            onClick={async () => {
                                                                setGeneratingReelImages(true);
                                                                setGeneratedReelImages(new Array(anchorTimeline.length).fill('')); // skeleton
                                                                try {
                                                                    const results = [];
                                                                    for (let i = 0; i < anchorTimeline.length; i++) {
                                                                        const res = await generateImage(anchorTimeline[i].prompt, visualStyle);
                                                                        results.push(res.image_url);
                                                                        // update state progressively
                                                                        const current = new Array(anchorTimeline.length).fill('');
                                                                        for (let j = 0; j <= i; j++) current[j] = results[j];
                                                                        setGeneratedReelImages(current);
                                                                    }
                                                                } catch (err: any) {
                                                                    console.error(err);
                                                                    alert('Failed to generate one or more images: ' + err.message);
                                                                } finally {
                                                                    setGeneratingReelImages(false);
                                                                }
                                                            }}
                                                            disabled={generatingReelImages}
                                                            style={{
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '0.5rem',
                                                                padding: '0.6rem 1.2rem',
                                                                fontSize: '0.9rem',
                                                                fontWeight: 600,
                                                                borderRadius: '8px',
                                                                border: 'none',
                                                                background: 'var(--accent)',
                                                                color: '#000',
                                                                cursor: generatingReelImages ? 'wait' : 'pointer',
                                                            }}
                                                        >
                                                            {generatingReelImages ? <Loader2 size={16} className={styles.spinAnimation} /> : <Film size={16} />}
                                                            {generatingReelImages ? 'Rendering...' : 'Generate All Images'}
                                                        </button>
                                                    </div>
                                                </div>

                                                {!isCustomTab && generatedReelImages.length > 0 && (
                                                    <div style={{
                                                        display: 'grid',
                                                        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                                                        gap: '1rem',
                                                        marginTop: '1.5rem'
                                                    }}>
                                                        {generatedReelImages.map((b64, idx) => (
                                                            <div key={idx} style={{
                                                                position: 'relative',
                                                                aspectRatio: '9/16',
                                                                background: 'var(--bg-secondary)',
                                                                borderRadius: '8px',
                                                                overflow: 'hidden',
                                                                border: '1px solid var(--border)',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center'
                                                            }}>
                                                                {b64 ? (
                                                                    <>
                                                                        <img src={b64.startsWith('/') ? `${API_BASE_URL}${b64}` : b64} alt={`Scene ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                                        <div style={{ position: 'absolute', top: '0.5rem', left: '0.5rem', background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: '0.7rem', padding: '0.2rem 0.5rem', borderRadius: '4px', fontWeight: 600 }}>
                                                                            {anchorTimeline[idx]?.start_time_seconds.toFixed(2)}s
                                                                        </div>
                                                                        <button
                                                                            type="button"
                                                                            onClick={async () => {
                                                                                setRegeneratingImageIdx(idx);
                                                                                try {
                                                                                    const currentPrompt = anchorTimeline[idx]?.prompt ?? '';
                                                                                    const result = await generateImage(currentPrompt, visualStyle);
                                                                                    // Read prompt + style at click-time from state
                                                                                    const newImages = [...generatedReelImages];
                                                                                    newImages[idx] = result.image_url;
                                                                                    setGeneratedReelImages(newImages);
                                                                                } catch (e: any) {
                                                                                    alert('Failed to regenerate: ' + e.message);
                                                                                } finally {
                                                                                    setRegeneratingImageIdx(null);
                                                                                }
                                                                            }}
                                                                            disabled={regeneratingImageIdx === idx}
                                                                            style={{
                                                                                position: 'absolute',
                                                                                bottom: '0.5rem',
                                                                                right: '0.5rem',
                                                                                background: 'var(--bg-primary)',
                                                                                border: '1px solid var(--border)',
                                                                                color: 'var(--text-primary)',
                                                                                padding: '0.3rem 0.6rem',
                                                                                borderRadius: '6px',
                                                                                fontSize: '0.7rem',
                                                                                cursor: regeneratingImageIdx === idx ? 'wait' : 'pointer',
                                                                                display: 'flex',
                                                                                alignItems: 'center',
                                                                                gap: '0.3rem'
                                                                            }}
                                                                        >
                                                                            {regeneratingImageIdx === idx ? <Loader2 size={12} className={styles.spinAnimation} /> : <RefreshCw size={12} />}
                                                                            Regenerate
                                                                        </button>
                                                                    </>
                                                                ) : (
                                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)' }}>
                                                                        <Loader2 size={24} className={styles.spinAnimation} />
                                                                        <span style={{ fontSize: '0.75rem' }}>Rendering...</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {isCustomTab && (
                                        <div style={{ marginBottom: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
                                            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>Final Video Assembly</h3>
                                            <p style={{ margin: '0.35rem 0 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                                Choose background sources, waveform and closing beats here, then render the finished reel.
                                            </p>
                                        </div>
                                    )}

                                    {/* Fetch visuals — stock footage for reel background */}
                                    <div style={{ marginBottom: '1.5rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                                            <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Background visuals</label>
                                            <button
                                                type="button"
                                                onClick={async () => {
                                                    const headline = reelHeadline.trim() || 'Science research';
                                                    const script = reelScript.trim() || '';
                                                    if (!headline && !script) {
                                                        alert('Enter a headline or narration script to generate search queries.');
                                                        return;
                                                    }
                                                    setFetchingQueries(true);
                                                    try {
                                                        const { queries } = await extractVisualQueries(headline, script);
                                                        setSearchQueries(queries.join(', '));
                                                    } catch (err: any) {
                                                        console.error(err);
                                                        setReelError(err.message || 'Failed to extract queries');
                                                    } finally {
                                                        setFetchingQueries(false);
                                                    }
                                                }}
                                                disabled={fetchingQueries}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.4rem',
                                                    padding: '0.4rem 0.8rem',
                                                    fontSize: '0.85rem',
                                                    fontWeight: 600,
                                                    borderRadius: '6px',
                                                    border: '1px solid var(--accent)',
                                                    background: 'rgba(100, 255, 218, 0.1)',
                                                    color: 'var(--accent)',
                                                    cursor: fetchingQueries ? 'wait' : 'pointer',
                                                }}
                                            >
                                                {fetchingQueries ? <Loader2 size={14} className={styles.spinAnimation} /> : <Sparkles size={14} />}
                                                {fetchingQueries ? 'Generating...' : 'Generate Search Queries'}
                                            </button>
                                        </div>
                                        {searchQueries !== '' && (
                                            <div style={{ marginBottom: '1rem' }}>
                                                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.4rem' }}>Approved Search Queries (comma-separated)</label>
                                                <textarea
                                                    value={searchQueries}
                                                    onChange={(e) => setSearchQueries(e.target.value)}
                                                    style={{ width: '100%', padding: '0.6rem', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.85rem', minHeight: '60px', marginBottom: '0.5rem', fontFamily: 'inherit' }}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={async () => {
                                                        const queries = searchQueries.split(',').map(q => q.trim()).filter(Boolean);
                                                        if (queries.length === 0) {
                                                            alert('Please provide at least one search query.');
                                                            return;
                                                        }
                                                        setFetchingVisuals(true);
                                                        setFetchedClips([]);
                                                        setApprovedClips([]);
                                                        try {
                                                            const { clips } = await fetchVisuals(queries);
                                                            setFetchedClips(clips);
                                                        } catch (err: any) {
                                                            console.error(err);
                                                            setReelError(err.message || 'Failed to fetch visuals');
                                                        } finally {
                                                            setFetchingVisuals(false);
                                                        }
                                                    }}
                                                    disabled={fetchingVisuals}
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '0.4rem',
                                                        padding: '0.4rem 0.8rem',
                                                        fontSize: '0.85rem',
                                                        fontWeight: 600,
                                                        borderRadius: '6px',
                                                        border: '1px solid var(--accent)',
                                                        background: 'rgba(100, 255, 218, 0.1)',
                                                        color: 'var(--accent)',
                                                        cursor: fetchingVisuals ? 'wait' : 'pointer',
                                                    }}
                                                >
                                                    {fetchingVisuals ? <Loader2 size={14} className={styles.spinAnimation} /> : <Film size={14} />}
                                                    {fetchingVisuals ? 'Fetching...' : 'Fetch visuals'}
                                                </button>
                                            </div>
                                        )}
                                        {fetchedClips.length > 0 && (
                                            <div style={{ marginTop: '0.75rem' }}>
                                                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                                                    Click ✓ to approve, ✕ to reject. Reorder approved clips with arrows. Then generate reel.
                                                </div>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.5rem' }}>
                                                    {fetchedClips.map((clip, idx) => {
                                                        const isApproved = approvedClips.some(c => c.url === clip.url);
                                                        return (
                                                            <div
                                                                key={`${clip.url}-${idx}`}
                                                                style={{
                                                                    width: '140px',
                                                                    borderRadius: '8px',
                                                                    overflow: 'hidden',
                                                                    border: `2px solid ${isApproved ? 'var(--accent)' : 'var(--border)'}`,
                                                                    background: 'var(--bg-primary)',
                                                                }}
                                                            >
                                                                <div style={{ aspectRatio: '9/16', background: '#111', position: 'relative' }}>
                                                                    {clip.thumbnail ? (
                                                                        <img src={clip.thumbnail} alt={clip.keyword} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                                    ) : (
                                                                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: '0.7rem' }}>No preview</div>
                                                                    )}
                                                                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent, rgba(0,0,0,0.8))', padding: '0.4rem', fontSize: '0.7rem', color: '#fff' }}>{clip.keyword}</div>
                                                                </div>
                                                                <div style={{ display: 'flex', gap: '0.25rem', padding: '0.35rem' }}>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            if (isApproved) {
                                                                                setApprovedClips(prev => prev.filter(c => c.url !== clip.url));
                                                                            } else {
                                                                                setApprovedClips(prev => [...prev, clip]);
                                                                            }
                                                                        }}
                                                                        style={{
                                                                            flex: 1,
                                                                            padding: '0.25rem',
                                                                            borderRadius: '4px',
                                                                            border: 'none',
                                                                            background: isApproved ? 'var(--accent)' : 'var(--bg-secondary)',
                                                                            color: isApproved ? '#000' : 'var(--text-primary)',
                                                                            cursor: 'pointer',
                                                                            fontSize: '0.75rem',
                                                                        }}
                                                                    >
                                                                        {isApproved ? '−' : '✓'}
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            if (isApproved) setApprovedClips(prev => prev.filter(c => c.url !== clip.url));
                                                                            setFetchedClips(prev => prev.filter(c => c.url !== clip.url));
                                                                        }}
                                                                        style={{
                                                                            padding: '0.25rem',
                                                                            borderRadius: '4px',
                                                                            border: 'none',
                                                                            background: 'var(--bg-secondary)',
                                                                            color: 'var(--text-secondary)',
                                                                            cursor: 'pointer',
                                                                            fontSize: '0.75rem',
                                                                        }}
                                                                    >
                                                                        <X size={12} />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                                {approvedClips.length > 0 && (
                                                    <div style={{ marginTop: '0.75rem' }}>
                                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>Approved order (used for reel):</div>
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                                                            {approvedClips.map((clip, idx) => (
                                                                <div key={clip.url} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            if (idx > 0) {
                                                                                const next = [...approvedClips];
                                                                                [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                                                                                setApprovedClips(next);
                                                                            }
                                                                        }}
                                                                        disabled={idx === 0}
                                                                        style={{ padding: '0.2rem', border: 'none', background: 'transparent', cursor: idx === 0 ? 'default' : 'pointer', color: 'var(--text-secondary)' }}
                                                                    >
                                                                        ↑
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            if (idx < approvedClips.length - 1) {
                                                                                const next = [...approvedClips];
                                                                                [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
                                                                                setApprovedClips(next);
                                                                            }
                                                                        }}
                                                                        disabled={idx === approvedClips.length - 1}
                                                                        style={{ padding: '0.2rem', border: 'none', background: 'transparent', cursor: idx === approvedClips.length - 1 ? 'default' : 'pointer', color: 'var(--text-secondary)' }}
                                                                    >
                                                                        ↓
                                                                    </button>
                                                                    <span style={{ fontSize: '0.8rem', color: 'var(--accent)' }}>{idx + 1}. {clip.keyword}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {isCustomTab && (
                                        <label style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.6rem',
                                            marginBottom: '1rem',
                                            cursor: 'pointer',
                                            fontSize: '0.9rem',
                                        }}>
                                            <input
                                                type="checkbox"
                                                checked={includeWaveform}
                                                onChange={(e) => setIncludeWaveform(e.target.checked)}
                                                style={{ width: '18px', height: '18px', accentColor: 'var(--accent)' }}
                                            />
                                            <span>Render audio waveform overlay</span>
                                        </label>
                                    )}

                                    {!isCustomTab && (
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
                                                min={10}
                                                max={60}
                                                step={5}
                                                value={reelDuration}
                                                onChange={(e) => setReelDuration(Math.min(60, Math.max(10, Number(e.target.value))))}
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
                                    )}

                                    {!isCustomTab && (
                                    <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>TTS Provider</label>
                                            <select
                                                value={ttsProvider}
                                                onChange={(e) => {
                                                    setTtsProvider(e.target.value);
                                                    setReelVoice(e.target.value === 'elevenlabs' ? 'science_narrator' : 'nova');
                                                }}
                                                style={{
                                                    padding: '0.6rem 0.8rem',
                                                    fontSize: '1rem',
                                                    borderRadius: '8px',
                                                    border: '1px solid var(--border)',
                                                    background: 'var(--bg-primary)',
                                                    color: 'var(--text-primary)',
                                                    width: '170px',
                                                    fontFamily: 'inherit',
                                                }}
                                            >
                                                <option value="openai">OpenAI</option>
                                                <option value="elevenlabs">ElevenLabs</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>Voice</label>
                                            <select
                                                value={reelVoice}
                                                onChange={(e) => setReelVoice(e.target.value)}
                                                style={{
                                                    padding: '0.6rem 0.8rem',
                                                    fontSize: '1rem',
                                                    borderRadius: '8px',
                                                    border: '1px solid var(--border)',
                                                    background: 'var(--bg-primary)',
                                                    color: 'var(--text-primary)',
                                                    width: '200px',
                                                    fontFamily: 'inherit',
                                                }}
                                            >
                                                {ttsProvider === 'openai' ? (
                                                    <>
                                                        <option value="nova">Nova (Female)</option>
                                                        <option value="onyx">Onyx (Male)</option>
                                                        <option value="fable">Fable (British)</option>
                                                    </>
                                                ) : (
                                                    <>
                                                        <option value="science_narrator">Custom Science Narrator</option>
                                                        <option value="brian">Brian (Deep narrator)</option>
                                                        <option value="matilda">Matilda (Warm female)</option>
                                                        <option value="charlie">Charlie (Casual Aussie)</option>
                                                        <option value="dave">Dave (British)</option>
                                                        <option value="lily">Lily (Female narrator)</option>
                                                        <option value="adam">Adam (Deep male)</option>
                                                    </>
                                                )}
                                            </select>
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>Speed ({reelSpeed.toFixed(2)}x)</label>
                                            <input
                                                type="range"
                                                min={0.5}
                                                max={2.0}
                                                step={0.05}
                                                value={reelSpeed}
                                                onChange={(e) => setReelSpeed(Number(e.target.value))}
                                                style={{
                                                    width: '170px',
                                                    accentColor: 'var(--accent)',
                                                }}
                                            />
                                        </div>
                                    </div>
                                    )}

                                    {!isCustomTab && (
                                    <label style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.6rem',
                                        marginBottom: '1rem',
                                        cursor: 'pointer',
                                        fontSize: '0.9rem',
                                    }}>
                                        <input
                                            type="checkbox"
                                            checked={includeWaveform}
                                            onChange={(e) => setIncludeWaveform(e.target.checked)}
                                            style={{ width: '18px', height: '18px', accentColor: 'var(--accent)' }}
                                        />
                                        <span>Render audio waveform overlay</span>
                                    </label>
                                    )}

                                    {!isCustomTab && (
                                    <label style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        marginBottom: '1.5rem',
                                        cursor: 'pointer',
                                        fontSize: '0.9rem',
                                    }}>
                                        <input
                                            type="checkbox"
                                            checked={useHdTts}
                                            onChange={(e) => setUseHdTts(e.target.checked)}
                                            style={{ width: '18px', height: '18px', accentColor: 'var(--accent)' }}
                                        />
                                        <span style={{ fontWeight: 600 }}>Use HD TTS</span>
                                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                                            — re-generates selected text with higher quality audio
                                        </span>
                                    </label>
                                    )}

                                    {/* Background Video (manual) — hidden when clips are approved */}
                                    {approvedClips.length === 0 && (
                                        <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                                            <div style={{ flex: 1, minWidth: '250px' }}>
                                                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>Background Video</label>
                                                <select
                                                    value={bgVideo}
                                                    onChange={(e) => setBgVideo(e.target.value)}
                                                    style={{
                                                        padding: '0.6rem 0.8rem',
                                                        fontSize: '0.95rem',
                                                        borderRadius: '8px',
                                                        border: '1px solid var(--border)',
                                                        background: 'var(--bg-primary)',
                                                        color: 'var(--text-primary)',
                                                        width: '100%',
                                                        fontFamily: 'inherit',
                                                        cursor: 'pointer',
                                                    }}
                                                >
                                                    {BACKGROUND_VIDEOS.map((bg, idx) => (
                                                        <option key={idx} value={bg.value}>{bg.label}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div style={{ flex: 1, minWidth: '250px' }}>
                                                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>Overlay Video (Optional)</label>
                                                <select
                                                    value={overlayVideo}
                                                    onChange={(e) => setOverlayVideo(e.target.value)}
                                                    style={{
                                                        padding: '0.6rem 0.8rem',
                                                        fontSize: '0.95rem',
                                                        borderRadius: '8px',
                                                        border: '1px solid var(--border)',
                                                        background: 'var(--bg-primary)',
                                                        color: 'var(--text-primary)',
                                                        width: '100%',
                                                        fontFamily: 'inherit',
                                                        cursor: 'pointer',
                                                    }}
                                                >
                                                    {BACKGROUND_VIDEOS.map((bg, idx) => (
                                                        <option key={idx} value={bg.value}>{bg.label}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                    )}

                                    {/* Closing Statement (CTA) */}
                                    <div style={{ marginBottom: '1.5rem' }}>
                                        <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>Closing statement</label>
                                        <select
                                            value={CTA_PRESETS.find(p => p.value === closingStatement)?.value ?? ''}
                                            onChange={(e) => setClosingStatement(e.target.value)}
                                            style={{
                                                padding: '0.6rem 0.8rem',
                                                fontSize: '0.95rem',
                                                borderRadius: '8px',
                                                border: '1px solid var(--border)',
                                                background: 'var(--bg-primary)',
                                                color: 'var(--text-primary)',
                                                width: '100%',
                                                maxWidth: '500px',
                                                fontFamily: 'inherit',
                                                marginBottom: '0.5rem',
                                                cursor: 'pointer',
                                            }}
                                        >
                                            {CTA_PRESETS.map((preset, idx) => (
                                                <option key={idx} value={preset.value}>{preset.label}</option>
                                            ))}
                                        </select>
                                        <textarea
                                            value={closingStatement}
                                            onChange={(e) => setClosingStatement(e.target.value)}
                                            placeholder="Or type a custom closing statement..."
                                            rows={3}
                                            style={{
                                                padding: '0.6rem 0.8rem',
                                                fontSize: '0.95rem',
                                                borderRadius: '8px',
                                                border: '1px solid var(--border)',
                                                background: 'var(--bg-primary)',
                                                color: 'var(--text-primary)',
                                                width: '100%',
                                                maxWidth: '500px',
                                                fontFamily: 'inherit',
                                                resize: 'vertical',
                                            }}
                                        />
                                    </div>

                                    <button
                                        onClick={async () => {
                                            if ((!selectedPaperId && !episode && activeTab !== 'custom') || (isCustomTab ? !reelScript.trim() : !reelHeadline.trim())) return;
                                            setGeneratingReel(true);
                                            setReelError(null);
                                            setReelUrl(null);
                                            try {
                                                // Prioritize the narration script textarea
                                                let customText: string | undefined;
                                                if (reelScript.trim()) {
                                                    customText = reelScript.trim();
                                                } else if (useHdTts && transcriptSentences.length > 0) {
                                                    const selected = transcriptSentences.filter(
                                                        s => s.startSec >= audioStart && s.startSec < audioStart + reelDuration
                                                    );
                                                    if (selected.length > 0) {
                                                        customText = selected.map(s => s.text).join(' ');
                                                    }
                                                }
                                                const result = await generateReel(
                                                    episode ? episode.id : null,
                                                    reelHeadline,
                                                    audioStart,
                                                    reelDuration,
                                                    customText,
                                                    closingStatement || undefined,
                                                    (approvedClips.length === 0 && bgVideo) ? `${window.location.origin}/static/background_videos/${bgVideo}` : undefined,
                                                    (approvedClips.length === 0 && overlayVideo) ? `${window.location.origin}/static/background_videos/${overlayVideo}` : undefined,
                                                    reelVoice,
                                                    reelSpeed,
                                                    elevenlabsStability,
                                                    elevenlabsSimilarityBoost,
                                                    elevenlabsStyle,
                                                    ttsProvider,
                                                    selectedPaperId || undefined,
                                                    activeTab,
                                                    approvedClips.length > 0 ? approvedClips.map(c => c.url) : undefined,
                                                    anchorTimeline.length > 0 ? anchorTimeline.map((item, idx) => ({
                                                        image_url: generatedReelImages[idx] || '',
                                                        start_time_seconds: item.start_time_seconds,
                                                        effect_transition_name: item.effect_transition_name,
                                                    })).filter(item => item.image_url !== '') : undefined,
                                                    audioPreviewUrl || undefined,
                                                    wordTimestamps.length > 0 ? wordTimestamps : undefined,
                                                    includeWaveform
                                                );
                                                setReelUrl(result.video_url);
                                            } catch (err: any) {
                                                setReelError(err.message || 'Failed to generate reel');
                                            } finally {
                                                setGeneratingReel(false);
                                            }
                                        }}
                                        disabled={generatingReel || (isCustomTab ? !reelScript.trim() : !reelHeadline.trim())}
                                        style={{
                                            padding: '0.75rem 1.5rem',
                                            fontSize: '1rem',
                                            fontWeight: 600,
                                            borderRadius: '10px',
                                            border: 'none',
                                            background: 'var(--accent)',
                                            color: '#000',
                                            cursor: generatingReel ? 'wait' : 'pointer',
                                            opacity: (generatingReel || (isCustomTab ? !reelScript.trim() : !reelHeadline.trim())) ? 0.6 : 1,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.5rem',
                                        }}
                                    >
                                        {generatingReel ? (
                                            <><Loader2 size={18} className="animate-spin" /> Generating Reel...</>
                                        ) : (
                                            <><Film size={18} /> Generate Reel</>
                                        )}
                                    </button>

                                    {reelError && (
                                        <p style={{ color: '#ff6b6b', marginTop: '1rem' }}>❌ {reelError}</p>
                                    )}

                                    {reelUrl && (
                                        <div style={{ marginTop: '1.5rem' }}>
                                            <video
                                                src={reelUrl}
                                                controls
                                                style={{
                                                    width: '270px',
                                                    height: '480px',
                                                    borderRadius: '12px',
                                                    border: '1px solid var(--border)',
                                                    objectFit: 'cover',
                                                }}
                                            />
                                            <div style={{ marginTop: '0.75rem' }}>
                                                <a
                                                    href={reelUrl}
                                                    download
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '0.4rem',
                                                        padding: '0.6rem 1.2rem',
                                                        background: 'var(--bg-tertiary)',
                                                        color: 'var(--text-primary)',
                                                        borderRadius: '8px',
                                                        textDecoration: 'none',
                                                        fontWeight: 600,
                                                        fontSize: '0.95rem',
                                                    }}
                                                >
                                                    <Download size={16} /> Download Reel
                                                </a>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}
                </div>
            )}
        </main >
    );
}

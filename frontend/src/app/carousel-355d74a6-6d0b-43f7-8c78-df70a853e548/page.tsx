'use client';

import { useState, useEffect, useRef } from 'react';
import html2canvas from 'html2canvas';
import { Download, Loader2, RefreshCw, FileText, Copy, Check, ArrowRight, Film, Sparkles, Award, GripVertical, X, Layers, ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { fetchEpisodeDates, fetchEpisodeBySlug, fetchPapers, fetchPaperCarouselContent, generateReel, generateReelScript, extractVisualQueries, fetchVisuals, fetchLocalLibraryAssets, extractScenePrompts, compileAudioTimeline, generatePromptsFromAnchors, fetchTopPapers, fetchTopScientists, fetchDailyScience, analyzeTopPapers, analyzeDailyScience, generateImagePrompt, generateImage, fetchImageStyles, rewriteVoiceScript, punctuateTranscript, uploadSceneAsset, resolveSceneCandidates, generateSceneAiFallbacks, generateSingleSceneAiPrompt, EpisodeDate, PodcastEpisode, Paper, CarouselSlide, ImpactAnalysis, VisualClip, TimelinePrompt, AnchorWord, WordTimestamp, ImageStyle, SceneTimelineItem, API_BASE_URL } from '@/lib/api';
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
    const scenePromptDraftRef = useRef<Record<string, string>>({});

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
    const [audioSourceMode, setAudioSourceMode] = useState<'tts' | 'upload'>('tts');
    const [uploadedAudioFile, setUploadedAudioFile] = useState<File | null>(null);
    const [uploadedTranscript, setUploadedTranscript] = useState('');
    const [punctuatingTranscript, setPunctuatingTranscript] = useState(false);
    const [sceneTimeline, setSceneTimeline] = useState<SceneTimelineItem[]>([]);
    const [localLibraryAssets, setLocalLibraryAssets] = useState<SceneTimelineItem['stock_candidates']>([]);
    const [loadingLocalLibraryAssets, setLoadingLocalLibraryAssets] = useState(false);
    const [resolvingSceneCandidates, setResolvingSceneCandidates] = useState(false);
    const [generatingSceneAi, setGeneratingSceneAi] = useState(false);
    const [generatingPromptSceneId, setGeneratingPromptSceneId] = useState<string | null>(null);
    const [maxAiGeneratedScenes, setMaxAiGeneratedScenes] = useState(3);
    const [sceneFilter, setSceneFilter] = useState<'all' | 'unresolved' | 'ai-eligible'>('all');

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
    const [uploadingSceneAssetId, setUploadingSceneAssetId] = useState<string | null>(null);
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
    const [carouselImagePrompts, setCarouselImagePrompts] = useState<string[]>([]);
    const [carouselImageUrls, setCarouselImageUrls] = useState<string[]>([]);
    const [generatingCarouselVisuals, setGeneratingCarouselVisuals] = useState(false);
    const [carouselVisualProgress, setCarouselVisualProgress] = useState('');
    const [regeneratingCarouselPromptIdx, setRegeneratingCarouselPromptIdx] = useState<number | null>(null);
    const [generatingCarouselImageIdx, setGeneratingCarouselImageIdx] = useState<number | null>(null);
    const [fetchedClips, setFetchedClips] = useState<VisualClip[]>([]);
    const [approvedClips, setApprovedClips] = useState<VisualClip[]>([]);
    const [fetchingVisuals, setFetchingVisuals] = useState(false);
    const [reelSpeed, setReelSpeed] = useState(1.0);
    const [elevenlabsStability, setElevenlabsStability] = useState(0.65);
    const [elevenlabsSimilarityBoost, setElevenlabsSimilarityBoost] = useState(0.85);
    const [elevenlabsStyle, setElevenlabsStyle] = useState(0.1);
    const [ttsProvider, setTtsProvider] = useState('openai');
    const [includeWaveform, setIncludeWaveform] = useState(false);

    // Engine Tabs & Inputs
    type EngineTab = 'latest' | 'top-papers' | 'top-scientists' | 'daily-science' | 'custom';
    const [activeTab, setActiveTab] = useState<EngineTab>('latest');
    const isCustomTab = activeTab === 'custom';
    const showReelSection =
        isCustomTab ||
        (activeTab === 'latest' && !!episode) ||
        ((activeTab === 'top-papers' || activeTab === 'top-scientists' || activeTab === 'daily-science') && !!selectedPaperId);

    const resetReelWorkspace = () => {
        setReelUrl(null);
        setReelError(null);
        setReelScript('');
        setReelHeadline('');
        setAnchorTimeline([]);
        setAnchorWords([]);
        setSceneTimeline([]);
        setGeneratedReelImages([]);
        setWordTimestamps([]);
        setAudioPreviewUrl(null);
        setAudioPreviewDuration(0);
        setAudioPreviewCurrentTime(0);
        setUploadedAudioFile(null);
        setUploadedTranscript('');
        setAudioSourceMode('tts');
        setDraggingTransitionIdx(null);
        scenePromptDraftRef.current = {};
    };

    useEffect(() => {
        if (!isCustomTab) return;
        const hasArchival = imageStyles.some(style => style.slug === 'archival_bw');
        if (!hasArchival) return;
        if (visualStyle === 'photojournalism') {
            setVisualStyle('archival_bw');
        }
    }, [isCustomTab, imageStyles, visualStyle]);

    useEffect(() => {
        if (!isCustomTab) return;
        let cancelled = false;
        const loadLocalLibraryAssets = async () => {
            setLoadingLocalLibraryAssets(true);
            try {
                const result = await fetchLocalLibraryAssets(1200);
                if (!cancelled) {
                    setLocalLibraryAssets(result.assets || []);
                }
            } catch (err) {
                if (!cancelled) {
                    setLocalLibraryAssets([]);
                }
            } finally {
                if (!cancelled) {
                    setLoadingLocalLibraryAssets(false);
                }
            }
        };
        loadLocalLibraryAssets();
        return () => {
            cancelled = true;
        };
    }, [isCustomTab]);

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
    const [editedTakeaways, setEditedTakeaways] = useState<string[]>(['', '', '']);
    const [editedOutro, setEditedOutro] = useState('Read the full paper in the description below.');
    const [editedOutroFollow, setEditedOutroFollow] = useState('Follow @the.eureka.feed for research-backed explainers.');
    const [showTag, setShowTag] = useState(false);

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
        anchorTimeline.length > 0 ? anchorTimeline[anchorTimeline.length - 1].start_time_seconds : 0,
        sceneTimeline.length > 0 ? sceneTimeline[sceneTimeline.length - 1].start_time_seconds : 0
    );

    const normaliseTimelineWord = (word: string) => word.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '');
    const resolveAssetUrl = (url?: string | null) => {
        if (!url) return '';
        return url.startsWith('/') ? `${API_BASE_URL}${url}` : url;
    };
    const isVideoAssetType = (assetType?: string | null) => (assetType || '').endsWith('_video');
    const describeCandidateType = (type: string) => {
        if (type === 'local_video') return 'Library video';
        if (type === 'local_image') return 'Library image';
        if (type === 'stock_video') return 'Stock video';
        return 'Stock image';
    };
    const buildCustomDeckTakeaways = () => editedTakeaways.map(item => item.trim()).filter(Boolean);
    const buildCustomDeckSlides = () => {
        const takeaways = buildCustomDeckTakeaways();
        const ctaText = [editedOutro.trim(), editedOutroFollow.trim()].filter(Boolean).join(' ');
        return [
            { label: 'Slide 1', text: editedHeadline.trim() },
            ...takeaways.map((text, idx) => ({ label: `Slide ${idx + 2}`, text })),
            { label: `Slide ${takeaways.length + 2}`, text: ctaText.trim() },
        ].filter(item => item.text);
    };
    const getSlideBackgroundUrl = (slideIndex: number) => {
        if (!slideData) return '';
        const slideImages = (slideData.imageUrls || []).filter(Boolean);
        if (slideImages[slideIndex]) return resolveAssetUrl(slideImages[slideIndex]);
        if (slideImages.length > 0) return resolveAssetUrl(slideImages[slideImages.length - 1]);
        return resolveAssetUrl(slideData.imageUrl);
    };

    const clampTransitionTime = (items: { start_time_seconds: number }[], idx: number, proposedTime: number) => {
        const previousBound = idx > 0 ? items[idx - 1].start_time_seconds + 0.05 : 0;
        const nextBound = idx < items.length - 1 ? items[idx + 1].start_time_seconds - 0.05 : timelineDuration;
        if (nextBound <= previousBound) return previousBound;
        return Math.min(Math.max(proposedTime, previousBound), nextBound);
    };

    const findNearestWordTimestamp = (
        targetTime: number,
        minTime: number = 0,
        maxTime: number = timelineDuration,
    ): WordTimestamp | null => {
        if (wordTimestamps.length === 0) return null;
        const candidates = wordTimestamps.filter(w => w.start >= minTime && w.start <= maxTime);
        const pool = candidates.length > 0 ? candidates : wordTimestamps;
        return pool.reduce((best, current) => {
            return Math.abs(current.start - targetTime) < Math.abs(best.start - targetTime) ? current : best;
        }, pool[0]);
    };

    const buildSceneExcerpt = (startTime: number, endTime: number, fallback: string) => {
        if (wordTimestamps.length === 0) return fallback;
        const safeStart = Math.max(0, startTime - 0.03);
        const safeEnd = Math.max(endTime, startTime + 0.05);
        const words = wordTimestamps
            .filter(w => w.end > safeStart && w.start < safeEnd)
            .map(w => w.word.trim())
            .filter(Boolean);
        return words.join(' ') || fallback;
    };

    const buildSceneCaptionSuggestion = (
        transcriptExcerpt: string,
        anchorPhrase: string = '',
        focusWord: string = '',
    ) => {
        const source = (anchorPhrase || transcriptExcerpt || focusWord || '').trim();
        if (!source) return '';

        const tokens = source
            .replace(/\n/g, ' ')
            .split(/\s+/)
            .map(token => token.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, ''))
            .filter(Boolean);
        if (tokens.length === 0) return '';

        const leadingFillers = new Set([
            'i', 'we', 'you', 'they', 'he', 'she', 'it',
            'was', 'were', 'am', 'is', 'are', 'be', 'been', 'being',
            'have', 'has', 'had', 'do', 'did', 'does',
            'to', 'that', 'just', 'really', 'kind', 'sort',
        ]);
        while (tokens.length > 2 && leadingFillers.has(tokens[0].toLowerCase())) {
            tokens.shift();
        }

        const lowered = tokens.map(token => token.toLowerCase());
        const toIdx = lowered.indexOf('to');
        if (toIdx >= 0) {
            const tail = tokens.slice(toIdx + 1);
            if (tail.length >= 1 && tail.length <= 4) return tail.join(' ');
        }

        const forIdx = lowered.indexOf('for');
        if (forIdx >= 0) {
            const tail = tokens.slice(Math.max(0, forIdx - 1));
            if (tail.length >= 2 && tail.length <= 4) return tail.join(' ');
        }

        if (tokens.length <= 4) return tokens.join(' ');
        return tokens.slice(-3).join(' ');
    };

    const syncSceneMetadataToTime = (
        scene: SceneTimelineItem,
        startTime: number,
        endTime: number,
        bounds?: { minTime?: number; maxTime?: number },
    ): SceneTimelineItem => {
        const nearestWord = findNearestWordTimestamp(
            startTime,
            bounds?.minTime ?? 0,
            bounds?.maxTime ?? timelineDuration,
        );
        const nextAnchorWord = nearestWord
            ? normaliseTimelineWord(nearestWord.word) || scene.anchor_word
            : scene.anchor_word;
        const nextExcerpt = buildSceneExcerpt(
            startTime,
            endTime,
            scene.anchor_phrase || scene.transcript_excerpt || nextAnchorWord,
        );
        const nextSuggestedCaption = buildSceneCaptionSuggestion(
            nextExcerpt,
            scene.anchor_phrase || nextExcerpt,
            nearestWord ? normaliseTimelineWord(nearestWord.word) || scene.visual_focus_word || nextAnchorWord : scene.visual_focus_word || nextAnchorWord,
        );
        return {
            ...scene,
            start_time_seconds: startTime,
            end_time_seconds: endTime,
            anchor_word: nextAnchorWord,
            visual_focus_word: nearestWord ? normaliseTimelineWord(nearestWord.word) || scene.visual_focus_word || nextAnchorWord : scene.visual_focus_word,
            anchor_phrase: nextExcerpt,
            transcript_excerpt: nextExcerpt,
            caption_text: scene.caption_is_custom ? scene.caption_text : nextSuggestedCaption,
            caption_is_custom: scene.caption_is_custom ?? false,
        };
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

    const reindexScenes = (scenes: SceneTimelineItem[]) => {
        if (scenes.length === 0) return scenes;
        const ordered = scenes
            .slice()
            .sort((a, b) => a.start_time_seconds - b.start_time_seconds);

        return ordered.map((scene, idx, arr) => {
            const nextStart = arr[idx + 1]?.start_time_seconds;
            const fallbackEnd = timelineDuration > 0
                ? timelineDuration
                : wordTimestamps[wordTimestamps.length - 1]?.end ?? scene.end_time_seconds ?? scene.start_time_seconds + 0.5;
            const endTime = nextStart !== undefined
                ? Math.max(nextStart, scene.start_time_seconds + 0.01)
                : Math.max(fallbackEnd, scene.start_time_seconds + 0.5);

            return syncSceneMetadataToTime(
                {
                    ...scene,
                    scene_id: `scene-${idx + 1}`,
                },
                scene.start_time_seconds,
                endTime,
                {
                    minTime: idx > 0 ? arr[idx - 1].start_time_seconds + 0.05 : 0,
                    maxTime: nextStart !== undefined ? nextStart - 0.05 : fallbackEnd,
                },
            );
        });
    };

    const updateTransitionFromTime = (idx: number, rawTime: number) => {
        if (isCustomTab && sceneTimeline.length > 0) {
            let updatedScenesForSync: SceneTimelineItem[] | null = null;
            setSceneTimeline(prev => {
                if (idx < 0 || idx >= prev.length) return prev;
                const next = [...prev];
                const clampedTime = clampTransitionTime(next, idx, rawTime);
                next[idx] = {
                    ...next[idx],
                    start_time_seconds: clampedTime,
                };
                const synced = reindexScenes(next);
                updatedScenesForSync = synced;
                return synced;
            });
            if (updatedScenesForSync) {
                syncAnchorWordsFromScenes(updatedScenesForSync);
            }
            return;
        }

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

    const filteredScenes = sceneTimeline.filter((scene, idx) => {
        if (sceneFilter === 'unresolved') return scene.asset_source === 'none';
        if (sceneFilter === 'ai-eligible') return scene.scene_state === 'ai_eligible' || (!!scene.ai_prompt && !scene.ai_image_url);
        return true;
    });

    useEffect(() => {
        // Keep a live prompt map so per-scene generation always uses the latest edited text.
        const nextDrafts: Record<string, string> = { ...scenePromptDraftRef.current };
        for (const scene of sceneTimeline) {
            nextDrafts[scene.scene_id] = scene.ai_prompt || "";
        }
        scenePromptDraftRef.current = nextDrafts;
    }, [sceneTimeline]);

    const syncAnchorWordsFromScenes = (scenes: SceneTimelineItem[]) => {
        setAnchorWords(scenes.map(scene => ({
            word: scene.anchor_word,
            start_time_seconds: scene.start_time_seconds,
            end_time_seconds: scene.end_time_seconds,
        })));
    };

    const normalizeSceneTimelineItem = (scene: SceneTimelineItem): SceneTimelineItem => ({
        ...scene,
        caption_text: scene.caption_text ?? buildSceneCaptionSuggestion(
            scene.transcript_excerpt || scene.anchor_phrase || scene.anchor_word,
            scene.anchor_phrase || scene.transcript_excerpt || scene.anchor_word,
            scene.visual_focus_word || scene.anchor_word,
        ),
        caption_is_custom: scene.caption_is_custom ?? false,
    });

    const normalizeSceneTimeline = (scenes: SceneTimelineItem[]) => reindexScenes(scenes.map(normalizeSceneTimelineItem));

    const deleteScene = (sceneId: string) => {
        setSceneTimeline(prev => {
            if (prev.length <= 1) return prev;
            const next = reindexScenes(prev.filter(scene => scene.scene_id !== sceneId));
            syncAnchorWordsFromScenes(next);
            return next;
        });
    };

    const addSceneAfter = (sceneId: string) => {
        setSceneTimeline(prev => {
            const idx = prev.findIndex(scene => scene.scene_id === sceneId);
            if (idx === -1) return prev;
            const current = prev[idx];
            const nextScene = prev[idx + 1];
            const nextBoundary = nextScene?.start_time_seconds ?? Math.max(timelineDuration, current.start_time_seconds + 1.5);
            const targetTime = current.start_time_seconds + Math.max((nextBoundary - current.start_time_seconds) / 2, 0.2);

            let anchorWord = "New scene";
            let startTime = targetTime;
            let endTime = Math.min(targetTime + 1.0, nextBoundary);
            if (wordTimestamps.length > 0) {
                const closest = wordTimestamps.reduce((best, item) => (
                    Math.abs(item.start - targetTime) < Math.abs(best.start - targetTime) ? item : best
                ), wordTimestamps[0]);
                anchorWord = closest.word;
                startTime = closest.start;
                endTime = closest.end;
            }

            const insertion: SceneTimelineItem = {
                scene_id: "scene-new",
                anchor_word: anchorWord,
                visual_focus_word: anchorWord,
                anchor_phrase: anchorWord,
                start_time_seconds: startTime,
                end_time_seconds: endTime,
                transcript_excerpt: anchorWord,
                caption_text: buildSceneCaptionSuggestion(anchorWord, anchorWord, anchorWord),
                caption_is_custom: false,
                effect_transition_name: current.effect_transition_name,
                search_queries: [],
                stock_candidates: [],
                selected_asset: null,
                ai_prompt: "",
                ai_image_url: null,
                last_generated_ai_prompt: null,
                asset_source: "none",
                scene_state: "unresolved",
            };

            const next = [...prev];
            next.splice(idx + 1, 0, insertion);
            const reindexed = reindexScenes(next);
            syncAnchorWordsFromScenes(reindexed);
            return reindexed;
        });
    };

    const addSceneAtTime = (requestedTime: number) => {
        setSceneTimeline(prev => {
            if (prev.length === 0) return prev;
            const sorted = [...prev].sort((a, b) => a.start_time_seconds - b.start_time_seconds);
            const maxTimeline = timelineDuration > 0
                ? timelineDuration
                : Math.max(sorted[sorted.length - 1].end_time_seconds || 0, requestedTime + 0.5);
            const clampedRequest = Math.min(Math.max(requestedTime, 0), maxTimeline);

            let insertIdx = sorted.findIndex(scene => scene.start_time_seconds > clampedRequest);
            if (insertIdx === -1) insertIdx = sorted.length;
            const previousScene = sorted[insertIdx - 1];
            const nextScene = sorted[insertIdx];
            const minBound = previousScene ? previousScene.start_time_seconds + 0.05 : 0;
            const maxBound = nextScene ? nextScene.start_time_seconds - 0.05 : maxTimeline;

            const targetTime = maxBound <= minBound
                ? minBound
                : Math.min(Math.max(clampedRequest, minBound), maxBound);

            let anchorWord = "New scene";
            let startTime = targetTime;
            let endTime = Math.min(targetTime + 1.0, maxBound > targetTime ? maxBound : targetTime + 1.0);
            if (wordTimestamps.length > 0) {
                const closest = wordTimestamps.reduce((best, item) => (
                    Math.abs(item.start - targetTime) < Math.abs(best.start - targetTime) ? item : best
                ), wordTimestamps[0]);
                anchorWord = closest.word;
                startTime = closest.start;
                endTime = closest.end;
            }

            const insertion: SceneTimelineItem = {
                scene_id: "scene-new",
                anchor_word: anchorWord,
                visual_focus_word: anchorWord,
                anchor_phrase: anchorWord,
                start_time_seconds: startTime,
                end_time_seconds: endTime,
                transcript_excerpt: anchorWord,
                caption_text: buildSceneCaptionSuggestion(anchorWord, anchorWord, anchorWord),
                caption_is_custom: false,
                effect_transition_name: previousScene?.effect_transition_name || nextScene?.effect_transition_name,
                search_queries: [],
                stock_candidates: [],
                selected_asset: null,
                ai_prompt: "",
                ai_image_url: null,
                last_generated_ai_prompt: null,
                asset_source: "none",
                scene_state: "unresolved",
            };

            const next = [...sorted];
            next.splice(insertIdx, 0, insertion);
            const reindexed = reindexScenes(next);
            syncAnchorWordsFromScenes(reindexed);
            return reindexed;
        });
    };

    const handleSceneAssetUpload = async (sceneId: string, file: File | null) => {
        if (!file) return;
        setUploadingSceneAssetId(sceneId);
        try {
            const uploaded = await uploadSceneAsset(file);
            setSceneTimeline(prev => prev.map(item => item.scene_id === sceneId ? {
                ...item,
                selected_asset: {
                    asset_source: uploaded.asset_source,
                    asset_url: uploaded.asset_url,
                    thumbnail_url: uploaded.thumbnail_url || uploaded.asset_url,
                    candidate_id: null,
                },
                asset_source: uploaded.asset_source,
                scene_state: 'resolved_by_user',
            } : item));
        } catch (err: any) {
            alert(err?.message || 'Failed to upload scene asset');
        } finally {
            setUploadingSceneAssetId(null);
        }
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
    }, [draggingTransitionIdx, timelineDuration, wordTimestamps, anchorTimeline, sceneTimeline, isCustomTab]);

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
    const ensureNoHumansConstraint = (prompt: string) => {
        const normalized = prompt.toLowerCase();
        if (
            normalized.includes("no humans") ||
            normalized.includes("no people") ||
            normalized.includes("without humans")
        ) {
            return prompt;
        }
        return `${prompt.trim()}. Absolutely no humans, no people, no faces, no body parts.`;
    };

    const buildSlidePromptInput = (
        storyContext: string,
        slideLabel: string,
        slideText: string
    ) => (
        `Write one image-generation prompt for ${slideLabel} of this carousel.\n\n` +
        `Full story context (for narrative relevance):\n${storyContext}\n\n` +
        `Current slide text:\n${slideText}\n\n` +
        `Rules:\n` +
        `- photorealistic, cinematic, high-retention composition\n` +
        `- no text, logos, or letters in the image\n` +
        `- no humans, no faces, no body parts, no crowds\n` +
        `- you may reuse the same visual concept as other slides; do not force visual diversity.`
    );

    const handleRegenerateCarouselPrompt = async (idx: number) => {
        const deckSlides = buildCustomDeckSlides();
        const slide = deckSlides[idx];
        if (!slide) return;

        setRegeneratingCarouselPromptIdx(idx);
        try {
            const storyContext = deckSlides.map((item, orderIdx) => `${orderIdx + 1}. ${item.text}`).join('\n');
            const { prompt } = await generateImagePrompt(
                buildSlidePromptInput(storyContext, slide.label, slide.text)
            );
            const constrainedPrompt = ensureNoHumansConstraint(prompt);
            setCarouselImagePrompts(prev => {
                const next = [...prev];
                while (next.length <= idx) next.push('');
                next[idx] = constrainedPrompt;
                return next;
            });
            setCarouselImageUrls(prev => {
                const next = [...prev];
                while (next.length <= idx) next.push('');
                next[idx] = '';
                return next;
            });
            setCarouselVisualProgress(`Prompt refreshed for slide ${idx + 1}.`);
        } catch (err) {
            console.error('Error regenerating carousel prompt', err);
            setError(`Failed to regenerate prompt for slide ${idx + 1}.`);
        } finally {
            setRegeneratingCarouselPromptIdx(null);
        }
    };

    const handleGenerateCarouselPrompts = async () => {
        const deckSlides = buildCustomDeckSlides();
        if (!deckSlides.length) {
            setError('Add story text first before generating prompts.');
            return;
        }

        setGeneratingCarouselVisuals(true);
        setCarouselVisualProgress('Generating prompts...');
        setError(null);

        try {
            const storyContext = deckSlides.map((slide, idx) => `${idx + 1}. ${slide.text}`).join('\n');
            const nextPrompts: string[] = [];
            const maxSlides = Math.min(deckSlides.length, 5);

            for (let idx = 0; idx < maxSlides; idx += 1) {
                const slide = deckSlides[idx];
                setCarouselVisualProgress(`Generating prompt ${idx + 1}/${maxSlides}...`);
                const { prompt } = await generateImagePrompt(
                    buildSlidePromptInput(storyContext, slide.label, slide.text)
                );
                nextPrompts.push(ensureNoHumansConstraint(prompt));
            }

            setCarouselImagePrompts(nextPrompts);
            setCarouselImageUrls(prev => nextPrompts.map((_, idx) => prev[idx] || ''));
            setCarouselVisualProgress(`Generated ${nextPrompts.length} prompts. Generate images per slide.`);
        } catch (err) {
            console.error('Error generating carousel prompts', err);
            setError('Failed to generate prompts. Check API keys and retry.');
        } finally {
            setGeneratingCarouselVisuals(false);
        }
    };

    const handleGenerateCarouselImage = async (idx: number) => {
        const prompt = ensureNoHumansConstraint((carouselImagePrompts[idx] || '').trim());
        if (!prompt) return;

        setGeneratingCarouselImageIdx(idx);
        try {
            const { image_url } = await generateImage(prompt);
            const resolved = resolveAssetUrl(image_url);
            setCarouselImagePrompts(prev => {
                const next = [...prev];
                while (next.length <= idx) next.push('');
                next[idx] = prompt;
                return next;
            });
            setCarouselImageUrls(prev => {
                const next = [...prev];
                while (next.length <= idx) next.push('');
                next[idx] = resolved;
                return next;
            });
            if (customSlidesReady) {
                setSlideData(prev => {
                    if (!prev) return prev;
                    const nextImages = [...(prev.imageUrls || [])];
                    while (nextImages.length <= idx) nextImages.push('');
                    nextImages[idx] = resolved;
                    return {
                        ...prev,
                        imageUrl: nextImages[0] || prev.imageUrl,
                        imageUrls: nextImages,
                    };
                });
            }
        } catch (err) {
            console.error('Error generating carousel image', err);
            setError(`Failed to generate image for slide ${idx + 1}.`);
        } finally {
            setGeneratingCarouselImageIdx(null);
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

                // Preload each slide's background image as base64 to bypass html2canvas CORS/taint issues.
                try {
                    const bgDiv = clone.querySelector(`.${styles.slideBackground}`) as HTMLElement;
                    if (bgDiv) {
                        const oldBg = bgDiv.style.backgroundImage || window.getComputedStyle(bgDiv).backgroundImage;
                        const bgMatch = oldBg.match(/url\((['"]?)(.*?)\1\)/);
                        if (bgMatch?.[2]) {
                            const bgUrl = resolveAssetUrl(bgMatch[2]);
                            const res = await fetch(bgUrl);
                            const blob = await res.blob();
                            const base64 = await new Promise<string>((resolve) => {
                                const reader = new FileReader();
                                reader.onloadend = () => resolve(reader.result as string);
                                reader.readAsDataURL(blob);
                            });
                            bgDiv.style.backgroundImage = oldBg.replace(/url\([^)]+\)/, `url(${base64})`);
                            bgDiv.style.opacity = '1';
                        }
                    }
                } catch (e) {
                    console.error('Failed to preload background image for canvas', e);
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
                            resetReelWorkspace();
                            setActiveTab(tab);
                            setPapers([]);
                            setSelectedPaperId(null);
                            setSlideData(null);
                            if (tab !== 'latest') {
                                setEpisode(null);
                            }
                            setImpactAnalysis(null);
                            setSlideTitle('');
                            setEditedHeadline('');
                            setEditedTakeaways(['', '', '']);
                            setEditedOutro('Read the full paper in the description below.');
                            setEditedOutroFollow('Follow @the.eureka.feed for research-backed explainers.');
                            setShowTag(false);
                            setCustomCaption('');
                            setCarouselImagePrompts([]);
                            setCarouselImageUrls([]);
                            setCarouselVisualProgress('');
                            setRegeneratingCarouselPromptIdx(null);
                            setGeneratingCarouselImageIdx(null);
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
                            {editedTakeaways.map((slideText, idx) => (
                                <div className={styles.filterGroup} style={{ width: '100%' }} key={`custom-input-slide-${idx}`}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.45rem' }}>
                                        <label style={{ margin: 0 }}>Slide {idx + 2}</label>
                                        {editedTakeaways.length > 1 && (
                                            <button
                                                type="button"
                                                className={styles.engineButtonSecondary}
                                                onClick={() => {
                                                    setEditedTakeaways(prev => prev.filter((_, takeIdx) => takeIdx !== idx));
                                                    setCarouselImagePrompts(prev => prev.filter((_, imageIdx) => imageIdx !== idx + 1));
                                                    setCarouselImageUrls(prev => prev.filter((_, imageIdx) => imageIdx !== idx + 1));
                                                }}
                                                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.35rem 0.55rem' }}
                                            >
                                                <Trash2 size={14} />
                                                Delete
                                            </button>
                                        )}
                                    </div>
                                    <textarea
                                        className={styles.engineInput}
                                        placeholder={`Text for slide ${idx + 2}...`}
                                        value={slideText}
                                        onChange={(e) => {
                                            const next = [...editedTakeaways];
                                            next[idx] = e.target.value;
                                            setEditedTakeaways(next);
                                        }}
                                        rows={3}
                                        style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
                                    />
                                </div>
                            ))}
                            <button
                                type="button"
                                className={styles.engineButtonSecondary}
                                onClick={() => setEditedTakeaways(prev => [...prev, ''])}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', width: 'fit-content' }}
                            >
                                <Plus size={16} />
                                Add Slide
                            </button>
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
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                                    <h3 style={{ margin: 0, fontSize: '1rem', color: '#64ffda', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
                                        <Sparkles size={18} /> AI Slide Visual Set (Top 5)
                                    </h3>
                                    <button
                                        className={styles.engineButtonSmall}
                                        onClick={handleGenerateCarouselPrompts}
                                        disabled={generatingCarouselVisuals || !editedHeadline.trim()}
                                    >
                                        {generatingCarouselVisuals ? <Loader2 size={14} className={styles.spinAnimation} /> : <FileText size={14} />}
                                        Generate 5 Prompts
                                    </button>
                                </div>

                                {carouselVisualProgress && (
                                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                        {carouselVisualProgress}
                                    </p>
                                )}

                                {carouselImagePrompts.length > 0 && (
                                    <div style={{ display: 'grid', gap: '0.85rem' }}>
                                        {carouselImagePrompts.map((prompt, idx) => (
                                            <div key={`carousel-visual-${idx}`} style={{ border: '1px solid rgba(100, 255, 218, 0.22)', borderRadius: '10px', padding: '0.75rem', background: 'rgba(10, 10, 15, 0.5)' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', marginBottom: '0.45rem' }}>
                                                    <label style={{ fontSize: '0.75rem', opacity: 0.8, fontWeight: 600, margin: 0 }}>Slide {idx + 1} prompt</label>
                                                    <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                                                        <button
                                                            type="button"
                                                            className={styles.engineButtonSmall}
                                                            onClick={() => handleRegenerateCarouselPrompt(idx)}
                                                            disabled={regeneratingCarouselPromptIdx === idx}
                                                        >
                                                            {regeneratingCarouselPromptIdx === idx ? <Loader2 size={12} className={styles.spinAnimation} /> : <RefreshCw size={12} />}
                                                            Regenerate prompt
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className={styles.engineButtonSmall}
                                                            onClick={() => handleGenerateCarouselImage(idx)}
                                                            disabled={generatingCarouselImageIdx === idx || !prompt.trim()}
                                                        >
                                                            {generatingCarouselImageIdx === idx ? <Loader2 size={12} className={styles.spinAnimation} /> : <Film size={12} />}
                                                            {carouselImageUrls[idx] ? 'Regenerate image' : 'Generate image'}
                                                        </button>
                                                    </div>
                                                </div>
                                                <textarea
                                                    className={styles.engineInput}
                                                    value={prompt}
                                                    onChange={(e) => {
                                                        const next = [...carouselImagePrompts];
                                                        next[idx] = e.target.value;
                                                        setCarouselImagePrompts(next);
                                                    }}
                                                    rows={3}
                                                    style={{ width: '100%', fontSize: '0.83rem' }}
                                                />
                                                <p style={{ margin: '0.5rem 0 0', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                                                    Human subjects are blocked for this visual set.
                                                </p>
                                                {carouselImageUrls[idx] && (
                                                    <div style={{ marginTop: '0.6rem', borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(100, 255, 218, 0.24)', maxWidth: '220px' }}>
                                                        <img
                                                            src={carouselImageUrls[idx]}
                                                            alt={`Slide ${idx + 1} visual`}
                                                            style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', display: 'block' }}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <button
                                className={styles.engineButton}
                                style={{ width: '100%', padding: '1.2rem', fontSize: '1.1rem', display: 'flex', justifyContent: 'center' }}
                                onClick={() => {
                                    const takeaways = buildCustomDeckTakeaways();
                                    if (!editedHeadline.trim() || takeaways.length === 0) {
                                        setError('Provide at least a headline and one slide text.');
                                        return;
                                    }
                                    const slideCount = takeaways.length + 2;
                                    const appliedImageUrls = carouselImageUrls.slice(0, slideCount).filter(Boolean);
                                    setEditedTakeaways(takeaways);
                                    setSlideData({
                                        paper_id: 0,
                                        category: customCategory || 'SCIENCE',
                                        headline: editedHeadline.trim(),
                                        takeaways: takeaways,
                                        caption: customCaption,
                                        imageUrl: appliedImageUrls[0] || undefined,
                                        imageUrls: appliedImageUrls.length ? appliedImageUrls : undefined,
                                    });
                                    setCustomSlidesReady(true);
                                    setError(null);
                                    setIsCustomInputOpen(false);
                                }}
                            >
                                <Sparkles size={20} /> Generate & Review Slides
                            </button>

                            {customSlidesReady && slideData && (
                                <div style={{
                                    marginTop: '1.25rem',
                                    padding: '1.25rem',
                                    borderRadius: '12px',
                                    border: '1px solid var(--border)',
                                    background: 'var(--bg-primary)',
                                    display: 'grid',
                                    gap: '1rem'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                                        <div>
                                            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>Generated Story Deck</h3>
                                            <p style={{ margin: '0.35rem 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                                                Slides stay in Story Deck now. Review them here before moving into reel generation.
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setCustomSlidesReady(false)}
                                            style={{
                                                padding: '0.55rem 0.85rem',
                                                borderRadius: '8px',
                                                border: '1px solid var(--border)',
                                                background: 'transparent',
                                                color: 'var(--text-secondary)',
                                                cursor: 'pointer',
                                            }}
                                        >
                                            Hide review
                                        </button>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.85rem' }}>
                                        {[slideData.headline, ...slideData.takeaways, `${editedOutro}\n${editedOutroFollow}`.trim()].map((text, idx) => (
                                            <div key={idx} style={{ border: '1px solid var(--border)', borderRadius: '10px', background: 'var(--bg-secondary)', padding: '1rem', minHeight: '180px', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.04em' }}>
                                                    {idx === 0 ? 'SLIDE 1' : idx <= slideData.takeaways.length ? `SLIDE ${idx + 1}` : 'FINAL CTA'}
                                                </div>
                                                <div style={{ fontSize: idx === 0 ? '1.15rem' : '0.95rem', fontWeight: idx === 0 ? 700 : 500, lineHeight: 1.45, color: 'var(--text-primary)' }}>
                                                    {text}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
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
            {((selectedPaperId && slideData && !loadingSlide) || (activeTab === 'custom' && customSlidesReady && slideData)) && (
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
                                                style={getSlideBackgroundUrl(0) ? {
                                                    backgroundImage: `linear-gradient(to bottom, rgba(10, 10, 15, 0.1) 0%, rgba(10, 10, 15, 0.8) 70%, rgba(10, 10, 15, 0.95) 100%), url(${getSlideBackgroundUrl(0)})`,
                                                    backgroundSize: 'cover',
                                                    backgroundPosition: 'center',
                                                } : {}}
                                            ></div>
                                            <div className={styles.slideContent} style={{ justifyContent: 'center' }}>
                                                <div className={styles.slideHeader}>
                                                    <div className={styles.brandName}>The Eureka Feed</div>
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
                                                        style={getSlideBackgroundUrl(idx + 1) ? {
                                                            backgroundImage: `linear-gradient(to bottom, rgba(10, 10, 15, 0.3) 0%, rgba(10, 10, 15, 0.8) 60%, rgba(10, 10, 15, 0.95) 100%), url(${getSlideBackgroundUrl(idx + 1)})`,
                                                            backgroundSize: 'cover',
                                                            backgroundPosition: 'center',
                                                        } : {}}
                                                    ></div>
                                                    <div className={styles.slideContent}>
                                                        <div className={styles.slideHeader}>
                                                            <div className={styles.brandName}>The Eureka Feed</div>
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
                                                style={getSlideBackgroundUrl(editedTakeaways.length + 1) ? {
                                                    backgroundImage: `linear-gradient(to bottom, rgba(10, 10, 15, 0.1) 0%, rgba(10, 10, 15, 0.8) 70%, rgba(10, 10, 15, 0.95) 100%), url(${getSlideBackgroundUrl(editedTakeaways.length + 1)})`,
                                                    backgroundSize: 'cover',
                                                    backgroundPosition: 'center',
                                                } : {}}
                                            ></div>
                                            <div className={styles.slideContent}>
                                                <div className={styles.slideHeader}>
                                                    <div className={styles.brandName}>The Eureka Feed</div>
                                                </div>

                                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', paddingBottom: '28px', textAlign: 'center', gap: '24px' }}>
                                                    <div style={{ color: '#ffffff', fontSize: '3rem', fontWeight: 700, lineHeight: 1.22 }}>
                                                        {editedOutro}
                                                    </div>

                                                    <div style={{ padding: '38px 42px', background: 'rgba(10, 10, 15, 0.55)', borderRadius: '24px', border: '1px solid rgba(100, 255, 218, 0.22)', display: 'grid', gap: '18px' }}>
                                                        <div style={{ color: 'rgba(255,255,255,0.94)', fontSize: '2rem', fontWeight: 700, lineHeight: 1.28 }}>
                                                            The Eureka Feed
                                                        </div>
                                                        <div style={{ color: 'rgba(255,255,255,0.82)', fontSize: '1.35rem', lineHeight: 1.45 }}>
                                                            We turn complex papers into short content backed by real research.
                                                        </div>
                                                        <div style={{ color: 'var(--accent)', fontSize: '2rem', fontWeight: 700, letterSpacing: '0.01em', lineHeight: 1.3 }}>
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
                                        placeholder="Edit description CTA..."
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
                                        placeholder="Edit follow CTA..."
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}


            {/* Reel Generator */}
            {showReelSection && (
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
                                {!isCustomTab && episode ? ' Click on any sentence in the transcript below to set the start time.' : ' Write or generate a narration script below.'}
                            </p>

                            {/* Transcript viewer — only for episodes */}
                            {!isCustomTab && episode && transcriptSentences.length > 0 && (
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
                                                        <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--accent)' }}>Step 1: Audio Source & Timing</h3>
                                                        <p style={{ margin: '0.35rem 0 0', color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.5, maxWidth: '640px' }}>
                                                            Compile TTS or upload a finished narration. Whisper timing drives the rest of the reel workflow.
                                                        </p>
                                                    </div>
                                                </div>
                                                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(280px, 1fr)', gap: '1rem', marginBottom: '1rem', alignItems: 'start' }}>
                                                    <div style={{ display: 'grid', gap: '0.75rem' }}>
                                                        <div>
                                                            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>Audio source mode</label>
                                                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                                {[
                                                                    { value: 'tts', label: 'Generate Voice' },
                                                                    { value: 'upload', label: 'Upload Narration' },
                                                                ].map(option => (
                                                                    <button
                                                                        key={option.value}
                                                                        type="button"
                                                                        onClick={() => setAudioSourceMode(option.value as 'tts' | 'upload')}
                                                                        style={{
                                                                            padding: '0.55rem 0.9rem',
                                                                            borderRadius: '999px',
                                                                            border: `1px solid ${audioSourceMode === option.value ? 'var(--accent)' : 'var(--border)'}`,
                                                                            background: audioSourceMode === option.value ? 'rgba(100, 255, 218, 0.08)' : 'var(--bg-secondary)',
                                                                            color: audioSourceMode === option.value ? 'var(--accent)' : 'var(--text-primary)',
                                                                            fontWeight: 600,
                                                                            cursor: 'pointer',
                                                                        }}
                                                                    >
                                                                        {option.label}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                            <p style={{ margin: '0.45rem 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                                                                {audioSourceMode === 'tts'
                                                                    ? 'Generate Voice uses the script and voice settings in this panel to create a fresh narration audio track.'
                                                                    : 'Upload Narration keeps your existing recorded audio and only uses Whisper to derive timestamps and captions.'}
                                                            </p>
                                                        </div>
                                                        {audioSourceMode === 'upload' && (
                                                            <>
                                                                <div>
                                                                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>Narration audio file</label>
                                                                    <input
                                                                        type="file"
                                                                        accept="audio/*"
                                                                        onChange={(e) => setUploadedAudioFile(e.target.files?.[0] ?? null)}
                                                                        style={{ width: '100%' }}
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
                                                                        <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 0 }}>Transcript (optional)</label>
                                                                        <button
                                                                            type="button"
                                                                            onClick={async () => {
                                                                                if (!uploadedTranscript.trim()) {
                                                                                    alert('Paste transcript text first.');
                                                                                    return;
                                                                                }
                                                                                setPunctuatingTranscript(true);
                                                                                try {
                                                                                    const result = await punctuateTranscript(uploadedTranscript);
                                                                                    setUploadedTranscript(result.display_transcript);
                                                                                } catch (err: any) {
                                                                                    alert(err.message || 'Failed to punctuate transcript');
                                                                                } finally {
                                                                                    setPunctuatingTranscript(false);
                                                                                }
                                                                            }}
                                                                            disabled={punctuatingTranscript || !uploadedTranscript.trim()}
                                                                            style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.35rem 0.6rem', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-secondary)', cursor: punctuatingTranscript ? 'wait' : 'pointer', fontSize: '0.75rem' }}
                                                                        >
                                                                            {punctuatingTranscript ? <Loader2 size={12} className={styles.spinAnimation} /> : <Sparkles size={12} />}
                                                                            {punctuatingTranscript ? 'Punctuating...' : 'Punctuate for Display'}
                                                                        </button>
                                                                    </div>
                                                                    <textarea
                                                                        value={uploadedTranscript}
                                                                        onChange={(e) => setUploadedTranscript(e.target.value)}
                                                                        rows={4}
                                                                        placeholder="Paste transcript (optional). Use 'Punctuate for Display' to clean punctuation and filler words without changing Whisper timing."
                                                                        style={{
                                                                            width: '100%',
                                                                            padding: '0.7rem',
                                                                            borderRadius: '8px',
                                                                            border: '1px solid var(--border)',
                                                                            background: 'var(--bg-secondary)',
                                                                            color: 'var(--text-primary)',
                                                                            resize: 'vertical',
                                                                        }}
                                                                    />
                                                                </div>
                                                            </>
                                                        )}
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={async () => {
                                                            if (audioSourceMode === 'tts' && !reelScript.trim()) {
                                                                alert('Enter a narration script first.');
                                                                return;
                                                            }
                                                            if (audioSourceMode === 'upload' && !uploadedAudioFile) {
                                                                alert('Upload a narration file first.');
                                                                return;
                                                            }
                                                            setExtractingTimeline(true);
                                                            setGeneratedReelImages([]);
                                                            try {
                                                                const { audio_url, timeline, scenes, duration, word_timestamps, rewritten_script, display_script } = await compileAudioTimeline({
                                                                    script: audioSourceMode === 'tts' ? reelScript : undefined,
                                                                    voice: reelVoice,
                                                                    voiceProvider: ttsProvider,
                                                                    speed: reelSpeed,
                                                                    elevenlabsStability,
                                                                    elevenlabsSimilarityBoost,
                                                                    elevenlabsStyle,
                                                                    audioFile: audioSourceMode === 'upload' ? uploadedAudioFile : null,
                                                                    transcriptText: uploadedTranscript,
                                                                });
                                                                setReelScript(display_script || rewritten_script);
                                                                setAnchorWords(timeline);
                                                                setAnchorTimeline([]);
                                                                setSceneTimeline(normalizeSceneTimeline(scenes));
                                                                setGeneratedReelImages([]);
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
                                                        {extractingTimeline ? 'Compiling Audio & Timeline...' : audioSourceMode === 'tts' ? 'Compile Voice & Timeline' : 'Transcribe Upload & Build Timeline'}
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

                                        {isCustomTab && sceneTimeline.length > 0 && (
                                            <div style={{ display: 'grid', gap: '1.5rem' }}>
                                                <div style={{ marginTop: '1.5rem', padding: '1.25rem', background: 'var(--bg-tertiary)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                                                        <div>
                                                            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                <Sparkles size={18} style={{ color: 'var(--accent)' }} /> Step 2: Scene Timeline
                                                            </h3>
                                                            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0.45rem 0 0' }}>
                                                                Scene timing follows the voice-over. Drag markers to retime cuts before choosing visuals.
                                                            </p>
                                                        </div>
                                                        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                                            <button
                                                                type="button"
                                                                onClick={async () => {
                                                                    setResolvingSceneCandidates(true);
                                                                    try {
                                                                        const result = await resolveSceneCandidates(reelScript, sceneTimeline);
                                                                        setSceneTimeline(normalizeSceneTimeline(result.scenes));
                                                                        setSceneFilter('all');
                                                                    } catch (err: any) {
                                                                        setReelError(err.message || 'Failed to fetch scene candidates');
                                                                    } finally {
                                                                        setResolvingSceneCandidates(false);
                                                                    }
                                                                }}
                                                                disabled={resolvingSceneCandidates}
                                                                style={{
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: '0.45rem',
                                                                    padding: '0.65rem 1rem',
                                                                    borderRadius: '8px',
                                                                    border: '1px solid var(--accent)',
                                                                    background: 'rgba(100, 255, 218, 0.08)',
                                                                    color: 'var(--accent)',
                                                                    fontWeight: 600,
                                                                    cursor: resolvingSceneCandidates ? 'wait' : 'pointer',
                                                                }}
                                                            >
                                                                {resolvingSceneCandidates ? <Loader2 size={16} className={styles.spinAnimation} /> : <Layers size={16} />}
                                                                {resolvingSceneCandidates ? 'Matching Stock Candidates...' : 'Step 3: Fetch Stock Picks'}
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {timelineDuration > 0 && (
                                                        <div className={styles.transitionEditor}>
                                                            <div className={styles.transitionEditorHeader}>
                                                                <div>
                                                                    <h5 style={{ margin: 0, fontSize: '0.9rem', color: '#fff' }}>Transition Timing Lane</h5>
                                                                    <p style={{ margin: '0.3rem 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                                                        Drag each scene marker to move the switch on the narration. Selections stay attached to the scene.
                                                                    </p>
                                                                </div>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                                                                    <span className={styles.transitionTimeBadge}>
                                                                        {audioPreviewCurrentTime.toFixed(2)}s / {timelineDuration.toFixed(2)}s
                                                                    </span>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => addSceneAtTime(audioPreviewCurrentTime)}
                                                                        title="Add scene at current playhead time"
                                                                        style={{
                                                                            width: '34px',
                                                                            height: '34px',
                                                                            borderRadius: '999px',
                                                                            border: '1px solid var(--accent)',
                                                                            background: 'rgba(100, 255, 218, 0.14)',
                                                                            color: 'var(--accent)',
                                                                            display: 'inline-flex',
                                                                            alignItems: 'center',
                                                                            justifyContent: 'center',
                                                                            cursor: 'pointer',
                                                                        }}
                                                                    >
                                                                        <Plus size={15} />
                                                                    </button>
                                                                </div>
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

                                                                {sceneTimeline.map((scene, idx) => {
                                                                    const left = timelineDuration > 0 ? (scene.start_time_seconds / timelineDuration) * 100 : 0;
                                                                    const nextSceneStart = sceneTimeline[idx + 1]?.start_time_seconds ?? timelineDuration;
                                                                    const width = timelineDuration > 0 ? ((nextSceneStart - scene.start_time_seconds) / timelineDuration) * 100 : 0;
                                                                    return (
                                                                        <div key={scene.scene_id}>
                                                                            <div className={styles.transitionSegment} style={{ left: `${left}%`, width: `${Math.max(width, 4)}%`, opacity: idx === draggingTransitionIdx ? 0.95 : 0.72 }}>
                                                                                <span>{scene.transcript_excerpt || scene.anchor_word}</span>
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
                                                                                title={`${scene.anchor_word} at ${scene.start_time_seconds.toFixed(2)}s`}
                                                                            >
                                                                                <span className={styles.transitionMarkerIndex}>{idx + 1}</span>
                                                                                <span className={styles.transitionMarkerLabel}>{scene.anchor_phrase || scene.anchor_word}</span>
                                                                            </button>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>

                                                <div style={{ padding: '1.25rem', background: 'var(--bg-tertiary)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                                                        <div>
                                                            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                <Layers size={18} style={{ color: 'var(--accent)' }} /> Step 3: Stock Picks + Manual Library
                                                            </h3>
                                                            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0.45rem 0 0' }}>
                                                                Auto-matching now uses stock images/videos only. Local library assets are manual override via the dropdown per scene.
                                                            </p>
                                                        </div>
                                                        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                                            <div>
                                                                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Scene filter</label>
                                                                <select
                                                                    value={sceneFilter}
                                                                    onChange={(e) => setSceneFilter(e.target.value as 'all' | 'unresolved' | 'ai-eligible')}
                                                                    style={{ padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                                                                >
                                                                    <option value="all">All scenes</option>
                                                                    <option value="unresolved">Unresolved only</option>
                                                                    <option value="ai-eligible">AI-eligible only</option>
                                                                </select>
                                                            </div>
                                                            <div>
                                                                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>AI scene cap</label>
                                                                <input
                                                                    type="number"
                                                                    min={0}
                                                                    max={20}
                                                                    value={maxAiGeneratedScenes}
                                                                    onChange={(e) => setMaxAiGeneratedScenes(Number(e.target.value) || 0)}
                                                                    style={{ width: '96px', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                                                                />
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={async () => {
                                                                    setGeneratingSceneAi(true);
                                                                    try {
                                                                        const result = await generateSceneAiFallbacks(reelScript, sceneTimeline, maxAiGeneratedScenes);
                                                                        setSceneTimeline(normalizeSceneTimeline(result.scenes));
                                                                        setSceneFilter('ai-eligible');
                                                                    } catch (err: any) {
                                                                        setReelError(err.message || 'Failed to build AI fallback prompts');
                                                                    } finally {
                                                                        setGeneratingSceneAi(false);
                                                                    }
                                                                }}
                                                                disabled={generatingSceneAi}
                                                                style={{
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: '0.45rem',
                                                                    padding: '0.65rem 1rem',
                                                                    borderRadius: '8px',
                                                                    border: 'none',
                                                                    background: 'var(--accent)',
                                                                    color: '#000',
                                                                    fontWeight: 600,
                                                                    cursor: generatingSceneAi ? 'wait' : 'pointer',
                                                                }}
                                                            >
                                                                {generatingSceneAi ? <Loader2 size={16} className={styles.spinAnimation} /> : <Sparkles size={16} />}
                                                                {generatingSceneAi ? 'Generating AI Fallbacks...' : 'Step 4: Create AI Fill-Ins'}
                                                            </button>
                                                        </div>
                                                    </div>

                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '1000px', overflowY: 'auto', paddingRight: '0.5rem' }}>
                                                        {filteredScenes.map((scene, idx) => {
                                                            const sceneIndex = sceneTimeline.findIndex(item => item.scene_id === scene.scene_id);
                                                            const selectedPreview = scene.selected_asset?.asset_url || scene.ai_image_url || '';
                                                            const selectedAssetType = scene.selected_asset?.asset_source || scene.asset_source || 'none';
                                                            const selectedLocalAssetCandidateId =
                                                                selectedAssetType.startsWith('local_')
                                                                    ? (scene.selected_asset?.candidate_id || '')
                                                                    : '';
                                                            return (
                                                                <div key={scene.scene_id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(280px, 1fr)', gap: '1rem', background: 'var(--bg-secondary)', borderRadius: '10px', border: '1px solid var(--border)', padding: '1rem' }}>
                                                                    <div style={{ display: 'grid', gap: '0.8rem' }}>
                                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                                                                            <div>
                                                                                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                                                                    {`Scene ${sceneIndex + 1}`}
                                                                                </div>
                                                                                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                                                                                    {scene.anchor_word} • {scene.start_time_seconds.toFixed(2)}s to {scene.end_time_seconds.toFixed(2)}s
                                                                                </div>
                                                                            </div>
                                                                            <span style={{ fontSize: '0.75rem', color: '#888', background: '#161616', padding: '0.2rem 0.5rem', borderRadius: '999px' }}>
                                                                                {scene.scene_state.replace(/_/g, ' ')}
                                                                            </span>
                                                                            <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center' }}>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => addSceneAfter(scene.scene_id)}
                                                                                    style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.35rem 0.55rem', borderRadius: '7px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.72rem' }}
                                                                                    title="Add a scene after this one"
                                                                                >
                                                                                    <Plus size={13} />
                                                                                    Add
                                                                                </button>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => deleteScene(scene.scene_id)}
                                                                                    disabled={sceneTimeline.length <= 1}
                                                                                    style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.35rem 0.55rem', borderRadius: '7px', border: '1px solid #5a2a2a', background: 'transparent', color: sceneTimeline.length <= 1 ? '#666' : '#ff8a8a', cursor: sceneTimeline.length <= 1 ? 'not-allowed' : 'pointer', fontSize: '0.72rem' }}
                                                                                    title={sceneTimeline.length <= 1 ? 'At least one scene is required' : 'Delete this scene'}
                                                                                >
                                                                                    <Trash2 size={13} />
                                                                                    Delete
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                        <div style={{ padding: '0.6rem', background: '#161616', borderRadius: '8px', fontSize: '0.82rem', color: '#ddd', fontStyle: 'italic' }}>
                                                                            "{scene.transcript_excerpt || scene.anchor_word}"
                                                                        </div>
                                                                        <div style={{ display: 'grid', gap: '0.4rem' }}>
                                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                                                                                <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                                                                    On-screen hook text
                                                                                </label>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => {
                                                                                        const suggested = buildSceneCaptionSuggestion(
                                                                                            scene.transcript_excerpt || scene.anchor_phrase || scene.anchor_word,
                                                                                            scene.anchor_phrase || scene.transcript_excerpt || scene.anchor_word,
                                                                                            scene.visual_focus_word || scene.anchor_word,
                                                                                        );
                                                                                        setSceneTimeline(prev => prev.map(item => item.scene_id === scene.scene_id ? {
                                                                                            ...item,
                                                                                            caption_text: suggested,
                                                                                            caption_is_custom: false,
                                                                                        } : item));
                                                                                    }}
                                                                                    style={{ padding: '0.2rem 0.5rem', borderRadius: '999px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '0.7rem', cursor: 'pointer' }}
                                                                                >
                                                                                    Reset auto text
                                                                                </button>
                                                                            </div>
                                                                            <textarea
                                                                                value={scene.caption_text || ''}
                                                                                onChange={(e) => {
                                                                                    const nextValue = e.target.value;
                                                                                    setSceneTimeline(prev => prev.map(item => item.scene_id === scene.scene_id ? {
                                                                                        ...item,
                                                                                        caption_text: nextValue,
                                                                                        caption_is_custom: true,
                                                                                    } : item));
                                                                                }}
                                                                                placeholder="Optional scene text shown in the final video"
                                                                                rows={2}
                                                                                style={{ width: '100%', padding: '0.65rem 0.75rem', borderRadius: '8px', border: '1px solid #333', background: '#111', color: '#f3f3f3', resize: 'vertical', fontSize: '0.84rem', lineHeight: 1.45 }}
                                                                            />
                                                                            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                                                                                Auto-filled from the narration for this scene. Edit it freely and the final video will use your version.
                                                                            </div>
                                                                        </div>
                                                                        {scene.search_queries.length > 0 && (
                                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                                                                                {scene.search_queries.map(query => (
                                                                                    <span key={query} style={{ fontSize: '0.72rem', border: '1px solid #333', borderRadius: '999px', padding: '0.25rem 0.55rem', color: 'var(--text-secondary)' }}>
                                                                                        {query}
                                                                                    </span>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                        <div style={{ display: 'grid', gap: '0.35rem' }}>
                                                                            <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                                                                Pick from local library (manual override)
                                                                            </label>
                                                                            <select
                                                                                value={selectedLocalAssetCandidateId}
                                                                                onChange={(e) => {
                                                                                    const nextId = e.target.value;
                                                                                    if (!nextId) return;
                                                                                    const chosen = localLibraryAssets.find(asset => asset.candidate_id === nextId);
                                                                                    if (!chosen) return;
                                                                                    setSceneTimeline(prev => prev.map(item => item.scene_id === scene.scene_id ? {
                                                                                        ...item,
                                                                                        selected_asset: {
                                                                                            asset_source: chosen.type,
                                                                                            asset_url: chosen.asset_url,
                                                                                            thumbnail_url: chosen.thumbnail_url,
                                                                                            candidate_id: chosen.candidate_id,
                                                                                        },
                                                                                        asset_source: chosen.type,
                                                                                        scene_state: 'resolved_by_library',
                                                                                    } : item));
                                                                                }}
                                                                                style={{ width: '100%', padding: '0.55rem 0.7rem', borderRadius: '8px', border: '1px solid #333', background: '#111', color: '#ddd', fontSize: '0.78rem' }}
                                                                            >
                                                                                <option value="">
                                                                                    {loadingLocalLibraryAssets ? 'Loading local assets...' : 'Select local asset...'}
                                                                                </option>
                                                                                {localLibraryAssets.map(asset => (
                                                                                    <option key={asset.candidate_id} value={asset.candidate_id}>
                                                                                        {(asset.type === 'local_video' ? 'VIDEO' : 'IMAGE')} · {asset.query}
                                                                                    </option>
                                                                                ))}
                                                                            </select>
                                                                        </div>
                                                                        {scene.stock_candidates.length > 0 && (
                                                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '0.75rem' }}>
                                                                                {scene.stock_candidates.map(candidate => (
                                                                                    <button
                                                                                        key={candidate.candidate_id}
                                                                                        type="button"
                                                                                        onClick={() => {
                                                                                            const nextSceneState = candidate.type.startsWith('local_')
                                                                                                ? 'resolved_by_library'
                                                                                                : 'resolved_by_stock';
                                                                                            setSceneTimeline(prev => prev.map(item => item.scene_id === scene.scene_id ? {
                                                                                                ...item,
                                                                                                selected_asset: {
                                                                                                    asset_source: candidate.type,
                                                                                                    asset_url: candidate.asset_url,
                                                                                                    thumbnail_url: candidate.thumbnail_url,
                                                                                                    candidate_id: candidate.candidate_id,
                                                                                                },
                                                                                                asset_source: candidate.type,
                                                                                                scene_state: nextSceneState,
                                                                                            } : item));
                                                                                        }}
                                                                                        style={{ border: scene.selected_asset?.candidate_id === candidate.candidate_id ? '1px solid var(--accent)' : '1px solid #333', background: '#121212', borderRadius: '8px', overflow: 'hidden', padding: 0, cursor: 'pointer', textAlign: 'left' }}
                                                                                    >
                                                                                        <div style={{ aspectRatio: '9 / 16', background: '#1a1a1a', position: 'relative' }}>
                                                                                            {isVideoAssetType(candidate.type) ? (
                                                                                                <video
                                                                                                    src={resolveAssetUrl(candidate.asset_url)}
                                                                                                    poster={resolveAssetUrl(candidate.thumbnail_url)}
                                                                                                    controls
                                                                                                    muted
                                                                                                    playsInline
                                                                                                    preload="metadata"
                                                                                                    onClick={(event) => event.stopPropagation()}
                                                                                                    style={{ width: '100%', height: '100%', objectFit: 'cover', background: '#000' }}
                                                                                                />
                                                                                            ) : (
                                                                                                <img src={resolveAssetUrl(candidate.thumbnail_url)} alt={candidate.query} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                                                            )}
                                                                                            <div style={{ position: 'absolute', top: '0.4rem', left: '0.4rem', background: 'rgba(0,0,0,0.72)', color: '#fff', fontSize: '0.66rem', fontWeight: 700, padding: '0.2rem 0.45rem', borderRadius: '999px', pointerEvents: 'none' }}>
                                                                                                {isVideoAssetType(candidate.type) ? 'VIDEO' : 'IMAGE'}
                                                                                            </div>
                                                                                        </div>
                                                                                        <div style={{ padding: '0.5rem' }}>
                                                                                            <div style={{ fontSize: '0.72rem', color: '#fff', fontWeight: 600 }}>{describeCandidateType(candidate.type)}</div>
                                                                                            <div style={{ fontSize: '0.68rem', color: '#888', marginTop: '0.2rem' }}>{candidate.query}</div>
                                                                                            <div style={{ fontSize: '0.66rem', color: '#777', marginTop: '0.2rem' }}>
                                                                                                {candidate.source_provider} • score {candidate.score.toFixed(1)}
                                                                                            </div>
                                                                                        </div>
                                                                                    </button>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                                                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.45rem 0.7rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-secondary)', cursor: uploadingSceneAssetId === scene.scene_id ? 'wait' : 'pointer', fontSize: '0.78rem' }}>
                                                                                <Plus size={12} />
                                                                                {uploadingSceneAssetId === scene.scene_id ? 'Uploading...' : 'Upload image'}
                                                                                <input
                                                                                    type="file"
                                                                                    accept="image/*"
                                                                                    style={{ display: 'none' }}
                                                                                    disabled={uploadingSceneAssetId === scene.scene_id}
                                                                                    onChange={async (e) => {
                                                                                        const inputEl = e.currentTarget;
                                                                                        const file = e.target.files?.[0] ?? null;
                                                                                        await handleSceneAssetUpload(scene.scene_id, file);
                                                                                        if (inputEl) inputEl.value = '';
                                                                                    }}
                                                                                />
                                                                            </label>
                                                                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.45rem 0.7rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-secondary)', cursor: uploadingSceneAssetId === scene.scene_id ? 'wait' : 'pointer', fontSize: '0.78rem' }}>
                                                                                <Film size={12} />
                                                                                {uploadingSceneAssetId === scene.scene_id ? 'Uploading...' : 'Upload video'}
                                                                                <input
                                                                                    type="file"
                                                                                    accept="video/*"
                                                                                    style={{ display: 'none' }}
                                                                                    disabled={uploadingSceneAssetId === scene.scene_id}
                                                                                    onChange={async (e) => {
                                                                                        const inputEl = e.currentTarget;
                                                                                        const file = e.target.files?.[0] ?? null;
                                                                                        await handleSceneAssetUpload(scene.scene_id, file);
                                                                                        if (inputEl) inputEl.value = '';
                                                                                    }}
                                                                                />
                                                                            </label>
                                                                        </div>
                                                                        <div style={{ display: 'grid', gap: '0.5rem' }}>
                                                                            <textarea
                                                                                value={scene.ai_prompt || ''}
                                                                                onChange={(e) => {
                                                                                    const nextPrompt = e.target.value;
                                                                                    scenePromptDraftRef.current[scene.scene_id] = nextPrompt;
                                                                                    setSceneTimeline(prev => prev.map(item => item.scene_id === scene.scene_id ? { ...item, ai_prompt: nextPrompt } : item));
                                                                                }}
                                                                                rows={4}
                                                                                placeholder="AI fallback prompt for this scene"
                                                                                style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #333', background: '#111', color: 'var(--text-primary)', resize: 'vertical' }}
                                                                            />
                                                                            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={async () => {
                                                                                        const currentScene = sceneTimeline.find(item => item.scene_id === scene.scene_id);
                                                                                        if (!currentScene) return;
                                                                                        setGeneratingPromptSceneId(scene.scene_id);
                                                                                        try {
                                                                                            const result = await generateSingleSceneAiPrompt(reelScript, currentScene);
                                                                                            setSceneTimeline(prev => prev.map(item => item.scene_id === scene.scene_id ? {
                                                                                                ...item,
                                                                                                ai_prompt: result.prompt,
                                                                                                effect_transition_name: result.effect_transition_name || item.effect_transition_name,
                                                                                                scene_state: item.asset_source === 'none' ? 'ai_eligible' : item.scene_state,
                                                                                            } : item));
                                                                                            scenePromptDraftRef.current[scene.scene_id] = result.prompt;
                                                                                        } catch (e: any) {
                                                                                            alert('Failed to generate AI prompt: ' + e.message);
                                                                                        } finally {
                                                                                            setGeneratingPromptSceneId(null);
                                                                                        }
                                                                                    }}
                                                                                    disabled={generatingPromptSceneId === scene.scene_id}
                                                                                    style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 0.85rem', borderRadius: '8px', border: '1px solid var(--accent)', background: 'rgba(100, 255, 218, 0.08)', color: 'var(--accent)', cursor: generatingPromptSceneId === scene.scene_id ? 'wait' : 'pointer', fontWeight: 600 }}
                                                                                >
                                                                                    {generatingPromptSceneId === scene.scene_id ? <Loader2 size={14} className={styles.spinAnimation} /> : <Sparkles size={14} />}
                                                                                    {generatingPromptSceneId === scene.scene_id ? 'Generating prompt...' : 'Generate AI prompt'}
                                                                                </button>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={async () => {
                                                                                        const currentScene = sceneTimeline.find(item => item.scene_id === scene.scene_id);
                                                                                        const latestPrompt = (scenePromptDraftRef.current[scene.scene_id] ?? currentScene?.ai_prompt ?? "").trim();
                                                                                        if (!latestPrompt) return;
                                                                                        setRegeneratingImageIdx(sceneIndex);
                                                                                        try {
                                                                                            const result = await generateImage(latestPrompt, visualStyle);
                                                                                            setSceneTimeline(prev => prev.map(item => item.scene_id === scene.scene_id ? {
                                                                                                ...item,
                                                                                                ai_image_url: result.image_url,
                                                                                                ai_prompt: latestPrompt,
                                                                                                last_generated_ai_prompt: latestPrompt,
                                                                                                selected_asset: {
                                                                                                    asset_source: 'ai_image',
                                                                                                    asset_url: result.image_url,
                                                                                                    thumbnail_url: result.image_url,
                                                                                                    candidate_id: null,
                                                                                                },
                                                                                                asset_source: 'ai_image',
                                                                                                scene_state: 'resolved_by_ai',
                                                                                            } : item));
                                                                                            if (sceneFilter === 'ai-eligible') {
                                                                                                setSceneFilter('all');
                                                                                            }
                                                                                        } catch (e: any) {
                                                                                            alert('Failed to generate AI image: ' + e.message);
                                                                                        } finally {
                                                                                            setRegeneratingImageIdx(null);
                                                                                        }
                                                                                    }}
                                                                                    disabled={regeneratingImageIdx === sceneIndex || !scene.ai_prompt?.trim()}
                                                                                    style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 0.85rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', cursor: regeneratingImageIdx === sceneIndex ? 'wait' : 'pointer' }}
                                                                                >
                                                                                    {regeneratingImageIdx === sceneIndex ? <Loader2 size={14} className={styles.spinAnimation} /> : <RefreshCw size={14} />}
                                                                                    {scene.ai_image_url ? 'Regenerate AI image' : 'Generate AI image'}
                                                                                </button>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => {
                                                                                        setSceneTimeline(prev => prev.map(item => item.scene_id === scene.scene_id ? {
                                                                                            ...item,
                                                                                            selected_asset: null,
                                                                                            asset_source: 'none',
                                                                                            scene_state: item.ai_prompt ? 'ai_eligible' : 'unresolved',
                                                                                        } : item));
                                                                                    }}
                                                                                    style={{ padding: '0.55rem 0.85rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}
                                                                                >
                                                                                    Clear selection
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    <div style={{ background: '#0f0f12', border: '1px solid #333', borderRadius: '8px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.65rem 0.75rem', borderBottom: '1px solid #333', fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                                                                            <span>Selected preview</span>
                                                                            <span style={{ fontWeight: 700, color: isVideoAssetType(selectedAssetType) ? 'var(--accent)' : 'var(--text-primary)' }}>
                                                                                {selectedAssetType === 'local_video'
                                                                                    ? 'LIBRARY VIDEO'
                                                                                    : selectedAssetType === 'local_image'
                                                                                        ? 'LIBRARY IMAGE'
                                                                                    : selectedAssetType === 'stock_video'
                                                                                        ? 'STOCK VIDEO'
                                                                                    : selectedAssetType === 'user_video'
                                                                                        ? 'USER VIDEO'
                                                                                    : selectedAssetType === 'stock_image'
                                                                                        ? 'STOCK IMAGE'
                                                                                    : selectedAssetType === 'user_image'
                                                                                        ? 'USER IMAGE'
                                                                                    : selectedAssetType === 'ai_image'
                                                                                        ? 'AI IMAGE'
                                                                                        : 'NONE'}
                                                                            </span>
                                                                        </div>
                                                                        <div style={{ aspectRatio: '9 / 16', background: '#151515', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                                            {selectedPreview ? (
                                                                                isVideoAssetType(selectedAssetType) ? (
                                                                                    <video src={resolveAssetUrl(selectedPreview)} controls style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                                                ) : (
                                                                                    <img src={resolveAssetUrl(selectedPreview)} alt={`Scene ${sceneIndex + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                                                )
                                                                            ) : (
                                                                                <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>No selected asset yet</div>
                                                                            )}
                                                                        </div>
                                                                        <div style={{ padding: '0.75rem', borderTop: '1px solid #333', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                                                            Current asset: {selectedAssetType.replace(/_/g, ' ')}
                                                                        </div>
                                                                        {selectedAssetType === 'ai_image' && (scene.last_generated_ai_prompt || scene.ai_prompt) && (
                                                                            <div style={{ padding: '0.75rem', borderTop: '1px solid #333', display: 'grid', gap: '0.35rem' }}>
                                                                                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--accent)' }}>
                                                                                    Prompt used for this AI image
                                                                                </div>
                                                                                <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                                                                                    {scene.last_generated_ai_prompt || scene.ai_prompt}
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* (Anchor Words selection block was here) */}
                                        {!isCustomTab && anchorWords.length > 0 && (
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

                                        {!isCustomTab && anchorTimeline.length > 0 && (
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

                                        {!isCustomTab && anchorTimeline.length > 0 && (
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
                                    {!isCustomTab && (
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
                                    )}

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
                                                if (audioSourceMode === 'tts' && reelScript.trim()) {
                                                    customText = reelScript.trim();
                                                } else if (useHdTts && transcriptSentences.length > 0) {
                                                    const selected = transcriptSentences.filter(
                                                        s => s.startSec >= audioStart && s.startSec < audioStart + reelDuration
                                                    );
                                                    if (selected.length > 0) {
                                                        customText = selected.map(s => s.text).join(' ');
                                                    }
                                                }
                                                const inferredSceneEnd = sceneTimeline.reduce((maxEnd, scene) => {
                                                    const sceneEnd = Number(scene.end_time_seconds ?? scene.start_time_seconds ?? 0);
                                                    return Number.isFinite(sceneEnd) ? Math.max(maxEnd, sceneEnd) : maxEnd;
                                                }, 0);
                                                const inferredWordEnd = wordTimestamps.reduce((maxEnd, word) => {
                                                    const wordEnd = Number(word.end ?? 0);
                                                    return Number.isFinite(wordEnd) ? Math.max(maxEnd, wordEnd) : maxEnd;
                                                }, 0);
                                                const inferredAudioEnd = Number(audioPreviewDuration || 0);
                                                const inferredDuration = Math.ceil(
                                                    Math.max(reelDuration, inferredSceneEnd, inferredWordEnd, inferredAudioEnd) + 0.5
                                                );
                                                const effectiveStart = isCustomTab ? 0 : audioStart;
                                                const effectiveDuration = isCustomTab
                                                    ? Math.max(reelDuration, inferredDuration || reelDuration)
                                                    : reelDuration;
                                                const result = await generateReel(
                                                    episode ? episode.id : null,
                                                    reelHeadline,
                                                    effectiveStart,
                                                    effectiveDuration,
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
                                                    isCustomTab && sceneTimeline.length > 0 ? sceneTimeline : undefined,
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

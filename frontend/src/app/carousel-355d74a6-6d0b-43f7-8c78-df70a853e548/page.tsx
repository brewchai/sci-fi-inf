'use client';

import { Fragment, useState, useEffect, useRef } from 'react';
import html2canvas from 'html2canvas';
import { Download, Loader2, RefreshCw, FileText, Copy, Check, ArrowRight, ArrowDown, Film, Sparkles, Award, GripVertical, X, Layers, ChevronDown, ChevronRight, Plus, Trash2, Play, Pause, Volume2 } from 'lucide-react';
import { fetchEpisodeDates, fetchEpisodeBySlug, fetchPapers, fetchPaperCarouselContent, generateReel, generateReelScript, extractVisualQueries, fetchVisuals, fetchLocalLibraryAssets, extractScenePrompts, compileAudioTimeline, generatePromptsFromAnchors, fetchTopPapers, fetchTopScientists, fetchDailyScience, analyzeTopPapers, analyzeDailyScience, generateImagePrompt, generateImage, fetchImageStyles, rewriteVoiceScript, punctuateTranscript, uploadSceneAsset, extractUploadedVideoTranscript, renderUploadedVideoTextFx, resolveSceneCandidates, generateSceneAiFallbacks, generateSingleSceneAiPrompt, refetchSceneCandidates, fetchPremiumSfxLibrary, autoPlacePremiumSfx, ingestYoutubeForFactCheck, extractFactCheckClaims, analyzeFactCheckClaim, generateFactCheckHookQuestion, generateFactCheckStitchPreview, renderFactCheckStitchLookDev, EpisodeDate, PodcastEpisode, Paper, CarouselSlide, ImpactAnalysis, VisualClip, TimelinePrompt, AnchorWord, WordTimestamp, ImageStyle, SceneTimelineItem, API_BASE_URL, ReelRenderer, PremiumSfxOption, ReelSfxItem, FactCheckVideo, FactCheckClaim, FactCheckAnalysis, FactCheckStitchPreview, FactCheckStitchLookDevPreview } from '@/lib/api';
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

const CUSTOM_DRAFT_STORAGE_KEY = 'carousel-generator-custom-draft-v1';
const DOWNLOAD_QUALITY_OPTIONS = {
    standard: { label: 'Standard', scale: 2 },
    high: { label: 'High', scale: 3 },
    ultra: { label: 'Ultra', scale: 4 },
} as const;
const PREMIUM_TRANSITION_OPTIONS = [
    { value: 'hard_cut_blur', label: 'Hard Cut Blur' },
    { value: 'masked_push', label: 'Masked Push' },
    { value: 'light_sweep_dissolve', label: 'Light Sweep Dissolve' },
    { value: 'scale_through_zoom', label: 'Scale Through Zoom' },
    { value: 'depth_blur_handoff', label: 'Depth Blur Handoff' },
    { value: 'vertical_reveal', label: 'Vertical Reveal' },
    { value: 'horizontal_reveal', label: 'Horizontal Reveal' },
    { value: 'soft_flash_cut', label: 'Soft Flash Cut' },
    { value: 'glass_warp', label: 'Glass Warp' },
    { value: 'radial_focus_pull', label: 'Radial Focus Pull' },
    { value: 'split_panel_wipe', label: 'Split Panel Wipe' },
    { value: 'film_burn_edge', label: 'Film Burn Edge' },
    { value: 'depth_parallax_snap', label: 'Depth Parallax Snap' },
    { value: 'ghost_trail_crossfade', label: 'Ghost Trail Crossfade' },
    { value: 'iris_close_open', label: 'Iris Close Open' },
] as const;
const PREMIUM_SCENE_FX_OPTIONS = [
    { value: 'auto', label: 'Auto' },
    { value: 'none', label: 'None' },
    { value: 'paper_tear_reveal', label: 'Paper Tear Reveal' },
    { value: 'paper_crumble_transition', label: 'Paper Crumble Transition' },
    { value: 'zoom_through_handoff', label: 'Zoom Through Handoff' },
] as const;
const DEFAULT_SFX_VOLUME = 0.10;
const MIN_SCENE_LENGTH_SECONDS = 0.2;
const VIDEO_TEXT_STYLE_OPTIONS = [
    {
        value: 'ali-abdal',
        label: 'ali abdal',
        description: 'Warm editorial talking-head overlays with top headline cards, lower subtitle pills, selective icons, and bounded typing SFX.',
    },
] as const;

type DownloadQuality = keyof typeof DOWNLOAD_QUALITY_OPTIONS;
type VideoTextFxStyle = typeof VIDEO_TEXT_STYLE_OPTIONS[number]['value'];
type VideoTextFxBeat = {
    id: string;
    text: string;
    startTimeSeconds: number;
    endTimeSeconds: number;
    layer: 'headline_top' | 'subtitle_bottom';
    style: 'hook' | 'statement' | 'numeric_emphasis' | 'icon_callout' | 'subtitle';
    notes: string;
};

type CustomDraft = {
    lastActiveTab: 'custom' | 'other';
    slideTitle: string;
    customCategory: string;
    customYear: string;
    customCaption: string;
    editedCoverCta: string;
    editedCoverTitle: string;
    editedHeadline: string;
    editedTakeawayTitles: string[];
    editedTakeaways: string[];
    editedOutroTitle: string;
    editedOutro: string;
    editedOutroFollow: string;
    showTag: boolean;
    customSlidesReady: boolean;
    isCustomInputOpen: boolean;
    isSlideSectionOpen: boolean;
    carouselImagePrompts: string[];
    carouselImageUrls: string[];
    sfxTimeline: ReelSfxItem[];
    slideData: CarouselSlide | null;
};

const createDefaultCustomDraft = (): CustomDraft => ({
    lastActiveTab: 'other',
    slideTitle: '',
    customCategory: 'SCIENCE',
    customYear: '',
    customCaption: '',
    editedCoverCta: 'Check Caption',
    editedCoverTitle: '',
    editedHeadline: '',
    editedTakeawayTitles: ['', '', ''],
    editedTakeaways: ['', '', ''],
    editedOutroTitle: '',
    editedOutro: 'Read the full paper in the description below.',
    editedOutroFollow: 'Follow @the.eureka.feed for research-backed explainers.',
    showTag: false,
    customSlidesReady: false,
    isCustomInputOpen: true,
    isSlideSectionOpen: true,
    carouselImagePrompts: [],
    carouselImageUrls: [],
    sfxTimeline: [],
    slideData: null,
});

const formatSceneRole = (value?: string | null) => {
    if (!value) return 'Scene';
    return value.split('_').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
};

const formatAssetBias = (value?: string | null) => {
    if (!value) return 'Flexible';
    if (value === 'video') return 'Video-first';
    if (value === 'image') return 'Image-first';
    return 'Flexible';
};

const buildLookDevQuestion = (claimText?: string | null) => {
    const text = (claimText || '').replace(/\s+/g, ' ').trim();
    if (!text) return 'IS THIS CLAIM ACTUALLY TRUE?';
    let clean = text
        .replace(/^(the claim that|claim that|the idea that|claim:)\s+/i, '')
        .replace(/[.?!]+$/g, '')
        .trim();
    clean = clean.replace(/\b(including|include|such as|like|especially)\s*:?\s*$/i, '').trim();
    const limitWords = (value: string, maxWords: number = 6) => value.split(/\s+/).filter(Boolean).slice(0, maxWords).join(' ').trim();

    const associatedMatch = clean.match(/^(.+?)\s+(is|are)\s+associated with\s+(.+)$/i);
    if (associatedMatch) {
        const [, subject, , object] = associatedMatch;
        return `${limitWords(`${subject} causing ${object}`, 6).toUpperCase()}?`;
    }

    const linkedMatch = clean.match(/^(.+?)\s+(is|are)\s+(linked to|tied to|connected to)\s+(.+)$/i);
    if (linkedMatch) {
        const [, subject, , , object] = linkedMatch;
        return `${limitWords(`${subject} linked to ${object}`, 6).toUpperCase()}?`;
    }

    const actionMatch = clean.match(/^(.+?)\s+(can|could|may|might|will|would|does|do|helps?|improves?|reduces?|prevents?)\s+(.+)$/i);
    if (actionMatch) {
        const [, subject, verb, object] = actionMatch;
        return `${limitWords(`${subject} ${verb} ${object}`, 6).toUpperCase()}?`;
    }

    if (/^(is|are|can|does|do|will|would|could|should|has|have)\b/i.test(clean)) {
        return `${limitWords(clean.replace(/\?+$/, ''), 6).toUpperCase()}?`;
    }

    return `${limitWords(clean, 6).toUpperCase()}?`;
};

const clampCaptionLength = (text: string, maxChars: number = 2100) => {
    const normalized = text.replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    if (normalized.length <= maxChars) return normalized;
    return `${normalized.slice(0, maxChars - 1).trimEnd()}…`;
};

const pushLineWithinLimit = (lines: string[], line: string, maxChars: number) => {
    const candidate = [...lines, line].join('\n');
    if (candidate.length > maxChars) return false;
    lines.push(line);
    return true;
};

const claimToHashtags = (claimText: string) => {
    const words = claimText
        .replace(/[^a-zA-Z0-9\s]/g, ' ')
        .split(/\s+/)
        .map((word) => word.trim())
        .filter(Boolean);
    const seen = new Set<string>();
    const tags: string[] = ['#FactCheck', '#Science', '#Research'];
    words.forEach((word) => {
        if (tags.length >= 7) return;
        if (word.length < 4) return;
        const normalized = word.toLowerCase();
        if (seen.has(normalized)) return;
        seen.add(normalized);
        tags.push(`#${word.charAt(0).toUpperCase()}${word.slice(1)}`);
    });
    return tags.slice(0, 7);
};

const normalizeSentenceBullet = (text: string) => {
    const clean = text.replace(/\s+/g, ' ').replace(/^[\s\-•]+/, '').trim();
    if (!clean) return '';
    return /[.?!]$/.test(clean) ? clean : `${clean}.`;
};

const shortenPaperTitle = (title?: string | null, maxWords: number = 8) => {
    const words = String(title || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    if (words.length <= maxWords) return words.join(' ');
    return `${words.slice(0, maxWords).join(' ')}...`;
};

const buildPaperRationaleLine = (label: string, paper?: FactCheckAnalysis['papers'][number] | null) => {
    if (!paper) return '';
    const title = shortenPaperTitle(paper.title);
    const note = normalizeSentenceBullet(String(paper.evidence_note || '').replace(/\s+/g, ' ').trim());
    const sourceLead = [paper.year, title].filter(Boolean).join(' ');
    if (note) {
        return `${label}: ${sourceLead} - ${note}`;
    }
    return `${label}: ${sourceLead} was rated ${paper.stance} based on the retrieved evidence.`;
};

const renderHighlightedText = (text?: string | null) => {
    const content = String(text || '');
    const lines = content.split('\n');

    return lines.map((line, lineIdx) => {
        const segments: JSX.Element[] = [];
        const pattern = /`([^`]+)`/g;
        let lastIndex = 0;
        let match: RegExpExecArray | null;

        while ((match = pattern.exec(line)) !== null) {
            if (match.index > lastIndex) {
                segments.push(
                    <Fragment key={`text-${lineIdx}-${lastIndex}`}>
                        {line.slice(lastIndex, match.index)}
                    </Fragment>
                );
            }
            segments.push(
                <span key={`accent-${lineIdx}-${match.index}`} style={{ color: 'var(--accent)' }}>
                    {match[1]}
                </span>
            );
            lastIndex = match.index + match[0].length;
        }

        if (lastIndex < line.length) {
            segments.push(
                <Fragment key={`tail-${lineIdx}-${lastIndex}`}>
                    {line.slice(lastIndex)}
                </Fragment>
            );
        }

        if (segments.length === 0) {
            segments.push(<Fragment key={`empty-${lineIdx}`}>{line}</Fragment>);
        }

        return (
            <Fragment key={`line-${lineIdx}`}>
                {segments}
                {lineIdx < lines.length - 1 ? <br /> : null}
            </Fragment>
        );
    });
};

const buildLookDevBullets = (analysis?: FactCheckAnalysis | null) => {
    const summary = analysis?.thirty_second_summary || analysis?.verdict_summary || '';
    const sentenceParts = String(summary)
        .replace(/\s+/g, ' ')
        .split(/(?<=[.!?])\s+/)
        .map((part) => normalizeSentenceBullet(part))
        .filter(Boolean);
    const rankedPapers = [...(analysis?.papers || [])].sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0));
    const topSupport = rankedPapers.find((paper) => paper.stance === 'supports');
    const topMixed = rankedPapers.find((paper) => paper.stance === 'mixed');
    const topRefute = rankedPapers.find((paper) => paper.stance === 'refutes');
    const bullets: string[] = [];

    if (sentenceParts[0]) {
        bullets.push(sentenceParts[0]);
    }
    const supportLine = buildPaperRationaleLine('Support', topSupport);
    if (supportLine) {
        bullets.push(supportLine);
    }
    const mixedOrRefuteLine = buildPaperRationaleLine(topMixed ? 'Mixed' : 'Refute', topMixed || topRefute);
    if (mixedOrRefuteLine) {
        bullets.push(mixedOrRefuteLine);
    }
    const countsLine = [
        analysis?.support_count ? `${analysis.support_count} support` : '',
        analysis?.mixed_count ? `${analysis.mixed_count} mixed` : '',
        analysis?.refute_count ? `${analysis.refute_count} refute` : '',
    ].filter(Boolean).join(', ');
    if (countsLine) {
        bullets.push(`Across counted papers: ${countsLine}.`);
    }
    if (sentenceParts[1]) {
        bullets.push(sentenceParts[1]);
    }
    return bullets.filter(Boolean).slice(0, 5).join('\n');
};

const normalizeLookDevRationale = (text: string) => {
    const candidateLines = text
        .split(/\n+/)
        .map((line) => normalizeSentenceBullet(line))
        .filter(Boolean);
    return candidateLines
        .slice(0, 5)
        .filter(Boolean)
        .join('\n');
};

const splitTranscriptIntoSentences = (transcript: string) =>
    transcript
        .replace(/\s+/g, ' ')
        .split(/(?<=[.!?])\s+/)
        .map((line) => line.trim())
        .filter(Boolean);

const splitSentenceIntoSubtitleChunks = (sentence: string) => {
    const words = sentence.split(/\s+/).filter(Boolean);
    if (words.length <= 6) return [sentence];
    const chunkSize = words.length > 18 ? 6 : 8;
    const chunks: string[] = [];
    for (let idx = 0; idx < words.length; idx += chunkSize) {
        chunks.push(words.slice(idx, idx + chunkSize).join(' '));
    }
    return chunks;
};

const buildVideoTextFxPlan = (transcript: string, durationSeconds: number): VideoTextFxBeat[] => {
    const sentences = splitTranscriptIntoSentences(transcript);
    if (!sentences.length || durationSeconds <= 0) return [];

    const totalWords = Math.max(1, sentences.reduce((sum, sentence) => sum + sentence.split(/\s+/).filter(Boolean).length, 0));
    let cursor = 0;
    const beats: VideoTextFxBeat[] = [];

    sentences.forEach((sentence, sentenceIndex) => {
        const words = sentence.split(/\s+/).filter(Boolean).length;
        const sentenceDuration = Math.max(1.2, (words / totalWords) * durationSeconds);
        const startTimeSeconds = Math.min(cursor, durationSeconds);
        const endTimeSeconds = Math.min(durationSeconds, cursor + sentenceDuration);
        const lowered = sentence.toLowerCase();
        const style: VideoTextFxBeat['style'] =
            sentenceIndex === 0
                ? 'hook'
                : /\b\d+\b|\bfive\b|\bten\b|\bhours\b|\bweek\b/.test(lowered)
                    ? 'numeric_emphasis'
                    : /\bhire\b|\boutsource\b|\bwalk\b|\bfamily\b|\bbusiness\b|\bvideo games\b/.test(lowered)
                        ? 'icon_callout'
                        : 'statement';

        beats.push({
            id: `headline-${sentenceIndex + 1}`,
            text: sentence,
            startTimeSeconds: Number(startTimeSeconds.toFixed(2)),
            endTimeSeconds: Number(endTimeSeconds.toFixed(2)),
            layer: 'headline_top',
            style,
            notes:
                style === 'hook'
                    ? 'Strongest entry beat. Allow the main top-card treatment and an optional micro push-in.'
                    : style === 'numeric_emphasis'
                        ? 'Use the boldest emphasis treatment here. Numbers should dominate the frame.'
                        : style === 'icon_callout'
                            ? 'Candidate for a small supporting icon and a faster top-card swap.'
                            : 'Standard top editorial overlay.',
        });

        const subtitleChunks = splitSentenceIntoSubtitleChunks(sentence);
        const chunkDuration = Math.max(0.55, (endTimeSeconds - startTimeSeconds) / Math.max(subtitleChunks.length, 1));
        subtitleChunks.forEach((chunk, chunkIndex) => {
            const chunkStart = Math.min(durationSeconds, startTimeSeconds + chunkIndex * chunkDuration);
            const chunkEnd = Math.min(durationSeconds, chunkStart + chunkDuration);
            beats.push({
                id: `subtitle-${sentenceIndex + 1}-${chunkIndex + 1}`,
                text: chunk,
                startTimeSeconds: Number(chunkStart.toFixed(2)),
                endTimeSeconds: Number(chunkEnd.toFixed(2)),
                layer: 'subtitle_bottom',
                style: 'subtitle',
                notes: 'Short lower subtitle pill aligned to spoken cadence.',
            });
        });

        cursor = endTimeSeconds;
    });

    return beats;
};

export default function CarouselGenerator() {
    const slideRefs = useRef<(HTMLDivElement | null)[]>([]);
    const audioPreviewRef = useRef<HTMLAudioElement | null>(null);
    const sfxPreviewRef = useRef<HTMLAudioElement | null>(null);
    const sfxTimelineTrackRef = useRef<HTMLDivElement | null>(null);
    const sfxCuePointerStartRef = useRef<{ cueId: string; clientX: number; clientY: number } | null>(null);
    const suppressSfxCueClickRef = useRef<string | null>(null);
    const activeSfxAudiosRef = useRef<HTMLAudioElement[]>([]);
    const playedSfxCueIdsRef = useRef<Set<string>>(new Set());
    const lastPreviewTimeRef = useRef(0);
    const transitionTimelineRef = useRef<HTMLDivElement | null>(null);
    const scenePromptDraftRef = useRef<Record<string, string>>({});
    const sceneQueryDraftRef = useRef<Record<string, string>>({});
    const factCheckHookRequestRef = useRef(0);
    const hasHydratedCustomDraftRef = useRef(false);
    const [customDraftReady, setCustomDraftReady] = useState(false);

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
    const [generatingPremiumReel, setGeneratingPremiumReel] = useState(false);
    const [reelError, setReelError] = useState<string | null>(null);
    const [reelRenderer, setReelRenderer] = useState<ReelRenderer | null>(null);
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
    const [refetchingSceneCandidatesId, setRefetchingSceneCandidatesId] = useState<string | null>(null);
    const [maxAiGeneratedScenes, setMaxAiGeneratedScenes] = useState(3);
    const [sceneFilter, setSceneFilter] = useState<'all' | 'unresolved' | 'ai-eligible'>('all');

    // Advanced Reel AI Visuals State
    const [anchorTimeline, setAnchorTimeline] = useState<TimelinePrompt[]>([]);
    const [extractingTimeline, setExtractingTimeline] = useState(false);
    const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);
    const [audioPreviewDuration, setAudioPreviewDuration] = useState(0);
    const [audioPreviewCurrentTime, setAudioPreviewCurrentTime] = useState(0);
    const [splitScenesBySentence, setSplitScenesBySentence] = useState(true);
    const [audioPreviewPlaying, setAudioPreviewPlaying] = useState(false);
    const [draggingTransitionIdx, setDraggingTransitionIdx] = useState<number | null>(null);
    const [draggingSfxCueId, setDraggingSfxCueId] = useState<string | null>(null);
    const [wordTimestamps, setWordTimestamps] = useState<WordTimestamp[]>([]);
    const [premiumSfxLibrary, setPremiumSfxLibrary] = useState<PremiumSfxOption[]>([]);
    const [sfxTimeline, setSfxTimeline] = useState<ReelSfxItem[]>([]);
    const [activeSfxCueId, setActiveSfxCueId] = useState<string | null>(null);
    const [autoPlacingSfx, setAutoPlacingSfx] = useState(false);
    const [sfxAssistMessage, setSfxAssistMessage] = useState<string | null>(null);
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
        fetchPremiumSfxLibrary().then(result => {
            setPremiumSfxLibrary(result.sounds);
        }).catch(() => { });
    }, []);

    useEffect(() => {
        return () => {
            if (sfxPreviewRef.current) {
                sfxPreviewRef.current.pause();
                sfxPreviewRef.current = null;
            }
            stopActiveSfxAudios();
        };
    }, []);

    useEffect(() => {
        if (premiumSfxLibrary.length === 0) return;
        setSfxTimeline(prev => prev.map(cue => (
            premiumSfxLibrary.some(sound => sound.sound_id === cue.sound_id)
                ? cue
                : { ...cue, sound_id: premiumSfxLibrary[0].sound_id }
        )));
    }, [premiumSfxLibrary]);

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
    const [uploadingCarouselImageIdx, setUploadingCarouselImageIdx] = useState<number | null>(null);
    const [reelSpeed, setReelSpeed] = useState(1.0);
    const [elevenlabsStability, setElevenlabsStability] = useState(0.65);
    const [elevenlabsSimilarityBoost, setElevenlabsSimilarityBoost] = useState(0.85);
    const [elevenlabsStyle, setElevenlabsStyle] = useState(0.1);
    const [ttsProvider, setTtsProvider] = useState('openai');
    const [includeWaveform, setIncludeWaveform] = useState(false);
    const [downloadQuality, setDownloadQuality] = useState<DownloadQuality>('high');

    // Engine Tabs & Inputs
    type EngineTab = 'latest' | 'top-papers' | 'top-scientists' | 'daily-science' | 'custom' | 'social-fact-checker' | 'video-text-fx';
    const [activeTab, setActiveTab] = useState<EngineTab>('latest');
    const isCustomTab = activeTab === 'custom';
    const showReelSection =
        isCustomTab ||
        (activeTab === 'latest' && !!episode) ||
        ((activeTab === 'top-papers' || activeTab === 'top-scientists' || activeTab === 'daily-science') && !!selectedPaperId);

    const resetReelWorkspace = () => {
        setReelUrl(null);
        setReelError(null);
        setReelRenderer(null);
        setReelScript('');
        setReelHeadline('');
        setAnchorTimeline([]);
        setAnchorWords([]);
        setSceneTimeline([]);
        setSfxTimeline([]);
        setGeneratedReelImages([]);
        setWordTimestamps([]);
        setAudioPreviewUrl(null);
        setAudioPreviewDuration(0);
        setAudioPreviewCurrentTime(0);
        setAudioPreviewPlaying(false);
        setUploadedAudioFile(null);
        setUploadedTranscript('');
        setAudioSourceMode('tts');
        setDraggingTransitionIdx(null);
        scenePromptDraftRef.current = {};
        setFactCheckUrl('');
        setFactCheckVideo(null);
        setFactCheckClaims([]);
        setSelectedFactCheckClaimId(null);
        setFactCheckAnalysis(null);
        setFactCheckError(null);
        setFactCheckCaptionDraft('');
        setFactCheckCommentDraft('');
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
    const [factCheckUrl, setFactCheckUrl] = useState('');
    const [factCheckVideo, setFactCheckVideo] = useState<FactCheckVideo | null>(null);
    const [factCheckClaims, setFactCheckClaims] = useState<FactCheckClaim[]>([]);
    const [selectedFactCheckClaimId, setSelectedFactCheckClaimId] = useState<string | null>(null);
    const [factCheckAnalysis, setFactCheckAnalysis] = useState<FactCheckAnalysis | null>(null);
    const [factCheckStitchPreview, setFactCheckStitchPreview] = useState<FactCheckStitchPreview | null>(null);
    const [factCheckError, setFactCheckError] = useState<string | null>(null);
    const [expandedFactCheckPapers, setExpandedFactCheckPapers] = useState<Record<string, boolean>>({});
    const [factCheckCaptionDraft, setFactCheckCaptionDraft] = useState('');
    const [factCheckCaptionCopied, setFactCheckCaptionCopied] = useState(false);
    const [factCheckCommentDraft, setFactCheckCommentDraft] = useState('');
    const [factCheckCommentCopied, setFactCheckCommentCopied] = useState(false);
    const [factCheckAnalysisClaimDraft, setFactCheckAnalysisClaimDraft] = useState('');
    const [factCheckQueryDraft, setFactCheckQueryDraft] = useState('');
    const [factCheckStartWordIndex, setFactCheckStartWordIndex] = useState<number | null>(null);
    const [factCheckEndWordIndex, setFactCheckEndWordIndex] = useState<number | null>(null);
    const [factCheckOverlayText, setFactCheckOverlayText] = useState('STITCH INCOMING');
    const [factCheckLookDevQuestion, setFactCheckLookDevQuestion] = useState('IS THIS CLAIM ACTUALLY TRUE?');
    const [factCheckLookDevRating, setFactCheckLookDevRating] = useState(0);
    const [factCheckLookDevTrustLabel, setFactCheckLookDevTrustLabel] = useState('MOSTLY SUPPORTED');
    const [factCheckLookDevVerdict, setFactCheckLookDevVerdict] = useState('');
    const [factCheckLookDevRationale, setFactCheckLookDevRationale] = useState('');
    const [factCheckLookDevSupportCount, setFactCheckLookDevSupportCount] = useState(5);
    const [factCheckLookDevMixedCount, setFactCheckLookDevMixedCount] = useState(3);
    const [factCheckLookDevRefuteCount, setFactCheckLookDevRefuteCount] = useState(0);
    const [factCheckLookDevDuration, setFactCheckLookDevDuration] = useState(9);
    const [factCheckLookDevUseSourceBackground, setFactCheckLookDevUseSourceBackground] = useState(true);
    const [factCheckLookDevPreview, setFactCheckLookDevPreview] = useState<FactCheckStitchLookDevPreview | null>(null);
    const [ingestingFactCheckVideo, setIngestingFactCheckVideo] = useState(false);
    const [analyzingFactCheckClaim, setAnalyzingFactCheckClaim] = useState(false);
    const [generatingFactCheckStitchPreview, setGeneratingFactCheckStitchPreview] = useState(false);
    const [renderingFactCheckLookDev, setRenderingFactCheckLookDev] = useState(false);
    const [videoTextFxStyle, setVideoTextFxStyle] = useState<VideoTextFxStyle>('ali-abdal');
    const [videoTextFxTranscript, setVideoTextFxTranscript] = useState('');
    const [videoTextFxAutoTranscribe, setVideoTextFxAutoTranscribe] = useState(true);
    const [videoTextFxSourceAssetUrl, setVideoTextFxSourceAssetUrl] = useState('');
    const [videoTextFxSourceThumbnailUrl, setVideoTextFxSourceThumbnailUrl] = useState('');
    const [videoTextFxDurationSeconds, setVideoTextFxDurationSeconds] = useState(0);
    const [videoTextFxUploadingSource, setVideoTextFxUploadingSource] = useState(false);
    const [videoTextFxTranscribing, setVideoTextFxTranscribing] = useState(false);
    const [videoTextFxRendering, setVideoTextFxRendering] = useState(false);
    const [videoTextFxUploadError, setVideoTextFxUploadError] = useState<string | null>(null);
    const [videoTextFxPlan, setVideoTextFxPlan] = useState<VideoTextFxBeat[]>([]);
    const [videoTextFxPreviewUrl, setVideoTextFxPreviewUrl] = useState('');
    const selectedFactCheckClaim = factCheckClaims.find((claim) => claim.claim_id === selectedFactCheckClaimId) || null;
    const factCheckWords = factCheckVideo?.word_timestamps || [];

    const findClosestFactCheckWordIndex = (timeSeconds: number, preferEnd: boolean = false) => {
        if (!factCheckWords.length) return null;
        let bestIndex = 0;
        let bestDistance = Number.POSITIVE_INFINITY;
        factCheckWords.forEach((word, idx) => {
            const anchor = preferEnd ? word.end : word.start;
            const distance = Math.abs(anchor - timeSeconds);
            if (distance < bestDistance) {
                bestDistance = distance;
                bestIndex = idx;
            }
        });
        return bestIndex;
    };

    const selectedStartWord = factCheckStartWordIndex != null ? factCheckWords[factCheckStartWordIndex] : null;
    const selectedEndWord = factCheckEndWordIndex != null ? factCheckWords[factCheckEndWordIndex] : null;
    const selectedFactCheckClipStartSeconds = selectedStartWord ? selectedStartWord.start : selectedFactCheckClaim?.start_time_seconds ?? 0;
    const selectedFactCheckClipEndSeconds = selectedEndWord ? selectedEndWord.end : selectedFactCheckClaim?.end_time_seconds ?? 0;
    const factCheckAnalysisMatchesSelection = !!factCheckAnalysis && factCheckAnalysis.claim.claim_id === selectedFactCheckClaimId;
    const buildFactCheckScoreReasoningLine = () => (
        'This score puts the most weight on direct human evidence, gives some credit to indirect or mechanistic support, and is pulled down by conflicting or weaker studies.'
    );
    const getCountedFactCheckPapers = (analysis: FactCheckAnalysis) => {
        const stanceOrder: Record<string, number> = { supports: 0, mixed: 1, refutes: 2 };
        return [...analysis.papers]
            .filter((paper) => paper.counted_in_tally)
            .sort((a, b) => {
                const stanceDelta = (stanceOrder[a.stance] ?? 9) - (stanceOrder[b.stance] ?? 9);
                if (stanceDelta !== 0) return stanceDelta;
                const relevanceDelta = (b.relevance_score || 0) - (a.relevance_score || 0);
                if (Math.abs(relevanceDelta) > 0.0001) return relevanceDelta;
                const retrievalDelta = (b.retrieval_score || 0) - (a.retrieval_score || 0);
                if (Math.abs(retrievalDelta) > 0.0001) return retrievalDelta;
                return (b.cited_by_count || 0) - (a.cited_by_count || 0);
            });
    };

    const buildFactCheckInstagramCaption = (analysis: FactCheckAnalysis) => {
        const claimLine = (analysis.analysis_claim_text || analysis.claim.claim_text).trim();
        const verdict = analysis.verdict_summary.trim();
        const shortSummary = analysis.thirty_second_summary.trim();
        const sourceUrl = factCheckVideo?.source_url?.trim();
        const hook = `We checked this claim against ${analysis.verified_paper_count} verified papers so you don’t have to guess.`;
        const conciseSummary = shortSummary || verdict;
        const hashtags = claimToHashtags(claimLine).join(' ');
        const parts = [
            hook,
            '',
            `Claim checked: ${claimLine}`,
            `Trust score: ${analysis.overall_rating.toFixed(1)}/5 • ${analysis.trust_label}`,
            buildFactCheckScoreReasoningLine(),
            conciseSummary,
            `Counted evidence: ${analysis.support_count} support • ${analysis.refute_count} refute • ${analysis.mixed_count} mixed.`,
            analysis.ai_fallback_used
                ? 'We widened the search with AI, then kept only papers we could verify through OpenAlex.'
                : 'Every paper kept in this review was directly matched through OpenAlex.',
            'The first comment has the paper list and DOI references.',
        ];
        if (analysis.tangential_count > 0) {
            parts.splice(7, 0, `${analysis.tangential_count} additional verified papers were reviewed but excluded from the final tally because they were tangential to the claim.`);
        }
        if (sourceUrl) {
            parts.push(`Original video: ${sourceUrl}`);
        }
        parts.push('', hashtags);
        return clampCaptionLength(parts.join('\n\n'), 2200);
    };

    const buildFactCheckInstagramComment = (analysis: FactCheckAnalysis) => {
        const lines: string[] = [];
        const countedPapers = getCountedFactCheckPapers(analysis);
        const header = `Papers behind this review for "${(analysis.analysis_claim_text || analysis.claim.claim_text).trim()}":`;
        pushLineWithinLimit(lines, header, 2200);
        pushLineWithinLimit(lines, '', 2200);

        let included = 0;
        countedPapers.forEach((paper, idx) => {
            const titleLine = `${idx + 1}. ${paper.title}${paper.year ? ` (${paper.year})` : ''}`;
            const doiLine = paper.doi?.trim() ? `DOI: ${paper.doi.trim()}` : 'DOI not surfaced in the current metadata.';
            const stanceLine = `Status: ${paper.stance}`;
            const block = `${titleLine}\n${stanceLine}\n${doiLine}`;
            if (pushLineWithinLimit(lines, block, 2200)) {
                included += 1;
            }
        });

        if (included < countedPapers.length) {
            pushLineWithinLimit(lines, '', 2200);
            pushLineWithinLimit(lines, `${countedPapers.length - included} more counted papers were reviewed but not listed here due to Instagram comment length limits.`, 2200);
        }

        if (analysis.tangential_count > 0) {
            pushLineWithinLimit(lines, '', 2200);
            pushLineWithinLimit(lines, `${analysis.tangential_count} additional verified papers were reviewed but not listed here because they were tangential to the claim.`, 2200);
        }

        pushLineWithinLimit(lines, '', 2200);
        pushLineWithinLimit(lines, `Counted evidence summary: ${analysis.support_count} support • ${analysis.refute_count} refute • ${analysis.mixed_count} mixed.`, 2200);
        return lines.join('\n').trim();
    };

    const handleUploadVideoTextFxSource = async (file: File | null) => {
        if (!file) return;
        setVideoTextFxUploadingSource(true);
        setVideoTextFxUploadError(null);
        setVideoTextFxPreviewUrl('');
        try {
            const uploaded = await uploadSceneAsset(file);
            if (uploaded.asset_source !== 'user_video') {
                throw new Error('Please upload a video file for this workflow.');
            }
            setVideoTextFxSourceAssetUrl(uploaded.asset_url || '');
            setVideoTextFxSourceThumbnailUrl(uploaded.thumbnail_url || uploaded.asset_url || '');
            setVideoTextFxDurationSeconds(Number(uploaded.duration_seconds || 0));
            if (videoTextFxAutoTranscribe && uploaded.asset_url) {
                setVideoTextFxTranscribing(true);
                const transcriptResult = await extractUploadedVideoTranscript(uploaded.asset_url);
                setVideoTextFxTranscript(transcriptResult.transcript_text || '');
                if (transcriptResult.duration_seconds > 0) {
                    setVideoTextFxDurationSeconds(transcriptResult.duration_seconds);
                }
                const generatedPlan = buildVideoTextFxPlan(
                    transcriptResult.transcript_text || '',
                    transcriptResult.duration_seconds > 0 ? transcriptResult.duration_seconds : Number(uploaded.duration_seconds || 0) || 34,
                );
                setVideoTextFxPlan(generatedPlan);
            }
        } catch (err: any) {
            setVideoTextFxUploadError(err?.message || 'Failed to upload the source video.');
        } finally {
            setVideoTextFxTranscribing(false);
            setVideoTextFxUploadingSource(false);
        }
    };

    const handleGenerateVideoTextFxPlan = () => {
        const normalizedTranscript = videoTextFxTranscript.replace(/\s+/g, ' ').trim();
        if (!normalizedTranscript) {
            setVideoTextFxUploadError(
                videoTextFxAutoTranscribe
                    ? 'Auto-transcription should be the default path here. Until that backend hook lands, paste a transcript or turn the checkbox off and use a manual override.'
                    : 'Paste a transcript to generate the overlay plan.',
            );
            return;
        }
        const resolvedDuration = videoTextFxDurationSeconds > 0 ? videoTextFxDurationSeconds : 34;
        setVideoTextFxUploadError(null);
        setVideoTextFxPlan(buildVideoTextFxPlan(normalizedTranscript, resolvedDuration));
    };

    const handleRenderVideoTextFx = async () => {
        const normalizedTranscript = videoTextFxTranscript.replace(/\s+/g, ' ').trim();
        if (!videoTextFxSourceAssetUrl) {
            setVideoTextFxUploadError('Upload a source video before rendering.');
            return;
        }
        if (!normalizedTranscript) {
            setVideoTextFxUploadError('A transcript is required before rendering.');
            return;
        }
        const beats = videoTextFxPlan.length > 0 ? videoTextFxPlan : buildVideoTextFxPlan(normalizedTranscript, videoTextFxDurationSeconds > 0 ? videoTextFxDurationSeconds : 34);
        if (!videoTextFxPlan.length) {
            setVideoTextFxPlan(beats);
        }
        setVideoTextFxRendering(true);
        setVideoTextFxUploadError(null);
        try {
            const result = await renderUploadedVideoTextFx({
                sourceVideoUrl: videoTextFxSourceAssetUrl,
                transcriptText: normalizedTranscript,
                stylePreset: videoTextFxStyle,
                durationSeconds: videoTextFxDurationSeconds > 0 ? videoTextFxDurationSeconds : 34,
                beats: beats.map((beat) => ({
                    id: beat.id,
                    text: beat.text,
                    start_time_seconds: beat.startTimeSeconds,
                    end_time_seconds: beat.endTimeSeconds,
                    layer: beat.layer,
                    style: beat.style,
                    notes: beat.notes,
                })),
            });
            setVideoTextFxPreviewUrl(result.preview_url || '');
        } catch (err: any) {
            setVideoTextFxUploadError(err?.message || 'Failed to render the final video text FX output.');
        } finally {
            setVideoTextFxRendering(false);
        }
    };

    useEffect(() => {
        if (!selectedFactCheckClaim) {
            setFactCheckAnalysisClaimDraft('');
            setFactCheckQueryDraft('');
            setFactCheckStartWordIndex(null);
            setFactCheckEndWordIndex(null);
            return;
        }
        setFactCheckAnalysisClaimDraft(selectedFactCheckClaim.claim_text || '');
        setFactCheckQueryDraft((selectedFactCheckClaim.suggested_queries || []).join('\n'));
        setFactCheckStartWordIndex(findClosestFactCheckWordIndex(selectedFactCheckClaim.start_time_seconds, false));
        setFactCheckEndWordIndex(findClosestFactCheckWordIndex(selectedFactCheckClaim.end_time_seconds, true));
        setFactCheckOverlayText('STITCH INCOMING');
        setFactCheckStitchPreview(null);
        setFactCheckLookDevPreview(null);
        setFactCheckLookDevQuestion('');
    }, [selectedFactCheckClaimId, factCheckClaims, factCheckVideo]);

    useEffect(() => {
        if (factCheckAnalysis?.look_dev_question?.trim()) return;
        const claimText = factCheckAnalysisClaimDraft.replace(/\s+/g, ' ').trim();
        if (!selectedFactCheckClaim || !claimText) {
            setFactCheckLookDevQuestion('');
            return;
        }

        const requestId = ++factCheckHookRequestRef.current;
        const timeoutId = window.setTimeout(async () => {
            try {
                const result = await generateFactCheckHookQuestion({ claimText });
                if (factCheckHookRequestRef.current !== requestId) return;
                const question = String(result.question || '').trim();
                setFactCheckLookDevQuestion(question);
            } catch {
                if (factCheckHookRequestRef.current !== requestId) return;
                setFactCheckLookDevQuestion('');
            }
        }, 500);

        return () => {
            window.clearTimeout(timeoutId);
        };
    }, [selectedFactCheckClaimId, selectedFactCheckClaim, factCheckAnalysisClaimDraft, factCheckAnalysis?.look_dev_question]);

    useEffect(() => {
        if (!factCheckAnalysis) {
            setFactCheckCaptionDraft('');
            setFactCheckCommentDraft('');
            return;
        }
        setFactCheckCaptionDraft(buildFactCheckInstagramCaption(factCheckAnalysis));
        setFactCheckCommentDraft(buildFactCheckInstagramComment(factCheckAnalysis));
        setFactCheckLookDevRating(Number(factCheckAnalysis.overall_rating.toFixed(1)));
        setFactCheckLookDevTrustLabel(factCheckAnalysis.trust_label || 'MIXED EVIDENCE');
        setFactCheckLookDevVerdict(factCheckAnalysis.verdict_summary || '');
        setFactCheckLookDevRationale(buildLookDevBullets(factCheckAnalysis));
        setFactCheckLookDevSupportCount(factCheckAnalysis.support_count || 0);
        setFactCheckLookDevMixedCount(factCheckAnalysis.mixed_count || 0);
        setFactCheckLookDevRefuteCount(factCheckAnalysis.refute_count || 0);
        if (factCheckAnalysis.look_dev_question?.trim()) {
            setFactCheckLookDevQuestion(factCheckAnalysis.look_dev_question.trim());
        }
    }, [factCheckAnalysis, factCheckVideo]);

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
    const [editedCoverCta, setEditedCoverCta] = useState('Check Caption');
    const [editedCoverTitle, setEditedCoverTitle] = useState('');
    const [editedHeadline, setEditedHeadline] = useState('');
    const [editedTakeawayTitles, setEditedTakeawayTitles] = useState<string[]>(['', '', '']);
    const [editedTakeaways, setEditedTakeaways] = useState<string[]>(['', '', '']);
    const [editedOutroTitle, setEditedOutroTitle] = useState('');
    const [editedOutro, setEditedOutro] = useState('Read the full paper in the description below.');
    const [editedOutroFollow, setEditedOutroFollow] = useState('Follow @the.eureka.feed for research-backed explainers.');
    const [showTag, setShowTag] = useState(false);

    // Collapsible section states
    const [isSlideSectionOpen, setIsSlideSectionOpen] = useState(true);
    const [isReelSectionOpen, setIsReelSectionOpen] = useState(true);
    const [isCustomInputOpen, setIsCustomInputOpen] = useState(true);

    const applyCustomDraft = (draft: CustomDraft) => {
        setSlideTitle(draft.slideTitle || '');
        setCustomCategory(draft.customCategory || 'SCIENCE');
        setCustomYear(draft.customYear || '');
        setCustomCaption(draft.customCaption || '');
        setEditedCoverCta(draft.editedCoverCta || 'Check Caption');
        setEditedCoverTitle(draft.editedCoverTitle || '');
        setEditedHeadline(draft.editedHeadline || '');
        setEditedTakeawayTitles(
            Array.isArray(draft.editedTakeawayTitles) && draft.editedTakeawayTitles.length > 0
                ? draft.editedTakeawayTitles
                : ['', '', '']
        );
        setEditedTakeaways(
            Array.isArray(draft.editedTakeaways) && draft.editedTakeaways.length > 0
                ? draft.editedTakeaways
                : ['', '', '']
        );
        setEditedOutroTitle(draft.editedOutroTitle || '');
        setEditedOutro(draft.editedOutro || 'Read the full paper in the description below.');
        setEditedOutroFollow(draft.editedOutroFollow || 'Follow @the.eureka.feed for research-backed explainers.');
        setShowTag(Boolean(draft.showTag));
        setCustomSlidesReady(Boolean(draft.customSlidesReady));
        setIsCustomInputOpen(typeof draft.isCustomInputOpen === 'boolean' ? draft.isCustomInputOpen : true);
        setIsSlideSectionOpen(typeof draft.isSlideSectionOpen === 'boolean' ? draft.isSlideSectionOpen : true);
        setCarouselImagePrompts(Array.isArray(draft.carouselImagePrompts) ? draft.carouselImagePrompts : []);
        setCarouselImageUrls(Array.isArray(draft.carouselImageUrls) ? draft.carouselImageUrls : []);
        setSfxTimeline(Array.isArray(draft.sfxTimeline) ? draft.sfxTimeline : []);
        setSlideData(draft.slideData && draft.slideData.paper_id === 0 ? draft.slideData : null);
    };

    const loadSavedCustomDraft = (): CustomDraft | null => {
        if (typeof window === 'undefined') return null;
        try {
            const raw = window.localStorage.getItem(CUSTOM_DRAFT_STORAGE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw) as Partial<CustomDraft>;
            return {
                ...createDefaultCustomDraft(),
                ...parsed,
                editedTakeawayTitles: Array.isArray(parsed.editedTakeawayTitles) ? parsed.editedTakeawayTitles : ['', '', ''],
                editedTakeaways: Array.isArray(parsed.editedTakeaways) ? parsed.editedTakeaways : ['', '', ''],
                carouselImagePrompts: Array.isArray(parsed.carouselImagePrompts) ? parsed.carouselImagePrompts : [],
                carouselImageUrls: Array.isArray(parsed.carouselImageUrls) ? parsed.carouselImageUrls : [],
                sfxTimeline: Array.isArray(parsed.sfxTimeline) ? parsed.sfxTimeline : [],
                slideData: parsed.slideData && parsed.slideData.paper_id === 0 ? parsed.slideData : null,
                lastActiveTab: parsed.lastActiveTab === 'custom' ? 'custom' : 'other',
            };
        } catch (err) {
            console.error('Failed to read saved custom draft', err);
            return null;
        }
    };

    const clearSavedCustomDraft = () => {
        if (typeof window !== 'undefined') {
            window.localStorage.removeItem(CUSTOM_DRAFT_STORAGE_KEY);
        }
        applyCustomDraft(createDefaultCustomDraft());
        setError(null);
    };

    useEffect(() => {
        const savedDraft = loadSavedCustomDraft();
        if (savedDraft) {
            applyCustomDraft(savedDraft);
            if (savedDraft.lastActiveTab === 'custom') {
                setActiveTab('custom');
            }
        }
        hasHydratedCustomDraftRef.current = true;
        setCustomDraftReady(true);
    }, []);

    useEffect(() => {
        if (!hasHydratedCustomDraftRef.current || !customDraftReady || typeof window === 'undefined') return;
        const customSlideData = slideData && slideData.paper_id === 0 ? slideData : null;
        const draft: CustomDraft = {
            lastActiveTab: activeTab === 'custom' ? 'custom' : 'other',
            slideTitle,
            customCategory,
            customYear,
            customCaption,
            editedCoverCta,
            editedCoverTitle,
            editedHeadline,
            editedTakeawayTitles,
            editedTakeaways,
            editedOutroTitle,
            editedOutro,
            editedOutroFollow,
            showTag,
            customSlidesReady,
            isCustomInputOpen,
            isSlideSectionOpen,
            carouselImagePrompts,
            carouselImageUrls,
            sfxTimeline,
            slideData: customSlideData,
        };

        try {
            window.localStorage.setItem(CUSTOM_DRAFT_STORAGE_KEY, JSON.stringify(draft));
        } catch (err) {
            console.error('Failed to save custom draft', err);
        }
    }, [
        customDraftReady,
        activeTab,
        slideTitle,
        customCategory,
        customYear,
        customCaption,
        editedCoverCta,
        editedCoverTitle,
        editedHeadline,
        editedTakeawayTitles,
        editedTakeaways,
        editedOutroTitle,
        editedOutro,
        editedOutroFollow,
        showTag,
        customSlidesReady,
        isCustomInputOpen,
        isSlideSectionOpen,
        carouselImagePrompts,
        carouselImageUrls,
        sfxTimeline,
        slideData,
    ]);

    useEffect(() => {
        if (!hasHydratedCustomDraftRef.current || !isCustomTab) return;
        const expectedCount = buildCustomDeckSlides().length;
        setCarouselImagePrompts(prev => {
            if (prev.length === expectedCount) return prev;
            if (expectedCount === 0) return [];
            return Array.from({ length: expectedCount }, (_, idx) => prev[idx] || '');
        });
        setCarouselImageUrls(prev => {
            if (prev.length === expectedCount) return prev;
            if (expectedCount === 0) return [];
            return Array.from({ length: expectedCount }, (_, idx) => prev[idx] || '');
        });
    }, [isCustomTab, editedCoverCta, editedCoverTitle, editedHeadline, editedTakeaways, editedOutro, editedOutroFollow]);

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
        const coverTitleText = editedCoverTitle.trim() || editedHeadline.trim();
        const coverText = [coverTitleText, editedCoverCta.trim()].filter(Boolean).join('\n');
        const ctaText = [editedOutro.trim(), editedOutroFollow.trim()].filter(Boolean).join(' ');
        return [
            { label: 'Slide 1', text: coverText.trim() },
            { label: 'Slide 2', text: editedHeadline.trim() },
            ...takeaways.map((text, idx) => ({ label: `Slide ${idx + 3}`, text })),
            { label: `Slide ${takeaways.length + 3}`, text: ctaText.trim() },
        ].filter(item => item.text);
    };
    const customDeckSlides = buildCustomDeckSlides();
    const renderedTakeaways = activeTab === 'custom' ? buildCustomDeckTakeaways() : editedTakeaways;
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

    const getSfxSafeDuration = () => Math.max(
        timelineDuration,
        audioPreviewDuration,
        reelDuration,
        wordTimestamps.length > 0 ? wordTimestamps[wordTimestamps.length - 1].end : 0,
        0.5,
    );

    const clampSfxCueTime = (cues: ReelSfxItem[], cueId: string, proposedTime: number) => {
        const safeDuration = getSfxSafeDuration();
        const ordered = [...cues].sort((a, b) => a.start_time_seconds - b.start_time_seconds);
        const idx = ordered.findIndex(cue => cue.id === cueId);
        if (idx === -1) {
            return Math.min(
                Math.max(proposedTime, MIN_SCENE_LENGTH_SECONDS),
                Math.max(safeDuration - MIN_SCENE_LENGTH_SECONDS, MIN_SCENE_LENGTH_SECONDS),
            );
        }

        const previousBound = idx > 0
            ? ordered[idx - 1].start_time_seconds + MIN_SCENE_LENGTH_SECONDS
            : MIN_SCENE_LENGTH_SECONDS;
        const nextBound = idx < ordered.length - 1
            ? ordered[idx + 1].start_time_seconds - MIN_SCENE_LENGTH_SECONDS
            : Math.max(safeDuration - MIN_SCENE_LENGTH_SECONDS, MIN_SCENE_LENGTH_SECONDS);

        if (nextBound <= previousBound) {
            return Number(previousBound.toFixed(2));
        }

        return Number(Math.min(Math.max(proposedTime, previousBound), nextBound).toFixed(2));
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

    const buildSfxCueId = () => {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }
        return `sfx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    };

    const sortedSfxTimeline = [...sfxTimeline].sort((a, b) => a.start_time_seconds - b.start_time_seconds);
    const activeSfxCue = activeSfxCueId ? sortedSfxTimeline.find(cue => cue.id === activeSfxCueId) ?? null : null;

    const formatTimelineTime = (seconds: number) => {
        if (!Number.isFinite(seconds)) return '0:00';
        const totalSeconds = Math.max(0, Math.floor(seconds));
        const mins = Math.floor(totalSeconds / 60);
        const secs = totalSeconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const setNarrationPreviewTime = (time: number) => {
        const nextTime = Math.min(Math.max(time, 0), Math.max(timelineDuration, 0));
        playedSfxCueIdsRef.current = new Set(
            sortedSfxTimeline
                .filter(cue => cue.start_time_seconds < nextTime - 0.02)
                .map(cue => cue.id),
        );
        stopActiveSfxAudios();
        lastPreviewTimeRef.current = nextTime;
        if (audioPreviewRef.current) {
            audioPreviewRef.current.currentTime = nextTime;
        }
        setAudioPreviewCurrentTime(nextTime);
    };

    const toggleNarrationPreviewPlayback = async () => {
        const preview = audioPreviewRef.current;
        if (!preview) return;
        if (preview.paused) {
            try {
                await preview.play();
            } catch (err) {
                console.error('Failed to play narration preview', err);
            }
            return;
        }
        preview.pause();
    };

    const getSfxPreviewUrl = (filename: string) => `${API_BASE_URL}/api/v1/content/premium-sfx/${encodeURIComponent(filename)}`;

    const stopActiveSfxAudios = () => {
        for (const audio of activeSfxAudiosRef.current) {
            audio.pause();
            audio.currentTime = 0;
        }
        activeSfxAudiosRef.current = [];
    };

    const triggerSfxPlayback = async (cue: ReelSfxItem) => {
        const sfxMeta = premiumSfxLibrary.find(sound => sound.sound_id === cue.sound_id);
        if (!sfxMeta) return;

        const sfxAudio = new Audio(getSfxPreviewUrl(sfxMeta.filename));
        sfxAudio.volume = cue.volume;
        activeSfxAudiosRef.current = [...activeSfxAudiosRef.current, sfxAudio];
        sfxAudio.addEventListener('ended', () => {
            activeSfxAudiosRef.current = activeSfxAudiosRef.current.filter(item => item !== sfxAudio);
        }, { once: true });

        try {
            await sfxAudio.play();
        } catch (err) {
            console.error('Failed to trigger timeline SFX playback', err);
        }
    };

    const previewSfxCue = async (cue: ReelSfxItem) => {
        const preview = audioPreviewRef.current;
        if (!preview) return;

        const sfxMeta = premiumSfxLibrary.find(sound => sound.sound_id === cue.sound_id);
        const sfxUrl = sfxMeta ? getSfxPreviewUrl(sfxMeta.filename) : '';

        if (sfxPreviewRef.current) {
            sfxPreviewRef.current.pause();
            sfxPreviewRef.current.currentTime = 0;
        }
        stopActiveSfxAudios();

        setNarrationPreviewTime(cue.start_time_seconds);
        playedSfxCueIdsRef.current = new Set(sortedSfxTimeline
            .filter(item => item.start_time_seconds < cue.start_time_seconds - 0.02)
            .map(item => item.id));
        lastPreviewTimeRef.current = Math.max(0, cue.start_time_seconds - 0.05);

        try {
            await preview.play();
            if (sfxUrl) {
                const sfxAudio = new Audio(sfxUrl);
                sfxAudio.volume = cue.volume;
                sfxPreviewRef.current = sfxAudio;
                await sfxAudio.play();
            }
        } catch (err) {
            console.error('Failed to preview SFX cue', err);
        }
    };

    const addSfxCueAtTime = (time: number) => {
        if (premiumSfxLibrary.length === 0) return;
        const safeTime = Math.min(Math.max(time, 0), Math.max(getSfxSafeDuration(), 0));
        const nextCue: ReelSfxItem = {
            id: buildSfxCueId(),
            sound_id: premiumSfxLibrary[0].sound_id,
            start_time_seconds: Number(safeTime.toFixed(2)),
            volume: DEFAULT_SFX_VOLUME,
        };
        setSfxTimeline(prev => {
            const draft = [...prev, nextCue];
            const clampedTime = clampSfxCueTime(draft, nextCue.id, nextCue.start_time_seconds);
            return draft
                .map(cue => cue.id === nextCue.id ? { ...cue, start_time_seconds: clampedTime } : cue)
                .sort((a, b) => a.start_time_seconds - b.start_time_seconds);
        });
    };

    const updateSfxCue = (cueId: string, updater: (cue: ReelSfxItem) => ReelSfxItem) => {
        setSfxTimeline(prev => {
            const updated = prev.map(cue => cue.id === cueId ? updater(cue) : cue);
            const targetCue = updated.find(cue => cue.id === cueId);
            if (!targetCue) return prev;
            const clampedTime = clampSfxCueTime(updated, cueId, targetCue.start_time_seconds);
            return updated
                .map(cue => cue.id === cueId ? { ...cue, start_time_seconds: clampedTime } : cue)
                .sort((a, b) => a.start_time_seconds - b.start_time_seconds);
        });
    };

    const removeSfxCue = (cueId: string) => {
        if (activeSfxCueId === cueId) {
            setActiveSfxCueId(null);
        }
        setSfxTimeline(prev => prev.filter(cue => cue.id !== cueId));
    };

    const openSfxCueEditor = (cueId: string) => {
        setActiveSfxCueId(cueId);
    };

    const handleAutoPlaceSfx = async () => {
        if (timelineDuration <= 0 || wordTimestamps.length === 0) {
            alert('Compile the narration timeline first so AI assist has word timings to work with.');
            return;
        }
        if (premiumSfxLibrary.length === 0) {
            alert('Premium SFX library is still loading.');
            return;
        }

        if (
            sfxTimeline.length > 0 &&
            !window.confirm('Replace the current SFX cues with a fresh AI-assisted pass?')
        ) {
            return;
        }

        setAutoPlacingSfx(true);
        setSfxAssistMessage(null);

        try {
            const targetCueCount = Math.min(24, Math.max(10, Math.round(Math.max(timelineDuration, reelDuration) / 2.75)));
            const result = await autoPlacePremiumSfx({
                headline: reelHeadline,
                script: reelScript,
                durationSeconds: Math.max(timelineDuration, reelDuration),
                wordTimestamps,
                scenes: sceneTimeline,
                maxCues: targetCueCount,
            });

            const suggestedCues: ReelSfxItem[] = result.cues.map(cue => ({
                id: buildSfxCueId(),
                sound_id: cue.sound_id,
                start_time_seconds: Number(cue.start_time_seconds.toFixed(2)),
                volume: Number(cue.volume.toFixed(2)),
            }));

            if (suggestedCues.length > 0) {
                setSfxTimeline(suggestedCues.sort((a, b) => a.start_time_seconds - b.start_time_seconds));
                setSfxAssistMessage(
                    `${result.mode === 'ai' ? 'AI assist' : 'Smart fallback'} placed ${suggestedCues.length} cue${suggestedCues.length === 1 ? '' : 's'} (requested ${targetCueCount}).`
                );
            } else {
                setSfxAssistMessage('AI assist did not find any strong cue moments for this pass.');
            }
        } catch (err: any) {
            setSfxAssistMessage(err.message || 'Failed to auto-place premium SFX cues.');
        } finally {
            setAutoPlacingSfx(false);
        }
    };

    const updateSfxCueFromClientX = (cueId: string, clientX: number) => {
        const track = sfxTimelineTrackRef.current;
        if (!track || timelineDuration <= 0) return;
        const rect = track.getBoundingClientRect();
        const relativeX = Math.min(Math.max(clientX - rect.left, 0), rect.width);
        const relativeTime = (relativeX / rect.width) * timelineDuration;
        updateSfxCue(cueId, cue => ({
            ...cue,
            start_time_seconds: Number(relativeTime.toFixed(2)),
        }));
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
        const source = (transcriptExcerpt || anchorPhrase || focusWord || '').replace(/\s+/g, ' ').trim();
        return source;
    };

    const buildDerivedSceneFromBounds = (
        index: number,
        startTime: number,
        endTime: number,
        previousScene?: SceneTimelineItem,
    ): SceneTimelineItem => {
        const nearestWord = findNearestWordTimestamp(
            startTime,
            index > 0 ? Math.max(0, startTime - 0.08) : 0,
            Math.min(timelineDuration, endTime),
        );
        const nextAnchorWord = nearestWord
            ? normaliseTimelineWord(nearestWord.word) || previousScene?.anchor_word || 'Scene'
            : previousScene?.anchor_word || 'Scene';
        const nextExcerpt = buildSceneExcerpt(
            startTime,
            endTime,
            previousScene?.anchor_phrase || previousScene?.transcript_excerpt || nextAnchorWord,
        );
        const preservedUserSelection = previousScene?.asset_source?.startsWith('user') || previousScene?.asset_source?.startsWith('local');

        return {
            scene_id: `scene-${index + 1}`,
            anchor_word: nextAnchorWord,
            visual_focus_word: nearestWord ? normaliseTimelineWord(nearestWord.word) || nextAnchorWord : previousScene?.visual_focus_word || nextAnchorWord,
            anchor_phrase: nextExcerpt,
            start_time_seconds: startTime,
            end_time_seconds: endTime,
            transcript_excerpt: nextExcerpt,
            caption_text: previousScene?.caption_is_custom ? previousScene.caption_text : '',
            caption_is_custom: previousScene?.caption_is_custom ?? false,
            effect_transition_name: previousScene?.effect_transition_name,
            scene_role: null,
            asset_bias: previousScene?.asset_bias ?? 'either',
            scene_fx_name: previousScene?.scene_fx_name ?? null,
            scene_fx_strength: previousScene?.scene_fx_strength ?? null,
            stock_match_rationale: null,
            fx_rationale: null,
            planning_confidence: null,
            search_queries: [],
            stock_candidates: [],
            selected_asset: preservedUserSelection ? previousScene?.selected_asset ?? null : null,
            ai_prompt: '',
            ai_image_url: null,
            last_generated_ai_prompt: null,
            asset_source: preservedUserSelection ? previousScene?.asset_source ?? 'none' : 'none',
            scene_state: preservedUserSelection
                ? (previousScene?.asset_source?.startsWith('local') ? 'resolved_by_library' : 'resolved_by_user')
                : 'unresolved',
        };
    };

    const buildScenesFromSfxTimeline = (
        cues: ReelSfxItem[],
        previousScenes: SceneTimelineItem[] = [],
    ): SceneTimelineItem[] => {
        const safeDuration = getSfxSafeDuration();
        if (safeDuration <= 0) return [];

        const boundaries = [0];
        for (const cue of [...cues].sort((a, b) => a.start_time_seconds - b.start_time_seconds)) {
            const lastBoundary = boundaries[boundaries.length - 1];
            const minBoundary = lastBoundary + MIN_SCENE_LENGTH_SECONDS;
            const maxBoundary = Math.max(safeDuration - MIN_SCENE_LENGTH_SECONDS, minBoundary);
            const clamped = Number(Math.min(
                Math.max(Number(cue.start_time_seconds.toFixed(2)), minBoundary),
                maxBoundary,
            ).toFixed(2));
            if (clamped - lastBoundary < MIN_SCENE_LENGTH_SECONDS) continue;
            boundaries.push(clamped);
        }

        const nextScenes = boundaries.map((startTime, idx) => {
            const endTime = idx < boundaries.length - 1 ? boundaries[idx + 1] : safeDuration;
            return buildDerivedSceneFromBounds(idx, startTime, Math.max(endTime, startTime + MIN_SCENE_LENGTH_SECONDS), previousScenes[idx]);
        });

        return normalizeSceneTimeline(nextScenes);
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
        return {
            ...scene,
            start_time_seconds: startTime,
            end_time_seconds: endTime,
            anchor_word: nextAnchorWord,
            visual_focus_word: nearestWord ? normaliseTimelineWord(nearestWord.word) || scene.visual_focus_word || nextAnchorWord : scene.visual_focus_word,
            anchor_phrase: nextExcerpt,
            transcript_excerpt: nextExcerpt,
            caption_text: scene.caption_is_custom ? scene.caption_text : '',
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

    useEffect(() => {
        const nextDrafts: Record<string, string> = { ...sceneQueryDraftRef.current };
        for (const scene of sceneTimeline) {
            if (!nextDrafts[scene.scene_id]?.trim()) {
                nextDrafts[scene.scene_id] = (scene.search_queries || []).join(', ');
            }
        }
        sceneQueryDraftRef.current = nextDrafts;
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
        caption_text: scene.caption_text ?? '',
        caption_is_custom: scene.caption_is_custom ?? false,
        scene_fx_name: scene.scene_fx_name ?? null,
        scene_fx_strength: scene.scene_fx_strength ?? null,
        asset_bias: scene.asset_bias ?? 'either',
    });

    const normalizeSceneTimeline = (scenes: SceneTimelineItem[]) => reindexScenes(scenes.map(normalizeSceneTimelineItem));

    useEffect(() => {
        if (!isCustomTab) return;
        if (!audioPreviewUrl && wordTimestamps.length === 0 && reelDuration <= 0) return;
        setSceneTimeline(prev => buildScenesFromSfxTimeline(sfxTimeline, prev));
    }, [isCustomTab, audioPreviewUrl, reelDuration, audioPreviewDuration, wordTimestamps, sfxTimeline]);

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
                caption_text: '',
                caption_is_custom: false,
                effect_transition_name: current.effect_transition_name,
                scene_role: null,
                asset_bias: 'either',
                scene_fx_name: null,
                scene_fx_strength: null,
                stock_match_rationale: null,
                fx_rationale: null,
                planning_confidence: null,
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
                caption_text: '',
                caption_is_custom: false,
                effect_transition_name: previousScene?.effect_transition_name || nextScene?.effect_transition_name,
                scene_role: null,
                asset_bias: 'either',
                scene_fx_name: null,
                scene_fx_strength: null,
                stock_match_rationale: null,
                fx_rationale: null,
                planning_confidence: null,
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

    useEffect(() => {
        if (draggingSfxCueId === null) return;

        const handlePointerMove = (event: PointerEvent) => {
            if (sfxCuePointerStartRef.current?.cueId === draggingSfxCueId) {
                const deltaX = Math.abs(event.clientX - sfxCuePointerStartRef.current.clientX);
                const deltaY = Math.abs(event.clientY - sfxCuePointerStartRef.current.clientY);
                if (deltaX > 4 || deltaY > 4) {
                    suppressSfxCueClickRef.current = draggingSfxCueId;
                }
            }
            updateSfxCueFromClientX(draggingSfxCueId, event.clientX);
        };

        const handlePointerUp = () => {
            setDraggingSfxCueId(null);
            sfxCuePointerStartRef.current = null;
        };

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);

        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
        };
    }, [draggingSfxCueId, timelineDuration]);

    useEffect(() => {
        if (!activeSfxCueId) return;
        if (!sortedSfxTimeline.some(cue => cue.id === activeSfxCueId)) {
            setActiveSfxCueId(null);
        }
    }, [activeSfxCueId, sortedSfxTimeline]);

    useEffect(() => {
        if (!activeSfxCueId) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setActiveSfxCueId(null);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeSfxCueId]);

    useEffect(() => {
        if (!audioPreviewPlaying) {
            stopActiveSfxAudios();
            lastPreviewTimeRef.current = audioPreviewCurrentTime;
            return;
        }

        if (audioPreviewCurrentTime + 0.08 < lastPreviewTimeRef.current) {
            playedSfxCueIdsRef.current = new Set(
                sortedSfxTimeline
                    .filter(cue => cue.start_time_seconds < audioPreviewCurrentTime - 0.02)
                    .map(cue => cue.id),
            );
            stopActiveSfxAudios();
        }

        const lowerBound = Math.max(0, lastPreviewTimeRef.current - 0.02);
        const upperBound = audioPreviewCurrentTime + 0.03;
        const cuesToTrigger = sortedSfxTimeline.filter(cue => (
            cue.start_time_seconds >= lowerBound &&
            cue.start_time_seconds <= upperBound &&
            !playedSfxCueIdsRef.current.has(cue.id)
        ));

        for (const cue of cuesToTrigger) {
            playedSfxCueIdsRef.current.add(cue.id);
            void triggerSfxPlayback(cue);
        }

        lastPreviewTimeRef.current = audioPreviewCurrentTime;
    }, [audioPreviewCurrentTime, audioPreviewPlaying, sortedSfxTimeline, premiumSfxLibrary]);

    useEffect(() => {
        if (!audioPreviewPlaying) return;
        lastPreviewTimeRef.current = Math.max(0, audioPreviewCurrentTime - 0.05);
    }, [audioPreviewPlaying]);

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

            setEditedCoverTitle(slide.headline || '');
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
                setEditedCoverTitle(content.headline);
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
    const ensureHumanSafeConstraint = (prompt: string) => {
        const normalized = prompt.toLowerCase();
        if (
            normalized.includes("humans are allowed") ||
            normalized.includes("people are allowed") ||
            normalized.includes("silhouettes are fine")
        ) {
            return prompt;
        }
        return `${prompt.trim()}. Humans are allowed when they help tell the story, but keep them controlled: silhouettes, uniforms, over-the-shoulder figures, documentary distance, or naturally framed people in scene are preferred. Avoid extreme facial close-ups, exposed skin detail, pores, body-part emphasis, glamour beauty shots, or hyper-detailed skin texture.`;
    };

    const buildSlidePromptInput = (
        storyContext: string,
        slideIndex: number,
        totalSlides: number,
        slideLabel: string,
        slideText: string
    ) => {
        const slidePosition = slideIndex === 0
            ? 'opening hook slide'
            : slideIndex === totalSlides - 1
                ? 'closing / CTA slide'
                : `middle narrative slide ${slideIndex + 1} of ${totalSlides}`;

        return (
        `Write one image-generation prompt for ${slideLabel} of this carousel.\n\n` +
        `This is slide ${slideIndex + 1} of ${totalSlides}, serving as the ${slidePosition}.\n\n` +
        `Full story context (for narrative relevance):\n${storyContext}\n\n` +
        `Current slide text:\n${slideText}\n\n` +
        `Rules:\n` +
        `- photorealistic, cinematic, high-retention composition\n` +
        `- no text, logos, or letters in the image\n` +
        `- humans are allowed when they genuinely help the story, but keep them controlled: silhouettes, uniforms, documentary distance, or naturally framed people in scene are preferred\n` +
        `- avoid extreme facial close-ups, isolated body parts, exposed-skin texture focus, glamour portrait framing, or hyper-detailed skin pores\n` +
        `- place the main foreground subject or strongest attention-grabbing element in the upper portion of the frame, above the center line\n` +
        `- keep the center region comparatively cleaner for text overlay, but achieve that through natural composition rather than an explicit top/bottom split\n` +
        `- do not create diptychs, stacked panels, empty lower blocks, split-screen layouts, or any image that is visibly divided into two sections\n` +
        `- the image should match this slide's role in the sequence, not just the story overall\n` +
        `- you may reuse the same visual concept as other slides; do not force visual diversity.`
        );
    };

    const handleRegenerateCarouselPrompt = async (idx: number) => {
        const deckSlides = buildCustomDeckSlides();
        const slide = deckSlides[idx];
        if (!slide) return;

        setRegeneratingCarouselPromptIdx(idx);
        try {
            const storyContext = deckSlides.map((item, orderIdx) => `${orderIdx + 1}. ${item.text}`).join('\n');
            const { prompt } = await generateImagePrompt(
                buildSlidePromptInput(storyContext, idx, deckSlides.length, slide.label, slide.text)
            );
            const constrainedPrompt = ensureHumanSafeConstraint(prompt);
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
            const totalSlides = deckSlides.length;

            for (let idx = 0; idx < totalSlides; idx += 1) {
                const slide = deckSlides[idx];
                setCarouselVisualProgress(`Generating prompt ${idx + 1}/${totalSlides}...`);
                const { prompt } = await generateImagePrompt(
                    buildSlidePromptInput(storyContext, idx, totalSlides, slide.label, slide.text)
                );
                nextPrompts.push(ensureHumanSafeConstraint(prompt));
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
        const prompt = ensureHumanSafeConstraint((carouselImagePrompts[idx] || '').trim());
        if (!prompt) return;

        setGeneratingCarouselImageIdx(idx);
        try {
            const aspect = idx === 0 ? 'portrait_9_16' : 'square_1_1';
            const { image_url } = await generateImage(prompt, visualStyle, aspect);
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

    const handleUploadCarouselImage = async (idx: number, file: File | null) => {
        if (!file) return;
        setUploadingCarouselImageIdx(idx);
        try {
            const uploaded = await uploadSceneAsset(file);
            if (uploaded.asset_source !== 'user_image') {
                throw new Error('Please upload an image file for this slide.');
            }
            const resolved = resolveAssetUrl(uploaded.asset_url);
            setCarouselImageUrls(prev => {
                const next = [...prev];
                while (next.length <= idx) next.push('');
                next[idx] = resolved;
                return next;
            });
        } catch (err: any) {
            setError(err?.message || 'Failed to upload slide image.');
        } finally {
            setUploadingCarouselImageIdx(null);
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

    const slugifyFilePart = (value: string) => value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);

    const handleCopy = () => {
        if (!slideData) return;
        navigator.clipboard.writeText(buildCaptionText());
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleIngestFactCheckVideo = async () => {
        if (!factCheckUrl.trim()) return;
        setIngestingFactCheckVideo(true);
        setFactCheckError(null);
        setFactCheckVideo(null);
        setFactCheckClaims([]);
        setSelectedFactCheckClaimId(null);
        setFactCheckAnalysis(null);
        setFactCheckStitchPreview(null);
        setExpandedFactCheckPapers({});
        setFactCheckCaptionDraft('');
        setFactCheckCaptionCopied(false);
        setFactCheckQueryDraft('');
        setFactCheckStartWordIndex(null);
        setFactCheckEndWordIndex(null);
        setFactCheckOverlayText('STITCH INCOMING');
        setFactCheckLookDevQuestion('IS THIS CLAIM ACTUALLY TRUE?');
        setFactCheckLookDevRating(0);
        setFactCheckLookDevTrustLabel('MOSTLY SUPPORTED');
        setFactCheckLookDevVerdict('');
        setFactCheckLookDevRationale('');
        setFactCheckLookDevSupportCount(5);
        setFactCheckLookDevMixedCount(3);
        setFactCheckLookDevRefuteCount(0);
        setFactCheckLookDevDuration(9);
        setFactCheckLookDevUseSourceBackground(true);
        setFactCheckLookDevPreview(null);
        try {
            const result = await ingestYoutubeForFactCheck(factCheckUrl.trim());
            setFactCheckVideo(result);
            const claimsResult = await extractFactCheckClaims(result.job_id);
            setFactCheckClaims(claimsResult.claims || []);
            if (claimsResult.claims?.length) {
                setSelectedFactCheckClaimId(claimsResult.claims[0].claim_id);
            }
        } catch (err: any) {
            setFactCheckError(err.message || 'Failed to ingest YouTube video and extract claims.');
        } finally {
            setIngestingFactCheckVideo(false);
        }
    };

    const handleAnalyzeSelectedFactCheckClaim = async () => {
        if (!factCheckVideo?.job_id || !selectedFactCheckClaimId) return;
        setAnalyzingFactCheckClaim(true);
        setFactCheckError(null);
        setFactCheckAnalysis(null);
        setExpandedFactCheckPapers({});
        setFactCheckCaptionDraft('');
        setFactCheckCaptionCopied(false);
        try {
            const analysisClaimText = factCheckAnalysisClaimDraft.replace(/\s+/g, ' ').trim();
            if (!analysisClaimText) {
                throw new Error('Add the analysis claim you want checked before running the fact check.');
            }
            const queries = factCheckQueryDraft
                .split('\n')
                .map((query) => query.trim())
                .filter(Boolean);
            const result = await analyzeFactCheckClaim(factCheckVideo.job_id, selectedFactCheckClaimId, queries, analysisClaimText);
            setFactCheckAnalysis(result);
            setFactCheckCaptionCopied(false);
            const initialExpanded: Record<string, boolean> = {};
            result.papers.slice(0, 3).forEach((paper, idx) => {
                initialExpanded[`${paper.openalex_id || paper.title}-${idx}`] = idx === 0;
            });
            setExpandedFactCheckPapers(initialExpanded);
        } catch (err: any) {
            setFactCheckError(err.message || 'Failed to analyze textbox claim.');
        } finally {
            setAnalyzingFactCheckClaim(false);
        }
    };

    const handleRenderFactCheckLookDev = async () => {
        const question = factCheckLookDevQuestion.trim();
        if (!question) {
            setFactCheckError('Add the short claim question first so we can render the Remotion look dev.');
            return;
        }
        const normalizedRationale = normalizeLookDevRationale(factCheckLookDevRationale.trim());
        setRenderingFactCheckLookDev(true);
        setFactCheckError(null);
        setFactCheckLookDevPreview(null);
        setFactCheckLookDevRationale(normalizedRationale);
        try {
            const result = await renderFactCheckStitchLookDev({
                jobId: factCheckVideo?.job_id ?? null,
                question,
                rating: factCheckLookDevRating,
                trustLabel: factCheckLookDevTrustLabel.trim() || 'MIXED EVIDENCE',
                verdict: factCheckLookDevVerdict.trim(),
                rationale: normalizedRationale,
                supportCount: factCheckLookDevSupportCount,
                refuteCount: factCheckLookDevRefuteCount,
                mixedCount: factCheckLookDevMixedCount,
                selectedStartTimeSeconds: selectedFactCheckClipStartSeconds,
                selectedEndTimeSeconds: selectedFactCheckClipEndSeconds,
                durationSeconds: factCheckLookDevDuration,
                useSourceBackground: factCheckLookDevUseSourceBackground,
            });
            setFactCheckLookDevPreview(result);
        } catch (err: any) {
            setFactCheckError(err.message || 'Failed to render Remotion stitch look dev.');
        } finally {
            setRenderingFactCheckLookDev(false);
        }
    };

    const handleGenerateFactCheckStitchPreview = async () => {
        if (!factCheckVideo?.job_id || !selectedFactCheckClaimId) return;
        if (!factCheckAnalysisMatchesSelection || !factCheckAnalysis) {
            setFactCheckError('Run claim analysis for the currently selected claim before generating the stitch preview.');
            return;
        }
        const selectedStart = selectedFactCheckClipStartSeconds;
        const selectedEnd = selectedFactCheckClipEndSeconds;
        if (!selectedStartWord || !selectedEndWord) {
            setFactCheckError('Pick both a start word and an end word.');
            return;
        }
        if (selectedEnd <= selectedStart) {
            setFactCheckError('End word must come after the start word.');
            return;
        }
        setGeneratingFactCheckStitchPreview(true);
        setFactCheckError(null);
        setFactCheckStitchPreview(null);
        try {
            const result = await generateFactCheckStitchPreview({
                jobId: factCheckVideo.job_id,
                claimId: selectedFactCheckClaimId,
                selectedStartTimeSeconds: selectedStart,
                selectedEndTimeSeconds: selectedEnd,
                overlayText: factCheckOverlayText.trim() || 'STITCH INCOMING',
                overallRating: factCheckAnalysis.overall_rating,
                trustLabel: factCheckAnalysis.trust_label,
                verdictSummary: factCheckAnalysis.verdict_summary,
                thirtySecondSummary: factCheckAnalysis.thirty_second_summary,
                supportCount: factCheckAnalysis.support_count,
                refuteCount: factCheckAnalysis.refute_count,
                mixedCount: factCheckAnalysis.mixed_count,
            });
            setFactCheckStitchPreview(result);
        } catch (err: any) {
            setFactCheckError(err.message || 'Failed to generate stitch preview.');
        } finally {
            setGeneratingFactCheckStitchPreview(false);
        }
    };

    const toggleFactCheckPaper = (paperKey: string) => {
        setExpandedFactCheckPapers((prev) => ({
            ...prev,
            [paperKey]: !prev[paperKey],
        }));
    };

    const handleGenerateReel = async (renderer: ReelRenderer) => {
        if ((!selectedPaperId && !episode && activeTab !== 'custom') || (isCustomTab ? !reelScript.trim() : !reelHeadline.trim())) return;

        const setLoading = renderer === 'premium' ? setGeneratingPremiumReel : setGeneratingReel;
        setLoading(true);
        setReelError(null);
        setReelUrl(null);
        setReelRenderer(null);

        try {
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
                renderer,
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
                renderer === 'premium' && sfxTimeline.length > 0 ? sfxTimeline : undefined,
                includeWaveform
            );
            setReelUrl(result.video_url);
            setReelRenderer(result.renderer);
        } catch (err: any) {
            setReelError(err.message || 'Failed to generate reel');
        } finally {
            setLoading(false);
        }
    };

    const handleDownloadAll = async () => {
        if (!slideRefs.current.length || (!slideData && activeTab !== 'custom')) return;
        setDownloading(true);

        try {
            const files: File[] = [];
            const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
            const expectedSlideCount = renderedTakeaways.length + 3;
            const exportScale = DOWNLOAD_QUALITY_OPTIONS[downloadQuality].scale;
            slideRefs.current = slideRefs.current.slice(0, expectedSlideCount);

            for (let i = 0; i < expectedSlideCount; i++) {
                const slideElement = slideRefs.current[i];
                if (!slideElement) continue;
                const isPortraitCoverSlide = i === 0;
                const exportWidth = isPortraitCoverSlide ? 1080 : 1080;
                const exportHeight = isPortraitCoverSlide ? 1920 : 1080;

                const cloneContainer = document.createElement('div');
                Object.assign(cloneContainer.style, {
                    position: 'fixed',
                    top: '0',
                    left: '-2000px', // Off-screen instead of opacity
                    width: `${exportWidth}px`,
                    height: `${exportHeight}px`,
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
                    scale: exportScale,
                    useCORS: true,
                    allowTaint: true,
                    backgroundColor: '#0a0a0f', // Explicitly dark instead of relying on CSS inheritance
                    logging: false,
                    width: exportWidth,
                    height: exportHeight,
                    windowWidth: exportWidth,
                    windowHeight: exportHeight
                });

                document.body.removeChild(cloneContainer);

                const customTopicSlug = slugifyFilePart(
                    editedHeadline.trim() ||
                    slideTitle.trim() ||
                    customCategory.trim() ||
                    'custom-topic'
                );
                const filePrefix = slideData?.paper_id
                    ? `paper-${slideData.paper_id}`
                    : customTopicSlug;
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
                {(['latest', 'top-papers', 'top-scientists', 'daily-science', 'custom', 'social-fact-checker', 'video-text-fx'] as const).map(tab => (
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
                            if (tab === 'custom') {
                                const savedDraft = loadSavedCustomDraft();
                                if (savedDraft) {
                                    applyCustomDraft(savedDraft);
                                }
                            }
                            setCarouselVisualProgress('');
                            setRegeneratingCarouselPromptIdx(null);
                            setGeneratingCarouselImageIdx(null);
                            setError(null);
                        }}
                    >
                        {tab === 'latest' ? 'Latest Research' : tab === 'top-papers' ? 'Top Papers' : tab === 'top-scientists' ? 'Top Scientists' : tab === 'daily-science' ? 'Daily Science' : tab === 'custom' ? 'Custom' : tab === 'social-fact-checker' ? 'Social Fact Checker' : 'Video Text FX'}
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
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                                    Draft autosaves in this browser and restores after reloads or accidental tab switches.
                                </p>
                                <button
                                    type="button"
                                    className={styles.engineButtonSecondary}
                                    onClick={clearSavedCustomDraft}
                                    style={{ padding: '0.45rem 0.75rem' }}
                                >
                                    Clear saved draft
                                </button>
                            </div>
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
                                <label>Slide 1 — Cover Title</label>
                                <input
                                    type="text"
                                    className={styles.engineInput}
                                    placeholder="Cover title for the first slide. Use `backticks` to highlight words."
                                    value={editedCoverTitle}
                                    onChange={(e) => setEditedCoverTitle(e.target.value)}
                                    style={{ width: '100%' }}
                                />
                            </div>
                            <div className={styles.filterGroup} style={{ width: '100%' }}>
                                <label>Slide 1 — Footer CTA</label>
                                <input
                                    type="text"
                                    className={styles.engineInput}
                                    placeholder="Footer CTA for slide 1. Use `backticks` to highlight words."
                                    value={editedCoverCta}
                                    onChange={(e) => setEditedCoverCta(e.target.value)}
                                    style={{ width: '100%' }}
                                />
                            </div>
                            <div className={styles.filterGroup} style={{ width: '100%' }}>
                                <label>Slide 2 — Headline</label>
                                <input
                                    type="text"
                                    className={styles.engineInput}
                                    placeholder="Second slide headline. Use `backticks` to highlight words."
                                    value={editedHeadline}
                                    onChange={(e) => setEditedHeadline(e.target.value)}
                                    style={{ width: '100%' }}
                                />
                            </div>
                            {editedTakeaways.map((slideText, idx) => (
                                <div className={styles.filterGroup} style={{ width: '100%' }} key={`custom-input-slide-${idx}`}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.45rem' }}>
                                        <label style={{ margin: 0 }}>Slide {idx + 3}</label>
                                        {editedTakeaways.length > 1 && (
                                            <button
                                                type="button"
                                                className={styles.engineButtonSecondary}
                                                onClick={() => {
                                                    setEditedTakeaways(prev => prev.filter((_, takeIdx) => takeIdx !== idx));
                                                    setCarouselImagePrompts(prev => prev.filter((_, imageIdx) => imageIdx !== idx + 2));
                                                    setCarouselImageUrls(prev => prev.filter((_, imageIdx) => imageIdx !== idx + 2));
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
                                        placeholder={`Text for slide ${idx + 3}...`}
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
                                        <Sparkles size={18} /> AI Slide Visual Set
                                    </h3>
                                    <button
                                        className={styles.engineButtonSmall}
                                        onClick={handleGenerateCarouselPrompts}
                                        disabled={generatingCarouselVisuals || !editedHeadline.trim()}
                                    >
                                        {generatingCarouselVisuals ? <Loader2 size={14} className={styles.spinAnimation} /> : <FileText size={14} />}
                                        {carouselImagePrompts.length > 0 ? `Regenerate ${customDeckSlides.length} Prompts` : `Generate ${customDeckSlides.length} Prompts`}
                                    </button>
                                </div>
                                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                                            Image style preset
                                        </label>
                                        <select
                                            value={visualStyle}
                                            onChange={e => setVisualStyle(e.target.value)}
                                            title="Visual style applied to generated custom carousel images"
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
                                                    <option value="cinematic_moody">🎬 Cinematic Moody</option>
                                                    <option value="cold_scifi">🔬 Cold Sci-Fi</option>
                                                    <option value="raw_documentary">📹 Raw Documentary</option>
                                                    <option value="vintage_sepia">🕰 Vintage Sepia</option>
                                                </>
                                            )}
                                        </select>
                                    </div>
                                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', maxWidth: '440px', lineHeight: 1.5 }}>
                                        For a bigger premium look, try `Cinematic Moody` for glossy editorial frames or `Cold Sci-Fi` for high-end lab and future-tech visuals.
                                    </div>
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
                                                    <label style={{ fontSize: '0.75rem', opacity: 0.8, fontWeight: 600, margin: 0 }}>
                                                        {idx === 0 ? 'Slide 1 prompt (reel cover, 9:16)' : `Slide ${idx + 1} prompt`}
                                                    </label>
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
                                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.65rem' }}>
                                                    <label
                                                        className={styles.engineButtonSmall}
                                                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', cursor: uploadingCarouselImageIdx === idx ? 'wait' : 'pointer' }}
                                                    >
                                                        {uploadingCarouselImageIdx === idx ? <Loader2 size={12} className={styles.spinAnimation} /> : <Plus size={12} />}
                                                        {carouselImageUrls[idx] ? 'Replace with uploaded image' : 'Upload your own image'}
                                                        <input
                                                            type="file"
                                                            accept="image/*"
                                                            style={{ display: 'none' }}
                                                            disabled={uploadingCarouselImageIdx === idx}
                                                            onChange={(e) => {
                                                                const file = e.target.files?.[0] || null;
                                                                void handleUploadCarouselImage(idx, file);
                                                                e.currentTarget.value = '';
                                                            }}
                                                        />
                                                    </label>
                                                </div>
                                                <p style={{ margin: '0.5rem 0 0', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                                                    Uploading your own image will use it directly as the slide background, with the slide text overlaid on top.
                                                </p>
                                                {carouselImageUrls[idx] && (
                                                    <div style={{ marginTop: '0.6rem', borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(100, 255, 218, 0.24)', maxWidth: idx === 0 ? '180px' : '220px' }}>
                                                        <img
                                                            src={carouselImageUrls[idx]}
                                                            alt={`Slide ${idx + 1} visual`}
                                                            style={{ width: '100%', aspectRatio: idx === 0 ? '9 / 16' : '1 / 1', objectFit: 'cover', display: 'block' }}
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
                                    const slideCount = takeaways.length + 3;
                                    const appliedImageUrls = carouselImageUrls.slice(0, slideCount).filter(Boolean);
                                    const normalizedSlideTitles = takeaways.map((_, idx) => editedTakeawayTitles[idx] || '').concat(editedOutroTitle || '');
                                    setEditedTakeaways(takeaways);
                                    setSlideData({
                                        paper_id: 0,
                                        category: customCategory || 'SCIENCE',
                                        headline: editedHeadline.trim(),
                                        takeaways: takeaways,
                                        slideTitles: normalizedSlideTitles,
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
                                        {[(editedCoverCta || 'Check Caption').trim(), slideData.headline, ...slideData.takeaways, `${editedOutro}\n${editedOutroFollow}`.trim()].map((text, idx) => {
                                            const optionalTitle = idx === 0
                                                ? (editedCoverTitle.trim() || editedHeadline.trim())
                                                : idx === 1
                                                    ? ''
                                                    : idx <= slideData.takeaways.length + 1
                                                        ? (editedTakeawayTitles[idx - 2] || '').trim()
                                                    : editedOutroTitle.trim();
                                            return (
                                                <div key={idx} style={{ border: '1px solid var(--border)', borderRadius: '10px', background: 'var(--bg-secondary)', padding: '1rem', minHeight: '180px', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.04em' }}>
                                                        {idx <= slideData.takeaways.length + 1 ? `SLIDE ${idx + 1}` : 'FINAL CTA'}
                                                    </div>
                                                    {optionalTitle && (
                                                        <div style={{ fontSize: '1rem', fontWeight: 800, lineHeight: 1.2, color: 'var(--text-primary)' }}>
                                                            {optionalTitle}
                                                        </div>
                                                    )}
                                                    <div style={{ fontSize: idx <= 1 ? '1.15rem' : '0.95rem', fontWeight: idx <= 1 ? 700 : 500, lineHeight: 1.45, color: 'var(--text-primary)' }}>
                                                        {text}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'video-text-fx' && (
                <div style={{
                    padding: '1.5rem',
                    background: 'var(--bg-secondary)',
                    borderRadius: '16px',
                    border: '1px solid var(--border)',
                    marginBottom: '2rem',
                    display: 'grid',
                    gap: '1.25rem',
                }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700 }}>Uploaded Video Text FX</h2>
                        <p style={{ margin: '0.5rem 0 0', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                            Reverse-engineer a reusable talking-head overlay format for your own uploads. This new tab starts with a single style preset named `ali abdal`, then expands into multiple styles later.
                        </p>
                    </div>

                    <div className={styles.engineFilters}>
                        <div className={styles.filterGroup} style={{ minWidth: '220px' }}>
                            <label>Style</label>
                            <select
                                className={styles.engineInput}
                                value={videoTextFxStyle}
                                onChange={(e) => setVideoTextFxStyle(e.target.value as VideoTextFxStyle)}
                            >
                                {VIDEO_TEXT_STYLE_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                            </select>
                        </div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', lineHeight: 1.55, maxWidth: '560px' }}>
                            {VIDEO_TEXT_STYLE_OPTIONS.find((option) => option.value === videoTextFxStyle)?.description}
                        </div>
                    </div>

                    <div style={{ display: 'grid', gap: '1rem', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '14px', padding: '1rem' }}>
                        <div>
                            <div style={{ fontSize: '1rem', fontWeight: 700 }}>Source video</div>
                            <div style={{ marginTop: '0.3rem', color: 'var(--text-secondary)', fontSize: '0.84rem', lineHeight: 1.5 }}>
                                Upload the talking-head source clip that the new Remotion composition will eventually animate on top of.
                            </div>
                        </div>
                        <label className={styles.engineButtonSecondary} style={{ width: 'fit-content', cursor: 'pointer' }}>
                            {videoTextFxUploadingSource ? <Loader2 size={16} className={styles.spinAnimation} /> : <Film size={16} />}
                            {videoTextFxUploadingSource ? 'Uploading source...' : 'Upload source video'}
                            <input
                                type="file"
                                accept="video/*"
                                style={{ display: 'none' }}
                                onChange={(e) => {
                                    void handleUploadVideoTextFxSource(e.target.files?.[0] ?? null);
                                    e.currentTarget.value = '';
                                }}
                            />
                        </label>
                        {videoTextFxSourceAssetUrl && (
                            <div style={{ display: 'grid', gap: '0.7rem' }}>
                                <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                                    Uploaded source duration: {videoTextFxDurationSeconds > 0 ? `${videoTextFxDurationSeconds.toFixed(1)}s` : 'Unknown'}
                                </div>
                                <video
                                    src={resolveAssetUrl(videoTextFxSourceAssetUrl)}
                                    poster={resolveAssetUrl(videoTextFxSourceThumbnailUrl)}
                                    controls
                                    style={{ width: '100%', maxWidth: '320px', borderRadius: '12px', border: '1px solid var(--border)', background: '#000' }}
                                />
                            </div>
                        )}
                        {videoTextFxTranscribing && (
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                                <Loader2 size={14} className={styles.spinAnimation} style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '8px' }} />
                                Extracting transcript from the uploaded video...
                            </div>
                        )}
                        {videoTextFxUploadError && (
                            <div style={{ color: '#ff9fb2', fontSize: '0.82rem' }}>{videoTextFxUploadError}</div>
                        )}
                    </div>

                    <div style={{ display: 'grid', gap: '1rem', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '14px', padding: '1rem' }}>
                        <div>
                            <div style={{ fontSize: '1rem', fontWeight: 700 }}>Transcript to overlay plan</div>
                            <div style={{ marginTop: '0.3rem', color: 'var(--text-secondary)', fontSize: '0.84rem', lineHeight: 1.5 }}>
                                The intended flow is to pull transcript from the uploaded video automatically if speech is available, then use that text to generate larger top editorial beats plus faster lower subtitle-pill beats for the Ali Abdal format.
                            </div>
                        </div>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.65rem', color: 'var(--text-primary)', fontSize: '0.9rem', width: 'fit-content', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={videoTextFxAutoTranscribe}
                                onChange={(e) => setVideoTextFxAutoTranscribe(e.target.checked)}
                                style={{ accentColor: 'var(--accent)' }}
                            />
                            Auto-transcribe from uploaded video when available
                        </label>
                        <textarea
                            className={styles.engineInput}
                            value={videoTextFxTranscript}
                            onChange={(e) => setVideoTextFxTranscript(e.target.value)}
                            rows={10}
                            placeholder={videoTextFxAutoTranscribe ? 'Auto-transcribed text will appear here. You can still edit or replace it manually.' : 'Paste the spoken transcript here'}
                            style={{ minHeight: '220px', resize: 'vertical', lineHeight: 1.6 }}
                        />
                        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                            <button
                                type="button"
                                className={styles.engineButton}
                                onClick={handleGenerateVideoTextFxPlan}
                                disabled={!videoTextFxTranscript.trim()}
                            >
                                <Sparkles size={16} />
                                Generate overlay plan
                            </button>
                            <button
                                type="button"
                                className={styles.engineButton}
                                onClick={handleRenderVideoTextFx}
                                disabled={!videoTextFxSourceAssetUrl || !videoTextFxTranscript.trim() || videoTextFxRendering || videoTextFxTranscribing}
                            >
                                {videoTextFxRendering ? <Loader2 size={16} className={styles.spinAnimation} /> : <Film size={16} />}
                                {videoTextFxRendering ? 'Rendering final video...' : 'Render final video'}
                            </button>
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: 1.5 }}>
                                Upload now triggers transcription automatically when the checkbox is on. You can still edit the transcript and regenerate the timing map before rendering the final Remotion output.
                            </div>
                        </div>
                    </div>

                    {videoTextFxPlan.length > 0 && (
                        <div style={{ display: 'grid', gap: '1rem', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '14px', padding: '1rem' }}>
                            <div>
                                <div style={{ fontSize: '1rem', fontWeight: 700 }}>Generated timing map</div>
                                <div style={{ marginTop: '0.3rem', color: 'var(--text-secondary)', fontSize: '0.84rem', lineHeight: 1.5 }}>
                                    This plan separates the larger top-layer editorial overlays from the tighter lower subtitle cadence so we can feed the same structure into a future Remotion composition.
                                </div>
                            </div>
                            <div style={{ display: 'grid', gap: '0.75rem' }}>
                                {videoTextFxPlan.map((beat) => (
                                    <div key={beat.id} style={{ border: '1px solid var(--border)', borderRadius: '12px', padding: '0.9rem 1rem', background: 'rgba(255,255,255,0.03)', display: 'grid', gap: '0.45rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                                <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)' }}>
                                                    {beat.layer === 'headline_top' ? 'Top Headline' : 'Bottom Subtitle'}
                                                </span>
                                                <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: beat.style === 'numeric_emphasis' ? '#ff8ca8' : 'var(--accent)' }}>
                                                    {beat.style.replace(/_/g, ' ')}
                                                </span>
                                            </div>
                                            <span style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                                                {beat.startTimeSeconds.toFixed(2)}s - {beat.endTimeSeconds.toFixed(2)}s
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '0.95rem', lineHeight: 1.55 }}>{beat.text}</div>
                                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: 1.45 }}>{beat.notes}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {videoTextFxPreviewUrl && (
                        <div style={{ display: 'grid', gap: '1rem', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '14px', padding: '1rem' }}>
                            <div>
                                <div style={{ fontSize: '1rem', fontWeight: 700 }}>Final preview</div>
                                <div style={{ marginTop: '0.3rem', color: 'var(--text-secondary)', fontSize: '0.84rem', lineHeight: 1.5 }}>
                                    This is the first full uploaded-video Remotion render for the `ali abdal` style preset.
                                </div>
                            </div>
                            <video
                                src={resolveAssetUrl(videoTextFxPreviewUrl)}
                                controls
                                style={{ width: '100%', maxWidth: '320px', borderRadius: '12px', border: '1px solid var(--border)', background: '#000' }}
                            />
                            <a
                                href={resolveAssetUrl(videoTextFxPreviewUrl)}
                                target="_blank"
                                rel="noreferrer"
                                style={{ color: 'var(--accent)', textDecoration: 'none', fontSize: '0.84rem', fontWeight: 600 }}
                            >
                                Open rendered video
                            </a>
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'social-fact-checker' && (
                <div style={{
                    padding: '1.5rem',
                    background: 'var(--bg-secondary)',
                    borderRadius: '16px',
                    border: '1px solid var(--border)',
                    marginBottom: '2rem',
                    display: 'grid',
                    gap: '1.25rem',
                }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700 }}>Social Media Fact Checker</h2>
                        <p style={{ margin: '0.5rem 0 0', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                            Paste a YouTube URL and we will ingest it, transcribe it, and extract research-checkable claims automatically before you analyze one against multiple papers.
                        </p>
                    </div>

                    <div className={styles.engineFilters} style={{ alignItems: 'flex-end' }}>
                        <div className={styles.filterGroup} style={{ flex: 1, minWidth: '320px' }}>
                            <label>YouTube URL</label>
                            <input
                                type="text"
                                className={styles.engineInput}
                                placeholder="https://www.youtube.com/watch?v=..."
                                value={factCheckUrl}
                                onChange={(e) => setFactCheckUrl(e.target.value)}
                            />
                        </div>
                        <button className={styles.engineButton} onClick={handleIngestFactCheckVideo} disabled={ingestingFactCheckVideo || !factCheckUrl.trim()}>
                            {ingestingFactCheckVideo ? <Loader2 size={16} className={styles.spinAnimation} /> : <Download size={16} />}
                            Ingest Video & Extract Claims
                        </button>
                    </div>

                    {factCheckError && (
                        <div style={{ padding: '0.9rem 1rem', borderRadius: '12px', border: '1px solid rgba(255, 120, 120, 0.28)', background: 'rgba(255, 120, 120, 0.08)', color: '#ffadad' }}>
                            {factCheckError}
                        </div>
                    )}

                    {factCheckVideo && (
                        <div style={{ display: 'grid', gap: '1rem', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '14px', padding: '1rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                                <div>
                                    <div style={{ fontSize: '1rem', fontWeight: 700 }}>{factCheckVideo.title}</div>
                                    <div style={{ marginTop: '0.3rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                        {factCheckVideo.channel_name || 'Unknown channel'} • {Math.round(factCheckVideo.duration_seconds)}s
                                    </div>
                                </div>
                                <a
                                    href={resolveAssetUrl(factCheckVideo.video_url)}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{ color: 'var(--accent)', textDecoration: 'none', fontSize: '0.85rem', fontWeight: 600 }}
                                >
                                    Open local video
                                </a>
                            </div>
                            <video
                                src={resolveAssetUrl(factCheckVideo.video_url)}
                                controls
                                style={{ width: '100%', maxWidth: '320px', borderRadius: '12px', border: '1px solid var(--border)', background: '#000' }}
                            />
                            <div style={{ display: 'grid', gap: '0.45rem' }}>
                                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Transcript</div>
                                <div style={{ maxHeight: '180px', overflowY: 'auto', padding: '0.9rem', borderRadius: '12px', border: '1px solid var(--border)', background: 'rgba(255,255,255,0.03)', color: 'var(--text-secondary)', fontSize: '0.84rem', lineHeight: 1.6 }}>
                                    {factCheckVideo.transcript || 'No transcript extracted.'}
                                </div>
                            </div>
                        </div>
                    )}

                    {factCheckClaims.length > 0 && (
                        <div style={{ display: 'grid', gap: '1rem', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '14px', padding: '1rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                <div>
                                    <div style={{ fontSize: '1rem', fontWeight: 700 }}>Extracted claims</div>
                                    <div style={{ marginTop: '0.3rem', color: 'var(--text-secondary)', fontSize: '0.84rem' }}>
                                        Choose one claim, inspect the OpenAlex query set, edit it if needed, then run the paper-first fact check.
                                    </div>
                                </div>
                                <button className={styles.engineButton} onClick={handleAnalyzeSelectedFactCheckClaim} disabled={analyzingFactCheckClaim || !selectedFactCheckClaimId}>
                                    {analyzingFactCheckClaim ? <Loader2 size={16} className={styles.spinAnimation} /> : <Sparkles size={16} />}
                                    Analyze Textbox Claim
                                </button>
                            </div>
                            <div style={{ display: 'grid', gap: '0.75rem' }}>
                                {factCheckClaims.map((claim) => {
                                    const isSelected = selectedFactCheckClaimId === claim.claim_id;
                                    return (
                                        <button
                                            key={claim.claim_id}
                                            type="button"
                                            onClick={() => setSelectedFactCheckClaimId(claim.claim_id)}
                                            style={{
                                                textAlign: 'left',
                                                padding: '0.9rem 1rem',
                                                borderRadius: '12px',
                                                border: isSelected ? '1px solid rgba(100, 255, 218, 0.4)' : '1px solid var(--border)',
                                                background: isSelected ? 'rgba(100, 255, 218, 0.08)' : 'rgba(255,255,255,0.03)',
                                                color: 'var(--text-primary)',
                                                cursor: 'pointer',
                                                display: 'grid',
                                                gap: '0.4rem',
                                            }}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                                                <span style={{ fontWeight: 700 }}>{claim.claim_text}</span>
                                                <span style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                                                    {claim.start_time_seconds.toFixed(2)}s to {claim.end_time_seconds.toFixed(2)}s • {(claim.factuality_confidence * 100).toFixed(0)}%
                                                </span>
                                            </div>
                                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', lineHeight: 1.5 }}>
                                                {claim.transcript_excerpt}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                            {selectedFactCheckClaim && (
                                <div style={{ display: 'grid', gap: '1rem' }}>
                                    <div style={{ display: 'grid', gap: '0.75rem', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border)', background: 'rgba(255,255,255,0.03)' }}>
                                        <div>
                                            <div style={{ fontSize: '0.95rem', fontWeight: 700 }}>Analysis claim</div>
                                            <div style={{ marginTop: '0.3rem', color: 'var(--text-secondary)', fontSize: '0.82rem', lineHeight: 1.5 }}>
                                                Rewrite the extracted sentence into the actual research claim you want judged. This textbox value is what gets sent into paper retrieval and evidence analysis. The selected card is only used for the source clip and transcript anchor.
                                            </div>
                                        </div>
                                        <textarea
                                            className={styles.engineInput}
                                            value={factCheckAnalysisClaimDraft}
                                            onChange={(e) => setFactCheckAnalysisClaimDraft(e.target.value)}
                                            rows={4}
                                            placeholder="Example: Resveratrol supplementation provides exercise-like or calorie-restriction-like benefits in humans."
                                            style={{ minHeight: '110px', resize: 'vertical', lineHeight: 1.5 }}
                                        />
                                        <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                            <button
                                                type="button"
                                                className={styles.engineButtonSecondary}
                                                onClick={() => setFactCheckAnalysisClaimDraft(selectedFactCheckClaim.claim_text || '')}
                                            >
                                                Reset to extracted claim
                                            </button>
                                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                                                Selected transcript claim stays the same above. Only the analyzed claim text changes here.
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'grid', gap: '0.75rem', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border)', background: 'rgba(255,255,255,0.03)' }}>
                                        <div>
                                            <div style={{ fontSize: '0.95rem', fontWeight: 700 }}>Paper search queries</div>
                                            <div style={{ marginTop: '0.3rem', color: 'var(--text-secondary)', fontSize: '0.82rem', lineHeight: 1.5 }}>
                                                One query per line. These are AI-expanded suggestions for OpenAlex. Edit freely if a scientific term or synonym is missing.
                                            </div>
                                        </div>
                                        <textarea
                                            className={styles.engineInput}
                                            value={factCheckQueryDraft}
                                            onChange={(e) => setFactCheckQueryDraft(e.target.value)}
                                            rows={8}
                                            placeholder="Enter one OpenAlex search query per line"
                                            style={{ minHeight: '180px', resize: 'vertical', lineHeight: 1.5 }}
                                        />
                                        <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                            <button
                                                type="button"
                                                className={styles.engineButtonSecondary}
                                                onClick={() => setFactCheckQueryDraft((selectedFactCheckClaim.suggested_queries || []).join('\n'))}
                                            >
                                                Reset to AI queries
                                            </button>
                                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                                                {factCheckQueryDraft.split('\n').map((query) => query.trim()).filter(Boolean).length} queries queued
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'grid', gap: '0.85rem', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border)', background: 'rgba(255,255,255,0.03)' }}>
                                        <div>
                                            <div style={{ fontSize: '0.95rem', fontWeight: 700 }}>Remotion stitch look dev</div>
                                            <div style={{ marginTop: '0.3rem', color: 'var(--text-secondary)', fontSize: '0.82rem', lineHeight: 1.5 }}>
                                                Work on dummy data first and keep the stitch tail parameterized. Once the look is right, we can concat the real selected source clip into it.
                                            </div>
                                        </div>
                                        <div className={styles.engineFilters}>
                                            <div className={styles.filterGroup} style={{ flex: 1, minWidth: '260px' }}>
                                                <label>Question</label>
                                                <input
                                                    type="text"
                                                    className={styles.engineInput}
                                                    value={factCheckLookDevQuestion}
                                                    onChange={(e) => setFactCheckLookDevQuestion(e.target.value)}
                                                    placeholder="IS THIS CLAIM ACTUALLY TRUE?"
                                                />
                                            </div>
                                            <div className={styles.filterGroup} style={{ minWidth: '130px' }}>
                                                <label>Rating</label>
                                                <input
                                                    type="number"
                                                    className={styles.engineInput}
                                                    min={0}
                                                    max={5}
                                                    step={0.1}
                                                    value={factCheckLookDevRating}
                                                    onChange={(e) => setFactCheckLookDevRating(Math.max(0, Math.min(5, Number(e.target.value) || 0)))}
                                                />
                                            </div>
                                            <div className={styles.filterGroup} style={{ minWidth: '160px' }}>
                                                <label>Trust Label</label>
                                                <input
                                                    type="text"
                                                    className={styles.engineInput}
                                                    value={factCheckLookDevTrustLabel}
                                                    onChange={(e) => setFactCheckLookDevTrustLabel(e.target.value)}
                                                />
                                            </div>
                                            <div className={styles.filterGroup} style={{ minWidth: '130px' }}>
                                                <label>Duration (s)</label>
                                                <input
                                                    type="number"
                                                    className={styles.engineInput}
                                                    min={4}
                                                    max={20}
                                                    step={0.5}
                                                    value={factCheckLookDevDuration}
                                                    onChange={(e) => setFactCheckLookDevDuration(Math.max(4, Math.min(20, Number(e.target.value) || 9)))}
                                                />
                                            </div>
                                        </div>
                                        <div style={{ display: 'grid', gap: '0.85rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                                            <div className={styles.filterGroup}>
                                                <label>Verdict</label>
                                                <textarea
                                                    className={styles.engineInput}
                                                    value={factCheckLookDevVerdict}
                                                    onChange={(e) => setFactCheckLookDevVerdict(e.target.value)}
                                                    rows={4}
                                                    placeholder="One sharp, high-level verdict line."
                                                    style={{ resize: 'vertical', lineHeight: 1.5 }}
                                                />
                                            </div>
                                            <div className={styles.filterGroup}>
                                                <label>Rationale</label>
                                                <textarea
                                                    className={styles.engineInput}
                                                    value={factCheckLookDevRationale}
                                                    onChange={(e) => setFactCheckLookDevRationale(e.target.value)}
                                                    onBlur={(e) => setFactCheckLookDevRationale(normalizeLookDevRationale(e.target.value))}
                                                    rows={6}
                                                    placeholder={"Bullet 1\nBullet 2\nBullet 3\nBullet 4\nBullet 5"}
                                                    style={{ resize: 'vertical', lineHeight: 1.5 }}
                                                />
                                            </div>
                                        </div>
                                        <div className={styles.engineFilters}>
                                            <div className={styles.filterGroup} style={{ minWidth: '110px' }}>
                                                <label>Support</label>
                                                <input
                                                    type="number"
                                                    className={styles.engineInput}
                                                    min={0}
                                                    step={1}
                                                    value={factCheckLookDevSupportCount}
                                                    onChange={(e) => setFactCheckLookDevSupportCount(Math.max(0, Number(e.target.value) || 0))}
                                                />
                                            </div>
                                            <div className={styles.filterGroup} style={{ minWidth: '110px' }}>
                                                <label>Mixed</label>
                                                <input
                                                    type="number"
                                                    className={styles.engineInput}
                                                    min={0}
                                                    step={1}
                                                    value={factCheckLookDevMixedCount}
                                                    onChange={(e) => setFactCheckLookDevMixedCount(Math.max(0, Number(e.target.value) || 0))}
                                                />
                                            </div>
                                            <div className={styles.filterGroup} style={{ minWidth: '110px' }}>
                                                <label>Refute</label>
                                                <input
                                                    type="number"
                                                    className={styles.engineInput}
                                                    min={0}
                                                    step={1}
                                                    value={factCheckLookDevRefuteCount}
                                                    onChange={(e) => setFactCheckLookDevRefuteCount(Math.max(0, Number(e.target.value) || 0))}
                                                />
                                            </div>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: 'var(--text-secondary)', fontSize: '0.82rem', marginTop: '1.55rem' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={factCheckLookDevUseSourceBackground}
                                                    onChange={(e) => setFactCheckLookDevUseSourceBackground(e.target.checked)}
                                                />
                                                Use source video as blurred background
                                            </label>
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                            <button
                                                type="button"
                                                className={styles.engineButtonSecondary}
                                                onClick={() => {
                                                    if (!selectedFactCheckClaim && !factCheckAnalysis) return;
                                                    if (factCheckAnalysis?.look_dev_question?.trim()) {
                                                        setFactCheckLookDevQuestion(factCheckAnalysis.look_dev_question.trim());
                                                    }
                                                    if (factCheckAnalysis) {
                                                        setFactCheckLookDevRating(Number(factCheckAnalysis.overall_rating.toFixed(1)));
                                                        setFactCheckLookDevTrustLabel(factCheckAnalysis.trust_label || 'MIXED EVIDENCE');
                                                        setFactCheckLookDevVerdict(factCheckAnalysis.verdict_summary || '');
                                                        setFactCheckLookDevRationale(buildLookDevBullets(factCheckAnalysis));
                                                        setFactCheckLookDevSupportCount(factCheckAnalysis.support_count || 0);
                                                        setFactCheckLookDevMixedCount(factCheckAnalysis.mixed_count || 0);
                                                        setFactCheckLookDevRefuteCount(factCheckAnalysis.refute_count || 0);
                                                    }
                                                }}
                                                disabled={!selectedFactCheckClaim}
                                            >
                                                Reset from current claim
                                            </button>
                                            <button
                                                type="button"
                                                className={styles.engineButtonSecondary}
                                                onClick={handleRenderFactCheckLookDev}
                                                disabled={renderingFactCheckLookDev || !selectedFactCheckClaim}
                                            >
                                                {renderingFactCheckLookDev ? <Loader2 size={16} className={styles.spinAnimation} /> : <Film size={16} />}
                                                Render Remotion Look Dev
                                            </button>
                                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                                                This render is separate from the real source clip. We are only refining the stitch tail look here.
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'grid', gap: '0.85rem', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border)', background: 'rgba(255,255,255,0.03)' }}>
                                        <div>
                                            <div style={{ fontSize: '0.95rem', fontWeight: 700 }}>Source clip selector for later concat</div>
                                            <div style={{ marginTop: '0.3rem', color: 'var(--text-secondary)', fontSize: '0.82rem', lineHeight: 1.5 }}>
                                                Keep choosing the exact source words here. We will reuse this later when we stitch the real clip to the approved Remotion tail.
                                            </div>
                                        </div>
                                        <div className={styles.engineFilters}>
                                            <div className={styles.filterGroup} style={{ minWidth: '140px' }}>
                                                <label>Start Word</label>
                                                <select
                                                    className={styles.engineSelect}
                                                    value={factCheckStartWordIndex ?? ''}
                                                    onChange={(e) => {
                                                        const nextIndex = Number.parseInt(e.target.value, 10);
                                                        if (!Number.isFinite(nextIndex)) {
                                                            setFactCheckStartWordIndex(null);
                                                            return;
                                                        }
                                                        setFactCheckStartWordIndex(nextIndex);
                                                        if (factCheckEndWordIndex != null && nextIndex > factCheckEndWordIndex) {
                                                            setFactCheckEndWordIndex(nextIndex);
                                                        }
                                                    }}
                                                >
                                                    <option value="">Select start word</option>
                                                    {factCheckWords.map((word, idx) => (
                                                        <option key={`fact-start-${idx}`} value={idx}>
                                                            {idx + 1}. {word.word} ({word.start.toFixed(2)}s)
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className={styles.filterGroup} style={{ minWidth: '140px' }}>
                                                <label>End Word</label>
                                                <select
                                                    className={styles.engineSelect}
                                                    value={factCheckEndWordIndex ?? ''}
                                                    onChange={(e) => {
                                                        const nextIndex = Number.parseInt(e.target.value, 10);
                                                        if (!Number.isFinite(nextIndex)) {
                                                            setFactCheckEndWordIndex(null);
                                                            return;
                                                        }
                                                        setFactCheckEndWordIndex(nextIndex);
                                                        if (factCheckStartWordIndex != null && nextIndex < factCheckStartWordIndex) {
                                                            setFactCheckStartWordIndex(nextIndex);
                                                        }
                                                    }}
                                                >
                                                    <option value="">Select end word</option>
                                                    {factCheckWords.map((word, idx) => (
                                                        <option key={`fact-end-${idx}`} value={idx}>
                                                            {idx + 1}. {word.word} ({word.end.toFixed(2)}s)
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                                            Selected source range: {selectedFactCheckClipStartSeconds.toFixed(2)}s to {selectedFactCheckClipEndSeconds.toFixed(2)}s
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {factCheckLookDevPreview && (
                        <div style={{ display: 'grid', gap: '1rem', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '14px', padding: '1rem' }}>
                            <div>
                                <div style={{ fontSize: '1rem', fontWeight: 700 }}>Remotion stitch look dev preview</div>
                                <div style={{ marginTop: '0.3rem', color: 'var(--text-secondary)', fontSize: '0.84rem' }}>
                                    Duration: {factCheckLookDevPreview.duration_seconds.toFixed(1)}s • background {factCheckLookDevPreview.source_background_used ? 'uses source video' : 'uses gradient fallback'}
                                </div>
                            </div>
                            <video
                                src={resolveAssetUrl(factCheckLookDevPreview.preview_url)}
                                controls
                                style={{ width: '100%', maxWidth: '320px', borderRadius: '12px', border: '1px solid var(--border)', background: '#000' }}
                            />
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', lineHeight: 1.5 }}>
                                This is the isolated stitch tail look-dev render. Once the visual language is right, we can attach the selected source clip to it.
                            </div>
                            <a
                                href={resolveAssetUrl(factCheckLookDevPreview.preview_url)}
                                target="_blank"
                                rel="noreferrer"
                                style={{ color: 'var(--accent)', textDecoration: 'none', fontSize: '0.84rem', fontWeight: 600 }}
                            >
                                Open local Remotion preview
                            </a>
                        </div>
                    )}

                    {factCheckAnalysis && (
                        <div style={{ display: 'grid', gap: '1rem', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '14px', padding: '1rem' }}>
                            <div>
                                <div style={{ fontSize: '1rem', fontWeight: 700 }}>Claim verdict</div>
                                <div style={{ marginTop: '0.3rem', color: 'var(--text-secondary)', fontSize: '0.84rem' }}>
                                    Rating: {factCheckAnalysis.overall_rating.toFixed(1)} / 5 • {factCheckAnalysis.trust_label}
                                </div>
                            </div>
                            <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
                                <div style={{ padding: '0.95rem', borderRadius: '12px', border: '1px solid var(--border)', background: 'rgba(255,255,255,0.03)', lineHeight: 1.6 }}>
                                    <div style={{ fontWeight: 700, marginBottom: '0.35rem' }}>Reviewed claim</div>
                                    <div>{factCheckAnalysis.analysis_claim_text || factCheckAnalysis.claim.claim_text}</div>
                                </div>
                                <div style={{ padding: '0.95rem', borderRadius: '12px', border: '1px solid var(--border)', background: 'rgba(255,255,255,0.03)', lineHeight: 1.6 }}>
                                    <div style={{ fontWeight: 700, marginBottom: '0.35rem' }}>Source clip excerpt</div>
                                    <div>{factCheckAnalysis.claim.claim_text}</div>
                                </div>
                            </div>
                            <video
                                src={resolveAssetUrl(factCheckAnalysis.clip_url)}
                                controls
                                style={{ width: '100%', maxWidth: '320px', borderRadius: '12px', border: '1px solid var(--border)', background: '#000' }}
                            />
                            <div style={{ padding: '0.95rem', borderRadius: '12px', border: '1px solid var(--border)', background: 'rgba(255,255,255,0.03)', lineHeight: 1.6 }}>
                                <div style={{ fontWeight: 700, marginBottom: '0.35rem' }}>Verdict</div>
                                <div>{factCheckAnalysis.verdict_summary}</div>
                            </div>
                            <div style={{ padding: '0.95rem', borderRadius: '12px', border: '1px solid var(--border)', background: 'rgba(255,255,255,0.03)', lineHeight: 1.6 }}>
                                <div style={{ fontWeight: 700, marginBottom: '0.35rem' }}>30-second summary</div>
                                <div>{factCheckAnalysis.thirty_second_summary}</div>
                            </div>
                            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', color: 'var(--text-secondary)', fontSize: '0.84rem' }}>
                                <span>Supports: {factCheckAnalysis.support_count}</span>
                                <span>Refutes: {factCheckAnalysis.refute_count}</span>
                                <span>Mixed: {factCheckAnalysis.mixed_count}</span>
                                <span>Counted papers: {factCheckAnalysis.counted_paper_count}</span>
                                <span>Tangential: {factCheckAnalysis.tangential_count}</span>
                                <span>Verified papers: {factCheckAnalysis.verified_paper_count}</span>
                                <span>AI fallback: {factCheckAnalysis.ai_fallback_used ? 'Used, but papers were OpenAlex-verified' : 'Not needed'}</span>
                            </div>
                            <div style={{ display: 'grid', gap: '0.75rem', padding: '0.95rem', borderRadius: '12px', border: '1px solid var(--border)', background: 'rgba(255,255,255,0.03)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontWeight: 700 }}>Instagram Caption Export</div>
                                        <div style={{ marginTop: '0.25rem', color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: 1.45 }}>
                                            Review and edit this first. The caption is built to stay coherent under Instagram’s caption limit.
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        className={styles.engineButtonSecondary}
                                        onClick={() => {
                                            navigator.clipboard.writeText(factCheckCaptionDraft);
                                            setFactCheckCaptionCopied(true);
                                            setTimeout(() => setFactCheckCaptionCopied(false), 2000);
                                        }}
                                        disabled={!factCheckCaptionDraft.trim()}
                                    >
                                        {factCheckCaptionCopied ? <Check size={16} /> : <Copy size={16} />}
                                        {factCheckCaptionCopied ? 'Copied' : 'Copy Caption'}
                                    </button>
                                </div>
                                <textarea
                                    className={styles.engineInput}
                                    value={factCheckCaptionDraft}
                                    onChange={(e) => setFactCheckCaptionDraft(e.target.value)}
                                    rows={12}
                                    style={{ minHeight: '240px', resize: 'vertical', lineHeight: 1.5 }}
                                />
                            </div>
                            <div style={{ display: 'grid', gap: '0.75rem', padding: '0.95rem', borderRadius: '12px', border: '1px solid var(--border)', background: 'rgba(255,255,255,0.03)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontWeight: 700 }}>Instagram First Comment Export</div>
                                        <div style={{ marginTop: '0.25rem', color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: 1.45 }}>
                                            This carries the paper list and DOI references within the comment limit.
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        className={styles.engineButtonSecondary}
                                        onClick={() => {
                                            navigator.clipboard.writeText(factCheckCommentDraft);
                                            setFactCheckCommentCopied(true);
                                            setTimeout(() => setFactCheckCommentCopied(false), 2000);
                                        }}
                                        disabled={!factCheckCommentDraft.trim()}
                                    >
                                        {factCheckCommentCopied ? <Check size={16} /> : <Copy size={16} />}
                                        {factCheckCommentCopied ? 'Copied' : 'Copy Comment'}
                                    </button>
                                </div>
                                <textarea
                                    className={styles.engineInput}
                                    value={factCheckCommentDraft}
                                    onChange={(e) => setFactCheckCommentDraft(e.target.value)}
                                    rows={12}
                                    style={{ minHeight: '240px', resize: 'vertical', lineHeight: 1.5 }}
                                />
                            </div>
                            <div style={{ display: 'grid', gap: '0.55rem', padding: '0.95rem', borderRadius: '12px', border: '1px solid var(--border)', background: 'rgba(255,255,255,0.03)' }}>
                                <div style={{ fontWeight: 700 }}>Queries used</div>
                                <div style={{ display: 'flex', gap: '0.55rem', flexWrap: 'wrap' }}>
                                    {factCheckAnalysis.queries_used.map((query, idx) => (
                                        <span
                                            key={`${query}-${idx}`}
                                            style={{
                                                padding: '0.35rem 0.6rem',
                                                borderRadius: '999px',
                                                border: '1px solid var(--border)',
                                                background: 'rgba(255,255,255,0.04)',
                                                fontSize: '0.78rem',
                                                color: 'var(--text-secondary)',
                                            }}
                                        >
                                            {query}
                                        </span>
                                    ))}
                                </div>
                            </div>
                            <div style={{ display: 'grid', gap: '0.75rem' }}>
                                {factCheckAnalysis.papers.map((paper, idx) => {
                                    const paperKey = `${paper.openalex_id || paper.title}-${idx}`;
                                    const isExpanded = !!expandedFactCheckPapers[paperKey];
                                    return (
                                        <div key={paperKey} style={{ borderRadius: '12px', border: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)', overflow: 'hidden' }}>
                                            <button
                                                type="button"
                                                onClick={() => toggleFactCheckPaper(paperKey)}
                                                style={{
                                                    width: '100%',
                                                    textAlign: 'left',
                                                    padding: '0.95rem 1rem',
                                                    border: 'none',
                                                    background: 'transparent',
                                                    color: 'inherit',
                                                    cursor: 'pointer',
                                                    display: 'grid',
                                                    gap: '0.45rem',
                                                }}
                                            >
                                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start' }}>
                                                    <div style={{ display: 'grid', gap: '0.35rem' }}>
                                                        <div style={{ fontWeight: 700 }}>{paper.title}</div>
                                                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: 1.45 }}>
                                                            {[paper.year, paper.journal, paper.authors?.slice(0, 2).join(', ')].filter(Boolean).join(' • ')}
                                                        </div>
                                                    </div>
                                                    <div style={{ display: 'grid', gap: '0.35rem', justifyItems: 'end', flexShrink: 0 }}>
                                                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                                                            {paper.stance} • {(paper.retrieval_score * 100).toFixed(0)}%
                                                        </div>
                                                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                                                            {paper.counted_in_tally ? 'counted in final tally' : 'reviewed, not counted'}
                                                        </div>
                                                        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                                    </div>
                                                </div>
                                                <div style={{ color: 'var(--text-secondary)', fontSize: '0.76rem', lineHeight: 1.4 }}>
                                                    Source: {paper.source} • Verified: {paper.verified ? `yes via ${paper.verification_source || 'OpenAlex'}` : 'no'}
                                                </div>
                                            </button>
                                            {isExpanded && (
                                                <div style={{ padding: '0 1rem 1rem', display: 'grid', gap: '0.5rem' }}>
                                                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                                                        analysis {(paper.relevance_score * 100).toFixed(0)}% • retrieval {(paper.retrieval_score * 100).toFixed(0)}% • cited by {paper.cited_by_count}
                                                    </div>
                                                    {paper.retrieval_notes?.length > 0 && (
                                                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', lineHeight: 1.45 }}>
                                                            Retrieval: {paper.retrieval_notes.join(' • ')}
                                                        </div>
                                                    )}
                                                    {paper.evidence_note && (
                                                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', lineHeight: 1.5 }}>
                                                            {paper.evidence_note}
                                                        </div>
                                                    )}
                                                    {paper.abstract && (
                                                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: 1.5 }}>
                                                            {paper.abstract}
                                                        </div>
                                                    )}
                                                    {paper.paper_url && (
                                                        <a href={paper.paper_url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none', fontSize: '0.82rem', fontWeight: 600 }}>
                                                            Open paper
                                                        </a>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
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
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                    <label htmlFor="downloadQuality" style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                                        Export quality
                                    </label>
                                    <select
                                        id="downloadQuality"
                                        value={downloadQuality}
                                        onChange={(e) => setDownloadQuality(e.target.value as DownloadQuality)}
                                        style={{
                                            padding: '0.7rem 0.9rem',
                                            borderRadius: '8px',
                                            background: 'var(--bg-primary)',
                                            border: '1px solid var(--border)',
                                            color: 'var(--text-primary)',
                                            fontSize: '0.9rem',
                                        }}
                                    >
                                        {Object.entries(DOWNLOAD_QUALITY_OPTIONS).map(([value, option]) => (
                                            <option key={value} value={value}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
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

                                {/* Slide 1: Check Caption */}
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <div className={`${styles.slideWrapper} ${styles.portraitSlideWrapper}`}>
                                        <div
                                            className={`${styles.slide} ${styles.portraitSlide}`}
                                            ref={(el) => { slideRefs.current[0] = el; }}
                                        >
                                            <div
                                                className={styles.slideBackground}
                                                style={getSlideBackgroundUrl(0) ? {
                                                    backgroundImage: `linear-gradient(to bottom, rgba(10, 10, 15, 0.14) 0%, rgba(10, 10, 15, 0.82) 72%, rgba(10, 10, 15, 0.96) 100%), url(${getSlideBackgroundUrl(0)})`,
                                                    backgroundSize: 'cover',
                                                    backgroundPosition: 'center',
                                                } : {}}
                                            ></div>
                                            <div className={`${styles.slideContent} ${styles.portraitSlideContent}`}>
                                                <div className={`${styles.slideHeader} ${styles.portraitSlideHeader}`}>
                                                    <div className={styles.brandName}>The Eureka Feed</div>
                                                </div>

                                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', paddingBottom: '160px' }}>
                                                    <div className={`${styles.hookHeadline} ${styles.portraitHookHeadline}`}>
                                                        {renderHighlightedText(editedCoverTitle.trim() || editedHeadline.trim())}
                                                    </div>
                                                </div>

                                                <div className={`${styles.slideFooter} ${styles.portraitSlideFooter}`} style={{ justifyContent: 'center' }}>
                                                    <div className={`${styles.footerSwipeLarge} ${styles.portraitFooterSwipeLarge}`}>
                                                        {renderHighlightedText(editedCoverCta || 'Check Caption')} <ArrowDown size={24} />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <textarea
                                        value={editedCoverTitle}
                                        onChange={(e) => setEditedCoverTitle(e.target.value)}
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
                                        placeholder="Edit slide 1 title..."
                                    />
                                    <input
                                        type="text"
                                        value={editedCoverCta}
                                        onChange={(e) => setEditedCoverCta(e.target.value)}
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
                                        }}
                                        placeholder="Edit slide 1 CTA..."
                                    />
                                </div>

                                {/* Slide 2: The Hook / Headline Slide */}
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <div className={styles.slideWrapper}>
                                        <div
                                            className={`${styles.slide} ${styles.hookSlide}`}
                                            ref={(el) => { slideRefs.current[1] = el; }}
                                        >
                                            <div
                                                className={styles.slideBackground}
                                                style={getSlideBackgroundUrl(1) ? {
                                                    backgroundImage: `linear-gradient(to bottom, rgba(10, 10, 15, 0.1) 0%, rgba(10, 10, 15, 0.8) 70%, rgba(10, 10, 15, 0.95) 100%), url(${getSlideBackgroundUrl(1)})`,
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
                                                        {renderHighlightedText(editedHeadline)}
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
                                            Show Category Tag on Slide 2
                                        </label>
                                    </div>
                                </div>

                                {/* Slides 3+: The Individual Takeaways */}
                                {renderedTakeaways.map((takeaway, idx) => {
                                    const selectedPaperForSlide = papers.find(p => p.id === selectedPaperId);
                                    const pubYear = activeTab === 'custom'
                                        ? (customYear.trim() || null)
                                        : (selectedPaperForSlide?.publication_date ? new Date(selectedPaperForSlide.publication_date).getFullYear() : null);
                                    return (
                                        <div style={{ display: 'flex', flexDirection: 'column' }} key={`takeaway-${idx}`}>
                                            <div className={styles.slideWrapper}>
                                                <div
                                                    className={styles.slide}
                                                    ref={(el) => { slideRefs.current[idx + 2] = el; }}
                                                >
                                                    <div
                                                        className={styles.slideBackground}
                                                        style={getSlideBackgroundUrl(idx + 2) ? {
                                                            backgroundImage: `linear-gradient(to bottom, rgba(10, 10, 15, 0.3) 0%, rgba(10, 10, 15, 0.8) 60%, rgba(10, 10, 15, 0.95) 100%), url(${getSlideBackgroundUrl(idx + 2)})`,
                                                            backgroundSize: 'cover',
                                                            backgroundPosition: 'center',
                                                        } : {}}
                                                    ></div>
                                                    <div className={styles.slideContent}>
                                                        <div className={styles.slideHeader}>
                                                            <div className={styles.brandName}>The Eureka Feed</div>
                                                        </div>

                                                        <div className={`${styles.standaloneTakeawayWrapper} ${styles.middleSlideTakeawayWrapper}`}>
                                                            {(activeTab === 'top-papers' || activeTab === 'daily-science' || activeTab === 'custom') && idx === 0 && pubYear && (
                                                                <div className={`${styles.publishedYear} ${styles.middleSlidePublishedYear}`}>
                                                                    Published in {pubYear}
                                                                </div>
                                                            )}
                                                            {activeTab === 'custom' && editedTakeawayTitles[idx]?.trim() && (
                                                                <div className={`${styles.customSlideTitle} ${styles.middleSlideTitle}`}>
                                                                    {renderHighlightedText(editedTakeawayTitles[idx].trim())}
                                                                </div>
                                                            )}
                                                            <div className={`${styles.standaloneTakeawayText} ${styles.middleSlideTakeawayText}`}>
                                                                {renderHighlightedText(takeaway)}
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
                                                placeholder={`Edit slide ${idx + 3} text...`}
                                            />
                                            <input
                                                type="text"
                                                value={editedTakeawayTitles[idx] || ''}
                                                onChange={(e) => {
                                                    const updated = [...editedTakeawayTitles];
                                                    updated[idx] = e.target.value;
                                                    setEditedTakeawayTitles(updated);
                                                }}
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
                                                }}
                                                placeholder={`Optional title for slide ${idx + 3}`}
                                            />
                                        </div>
                                    );
                                })}

                                {/* Final Slide: Static CTA */}
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <div className={styles.slideWrapper}>
                                        <div
                                            className={styles.slide}
                                            ref={(el) => { slideRefs.current[renderedTakeaways.length + 2] = el; }}
                                        >
                                            <div
                                                className={styles.slideBackground}
                                                style={getSlideBackgroundUrl(renderedTakeaways.length + 2) ? {
                                                    backgroundImage: `linear-gradient(to bottom, rgba(10, 10, 15, 0.1) 0%, rgba(10, 10, 15, 0.8) 70%, rgba(10, 10, 15, 0.95) 100%), url(${getSlideBackgroundUrl(renderedTakeaways.length + 2)})`,
                                                    backgroundSize: 'cover',
                                                    backgroundPosition: 'center',
                                                } : {}}
                                            ></div>
                                            <div className={styles.slideContent}>
                                                <div className={styles.slideHeader}>
                                                    <div className={styles.brandName}>The Eureka Feed</div>
                                                </div>

                                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', paddingBottom: '28px', textAlign: 'center', gap: '24px' }}>
                                                    {editedOutroTitle.trim() && (
                                                        <div className={styles.customCtaTitle}>
                                                            {renderHighlightedText(editedOutroTitle.trim())}
                                                        </div>
                                                    )}
                                                    <div style={{ color: '#ffffff', fontSize: '3rem', fontWeight: 700, lineHeight: 1.22 }}>
                                                        {renderHighlightedText(editedOutro)}
                                                    </div>

                                                    <div style={{ padding: '38px 42px', background: 'rgba(10, 10, 15, 0.55)', borderRadius: '24px', border: '1px solid rgba(100, 255, 218, 0.22)', display: 'grid', gap: '18px' }}>
                                                        <div style={{ color: 'rgba(255,255,255,0.94)', fontSize: '2rem', fontWeight: 700, lineHeight: 1.28 }}>
                                                            The Eureka Feed
                                                        </div>
                                                        <div style={{ color: 'rgba(255,255,255,0.82)', fontSize: '1.35rem', lineHeight: 1.45 }}>
                                                            We turn complex papers into short content backed by real research.
                                                        </div>
                                                        <div style={{ color: 'var(--accent)', fontSize: '2rem', fontWeight: 700, letterSpacing: '0.01em', lineHeight: 1.3 }}>
                                                            {renderHighlightedText(editedOutroFollow)}
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
                                    <input
                                        type="text"
                                        value={editedOutroTitle}
                                        onChange={(e) => setEditedOutroTitle(e.target.value)}
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
                                        }}
                                        placeholder="Optional title for final CTA slide"
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
                                                    <div style={{ display: 'grid', gap: '0.75rem', justifyItems: 'start' }}>
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
                                                                    const { audio_url, timeline, duration, word_timestamps, rewritten_script, display_script } = await compileAudioTimeline({
                                                                        script: audioSourceMode === 'tts' ? reelScript : undefined,
                                                                        voice: reelVoice,
                                                                        voiceProvider: ttsProvider,
                                                                        speed: reelSpeed,
                                                                        elevenlabsStability,
                                                                        elevenlabsSimilarityBoost,
                                                                        elevenlabsStyle,
                                                                        audioFile: audioSourceMode === 'upload' ? uploadedAudioFile : null,
                                                                        transcriptText: uploadedTranscript,
                                                                        splitScenesBySentence,
                                                                    });
                                                                    setReelScript(display_script || rewritten_script);
                                                                    setAnchorWords(timeline);
                                                                    setAnchorTimeline([]);
                                                                    setSfxTimeline([]);
                                                                    setSceneTimeline([]);
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
                                                            {extractingTimeline ? 'Compiling Audio...' : audioSourceMode === 'tts' ? 'Compile Voice Audio' : 'Transcribe Upload Audio'}
                                                        </button>
                                                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: 1.45, maxWidth: '340px' }}>
                                                            Scene cuts are no longer compiled here. Add SFX cues in Step 2 and scenes will split automatically at those cue times.
                                                        </div>
                                                    </div>
                                                </div>
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

                                        {isCustomTab && audioPreviewUrl && timelineDuration > 0 && premiumSfxLibrary.length > 0 && (
                                            <div style={{ marginTop: '1.5rem', padding: '1.25rem', background: 'var(--bg-tertiary)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                                                    <div>
                                                        <h3 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                            <Volume2 size={18} style={{ color: 'var(--accent)' }} /> Step 2: Premium SFX cues
                                                        </h3>
                                                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0.45rem 0 0', maxWidth: '760px' }}>
                                                            Add or auto-place SFX first. Every cue time becomes a scene split, so moving a cue instantly retimes the scene plan.
                                                        </p>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                                                        <button
                                                            type="button"
                                                            onClick={handleAutoPlaceSfx}
                                                            disabled={autoPlacingSfx}
                                                            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 0.85rem', borderRadius: '8px', border: '1px solid rgba(255, 210, 122, 0.32)', background: 'rgba(255, 210, 122, 0.09)', color: '#ffd27a', cursor: autoPlacingSfx ? 'wait' : 'pointer', fontWeight: 600, opacity: autoPlacingSfx ? 0.7 : 1 }}
                                                        >
                                                            {autoPlacingSfx ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                                                            {sortedSfxTimeline.length > 0 ? 'Refresh AI cues' : 'AI assist cues'}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => addSfxCueAtTime(audioPreviewCurrentTime)}
                                                            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 0.85rem', borderRadius: '8px', border: '1px solid rgba(113, 203, 255, 0.45)', background: 'rgba(113, 203, 255, 0.08)', color: '#b9e4ff', cursor: 'pointer', fontWeight: 600 }}
                                                        >
                                                            <Plus size={14} />
                                                            Add cue at playhead
                                                        </button>
                                                        {sortedSfxTimeline.length > 0 && (
                                                            <button
                                                                type="button"
                                                                onClick={() => setSfxTimeline([])}
                                                                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 0.85rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}
                                                            >
                                                                <Trash2 size={14} />
                                                                Clear cues
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>

                                                {sfxAssistMessage && (
                                                    <div style={{ marginBottom: '0.9rem', padding: '0.65rem 0.8rem', borderRadius: '10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: 1.5 }}>
                                                        {sfxAssistMessage}
                                                    </div>
                                                )}

                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.85rem' }}>
                                                    <button
                                                        type="button"
                                                        onClick={toggleNarrationPreviewPlayback}
                                                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', padding: '0.5rem 0.8rem', borderRadius: '999px', border: '1px solid rgba(113, 203, 255, 0.28)', background: 'rgba(113, 203, 255, 0.08)', color: '#b9e4ff', cursor: 'pointer', fontWeight: 600 }}
                                                    >
                                                        {audioPreviewPlaying ? <Pause size={14} /> : <Play size={14} />}
                                                        {audioPreviewPlaying ? 'Pause' : 'Play'}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setNarrationPreviewTime(Math.max(0, audioPreviewCurrentTime - 1))}
                                                        style={{ padding: '0.48rem 0.7rem', borderRadius: '999px', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}
                                                    >
                                                        -1s
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setNarrationPreviewTime(Math.min(timelineDuration, audioPreviewCurrentTime + 1))}
                                                        style={{ padding: '0.48rem 0.7rem', borderRadius: '999px', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}
                                                    >
                                                        +1s
                                                    </button>
                                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                                        Local playhead: <span style={{ color: '#fff', fontWeight: 700 }}>{formatTimelineTime(audioPreviewCurrentTime)}</span> / {formatTimelineTime(timelineDuration)}
                                                    </div>
                                                </div>

                                                <div
                                                    ref={sfxTimelineTrackRef}
                                                    style={{ position: 'relative', height: '70px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)', background: 'linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))', overflow: 'hidden', cursor: 'pointer', marginBottom: '1rem' }}
                                                    onPointerDown={(event) => {
                                                        const track = event.currentTarget;
                                                        if (!track || timelineDuration <= 0) return;
                                                        const rect = track.getBoundingClientRect();
                                                        const ratio = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
                                                        const nextTime = ratio * timelineDuration;
                                                        setNarrationPreviewTime(nextTime);
                                                    }}
                                                >
                                                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(113, 203, 255, 0.08), transparent 18%, transparent 82%, rgba(255, 220, 130, 0.08))' }} />
                                                    <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${Math.min((audioPreviewCurrentTime / timelineDuration) * 100, 100)}%`, width: '2px', background: '#7fd5ff', boxShadow: '0 0 0 4px rgba(127, 213, 255, 0.15)' }} />
                                                    {sortedSfxTimeline.map((cue, idx) => (
                                                        <button
                                                            key={cue.id}
                                                            type="button"
                                                            onClick={(event) => {
                                                                event.stopPropagation();
                                                                if (suppressSfxCueClickRef.current === cue.id) {
                                                                    suppressSfxCueClickRef.current = null;
                                                                    return;
                                                                }
                                                                setNarrationPreviewTime(cue.start_time_seconds);
                                                                openSfxCueEditor(cue.id);
                                                            }}
                                                            onPointerDown={(event) => {
                                                                event.preventDefault();
                                                                event.stopPropagation();
                                                                sfxCuePointerStartRef.current = {
                                                                    cueId: cue.id,
                                                                    clientX: event.clientX,
                                                                    clientY: event.clientY,
                                                                };
                                                                setDraggingSfxCueId(cue.id);
                                                            }}
                                                            title={`${cue.sound_id} at ${cue.start_time_seconds.toFixed(2)}s`}
                                                            style={{
                                                                position: 'absolute',
                                                                top: '10px',
                                                                left: `${Math.min((cue.start_time_seconds / timelineDuration) * 100, 100)}%`,
                                                                transform: 'translateX(-50%)',
                                                                border: 'none',
                                                                background: 'transparent',
                                                                cursor: 'grab',
                                                                padding: 0,
                                                                opacity: draggingSfxCueId === cue.id ? 0.95 : 1,
                                                            }}
                                                        >
                                                            <div style={{ width: '2px', height: '34px', margin: '0 auto', background: 'rgba(255, 210, 122, 0.95)' }} />
                                                            <div style={{ marginTop: '0.35rem', padding: '0.18rem 0.45rem', borderRadius: '999px', background: idx % 2 === 0 ? 'rgba(255, 210, 122, 0.14)' : 'rgba(113, 203, 255, 0.14)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', fontSize: '0.68rem', whiteSpace: 'nowrap' }}>
                                                                {premiumSfxLibrary.find(sound => sound.sound_id === cue.sound_id)?.label || cue.sound_id}
                                                            </div>
                                                        </button>
                                                    ))}
                                                </div>

                                                {sortedSfxTimeline.length === 0 ? (
                                                    <div style={{ padding: '0.9rem 1rem', borderRadius: '10px', background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.08)', color: 'var(--text-secondary)', fontSize: '0.82rem', lineHeight: 1.55 }}>
                                                        No SFX cues yet. Add the first cue and the editor will immediately create a scene split at that exact second.
                                                    </div>
                                                ) : (
                                                    <div style={{ padding: '0.9rem 1rem', borderRadius: '10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: 'var(--text-secondary)', fontSize: '0.82rem', lineHeight: 1.55 }}>
                                                        Click any cue marker on the timeline to edit its sound, time, volume, preview it, or delete it. Drag the marker to retime it.
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {isCustomTab && sceneTimeline.length > 0 && (
                                            <div style={{ display: 'grid', gap: '1.5rem' }}>
                                                <div style={{ marginTop: '1.5rem', padding: '1.25rem', background: 'var(--bg-tertiary)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                                                        <div>
                                                            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                <Sparkles size={18} style={{ color: 'var(--accent)' }} /> Step 3: Scene Timeline
                                                            </h3>
                                                            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0.45rem 0 0' }}>
                                                                Scene timing is derived from your SFX cues. Move cues in Step 2 to retime these scene boundaries.
                                                            </p>
                                                        </div>
                                                    </div>

                                                    {timelineDuration > 0 && (
                                                        <div className={styles.transitionEditor}>
                                                            <div className={styles.transitionEditorHeader}>
                                                                <div>
                                                                    <h5 style={{ margin: 0, fontSize: '0.9rem', color: '#fff' }}>Scene Splits From SFX</h5>
                                                                    <p style={{ margin: '0.3rem 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                                                        This lane is read-only. Each split appears exactly where an SFX cue is placed on the narration timeline.
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

                                                    {audioPreviewUrl && (
                                                        <div style={{ marginTop: '0.9rem', padding: '0.9rem 1rem', background: 'rgba(6, 14, 11, 0.72)', borderRadius: '10px', border: '1px solid rgba(100, 255, 218, 0.16)' }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginBottom: '0.65rem', flexWrap: 'wrap' }}>
                                                                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                                                                    Playback for scene timing
                                                                </div>
                                                                <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', padding: '0.26rem 0.55rem', borderRadius: '999px', background: 'rgba(255,255,255,0.04)' }}>
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
                                                                onPlay={() => setAudioPreviewPlaying(true)}
                                                                onPause={() => setAudioPreviewPlaying(false)}
                                                                onEnded={() => setAudioPreviewPlaying(false)}
                                                            />
                                                        </div>
                                                    )}
                                                </div>

                                                <div style={{ padding: '1.25rem', background: 'var(--bg-tertiary)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                                                        <div>
                                                            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                <Layers size={18} style={{ color: 'var(--accent)' }} /> Step 4: Stock Picks + Manual Library
                                                            </h3>
                                                            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0.45rem 0 0' }}>
                                                                Auto-matching now uses stock images/videos only. Local library assets are manual override via the dropdown per scene.
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
                                                                {resolvingSceneCandidates ? 'Matching Stock Candidates...' : 'Fetch Stock Picks'}
                                                            </button>
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
                                                        </div>
                                                    </div>

                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '1000px', overflowY: 'auto', paddingRight: '0.5rem' }}>
                                                        {filteredScenes.map((scene, idx) => {
                                                            const sceneIndex = sceneTimeline.findIndex(item => item.scene_id === scene.scene_id);
                                                            const isLastScene = sceneIndex === sceneTimeline.length - 1;
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
                                                                            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                                                                                Move the corresponding SFX cue to retime this scene
                                                                            </div>
                                                                        </div>
                                                                        <div style={{ padding: '0.6rem', background: '#161616', borderRadius: '8px', fontSize: '0.82rem', color: '#ddd', fontStyle: 'italic' }}>
                                                                            "{scene.transcript_excerpt || scene.anchor_word}"
                                                                        </div>
                                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
                                                                            <span style={{ fontSize: '0.68rem', border: '1px solid #31443f', borderRadius: '999px', padding: '0.22rem 0.55rem', color: '#bde7db', background: 'rgba(100, 255, 218, 0.06)' }}>
                                                                                {formatSceneRole(scene.scene_role)}
                                                                            </span>
                                                                            <span style={{ fontSize: '0.68rem', border: '1px solid #363636', borderRadius: '999px', padding: '0.22rem 0.55rem', color: 'var(--text-secondary)', background: '#141414' }}>
                                                                                {formatAssetBias(scene.asset_bias)}
                                                                            </span>
                                                                            {typeof scene.planning_confidence === 'number' && (
                                                                                <span style={{ fontSize: '0.68rem', border: '1px solid #363636', borderRadius: '999px', padding: '0.22rem 0.55rem', color: 'var(--text-secondary)', background: '#141414' }}>
                                                                                    AI {(scene.planning_confidence * 100).toFixed(0)}%
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                        <div style={{ display: 'grid', gap: '0.35rem' }}>
                                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                                                                                <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                                                                    Premium transition into this scene
                                                                                </label>
                                                                                {isLastScene && (
                                                                                    <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                                                                                        Last scene keeps its exit clean
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                            <select
                                                                                value={scene.effect_transition_name || 'depth_blur_handoff'}
                                                                                onChange={(e) => {
                                                                                    const nextTransition = e.target.value;
                                                                                    setSceneTimeline(prev => prev.map(item => item.scene_id === scene.scene_id ? {
                                                                                        ...item,
                                                                                        effect_transition_name: nextTransition,
                                                                                    } : item));
                                                                                }}
                                                                                disabled={isLastScene}
                                                                                style={{
                                                                                    width: '100%',
                                                                                    padding: '0.6rem 0.75rem',
                                                                                    borderRadius: '8px',
                                                                                    border: '1px solid #333',
                                                                                    background: isLastScene ? '#171717' : '#111',
                                                                                    color: isLastScene ? '#777' : 'var(--text-primary)',
                                                                                    cursor: isLastScene ? 'not-allowed' : 'pointer',
                                                                                }}
                                                                            >
                                                                                {PREMIUM_TRANSITION_OPTIONS.map(option => (
                                                                                    <option key={option.value} value={option.value}>{option.label}</option>
                                                                                ))}
                                                                            </select>
                                                                        </div>
                                                                        <div style={{ display: 'grid', gap: '0.35rem' }}>
                                                                            <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                                                                Premium FX into this scene
                                                                            </label>
                                                                            <select
                                                                                value={scene.scene_fx_name || 'auto'}
                                                                                onChange={(e) => {
                                                                                    const nextFx = e.target.value;
                                                                                    setSceneTimeline(prev => prev.map(item => item.scene_id === scene.scene_id ? {
                                                                                        ...item,
                                                                                        scene_fx_name: nextFx === 'auto' ? null : nextFx,
                                                                                    } : item));
                                                                                }}
                                                                                style={{
                                                                                    width: '100%',
                                                                                    padding: '0.6rem 0.75rem',
                                                                                    borderRadius: '8px',
                                                                                    border: '1px solid #333',
                                                                                    background: '#111',
                                                                                    color: 'var(--text-primary)',
                                                                                    cursor: 'pointer',
                                                                                }}
                                                                            >
                                                                                {PREMIUM_SCENE_FX_OPTIONS.map(option => (
                                                                                    <option key={option.value} value={option.value}>{option.label}</option>
                                                                                ))}
                                                                            </select>
                                                                        </div>
                                                                        {(scene.stock_match_rationale || scene.fx_rationale) && (
                                                                            <div style={{ display: 'grid', gap: '0.55rem', padding: '0.8rem', borderRadius: '10px', border: '1px solid #262f2d', background: '#0f1213' }}>
                                                                                {scene.stock_match_rationale && (
                                                                                    <div style={{ display: 'grid', gap: '0.2rem' }}>
                                                                                        <div style={{ fontSize: '0.7rem', color: 'var(--accent)', fontWeight: 700 }}>Stock logic</div>
                                                                                        <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>{scene.stock_match_rationale}</div>
                                                                                    </div>
                                                                                )}
                                                                                {scene.fx_rationale && (
                                                                                    <div style={{ display: 'grid', gap: '0.2rem' }}>
                                                                                        <div style={{ fontSize: '0.7rem', color: '#ffd39a', fontWeight: 700 }}>FX logic</div>
                                                                                        <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>{scene.fx_rationale}</div>
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        )}
                                                                        <div style={{ display: 'grid', gap: '0.4rem' }}>
                                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                                                                                <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                                                                    On-screen hook text
                                                                                </label>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => {
                                                                                        const suggested = (scene.transcript_excerpt || '').replace(/\s+/g, ' ').trim();
                                                                                        setSceneTimeline(prev => prev.map(item => item.scene_id === scene.scene_id ? {
                                                                                            ...item,
                                                                                            caption_text: suggested,
                                                                                            caption_is_custom: false,
                                                                                        } : item));
                                                                                    }}
                                                                                    style={{ padding: '0.2rem 0.5rem', borderRadius: '999px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '0.7rem', cursor: 'pointer' }}
                                                                                >
                                                                                    Reset to scene voice-over
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
                                                                                Starts empty by default. Use Reset to scene voice-over only if you want the narration copied into the video.
                                                                            </div>
                                                                        </div>
                                                                        {(scene.stock_candidates.length > 0 || scene.search_queries.length > 0) && (
                                                                            <div style={{ display: 'grid', gap: '0.75rem', padding: '0.8rem', borderRadius: '10px', border: '1px solid #2f3f3a', background: 'rgba(100, 255, 218, 0.03)' }}>
                                                                                <div style={{ display: 'grid', gap: '0.4rem' }}>
                                                                                    <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                                                                        Stock search queries
                                                                                    </label>
                                                                                    <textarea
                                                                                        value={sceneQueryDraftRef.current[scene.scene_id] ?? scene.search_queries.join(', ')}
                                                                                        onChange={(e) => {
                                                                                            sceneQueryDraftRef.current[scene.scene_id] = e.target.value;
                                                                                            setSceneTimeline(prev => prev.map(item => item.scene_id === scene.scene_id ? {
                                                                                                ...item,
                                                                                                search_queries: e.target.value.split(',').map(part => part.trim()).filter(Boolean),
                                                                                            } : item));
                                                                                        }}
                                                                                        rows={2}
                                                                                        placeholder="e.g. brain scan lab, futuristic neuroscience, scientist analyzing data"
                                                                                        style={{ width: '100%', padding: '0.6rem 0.7rem', borderRadius: '8px', border: '1px solid #2d3a36', background: '#101413', color: '#e9f1ee', resize: 'vertical', fontSize: '0.78rem', lineHeight: 1.45 }}
                                                                                    />
                                                                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                                                                                        Use comma-separated queries. Per-scene refetch returns up to 10 stock results and stays video-first when matches exist.
                                                                                    </div>
                                                                                </div>
                                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={async () => {
                                                                                            const currentScene = sceneTimeline.find(item => item.scene_id === scene.scene_id);
                                                                                            if (!currentScene) return;
                                                                                            const parsedQueries = (sceneQueryDraftRef.current[scene.scene_id] || '')
                                                                                                .split(',')
                                                                                                .map(part => part.trim())
                                                                                                .filter(Boolean);
                                                                                            if (parsedQueries.length === 0) {
                                                                                                alert('Enter at least one stock search query.');
                                                                                                return;
                                                                                            }
                                                                                            setRefetchingSceneCandidatesId(scene.scene_id);
                                                                                            try {
                                                                                                const result = await refetchSceneCandidates(reelScript, currentScene, parsedQueries);
                                                                                                sceneQueryDraftRef.current[scene.scene_id] = parsedQueries.join(', ');
                                                                                                setSceneTimeline(prev => prev.map(item => item.scene_id === scene.scene_id ? result.scene : item));
                                                                                            } catch (err: any) {
                                                                                                alert(err?.message || 'Failed to refetch stock for scene');
                                                                                            } finally {
                                                                                                setRefetchingSceneCandidatesId(null);
                                                                                            }
                                                                                        }}
                                                                                        disabled={refetchingSceneCandidatesId === scene.scene_id}
                                                                                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.8rem', borderRadius: '8px', border: '1px solid var(--accent)', background: 'rgba(100, 255, 218, 0.08)', color: 'var(--accent)', cursor: refetchingSceneCandidatesId === scene.scene_id ? 'wait' : 'pointer', fontWeight: 600, fontSize: '0.76rem' }}
                                                                                    >
                                                                                        {refetchingSceneCandidatesId === scene.scene_id ? <Loader2 size={13} className={styles.spinAnimation} /> : <RefreshCw size={13} />}
                                                                                        {refetchingSceneCandidatesId === scene.scene_id ? 'Fetching stock...' : 'Refetch stock for scene'}
                                                                                    </button>
                                                                                    {scene.search_queries.length > 0 && (
                                                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                                                                                            {scene.search_queries.map(query => (
                                                                                                <span key={query} style={{ fontSize: '0.68rem', border: '1px solid #2d3a36', borderRadius: '999px', padding: '0.2rem 0.5rem', color: 'var(--text-secondary)' }}>
                                                                                                    {query}
                                                                                                </span>
                                                                                            ))}
                                                                                        </div>
                                                                                    )}
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
                                                                                                    {candidate.rationale && (
                                                                                                        <div style={{ fontSize: '0.66rem', color: '#aab7b3', marginTop: '0.3rem', lineHeight: 1.4 }}>
                                                                                                            {candidate.rationale}
                                                                                                        </div>
                                                                                                    )}
                                                                                                </div>
                                                                                            </button>
                                                                                        ))}
                                                                                    </div>
                                                                                )}
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
                                                                                            const result = await generateSingleSceneAiPrompt(reelScript, currentScene, sceneTimeline);
                                                                                            setSceneTimeline(prev => prev.map(item => item.scene_id === scene.scene_id ? {
                                                                                                ...item,
                                                                                                ai_prompt: result.prompt,
                                                                                                effect_transition_name: result.effect_transition_name || item.effect_transition_name,
                                                                                                scene_role: result.scene_role ?? item.scene_role,
                                                                                                asset_bias: (result.asset_bias as SceneTimelineItem['asset_bias']) ?? item.asset_bias,
                                                                                                scene_fx_name: result.scene_fx_name !== undefined ? result.scene_fx_name : item.scene_fx_name,
                                                                                                scene_fx_strength: result.scene_fx_strength ?? item.scene_fx_strength,
                                                                                                stock_match_rationale: result.stock_match_rationale ?? item.stock_match_rationale,
                                                                                                fx_rationale: result.fx_rationale ?? item.fx_rationale,
                                                                                                planning_confidence: result.planning_confidence ?? item.planning_confidence,
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

                                                            <div style={{ display: 'grid', gap: '0.35rem' }}>
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                                                                    <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                                                        Premium transition into this scene
                                                                    </label>
                                                                    {idx === anchorTimeline.length - 1 && (
                                                                        <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                                                                            Last scene keeps its exit clean
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <select
                                                                    value={item.effect_transition_name || 'depth_blur_handoff'}
                                                                    onChange={(e) => {
                                                                        const arr = [...anchorTimeline];
                                                                        arr[idx] = { ...arr[idx], effect_transition_name: e.target.value };
                                                                        setAnchorTimeline(arr);
                                                                    }}
                                                                    disabled={idx === anchorTimeline.length - 1}
                                                                    style={{
                                                                        width: '100%',
                                                                        padding: '0.6rem 0.75rem',
                                                                        borderRadius: '8px',
                                                                        border: '1px solid #333',
                                                                        background: idx === anchorTimeline.length - 1 ? '#171717' : '#111',
                                                                        color: idx === anchorTimeline.length - 1 ? '#777' : 'var(--text-primary)',
                                                                        cursor: idx === anchorTimeline.length - 1 ? 'not-allowed' : 'pointer',
                                                                    }}
                                                                >
                                                                    {PREMIUM_TRANSITION_OPTIONS.map(option => (
                                                                        <option key={option.value} value={option.value}>{option.label}</option>
                                                                    ))}
                                                                </select>
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
                                                Render the finished reel here.
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
                                    {!isCustomTab && approvedClips.length === 0 && (
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

                                    {!isCustomTab && audioPreviewUrl && timelineDuration > 0 && premiumSfxLibrary.length > 0 && (
                                        <div style={{ marginBottom: '1.5rem', padding: '1.1rem', background: 'rgba(12, 16, 24, 0.92)', borderRadius: '12px', border: '1px solid rgba(113, 203, 255, 0.18)' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.9rem' }}>
                                                <div>
                                                    <div style={{ fontSize: '1rem', fontWeight: 700, color: '#fff' }}>Premium SFX cues</div>
                                                    <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.3rem', maxWidth: '680px', lineHeight: 1.5 }}>
                                                        Place sound effects anywhere on the compiled narration timeline. AI assist can draft a tasteful starting pass, and every cue stays editable after that.
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                                                    <button
                                                        type="button"
                                                        onClick={handleAutoPlaceSfx}
                                                        disabled={autoPlacingSfx}
                                                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 0.85rem', borderRadius: '8px', border: '1px solid rgba(255, 210, 122, 0.32)', background: 'rgba(255, 210, 122, 0.09)', color: '#ffd27a', cursor: autoPlacingSfx ? 'wait' : 'pointer', fontWeight: 600, opacity: autoPlacingSfx ? 0.7 : 1 }}
                                                    >
                                                        {autoPlacingSfx ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                                                        {sortedSfxTimeline.length > 0 ? 'Refresh AI cues' : 'AI assist cues'}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => addSfxCueAtTime(audioPreviewCurrentTime)}
                                                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 0.85rem', borderRadius: '8px', border: '1px solid rgba(113, 203, 255, 0.45)', background: 'rgba(113, 203, 255, 0.08)', color: '#b9e4ff', cursor: 'pointer', fontWeight: 600 }}
                                                    >
                                                        <Plus size={14} />
                                                        Add cue at playhead
                                                    </button>
                                                    {sortedSfxTimeline.length > 0 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setSfxTimeline([])}
                                                            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 0.85rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}
                                                        >
                                                            <Trash2 size={14} />
                                                            Clear cues
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            {sfxAssistMessage && (
                                                <div style={{ marginBottom: '0.9rem', padding: '0.65rem 0.8rem', borderRadius: '10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: 1.5 }}>
                                                    {sfxAssistMessage}
                                                </div>
                                            )}

                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.85rem' }}>
                                                <button
                                                    type="button"
                                                    onClick={toggleNarrationPreviewPlayback}
                                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', padding: '0.5rem 0.8rem', borderRadius: '999px', border: '1px solid rgba(113, 203, 255, 0.28)', background: 'rgba(113, 203, 255, 0.08)', color: '#b9e4ff', cursor: 'pointer', fontWeight: 600 }}
                                                >
                                                    {audioPreviewPlaying ? <Pause size={14} /> : <Play size={14} />}
                                                    {audioPreviewPlaying ? 'Pause' : 'Play'}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setNarrationPreviewTime(Math.max(0, audioPreviewCurrentTime - 1))}
                                                    style={{ padding: '0.48rem 0.7rem', borderRadius: '999px', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}
                                                >
                                                    -1s
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setNarrationPreviewTime(Math.min(timelineDuration, audioPreviewCurrentTime + 1))}
                                                    style={{ padding: '0.48rem 0.7rem', borderRadius: '999px', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}
                                                >
                                                    +1s
                                                </button>
                                                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                                    Local playhead: <span style={{ color: '#fff', fontWeight: 700 }}>{formatTimelineTime(audioPreviewCurrentTime)}</span> / {formatTimelineTime(timelineDuration)}
                                                </div>
                                            </div>

                                            <div
                                                ref={sfxTimelineTrackRef}
                                                style={{ position: 'relative', height: '70px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)', background: 'linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))', overflow: 'hidden', cursor: 'pointer', marginBottom: '1rem' }}
                                                onPointerDown={(event) => {
                                                    const track = event.currentTarget;
                                                    if (!track || timelineDuration <= 0) return;
                                                    const rect = track.getBoundingClientRect();
                                                    const ratio = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
                                                    const nextTime = ratio * timelineDuration;
                                                    setNarrationPreviewTime(nextTime);
                                                }}
                                            >
                                                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(113, 203, 255, 0.08), transparent 18%, transparent 82%, rgba(255, 220, 130, 0.08))' }} />
                                                <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${Math.min((audioPreviewCurrentTime / timelineDuration) * 100, 100)}%`, width: '2px', background: '#7fd5ff', boxShadow: '0 0 0 4px rgba(127, 213, 255, 0.15)' }} />
                                                {sortedSfxTimeline.map((cue, idx) => (
                                                    <button
                                                        key={cue.id}
                                                        type="button"
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            if (suppressSfxCueClickRef.current === cue.id) {
                                                                suppressSfxCueClickRef.current = null;
                                                                return;
                                                            }
                                                            setNarrationPreviewTime(cue.start_time_seconds);
                                                            openSfxCueEditor(cue.id);
                                                        }}
                                                        onPointerDown={(event) => {
                                                            event.preventDefault();
                                                            event.stopPropagation();
                                                            sfxCuePointerStartRef.current = {
                                                                cueId: cue.id,
                                                                clientX: event.clientX,
                                                                clientY: event.clientY,
                                                            };
                                                            setDraggingSfxCueId(cue.id);
                                                        }}
                                                        title={`${cue.sound_id} at ${cue.start_time_seconds.toFixed(2)}s`}
                                                        style={{
                                                            position: 'absolute',
                                                            top: '10px',
                                                            left: `${Math.min((cue.start_time_seconds / timelineDuration) * 100, 100)}%`,
                                                            transform: 'translateX(-50%)',
                                                            border: 'none',
                                                            background: 'transparent',
                                                            cursor: 'grab',
                                                            padding: 0,
                                                            opacity: draggingSfxCueId === cue.id ? 0.95 : 1,
                                                        }}
                                                    >
                                                        <div style={{ width: '2px', height: '34px', margin: '0 auto', background: 'rgba(255, 210, 122, 0.95)' }} />
                                                        <div style={{ marginTop: '0.35rem', padding: '0.18rem 0.45rem', borderRadius: '999px', background: idx % 2 === 0 ? 'rgba(255, 210, 122, 0.14)' : 'rgba(113, 203, 255, 0.14)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', fontSize: '0.68rem', whiteSpace: 'nowrap' }}>
                                                            {premiumSfxLibrary.find(sound => sound.sound_id === cue.sound_id)?.label || cue.sound_id}
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>

                                            {sortedSfxTimeline.length === 0 ? (
                                                <div style={{ padding: '0.9rem 1rem', borderRadius: '10px', background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.08)', color: 'var(--text-secondary)', fontSize: '0.82rem', lineHeight: 1.55 }}>
                                                    No SFX cues yet. Move the playhead to a beat, click <strong style={{ color: '#fff' }}>Add cue at playhead</strong>, then drag or fine-tune the cue time wherever you want it.
                                                </div>
                                            ) : (
                                                <div style={{ padding: '0.9rem 1rem', borderRadius: '10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: 'var(--text-secondary)', fontSize: '0.82rem', lineHeight: 1.55 }}>
                                                    Click any cue marker on the timeline to edit its sound, time, volume, preview it, or remove it. Drag the marker when you want to retime it.
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Closing Statement (CTA) */}
                                    {!isCustomTab && (
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
                                    )}

                                    <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap' }}>
                                        <button
                                            onClick={() => handleGenerateReel('classic')}
                                            disabled={generatingReel || generatingPremiumReel || (isCustomTab ? !reelScript.trim() : !reelHeadline.trim())}
                                            style={{
                                                padding: '0.75rem 1.5rem',
                                                fontSize: '1rem',
                                                fontWeight: 600,
                                                borderRadius: '10px',
                                                border: 'none',
                                                background: 'var(--accent)',
                                                color: '#000',
                                                cursor: generatingReel ? 'wait' : 'pointer',
                                                opacity: (generatingReel || generatingPremiumReel || (isCustomTab ? !reelScript.trim() : !reelHeadline.trim())) ? 0.6 : 1,
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

                                        <button
                                            onClick={() => handleGenerateReel('premium')}
                                            disabled={generatingReel || generatingPremiumReel || (isCustomTab ? !reelScript.trim() : !reelHeadline.trim())}
                                            style={{
                                                padding: '0.75rem 1.5rem',
                                                fontSize: '1rem',
                                                fontWeight: 700,
                                                borderRadius: '10px',
                                                border: '1px solid rgba(255,255,255,0.12)',
                                                background: 'linear-gradient(135deg, rgba(113, 203, 255, 0.2), rgba(255, 224, 153, 0.22))',
                                                color: '#fff',
                                                cursor: generatingPremiumReel ? 'wait' : 'pointer',
                                                opacity: (generatingReel || generatingPremiumReel || (isCustomTab ? !reelScript.trim() : !reelHeadline.trim())) ? 0.6 : 1,
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.5rem',
                                                boxShadow: '0 12px 30px rgba(0,0,0,0.18)',
                                            }}
                                        >
                                            {generatingPremiumReel ? (
                                                <><Loader2 size={18} className="animate-spin" /> Generating Premium Reel...</>
                                            ) : (
                                                <><Sparkles size={18} /> Generate Premium Reel</>
                                            )}
                                        </button>
                                    </div>

                                    {reelError && (
                                        <p style={{ color: '#ff6b6b', marginTop: '1rem' }}>❌ {reelError}</p>
                                    )}

                                    {reelUrl && (
                                        <div style={{ marginTop: '1.5rem' }}>
                                            <div style={{ marginBottom: '0.6rem', display: 'inline-flex', alignItems: 'center', gap: '0.45rem', padding: '0.35rem 0.7rem', borderRadius: '999px', background: reelRenderer === 'premium' ? 'rgba(113, 203, 255, 0.14)' : 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', color: reelRenderer === 'premium' ? '#b9e4ff' : 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                                {reelRenderer === 'premium' ? 'Premium Renderer' : 'Classic Renderer'}
                                            </div>
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
            {activeSfxCue && (
                <div
                    role="dialog"
                    aria-modal="true"
                    onClick={() => setActiveSfxCueId(null)}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: 1000,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '1.25rem',
                        background: 'rgba(5, 8, 14, 0.72)',
                        backdropFilter: 'blur(8px)',
                    }}
                >
                    <div
                        onClick={(event) => event.stopPropagation()}
                        style={{
                            width: 'min(100%, 460px)',
                            borderRadius: '18px',
                            border: '1px solid rgba(255,255,255,0.08)',
                            background: 'linear-gradient(180deg, rgba(16, 22, 32, 0.98), rgba(9, 13, 20, 0.98))',
                            boxShadow: '0 24px 80px rgba(0,0,0,0.45)',
                            padding: '1.15rem',
                            color: '#fff',
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', marginBottom: '1rem' }}>
                            <div>
                                <div style={{ fontSize: '1rem', fontWeight: 700 }}>Edit Cue</div>
                                <div style={{ marginTop: '0.3rem', fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                                    {premiumSfxLibrary.find(sound => sound.sound_id === activeSfxCue.sound_id)?.label || activeSfxCue.sound_id} at {formatTimelineTime(activeSfxCue.start_time_seconds)}
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setActiveSfxCueId(null)}
                                style={{
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '999px',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    background: 'rgba(255,255,255,0.04)',
                                    color: 'var(--text-secondary)',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}
                            >
                                <X size={15} />
                            </button>
                        </div>

                        <div style={{ display: 'grid', gap: '0.9rem' }}>
                            <div style={{ display: 'grid', gap: '0.35rem' }}>
                                <label style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Sound effect</label>
                                <select
                                    value={activeSfxCue.sound_id}
                                    onChange={(event) => updateSfxCue(activeSfxCue.id, current => ({ ...current, sound_id: event.target.value }))}
                                    style={{
                                        width: '100%',
                                        padding: '0.72rem 0.8rem',
                                        borderRadius: '10px',
                                        border: '1px solid rgba(255,255,255,0.12)',
                                        background: 'rgba(255,255,255,0.04)',
                                        color: '#fff',
                                        fontFamily: 'inherit',
                                    }}
                                >
                                    {premiumSfxLibrary.map(sound => (
                                        <option key={sound.sound_id} value={sound.sound_id}>{sound.label}</option>
                                    ))}
                                </select>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.75rem', alignItems: 'end' }}>
                                <div style={{ display: 'grid', gap: '0.35rem' }}>
                                    <label style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Cue time</label>
                                    <input
                                        type="number"
                                        min={0}
                                        max={Math.max(timelineDuration, 0)}
                                        step={0.01}
                                        value={activeSfxCue.start_time_seconds.toFixed(2)}
                                        onChange={(event) => updateSfxCue(activeSfxCue.id, current => ({
                                            ...current,
                                            start_time_seconds: Number(Math.min(Math.max(Number(event.target.value) || 0, 0), timelineDuration).toFixed(2)),
                                        }))}
                                        style={{
                                            width: '100%',
                                            padding: '0.72rem 0.8rem',
                                            borderRadius: '10px',
                                            border: '1px solid rgba(255,255,255,0.12)',
                                            background: 'rgba(255,255,255,0.04)',
                                            color: '#fff',
                                            fontFamily: 'inherit',
                                        }}
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={() => updateSfxCue(activeSfxCue.id, current => ({ ...current, start_time_seconds: Number(audioPreviewCurrentTime.toFixed(2)) }))}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.35rem',
                                        padding: '0.72rem 0.85rem',
                                        borderRadius: '10px',
                                        border: '1px solid rgba(255,255,255,0.12)',
                                        background: 'transparent',
                                        color: 'var(--text-secondary)',
                                        cursor: 'pointer',
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    <ArrowRight size={14} />
                                    Use playhead
                                </button>
                            </div>

                            <div style={{ display: 'grid', gap: '0.45rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                                    <label style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Volume</label>
                                    <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>{Math.round(activeSfxCue.volume * 100)}%</div>
                                </div>
                                <input
                                    type="range"
                                    min={0}
                                    max={1}
                                    step={0.01}
                                    value={activeSfxCue.volume}
                                    onChange={(event) => updateSfxCue(activeSfxCue.id, current => ({ ...current, volume: Number(event.target.value) }))}
                                    style={{ width: '100%', accentColor: '#ffd27a' }}
                                />
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1.1rem' }}>
                            <button
                                type="button"
                                onClick={() => removeSfxCue(activeSfxCue.id)}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.4rem',
                                    padding: '0.7rem 0.95rem',
                                    borderRadius: '10px',
                                    border: '1px solid rgba(255,120,120,0.24)',
                                    background: 'rgba(255,120,120,0.08)',
                                    color: '#ff9b9b',
                                    cursor: 'pointer',
                                }}
                            >
                                <Trash2 size={14} />
                                Delete cue
                            </button>
                            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                                <button
                                    type="button"
                                    onClick={() => previewSfxCue(activeSfxCue)}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.4rem',
                                        padding: '0.7rem 0.95rem',
                                        borderRadius: '10px',
                                        border: '1px solid rgba(113, 203, 255, 0.24)',
                                        background: 'rgba(113, 203, 255, 0.08)',
                                        color: '#b9e4ff',
                                        cursor: 'pointer',
                                    }}
                                >
                                    <Play size={14} />
                                    Preview
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActiveSfxCueId(null)}
                                    style={{
                                        padding: '0.7rem 0.95rem',
                                        borderRadius: '10px',
                                        border: '1px solid rgba(255,255,255,0.12)',
                                        background: 'transparent',
                                        color: 'var(--text-secondary)',
                                        cursor: 'pointer',
                                    }}
                                >
                                    Done
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </main >
    );
}

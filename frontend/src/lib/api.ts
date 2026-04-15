export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
export const API_BASE_URL = API_URL.replace('/api/v1', '');

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
    metrics: Record<string, any> | null;
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
    slideTitles?: string[];
    caption?: string;
    imageUrl?: string;
    imageUrls?: string[];
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

export async function fetchPaperCarouselContent(paperId: number, contentType: string = 'latest'): Promise<CarouselSlide> {
    const res = await fetch(`${API_URL}/podcast/paper/${paperId}/generate-carousel?content_type=${contentType}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        }, cache: 'no-store'
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


// Reel Script Generation
export type ReelScriptResponse = {
    script: string;
    headline: string;
};

export async function generateReelScript(paperId: number, contentType: string = 'latest'): Promise<ReelScriptResponse> {
    const res = await fetch(`${API_URL}/podcast/paper/${paperId}/generate-reel-script?content_type=${contentType}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Reel script generation failed: ${err}`);
    }
    return res.json();
}

// Reel Generation
export type ReelResponse = {
    video_url: string;
    episode_id: number;
    duration_seconds: number;
    renderer: 'classic' | 'premium';
};

export type ReelRenderer = 'classic' | 'premium';

export type VisualClip = {
    url: string;
    thumbnail: string;
    keyword: string;
    duration: number;
};

export async function extractVisualQueries(headline: string, script: string): Promise<{ queries: string[] }> {
    const res = await fetch(`${API_URL}/content/extract-visual-queries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headline, script }),
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Extract visual queries failed: ${err}`);
    }
    return res.json();
}

export async function fetchVisuals(queries: string[]): Promise<{ clips: VisualClip[] }> {
    const res = await fetch(`${API_URL}/content/fetch-visuals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queries }),
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Fetch visuals failed: ${err}`);
    }
    return res.json();
}

export async function fetchLocalLibraryAssets(limit: number = 500): Promise<{ assets: SceneAssetCandidate[] }> {
    const res = await fetch(`${API_URL}/content/local-library-assets?limit=${encodeURIComponent(limit)}`, {
        method: 'GET',
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Fetch local library assets failed: ${err}`);
    }
    return res.json();
}

export async function extractScenePrompts(script: string): Promise<{ prompts: string[] }> {
    const res = await fetch(`${API_URL}/content/extract-scene-prompts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script }),
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Extract scene prompts failed: ${err}`);
    }
    return res.json();
}

export interface AnchorWord {
    word: string;
    start_time_seconds: number;
    end_time_seconds: number;
    focus_word?: string | null;
    anchor_phrase?: string | null;
}

export interface SceneAssetCandidate {
    candidate_id: string;
    type: 'local_image' | 'local_video' | 'stock_image' | 'stock_video';
    thumbnail_url: string;
    asset_url: string;
    source_provider: string;
    width: number;
    height: number;
    duration_seconds?: number | null;
    query: string;
    score: number;
    rationale?: string | null;
    confidence?: number | null;
}

export interface SelectedSceneAsset {
    asset_source: 'local_image' | 'local_video' | 'stock_image' | 'stock_video' | 'ai_image' | 'user_image' | 'user_video' | 'none';
    asset_url?: string | null;
    thumbnail_url?: string | null;
    candidate_id?: string | null;
}

export interface SceneTimelineItem {
    scene_id: string;
    anchor_word: string;
    visual_focus_word?: string | null;
    anchor_phrase?: string | null;
    start_time_seconds: number;
    end_time_seconds: number;
    transcript_excerpt: string;
    caption_text?: string | null;
    caption_is_custom?: boolean;
    effect_transition_name?: string;
    scene_role?: string | null;
    asset_bias?: 'video' | 'image' | 'either' | null;
    scene_fx_name?: string | null;
    scene_fx_strength?: number | null;
    stock_match_rationale?: string | null;
    fx_rationale?: string | null;
    planning_confidence?: number | null;
    search_queries: string[];
    stock_candidates: SceneAssetCandidate[];
    selected_asset?: SelectedSceneAsset | null;
    ai_prompt?: string | null;
    ai_image_url?: string | null;
    last_generated_ai_prompt?: string | null;
    asset_source: 'local_image' | 'local_video' | 'stock_image' | 'stock_video' | 'ai_image' | 'user_image' | 'user_video' | 'none';
    scene_state: 'resolved_by_library' | 'resolved_by_stock' | 'resolved_by_ai' | 'resolved_by_user' | 'unresolved' | 'ai_eligible' | 'ai_blocked_by_cap';
}

export interface TimelinePrompt {
    prompt: string;
    anchor_word: string;
    start_time_seconds: number;
    effect_transition_name?: string;
}

export interface WordTimestamp {
    word: string;
    start: number;
    end: number;
}

export interface PremiumSfxOption {
    sound_id: string;
    label: string;
    filename: string;
}

export interface ReelSfxItem {
    id: string;
    sound_id: string;
    start_time_seconds: number;
    volume: number;
}

export interface SuggestedReelSfxCue {
    sound_id: string;
    start_time_seconds: number;
    volume: number;
    reason?: string | null;
    confidence?: number | null;
}

export interface FactCheckClaim {
    claim_id: string;
    claim_text: string;
    normalized_claim: string;
    start_time_seconds: number;
    end_time_seconds: number;
    transcript_excerpt: string;
    factuality_confidence: number;
    suggested_queries: string[];
}

export interface FactCheckVideo {
    job_id: string;
    source_url: string;
    title: string;
    channel_name: string;
    duration_seconds: number;
    video_url: string;
    audio_url: string;
    transcript: string;
    word_timestamps: WordTimestamp[];
}

export interface PublicFactCheckVideo {
    job_id: string;
    source_url: string;
    title: string;
    channel_name: string;
    duration_seconds: number;
}

export interface FactCheckPaperMatch {
    source: string;
    query?: string | null;
    title: string;
    authors: string[];
    year?: number | null;
    doi?: string | null;
    openalex_id?: string | null;
    abstract?: string | null;
    paper_url?: string | null;
    cited_by_count: number;
    journal?: string | null;
    verified: boolean;
    verification_source?: string | null;
    retrieval_score: number;
    retrieval_notes: string[];
    stance: 'supports' | 'refutes' | 'mixed' | 'tangential' | string;
    relevance_score: number;
    evidence_note?: string | null;
    counted_in_tally: boolean;
    counted_reason: 'counted' | 'tangential' | string;
}

export interface FactCheckAnalysis {
    claim: FactCheckClaim;
    analysis_claim_text: string;
    look_dev_question: string;
    clip_url: string;
    clip_start_time_seconds: number;
    clip_end_time_seconds: number;
    overall_rating: number;
    trust_label: string;
    verdict_summary: string;
    thirty_second_summary: string;
    support_count: number;
    refute_count: number;
    mixed_count: number;
    counted_paper_count: number;
    tangential_count: number;
    considered_but_not_counted_count: number;
    queries_used: string[];
    ai_fallback_used: boolean;
    verified_paper_count: number;
    papers: FactCheckPaperMatch[];
    paper_links: string[];
}

export interface PublicFactCheckAnalysis {
    claim?: FactCheckClaim | null;
    executed_claim_text: string;
    overall_rating: number;
    trust_label: string;
    verdict_summary: string;
    thirty_second_summary: string;
    support_count: number;
    refute_count: number;
    mixed_count: number;
    counted_paper_count: number;
    tangential_count: number;
    considered_but_not_counted_count: number;
    verified_paper_count: number;
    papers: FactCheckPaperMatch[];
    paper_links: string[];
}

export interface FactCheckStitchPreview {
    claim: FactCheckClaim;
    preview_url: string;
    selected_start_time_seconds: number;
    selected_end_time_seconds: number;
    overlay_text: string;
    tail_duration_seconds: number;
}

export interface FactCheckStitchLookDevPreview {
    preview_url: string;
    duration_seconds: number;
    source_background_used: boolean;
}

export async function fetchPremiumSfxLibrary(): Promise<{ sounds: PremiumSfxOption[] }> {
    const res = await fetch(`${API_URL}/content/premium-sfx-library`, { cache: 'no-store' });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Failed to fetch premium SFX library: ${err}`);
    }
    return res.json();
}

export async function ingestYoutubeForFactCheck(url: string): Promise<FactCheckVideo> {
    const res = await fetch(`${API_URL}/fact-check/ingest-youtube`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`YouTube ingest failed: ${err}`);
    }
    return res.json();
}

export async function ingestYoutubeForPublicFactCheck(url: string): Promise<PublicFactCheckVideo> {
    const res = await fetch(`${API_URL}/fact-check/public/ingest-youtube`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`YouTube ingest failed: ${err}`);
    }
    return res.json();
}

export async function extractFactCheckClaims(jobId: string): Promise<{ claims: FactCheckClaim[] }> {
    const res = await fetch(`${API_URL}/fact-check/extract-claims`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId }),
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Claim extraction failed: ${err}`);
    }
    return res.json();
}

export async function analyzePublicFactCheckClaim(params: {
    jobId: string;
    claimId?: string | null;
    customClaimText?: string;
}): Promise<PublicFactCheckAnalysis> {
    const res = await fetch(`${API_URL}/fact-check/public/analyze-claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            job_id: params.jobId,
            claim_id: params.claimId ?? null,
            custom_claim_text: params.customClaimText ?? '',
        }),
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Claim analysis failed: ${err}`);
    }
    return res.json();
}

export async function analyzeFactCheckClaim(
    jobId: string,
    claimId: string,
    queries: string[] = [],
    analysisClaimText: string = '',
): Promise<FactCheckAnalysis> {
    const res = await fetch(`${API_URL}/fact-check/analyze-claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId, claim_id: claimId, queries, analysis_claim_text: analysisClaimText }),
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Claim analysis failed: ${err}`);
    }
    return res.json();
}

export async function generateFactCheckHookQuestion(params: {
    claimText: string;
    trustLabel?: string;
    verdictSummary?: string;
}): Promise<{ question: string }> {
    const res = await fetch(`${API_URL}/fact-check/generate-hook-question`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            claim_text: params.claimText,
            trust_label: params.trustLabel ?? '',
            verdict_summary: params.verdictSummary ?? '',
        }),
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Hook question generation failed: ${err}`);
    }
    return res.json();
}

export async function generateFactCheckStitchPreview(params: {
    jobId: string;
    claimId: string;
    selectedStartTimeSeconds: number;
    selectedEndTimeSeconds: number;
    overlayText?: string;
    overallRating?: number;
    trustLabel?: string;
    verdictSummary?: string;
    thirtySecondSummary?: string;
    supportCount?: number;
    refuteCount?: number;
    mixedCount?: number;
}): Promise<FactCheckStitchPreview> {
    const res = await fetch(`${API_URL}/fact-check/generate-stitch-preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            job_id: params.jobId,
            claim_id: params.claimId,
            selected_start_time_seconds: params.selectedStartTimeSeconds,
            selected_end_time_seconds: params.selectedEndTimeSeconds,
            overlay_text: params.overlayText ?? 'STITCH INCOMING',
            overall_rating: params.overallRating ?? 0,
            trust_label: params.trustLabel ?? '',
            verdict_summary: params.verdictSummary ?? '',
            thirty_second_summary: params.thirtySecondSummary ?? '',
            support_count: params.supportCount ?? 0,
            refute_count: params.refuteCount ?? 0,
            mixed_count: params.mixedCount ?? 0,
        }),
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Stitch preview failed: ${err}`);
    }
    return res.json();
}

export async function renderFactCheckStitchLookDev(params: {
    jobId?: string | null;
    question: string;
    rating: number;
    trustLabel: string;
    verdict: string;
    rationale: string;
    supportCount: number;
    refuteCount: number;
    mixedCount: number;
    selectedStartTimeSeconds?: number;
    selectedEndTimeSeconds?: number;
    durationSeconds: number;
    useSourceBackground?: boolean;
}): Promise<FactCheckStitchLookDevPreview> {
    const res = await fetch(`${API_URL}/fact-check/render-stitch-look-dev`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            job_id: params.jobId ?? null,
            question: params.question,
            rating: params.rating,
            trust_label: params.trustLabel,
            verdict: params.verdict,
            rationale: params.rationale,
            support_count: params.supportCount,
            refute_count: params.refuteCount,
            mixed_count: params.mixedCount,
            selected_start_time_seconds: params.selectedStartTimeSeconds ?? 0,
            selected_end_time_seconds: params.selectedEndTimeSeconds ?? 0,
            duration_seconds: params.durationSeconds,
            use_source_background: params.useSourceBackground ?? true,
        }),
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Remotion stitch look dev failed: ${err}`);
    }
    return res.json();
}

export async function autoPlacePremiumSfx(params: {
    headline?: string;
    script?: string;
    durationSeconds: number;
    wordTimestamps: WordTimestamp[];
    scenes: SceneTimelineItem[];
    maxCues?: number;
}): Promise<{ cues: SuggestedReelSfxCue[]; mode: string }> {
    const res = await fetch(`${API_URL}/content/auto-place-sfx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            headline: params.headline ?? '',
            script: params.script ?? '',
            duration_seconds: params.durationSeconds,
            word_timestamps: params.wordTimestamps,
            scenes: params.scenes,
            max_cues: params.maxCues ?? 5,
        }),
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Auto place premium SFX failed: ${err}`);
    }
    return res.json();
}

export async function compileAudioTimeline(params: {
    script?: string;
    voice: string;
    voiceProvider: string;
    speed: number;
    elevenlabsStability?: number;
    elevenlabsSimilarityBoost?: number;
    elevenlabsStyle?: number;
    audioFile?: File | null;
    transcriptText?: string;
    splitScenesBySentence?: boolean;
}): Promise<{ audio_url: string; timeline: AnchorWord[]; scenes: SceneTimelineItem[]; duration: number; word_timestamps: WordTimestamp[]; rewritten_script: string; display_script: string }> {
    let res: Response;
    if (params.audioFile) {
        const formData = new FormData();
        formData.append('audio_file', params.audioFile);
        if (params.transcriptText?.trim()) formData.append('transcript_text', params.transcriptText.trim());
        formData.append('split_scenes_by_sentence', String(params.splitScenesBySentence ?? true));
        res = await fetch(`${API_URL}/content/compile-uploaded-audio-timeline`, {
            method: 'POST',
            body: formData,
        });
    } else {
        res = await fetch(`${API_URL}/content/compile-audio-timeline`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                script: params.script,
                voice: params.voice,
                voice_provider: params.voiceProvider,
                speed: params.speed,
                elevenlabs_stability: params.elevenlabsStability ?? 0.65,
                elevenlabs_similarity_boost: params.elevenlabsSimilarityBoost ?? 0.85,
                elevenlabs_style: params.elevenlabsStyle ?? 0.1,
                split_scenes_by_sentence: params.splitScenesBySentence ?? true,
            }),
        });
    }
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Compile audio timeline failed: ${err}`);
    }
    return res.json();
}

export async function rewriteVoiceScript(script: string): Promise<{ rewritten_script: string }> {
    const res = await fetch(`${API_URL}/content/rewrite-voice-script`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script }),
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Rewrite voice script failed: ${err}`);
    }
    return res.json();
}

export async function punctuateTranscript(transcript: string): Promise<{ display_transcript: string }> {
    const res = await fetch(`${API_URL}/content/punctuate-transcript`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript }),
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Punctuate transcript failed: ${err}`);
    }
    return res.json();
}

export async function uploadSceneAsset(file: File): Promise<{
    asset_source: 'user_image' | 'user_video';
    asset_url: string;
    thumbnail_url?: string | null;
    width?: number;
    height?: number;
    duration_seconds?: number | null;
}> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_URL}/content/upload-scene-asset`, {
        method: 'POST',
        body: formData,
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Upload scene asset failed: ${err}`);
    }
    return res.json();
}

export type UploadedVideoTranscriptResponse = {
    transcript_text: string;
    duration_seconds: number;
    word_timestamps: WordTimestamp[];
};

export async function extractUploadedVideoTranscript(assetUrl: string): Promise<UploadedVideoTranscriptResponse> {
    const res = await fetch(`${API_URL}/content/extract-uploaded-video-transcript`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asset_url: assetUrl }),
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Extract uploaded video transcript failed: ${err}`);
    }
    return res.json();
}

export type VideoTextFxBeatPayload = {
    id: string;
    text: string;
    start_time_seconds: number;
    end_time_seconds: number;
    layer: string;
    style: string;
    notes: string;
};

export type RenderUploadedVideoTextFxResponse = {
    preview_url: string;
    duration_seconds: number;
};

export async function renderUploadedVideoTextFx(params: {
    sourceVideoUrl: string;
    transcriptText: string;
    stylePreset: string;
    durationSeconds: number;
    beats: VideoTextFxBeatPayload[];
}): Promise<RenderUploadedVideoTextFxResponse> {
    const res = await fetch(`${API_URL}/content/render-uploaded-video-text-fx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            source_video_url: params.sourceVideoUrl,
            transcript_text: params.transcriptText,
            style_preset: params.stylePreset,
            duration_seconds: params.durationSeconds,
            beats: params.beats,
        }),
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Render uploaded video text FX failed: ${err}`);
    }
    return res.json();
}

export async function generateImagePrompt(text: string): Promise<{ prompt: string }> {
    const res = await fetch(`${API_URL}/content/generate-image-prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Generate image prompt failed: ${err}`);
    }
    return res.json();
}

export type GeneratedImageAspect = 'portrait_9_16' | 'square_1_1';

export async function generateImage(prompt: string, style?: string, aspect?: GeneratedImageAspect): Promise<{ image_url: string }> {
    const res = await fetch(`${API_URL}/content/generate-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, style, aspect }),
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Generate image failed: ${err}`);
    }
    return res.json();
}

export type ImageStyle = { slug: string; label: string };

export async function fetchImageStyles(): Promise<{ styles: ImageStyle[]; default: string }> {
    const res = await fetch(`${API_URL}/content/image-styles`);
    if (!res.ok) return { styles: [], default: 'photojournalism' };
    return res.json();
}

export async function generatePromptsFromAnchors(
    script: string,
    anchors: AnchorWord[]
): Promise<{ timeline: { image_url: string, start_time_seconds: number, effect_transition_name?: string }[] }> {
    const res = await fetch(`${API_URL}/content/generate-prompts-from-anchors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script, anchors }),
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Generate prompts from anchors failed: ${err}`);
    }
    return res.json();
}

export async function resolveSceneCandidates(
    script: string,
    scenes: SceneTimelineItem[],
    llmRerank: boolean = true,
): Promise<{ scenes: SceneTimelineItem[] }> {
    const res = await fetch(`${API_URL}/content/resolve-scene-candidates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script, scenes, llm_rerank: llmRerank }),
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Resolve scene candidates failed: ${err}`);
    }
    return res.json();
}

export async function generateSceneAiFallbacks(
    script: string,
    scenes: SceneTimelineItem[],
    maxAiGeneratedScenes: number,
): Promise<{ scenes: SceneTimelineItem[] }> {
    const res = await fetch(`${API_URL}/content/generate-scene-ai-fallbacks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script, scenes, max_ai_generated_scenes: maxAiGeneratedScenes }),
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Generate scene AI fallbacks failed: ${err}`);
    }
    return res.json();
}

export async function generateSingleSceneAiPrompt(
    script: string,
    scene: SceneTimelineItem,
    scenes?: SceneTimelineItem[],
): Promise<{
    prompt: string;
    effect_transition_name?: string | null;
    scene_role?: string | null;
    asset_bias?: string | null;
    scene_fx_name?: string | null;
    scene_fx_strength?: number | null;
    stock_match_rationale?: string | null;
    fx_rationale?: string | null;
    planning_confidence?: number | null;
}> {
    const res = await fetch(`${API_URL}/content/generate-single-scene-ai-prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script, scene, scenes }),
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Generate single scene AI prompt failed: ${err}`);
    }
    return res.json();
}

export async function refetchSceneCandidates(
    script: string,
    scene: SceneTimelineItem,
    queries: string[],
): Promise<{ scene: SceneTimelineItem }> {
    const res = await fetch(`${API_URL}/content/refetch-scene-candidates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script, scene, queries }),
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Refetch scene candidates failed: ${err}`);
    }
    return res.json();
}

export async function generateReel(
    renderer: ReelRenderer,
    episodeId: number | null,
    headline: string,
    startSeconds: number = 0,
    durationSeconds: number = 30,
    customText?: string,
    closingStatement?: string,
    backgroundVideoUrl?: string,
    overlayVideoUrl?: string,
    voice: string = 'nova',
    speed: number = 1.0,
    elevenlabsStability: number = 0.65,
    elevenlabsSimilarityBoost: number = 0.85,
    elevenlabsStyle: number = 0.1,
    ttsProvider: string = 'openai',
    paperId?: number,
    contentType: string = 'latest',
    backgroundClipUrls?: string[],
    anchorTimeline?: { image_url: string, start_time_seconds: number, effect_transition_name?: string }[],
    sceneTimeline?: SceneTimelineItem[],
    audioUrl?: string,
    wordTimestamps?: { word: string, start: number, end: number }[],
    sfxTimeline?: ReelSfxItem[],
    includeWaveform: boolean = true,
): Promise<ReelResponse> {
    let endpoint: string;
    if (episodeId) {
        endpoint = `${API_URL}/podcast/episode/${episodeId}/${renderer === 'premium' ? 'generate-premium-reel' : 'generate-reel'}`;
    } else if (paperId) {
        endpoint = `${API_URL}/content/paper/${paperId}/${renderer === 'premium' ? 'generate-premium-reel' : 'generate-reel'}?content_type=${contentType}`;
    } else {
        endpoint = `${API_URL}/content/custom/${renderer === 'premium' ? 'generate-premium-reel' : 'generate-reel'}`;
    }

    const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            headline,
            start_seconds: startSeconds,
            duration_seconds: durationSeconds,
            voice,
            speed,
            elevenlabs_stability: elevenlabsStability,
            elevenlabs_similarity_boost: elevenlabsSimilarityBoost,
            elevenlabs_style: elevenlabsStyle,
            tts_provider: ttsProvider,
            ...(customText ? { custom_text: customText } : {}),
            ...(closingStatement ? { closing_statement: closingStatement } : {}),
            ...(backgroundVideoUrl ? { background_video_url: backgroundVideoUrl } : {}),
            ...(overlayVideoUrl ? { overlay_video_url: overlayVideoUrl } : {}),
            ...(backgroundClipUrls?.length ? { background_clip_urls: backgroundClipUrls } : {}),
            ...(anchorTimeline?.length ? { anchor_timeline: anchorTimeline } : {}),
            ...(sceneTimeline?.length ? { scene_timeline: sceneTimeline } : {}),
            ...(audioUrl ? { audio_url: audioUrl } : {}),
            ...(wordTimestamps?.length ? { word_timestamps: wordTimestamps } : {}),
            ...(sfxTimeline?.length ? { sfx_timeline: sfxTimeline } : {}),
            include_waveform: includeWaveform,
        }),
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Reel generation failed: ${err}`);
    }
    return res.json();
}

// Impact Analysis
export type ImpactAnalysis = {
    top_pick_id: number;
    top_pick_reason: string;
    paper_notes: { id: number; note: string; fwci: number | null; cited_by_count: number }[];
};

export async function analyzeTopPapers(paperIds: number[]): Promise<ImpactAnalysis> {
    const res = await fetch(`${API_URL}/content/top-papers/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(paperIds),
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Impact analysis failed: ${err}`);
    }
    return res.json();
}

// Content Engines
export async function fetchTopPapers(category: string, startYear: string, endYear: string): Promise<Paper[]> {
    const params = new URLSearchParams();
    if (category) params.append('category', category);
    if (startYear) params.append('start_year', startYear);
    if (endYear) params.append('end_year', endYear);

    const res = await fetch(`${API_URL}/content/top-papers?${params.toString()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch top papers');
    return res.json();
}

export async function fetchTopScientists(query: string, sort: string): Promise<any[]> {
    const params = new URLSearchParams();
    if (query) params.append('query', query);
    if (sort) params.append('sort_by', sort);

    const res = await fetch(`${API_URL}/content/scientists?${params.toString()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch scientists');
    return res.json();
}

export async function fetchDailyScience(query: string, startYear?: string): Promise<Paper[]> {
    const params = new URLSearchParams();
    if (query) params.append('keywords', query);
    if (startYear) params.append('start_year', startYear);

    const res = await fetch(`${API_URL}/content/daily-science?${params.toString()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch daily science');
    return res.json();
}

export async function analyzeDailyScience(paperIds: number[], query: string): Promise<ImpactAnalysis> {
    const params = new URLSearchParams();
    if (query) params.append('query', query);

    const res = await fetch(`${API_URL}/content/daily-science/analyze?${params.toString()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(paperIds),
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Daily science analysis failed: ${err}`);
    }
    return res.json();
}

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
};

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
}): Promise<{ audio_url: string; timeline: AnchorWord[]; scenes: SceneTimelineItem[]; duration: number; word_timestamps: WordTimestamp[]; rewritten_script: string; display_script: string }> {
    let res: Response;
    if (params.audioFile) {
        const formData = new FormData();
        formData.append('audio_file', params.audioFile);
        if (params.transcriptText?.trim()) formData.append('transcript_text', params.transcriptText.trim());
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

export async function generateImage(prompt: string, style?: string): Promise<{ image_url: string }> {
    const res = await fetch(`${API_URL}/content/generate-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, style }),
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

export async function generateReel(
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
    includeWaveform: boolean = true,
): Promise<ReelResponse> {
    let endpoint: string;
    if (episodeId) {
        endpoint = `${API_URL}/podcast/episode/${episodeId}/generate-reel`;
    } else if (paperId) {
        endpoint = `${API_URL}/content/paper/${paperId}/generate-reel?content_type=${contentType}`;
    } else {
        endpoint = `${API_URL}/content/custom/generate-reel`;
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

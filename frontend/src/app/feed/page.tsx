'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
    BookOpen,
    Loader2,
    Play,
    Pause,
    Clock,
    Calendar,
    ChevronDown,
    ChevronUp,
    ChevronLeft,
    ChevronRight,
    ExternalLink
} from 'lucide-react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import {
    fetchLatestPodcast,
    fetchEpisodeDates,
    fetchEpisodeById,
    fetchPapers,
    PodcastEpisode,
    EpisodeDate,
    Paper
} from '@/lib/api';
import { getSupabase, Profile } from '@/lib/supabase';
import styles from './page.module.css';

function formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric'
    });
}

function formatShortDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
    });
}

function formatDuration(seconds: number | null): string {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function isToday(dateString: string): boolean {
    const date = new Date(dateString);
    const today = new Date();
    return date.toDateString() === today.toDateString();
}

function isYesterday(dateString: string): boolean {
    const date = new Date(dateString);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return date.toDateString() === yesterday.toDateString();
}

function getRelativeLabel(dateString: string): string {
    if (isToday(dateString)) return 'Today';
    if (isYesterday(dateString)) return 'Yesterday';
    return formatShortDate(dateString);
}

function AudioPlayer({ audioUrl, duration }: { audioUrl: string | null; duration: number | null }) {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [audioDuration, setAudioDuration] = useState(duration || 0);

    const togglePlay = () => {
        if (!audioRef.current) return;
        if (isPlaying) {
            audioRef.current.pause();
        } else {
            audioRef.current.play();
        }
        setIsPlaying(!isPlaying);
    };

    const handleTimeUpdate = () => {
        if (audioRef.current) {
            setCurrentTime(audioRef.current.currentTime);
        }
    };

    const handleLoadedMetadata = () => {
        if (audioRef.current) {
            setAudioDuration(audioRef.current.duration);
        }
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        const time = parseFloat(e.target.value);
        if (audioRef.current) {
            audioRef.current.currentTime = time;
            setCurrentTime(time);
        }
    };

    const handleEnded = () => {
        setIsPlaying(false);
        setCurrentTime(0);
    };

    if (!audioUrl) {
        return (
            <div className={styles.audioPlayerDisabled}>
                <span>Audio coming soon...</span>
            </div>
        );
    }

    return (
        <div className={styles.audioPlayer}>
            <audio
                ref={audioRef}
                src={audioUrl}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onEnded={handleEnded}
            />
            <button className={styles.playButton} onClick={togglePlay}>
                {isPlaying ? <Pause size={28} /> : <Play size={28} />}
            </button>
            <div className={styles.progressContainer}>
                <input
                    type="range"
                    min={0}
                    max={audioDuration || 100}
                    value={currentTime}
                    onChange={handleSeek}
                    className={styles.progressBar}
                />
                <div className={styles.timeDisplay}>
                    <span>{formatDuration(Math.floor(currentTime))}</span>
                    <span>{formatDuration(Math.floor(audioDuration))}</span>
                </div>
            </div>
        </div>
    );
}

export default function FeedPage() {
    const router = useRouter();
    const [episodeDates, setEpisodeDates] = useState<EpisodeDate[]>([]);
    const [selectedEpisode, setSelectedEpisode] = useState<PodcastEpisode | null>(null);
    const [selectedDateId, setSelectedDateId] = useState<number | null>(null);
    const [episodePapers, setEpisodePapers] = useState<Paper[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingEpisode, setLoadingEpisode] = useState(false);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [checkingProfile, setCheckingProfile] = useState(true);
    const [showTranscript, setShowTranscript] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Check profile on mount
    useEffect(() => {
        let isMounted = true;

        async function loadProfile() {
            try {
                const supabase = getSupabase();
                const { data: { user } } = await supabase.auth.getUser();

                if (!user) {
                    router.push('/login');
                    return;
                }

                const { data: profileData, error } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', user.id)
                    .maybeSingle();

                if (error) throw error;

                if (!profileData || !profileData.interests || profileData.interests.length === 0) {
                    router.push('/onboarding');
                    return;
                }

                if (isMounted) {
                    setProfile(profileData as Profile);
                }
            } catch (error) {
                console.error('Error loading profile:', error);
                router.push('/onboarding');
            } finally {
                if (isMounted) {
                    setCheckingProfile(false);
                }
            }
        }

        loadProfile();
        return () => { isMounted = false; };
    }, [router]);

    // Load episode dates + latest episode on mount
    useEffect(() => {
        if (checkingProfile || !profile) return;

        async function loadInitialData() {
            setLoading(true);
            try {
                // Fetch dates (lightweight) and latest episode in parallel
                const [dates, latestEpisode] = await Promise.all([
                    fetchEpisodeDates(30),
                    fetchLatestPodcast()
                ]);

                setEpisodeDates(dates);
                setSelectedEpisode(latestEpisode);
                setSelectedDateId(latestEpisode.id);

                // Fetch papers for latest episode
                if (latestEpisode.paper_ids && latestEpisode.paper_ids.length > 0) {
                    const papers = await fetchPapers(latestEpisode.paper_ids);
                    setEpisodePapers(papers);
                }
            } catch (error) {
                console.error('Error loading initial data:', error);
            } finally {
                setLoading(false);
            }
        }

        loadInitialData();
    }, [checkingProfile, profile]);

    // Load episode when date is clicked
    const handleDateClick = async (dateItem: EpisodeDate) => {
        if (dateItem.id === selectedDateId) return; // Already selected

        // If the episode has a slug, navigate to its dedicated page
        if (dateItem.slug) {
            router.push(`/episodes/${dateItem.slug}`);
            return;
        }

        // Fallback: load inline if no slug
        setLoadingEpisode(true);
        setSelectedDateId(dateItem.id);
        setShowTranscript(false);
        setEpisodePapers([]);

        try {
            const episode = await fetchEpisodeById(dateItem.id);
            setSelectedEpisode(episode);

            // Fetch papers for this episode
            if (episode.paper_ids && episode.paper_ids.length > 0) {
                const papers = await fetchPapers(episode.paper_ids);
                setEpisodePapers(papers);
            }
        } catch (error) {
            console.error('Error loading episode:', error);
        } finally {
            setLoadingEpisode(false);
        }
    };

    const scrollEpisodes = (direction: 'left' | 'right') => {
        if (scrollRef.current) {
            const scrollAmount = 200;
            scrollRef.current.scrollBy({
                left: direction === 'left' ? -scrollAmount : scrollAmount,
                behavior: 'smooth'
            });
        }
    };

    return (
        <>
            <Header />
            <main className={styles.feedPage}>
                <div className={styles.feedContainer}>
                    {/* Episode Date Selector */}
                    {!loading && episodeDates.length > 0 && (
                        <div className={styles.episodeSelector}>
                            <button
                                className={styles.scrollButton}
                                onClick={() => scrollEpisodes('left')}
                                aria-label="Scroll left"
                            >
                                <ChevronLeft size={20} />
                            </button>
                            <div className={styles.episodePillsWrapper} ref={scrollRef}>
                                <div className={styles.episodePills}>
                                    {episodeDates.map((dateItem) => (
                                        <button
                                            key={dateItem.id}
                                            className={`${styles.episodePill} ${selectedDateId === dateItem.id ? styles.active : ''}`}
                                            onClick={() => handleDateClick(dateItem)}
                                            disabled={loadingEpisode}
                                        >
                                            <span className={styles.pillDate}>
                                                {getRelativeLabel(dateItem.episode_date)}
                                            </span>
                                            <span className={styles.pillTitle}>
                                                {dateItem.title}
                                            </span>
                                            {dateItem.duration_seconds && (
                                                <span className={styles.pillDuration}>
                                                    {formatDuration(dateItem.duration_seconds)}
                                                </span>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <button
                                className={styles.scrollButton}
                                onClick={() => scrollEpisodes('right')}
                                aria-label="Scroll right"
                            >
                                <ChevronRight size={20} />
                            </button>
                        </div>
                    )}

                    {/* Main Content */}
                    {loading ? (
                        <div className={styles.loading}>
                            <Loader2 size={32} className={styles.spin} />
                            <span>Loading your podcasts...</span>
                        </div>
                    ) : episodeDates.length === 0 ? (
                        <div className={styles.emptyState}>
                            <div className={styles.emptyIcon}>
                                <BookOpen size={48} />
                            </div>
                            <h2>No episodes yet</h2>
                            <p>Check back soon for fresh podcast episodes.</p>
                        </div>
                    ) : (
                        <div className={styles.heroEpisode}>
                            {/* Latest Badge */}
                            {selectedEpisode && isToday(selectedEpisode.episode_date) && (
                                <div className={styles.latestBadgeContainer}>
                                    <span className={styles.latestBadge}>Latest Episode</span>
                                </div>
                            )}

                            {/* Hero Card */}
                            {loadingEpisode ? (
                                <div className={styles.heroCardLoading}>
                                    <Loader2 size={32} className={styles.spin} />
                                    <span>Loading episode...</span>
                                </div>
                            ) : selectedEpisode && (
                                <div className={styles.heroCard}>
                                    <div className={styles.heroHeader}>
                                        <div className={styles.heroMeta}>
                                            <span className={styles.heroDate}>
                                                <Calendar size={16} />
                                                {formatDate(selectedEpisode.episode_date)}
                                            </span>
                                            {selectedEpisode.duration_seconds && (
                                                <span className={styles.heroDuration}>
                                                    <Clock size={16} />
                                                    {formatDuration(selectedEpisode.duration_seconds)} min
                                                </span>
                                            )}
                                        </div>
                                        <h1 className={styles.heroTitle}>{selectedEpisode.title}</h1>
                                    </div>

                                    <AudioPlayer
                                        audioUrl={selectedEpisode.audio_url}
                                        duration={selectedEpisode.duration_seconds}
                                    />

                                    {/* Transcript Section */}
                                    {selectedEpisode.script && (
                                        <div className={styles.transcriptSection}>
                                            <h3 className={styles.transcriptLabel}>Transcript</h3>
                                            <div className={styles.transcriptPreview}>
                                                {selectedEpisode.script.split('\n\n').slice(0, 2).map((paragraph, i) => (
                                                    <p key={i}>{paragraph}</p>
                                                ))}
                                            </div>
                                            {selectedEpisode.script.split('\n\n').length > 2 && (
                                                <>
                                                    {showTranscript && (
                                                        <div className={styles.transcriptFull}>
                                                            {selectedEpisode.script.split('\n\n').slice(2).map((paragraph, i) => (
                                                                <p key={i}>{paragraph}</p>
                                                            ))}
                                                        </div>
                                                    )}
                                                    <button
                                                        className={styles.readMoreButton}
                                                        onClick={() => setShowTranscript(!showTranscript)}
                                                    >
                                                        {showTranscript ? (
                                                            <>Show Less <ChevronUp size={16} /></>
                                                        ) : (
                                                            <>Read More <ChevronDown size={16} /></>
                                                        )}
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    )}

                                    {/* Paper Sources */}
                                    {episodePapers.length > 0 && (
                                        <div className={styles.sourcesSection}>
                                            <h3 className={styles.sourcesLabel}>Source Papers</h3>
                                            <div className={styles.sourcesList}>
                                                {episodePapers.map((paper) => (
                                                    <a
                                                        key={paper.id}
                                                        href={paper.doi || paper.pdf_url || '#'}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className={styles.sourceLink}
                                                    >
                                                        <ExternalLink size={16} className={styles.sourceLinkIcon} />
                                                        <span className={styles.sourceLinkTitle}>
                                                            {paper.headline || paper.title}
                                                        </span>
                                                    </a>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </main>
            <Footer />
        </>
    );
}

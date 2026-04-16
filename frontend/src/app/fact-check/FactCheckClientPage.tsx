'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Loader2, Microscope, SearchCheck, Sparkles, X } from 'lucide-react';

import {
    analyzePublicFactCheckClaim,
    extractFactCheckClaims,
    ingestYoutubeForPublicFactCheck,
    type FactCheckClaim,
    type FactCheckPaperMatch,
    type PublicFactCheckAnalysis,
    type PublicFactCheckVideo,
} from '@/lib/api';

import styles from './page.module.css';

function formatDuration(totalSeconds: number): string {
    const seconds = Math.max(0, Math.round(totalSeconds || 0));
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function getPaperHref(paper: FactCheckPaperMatch): string | null {
    if (paper.paper_url?.trim()) {
        return paper.paper_url;
    }
    if (paper.doi?.trim()) {
        return `https://doi.org/${paper.doi}`;
    }
    return null;
}

function normalizeError(error: unknown): string {
    if (error instanceof Error && error.message.trim()) {
        return error.message;
    }
    return 'Something went wrong. Please try again.';
}

function trustTone(label: string): 'strong' | 'mixed' | 'weak' {
    const normalized = label.toLowerCase();
    if (normalized.includes('strong') || normalized.includes('mostly supported')) {
        return 'strong';
    }
    if (normalized.includes('mixed')) {
        return 'mixed';
    }
    return 'weak';
}

function paperPriority(paper: FactCheckPaperMatch): number {
    const stance = String(paper.stance || '').toLowerCase();
    if (stance === 'supports') return 0;
    if (stance === 'mixed') return 1;
    if (stance === 'refutes') return 2;
    return 3;
}

export function FactCheckClientPage() {
    const [youtubeUrl, setYoutubeUrl] = useState('');
    const [video, setVideo] = useState<PublicFactCheckVideo | null>(null);
    const [claims, setClaims] = useState<FactCheckClaim[]>([]);
    const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);
    const [customClaimText, setCustomClaimText] = useState('');
    const [analysis, setAnalysis] = useState<PublicFactCheckAnalysis | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [ingesting, setIngesting] = useState(false);
    const [analyzing, setAnalyzing] = useState(false);
    const [isHowItWorksOpen, setIsHowItWorksOpen] = useState(false);

    const selectedClaim = useMemo(
        () => claims.find((claim) => claim.claim_id === selectedClaimId) ?? null,
        [claims, selectedClaimId],
    );
    const trimmedCustomClaim = customClaimText.trim();
    const executedMode = trimmedCustomClaim ? 'custom' : selectedClaim ? 'selected' : 'none';
    const hasExtractionResult = Boolean(video) && !ingesting;
    const visiblePapers = useMemo(() => {
        if (!analysis?.papers?.length) {
            return [];
        }
        return [...analysis.papers]
            .filter((paper) => String(paper.stance || '').toLowerCase() !== 'tangential')
            .sort((a, b) => {
                const priorityDelta = paperPriority(a) - paperPriority(b);
                if (priorityDelta !== 0) {
                    return priorityDelta;
                }
                const relevanceDelta = Number(b.relevance_score || 0) - Number(a.relevance_score || 0);
                if (relevanceDelta !== 0) {
                    return relevanceDelta;
                }
                return Number(b.cited_by_count || 0) - Number(a.cited_by_count || 0);
            });
    }, [analysis]);

    useEffect(() => {
        if (!isHowItWorksOpen) {
            return undefined;
        }

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setIsHowItWorksOpen(false);
            }
        };

        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [isHowItWorksOpen]);

    const handleSubmit = async () => {
        const nextUrl = youtubeUrl.trim();
        if (!nextUrl) {
            setError('Paste a YouTube Short link first.');
            return;
        }

        setIngesting(true);
        setError(null);
        setAnalysis(null);
        setVideo(null);
        setClaims([]);
        setSelectedClaimId(null);
        setCustomClaimText('');

        try {
            const job = await ingestYoutubeForPublicFactCheck(nextUrl);
            const claimPayload = await extractFactCheckClaims(job.job_id);
            setVideo(job);
            setClaims(claimPayload.claims);
            setSelectedClaimId(claimPayload.claims[0]?.claim_id ?? null);
        } catch (err) {
            setError(normalizeError(err));
        } finally {
            setIngesting(false);
        }
    };

    const handleAnalyze = async () => {
        if (!video) {
            setError('Paste a YouTube Short link and extract claims first.');
            return;
        }
        if (!trimmedCustomClaim && !selectedClaimId) {
            setError('Pick a claim or type your own claim before analyzing.');
            return;
        }

        setAnalyzing(true);
        setError(null);
        setAnalysis(null);

        try {
            const result = await analyzePublicFactCheckClaim({
                jobId: video.job_id,
                claimId: selectedClaimId,
                customClaimText: trimmedCustomClaim,
            });
            setAnalysis(result);
        } catch (err) {
            setError(normalizeError(err));
        } finally {
            setAnalyzing(false);
        }
    };

    return (
        <>
            <section className={styles.hero}>
                <div className={styles.heroGlow} />
                <div className={styles.heroInner}>
                    <div className={styles.heroBadge}>
                        <SearchCheck size={16} />
                        Paper-first YouTube claim checks
                    </div>
                    <h1 className={styles.heroTitle}>
                        Paste a YouTube Short.
                        <span> Get a research-backed verdict.</span>
                    </h1>
                    <p className={styles.heroSubtitle}>
                        We extract the strongest scientific claims from a Youtube Short, then evaluate them
                        against real papers so you can see what holds up.
                    </p>

                    <div className={styles.stepRail}>
                        <div className={styles.stepPill}><span>01</span>Paste link</div>
                        <div className={styles.stepPill}><span>02</span>Pick or write claim</div>
                        <div className={styles.stepPill}><span>03</span>Review verdict</div>
                    </div>

                    <div className={styles.heroPanel}>
                        <div className={styles.inputRow}>
                            <input
                                type="url"
                                value={youtubeUrl}
                                onChange={(event) => setYoutubeUrl(event.target.value)}
                                className={styles.urlInput}
                                placeholder="https://www.youtube.com/shorts/..."
                                aria-label="YouTube Short URL"
                            />
                            <button
                                type="button"
                                onClick={handleSubmit}
                                disabled={ingesting || !youtubeUrl.trim()}
                                className={styles.heroButton}
                            >
                                {ingesting ? <Loader2 size={18} className={styles.spinningIcon} /> : <Sparkles size={18} />}
                                {ingesting ? 'Fetching claims...' : 'Extract Claims'}
                            </button>
                        </div>
                        <div className={styles.heroMeta}>
                            <button type="button" className={styles.heroMetaLink} onClick={() => setIsHowItWorksOpen(true)}>
                                How does this work?
                            </button>
                        </div>
                        {ingesting && (
                            <div className={styles.processingNote}>
                                <Loader2 size={16} className={styles.spinningIcon} />
                                Extracting the strongest research-checkable claims from this Short...
                            </div>
                        )}
                        {error && <div className={styles.errorBanner}>{error}</div>}
                        <div className={styles.disclaimerCard}>
                            <div className={styles.disclaimerTitle}>Disclaimer</div>
                            <p>
                                This is for educational use only. We do not provide medical, supplement, treatment,
                                nutrition, or financial recommendations, and we do not take payment to alter verdicts.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {isHowItWorksOpen && (
                <div
                    className={styles.modalOverlay}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="fact-check-how-it-works-title"
                    onClick={() => setIsHowItWorksOpen(false)}
                >
                    <div className={styles.modalCard} onClick={(event) => event.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <div>
                                <div className={styles.panelEyebrow}>Method</div>
                                <h2 id="fact-check-how-it-works-title">How this works</h2>
                            </div>
                            <button
                                type="button"
                                className={styles.modalClose}
                                onClick={() => setIsHowItWorksOpen(false)}
                                aria-label="Close how this works"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className={styles.modalGrid}>
                            <article className={styles.modalPanel}>
                                <h3>Best video fit</h3>
                                <p>
                                    This works best on YouTube Shorts with a clear, scientifically testable claim,
                                    especially around health, nutrition, biology, medicine, behavior, or mechanism.
                                </p>
                            </article>

                            <article className={styles.modalPanel}>
                                <h3>How ratings work</h3>
                                <p>
                                    Ratings are weighted by the evidence mix. Direct human evidence counts more than
                                    weaker indirect, animal, cell, or mechanistic support, and strong human refutation
                                    pulls the score down harder.
                                </p>
                            </article>

                            <article className={styles.modalPanel}>
                                <h3>Where papers come from</h3>
                                <p>
                                    We fetch papers primarily through OpenAlex, score them for relevance, and only keep
                                    fallback paper suggestions when they can be verified back against OpenAlex.
                                </p>
                            </article>

                            <article className={styles.modalPanel}>
                                <h3>Where LLMs help</h3>
                                <p>
                                    LLMs help extract claims, expand search queries, and classify paper relevance, but
                                    the final evidence set is paper-verified and the final score is computed with a
                                    deterministic weighting function.
                                </p>
                            </article>
                        </div>
                    </div>
                </div>
            )}

            {hasExtractionResult && (
                <section className={styles.workspace}>
                    <div className={styles.flowStack}>
                        <div className={styles.panel}>
                            <div className={styles.panelHeader}>
                                <div>
                                    <div className={styles.panelEyebrow}>Step 2</div>
                                    <h2>Choose or refine the claim</h2>
                                </div>
                                {claims.length > 0 && (
                                    <div className={styles.countBadge}>{claims.length} found</div>
                                )}
                            </div>

                            {video && (
                                <div className={styles.videoMetaCard}>
                                    <div>
                                        <div className={styles.videoTitle}>{video.title}</div>
                                        <div className={styles.videoMetaLine}>
                                            <span>{video.channel_name || 'Unknown channel'}</span>
                                            <span>{formatDuration(video.duration_seconds)}</span>
                                        </div>
                                    </div>
                                    <a href={video.source_url} target="_blank" rel="noreferrer" className={styles.sourceLink}>
                                        Open original YouTube Short
                                    </a>
                                </div>
                            )}

                            {claims.length > 0 ? (
                                <div className={styles.claimList}>
                                    {claims.map((claim) => {
                                        const isSelected = claim.claim_id === selectedClaimId;
                                        return (
                                            <button
                                                key={claim.claim_id}
                                                type="button"
                                                className={`${styles.claimCard} ${isSelected ? styles.claimCardSelected : ''}`}
                                                onClick={() => setSelectedClaimId(claim.claim_id)}
                                            >
                                                <div className={styles.claimCardTop}>
                                                    <span className={styles.claimConfidence}>
                                                        {Math.round((claim.factuality_confidence || 0) * 100)}%
                                                    </span>
                                                    <span className={styles.claimTime}>
                                                        {claim.start_time_seconds.toFixed(1)}s to {claim.end_time_seconds.toFixed(1)}s
                                                    </span>
                                                </div>
                                                <div className={styles.claimText}>{claim.claim_text}</div>
                                                <div className={styles.claimExcerpt}>{claim.transcript_excerpt}</div>
                                            </button>
                                        );
                                    })}
                                </div>
                            ) : (
                                <p className={styles.emptyState}>
                                    We finished extraction, but no strong research-checkable claims were found in this Short.
                                </p>
                            )}

                            <div className={styles.refineBlock}>
                                <label className={styles.fieldLabel} htmlFor="custom-claim">
                                    Want to sharpen the wording?
                                </label>
                                <textarea
                                    id="custom-claim"
                                    value={customClaimText}
                                    onChange={(event) => setCustomClaimText(event.target.value)}
                                    className={styles.claimTextarea}
                                    placeholder="Example: Creatine improves memory and cognitive performance in healthy adults."
                                />

                                <div className={styles.modeHint}>
                                    {executedMode === 'custom'
                                        ? 'Your typed claim will override the selected extracted claim for this analysis.'
                                        : selectedClaim
                                            ? 'No custom text entered, so we will analyze the selected extracted claim.'
                                            : 'Pick a claim card or enter your own wording to begin.'}
                                </div>

                                <button
                                    type="button"
                                    onClick={handleAnalyze}
                                    disabled={analyzing || !video || (!trimmedCustomClaim && !selectedClaim)}
                                    className={styles.analyzeButton}
                                >
                                    {analyzing ? <Loader2 size={18} className={styles.spinningIcon} /> : <Microscope size={18} />}
                                    {analyzing ? 'Analyzing claim...' : 'Analyze Claim'}
                                </button>
                            </div>
                        </div>

                        {analysis && (
                            <div className={`${styles.panel} ${styles.verdictPanel}`}>
                                <div className={styles.panelHeader}>
                                    <div>
                                        <div className={styles.panelEyebrow}>Step 3</div>
                                        <h2>Research verdict</h2>
                                    </div>
                                </div>

                                <div className={styles.analysisStack}>
                                    <div className={styles.resultHeader}>
                                        <div className={`${styles.trustBadge} ${styles[`trustBadge${trustTone(analysis.trust_label).charAt(0).toUpperCase()}${trustTone(analysis.trust_label).slice(1)}`]}`}>
                                            {analysis.trust_label}
                                        </div>
                                        <div className={styles.ratingValue}>
                                            {analysis.overall_rating.toFixed(1)}
                                            <span className={styles.ratingDenominator}>/ 5</span>
                                        </div>
                                    </div>

                                    <div className={styles.executedClaim}>
                                        <div className={styles.resultLabel}>Analyzed claim</div>
                                        <p>{analysis.executed_claim_text}</p>
                                    </div>

                                    <div className={styles.summaryCard}>
                                        <div className={styles.resultLabel}>Verdict</div>
                                        <p>{analysis.verdict_summary}</p>
                                    </div>

                                    <div className={styles.summaryCard}>
                                        <div className={styles.resultLabel}>Why we landed there</div>
                                        <p>{analysis.thirty_second_summary}</p>
                                    </div>

                                    <div className={styles.statsRow}>
                                        <div className={styles.statTile}>
                                            <span>Support</span>
                                            <strong>{analysis.support_count}</strong>
                                        </div>
                                        <div className={styles.statTile}>
                                            <span>Mixed</span>
                                            <strong>{analysis.mixed_count}</strong>
                                        </div>
                                        <div className={styles.statTile}>
                                            <span>Refute</span>
                                            <strong>{analysis.refute_count}</strong>
                                        </div>
                                    </div>

                                    <div className={styles.sourcesHeader}>
                                        <div>
                                            <div className={styles.resultLabel}>Sources</div>
                                            <p>Paper-first evidence we considered for this verdict.</p>
                                        </div>
                                    </div>

                                        <div className={styles.paperList}>
                                            {visiblePapers.length > 0 ? visiblePapers.map((paper, index) => {
                                                const href = getPaperHref(paper);
                                                return (
                                                    <article key={`${paper.title}-${index}`} className={styles.paperCard}>
                                                    <div className={styles.paperCardTop}>
                                                        <div>
                                                            <h3>{paper.title}</h3>
                                                            <div className={styles.paperMeta}>
                                                                {[paper.year, paper.journal].filter(Boolean).join(' • ') || 'Research paper'}
                                                            </div>
                                                        </div>
                                                        <div className={styles.paperStance}>{paper.stance}</div>
                                                    </div>
                                                    {paper.evidence_note && (
                                                        <p className={styles.paperNote}>{paper.evidence_note}</p>
                                                    )}
                                                    {href && (
                                                        <a href={href} target="_blank" rel="noreferrer" className={styles.sourceLink}>
                                                            Read source <ArrowRight size={15} />
                                                        </a>
                                                    )}
                                                </article>
                                            );
                                            }) : (
                                                <p className={styles.emptyState}>
                                                    We finished the analysis, but there were no non-tangential source cards available to show for this claim.
                                                </p>
                                            )}
                                        </div>
                                </div>
                            </div>
                        )}
                    </div>
                </section>
            )}

            <section className={styles.footerCta}>
                <div className={styles.footerCtaCard}>
                    <div>
                        <div className={styles.panelEyebrow}>Built by The Eureka Feed</div>
                        <h2>Think we got something wrong?</h2>
                        <p>
                            If you see an inaccuracy, missing source, or misleading framing, contact us and we&apos;ll review it.
                        </p>
                    </div>
                    <div className={styles.footerActions}>
                        <Link href="/contact" className={styles.footerCtaButton}>
                            Contact Us
                        </Link>
                        <a
                            href="https://buymeacoffee.com/theeurekafeed"
                            target="_blank"
                            rel="noreferrer"
                            className={styles.footerSupportButton}
                        >
                            Buy Me a Coffee
                        </a>
                    </div>
                </div>
            </section>
        </>
    );
}

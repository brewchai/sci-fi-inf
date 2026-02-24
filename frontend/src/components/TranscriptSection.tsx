'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronUp, BookOpen, Headphones, ArrowRight } from 'lucide-react';
import styles from '../app/page.module.css';

interface TranscriptSectionProps {
    transcript: string;
    papers: { title: string; url: string }[];
    /** Pass false on the landing page — hides paper links and shows a sign-up CTA instead */
    showPaperLinks?: boolean;
}

export function TranscriptSection({ transcript, papers, showPaperLinks = true }: TranscriptSectionProps) {
    const [expanded, setExpanded] = useState(false);

    const paragraphs = transcript.split('\n\n').filter(p => p.trim());
    const previewParagraphs = paragraphs.slice(0, 2);
    const remainingParagraphs = paragraphs.slice(2);

    return (
        <div className={styles.transcript}>
            {previewParagraphs.map((p, i) => (
                <p key={i}>{p}</p>
            ))}

            {expanded && remainingParagraphs.map((p, i) => (
                <p key={i + 2} className={i === remainingParagraphs.length - 1 ? styles.transcriptSignoff : undefined}>
                    {p}
                </p>
            ))}

            {remainingParagraphs.length > 0 && (
                <button
                    className={styles.readMoreBtn}
                    onClick={() => setExpanded(!expanded)}
                >
                    {expanded ? (
                        <>Read less <ChevronUp size={16} /></>
                    ) : (
                        <>Read more <ChevronDown size={16} /></>
                    )}
                </button>
            )}

            {showPaperLinks ? (
                <div className={styles.paperLinks}>
                    <h4>📄 Papers featured in this episode</h4>
                    <ul>
                        {papers.map((paper, i) => (
                            <li key={i}>
                                <a href={paper.url} target="_blank" rel="noopener noreferrer">
                                    {paper.title}
                                </a>
                            </li>
                        ))}
                    </ul>
                </div>
            ) : (
                <div className={styles.episodeCtas}>
                    <div className={styles.episodeCtaCard}>
                        <BookOpen size={22} className={styles.episodeCtaIcon} />
                        <h4>Read the source papers</h4>
                        <p>Sign up to access the original research papers discussed in this episode, with direct links and summaries.</p>
                        <Link href="/login?signup=true" className={styles.episodeCtaButton}>
                            Sign Up Free <ArrowRight size={15} />
                        </Link>
                    </div>
                    <div className={styles.episodeCtaCard}>
                        <Headphones size={22} className={styles.episodeCtaIcon} />
                        <h4>Get today&apos;s episode</h4>
                        <p>Members get new episodes every morning — the latest research delivered before your first coffee.</p>
                        <Link href="/login?signup=true" className={styles.episodeCtaButton}>
                            Start Listening <ArrowRight size={15} />
                        </Link>
                    </div>
                </div>
            )}
        </div>
    );
}

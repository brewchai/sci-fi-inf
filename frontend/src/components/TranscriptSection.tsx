'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import styles from '../app/page.module.css';

interface TranscriptSectionProps {
    transcript: string;
    papers: { title: string; url: string }[];
}

export function TranscriptSection({ transcript, papers }: TranscriptSectionProps) {
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
        </div>
    );
}

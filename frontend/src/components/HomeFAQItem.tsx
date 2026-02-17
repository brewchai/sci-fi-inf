'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronUp } from 'lucide-react';
import styles from '../app/page.module.css';

export function HomeFAQItem({ question, answer }: { question: string; answer: string }) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className={styles.faqItem}>
            <button
                className={styles.faqQuestion}
                onClick={() => setIsOpen(!isOpen)}
                aria-expanded={isOpen}
            >
                <span>{question}</span>
                {isOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </button>
            {isOpen && (
                <div className={styles.faqAnswer}>
                    <p>{answer}</p>
                    {question === "Can I trust the content?" && (
                        <p><Link href="/contact" className={styles.faqLink}>Contact us →</Link></p>
                    )}
                </div>
            )}
        </div>
    );
}

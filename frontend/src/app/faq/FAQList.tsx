'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { faqs } from '@/lib/faqData';
import styles from './page.module.css';


export function FAQItem({ question, answer }: { question: string; answer: string }) {
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

export function FAQList() {
    return (
        <div className={styles.faqList}>
            {faqs.map((faq, i) => (
                <FAQItem key={i} question={faq.question} answer={faq.answer} />
            ))}
        </div>
    );
}

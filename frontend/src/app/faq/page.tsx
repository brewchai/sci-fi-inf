'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import styles from './page.module.css';

const faqs = [
    {
        question: "What is The Eureka Feed?",
        answer: "A daily podcast that transforms cutting-edge academic research into 3-minute audio briefings. We scan thousands of papers, select the most impactful ones, and explain them in plain language—no PhD required."
    },
    {
        question: "Do you use AI?",
        answer: "Our curation algorithm is deterministic—no AI involved in selecting papers. We score them based on recency, citation potential, and topic diversity. AI only comes into play afterward: to summarize the text and generate the audio narration."
    },
    {
        question: "Can I trust the content?",
        answer: "Every summary is grounded in real papers with real text, and we link to the original source so you can verify. We're not perfect—if you spot an error, please contact us."
    },
    {
        question: "How do you curate papers?",
        answer: "We pull from OpenAlex daily. Papers are scored on recency, citation potential, topic diversity, and accessibility. Top picks are summarized and combined into a cohesive briefing."
    },
    {
        question: "Who is this for?",
        answer: "Curious professionals, lifelong learners, and anyone who wants to stay informed about science without academic jargon. If you enjoy Huberman Lab or Hacker News, you'll feel at home."
    },
    {
        question: "How often do you publish?",
        answer: "Every weekday morning. Each episode covers a handful of notable recent papers."
    },
];

function FAQItem({ question, answer }: { question: string; answer: string }) {
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

export default function FAQPage() {
    return (
        <>
            <Header />
            <main className={styles.main}>
                <section className={styles.faqSection}>
                    <div className={styles.sectionHeader}>
                        <h1>Frequently Asked Questions</h1>
                        <p>Everything you need to know about The Eureka Feed.</p>
                    </div>

                    <div className={styles.faqList}>
                        {faqs.map((faq, i) => (
                            <FAQItem key={i} question={faq.question} answer={faq.answer} />
                        ))}
                    </div>
                </section>
            </main>
            <Footer />
        </>
    );
}

import type { Metadata } from 'next';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { FAQList } from './FAQList';
import { faqs } from '@/lib/faqData';
import styles from './page.module.css';

export const metadata: Metadata = {
    title: 'Frequently Asked Questions',
    description: 'Common questions about The Eureka Feed — how we curate papers, whether we use AI, who it\'s for, and how often we publish.',
    alternates: {
        canonical: '/faq',
    },
};

// JSON-LD FAQPage structured data for rich search results
function FAQJsonLd() {
    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faqs.map((faq) => ({
            '@type': 'Question',
            name: faq.question,
            acceptedAnswer: {
                '@type': 'Answer',
                text: faq.answer,
            },
        })),
    };

    return (
        <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
    );
}

export default function FAQPage() {
    return (
        <>
            <FAQJsonLd />
            <Header />
            <main className={styles.main}>
                <section className={styles.faqSection}>
                    <div className={styles.sectionHeader}>
                        <h1>Frequently Asked Questions</h1>
                        <p>Everything you need to know about The Eureka Feed.</p>
                    </div>

                    <FAQList />
                </section>
            </main>
            <Footer />
        </>
    );
}

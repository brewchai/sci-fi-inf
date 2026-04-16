import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, FlaskConical, Scale, SearchCheck, Shield } from 'lucide-react';

import { Footer } from '@/components/Footer';
import { Header } from '@/components/Header';

import styles from './page.module.css';

const claimCheckFaqs = [
    {
        question: 'What kinds of videos work best?',
        answer:
            'Short YouTube videos work best when they make a clear, scientifically testable claim. The strongest inputs are videos with concrete statements about health, nutrition, biology, medicine, behavior, mechanisms, or cause-and-effect relationships. The weakest inputs are pure opinion, spiritual framing, history-only clips, motivation, or broad commentary with nothing a paper could realistically test.',
        bullets: [
            'Best fit: a YouTube Short with one or more explicit claims like "creatine improves memory" or "x increases inflammation."',
            'Usually weaker: stories, philosophical takes, personal anecdotes, political commentary, and claims that are too vague to search in the literature.',
            'Transcripts matter: if the spoken words are unclear or YouTube does not expose a usable transcript, extraction can fail or miss the strongest claim.',
        ],
    },
    {
        question: 'How do you calculate the rating?',
        answer:
            'The 1 to 5 rating is not a popularity score. It is a weighted evidence score based on the papers we found for the claim. Stronger, more direct human evidence counts more than indirect, animal, cell, or mechanistic evidence.',
        bullets: [
            'We count whether papers support, refute, or show mixed evidence for the claim.',
            'We weight study type differently: meta-analyses and systematic reviews count more than single trials, observational studies, animal work, or in vitro studies.',
            'We also weight population and directness: direct human evidence matters most, then indirect human evidence, then mechanistic or preclinical evidence.',
            'Relevant papers with better direct match to the claim count more. Citation counts add only a small bonus, not a dominant one.',
            'Direct human studies that clearly refute a claim are penalized more heavily than weak mechanistic support is rewarded.',
            'Claims supported mostly by indirect or mechanistic evidence are capped so they do not look stronger than the evidence really is.',
        ],
    },
    {
        question: 'What sources do you use to fetch papers?',
        answer:
            'Our paper retrieval is paper-first and OpenAlex-first. We search OpenAlex directly, score the results for claim relevance, and verify fallback candidates back against OpenAlex before they are shown as evidence.',
        bullets: [
            'Primary retrieval source: OpenAlex.',
            'We use title, abstract, DOI, publication year, source metadata, and citation counts when available.',
            'If the first retrieval pass is thin, we broaden the OpenAlex search.',
            'In some cases an LLM may suggest candidate papers, but they are only kept if they can be verified against OpenAlex. Unverified paper suggestions are not treated as evidence.',
        ],
    },
    {
        question: 'Where do LLMs show up in the workflow?',
        answer:
            'LLMs are used as assistants in several steps, but they are not the paper database and they are not allowed to replace the evidence layer.',
        bullets: [
            'Claim extraction: identifying the strongest research-checkable claims from the transcript.',
            'Query expansion: turning a social-media claim into better literature-search queries.',
            'Paper assessment: helping classify whether a paper supports, refutes, is mixed, or is tangential to the claim.',
            'Summaries: drafting the verdict summary and short rationale in plain language.',
            'Important guardrail: the final displayed paper set is verified through OpenAlex, and the final rating is computed with a deterministic weighting function rather than whatever number the model first suggests.',
        ],
    },
    {
        question: 'Do you take money from creators, brands, journals, or researchers?',
        answer:
            'No. This claim-check workflow is not pay-to-play. We do not sell favorable verdicts, suppress unfavorable verdicts for payment, or let outside sponsors buy a better rating.',
        bullets: [
            'We do not accept payment to alter a claim-check result.',
            'We do not sell creator-specific "approval" or paper-placement packages inside the verdict.',
            'If we ever introduce sponsorship elsewhere on the site, that should not influence claim-check scoring or paper selection.',
        ],
    },
    {
        question: 'Do these verdicts count as medical or personal recommendations?',
        answer:
            'No. These pages are for informational and educational use only. A claim check is not medical advice, diagnosis, treatment guidance, nutrition counseling, financial advice, or a recommendation to take, stop, buy, or avoid anything.',
        bullets: [
            'We summarize what the retrieved evidence appears to say about a claim.',
            'We do not tell you what to do with your body, your treatment plan, your supplements, or your money.',
            'If a claim touches health or safety, the verdict should be treated as a starting point for scrutiny, not a substitute for professional care.',
        ],
    },
];

export const metadata: Metadata = {
    title: 'Claim Check FAQ',
    description: 'How The Eureka Feed claim checker works: which videos fit, how ratings are calculated, what paper sources we use, where LLMs help, and what we do not recommend.',
    alternates: {
        canonical: 'https://www.theeurekafeed.com/fact-check/faq',
    },
    openGraph: {
        title: 'Claim Check FAQ | The Eureka Feed',
        description: 'Methodology, ratings, sources, LLM usage, and disclaimers for our YouTube claim checker.',
        url: 'https://www.theeurekafeed.com/fact-check/faq',
    },
    twitter: {
        card: 'summary_large_image',
        title: 'Claim Check FAQ | The Eureka Feed',
        description: 'Methodology, ratings, sources, LLM usage, and disclaimers for our YouTube claim checker.',
    },
};

function FAQJsonLd() {
    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: claimCheckFaqs.map((item) => ({
            '@type': 'Question',
            name: item.question,
            acceptedAnswer: {
                '@type': 'Answer',
                text: [item.answer, ...item.bullets].join(' '),
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

export default function FactCheckFAQPage() {
    return (
        <>
            <FAQJsonLd />
            <Header />
            <main className={styles.main}>
                <section className={styles.hero}>
                    <div className={styles.heroGlow} />
                    <div className={styles.heroInner}>
                        <Link href="/fact-check" className={styles.backLink}>
                            <ArrowLeft size={16} />
                            Back to Claim Check
                        </Link>
                        <div className={styles.kicker}>Methodology + FAQ</div>
                        <h1 className={styles.title}>How claim checker works</h1>
                        <p className={styles.subtitle}>
                            What kinds of videos work, how the score is calculated, where our papers come from,
                            where LLMs help, and what this product does not do.
                        </p>

                        <div className={styles.signalGrid}>
                            <div className={styles.signalCard}>
                                <SearchCheck size={18} />
                                <span>Paper-first retrieval</span>
                            </div>
                            <div className={styles.signalCard}>
                                <Scale size={18} />
                                <span>Weighted evidence scoring</span>
                            </div>
                            <div className={styles.signalCard}>
                                <FlaskConical size={18} />
                                <span>Research-checkable claims only</span>
                            </div>
                            <div className={styles.signalCard}>
                                <Shield size={18} />
                                <span>No paid verdicts or recommendations</span>
                            </div>
                        </div>
                    </div>
                </section>

                <section className={styles.section}>
                    <div className={styles.sectionInner}>
                        <div className={styles.sectionHeader}>
                            <h2>Frequently asked questions</h2>
                            <p>
                                This page is specific to the YouTube claim-check workflow, not the broader Eureka Feed product.
                            </p>
                        </div>

                        <div className={styles.faqList}>
                            {claimCheckFaqs.map((item) => (
                                <article key={item.question} className={styles.faqCard}>
                                    <h3>{item.question}</h3>
                                    <p>{item.answer}</p>
                                    <ul className={styles.bulletList}>
                                        {item.bullets.map((bullet) => (
                                            <li key={bullet}>{bullet}</li>
                                        ))}
                                    </ul>
                                </article>
                            ))}
                        </div>
                    </div>
                </section>
            </main>
            <Footer />
        </>
    );
}

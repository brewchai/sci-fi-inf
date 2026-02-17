import Link from 'next/link';
import {
    Sparkles,
    Brain,
    ArrowRight,
    Newspaper,
    Filter,
} from 'lucide-react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { AudioPlayer } from '@/components/AudioPlayer';
import { TranscriptSection } from '@/components/TranscriptSection';
import { HomeFAQItem } from '@/components/HomeFAQItem';
import { faqs } from '@/lib/faqData';
import { fetchLatestPodcast, fetchPapers } from '@/lib/api';
import styles from './page.module.css';

const categories = [
    { slug: 'ai_tech', emoji: '🤖', name: 'AI & Technology', desc: 'Machine learning, algorithms, computing' },
    { slug: 'health_medicine', emoji: '💊', name: 'Health & Medicine', desc: 'Clinical research, treatments, wellness' },
    { slug: 'brain_mind', emoji: '🧠', name: 'Brain & Mind', desc: 'Neuroscience, psychology, cognition' },
    { slug: 'climate_environment', emoji: '🌍', name: 'Climate & Environment', desc: 'Sustainability, ecology, earth science' },
    { slug: 'physics', emoji: '⚛️', name: 'Physics & Space', desc: 'Quantum mechanics, astronomy, cosmology' },
    { slug: 'biology', emoji: '🧬', name: 'Biology & Genetics', desc: 'Molecular biology, genomics, life sciences' },
    { slug: 'energy', emoji: '⚡', name: 'Energy & Sustainability', desc: 'Renewables, clean tech, power' },
    { slug: 'economics', emoji: '💰', name: 'Economics & Finance', desc: 'Markets, policy, financial research' },
    { slug: 'chemistry', emoji: '🔬', name: 'Chemistry & Materials', desc: 'Chemical processes, new materials' },
    { slug: 'food_agriculture', emoji: '🌾', name: 'Food & Agriculture', desc: 'Nutrition, farming, food science' },
];

const features = [
    '4,000+ papers scanned weekly',
    '12 research categories covered',
    '5 min read · 3 min listen',
    'Direct links to original papers',
    'Get the science before headlines distort it',
    'Mobile-friendly, delivered daily',
];



// JSON-LD structured data
function JsonLd() {
    const websiteJsonLd = {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: 'The Eureka Feed',
        url: 'https://www.theeurekafeed.com',
        description: 'Daily science research podcast — the latest academic papers explained for curious minds in just 3 minutes.',
        potentialAction: {
            '@type': 'SearchAction',
            target: 'https://www.theeurekafeed.com/?q={search_term_string}',
            'query-input': 'required name=search_term_string',
        },
    };

    const podcastJsonLd = {
        '@context': 'https://schema.org',
        '@type': 'PodcastSeries',
        name: 'The Eureka Feed',
        url: 'https://www.theeurekafeed.com',
        description: 'A daily podcast that transforms cutting-edge academic research into 3-minute audio briefings.',
        webFeed: 'https://www.theeurekafeed.com/feed',
    };

    const faqJsonLd = {
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
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
            />
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(podcastJsonLd) }}
            />
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
            />
        </>
    );
}

export const dynamic = 'force-dynamic';

export default async function LandingPage() {
    // Fetch latest episode from API
    let latestEpisode: Awaited<ReturnType<typeof fetchLatestPodcast>> | null = null;
    let episodePapers: { title: string; url: string }[] = [];

    try {
        latestEpisode = await fetchLatestPodcast();
        if (latestEpisode?.paper_ids?.length) {
            const papers = await fetchPapers(latestEpisode.paper_ids);
            episodePapers = papers.map(p => ({
                title: p.title,
                url: p.doi ? `https://doi.org/${p.doi}` : (p.pdf_url || '#'),
            }));
        }
    } catch {
        // API might be down — page still renders without episode
    }
    return (
        <>
            <JsonLd />
            <Header />
            <main className={styles.main}>
                {/* Hero */}
                <section className={styles.hero}>
                    <div className={styles.heroContent}>
                        <div className={styles.heroEyebrow}>
                            <Sparkles size={16} />
                            Science, simplified
                        </div>
                        <h1 className={styles.heroTitle}>
                            Fresh research,<br />
                            <span className={styles.heroTitleAccent}>delivered daily.</span>
                        </h1>
                        <p className={styles.heroSubtitle}>
                            Every morning, the latest academic papers—explained for curious minds
                            in just 3 minutes. Stay ahead without the PhD.
                        </p>
                        <div className={styles.heroActions}>
                            <a href="#start-listening" className="btn btn-primary btn-large">
                                Start Listening <ArrowRight size={18} />
                            </a>
                            <a href="#how-it-works" className="btn btn-secondary btn-large">
                                See How It Works
                            </a>
                        </div>
                    </div>
                </section>

                {/* Stats */}
                <section className={styles.stats}>
                    <div className={styles.statsGrid}>
                        <div className={styles.stat}>
                            <div className={styles.statNumber}>4K+</div>
                            <div className={styles.statLabel}>Papers scanned weekly</div>
                        </div>
                        <div className={styles.stat}>
                            <div className={styles.statNumber}>12</div>
                            <div className={styles.statLabel}>Research categories</div>
                        </div>
                        <div className={styles.stat}>
                            <div className={styles.statNumber}>3 min</div>
                            <div className={styles.statLabel}>Daily listen time</div>
                        </div>
                    </div>
                </section>

                {/* How It Works */}
                <section className={styles.howItWorks} id="how-it-works">
                    <div className={styles.sectionHeader}>
                        <h2>How It Works</h2>
                        <p>From academic journals to your inbox—without the jargon.</p>
                    </div>

                    <div className={styles.stepsGrid}>
                        <div className={styles.step}>
                            <div className={styles.stepIcon}>
                                <Newspaper size={28} />
                            </div>
                            <div className={styles.stepNumber}>Step 01</div>
                            <h3>We Harvest</h3>
                            <p>
                                Every week, we scan thousands of newly published research papers
                                to find what&apos;s genuinely new and noteworthy.
                            </p>
                        </div>

                        <div className={styles.step}>
                            <div className={styles.stepIcon}>
                                <Filter size={28} />
                            </div>
                            <div className={styles.stepNumber}>Step 02</div>
                            <h3>We Curate</h3>
                            <p>
                                We rank papers by impact, relevance, and novelty—so you only see
                                research that actually matters, not obscure footnotes.
                            </p>
                        </div>

                        <div className={styles.step}>
                            <div className={styles.stepIcon}>
                                <Brain size={28} />
                            </div>
                            <div className={styles.stepNumber}>Step 03</div>
                            <h3>We Deliver</h3>
                            <p>
                                Every morning, you get a crisp 3-minute podcast briefing—research
                                breakthroughs explained for the well-informed, not specialists.
                            </p>
                        </div>
                    </div>

                    <div className={styles.nerdyFact}>
                        <div className={styles.nerdyFactLabel}>🤓 Nerdy Fact</div>
                        <p>
                            Over 3 million new research papers are published every year.
                            That&apos;s 8,200 per day. Nobody can keep up—so we built this
                            to help you punch above your weight.
                        </p>
                    </div>
                </section>

                {latestEpisode && (
                    <section className={styles.sampleEpisode} id="listen">
                        <div className={styles.sectionHeader}>
                            <h2>Hear It For Yourself</h2>
                            <p>A 3-minute briefing from today&apos;s research.</p>
                        </div>

                        {latestEpisode.audio_url && (
                            <AudioPlayer
                                src={latestEpisode.audio_url}
                                title={latestEpisode.title}
                            />
                        )}

                        <TranscriptSection
                            transcript={latestEpisode.script || ''}
                            papers={episodePapers}
                        />
                    </section>
                )}

                {/* Categories */}
                <section className={styles.categories} id="categories">
                    <div className={styles.sectionHeader}>
                        <h2>Topics We Cover</h2>
                        <p>We curate the best research from across these fields—so you don&apos;t have to.</p>
                    </div>

                    <div className={styles.categoriesGrid}>
                        {categories.map((cat) => (
                            <div key={cat.slug} className={styles.categoryCard}>
                                <div className={styles.categoryEmoji}>{cat.emoji}</div>
                                <h4>{cat.name}</h4>
                                <p>{cat.desc}</p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Why Now */}
                <section className={styles.whyNow}>
                    <div className={styles.whyNowContent}>
                        <h2>Why This Matters Now</h2>
                        <p>
                            Science moves fast. Breakthroughs in AI, medicine, and climate
                            happen weekly—but most people only hear about them months later,
                            filtered through sensationalized headlines.
                        </p>
                        <p>
                            We believe being scientifically literate shouldn&apos;t require a
                            subscription to Nature. It shouldn&apos;t require deciphering 30-page
                            papers written for specialists. It should be accessible, digestible,
                            and—dare we say—enjoyable.
                        </p>
                        <p>
                            <strong style={{ color: 'var(--text-primary)' }}>
                                The Eureka Feed is for curious minds who want to understand
                                the world through the lens of evidence.
                            </strong>
                        </p>
                        <Link href="/login?signup=true" className="btn btn-primary btn-large">
                            Join The Eureka Feed <ArrowRight size={18} />
                        </Link>
                    </div>
                </section>

                {/* Start Listening */}
                <section className={styles.pricing} id="start-listening">
                    <div className={styles.sectionHeader}>
                        <h2>Start Listening Today</h2>
                        <p>No credit card required.</p>
                    </div>

                    <div className={styles.waitlistCard}>
                        <div className={styles.startListeningContent}>
                            <p className={styles.freeNotice}>
                                🎧 Create a free account and get instant access to all episodes.
                            </p>
                            <Link href="/login?signup=true" className="btn btn-primary btn-large">
                                Create Account <ArrowRight size={18} />
                            </Link>
                            <p className={styles.signInNote}>
                                Already have an account? <Link href="/login">Sign in</Link>
                            </p>
                        </div>
                    </div>
                </section>

                {/* FAQ */}
                <section className={styles.faq} id="faq">
                    <div className={styles.sectionHeader}>
                        <h2>Frequently Asked Questions</h2>
                        <p>Everything you need to know about The Eureka Feed.</p>
                    </div>

                    <div className={styles.faqList}>
                        {faqs.map((faq, i) => (
                            <HomeFAQItem key={i} question={faq.question} answer={faq.answer} />
                        ))}
                    </div>
                </section>
            </main>
            <Footer />
        </>
    );
}

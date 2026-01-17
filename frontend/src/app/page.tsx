'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
    Sparkles,
    Brain,
    Zap,
    Check,
    ArrowRight,
    Newspaper,
    Filter,
    BookOpen,
    ChevronDown,
    ChevronUp,
    Mail
} from 'lucide-react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { AudioPlayer } from '@/components/AudioPlayer';
import { API_URL } from '@/lib/api';
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

// Latest episode content - update this when deploying new episodes
const LATEST_EPISODE = {
    title: "The Eureka Feed — Jan 16, 2026",
    audioSrc: "/audio/latest-episode.mp3",
    transcript: `Welcome back to The Eureka Feed, where we dive into the latest discoveries that spark curiosity and wonder! Today, we're exploring the intricate dance of neurons in our brains, the quest for inclusive education in the Philippines, and the potential impacts of climate interventions on our oceans. Let's jump right in!

What if I told you that not every neuron in your brain shows the same markers of health? A recent study focused on a special marker called NeuN, which helps scientists identify neurons—the star players in our brain's communication network. Here's the twist: while NeuN is a handy tool, it doesn't tell the whole story. Imagine a movie where some actors wear costumes that don't quite fit their roles. Just because a neuron doesn't express NeuN doesn't mean it's not doing its job! Certain important neurons, especially those tied to our sense of smell, can look like they're off the clock, but they're very much alive. Researchers found that after brain injuries, NeuN levels can dip temporarily, making it tricky to assess neuron health. This means doctors need to expand their toolkit beyond just NeuN to get a full picture of brain health—crucial for tackling conditions like Alzheimer's. So, what's the takeaway? A deeper understanding of neuron health could lead to better treatments and outcomes for people facing brain diseases.

Now, let's shift gears and head over to the world of education in the Philippines. Picture a classroom where every child, regardless of their unique needs, learns side by side. That's the dream of inclusive education! Researchers spoke with school heads and teachers to see how well this dream is being realized. The good news? Both groups are on the same page about the importance of inclusion. School leaders are savvy about the laws supporting this movement, while teachers have insight into how to engage every student. But there are some hurdles to clear. Many teachers feel they could use more training, and there's a lack of programs to help students transition smoothly from one grade to the next. By understanding these challenges through surveys and interviews, researchers highlighted the need for better resources and clearer communication. This research underscores the vital role of inclusive education—because when all students thrive together, it creates a richer learning environment for everyone.

Finally, let's dive into our oceans, where rising temperatures due to climate change are sending out alarm bells. Scientists are exploring climate interventions, like sucking carbon dioxide out of the air—think of it as a vacuum cleaner for our atmosphere—or reflecting sunlight away from Earth. These methods could help cool the planet, but here's the catch: they might unintentionally harm marine life. It's like trying to cure one ailment but inadvertently causing another. The researchers reviewed various proposals and found that while some could benefit our oceans, others could pose risks to fish and underwater ecosystems. The delicate balance of marine life means we need to tread carefully. Understanding how these interventions will affect our oceans is crucial, as our underwater ecosystems are vital for food supply and environmental balance.

So, there you have it! From the complexities of brain health to the importance of inclusive education and the future of our oceans amid climate change, each discovery invites us to learn more and to care deeper. As we continue to explore the wonders of science, remember: curiosity is the spark that ignites understanding. What will we uncover next? Stay tuned for more intriguing discoveries on The Eureka Feed!`,
    papers: [
        {
            title: "NeuN expression in health and disease: A histological perspective on neuronal heterogeneity",
            url: "https://doi.org/10.14670/hh-18-965"
        },
        {
            title: "Inclusive Education: School Heads and Teachers' Perspectives in the Philippines",
            url: "https://doi.org/10.26803/ijlter.25.1.29"
        },
        {
            title: "Potential Impacts of Climate Interventions on Marine Ecosystems",
            url: "https://doi.org/10.1029/2024rg000876"
        }
    ]
};

function TranscriptSection() {
    const [expanded, setExpanded] = useState(false);

    // Split transcript into paragraphs
    const paragraphs = LATEST_EPISODE.transcript.split('\n\n').filter(p => p.trim());
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

            {/* Papers featured in this episode */}
            <div className={styles.paperLinks}>
                <h4>📄 Papers featured in this episode</h4>
                <ul>
                    {LATEST_EPISODE.papers.map((paper, i) => (
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

export default function LandingPage() {
    const [waitlistEmail, setWaitlistEmail] = useState('');
    const [waitlistStatus, setWaitlistStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [waitlistMessage, setWaitlistMessage] = useState('');

    const handleWaitlistSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setWaitlistStatus('loading');

        try {
            const res = await fetch(`${API_URL}/waitlist`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: waitlistEmail }),
            });

            const data = await res.json();

            if (res.ok) {
                setWaitlistStatus('success');
                setWaitlistMessage(data.message);
                setWaitlistEmail('');
            } else {
                throw new Error(data.detail || 'Something went wrong');
            }
        } catch (err) {
            setWaitlistStatus('error');
            setWaitlistMessage(err instanceof Error ? err.message : 'Something went wrong');
        }
    };

    return (
        <>
            <Header />
            <main className={styles.main}>
                {/* Hero */}
                <section className={styles.hero}>
                    <div className={styles.heroContent}>
                        <div className={styles.heroEyebrow}>
                            <Sparkles size={16} />
                            Launching January 2026
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
                            <a href="#early-access" className="btn btn-primary btn-large">
                                Get Early Access <ArrowRight size={18} />
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
                                to find what's genuinely new and noteworthy.
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
                            That's 8,200 per day. Nobody can keep up—so we built this
                            to help you punch above your weight.
                        </p>
                    </div>
                </section>

                {/* Sample Episode */}
                <section className={styles.sampleEpisode} id="listen">
                    <div className={styles.sectionHeader}>
                        <h2>Hear It For Yourself</h2>
                        <p>A 3-minute briefing from today's research.</p>
                    </div>

                    <AudioPlayer
                        src={LATEST_EPISODE.audioSrc}
                        title={LATEST_EPISODE.title}
                    />

                    <TranscriptSection />
                </section>

                {/* Categories */}
                <section className={styles.categories} id="categories">
                    <div className={styles.sectionHeader}>
                        <h2>Topics We Cover</h2>
                        <p>We curate the best research from across these fields—so you don't have to.</p>
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
                            We believe being scientifically literate shouldn't require a
                            subscription to Nature. It shouldn't require deciphering 30-page
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
                            Join the Brief <ArrowRight size={18} />
                        </Link>
                    </div>
                </section>

                {/* Early Access */}
                <section className={styles.pricing} id="early-access">
                    <div className={styles.sectionHeader}>
                        <h2>Get Early Access</h2>
                        <p>Be the first to know when we launch.</p>
                    </div>

                    <div className={styles.waitlistCard}>
                        {waitlistStatus === 'success' ? (
                            <div className={styles.waitlistSuccess}>
                                <Check size={48} />
                                <p>{waitlistMessage}</p>
                            </div>
                        ) : (
                            <form onSubmit={handleWaitlistSubmit} className={styles.waitlistForm}>
                                <div className={styles.waitlistInputGroup}>
                                    <Mail size={20} className={styles.waitlistIcon} />
                                    <input
                                        type="email"
                                        value={waitlistEmail}
                                        onChange={(e) => setWaitlistEmail(e.target.value)}
                                        placeholder="Enter your email"
                                        required
                                        className={styles.waitlistInput}
                                    />
                                </div>
                                {waitlistStatus === 'error' && (
                                    <p className={styles.waitlistError}>{waitlistMessage}</p>
                                )}
                                <button
                                    type="submit"
                                    className="btn btn-primary btn-large"
                                    disabled={waitlistStatus === 'loading'}
                                >
                                    {waitlistStatus === 'loading' ? 'Joining...' : (
                                        <>Get Early Access <ArrowRight size={18} /></>
                                    )}
                                </button>
                            </form>
                        )}
                    </div>
                </section>
            </main>
            <Footer />
        </>
    );
}

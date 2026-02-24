import nextDynamic from 'next/dynamic';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import {
    Zap,
    Shield,
    Globe,
    Database,
    Rocket,
    Stethoscope,
    Layers,
    ArrowRight
} from 'lucide-react';
import Link from 'next/link';
import styles from './page.module.css';

// Dynamically import VantaBackground with SSR disabled
const VantaBackground = nextDynamic(() => import('@/components/VantaBackground').then(mod => mod.VantaBackground), {
    ssr: false,
    loading: () => <div className={styles.vantaPlaceholder} />
});

export default function MissionPage() {
    return (
        <>
            <Header />
            <VantaBackground>
                <main className={styles.missionPage}>
                    {/* Hero Section */}
                    <section className={styles.hero}>
                        <div className={styles.heroContent}>
                            <span className={styles.heroEyebrow}>Our Philosophy</span>
                            <h1 className={styles.heroTitle}>The Universe, Unfiltered.</h1>
                            <p className={styles.heroSubtitle}>
                                We believe the scientific method is the most powerful tool mankind has ever devised to navigate the dark. We exist to make the frontier of human knowledge accessible to everyone.
                            </p>
                        </div>
                    </section>

                    {/* The Power of Science */}
                    <section className={styles.section}>
                        <div className={styles.glassCard}>
                            <h2 className={styles.sectionTitle}>The Sentinel of Truth</h2>
                            <div className={styles.grid}>
                                <div className={styles.contentBlock}>
                                    <h3>Science is a Process, Not a Body of Knowledge</h3>
                                    <p>
                                        Science is not a matter of opinion; it is a matter of evidence. It is a relentless, self-correcting
                                        process that demands we challenge our biases, kill our darlings, and follow the data wherever
                                        it leads—no matter how uncomfortable the destination. In an age of noise, science remains our
                                        only objective compass.
                                    </p>
                                </div>
                                <div className={styles.pillarsGrid}>
                                    <div className={styles.pillar}>
                                        <Zap className={styles.pillarIcon} size={24} />
                                        <h4>Unbiased</h4>
                                        <p>Data doesn't care about narratives or political agendas.</p>
                                    </div>
                                    <div className={styles.pillar}>
                                        <Layers className={styles.pillarIcon} size={24} />
                                        <h4>Iterative</h4>
                                        <p>Always evolving. Always refining. Always improving.</p>
                                    </div>
                                    <div className={styles.pillar}>
                                        <Shield className={styles.pillarIcon} size={24} />
                                        <h4>Skeptical</h4>
                                        <p>To know something is true, we must first try to prove it wrong.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Proof of Progress */}
                    <section className={styles.section}>
                        <h2 className={styles.sectionTitle}>Proof of Progress</h2>
                        <div className={styles.grid}>
                            <div className={styles.pillar}>
                                <Stethoscope className={styles.pillarIcon} size={32} />
                                <h3>Doubling Life</h3>
                                <p>
                                    A century ago, a child born today could expect to live 31 years. Today, through vaccinology,
                                    sanitation, and surgery, that number is 73. This wasn't luck. It was the relentless application
                                    of the scientific method to human biology.
                                </p>
                            </div>
                            <div className={styles.pillar}>
                                <Rocket className={styles.pillarIcon} size={32} />
                                <h3>The Cosmic Compass</h3>
                                <p>
                                    Without the precision of General Relativity, GPS would fail by kilometers every day.
                                    When the rockets of our curiosity carry us towards the aftermath of the Big Bang, we are seeing the
                                    triumph of human progress over the void.
                                </p>
                            </div>
                        </div>
                    </section>

                    {/* The Crisis */}
                    <section className={styles.quoteSection}>
                        <blockquote className={styles.quote}>
                            "Science is being treated as a buffet—where people pick only what suits their worldview. We exist to change that."
                        </blockquote>
                        <span className={styles.quoteAuthor}>— The Eureka Feed Mission</span>
                    </section>

                    {/* The Solution */}
                    <section className={styles.section}>
                        <div className={styles.glassCard}>
                            <h2 className={styles.sectionTitle}>Safeguarding Reality</h2>
                            <div className={styles.grid}>
                                <div className={styles.contentBlock}>
                                    <h3>Liberating the Raw Source</h3>
                                    <p>
                                        Scientific breakthroughs are currently hidden behind expensive journals and impenetrable academic jargon.
                                        This "accessibility gap" allows data to be weaponized and misinterpreted. We stand for the raw source.
                                    </p>
                                    <p style={{ marginTop: '1rem' }}>
                                        By distilling research without losing the rigor, we return the frontier of knowledge to where it belongs:
                                        in the hands of the people.
                                    </p>
                                </div>
                                <div className={styles.contentBlock}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                        <div style={{ display: 'flex', gap: '1rem' }}>
                                            <Database size={24} className={styles.textAccent} />
                                            <div>
                                                <h4 style={{ color: 'white', marginBottom: '4px' }}>Decentralized Knowledge</h4>
                                                <p style={{ fontSize: '0.9rem' }}>We don't just give you the summary; we provide the paper.</p>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '1rem' }}>
                                            <Globe size={24} className={styles.textAccent} />
                                            <div>
                                                <h4 style={{ color: 'white', marginBottom: '4px' }}>Global Impact</h4>
                                                <p style={{ fontSize: '0.9rem' }}>Breaking down language and jargon barriers.</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* CTA */}
                    <section className={styles.ctaSection}>
                        <Link href="/login?signup=true" className="btn btn-primary btn-large">
                            Join the Frontier <ArrowRight size={20} />
                        </Link>
                    </section>
                </main>
            </VantaBackground>
            <Footer />
        </>
    );
}

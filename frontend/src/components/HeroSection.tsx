'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Sparkles, ArrowRight } from 'lucide-react';
import styles from '@/app/page.module.css';

// Dynamically import VantaBackground with SSR disabled to keep the initial bundle light
const VantaBackground = dynamic(() => import('@/components/VantaBackground').then(mod => mod.VantaBackground), {
    ssr: false,
    // Add a simple placeholder so the layout doesn't shift
    loading: () => <div className={styles.heroVantaPlaceholder} />
});

/**
 * HeroSection
 *
 * client component that owns the landing page hero.
 * Uses dynamic import for the heavy WebGL background to ensure 
 * the initial page load stays extremely fast.
 */
export function HeroSection() {
    return (
        <VantaBackground
            className={styles.heroVanta}
            vantaOptions={{
                blurFactor: 0.65,
                speed: 0.80,
                zoom: 1.20,
            }}
        >
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
        </VantaBackground>
    );
}


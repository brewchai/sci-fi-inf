import type { Metadata } from 'next';
import nextDynamic from 'next/dynamic';

import { Footer } from '@/components/Footer';
import { Header } from '@/components/Header';

import { FactCheckClientPage } from './FactCheckClientPage';
import styles from './page.module.css';

const LandingWrapper = nextDynamic(() => import('@/components/LandingWrapper'), {
    ssr: false,
    loading: () => <></>,
});

export const metadata: Metadata = {
    title: 'YouTube Claim Check',
    description: 'Paste a YouTube Short and get a paper-first verdict on its strongest research claims.',
    alternates: {
        canonical: 'https://www.theeurekafeed.com/fact-check',
    },
    openGraph: {
        title: 'YouTube Claim Check | The Eureka Feed',
        description: 'Paste a YouTube Short and get a paper-first verdict on its strongest research claims.',
        url: 'https://www.theeurekafeed.com/fact-check',
    },
    twitter: {
        card: 'summary_large_image',
        title: 'YouTube Claim Check | The Eureka Feed',
        description: 'Paste a YouTube Short and get a paper-first verdict on its strongest research claims.',
    },
};

export default function FactCheckPage() {
    return (
        <>
            <Header />
            <LandingWrapper>
                <main className={styles.main}>
                    <FactCheckClientPage />
                </main>
            </LandingWrapper>
            <Footer />
        </>
    );
}

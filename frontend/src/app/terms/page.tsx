import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import styles from '../privacy/page.module.css';

export const metadata = {
    title: 'Terms of Service | The Eureka Feed',
    description: 'Terms of Service for The Eureka Feed',
};

export default function TermsPage() {
    return (
        <>
            <Header />
            <main className={styles.main}>
                <div className={styles.container}>
                    <Link href="/" className={styles.backLink}>
                        <ArrowLeft size={18} /> Back to Home
                    </Link>

                    <h1 className={styles.title}>Terms of Service</h1>
                    <p className={styles.updated}>Last updated: January 15, 2026</p>

                    <section className={styles.section}>
                        <h2>1. Acceptance of Terms</h2>
                        <p>
                            By accessing or using The Eureka Feed, you agree to be bound by these
                            Terms of Service. If you do not agree, please do not use our service.
                        </p>
                    </section>

                    <section className={styles.section}>
                        <h2>2. Description of Service</h2>
                        <p>
                            The Eureka Feed provides daily curated summaries and podcasts of
                            academic research. We aggregate publicly available research papers
                            and present them in accessible formats for general audiences.
                        </p>
                    </section>

                    <section className={styles.section}>
                        <h2>3. User Accounts</h2>
                        <p>
                            You are responsible for maintaining the confidentiality of your
                            account credentials and for all activities under your account.
                            You must provide accurate information when creating an account.
                        </p>
                    </section>

                    <section className={styles.section}>
                        <h2>4. Subscription and Payments</h2>
                        <ul>
                            <li>Subscriptions are billed monthly or annually as selected</li>
                            <li>You may cancel at any time; cancellation takes effect at the end of the billing period</li>
                            <li>Refunds are handled on a case-by-case basis</li>
                        </ul>
                    </section>

                    <section className={styles.section}>
                        <h2>5. Intellectual Property</h2>
                        <p>
                            The content, organization, and design of The Eureka Feed are protected
                            by copyright. Summaries and podcasts are our original works.
                            Research papers summarized remain the property of their respective
                            authors and publishers.
                        </p>
                    </section>

                    <section className={styles.section}>
                        <h2>6. Disclaimer</h2>
                        <p>
                            The Eureka Feed provides summaries for informational purposes only.
                            We are not responsible for the accuracy of the underlying research.
                            Our summaries should not be used as a substitute for professional
                            advice in any field.
                        </p>
                    </section>

                    <section className={styles.section}>
                        <h2>7. Limitation of Liability</h2>
                        <p>
                            To the maximum extent permitted by law, The Eureka Feed shall not be
                            liable for any indirect, incidental, or consequential damages
                            arising from your use of the service.
                        </p>
                    </section>

                    <section className={styles.section}>
                        <h2>8. Changes to Terms</h2>
                        <p>
                            We may update these terms from time to time. Continued use of the
                            service after changes constitutes acceptance of the new terms.
                        </p>
                    </section>

                    <section className={styles.section}>
                        <h2>9. Contact</h2>
                        <p>
                            Questions about these terms? <Link href="/contact">Contact us</Link>.
                        </p>
                    </section>
                </div>
            </main>
            <Footer />
        </>
    );
}

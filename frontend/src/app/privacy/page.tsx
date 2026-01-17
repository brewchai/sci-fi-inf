import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import styles from './page.module.css';

export const metadata = {
    title: 'Privacy Policy | Eureka Brief',
    description: 'Privacy Policy for Eureka Brief',
};

export default function PrivacyPage() {
    return (
        <>
            <Header />
            <main className={styles.main}>
                <div className={styles.container}>
                    <Link href="/" className={styles.backLink}>
                        <ArrowLeft size={18} /> Back to Home
                    </Link>

                    <h1 className={styles.title}>Privacy Policy</h1>
                    <p className={styles.updated}>Last updated: January 15, 2026</p>

                    <section className={styles.section}>
                        <h2>What We Collect</h2>
                        <p>
                            When you use Eureka Brief, we collect minimal information necessary
                            to provide our service:
                        </p>
                        <ul>
                            <li><strong>Email address</strong> — Used for account creation, login, and sending you the daily brief</li>
                            <li><strong>Contact form submissions</strong> — Your email and message when you reach out to us</li>
                        </ul>
                    </section>

                    <section className={styles.section}>
                        <h2>How We Use Your Data</h2>
                        <ul>
                            <li>To deliver the daily research podcast and brief</li>
                            <li>To respond to your questions or feedback</li>
                            <li>To improve our service</li>
                        </ul>
                        <p>We do not sell or share your personal information with third parties.</p>
                    </section>

                    <section className={styles.section}>
                        <h2>Third-Party Services</h2>
                        <p>We use the following services to operate Eureka Brief:</p>
                        <ul>
                            <li><strong>Supabase</strong> — Database and authentication</li>
                            <li><strong>OpenAI</strong> — Content generation (no personal data is sent)</li>
                            <li><strong>Stripe</strong> — Payment processing (if applicable)</li>
                        </ul>
                    </section>

                    <section className={styles.section}>
                        <h2>Data Retention</h2>
                        <p>
                            We retain your account data for as long as your account is active.
                            You can request deletion of your data at any time by contacting us.
                        </p>
                    </section>

                    <section className={styles.section}>
                        <h2>Your Rights</h2>
                        <p>You have the right to:</p>
                        <ul>
                            <li>Access your personal data</li>
                            <li>Request correction of your data</li>
                            <li>Request deletion of your data</li>
                            <li>Unsubscribe from communications</li>
                        </ul>
                    </section>

                    <section className={styles.section}>
                        <h2>Contact</h2>
                        <p>
                            Questions about this policy? <Link href="/contact">Contact us</Link>.
                        </p>
                    </section>
                </div>
            </main>
            <Footer />
        </>
    );
}

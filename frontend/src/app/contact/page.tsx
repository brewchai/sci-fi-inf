import type { Metadata } from 'next';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import ContactForm from './ContactForm';
import styles from './page.module.css';

export const metadata: Metadata = {
    title: 'Contact Us',
    description: 'Get in touch with The Eureka Feed team. Questions, feedback, or partnership inquiries — we\'d love to hear from you.',
    alternates: {
        canonical: '/contact',
    },
};

export default function ContactPage() {
    return (
        <>
            <Header />
            <main className={styles.main}>
                <div className={styles.container}>
                    <ContactForm />
                </div>
            </main>
            <Footer />
        </>
    );
}

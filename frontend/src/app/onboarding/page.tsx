'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { BookOpen, Check, ArrowRight, Loader2 } from 'lucide-react';
import { getSupabase } from '@/lib/supabase';
import styles from './page.module.css';

const categories = [
    { slug: 'ai_tech', emoji: '🤖', name: 'AI & Technology', desc: 'Machine learning, algorithms' },
    { slug: 'health_medicine', emoji: '💊', name: 'Health & Medicine', desc: 'Clinical research, treatments' },
    { slug: 'brain_mind', emoji: '🧠', name: 'Brain & Mind', desc: 'Neuroscience, psychology' },
    { slug: 'climate_environment', emoji: '🌍', name: 'Climate & Environment', desc: 'Sustainability, ecology' },
    { slug: 'physics', emoji: '⚛️', name: 'Physics & Space', desc: 'Quantum mechanics, astronomy' },
    { slug: 'biology', emoji: '🧬', name: 'Biology & Genetics', desc: 'Molecular biology, genomics' },
    { slug: 'energy', emoji: '⚡', name: 'Energy & Sustainability', desc: 'Renewables, clean tech' },
    { slug: 'economics', emoji: '💰', name: 'Economics & Finance', desc: 'Markets, policy research' },
    { slug: 'chemistry', emoji: '🔬', name: 'Chemistry & Materials', desc: 'Chemical processes' },
    { slug: 'food_agriculture', emoji: '🌾', name: 'Food & Agriculture', desc: 'Nutrition, farming' },
];

export default function OnboardingPage() {
    const router = useRouter();
    const [selected, setSelected] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);

    const toggleCategory = (slug: string) => {
        setSelected((prev) =>
            prev.includes(slug)
                ? prev.filter((s) => s !== slug)
                : [...prev, slug]
        );
    };

    const handleContinue = async () => {
        if (selected.length < 1) return;

        setLoading(true);

        try {
            const { data: { user } } = await getSupabase().auth.getUser();

            if (user) {
                // Upsert profile with interests
                await getSupabase().from('profiles').upsert({
                    id: user.id,
                    email: user.email,
                    interests: selected,
                    subscription_status: 'active',
                });
            }

            router.push('/feed');
        } catch (error) {
            console.error('Error saving preferences:', error);
            router.push('/feed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.onboarding}>
            <div className={styles.container}>
                <div className={styles.header}>
                    <Link href="/" className={styles.logo}>
                        <BookOpen size={24} />
                        The Eureka Feed
                    </Link>
                    <h1>What interests you?</h1>
                    <p>Select the topics you want to follow. You can change these anytime.</p>
                </div>

                <div className={styles.categoriesGrid}>
                    {categories.map((cat) => (
                        <div
                            key={cat.slug}
                            className={`${styles.categoryCard} ${selected.includes(cat.slug) ? styles.selected : ''}`}
                            onClick={() => toggleCategory(cat.slug)}
                        >
                            <div className={styles.checkmark}>
                                <Check size={14} />
                            </div>
                            <div className={styles.emoji}>{cat.emoji}</div>
                            <h3>{cat.name}</h3>
                            <p>{cat.desc}</p>
                        </div>
                    ))}
                </div>

                <div className={styles.footer}>
                    <div className={styles.selectedCount}>
                        <span>{selected.length}</span> {selected.length === 1 ? 'topic' : 'topics'} selected
                    </div>
                    <button
                        className={`btn btn-primary ${styles.continueBtn}`}
                        onClick={handleContinue}
                        disabled={selected.length < 1 || loading}
                    >
                        {loading ? (
                            <>
                                <Loader2 size={18} className="spin" /> Saving...
                            </>
                        ) : (
                            <>
                                Continue to Feed <ArrowRight size={18} />
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

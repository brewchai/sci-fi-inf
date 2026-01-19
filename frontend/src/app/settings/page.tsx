'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { BookOpen, Check, ArrowLeft, Loader2, Save } from 'lucide-react';
import { getSupabase } from '@/lib/supabase';
import { categories } from '@/lib/categories';
import styles from './page.module.css';

export default function SettingsPage() {
    const router = useRouter();
    const [selected, setSelected] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [checkingProfile, setCheckingProfile] = useState(true);
    const [saveMessage, setSaveMessage] = useState<string | null>(null);

    useEffect(() => {
        let isMounted = true;

        async function loadProfile() {
            try {
                const supabase = getSupabase();
                const { data: { user } } = await supabase.auth.getUser();

                if (!user) {
                    router.push('/login');
                    return;
                }

                const { data: profile, error } = await supabase
                    .from('profiles')
                    .select('interests')
                    .eq('id', user.id)
                    .maybeSingle();

                if (error) throw error;

                if (isMounted && profile?.interests) {
                    setSelected(profile.interests);
                }
            } catch (error) {
                console.error('Error loading profile:', error);
            } finally {
                if (isMounted) {
                    setCheckingProfile(false);
                }
            }
        }

        loadProfile();

        return () => {
            isMounted = false;
        };
    }, [router]);

    const toggleCategory = (slug: string) => {
        setSelected((prev) =>
            prev.includes(slug)
                ? prev.filter((s) => s !== slug)
                : [...prev, slug]
        );
    };

    const handleSave = async () => {
        if (selected.length < 1) return;

        setLoading(true);
        setSaveMessage(null);

        try {
            const supabase = getSupabase();
            const { data: { user } } = await supabase.auth.getUser();

            if (!user) {
                router.push('/login');
                return;
            }

            const { error } = await supabase.from('profiles').upsert({
                id: user.id,
                email: user.email,
                interests: selected,
            });

            if (error) throw error;

            setSaveMessage('Preferences saved.');
        } catch (error) {
            console.error('Error saving preferences:', error);
            setSaveMessage('Could not save preferences. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    if (checkingProfile) {
        return (
            <div className={styles.loading}>
                <Loader2 size={24} className="spin" />
                Loading preferences...
            </div>
        );
    }

    return (
        <div className={styles.settings}>
            <div className={styles.container}>
                <div className={styles.header}>
                    <Link href="/" className={styles.logo}>
                        <BookOpen size={24} />
                        The Eureka Feed
                    </Link>
                    <h1>Your interests</h1>
                    <p>Update what you want to see in your daily feed.</p>
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
                    <Link href="/feed" className={styles.backLink}>
                        <ArrowLeft size={16} /> Back to feed
                    </Link>

                    <div className={styles.actions}>
                        {saveMessage && <span className={styles.saveMessage}>{saveMessage}</span>}
                        <button
                            className={`btn btn-primary ${styles.saveBtn}`}
                            onClick={handleSave}
                            disabled={selected.length < 1 || loading}
                        >
                            {loading ? (
                                <>
                                    <Loader2 size={18} className="spin" /> Saving...
                                </>
                            ) : (
                                <>
                                    <Save size={18} /> Save changes
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

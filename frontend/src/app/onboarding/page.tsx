'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { BookOpen, Check, ArrowRight, Loader2 } from 'lucide-react';
import { getSupabase } from '@/lib/supabase';
import { categories } from '@/lib/categories';
import styles from './page.module.css';

const userTypes = [
    { value: 'student', label: 'Student', emoji: '🎓' },
    { value: 'professional', label: 'Professional', emoji: '💼' },
    { value: 'researcher', label: 'Researcher', emoji: '🔬' },
    { value: 'hobbyist', label: 'Curious Mind', emoji: '🌟' },
];

export default function OnboardingPage() {
    const router = useRouter();
    const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
    const [userType, setUserType] = useState<string | null>(null);
    const [age, setAge] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [checkingProfile, setCheckingProfile] = useState(true);

    useEffect(() => {
        let isMounted = true;

        async function checkProfile() {
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

                if (profile?.interests && profile.interests.length > 0) {
                    router.push('/feed');
                    return;
                }
            } catch (error) {
                console.error('Error checking profile:', error);
            } finally {
                if (isMounted) {
                    setCheckingProfile(false);
                }
            }
        }

        checkProfile();

        return () => {
            isMounted = false;
        };
    }, [router]);

    const toggleInterest = (slug: string) => {
        setSelectedInterests((prev) =>
            prev.includes(slug)
                ? prev.filter((s) => s !== slug)
                : [...prev, slug]
        );
    };

    const handleContinue = async () => {
        if (selectedInterests.length < 1) return;

        setLoading(true);

        try {
            const { data: { user } } = await getSupabase().auth.getUser();

            if (user) {
                // Upsert profile with all data
                const { error: upsertError } = await getSupabase().from('profiles').upsert({
                    id: user.id,
                    email: user.email,
                    user_type: userType,
                    age: age ? parseInt(age, 10) : null,
                    interests: selectedInterests,
                    subscription_status: 'trial',
                });

                if (upsertError) {
                    console.error('Supabase upsert error:', upsertError);
                    alert(`Error saving profile: ${upsertError.message}`);
                    setLoading(false);
                    return;
                }
            }

            router.push('/feed');
        } catch (error) {
            console.error('Error saving preferences:', error);
            alert('Failed to save preferences. Check console for details.');
        } finally {
            setLoading(false);
        }
    };

    if (checkingProfile) {
        return (
            <div className={styles.loading}>
                <Loader2 size={24} className="spin" />
                Loading your preferences...
            </div>
        );
    }

    return (
        <div className={styles.onboarding}>
            <div className={styles.container}>
                <div className={styles.header}>
                    <Link href="/" className={styles.logo}>
                        <BookOpen size={24} />
                        The Eureka Feed
                    </Link>
                    <h1>Welcome! Let's personalize your feed</h1>
                    <p>Tell us a bit about yourself to get the best experience.</p>
                </div>

                {/* About You Section (Optional) */}
                <div className={styles.section}>
                    <h2 className={styles.sectionTitle}>About You <span className={styles.optional}>(optional)</span></h2>

                    <div className={styles.userTypeGrid}>
                        {userTypes.map((type) => (
                            <button
                                key={type.value}
                                className={`${styles.userTypeCard} ${userType === type.value ? styles.selected : ''}`}
                                onClick={() => setUserType(userType === type.value ? null : type.value)}
                            >
                                <span className={styles.userTypeEmoji}>{type.emoji}</span>
                                <span>{type.label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Age Section (Optional) */}
                <div className={styles.section}>
                    <h2 className={styles.sectionTitle}>Age <span className={styles.optional}>(optional)</span></h2>
                    <input
                        id="age"
                        type="number"
                        className={styles.ageInput}
                        placeholder="e.g. 25"
                        value={age}
                        onChange={(e) => setAge(e.target.value)}
                        min="13"
                        max="120"
                    />
                </div>

                {/* Interests Section (Required) */}
                <div className={styles.section}>
                    <h2 className={styles.sectionTitle}>What interests you? <span className={styles.required}>*</span></h2>
                    <p className={styles.sectionSubtitle}>Select at least one topic. You can change these anytime.</p>

                    <div className={styles.categoriesGrid}>
                        {categories.map((cat) => (
                            <div
                                key={cat.slug}
                                className={`${styles.categoryCard} ${selectedInterests.includes(cat.slug) ? styles.selected : ''}`}
                                onClick={() => toggleInterest(cat.slug)}
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
                </div>

                <div className={styles.footer}>
                    <div className={styles.selectedCount}>
                        <span>{selectedInterests.length}</span> {selectedInterests.length === 1 ? 'topic' : 'topics'} selected
                    </div>
                    <button
                        className={`btn btn-primary ${styles.continueBtn}`}
                        onClick={handleContinue}
                        disabled={selectedInterests.length < 1 || loading}
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

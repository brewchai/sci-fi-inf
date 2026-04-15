'use client';

import { useEffect, useState } from 'react';
import styles from './page.module.css';

const TRANSITIONS = [
    {
        key: 'hard_cut_blur',
        name: 'Hard Cut Blur',
        description: 'Fast impact cut with a brief blur burst. Good for hooks and tonal pivots.',
        accent: '#7fd5ff',
    },
    {
        key: 'masked_push',
        name: 'Masked Push',
        description: 'The next scene physically pushes through the previous one.',
        accent: '#d7ff77',
    },
    {
        key: 'light_sweep_dissolve',
        name: 'Light Sweep Dissolve',
        description: 'Editorial sweep with a glossy highlight streak through the handoff.',
        accent: '#ffd27a',
    },
    {
        key: 'scale_through_zoom',
        name: 'Scale Through Zoom',
        description: 'The new scene punches in through the old one for a strong focal jump.',
        accent: '#ff93d8',
    },
    {
        key: 'depth_blur_handoff',
        name: 'Depth Blur Handoff',
        description: 'Soft depth transfer with blur and atmospheric focus pull.',
        accent: '#a2a9ff',
    },
    {
        key: 'vertical_reveal',
        name: 'Vertical Reveal',
        description: 'Top-down reveal that feels clean, direct, and more editorial than a basic wipe.',
        accent: '#6cf0c2',
    },
    {
        key: 'horizontal_reveal',
        name: 'Horizontal Reveal',
        description: 'Left-edge reveal for sharper sequencing without the heavy shove of a push transition.',
        accent: '#ffb36b',
    },
    {
        key: 'soft_flash_cut',
        name: 'Soft Flash Cut',
        description: 'A bright, expensive-looking flash handoff for hooks and momentum spikes.',
        accent: '#fff27d',
    },
    {
        key: 'glass_warp',
        name: 'Glass Warp',
        description: 'Refraction-style handoff with a warped pane sliding across the frame.',
        accent: '#8fd7ff',
    },
    {
        key: 'radial_focus_pull',
        name: 'Radial Focus Pull',
        description: 'A center-weighted focal pull that tightens attention before the new scene locks in.',
        accent: '#c7a7ff',
    },
    {
        key: 'split_panel_wipe',
        name: 'Split Panel Wipe',
        description: 'Two panels separate and expose the next scene through the middle seam.',
        accent: '#ff97b1',
    },
    {
        key: 'film_burn_edge',
        name: 'Film Burn Edge',
        description: 'Warm edge burn that adds energy without turning into a cheesy vintage preset.',
        accent: '#ffbc6f',
    },
    {
        key: 'depth_parallax_snap',
        name: 'Depth Parallax Snap',
        description: 'A quicker, more dimensional handoff with lateral depth and a confident snap-in.',
        accent: '#8fd0ff',
    },
    {
        key: 'ghost_trail_crossfade',
        name: 'Ghost Trail Crossfade',
        description: 'Trailed crossfade that leaves a brief afterimage before resolving into the new scene.',
        accent: '#d8d8ff',
    },
    {
        key: 'iris_close_open',
        name: 'Iris Close Open',
        description: 'Cinematic iris reveal that tunnels attention into the next beat.',
        accent: '#9ef8a9',
    },
] as const;

const clamp = (value: number) => Math.max(0, Math.min(1, value));

const getStylesForTransition = (transition: string, progress: number) => {
    const p = clamp(progress);

    if (transition === 'hard_cut_blur') {
        return {
            outgoing: {
                opacity: p < 0.42 ? 1 : 0,
                transform: `scale(${1 + p * 0.02})`,
                filter: `blur(${p < 0.42 ? p * 16 : 10}px)`,
            },
            incoming: {
                opacity: p < 0.42 ? 0 : 1,
                transform: `scale(${1.06 - p * 0.06})`,
                filter: `blur(${Math.max(0, (1 - p) * 14)}px)`,
            },
            overlay: {
                opacity: p < 0.35 ? p * 1.4 : p > 0.52 ? Math.max(0, 1 - p) * 1.8 : 0.55,
                transform: 'none',
                background: 'radial-gradient(circle at center, rgba(255,255,255,0.24), transparent 58%)',
            },
        };
    }

    if (transition === 'masked_push') {
        return {
            outgoing: {
                opacity: 1,
                transform: `translateX(${-14 * p}%) scale(${1 + p * 0.03})`,
                filter: 'blur(0px)',
            },
            incoming: {
                opacity: 1,
                transform: `translateX(${100 - p * 100}%) scale(${1.05 - p * 0.05})`,
                filter: 'blur(0px)',
            },
            overlay: {
                opacity: 0.7,
                transform: `translateX(${120 - p * 120}%)`,
                background: 'linear-gradient(90deg, rgba(255,255,255,0.18), rgba(255,255,255,0.05), transparent)',
            },
        };
    }

    if (transition === 'light_sweep_dissolve') {
        return {
            outgoing: {
                opacity: 1 - p * 0.9,
                transform: `scale(${1 + p * 0.03})`,
                filter: `blur(${p * 6}px)`,
            },
            incoming: {
                opacity: p,
                transform: `scale(${1.04 - p * 0.04})`,
                filter: `blur(${Math.max(0, (1 - p) * 8)}px)`,
            },
            overlay: {
                opacity: 0.9,
                transform: `translateX(${-55 + p * 125}%)`,
                background: 'linear-gradient(100deg, transparent 0%, rgba(255,255,255,0.02) 36%, rgba(255,245,214,0.38) 50%, rgba(255,255,255,0.02) 64%, transparent 100%)',
            },
        };
    }

    if (transition === 'scale_through_zoom') {
        return {
            outgoing: {
                opacity: 1 - p * 0.7,
                transform: `scale(${1 + p * 0.22})`,
                filter: `blur(${p * 7}px)`,
            },
            incoming: {
                opacity: p,
                transform: `scale(${1.26 - p * 0.26})`,
                filter: `blur(${Math.max(0, (1 - p) * 12)}px)`,
            },
            overlay: {
                opacity: 0.45,
                transform: `scale(${0.8 + p * 0.35})`,
                background: 'radial-gradient(circle at center, rgba(255,255,255,0.18), transparent 62%)',
            },
        };
    }

    if (transition === 'vertical_reveal') {
        return {
            outgoing: {
                opacity: 1,
                transform: `translateY(${-8 * p}%) scale(${1 + p * 0.03})`,
                filter: `blur(${p * 4}px)`,
            },
            incoming: {
                opacity: 1,
                transform: `translateY(${100 - p * 100}%) scale(${1.04 - p * 0.04})`,
                clipPath: `inset(${100 - p * 100}% 0 0 0)`,
                filter: 'blur(0px)',
            },
            overlay: {
                opacity: 0.5,
                transform: `translateY(${80 - p * 80}%)`,
                background: 'linear-gradient(180deg, rgba(255,255,255,0.16), rgba(255,255,255,0.04), transparent)',
            },
        };
    }

    if (transition === 'horizontal_reveal') {
        return {
            outgoing: {
                opacity: 1,
                transform: `translateX(${6 * p}%) scale(${1 + p * 0.025})`,
                filter: `blur(${p * 4}px)`,
            },
            incoming: {
                opacity: 1,
                transform: `translateX(${-100 + p * 100}%) scale(${1.04 - p * 0.04})`,
                clipPath: `inset(0 0 0 ${100 - p * 100}%)`,
                filter: 'blur(0px)',
            },
            overlay: {
                opacity: 0.55,
                transform: `translateX(${-90 + p * 90}%)`,
                background: 'linear-gradient(90deg, rgba(255,255,255,0.16), rgba(255,255,255,0.05), transparent)',
            },
        };
    }

    if (transition === 'soft_flash_cut') {
        const flash = Math.sin(p * Math.PI);
        return {
            outgoing: {
                opacity: 1 - p * 0.88,
                transform: `scale(${1 + p * 0.05})`,
                filter: `blur(${p * 8}px) brightness(${1 + flash * 0.18})`,
            },
            incoming: {
                opacity: p,
                transform: `scale(${1.1 - p * 0.1})`,
                filter: `blur(${Math.max(0, (1 - p) * 7)}px) brightness(${1 + flash * 0.12})`,
            },
            overlay: {
                opacity: flash * 0.9,
                transform: 'none',
                background: 'radial-gradient(circle at center, rgba(255,255,255,0.72), rgba(255,250,214,0.22) 34%, transparent 64%)',
            },
        };
    }

    if (transition === 'glass_warp') {
        return {
            outgoing: {
                opacity: 1 - p * 0.8,
                transform: `skewX(${-8 * p}deg) scale(${1 + p * 0.04})`,
                filter: `blur(${p * 10}px)`,
            },
            incoming: {
                opacity: p,
                transform: `skewX(${8 - p * 8}deg) scale(${1.08 - p * 0.08})`,
                filter: `blur(${Math.max(0, (1 - p) * 10)}px)`,
            },
            overlay: {
                opacity: 0.65,
                transform: `skewX(${8 - p * 16}deg) scale(${1 + p * 0.06})`,
                background: 'linear-gradient(135deg, rgba(255,255,255,0.18), transparent 30%, rgba(255,255,255,0.08) 50%, transparent 70%, rgba(255,255,255,0.16))',
            },
        };
    }

    if (transition === 'radial_focus_pull') {
        return {
            outgoing: {
                opacity: 1 - p * 0.78,
                transform: `scale(${1 + p * 0.08})`,
                filter: `blur(${p * 10}px)`,
            },
            incoming: {
                opacity: p,
                transform: `scale(${1.14 - p * 0.14})`,
                filter: `blur(${Math.max(0, (1 - p) * 12)}px)`,
            },
            overlay: {
                opacity: 0.58,
                transform: 'none',
                background: `radial-gradient(circle at center, transparent 0%, transparent ${18 + p * 28}%, rgba(0,0,0,0.08) ${34 + p * 14}%, rgba(0,0,0,0.5) 100%)`,
            },
        };
    }

    if (transition === 'split_panel_wipe') {
        return {
            outgoing: {
                opacity: 1 - p * 0.6,
                transform: 'scale(1)',
                clipPath: `polygon(0 0, ${50 - p * 50}% 0, ${50 - p * 50}% 100%, 0 100%)`,
                filter: 'blur(0px)',
            },
            incoming: {
                opacity: p,
                transform: 'scale(1)',
                clipPath: `polygon(${50 + (1 - p) * 50}% 0, 100% 0, 100% 100%, ${50 + (1 - p) * 50}% 100%)`,
                filter: 'blur(0px)',
            },
            overlay: {
                opacity: 0.75,
                transform: 'none',
                background: 'linear-gradient(90deg, transparent 47%, rgba(255,255,255,0.24) 50%, transparent 53%)',
            },
        };
    }

    if (transition === 'film_burn_edge') {
        return {
            outgoing: {
                opacity: 1 - p * 0.82,
                transform: `scale(${1 + p * 0.04})`,
                filter: `blur(${p * 6}px) brightness(${1 + p * 0.14})`,
            },
            incoming: {
                opacity: p,
                transform: `scale(${1.06 - p * 0.06})`,
                filter: `blur(${Math.max(0, (1 - p) * 6)}px) brightness(${1 + (1 - p) * 0.12})`,
            },
            overlay: {
                opacity: 0.85,
                transform: `translateX(${-10 + p * 20}%)`,
                background: 'radial-gradient(circle at 0% 30%, rgba(255,161,65,0.5), transparent 28%), radial-gradient(circle at 100% 75%, rgba(255,214,148,0.45), transparent 24%)',
            },
        };
    }

    if (transition === 'depth_parallax_snap') {
        return {
            outgoing: {
                opacity: 1 - p * 0.84,
                transform: `translateX(${-10 * p}%) translateY(${-2 * p}%) scale(${1 + p * 0.04})`,
                filter: `blur(${p * 5}px)`,
            },
            incoming: {
                opacity: p,
                transform: `translateX(${18 - p * 18}%) translateY(${4 - p * 4}%) scale(${1.12 - p * 0.12})`,
                filter: `blur(${Math.max(0, (1 - p) * 7)}px)`,
            },
            overlay: {
                opacity: 0.46,
                transform: `translateX(${-25 + p * 50}px)`,
                background: 'linear-gradient(180deg, rgba(255,255,255,0.08), transparent 26%, transparent 74%, rgba(255,255,255,0.06))',
            },
        };
    }

    if (transition === 'ghost_trail_crossfade') {
        return {
            outgoing: {
                opacity: 1 - p * 0.92,
                transform: `translateX(${-8 * p}%) scale(${1 + p * 0.03})`,
                filter: `blur(${p * 8}px)`,
            },
            incoming: {
                opacity: p,
                transform: `translateX(${12 - p * 12}%) scale(${1.05 - p * 0.05})`,
                filter: `blur(${Math.max(0, (1 - p) * 9)}px)`,
            },
            overlay: {
                opacity: 0.52 * (1 - p),
                transform: `translateX(${-20 + p * 40}px)`,
                background: 'linear-gradient(90deg, rgba(255,255,255,0.16), transparent 30%, rgba(255,255,255,0.08) 60%, transparent)',
            },
        };
    }

    if (transition === 'iris_close_open') {
        return {
            outgoing: {
                opacity: 1,
                transform: 'scale(1)',
                clipPath: `circle(${150 - p * 150}% at 50% 50%)`,
                filter: `blur(${p * 4}px)`,
            },
            incoming: {
                opacity: 1,
                transform: 'scale(1)',
                clipPath: `circle(${p * 150}% at 50% 50%)`,
                filter: `blur(${Math.max(0, (1 - p) * 5)}px)`,
            },
            overlay: {
                opacity: 0.5,
                transform: 'none',
                background: `radial-gradient(circle at center, transparent 0%, transparent ${20 + p * 40}%, rgba(0,0,0,0.26) ${40 + p * 28}%, rgba(0,0,0,0.76) 100%)`,
            },
        };
    }

    return {
        outgoing: {
            opacity: 1 - p * 0.85,
            transform: `scale(${1 + p * 0.05})`,
            filter: `blur(${p * 12}px)`,
        },
        incoming: {
            opacity: p,
            transform: `scale(${1.08 - p * 0.08})`,
            filter: `blur(${Math.max(0, (1 - p) * 16)}px)`,
        },
        overlay: {
            opacity: 0.3 + p * 0.2,
            transform: 'none',
            background: 'radial-gradient(circle at center, rgba(200,220,255,0.22), transparent 64%)',
        },
    };
};

function TransitionPreview({
    name,
    transition,
    accent,
    progress,
}: {
    name: string;
    transition: string;
    accent: string;
    progress: number;
}) {
    const stylesForTransition = getStylesForTransition(transition, progress);

    return (
        <div className={styles.previewShell}>
            <div className={styles.previewViewport}>
                <div
                    className={`${styles.sceneLayer} ${styles.sceneA}`}
                    style={stylesForTransition.outgoing}
                >
                    <div className={styles.sceneGlow} style={{ background: `radial-gradient(circle at 22% 18%, ${accent}55, transparent 34%)` }} />
                    <div className={styles.sceneContent}>
                        <div className={styles.sceneKicker}>Outgoing</div>
                        <div className={styles.sceneTitle}>Quantum Chips</div>
                        <div className={styles.sceneBody}>Faster superconducting control across unstable states.</div>
                    </div>
                </div>

                <div
                    className={`${styles.sceneLayer} ${styles.sceneB}`}
                    style={stylesForTransition.incoming}
                >
                    <div className={styles.sceneGlow} style={{ background: `radial-gradient(circle at 78% 20%, ${accent}66, transparent 36%)` }} />
                    <div className={styles.sceneContent}>
                        <div className={styles.sceneKicker}>Incoming</div>
                        <div className={styles.sceneTitle}>Neural Imaging</div>
                        <div className={styles.sceneBody}>Sharper brain-state reconstruction with less noise and cleaner timing.</div>
                    </div>
                </div>

                <div className={styles.transitionOverlay} style={stylesForTransition.overlay} />

                <div className={styles.captionBand}>
                    <span>{name}</span>
                </div>
            </div>
        </div>
    );
}

export default function PremiumTransitionsPage() {
    const [time, setTime] = useState(0);

    useEffect(() => {
        const start = performance.now();
        let frame = 0;

        const loop = () => {
            const elapsed = (performance.now() - start) / 1000;
            setTime(elapsed);
            frame = requestAnimationFrame(loop);
        };

        frame = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(frame);
    }, []);

    return (
        <main className={styles.page}>
            <section className={styles.hero}>
                <div className={styles.heroBadge}>Premium Reel Transition Lab</div>
                <h1>See every premium transition before committing to it.</h1>
                <p>
                    This page loops the current premium reel transition set so the naming is no longer abstract.
                    If an effect feels weak or repetitive here, it will feel weak in the reel too.
                </p>
            </section>

            <section className={styles.grid}>
                {TRANSITIONS.map((transition, index) => {
                    const localProgress = ((time * 0.42) + index * 0.17) % 1;
                    return (
                        <article className={styles.card} key={transition.key}>
                            <div className={styles.cardTop}>
                                <div>
                                    <div className={styles.cardLabel}>Transition</div>
                                    <h2>{transition.name}</h2>
                                </div>
                                <div className={styles.pill} style={{ borderColor: `${transition.accent}66`, color: transition.accent }}>
                                    {transition.key}
                                </div>
                            </div>
                            <TransitionPreview
                                name={transition.name}
                                transition={transition.key}
                                accent={transition.accent}
                                progress={localProgress}
                            />
                            <p className={styles.cardDescription}>{transition.description}</p>
                        </article>
                    );
                })}
            </section>
        </main>
    );
}

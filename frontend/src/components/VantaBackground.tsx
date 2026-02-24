'use client';

import React, { useEffect, useRef, useState } from 'react';

interface VantaBackgroundProps {
    children: React.ReactNode;
    className?: string;
    /** Overrides for vanta.fog defaults — useful for tuning per-page */
    vantaOptions?: Record<string, unknown>;
}

const VANTA_DEFAULTS = {
    highlightColor: 0xd4a853, // --accent
    midtoneColor: 0x1a1a26, // --bg-tertiary
    lowlightColor: 0x0a0a0f, // --bg-primary
    baseColor: 0x0a0a0f,
    blurFactor: 0.60,
    speed: 1.00,
    zoom: 1.00,
};

/**
 * VantaBackground
 *
 * Wraps children in an interactive Vanta.js Fog canvas.
 * This version uses dynamic imports inside useEffect to ensure 
 * Three.js and Vanta are NEVER loaded or parsed on the server.
 */
export function VantaBackground({
    children,
    className,
    vantaOptions = {},
}: VantaBackgroundProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [vantaEffect, setVantaEffect] = useState<any>(null);

    useEffect(() => {
        if (vantaEffect || !containerRef.current) return;

        let effect: any = null;

        const initVanta = async () => {
            try {
                // Import Three.js and Vanta only on the client
                const THREE = await import('three');
                // @ts-ignore - Vanta doesn't have official types
                const { default: FOG } = await import('vanta/dist/vanta.fog.min');

                if (!containerRef.current) return;

                effect = FOG({
                    el: containerRef.current,
                    THREE: THREE,
                    mouseControls: true,
                    touchControls: true,
                    gyroControls: false,
                    minHeight: 200,
                    minWidth: 200,
                    ...VANTA_DEFAULTS,
                    ...vantaOptions,
                });

                setVantaEffect(effect);
            } catch (err) {
                console.error('Failed to initialize Vanta background:', err);
            }
        };

        initVanta();

        return () => {
            if (effect) {
                effect.destroy();
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div
            ref={containerRef}
            className={className}
            style={{ position: 'relative', width: '100%' }}
        >
            <div style={{ position: 'relative', zIndex: 1 }}>
                {children}
            </div>
        </div>
    );
}

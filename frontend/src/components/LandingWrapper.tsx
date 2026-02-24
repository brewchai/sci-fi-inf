'use client';

import { VantaBackground } from '@/components/VantaBackground';

interface LandingWrapperProps {
    children: React.ReactNode;
}

/**
 * LandingWrapper
 *
 * Thin client boundary that wraps the entire landing page content in the
 * Vanta Fog background. Children are still server-rendered — this component
 * only provides the WebGL canvas layer underneath them.
 */
export default function LandingWrapper({ children }: LandingWrapperProps) {
    return (
        <VantaBackground
            vantaOptions={{
                blurFactor: 0.55,
                speed: 0.70,
                zoom: 0.90,
            }}
        >
            {children}
        </VantaBackground>
    );
}

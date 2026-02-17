import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/react';
import './globals.css';

export const metadata: Metadata = {
    metadataBase: new URL('https://www.theeurekafeed.com'),
    title: {
        default: 'The Eureka Feed | Daily Science Research Made Simple',
        template: '%s | The Eureka Feed',
    },
    description: 'Get the latest research breakthroughs delivered daily, explained in simple terms. Perfect for curious minds who want to stay informed without the jargon.',
    keywords: ['research', 'science', 'daily digest', 'ELI5', 'academic papers', 'podcast', 'science news', 'research summary'],
    icons: {
        icon: '/favicon.png',
        apple: '/favicon.png',
    },
    openGraph: {
        title: 'The Eureka Feed — Fresh Research, Delivered Daily',
        description: 'Every morning, the latest academic papers explained for curious minds in just 3 minutes. Stay ahead without the PhD.',
        url: 'https://www.theeurekafeed.com',
        siteName: 'The Eureka Feed',
        type: 'website',
        locale: 'en_US',
        images: [
            {
                url: '/og-image.png',
                width: 1200,
                height: 630,
                alt: 'The Eureka Feed — Daily Science Research Made Simple',
            },
        ],
    },
    twitter: {
        card: 'summary_large_image',
        title: 'The Eureka Feed — Fresh Research, Delivered Daily',
        description: 'Every morning, the latest academic papers explained for curious minds in just 3 minutes.',
        images: ['/og-image.png'],
    },
    alternates: {
        canonical: 'https://www.theeurekafeed.com',
    },
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <body>
                {children}
                <Analytics />
            </body>
        </html>
    );
}

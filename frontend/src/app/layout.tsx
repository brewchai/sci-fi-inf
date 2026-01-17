import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
    title: 'The Eureka Feed | Daily Science Research Made Simple',
    description: 'Get the latest research breakthroughs delivered daily, explained in simple terms. Perfect for curious minds who want to stay informed without the jargon.',
    keywords: ['research', 'science', 'daily digest', 'ELI5', 'academic papers'],
    icons: {
        icon: '/favicon.png',
        apple: '/favicon.png',
    },
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    );
}

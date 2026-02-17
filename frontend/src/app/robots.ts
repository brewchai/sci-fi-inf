import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
    return {
        rules: {
            userAgent: '*',
            allow: '/',
            disallow: ['/login', '/onboarding', '/settings', '/feed'],
        },
        sitemap: 'https://www.theeurekafeed.com/sitemap.xml',
    };
}

import { BookOpen, Twitter, Linkedin, Mail } from 'lucide-react';
import styles from './Footer.module.css';

export function Footer() {
    const currentYear = new Date().getFullYear();

    return (
        <footer className={styles.footer}>
            <div className={styles.footerInner}>
                <div className={styles.footerBrand}>
                    <div className={styles.footerLogo}>
                        <BookOpen size={20} />
                        The Eureka Feed
                    </div>
                    <p className={styles.footerTagline}>
                        Cutting-edge research, distilled into digestible insights.
                        Stay informed without the academic overwhelm.
                    </p>
                </div>

                <div className={styles.footerColumn}>
                    <h4>Support</h4>
                    <ul className={styles.footerLinks}>
                        <li><a href="/contact">Contact Us</a></li>
                    </ul>
                </div>

                <div className={styles.footerColumn}>
                    <h4>Legal</h4>
                    <ul className={styles.footerLinks}>
                        <li><a href="/privacy">Privacy Policy</a></li>
                        <li><a href="/terms">Terms of Service</a></li>
                    </ul>
                </div>
            </div>

            <div className={styles.footerBottom}>
                <p className={styles.copyright}>
                    © {currentYear} The Eureka Feed. All rights reserved.
                </p>
                {/* Social links - uncomment when ready
                <div className={styles.socials}>
                    <a href="https://twitter.com" target="_blank" rel="noopener noreferrer">
                        <Twitter size={20} />
                    </a>
                    <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer">
                        <Linkedin size={20} />
                    </a>
                    <a href="mailto:hello@eurekabrief.com">
                        <Mail size={20} />
                    </a>
                </div>
                */}
            </div>
        </footer>
    );
}

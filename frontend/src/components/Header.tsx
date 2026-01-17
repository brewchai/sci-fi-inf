import Link from 'next/link';
import { BookOpen } from 'lucide-react';
import styles from './Header.module.css';

export function Header() {
    return (
        <header className={styles.header}>
            <div className={styles.headerInner}>
                <Link href="/" className={styles.logo}>
                    <span className={styles.logoIcon}>
                        <BookOpen size={18} />
                    </span>
                    The Eureka Feed
                </Link>

                <nav className={styles.nav}>
                    <a href="#how-it-works" className={styles.navLink}>How It Works</a>
                    <a href="#categories" className={styles.navLink}>Categories</a>
                    <a href="#early-access" className={styles.navLink}>Early Access</a>
                </nav>

                {/* Auth buttons hidden for pre-launch */}
                {/* <div className={styles.navActions}>
                    <Link href="/login" className="btn btn-secondary">
                        Sign In
                    </Link>
                    <Link href="/login?signup=true" className="btn btn-primary">
                        Get Started
                    </Link>
                </div> */}
            </div>
        </header>
    );
}

import Link from "next/link";
import { Logo } from "@/components/layout/logo";
import { PAGES } from "@/lib/seo/pages";
import { AccountLinks } from "./account-links";
import { InstallAppButton } from "./install-app";
import { MobileSiteMenu } from "./mobile-site-menu";
import { Container } from "./ui";

const NAV = [PAGES.features, PAGES.resources, PAGES.blog, PAGES.about];

/** Public site navigation with crawlable links and a native mobile menu. */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-ink/85 backdrop-blur-xl print:hidden">
      <Container className="flex h-16 items-center gap-2 sm:gap-4 lg:gap-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="DoOrDie home">
          <Logo className="h-7 w-7" />
          <span className="font-display text-lg font-bold tracking-tightest text-paper">DoOrDie</span>
        </Link>

        <nav aria-label="Main" className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {NAV.map((p) => (
              <li key={p.path}>
                <Link
                  href={p.path}
                  className="rounded-full px-3 py-2 text-sm font-medium text-paper/70 transition-colors hover:bg-paper/[0.06] hover:text-paper"
                >
                  {p.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <InstallAppButton />
          <div className="hidden lg:block">
            <AccountLinks />
          </div>
        </div>

        <MobileSiteMenu pages={NAV.map(({ path, label }) => ({ path, label }))} />
      </Container>
    </header>
  );
}

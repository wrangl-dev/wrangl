import { useState, useEffect, useRef, useCallback, type MouseEvent } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, GithubIcon, Menu01Icon } from "@hugeicons/core-free-icons";
import { Button } from "../ui/Button";
import { Logo } from "../ui/Logo";
import { cn } from "../../lib/utils";
import { DOCS_URL, GITHUB_REPO_URL, LATEST_RELEASE_URL } from "../../lib/links";
import { readCssTime } from "../../lib/read-css-time";
import { HEADER_SCROLL_OFFSET, smoothScrollToHash } from "../../lib/smooth-scroll";

// Kept for the App shell; the header is a solid bar and no longer reacts to scroll.
export type HeaderProps = { scrollTop?: number };

const navLinks = [
  { href: "#features", label: "Features", external: false },
  { href: "#download", label: "Downloads", external: false },
  { href: DOCS_URL, label: "Docs", external: true },
] as const;

export const Header = (_props: HeaderProps) => {
  const [menuPhase, setMenuPhase] = useState<"closed" | "open" | "closing">("closed");
  const closeTimer = useRef<number | null>(null);
  const menuOpen = menuPhase === "open";

  const clearCloseTimer = useCallback(() => {
    if (closeTimer.current == null) return;
    window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }, []);

  const openMenu = useCallback(() => {
    clearCloseTimer();
    setMenuPhase("open");
  }, [clearCloseTimer]);

  const closeMenu = useCallback(() => {
    setMenuPhase((current) => (current === "open" ? "closing" : current));
  }, []);

  useEffect(() => {
    if (!menuOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeMenu, menuOpen]);

  useEffect(() => {
    if (menuPhase !== "closing") return;

    const closeMs = readCssTime("--dropdown-close-dur", 150);
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null;
      setMenuPhase("closed");
    }, closeMs);

    return () => clearCloseTimer();
  }, [clearCloseTimer, menuPhase]);

  useEffect(() => () => clearCloseTimer(), [clearCloseTimer]);

  const handleAnchorClick = (
    event: MouseEvent<HTMLAnchorElement>,
    href: string,
  ) => {
    if (!href.startsWith("#")) return;

    event.preventDefault();
    closeMenu();

    if (smoothScrollToHash(href, { offset: HEADER_SCROLL_OFFSET })) {
      window.history.pushState(null, "", href);
    }
  };

  const linkClassName =
    "border-b border-transparent py-1 transition-[color,border-color] duration-150 ease-[var(--ease-out)] hover:border-white hover:text-white";

  return (
    <>
      <header className="fixed top-0 right-0 left-0 z-50 flex items-center justify-between border-b border-white/15 bg-ink px-6 py-3.5 md:grid md:grid-cols-[1fr_auto_1fr]">
        <div className="min-w-0 md:justify-self-start md:col-start-1">
          <Logo />
        </div>

        <nav
          className="hidden items-center justify-center gap-8 font-mono text-sm text-gray-400 md:col-start-2 md:flex md:justify-self-center"
        >
          {navLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              target={link.external ? "_blank" : undefined}
              rel={link.external ? "noreferrer" : undefined}
              onClick={
                link.external
                  ? undefined
                  : (event) => handleAnchorClick(event, link.href)
              }
              className={linkClassName}
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3 text-sm min-w-0 md:justify-self-end md:col-start-3">
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub"
            className="hidden items-center gap-2 font-mono text-gray-400 transition-colors duration-150 ease-[var(--ease-out)] hover:text-white sm:flex"
          >
            <HugeiconsIcon icon={GithubIcon} className="w-4 h-4" />
            <span>GitHub</span>
          </a>
          <Button
            as="a"
            href={LATEST_RELEASE_URL}
            target="_blank"
            rel="noreferrer"
            size="sm"
            className="hidden sm:inline-flex"
          >
            Download
          </Button>
          <button
            type="button"
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={() => {
              if (menuOpen) closeMenu();
              else openMenu();
            }}
            className="flex h-10 w-10 items-center justify-center rounded-sm border border-white/20 text-white transition-colors duration-150 ease-[var(--ease-out)] hover:bg-white/10 md:hidden"
          >
            <span
              className="t-icon-swap"
              data-state={menuOpen ? "b" : "a"}
            >
              <span className="t-icon" data-icon="a">
                <HugeiconsIcon icon={Menu01Icon} className="w-5 h-5" />
              </span>
              <span className="t-icon" data-icon="b">
                <HugeiconsIcon icon={Cancel01Icon} className="w-5 h-5" />
              </span>
            </span>
          </button>
        </div>
      </header>

      <div
        id="mobile-nav"
        className={cn(
          "fixed inset-0 z-40 md:hidden",
          menuOpen ? "pointer-events-auto" : "pointer-events-none",
        )}
        aria-hidden={!menuOpen}
      >
        <button
          type="button"
          aria-label="Close menu"
          onClick={closeMenu}
          className={cn(
            "absolute inset-0 bg-black/70 transition-opacity duration-200 ease-[var(--ease-out)]",
            menuOpen ? "opacity-100" : "opacity-0",
          )}
        />
        <nav
          className={cn(
            "t-dropdown absolute top-[76px] left-4 right-4 rounded-sm border border-white/25 bg-ink p-2",
            menuPhase === "open" && "is-open",
            menuPhase === "closing" && "is-closing",
          )}
          data-origin="top-right"
        >
          {navLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              target={link.external ? "_blank" : undefined}
              rel={link.external ? "noreferrer" : undefined}
              onClick={(event) => {
                if (link.external) {
                  closeMenu();
                  return;
                }
                handleAnchorClick(event, link.href);
              }}
              className="flex items-center justify-between rounded-sm px-4 py-3.5 font-mono text-base text-gray-200 transition-[color,background-color] duration-150 ease-[var(--ease-out)] hover:bg-white/10"
            >
              {link.label}
            </a>
          ))}
          <div className="mt-2 flex flex-col gap-2 border-t border-white/10 p-2 pt-4">
            <Button
              as="a"
              href={LATEST_RELEASE_URL}
              target="_blank"
              rel="noreferrer"
              size="md"
              className="w-full"
              onClick={closeMenu}
            >
              Download
            </Button>
            <Button
              as="a"
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noreferrer"
              variant="dark"
              size="md"
              className="w-full"
              onClick={closeMenu}
            >
              <HugeiconsIcon icon={GithubIcon} className="w-4 h-4" />
              GitHub
            </Button>
          </div>
        </nav>
      </div>
    </>
  );
};

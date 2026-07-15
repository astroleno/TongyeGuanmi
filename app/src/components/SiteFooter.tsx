import { SITE_META } from '../content/site-meta';

export function SiteFooter() {
  return (
    <footer className="site-footer" data-site-footer="true">
      <div className="site-footer__meta">
        <span>{SITE_META.footer.company}</span>
        <span>{SITE_META.footer.tagline}</span>
      </div>
      <div className="site-footer__records">
        <a className="site-footer__record" href={SITE_META.footer.filingUrl}>
          {SITE_META.footer.filingText}
        </a>
        <a
          className="site-footer__record"
          href={SITE_META.footer.publicSecurityUrl}
          target="_blank"
          rel="noreferrer"
          aria-label={SITE_META.footer.publicSecurityAriaLabel}
        >
          {SITE_META.footer.publicSecurityText}
        </a>
      </div>
    </footer>
  );
}

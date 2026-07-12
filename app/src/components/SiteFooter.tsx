import { SITE_META } from '../content/site-meta';

export function SiteFooter() {
  return (
    <footer className="site-footer" data-site-footer="true">
      <span>{SITE_META.footer.company}</span>
      <span>{SITE_META.footer.tagline}</span>
      <a href={SITE_META.footer.filingUrl}>{SITE_META.footer.filingText}</a>
    </footer>
  );
}

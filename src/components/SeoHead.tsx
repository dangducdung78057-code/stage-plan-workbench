import { Helmet } from "react-helmet-async";
import { useLocation } from "react-router-dom";

type Props = {
  title: string;
  description: string;
  /** When true (default for authed routes), tells crawlers not to index this route. */
  noindex?: boolean;
};

/**
 * Per-route <head> tags for StageOS. Uses relative canonical/og:url so it stays
 * correct across preview / custom domains.
 */
export function SeoHead({ title, description, noindex = false }: Props) {
  const { pathname } = useLocation();
  const path = pathname || "/";
  const fullTitle = title.includes("StageOS") ? title : `${title} · StageOS`;
  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={path} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={path} />
      <meta property="og:type" content="website" />
      <meta name="twitter:card" content="summary" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      {noindex && <meta name="robots" content="noindex,nofollow" />}
    </Helmet>
  );
}

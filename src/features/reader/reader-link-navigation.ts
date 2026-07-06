export type ReaderLinkNavigation =
  | { kind: "internal-anchor"; id: string }
  | { kind: "external"; href: string }
  | { kind: "ignore" };

export function getReaderLinkNavigation(
  rawHref: string,
  documentHref = globalThis.location?.href ?? "http://localhost/",
): ReaderLinkNavigation {
  const href = rawHref.trim();

  if (!href) {
    return { kind: "ignore" };
  }

  if (href.startsWith("#")) {
    return getInternalAnchorNavigation(href);
  }

  let linkUrl: URL;
  let currentUrl: URL;

  try {
    linkUrl = new URL(href, documentHref);
    currentUrl = new URL(documentHref);
  } catch {
    return { kind: "ignore" };
  }

  if (
    linkUrl.hash &&
    linkUrl.origin === currentUrl.origin &&
    linkUrl.pathname === currentUrl.pathname &&
    linkUrl.search === currentUrl.search
  ) {
    return getInternalAnchorNavigation(linkUrl.hash);
  }

  if (["http:", "https:", "mailto:", "tel:"].includes(linkUrl.protocol)) {
    return { kind: "external", href: linkUrl.href };
  }

  return { kind: "ignore" };
}

function getInternalAnchorNavigation(hash: string): ReaderLinkNavigation {
  const id = decodeURIComponent(hash.slice(1));

  return id ? { kind: "internal-anchor", id } : { kind: "ignore" };
}

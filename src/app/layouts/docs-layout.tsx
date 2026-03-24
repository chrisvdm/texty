import type { LayoutProps } from "rwsdk/router";

import { defaultDoc, docs, getDocBySlug } from "@/app/docs/content";

export const DocsLayout = ({ children, requestInfo }: LayoutProps) => {
  const pathname = requestInfo
    ? new URL(requestInfo.request.url).pathname
    : "/docs";
  const activeSlug =
    pathname.replace(/^\/docs\/?/, "").split("/")[0] || defaultDoc?.slug || "";
  const activeDoc = getDocBySlug(activeSlug);

  return (
    <main className="landing-page">
      <section className="landing-shell">
        <div className="landing-topbar">
          <a className="landing-docs-link" href="/">
            Back
          </a>
        </div>

        <section className="docs-layout">
          <aside className="docs-sidebar">
            <p className="landing-section-label">Docs</p>
            <nav className="docs-nav" aria-label="Documentation">
              {docs.map((entry) => (
                <a
                  key={entry.slug}
                  className={
                    entry.slug === activeDoc?.slug
                      ? "docs-nav-link docs-nav-link-active"
                      : "docs-nav-link"
                  }
                  href={`/docs/${entry.slug}`}
                >
                  {entry.label}
                </a>
              ))}
            </nav>
          </aside>

          <article className="docs-main">{children}</article>
        </section>
      </section>
    </main>
  );
};

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
            <a className="docs-brand" href="/">
              <img
                className="docs-brand-logo"
                src="/familiar-mark.svg"
                alt="familiar logo"
                width="30"
                height="30"
              />
              <span className="docs-brand-name">familiar</span>
            </a>
            <p className="landing-section-label">Docs</p>
            <nav aria-label="Documentation">
              <ol className="docs-nav">
                {docs.map((entry) => (
                  <li key={entry.slug} className="docs-nav-item">
                    <a
                      className={
                        entry.slug === activeDoc?.slug
                          ? "docs-nav-link docs-nav-link-active"
                          : "docs-nav-link"
                      }
                      href={`/docs/${entry.slug}`}
                    >
                      {entry.label}
                    </a>
                    {entry.slug === activeDoc?.slug && entry.sections.length > 0 ? (
                      <ul
                        className="docs-subnav"
                        aria-label={`${entry.label} sections`}
                      >
                        {entry.sections.map((section) => (
                          <li key={section.anchor} className="docs-subnav-item">
                            <a
                              className="docs-subnav-link"
                              href={`/docs/${entry.slug}#${section.anchor}`}
                            >
                              {section.title}
                            </a>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ol>
            </nav>
          </aside>

          <article className="docs-main">{children}</article>
        </section>
      </section>
    </main>
  );
};

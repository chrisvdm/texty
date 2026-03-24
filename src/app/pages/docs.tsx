import { getDocBySlug } from "../docs/content";
import { renderMarkdown } from "../docs/markdown";

export const DocsPage = ({
  params,
}: {
  params?: { slug?: string };
}) => {
  const activeDoc = getDocBySlug(params?.slug);

  return (
    <>
      {activeDoc ? (
        <>
          <p className="landing-section-label">familiar docs</p>
          <h1 className="docs-title">{activeDoc.label}</h1>
          <div className="docs-content">{renderMarkdown(activeDoc.content)}</div>
        </>
      ) : (
        <>
          <p className="landing-section-label">Docs</p>
          <h1 className="docs-title">No documentation found.</h1>
        </>
      )}
    </>
  );
};

const docModules = import.meta.glob("../docs-content/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const DOC_ORDER = [
  "intro",
  "install-and-run",
  "quickstart",
  "api-reference",
  "concepts",
  "integrations",
  "executors",
  "webhooks",
];

const toSlug = (path: string) =>
  path.split("/").at(-1)?.replace(/\.md$/, "") ?? "";

const toLabel = (slug: string) =>
  slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

export const toAnchorId = (value: string) =>
  value
    .toLowerCase()
    .replace(/[`'".,/?#!$%^&*;:{}=\-_~()]/g, "")
    .trim()
    .replace(/\s+/g, "-");

const getSections = (content: string) =>
  content
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("## "))
    .map((line) => {
      const title = line.replace(/^##\s+/, "").trim();

      return {
        title,
        anchor: toAnchorId(title),
      };
    });

const getOrderIndex = (slug: string) => {
  const index = DOC_ORDER.indexOf(slug);
  return index === -1 ? DOC_ORDER.length : index;
};

export const docs = Object.entries(docModules)
  .map(([path, content]) => {
    const slug = toSlug(path);
    return {
      slug,
      label: toLabel(slug),
      content,
      sections: getSections(content),
    };
  })
  .sort((left, right) => {
    const orderDifference = getOrderIndex(left.slug) - getOrderIndex(right.slug);

    if (orderDifference !== 0) {
      return orderDifference;
    }

    return left.slug.localeCompare(right.slug);
  });

export const defaultDoc = docs[0] ?? null;

export const getDocBySlug = (slug?: string) => {
  const normalizedSlug = slug?.trim();

  if (!normalizedSlug) {
    return defaultDoc;
  }

  return docs.find((entry) => entry.slug === normalizedSlug) ?? defaultDoc;
};

export const getRenderableDocContent = (content: string) =>
  content.replace(/^#\s+.+\n+/, "");

export const getNextDoc = (slug?: string) => {
  const activeDoc = getDocBySlug(slug);

  if (!activeDoc) {
    return null;
  }

  const activeIndex = docs.findIndex((entry) => entry.slug === activeDoc.slug);

  if (activeIndex === -1 || activeIndex === docs.length - 1) {
    return null;
  }

  return docs[activeIndex + 1] ?? null;
};

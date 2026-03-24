const docModules = import.meta.glob("../docs-content/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const toSlug = (path: string) =>
  path.split("/").at(-1)?.replace(/\.md$/, "") ?? "";

const toLabel = (slug: string) =>
  slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

export const docs = Object.entries(docModules)
  .map(([path, content]) => {
    const slug = toSlug(path);
    return {
      slug,
      label: toLabel(slug),
      content,
    };
  })
  .sort((left, right) => left.slug.localeCompare(right.slug));

export const defaultDoc = docs[0] ?? null;

export const getDocBySlug = (slug?: string) => {
  const normalizedSlug = slug?.trim();

  if (!normalizedSlug) {
    return defaultDoc;
  }

  return docs.find((entry) => entry.slug === normalizedSlug) ?? defaultDoc;
};

import homeStyles from "./home.css?url";

export const StaticDocument: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <html lang="en">
    <head>
      <meta charSet="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>familiar</title>
      <meta
        name="description"
        content="familiar makes tools and workflows easier to use through conversation."
      />
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link
        href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Space+Grotesk:wght@400;500;700&display=swap"
        rel="stylesheet"
      />
      <link rel="stylesheet" href={homeStyles} />
    </head>
    <body>{children}</body>
  </html>
);

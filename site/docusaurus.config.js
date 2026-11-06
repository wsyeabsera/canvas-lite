// Docs live in ../docs and change in the same commit as the code they describe.
export default {
  title: "Lite",
  tagline: "Canvas, rebuilt in small steps",
  url: "https://lite.tvdash-hub.workers.dev",
  baseUrl: "/docs/",
  onBrokenLinks: "throw",
  markdown: { hooks: { onBrokenMarkdownLinks: "throw" } },
  presets: [
    [
      "classic",
      {
        docs: { path: "../docs", routeBasePath: "/", sidebarPath: "./sidebars.js" },
        blog: false,
        theme: {},
      },
    ],
  ],
  themeConfig: {
    navbar: { title: "Lite" },
    colorMode: { respectPrefersColorScheme: true },
  },
};

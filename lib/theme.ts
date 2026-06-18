import { createTheme, type MantineColorsTuple } from "@mantine/core";

// #00d992 brand color — 10-shade palette light→dark
const brandColor: MantineColorsTuple = [
  "#e0fff5",
  "#b3ffe9",
  "#7dffd8",
  "#42ffbf",
  "#12efab",
  "#00d992",
  "#00b87b",
  "#009764",
  "#00764e",
  "#004d33",
];

export const theme = createTheme({
  primaryColor: "brand",
  primaryShade: { dark: 5, light: 6 },
  colors: {
    brand: brandColor,
  },
  fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
  fontFamilyMonospace: "JetBrains Mono, Fira Code, monospace",
  headings: {
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
  },
  defaultRadius: "md",
  components: {
    AppShell: {
      styles: {
        navbar: { borderRight: "1px solid var(--mantine-color-dark-4)" },
        header: { borderBottom: "1px solid var(--mantine-color-dark-4)" },
      },
    },
  },
});

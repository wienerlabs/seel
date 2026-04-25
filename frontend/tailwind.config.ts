import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        "seel-purple": "#9945FF",
        "seel-green": "#14F195",
        "seel-dark": "#0F0F1A",
        "seel-card": "#1A1A2E",
      },
    },
  },
  plugins: [],
};
export default config;

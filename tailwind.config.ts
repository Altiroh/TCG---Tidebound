import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./features/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        board: {
          background: "#0b1220",
          surface: "#111a2c",
          accent: "#3ea6ff",
        },
      },
    },
  },
  plugins: [],
};

export default config;

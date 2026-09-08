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
      keyframes: {
        "stat-hit": {
          "0%": { transform: "scale(1)", color: "inherit" },
          "30%": { transform: "scale(1.35)", color: "#fb7185" },
          "60%": { transform: "scale(0.95)", color: "#fb7185" },
          "100%": { transform: "scale(1)", color: "inherit" },
        },
      },
      animation: {
        "stat-hit": "stat-hit 0.5s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;

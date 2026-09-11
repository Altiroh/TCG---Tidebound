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
        "phase-banner": {
          "0%": { opacity: "0", transform: "scale(0.9)" },
          "12%": { opacity: "1", transform: "scale(1)" },
          "80%": { opacity: "1", transform: "scale(1)" },
          "100%": { opacity: "0", transform: "scale(1.02)" },
        },
        "stat-buff": {
          "0%": { transform: "scale(1)" },
          "30%": { transform: "scale(1.35)" },
          "60%": { transform: "scale(0.95)" },
          "100%": { transform: "scale(1)" },
        },
      },
      animation: {
        "stat-hit": "stat-hit 0.5s ease-out",
        "phase-banner": "phase-banner 1.6s ease-in-out forwards",
        // Pulse neutre (n'impose pas de couleur, contrairement à stat-hit) —
        // pour la coloration verte/rouge des modificateurs, appliquée en
        // classe séparée (voir `CardTile.tsx`).
        "stat-buff": "stat-buff 0.5s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;

import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "off",
      "@next/next/no-img-element": "off",
      // The UI copy is French, which uses apostrophes constantly (l'IA, d'un, n'est…).
      "react/no-unescaped-entities": "off",
    },
  },
  { ignores: [".next/**", "node_modules/**", "public/renders/**"] },
];

export default config;

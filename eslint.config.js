export default [
  {
    ignores: [
      "dist/**/*",
      "build/**/*",
      "coverage/**/*", 
      "node_modules/**/*",
      "*.min.js",
      "*.bundle.js",
      ".smithery/**/*"
    ],
  },
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
    },
    rules: {
      "no-console": "off",
      "no-unused-vars": "error",
    },
  },
];

// https://docs.expo.dev/guides/using-eslint/
// The app's own lint (`npm run lint` → `expo lint`). The web's config at the
// repository root ignores `mobile/**` — its Next rules do not apply here.
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*", "dist-check/*", ".expo/*"],
  },
  {
    rules: {
      // House style, shared with the web (whose files `src/shared/` copies
      // verbatim): `Array<T>` and `T[]` are both written. A style rule that
      // could only be satisfied by rewriting generated files is not one to keep.
      "@typescript-eslint/array-type": "off",
    },
  },
]);

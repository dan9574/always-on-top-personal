import esbuild from "esbuild";
import process from "process";

const isProduction = process.argv[2] === "production";

// Obsidian provides these modules at runtime — never bundle them.
const externals = [
  "obsidian",
  "electron",
  "@electron/remote",
  "@codemirror/autocomplete",
  "@codemirror/collab",
  "@codemirror/commands",
  "@codemirror/language",
  "@codemirror/lint",
  "@codemirror/search",
  "@codemirror/state",
  "@codemirror/view",
  "@lezer/common",
  "@lezer/highlight",
  "@lezer/lr",
];

const context = await esbuild.context({
  platform: "node",
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: externals,
  format: "cjs",
  target: "es2021",
  logLevel: "info",
  sourcemap: isProduction ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
});

const background = await esbuild.context({
  entryPoints: ["src/background-entry.ts"],
  bundle: true,
  platform: "node",
  external: ["electron"],
  format: "cjs",
  target: "es2021",
  outfile: "background.cjs",
});

if (isProduction) {
  await context.rebuild();
  await background.rebuild();
  process.exit(0);
} else {
  await context.watch();
  await background.watch();
}

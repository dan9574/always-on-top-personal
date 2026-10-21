import { mkdir, copyFile } from "node:fs/promises";
const destination = new URL("../dist/personal-pinned-notes/", import.meta.url);
await mkdir(destination, { recursive: true });
for (const file of ["main.js", "background.cjs", "manifest.json", "styles.css", "LICENSE", "NOTICE.md", "README.md"]) {
  await copyFile(new URL(`../${file}`, import.meta.url), new URL(file, destination));
}
console.log("Packaged dist/personal-pinned-notes (no vault files or old source).");
await mkdir(new URL("scripts/", destination), { recursive: true });
for (const file of ["install.ps1", "windows-startup.ps1"]) {
  await copyFile(new URL(file, import.meta.url), new URL(`scripts/${file}`, destination));
}

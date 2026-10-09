// Next 16.4 static export writes segment prefetch data as `profile/__next.profile/__PAGE__.txt`, but the
// client router requests `profile/__next.profile.__PAGE__.txt`. FastAPI's StaticFiles serves files as they are,
// so copy each segment file to the dotted name the router asks for. Remove once Next emits matching names.
import { copyFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = fileURLToPath(new URL("../out", import.meta.url));
let copied = 0;

function filesIn(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? filesIn(p) : [p];
  });
}

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (!statSync(p).isDirectory()) continue;
    if (name.startsWith("__next.")) {
      for (const file of filesIn(p)) {
        const flat = join(dir, `${name}.${relative(p, file).split(sep).join(".")}`);
        if (!existsSync(flat)) {
          copyFileSync(file, flat);
          copied += 1;
        }
      }
    } else {
      walk(p);
    }
  }
}

if (existsSync(OUT)) walk(OUT);
console.log(`flatten-segments: copied ${copied} prefetch file(s)`);

/** Renders the Android app icon PNGs from mobile/assets/icon/*.svg. */
import sharp from "sharp";

const dir = new URL("../mobile/assets/", import.meta.url).pathname;

for (const [source, target] of [
  ["icon/icon.svg", "icon.png"],
  ["icon/adaptive-foreground.svg", "adaptive-icon.png"],
  ["icon/adaptive-monochrome.svg", "adaptive-monochrome.png"],
]) {
  await sharp(dir + source, { density: 1024 })
    .resize(1024, 1024)
    .png()
    .toFile(dir + target);
  console.log(`mobile/assets/${target}`);
}

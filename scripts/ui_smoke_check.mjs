import fs from "fs";
import path from "path";

const repoRoot = process.cwd();
const indexPath = path.join(repoRoot, "index.html");
const themePath = path.join(repoRoot, "js", "theme.js");

const errors = [];
const oks = [];

function readFileOrError(filePath, label) {
  if (!fs.existsSync(filePath)) {
    errors.push(`Missing ${label}: ${filePath}`);
    return "";
  }
  return fs.readFileSync(filePath, "utf8");
}

const indexHtml = readFileOrError(indexPath, "index.html");
const themeJs = readFileOrError(themePath, "js/theme.js");

if (indexHtml) {
  const hasThemeScript = /<script[^>]*\ssrc=["']js\/theme\.js["'][^>]*>/i.test(indexHtml);
  if (hasThemeScript) {
    oks.push("Found js/theme.js script tag");
  } else {
    errors.push("Missing <script src=\"js/theme.js\"> in index.html");
  }

  const hasStyleSwitcher = /<select[^>]*\sid=["']styleSwitcher["']/i.test(indexHtml);
  if (hasStyleSwitcher) {
    oks.push("Found #styleSwitcher select");
  } else {
    errors.push("Missing <select id=\"styleSwitcher\"> in index.html");
  }

  const hasDataStyle = /<html[^>]*\sdata-style=/i.test(indexHtml);
  if (hasDataStyle) {
    oks.push("Found data-style on <html>");
  } else {
    errors.push("Missing data-style attribute on <html>");
  }

  const compatSelectors = [
    ".modal-overlay",
    ".tab-content",
    ".toast",
    ".meeting-mode",
    ".floating-stop-btn",
  ];

  const missingSelectors = compatSelectors.filter((selector) => !indexHtml.includes(selector));
  if (missingSelectors.length === 0) {
    oks.push("Found compat selectors in index.html CSS");
  } else {
    errors.push(`Missing compat selectors in index.html: ${missingSelectors.join(", ")}`);
  }
}

if (themeJs) {
  const hasAppStyle = /appStyle/.test(themeJs);
  const hasDisplayTheme = /display_theme/.test(themeJs);

  if (hasAppStyle) {
    oks.push("Found appStyle reference in js/theme.js");
  } else {
    errors.push("Missing appStyle reference in js/theme.js");
  }

  if (hasDisplayTheme) {
    oks.push("Found display_theme reference in js/theme.js");
  } else {
    errors.push("Missing display_theme reference in js/theme.js");
  }
}

if (errors.length > 0) {
  console.error("NG: UI smoke check failed");
  for (const message of errors) {
    console.error(`- ${message}`);
  }
  process.exit(1);
}

console.log("OK: UI smoke check passed");
for (const message of oks) {
  console.log(`- ${message}`);
}

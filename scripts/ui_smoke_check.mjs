import fs from "fs";
import path from "path";

const repoRoot = process.cwd();
const indexPath = path.join(repoRoot, "index.html");
const indexCssPath = path.join(repoRoot, "css", "index.css");
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
const indexCss = readFileOrError(indexCssPath, "css/index.css");
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

  const hasIndexCssLink = /<link[^>]*\shref=["']css\/index\.css["'][^>]*>/i.test(indexHtml);
  if (hasIndexCssLink) {
    oks.push("Found css/index.css link in index.html");
  } else {
    errors.push("Missing <link href=\"css/index.css\"> in index.html");
  }

  const compatSelectors = [
    ".modal-overlay",
    ".tab-content",
    ".toast",
    ".meeting-mode",
    ".floating-stop-btn",
  ];

  const cssSource = `${indexHtml}\n${indexCss}`;
  const missingSelectors = compatSelectors.filter((selector) => !cssSource.includes(selector));
  if (missingSelectors.length === 0) {
    oks.push("Found compat selectors in CSS assets");
  } else {
    errors.push(`Missing compat selectors in CSS assets: ${missingSelectors.join(", ")}`);
  }
}

const notFoundPath = path.join(repoRoot, "404.html");
const notFoundHtml = readFileOrError(notFoundPath, "404.html");

if (notFoundHtml) {
  const hasCsp = /<meta[^>]*http-equiv=["']Content-Security-Policy["']/i.test(notFoundHtml);
  if (hasCsp) {
    oks.push("Found CSP meta in 404.html");
  } else {
    errors.push("Missing Content-Security-Policy meta in 404.html");
  }

  // CSP script-src 'self' の下では実行されないため、本文つきインライン<script>を禁止する
  const scriptTags = notFoundHtml.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) || [];
  const inlineScripts = scriptTags.filter((tag) => {
    const hasSrc = /<script\b[^>]*\ssrc=/i.test(tag);
    const body = tag.replace(/^<script\b[^>]*>/i, "").replace(/<\/script>$/i, "");
    return !hasSrc && body.trim().length > 0;
  });
  if (inlineScripts.length === 0) {
    oks.push("No inline <script> bodies in 404.html");
  } else {
    errors.push(`Found ${inlineScripts.length} inline <script> body(ies) in 404.html (blocked by CSP script-src 'self')`);
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

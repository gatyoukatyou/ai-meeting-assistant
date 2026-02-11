import fs from "fs";
import path from "path";

const repoRoot = process.cwd();
const configPath = path.join(repoRoot, "config.html");
const configJsPath = path.join(repoRoot, "js", "config.js");

const errors = [];
const oks = [];

function readFileOrError(filePath, label) {
  if (!fs.existsSync(filePath)) {
    errors.push(`Missing ${label}: ${filePath}`);
    return "";
  }
  return fs.readFileSync(filePath, "utf8");
}

function hasId(html, id) {
  return new RegExp(`id=["']${id}["']`, "i").test(html);
}

function hasScriptSrc(html, src) {
  return new RegExp(`<script[^>]*\\ssrc=["']${src.replaceAll("/", "\\/")}["'][^>]*>`, "i").test(html);
}

const configHtml = readFileOrError(configPath, "config.html");
const configJs = readFileOrError(configJsPath, "js/config.js");

if (configHtml) {
  const requiredIds = [
    "languageSwitcher",
    "sttProvider",
    "openaiApiKey",
    "openaiModel",
    "deepgramApiKey",
    "deepgramModel",
    "geminiApiKey",
    "claudeApiKey",
    "openaiLlmApiKey",
    "groqApiKey",
    "persistApiKeys",
    "clearOnClose",
    "persistMeetingContext",
    "costLimit",
    "costAlertEnabled",
    "llmPriority",
    "displayTheme",
    "uiStyle",
    "colorTheme",
    "exportSettingsBtn",
    "importSettingsTrigger",
    "importFile",
    "clearAllSettingsBtn",
    "saveSettingsBtn",
    "backToMainBtn",
    "successMessage",
    "errorMessage",
  ];

  const missingIds = requiredIds.filter((id) => !hasId(configHtml, id));
  if (missingIds.length === 0) {
    oks.push("Found required config UI IDs");
  } else {
    errors.push(`Missing required config UI IDs: ${missingIds.join(", ")}`);
  }

  const requiredScripts = [
    "js/i18n.js",
    "js/theme.js",
    "js/secure-storage.js",
    "js/config.js",
  ];

  const missingScripts = requiredScripts.filter((src) => !hasScriptSrc(configHtml, src));
  if (missingScripts.length === 0) {
    oks.push("Found required script tags in config.html");
  } else {
    errors.push(`Missing required config scripts: ${missingScripts.join(", ")}`);
  }

  const requiredSections = ["openai_stt_settings", "deepgram_realtime_settings"];
  const missingSections = requiredSections.filter((id) => !hasId(configHtml, id));
  if (missingSections.length === 0) {
    oks.push("Found STT provider sections");
  } else {
    errors.push(`Missing STT provider sections: ${missingSections.join(", ")}`);
  }
}

if (configJs) {
  const requiredHooks = [
    "setupSTTProviderSelector",
    "setupApiKeyButtons",
    "loadSavedSettings",
    "saveSettings",
  ];

  const missingHooks = requiredHooks.filter((name) => !new RegExp(`function\\s+${name}\\s*\\(`).test(configJs));
  if (missingHooks.length === 0) {
    oks.push("Found required config.js hooks");
  } else {
    errors.push(`Missing required config.js hooks: ${missingHooks.join(", ")}`);
  }
}

if (errors.length > 0) {
  console.error("NG: Config smoke check failed");
  for (const message of errors) {
    console.error(`- ${message}`);
  }
  process.exit(1);
}

console.log("OK: Config smoke check passed");
for (const message of oks) {
  console.log(`- ${message}`);
}

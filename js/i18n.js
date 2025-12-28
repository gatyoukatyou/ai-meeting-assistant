/**
 * Lightweight i18n module for AI Meeting Assistant
 * No external dependencies, vanilla JavaScript
 */
const I18n = (function() {
  const STORAGE_KEY = 'ai-meeting-lang';
  const DEFAULT_LANG = 'ja';
  const SUPPORTED_LANGS = ['ja', 'en'];

  let currentLang = DEFAULT_LANG;
  let translations = {};
  let translationsCache = {};

  /**
   * Initialize i18n system
   * @returns {Promise<void>}
   */
  async function init() {
    const stored = getStoredLanguage();
    currentLang = SUPPORTED_LANGS.includes(stored) ? stored : DEFAULT_LANG;
    await loadTranslations(currentLang);
    applyToDOM();
    updateHTMLLang();
    initLanguageSwitcher();
  }

  /**
   * Get stored language preference
   * @returns {string|null}
   */
  function getStoredLanguage() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      return null;
    }
  }

  /**
   * Load translations from JSON file
   * @param {string} lang
   * @returns {Promise<void>}
   */
  async function loadTranslations(lang) {
    // Return from cache if available
    if (translationsCache[lang]) {
      translations = translationsCache[lang];
      return;
    }

    try {
      // Determine base path for locales
      const basePath = getBasePath();
      const response = await fetch(`${basePath}locales/${lang}.json`);
      if (!response.ok) {
        throw new Error(`Failed to load translations: ${response.status}`);
      }
      translations = await response.json();
      translationsCache[lang] = translations;
    } catch (e) {
      console.error('[i18n] Failed to load translations:', e);
      // Fallback to default language
      if (lang !== DEFAULT_LANG && !translationsCache[DEFAULT_LANG]) {
        await loadTranslations(DEFAULT_LANG);
      } else if (translationsCache[DEFAULT_LANG]) {
        translations = translationsCache[DEFAULT_LANG];
      }
    }
  }

  /**
   * Get base path for loading resources
   * @returns {string}
   */
  function getBasePath() {
    // Handle GitHub Pages subdirectory
    const pathname = window.location.pathname;
    if (pathname.includes('/ai-meeting-assistant/')) {
      return '/ai-meeting-assistant/';
    }
    return '/';
  }

  /**
   * Translate a key with optional interpolation
   * @param {string} key - Translation key (e.g., "app.status.ready")
   * @param {Object} params - Interpolation parameters
   * @returns {string}
   */
  function t(key, params = {}) {
    if (!key) return '';

    // Navigate nested keys (e.g., "app.status.ready")
    const keys = key.split('.');
    let value = translations;

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        // Fallback: return key itself (visible in dev)
        console.warn(`[i18n] Missing translation: ${key}`);
        return key;
      }
    }

    if (typeof value !== 'string') {
      console.warn(`[i18n] Translation is not a string: ${key}`);
      return key;
    }

    // Interpolation: replace {param} with params.param
    return value.replace(/\{(\w+)\}/g, (match, paramName) => {
      return params[paramName] !== undefined ? String(params[paramName]) : match;
    });
  }

  /**
   * Apply translations to DOM elements with data-i18n* attributes
   */
  function applyToDOM() {
    // Text content
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (key) {
        el.textContent = t(key);
      }
    });

    // innerHTML (for elements with HTML content like links)
    document.querySelectorAll('[data-i18n-html]').forEach(el => {
      const key = el.getAttribute('data-i18n-html');
      if (key) {
        el.innerHTML = t(key);
      }
    });

    // Placeholder
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (key) {
        el.placeholder = t(key);
      }
    });

    // Title (tooltip)
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      if (key) {
        el.title = t(key);
      }
    });

    // Aria-label
    document.querySelectorAll('[data-i18n-aria-label]').forEach(el => {
      const key = el.getAttribute('data-i18n-aria-label');
      if (key) {
        el.setAttribute('aria-label', t(key));
      }
    });

    // Update page title if data-i18n-title exists on document
    const titleKey = document.documentElement.getAttribute('data-i18n-title');
    if (titleKey) {
      document.title = t(titleKey);
    }
  }

  /**
   * Update HTML lang attribute
   */
  function updateHTMLLang() {
    document.documentElement.lang = currentLang;
  }

  /**
   * Initialize language switcher dropdown
   */
  function initLanguageSwitcher() {
    const switcher = document.getElementById('languageSwitcher');
    if (switcher) {
      switcher.value = currentLang;
      switcher.addEventListener('change', async (e) => {
        await setLanguage(e.target.value);
      });
    }
  }

  /**
   * Change language
   * @param {string} lang
   * @returns {Promise<void>}
   */
  async function setLanguage(lang) {
    if (!SUPPORTED_LANGS.includes(lang)) {
      console.warn(`[i18n] Unsupported language: ${lang}`);
      return;
    }

    currentLang = lang;

    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch (e) {
      console.error('[i18n] Failed to save language preference:', e);
    }

    await loadTranslations(lang);
    applyToDOM();
    updateHTMLLang();

    // Update switcher if exists
    const switcher = document.getElementById('languageSwitcher');
    if (switcher && switcher.value !== lang) {
      switcher.value = lang;
    }

    // Dispatch event for dynamic content updates
    window.dispatchEvent(new CustomEvent('languagechange', { detail: { lang } }));

    console.log(`[i18n] Language changed to: ${lang}`);
  }

  /**
   * Get current language
   * @returns {string}
   */
  function getLanguage() {
    return currentLang;
  }

  /**
   * Get list of supported languages
   * @returns {string[]}
   */
  function getSupportedLanguages() {
    return [...SUPPORTED_LANGS];
  }

  /**
   * Check if translations are loaded
   * @returns {boolean}
   */
  function isReady() {
    return Object.keys(translations).length > 0;
  }

  // Public API
  return {
    init,
    t,
    setLanguage,
    getLanguage,
    getSupportedLanguages,
    applyToDOM,
    isReady
  };
})();

// Make t() globally available for convenience
function t(key, params) {
  return I18n.t(key, params);
}

// Expose I18n globally
window.I18n = I18n;
window.t = t;

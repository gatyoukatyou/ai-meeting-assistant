// js/theme.js - Theme management (display mode + accent colors)
// Handles Light/Dark mode toggle and accent color palettes
(function () {
  'use strict';

  // ========== Display Theme (Light/Dark - Manual only, no auto) ==========
  var DISPLAY_THEME_KEY = 'display_theme';
  var DEFAULT_DISPLAY_THEME = 'light';
  var STYLE_KEY = 'appStyle';
  var DEFAULT_STYLE = 'brutalism';

  /**
   * Get current theme from storage
   * @returns {'light'|'dark'}
   */
  function getTheme() {
    try {
      var saved = localStorage.getItem(DISPLAY_THEME_KEY);
      // Only accept 'light' or 'dark', fallback to default
      if (saved === 'light' || saved === 'dark') {
        return saved;
      }
      return DEFAULT_DISPLAY_THEME;
    } catch (e) {
      return DEFAULT_DISPLAY_THEME;
    }
  }

  /**
   * Save theme to storage
   * @param {'light'|'dark'} theme
   */
  function saveTheme(theme) {
    try {
      localStorage.setItem(DISPLAY_THEME_KEY, theme);
    } catch (e) {
      // Ignore storage errors
    }
  }

  /**
   * Apply theme to document
   * @param {'light'|'dark'} theme
   */
  function applyTheme(theme) {
    // Ensure only valid values
    var validTheme = (theme === 'dark') ? 'dark' : 'light';
    document.documentElement.setAttribute('data-display-theme', validTheme);

    // Update theme-color meta for mobile browsers
    var metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      var bgColor = validTheme === 'dark' ? '#0f172a' : '#f9fafb';
      metaTheme.setAttribute('content', bgColor);
    }

    // Update toggle button icon if it exists
    syncThemeToggleUI(validTheme);
  }

  /**
   * Set theme: save and apply
   * @param {'light'|'dark'} theme
   */
  function setTheme(theme) {
    var validTheme = (theme === 'dark') ? 'dark' : 'light';
    saveTheme(validTheme);
    applyTheme(validTheme);
  }

  /**
   * Toggle between light and dark
   */
  function toggleTheme() {
    var current = getTheme();
    var next = (current === 'dark') ? 'light' : 'dark';
    setTheme(next);
  }

  /**
   * Initialize theme on page load
   */
  function initTheme() {
    var theme = getTheme();
    applyTheme(theme);
  }

  /**
   * Sync toggle button UI with current theme
   * @param {'light'|'dark'} theme
   */
  function syncThemeToggleUI(theme) {
    // Update toggle button (index.html)
    var toggleBtn = document.getElementById('themeToggleBtn');
    if (toggleBtn) {
      // Show sun for dark mode (click to switch to light), moon for light mode
      toggleBtn.textContent = (theme === 'dark') ? '☀️' : '🌙';
      // Use i18n for title if available
      var titleKey = (theme === 'dark') ? 'theme.switchToLight' : 'theme.switchToDark';
      var fallback = (theme === 'dark') ? 'Switch to light mode' : 'Switch to dark mode';
      var title = (window.I18n && window.I18n.t) ? window.I18n.t(titleKey) : fallback;
      toggleBtn.setAttribute('title', title);
    }

    // Update select element (config.html)
    var selectEl = document.getElementById('displayTheme');
    if (selectEl && selectEl.value !== theme) {
      selectEl.value = theme;
    }
  }

  // ========== Style Switcher (Brutalism / Paper) ==========
  function normalizeStyle(value) {
    return (value === 'paper') ? 'paper' : 'brutalism';
  }

  function getStyle() {
    try {
      return normalizeStyle(localStorage.getItem(STYLE_KEY));
    } catch (e) {
      return DEFAULT_STYLE;
    }
  }

  function saveStyle(style) {
    try {
      localStorage.setItem(STYLE_KEY, style);
    } catch (e) {
      // Ignore storage errors
    }
  }

  function syncStyleSwitcher(style) {
    var selectEl = document.getElementById('styleSwitcher');
    if (selectEl && selectEl.value !== style) {
      selectEl.value = style;
    }
  }

  function applyStyle(style) {
    var validStyle = normalizeStyle(style);
    document.documentElement.setAttribute('data-style', validStyle);
    syncStyleSwitcher(validStyle);
  }

  function setStyle(style) {
    var validStyle = normalizeStyle(style);
    saveStyle(validStyle);
    applyStyle(validStyle);
  }

  function initStyleSwitcher() {
    var style = getStyle();
    applyStyle(style);

    var selectEl = document.getElementById('styleSwitcher');
    if (!selectEl) return;

    selectEl.value = style;
    selectEl.addEventListener('change', function(e) {
      var value = (e.target && e.target.value) ? e.target.value : DEFAULT_STYLE;
      setStyle(value);
    });
  }

  /**
   * Bind UI Style select element (for config.html)
   * @param {HTMLElement} selectEl
   */
  function bindStyleSelect(selectEl) {
    if (!selectEl) return;

    var style = getStyle();
    selectEl.value = style;
    applyStyle(style);

    selectEl.addEventListener('change', function(e) {
      var value = (e.target && e.target.value) ? e.target.value : DEFAULT_STYLE;
      setStyle(value);
    });
  }

  /**
   * Bind toggle button (for index.html)
   * @param {HTMLElement} btnEl
   */
  function bindThemeToggle(btnEl) {
    if (!btnEl) return;

    // Set initial state
    var theme = getTheme();
    syncThemeToggleUI(theme);

    // Add click handler
    btnEl.addEventListener('click', function(e) {
      e.preventDefault();
      toggleTheme();
    });
  }

  /**
   * Bind select element (for config.html)
   * @param {HTMLElement} selectEl
   */
  function bindDisplayThemeSelect(selectEl) {
    if (!selectEl) return;

    // Set initial value
    var theme = getTheme();
    selectEl.value = theme;
    applyTheme(theme);

    // Add change handler
    selectEl.addEventListener('change', function(e) {
      setTheme(e.target.value);
    });
  }

  // Storage event listener for cross-tab synchronization
  window.addEventListener('storage', function(e) {
    if (e.key === DISPLAY_THEME_KEY) {
      var newTheme = e.newValue;
      if (newTheme === 'light' || newTheme === 'dark') {
        applyTheme(newTheme);
      }
    }
    if (e.key === STYLE_KEY) {
      applyStyle(e.newValue || DEFAULT_STYLE);
    }
    // Also sync accent color changes
    if (e.key === STORAGE_KEY) {
      applyColorPalette(e.newValue || DEFAULT_COLOR_THEME);
    }
  });

  // ========== Color Palette (Accent Colors) ==========
  var colorPalettes = {
    sky: {
      nameKey: 'theme.sky',
      accent: '#0ea5e9',
      accentHover: '#0284c7',
      accentLight: '#e0f2fe',
      accentMuted: '#7dd3fc'
    },
    indigo: {
      nameKey: 'theme.indigo',
      accent: '#6366f1',
      accentHover: '#4f46e5',
      accentLight: '#e0e7ff',
      accentMuted: '#a5b4fc'
    },
    emerald: {
      nameKey: 'theme.emerald',
      accent: '#10b981',
      accentHover: '#059669',
      accentLight: '#d1fae5',
      accentMuted: '#6ee7b7'
    },
    violet: {
      nameKey: 'theme.violet',
      accent: '#8b5cf6',
      accentHover: '#7c3aed',
      accentLight: '#ede9fe',
      accentMuted: '#c4b5fd'
    },
    slate: {
      nameKey: 'theme.slate',
      accent: '#475569',
      accentHover: '#334155',
      accentLight: '#f1f5f9',
      accentMuted: '#94a3b8'
    },
    coral: {
      nameKey: 'theme.coral',
      accent: '#f97316',
      accentHover: '#ea580c',
      accentLight: '#ffedd5',
      accentMuted: '#fdba74'
    }
  };

  var STORAGE_KEY = 'color_theme';
  var DEFAULT_COLOR_THEME = 'indigo';

  function applyColorPalette(paletteName) {
    var p = colorPalettes[paletteName];
    if (!p) {
      p = colorPalettes[DEFAULT_COLOR_THEME];
    }

    var root = document.documentElement;
    root.style.setProperty('--accent', p.accent);
    root.style.setProperty('--accent-hover', p.accentHover);
    root.style.setProperty('--accent-light', p.accentLight);
    root.style.setProperty('--accent-muted', p.accentMuted);
    // Also update --primary for backward compatibility
    root.style.setProperty('--primary', p.accent);
    root.style.setProperty('--primary-hover', p.accentHover);
  }

  function getSavedColorTheme() {
    try {
      return localStorage.getItem(STORAGE_KEY) || DEFAULT_COLOR_THEME;
    } catch (e) {
      return DEFAULT_COLOR_THEME;
    }
  }

  function saveColorTheme(themeName) {
    try {
      localStorage.setItem(STORAGE_KEY, themeName);
    } catch (e) {
      // Ignore storage errors
    }
  }

  function applySavedColorTheme() {
    applyColorPalette(getSavedColorTheme());
  }

  function bindThemeSelect(selectEl) {
    if (!selectEl) return;
    var saved = getSavedColorTheme();
    selectEl.value = saved;
    applyColorPalette(saved);

    selectEl.addEventListener('change', function(e) {
      var value = e.target.value;
      applyColorPalette(value);
      saveColorTheme(value);
    });
  }

  function getPaletteNames() {
    return Object.keys(colorPalettes);
  }

  // Expose API
  window.AIMeetingTheme = {
    // Display theme (light/dark)
    getTheme: getTheme,
    setTheme: setTheme,
    toggleTheme: toggleTheme,
    applyTheme: applyTheme,
    initTheme: initTheme,
    bindThemeToggle: bindThemeToggle,
    bindDisplayThemeSelect: bindDisplayThemeSelect,
    // UI Style (brutalism/paper)
    getStyle: getStyle,
    setStyle: setStyle,
    bindStyleSelect: bindStyleSelect,
    // Color palette (accent colors)
    colorPalettes: colorPalettes,
    applyColorPalette: applyColorPalette,
    applySavedTheme: applySavedColorTheme,
    bindThemeSelect: bindThemeSelect,
    getSavedTheme: getSavedColorTheme,
    getPaletteNames: getPaletteNames,
    // Legacy aliases (for backward compatibility)
    applySavedDisplayTheme: initTheme,
    getSavedDisplayTheme: getTheme
  };

  // Auto-apply on load (before DOMContentLoaded for faster paint)
  initTheme();
  initStyleSwitcher();
  applySavedColorTheme();
})();

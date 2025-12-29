// js/theme.js - Color theme management (accent colors + display mode)
(function () {
  'use strict';

  // ========== Display Theme (Light/Dark/Auto) ==========
  var DISPLAY_THEME_KEY = 'display_theme';
  var DEFAULT_DISPLAY_THEME = 'auto';

  function getSystemPrefersDark() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function getSavedDisplayTheme() {
    try {
      return localStorage.getItem(DISPLAY_THEME_KEY) || DEFAULT_DISPLAY_THEME;
    } catch (e) {
      return DEFAULT_DISPLAY_THEME;
    }
  }

  function saveDisplayTheme(theme) {
    try {
      localStorage.setItem(DISPLAY_THEME_KEY, theme);
    } catch (e) {
      // Ignore storage errors
    }
  }

  function getEffectiveDisplayTheme(savedTheme) {
    if (savedTheme === 'auto') {
      return getSystemPrefersDark() ? 'dark' : 'light';
    }
    return savedTheme;
  }

  function applyDisplayTheme(theme) {
    var effective = getEffectiveDisplayTheme(theme);
    document.documentElement.setAttribute('data-display-theme', effective);
    // Update theme-color meta for mobile browsers
    var metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      // Use darker color for dark mode
      var bgColor = effective === 'dark' ? '#0f172a' : '#f9fafb';
      metaTheme.setAttribute('content', bgColor);
    }
  }

  function applySavedDisplayTheme() {
    applyDisplayTheme(getSavedDisplayTheme());
  }

  function bindDisplayThemeSelect(selectEl) {
    if (!selectEl) return;
    var saved = getSavedDisplayTheme();
    selectEl.value = saved;
    applyDisplayTheme(saved);

    selectEl.addEventListener('change', function(e) {
      var value = e.target.value;
      applyDisplayTheme(value);
      saveDisplayTheme(value);
    });
  }

  // Listen for OS theme changes (for auto mode)
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function() {
      var saved = getSavedDisplayTheme();
      if (saved === 'auto') {
        applyDisplayTheme('auto');
      }
    });
  }

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
  var DEFAULT_THEME = 'indigo'; // Match current default

  function applyColorPalette(paletteName) {
    var p = colorPalettes[paletteName];
    if (!p) {
      p = colorPalettes[DEFAULT_THEME];
    }

    var root = document.documentElement;
    // Set accent variables
    root.style.setProperty('--accent', p.accent);
    root.style.setProperty('--accent-hover', p.accentHover);
    root.style.setProperty('--accent-light', p.accentLight);
    root.style.setProperty('--accent-muted', p.accentMuted);
    // Also update --primary for backward compatibility with existing CSS
    root.style.setProperty('--primary', p.accent);
    root.style.setProperty('--primary-hover', p.accentHover);
    // Update theme-color meta tag
    var metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', p.accent);
    }
  }

  function getSavedTheme() {
    try {
      return localStorage.getItem(STORAGE_KEY) || DEFAULT_THEME;
    } catch (e) {
      return DEFAULT_THEME;
    }
  }

  function saveTheme(themeName) {
    try {
      localStorage.setItem(STORAGE_KEY, themeName);
    } catch (e) {
      // Ignore storage errors
    }
  }

  function applySavedTheme() {
    applyColorPalette(getSavedTheme());
  }

  function bindThemeSelect(selectEl) {
    if (!selectEl) return;
    var saved = getSavedTheme();
    selectEl.value = saved;
    applyColorPalette(saved);

    selectEl.addEventListener('change', function(e) {
      var value = e.target.value;
      applyColorPalette(value);
      saveTheme(value);
    });
  }

  function getPaletteNames() {
    return Object.keys(colorPalettes);
  }

  // Expose API
  window.AIMeetingTheme = {
    // Color palette (accent colors)
    colorPalettes: colorPalettes,
    applyColorPalette: applyColorPalette,
    applySavedTheme: applySavedTheme,
    bindThemeSelect: bindThemeSelect,
    getSavedTheme: getSavedTheme,
    getPaletteNames: getPaletteNames,
    // Display theme (light/dark/auto)
    applyDisplayTheme: applyDisplayTheme,
    applySavedDisplayTheme: applySavedDisplayTheme,
    bindDisplayThemeSelect: bindDisplayThemeSelect,
    getSavedDisplayTheme: getSavedDisplayTheme
  };

  // Auto-apply on load (before DOMContentLoaded for faster paint)
  applySavedDisplayTheme();
  applySavedTheme();
})();

import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default [
  // Ignore vendor and test-files
  {
    ignores: ['node_modules/**', 'vendor/**', 'scripts/test-files/**']
  },

  // Browser JS (js/**/*.js) — loaded as <script> tags, not modules
  {
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        // App globals exposed by other <script> tags.
        // 'writable' because each file that defines a global re-declares it.
        ModelRegistry: 'writable',
        SecureStorage: 'writable',
        I18n: 'writable',
        t: 'writable',
        DebugLogger: 'writable',
        HistoryStore: 'writable',
        AIMeetingTheme: 'writable',
        RecordingMonitor: 'writable',
        FileExtractor: 'writable',
        FormatUtils: 'readonly',
        CapabilityUtils: 'readonly',
        SanitizeUtils: 'readonly',
        STTProviders: 'writable',
        PCMStreamProcessor: 'writable',
        AudioResampler: 'writable',
        DeepgramWSProvider: 'writable',
        OpenAIChunkedProvider: 'writable',
        // Cross-file references used with typeof checks
        DEFAULT_DICTIONARY: 'writable',
        handleBackToMain: 'readonly',
        updateCostDisplay: 'readonly'
      }
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
      // Each file re-declares the global it defines (e.g. const ModelRegistry = …)
      'no-redeclare': 'off',
      // Intentional control-char regex in file-extractor.js (mojibake detection)
      'no-control-regex': 'off',
      // Legacy pattern: obj.hasOwnProperty() used in existing code
      'no-prototype-builtins': 'off',
      // Existing code patterns — not worth fighting pre-modularisation
      'no-useless-assignment': 'off',
      'no-unsafe-finally': 'off',
      // Catch blocks that re-throw with a new message (without { cause })
      'preserve-caught-error': 'off'
    }
  },

  // Node scripts — ESM (.mjs)
  // These files use page.evaluate() callbacks that reference browser globals,
  // which ESLint cannot statically analyse.
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node
      }
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
      'no-undef': 'off'
    }
  },

  // Node scripts — CJS (.js)
  {
    files: ['scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node
      }
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }]
    }
  },

  // Unit tests — ESM (.mjs), node:test + node:assert
  {
    files: ['tests/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
    },
  },

  // Disable rules that conflict with Prettier
  prettier
];

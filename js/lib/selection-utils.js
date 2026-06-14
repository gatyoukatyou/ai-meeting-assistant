// =====================================
// Selection Utilities
// =====================================
// Restricts window selections to intentional content areas.

const SelectionUtils = (function() {
  'use strict';

  function toElement(node) {
    if (!node) return null;
    if (node.nodeType === 1) return node;
    return node.parentElement || null;
  }

  function matchesAny(element, selectors) {
    if (!element || !selectors || selectors.length === 0) return false;
    if (typeof element.matches !== 'function') return false;
    return selectors.some(function(selector) {
      try {
        return element.matches(selector);
      } catch (_) {
        return false;
      }
    });
  }

  function closestAny(element, selectors) {
    if (!element || !selectors || selectors.length === 0) return null;
    if (typeof element.closest !== 'function') return null;
    for (var i = 0; i < selectors.length; i++) {
      try {
        var match = element.closest(selectors[i]);
        if (match) return match;
      } catch (_) {
        // Ignore invalid selectors supplied by callers.
      }
    }
    return null;
  }

  function isElementAllowedForSelection(element, allowedSelectors, blockedSelectors) {
    if (!element) return false;
    if (closestAny(element, blockedSelectors)) return false;
    return Boolean(closestAny(element, allowedSelectors));
  }

  function getTextControlSelection(activeElement, allowedSelectors) {
    if (!activeElement || !matchesAny(activeElement, allowedSelectors)) return '';
    if (typeof activeElement.value !== 'string') return '';
    if (typeof activeElement.selectionStart !== 'number' || typeof activeElement.selectionEnd !== 'number') return '';
    if (activeElement.selectionStart === activeElement.selectionEnd) return '';

    var start = Math.min(activeElement.selectionStart, activeElement.selectionEnd);
    var end = Math.max(activeElement.selectionStart, activeElement.selectionEnd);
    return activeElement.value.slice(start, end).trim();
  }

  function getAllowedSelectionText(options) {
    var opts = options || {};
    var allowedSelectors = opts.allowedSelectors || [];
    var blockedSelectors = opts.blockedSelectors || [];
    var doc = opts.documentRef || (typeof document !== 'undefined' ? document : null);
    var selection = opts.selection || (typeof window !== 'undefined' && typeof window.getSelection === 'function'
      ? window.getSelection()
      : null);

    var textControlSelection = getTextControlSelection(doc && doc.activeElement, allowedSelectors);
    if (textControlSelection) return textControlSelection;

    if (!selection || !selection.rangeCount || typeof selection.toString !== 'function') return '';
    var text = selection.toString().trim();
    if (!text) return '';

    var anchorEl = toElement(selection.anchorNode);
    var focusEl = toElement(selection.focusNode);
    if (!isElementAllowedForSelection(anchorEl, allowedSelectors, blockedSelectors)) return '';
    if (!isElementAllowedForSelection(focusEl, allowedSelectors, blockedSelectors)) return '';

    return text;
  }

  return {
    getAllowedSelectionText: getAllowedSelectionText,
    isElementAllowedForSelection: isElementAllowedForSelection
  };
})();

if (typeof window !== 'undefined') {
  window.SelectionUtils = SelectionUtils;
}

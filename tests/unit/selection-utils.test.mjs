import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadScript } from '../helpers/load-script.mjs';

const { SelectionUtils } = loadScript('js/lib/selection-utils.js', {
  window: {}
});

function selectorListMatches(selectorList, selector) {
  return selectorList.split(',').map(s => s.trim()).includes(selector);
}

function createElement(selectors = [], parentElement = null) {
  const element = {
    nodeType: 1,
    parentElement,
    matches(selectorList) {
      return selectors.some(selector => selectorListMatches(selectorList, selector));
    },
    closest(selectorList) {
      let current = element;
      while (current) {
        if (current.matches(selectorList)) return current;
        current = current.parentElement;
      }
      return null;
    }
  };
  return element;
}

function createTextNode(parentElement) {
  return {
    nodeType: 3,
    parentElement
  };
}

function createSelection(text, anchorNode, focusNode) {
  return {
    rangeCount: 1,
    anchorNode,
    focusNode,
    toString() {
      return text;
    }
  };
}

const AI_ALLOWED = [
  '#transcriptText .transcript-chunk',
  '#memoListInTab .timeline-item-content',
  '.ai-response[data-selection-content="true"]',
  '#contextGoalInput'
];
const TRANSCRIPT_ALLOWED = ['#transcriptText .transcript-chunk'];
const BLOCKED = ['button', '.btn', '.tab'];

describe('SelectionUtils.getAllowedSelectionText', () => {
  it('returns selected text from allowed transcript content', () => {
    const transcriptChunk = createElement(['#transcriptText .transcript-chunk']);
    const textNode = createTextNode(transcriptChunk);
    const selection = createSelection(' transcript text ', textNode, textNode);

    assert.equal(
      SelectionUtils.getAllowedSelectionText({
        selection,
        allowedSelectors: AI_ALLOWED,
        blockedSelectors: BLOCKED
      }),
      'transcript text'
    );
  });

  it('returns selected text from allowed memo content', () => {
    const memoContent = createElement(['#memoListInTab .timeline-item-content']);
    const textNode = createTextNode(memoContent);
    const selection = createSelection('memo text', textNode, textNode);

    assert.equal(
      SelectionUtils.getAllowedSelectionText({
        selection,
        allowedSelectors: AI_ALLOWED,
        blockedSelectors: BLOCKED
      }),
      'memo text'
    );
  });

  it('ignores selected UI text outside allowed content areas', () => {
    const tab = createElement(['.tab']);
    const textNode = createTextNode(tab);
    const selection = createSelection('AI回答', textNode, textNode);

    assert.equal(
      SelectionUtils.getAllowedSelectionText({
        selection,
        allowedSelectors: AI_ALLOWED,
        blockedSelectors: BLOCKED
      }),
      ''
    );
  });

  it('returns selected text from marked AI response content', () => {
    const aiResponse = createElement(['.ai-response[data-selection-content="true"]']);
    const textNode = createTextNode(aiResponse);
    const selection = createSelection('AI answer text', textNode, textNode);

    assert.equal(
      SelectionUtils.getAllowedSelectionText({
        selection,
        allowedSelectors: AI_ALLOWED,
        blockedSelectors: BLOCKED
      }),
      'AI answer text'
    );
  });

  it('ignores unmarked AI response placeholder text', () => {
    const placeholder = createElement(['.ai-response']);
    const textNode = createTextNode(placeholder);
    const selection = createSelection('No AI response yet', textNode, textNode);

    assert.equal(
      SelectionUtils.getAllowedSelectionText({
        selection,
        allowedSelectors: AI_ALLOWED,
        blockedSelectors: BLOCKED
      }),
      ''
    );
  });

  it('ignores blocked controls even inside an allowed container', () => {
    const transcriptChunk = createElement(['#transcriptText .transcript-chunk']);
    const button = createElement(['button'], transcriptChunk);
    const textNode = createTextNode(button);
    const selection = createSelection('copy', textNode, textNode);

    assert.equal(
      SelectionUtils.getAllowedSelectionText({
        selection,
        allowedSelectors: AI_ALLOWED,
        blockedSelectors: BLOCKED
      }),
      ''
    );
  });

  it('ignores selections that cross from content into UI', () => {
    const transcriptChunk = createElement(['#transcriptText .transcript-chunk']);
    const tab = createElement(['.tab']);
    const selection = createSelection(
      'transcript plus tab',
      createTextNode(transcriptChunk),
      createTextNode(tab)
    );

    assert.equal(
      SelectionUtils.getAllowedSelectionText({
        selection,
        allowedSelectors: AI_ALLOWED,
        blockedSelectors: BLOCKED
      }),
      ''
    );
  });

  it('can restrict callers to transcript-only selections', () => {
    const memoContent = createElement(['#memoListInTab .timeline-item-content']);
    const textNode = createTextNode(memoContent);
    const selection = createSelection('memo text', textNode, textNode);

    assert.equal(
      SelectionUtils.getAllowedSelectionText({
        selection,
        allowedSelectors: TRANSCRIPT_ALLOWED,
        blockedSelectors: BLOCKED
      }),
      ''
    );
  });

  it('returns selected text from allowed text controls', () => {
    const contextInput = {
      nodeType: 1,
      value: 'agenda and background',
      selectionStart: 0,
      selectionEnd: 6,
      matches(selectorList) {
        return selectorListMatches(selectorList, '#contextGoalInput');
      },
      closest() {
        return null;
      }
    };

    assert.equal(
      SelectionUtils.getAllowedSelectionText({
        documentRef: { activeElement: contextInput },
        selection: null,
        allowedSelectors: AI_ALLOWED,
        blockedSelectors: BLOCKED
      }),
      'agenda'
    );
  });
});

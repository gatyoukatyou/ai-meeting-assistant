const ExportService = (function () {
  'use strict';

  function collectAiWorkOrderInstructions(memoItems, extractAiInstructionFromMemoLine) {
    const items = Array.isArray(memoItems) ? memoItems : [];
    const extract = typeof extractAiInstructionFromMemoLine === 'function'
      ? extractAiInstructionFromMemoLine
      : function () { return null; };

    const instructions = [];
    const cleanedContentById = {};
    const seen = new Set();

    items.forEach(function (item) {
      if (!item || typeof item.content !== 'string') return;

      const remainingLines = [];
      item.content.replace(/\r\n/g, '\n').split('\n').forEach(function (line) {
        const instruction = extract(line);
        if (!instruction) {
          remainingLines.push(line);
          return;
        }

        const dedupeKey = instruction.toLowerCase();
        if (!seen.has(dedupeKey)) {
          seen.add(dedupeKey);
          instructions.push({
            text: instruction,
            timestamp: item.timestamp || ''
          });
        }
      });

      cleanedContentById[item.id] = remainingLines.join('\n').trim();
    });

    return { instructions, cleanedContentById };
  }

  function formatAIResponses(entries, label, emoji) {
    if (!Array.isArray(entries) || entries.length === 0) return '';
    if (entries.length === 1) {
      return `### ${emoji} ${label}\n\n*${entries[0].timestamp}*\n\n${entries[0].content}\n\n`;
    }
    return entries.map(function (entry, i) {
      const header = `#### ${emoji} ${label} #${i + 1}（${entry.timestamp}）\n\n`;
      const content = `${entry.content}\n\n`;
      return header + content + (i < entries.length - 1 ? '---\n\n' : '');
    }).join('');
  }

  function buildMarkdownFileName(title, options) {
    const opts = options || {};
    const sanitize = typeof opts.sanitizeFileName === 'function'
      ? opts.sanitizeFileName
      : function (value) { return value || 'meeting'; };
    const date = opts.date || new Date();
    const safeTitle = sanitize(title || 'meeting');
    const dateStr = date.toISOString().split('T')[0];
    return `${safeTitle}-${dateStr}.md`;
  }

  function quoteYamlString(value) {
    return JSON.stringify(String(value ?? ''));
  }

  function normalizeRecordDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
  }

  function normalizeRecordList(value) {
    return Array.isArray(value)
      ? value.filter(item => typeof item === 'string' && item.trim()).map(item => item.trim())
      : [];
  }

  function appendRecordListSection(lines, heading, values, options) {
    const items = normalizeRecordList(values);
    lines.push(`## ${heading}`, '');
    if (options?.note) lines.push(options.note, '');
    items.forEach(item => lines.push(`${options?.checkbox ? '- [ ]' : '-'} ${item}`));
    lines.push('');
  }

  function generateRecordMarkdown(record) {
    const source = record || {};
    const profile = source.profile === 'memo' ? 'memo' : 'meeting';
    const status = source.status === 'organized' ? 'organized' : 'raw';
    const tags = normalizeRecordList(source.tags);
    const duration = Number(source.durationSec);
    const durationSec = Number.isFinite(duration) ? Math.max(0, Math.round(duration)) : 0;
    const title = String(source.title || source.id || 'Untitled').replace(/[\r\n]+/g, ' ').trim();
    const minutes = typeof source.minutes === 'string'
      ? source.minutes
      : (typeof source.aiResponses?.minutes === 'string' ? source.aiResponses.minutes : '');
    const transcript = typeof source.transcript === 'string' ? source.transcript : '';

    const lines = [
      '---',
      `id: ${quoteYamlString(source.id || '')}`,
      `created_at: ${quoteYamlString(normalizeRecordDate(source.createdAt))}`,
      `profile: ${quoteYamlString(profile)}`,
      `category: ${quoteYamlString(source.category || '会議・打合せ')}`,
      tags.length ? 'tags:' : 'tags: []'
    ];
    tags.forEach(tag => lines.push(`  - ${quoteYamlString(tag)}`));
    lines.push(
      `status: ${quoteYamlString(status)}`,
      `duration_sec: ${durationSec}`,
      '---',
      `# ${title}`,
      ''
    );

    if (status === 'organized' && source.structured && typeof source.structured === 'object') {
      appendRecordListSection(lines, '要点', source.structured.keyPoints);
      appendRecordListSection(lines, '決定事項', source.structured.decisions);
      appendRecordListSection(lines, 'アクション候補', source.structured.actionCandidates, {
        checkbox: true,
        note: '以下は候補であり、確定タスクではありません。'
      });
      appendRecordListSection(lines, '未解決事項', source.structured.openQuestions);
    }

    if (profile === 'meeting' && minutes.trim()) {
      lines.push('## 議事録', '', minutes, '');
    }
    lines.push('## 文字起こし', '', transcript);

    const legacyExport = typeof source.exportMarkdown === 'string'
      ? source.exportMarkdown.replace(/\r\n/g, '\n').trim()
      : '';
    if (legacyExport) {
      lines.push(
        '',
        '---',
        '',
        '## 保存時の詳細出力（従来形式）',
        '',
        legacyExport
      );
    }

    return `${lines.join('\n').trimEnd()}\n`;
  }

  function generateRecordsMarkdown(records) {
    return (Array.isArray(records) ? records : [])
      .map(generateRecordMarkdown)
      .map(markdown => markdown.trimEnd())
      .join('\n\n');
  }

  function generateMarkdown(context) {
    const c = context || {};
    const t = typeof c.t === 'function' ? c.t : function (k) { return k; };
    const options = c.options || {
      minutes: true, summary: true, consult: true, opinion: true, idea: true,
      memos: true, todos: true, qa: true, transcript: true, aiWorkOrder: true, cost: true
    };
    const aiResponses = c.aiResponses || { summary: [], opinion: [], idea: [], consult: [], minutes: '', custom: [] };
    const meetingMemos = c.meetingMemos || { items: [] };
    const costs = c.costs || {
      transcript: { duration: 0, calls: 0, byProvider: { openai: 0, deepgram: 0 }, total: 0 },
      llm: { inputTokens: 0, outputTokens: 0, calls: 0, byProvider: { gemini: 0, claude: 0, openai: 0, groq: 0 }, total: 0 }
    };

    const now = c.now || new Date().toLocaleString(c.locale || 'ja-JP');
    const total = costs.transcript.total + costs.llm.total;
    const title = c.title || t('export.document.title') || 'Meeting';
    const transcriptText = c.transcriptText || t('export.document.none');
    const currentLang = c.currentLang || 'ja';
    const findModules = typeof c.findAiWorkOrderModules === 'function'
      ? c.findAiWorkOrderModules
      : function () { return []; };
    const getLocalizedField = typeof c.getLocalizedAiModuleField === 'function'
      ? c.getLocalizedAiModuleField
      : function () { return ''; };
    const formatDuration = typeof c.formatDuration === 'function'
      ? c.formatDuration
      : function (v) { return String(v); };
    const formatCost = typeof c.formatCost === 'function'
      ? c.formatCost
      : function (v) { return String(v); };
    const formatNumber = typeof c.formatNumber === 'function'
      ? c.formatNumber
      : function (v) { return String(v); };

    let md = `# ${title}\n\n`;
    md += `**${t('export.document.datetime')}** ${now}\n\n`;

    const hasAnySelection = Object.values(options).some(function (v) { return v; });
    if (!hasAnySelection) {
      md += `⚠️ ${t('export.document.noSelection')}\n`;
      return md;
    }

    const aiInstructionData = options.aiWorkOrder
      ? collectAiWorkOrderInstructions(meetingMemos.items, c.extractAiInstructionFromMemoLine)
      : { instructions: [], cleanedContentById: null };
    const aiWorkOrderInstructions = aiInstructionData.instructions;
    const cleanedMemoContentById = aiInstructionData.cleanedContentById;
    const matchedModules = options.aiWorkOrder ? findModules(aiWorkOrderInstructions) : [];

    if (options.aiWorkOrder) {
      md += `---\n\n`;
      md += `## 🧭 ${t('export.document.sectionAiWorkOrder') || 'AI Work Order'}\n\n`;
      md += `${t('export.document.aiWorkOrderIntro') || 'Treat this markdown as the primary source and follow the rules below.'}\n\n`;
      md += `### ${t('export.document.aiWorkOrderRulesTitle') || 'Common Rules'}\n`;
      md += `1. ${t('export.document.aiWorkOrderRuleNoGuess') || 'Do not guess. If information is missing, list it explicitly as missing information.'}\n`;
      md += `2. ${t('export.document.aiWorkOrderRuleEvidence') || 'For key decisions, include supporting evidence from this markdown.'}\n`;
      md += `3. ${t('export.document.aiWorkOrderRuleOrder') || 'Keep the output order fixed and do not reorder sections.'}\n`;
      md += `4. ${t('export.document.aiWorkOrderRuleQuestionFirst') || 'Show clarification questions first, then provide deliverables.'}\n\n`;
      if (aiWorkOrderInstructions.length > 0) {
        md += `### ${t('export.document.aiWorkOrderAdditionalTitle') || 'Additional Instructions'}\n`;
        aiWorkOrderInstructions.forEach(function (instruction) {
          const ts = instruction.timestamp ? `[${instruction.timestamp}] ` : '';
          md += `- ${ts}${instruction.text}\n`;
        });
        md += '\n';
      }
      if (matchedModules.length > 0) {
        md += `### ${t('export.document.aiWorkOrderModulesTitle') || 'Additional Modules'}\n`;
        matchedModules.forEach(function (module, i) {
          const moduleTitle = getLocalizedField(module.title, currentLang, module.id);
          const modulePrompt = getLocalizedField(module.promptText, currentLang, '');
          const outputSchemaRaw = getLocalizedField(module.outputSchema, currentLang, []);
          const outputSchema = Array.isArray(outputSchemaRaw)
            ? outputSchemaRaw
            : (outputSchemaRaw ? [outputSchemaRaw] : []);

          md += `#### ${i + 1}. ${moduleTitle}\n`;
          if (modulePrompt) {
            md += `${modulePrompt}\n\n`;
          }
          if (outputSchema.length > 0) {
            md += `${t('export.document.aiWorkOrderModuleOutputLabel') || 'Expected Output'}\n`;
            outputSchema.forEach(function (item) {
              md += `- ${item}\n`;
            });
            md += '\n';
          }
        });
      }
      md += `### ${t('export.document.aiWorkOrderOutputTitle') || 'Output Order'}\n`;
      md += `1. ${t('export.document.aiWorkOrderOutputQuestions') || 'Clarification questions for missing information'}\n`;
      md += `2. ${t('export.document.aiWorkOrderOutputDeliverables') || 'Deliverables'}\n\n`;
    }

    if (options.minutes && aiResponses.minutes) {
      md += `---\n\n`;
      md += `## 📝 ${t('export.document.sectionMinutes')}\n\n`;
      md += `${aiResponses.minutes}\n\n`;
    }

    const showSummary = options.summary && aiResponses.summary.length > 0;
    const showConsult = options.consult && aiResponses.consult.length > 0;
    const showOpinion = options.opinion && aiResponses.opinion.length > 0;
    const showIdea = options.idea && aiResponses.idea.length > 0;
    const hasAIResponses = showSummary || showConsult || showOpinion || showIdea;
    if (hasAIResponses) {
      md += `---\n\n`;
      md += `## 🤖 ${t('export.document.sectionAI')}\n\n`;
      if (showSummary) md += formatAIResponses(aiResponses.summary, t('export.items.summary'), '📋');
      if (showConsult) md += formatAIResponses(aiResponses.consult, t('export.items.consult') || '相談', '💭');
      if (showOpinion) md += formatAIResponses(aiResponses.opinion, t('export.items.opinion'), '💭');
      if (showIdea) md += formatAIResponses(aiResponses.idea, t('export.items.idea'), '💡');
    }

    if (options.memos) {
      const memos = meetingMemos.items
        .filter(function (m) { return m.type === 'memo'; })
        .map(function (memo) {
          if (!cleanedMemoContentById || !Object.prototype.hasOwnProperty.call(cleanedMemoContentById, memo.id)) {
            return memo;
          }
          return Object.assign({}, memo, { content: cleanedMemoContentById[memo.id] });
        })
        .filter(function (memo) { return memo.content && memo.content.trim().length > 0; });
      if (memos.length > 0) {
        md += `---\n\n## 📝 ${t('export.items.memos') || 'メモ'}\n\n`;
        memos.forEach(function (memo) {
          md += `### [${memo.timestamp}]\n\n${memo.content}\n\n`;
          if (memo.quote) {
            md += `> ${memo.quote.replace(/\n/g, '\n> ')}\n\n`;
          }
        });
      }
    }

    if (options.todos) {
      const todos = meetingMemos.items
        .filter(function (m) { return m.type === 'todo'; })
        .map(function (todo) {
          if (!cleanedMemoContentById || !Object.prototype.hasOwnProperty.call(cleanedMemoContentById, todo.id)) {
            return todo;
          }
          return Object.assign({}, todo, { content: cleanedMemoContentById[todo.id] });
        })
        .filter(function (todo) { return todo.content && todo.content.trim().length > 0; });
      if (todos.length > 0) {
        md += `---\n\n## ☑️ ${t('export.items.todos') || 'TODO'}\n\n`;
        todos.forEach(function (todo) {
          const checkbox = todo.completed ? '[x]' : '[ ]';
          md += `- ${checkbox} ${todo.content}`;
          if (todo.timestamp) md += ` *(${todo.timestamp})*`;
          md += '\n';
        });
        md += '\n';
      }
    }

    if (options.qa && aiResponses.custom.length > 0) {
      md += `---\n\n`;
      md += `## ❓ ${t('export.items.qa')}\n\n`;
      aiResponses.custom.forEach(function (qa, i) {
        md += `### Q${i + 1}: ${qa.q}\n\n${qa.a}\n\n`;
      });
    }

    if (options.transcript) {
      md += `---\n\n`;
      md += `## 📜 ${t('export.document.sectionTranscript')}\n\n`;
      const lineCount = transcriptText.split('\n').filter(function (l) { return l.trim(); }).length;
      md += `<details>\n`;
      md += `<summary>${t('export.document.linesCount', { n: lineCount })}</summary>\n\n`;
      md += `${transcriptText}\n\n`;
      md += `</details>\n\n`;
    }

    if (options.cost) {
      md += `---\n\n`;
      md += `## 💰 ${t('export.document.sectionCost')}\n\n`;
      md += `### ${t('export.document.costStt')}\n`;
      md += `- ${t('export.document.costProcessingTime')}: ${formatDuration(costs.transcript.duration)}\n`;
      md += `- ${t('export.document.costApiCalls')}: ${costs.transcript.calls}\n`;
      md += `- OpenAI Whisper: ${formatCost(costs.transcript.byProvider.openai)}\n`;
      md += `- Deepgram: ${formatCost(costs.transcript.byProvider.deepgram)}\n`;
      md += `- ${t('export.document.costSubtotal')}: ${formatCost(costs.transcript.total)}\n\n`;
      md += `### ${t('export.document.costLlm')}\n`;
      md += `- ${t('export.document.costInputTokens')}: ${formatNumber(costs.llm.inputTokens)}\n`;
      md += `- ${t('export.document.costOutputTokens')}: ${formatNumber(costs.llm.outputTokens)}\n`;
      md += `- ${t('export.document.costApiCalls')}: ${costs.llm.calls}\n`;
      md += `- Gemini: ${formatCost(costs.llm.byProvider.gemini)}\n`;
      md += `- Claude: ${formatCost(costs.llm.byProvider.claude)}\n`;
      md += `- OpenAI: ${formatCost(costs.llm.byProvider.openai)}\n`;
      md += `- Groq: ${formatCost(costs.llm.byProvider.groq)}\n`;
      md += `- ${t('export.document.costSubtotal')}: ${formatCost(costs.llm.total)}\n\n`;
      md += `### ${t('export.document.costTotal')}\n`;
      md += `**${formatCost(total)}**\n\n`;
      md += `---\n`;
      md += `*${t('export.document.costDisclaimer')}*\n`;
    }

    return md;
  }

  return {
    buildMarkdownFileName,
    collectAiWorkOrderInstructions,
    generateMarkdown,
    generateRecordMarkdown,
    generateRecordsMarkdown
  };
})();

if (typeof window !== 'undefined') {
  window.ExportService = ExportService;
}

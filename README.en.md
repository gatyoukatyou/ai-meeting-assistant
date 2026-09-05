# AI Meeting Assistant

[🇯🇵 日本語](README.md) | 🇺🇸 English

[![Version](https://img.shields.io/badge/version-v1.6.0-blue)](https://github.com/gatyoukatyou/ai-meeting-assistant/releases/tag/v1.6.0)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

A lightweight, browser-based meeting assistant that records audio, transcribes speech, and generates summaries, consult responses, minutes, and memos using AI.

**🚀 Try it now**: https://gatyoukatyou.github.io/ai-meeting-assistant/

> ⚠️ **Important**: This app is **free**, but AI service fees (Gemini, OpenAI, etc.) are billed separately by each provider. **Get consent from all participants** before recording or transcribing meetings.

## Features

- 🎤 **Real-time transcription** – Speech is automatically converted to text
- 💬 **AI consultation** – One-tap summary, consult, minutes, and custom Q&A
- 📝 **Memos & TODOs** – Add quoted memos, convert to TODOs, pin important items
- 🗂️ **Timeline** – AI responses, Q&A, memos/TODOs in a searchable timeline
- 🤖 **Multiple AI providers** – Choose from multiple AI providers (BYOK: Bring Your Own Key)
- 🏠 **Local LLM support** – Works with Ollama / LM Studio. No API key required, cost shown as ¥0 (localhost on the same machine only)
- ⚡ **Switch LLM while recording** – Change AI provider/model without stopping transcription
- 💰 **Cost estimates** – View estimated costs (actual charges may vary by provider)
- 📥 **Export to Markdown** – Save meeting content, AI responses, memos/TODOs
- 🧠 **Richer meeting context** – Goals, participants, handoff notes, references
- 📎 **Attachments & enhancements** – TXT/MD/PDF/DOCX/CSV + Native Docs/Thinking Boost
- 🔒 **API key storage policy** – Session-only by default. Optional device persistence is available only in desktop app mode (not recommended)
- 🎨 **Theme/style switcher** – Light/Dark + 9 accents + Brutalism/Paper/Clean/CLI (default for new users: Clean)
- 🗂️ **Meeting history** – Auto-save (up to 5), restore and MD import
- 🎯 **Meeting mode** – Toggle focus view vs. edit mode

## Security

### ⚠️ Important Disclaimers

- This app's protection is **not perfect**
- API key security **cannot be guaranteed** on shared or public PCs
- Malware or browser extensions may still access your keys
- **Manually delete** keys when done, or **close the tab/browser**

### Protection Features

- ✅ API keys are **session-only by default** (deleted when you close the tab/browser)
- ✅ In desktop app mode (Chrome/Edge app), keys can be persisted only when explicitly enabled (not recommended)
- ✅ **Never sent** to external servers (direct API calls only)
- ✅ **Settings export/import** is available (API keys are excluded)

See [Security Details](docs/SECURITY.md) for more information.

### Important Security Rules

- **Never enter your API key on unofficial URLs**
  - Official: https://gatyoukatyou.github.io/ai-meeting-assistant/
  - Fake sites or modified copies may steal your keys
- **On shared PCs, keep "Remember API keys" OFF and enable "Delete on browser close"**
  - Settings > Security Settings
- **Manually delete keys when finished** (recommended)

## Requirements

- A computer with a modern browser (Chrome or Edge recommended)
- A microphone
- At least one STT API key for transcription:
  - OpenAI API **or** Deepgram API
- Optional: LLM API key for AI responses (Gemini / Claude / OpenAI / Groq / DeepSeek)
  - No API key is needed when using a local LLM (Ollama / LM Studio)

## Supported Providers

### Speech-to-Text (STT)
| Provider | Type | Notes |
|----------|------|-------|
| OpenAI (Whisper/Transcribe) | Chunk-based | Stable, pseudo-realtime |
| Deepgram (Nova) | WebSocket | True realtime, low latency |

**OpenAI STT models**: gpt-4o-mini-transcribe (standard) / gpt-4o-transcribe (accuracy) / whisper-1 (legacy)  
**Deepgram models**: nova-3-general

### Large Language Models (LLM)
| Provider | Models |
|----------|--------|
| Google Gemini | gemini-3.6-flash, gemini-3.5-flash-lite, gemini-2.5-flash |
| Anthropic Claude | claude-sonnet-5, claude-haiku-4-5-20251001 |
| OpenAI | gpt-5.6-terra, gpt-5.6-luna, gpt-5.6-sol |
| Groq | openai/gpt-oss-120b, openai/gpt-oss-20b |
| DeepSeek | deepseek-v4-flash |
| Local LLM (Ollama / LM Studio) | Model list fetched live from `GET {baseUrl}/models` (no API key, cost shown as ¥0) |

Note: These are preset examples. Custom model names are supported. See [API / model support](docs/API_MODEL_SUPPORT.md) for details.

## Quick Start

### 1. Open the App

**Online (recommended)**

Just visit: 👉 **https://gatyoukatyou.github.io/ai-meeting-assistant/**

- ✅ No installation required
- ✅ Works immediately
- ✅ Full functionality
- ✅ Mobile accessible

<details>
<summary><b>Local development (for developers)</b></summary>

> ⚠️ **Note**: Even when running locally, transcription and AI features require **internet connection** for API calls.

1. Clone or download this repository
2. Navigate to the project folder
3. Start a local server:
   ```bash
   # Using Python
   python3 -m http.server 8000

   # Using Node.js
   npx http-server -p 8000
   ```
4. Open `http://localhost:8000` in your browser

⚠️ **Important**: Do not open the HTML file directly by double-clicking. Microphone access will be blocked due to browser security restrictions.

</details>

---

### 2. Configure API Keys

1. On first visit, you'll see a setup prompt – click "Open Settings"
2. Enter your STT API key (OpenAI or Deepgram)
3. Optionally, add LLM API keys for AI features
4. Click "Save"

**Get your API keys here:**
- [Google AI Studio](https://aistudio.google.com/apikey) – Gemini
- [Anthropic Console](https://console.anthropic.com/) – Claude
- [OpenAI Platform](https://platform.openai.com/api-keys) – GPT-4 / Whisper
- [Groq Console](https://console.groq.com/keys) – Groq
- [Deepgram Console](https://console.deepgram.com/) – Deepgram

---

### 3. Add to Home Screen (Mobile)

For app-like experience on mobile:

**iPhone (Safari):**
1. Open the app in Safari
2. Tap the Share button (□↑)
3. Select "Add to Home Screen"

**Android (Chrome):**
1. Open the app in Chrome
2. Tap the menu (⋮)
3. Select "Add to Home Screen"

For day-to-day iPhone operation (shortcut template, PWA constraints, save flow), see:  
[iOS Shortcut + PWA Guide](docs/IOS_PWA_GUIDE.md)

---

### 4. Start Recording

1. Select your STT provider
2. Choose transcription interval (5s/10s/15s/30s/60s/2min)
   - **5s or 10s recommended for mobile** (better responsiveness)
3. Click "🎤 Start Recording"
4. Allow microphone access when prompted
5. Speech is automatically transcribed

### 5. Use AI Features

During or after the meeting, you can ask the AI:

- **Summary** – Get a brief overview
- **Consult** – Combine feedback, analysis, and ideas
- **Minutes** – Generate structured minutes after stopping the recording
- **Custom question** – Ask anything
- **Memo** – Add a quoted memo from the transcript

**🗂 Timeline**
Review AI responses, Q&A, memos, and TODOs in chronological order with filters and search.

**💡 Specification: Text Selection**
Select specific text before asking to get responses about just that section. Useful when you want to ask about a specific part of a long meeting.

### 6. Export Your Notes

Click "📥 Export" to save meeting content, AI responses, and memos/TODOs as a Markdown file.

If you need post-processing into Word / Todoist / Asana formats, use the bundled tools in  
[`tools/md-postprocess/README.md`](tools/md-postprocess/README.md).

For meeting-type Pro Pack templates (30-title index / 12 completed in v1), see  
[`docs/propack/README.md`](docs/propack/README.md).

## Settings Backup

To transfer settings to another device:

**Export:**
1. Go to Settings → "Export"
2. Set a password
3. Download the password-protected file

**Import:**
1. Go to Settings → "Import"
2. Select your backup file
3. Enter your password

## Costs

This app is **free to use**, but the AI services have their own usage-based pricing:

- Transcription costs depend on audio duration and STT provider
- AI response costs depend on token usage and LLM provider
- The app displays estimated costs as you use it

**Note:** Displayed costs are estimates. Actual billing may vary.

## FAQ

**Q: Is internet required?**
A: Transcription (OpenAI Whisper / Deepgram) requires an internet connection. For AI responses you can use cloud LLMs (Gemini / Claude / OpenAI / Groq / DeepSeek) or a local LLM (Ollama / LM Studio) running on the same machine, which works without internet. This app uses BYOK (Bring Your Own Key) model – you bring your own API keys and pay each provider directly based on usage (local LLM costs ¥0).

**Q: What if I don't set up LLM keys?**
A: Transcription will still work. AI features (summary, consult, minutes, Q&A) will be unavailable.

**Q: What about privacy?**
A: Audio and transcripts are sent only to your selected providers. Nothing is sent to the app developer.

**Q: Is it dangerous if my API key leaks?**
A: Yes. Others could use your key and charges would appear on your account. API keys are session-only by default, but desktop app mode can optionally persist them on device. On shared PCs, keep persistence OFF, close the tab/browser, and manually clear keys when done.

**Q: What if I get an error?**
A: Check that your API keys are correct and that you have available credits with the provider.

**Q: Can I record meetings?**
A: Always inform all participants and get their consent before recording.

## Browser Support

### Desktop
| Browser | Status |
|---------|--------|
| Chrome | ✅ Recommended |
| Edge | ✅ Recommended |
| Firefox | ⚠️ Partial support |
| Safari | ⚠️ Partial support |

### Mobile
| Browser | Status |
|---------|--------|
| Safari (iOS) | ✅ Recommended |
| Chrome (Android) | ✅ Recommended |
| Chrome (iOS) | ✅ Works |
| Firefox (Android) | ⚠️ Partial support |

**Mobile notes:**
- 📱 Add to home screen for app-like experience
- 🎤 Microphone permission required on first use
- 🔋 Extended recording may consume significant battery

## Important Notes

- Always inform meeting participants before recording
- AI service charges are billed directly by the providers
- Displayed costs are estimates and may differ from actual billing
- Keep your API keys private

## Legal

By using this app, you agree to:
- [Terms of Service](docs/TERMS.md)
- [Privacy Policy](docs/PRIVACY.md)
- [Security](docs/SECURITY.md)

## License

MIT License – Free to use and modify

## Version

**v1.6.0** – Local LLM support & profile switching while recording (2026-09-05)

- AI features now work with keyless local LLMs such as Ollama / LM Studio (#211)
- Extended the AI timeout to 180s when a local LLM is selected, so summaries are less likely to be aborted (#221)
- Reasoning control for thinking models makes local summaries more reliable (#219)
- Memo/meeting profile can now be switched while recording (#220)

- [Latest Release](https://github.com/gatyoukatyou/ai-meeting-assistant/releases/tag/v1.6.0)
- [Change Log](docs/CHANGELOG.md)

## Support

For questions or issues, please open an issue on [GitHub Issues](https://github.com/gatyoukatyou/ai-meeting-assistant/issues).

**About Support:**
- This app is a personal project, provided as-is without warranty
- Bug reports and questions will be addressed on a best-effort basis
- Security issues are prioritized

---

**From the developer:**
This app is open source and free. If you find it useful, please give it a star on GitHub!

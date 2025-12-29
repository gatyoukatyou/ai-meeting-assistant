# AI Meeting Assistant

[🇯🇵 日本語](README.md) | 🇺🇸 English

[![Version](https://img.shields.io/badge/version-v1.0.0-blue)](https://github.com/gatyoukatyou/ai-meeting-assistant/releases/tag/v1.0.0)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

A lightweight, browser-based meeting assistant that records audio, transcribes speech, and generates summaries, opinions, ideas, and minutes using AI.

**🚀 Try it now**: https://gatyoukatyou.github.io/ai-meeting-assistant/

> ⚠️ **Important**: This app is **free**, but AI service fees (Gemini, OpenAI, etc.) are billed separately by each provider. **Get consent from all participants** before recording or transcribing meetings.

## Features

- 🎤 **Real-time transcription** – Speech is automatically converted to text
- 💬 **AI assistance** – Ask for summaries, opinions, ideas, or custom questions
- 🤖 **Multiple AI providers** – Choose from multiple AI providers (BYOK: Bring Your Own Key)
- 💰 **Cost estimates** – View estimated costs (actual charges may vary by provider)
- 📥 **Export to Markdown** – Save meeting content and AI responses as a file
- 🔒 **Local storage** – API keys are stored only in your browser (obfuscated)
- 🎨 **Theme switcher** – Choose from 6 accent color themes

## Security

### ⚠️ Important Disclaimers

- This app's protection is **not perfect**
- API key security **cannot be guaranteed** on shared or public PCs
- Malware or browser extensions may still access your keys
- **Manually delete** keys when done, or **enable auto-delete**

### Protection Features

- ✅ Keys are **obfuscated** (XOR + device-specific key) and stored only in your browser
- ✅ **Never sent** to external servers (direct API calls only)
- ✅ Optional **auto-delete** when browser closes (for shared PCs)
- ✅ **Backup/restore** functionality with password protection (XOR)

See [Security Details](docs/SECURITY.md) for more information.

### Important Security Rules

- **Never enter your API key on unofficial URLs**
  - Official: https://gatyoukatyou.github.io/ai-meeting-assistant/
  - Fake sites or modified copies may steal your keys
- **On shared PCs, enable "Delete on browser close"**
  - Settings > Security Settings
- **Manually delete keys when finished** (recommended)

## Requirements

- A computer with a modern browser (Chrome or Edge recommended)
- A microphone
- At least one STT API key for transcription:
  - OpenAI API **or** Deepgram API
- Optional: LLM API key for AI responses (Gemini / Claude / OpenAI / Groq)

## Supported Providers

### Speech-to-Text (STT)
| Provider | Type | Notes |
|----------|------|-------|
| OpenAI Whisper | Chunk-based | Stable, pseudo-realtime |
| Deepgram | WebSocket | True realtime, low latency |

### Large Language Models (LLM)
| Provider | Models |
|----------|--------|
| Google Gemini | gemini-2.0-flash, gemini-1.5-flash, gemini-1.5-pro |
| Anthropic Claude | claude-sonnet-4, claude-3.5-sonnet |
| OpenAI | gpt-4o, gpt-4o-mini, gpt-4-turbo |
| Groq | llama-3.3-70b, llama-3.1-70b, llama-3.1-8b |

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
- **Opinion** – Hear the AI's perspective
- **Ideas** – Get suggestions
- **Custom question** – Ask anything

**💡 Specification: Text Selection**
Select specific text before asking to get responses about just that section. Useful when you want to ask about a specific part of a long meeting.

### 6. Export Your Notes

Click "📥 Export" to save meeting content and AI responses as a Markdown file.

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
A: Yes. Transcription (OpenAI Whisper / Deepgram) and AI features (Gemini / Claude / OpenAI / Groq) require internet connections. This app uses BYOK (Bring Your Own Key) model – you bring your own API keys and pay each provider directly based on usage. The local version also requires internet (only the UI runs locally). Offline mode is not supported.

**Q: What if I don't set up LLM keys?**
A: Transcription will still work. AI features (summary, opinions, ideas) will be unavailable.

**Q: What about privacy?**
A: Audio and transcripts are sent only to your selected providers. Nothing is sent to the app developer.

**Q: Is it dangerous if my API key leaks?**
A: Yes. Others could use your key and charges would appear on your account. This app obfuscates keys in browser storage, but protection is not perfect. On shared PCs, enable "auto-delete" and manually delete keys when done.

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

**v1.0.0** – Initial Release (2024-12-29)

- [Latest Release](https://github.com/gatyoukatyou/ai-meeting-assistant/releases/tag/v1.0.0)
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

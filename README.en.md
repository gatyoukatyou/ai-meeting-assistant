# AI Meeting Assistant

[🇯🇵 日本語](README.md) | 🇺🇸 English

A lightweight, browser-based meeting assistant that records audio, transcribes speech, and generates summaries, opinions, ideas, and minutes using AI.

**🚀 Try it now**: https://gatyoukatyou.github.io/ai-meeting-assistant/

## Features

- 🎤 **Real-time transcription** – Speech is automatically converted to text
- 💬 **AI assistance** – Ask for summaries, opinions, ideas, or custom questions
- 🤖 **Multiple AI providers** – Choose from Gemini, Claude, GPT-4, or Groq
- 💰 **Cost tracking** – See estimated usage costs in real-time
- 📥 **Export to Markdown** – Save meeting content and AI responses as a file
- 🔒 **Secure storage** – API keys are encrypted and stored locally only

## Security

This app protects your API keys:

- ✅ Keys are **encrypted** and stored only in your browser
- ✅ **Never sent** to external servers
- ✅ Optional **auto-delete** when browser closes (for shared PCs)
- ✅ **Backup/restore** functionality for transferring to other devices

See [Security Details](docs/SECURITY.md) for more information.

## Requirements

- A computer with a modern browser (Chrome or Edge recommended)
- A microphone
- At least one STT API key for transcription:
  - OpenAI API **or** Deepgram API **or** AssemblyAI API
- Optional: LLM API key for AI responses (Gemini / Claude / OpenAI / Groq)

## Supported Providers

### Speech-to-Text (STT)
| Provider | Type | Notes |
|----------|------|-------|
| OpenAI Whisper | Chunk-based | Stable, pseudo-realtime |
| Deepgram | WebSocket | True realtime, low latency |
| AssemblyAI | WebSocket | True realtime, high accuracy |

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
2. Enter your STT API key (OpenAI, Deepgram, or AssemblyAI)
3. Optionally, add LLM API keys for AI features
4. Click "Save"

**Get your API keys here:**
- [Google AI Studio](https://aistudio.google.com/apikey) – Gemini
- [Anthropic Console](https://console.anthropic.com/) – Claude
- [OpenAI Platform](https://platform.openai.com/api-keys) – GPT-4 / Whisper
- [Groq Console](https://console.groq.com/keys) – Groq
- [Deepgram Console](https://console.deepgram.com/) – Deepgram
- [AssemblyAI Dashboard](https://www.assemblyai.com/app) – AssemblyAI

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

**Tip:** Select specific text before asking to get responses about just that section.

### 6. Export Your Notes

Click "📥 Export" to save meeting content and AI responses as a Markdown file.

## Settings Backup

To transfer settings to another device:

**Export:**
1. Go to Settings → "Export"
2. Set a password
3. Download the encrypted file

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
A: Yes. Transcription and AI features require API connections. Offline mode is not supported.

**Q: What if I don't set up LLM keys?**
A: Transcription will still work. AI features (summary, opinions, ideas) will be unavailable.

**Q: What about privacy?**
A: Audio and transcripts are sent only to your selected providers. Nothing is sent to the app developer.

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

v0.9.0 – PWA & Mobile Optimization

See [CHANGELOG.md](docs/CHANGELOG.md) for update history.

## Support

For questions or issues, please open an issue on [GitHub Issues](https://github.com/gatyoukatyou/ai-meeting-assistant/issues).

---

**From the developer:**
This app is open source and free. If you find it useful, please give it a star on GitHub!

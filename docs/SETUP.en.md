# Setup Guide

[🇯🇵 日本語版](../README.md) | 🇺🇸 English

This guide explains how to configure API keys and start using the AI Meeting Assistant.

## 1. Open the App

**Online (Recommended)**

Visit: https://gatyoukatyou.github.io/ai-meeting-assistant/

**Local Development**

```bash
# Clone the repository
git clone https://github.com/gatyoukatyou/ai-meeting-assistant.git
cd ai-meeting-assistant

# Start a local server (choose one)
python3 -m http.server 8000
# or
npx http-server -p 8000
```

Then open `http://localhost:8000` in your browser.

> ⚠️ Do not open `index.html` directly by double-clicking. Microphone access will be blocked.

## 2. Allow Microphone Access

When you start recording, your browser will request microphone permission.

- Click "Allow" when prompted
- If denied, check browser site settings and OS privacy settings

**Troubleshooting microphone issues:**
- macOS: System Preferences → Security & Privacy → Microphone
- Windows: Settings → Privacy → Microphone
- Browser: Click the lock icon in the address bar → Site Settings

## 3. Configure API Keys

Go to **Settings** (⚙️ button or first-time setup prompt).

### Minimum Configuration

You need **at least one STT provider** for transcription:

| Provider | Get API Key |
|----------|-------------|
| OpenAI Whisper | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| Deepgram | [console.deepgram.com](https://console.deepgram.com/) |
| AssemblyAI | [assemblyai.com/app](https://www.assemblyai.com/app) |

### Optional: LLM for AI Features

For summary, opinions, ideas, and Q&A, configure at least one LLM:

| Provider | Get API Key |
|----------|-------------|
| Google Gemini | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| Anthropic Claude | [console.anthropic.com](https://console.anthropic.com/) |
| OpenAI (GPT-4) | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| Groq | [console.groq.com/keys](https://console.groq.com/keys) |

> You can leave unused providers empty.

## 4. Choose Your Providers

In Settings:

### STT Provider Selection
- **OpenAI Whisper**: Stable, chunk-based pseudo-realtime
- **Deepgram**: WebSocket-based true realtime, low latency
- **AssemblyAI**: WebSocket-based true realtime, high accuracy

### LLM Priority
- **Auto**: Uses first available in order: Claude → OpenAI → Gemini → Groq
- **Manual**: Choose your preferred provider

Click **Save** after configuration.

## 5. Start Recording

Return to the main screen:

1. Select STT provider (if multiple configured)
2. Choose transcription interval:
   - **5-10 seconds**: Recommended for mobile (responsive)
   - **15-60 seconds**: Recommended for desktop (stable)
3. Click **🎤 Start Recording**
4. Allow microphone if prompted
5. Speak naturally – text appears automatically

## 6. Use AI Features

During or after recording:

| Button | Function |
|--------|----------|
| 📝 Summary | Brief overview of the meeting |
| 💬 Opinion | AI's perspective on the content |
| 💡 Ideas | Suggestions and proposals |
| ❓ Question | Ask anything about the transcript |

**Pro tip**: Select specific text before clicking to get responses about just that section.

## 7. Export to Markdown

Click **📥 Export** to save:
- Meeting transcript
- AI responses (summary, opinions, ideas)
- Cost breakdown (optional)

The file is saved as `.md` (Markdown format).

## UI Language (JP/EN)

The app supports Japanese and English UI:

1. Click the language dropdown in the header
2. Select your preferred language
3. Setting is saved automatically

> Note: UI language is independent from transcription language. The transcription language is determined by the audio content.

## Security Options

In Settings:

- **Auto-delete on close**: API keys are deleted when browser closes (for shared PCs)
- **Cost alert**: Warning when costs approach your set limit

## Backup & Restore

### Export Settings
1. Settings → Export
2. Enter a password (for encryption)
3. Save the `.json` file

### Import Settings
1. Settings → Import
2. Select your backup file
3. Enter your password

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Microphone not working | Check browser/OS permissions |
| No transcription | Verify STT API key is correct |
| AI buttons disabled | Configure at least one LLM provider |
| "API error" message | Check API key and account credits |
| High latency | Try Deepgram or reduce interval |

## Cost Estimates

The app shows estimated costs based on:
- Audio duration (STT)
- Token count (LLM)

Actual billing may vary slightly from estimates. Check your provider dashboards for accurate usage.

---

For more information, see the [main README](../README.en.md).

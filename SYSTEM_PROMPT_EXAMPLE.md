# Customizing the AI Chatbot Behavior

You can customize how the AI assistant behaves by changing the system prompt. The system prompt defines the AI's personality, tone, and instructions.

## Method 1: Environment Variable (Recommended)

Create a `.env` or `.env.local` file in the project root and add:

```env
SYSTEM_PROMPT=Your custom prompt here...
```

### Example Custom Prompts

**More Casual/Fun:**
```env
SYSTEM_PROMPT=You are a fun, laid-back movie buddy who loves talking about shows and movies. Be enthusiastic and use emojis occasionally. Answer questions using only what's happened up to the timestamp - no spoilers! Keep it short and friendly.
```

**More Analytical/Detailed:**
```env
SYSTEM_PROMPT=You are a knowledgeable film and TV analyst. Provide detailed, insightful answers about the content, characters, and themes. Use only information available up to the specified timestamp. Never reveal future plot points or spoilers. Be thorough but concise.
```

**More Strict/Professional:**
```env
SYSTEM_PROMPT=You are a professional entertainment companion assistant. Maintain a professional tone. Answer questions precisely using only the provided context up to the timestamp. Refuse to discuss events beyond the current timestamp. Keep responses brief and factual.
```

**Allow Spoilers (if requested):**
```env
SYSTEM_PROMPT=You are a helpful movie and TV companion. Answer questions using the provided context and history. If the viewer explicitly asks for spoilers, you may provide them, but warn them first. Otherwise, stick to events up to the timestamp.
```

## Method 2: Edit the Code Directly

You can also edit the default prompt in `movie_companion/llm.py` around line 81 in the `_build_messages` method (inside the `__init__` method where it reads from the environment variable).

## Current Default Prompt

The default prompt is:
```
You are a friendly movie or TV companion assistant. Answer questions using only the provided context, watched history, and logical inference based solely on events up to the specified timestamp. Never mention or hint at spoilers, twists, or future events beyond the timestamp. If the viewer requests major spoilers, gently refuse. When the context is sparse, acknowledge uncertainty and suggest rechecking or continuing to watch. Keep responses concise, helpful, and conversational.
```

## Other Configurable Settings

You can also adjust:
- **Temperature** (0.0-2.0): Controls randomness. Lower = more focused/deterministic, Higher = more creative/random
- **Max Output Tokens**: Maximum length of responses
- **Model**: Which AI model to use (llama3, gpt-4o-mini, etc.)
- **Provider**: ollama, openai, or groq

These can be set via environment variables or in the frontend code (`web/static/app.js`).












# Deepgram Nova‑3 Live Streaming & Speaker Diarization Guide

This guide provides a comprehensive overview, code examples, configuration details, and best practices for using Deepgram’s latest Nova‑3 model in live streaming scenarios with speaker diarization.

---

## 1. Prerequisites

* **Deepgram API Key**: Obtain from your Deepgram dashboard.
* **Python ≥ 3.10**
* **Install SDK**:

  ```bash
  pip install deepgram-sdk
  ```

---

## 2. Core Concepts

* **Model: `nova-3`**: State-of-the-art model optimized for noisy environments, multilingual audio, and low word error rates.
* **Live Streaming**: Real-time transcription via WebSocket.
* **Speaker Diarization**: Assigns a `speaker` ID to each word in the transcript.
* **Smart Formatting**: Auto-formats numbers, dates, currencies, etc.
* **Interim Results**: Receive partial transcripts before finalization.

---

## 3. Python Example

```python
import os
import asyncio
from deepgram import Deepgram
from deepgram import LiveOptions, LiveTranscriptionEvents

# 1. Initialize client
dg = Deepgram(os.getenv("DEEPGRAM_API_KEY", "YOUR_API_KEY"))

async def live_stream(url: str):
    opts = LiveOptions(
        model="nova-3",
        language="en-US",
        diarize=True,
        smart_format=True,
        interim_results=True,
        encoding="linear16",
        sample_rate=16000,
        channels=1,
        endpointing=300,
        utterance_end_ms="1000",
        vad_events=True
    )

    conn = dg.transcription.live.start(opts)

    @conn.on(LiveTranscriptionEvents.Transcript)
    def on_transcript(res):
        words = res["channel"]["alternatives"][0].get("words", [])
        for w in words:
            print(f"[Speaker {w['speaker']}] {w['word']} ({w['start']:.2f}s)")

    @conn.on(LiveTranscriptionEvents.Error)
    def on_error(err):
        print("Error:", err)

    @conn.on(LiveTranscriptionEvents.Close)
    def on_close(_):
        print("Connection closed")

    import aiohttp
    async with aiohttp.ClientSession() as session:
        async with session.get(url) as resp:
            async for chunk in resp.content.iter_chunked(4096):
                conn.send(chunk)

    conn.finish()

if __name__ == "__main__":
    asyncio.run(live_stream("http://your.audio/stream"))
```

---

## 4. cURL Example

```bash
curl \
  --header "Authorization: Token YOUR_API_KEY" \
  --header "Content-Type: audio/wav" \
  --data-binary @stream.wav \
  "https://api.deepgram.com/v1/listen?model=nova-3&diarize=true&smart_format=true&interim_results=true&endpointing=300&utterance_end_ms=1000"
```

---

## 5. Configuration Parameters

| Option             | Description                                 | Example    |
| ------------------ | ------------------------------------------- | ---------- |
| `model`            | Model name                                  | `nova-3`   |
| `language`         | Audio language                              | `en-US`    |
| `diarize`          | Enable speaker diarization                  | `true`     |
| `smart_format`     | Format numbers, dates, etc.                 | `true`     |
| `interim_results`  | Return partial transcripts                  | `true`     |
| `encoding`         | Audio encoding                              | `linear16` |
| `sample_rate`      | Audio sample rate (Hz)                      | `16000`    |
| `channels`         | Number of channels                          | `1`        |
| `endpointing`      | Silence duration (ms) to finalize utterance | `300`      |
| `utterance_end_ms` | Silence duration (ms) to mark utterance end | `1000`     |
| `vad_events`       | Emit VAD (voice activity) events            | `true`     |

---

## 6. Output Structure

Each word entry includes:

```json
{
  "word": "hello",
  "start": 0.15,
  "end": 0.60,
  "confidence": 0.98,
  "speaker": 0
}
```

* **Live**: Includes `speaker` per word.
* **Pre-recorded**: Also includes `speaker_confidence`.

---

## 7. Tips & Best Practices

* **Multilingual**: Set `language` to `"multi"` for automatic language detection.
* **Custom Vocabulary**: Use `alfabet` or `phrases` options to boost domain-specific terms.
* **Handling Interruptions**: Use `interim_results` to display partial text in UI.
* **Chunk Size**: Adjust `iter_chunked(…)` size based on network and RT latency.
* **Keep-Alive**: Send periodic silent frames or pings if audio pauses longer than endpointing.
* **Error Handling**: Listen to `Error` and implement retries/backoff.

---

## 8. Further Resources

* [Deepgram Live API Reference](https://developers.deepgram.com/docs/)
* [Speaker Diarization Guide](https://developers.deepgram.com/docs/diarization/)
* [Nova‑3 Model Details](https://developers.deepgram.com/docs/models/#nova-3)

---



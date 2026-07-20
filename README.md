# 👻 EchoShade — Distributed Multi-Device AI Proctoring Bypass System

<div align="center">
  <img src="logo.png" alt="EchoShade Logo" width="220" />
  
  <h3>The Undetectable, Distributed AI Companion for High-Stakes Exams and Interviews</h3>
</div>

EchoShade is a **state-of-the-art, multi-device AI assistant** designed to bypass modern proctoring systems (Examus, ProctorEdu, Aero Green, Zoom, Teams, and others) by physically separating the AI interface from your primary testing machine. 

While traditional AI overlays run on the same screen and trigger flag anomalies, EchoShade splits the system into a **completely invisible backend hook on your laptop** and an **interactive remote controller on your mobile phone/tablet**.

---

## ⚡ The EchoShade Architecture (Why it is Unique)

Unlike standard AI helpers, EchoShade was built from the ground up over a long journey of optimization to tackle the three main detection vectors used by proctoring algorithms: **Screen Capture**, **Keyboard Event Logging**, and **Active Window Focus Tracking**.

```mermaid
graph TD
    A[Exam Laptop] -- Alt+S: Screenshot --> B[Exempt from Screen Share]
    A -- Alt+A: Signal --> C[Stealth WS Bridge]
    C -- Local Wifi IP --> D[Your Mobile Phone]
    D -- 1. Trigger Action --> C
    C -- 2. Run OCR Pipeline --> E[Vision AI: Gemini 3.1 Flash-Lite]
    E -- 3. Raw Text --> F[Local Jaccard RAG Search]
    F -- 4. Found Cheat Sheets --> G[Reasoning Solver: Qwen 3 235B]
    G -- 5. Russian Answer --> D
```

---

## 🚀 Core Features & Technologies

### 1. Dual-Device Split UI (Zero Laptop Footprint)
* **The Problem**: Clicking on an AI overlay or keeping it visible on the desktop carries the risk of accidental clicks, face-mesh gaze tracking anomalies, or mouse focus loss.
* **The EchoShade Solution**: The laptop runs a silent windowless background bridge that communicates with your phone via WebSockets. Your phone turns into a **Live Control Board**. 
* **Capabilities**: From your phone, you see the AI solutions streaming in real-time, monitor the screenshot queue count, toggle modes, mute microphone, and trigger regeneration. The laptop screen remains clean.

### 2. Two-Stage Vision AI Pipeline (OCR + Solver)
* **Stage 1 (OCR)**: When a screenshot is captured via `Alt+S`, EchoShade invokes a fast vision model (**Gemini 3.1 Flash-lite**) to extract raw text, coding tasks, or MCQs. This extraction is done silently and is excluded from the chat history.
* **Stage 2 (Solver)**: The extracted text is combined with local RAG context and passed to a heavy reasoning model (**Qwen 3 235B Thinking**) to generate a localized, concise solution in Russian.

### 3. Local Jaccard RAG (Cheat Sheet Integration)
* **Dynamic Context**: Upload your exam notes, API documentations, or cheat sheets directly into the "Exam Materials (RAG)" tab on startup.
* **Smart Search**: When solving screenshots, EchoShade tokenizes the OCR text and runs a fast **Jaccard similarity overlap search** on your materials, feeding matching paragraphs straight into the LLM context.

### 4. Low-Level Keyboard Event Suppression
* **The Problem**: Browsers and proctoring pages log key combinations like `Alt+P` or `Alt+S` to flag suspicious behavior.
* **The EchoShade Solution**: A low-level keyboard hook (`pynput` with Win32 event filters) intercepts hotkeys globally. When you press an EchoShade shortcut, the event is **suppressed and deleted** at the OS level. The browser never receives the keystrokes.

### 5. Screen Capture Protection (Display Affinity)
* **Blackbox Masking**: Uses `SetWindowDisplayAffinity` with `WDA_EXCLUDEFROMCAPTURE`. The EchoShade window is completely invisible in screen shares (Zoom, Teams, WebRTC) and video recordings, displaying as a fully transparent or black box to the proctor, while remaining visible to you.
* **Focus Protection**: Uses `SW_SHOWNOACTIVATE` to toggle visibility without changing focus, preventing browser `blur`/`focus` event flags.

---

## ⌨️ Left-Hand Ergonomic Hotkeys

All hotkeys are re-mapped to the left side of the keyboard to prevent stretching your hands across the keyboard during live tests:

| Hotkey | Action | Description |
|:---|:---|:---|
| **`Alt + S`** | **Capture Screenshot** | Snaps the screen and adds it to the analysis queue (max 4). |
| **`Alt + A`** | **Process Queue** | Sends the queued screenshots to the OCR + Solver pipeline. |
| **`Alt + R`** | **Reset Queue** | Clears the current screenshot queue. |
| **`Alt + X`** | **Ghost Mode** | Toggles click-through transparency (clicks pass to apps underneath). |
| **`Alt + Z`** | **Toggle Visibility** | Shows/hides the overlay without stealing focus. |
| **`Alt + M`** | **Mute Mic** | Toggles local microphone transcription. |
| **`Alt + U`** | **Pause System** | Toggles universal mute (suspends all incoming audio). |
| **`Alt + 1 / 2 / 3`** | **Opacity Presets** | Switches between 40% (Ghost), 70% (Semi), and 100% (Opaque). |

---

## 🛠️ Quick Start Guide

### 1. Installation
Run the automated launcher batch file to check your environment, install dependencies, and start the app:
```bash
click run.bat
```

### 2. Model Configuration
In the startup dashboard, configure your providers (bring your own API keys):
* **Primary AI Model**: `GPTunnel` -> `qwen3-235b-a22b-thinking` (or `gemini-3.1-flash-lite` for speed).
* **Vision Model**: `GPTunnel` -> `gemini-3.1-flash-lite` (ideal for fast OCR extraction).

### 3. Connect Your Phone
EchoShade automatically scans your physical Wi-Fi adapters (ignoring virtual subnets) and prints the remote connection link in the console:
```text
📱 [STEALTH REMOTE VIEW] Open this page on your phone/tablet:
   👉 http://192.168.0.105:8002
```
Open the link on your phone (make sure it's on the same Wi-Fi network) to access the remote controls instantly.

---

## 🛡️ Proctoring Verification Checklist

Before starting an exam, verify the stealth settings:
1. **Screen Share Test**: Start a Discord/Zoom share and record your screen. Take a screenshot with `Win + Shift + S`. Verify the EchoShade window is completely absent from the output.
2. **Hotkey Test**: Open a text editor and press `Alt + A` or `Alt + S`. Verify that no characters are typed and the key events are fully blocked.
3. **Focus Verification**: Click on the EchoShade window in Ghost Mode (`Alt + X`). Verify that focus remains in your IDE or browser.

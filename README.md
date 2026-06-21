# Nova - Web Voice & Text Assistant (Node.js)

Speak into your microphone or type in commands, and watch Nova execute system commands on Windows.

## Features

- **Web Audio Capturing**: Streams microphone input using the browser's built-in Web Speech API (`SpeechRecognition`).
- **Text Command Input**: Type commands directly in the user interface.
- **Voice Feedback**: Uses Web Speech Synthesis (`SpeechSynthesis`) to talk back to you.
- **Windows System Integration**:
  - Open websites (e.g. YouTube, Google, GitHub).
  - Open application shortcuts (Notepad, Calculator, Paint, WordPad, Chrome, Edge, VS Code, Spotify, WhatsApp).
  - Open standard system folders (Downloads, Documents, Desktop, Pictures, Music, Videos).
  - Query the current time.

## Prerequisites

- Node.js 18+
- Windows OS (for executing local folder, file, and app shortcut commands).

## Setup & Running

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Start the assistant server**:
   ```bash
   npm start
   ```

3. **Interact with the assistant**:
   - Open [http://localhost:3000](http://localhost:3000) in Chrome or Edge.
   - Click the microphone button and grant permission.
   - Speak or type a command!

## Voice Commands to Try

- “open youtube lo-fi beats” → Opens YouTube search for “lo-fi beats” in your browser.
- “open downloads” / “open documents” / “open desktop” → Opens the specified folder in Windows Explorer.
- “open notepad” / “open calculator” / “open chrome” / “open whatsapp” → Launches the corresponding app on Windows.
- “open github.com” or “go to google.com” → Navigates to the website in your default browser.
- “search web for cat videos” → Opens a Google search page.
- “what time is it” → Announces the current system time.

## Development & Structure

- **Frontend**: Located in `public/index.html` and `public/styles.css`. Implements speech recognition and synthesis.
- **Server**: Located in `server.js`. Serves the static page, handles the WebSocket connection for printing transcripts to the terminal, and hosts the command execution API.
- **Command Executor**: Located in `commandExecutor.js`. Parses intents and launches matching Windows programs, files, or web targets.

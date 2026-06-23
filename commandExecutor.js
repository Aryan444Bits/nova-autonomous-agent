// Command executor for simple natural language actions on Windows
// Supports: open websites, YouTube searches, common apps, and user folders
const { exec, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const https = require('https');

// Tiny helpers
function quote(v) {
  if (v == null) return '';
  // Wrap in double quotes if contains spaces or special chars
  const s = String(v);
  if (/^[A-Za-z0-9_.:\\/-]+$/.test(s)) return s; // safe
  return `"${s.replace(/"/g, '\\"')}"`;
}

function runStart(target, extra = []) {
  return new Promise((resolve, reject) => {
    try {
      const child = spawn('cmd.exe', ['/c', 'start', '""', target, ...extra], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      });
      child.unref();
      resolve();
    } catch (err) {
      reject(err);
    }
  });
}

function exists(p) {
  try { return fs.existsSync(p); } catch { return false; }
}

function isAbsoluteWin(p) {
  return /^(?:[a-zA-Z]:\\|\\\\|\/)/.test(p);
}

function resolveFilePath(input) {
  if (!input) return null;
  const home = process.env['USERPROFILE'] || process.env['HOMEPATH'] || process.env['HOME'] || '';
  const cleaned = String(input).replace(/^"|"$/g, '').replace(/^'|'$/g, '').trim();
  const candidates = [];
  if (isAbsoluteWin(cleaned)) {
    candidates.push(cleaned);
  } else {
    candidates.push(path.join(home, cleaned));
    candidates.push(path.join(home, 'Downloads', cleaned));
    candidates.push(path.join(home, 'Documents', cleaned));
    candidates.push(path.join(home, 'Desktop', cleaned));
  }
  for (const c of candidates) {
    if (exists(c)) return c;
  }
  return null;
}

async function openFile(name) {
  const p = resolveFilePath(name);
  if (!p) {
    return { ok: false, action: 'open-file', target: name, message: `File not found: ${name}` };
  }
  try {
    await runStart(p);
    return { ok: true, action: 'open-file', target: p, message: `Opening ${path.basename(p)}` };
  } catch (e) {
    return { ok: false, action: 'open-file', target: p, message: `Failed to open ${path.basename(p)}: ${e.message || String(e)}` };
  }
}

// Known application paths (best-effort)
function findChrome() {
  const candidates = [
    path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env['LOCALAPPDATA'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ];
  return candidates.find(exists);
}

function findEdge() {
  const candidates = [
    path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ];
  return candidates.find(exists);
}

function findVSCode() {
  const candidates = [
    path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'Microsoft VS Code', 'Code.exe'),
    path.join(process.env['LOCALAPPDATA'] || '', 'Programs', 'Microsoft VS Code', 'Code.exe'),
  ];
  return candidates.find(exists);
}

function userFolder(name) {
  const home = process.env['USERPROFILE'] || process.env['HOMEPATH'] || process.env['HOME'] || '';
  const map = {
    downloads: path.join(home, 'Downloads'),
    documents: path.join(home, 'Documents'),
    desktop: path.join(home, 'Desktop'),
    pictures: path.join(home, 'Pictures'),
    music: path.join(home, 'Music'),
    videos: path.join(home, 'Videos'),
  };
  return map[name];
}

async function openUrl(url) {
  try {
    // Open with default browser
    await runStart(url);
    return { ok: true, action: 'open-url', target: url, message: `Opening ${url}` };
  } catch (e) {
    return { ok: false, action: 'open-url', target: url, message: `Failed to open URL: ${e.message || String(e)}` };
  }
}

async function openYouTube(query) {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
  return openUrl(url);
}

function getYouTubeFirstVideo(query) {
  return new Promise((resolve) => {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    };
    https.get(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        // Match videoIds specifically within a videoRenderer block to get actual search results
        const matches = [...data.matchAll(/"videoRenderer"\s*:\s*\{\s*"videoId"\s*:\s*"([^"]+)"/g)];
        if (matches.length > 0) {
          const videoIds = matches.map(m => m[1]);
          resolve(videoIds[0]);
        } else {
          // Fallback to broader match that contains videoRenderer but might have slightly different spacing
          const fallbackMatches = [...data.matchAll(/"videoRenderer"\s*:\s*\{[^}]+?"videoId"\s*:\s*"([^"]+)"/g)];
          if (fallbackMatches.length > 0) {
            resolve(fallbackMatches[0][1]);
          } else {
            resolve(null);
          }
        }
      });
    }).on('error', () => {
      resolve(null);
    });
  });
}

async function playSong(songName) {
  try {
    const videoId = await getYouTubeFirstVideo(songName);
    if (videoId) {
      const url = `https://www.youtube.com/watch?v=${videoId}`;
      await runStart(url);
      return { ok: true, action: 'play-song', target: url, message: `Playing "${songName}" on YouTube` };
    }
  } catch (e) {
    // Fallback on error
  }
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(songName)}`;
  try {
    await runStart(url);
    return { ok: true, action: 'play-song', target: url, message: `Searching YouTube for "${songName}"` };
  } catch (e) {
    return { ok: false, action: 'play-song', target: url, message: `Failed to play song: ${e.message || String(e)}` };
  }
}

async function openGoogle(query) {
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  return openUrl(url);
}

async function openApp(app) {
  const name = app.toLowerCase().trim();
  // Built-in commands that are typically in PATH
  const simple = {
    notepad: 'notepad',
    calculator: 'calc',
    calc: 'calc',
    paint: 'mspaint',
    wordpad: 'write',
    explorer: 'explorer',
  };

  try {
    if (simple[name]) {
      await runStart(simple[name]);
      return { ok: true, action: 'open-app', target: name, message: `Opening ${name}` };
    }
    if (name === 'whatsapp') {
      try {
        await new Promise((resolve, reject) => {
          exec('explorer shell:AppsFolder\\5319275A.WhatsAppDesktop_cv1g1gvanyjgm!App', (err) => {
            if (err) return reject(err);
            resolve();
          });
        });
        return { ok: true, action: 'open-app', target: 'whatsapp', message: 'Opening WhatsApp' };
      } catch (e) {
        await runStart('whatsapp');
        return { ok: true, action: 'open-app', target: 'whatsapp', message: 'Opening WhatsApp (best effort)' };
      }
    }
    if (name === 'edge' || name === 'microsoft edge') {
      const exe = findEdge();
      if (exe) {
        await runStart(exe);
      } else {
        // Fallback to protocol
        await runStart('microsoft-edge:https://www.bing.com');
      }
      return { ok: true, action: 'open-app', target: 'edge', message: 'Opening Microsoft Edge' };
    }
    if (name === 'chrome' || name === 'google chrome') {
      const exe = findChrome();
      if (exe) {
        await runStart(exe);
        return { ok: true, action: 'open-app', target: 'chrome', message: 'Opening Google Chrome' };
      }
      // Try generic start which may resolve via file associations
      await runStart('chrome');
      return { ok: true, action: 'open-app', target: 'chrome', message: 'Opening Chrome (best effort)' };
    }
    if (name === 'vscode' || name === 'visual studio code' || name === 'code') {
      const exe = findVSCode();
      if (exe) {
        await runStart(exe);
        return { ok: true, action: 'open-app', target: 'vscode', message: 'Opening VS Code' };
      }
      await runStart('code');
      return { ok: true, action: 'open-app', target: 'code', message: 'Opening VS Code (best effort)' };
    }
    if (name === 'spotify') {
      const candidates = [
        path.join(process.env['APPDATA'] || '', 'Spotify', 'Spotify.exe'),
        path.join(process.env['LOCALAPPDATA'] || '', 'Microsoft', 'WindowsApps', 'SpotifyAB.SpotifyMusic_8wekyb3d8bbwe', 'Spotify.exe'),
      ];
      const exe = candidates.find(exists);
      if (exe) {
        await runStart(exe);
        return { ok: true, action: 'open-app', target: 'spotify', message: 'Opening Spotify' };
      }
      await runStart('spotify');
      return { ok: true, action: 'open-app', target: 'spotify', message: 'Opening Spotify (best effort)' };
    }
    // Generic best-effort
    await runStart(name);
    return { ok: true, action: 'open-app', target: name, message: `Tried to open ${name}` };
  } catch (e) {
    return { ok: false, action: 'open-app', target: name, message: `Could not open ${name}: ${e.message || String(e)}` };
  }
}

async function openFolder(name) {
  const folder = userFolder(name);
  if (!folder || !exists(folder)) {
    return { ok: false, action: 'open-folder', target: name, message: `Folder not found: ${name}` };
  }
  try {
    await runStart(folder);
    return { ok: true, action: 'open-folder', target: folder, message: `Opening ${name}` };
  } catch (e) {
    return { ok: false, action: 'open-folder', target: folder, message: `Failed to open folder ${name}: ${e.message || String(e)}` };
  }
}

async function writeNotepad(content) {
  if (!content) {
    return { ok: false, action: 'write-notepad', message: 'No content to write' };
  }
  const cleanedContent = content.trim().replace(/^[:;\s]+/, '').trim().replace(/^["']|["']$/g, '').trim();
  if (!cleanedContent) {
    return { ok: false, action: 'write-notepad', message: 'Content was empty after cleaning' };
  }

  const home = process.env['USERPROFILE'] || process.env['HOMEPATH'] || process.env['HOME'] || '';
  const notesDir = path.join(home, 'Documents', 'NovaNotes');

  let category = 'note';
  const emailToMatch = cleanedContent.match(/^email\s+to\s+([a-zA-Z0-9 _-]+)/i);
  const noteToMatch = cleanedContent.match(/^note\s+to\s+([a-zA-Z0-9 _-]+)/i);
  const msgToMatch = cleanedContent.match(/^message\s+to\s+([a-zA-Z0-9 _-]+)/i);

  if (emailToMatch) {
    category = `email_to_${emailToMatch[1].trim().replace(/\s+/g, '_')}`;
  } else if (noteToMatch) {
    category = `note_to_${noteToMatch[1].trim().replace(/\s+/g, '_')}`;
  } else if (msgToMatch) {
    category = `message_to_${msgToMatch[1].trim().replace(/\s+/g, '_')}`;
  } else {
    const lower = cleanedContent.toLowerCase();
    if (lower.startsWith('email')) {
      category = 'email';
    } else if (lower.startsWith('message')) {
      category = 'message';
    } else if (lower.startsWith('draft')) {
      category = 'draft';
    }
  }

  const now = new Date();
  const pad = (num) => String(num).padStart(2, '0');
  const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const filename = `${category}_${timestamp}.txt`;
  const filePath = path.join(notesDir, filename);

  try {
    if (!fs.existsSync(notesDir)) {
      fs.mkdirSync(notesDir, { recursive: true });
    }
    fs.writeFileSync(filePath, cleanedContent, 'utf8');
  } catch (err) {
    return { ok: false, action: 'write-notepad', message: `Failed to save note: ${err.message}` };
  }

  try {
    await runStart('notepad.exe', [filePath]);
    return { ok: true, action: 'write-notepad', target: filePath, message: `Writing in Notepad` };
  } catch (e) {
    return { ok: false, action: 'write-notepad', target: filePath, message: `Failed to launch Notepad: ${e.message || String(e)}` };
  }
}

function queryAI(systemInstruction, userPrompt, jsonMode = false) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.OPENROUTER_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return reject(new Error('No API key configured.'));
    }

    if (apiKey.startsWith('AIzaSy')) {
      // Native Google Gemini API
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
      const payload = JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: userPrompt }]
          }
        ],
        systemInstruction: {
          parts: [{ text: systemInstruction }]
        },
        generationConfig: {
          responseMimeType: jsonMode ? 'application/json' : 'text/plain',
          maxOutputTokens: 2048
        }
      });
      const reqOpts = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      };
      const req = https.request(geminiUrl, reqOpts, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.error) {
              return reject(new Error(json.error.message || 'Gemini API Error'));
            }
            const text = json.candidates[0].content.parts[0].text;
            resolve(jsonMode ? cleanJsonResponse(text) : text);
          } catch (e) {
            reject(new Error(`Failed to parse Gemini response: ${e.message}`));
          }
        });
      });
      req.on('error', reject);
      req.write(payload);
      req.end();
      return;
    }

    // OpenRouter API
    const url = 'https://openrouter.ai/api/v1/chat/completions';
    const payload = JSON.stringify({
      model: process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash',
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: userPrompt }
      ],
      response_format: jsonMode ? { type: 'json_object' } : undefined,
      max_tokens: 2048
    });

    const parsedUrl = new URL(url);
    const reqOpts = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://github.com/aryan/nova-assistant',
        'X-Title': 'Nova Voice Assistant',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = https.request(reqOpts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) {
            return reject(new Error(json.error.message || 'OpenRouter API Error'));
          }
          const text = json.choices[0].message.content;
          resolve(jsonMode ? cleanJsonResponse(text) : text);
        } catch (e) {
          reject(new Error(`Failed to parse OpenRouter response: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function generateLeetCodeProblemsText() {
  const systemInstruction = "You are a helpful coding tutor assistant. Your task is to generate a dynamic, interesting set of LeetCode problems to solve.";
  const prompt = `Generate a coding assignment in text format with 3 LeetCode problems. 
Choose 3 random, interesting problems of varying difficulties (e.g. 1 Easy, 2 Mediums or 2 Easys, 1 Medium).
Do NOT choose Two Sum, Valid Parentheses, or Longest Substring Without Repeating Characters unless they are randomized naturally among others. Try to pick other interesting ones like:
- Container With Most Water
- Group Anagrams
- Search in Rotated Sorted Array
- Climbing Stairs
- Word Search
- Longest Palindromic Substring
- Valid Anagram
- Binary Tree Inorder Traversal
- Merge Two Sorted Lists
- etc.

For each problem, include:
1. Problem Title (with difficulty, e.g., "1. Group Anagrams (Medium)")
2. Link: The exact, valid URL to the problem on leetcode.com (e.g., https://leetcode.com/problems/group-anagrams/)
3. Description: A brief description of what the problem asks for (1-2 sentences).

Format the output beautifully with lines and sections, ready to be read in Notepad. Keep instructions at the bottom.
Return ONLY the raw text content for the Notepad. Do not wrap the response in markdown code blocks (do not use \`\`\` or \`\`\`text).`;

  try {
    const responseText = await queryAI(systemInstruction, prompt, false);
    return responseText.trim();
  } catch (err) {
    console.error('Error generating LeetCode problems with AI:', err);
    // Return fallback hardcoded problems if AI fails
    return `==================================================
              LEETCODE CODING ASSIGNMENT
==================================================

Here are some selected LeetCode problems to solve today:

1. Two Sum (Easy)
   - Link: https://leetcode.com/problems/two-sum/
   - Description: Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.
   
2. Valid Parentheses (Easy)
   - Link: https://leetcode.com/problems/valid-parentheses/
   - Description: Given a string s containing just the characters '(', ')', '{', '}', '[' and ']', determine if the input string is valid.

3. Longest Substring Without Repeating Characters (Medium)
   - Link: https://leetcode.com/problems/longest-substring-without-repeating-characters/
   - Description: Given a string s, find the length of the longest substring without repeating characters.

Instructions:
1. Open VS Code and write your solutions in your preferred language.
2. Go to the LeetCode links in your browser to submit and verify your code.
3. Keep practicing!

Generated by Nova on ${new Date().toLocaleString()} (Fallback Mode)
`;
  }
}

async function initializeSetup() {
  const content = await generateLeetCodeProblemsText();

  try {
    const notepadRes = await writeNotepad(content);
    const leetcodeRes = await openUrl('https://leetcode.com/problemset/');
    const vscodeRes = await openApp('vscode');

    const ok = notepadRes.ok && leetcodeRes.ok && vscodeRes.ok;
    return {
      ok,
      action: 'initialize-setup',
      message: 'Dev setup initialized. Opened LeetCode assignment in Notepad, LeetCode website in browser, and VS Code.'
    };
  } catch (err) {
    return {
      ok: false,
      action: 'initialize-setup',
      message: `Failed to initialize setup: ${err.message}`
    };
  }
}

function ensureUrl(s) {
  if (/^https?:\/\//i.test(s)) return s;
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(s)) return `https://${s}`;
  return null;
}

const SYSTEM_PROMPT = `You are Nova, an AI-powered voice and system control assistant.
Your task is to classify the user's spoken input and decide if they want to execute a system command/action OR have a conversational chat.

System commands you can trigger include:
1. Opening files (e.g. "open the file report.pdf")
2. Opening folders (e.g. "open downloads folder", "open documents")
3. Opening default browser (e.g. "open browser")
4. Opening websites/domains (e.g. "open github.com", "go to google.com")
5. Opening specific apps (e.g. "open notepad", "open spotify", "open paint", "open edge", "open chrome", "open vscode", "open whatsapp")
6. Playing music/songs (e.g. "play the song shape of you", "open youtube and play lo-fi")
7. General YouTube searches (e.g. "search on youtube for nodejs tutorials")
8. Web searches (e.g. "search the web for weather tomorrow", "google nodejs tutorials")
9. Writing notes, emails, messages, code, or text in Notepad (e.g. "open notepad and write email to boss", "write a note in notepad: buy groceries", "open notepad and write hello world", "write a code to print prime number in notepad"). Standardize this command to 'write notepad: <content>'.
   CRITICAL: If the user asks to write an email, note, message, or code, you must GENERATE the full actual content (e.g., draft the professional email body, write the functional programming code, or write the detailed message/note text) and set it as the <content> of 'write notepad: <content>', rather than using the literal request text.
10. Initializing the workspace / developer setup (e.g., "initialize my setup", "initialise my setup", "setup my workspace"). Standardize this command to 'initialize my setup'.

You MUST respond in JSON format with the following fields:
- "type": either "command" or "chat".
- "command": (required if type is "command") The cleaned and standardized command matching the actions above (e.g., "play shape of you", "open downloads", "open notepad", "google weather", "write notepad: hello boss", "initialize my setup").
- "reply": (required if type is "chat") A brief, natural, conversational response speaking to the user (e.g. "Hello sir, how can I assist you today?"). Keep conversational replies concise as they will be spoken out loud.

Input query: `;

function cleanJsonResponse(text) {
  let cleaned = text.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.substring('```json'.length);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.substring('```'.length);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.substring(0, cleaned.length - 3);
  }
  return cleaned.trim();
}

// Chat history storage for short term memory
const chatHistory = [];
const MAX_HISTORY = 100;

function callAI(query) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.OPENROUTER_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return reject(new Error('No API key configured. Please set OPENROUTER_API_KEY or GEMINI_API_KEY in .env.'));
    }

    const systemPromptClean = SYSTEM_PROMPT.replace(/Input query:\s*$/, '').trim();

    if (apiKey.startsWith('AIzaSy')) {
      // Native Google Gemini API
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

      const contents = [];
      for (const msg of chatHistory) {
        contents.push({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }]
        });
      }
      contents.push({
        role: 'user',
        parts: [{ text: query }]
      });

      const payload = JSON.stringify({
        contents: contents,
        systemInstruction: {
          parts: [{ text: systemPromptClean }]
        },
        generationConfig: {
          responseMimeType: 'application/json',
          maxOutputTokens: 2048
        }
      });
      const reqOpts = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      };
      const req = https.request(geminiUrl, reqOpts, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.error) {
              return reject(new Error(json.error.message || 'Gemini API Error'));
            }
            const text = json.candidates[0].content.parts[0].text;
            resolve(cleanJsonResponse(text));
          } catch (e) {
            reject(new Error(`Failed to parse Gemini response: ${e.message}`));
          }
        });
      });
      req.on('error', reject);
      req.write(payload);
      req.end();
      return;
    }

    // OpenRouter API
    const url = 'https://openrouter.ai/api/v1/chat/completions';

    const messages = [];
    messages.push({ role: 'system', content: systemPromptClean });
    for (const msg of chatHistory) {
      messages.push({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content
      });
    }
    messages.push({ role: 'user', content: query });

    const payload = JSON.stringify({
      model: process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash',
      messages: messages,
      response_format: { type: 'json_object' },
      max_tokens: 2048
    });

    const parsedUrl = new URL(url);
    const reqOpts = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://github.com/aryan/nova-assistant',
        'X-Title': 'Nova Voice Assistant',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = https.request(reqOpts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) {
            return reject(new Error(json.error.message || 'OpenRouter API Error'));
          }
          const text = json.choices[0].message.content;
          resolve(cleanJsonResponse(text));
        } catch (e) {
          reject(new Error(`Failed to parse OpenRouter response: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// Main entry: parse a natural language command and execute (using AI classification if keys are available)
async function handleCommand(text) {
  if (!text || typeof text !== 'string') {
    return { ok: false, action: 'none', message: 'Empty command' };
  }

  const apiKey = process.env.OPENROUTER_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    // If no AI keys configured, fallback directly to local processing
    return handleCommandLocal(text);
  }

  try {
    const aiResponse = await callAI(text);
    const result = JSON.parse(aiResponse);

    // Save in short-term memory history
    chatHistory.push({ role: 'user', content: text });
    chatHistory.push({ role: 'assistant', content: aiResponse });
    while (chatHistory.length > MAX_HISTORY * 2) {
      chatHistory.shift();
    }

    if (result.type === 'command') {
      const commandText = result.command || text;
      return handleCommandLocal(commandText);
    } else if (result.type === 'chat') {
      const reply = result.reply || 'Yes, sir.';
      return { ok: true, action: 'chat', reply, message: reply };
    }
  } catch (e) {
    console.error('AI Processing Error, falling back to local parsing:', e.message);
  }

  // Fallback to local parsing on any failure
  return handleCommandLocal(text);
}

// Local command parsing fallback
async function handleCommandLocal(text) {
  if (!text || typeof text !== 'string') {
    return { ok: false, action: 'none', message: 'Empty command' };
  }
  let t = text.trim().toLowerCase();

  // Strip trailing punctuation
  t = t.replace(/[.,?!]+$/, '').trim();

  // Normalize YouTube spelling/spacing variations
  t = t.replace(/\b(you\s+tube|youtbe|utube|u\s+tube)\b/g, 'youtube');

  // Initialize setup command
  if (/(?:initialize|initialise)\s+(?:my\s+)?setup/i.test(t) || t === 'setup my workspace' || t === 'initialize my workspace' || t === 'initialise my workspace') {
    return initializeSetup();
  }

  // Write in notepad intents
  let notepadWriteContent = null;
  if (/^write notepad:\s*([\s\S]*)$/i.test(t)) {
    const match = text.match(/^write notepad:\s*([\s\S]*)$/i);
    if (match) notepadWriteContent = match[1].trim();
  } else {
    let match = text.match(/^(?:open\s+)?notepad\s+(?:and\s+)?write\s*(?:that\s+|to\s+|saying\s+|:)?:?\s*(.*)$/i);
    if (match && match[1].trim()) {
      notepadWriteContent = match[1].trim();
    } else {
      match = text.match(/^write\s+(?:in|on|to)?\s*notepad\s*(?:that\s+|to\s+|saying\s+|:)?:?\s*(.*)$/i);
      if (match && match[1].trim()) {
        notepadWriteContent = match[1].trim();
      } else {
        match = text.match(/^write\s+(.+?)\s+(?:in|on|to)\s+notepad$/i);
        if (!match) {
          match = text.match(/^write\s+(.+?)\s*notepad$/i);
        }
        if (match && match[1].trim()) {
          notepadWriteContent = match[1].trim();
        } else {
          // Fallback parsing for: write email/note/message to someone: content
          match = text.match(/^(?:write\s+)?(?:an?\s+)?(email|note|message|draft|text)(?:\s+to\s+([a-zA-Z0-9 _-]+))?\s*(?:[:\-]|that\s+says|saying|to\s+say)?\s+(.+)$/i);
          if (match && match[3].trim()) {
            const cat = match[1].trim();
            const recipient = match[2] ? match[2].trim() : '';
            const msg = match[3].trim();
            if (recipient) {
              notepadWriteContent = `${cat.charAt(0).toUpperCase() + cat.slice(1)} to ${recipient}:\n\n${msg}`;
            } else {
              notepadWriteContent = `${cat.charAt(0).toUpperCase() + cat.slice(1)}:\n\n${msg}`;
            }
          }
        }
      }
    }
  }

  if (notepadWriteContent !== null) {
    if (notepadWriteContent === '') {
      return openApp('notepad');
    }
    return writeNotepad(notepadWriteContent);
  }

  // Play song intents
  let playMatch = null;
  if (t.startsWith('open youtube and play ')) {
    playMatch = t.substring('open youtube and play '.length).trim();
  } else if (t.startsWith('play the song ')) {
    playMatch = t.substring('play the song '.length).trim();
  } else if (t.startsWith('play song ')) {
    playMatch = t.substring('play song '.length).trim();
  } else if (t.startsWith('play ') && t.endsWith(' on youtube')) {
    playMatch = t.substring('play '.length, t.length - ' on youtube'.length).trim();
  } else if (t.startsWith('play ')) {
    const rest = t.substring('play '.length).trim();
    if (rest && rest !== 'youtube' && !rest.startsWith('on youtube') && !rest.startsWith('some music') && !rest.startsWith('music')) {
      playMatch = rest;
    } else if (rest === 'music' || rest === 'some music') {
      playMatch = 'relaxing music';
    }
  }

  if (playMatch) {
    return playSong(playMatch);
  }

  // YouTube intents
  let m = t.match(/^(?:open|search|play) (?:on )?youtube(?: for)?\s*(.*)$/);
  if (!m) m = t.match(/^(?:open|play)\s+(.*)\s+on\s+youtube$/);
  if (m) {
    const q = (m[1] || '').trim();
    return q ? openYouTube(q) : openUrl('https://www.youtube.com');
  }

  // Open <folder>
  m = t.match(/^open\s+(?:the\s+)?(downloads|documents|desktop|pictures|music|videos)(?:\s+folder)?\b/);
  if (m) return openFolder(m[1]);

  // Open browser
  if (/^open\s+(?:the\s+)?(?:default\s+)?browser$/i.test(t)) {
    return openUrl('https://www.bing.com');
  }

  // Explicit: open file <path>
  m = t.match(/^open (?:the )?file\s+(.+)$/i);
  if (m) {
    return openFile(m[1]);
  }

  // If looks like a path or file name with extension, try opening as file
  m = t.match(/^open\s+(.+)$/i);
  if (m) {
    const raw = (m[1] || '').trim();
    const url = ensureUrl(raw.replace(/^the\s+/, ''));
    const looksLikeFile = /[\\/]/.test(raw) || /\.[a-z0-9]{1,7}$/i.test(raw);
    if (!url && looksLikeFile) {
      const res = await openFile(raw);
      // If file exists or was not found, return the result (don't fall through to app open)
      if (res) return res;
    }
  }

  // Open specific app
  m = t.match(/^open ([a-z0-9 .+-]+)$/);
  if (m) {
    const what = m[1].trim();
    // If the thing looks like a URL/domain, open it in browser
    const url = ensureUrl(what.replace(/^the\s+/, ''));
    if (url) return openUrl(url);
    return openApp(what);
  }

  // Go to <domain>
  m = t.match(/^(?:go to|open) (.+)$/);
  if (m) {
    const target = m[1].trim();
    const url = ensureUrl(target);
    if (url) return openUrl(url);
  }

  // Search web
  m = t.match(/^(?:search (?:the )?web for|search for|google)\s+(.+)$/);
  if (m) return openGoogle(m[1]);

  // Fallback: if sentence contains a domain, open it
  const domain = t.match(/([a-z0-9.-]+\.[a-z]{2,})(?:\s|$)/i);
  if (domain) return openUrl(`https://${domain[1]}`);

  return { ok: false, action: 'unknown', message: `Didn't understand: ${text}` };
}

module.exports = { handleCommand };

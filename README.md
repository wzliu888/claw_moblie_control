# ClawPaw — Your Phone. Any AI. Any time.

Control your Android phone from any LLM (Claude, GPT, etc.) via the Model Context Protocol.
Take screenshots, tap, swipe, type — all from a conversation.

🌐 **[www.clawpaw.me](https://www.clawpaw.me)**

---

## How it works

```
LLM (Claude) → MCP Server → ClawPaw Backend → SSH Tunnel → ADB → Android Phone
```

The Android app maintains a persistent WebSocket + reverse SSH tunnel to the backend.
The MCP server translates LLM tool calls into ADB commands forwarded to your phone.

---

## Setup Guide

### Step 1 — Install the Android app

**Option A — Download APK (easiest)**

Download from [clawpaw.me](https://www.clawpaw.me) or directly:
```
https://dl.clawpaw.me/clawpaw-latest.apk
```
Transfer to your phone and install (enable "Install from unknown sources" if prompted).

**Option B — Build from source**
```bash
# Prerequisites: Android Studio, JDK 17+
git clone https://github.com/wzliu888/clawpaw_phone_control
cd android

# Copy and fill local.properties
cp local.properties.example local.properties
# Edit local.properties:
#   sdk.dir=/Users/<you>/Library/Android/sdk
#   WS_URL=wss://www.clawpaw.me

./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

---

### Step 2 — Connect the app

1. Open the **ClawPaw** app on your phone
2. Tap **Connect**
3. Wait for **Backend connection** and **SSH tunnel** to show as connected (green dot)
4. Note your **UID** and **Secret** shown on the main screen — you'll need them in Step 4

> **If SSH shows Disconnected:** Tap the **Retry** button next to the SSH tunnel status, or restart the app.

---

### Step 3 — Configure the MCP server

Build the MCP server:
```bash
cd mcp
npm install
npm run build
```

Add to your `~/.claude.json` (Claude Code) or equivalent MCP client config:
```json
{
  "mcpServers": {
    "clawpaw": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/clawpaw_phone_control/mcp/dist/index.js"],
      "env": {
        "CLAWPAW_BACKEND_URL": "https://www.clawpaw.me",
        "CLAWPAW_UID": "<UID>",
        "CLAWPAW_SECRET": "<SECRET>"
      }
    }
  }
}
```

Restart Claude Code. You should now see ClawPaw tools available.

---

### Step 4 — Start controlling your phone

Ask Claude anything:

> *"Take a screenshot of my phone"*
> *"Open WeChat and send 'on my way' to Mom"*
> *"What apps are on my home screen?"*
> *"Turn brightness to 50%"*

---

## Available MCP Tools

**UI & Input**

| Tool | Description |
|------|-------------|
| `screenshot` | Take a screenshot of the current screen (PNG) |
| `snapshot` | Get the full UI element tree — text, bounds, IDs, clickable state |
| `tap` | Tap by x/y coordinates, or find element by text / resourceId / contentDesc |
| `long_press` | Long press at a screen position |
| `swipe` | Swipe up/down/left/right, or by explicit start/end coordinates |
| `type_text` | Type text into the focused field (supports Chinese, emoji, all Unicode) |
| `press_key` | Press a key: home, back, enter, delete, power, volume_up/down, etc. |

**Apps**

| Tool | Description |
|------|-------------|
| `launch_app` | Launch an app by package name (e.g. `com.taobao.taobao`) |
| `list_apps` | List all installed user apps with package name and label |
| `shell` | Execute an arbitrary shell command on the device |

**Hardware**

| Tool | Description |
|------|-------------|
| `volume` | Get or set volume (media, ring, alarm, notification streams, 0–15) |
| `brightness` | Get or set screen brightness (0–255), or enable auto-brightness |
| `flashlight` | Toggle or get flashlight state |
| `vibrate` | Vibrate the device for a given duration |
| `media_control` | Control media playback: play, pause, next, previous, etc. |

**Device & Sensors**

| Tool | Description |
|------|-------------|
| `battery` | Get battery level, charging state, and temperature |
| `location` | Get current GPS coordinates (latitude, longitude, accuracy) |
| `network` | Get network status: WiFi SSID, mobile data, connection info |
| `storage` | Get storage usage (total, free, used) |
| `screen_state` | Check if screen is on/off and locked |
| `sensors` | Read accelerometer, gyroscope, magnetometer, and other sensors |

**Media**

| Tool | Description |
|------|-------------|
| `camera_snap` | Take a photo with the front or back camera (JPEG) |
| `audio_record` | Record audio from the microphone (capture, start, or stop) |
| `audio_status` | Check if audio recording is currently in progress |

---

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `SSH: Disconnected` | OS killed the background service | Battery settings → ClawPaw → No restrictions; lock app in recents |
| Screenshot is black | Screen is off | Send `press_key("wakeup")` first |
| App not connecting | Network issue | Tap the **Retry** button next to Backend connection, or restart the app |

---

## Repo Structure

```
clawpaw_phone_control/
├── android/          # Kotlin Android app (WsService, ADB bridge, SSH tunnel)
├── mcp/              # MCP server (stdio transport, 20+ tools)
└── web/
    ├── backend/      # Node.js + Express + WebSocket relay
    └── frontend/     # React landing page
```

---

## Contact

Questions or feedback: **ericshen.18888@gmail.com**

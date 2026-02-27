---
name: clawpaw-control
description: Execute user instructions on the phone via ClawPaw backend. Use when a user wants to do something on the phone — send a message, open an app, tap something, take a screenshot, etc.
tools: Bash
---

# ClawPaw Phone Control

Execute user instructions on the phone step by step using the ClawPaw backend API.

## Credentials

Read UID and Secret from environment or ask the user:
- `CLAWPAW_UID` — user's UID (e.g. `555914e7-fd98-4837-b346-ebb2b53929e7`)
- `CLAWPAW_SECRET` — user's secret (e.g. `clawpaw_7d7669...`)

Base URL: `https://www.clawpaw.me`

## Core Principle: Always Use UI Tree for Coordinates

**NEVER guess tap coordinates from a screenshot.**

Screenshots may be displayed at a different size than the actual device resolution. The UI tree (`snapshot`) returns `bounds` in real device pixels — always use those for taps.

Correct workflow for any tap:
1. Call `snapshot` to get the UI tree XML
2. Find the target element by `text`, `content-desc`, or `resource-id`
3. Compute center: `x = (left + right) / 2`, `y = (top + bottom) / 2`
4. Call `tap` with those exact coordinates

## API Reference

All requests: `POST https://www.clawpaw.me/api/adb/<action>`
Headers: `Content-Type: application/json`, `x-clawpaw-secret: <SECRET>`
Body always includes: `"uid": "<UID>"`

### screenshot
```bash
curl -sk -X POST https://www.clawpaw.me/api/adb/screenshot \
  -H "Content-Type: application/json" \
  -H "x-clawpaw-secret: <SECRET>" \
  -d '{"uid":"<UID>"}' | python3 -c "
import sys,json,base64
d=json.load(sys.stdin)
if d.get('success') and d.get('data',{}).get('data'):
    open('/tmp/phone_screen.png','wb').write(base64.b64decode(d['data']['data']))
    print('saved')
else:
    print('FAILED:', d)
"
```
Use to show the user what's on screen. Do NOT use to derive tap coordinates.

### snapshot (UI tree)
```bash
curl -sk -X POST https://www.clawpaw.me/api/adb/snapshot \
  -H "Content-Type: application/json" \
  -H "x-clawpaw-secret: <SECRET>" \
  -d '{"uid":"<UID>"}' | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(d['data'] if d.get('success') else d)
"
```
Parse `bounds="[left,top][right,bottom]"` to get precise coordinates.

### tap
```bash
curl -sk -X POST https://www.clawpaw.me/api/adb/tap \
  -H "Content-Type: application/json" \
  -H "x-clawpaw-secret: <SECRET>" \
  -d '{"uid":"<UID>","x":<X>,"y":<Y>}'
```

### press_key
```bash
curl -sk -X POST https://www.clawpaw.me/api/adb/press_key \
  -H "Content-Type: application/json" \
  -H "x-clawpaw-secret: <SECRET>" \
  -d '{"uid":"<UID>","key":"HOME"}'
```
Common keys: `HOME`, `BACK`, `WAKEUP`, `ENTER`, `VOLUME_UP`, `VOLUME_DOWN`

### type_text
```bash
curl -sk -X POST https://www.clawpaw.me/api/adb/type_text \
  -H "Content-Type: application/json" \
  -H "x-clawpaw-secret: <SECRET>" \
  -d '{"uid":"<UID>","text":"你好"}'
```
Supports Chinese and emoji (uses ADBKeyboard on device).

### shell
```bash
curl -sk -X POST https://www.clawpaw.me/api/adb/shell \
  -H "Content-Type: application/json" \
  -H "x-clawpaw-secret: <SECRET>" \
  -d '{"uid":"<UID>","command":"am start -a android.intent.action.VIEW -d https://example.com"}'
```
Run arbitrary adb shell commands. Use for launching intents, checking state, etc.

### swipe
```bash
curl -sk -X POST https://www.clawpaw.me/api/adb/swipe \
  -H "Content-Type: application/json" \
  -H "x-clawpaw-secret: <SECRET>" \
  -d '{"uid":"<UID>","x1":640,"y1":1800,"x2":640,"y2":800,"duration":300}'
```

## Standard Execution Loop

For any user task:

1. **Wake screen** (if needed)
   ```bash
   # press_key WAKEUP
   ```

2. **Take screenshot** — show the user what's on screen now

3. **Navigate** to the right app/screen using `shell am start` or `press_key HOME` + tap

4. **Use snapshot** to find element coordinates before every tap

5. **Act** — tap, type, swipe as needed

6. **Verify** — take screenshot after each major action to confirm it worked

7. **Repeat** until task is complete

## Common Patterns

### Open SMS and send a message
```bash
# 1. Open SMS composer
shell: am start -a android.intent.action.SENDTO -d sms:<PHONE> --es sms_body <TEXT> --ez exit_on_sent true

# 2. Get UI tree, find send button by content-desc="发送短信" or resource-id containing "send_button"
# bounds="[1114,2504][1242,2632]" → tap (1178, 2568)

# 3. Tap send button using exact coordinates from snapshot
```

### Open an app
```bash
# shell
am start -n <package>/<activity>
# or
monkey -p <package> -c android.intent.category.LAUNCHER 1
```

### Scroll down
```bash
# swipe from bottom to top
x1=640, y1=1800, x2=640, y2=800, duration=300
```

## Troubleshooting

| Error | Fix |
|-------|-----|
| `device not found` | Call `connect` endpoint first, then retry |
| `failed to authenticate` | Phone shows "Allow USB debugging?" dialog — tell user to tap Allow |
| Screenshot is black | Call `press_key WAKEUP` first |
| Tap has no effect | Use `snapshot` to get exact coordinates — never guess from screenshot |

import { execFile } from 'child_process';
import { promisify } from 'util';
import { SshCredentialRepository } from '../repositories/ssh_credential.repository';

const execFileAsync = promisify(execFile);

const repo = new SshCredentialRepository();

// adb device target: SSH_HOST_IP:<adbPort>
// SSH_HOST_IP defaults to 127.0.0.1 but must be set to the internal IP of the
// node running sshd when the backend pod runs on a different node.
const SSH_HOST_IP = process.env.SSH_HOST_IP ?? '127.0.0.1';

async function deviceTarget(uid: string): Promise<string> {
  const cred = await repo.findByUid(uid);
  if (!cred) throw new Error(`No SSH credentials for uid=${uid}`);
  return `${SSH_HOST_IP}:${cred.adb_port}`;
}

async function adb(uid: string, ...args: string[]): Promise<string> {
  const target = await deviceTarget(uid);
  // Ensure adb server is running and device is connected
  await execFileAsync('adb', ['connect', target]).catch(() => {});
  try {
    const { stdout, stderr } = await execFileAsync('adb', ['-s', target, ...args], { timeout: 15_000 });
    return (stdout + stderr).trim();
  } catch (e: any) {
    const detail = (e.stdout ?? '') + (e.stderr ?? '');
    throw new Error(`Command failed: adb -s ${target} ${args.join(' ')}\n${detail.trim()}`);
  }
}

export async function snapshot(uid: string): Promise<string> {
  await adb(uid, 'shell', 'uiautomator', 'dump', '/sdcard/ui.xml');
  return adb(uid, 'shell', 'cat', '/sdcard/ui.xml');
}

export async function tap(uid: string, x: number, y: number): Promise<string> {
  return adb(uid, 'shell', 'input', 'tap', String(x), String(y));
}

export async function longPress(uid: string, x: number, y: number, duration = 1000): Promise<string> {
  return adb(uid, 'shell', 'input', 'swipe', String(x), String(y), String(x), String(y), String(duration));
}

export async function swipe(
  uid: string,
  x1: number, y1: number,
  x2: number, y2: number,
  duration = 300,
): Promise<string> {
  return adb(uid, 'shell', 'input', 'swipe', String(x1), String(y1), String(x2), String(y2), String(duration));
}

export async function typeText(uid: string, text: string): Promise<{ typed: string; method: string }> {
  const hasNonAscii = /[^\x00-\x7F]/.test(text);
  if (hasNonAscii) {
    // Chinese / emoji — requires ADBKeyboard app on device
    const escaped = text.replace(/'/g, "'\\''");
    await adb(uid, 'shell', 'am', 'broadcast', '-a', 'ADB_INPUT_TEXT', '--es', 'msg', escaped);
    return { typed: text, method: 'adbkeyboard' };
  } else {
    // ASCII — escape shell-special chars and spaces
    const escaped = text
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\$/g, '\\$')
      .replace(/`/g, '\\`')
      .replace(/ /g, '%s');
    await adb(uid, 'shell', 'input', 'text', escaped);
    return { typed: text, method: 'input' };
  }
}

export async function pressKey(uid: string, key: string): Promise<string> {
  // Auto-uppercase and prefix KEYCODE_ if needed
  const upper = key.toUpperCase();
  const keycode = upper.startsWith('KEYCODE_') ? upper : `KEYCODE_${upper}`;
  return adb(uid, 'shell', 'input', 'keyevent', keycode);
}

export async function screenshot(uid: string): Promise<{ data: string; mimeType: string }> {
  await adb(uid, 'shell', 'screencap', '-p', '/sdcard/screen.png');
  const { stdout } = await execFileAsync(
    'adb', ['-s', await deviceTarget(uid), 'shell', 'base64', '/sdcard/screen.png'],
    { timeout: 15_000, maxBuffer: 20 * 1024 * 1024 },
  );
  return { data: stdout.replace(/\s/g, ''), mimeType: 'image/png' };
}

export async function shell(uid: string, command: string): Promise<string> {
  // Split command safely preserving quoted strings
  const parts = command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [];
  return adb(uid, 'shell', ...parts);
}

export async function launchApp(uid: string, pkg: string): Promise<string> {
  // monkey is more reliable than am start for launcher intents
  return adb(uid, 'shell', 'monkey', '-p', pkg, '-c', 'android.intent.category.LAUNCHER', '1');
}

export async function listApps(uid: string): Promise<Array<{ packageName: string; label: string }>> {
  const raw = await adb(uid, 'shell', 'pm', 'list', 'packages', '-3');
  const packages = raw
    .split('\n')
    .map(l => l.replace(/^package:/, '').trim())
    .filter(Boolean)
    .sort();

  // Fetch app labels in one dumpsys call — best effort, fall back to package name
  const labels: Array<{ packageName: string; label: string }> = [];
  for (const pkg of packages) {
    let label = pkg;
    try {
      const out = await adb(uid, 'shell', 'pm', 'dump', pkg);
      const m = out.match(/^\s+label=(.+)$/m);
      if (m) label = m[1].trim();
    } catch {
      // ignore — use package name as label
    }
    labels.push({ packageName: pkg, label });
  }
  return labels;
}

export async function getScreenSize(uid: string): Promise<{ width: number; height: number }> {
  const out = await adb(uid, 'shell', 'wm', 'size');
  // "Physical size: 1080x2400" or "Override size: ..."
  const m = out.match(/(\d+)x(\d+)/);
  if (!m) throw new Error(`Cannot parse screen size: ${out}`);
  return { width: parseInt(m[1]), height: parseInt(m[2]) };
}

export async function mediaControl(uid: string, action: string): Promise<string> {
  const keyMap: Record<string, string> = {
    play:     'KEYCODE_MEDIA_PLAY',
    pause:    'KEYCODE_MEDIA_PAUSE',
    toggle:   'KEYCODE_MEDIA_PLAY_PAUSE',
    next:     'KEYCODE_MEDIA_NEXT',
    previous: 'KEYCODE_MEDIA_PREVIOUS',
    stop:     'KEYCODE_MEDIA_STOP',
  };
  const keycode = keyMap[action];
  if (!keycode) throw new Error(`Unknown media action: ${action}. Use: play, pause, toggle, next, previous, stop`);
  return adb(uid, 'shell', 'input', 'keyevent', keycode);
}

export async function connect(uid: string): Promise<string> {
  const target = await deviceTarget(uid);
  const { stdout, stderr } = await execFileAsync('adb', ['connect', target], { timeout: 10_000 });
  return (stdout + stderr).trim();
}

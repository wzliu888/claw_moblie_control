import { execFile } from 'child_process';
import { promisify } from 'util';
import { SshCredentialRepository, activePort } from '../repositories/ssh_credential.repository';
import { forwardRpc } from '../ws/wsServer';

const execFileAsync = promisify(execFile);

const repo = new SshCredentialRepository();

// adb device target: SSH_HOST_IP:<adbPort>
// SSH_HOST_IP defaults to 127.0.0.1 but must be set to the internal IP of the
// node running sshd when the backend pod runs on a different node.
const SSH_HOST_IP = process.env.SSH_HOST_IP ?? '127.0.0.1';

async function deviceTarget(uid: string): Promise<string> {
  const cred = await repo.findByUid(uid);
  if (!cred) throw new Error(`No SSH credentials for uid=${uid}`);
  return `${SSH_HOST_IP}:${activePort(cred)}`;
}

async function reconnect(uid: string, target: string): Promise<void> {
  console.log(`[adb] reconnecting target=${target}`);
  try {
    const { stdout: dcOut } = await execFileAsync('adb', ['disconnect', target], { timeout: 60_000 });
    console.log(`[adb] disconnect → ${dcOut.trim()}`);
  } catch (e: any) {
    console.warn(`[adb] disconnect failed: ${e.message}`);
  }
  try {
    const { stdout: connOut } = await execFileAsync('adb', ['connect', target], { timeout: 60_000 });
    const out = connOut.trim();
    console.log(`[adb] connect → ${out}`);
    // If adb connect succeeded, we're done
    if (!out.includes('failed') && !out.includes('offline')) return;
  } catch (e: any) {
    console.warn(`[adb] connect failed: ${e.stderr?.trim() || e.message} — asking phone to rebuild SSH tunnel`);
  }

  // adb connect failed → SSH tunnel is down. Ask the phone (via WS) to reconnect.
  console.log(`[adb] triggering SSH tunnel rebuild for uid=${uid}`);
  await forwardRpc(uid, 'reconnect_ssh', {});

  // Give the phone time to re-establish the tunnel before retrying adb connect
  await new Promise(r => setTimeout(r, 8_000));

  try {
    const { stdout } = await execFileAsync('adb', ['connect', target], { timeout: 60_000 });
    console.log(`[adb] connect after SSH rebuild → ${stdout.trim()}`);
  } catch (e: any) {
    console.error(`[adb] connect still FAILED after SSH rebuild: ${e.stderr?.trim() || e.message}`);
  }
}

async function adb(uid: string, ...args: string[]): Promise<string> {
  const target = await deviceTarget(uid);
  const cmd = `adb -s ${target} ${args.join(' ')}`;
  const t0 = Date.now();

  const run = () => execFileAsync('adb', ['-s', target, ...args], { timeout: 60_000 });

  try {
    const { stdout, stderr } = await run();
    console.log(`[adb] ${cmd} → ok (${Date.now() - t0}ms)`);
    if (stderr.trim()) console.warn(`[adb] stderr: ${stderr.trim()}`);
    return (stdout + stderr).trim();
  } catch (e: any) {
    const elapsed = Date.now() - t0;
    const stdout = (e.stdout ?? '').trim();
    const stderr = (e.stderr ?? '').trim();
    const detail = [stdout, stderr].filter(Boolean).join('\n');
    console.warn(`[adb] ${cmd} → failed (${elapsed}ms) code=${e.code} signal=${e.signal}${detail ? '\n' + detail : ''} — reconnecting`);

    // Reconnect and retry once
    await reconnect(uid, target);
    try {
      const { stdout: s2, stderr: e2 } = await run();
      console.log(`[adb] ${cmd} → ok after reconnect (${Date.now() - t0}ms)`);
      if (e2.trim()) console.warn(`[adb] stderr: ${e2.trim()}`);
      return (s2 + e2).trim();
    } catch (e2: any) {
      const s = (e2.stdout ?? '').trim();
      const se = (e2.stderr ?? '').trim();
      const d2 = [s, se].filter(Boolean).join('\n');
      console.error(`[adb] ${cmd} → FAILED after reconnect (${Date.now() - t0}ms) code=${e2.code} signal=${e2.signal}`);
      if (d2) console.error(`[adb] output: ${d2}`);
      throw new Error(`Command failed: adb -s ${target} ${args.join(' ')}\n${d2 || '(no output)'}`);
    }
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
  const target = await deviceTarget(uid);
  console.log(`[screenshot] uid=${uid} target=${target}`);

  const run = () => execFileAsync(
    'adb', ['-s', target, 'exec-out', 'screencap', '-p'],
    { timeout: 60_000, maxBuffer: 20 * 1024 * 1024, encoding: 'buffer' } as any,
  );

  const attempt = async (label: string) => {
    const { stdout } = await run();
    const buf = stdout as unknown as Buffer;
    console.log(`[screenshot] success${label} bytes=${buf.length}`);
    return { data: buf.toString('base64'), mimeType: 'image/png' };
  };

  try {
    return await attempt('');
  } catch (e: any) {
    console.warn(`[screenshot] failed code=${e.code} signal=${e.signal} — reconnecting`);
    await reconnect(uid, target);
    try {
      return await attempt(' (after reconnect)');
    } catch (e2: any) {
      console.error(`[screenshot] FAILED after reconnect: code=${e2.code} signal=${e2.signal}`);
      throw new Error(`screenshot failed: ${String(e2.stderr ?? e2.stdout ?? e2.message ?? e2).slice(0, 500)}`);
    }
  }
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
  const { stdout, stderr } = await execFileAsync('adb', ['connect', target], { timeout: 60_000 });
  return (stdout + stderr).trim();
}

export async function releaseTunnel(uid: string): Promise<{ newPort: number }> {
  const cred = await repo.findByUid(uid);
  if (!cred) throw new Error(`No SSH credentials for uid=${uid}`);
  const oldPort = activePort(cred);
  const target = `${SSH_HOST_IP}:${oldPort}`;
  console.log(`[releaseTunnel] uid=${uid} oldPort=${oldPort} slot=${cred.adb_port_slot}`);

  // 1. adb disconnect so the backend releases its adb connection on the old port
  try {
    const { stdout, stderr } = await execFileAsync('adb', ['disconnect', target], { timeout: 10_000 });
    console.log(`[releaseTunnel] adb disconnect → ${(stdout + stderr).trim()}`);
  } catch (e: any) {
    console.warn(`[releaseTunnel] adb disconnect failed: ${e.message}`);
  }

  // 2. Flip slot in DB — the new activePort is on the other slot, guaranteed free
  const updated = await repo.flipSlot(uid);
  const newPort = activePort(updated);
  console.log(`[releaseTunnel] slot flipped → newPort=${newPort}`);

  return { newPort };
}

export async function openUrl(uid: string, url: string): Promise<string> {
  return adb(uid, 'shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', url);
}

export async function sendSms(uid: string, phone: string, body: string): Promise<string> {
  // Opens SMS composer with pre-filled recipient and body
  return adb(uid, 'shell', 'am', 'start',
    '-a', 'android.intent.action.SENDTO',
    '-d', `sms:${phone}`,
    '--es', 'sms_body', body,
    '--ez', 'exit_on_sent', 'true',
  );
}

export async function call(uid: string, phone: string): Promise<string> {
  return adb(uid, 'shell', 'am', 'start', '-a', 'android.intent.action.CALL', '-d', `tel:${phone}`);
}

export async function screenOn(uid: string): Promise<string> {
  // Wake up then dismiss keyguard
  await adb(uid, 'shell', 'input', 'keyevent', 'KEYCODE_WAKEUP');
  await adb(uid, 'shell', 'input', 'keyevent', 'KEYCODE_MENU');
  return 'screen on';
}

export async function screenOff(uid: string): Promise<string> {
  return adb(uid, 'shell', 'input', 'keyevent', 'KEYCODE_SLEEP');
}

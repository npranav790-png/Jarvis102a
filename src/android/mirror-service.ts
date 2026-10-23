import { exec, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { rootLogger } from '../logging/logger.js';

const execAsync = promisify(exec);
const logger = rootLogger.child('AndroidMirrorService');

export interface AndroidDevice {
  id: string;
  state: 'device' | 'unauthorized' | 'offline' | 'unknown';
  model: string;
  product?: string;
  androidVersion?: string;
  isWireless: boolean;
}

export class AndroidMirrorService {
  private adbPath: string;
  private scrcpyPath: string;
  private activeScrcpyProcess: any = null;

  constructor() {
    this.adbPath = this.resolveAdbPath();
    this.scrcpyPath = this.resolveScrcpyPath();
    logger.info(`AndroidMirrorService initialized (adb: ${this.adbPath}, scrcpy: ${this.scrcpyPath})`);
  }

  private resolveAdbPath(): string {
    const candidates = [
      'C:\\Users\\TUF\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Genymobile.scrcpy_Microsoft.Winget.Source_8wekyb3d8bbwe\\scrcpy-win64-v4.1\\adb.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk', 'platform-tools', 'adb.exe'),
      'adb',
    ];
    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) return p;
      } catch {}
    }
    return 'adb';
  }

  private resolveScrcpyPath(): string {
    const candidates = [
      'C:\\Users\\TUF\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Genymobile.scrcpy_Microsoft.Winget.Source_8wekyb3d8bbwe\\scrcpy-win64-v4.1\\scrcpy.exe',
      'scrcpy',
    ];
    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) return p;
      } catch {}
    }
    return 'scrcpy';
  }

  public getEnvironmentStatus(): { adbAvailable: boolean; scrcpyAvailable: boolean; adbPath: string; scrcpyPath: string } {
    const adbAvailable = fs.existsSync(this.adbPath);
    const scrcpyAvailable = fs.existsSync(this.scrcpyPath);
    return { adbAvailable, scrcpyAvailable, adbPath: this.adbPath, scrcpyPath: this.scrcpyPath };
  }

  public async listDevices(): Promise<AndroidDevice[]> {
    try {
      const { stdout } = await execAsync(`"${this.adbPath}" devices -l`);
      const lines = stdout.split('\n');
      const devices: AndroidDevice[] = [];

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('List of devices attached')) continue;

        const parts = trimmed.split(/\s+/);
        if (parts.length < 2) continue;

        const id = parts[0];
        const stateStr = parts[1];
        let state: AndroidDevice['state'] = 'unknown';
        if (stateStr === 'device') state = 'device';
        else if (stateStr === 'unauthorized') state = 'unauthorized';
        else if (stateStr === 'offline') state = 'offline';

        const modelMatch = trimmed.match(/model:(\S+)/);
        const productMatch = trimmed.match(/product:(\S+)/);

        let model = modelMatch ? modelMatch[1].replace(/_/g, ' ') : id;
        let androidVersion: string | undefined = undefined;

        if (state === 'device') {
          try {
            const { stdout: propModel } = await execAsync(`"${this.adbPath}" -s ${id} shell getprop ro.product.model`, { timeout: 2000 });
            if (propModel.trim()) model = propModel.trim();

            const { stdout: propVer } = await execAsync(`"${this.adbPath}" -s ${id} shell getprop ro.build.version.release`, { timeout: 2000 });
            if (propVer.trim()) androidVersion = `Android ${propVer.trim()}`;
          } catch {}
        }

        devices.push({
          id,
          state,
          model,
          product: productMatch ? productMatch[1] : undefined,
          androidVersion,
          isWireless: id.includes(':'),
        });
      }

      return devices;
    } catch (err) {
      logger.error('Failed to list ADB devices', undefined, err instanceof Error ? err : new Error(String(err)));
      return [];
    }
  }

  public async connectWifi(ip: string, port = 5555): Promise<{ success: boolean; message: string }> {
    try {
      const target = ip.includes(':') ? ip : `${ip}:${port}`;
      const { stdout, stderr } = await execAsync(`"${this.adbPath}" connect ${target}`, { timeout: 8000 });
      const output = (stdout + ' ' + stderr).trim();
      const success = output.toLowerCase().includes('connected to') && !output.toLowerCase().includes('cannot connect');
      return { success, message: output };
    } catch (err: any) {
      return { success: false, message: err.message || 'Connection failed' };
    }
  }

  public async enableWireless(serial?: string): Promise<{ success: boolean; port: number; ip?: string; message: string }> {
    try {
      const serialArg = serial ? `-s ${serial}` : '';
      await execAsync(`"${this.adbPath}" ${serialArg} tcpip 5555`, { timeout: 5000 });

      let ip: string | undefined = undefined;
      try {
        const { stdout } = await execAsync(`"${this.adbPath}" ${serialArg} shell ip route`, { timeout: 3000 });
        const ipMatch = stdout.match(/src\s+(\d+\.\d+\.\d+\.\d+)/);
        if (ipMatch) ip = ipMatch[1];
      } catch {}

      return {
        success: true,
        port: 5555,
        ip,
        message: ip
          ? `Port 5555 opened. Device IP: ${ip}. You can now unplug USB and connect wirelessly.`
          : 'Port 5555 opened. Connect using your phone Wi-Fi IP in Settings > About Phone > Status.',
      };
    } catch (err: any) {
      return { success: false, port: 5555, message: err.message || 'Failed to switch to tcpip mode' };
    }
  }

  public async launchMirror(options: {
    serial?: string;
    fullscreen?: boolean;
    stayAwake?: boolean;
    turnScreenOff?: boolean;
    noAudio?: boolean;
  } = {}): Promise<{ success: boolean; message: string }> {
    if (!fs.existsSync(this.scrcpyPath)) {
      throw new Error(`scrcpy executable not found at ${this.scrcpyPath}`);
    }

    // Terminate existing mirror cleanly before launching a new one
    if (this.activeScrcpyProcess && !this.activeScrcpyProcess.killed) {
      try {
        this.activeScrcpyProcess.kill();
      } catch {}
      this.activeScrcpyProcess = null;
    }

    const args: string[] = [];
    if (options.serial) {
      args.push('-s', options.serial);
    }
    if (options.fullscreen) {
      args.push('--fullscreen');
    }
    if (options.stayAwake !== false) {
      args.push('--stay-awake');
    }
    if (options.turnScreenOff) {
      args.push('--turn-screen-off');
    }
    if (options.noAudio) {
      args.push('--no-audio');
    }

    if (!options.fullscreen) {
      args.push('--always-on-top');
    }

    args.push('--window-title=JARVIS Holographic Android Uplink');

    const scrcpyDir = path.dirname(this.scrcpyPath);
    const adbDir = path.dirname(this.adbPath);

    logger.info(`Launching scrcpy with args: ${args.join(' ')}`);

    try {
      const child = spawn(this.scrcpyPath, args, {
        cwd: scrcpyDir,
        env: {
          ...process.env,
          PATH: `${scrcpyDir};${adbDir};${process.env.PATH || ''}`,
        },
        stdio: 'ignore',
      });

      child.on('exit', (code) => {
        logger.info(`scrcpy process exited with code ${code}`);
        if (this.activeScrcpyProcess === child) {
          this.activeScrcpyProcess = null;
        }
      });

      this.activeScrcpyProcess = child;

      return {
        success: true,
        message: options.fullscreen
          ? 'Holographic Fullscreen Mirror activated.'
          : 'Holographic Desktop Window activated.',
      };
    } catch (err: any) {
      logger.error('Failed to spawn scrcpy', undefined, err);
      throw new Error(`Failed to launch scrcpy: ${err.message}`);
    }
  }

  public async sendKeyEvent(key: string, serial?: string): Promise<{ success: boolean; message: string }> {
    const keyMap: Record<string, number> = {
      HOME: 3,
      BACK: 4,
      APP_SWITCH: 187,
      POWER: 26,
      WAKE: 224,
      VOLUME_UP: 24,
      VOLUME_DOWN: 25,
      MUTE: 164,
      ENTER: 66,
      ESCAPE: 111,
    };

    const serialArg = serial ? `-s ${serial}` : '';

    if (key === 'NOTIFICATION') {
      await execAsync(`"${this.adbPath}" ${serialArg} shell cmd statusbar expand-notifications`);
      return { success: true, message: 'Expanded notification shade' };
    }

    const keyCode = keyMap[key.toUpperCase()];
    if (!keyCode) {
      throw new Error(`Unknown key event: ${key}`);
    }

    await execAsync(`"${this.adbPath}" ${serialArg} shell input keyevent ${keyCode}`);
    return { success: true, message: `Dispatched keyevent ${key} (${keyCode})` };
  }

  public async sendText(text: string, serial?: string): Promise<{ success: boolean; message: string }> {
    const serialArg = serial ? `-s ${serial}` : '';
    const escaped = text.replace(/([\\'"`$*!#&?|;()<>~^])/g, '\\$1').replace(/ /g, '%s');
    await execAsync(`"${this.adbPath}" ${serialArg} shell input text "${escaped}"`);
    return { success: true, message: `Typed: "${text}"` };
  }

  public async launchApp(packageName: string, serial?: string): Promise<{ success: boolean; message: string }> {
    const serialArg = serial ? `-s ${serial}` : '';
    const aliases: Record<string, string> = {
      YOUTUBE: 'com.google.android.youtube',
      WHATSAPP: 'com.whatsapp',
      CHROME: 'com.android.chrome',
      SETTINGS: 'com.android.settings',
      CAMERA: 'com.google.android.GoogleCamera',
      MAPS: 'com.google.android.apps.maps',
      SPOTIFY: 'com.spotify.music',
      GMAIL: 'com.google.android.gm',
      PLAYSTORE: 'com.android.vending',
    };

    const targetPkg = aliases[packageName.trim().toUpperCase()] || packageName.trim();

    try {
      const { stdout } = await execAsync(
        `"${this.adbPath}" ${serialArg} shell monkey -p ${targetPkg} -c android.intent.category.LAUNCHER 1`
      );
      return { success: true, message: `Launched ${targetPkg}` };
    } catch {
      try {
        await execAsync(`"${this.adbPath}" ${serialArg} shell monkey -p ${targetPkg} 1`);
        return { success: true, message: `Launched ${targetPkg}` };
      } catch {
        return {
          success: false,
          message: `Package "${targetPkg}" could not be launched. Please ensure the app is installed.`,
        };
      }
    }
  }

  public async captureScreenshot(serial?: string): Promise<string> {
    const serialArg = serial ? `-s ${serial}` : '';
    const tempPath = path.join(process.env.TEMP || '', `jarvis_phone_${Date.now()}.png`);
    try {
      await execAsync(`"${this.adbPath}" ${serialArg} shell screencap -p /sdcard/jarvis_screen.png`);
      await execAsync(`"${this.adbPath}" ${serialArg} pull /sdcard/jarvis_screen.png "${tempPath}"`);
      const buffer = fs.readFileSync(tempPath);
      const base64 = buffer.toString('base64');
      fs.unlinkSync(tempPath);
      return `data:image/png;base64,${base64}`;
    } catch (err: any) {
      try {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      } catch {}
      throw new Error(`Screenshot capture failed: ${err.message}`);
    }
  }

  public async getDeviceTelemetry(serial?: string): Promise<{
    batteryLevel?: number;
    isCharging?: boolean;
    temperatureCelsius?: number;
    wifiIp?: string;
    model?: string;
    androidVersion?: string;
  }> {
    const serialArg = serial ? `-s ${serial}` : '';
    let batteryLevel: number | undefined;
    let isCharging: boolean | undefined;
    let temperatureCelsius: number | undefined;
    let wifiIp: string | undefined;
    let model: string | undefined;
    let androidVersion: string | undefined;

    try {
      const { stdout: battOut } = await execAsync(`"${this.adbPath}" ${serialArg} shell dumpsys battery`, { timeout: 3000 });
      const levelMatch = battOut.match(/level:\s*(\d+)/i);
      if (levelMatch) batteryLevel = parseInt(levelMatch[1], 10);

      const statusMatch = battOut.match(/status:\s*(\d+)/i);
      if (statusMatch) {
        const statusVal = parseInt(statusMatch[1], 10);
        isCharging = statusVal === 2 || statusVal === 5;
      }

      const tempMatch = battOut.match(/temperature:\s*(\d+)/i);
      if (tempMatch) temperatureCelsius = Math.round(parseInt(tempMatch[1], 10) / 10);
    } catch {}

    try {
      const { stdout: ipOut } = await execAsync(`"${this.adbPath}" ${serialArg} shell ip route`, { timeout: 3000 });
      const ipMatch = ipOut.match(/src\s+(\d+\.\d+\.\d+\.\d+)/);
      if (ipMatch) wifiIp = ipMatch[1];
    } catch {}

    try {
      const { stdout: modelOut } = await execAsync(`"${this.adbPath}" ${serialArg} shell getprop ro.product.model`, { timeout: 2000 });
      if (modelOut.trim()) model = modelOut.trim();

      const { stdout: verOut } = await execAsync(`"${this.adbPath}" ${serialArg} shell getprop ro.build.version.release`, { timeout: 2000 });
      if (verOut.trim()) androidVersion = `Android ${verOut.trim()}`;
    } catch {}

    return { batteryLevel, isCharging, temperatureCelsius, wifiIp, model, androidVersion };
  }

  public async getNotifications(serial?: string): Promise<Array<{
    id: string;
    pkg: string;
    title?: string;
    text?: string;
    timestamp?: string;
  }>> {
    const serialArg = serial ? `-s ${serial}` : '';
    try {
      const { stdout } = await execAsync(`"${this.adbPath}" ${serialArg} shell dumpsys notification --noredact`, { timeout: 5000 });
      const notifications: Array<{ id: string; pkg: string; title?: string; text?: string; timestamp?: string }> = [];

      const recordMatches = stdout.split(/NotificationRecord\(/g);
      for (let i = 1; i < Math.min(recordMatches.length, 12); i++) {
        const block = recordMatches[i];
        const pkgMatch = block.match(/pkg=([^\s]+)/);
        const titleMatch = block.match(/android\.title=(?:String\s*\(([^)]+)\)|([^,\n]+))/);
        const textMatch = block.match(/android\.text=(?:String\s*\(([^)]+)\)|([^,\n]+))/);

        const pkg = pkgMatch ? pkgMatch[1] : 'android.system';
        if (pkg.includes('com.android.systemui') && !textMatch) continue;

        const title = titleMatch ? (titleMatch[1] || titleMatch[2] || '').trim() : undefined;
        const text = textMatch ? (textMatch[1] || textMatch[2] || '').trim() : undefined;

        if (title || text) {
          notifications.push({
            id: `notif_${i}_${Date.now()}`,
            pkg,
            title,
            text,
            timestamp: new Date().toLocaleTimeString(),
          });
        }
      }

      return notifications;
    } catch {
      return [];
    }
  }

  public async telephonyCall(phoneNumber: string, serial?: string): Promise<{ success: boolean; message: string }> {
    const serialArg = serial ? `-s ${serial}` : '';
    const cleanNumber = phoneNumber.replace(/[^0-9+]/g, '');
    try {
      await execAsync(`"${this.adbPath}" ${serialArg} shell am start -a android.intent.action.DIAL -d "tel:${cleanNumber}"`);
      return { success: true, message: `Dispatched call dialer to ${cleanNumber}` };
    } catch (err: any) {
      return { success: false, message: `Failed to initiate call: ${err.message}` };
    }
  }

  public async telephonySms(phoneNumber: string, message: string, serial?: string): Promise<{ success: boolean; message: string }> {
    const serialArg = serial ? `-s ${serial}` : '';
    const cleanNumber = phoneNumber.replace(/[^0-9+]/g, '');
    const cleanMsg = message.replace(/"/g, '\\"');
    try {
      await execAsync(`"${this.adbPath}" ${serialArg} shell am start -a android.intent.action.SENDTO -d "sms:${cleanNumber}" --es sms_body "${cleanMsg}"`);
      return { success: true, message: `Prepared SMS to ${cleanNumber}` };
    } catch (err: any) {
      return { success: false, message: `Failed to send SMS: ${err.message}` };
    }
  }
}

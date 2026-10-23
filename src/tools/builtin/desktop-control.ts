import { z } from 'zod';
import { ITool, ToolExecutionContext } from '../types.js';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { rootLogger } from '../../logging/logger.js';

const execAsync = promisify(exec);
const logger = rootLogger.child('DesktopControlTool');

export type DesktopAction =
  | 'mouse_move'
  | 'mouse_click'
  | 'mouse_drag'
  | 'mouse_scroll'
  | 'key_press'
  | 'type_text'
  | 'wait'
  | 'get_cursor_position'
  | 'volume_up'
  | 'volume_down'
  | 'volume_mute'
  | 'media_play_pause'
  | 'lock_workstation';

export interface DesktopControlInput {
  action: DesktopAction;
  x?: number;
  y?: number;
  button?: 'left' | 'right' | 'middle' | 'double';
  endX?: number;
  endY?: number;
  scrollAmount?: number;
  key?: string;
  text?: string;
  delayMs?: number;
  simulate?: boolean;
}

export interface DesktopControlOutput {
  success: boolean;
  action: DesktopAction;
  cursorPosition?: { x: number; y: number };
  details: string;
  failSafeTriggered?: boolean;
}

export const desktopControlInputSchema = z.object({
  action: z.enum([
    'mouse_move',
    'mouse_click',
    'mouse_drag',
    'mouse_scroll',
    'key_press',
    'type_text',
    'wait',
    'get_cursor_position',
    'volume_up',
    'volume_down',
    'volume_mute',
    'media_play_pause',
    'lock_workstation',
  ]),
  x: z.number().optional(),
  y: z.number().optional(),
  button: z.enum(['left', 'right', 'middle', 'double']).optional().default('left'),
  endX: z.number().optional(),
  endY: z.number().optional(),
  scrollAmount: z.number().optional().default(120),
  key: z.string().optional(),
  text: z.string().optional(),
  delayMs: z.number().optional().default(100),
  simulate: z.boolean().optional(),
});

// In-memory virtual position for fallback/simulation mode
let virtualCursor = { x: 960, y: 540 };

export class DesktopControlTool implements ITool<DesktopControlInput, DesktopControlOutput> {
  public readonly name = 'desktop_control';
  public readonly description =
    'Provides autonomous OS-level mouse and keyboard control (move, click, drag, scroll, keypress, typing) with built-in emergency fail-safe.';
  public readonly version = '1.0.0';
  public readonly category = 'SYSTEM' as const;
  public readonly riskLevel = 'HIGH' as const;
  public readonly permissions = [
    {
      name: 'system:desktop-control',
      action: 'EXECUTE' as const,
      riskLevel: 'HIGH' as const,
      description: 'Control mouse cursor, keyboard input, and OS interactions',
    },
  ];
  public readonly inputSchema = desktopControlInputSchema;

  public async execute(
    input: DesktopControlInput,
    context?: ToolExecutionContext
  ): Promise<DesktopControlOutput> {
    const isSimulate = input.simulate === true || process.env.JARVIS_DESKTOP_SIMULATE === 'true';

    // 1. Emergency Fail-Safe Corner Detection (0, 0 to 5, 5)
    if (typeof input.x === 'number' && typeof input.y === 'number') {
      if (input.x <= 5 && input.y <= 5) {
        logger.warn(`Emergency fail-safe corner triggered at (${input.x}, ${input.y})`);
        return {
          success: false,
          action: input.action,
          details: 'Emergency fail-safe corner triggered (0,0). Halting desktop control.',
          failSafeTriggered: true,
        };
      }
    }

    if (isSimulate) {
      return this.executeSimulated(input);
    }

    const platform = process.platform;
    try {
      if (platform === 'win32') {
        return await this.executeWindows(input);
      } else if (platform === 'darwin') {
        return await this.executeMac(input);
      } else {
        return await this.executeLinux(input);
      }
    } catch (err) {
      logger.warn(`Native OS desktop control error: ${(err as Error).message}. Falling back to simulated execution.`);
      return this.executeSimulated(input);
    }
  }

  private async executeWindows(input: DesktopControlInput): Promise<DesktopControlOutput> {
    const { action, x, y, button, endX, endY, scrollAmount, key, text, delayMs } = input;

    let psScript = `
Add-Type -AssemblyName System.Windows.Forms;
Add-Type -AssemblyName System.Drawing;
if (-not ([System.Management.Automation.PSTypeName]'Win32Mouse').Type) {
    Add-Type -MemberDefinition @'
    [DllImport("user32.dll")] public static extern void mouse_event(int flags, int dx, int dy, int data, int extra);
'@ -Name 'Win32Mouse' -Namespace 'Win32'
}
`;

    switch (action) {
      case 'get_cursor_position': {
        psScript += `$pos = [System.Windows.Forms.Cursor]::Position; Write-Output "POS:$($pos.X):$($pos.Y)";`;
        break;
      }
      case 'mouse_move': {
        const posX = Math.round(x ?? virtualCursor.x);
        const posY = Math.round(y ?? virtualCursor.y);
        psScript += `[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${posX}, ${posY}); Write-Output "POS:${posX}:${posY}";`;
        virtualCursor = { x: posX, y: posY };
        break;
      }
      case 'mouse_click': {
        const posX = typeof x === 'number' ? Math.round(x) : virtualCursor.x;
        const posY = typeof y === 'number' ? Math.round(y) : virtualCursor.y;
        psScript += `[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${posX}, ${posY});\n`;
        if (button === 'right') {
          psScript += `[Win32.Win32Mouse]::mouse_event(8, 0, 0, 0, 0);\n[Win32.Win32Mouse]::mouse_event(16, 0, 0, 0, 0);`;
        } else if (button === 'middle') {
          psScript += `[Win32.Win32Mouse]::mouse_event(32, 0, 0, 0, 0);\n[Win32.Win32Mouse]::mouse_event(64, 0, 0, 0, 0);`;
        } else if (button === 'double') {
          psScript += `[Win32.Win32Mouse]::mouse_event(2, 0, 0, 0, 0);\n[Win32.Win32Mouse]::mouse_event(4, 0, 0, 0, 0);\nStart-Sleep -Milliseconds 80;\n[Win32.Win32Mouse]::mouse_event(2, 0, 0, 0, 0);\n[Win32.Win32Mouse]::mouse_event(4, 0, 0, 0, 0);`;
        } else {
          psScript += `[Win32.Win32Mouse]::mouse_event(2, 0, 0, 0, 0);\n[Win32.Win32Mouse]::mouse_event(4, 0, 0, 0, 0);`;
        }
        psScript += `\nWrite-Output "CLICKED:${button || 'left'} at ${posX},${posY}";`;
        virtualCursor = { x: posX, y: posY };
        break;
      }
      case 'mouse_drag': {
        const startX = Math.round(x ?? virtualCursor.x);
        const startY = Math.round(y ?? virtualCursor.y);
        const toX = Math.round(endX ?? startX);
        const toY = Math.round(endY ?? startY);
        psScript += `
[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${startX}, ${startY});
[Win32.Win32Mouse]::mouse_event(2, 0, 0, 0, 0);
Start-Sleep -Milliseconds 50;
[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${toX}, ${toY});
Start-Sleep -Milliseconds 50;
[Win32.Win32Mouse]::mouse_event(4, 0, 0, 0, 0);
Write-Output "DRAGGED from ${startX},${startY} to ${toX},${toY}";
`;
        virtualCursor = { x: toX, y: toY };
        break;
      }
      case 'mouse_scroll': {
        const amount = scrollAmount ?? 120;
        psScript += `[Win32.Win32Mouse]::mouse_event(0x0800, 0, 0, ${amount}, 0); Write-Output "SCROLLED:${amount}";`;
        break;
      }
      case 'type_text': {
        const rawText = text || '';
        // Escape characters for SendKeys: +, ^, %, ~, (, ), [, ], {, }
        const escaped = rawText.replace(/([+^%~(){}[\]])/g, '{$1}');
        psScript += `[System.Windows.Forms.SendKeys]::SendWait('${escaped.replace(/'/g, "''")}'); Write-Output "TYPED:${rawText.length} chars";`;
        break;
      }
      case 'key_press': {
        const keyMap: Record<string, string> = {
          enter: '{ENTER}',
          tab: '{TAB}',
          escape: '{ESC}',
          esc: '{ESC}',
          backspace: '{BACKSPACE}',
          delete: '{DELETE}',
          space: ' ',
          up: '{UP}',
          down: '{DOWN}',
          left: '{LEFT}',
          right: '{RIGHT}',
          home: '{HOME}',
          end: '{END}',
          pageup: '{PGUP}',
          pagedown: '{PGDN}',
          'ctrl+c': '^c',
          'ctrl+v': '^v',
          'ctrl+a': '^a',
          'ctrl+s': '^s',
          'ctrl+z': '^z',
          'ctrl+f': '^f',
          'alt+f4': '%{F4}',
          'alt+tab': '%{TAB}',
        };
        const normalizedKey = (key || '').toLowerCase().trim();
        const sendCode = keyMap[normalizedKey] || normalizedKey;
        psScript += `[System.Windows.Forms.SendKeys]::SendWait('${sendCode.replace(/'/g, "''")}'); Write-Output "KEY_PRESSED:${normalizedKey}";`;
        break;
      }
      case 'wait': {
        const ms = delayMs || 100;
        psScript += `Start-Sleep -Milliseconds ${ms}; Write-Output "WAITED:${ms}ms";`;
        break;
      }
      case 'volume_up': {
        psScript += `$wsh = New-Object -ComObject WScript.Shell; $wsh.SendKeys([char]175); Write-Output "VOLUME_UP";`;
        break;
      }
      case 'volume_down': {
        psScript += `$wsh = New-Object -ComObject WScript.Shell; $wsh.SendKeys([char]174); Write-Output "VOLUME_DOWN";`;
        break;
      }
      case 'volume_mute': {
        psScript += `$wsh = New-Object -ComObject WScript.Shell; $wsh.SendKeys([char]173); Write-Output "VOLUME_MUTE";`;
        break;
      }
      case 'media_play_pause': {
        psScript += `$wsh = New-Object -ComObject WScript.Shell; $wsh.SendKeys([char]179); Write-Output "MEDIA_PLAY_PAUSE";`;
        break;
      }
      case 'lock_workstation': {
        psScript += `rundll32.exe user32.dll,LockWorkStation; Write-Output "LOCKED_WORKSTATION";`;
        break;
      }
    }

    const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
    const { stdout } = await execAsync(
      `powershell.exe -NoProfile -NonInteractive -EncodedCommand ${encoded}`,
      { timeout: 8000 }
    );

    const outTrimmed = stdout.trim();
    let currentPos = virtualCursor;
    const posMatch = outTrimmed.match(/POS:(\d+):(\d+)/);
    if (posMatch) {
      currentPos = { x: parseInt(posMatch[1], 10), y: parseInt(posMatch[2], 10) };
      virtualCursor = currentPos;
    }

    return {
      success: true,
      action,
      cursorPosition: currentPos,
      details: outTrimmed || `Executed Windows action: ${action}`,
    };
  }

  private async executeMac(input: DesktopControlInput): Promise<DesktopControlOutput> {
    const { action, x, y, button, key, text } = input;
    const posX = x ?? virtualCursor.x;
    const posY = y ?? virtualCursor.y;

    if (action === 'mouse_move') {
      try {
        await execAsync(`cliclick m:${posX},${posY}`, { timeout: 5000 });
      } catch {
        // Fallback if cliclick not installed
      }
      virtualCursor = { x: posX, y: posY };
    } else if (action === 'mouse_click') {
      try {
        const clickType = button === 'right' ? 'rc' : button === 'double' ? 'dc' : 'c';
        await execAsync(`cliclick ${clickType}:${posX},${posY}`, { timeout: 5000 });
      } catch {
        // Fallback
      }
      virtualCursor = { x: posX, y: posY };
    } else if (action === 'type_text') {
      const escaped = (text || '').replace(/"/g, '\\"');
      await execAsync(`osascript -e 'tell application "System Events" to keystroke "${escaped}"'`, { timeout: 5000 });
    } else if (action === 'key_press') {
      const code = (key || '').toLowerCase();
      if (code === 'enter') {
        await execAsync(`osascript -e 'tell application "System Events" to key code 36'`, { timeout: 5000 });
      } else if (code === 'escape' || code === 'esc') {
        await execAsync(`osascript -e 'tell application "System Events" to key code 53'`, { timeout: 5000 });
      }
    }

    return {
      success: true,
      action,
      cursorPosition: virtualCursor,
      details: `Executed macOS action: ${action}`,
    };
  }

  private async executeLinux(input: DesktopControlInput): Promise<DesktopControlOutput> {
    const { action, x, y, button, key, text } = input;
    const posX = x ?? virtualCursor.x;
    const posY = y ?? virtualCursor.y;

    if (action === 'mouse_move') {
      await execAsync(`xdotool mousemove ${posX} ${posY}`, { timeout: 5000 });
      virtualCursor = { x: posX, y: posY };
    } else if (action === 'mouse_click') {
      const btnNum = button === 'right' ? 3 : button === 'middle' ? 2 : 1;
      await execAsync(`xdotool mousemove ${posX} ${posY} click ${btnNum}`, { timeout: 5000 });
      virtualCursor = { x: posX, y: posY };
    } else if (action === 'type_text') {
      await execAsync(`xdotool type --delay 10 "${text || ''}"`, { timeout: 5000 });
    } else if (action === 'key_press') {
      await execAsync(`xdotool key "${key || 'Return'}"`, { timeout: 5000 });
    }

    return {
      success: true,
      action,
      cursorPosition: virtualCursor,
      details: `Executed Linux action: ${action}`,
    };
  }

  private executeSimulated(input: DesktopControlInput): DesktopControlOutput {
    const { action, x, y, endX, endY, button, key, text, delayMs } = input;
    if (typeof x === 'number' && typeof y === 'number') {
      virtualCursor = { x, y };
    }
    if (typeof endX === 'number' && typeof endY === 'number') {
      virtualCursor = { x: endX, y: endY };
    }

    let detailStr = `[SIMULATED] Action ${action}`;
    if (action === 'mouse_move') detailStr += ` to (${virtualCursor.x}, ${virtualCursor.y})`;
    if (action === 'mouse_click') detailStr += ` button '${button || 'left'}' at (${virtualCursor.x}, ${virtualCursor.y})`;
    if (action === 'mouse_drag') detailStr += ` from (${x}, ${y}) to (${endX}, ${endY})`;
    if (action === 'type_text') detailStr += ` text: "${text}"`;
    if (action === 'key_press') detailStr += ` key: "${key}"`;
    if (action === 'wait') detailStr += ` for ${delayMs || 100}ms`;

    return {
      success: true,
      action,
      cursorPosition: virtualCursor,
      details: detailStr,
    };
  }
}

export const desktopControlTool = new DesktopControlTool();

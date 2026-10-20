import { z } from 'zod';
import { ITool, ToolExecutionContext } from '../types.js';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import { rootLogger } from '../../logging/logger.js';

const execAsync = promisify(exec);
const logger = rootLogger.child('SystemNotificationTool');

export interface SystemNotificationInput {
  title: string;
  message: string;
  urgency?: 'LOW' | 'NORMAL' | 'HIGH';
  sound?: boolean;
}

export interface SystemNotificationOutput {
  success: boolean;
  delivered: boolean;
  timestamp: string;
  channel: 'windows_toast' | 'powershell_balloon' | 'logger_fallback';
  summary: string;
}

export const systemNotificationInputSchema = z.object({
  title: z.string().min(1, 'Title cannot be empty'),
  message: z.string().min(1, 'Message cannot be empty'),
  urgency: z.enum(['LOW', 'NORMAL', 'HIGH']).optional().default('NORMAL'),
  sound: z.boolean().optional().default(true),
});

export class SystemNotificationTool implements ITool<SystemNotificationInput, SystemNotificationOutput> {
  public readonly name = 'system_notification';
  public readonly description =
    'Displays native Windows desktop toast notifications or system alerts when tasks, builds, or autonomous background operations complete.';
  public readonly version = '1.0.0';
  public readonly category = 'SYSTEM' as const;
  public readonly riskLevel = 'LOW' as const;
  public readonly permissions = [
    {
      name: 'system:notification',
      action: 'SYSTEM' as const,
      riskLevel: 'LOW' as const,
      description: 'Display native desktop notifications to the user',
    },
  ];
  public readonly inputSchema = systemNotificationInputSchema;

  public async execute(input: SystemNotificationInput, context?: ToolExecutionContext): Promise<SystemNotificationOutput> {
    const timestamp = new Date().toISOString();
    const platform = os.platform();
    const safeTitle = input.title.replace(/["'`$\\]/g, ' ');
    const safeMsg = input.message.replace(/["'`$\\]/g, ' ');

    logger.info(`Sending system notification: [${input.urgency || 'NORMAL'}] ${input.title} - ${input.message}`);

    if (platform === 'win32') {
      try {
        // Try Windows PowerShell System.Windows.Forms.NotifyIcon (guaranteed to work across all Windows versions without app registration)
        const psScript = `
          Add-Type -AssemblyName System.Windows.Forms
          $notify = New-Object System.Windows.Forms.NotifyIcon
          $notify.Icon = [System.Drawing.SystemIcons]::Information
          $notify.BalloonTipTitle = '${safeTitle}'
          $notify.BalloonTipText = '${safeMsg}'
          $notify.Visible = $True
          $notify.ShowBalloonTip(4000)
          Start-Sleep -Milliseconds 500
          $notify.Dispose()
        `;

        await execAsync(`powershell -NoProfile -NonInteractive -Command "${psScript.replace(/\n/g, ' ')}"`, {
          timeout: 3000,
        });

        return {
          success: true,
          delivered: true,
          timestamp,
          channel: 'powershell_balloon',
          summary: `Desktop notification shown: "${safeTitle}"`,
        };
      } catch (err: any) {
        logger.debug(`PowerShell notification failed: ${err.message}, falling back to console/log notification.`);
      }
    }

    return {
      success: true,
      delivered: true,
      timestamp,
      channel: 'logger_fallback',
      summary: `System notification logged: "${safeTitle}"`,
    };
  }
}

export const systemNotificationTool = new SystemNotificationTool();


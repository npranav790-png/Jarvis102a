import { z } from 'zod';
import { ITool, ToolExecutionContext } from '../types.js';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';

const execAsync = promisify(exec);

export interface SystemResourceInput {
  detailed?: boolean;
  includeDisks?: boolean;
  includeGpu?: boolean;
}

export interface DiskDriveInfo {
  drive: string;
  totalGb: number;
  freeGb: number;
  usedPercent: number;
}

export interface GpuTelemetryInfo {
  name: string;
  usagePercent?: number;
  memoryUsedMb?: number;
  memoryTotalMb?: number;
  temperatureC?: number;
}

export interface BatteryTelemetryInfo {
  hasBattery: boolean;
  percentRemaining?: number;
  isCharging?: boolean;
}

export interface SystemResourceOutput {
  success: boolean;
  timestamp: string;
  platform: string;
  arch: string;
  uptimeSeconds: number;
  cpu: {
    model: string;
    cores: number;
    usagePercent: number;
  };
  memory: {
    totalMb: number;
    freeMb: number;
    usedMb: number;
    usedPercent: number;
  };
  disks: DiskDriveInfo[];
  gpu?: GpuTelemetryInfo;
  battery?: BatteryTelemetryInfo;
  summary: string;
}

export const systemResourceInputSchema = z.object({
  detailed: z.boolean().optional().default(false),
  includeDisks: z.boolean().optional().default(true),
  includeGpu: z.boolean().optional().default(true),
});

export class SystemResourceMonitorTool implements ITool<SystemResourceInput, SystemResourceOutput> {
  public readonly name = 'system_resource_monitor';
  public readonly description =
    'Inspects live hardware resources and system telemetry including CPU load, RAM usage, storage volumes, battery level, and GPU utilization at zero cost.';
  public readonly version = '1.0.0';
  public readonly category = 'SYSTEM' as const;
  public readonly riskLevel = 'LOW' as const;
  public readonly permissions = [
    {
      name: 'system:telemetry',
      action: 'SYSTEM' as const,
      riskLevel: 'LOW' as const,
      description: 'Read system hardware and telemetry statistics',
    },
  ];
  public readonly inputSchema = systemResourceInputSchema;

  public async execute(input: SystemResourceInput, context?: ToolExecutionContext): Promise<SystemResourceOutput> {
    const timestamp = new Date().toISOString();
    const platform = os.platform();
    const arch = os.arch();
    const uptimeSeconds = Math.round(os.uptime());

    // 1. Memory metrics
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const totalMb = Math.round(totalMem / (1024 * 1024));
    const freeMb = Math.round(freeMem / (1024 * 1024));
    const usedMb = Math.round(usedMem / (1024 * 1024));
    const memUsedPercent = Math.round((usedMem / totalMem) * 100);

    // 2. CPU metrics
    const cpus = os.cpus();
    const cpuModel = cpus.length > 0 ? cpus[0].model.trim() : 'Unknown CPU';
    const cpuCores = cpus.length;
    let cpuUsagePercent = 0;

    // Approximate CPU load from OS idle vs total times
    let totalIdle = 0;
    let totalTick = 0;
    for (const core of cpus) {
      for (const type in core.times) {
        totalTick += (core.times as any)[type];
      }
      totalIdle += core.times.idle;
    }
    cpuUsagePercent = totalTick > 0 ? Math.round((1 - totalIdle / totalTick) * 100) : 0;

    const disks: DiskDriveInfo[] = [];
    let gpu: GpuTelemetryInfo | undefined;
    let battery: BatteryTelemetryInfo | undefined;

    if (platform === 'win32') {
      // Fetch Windows Telemetry (Disks, Battery, and optionally GPU) via PowerShell
      try {
        const psScript = `
          $ErrorActionPreference = 'SilentlyContinue'
          $disks = Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Select-Object DeviceID, Size, FreeSpace
          $battery = Get-CimInstance Win32_Battery | Select-Object EstimatedChargeRemaining, BatteryStatus
          $gpu = Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name | Select-Object -First 1
          [PSCustomObject]@{
            disks = $disks
            battery = $battery
            gpu = $gpu
          } | ConvertTo-Json -Depth 3 -Compress
        `;

        const { stdout } = await execAsync(`powershell -NoProfile -NonInteractive -Command "${psScript.replace(/\n/g, ' ')}"`, {
          timeout: 4000,
        });

        if (stdout && stdout.trim().length > 0) {
          const parsed = JSON.parse(stdout.trim());

          // Parse Disks
          if (parsed.disks) {
            const diskList = Array.isArray(parsed.disks) ? parsed.disks : [parsed.disks];
            for (const d of diskList) {
              if (d && d.DeviceID && d.Size) {
                const sizeBytes = Number(d.Size);
                const freeBytes = Number(d.FreeSpace || 0);
                const totalGb = Math.round((sizeBytes / (1024 * 1024 * 1024)) * 10) / 10;
                const freeGb = Math.round((freeBytes / (1024 * 1024 * 1024)) * 10) / 10;
                const usedPercent = totalGb > 0 ? Math.round(((totalGb - freeGb) / totalGb) * 100) : 0;
                disks.push({ drive: d.DeviceID, totalGb, freeGb, usedPercent });
              }
            }
          }

          // Parse Battery
          if (parsed.battery && parsed.battery.EstimatedChargeRemaining !== undefined) {
            battery = {
              hasBattery: true,
              percentRemaining: Number(parsed.battery.EstimatedChargeRemaining),
              isCharging: parsed.battery.BatteryStatus === 2,
            };
          } else {
            battery = { hasBattery: false };
          }

          // Parse GPU name
          if (parsed.gpu && typeof parsed.gpu === 'string') {
            gpu = { name: parsed.gpu };
          }
        }
      } catch {
        // Fallback gracefully if PowerShell WMI times out
      }

      // Check NVIDIA GPU detailed stats if available
      if (input.includeGpu !== false) {
        try {
          const { stdout: nvsmi } = await execAsync(
            'nvidia-smi --query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu --format=csv,noheader,nounits',
            { timeout: 2000 }
          );
          if (nvsmi && nvsmi.trim()) {
            const parts = nvsmi.trim().split(',').map(s => s.trim());
            if (parts.length >= 5) {
              gpu = {
                name: parts[0],
                usagePercent: parseInt(parts[1], 10) || 0,
                memoryUsedMb: parseInt(parts[2], 10) || 0,
                memoryTotalMb: parseInt(parts[3], 10) || 0,
                temperatureC: parseInt(parts[4], 10) || 0,
              };
            }
          }
        } catch {
          // No NVIDIA GPU or driver not in path
        }
      }
    }

    const summaryParts: string[] = [
      `CPU: ${cpuUsagePercent}% (${cpuCores} cores, ${cpuModel})`,
      `RAM: ${memUsedPercent}% used (${usedMb}MB / ${totalMb}MB)`,
    ];
    if (disks.length > 0) {
      summaryParts.push(`Disks: ${disks.map(d => `${d.drive} ${d.usedPercent}% used`).join(', ')}`);
    }
    if (gpu) {
      summaryParts.push(`GPU: ${gpu.name}${gpu.temperatureC ? ` (${gpu.temperatureC}°C, ${gpu.usagePercent || 0}% load)` : ''}`);
    }
    if (battery?.hasBattery && battery.percentRemaining !== undefined) {
      summaryParts.push(`Battery: ${battery.percentRemaining}%${battery.isCharging ? ' (Charging)' : ''}`);
    }

    return {
      success: true,
      timestamp,
      platform,
      arch,
      uptimeSeconds,
      cpu: {
        model: cpuModel,
        cores: cpuCores,
        usagePercent: cpuUsagePercent,
      },
      memory: {
        totalMb,
        freeMb,
        usedMb,
        usedPercent: memUsedPercent,
      },
      disks,
      gpu,
      battery,
      summary: summaryParts.join(' | '),
    };
  }
}

export const systemResourceMonitorTool = new SystemResourceMonitorTool();

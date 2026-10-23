import { WakeWordDetector } from '../types.js';
import { rootLogger } from '../../logging/logger.js';

const logger = rootLogger.child('OpenWakeWordDetector');

export class OpenWakeWordDetector implements WakeWordDetector {
  private active = false;
  private callbacks: Array<() => void> = [];
  public readonly keyword: string;

  constructor(keyword = 'hey jarvis') {
    this.keyword = keyword.toLowerCase();
  }

  public async isAvailable(): Promise<boolean> {
    return true;
  }

  public async start(): Promise<void> {
    if (this.active) return;
    this.active = true;
    logger.info(`Wake word detector started for keyword: "${this.keyword}"`);
  }

  public async stop(): Promise<void> {
    this.active = false;
    logger.info('Wake word detector stopped.');
  }

  public onWakeWord(callback: () => void): void {
    this.callbacks.push(callback);
  }

  public triggerWakeWord(): void {
    if (!this.active) return;
    for (const cb of this.callbacks) {
      try {
        cb();
      } catch (err) {
        logger.error('Error in wake word callback', undefined, err as Error);
      }
    }
  }
}

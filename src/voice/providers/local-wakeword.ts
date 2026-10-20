import { EventEmitter } from 'node:events';
import { WakeWordDetector } from '../types.js';
import { rootLogger } from '../../logging/logger.js';

const logger = rootLogger.child('LocalWakeWordDetector');

export class LocalWakeWordDetector implements WakeWordDetector {
  public readonly id = 'local-wakeword';
  public readonly keyword = 'hey jarvis';
  public isRunning = false;

  private emitter = new EventEmitter();

  public async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    logger.info(`Local Wake Word Detector started. Listening for keyword: "${this.keyword}"`);
  }

  public async stop(): Promise<void> {
    if (!this.isRunning) return;
    this.isRunning = false;
    logger.info(`Local Wake Word Detector stopped.`);
  }

  public onWakeWord(callback: () => void): void {
    this.emitter.on('wakeword', callback);
  }

  public emitWakeWord(): void {
    if (!this.isRunning) return;
    logger.info(`Wake word detected: "${this.keyword}"`);
    this.emitter.emit('wakeword');
  }

  public async isAvailable(): Promise<boolean> {
    return true;
  }
}

export const localWakeWordDetector = new LocalWakeWordDetector();

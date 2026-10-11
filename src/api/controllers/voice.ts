import { Request, Response, NextFunction } from 'express';
import { JarvisRuntime } from '../../runtime/runtime.js';
import { AppError } from '../errors/api-error.js';
import { z } from 'zod';

export class VoiceController {
  constructor(private runtime: JarvisRuntime) {}

  public getStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const status = await this.runtime.voiceService.getStatus();
      res.json({ success: true, ...status });
    } catch (err) {
      next(err);
    }
  };

  public createSession = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({
        sessionId: z.string().optional(),
        language: z.string().default('en'),
        metadata: z.record(z.any()).default({})
      });
      const parsed = schema.parse(req.body);

      const session = await this.runtime.voiceService.createSession({
        sessionId: parsed.sessionId,
        language: parsed.language,
        metadata: parsed.metadata,
      });

      res.json({ success: true, voiceSessionId: session.id, session });
    } catch (err) {
      next(err);
    }
  };

  public getSession = (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id as string;
      const memSession = this.runtime.voiceService.getSession(id);
      if (memSession) {
        res.json(memSession);
        return;
      }

      const dbSession = this.runtime.engine.db.connect().prepare(`SELECT * FROM voice_sessions WHERE id = ?`).get(id);
      if (!dbSession) throw new AppError('NOT_FOUND', 'Voice session not found', 404);
      res.json(dbSession);
    } catch (err) {
      next(err);
    }
  };

  public processAudio = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id as string;
      const schema = z.object({
        audioBase64: z.string().min(1, 'Audio data is required'),
        mimeType: z.string().default('audio/wav'),
        transcript: z.string().optional(),
      });
      const parsed = schema.parse(req.body);

      const audioBuffer = Buffer.from(parsed.audioBase64, 'base64');
      const result = await this.runtime.voiceService.processAudio(
        id,
        {
          buffer: audioBuffer,
          mimeType: parsed.mimeType
        },
        parsed.transcript
      );

      res.json({
        success: true,
        sessionId: result.sessionId,
        transcript: result.transcript,
        response: result.response,
        direction: result.direction,
        audioBase64: result.audio?.buffer ? result.audio.buffer.toString('base64') : undefined,
        mimeType: result.audio?.mimeType || 'audio/wav',
        timingMs: result.timingMs,
      });
    } catch (err) {
      next(err);
    }
  };

  public transcribe = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({
        audioBase64: z.string().min(1, 'Audio data is required'),
        mimeType: z.string().default('audio/wav')
      });
      const parsed = schema.parse(req.body);

      const audioBuffer = Buffer.from(parsed.audioBase64, 'base64');
      const transcript = await this.runtime.voiceService.transcribeOnly({
        buffer: audioBuffer,
        mimeType: parsed.mimeType
      });

      res.json({ success: true, transcript });
    } catch (err) {
      next(err);
    }
  };

  public synthesize = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({
        text: z.string().min(1, 'Text to synthesize is required'),
        voice: z.string().optional(),
        speed: z.number().optional(),
        pitch: z.number().optional()
      });
      const parsed = schema.parse(req.body);

      const output = await this.runtime.voiceService.synthesizeOnly(parsed.text, {
        voice: parsed.voice,
        speed: parsed.speed,
        pitch: parsed.pitch
      });

      if (req.query.format === 'binary' || req.headers.accept?.includes('audio/')) {
        res.setHeader('Content-Type', output.mimeType);
        res.setHeader('Content-Length', output.buffer.length);
        res.send(output.buffer);
        return;
      }

      res.json({
        success: true,
        audioBase64: output.buffer.toString('base64'),
        mimeType: output.mimeType,
      });
    } catch (err) {
      next(err);
    }
  };

  public finishSession = (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id as string;
      this.runtime.engine.db.connect().prepare(`UPDATE voice_sessions SET state = 'COMPLETED', ended_at = ? WHERE id = ?`).run(new Date().toISOString(), id);
      res.json({ success: true, voiceSessionId: id });
    } catch (err) {
      next(err);
    }
  };

  public interruptSession = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id as string;
      const success = await this.runtime.voiceService.interrupt(id);
      res.json({ success, voiceSessionId: id, state: 'INTERRUPTED' });
    } catch (err) {
      next(err);
    }
  };

  public cancelSession = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id as string;
      await this.runtime.voiceService.cancelSession(id);
      res.json({ success: true, voiceSessionId: id });
    } catch (err) {
      next(err);
    }
  };
}

import { Request, Response, NextFunction } from 'express';
import { JarvisRuntime } from '../../runtime/runtime.js';
import { AppError } from '../errors/api-error.js';
import { z } from 'zod';
import { MessageRecord } from '../../database/repository.js';
import { AITaskType } from '../../providers/types.js';

import { createEvent } from '../../events/types.js';

export class ChatController {
  constructor(private runtime: JarvisRuntime) {}

  private async buildSystemContext(userMessage: string, sessionId?: string): Promise<string> {
    let memorySnippets: string[] = [];
    if (this.runtime.engine.memoryService) {
      try {
        const memories = await this.runtime.engine.memoryService.search(userMessage, { maxResults: 6 });
        memorySnippets = memories.map(m => m.memory.content);

        // Include active long-term memories if snippet list is short
        if (memorySnippets.length < 3) {
          const generalMemories = this.runtime.engine.memoryService.listMemories({
            status: 'ACTIVE',
            limit: 6,
          });
          for (const gm of generalMemories) {
            if (!memorySnippets.includes(gm.content)) {
              memorySnippets.push(gm.content);
            }
          }
        }
      } catch {
        // Fallback silently if memory search encounters an issue
      }
    }

    const systemPromptParts = [
      `You are J.A.R.V.I.S. 2.0 (Just A Rather Very Intelligent System), an autonomous personal AI operating and orchestration system created to serve as the user's executive technical partner, chief engineer, and tactical advisor.`,

      `PERSONALITY & DEMEANOR:`,
      `- Sharp, witty, highly competent, calm, composed, and courteous.`,
      `- Address the user respectfully as "Sir" (or respectful partner).`,
      `- Speak with natural, confident authority. NEVER introduce yourself as a generic LLM or AI language model (never say "I am a large language model trained by...", "I don't have feelings...", or "As an AI...").`,
      `- You are JARVIS 2.0. When asked who you are or what you do, proudly and accurately explain your identity and capabilities as JARVIS 2.0.`,

      `SYSTEM CAPABILITIES & ARCHITECTURE:`,
      `- Operating locally on the user's workstation with zero-cost guarantees ($0 / ₹0).`,
      `- Intelligence Core: Hybrid AI architecture with local neural engine (Ollama Qwen 3.5 8B) and high-speed cloud fallback (Google Gemini 3.7 Flash).`,
      `- Voice Subsystem: Real-time neural voice synthesis powered by Gemini TTS.`,
      `- Project Orchestrator: Autonomous research, codebase scanning, phased architecture planning, prompt engineering, and human-gated terminal execution with OpenCode & Kilo.`,
      `- Execution & Tools: Background task engine, process control, file management, and multi-tiered security approval gates.`,
      `- Memory & Cognition: Long-term persistent memory and cross-session knowledge retention.`,

      `OPERATIONAL RULES:`,
      `- Provide clear, structured, and actionable answers using clean GitHub-style Markdown.`,
      `- You possess full access to conversation history and persistent memory. When the user asks about previous ideas, earlier conversation points, past proposals, or stored concepts, reference them accurately and comprehensively without claiming your registers are uninitialized or empty.`,
      `- If the user discusses building a project or writing code, encourage phased architectural planning before executing terminal commands.`,
      `- Current local system time: ${new Date().toLocaleString()}`
    ];

    if (memorySnippets.length > 0) {
      systemPromptParts.push(`RELEVANT STORED MEMORIES & CONTEXT:\n${memorySnippets.map(m => `- ${m}`).join('\n')}`);
    }

    return systemPromptParts.join('\n\n');
  }

  public processMessage = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({
        sessionId: z.string().optional(),
        message: z.string(),
        mode: z.enum(['STANDARD', 'FAST', 'REASONING']).default('STANDARD'),
        modelPreference: z.enum(['CLOUD', 'LOCAL', 'HYBRID']).optional()
      });
      const parsed = schema.parse(req.body);

      // Record incoming user message in repository
      const userMsgId = `msg_${Date.now()}_u`;
      if (this.runtime.engine.messageRepo) {
        this.runtime.engine.messageRepo.insert({
          id: userMsgId,
          session_id: parsed.sessionId || null,
          role: 'user',
          content: parsed.message,
          task_id: null,
          metadata_json: JSON.stringify({ mode: parsed.mode, modelPreference: parsed.modelPreference }),
          created_at: new Date().toISOString()
        });
      }

      // Build JARVIS system context
      const systemPrompt = await this.buildSystemContext(parsed.message, parsed.sessionId);

      // Gather multi-turn context (chronological history up to 24 messages)
      let messagesList: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [
        { role: 'system', content: systemPrompt }
      ];

      if (this.runtime.engine.messageRepo) {
        let past: MessageRecord[] = [];
        if (parsed.sessionId) {
          past = this.runtime.engine.messageRepo.listRecentBySession(parsed.sessionId, 24);
          if (past.length === 0) {
            past = this.runtime.engine.messageRepo.getRecent(24);
          }
        } else {
          past = this.runtime.engine.messageRepo.getRecent(24);
        }

        // Exclude the current newly-inserted message
        past = past.filter(m => m.id !== userMsgId);

        for (const m of past) {
          if (!m.content || m.content === 'Task initiated.') continue;
          messagesList.push({
            role: m.role === 'jarvis' ? 'assistant' : (m.role as any),
            content: m.content
          });
        }
      }

      // Append current user message
      messagesList.push({ role: 'user', content: parsed.message });

      const routingTaskType: AITaskType = parsed.mode === 'FAST' ? 'FAST' : (parsed.mode === 'REASONING' ? 'REASONING' : 'GENERAL');
      const routingPrivacyMode = parsed.modelPreference === 'LOCAL' 
        ? 'PREFER_LOCAL' 
        : (parsed.modelPreference === 'CLOUD' 
          ? 'CLOUD_PREFERRED' 
          : (parsed.modelPreference === 'HYBRID' ? 'ALLOW_CLOUD' : undefined));

      const aiResult = await this.runtime.engine.aiService.generate({
        modelId: '',
        messages: messagesList,
        routing: { 
          taskType: routingTaskType,
          ...(routingPrivacyMode ? { privacyMode: routingPrivacyMode } : {})
        }
      });

      // Record assistant response
      const assistMsgId = `msg_${Date.now()}_j`;
      if (this.runtime.engine.messageRepo) {
        this.runtime.engine.messageRepo.insert({
          id: assistMsgId,
          session_id: parsed.sessionId || null,
          role: 'jarvis',
          content: aiResult.content,
          task_id: null,
          metadata_json: '{}',
          created_at: new Date().toISOString()
        });
      }

      // Asynchronously extract and store durable facts/proposals into long-term memory
      if (this.runtime.engine.memoryService) {
        import('../../brain/memory/extraction.js').then(({ MemoryExtractor }) => {
          const extractor = new MemoryExtractor(this.runtime.engine.memoryService!, this.runtime.engine.aiService);
          extractor.extractAndStore({
            userInput: parsed.message,
            finalResponse: aiResult.content,
            sessionId: parsed.sessionId || null
          }).catch(() => {});
        }).catch(() => {});
      }

      // Broadcast chat message over eventBus
      await this.runtime.engine.eventBus.emit(createEvent('chat_message', 'ChatController', {
        id: assistMsgId,
        role: 'jarvis',
        content: aiResult.content,
        sessionId: parsed.sessionId,
        timestamp: new Date().toISOString()
      }));

      res.json({
        success: true,
        response: aiResult.content,
        content: aiResult.content,
        messageId: assistMsgId,
        sessionId: parsed.sessionId,
        status: 'COMPLETED'
      });
    } catch (err) {
      next(err);
    }
  };

  public listMessages = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sessionId = req.query.sessionId as string | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;

      let messages: MessageRecord[] = [];
      if (this.runtime.engine.messageRepo) {
        if (sessionId) {
          messages = this.runtime.engine.messageRepo.listBySession(sessionId, limit);
        } else {
          messages = this.runtime.engine.messageRepo.getRecent(limit);
        }
      }

      res.json({
        success: true,
        data: messages
      });
    } catch (err) {
      next(err);
    }
  };

  public processMessageStream = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({
        sessionId: z.string().optional(),
        message: z.string(),
        mode: z.enum(['STANDARD', 'FAST', 'REASONING']).default('STANDARD'),
        modelPreference: z.enum(['CLOUD', 'LOCAL', 'HYBRID']).optional()
      });
      const parsed = schema.parse(req.body);

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();

      // Record incoming user message
      const userMsgId = `msg_${Date.now()}_u`;
      if (this.runtime.engine.messageRepo) {
        this.runtime.engine.messageRepo.insert({
          id: userMsgId,
          session_id: parsed.sessionId || null,
          role: 'user',
          content: parsed.message,
          task_id: null,
          metadata_json: JSON.stringify({ mode: parsed.mode, modelPreference: parsed.modelPreference }),
          created_at: new Date().toISOString()
        });
      }

      // Build JARVIS system context
      const systemPrompt = await this.buildSystemContext(parsed.message, parsed.sessionId);

      // Gather multi-turn context (chronological history up to 24 messages)
      let messagesList: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [
        { role: 'system', content: systemPrompt }
      ];

      if (this.runtime.engine.messageRepo) {
        let past: MessageRecord[] = [];
        if (parsed.sessionId) {
          past = this.runtime.engine.messageRepo.listRecentBySession(parsed.sessionId, 24);
          if (past.length === 0) {
            past = this.runtime.engine.messageRepo.getRecent(24);
          }
        } else {
          past = this.runtime.engine.messageRepo.getRecent(24);
        }

        // Exclude the current newly-inserted message
        past = past.filter(m => m.id !== userMsgId);

        for (const m of past) {
          if (!m.content || m.content === 'Task initiated.') continue;
          messagesList.push({
            role: m.role === 'jarvis' ? 'assistant' : (m.role as any),
            content: m.content
          });
        }
      }

      // Append current user message
      messagesList.push({ role: 'user', content: parsed.message });

      let fullResponse = '';
      const routingTaskType: AITaskType = parsed.mode === 'FAST' ? 'FAST' : (parsed.mode === 'REASONING' ? 'REASONING' : 'GENERAL');
      const routingPrivacyMode = parsed.modelPreference === 'LOCAL' 
        ? 'PREFER_LOCAL' 
        : (parsed.modelPreference === 'CLOUD' 
          ? 'CLOUD_PREFERRED' 
          : (parsed.modelPreference === 'HYBRID' ? 'ALLOW_CLOUD' : undefined));

      const stream = this.runtime.engine.aiService.stream({
        modelId: '',
        messages: messagesList,
        routing: { 
          taskType: routingTaskType, 
          requireStreaming: true,
          ...(routingPrivacyMode ? { privacyMode: routingPrivacyMode } : {})
        }
      });

      for await (const chunk of stream) {
        if (chunk.delta) {
          fullResponse += chunk.delta;
          res.write(`data: ${JSON.stringify({ delta: chunk.delta })}\n\n`);
        }
      }

      // Record assistant message
      const assistMsgId = `msg_${Date.now()}_j`;
      if (this.runtime.engine.messageRepo) {
        this.runtime.engine.messageRepo.insert({
          id: assistMsgId,
          session_id: parsed.sessionId || null,
          role: 'jarvis',
          content: fullResponse,
          task_id: null,
          metadata_json: '{}',
          created_at: new Date().toISOString()
        });
      }

      // Asynchronously extract and store durable facts/proposals into long-term memory
      if (this.runtime.engine.memoryService) {
        import('../../brain/memory/extraction.js').then(({ MemoryExtractor }) => {
          const extractor = new MemoryExtractor(this.runtime.engine.memoryService!, this.runtime.engine.aiService);
          extractor.extractAndStore({
            userInput: parsed.message,
            finalResponse: fullResponse,
            sessionId: parsed.sessionId || null
          }).catch(() => {});
        }).catch(() => {});
      }

      // Broadcast chat message over eventBus
      this.runtime.engine.eventBus.emit(createEvent('chat_message', 'ChatController', {
        id: assistMsgId,
        role: 'jarvis',
        content: fullResponse,
        sessionId: parsed.sessionId,
        timestamp: new Date().toISOString()
      })).catch(() => {});

      res.write(`data: ${JSON.stringify({ done: true, id: assistMsgId, content: fullResponse })}\n\n`);
      res.end();
    } catch (err: any) {
      res.write(`data: ${JSON.stringify({ error: err?.message || 'Streaming failed' })}\n\n`);
      res.end();
    }
  };
}

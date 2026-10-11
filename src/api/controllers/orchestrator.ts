import { Request, Response } from 'express';
import { JarvisRuntime } from '../../runtime/runtime.js';
import { rootLogger } from '../../logging/logger.js';

const logger = rootLogger.child('OrchestratorController');

export class OrchestratorController {
  constructor(private runtime: JarvisRuntime) {}

  public getStatus = async (_req: Request, res: Response): Promise<void> => {
    try {
      const status = await this.runtime.orchestrator.getStatus();
      res.json({ success: true, data: status });
    } catch (err: any) {
      logger.error(`Failed to get orchestrator status: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  };

  public listJobs = (_req: Request, res: Response): void => {
    try {
      const jobs = this.runtime.orchestrator.listJobs();
      res.json({ success: true, data: jobs });
    } catch (err: any) {
      logger.error(`Failed to list orchestrator jobs: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  };

  public getJob = (req: Request, res: Response): void => {
    try {
      const id = String(req.params.id);
      const job = this.runtime.orchestrator.getJob(id);
      if (!job) {
        res.status(404).json({ success: false, error: `Job not found: ${id}` });
        return;
      }
      res.json({ success: true, data: job });
    } catch (err: any) {
      logger.error(`Failed to get job ${req.params.id}: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  };

  public submitOrder = async (req: Request, res: Response): Promise<void> => {
    try {
      const { orderText, targetWorkspace, engine, model, title, autoApprovePermissions, autoDispatch } = req.body;
      if (!orderText || typeof orderText !== 'string' || orderText.trim().length === 0) {
        res.status(400).json({ success: false, error: 'orderText is required' });
        return;
      }

      const job = await this.runtime.orchestrator.submitOrder({
        orderText: orderText.trim(),
        targetWorkspace: targetWorkspace || process.cwd(),
        engine,
        model,
        title,
        autoApprovePermissions,
        autoDispatch,
        skipPlanApproval: req.body.skipPlanApproval,
      });

      res.status(201).json({ success: true, data: job });
    } catch (err: any) {
      logger.error(`Failed to submit order: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  };

  public approvePlan = async (req: Request, res: Response): Promise<void> => {
    try {
      const id = String(req.params.id);
      const { modifications } = req.body;
      const job = await this.runtime.orchestrator.approvePlan(id, modifications);
      res.json({ success: true, data: job });
    } catch (err: any) {
      logger.error(`Failed to approve plan for job ${req.params.id}: ${err.message}`);
      res.status(400).json({ success: false, error: err.message });
    }
  };

  public rejectPlan = async (req: Request, res: Response): Promise<void> => {
    try {
      const id = String(req.params.id);
      const { reason } = req.body;
      const job = await this.runtime.orchestrator.rejectPlan(id, reason);
      res.json({ success: true, data: job });
    } catch (err: any) {
      logger.error(`Failed to reject plan for job ${req.params.id}: ${err.message}`);
      res.status(400).json({ success: false, error: err.message });
    }
  };


  public approveJob = async (req: Request, res: Response): Promise<void> => {
    try {
      const id = String(req.params.id);
      const { customPrompt } = req.body;
      const job = await this.runtime.orchestrator.approveJob(id, customPrompt);
      res.json({ success: true, data: job });
    } catch (err: any) {
      logger.error(`Failed to approve job ${req.params.id}: ${err.message}`);
      res.status(400).json({ success: false, error: err.message });
    }
  };

  public rejectJob = async (req: Request, res: Response): Promise<void> => {
    try {
      const id = String(req.params.id);
      const { reason } = req.body;
      const job = await this.runtime.orchestrator.rejectJob(id, reason);
      res.json({ success: true, data: job });
    } catch (err: any) {
      logger.error(`Failed to reject job ${req.params.id}: ${err.message}`);
      res.status(400).json({ success: false, error: err.message });
    }
  };

  public updatePrompt = (req: Request, res: Response): void => {
    try {
      const id = String(req.params.id);
      const { promptText } = req.body;
      if (!promptText || typeof promptText !== 'string') {
        res.status(400).json({ success: false, error: 'promptText is required' });
        return;
      }
      const job = this.runtime.orchestrator.updatePromptText(id, promptText);
      res.json({ success: true, data: job });
    } catch (err: any) {
      logger.error(`Failed to update prompt for job ${req.params.id}: ${err.message}`);
      res.status(400).json({ success: false, error: err.message });
    }
  };

  public cancelJob = (req: Request, res: Response): void => {
    try {
      const id = String(req.params.id);
      const cancelled = this.runtime.orchestrator.cancelJob(id);
      res.json({ success: true, data: { cancelled } });
    } catch (err: any) {
      logger.error(`Failed to cancel job ${req.params.id}: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  };
}

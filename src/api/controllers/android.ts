import { Request, Response, NextFunction } from 'express';
import { AndroidMirrorService } from '../../android/mirror-service.js';
import { JarvisRuntime } from '../../runtime/runtime.js';

export class AndroidController {
  private mirrorService: AndroidMirrorService;

  constructor(private runtime: JarvisRuntime) {
    this.mirrorService = new AndroidMirrorService();
  }

  public getStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const env = this.mirrorService.getEnvironmentStatus();
      const devices = await this.mirrorService.listDevices();
      res.json({
        success: true,
        environment: env,
        deviceCount: devices.length,
        devices,
      });
    } catch (err) {
      next(err);
    }
  };

  public listDevices = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const devices = await this.mirrorService.listDevices();
      res.json({ success: true, devices });
    } catch (err) {
      next(err);
    }
  };

  public connectWifi = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { ip, port } = req.body;
      if (!ip) {
        return res.status(400).json({ success: false, message: 'IP address required' });
      }
      const result = await this.mirrorService.connectWifi(ip, port ? parseInt(port, 10) : 5555);
      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  public enableWireless = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { serial } = req.body;
      const result = await this.mirrorService.enableWireless(serial);
      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  public launchMirror = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { serial, fullscreen, stayAwake, turnScreenOff, noAudio } = req.body;
      const result = await this.mirrorService.launchMirror({
        serial,
        fullscreen: Boolean(fullscreen),
        stayAwake: stayAwake !== false,
        turnScreenOff: Boolean(turnScreenOff),
        noAudio: Boolean(noAudio),
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  public sendInput = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { key, text, serial } = req.body;
      if (key) {
        const result = await this.mirrorService.sendKeyEvent(key, serial);
        return res.json(result);
      }
      if (text) {
        const result = await this.mirrorService.sendText(text, serial);
        return res.json(result);
      }
      res.status(400).json({ success: false, message: 'Must provide either key or text' });
    } catch (err) {
      next(err);
    }
  };

  public launchApp = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { packageName, serial } = req.body;
      if (!packageName) {
        return res.status(400).json({ success: false, message: 'Package name required' });
      }
      const result = await this.mirrorService.launchApp(packageName, serial);
      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  public captureScreenshot = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const serial = req.query.serial as string | undefined;
      const dataUrl = await this.mirrorService.captureScreenshot(serial);
      res.json({ success: true, dataUrl });
    } catch (err) {
      next(err);
    }
  };

  public getTelemetry = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const serial = req.query.serial as string | undefined;
      const telemetry = await this.mirrorService.getDeviceTelemetry(serial);
      res.json({ success: true, telemetry });
    } catch (err) {
      next(err);
    }
  };

  public getNotifications = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const serial = req.query.serial as string | undefined;
      const notifications = await this.mirrorService.getNotifications(serial);
      res.json({ success: true, count: notifications.length, notifications });
    } catch (err) {
      next(err);
    }
  };

  public triggerCall = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { phoneNumber, serial } = req.body;
      if (!phoneNumber) {
        return res.status(400).json({ success: false, message: 'phoneNumber is required' });
      }
      const result = await this.mirrorService.telephonyCall(phoneNumber, serial);
      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  public triggerSms = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { phoneNumber, message, serial } = req.body;
      if (!phoneNumber || !message) {
        return res.status(400).json({ success: false, message: 'phoneNumber and message are required' });
      }
      const result = await this.mirrorService.telephonySms(phoneNumber, message, serial);
      res.json(result);
    } catch (err) {
      next(err);
    }
  };
}

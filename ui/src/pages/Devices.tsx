import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { api } from '../api/client';
import { useJarvisStore } from '../store/jarvisStore';
import {
  Smartphone,
  Laptop,
  Tablet,
  Globe,
  Radio,
  QrCode,
  Shield,
  Trash2,
  RefreshCw,
  Copy,
  Check,
  Lock,
  Volume2,
  VolumeX,
  Volume1,
  Play,
  Camera,
  Send,
  Zap,
  Clock,
  Wifi,
  ExternalLink,
  Tv,
  Maximize2,
  Home,
  ArrowLeft,
  Layers,
  Power,
  Bell
} from 'lucide-react';
import { AndroidTelephonyBridge } from '../components/Devices/AndroidTelephonyBridge';

interface DeviceItem {
  id: string;
  name: string;
  platform: string;
  appVersion?: string;
  createdAt: string;
  lastSeenAt?: string;
  revokedAt?: string;
}

export const Devices: React.FC = () => {
  const { wsConnected } = useJarvisStore();
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'fleet' | 'pair' | 'control' | 'android'>('fleet');

  // Android Mirroring & App Control State
  const [androidDevices, setAndroidDevices] = useState<any[]>([]);
  const [androidEnv, setAndroidEnv] = useState<any>(null);
  const [selectedAndroidId, setSelectedAndroidId] = useState<string>('');
  const [wifiIpInput, setWifiIpInput] = useState<string>('');
  const [androidLoading, setAndroidLoading] = useState<boolean>(false);
  const [androidActionFeedback, setAndroidActionFeedback] = useState<string | null>(null);
  const [androidScreenDataUrl, setAndroidScreenDataUrl] = useState<string | null>(null);
  const [androidScreenLoading, setAndroidScreenLoading] = useState<boolean>(false);
  const [textToType, setTextToType] = useState<string>('');
  const [customPackage, setCustomPackage] = useState<string>('');
  const [androidLiveStream, setAndroidLiveStream] = useState<boolean>(false);
  const [lastSnapshotTime, setLastSnapshotTime] = useState<string>('');

  // Pairing State
  const [pairingData, setPairingData] = useState<{
    pairingId: string;
    code: string;
    expiresAt: string;
    localIp?: string;
    pairingUrl?: string;
  } | null>(null);
  const [pairingLoading, setPairingLoading] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [manualCode, setManualCode] = useState('');
  const [manualName, setManualName] = useState('Remote Client');
  const [manualPairingId, setManualPairingId] = useState('');
  const [pairingError, setPairingError] = useState<string | null>(null);
  const [pairingSuccess, setPairingSuccess] = useState<string | null>(null);

  // Desktop Control State
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<string | null>(null);
  const [screenPreview, setScreenPreview] = useState<string | null>(null);
  const [screenLoading, setScreenLoading] = useState(false);
  const [remoteCommand, setRemoteCommand] = useState('');
  const [remoteCommandResponse, setRemoteCommandResponse] = useState<string | null>(null);

  // Notification Modal State
  const [notifyDeviceId, setNotifyDeviceId] = useState<string | null>(null);
  const [notifyTitle, setNotifyTitle] = useState('JARVIS Broadcast');
  const [notifyMessage, setNotifyMessage] = useState('');

  const fetchDevices = async () => {
    try {
      setLoading(true);
      const res = await api.listDevices();
      if (Array.isArray(res)) {
        setDevices(res);
      }
    } catch (err) {
      console.error('Failed to load devices:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDevices();
    const interval = setInterval(fetchDevices, 8000);
    return () => clearInterval(interval);
  }, []);

  const handleStartPairing = async () => {
    try {
      setPairingLoading(true);
      setPairingError(null);
      const res = await api.startPairing();
      if (res && res.code) {
        setPairingData(res);
        setManualPairingId(res.pairingId);
      }
    } catch (err: any) {
      setPairingError(err.message || 'Failed to generate pairing code');
    } finally {
      setPairingLoading(false);
    }
  };

  // Auto-generate pairing credentials when entering the Pair tab
  useEffect(() => {
    if (activeTab === 'pair' && !pairingData && !pairingLoading) {
      handleStartPairing();
    }
  }, [activeTab]);

  // Generate crisp cybernetic QR code data URL whenever pairingUrl updates
  useEffect(() => {
    const targetUrl = pairingData?.pairingUrl;
    if (targetUrl) {
      QRCode.toDataURL(targetUrl, {
        width: 240,
        margin: 2,
        color: {
          dark: '#00e5ff',
          light: '#02060e',
        },
        errorCorrectionLevel: 'M',
      })
        .then((url) => setQrDataUrl(url))
        .catch((err) => {
          console.warn('Custom color QR failed, falling back:', err);
          QRCode.toDataURL(targetUrl, { width: 240, margin: 2 })
            .then((url) => setQrDataUrl(url))
            .catch((e) => console.error('Fallback QR failed:', e));
        });
    } else {
      setQrDataUrl('');
    }
  }, [pairingData?.pairingUrl]);

  const handleManualPair = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;

    try {
      setPairingLoading(true);
      setPairingError(null);
      setPairingSuccess(null);

      const targetPairingId = manualPairingId.trim() || pairingData?.pairingId;
      if (!targetPairingId) {
        setPairingError('Please start a pairing session first or enter the Pairing ID.');
        return;
      }

      const res = await api.completePairing(targetPairingId, manualCode.trim(), {
        name: manualName.trim() || 'Remote Device',
        platform: /iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'iOS' : /Android/i.test(navigator.userAgent) ? 'Android' : 'Web Browser',
        appVersion: '2.1.2',
      });

      if (res?.accessToken) {
        setPairingSuccess(`Successfully paired! Device ID: ${res.deviceId}`);
        setManualCode('');
        fetchDevices();
      }
    } catch (err: any) {
      setPairingError(err.message || 'Pairing verification failed');
    } finally {
      setPairingLoading(false);
    }
  };

  const handleRevokeDevice = async (deviceId: string) => {
    if (!confirm(`Revoke authorization for device [${deviceId}]? It will immediately lose access to JARVIS.`)) {
      return;
    }
    try {
      await api.revokeDevice(deviceId);
      fetchDevices();
    } catch (err) {
      console.error('Failed to revoke device:', err);
    }
  };

  const handlePingDevice = async (deviceId: string) => {
    try {
      await api.pingDevice(deviceId);
      fetchDevices();
    } catch (err) {
      console.error('Failed to ping device:', err);
    }
  };

  const fetchAndroidStatus = async () => {
    try {
      const res = await api.getAndroidStatus();
      if (res) {
        setAndroidEnv(res.environment);
        if (Array.isArray(res.devices)) {
          setAndroidDevices(res.devices);
          if (res.devices.length > 0 && !selectedAndroidId) {
            setSelectedAndroidId(res.devices[0].id);
          }
        }
      }
    } catch (err) {
      console.error('Failed to load Android status', err);
    }
  };

  useEffect(() => {
    if (activeTab === 'android') {
      fetchAndroidStatus();
      const interval = setInterval(fetchAndroidStatus, 3500);
      return () => clearInterval(interval);
    }
  }, [activeTab]);

  const getTargetSerial = () => selectedAndroidId || (androidDevices.length > 0 ? androidDevices[0].id : undefined);

  const handleLaunchScrcpy = async (fullscreen = false) => {
    try {
      setAndroidLoading(true);
      const serial = getTargetSerial();
      const res = await api.launchAndroidMirror({
        serial,
        fullscreen,
        stayAwake: true,
      });
      if (res?.success === false) {
        setAndroidActionFeedback(`Mirroring notice: ${res?.message || 'Could not launch window'}`);
      } else {
        setAndroidActionFeedback(res?.message || (fullscreen ? 'Fullscreen Mirror active' : 'Desktop Window active'));
      }
      setTimeout(() => setAndroidActionFeedback(null), 5000);
    } catch (err: any) {
      setAndroidActionFeedback(`Error: ${err.message}`);
      setTimeout(() => setAndroidActionFeedback(null), 5000);
    } finally {
      setAndroidLoading(false);
    }
  };

  const handleEnableWirelessAdb = async () => {
    try {
      setAndroidLoading(true);
      const serial = getTargetSerial();
      const res = await api.enableAndroidWireless(serial);
      setAndroidActionFeedback(res?.message || 'Wireless mode enabled on port 5555');
      if (res?.ip) {
        setWifiIpInput(`${res.ip}:5555`);
      }
      setTimeout(() => setAndroidActionFeedback(null), 5000);
      fetchAndroidStatus();
    } catch (err: any) {
      setAndroidActionFeedback(`Error: ${err.message}`);
      setTimeout(() => setAndroidActionFeedback(null), 4000);
    } finally {
      setAndroidLoading(false);
    }
  };

  const handleConnectWifi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wifiIpInput.trim()) return;
    try {
      setAndroidLoading(true);
      const res = await api.connectAndroidWifi(wifiIpInput.trim());
      setAndroidActionFeedback(res?.message || 'Connected to Android device wirelessly');
      setTimeout(() => setAndroidActionFeedback(null), 4000);
      fetchAndroidStatus();
    } catch (err: any) {
      setAndroidActionFeedback(`Error: ${err.message}`);
      setTimeout(() => setAndroidActionFeedback(null), 4000);
    } finally {
      setAndroidLoading(false);
    }
  };

  const handleSendAndroidKey = async (key: string) => {
    try {
      const serial = getTargetSerial();
      const res = await api.sendAndroidInput({ key, serial });
      setAndroidActionFeedback(res?.message || `Sent key ${key}`);
      setTimeout(() => setAndroidActionFeedback(null), 2500);
      setTimeout(() => handleCaptureAndroidScreen(), 500);
    } catch (err: any) {
      setAndroidActionFeedback(`Failed: ${err.message}`);
      setTimeout(() => setAndroidActionFeedback(null), 3000);
    }
  };

  const handleSendAndroidText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!textToType.trim()) return;
    try {
      const serial = getTargetSerial();
      const res = await api.sendAndroidInput({ text: textToType, serial });
      setAndroidActionFeedback(res?.message || `Typed text on phone`);
      setTextToType('');
      setTimeout(() => setAndroidActionFeedback(null), 2500);
      setTimeout(() => handleCaptureAndroidScreen(), 500);
    } catch (err: any) {
      setAndroidActionFeedback(`Failed: ${err.message}`);
      setTimeout(() => setAndroidActionFeedback(null), 3000);
    }
  };

  const handleLaunchApp = async (pkg: string) => {
    try {
      const serial = getTargetSerial();
      const res = await api.launchAndroidApp(pkg, serial);
      setAndroidActionFeedback(res?.message || `Triggered ${pkg}`);
      setTimeout(() => setAndroidActionFeedback(null), 3500);
      setTimeout(() => handleCaptureAndroidScreen(), 1200);
    } catch (err: any) {
      setAndroidActionFeedback(`Notice: ${err.message}`);
      setTimeout(() => setAndroidActionFeedback(null), 3500);
    }
  };

  const handleCaptureAndroidScreen = async () => {
    try {
      setAndroidScreenLoading(true);
      const serial = getTargetSerial();
      const res = await api.captureAndroidScreenshot(serial);
      if (res?.dataUrl) {
        setAndroidScreenDataUrl(res.dataUrl);
        setLastSnapshotTime(new Date().toLocaleTimeString());
      }
    } catch (err: any) {
      setAndroidActionFeedback(`Screenshot error: ${err.message}`);
      setTimeout(() => setAndroidActionFeedback(null), 3000);
    } finally {
      setAndroidScreenLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'android' && androidDevices.length > 0 && !androidScreenDataUrl && !androidScreenLoading) {
      handleCaptureAndroidScreen();
    }
  }, [activeTab, androidDevices.length]);

  useEffect(() => {
    let timer: any = null;
    if (activeTab === 'android' && androidLiveStream && androidDevices.length > 0) {
      timer = setInterval(() => {
        handleCaptureAndroidScreen();
      }, 2500);
    }
    return () => clearInterval(timer);
  }, [activeTab, androidLiveStream, androidDevices.length]);

  const handleExecuteControl = async (action: string, params: Record<string, any> = {}) => {
    try {
      setActionLoading(action);
      setActionResult(null);
      const res = await api.executeDesktopAction(action, params);
      setActionResult(`Executed ${action.toUpperCase()}: ${res?.details || 'OK'}`);
    } catch (err: any) {
      setActionResult(`Action failed: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCaptureScreen = async () => {
    try {
      setScreenLoading(true);
      const res = await api.captureScreen();
      const imageSrc = res?.dataUrl || (res?.base64 ? `data:image/png;base64,${res.base64}` : null);
      if (imageSrc) {
        setScreenPreview(imageSrc);
      }
    } catch (err: any) {
      setActionResult(`Screen capture failed: ${err.message}`);
    } finally {
      setScreenLoading(false);
    }
  };

  const handleSendRemoteCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!remoteCommand.trim()) return;

    try {
      setActionLoading('command');
      setRemoteCommandResponse(null);
      const res = await api.post('/chat', { message: remoteCommand.trim() });
      const respText = res?.response || res?.content || res?.data?.response || 'Command executed.';
      setRemoteCommandResponse(respText);
      setRemoteCommand('');
    } catch (err: any) {
      setRemoteCommandResponse(`Command error: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleSendNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notifyMessage.trim()) return;
    try {
      await api.post('/runtime/notify', {
        title: notifyTitle.trim() || 'JARVIS Broadcast',
        message: notifyMessage.trim(),
        priority: 'NORMAL',
      });
      setNotifyDeviceId(null);
      setNotifyMessage('');
    } catch (err) {
      console.error('Failed to send notification:', err);
    }
  };

  const getPlatformIcon = (platform: string) => {
    const p = (platform || '').toLowerCase();
    if (p.includes('ios') || p.includes('android') || p.includes('mobile') || p.includes('phone')) {
      return <Smartphone size={18} className="text-cyan" />;
    }
    if (p.includes('tab') || p.includes('ipad')) {
      return <Tablet size={18} className="text-cyan" />;
    }
    if (p.includes('win') || p.includes('mac') || p.includes('linux') || p.includes('desktop')) {
      return <Laptop size={18} className="text-cyan" />;
    }
    return <Globe size={18} className="text-cyan" />;
  };

  const activeCount = devices.filter((d) => !d.revokedAt).length;

  return (
    <div className="page-container" style={{ padding: '24px 32px', overflowY: 'auto' }}>
      {/* Header Banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Radio size={20} className="text-cyan" />
            <h1 style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '2px', color: '#00e5ff', margin: 0 }}>
              DEVICE FLEET & REMOTE CONTROL HUB
            </h1>
          </div>
          <p style={{ margin: '6px 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Pair mobile phones, secondary laptops, and tablets to control JARVIS and execute remote OS actions securely.
          </p>
        </div>

        {/* Global Telemetry Chips */}
        <div style={{ display: 'flex', gap: '12px' }}>
          <div
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
            }}
          >
            <Shield size={14} style={{ color: '#00ffc8' }} />
            <span style={{ color: 'var(--text-muted)' }}>AUTHORIZED FLEET:</span>
            <span style={{ color: '#00ffc8', fontWeight: 700 }}>{activeCount} ACTIVE</span>
          </div>

          <div
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
            }}
          >
            <Wifi size={14} style={{ color: wsConnected ? '#00e5ff' : '#ff3366' }} />
            <span style={{ color: 'var(--text-muted)' }}>GATEWAY:</span>
            <span style={{ color: wsConnected ? '#00e5ff' : '#ff3366', fontWeight: 700 }}>
              {wsConnected ? 'LINK ONLINE' : 'OFFLINE'}
            </span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div style={{ display: 'flex', gap: '10px', borderBottom: '1px solid var(--border-subtle)', marginBottom: '24px' }}>
        <button
          onClick={() => setActiveTab('fleet')}
          style={{
            padding: '10px 18px',
            background: activeTab === 'fleet' ? 'rgba(0, 229, 255, 0.12)' : 'transparent',
            border: 'none',
            borderBottom: activeTab === 'fleet' ? '2px solid #00e5ff' : '2px solid transparent',
            color: activeTab === 'fleet' ? '#00e5ff' : 'var(--text-secondary)',
            fontWeight: 700,
            fontSize: '12px',
            letterSpacing: '1px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s',
          }}
        >
          <Smartphone size={15} />
          PAIRED FLEET ({devices.length})
        </button>

        <button
          onClick={() => {
            setActiveTab('pair');
            if (!pairingData) handleStartPairing();
          }}
          style={{
            padding: '10px 18px',
            background: activeTab === 'pair' ? 'rgba(0, 229, 255, 0.12)' : 'transparent',
            border: 'none',
            borderBottom: activeTab === 'pair' ? '2px solid #00e5ff' : '2px solid transparent',
            color: activeTab === 'pair' ? '#00e5ff' : 'var(--text-secondary)',
            fontWeight: 700,
            fontSize: '12px',
            letterSpacing: '1px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s',
          }}
        >
          <QrCode size={15} />
          PAIR NEW DEVICE
        </button>

        <button
          onClick={() => setActiveTab('control')}
          style={{
            padding: '10px 18px',
            background: activeTab === 'control' ? 'rgba(0, 229, 255, 0.12)' : 'transparent',
            border: 'none',
            borderBottom: activeTab === 'control' ? '2px solid #00e5ff' : '2px solid transparent',
            color: activeTab === 'control' ? '#00e5ff' : 'var(--text-secondary)',
            fontWeight: 700,
            fontSize: '12px',
            letterSpacing: '1px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s',
          }}
        >
          <Zap size={15} />
          REMOTE DESKTOP CONTROLS
        </button>

        <button
          onClick={() => setActiveTab('android')}
          style={{
            padding: '10px 18px',
            background: activeTab === 'android' ? 'rgba(0, 229, 255, 0.12)' : 'transparent',
            border: 'none',
            borderBottom: activeTab === 'android' ? '2px solid #00e5ff' : '2px solid transparent',
            color: activeTab === 'android' ? '#00e5ff' : 'var(--text-secondary)',
            fontWeight: 700,
            fontSize: '12px',
            letterSpacing: '1px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s',
          }}
        >
          <Tv size={15} />
          ANDROID MIRROR & APP CONTROL
        </button>
      </div>

      {/* TAB 1: PAIRED FLEET */}
      {activeTab === 'fleet' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              AUTHORIZED DEVICES GRANTED ACCESS TO CORE & DESKTOP AGENT
            </span>
            <button
              onClick={fetchDevices}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '4px',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              <RefreshCw size={12} className={loading ? 'spin' : ''} />
              SYNC FLEET
            </button>
          </div>

          {devices.length === 0 ? (
            <div
              style={{
                padding: '48px',
                borderRadius: '8px',
                border: '1px dashed var(--border-subtle)',
                textAlign: 'center',
                background: 'rgba(3, 8, 16, 0.4)',
              }}
            >
              <Smartphone size={36} style={{ color: 'var(--text-muted)', marginBottom: '12px' }} />
              <h3 style={{ fontSize: '14px', color: '#ffffff', margin: '0 0 6px 0' }}>No Paired Devices Found</h3>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 16px 0' }}>
                Connect your mobile phone or secondary device to remotely monitor and command JARVIS from anywhere on your network.
              </p>
              <button
                onClick={() => {
                  setActiveTab('pair');
                  handleStartPairing();
                }}
                style={{
                  padding: '8px 18px',
                  borderRadius: '6px',
                  background: '#00e5ff',
                  color: '#020408',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                PAIR YOUR FIRST DEVICE
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
              {devices.map((device) => {
                const isRevoked = Boolean(device.revokedAt);
                const lastSeenTime = device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleTimeString() : 'Never';
                const isRecentlyActive =
                  device.lastSeenAt && Date.now() - new Date(device.lastSeenAt).getTime() < 120000;

                return (
                  <div
                    key={device.id}
                    style={{
                      background: 'rgba(5, 12, 24, 0.85)',
                      backdropFilter: 'blur(12px)',
                      border: `1px solid ${isRevoked ? 'rgba(255, 51, 102, 0.4)' : isRecentlyActive ? 'rgba(0, 229, 255, 0.5)' : 'var(--border-subtle)'}`,
                      borderRadius: '8px',
                      padding: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      boxShadow: isRecentlyActive ? '0 0 16px rgba(0, 229, 255, 0.15)' : 'none',
                    }}
                  >
                    <div>
                      {/* Top Row: Icon + Name + Badge */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div
                            style={{
                              padding: '8px',
                              borderRadius: '6px',
                              background: isRevoked ? 'rgba(255, 51, 102, 0.15)' : 'rgba(0, 229, 255, 0.15)',
                              border: `1px solid ${isRevoked ? '#ff3366' : '#00e5ff'}`,
                            }}
                          >
                            {getPlatformIcon(device.platform)}
                          </div>
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff' }}>
                              {device.name || 'Unnamed Device'}
                            </div>
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                              ID: {device.id}
                            </div>
                          </div>
                        </div>

                        {/* Status Badge */}
                        <span
                          style={{
                            fontSize: '9px',
                            fontWeight: 800,
                            letterSpacing: '1px',
                            padding: '3px 8px',
                            borderRadius: '12px',
                            fontFamily: 'var(--font-mono)',
                            background: isRevoked
                              ? 'rgba(255, 51, 102, 0.2)'
                              : isRecentlyActive
                              ? 'rgba(0, 255, 200, 0.2)'
                              : 'rgba(255, 255, 255, 0.1)',
                            color: isRevoked ? '#ff3366' : isRecentlyActive ? '#00ffc8' : 'var(--text-muted)',
                            border: `1px solid ${isRevoked ? '#ff3366' : isRecentlyActive ? '#00ffc8' : 'rgba(255, 255, 255, 0.2)'}`,
                          }}
                        >
                          {isRevoked ? 'REVOKED' : isRecentlyActive ? 'ONLINE' : 'STANDBY'}
                        </span>
                      </div>

                      {/* Device Meta */}
                      <div
                        style={{
                          background: 'rgba(2, 6, 14, 0.6)',
                          borderRadius: '6px',
                          padding: '10px',
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr',
                          gap: '8px',
                          fontSize: '11px',
                          fontFamily: 'var(--font-mono)',
                          marginBottom: '14px',
                        }}
                      >
                        <div>
                          <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '9px' }}>PLATFORM</span>
                          <span style={{ color: '#00e5ff' }}>{device.platform}</span>
                        </div>
                        <div>
                          <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '9px' }}>LAST ACTIVITY</span>
                          <span style={{ color: '#ffffff' }}>{lastSeenTime}</span>
                        </div>
                        <div>
                          <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '9px' }}>VERSION</span>
                          <span style={{ color: 'var(--text-secondary)' }}>v{device.appVersion || '2.1.2'}</span>
                        </div>
                        <div>
                          <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '9px' }}>PERMISSIONS</span>
                          <span style={{ color: '#00ffc8' }}>VOICE & DESKTOP</span>
                        </div>
                      </div>
                    </div>

                    {/* Actions Row */}
                    <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }}>
                      {!isRevoked ? (
                        <>
                          <button
                            onClick={() => handlePingDevice(device.id)}
                            style={{
                              flex: 1,
                              padding: '6px',
                              borderRadius: '4px',
                              background: 'rgba(0, 229, 255, 0.1)',
                              border: '1px solid rgba(0, 229, 255, 0.3)',
                              color: '#00e5ff',
                              fontSize: '10px',
                              fontFamily: 'var(--font-mono)',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '4px',
                            }}
                          >
                            <Radio size={12} />
                            PING
                          </button>

                          <button
                            onClick={() => setNotifyDeviceId(device.id)}
                            style={{
                              flex: 1,
                              padding: '6px',
                              borderRadius: '4px',
                              background: 'rgba(0, 255, 200, 0.1)',
                              border: '1px solid rgba(0, 255, 200, 0.3)',
                              color: '#00ffc8',
                              fontSize: '10px',
                              fontFamily: 'var(--font-mono)',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '4px',
                            }}
                          >
                            <Send size={12} />
                            NOTIFY
                          </button>

                          <button
                            onClick={() => handleRevokeDevice(device.id)}
                            style={{
                              padding: '6px 10px',
                              borderRadius: '4px',
                              background: 'rgba(255, 51, 102, 0.1)',
                              border: '1px solid rgba(255, 51, 102, 0.3)',
                              color: '#ff3366',
                              fontSize: '10px',
                              cursor: 'pointer',
                            }}
                            title="Revoke Device Access"
                          >
                            <Trash2 size={12} />
                          </button>
                        </>
                      ) : (
                        <div style={{ fontSize: '10px', color: '#ff3366', fontFamily: 'var(--font-mono)', padding: '4px 0' }}>
                          ● Device credentials cryptographically revoked
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: PAIR NEW DEVICE */}
      {activeTab === 'pair' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px' }}>
          {/* Left Column: QR Code & Code Display */}
          <div
            style={{
              background: 'rgba(5, 12, 24, 0.85)',
              border: '1px solid rgba(0, 229, 255, 0.35)',
              borderRadius: '10px',
              padding: '24px',
              backdropFilter: 'blur(16px)',
              boxShadow: '0 0 24px rgba(0, 229, 255, 0.12)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <QrCode size={18} className="text-cyan" />
                <span style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '1.5px', color: '#00e5ff' }}>
                  PAIRING STATION
                </span>
              </div>
              <button
                onClick={handleStartPairing}
                disabled={pairingLoading}
                style={{
                  padding: '4px 10px',
                  borderRadius: '4px',
                  background: 'rgba(0, 229, 255, 0.15)',
                  border: '1px solid #00e5ff',
                  color: '#00e5ff',
                  fontSize: '10px',
                  fontFamily: 'var(--font-mono)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <RefreshCw size={11} className={pairingLoading ? 'spin' : ''} />
                NEW CODE
              </button>
            </div>

            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 20px 0', lineHeight: 1.5 }}>
              Scan the QR code or enter the 6-digit security PIN on your phone or remote client. Both devices must be on the same local network or VPN.
            </p>

            {pairingData ? (
              <div style={{ textAlign: 'center' }}>
                {/* Cybernetic QR Code Display Card */}
                <div style={{ marginBottom: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div
                    style={{
                      position: 'relative',
                      padding: '16px',
                      background: 'rgba(2, 6, 14, 0.95)',
                      borderRadius: '12px',
                      border: '1.5px solid rgba(0, 229, 255, 0.45)',
                      boxShadow: '0 0 28px rgba(0, 229, 255, 0.2), inset 0 0 16px rgba(0, 229, 255, 0.08)',
                      display: 'inline-flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                    }}
                  >
                    {/* Corner targeting reticles */}
                    <div style={{ position: 'absolute', top: '-1px', left: '-1px', width: '12px', height: '12px', borderTop: '2px solid #00e5ff', borderLeft: '2px solid #00e5ff' }} />
                    <div style={{ position: 'absolute', top: '-1px', right: '-1px', width: '12px', height: '12px', borderTop: '2px solid #00e5ff', borderRight: '2px solid #00e5ff' }} />
                    <div style={{ position: 'absolute', bottom: '-1px', left: '-1px', width: '12px', height: '12px', borderBottom: '2px solid #00e5ff', borderLeft: '2px solid #00e5ff' }} />
                    <div style={{ position: 'absolute', bottom: '-1px', right: '-1px', width: '12px', height: '12px', borderBottom: '2px solid #00e5ff', borderRight: '2px solid #00e5ff' }} />

                    {qrDataUrl ? (
                      <img
                        src={qrDataUrl}
                        alt="JARVIS Pairing QR Code"
                        style={{
                          width: '180px',
                          height: '180px',
                          borderRadius: '6px',
                          display: 'block',
                          border: '1px solid rgba(0, 229, 255, 0.3)',
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: '180px',
                          height: '180px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'var(--text-muted)',
                          fontSize: '11px',
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        GENERATING SECURE QR...
                      </div>
                    )}

                    <div
                      style={{
                        marginTop: '10px',
                        fontSize: '10px',
                        fontWeight: 700,
                        letterSpacing: '1px',
                        color: '#00e5ff',
                        fontFamily: 'var(--font-mono)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <QrCode size={12} />
                      <span>POINT CAMERA OR COMPANION APP TO SCAN</span>
                    </div>
                  </div>
                </div>

                {/* Divider between QR and PIN */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', margin: '0 auto 16px', maxWidth: '320px' }}>
                  <div style={{ flex: 1, height: '1px', background: 'rgba(0, 229, 255, 0.2)' }} />
                  <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', letterSpacing: '1px' }}>
                    OR ENTER 6-DIGIT PIN
                  </span>
                  <div style={{ flex: 1, height: '1px', background: 'rgba(0, 229, 255, 0.2)' }} />
                </div>

                {/* Visual PIN Display */}
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '12px 24px',
                    borderRadius: '8px',
                    background: 'rgba(0, 229, 255, 0.08)',
                    border: '1px solid #00e5ff',
                    boxShadow: '0 0 20px rgba(0, 229, 255, 0.25)',
                    marginBottom: '20px',
                  }}
                >
                  {pairingData.code.split('').map((char, i) => (
                    <span
                      key={i}
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '24px',
                        fontWeight: 800,
                        color: '#ffffff',
                        background: 'rgba(2, 6, 14, 0.8)',
                        padding: '6px 12px',
                        borderRadius: '4px',
                        border: '1px solid rgba(0, 229, 255, 0.4)',
                        textShadow: '0 0 8px rgba(0, 229, 255, 0.8)',
                      }}
                    >
                      {char}
                    </span>
                  ))}
                </div>

                {/* Expiration Tag */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '11px', marginBottom: '20px' }}>
                  <Clock size={13} />
                  <span>EXPIRES IN 15 MINUTES ({new Date(pairingData.expiresAt).toLocaleTimeString()})</span>
                </div>

                {/* Direct Companion URL */}
                {pairingData.pairingUrl && (
                  <div
                    style={{
                      background: 'rgba(2, 6, 14, 0.7)',
                      borderRadius: '6px',
                      padding: '12px',
                      textAlign: 'left',
                      border: '1px solid var(--border-subtle)',
                      marginBottom: '16px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                        DIRECT COMPANION WEB LINK
                      </span>
                      <button
                        onClick={() => {
                          if (pairingData.pairingUrl) {
                            navigator.clipboard.writeText(pairingData.pairingUrl);
                            setCopiedUrl(true);
                            setTimeout(() => setCopiedUrl(false), 2000);
                          }
                        }}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: copiedUrl ? '#00ffc8' : '#00e5ff',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '10px',
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        {copiedUrl ? <Check size={12} /> : <Copy size={12} />}
                        {copiedUrl ? 'COPIED' : 'COPY'}
                      </button>
                    </div>

                    <div
                      style={{
                        fontSize: '11px',
                        color: '#00e5ff',
                        fontFamily: 'var(--font-mono)',
                        wordBreak: 'break-all',
                        background: 'rgba(0, 0, 0, 0.4)',
                        padding: '6px 8px',
                        borderRadius: '4px',
                      }}
                    >
                      {pairingData.pairingUrl}
                    </div>

                    <div style={{ marginTop: '10px', display: 'flex', gap: '10px' }}>
                      <a
                        href={pairingData.pairingUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '11px',
                          color: '#00ffc8',
                          textDecoration: 'none',
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        <ExternalLink size={12} />
                        Open Companion App in New Tab
                      </a>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <button
                  onClick={handleStartPairing}
                  style={{
                    padding: '10px 24px',
                    borderRadius: '6px',
                    background: '#00e5ff',
                    color: '#020408',
                    border: 'none',
                    fontWeight: 800,
                    fontSize: '13px',
                    cursor: 'pointer',
                    boxShadow: '0 0 16px rgba(0, 229, 255, 0.4)',
                  }}
                >
                  INITIALIZE PAIRING SESSION
                </button>
              </div>
            )}
          </div>

          {/* Right Column: Enter Code Manually */}
          <div
            style={{
              background: 'rgba(5, 12, 24, 0.85)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '10px',
              padding: '24px',
              backdropFilter: 'blur(16px)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <Shield size={18} className="text-cyan" />
              <span style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '1.5px', color: '#ffffff' }}>
                VERIFY & COMPLETE PAIRING
              </span>
            </div>

            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 20px 0', lineHeight: 1.5 }}>
              If you have a 6-digit code from another instance or want to pair this terminal, submit the code below.
            </p>

            <form onSubmit={handleManualPair}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px', fontFamily: 'var(--font-mono)' }}>
                  DEVICE DISPLAY NAME
                </label>
                <input
                  type="text"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  placeholder="e.g. Pixel 9 Pro, Living Room iPad"
                  style={{
                    width: '100%',
                    background: 'rgba(2, 6, 14, 0.8)',
                    border: '1px solid var(--border-subtle)',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    color: '#ffffff',
                    fontSize: '12px',
                    fontFamily: 'var(--font-mono)',
                    outline: 'none',
                  }}
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px', fontFamily: 'var(--font-mono)' }}>
                  6-DIGIT SECURITY PIN
                </label>
                <input
                  type="text"
                  maxLength={6}
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  style={{
                    width: '100%',
                    background: 'rgba(2, 6, 14, 0.8)',
                    border: '1px solid rgba(0, 229, 255, 0.4)',
                    padding: '10px 12px',
                    borderRadius: '6px',
                    color: '#00e5ff',
                    fontSize: '20px',
                    fontFamily: 'var(--font-mono)',
                    letterSpacing: '8px',
                    textAlign: 'center',
                    fontWeight: 700,
                    outline: 'none',
                  }}
                />
              </div>

              {pairingError && (
                <div style={{ padding: '8px 12px', borderRadius: '4px', background: 'rgba(255, 51, 102, 0.15)', border: '1px solid #ff3366', color: '#ff3366', fontSize: '11px', marginBottom: '16px' }}>
                  {pairingError}
                </div>
              )}

              {pairingSuccess && (
                <div style={{ padding: '8px 12px', borderRadius: '4px', background: 'rgba(0, 255, 200, 0.15)', border: '1px solid #00ffc8', color: '#00ffc8', fontSize: '11px', marginBottom: '16px' }}>
                  {pairingSuccess}
                </div>
              )}

              <button
                type="submit"
                disabled={pairingLoading || manualCode.length < 6}
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '6px',
                  background: manualCode.length >= 6 ? '#00e5ff' : 'rgba(0, 229, 255, 0.2)',
                  color: manualCode.length >= 6 ? '#020408' : 'rgba(255, 255, 255, 0.4)',
                  border: 'none',
                  fontWeight: 800,
                  fontSize: '12px',
                  letterSpacing: '1px',
                  cursor: manualCode.length >= 6 ? 'pointer' : 'default',
                  transition: 'all 0.2s',
                }}
              >
                {pairingLoading ? 'AUTHORIZING...' : 'CONFIRM PAIRING'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* TAB 3: REMOTE DESKTOP CONTROLS */}
      {activeTab === 'control' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px' }}>
          {/* Quick System Action Cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div
              style={{
                background: 'rgba(5, 12, 24, 0.85)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                padding: '20px',
                backdropFilter: 'blur(16px)',
              }}
            >
              <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '1.5px', color: '#00e5ff', marginBottom: '14px' }}>
                AUDIO & MEDIA PLAYBACK CONTROLS
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                <button
                  onClick={() => handleExecuteControl('volume_up')}
                  disabled={actionLoading !== null}
                  style={{
                    padding: '12px',
                    borderRadius: '6px',
                    background: 'rgba(2, 6, 14, 0.8)',
                    border: '1px solid rgba(0, 229, 255, 0.25)',
                    color: '#ffffff',
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <Volume2 size={18} style={{ color: '#00e5ff' }} />
                  <span>VOL +</span>
                </button>

                <button
                  onClick={() => handleExecuteControl('volume_down')}
                  disabled={actionLoading !== null}
                  style={{
                    padding: '12px',
                    borderRadius: '6px',
                    background: 'rgba(2, 6, 14, 0.8)',
                    border: '1px solid rgba(0, 229, 255, 0.25)',
                    color: '#ffffff',
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <Volume1 size={18} style={{ color: '#00e5ff' }} />
                  <span>VOL -</span>
                </button>

                <button
                  onClick={() => handleExecuteControl('volume_mute')}
                  disabled={actionLoading !== null}
                  style={{
                    padding: '12px',
                    borderRadius: '6px',
                    background: 'rgba(2, 6, 14, 0.8)',
                    border: '1px solid rgba(255, 51, 102, 0.3)',
                    color: '#ffffff',
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <VolumeX size={18} style={{ color: '#ff3366' }} />
                  <span>MUTE / UNMUTE</span>
                </button>
              </div>

              <div style={{ marginTop: '12px' }}>
                <button
                  onClick={() => handleExecuteControl('media_play_pause')}
                  disabled={actionLoading !== null}
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '6px',
                    background: 'rgba(0, 255, 200, 0.1)',
                    border: '1px solid rgba(0, 255, 200, 0.4)',
                    color: '#00ffc8',
                    fontSize: '12px',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                  }}
                >
                  <Play size={14} />
                  <span>TOGGLE MEDIA PLAY / PAUSE (SPOTIFY / YOUTUBE)</span>
                </button>
              </div>
            </div>

            {/* Workstation Security Controls */}
            <div
              style={{
                background: 'rgba(5, 12, 24, 0.85)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                padding: '20px',
                backdropFilter: 'blur(16px)',
              }}
            >
              <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '1.5px', color: '#ff3366', marginBottom: '14px' }}>
                OS WORKSTATION SECURITY
              </div>

              <button
                onClick={() => handleExecuteControl('lock_workstation')}
                disabled={actionLoading !== null}
                style={{
                  width: '100%',
                  padding: '14px',
                  borderRadius: '6px',
                  background: 'rgba(255, 51, 102, 0.15)',
                  border: '1px solid #ff3366',
                  color: '#ff3366',
                  fontSize: '12px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 800,
                  letterSpacing: '1px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 0 16px rgba(255, 51, 102, 0.2)',
                }}
              >
                <Lock size={15} />
                <span>LOCK HOST WORKSTATION (WINDOWS SESSION)</span>
              </button>
            </div>

            {/* Remote Command Shell */}
            <div
              style={{
                background: 'rgba(5, 12, 24, 0.85)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                padding: '20px',
                backdropFilter: 'blur(16px)',
              }}
            >
              <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '1.5px', color: '#00e5ff', marginBottom: '14px' }}>
                DISPATCH REMOTE AI COMMAND
              </div>

              <form onSubmit={handleSendRemoteCommand}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    value={remoteCommand}
                    onChange={(e) => setRemoteCommand(e.target.value)}
                    placeholder="e.g. Check system disk space, open browser..."
                    style={{
                      flex: 1,
                      background: 'rgba(2, 6, 14, 0.8)',
                      border: '1px solid var(--border-subtle)',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      color: '#ffffff',
                      fontSize: '11px',
                      fontFamily: 'var(--font-mono)',
                      outline: 'none',
                    }}
                  />
                  <button
                    type="submit"
                    disabled={actionLoading !== null || !remoteCommand.trim()}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '6px',
                      background: '#00e5ff',
                      color: '#020408',
                      border: 'none',
                      fontWeight: 700,
                      fontSize: '11px',
                      cursor: 'pointer',
                    }}
                  >
                    SEND
                  </button>
                </div>
              </form>

              {remoteCommandResponse && (
                <div
                  style={{
                    marginTop: '12px',
                    padding: '10px',
                    borderRadius: '4px',
                    background: 'rgba(0, 0, 0, 0.5)',
                    border: '1px solid rgba(0, 229, 255, 0.2)',
                    fontSize: '11px',
                    color: '#D9F8FF',
                    fontFamily: 'var(--font-mono)',
                    lineHeight: 1.5,
                  }}
                >
                  {remoteCommandResponse}
                </div>
              )}
            </div>

            {actionResult && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: '6px',
                  background: 'rgba(0, 229, 255, 0.1)',
                  border: '1px solid #00e5ff',
                  color: '#00e5ff',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {actionResult}
              </div>
            )}
          </div>

          {/* Right Column: Live Screen Capture Mirror */}
          <div
            style={{
              background: 'rgba(5, 12, 24, 0.85)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '8px',
              padding: '20px',
              backdropFilter: 'blur(16px)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Camera size={16} className="text-cyan" />
                <span style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '1.5px', color: '#00e5ff' }}>
                  HOST DISPLAY SNAPSHOT
                </span>
              </div>
              <button
                onClick={handleCaptureScreen}
                disabled={screenLoading}
                style={{
                  padding: '4px 10px',
                  borderRadius: '4px',
                  background: 'rgba(0, 229, 255, 0.15)',
                  border: '1px solid #00e5ff',
                  color: '#00e5ff',
                  fontSize: '10px',
                  fontFamily: 'var(--font-mono)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <RefreshCw size={11} className={screenLoading ? 'spin' : ''} />
                CAPTURE
              </button>
            </div>

            <div
              style={{
                flex: 1,
                minHeight: '260px',
                background: '#020408',
                borderRadius: '6px',
                border: '1px solid var(--border-subtle)',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
              }}
            >
              {screenPreview ? (
                <img
                  src={screenPreview}
                  alt="Host Display"
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
              ) : (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                  <Camera size={32} style={{ marginBottom: '8px', opacity: 0.5 }} />
                  <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)' }}>NO SNAPSHOT LOADED</div>
                  <div style={{ fontSize: '9px', marginTop: '4px' }}>Click Capture to view real-time host screen</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: ANDROID FULL SCREEN MIRRORING & APP CONTROL */}
      {activeTab === 'android' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Top Status & Environment Bar */}
          <div
            style={{
              background: 'rgba(5, 12, 24, 0.85)',
              border: '1px solid rgba(0, 229, 255, 0.35)',
              borderRadius: '8px',
              padding: '16px 20px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px',
              boxShadow: '0 0 20px rgba(0, 229, 255, 0.1)',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Tv size={18} className="text-cyan" />
                <span style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '1.5px', color: '#00e5ff' }}>
                  HOLOGRAPHIC ANDROID MIRROR & CONTROL STATION
                </span>
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--text-secondary)' }}>
                Direct full-screen display mirroring, mouse & keyboard touch simulation, and wireless ADB control.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  padding: '4px 10px',
                  borderRadius: '12px',
                  background: androidEnv?.adbAvailable ? 'rgba(0, 255, 200, 0.15)' : 'rgba(255, 82, 82, 0.15)',
                  border: `1px solid ${androidEnv?.adbAvailable ? '#00ffc8' : '#ff5252'}`,
                  color: androidEnv?.adbAvailable ? '#00ffc8' : '#ff5252',
                  fontSize: '10px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <Check size={11} />
                {androidEnv?.adbAvailable ? 'ADB SERVER READY' : 'ADB DETECTING'}
              </div>

              <div
                style={{
                  padding: '4px 10px',
                  borderRadius: '12px',
                  background: androidEnv?.scrcpyAvailable ? 'rgba(0, 229, 255, 0.15)' : 'rgba(255, 82, 82, 0.15)',
                  border: `1px solid ${androidEnv?.scrcpyAvailable ? '#00e5ff' : '#ff5252'}`,
                  color: androidEnv?.scrcpyAvailable ? '#00e5ff' : '#ff5252',
                  fontSize: '10px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <Check size={11} />
                {androidEnv?.scrcpyAvailable ? 'SCRCPY v4.1 READY' : 'SCRCPY DETECTING'}
              </div>

              <button
                onClick={fetchAndroidStatus}
                style={{
                  padding: '5px 10px',
                  borderRadius: '4px',
                  background: 'rgba(2, 6, 14, 0.8)',
                  border: '1px solid var(--border-subtle)',
                  color: '#00e5ff',
                  fontSize: '10px',
                  fontFamily: 'var(--font-mono)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <RefreshCw size={11} />
                REFRESH
              </button>
            </div>
          </div>

          {/* Action Feedback Banner */}
          {androidActionFeedback && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '6px',
                background: 'rgba(0, 229, 255, 0.15)',
                border: '1px solid #00e5ff',
                color: '#00e5ff',
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 0 16px rgba(0, 229, 255, 0.2)',
              }}
            >
              <Zap size={13} />
              <span>{androidActionFeedback}</span>
            </div>
          )}

          {/* Android Phone Telephony & Notification Bridge */}
          <AndroidTelephonyBridge serial={selectedAndroidId || undefined} />

          {/* Main Content Split: Left Controls + Right Live Snapshot */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '24px' }}>
            {/* Left Column: Device Selector & Interactive Action Pads */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Connected Devices Card / Quick Selector */}
              <div
                style={{
                  background: 'rgba(5, 12, 24, 0.85)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '8px',
                  padding: '18px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Smartphone size={16} className="text-cyan" />
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#ffffff', letterSpacing: '1px' }}>
                      TARGET ANDROID DEVICE
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: '10px',
                      fontFamily: 'var(--font-mono)',
                      color: androidDevices.length > 0 ? '#00ffc8' : '#ffd600',
                      padding: '2px 8px',
                      borderRadius: '10px',
                      background: androidDevices.length > 0 ? 'rgba(0, 255, 200, 0.1)' : 'rgba(255, 214, 0, 0.1)',
                      border: `1px solid ${androidDevices.length > 0 ? '#00ffc8' : '#ffd600'}`,
                    }}
                  >
                    {androidDevices.length > 0 ? `${androidDevices.length} CONNECTED` : 'WAITING FOR CONNECTION'}
                  </span>
                </div>

                {androidDevices.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {androidDevices.map((d) => (
                      <div
                        key={d.id}
                        onClick={() => setSelectedAndroidId(d.id)}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '10px 14px',
                          borderRadius: '6px',
                          background: selectedAndroidId === d.id ? 'rgba(0, 229, 255, 0.15)' : 'rgba(2, 6, 14, 0.7)',
                          border: `1px solid ${selectedAndroidId === d.id ? '#00e5ff' : 'var(--border-subtle)'}`,
                          cursor: 'pointer',
                          boxShadow: selectedAndroidId === d.id ? '0 0 12px rgba(0, 229, 255, 0.25)' : 'none',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <Smartphone size={18} style={{ color: selectedAndroidId === d.id ? '#00e5ff' : 'var(--text-muted)' }} />
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff' }}>{d.model}</div>
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                              Serial: {d.id} {d.androidVersion ? `• ${d.androidVersion}` : ''}
                            </div>
                          </div>
                        </div>

                        <span
                          style={{
                            fontSize: '9px',
                            fontWeight: 800,
                            fontFamily: 'var(--font-mono)',
                            color: d.state === 'device' ? '#00ffc8' : '#ff3366',
                            background: d.state === 'device' ? 'rgba(0, 255, 200, 0.15)' : 'rgba(255, 51, 102, 0.15)',
                            padding: '3px 8px',
                            borderRadius: '10px',
                            border: `1px solid ${d.state === 'device' ? '#00ffc8' : '#ff3366'}`,
                          }}
                        >
                          {d.state.toUpperCase()} {d.isWireless ? '(WI-FI)' : '(USB)'}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div
                    style={{
                      background: 'rgba(2, 6, 14, 0.7)',
                      borderRadius: '6px',
                      padding: '14px',
                      border: '1px solid rgba(255, 214, 0, 0.3)',
                    }}
                  >
                    <div style={{ color: '#ffd600', fontSize: '11px', fontWeight: 700, marginBottom: '8px' }}>
                      HOW TO CONNECT YOUR ANDROID PHONE IN 3 STEPS:
                    </div>
                    <ol style={{ margin: 0, paddingLeft: '18px', fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                      <li>
                        On your phone, go to <b>Settings &gt; About Phone</b> and tap <b>Build Number</b> 7 times to enable Developer Mode.
                      </li>
                      <li>
                        In <b>Settings &gt; System &gt; Developer Options</b>, enable <b>USB Debugging</b>.
                      </li>
                      <li>
                        Plug your phone into this PC using a USB cable, and tap <b>"Always allow from this computer"</b> when prompted.
                      </li>
                    </ol>

                    <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--border-subtle)' }}>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: '6px' }}>
                        OR CONNECT WIRELESSLY VIA IP:PORT (IF WIRELESS DEBUGGING IS ON)
                      </div>
                      <form onSubmit={handleConnectWifi} style={{ display: 'flex', gap: '8px' }}>
                        <input
                          type="text"
                          value={wifiIpInput}
                          onChange={(e) => setWifiIpInput(e.target.value)}
                          placeholder="e.g. 192.168.1.5:5555"
                          style={{
                            flex: 1,
                            padding: '6px 10px',
                            borderRadius: '4px',
                            background: 'rgba(0, 0, 0, 0.6)',
                            border: '1px solid var(--border-subtle)',
                            color: '#00e5ff',
                            fontSize: '11px',
                            fontFamily: 'var(--font-mono)',
                          }}
                        />
                        <button
                          type="submit"
                          disabled={androidLoading || !wifiIpInput.trim()}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '4px',
                            background: '#00e5ff',
                            color: '#020408',
                            border: 'none',
                            fontWeight: 700,
                            fontSize: '11px',
                            cursor: 'pointer',
                          }}
                        >
                          CONNECT
                        </button>
                      </form>
                    </div>
                  </div>
                )}
              </div>

              {/* Primary Mirroring Launch Actions */}
              <div
                style={{
                  background: 'rgba(5, 12, 24, 0.85)',
                  border: '1px solid rgba(0, 229, 255, 0.35)',
                  borderRadius: '8px',
                  padding: '18px',
                  boxShadow: '0 0 16px rgba(0, 229, 255, 0.1)',
                }}
              >
                <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1px', color: '#00e5ff', marginBottom: '12px' }}>
                  HOLOGRAPHIC SCREEN MIRRORING ENGINES
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                  <button
                    onClick={() => handleLaunchScrcpy(true)}
                    disabled={androidLoading}
                    style={{
                      padding: '12px',
                      borderRadius: '6px',
                      background: '#00e5ff',
                      color: '#020408',
                      border: 'none',
                      fontWeight: 800,
                      fontSize: '11px',
                      fontFamily: 'var(--font-mono)',
                      letterSpacing: '1px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      boxShadow: '0 0 16px rgba(0, 229, 255, 0.4)',
                    }}
                  >
                    <Maximize2 size={14} />
                    FULLSCREEN MIRROR
                  </button>

                  <button
                    onClick={() => handleLaunchScrcpy(false)}
                    disabled={androidLoading}
                    style={{
                      padding: '12px',
                      borderRadius: '6px',
                      background: 'rgba(0, 229, 255, 0.15)',
                      color: '#00e5ff',
                      border: '1px solid #00e5ff',
                      fontWeight: 800,
                      fontSize: '11px',
                      fontFamily: 'var(--font-mono)',
                      letterSpacing: '1px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                    }}
                  >
                    <Tv size={14} />
                    DESKTOP WINDOW
                  </button>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <button
                    onClick={handleEnableWirelessAdb}
                    disabled={androidLoading}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '4px',
                      background: 'rgba(0, 255, 200, 0.1)',
                      border: '1px solid #00ffc8',
                      color: '#00ffc8',
                      fontSize: '10px',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <Wifi size={12} />
                    ENABLE WIRELESS ADB (PORT 5555)
                  </button>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    High-framerate 60FPS • Zero latency mouse/touch control
                  </span>
                </div>
              </div>

              {/* Hardware & OS Navigation Buttons */}
              <div
                style={{
                  background: 'rgba(5, 12, 24, 0.85)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '8px',
                  padding: '18px',
                }}
              >
                <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1px', color: '#ffffff', marginBottom: '12px' }}>
                  OS NAVIGATION & HARDWARE CONTROLS
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px', marginBottom: '12px' }}>
                  <button
                    onClick={() => handleSendAndroidKey('BACK')}
                    style={{
                      padding: '8px',
                      borderRadius: '4px',
                      background: 'rgba(2, 6, 14, 0.8)',
                      border: '1px solid var(--border-subtle)',
                      color: '#ffffff',
                      fontSize: '10px',
                      fontFamily: 'var(--font-mono)',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <ArrowLeft size={14} className="text-cyan" />
                    BACK
                  </button>

                  <button
                    onClick={() => handleSendAndroidKey('HOME')}
                    style={{
                      padding: '8px',
                      borderRadius: '4px',
                      background: 'rgba(2, 6, 14, 0.8)',
                      border: '1px solid var(--border-subtle)',
                      color: '#ffffff',
                      fontSize: '10px',
                      fontFamily: 'var(--font-mono)',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <Home size={14} className="text-cyan" />
                    HOME
                  </button>

                  <button
                    onClick={() => handleSendAndroidKey('APP_SWITCH')}
                    style={{
                      padding: '8px',
                      borderRadius: '4px',
                      background: 'rgba(2, 6, 14, 0.8)',
                      border: '1px solid var(--border-subtle)',
                      color: '#ffffff',
                      fontSize: '10px',
                      fontFamily: 'var(--font-mono)',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <Layers size={14} className="text-cyan" />
                    RECENTS
                  </button>

                  <button
                    onClick={() => handleSendAndroidKey('NOTIFICATION')}
                    style={{
                      padding: '8px',
                      borderRadius: '4px',
                      background: 'rgba(2, 6, 14, 0.8)',
                      border: '1px solid var(--border-subtle)',
                      color: '#ffffff',
                      fontSize: '10px',
                      fontFamily: 'var(--font-mono)',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <Bell size={14} style={{ color: '#ffd600' }} />
                    NOTIFY
                  </button>

                  <button
                    onClick={() => handleSendAndroidKey('POWER')}
                    style={{
                      padding: '8px',
                      borderRadius: '4px',
                      background: 'rgba(255, 51, 102, 0.1)',
                      border: '1px solid rgba(255, 51, 102, 0.3)',
                      color: '#ff3366',
                      fontSize: '10px',
                      fontFamily: 'var(--font-mono)',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <Power size={14} />
                    POWER
                  </button>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => handleSendAndroidKey('VOLUME_UP')}
                    style={{
                      flex: 1,
                      padding: '6px',
                      borderRadius: '4px',
                      background: 'rgba(2, 6, 14, 0.8)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-secondary)',
                      fontSize: '10px',
                      fontFamily: 'var(--font-mono)',
                      cursor: 'pointer',
                    }}
                  >
                    VOL +
                  </button>
                  <button
                    onClick={() => handleSendAndroidKey('VOLUME_DOWN')}
                    style={{
                      flex: 1,
                      padding: '6px',
                      borderRadius: '4px',
                      background: 'rgba(2, 6, 14, 0.8)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-secondary)',
                      fontSize: '10px',
                      fontFamily: 'var(--font-mono)',
                      cursor: 'pointer',
                    }}
                  >
                    VOL -
                  </button>
                  <button
                    onClick={() => handleSendAndroidKey('WAKE')}
                    style={{
                      flex: 1,
                      padding: '6px',
                      borderRadius: '4px',
                      background: 'rgba(2, 6, 14, 0.8)',
                      border: '1px solid var(--border-subtle)',
                      color: '#00ffc8',
                      fontSize: '10px',
                      fontFamily: 'var(--font-mono)',
                      cursor: 'pointer',
                    }}
                  >
                    WAKE SCREEN
                  </button>
                </div>
              </div>

              {/* Type Text directly into phone keyboard */}
              <div
                style={{
                  background: 'rgba(5, 12, 24, 0.85)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '8px',
                  padding: '16px',
                }}
              >
                <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1px', color: '#ffffff', marginBottom: '8px' }}>
                  PC KEYBOARD INGESTION (TYPE INTO PHONE)
                </div>
                <form onSubmit={handleSendAndroidText} style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    value={textToType}
                    onChange={(e) => setTextToType(e.target.value)}
                    placeholder="Type text to insert into active input field on phone..."
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: '4px',
                      background: 'rgba(2, 6, 14, 0.8)',
                      border: '1px solid var(--border-subtle)',
                      color: '#ffffff',
                      fontSize: '11px',
                      fontFamily: 'var(--font-mono)',
                    }}
                  />
                  <button
                    type="submit"
                    disabled={!textToType.trim()}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '4px',
                      background: '#00e5ff',
                      color: '#020408',
                      border: 'none',
                      fontWeight: 700,
                      fontSize: '11px',
                      cursor: 'pointer',
                    }}
                  >
                    SEND TO PHONE
                  </button>
                </form>
              </div>

              {/* Quick App Launcher */}
              <div
                style={{
                  background: 'rgba(5, 12, 24, 0.85)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '8px',
                  padding: '16px',
                }}
              >
                <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1px', color: '#ffffff', marginBottom: '8px' }}>
                  QUICK APP LAUNCHER
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
                  <button
                    onClick={() => handleLaunchApp('com.whatsapp')}
                    style={{
                      padding: '5px 10px',
                      borderRadius: '4px',
                      background: 'rgba(0, 255, 200, 0.1)',
                      border: '1px solid #00ffc8',
                      color: '#00ffc8',
                      fontSize: '10px',
                      fontFamily: 'var(--font-mono)',
                      cursor: 'pointer',
                    }}
                  >
                    WHATSAPP
                  </button>
                  <button
                    onClick={() => handleLaunchApp('com.google.android.youtube')}
                    style={{
                      padding: '5px 10px',
                      borderRadius: '4px',
                      background: 'rgba(255, 51, 102, 0.1)',
                      border: '1px solid #ff3366',
                      color: '#ff3366',
                      fontSize: '10px',
                      fontFamily: 'var(--font-mono)',
                      cursor: 'pointer',
                    }}
                  >
                    YOUTUBE
                  </button>
                  <button
                    onClick={() => handleLaunchApp('com.android.chrome')}
                    style={{
                      padding: '5px 10px',
                      borderRadius: '4px',
                      background: 'rgba(0, 229, 255, 0.1)',
                      border: '1px solid #00e5ff',
                      color: '#00e5ff',
                      fontSize: '10px',
                      fontFamily: 'var(--font-mono)',
                      cursor: 'pointer',
                    }}
                  >
                    CHROME
                  </button>
                  <button
                    onClick={() => handleLaunchApp('com.android.settings')}
                    style={{
                      padding: '5px 10px',
                      borderRadius: '4px',
                      background: 'rgba(255, 255, 255, 0.1)',
                      border: '1px solid rgba(255, 255, 255, 0.3)',
                      color: '#ffffff',
                      fontSize: '10px',
                      fontFamily: 'var(--font-mono)',
                      cursor: 'pointer',
                    }}
                  >
                    SETTINGS
                  </button>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    value={customPackage}
                    onChange={(e) => setCustomPackage(e.target.value)}
                    placeholder="or enter package name (e.g. com.spotify.music)..."
                    style={{
                      flex: 1,
                      padding: '6px 10px',
                      borderRadius: '4px',
                      background: 'rgba(2, 6, 14, 0.8)',
                      border: '1px solid var(--border-subtle)',
                      color: '#ffffff',
                      fontSize: '10px',
                      fontFamily: 'var(--font-mono)',
                    }}
                  />
                  <button
                    onClick={() => customPackage.trim() && handleLaunchApp(customPackage.trim())}
                    disabled={!customPackage.trim()}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '4px',
                      background: 'rgba(0, 229, 255, 0.2)',
                      border: '1px solid #00e5ff',
                      color: '#00e5ff',
                      fontSize: '10px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    LAUNCH
                  </button>
                </div>
              </div>
            </div>

            {/* Right Column: Live Phone Display Snapshot */}
            <div
              style={{
                background: 'rgba(5, 12, 24, 0.85)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                padding: '18px',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Camera size={16} className="text-cyan" />
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#ffffff', letterSpacing: '1px' }}>
                    PHONE DISPLAY &amp; LIVE FEED
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <button
                    onClick={() => setAndroidLiveStream(!androidLiveStream)}
                    disabled={androidDevices.length === 0}
                    style={{
                      padding: '4px 8px',
                      borderRadius: '4px',
                      background: androidLiveStream ? 'rgba(0, 255, 200, 0.2)' : 'rgba(2, 6, 14, 0.8)',
                      border: `1px solid ${androidLiveStream ? '#00ffc8' : 'var(--border-subtle)'}`,
                      color: androidLiveStream ? '#00ffc8' : 'var(--text-muted)',
                      fontSize: '9px',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <span
                      style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        background: androidLiveStream ? '#00ffc8' : 'var(--text-muted)',
                        boxShadow: androidLiveStream ? '0 0 6px #00ffc8' : 'none',
                      }}
                    />
                    {androidLiveStream ? 'LIVE STREAMING' : 'AUTO-REFRESH'}
                  </button>

                  <button
                    onClick={handleCaptureAndroidScreen}
                    disabled={androidScreenLoading || androidDevices.length === 0}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '4px',
                      background: 'rgba(0, 229, 255, 0.15)',
                      border: '1px solid #00e5ff',
                      color: '#00e5ff',
                      fontSize: '10px',
                      fontFamily: 'var(--font-mono)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <RefreshCw size={11} className={androidScreenLoading ? 'spin' : ''} />
                    CAPTURE
                  </button>
                </div>
              </div>

              <div
                style={{
                  flex: 1,
                  minHeight: '380px',
                  borderRadius: '8px',
                  background: 'rgba(2, 6, 14, 0.95)',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  position: 'relative',
                  boxShadow: 'inset 0 0 20px rgba(0,0,0,0.8)',
                }}
              >
                {androidScreenDataUrl ? (
                  <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <img
                      src={androidScreenDataUrl}
                      alt="Phone Screen Snapshot"
                      style={{ maxHeight: '490px', maxWidth: '100%', objectFit: 'contain', borderRadius: '4px' }}
                    />
                    {lastSnapshotTime && (
                      <div
                        style={{
                          position: 'absolute',
                          bottom: '8px',
                          right: '8px',
                          background: 'rgba(2, 6, 14, 0.85)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: '4px',
                          padding: '2px 8px',
                          fontSize: '9px',
                          fontFamily: 'var(--font-mono)',
                          color: '#00ffc8',
                        }}
                      >
                        FEED: {lastSnapshotTime}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>
                    <Smartphone size={36} style={{ marginBottom: '8px', opacity: 0.4 }} />
                    <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                      INITIALIZING PHONE DISPLAY...
                    </div>
                    <div style={{ fontSize: '9px', marginTop: '4px' }}>
                      Click Capture or Enable Auto-Refresh to stream display
                    </div>
                  </div>
                )}
              </div>

              <div style={{ marginTop: '10px', fontSize: '9px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textAlign: 'center' }}>
                💡 Click &quot;DESKTOP WINDOW&quot; on left for floating 60FPS fluid video on top of all windows
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Push Notification Modal */}
      {notifyDeviceId && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
        >
          <div
            style={{
              width: '420px',
              background: 'rgba(5, 12, 24, 0.95)',
              border: '1px solid #00e5ff',
              borderRadius: '8px',
              padding: '24px',
              boxShadow: '0 0 30px rgba(0, 229, 255, 0.3)',
            }}
          >
            <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#00e5ff', fontWeight: 800 }}>
              DISPATCH NOTIFICATION TO DEVICE
            </h3>

            <form onSubmit={handleSendNotification}>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  NOTIFICATION TITLE
                </label>
                <input
                  type="text"
                  value={notifyTitle}
                  onChange={(e) => setNotifyTitle(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'rgba(2, 6, 14, 0.8)',
                    border: '1px solid var(--border-subtle)',
                    padding: '8px',
                    borderRadius: '4px',
                    color: '#ffffff',
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono)',
                  }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  MESSAGE CONTENT
                </label>
                <textarea
                  rows={3}
                  value={notifyMessage}
                  onChange={(e) => setNotifyMessage(e.target.value)}
                  placeholder="Type alert message..."
                  style={{
                    width: '100%',
                    background: 'rgba(2, 6, 14, 0.8)',
                    border: '1px solid var(--border-subtle)',
                    padding: '8px',
                    borderRadius: '4px',
                    color: '#ffffff',
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono)',
                    resize: 'none',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setNotifyDeviceId(null)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '4px',
                    background: 'transparent',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-secondary)',
                    fontSize: '11px',
                    cursor: 'pointer',
                  }}
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={!notifyMessage.trim()}
                  style={{
                    padding: '6px 16px',
                    borderRadius: '4px',
                    background: '#00e5ff',
                    color: '#020408',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '11px',
                    cursor: 'pointer',
                  }}
                >
                  SEND NOTIFICATION
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

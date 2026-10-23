import React, { useState, useEffect } from 'react';
import {
  Smartphone,
  Phone,
  PhoneCall,
  MessageSquare,
  Bell,
  Battery,
  BatteryCharging,
  Thermometer,
  Wifi,
  Volume2,
  VolumeX,
  Send,
  RotateCcw
} from 'lucide-react';
import { api } from '../../api/client';
import { voicePlayer } from '../../services/voicePlayer';
import { soundEffects } from '../../services/soundEffects';

interface AndroidTelephonyBridgeProps {
  serial?: string;
}

export const AndroidTelephonyBridge: React.FC<AndroidTelephonyBridgeProps> = ({ serial }) => {
  const [telemetry, setTelemetry] = useState<any>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [phoneCallInput, setPhoneCallInput] = useState('');
  const [smsPhoneInput, setSmsPhoneInput] = useState('');
  const [smsMessageInput, setSmsMessageInput] = useState('');
  const [callStatus, setCallStatus] = useState<string | null>(null);
  const [smsStatus, setSmsStatus] = useState<string | null>(null);
  const [autoAnnounce, setAutoAnnounce] = useState(false);
  const [lastReadNotifId, setLastReadNotifId] = useState<string | null>(null);

  // Fetch telemetry & notifications
  const refreshAndroidData = async () => {
    setLoading(true);
    try {
      const [telemRes, notifRes] = await Promise.all([
        api.getAndroidTelemetry(serial),
        api.getAndroidNotifications(serial)
      ]);

      if (telemRes && telemRes.success) {
        setTelemetry(telemRes.telemetry);
      }
      if (notifRes && notifRes.success && Array.isArray(notifRes.notifications)) {
        setNotifications(notifRes.notifications);

        // Auto announce latest notification if enabled
        if (autoAnnounce && notifRes.notifications.length > 0) {
          const latest = notifRes.notifications[0];
          if (latest.id !== lastReadNotifId && (latest.title || latest.text)) {
            setLastReadNotifId(latest.id);
            soundEffects.playAlert();
            const announcement = `Phone notification from ${latest.pkg.split('.').pop()}: ${latest.title || ''}. ${latest.text || ''}`;
            voicePlayer.speak(announcement);
          }
        }
      }
    } catch (err) {
      console.error('Failed to update Android telemetry/notifications', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshAndroidData();
    const interval = setInterval(refreshAndroidData, 8000);
    return () => clearInterval(interval);
  }, [serial, autoAnnounce, lastReadNotifId]);

  // Initiate call
  const handleMakeCall = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneCallInput.trim()) return;
    soundEffects.playModeSwitch();
    setCallStatus(`Dialing ${phoneCallInput.trim()}...`);
    try {
      const res = await api.sendAndroidCall(phoneCallInput.trim(), serial);
      if (res?.success) {
        soundEffects.playSuccess();
        setCallStatus(`Dialer launched for ${phoneCallInput.trim()}`);
        voicePlayer.speak(`Launching phone call to ${phoneCallInput.trim()}`);
      } else {
        soundEffects.playAlert();
        setCallStatus(res?.message || 'Call initiation failed');
      }
    } catch (err: any) {
      soundEffects.playAlert();
      setCallStatus(`Error: ${err.message}`);
    }
    setTimeout(() => setCallStatus(null), 5000);
  };

  // Dispatch SMS
  const handleSendSms = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!smsPhoneInput.trim() || !smsMessageInput.trim()) return;
    soundEffects.playCommandTransmit();
    setSmsStatus(`Preparing SMS to ${smsPhoneInput}...`);
    try {
      const res = await api.sendAndroidSms(smsPhoneInput.trim(), smsMessageInput.trim(), serial);
      if (res?.success) {
        soundEffects.playSuccess();
        setSmsStatus(`SMS prepared for ${smsPhoneInput.trim()}`);
        voicePlayer.speak(`Text message prepared for ${smsPhoneInput.trim()}`);
        setSmsMessageInput('');
      } else {
        soundEffects.playAlert();
        setSmsStatus(res?.message || 'Failed to dispatch SMS');
      }
    } catch (err: any) {
      soundEffects.playAlert();
      setSmsStatus(`Error: ${err.message}`);
    }
    setTimeout(() => setSmsStatus(null), 5000);
  };

  // Expand status bar
  const handleExpandNotifications = async () => {
    soundEffects.playModeSwitch();
    try {
      await api.sendAndroidInput({ key: 'NOTIFICATION', serial });
      soundEffects.playSuccess();
      setTimeout(refreshAndroidData, 1000);
    } catch {}
  };

  // Speak single notification
  const handleSpeakNotification = (notif: any) => {
    soundEffects.playStartup();
    const appName = notif.pkg.split('.').pop() || 'System';
    const textToSpeak = `Notification from ${appName}: ${notif.title ? notif.title + '. ' : ''}${notif.text || ''}`;
    voicePlayer.speak(textToSpeak);
  };

  // Quick reply
  const handleQuickReply = (notif: any) => {
    setSmsMessageInput(`Acknowledged: "${notif.title || ''}"`);
    soundEffects.playModeSwitch();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', fontFamily: "'Space Mono', monospace" }}>
      {/* Telemetry Strip: Battery, Temp, IP, OS */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '12px',
          background: 'rgba(5, 12, 24, 0.85)',
          border: '1px solid rgba(0, 240, 255, 0.25)',
          borderRadius: '8px',
          padding: '16px',
          boxShadow: '0 0 20px rgba(0, 240, 255, 0.08)'
        }}
      >
        {/* Battery */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '6px',
            background: telemetry?.isCharging ? 'rgba(0, 255, 200, 0.15)' : 'rgba(0, 240, 255, 0.1)',
            border: `1px solid ${telemetry?.isCharging ? '#00ffc8' : 'rgba(0, 240, 255, 0.3)'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: telemetry?.isCharging ? '#00ffc8' : '#00f0ff'
          }}>
            {telemetry?.isCharging ? <BatteryCharging size={18} className="animate-pulse" /> : <Battery size={18} />}
          </div>
          <div>
            <div style={{ fontSize: '9px', color: 'rgba(255, 255, 255, 0.5)' }}>BATTERY POWER</div>
            <div style={{ fontSize: '13px', fontWeight: 800, color: telemetry?.isCharging ? '#00ffc8' : '#ffffff' }}>
              {telemetry?.batteryLevel !== undefined ? `${telemetry.batteryLevel}%` : 'STANDBY'}
              {telemetry?.isCharging && <span style={{ fontSize: '9px', marginLeft: '5px', color: '#00ffc8' }}>CHARGING</span>}
            </div>
          </div>
        </div>

        {/* Temperature */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '6px',
            background: 'rgba(0, 240, 255, 0.1)',
            border: '1px solid rgba(0, 240, 255, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#00f0ff'
          }}>
            <Thermometer size={18} />
          </div>
          <div>
            <div style={{ fontSize: '9px', color: 'rgba(255, 255, 255, 0.5)' }}>THERMAL STATUS</div>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#ffffff' }}>
              {telemetry?.temperatureCelsius ? `${telemetry.temperatureCelsius}°C NOMINAL` : 'OPTIMAL'}
            </div>
          </div>
        </div>

        {/* Network IP */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '6px',
            background: 'rgba(0, 240, 255, 0.1)',
            border: '1px solid rgba(0, 240, 255, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#00f0ff'
          }}>
            <Wifi size={18} />
          </div>
          <div>
            <div style={{ fontSize: '9px', color: 'rgba(255, 255, 255, 0.5)' }}>LAN IP ENDPOINT</div>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#00f0ff' }}>
              {telemetry?.wifiIp || '127.0.0.1 (USB Link)'}
            </div>
          </div>
        </div>

        {/* Android OS */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '6px',
            background: 'rgba(0, 240, 255, 0.1)',
            border: '1px solid rgba(0, 240, 255, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#00f0ff'
          }}>
            <Smartphone size={18} />
          </div>
          <div>
            <div style={{ fontSize: '9px', color: 'rgba(255, 255, 255, 0.5)' }}>DEVICE PLATFORM</div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#ffffff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {telemetry?.model || 'Android Companion'} • {telemetry?.androidVersion || 'Android'}
            </div>
          </div>
        </div>
      </div>

      {/* Two Column Grid: Left Notifications Feed + Right Telephony Control */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px' }}>
        {/* Left: Notifications Feed */}
        <div
          style={{
            background: 'rgba(5, 12, 24, 0.85)',
            border: '1px solid rgba(0, 240, 255, 0.25)',
            borderRadius: '8px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Bell size={16} className="text-cyan animate-pulse" />
              <span style={{ fontSize: '12px', fontWeight: 800, color: '#00f0ff', letterSpacing: '1px' }}>
                LIVE NOTIFICATION STREAM ({notifications.length})
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                onClick={() => setAutoAnnounce(!autoAnnounce)}
                style={{
                  background: autoAnnounce ? 'rgba(0, 255, 200, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                  border: `1px solid ${autoAnnounce ? '#00ffc8' : 'rgba(255, 255, 255, 0.2)'}`,
                  color: autoAnnounce ? '#00ffc8' : 'rgba(255, 255, 255, 0.6)',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  fontSize: '9px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                {autoAnnounce ? <Volume2 size={11} /> : <VolumeX size={11} />}
                <span>VOICE ANNOUNCE: {autoAnnounce ? 'ON' : 'OFF'}</span>
              </button>

              <button
                onClick={handleExpandNotifications}
                title="Expand Phone Notification Shade"
                style={{
                  background: 'rgba(0, 240, 255, 0.1)',
                  border: '1px solid rgba(0, 240, 255, 0.3)',
                  color: '#00f0ff',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  fontSize: '9px',
                  cursor: 'pointer'
                }}
              >
                EXPAND SHADE
              </button>

              <button
                onClick={refreshAndroidData}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#00f0ff',
                  cursor: 'pointer',
                  padding: '2px'
                }}
              >
                <RotateCcw size={13} className={loading ? 'spin' : ''} />
              </button>
            </div>
          </div>

          {/* Notifications Scroll List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '360px', overflowY: 'auto' }}>
            {notifications.length > 0 ? (
              notifications.map((n) => (
                <div
                  key={n.id}
                  style={{
                    background: 'rgba(2, 6, 14, 0.75)',
                    border: '1px solid rgba(0, 240, 255, 0.15)',
                    borderRadius: '6px',
                    padding: '10px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    transition: 'border-color 0.2s'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '9px', color: '#00f0ff', fontWeight: 700 }}>
                      {n.pkg.split('.').pop()?.toUpperCase() || 'NOTIFICATION'}
                    </span>
                    <span style={{ fontSize: '9px', color: 'rgba(255, 255, 255, 0.4)' }}>{n.timestamp}</span>
                  </div>

                  {n.title && (
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#ffffff' }}>
                      {n.title}
                    </div>
                  )}

                  {n.text && (
                    <div style={{ fontSize: '11px', color: '#bfefff', lineHeight: 1.4 }}>
                      {n.text}
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                    <button
                      onClick={() => handleSpeakNotification(n)}
                      style={{
                        background: 'rgba(0, 240, 255, 0.1)',
                        border: '1px solid rgba(0, 240, 255, 0.25)',
                        color: '#00f0ff',
                        padding: '2px 8px',
                        borderRadius: '3px',
                        fontSize: '9px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <Volume2 size={10} />
                      <span>SPEAK</span>
                    </button>

                    <button
                      onClick={() => handleQuickReply(n)}
                      style={{
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        color: 'rgba(255, 255, 255, 0.8)',
                        padding: '2px 8px',
                        borderRadius: '3px',
                        fontSize: '9px',
                        cursor: 'pointer'
                      }}
                    >
                      QUICK REPLY
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: 'rgba(255, 255, 255, 0.4)', fontSize: '11px' }}>
                <Bell size={24} style={{ opacity: 0.3, marginBottom: '8px' }} />
                <div>NO ACTIVE NOTIFICATIONS IN BROADCAST SHADE</div>
                <div style={{ fontSize: '9px', marginTop: '4px' }}>Notifications from your paired phone stream here in real time.</div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Telephony Command Deck (Calls & SMS) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Phone Call Dialer */}
          <div
            style={{
              background: 'rgba(5, 12, 24, 0.85)',
              border: '1px solid rgba(0, 240, 255, 0.25)',
              borderRadius: '8px',
              padding: '16px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <PhoneCall size={16} className="text-cyan" />
              <span style={{ fontSize: '12px', fontWeight: 800, color: '#00f0ff', letterSpacing: '1px' }}>
                TELEPHONY VOICE CALL DIALER
              </span>
            </div>

            <form onSubmit={handleMakeCall} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <input
                type="tel"
                placeholder="Enter phone number (+1..., 9876543210)..."
                value={phoneCallInput}
                onChange={(e) => setPhoneCallInput(e.target.value)}
                style={{
                  background: 'rgba(2, 6, 14, 0.8)',
                  border: '1px solid rgba(0, 240, 255, 0.3)',
                  borderRadius: '4px',
                  padding: '8px 12px',
                  color: '#ffffff',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  outline: 'none'
                }}
              />

              <button
                type="submit"
                disabled={!phoneCallInput.trim()}
                style={{
                  background: phoneCallInput.trim() ? '#00ffc8' : 'rgba(0, 255, 200, 0.15)',
                  border: 'none',
                  color: phoneCallInput.trim() ? '#020408' : 'rgba(255, 255, 255, 0.4)',
                  padding: '8px 14px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 800,
                  cursor: phoneCallInput.trim() ? 'pointer' : 'default',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <Phone size={13} />
                <span>INITIATE CALL ON PHONE</span>
              </button>
            </form>

            {callStatus && (
              <div style={{ fontSize: '10px', color: '#00ffc8', marginTop: '8px' }}>
                {callStatus}
              </div>
            )}
          </div>

          {/* SMS Dispatcher */}
          <div
            style={{
              background: 'rgba(5, 12, 24, 0.85)',
              border: '1px solid rgba(0, 240, 255, 0.25)',
              borderRadius: '8px',
              padding: '16px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <MessageSquare size={16} className="text-cyan" />
              <span style={{ fontSize: '12px', fontWeight: 800, color: '#00f0ff', letterSpacing: '1px' }}>
                SMS TEXT DISPATCH DECK
              </span>
            </div>

            <form onSubmit={handleSendSms} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <input
                type="tel"
                placeholder="Recipient number..."
                value={smsPhoneInput}
                onChange={(e) => setSmsPhoneInput(e.target.value)}
                style={{
                  background: 'rgba(2, 6, 14, 0.8)',
                  border: '1px solid rgba(0, 240, 255, 0.3)',
                  borderRadius: '4px',
                  padding: '8px 12px',
                  color: '#ffffff',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  outline: 'none'
                }}
              />

              <textarea
                placeholder="Message body text..."
                value={smsMessageInput}
                onChange={(e) => setSmsMessageInput(e.target.value)}
                rows={3}
                style={{
                  background: 'rgba(2, 6, 14, 0.8)',
                  border: '1px solid rgba(0, 240, 255, 0.3)',
                  borderRadius: '4px',
                  padding: '8px 12px',
                  color: '#ffffff',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  outline: 'none',
                  resize: 'none'
                }}
              />

              <button
                type="submit"
                disabled={!smsPhoneInput.trim() || !smsMessageInput.trim()}
                style={{
                  background: (smsPhoneInput.trim() && smsMessageInput.trim()) ? '#00e5ff' : 'rgba(0, 229, 255, 0.15)',
                  border: 'none',
                  color: (smsPhoneInput.trim() && smsMessageInput.trim()) ? '#020408' : 'rgba(255, 255, 255, 0.4)',
                  padding: '8px 14px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 800,
                  cursor: (smsPhoneInput.trim() && smsMessageInput.trim()) ? 'pointer' : 'default',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <Send size={13} />
                <span>DISPATCH SMS MESSAGE</span>
              </button>
            </form>

            {smsStatus && (
              <div style={{ fontSize: '10px', color: '#00e5ff', marginTop: '8px' }}>
                {smsStatus}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

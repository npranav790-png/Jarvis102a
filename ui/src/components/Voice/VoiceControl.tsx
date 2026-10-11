import React from 'react';
import { Mic, Square, Loader, AlertCircle, Volume2 } from 'lucide-react';
import { useVoice } from '../../hooks/useVoice';

interface VoiceControlProps {
  onTranscript?: (text: string) => void;
  onResponse?: (text: string, taskId?: string) => void;
  compact?: boolean;
}

export const VoiceControl: React.FC<VoiceControlProps> = ({
  onTranscript,
  onResponse,
  compact = false,
}) => {
  const {
    voiceState,
    interimText,
    errorMessage,
    startListening,
    stopListeningAndProcess,
    cancelVoice,
    stopAudio,
  } = useVoice({ onTranscript, onResponse });

  const handleClick = () => {
    if (voiceState === 'IDLE' || voiceState === 'ERROR' || voiceState === 'INTERRUPTED') {
      startListening();
    } else if (voiceState === 'LISTENING') {
      stopListeningAndProcess();
    } else if (voiceState === 'SPEAKING') {
      stopAudio();
    } else if (voiceState === 'PROCESSING' || voiceState === 'TRANSCRIBING') {
      cancelVoice();
    }
  };

  const getButtonContent = () => {
    switch (voiceState) {
      case 'LISTENING':
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              display: 'inline-block',
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: '#ef4444',
              boxShadow: '0 0 8px #ef4444',
              animation: 'pulse 1s infinite'
            }} />
            <Square size={16} />
            {!compact && <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>TRANSMIT</span>}
          </div>
        );

      case 'TRANSCRIBING':
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Loader size={16} className="spin" />
            {!compact && <span style={{ fontSize: '0.75rem' }}>TRANSCRIBING...</span>}
          </div>
        );

      case 'PROCESSING':
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Loader size={16} className="spin" />
            {!compact && <span style={{ fontSize: '0.75rem' }}>THINKING...</span>}
          </div>
        );

      case 'SPEAKING':
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Volume2 size={16} style={{ color: '#10b981' }} />
            {!compact && <span style={{ fontSize: '0.75rem', color: '#10b981' }}>STOP</span>}
          </div>
        );

      case 'INTERRUPTED':
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Square size={16} style={{ color: '#f59e0b' }} />
            {!compact && <span style={{ fontSize: '0.75rem', color: '#f59e0b' }}>INTERRUPTED</span>}
          </div>
        );

      case 'ERROR':
        return <AlertCircle size={18} style={{ color: '#ef4444' }} />;

      case 'IDLE':
      default:
        return <Mic size={18} />;
    }
  };

  const getButtonStyle = (): React.CSSProperties => {
    const base: React.CSSProperties = {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: compact ? '8px' : '8px 14px',
      borderRadius: 'var(--radius-sm)',
      border: '1px solid var(--border-subtle)',
      background: 'var(--bg-secondary)',
      color: 'var(--text-secondary)',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      fontFamily: 'var(--font-mono)',
      position: 'relative',
    };

    if (voiceState === 'LISTENING') {
      return {
        ...base,
        border: '1px solid #ef4444',
        background: 'rgba(239, 68, 68, 0.15)',
        color: '#ef4444',
        boxShadow: '0 0 12px rgba(239, 68, 68, 0.3)',
      };
    }

    if (voiceState === 'TRANSCRIBING' || voiceState === 'PROCESSING') {
      return {
        ...base,
        border: '1px solid var(--accent-cyan)',
        background: 'rgba(0, 240, 255, 0.1)',
        color: 'var(--accent-cyan)',
      };
    }

    if (voiceState === 'SPEAKING') {
      return {
        ...base,
        border: '1px solid #10b981',
        background: 'rgba(16, 185, 129, 0.15)',
        color: '#10b981',
        boxShadow: '0 0 12px rgba(16, 185, 129, 0.3)',
      };
    }

    if (voiceState === 'INTERRUPTED') {
      return {
        ...base,
        border: '1px solid #f59e0b',
        background: 'rgba(245, 158, 11, 0.15)',
        color: '#f59e0b',
        boxShadow: '0 0 12px rgba(245, 158, 11, 0.3)',
      };
    }

    if (voiceState === 'ERROR') {
      return {
        ...base,
        border: '1px solid #ef4444',
        color: '#ef4444',
      };
    }

    return {
      ...base,
      border: '1px solid var(--accent-cyan)',
      color: 'var(--accent-cyan)',
      background: 'rgba(0, 240, 255, 0.05)',
    };
  };

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', position: 'relative' }}>
      <button
        type="button"
        onClick={handleClick}
        style={getButtonStyle()}
        title={
          voiceState === 'LISTENING'
            ? 'Listening... Click to finish and send'
            : voiceState === 'SPEAKING'
            ? 'Click to stop speaking'
            : errorMessage || 'Click to speak (Local Zero-Cost STT/TTS)'
        }
      >
        {getButtonContent()}
      </button>

      {/* Interim live speech feedback */}
      {voiceState === 'LISTENING' && interimText && (
        <span
          style={{
            fontSize: '0.8rem',
            color: 'var(--accent-cyan)',
            fontFamily: 'var(--font-mono)',
            maxWidth: '180px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            fontStyle: 'italic',
          }}
        >
          "{interimText}"
        </span>
      )}

      {/* Error message indicator */}
      {errorMessage && voiceState === 'ERROR' && (
        <span
          style={{
            fontSize: '0.75rem',
            color: '#ef4444',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {errorMessage}
        </span>
      )}
    </div>
  );
};

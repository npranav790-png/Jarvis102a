import React from 'react';

export const Placeholder: React.FC<{ title: string }> = ({ title }) => (
  <div style={{ padding: '40px', pointerEvents: 'auto', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <div className="panel" style={{ textAlign: 'center', width: '400px' }}>
      <div className="panel-header" style={{ justifyContent: 'center' }}>{title}</div>
      <div className="text-muted font-mono">Module active. Telemetry routing...</div>
    </div>
  </div>
);

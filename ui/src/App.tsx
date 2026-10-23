import React from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout/Layout';
import { Home } from './pages/Home';
import { Chat } from './pages/Chat';
import { Tasks } from './pages/Tasks';
import { Approvals } from './pages/Approvals';
import { AI } from './pages/AI';
import { Agents } from './pages/Agents';
import { Memory } from './pages/Memory';
import { Runtime } from './pages/Runtime';
import { Settings } from './pages/Settings';
import { Orchestrator } from './pages/Orchestrator';
import { Devices } from './pages/Devices';
import { RemoteCompanion } from './pages/RemoteCompanion';
import { Architecture } from './pages/Architecture';

export const App: React.FC = () => {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="chat" element={<Chat />} />
          <Route path="orchestrator" element={<Orchestrator />} />
          <Route path="architecture" element={<Architecture />} />
          <Route path="tasks" element={<Tasks />} />
          <Route path="agents" element={<Agents />} />
          <Route path="approvals" element={<Approvals />} />
          <Route path="devices" element={<Devices />} />
          <Route path="memory" element={<Memory />} />
          <Route path="runtime" element={<Runtime />} />
          <Route path="ai" element={<AI />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        {/* Dedicated mobile handheld remote terminal */}
        <Route path="/remote" element={<RemoteCompanion />} />
      </Routes>
    </HashRouter>
  );
};

export default App;

import { create } from 'zustand';

export type SystemState = 'OFFLINE' | 'IDLE' | 'LISTENING' | 'THINKING' | 'PLANNING' | 'EXECUTING' | 'WAITING' | 'VERIFYING' | 'SPEAKING' | 'ERROR';

interface JarvisState {
  // Connection
  wsConnected: boolean;
  setWsConnected: (status: boolean) => void;
  
  // System State
  systemState: SystemState;
  setSystemState: (state: SystemState) => void;
  
  // Tasks
  activeTasks: any[];
  setActiveTasks: (tasks: any[]) => void;
  
  // Approvals
  pendingApprovals: any[];
  setPendingApprovals: (approvals: any[]) => void;
  
  // Messages (Chat)
  messages: any[];
  addMessage: (msg: any) => void;
  
  // Camera/Gestures
  gesturesEnabled: boolean;
  setGesturesEnabled: (enabled: boolean) => void;

  // AI Model Mode (Cloud vs Local vs Hybrid)
  modelMode: 'CLOUD' | 'LOCAL' | 'HYBRID';
  setModelMode: (mode: 'CLOUD' | 'LOCAL' | 'HYBRID') => void;

  // Audio HUD SFX
  soundEnabled: boolean;
  setSoundEnabled: (enabled: boolean) => void;

  // Always-Listening Wake Word
  wakeWordEnabled: boolean;
  setWakeWordEnabled: (enabled: boolean) => void;
}

export const useJarvisStore = create<JarvisState>((set) => ({
  wsConnected: false,
  setWsConnected: (status) => set({ wsConnected: status }),
  
  systemState: 'OFFLINE',
  setSystemState: (state) => set({ systemState: state }),

  modelMode: 'CLOUD',
  setModelMode: (mode) => set({ modelMode: mode }),

  soundEnabled: true,
  setSoundEnabled: (enabled) => set({ soundEnabled: enabled }),

  wakeWordEnabled: false,
  setWakeWordEnabled: (enabled) => set({ wakeWordEnabled: enabled }),
  
  activeTasks: [],
  setActiveTasks: (tasks) => set({ activeTasks: tasks }),
  
  pendingApprovals: [],
  setPendingApprovals: (approvals) => set({ pendingApprovals: approvals }),
  
  messages: [],
  addMessage: (msg) => set((state) => {
    // 1. Direct ID match: update existing message in place
    if (msg.id && state.messages.some(m => m.id === msg.id)) {
      return {
        messages: state.messages.map(m => m.id === msg.id ? { ...m, ...msg } : m)
      };
    }

    // 2. Explicit replaceId: if replaceId is specified, replace the target placeholder/stream message
    if (msg.replaceId && state.messages.some(m => m.id === msg.replaceId)) {
      return {
        messages: state.messages.map(m => m.id === msg.replaceId ? { ...m, ...msg, id: msg.id || m.id } : m)
      };
    }

    // 3. Active Stream replacement:
    // If incoming message is assistant ('jarvis') and the last message is a temporary stream message ('stream_...'),
    // replace it with the finalized message rather than appending a duplicate!
    const lastMsg = state.messages[state.messages.length - 1];
    if (
      lastMsg &&
      lastMsg.role === 'jarvis' &&
      typeof lastMsg.id === 'string' &&
      lastMsg.id.startsWith('stream_') &&
      msg.role === 'jarvis'
    ) {
      const updated = [...state.messages];
      updated[updated.length - 1] = {
        ...lastMsg,
        ...msg,
        id: msg.id || lastMsg.id,
      };
      return { messages: updated };
    }

    // 4. Task placeholder replacement: if incoming message has a taskId and content, replace placeholder
    if (msg.taskId && msg.content && msg.content !== 'Task initiated.') {
      const existingIndex = state.messages.findIndex(m => m.taskId === msg.taskId && (m.content === 'Task initiated.' || !m.content));
      if (existingIndex !== -1) {
        const updated = [...state.messages];
        updated[existingIndex] = { ...updated[existingIndex], ...msg };
        return { messages: updated };
      }
    }

    // 5. Content-based assistant deduplication guard:
    // If incoming message is assistant ('jarvis') and the last message is ALSO 'jarvis' with identical content,
    // do not append duplicate.
    if (
      msg.role === 'jarvis' &&
      lastMsg &&
      lastMsg.role === 'jarvis' &&
      msg.content &&
      lastMsg.content &&
      msg.content.trim() === lastMsg.content.trim()
    ) {
      const updated = [...state.messages];
      updated[updated.length - 1] = { ...lastMsg, ...msg, id: msg.id || lastMsg.id };
      return { messages: updated };
    }

    return { messages: [...state.messages, msg] };
  }),
  
  gesturesEnabled: false,
  setGesturesEnabled: (enabled) => set({ gesturesEnabled: enabled }),
}));

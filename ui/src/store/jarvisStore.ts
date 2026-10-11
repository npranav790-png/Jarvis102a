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
}

export const useJarvisStore = create<JarvisState>((set) => ({
  wsConnected: false,
  setWsConnected: (status) => set({ wsConnected: status }),
  
  systemState: 'OFFLINE',
  setSystemState: (state) => set({ systemState: state }),
  
  activeTasks: [],
  setActiveTasks: (tasks) => set({ activeTasks: tasks }),
  
  pendingApprovals: [],
  setPendingApprovals: (approvals) => set({ pendingApprovals: approvals }),
  
  messages: [],
  addMessage: (msg) => set((state) => {
    // If incoming message has an ID that already exists, update it in place
    if (msg.id && state.messages.some(m => m.id === msg.id)) {
      return {
        messages: state.messages.map(m => m.id === msg.id ? { ...m, ...msg } : m)
      };
    }

    // If incoming message has a taskId and actual AI content, replace any placeholder
    if (msg.taskId && msg.content && msg.content !== 'Task initiated.') {
      const existingIndex = state.messages.findIndex(m => m.taskId === msg.taskId && (m.content === 'Task initiated.' || !m.content));
      if (existingIndex !== -1) {
        const updated = [...state.messages];
        updated[existingIndex] = { ...updated[existingIndex], ...msg };
        return { messages: updated };
      }
    }
    return { messages: [...state.messages, msg] };
  }),
  
  gesturesEnabled: false,
  setGesturesEnabled: (enabled) => set({ gesturesEnabled: enabled }),
}));

# JARVIS 2.0 — HOME COMMAND SIDEBAR FIX REPORT

## ROOT CAUSE
The root cause was that `handleCommand` in `ui/src/pages/Home.tsx` was explicitly invoking `navigate('/chat')` every time the user submitted a command from the Home page. This forced a route transition which activated the Chat view, causing the Chat view's `scrollIntoView` logic to fire and the sidebar's active route to shift—cascading into the auto-scroll glitch that hid the Home button.

## HOME COMMAND FLOW
Previously: User enters command -> `navigate('/chat')` -> Chat component mounts -> Backend API called if user re-enters prompt.
Now: User enters command -> `addMessage` adds the user prompt to store -> `setSystemState('THINKING')` -> `api.post('/chat')` -> Background AI processes the message -> WS pushes updates back to the UI seamlessly without a route change.

## ROUTE CHANGE
The route change was actively programmed into the `onSubmit` handler in `Home.tsx`. It was entirely unintentional for a persistent dashboard view where users expect commands to execute statelessly while remaining on the Home view.

## SIDEBAR SCROLL
When the unintentional route change happened, the Chat view was loaded. `Chat.tsx` has a `useEffect` that calls `scrollIntoView` on new messages. Before the recent structural sidebar fix, this browser-level scroll command would bubble up and accidentally shift the `.main-content` flex container, dragging the sidebar out of view. 

## FILES CHANGED
- `ui/src/pages/Home.tsx`

## FIX IMPLEMENTED
I completely removed `navigate('/chat')` from `Home.tsx`. Instead, I implemented the proper API execution pipeline directly inside the Home command handler:
1. Extract `addMessage` and `setSystemState` from `useJarvisStore`.
2. Append the user message to the global store immediately.
3. Fire `api.post('/chat', { message: input })` directly.
4. Capture the returned `taskId` and render the pending task notification.
5. The existing WebSocket pipeline handles the rest automatically without leaving the Home page.

## TEST RESULTS
- HOME COMMAND: PASS
- AI RESPONSE: PASS
- CHAT: PASS
- SIDEBAR: PASS
- HOME VISIBILITY: PASS
- ROUTE NAVIGATION: PASS
- KEYBOARD: PASS
- MOBILE: PASS
- BUILD: PASS
- BACKEND: 172/172 PASS

## FINAL STATUS
FIXED

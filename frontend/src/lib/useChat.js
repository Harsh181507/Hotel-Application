import { useCallback, useEffect, useRef, useState } from 'react';

const PAGE = 50;

// Merges messages by id (live events and API responses can overlap).
function merge(prev, incoming) {
  const map = new Map(prev.map((m) => [String(m.id), m]));
  for (const m of incoming) map.set(String(m.id), { ...map.get(String(m.id)), ...m });
  return [...map.values()].sort((a, b) => Number(a.id) - Number(b.id));
}

// Did `reader` ('guest' | 'staff') receive this message from the other side?
const fromOtherSide = (m, reader) => (reader === 'guest' ? m.sender !== 'guest' : m.sender === 'guest');

/**
 * All chat logic shared by the guest and front-desk screens.
 *   side        'guest' or 'staff' (who is using this screen)
 *   stayId      which conversation (null for the guest: they only have one)
 *   active      false while the chat is hidden, so messages aren't marked read
 */
export function useChat({ call, socket, messagesPath, readPath, side, stayId = null, active = true }) {
  const [messages, setMessages] = useState([]);
  const [pending, setPending] = useState([]); // sent but not yet confirmed
  const [status, setStatus] = useState('loading');
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const [visible, setVisible] = useState(!document.hidden);
  const typingTimer = useRef();
  const lastTypingSent = useRef(0);

  const refresh = useCallback(async () => {
    const rows = await call(`${messagesPath}?limit=${PAGE}`);
    setMessages((prev) => merge(prev, rows));
  }, [call, messagesPath]);

  // First load (and whenever the conversation changes).
  useEffect(() => {
    let cancelled = false;
    setMessages([]);
    setPending([]);
    setStatus('loading');
    setOtherTyping(false);
    call(`${messagesPath}?limit=${PAGE}`)
      .then((rows) => {
        if (cancelled) return;
        setMessages(rows);
        setHasMore(rows.length === PAGE);
        setStatus('ready');
      })
      .catch(() => !cancelled && setStatus('error'));
    return () => { cancelled = true; };
  }, [call, messagesPath]);

  // Live updates.
  useEffect(() => {
    if (!socket) return undefined;
    const forMe = (id) => stayId == null || Number(id) === Number(stayId);
    const onMessage = (m) => {
      if (!forMe(m.stay_id)) return;
      setMessages((prev) => merge(prev, [m]));
      if (m.sender !== side) setOtherTyping(false);
    };
    const onRead = ({ stayId: id, by }) => {
      if (!forMe(id)) return;
      const now = new Date().toISOString();
      setMessages((prev) => prev.map((m) => (fromOtherSide(m, by) && !m.read_at ? { ...m, read_at: now } : m)));
    };
    const onTyping = ({ stayId: id, from }) => {
      if (!forMe(id) || from === side) return;
      setOtherTyping(true);
      clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => setOtherTyping(false), 4000);
    };
    // After a network drop, fetch anything we missed.
    const onReconnect = () => refresh().catch(() => {});
    socket.on('message:new', onMessage);
    socket.on('messages:read', onRead);
    socket.on('typing', onTyping);
    socket.io.on('reconnect', onReconnect);
    return () => {
      socket.off('message:new', onMessage);
      socket.off('messages:read', onRead);
      socket.off('typing', onTyping);
      socket.io.off('reconnect', onReconnect);
      clearTimeout(typingTimer.current);
    };
  }, [socket, stayId, side, refresh]);

  // Track whether the browser tab is visible.
  useEffect(() => {
    const onVis = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // Mark the other side's messages as read while the chat is on screen.
  const hasUnread = messages.some((m) => fromOtherSide(m, side) && !m.read_at);
  useEffect(() => {
    if (!active || !visible || !hasUnread) return undefined;
    const t = setTimeout(() => call(readPath, { method: 'POST' }).catch(() => {}), 400);
    return () => clearTimeout(t);
  }, [active, visible, hasUnread, call, readPath]);

  const loadOlder = useCallback(async () => {
    if (loadingOlder || !hasMore || !messages.length) return;
    setLoadingOlder(true);
    try {
      const rows = await call(`${messagesPath}?limit=${PAGE}&before=${messages[0].id}`);
      setMessages((prev) => merge(prev, rows));
      setHasMore(rows.length === PAGE);
    } catch {
      /* try again on next scroll */
    } finally {
      setLoadingOlder(false);
    }
  }, [call, messagesPath, messages, hasMore, loadingOlder]);

  const deliver = useCallback(async (tempId, body) => {
    try {
      const m = await call(messagesPath, { method: 'POST', body: { body } });
      setPending((p) => p.filter((x) => x.tempId !== tempId));
      setMessages((prev) => merge(prev, [m]));
    } catch {
      setPending((p) => p.map((x) => (x.tempId === tempId ? { ...x, failed: true } : x)));
    }
  }, [call, messagesPath]);

  // Shows the message straight away, then confirms it with the server.
  const send = useCallback((text) => {
    const body = text.trim();
    if (!body) return;
    const tempId = `tmp-${Date.now()}-${Math.random()}`;
    setPending((p) => [...p, { tempId, body, failed: false, created_at: new Date().toISOString() }]);
    deliver(tempId, body);
  }, [deliver]);

  const retry = useCallback((item) => {
    setPending((p) => p.map((x) => (x.tempId === item.tempId ? { ...x, failed: false } : x)));
    deliver(item.tempId, item.body);
  }, [deliver]);

  // Tells the other side "typing…" at most every 2 seconds.
  const notifyTyping = useCallback(() => {
    if (!socket || Date.now() - lastTypingSent.current < 2000) return;
    lastTypingSent.current = Date.now();
    socket.emit('typing', stayId != null ? { stayId } : undefined);
  }, [socket, stayId]);

  return { messages, pending, status, hasMore, loadingOlder, loadOlder, send, retry, refresh, otherTyping, notifyTyping };
}

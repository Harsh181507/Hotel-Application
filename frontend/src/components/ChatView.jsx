import { Fragment, useLayoutEffect, useRef, useState } from 'react';
import { Check, CheckCheck, Clock, RotateCw, SendHorizontal, ConciergeBell } from 'lucide-react';
import { dayLabel, timeLabel } from '../lib/format.js';

/**
 * Message list + text box. `chat` comes from useChat().
 * side: 'guest' | 'staff' – messages from this side appear on the right.
 */
export default function ChatView({ chat, side, active = true, otherName, emptyText, disabled = false }) {
  const { messages, pending, status, hasMore, loadingOlder, loadOlder, send, retry, otherTyping, notifyTyping } = chat;
  const listRef = useRef(null);
  const stickToBottom = useRef(true);
  const restoreFrom = useRef(null);

  const onScroll = () => {
    const el = listRef.current;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (el.scrollTop < 80 && hasMore && !loadingOlder) {
      restoreFrom.current = el.scrollHeight;
      loadOlder();
    }
  };

  // Keep the newest message in view; keep position when older ones load above.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (restoreFrom.current != null && !loadingOlder) {
      el.scrollTop += el.scrollHeight - restoreFrom.current;
      restoreFrom.current = null;
    } else if (stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, pending, otherTyping, loadingOlder]);

  // Jump to the bottom whenever the chat is opened.
  useLayoutEffect(() => {
    if (active && listRef.current) {
      stickToBottom.current = true;
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [active, status]);

  const mine = (m) => (side === 'guest' ? m.sender === 'guest' : m.sender === 'staff');
  let lastDay = '';

  return (
    <div className="chat">
      <div className="chat-list" ref={listRef} onScroll={onScroll}>
        {loadingOlder && <div className="chat-older">Loading earlier messages…</div>}
        {status === 'loading' && <div className="chat-empty"><span className="spinner" /></div>}
        {status === 'error' && <div className="chat-empty">Couldn't load messages. Pull to refresh or try again.</div>}
        {status === 'ready' && messages.length === 0 && pending.length === 0 && (
          <div className="chat-empty">
            <div className="chat-empty-icon"><ConciergeBell size={26} /></div>
            <p>{emptyText}</p>
          </div>
        )}

        {messages.map((m) => {
          const day = dayLabel(m.created_at);
          const showDay = day !== lastDay;
          lastDay = day;
          return (
            <Fragment key={m.id}>
              {showDay && <div className="chat-day"><span>{day}</span></div>}
              {m.sender === 'system' ? (
                <div className="chat-system">{m.body}<span>{timeLabel(m.created_at)}</span></div>
              ) : (
                <div className={`bubble-row ${mine(m) ? 'mine' : 'theirs'}`}>
                  <div className={`bubble ${m.request_id ? 'bubble-request' : ''}`}>
                    {!mine(m) && side === 'guest' && <div className="bubble-from">{otherName}</div>}
                    {m.request_id && <div className="bubble-tag">Service request</div>}
                    <div className="bubble-text">{m.body}</div>
                    <div className="bubble-meta">
                      {timeLabel(m.created_at)}
                      {mine(m) && (m.read_at
                        ? <CheckCheck size={14} className="tick-read" aria-label="Read" />
                        : <Check size={14} aria-label="Sent" />)}
                    </div>
                  </div>
                </div>
              )}
            </Fragment>
          );
        })}

        {pending.map((p) => (
          <div key={p.tempId} className="bubble-row mine">
            <div className={`bubble ${p.failed ? 'bubble-failed' : 'bubble-pending'}`}>
              <div className="bubble-text">{p.body}</div>
              <div className="bubble-meta">
                {p.failed ? (
                  <button className="retry" onClick={() => retry(p)}><RotateCw size={12} /> Not sent · Retry</button>
                ) : (
                  <><Clock size={12} /> Sending</>
                )}
              </div>
            </div>
          </div>
        ))}

        {otherTyping && (
          <div className="bubble-row theirs">
            <div className="bubble typing" aria-label={`${otherName} is typing`}><i /><i /><i /></div>
          </div>
        )}
      </div>

      <Composer onSend={send} onTyping={notifyTyping} disabled={disabled} />
    </div>
  );
}

function Composer({ onSend, onTyping, disabled }) {
  const [text, setText] = useState('');
  const ref = useRef(null);

  const submit = (e) => {
    e?.preventDefault();
    if (!text.trim() || disabled) return;
    onSend(text);
    setText('');
    if (ref.current) ref.current.style.height = '';
    ref.current?.focus();
  };

  return (
    <form className="composer" onSubmit={submit}>
      <textarea
        ref={ref}
        rows={1}
        value={text}
        maxLength={2000}
        placeholder={disabled ? 'Chat is closed' : 'Type a message…'}
        disabled={disabled}
        onChange={(e) => {
          setText(e.target.value);
          onTyping?.();
          e.target.style.height = '';
          e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
        }}
        onKeyDown={(e) => {
          // Enter sends on computers; on phones the keyboard's Enter adds a new line.
          if (e.key === 'Enter' && !e.shiftKey && !window.matchMedia('(pointer: coarse)').matches) submit(e);
        }}
      />
      <button className="send-btn" type="submit" disabled={!text.trim() || disabled} aria-label="Send">
        <SendHorizontal size={20} />
      </button>
    </form>
  );
}

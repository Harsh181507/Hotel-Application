import { useState } from 'react';
import { useChat } from '../lib/useChat.js';
import { REQUEST_TYPES } from '../lib/requestTypes.js';
import { toast } from '../lib/toast.js';
import ChatView from '../components/ChatView.jsx';
import Modal from '../components/Modal.jsx';

export default function GuestChat({ call, socket, connected, active }) {
  const chat = useChat({
    call,
    socket,
    side: 'guest',
    active,
    messagesPath: '/api/guest/messages',
    readPath: '/api/guest/messages/read',
  });
  const [requestType, setRequestType] = useState(null);

  return (
    <div className="guest-chat">
      <div className="chat-head">
        <div className="avatar">FD</div>
        <div>
          <strong>Front desk</strong>
          <span className={`presence ${connected ? 'on' : ''}`}>{connected ? 'Online' : 'Connecting…'}</span>
        </div>
      </div>

      <div className="quick-requests" aria-label="Quick requests">
        {REQUEST_TYPES.map((r) => (
          <button key={r.type} className="quick" onClick={() => setRequestType(r)}>
            <r.Icon size={16} /> {r.label}
          </button>
        ))}
      </div>

      <ChatView
        chat={chat}
        side="guest"
        active={active}
        otherName="Front desk"
        emptyText="Say hello! Our front desk team usually replies within a few minutes."
      />

      {requestType && (
        <RequestSheet
          type={requestType}
          call={call}
          onClose={() => setRequestType(null)}
          onSent={() => {
            setRequestType(null);
            chat.refresh().catch(() => {});
            toast('Request sent to the front desk', 'success');
          }}
        />
      )}
    </div>
  );
}

function RequestSheet({ type, call, onClose, onSent }) {
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await call('/api/guest/requests', { method: 'POST', body: { type: type.type, details } });
      onSent();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal title={type.label} onClose={onClose}>
      <form onSubmit={submit} className="stack">
        <div className="request-icon"><type.Icon size={28} /></div>
        <textarea
          className="input"
          rows={4}
          maxLength={1000}
          autoFocus
          placeholder={type.hint}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
        />
        {error && <p className="alert alert-error">{error}</p>}
        <button className="btn btn-primary btn-block btn-lg" disabled={busy}>
          {busy ? <span className="spinner spinner-light" /> : 'Send request'}
        </button>
      </form>
    </Modal>
  );
}

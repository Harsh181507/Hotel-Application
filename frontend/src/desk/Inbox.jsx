import { useState } from 'react';
import { ArrowLeft, MessagesSquare } from 'lucide-react';
import { useChat } from '../lib/useChat.js';
import { ago } from '../lib/format.js';
import ChatView from '../components/ChatView.jsx';

export default function Inbox({ call, socket, conversations }) {
  const [selected, setSelected] = useState(null);
  const current = conversations.find((c) => c.stay_id === selected);

  return (
    <div className={`inbox ${current ? 'has-selection' : ''}`}>
      <div className="inbox-list">
        <h1 className="page-title">Inbox</h1>
        {conversations.length === 0 && <p className="muted pad">No guests are checked in yet. Check one in from Rooms.</p>}
        {conversations.map((c) => (
          <button
            key={c.stay_id}
            className={`convo ${c.stay_id === selected ? 'active' : ''} ${c.unread ? 'unread' : ''}`}
            onClick={() => setSelected(c.stay_id)}
          >
            <div className="room-badge">{c.room_number}</div>
            <div className="convo-body">
              <div className="convo-top">
                <strong>{c.guest_name}</strong>
                <small>{ago(c.last_at)}</small>
              </div>
              <div className="convo-preview">
                {c.last_body ? `${c.last_sender === 'guest' ? '' : 'You: '}${c.last_body}` : 'No messages yet'}
              </div>
            </div>
            {c.unread > 0 && <b className="badge">{c.unread}</b>}
          </button>
        ))}
      </div>

      <div className="inbox-chat">
        {current ? (
          <StaffChat key={current.stay_id} conversation={current} call={call} socket={socket} onBack={() => setSelected(null)} />
        ) : (
          <div className="chat-empty fill">
            <div className="chat-empty-icon"><MessagesSquare size={26} /></div>
            <p>Select a guest to start chatting.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function StaffChat({ conversation, call, socket, onBack }) {
  const id = conversation.stay_id;
  const chat = useChat({
    call,
    socket,
    side: 'staff',
    stayId: id,
    messagesPath: `/api/staff/stays/${id}/messages`,
    readPath: `/api/staff/stays/${id}/read`,
  });

  return (
    <div className="staff-chat">
      <div className="chat-head">
        <button className="icon-btn back-btn" onClick={onBack} aria-label="Back"><ArrowLeft size={20} /></button>
        <div className="room-badge">{conversation.room_number}</div>
        <div>
          <strong>{conversation.guest_name}</strong>
          <span className="muted small">Guest ID: {conversation.guest_login}</span>
        </div>
      </div>
      <ChatView chat={chat} side="staff" otherName={conversation.guest_name} emptyText="No messages yet. Send a welcome note!" />
    </div>
  );
}

import { useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMusicMatch } from '../context/MusicMatchContext';
import * as api from '../lib/api';

export function Chat() {
  const { 
    conversations, 
    fetchConversations, 
    loadingConversations, 
    user, 
    latentProfile, 
    latentUsers,
    compatibilities,
    addToast 
  } = useMusicMatch();
  const [searchParams] = useSearchParams();
  const targetUserId = searchParams.get('user') ? Number(searchParams.get('user')) : null;

  const [activeConvId, setActiveConvId] = useState<number | null>(null);
  const [messages, setMessages] = useState<api.Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [activeConv, setActiveConv] = useState<api.Conversation | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Crear mapa de compatibilidades
  const compatibilityMap = useMemo(() => {
    const map = new Map<number, number>();
    compatibilities.forEach(item => {
      map.set(item.userId, item.compatibilityScore);
    });
    return map;
  }, [compatibilities]);

  // Obtener top 5 usuarios más compatibles (excluyendo al usuario actual)
  const topCompatibleUsers = useMemo(() => {
    if (!latentProfile || latentUsers.length === 0) return [];
    
    return latentUsers
      .filter(u => u.userId !== latentProfile.userId && u.userId !== user?.id)
      .sort((a, b) => {
        const scoreA = compatibilityMap.get(a.userId) || 0;
        const scoreB = compatibilityMap.get(b.userId) || 0;
        return scoreB - scoreA;
      })
      .slice(0, 5)
      .map(u => ({
        ...u,
        compatibilityScore: compatibilityMap.get(u.userId) || 0
      }));
  }, [latentUsers, latentProfile, user, compatibilityMap]);

  useEffect(() => { 
    fetchConversations(); 
  }, []);

  // Auto-open conversation with targetUserId from query param
  useEffect(() => {
    if (targetUserId && !loadingConversations) {
      const existing = conversations.find(c => c.otherUserId === targetUserId);
      if (existing) {
        openConversation(existing);
      } else {
        // Start a new one
        api.chat.startConversation(targetUserId).then(conv => {
          fetchConversations();
          openConversation(conv);
        }).catch(e => addToast(e.message || 'Could not start conversation', 'error'));
      }
    }
  }, [targetUserId, loadingConversations]);

  const openConversation = async (conv: api.Conversation) => {
    setActiveConv(conv);
    setActiveConvId(conv.id);
    setLoadingMessages(true);
    try {
      const msgs = await api.chat.messages(conv.id);
      setMessages(msgs);
    } catch (e: any) {
      addToast(e?.message || 'Could not load messages', 'error');
    } finally {
      setLoadingMessages(false);
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!inputText.trim() || !activeConvId || sending) return;
    const text = inputText.trim();
    setInputText('');
    setSending(true);
    try {
      const msg = await api.chat.sendMessage(activeConvId, text);
      setMessages(prev => [...prev, msg]);
    } catch (e: any) {
      addToast(e?.message || 'Failed to send', 'error');
      setInputText(text); // restore
    } finally {
      setSending(false);
    }
  };

  // Start conversation with a user from latent space
  const startChatWithUser = async (userId: number) => {
    try {
      const conv = await api.chat.startConversation(userId);
      await fetchConversations();
      openConversation(conv);
    } catch (e: any) {
      addToast(e?.message || 'Could not start conversation', 'error');
    }
  };

  const formatTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Conversations sidebar */}
      <div style={{ width: '280px', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ fontSize: '18px', fontWeight: '700' }}>💬 Chats</h2>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loadingConversations ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '32px' }}><div className="spinner" /></div>
          ) : conversations.length === 0 ? (
            <div style={{ padding: '20px', color: 'var(--muted-foreground)', fontSize: '13px', textAlign: 'center' }}>
              <p style={{ marginBottom: '12px' }}>No conversations yet</p>
              {topCompatibleUsers.length > 0 && (
                <>
                  <p style={{ fontSize: '12px', marginBottom: '8px' }}>Start a chat with your top compatible users:</p>
                  {topCompatibleUsers.map(u => (
                    <button key={u.userId} onClick={() => startChatWithUser(u.userId)}
                      style={{ display: 'block', width: '100%', marginBottom: '6px', padding: '8px', borderRadius: '6px', background: 'var(--muted)', border: '1px solid var(--border)', color: 'var(--foreground)', cursor: 'pointer', fontSize: '13px' }}>
                      {u.userName} ({Math.round(u.compatibilityScore)}%)
                    </button>
                  ))}
                </>
              )}
            </div>
          ) : (
            conversations.map(conv => (
              <div
                key={conv.id}
                onClick={() => openConversation(conv)}
                style={{
                  padding: '14px 20px', cursor: 'pointer', transition: 'background 0.1s',
                  background: activeConvId === conv.id ? 'rgba(124,58,237,0.15)' : 'transparent',
                  borderLeft: activeConvId === conv.id ? '2px solid var(--primary)' : '2px solid transparent',
                  display: 'flex', alignItems: 'center', gap: '10px',
                }}
              >
                <div className="avatar avatar-sm">{conv.otherUserName?.[0]?.toUpperCase() || '?'}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: '600', fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {conv.otherUserName || `User #${conv.otherUserId}`}
                  </p>
                  {conv.unreadCount > 0 && (
                    <span style={{ fontSize: '11px', background: 'var(--primary)', color: 'white', borderRadius: '10px', padding: '1px 6px' }}>{conv.unreadCount} new</span>
                  )}
                </div>
                {/* Mostrar compatibilidad si existe */}
                {compatibilityMap.has(conv.otherUserId) && (
                  <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>
                    {Math.round(compatibilityMap.get(conv.otherUserId) || 0)}%
                  </span>
                )}
              </div>
            ))
          )}
        </div>

        {/* Top 5 Compatible Users - siempre visible */}
        {topCompatibleUsers.length > 0 && (
          <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px' }}>
            <p style={{ fontSize: '11px', color: 'var(--muted-foreground)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
              🏆 Top {topCompatibleUsers.length} Compatible
            </p>
            {topCompatibleUsers.map(u => {
              const existingConv = conversations.find(c => c.otherUserId === u.userId);
              return (
                <button 
                  key={u.userId} 
                  onClick={() => existingConv ? openConversation(existingConv) : startChatWithUser(u.userId)}
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '8px', 
                    width: '100%', 
                    marginBottom: '4px', 
                    padding: '6px 8px', 
                    borderRadius: '6px', 
                    background: 'transparent', 
                    border: 'none', 
                    color: 'var(--muted-foreground)', 
                    cursor: 'pointer', 
                    fontSize: '13px', 
                    transition: 'background 0.1s' 
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--muted)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <div className="avatar avatar-sm">{u.userName[0].toUpperCase()}</div>
                  <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {u.userName}
                  </span>
                  <span style={{ 
                    fontSize: '11px', 
                    fontWeight: '600',
                    color: u.compatibilityScore > 70 ? '#fbbf24' : 'var(--muted-foreground)'
                  }}>
                    {Math.round(u.compatibilityScore)}%
                  </span>
                  {existingConv && (
                    <span style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>💬</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Messages area */}
      {activeConv ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="avatar avatar-md">{activeConv.otherUserName?.[0]?.toUpperCase() || '?'}</div>
            <div>
              <p style={{ fontWeight: '700', fontSize: '16px' }}>{activeConv.otherUserName}</p>
              {compatibilityMap.has(activeConv.otherUserId) && (
                <p style={{ fontSize: '12px', color: '#fbbf24' }}>
                  {Math.round(compatibilityMap.get(activeConv.otherUserId) || 0)}% compatible
                </p>
              )}
            </div>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {loadingMessages ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '32px' }}><div className="spinner" /></div>
            ) : messages.length === 0 ? (
              <div className="empty-state" style={{ padding: '48px' }}>
                <div className="empty-icon">💬</div>
                <h3>No messages yet</h3>
                <p>Start the conversation!</p>
              </div>
            ) : (
              messages.map(msg => {
                const isMe = msg.senderId === user?.id;
                return (
                  <div key={msg.id} style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', gap: '8px', alignItems: 'flex-end' }}>
                    {!isMe && <div className="avatar avatar-sm" style={{ flexShrink: 0 }}>{msg.senderName[0].toUpperCase()}</div>}
                    <div style={{
                      maxWidth: '70%', padding: '10px 14px', borderRadius: isMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                      background: isMe ? 'linear-gradient(135deg, var(--primary) 0%, #0891b2 100%)' : 'var(--card)',
                      border: isMe ? 'none' : '1px solid var(--border)',
                    }}>
                      <p style={{ fontSize: '14px', lineHeight: '1.5', wordBreak: 'break-word' }}>{msg.content}</p>
                      <p style={{ fontSize: '10px', color: isMe ? 'rgba(255,255,255,0.6)' : 'var(--muted-foreground)', marginTop: '4px', textAlign: 'right' }}>
                        {formatTime(msg.sentAt)}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: '12px' }}>
            <input
              className="input"
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder="Type a message…"
              maxLength={1000}
              disabled={sending}
            />
            <button
              className="btn btn-primary"
              onClick={sendMessage}
              disabled={!inputText.trim() || sending}
              style={{ flexShrink: 0 }}
            >
              {sending ? '…' : '➤'}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: 'var(--muted-foreground)', gap: '12px' }}>
          <p style={{ fontSize: '40px' }}>💬</p>
          <p style={{ fontSize: '16px', fontWeight: '600', color: 'var(--foreground)' }}>Select a conversation</p>
          <p style={{ fontSize: '14px' }}>or start a new one from the sidebar</p>
        </div>
      )}
    </div>
  );
}

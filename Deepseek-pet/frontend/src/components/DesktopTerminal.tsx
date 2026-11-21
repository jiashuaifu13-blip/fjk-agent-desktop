import React, { useState, useRef, useEffect } from 'react';
import { Terminal } from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const DesktopTerminal: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Simulate OpenClaw Agent connection
  useEffect(() => {
    const simulateConnection = () => {
      setTimeout(() => {
        setIsConnected(true);
        setCurrentSessionId(`session_${Math.random().toString(36).substr(2, 9)}`);
        addSystemMessage('Connected to OpenClaw Agent. Ready for task.');
      }, 1500);
    };

    simulateConnection();
  }, []);

  const addSystemMessage = (content: string) => {
    const newMessage: Message = {
      id: Date.now().toString(),
      role: 'assistant',
      content,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, newMessage]);
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || !isConnected) return;

    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');

    // Simulate agent response
    setTimeout(() => {
      const responses = [
        'Task received. Processing...',
        'Agent session started. What would you like to do?',
        'Ready for input. Please specify your request.',
        'Agent connected. Waiting for task...',
      ];
      const randomResponse = responses[Math.floor(Math.random() * responses.length)];
      addSystemMessage(randomResponse);
    }, 800);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(e as any);
    }
  };

  return (
    <div className="terminal-container">
      {/* Terminal Header */}
      <div className="terminal-header">
        <div className="terminal-title">
          <Terminal size={16} className="inline-block mr-2" />
          FJK Agent Terminal
        </div>
        <div className="terminal-status">
          {isConnected ? (
            <span className="status-connected">● Connected</span>
          ) : (
            <span className="status-disconnected">○ Connecting...</span>
          )}
        </div>
        {currentSessionId && (
          <div className="session-id">Session: {currentSessionId}</div>
        )}
      </div>

      {/* Messages Area */}
      <div className="messages-container">
        {messages.map((message) => (
          <div key={message.id} className={`message ${message.role}`}>
            <div className="message-bubble">
              <div className="message-content">{message.content}</div>
              <div className="message-time">
                {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <form onSubmit={handleSendMessage} className="terminal-input">
        <div className="input-wrapper">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type your request here..."
            disabled={!isConnected}
            className="terminal-input-field"
          />
        </div>
        <button
          type="submit"
          disabled={!isConnected || !inputValue.trim()}
          className="terminal-send-button"
        >
          Send
        </button>
      </form>

      <style jsx>{`
        .terminal-container {
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          background: #1e1e1e;
          color: #d4d4d4;
          font-family: 'Consolas', 'Monaco', monospace;
          overflow: hidden;
        }

        .terminal-header {
          background: #2d2d2d;
          padding: 8px 12px;
          border-bottom: 1px solid #3d3d3d;
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }

        .terminal-title {
          font-size: 14px;
          font-weight: 500;
          color: #4fc1ff;
        }

        .terminal-status {
          font-size: 12px;
        }

        .status-connected {
          color: #4ade80;
        }

        .status-disconnected {
          color: #f87171;
        }

        .session-id {
          font-size: 12px;
          color: #888;
        }

        .messages-container {
          flex: 1;
          padding: 16px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 12px;
          background: #1a1a1a;
        }

        .message {
          max-width: 80%;
          padding: 10px 14px;
          border-radius: 12px;
          font-size: 14px;
          line-height: 1.5;
        }

        .message.user {
          align-self: flex-end;
          background: #3b82f6;
          color: white;
        }

        .message.assistant {
          align-self: flex-start;
          background: #2a2a2a;
          color: #d4d4d4;
        }

        .message-bubble {
          position: relative;
        }

        .message-content {
          word-break: break-word;
        }

        .message-time {
          font-size: 10px;
          opacity: 0.7;
          margin-top: 4px;
        }

        .terminal-input {
          padding: 12px 16px;
          background: #2d2d2d;
          border-top: 1px solid #3d3d3d;
          display: flex;
          gap: 8px;
        }

        .input-wrapper {
          flex: 1;
          position: relative;
        }

        .terminal-input-field {
          width: 100%;
          background: #1a1a1a;
          border: 1px solid #444;
          border-radius: 6px;
          padding: 8px 12px;
          color: #d4d4d4;
          font-family: inherit;
          font-size: 14px;
        }

        .terminal-input-field:focus {
          outline: none;
          border-color: #4fc1ff;
        }

        .terminal-send-button {
          background: #3b82f6;
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 6px;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.2s;
        }

        .terminal-send-button:disabled {
          background: #555;
          cursor: not-allowed;
        }

        .terminal-send-button:not(:disabled):hover {
          background: #2563eb;
        }
      `}</style>
    </div>
  );
};

export default DesktopTerminal;
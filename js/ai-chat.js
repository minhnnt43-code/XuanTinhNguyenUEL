/**
 * ai-chat.js - AI Chat Assistant
 * Chat popup để hỏi đáp về hoạt động XTN
 */

import { setApiKey, callGroqAPI } from './ai-service.js';
import { db } from './firebase.js';
import { collection, getDocs, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ============================================================
// STATE
// ============================================================
let chatHistory = [];
let activitiesCache = [];
let isOpen = false;

// ============================================================
// INIT
// ============================================================
export function initAIChat() {
    console.log('[AI Chat] Initializing...');

    // Load API key
    const savedKey = localStorage.getItem('groq_api_key');
    if (savedKey) {
        setApiKey(savedKey);
    }

    // Create chat UI
    createChatUI();

    // Load activities for context
    loadActivitiesContext();

    console.log('[AI Chat] Initialized');
}

// ============================================================
// CREATE CHAT UI
// ============================================================
function createChatUI() {
    // Chat button (floating)
    const chatBtn = document.createElement('button');
    chatBtn.id = 'ai-chat-btn';
    chatBtn.className = 'ai-chat-btn';
    chatBtn.innerHTML = '<i class="fa-solid fa-comments"></i>';
    chatBtn.title = 'Chat với AI';
    chatBtn.onclick = toggleChat;

    // Chat popup
    const chatPopup = document.createElement('div');
    chatPopup.id = 'ai-chat-popup';
    chatPopup.className = 'ai-chat-popup';
    chatPopup.innerHTML = `
        <div class="ai-chat-header">
            <div class="ai-chat-title">
                <i class="fa-solid fa-robot"></i> AI Assistant
            </div>
            <button class="ai-chat-close" onclick="window.toggleAIChat()">
                <i class="fa-solid fa-times"></i>
            </button>
        </div>
        <div class="ai-chat-messages" id="ai-chat-messages">
            <div class="ai-message bot">
                <i class="fa-solid fa-robot"></i>
                <div class="message-content">
                    Xin chào! Tôi là AI Assistant của XTN 2026. Bạn có thể hỏi tôi về:
                    <ul>
                        <li>Các hoạt động đã/sắp diễn ra</li>
                        <li>Thống kê hoạt động</li>
                        <li>Tìm kiếm thông tin</li>
                    </ul>
                </div>
            </div>
        </div>
        <div class="ai-chat-input-area">
            <input type="text" id="ai-chat-input" placeholder="Nhập câu hỏi..." onkeypress="if(event.key==='Enter') window.sendAIMessage()">
            <button onclick="window.sendAIMessage()">
                <i class="fa-solid fa-paper-plane"></i>
            </button>
        </div>
    `;

    // Add styles
    const styles = document.createElement('style');
    styles.textContent = `
        .ai-chat-btn {
            position: fixed;
            bottom: 90px;
            right: 20px;
            width: 56px;
            height: 56px;
            border-radius: 50%;
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            border: none;
            cursor: pointer;
            box-shadow: 0 4px 20px rgba(102, 126, 234, 0.4);
            z-index: 999;
            font-size: 1.4rem;
            transition: all 0.3s;
        }
        .ai-chat-btn:hover {
            transform: scale(1.1);
            box-shadow: 0 6px 25px rgba(102, 126, 234, 0.5);
        }
        .ai-chat-btn.active {
            background: #dc2626;
        }
        
        .ai-chat-popup {
            position: fixed;
            bottom: 160px;
            right: 20px;
            width: 380px;
            max-width: calc(100vw - 40px);
            height: 500px;
            max-height: calc(100vh - 200px);
            background: white;
            border-radius: 20px;
            box-shadow: 0 10px 50px rgba(0, 0, 0, 0.2);
            z-index: 998;
            display: none;
            flex-direction: column;
            overflow: hidden;
        }
        .ai-chat-popup.show {
            display: flex;
            animation: slideUp 0.3s ease;
        }
        @keyframes slideUp {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }
        
        .ai-chat-header {
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            padding: 15px 20px;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .ai-chat-title {
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .ai-chat-close {
            background: rgba(255,255,255,0.2);
            border: none;
            color: white;
            width: 32px;
            height: 32px;
            border-radius: 50%;
            cursor: pointer;
            font-size: 1rem;
        }
        
        .ai-chat-messages {
            flex: 1;
            overflow-y: auto;
            padding: 15px;
            display: flex;
            flex-direction: column;
            gap: 15px;
        }
        
        .ai-message {
            display: flex;
            gap: 10px;
            max-width: 90%;
        }
        .ai-message.user {
            align-self: flex-end;
            flex-direction: row-reverse;
        }
        .ai-message i {
            width: 32px;
            height: 32px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
        }
        .ai-message.bot i {
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
        }
        .ai-message.user i {
            background: #10b981;
            color: white;
        }
        .message-content {
            background: #f3f4f6;
            padding: 12px 16px;
            border-radius: 16px;
            font-size: 0.95rem;
            line-height: 1.5;
        }
        .ai-message.user .message-content {
            background: #667eea;
            color: white;
        }
        .message-content ul {
            margin: 8px 0 0 16px;
            padding: 0;
        }
        .message-content li {
            margin: 4px 0;
        }
        
        .ai-chat-input-area {
            padding: 15px;
            border-top: 1px solid #e5e7eb;
            display: flex;
            gap: 10px;
        }
        .ai-chat-input-area input {
            flex: 1;
            padding: 12px 16px;
            border: 2px solid #e5e7eb;
            border-radius: 25px;
            font-size: 0.95rem;
            outline: none;
        }
        .ai-chat-input-area input:focus {
            border-color: #667eea;
        }
        .ai-chat-input-area button {
            width: 44px;
            height: 44px;
            border-radius: 50%;
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            border: none;
            cursor: pointer;
            font-size: 1rem;
        }
        
        .typing-indicator {
            display: flex;
            gap: 5px;
            padding: 10px;
        }
        .typing-indicator span {
            width: 8px;
            height: 8px;
            background: #667eea;
            border-radius: 50%;
            animation: typing 1s infinite;
        }
        .typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
        .typing-indicator span:nth-child(3) { animation-delay: 0.4s; }
        @keyframes typing {
            0%, 100% { opacity: 0.3; transform: scale(0.8); }
            50% { opacity: 1; transform: scale(1); }
        }
        
        @media (max-width: 500px) {
            .ai-chat-popup {
                bottom: 0;
                right: 0;
                left: 0;
                width: 100%;
                max-width: 100%;
                height: 70vh;
                border-radius: 20px 20px 0 0;
            }
            .ai-chat-btn {
                bottom: 80px;
                right: 15px;
            }
        }
    `;

    document.head.appendChild(styles);
    document.body.appendChild(chatBtn);
    document.body.appendChild(chatPopup);

    // Expose functions
    window.toggleAIChat = toggleChat;
    window.sendAIMessage = sendMessage;
}

// ============================================================
// TOGGLE CHAT
// ============================================================
function toggleChat() {
    const popup = document.getElementById('ai-chat-popup');
    const btn = document.getElementById('ai-chat-btn');

    isOpen = !isOpen;

    if (isOpen) {
        popup.classList.add('show');
        btn.classList.add('active');
        btn.innerHTML = '<i class="fa-solid fa-times"></i>';
        document.getElementById('ai-chat-input').focus();
    } else {
        popup.classList.remove('show');
        btn.classList.remove('active');
        btn.innerHTML = '<i class="fa-solid fa-comments"></i>';
    }
}

// ============================================================
// LOAD ACTIVITIES CONTEXT
// ============================================================
async function loadActivitiesContext() {
    try {
        const q = query(collection(db, 'xtn_activities'), orderBy('date', 'desc'), limit(50));
        const snapshot = await getDocs(q);

        activitiesCache = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            activitiesCache.push({
                id: doc.id,
                name: data.name || data.title || 'Không tên',
                date: data.date || 'N/A',
                location: data.location || 'N/A',
                team: data.team || 'N/A',
                participants: data.participants || 0
            });
        });

        console.log('[AI Chat] Loaded', activitiesCache.length, 'activities for context');
    } catch (e) {
        console.warn('[AI Chat] Could not load activities:', e);
    }
}

// ============================================================
// SEND MESSAGE
// ============================================================
async function sendMessage() {
    const input = document.getElementById('ai-chat-input');
    const message = input.value.trim();

    if (!message) return;

    // Check API key
    const savedKey = localStorage.getItem('groq_api_key');
    if (!savedKey) {
        addMessage('Vui lòng nhập Groq API Key trong phần Báo cáo AI trước!', 'bot');
        return;
    }

    // Add user message
    addMessage(message, 'user');
    input.value = '';

    // Show typing indicator
    showTyping();

    try {
        const response = await getAIResponse(message);
        hideTyping();
        addMessage(response, 'bot');
    } catch (error) {
        hideTyping();
        addMessage('Xin lỗi, có lỗi xảy ra: ' + error.message, 'bot');
    }
}

// ============================================================
// GET AI RESPONSE
// ============================================================
async function getAIResponse(userMessage) {
    // Build context from activities
    const activitiesContext = activitiesCache.slice(0, 20).map(a =>
        `- ${a.name} (${a.date}) tại ${a.location}, ${a.team}, ${a.participants} người`
    ).join('\n');

    const systemPrompt = `Bạn là AI Assistant của chiến dịch Xuân Tình Nguyện UEL 2026.
Trả lời ngắn gọn, thân thiện, hữu ích.

Thông tin về các hoạt động gần đây:
${activitiesContext || 'Chưa có dữ liệu hoạt động.'}

Nếu không biết hoặc không liên quan, hãy trả lời lịch sự rằng bạn chỉ hỗ trợ về hoạt động XTN.`;

    chatHistory.push({ role: 'user', content: userMessage });

    // Build messages with history (keep last 6 messages)
    const recentHistory = chatHistory.slice(-6);

    const response = await callGroqAPI(userMessage, systemPrompt);

    chatHistory.push({ role: 'assistant', content: response });

    return response;
}

// ============================================================
// UI HELPERS
// ============================================================
function addMessage(content, type) {
    const container = document.getElementById('ai-chat-messages');
    const msg = document.createElement('div');
    msg.className = `ai-message ${type}`;
    msg.innerHTML = `
        <i class="fa-solid fa-${type === 'bot' ? 'robot' : 'user'}"></i>
        <div class="message-content">${content}</div>
    `;
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
}

function showTyping() {
    const container = document.getElementById('ai-chat-messages');
    const typing = document.createElement('div');
    typing.id = 'typing-indicator';
    typing.className = 'ai-message bot';
    typing.innerHTML = `
        <i class="fa-solid fa-robot"></i>
        <div class="message-content">
            <div class="typing-indicator">
                <span></span><span></span><span></span>
            </div>
        </div>
    `;
    container.appendChild(typing);
    container.scrollTop = container.scrollHeight;
}

function hideTyping() {
    const typing = document.getElementById('typing-indicator');
    if (typing) typing.remove();
}

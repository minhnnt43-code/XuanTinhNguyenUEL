/**
 * ai-chatbot.js - AI Chatbot for XTN 2026 Landing Page
 * Uses Groq API for conversation
 * Loads FAQ data from Firebase (xtn_settings/campaign_info)
 */

import { callGroqAI } from './groq-api.js';
import { db } from './firebase.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ============================================================
// STATE
// ============================================================
let isOpen = false;
let conversationHistory = [];
let campaignData = null; // Loaded from Firebase

// ============================================================
// LOAD CAMPAIGN DATA FROM FIREBASE
// ============================================================
async function loadCampaignData() {
    try {
        const docSnap = await getDoc(doc(db, 'xtn_settings', 'campaign_info'));
        if (docSnap.exists()) {
            campaignData = docSnap.data();
            console.log('[AI Chatbot] Campaign data loaded from Firebase');
            return true;
        } else {
            console.warn('[AI Chatbot] No campaign data found in Firebase. Using defaults.');
            // Fallback defaults
            campaignData = {
                name: 'Xuân Tình Nguyện UEL 2026',
                school: 'Đại học Kinh tế - Luật (UEL)',
                startDate: '2025-12-15',
                endDate: '2026-02-15',
                location: 'TP. Hồ Chí Minh',
                conditions: ['Là sinh viên UEL', 'Có tinh thần trách nhiệm'],
                benefits: ['Giấy chứng nhận', 'Điểm rèn luyện'],
                teams: ['Đội hình Truyền thông', 'Đội hình Y tế'],
                registerSteps: ['Điền form đăng ký', 'Chờ xét duyệt'],
                contact: {
                    fanpage: 'https://facebook.com/xuantinhnguyen.uel',
                    email: 'xuantinhnguyen@uel.edu.vn',
                    hotline: 'Liên hệ qua Fanpage'
                }
            };
            return false;
        }
    } catch (error) {
        console.error('[AI Chatbot] Error loading campaign data:', error);
        return false;
    }
}

// ============================================================
// INIT CHATBOT
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('[AI Chatbot] Initializing...');

    // Load campaign data from Firebase
    await loadCampaignData();

    const toggle = document.getElementById('ai-chatbot-toggle');
    const panel = document.getElementById('ai-chatbot-panel');
    const closeBtn = document.getElementById('ai-chatbot-close');
    const input = document.getElementById('chatbot-input');
    const sendBtn = document.getElementById('chatbot-send');
    const suggestions = document.getElementById('chatbot-suggestions');

    if (!toggle || !panel) {
        console.warn('[AI Chatbot] Elements not found');
        return;
    }

    // Toggle panel
    toggle.addEventListener('click', () => {
        isOpen = !isOpen;
        panel.style.display = isOpen ? 'flex' : 'none';
        if (isOpen && conversationHistory.length === 0) {
            showWelcomeMessage();
        }
    });

    // Close panel
    closeBtn?.addEventListener('click', () => {
        isOpen = false;
        panel.style.display = 'none';
    });

    // Send message
    sendBtn?.addEventListener('click', sendMessage);
    input?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

    // Suggestion buttons
    suggestions?.querySelectorAll('.suggestion-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const question = btn.dataset.question;
            if (question) {
                input.value = question;
                sendMessage();
            }
        });
    });

    console.log('[AI Chatbot] Ready');
});

// ============================================================
// WELCOME MESSAGE
// ============================================================
function showWelcomeMessage() {
    const hour = new Date().getHours();
    let greeting = '';
    if (hour >= 5 && hour < 12) {
        greeting = 'Chào buổi sáng! ☀️';
    } else if (hour >= 12 && hour < 18) {
        greeting = 'Chào buổi chiều! 🌤️';
    } else {
        greeting = 'Chào buổi tối! 🌙';
    }

    const campaignName = campaignData?.name || 'Xuân Tình Nguyện UEL 2026';

    addMessage('bot', `${greeting}

Tôi là trợ lý AI của chiến dịch **${campaignName}**! 🎉

Tôi có thể giúp bạn:
• Thông tin về chiến dịch
• Điều kiện và quyền lợi khi tham gia
• Các đội hình và cách đăng ký
• Liên hệ Ban Chỉ huy

Hãy đặt câu hỏi hoặc chọn gợi ý bên dưới nhé!`);
}

// ============================================================
// ADD MESSAGE
// ============================================================
function addMessage(role, content) {
    const container = document.getElementById('chatbot-messages');
    if (!container) return;

    const div = document.createElement('div');
    div.className = `chat-message ${role}`;

    // Simple markdown: bold
    const html = content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    div.innerHTML = `
        <div class="message-avatar">
            ${role === 'bot' ? '<i class="fa-solid fa-robot"></i>' : '<i class="fa-solid fa-user"></i>'}
        </div>
        <div class="message-content">${html.replace(/\n/g, '<br>')}</div>
    `;

    container.appendChild(div);
    container.scrollTop = container.scrollHeight;

    conversationHistory.push({ role, content });
}

// ============================================================
// SEND MESSAGE
// ============================================================
async function sendMessage() {
    const input = document.getElementById('chatbot-input');
    const message = input?.value?.trim();

    if (!message) return;

    // Clear input
    input.value = '';

    // Add user message
    addMessage('user', message);

    // Show typing indicator
    const container = document.getElementById('chatbot-messages');
    const typing = document.createElement('div');
    typing.className = 'chat-message bot typing';
    typing.innerHTML = `
        <div class="message-avatar"><i class="fa-solid fa-robot"></i></div>
        <div class="message-content"><i class="fa-solid fa-circle-notch fa-spin"></i> Đang trả lời...</div>
    `;
    container.appendChild(typing);
    container.scrollTop = container.scrollHeight;

    try {
        const response = await getAIResponse(message);
        typing.remove();
        addMessage('bot', response);
    } catch (error) {
        typing.remove();
        addMessage('bot', '❌ Xin lỗi, đã có lỗi xảy ra. Vui lòng thử lại sau.');
        console.error('[AI Chatbot] Error:', error);
    }
}

// ============================================================
// FORMAT DATE
// ============================================================
function formatDate(dateStr) {
    if (!dateStr) return 'Chưa cập nhật';
    const date = new Date(dateStr);
    return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ============================================================
// GET AI RESPONSE
// ============================================================
async function getAIResponse(question) {
    // Ensure campaign data is loaded
    if (!campaignData) {
        await loadCampaignData();
    }

    const data = campaignData;
    const timeRange = `${formatDate(data.startDate)} - ${formatDate(data.endDate)}`;

    const systemPrompt = `Bạn là trợ lý AI thân thiện của chiến dịch tình nguyện.

THÔNG TIN CHIẾN DỊCH:
- Tên: ${data.name || 'Xuân Tình Nguyện UEL 2026'}
- Trường: ${data.school || 'Đại học Kinh tế - Luật'}
- Thời gian: ${timeRange}
- Địa điểm: ${data.location || 'TP. Hồ Chí Minh'}
${data.description ? `- Mô tả: ${data.description}` : ''}

ĐIỀU KIỆN THAM GIA:
${(data.conditions || []).map((d, i) => `${i + 1}. ${d}`).join('\n') || 'Chưa cập nhật'}

QUYỀN LỢI:
${(data.benefits || []).map((d, i) => `${i + 1}. ${d}`).join('\n') || 'Chưa cập nhật'}

CÁC ĐỘI HÌNH:
${(data.teams || []).join(', ') || 'Chưa cập nhật'}

LIÊN HỆ:
- Fanpage: ${data.contact?.fanpage || 'Chưa cập nhật'}
- Email: ${data.contact?.email || 'Chưa cập nhật'}
- Hotline: ${data.contact?.hotline || 'Liên hệ qua Fanpage'}

QUY TRÌNH ĐĂNG KÝ:
${(data.registerSteps || []).map((d, i) => `${i + 1}. ${d}`).join('\n') || 'Chưa cập nhật'}

BAN CHỈ HUY:
- Chỉ huy trưởng: ${data.leadership?.chief || 'Chưa cập nhật'}
- Chỉ huy phó: ${data.leadership?.deputy || 'Chưa cập nhật'}
- Thư ký: ${data.leadership?.secretary || 'Chưa cập nhật'}
${data.leadership?.members ? `- Thành viên BCH: ${data.leadership.members}` : ''}

FAQ - CÂU HỎI THƯỜNG GẶP:
${(data.faq || []).map(f => `Hỏi: ${f.question}\nĐáp: ${f.answer}`).join('\n\n') || 'Chưa có FAQ'}

QUY TẮC TRẢ LỜI:
- Trả lời bằng tiếng Việt, thân thiện, nhiệt tình
- Chỉ trả lời dựa trên thông tin được cung cấp ở trên
- Nếu không biết câu trả lời, hãy hướng dẫn liên hệ BCH qua Fanpage
- Giữ câu trả lời ngắn gọn, dễ hiểu (tối đa 150 từ)
- Dùng emoji phù hợp để thân thiện hơn`;

    const result = await callGroqAI(question, {
        systemPrompt,
        temperature: 0.6,
        maxTokens: 500
    });

    if (result.success) {
        return result.content;
    } else {
        throw new Error(result.error);
    }
}

/**
 * ai-service.js - Core AI Logic for XTN 2026
 * Tích hợp Groq API để hỗ trợ tạo báo cáo, viết content
 */

// ============================================================
// CẤU HÌNH
// ============================================================
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

// API Key - sẽ được set từ bên ngoài hoặc hardcode (nội bộ BCH)
let GROQ_API_KEY = '';

// ============================================================
// SET API KEY
// ============================================================
export function setApiKey(key) {
    GROQ_API_KEY = key;
    console.log('[AI] API Key đã được cấu hình');
}

export function getApiKey() {
    return GROQ_API_KEY;
}

// ============================================================
// GỌI GROQ API
// ============================================================
export async function callGroqAPI(prompt, systemPrompt = '') {
    if (!GROQ_API_KEY) {
        throw new Error('Chưa cấu hình API Key. Vui lòng nhập API Key trước.');
    }

    const messages = [];

    if (systemPrompt) {
        messages.push({
            role: 'system',
            content: systemPrompt
        });
    }

    messages.push({
        role: 'user',
        content: prompt
    });

    try {
        const response = await fetch(GROQ_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: GROQ_MODEL,
                messages: messages,
                temperature: 0.7,
                max_tokens: 2048
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error?.message || `API Error: ${response.status}`);
        }

        const data = await response.json();
        return data.choices[0]?.message?.content || '';
    } catch (error) {
        console.error('[AI] Lỗi gọi API:', error);
        throw error;
    }
}

// ============================================================
// TEMPLATES VIẾT CONTENT
// ============================================================
export const CONTENT_TEMPLATES = {
    fanpage: {
        name: 'Bài đăng Fanpage',
        icon: '📱',
        systemPrompt: `Bạn là chuyên gia viết content cho fanpage tình nguyện. Viết bài theo format sau:

🌸 [TIÊU ĐỀ HOẠT ĐỘNG] 🌸

📅 Thời gian: [Ngày/Giờ]
📍 Địa điểm: [Địa chỉ]

[Mô tả ngắn gọn về hoạt động - 2-3 câu, giọng văn nhiệt huyết, truyền cảm hứng]

✨ Điểm nổi bật:
• [Điểm 1]
• [Điểm 2]
• [Điểm 3]

👥 Với sự tham gia của [X] chiến sĩ

#XuanTinhNguyen2026 #XTN2026 #UEL #TinhNguyenViet

Lưu ý: Giọng văn trẻ trung, nhiệt huyết, dùng emoji phù hợp.`
    },

    recap: {
        name: 'Recap hoạt động',
        icon: '📝',
        systemPrompt: `Bạn là chuyên gia viết recap hoạt động tình nguyện. Viết bài theo format sau:

📋 RECAP: [TÊN HOẠT ĐỘNG]

🗓️ Diễn ra vào: [Ngày tháng năm]
📍 Tại: [Địa điểm]

【 TỔNG QUAN 】
[Mô tả tổng quan hoạt động trong 3-4 câu, giọng văn chân thành, cảm xúc]

【 THÀNH QUẢ 】
✅ [Thành quả 1]
✅ [Thành quả 2]
✅ [Thành quả 3]

【 CẢM NHẬN 】
"[Trích dẫn cảm nhận từ chiến sĩ/người dân - tự tạo phù hợp]"

💚 Cảm ơn [X] chiến sĩ đã đồng hành!

---
#XTN2026 #XuanTinhNguyenUEL #Recap

Lưu ý: Giọng văn ấm áp, chân thành, thể hiện tinh thần tình nguyện.`
    },

    announcement: {
        name: 'Thông báo nội bộ',
        icon: '📢',
        systemPrompt: `Bạn là BCH chiến dịch Xuân Tình Nguyện. Viết thông báo nội bộ theo format sau:

📢 THÔNG BÁO

Kính gửi toàn thể Chiến sĩ [Đội hình],

[Nội dung thông báo - rõ ràng, đầy đủ thông tin]

⏰ Thời gian: [...]
📍 Địa điểm: [...]
📋 Chuẩn bị: [...]

Mọi thắc mắc vui lòng liên hệ BCH Đội hình.

Trân trọng,
Ban Chỉ huy [Đội hình]

Lưu ý: Giọng văn trang trọng, rõ ràng, đầy đủ thông tin cần thiết.`
    }
};

// ============================================================
// TẠO CONTENT
// ============================================================
export async function generateContent(data, templateType) {
    const template = CONTENT_TEMPLATES[templateType];
    if (!template) {
        throw new Error('Template không tồn tại');
    }

    const prompt = `Dựa trên thông tin sau, hãy viết bài:

Tên hoạt động: ${data.activityName || 'Chưa có'}
Thời gian: ${data.time || 'Chưa có'}
Địa điểm: ${data.location || 'Chưa có'}
Đội hình: ${data.team || 'Chưa có'}
Số người tham gia: ${data.participants || 'Chưa có'}
Mô tả thêm: ${data.description || 'Không có'}

Hãy viết theo đúng format đã cho.`;

    return await callGroqAPI(prompt, template.systemPrompt);
}

// ============================================================
// TẠO BÁO CÁO
// ============================================================
export async function generateReport(activities, reportType = 'weekly') {
    const systemPrompt = `Bạn là trợ lý AI của chiến dịch Xuân Tình Nguyện UEL 2026. 
Hãy tạo báo cáo ${reportType === 'weekly' ? 'tuần' : 'tháng'} dựa trên danh sách hoạt động được cung cấp.

Format báo cáo:
📋 BÁO CÁO HOẠT ĐỘNG ${reportType === 'weekly' ? 'TUẦN' : 'THÁNG'}

1. TỔNG QUAN
   - Tổng số hoạt động: X
   - Tổng lượt tham gia: Y chiến sĩ
   
2. CHI TIẾT HOẠT ĐỘNG
   [Liệt kê từng hoạt động]

3. ĐIỂM NỔI BẬT
   [Những điểm đáng chú ý]

Lưu ý: Viết ngắn gọn, súc tích, dễ đọc.`;

    const activitiesText = activities.map(a =>
        `- ${a.name}: ${a.date}, ${a.location}, ${a.participants} người`
    ).join('\n');

    const prompt = `Danh sách hoạt động:\n${activitiesText}\n\nHãy tạo báo cáo.`;

    return await callGroqAPI(prompt, systemPrompt);
}

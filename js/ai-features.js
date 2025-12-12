/**
 * ai-features.js - AI Features for XTN 2026
 * Using Groq API (llama-3.3-70b-versatile)
 */

import { callGroqAI, parseJSONFromAI } from './groq-api.js';

// ============================================================
// AI TẠO HOẠT ĐỘNG TỪ MÔ TẢ
// ============================================================
export async function aiCreateActivity(description) {
    const systemPrompt = `Bạn là trợ lý AI cho chiến dịch Xuân Tình Nguyện UEL 2026.
Nhiệm vụ: Phân tích mô tả hoạt động và trích xuất thông tin.

Trả về JSON với format sau (KHÔNG có markdown, chỉ JSON thuần):
{
    "name": "Tên hoạt động",
    "date": "YYYY-MM-DD",
    "time": "HH:MM",
    "location": "Địa điểm",
    "description": "Mô tả chi tiết",
    "type": "meeting|volunteer|training|event|other",
    "estimatedParticipants": 50,
    "notes": "Ghi chú thêm (nếu có)"
}

Nếu thiếu thông tin, hãy điền giá trị hợp lý hoặc để trống.`;

    const result = await callGroqAI(description, {
        systemPrompt,
        temperature: 0.3,
        json: true
    });

    if (!result.success) {
        return { success: false, error: result.error };
    }

    const parsed = parseJSONFromAI(result.content);
    if (!parsed) {
        return { success: false, error: 'Không thể parse kết quả AI' };
    }

    return { success: true, data: parsed };
}

// ============================================================
// AI TẠO BÁO CÁO HOẠT ĐỘNG
// ============================================================
export async function aiGenerateReport(activitiesData, options = {}) {
    const {
        reportType = 'summary', // summary | detailed | statistics
        dateRange = 'all',
        teamFilter = null
    } = options;

    const systemPrompt = `Bạn là trợ lý AI cho chiến dịch Xuân Tình Nguyện UEL 2026.
Nhiệm vụ: Tạo báo cáo hoạt động chuyên nghiệp từ dữ liệu được cung cấp.

Yêu cầu:
- Viết bằng tiếng Việt, văn phong trang trọng
- Có tiêu đề, mở đầu, nội dung chính, kết luận
- Nếu là báo cáo thống kê, đưa ra các con số cụ thể
- Đề xuất cải thiện nếu phù hợp
- Format: Markdown với headers, bullet points, bold text`;

    const prompt = `Loại báo cáo: ${reportType === 'summary' ? 'Tóm tắt' : reportType === 'detailed' ? 'Chi tiết' : 'Thống kê'}
Phạm vi: ${dateRange === 'all' ? 'Toàn bộ' : dateRange}
${teamFilter ? `Đội: ${teamFilter}` : ''}

Dữ liệu hoạt động:
${JSON.stringify(activitiesData, null, 2)}

Hãy tạo báo cáo chuyên nghiệp.`;

    const result = await callGroqAI(prompt, {
        systemPrompt,
        temperature: 0.5,
        maxTokens: 4096
    });

    if (!result.success) {
        return { success: false, error: result.error };
    }

    return { success: true, content: result.content };
}

// ============================================================
// AI TẠO NỘI DUNG
// ============================================================
export async function aiGenerateContent(type, data) {
    const prompts = {
        'facebook_post': {
            system: 'Bạn là content creator cho chiến dịch Xuân Tình Nguyện UEL 2026. Viết bài đăng Facebook hấp dẫn, có emoji, hashtag phù hợp.',
            user: `Viết bài đăng Facebook cho hoạt động sau:\n${JSON.stringify(data)}`
        },
        'email': {
            system: 'Bạn là thư ký của chiến dịch Xuân Tình Nguyện UEL 2026. Viết email trang trọng, chuyên nghiệp.',
            user: `Viết email thông báo/mời tham gia:\n${JSON.stringify(data)}`
        },
        'slogan': {
            system: 'Bạn là copywriter sáng tạo. Tạo slogan/khẩu hiệu ngắn gọn, dễ nhớ, truyền cảm hứng.',
            user: `Tạo 5 slogan cho:\n${JSON.stringify(data)}`
        },
        'summary': {
            system: 'Bạn là biên tập viên. Tóm tắt nội dung ngắn gọn, súc tích.',
            user: `Tóm tắt nội dung sau:\n${JSON.stringify(data)}`
        }
    };

    const config = prompts[type];
    if (!config) {
        return { success: false, error: `Loại nội dung không hợp lệ: ${type}` };
    }

    const result = await callGroqAI(config.user, {
        systemPrompt: config.system,
        temperature: 0.7
    });

    return result;
}

// ============================================================
// AI TRẢ LỜI CÂU HỎI (Chatbot)
// ============================================================
export async function aiChatbot(question, context = '') {
    const systemPrompt = `Bạn là trợ lý AI của chiến dịch Xuân Tình Nguyện UEL 2026.
Thông tin về chiến dịch:
- Tên: Xuân Tình Nguyện UEL 2026
- Trường: Đại học Kinh tế - Luật (UEL), ĐHQG-HCM
- Mục đích: Hoạt động tình nguyện mùa xuân
${context}

Trả lời câu hỏi một cách thân thiện, chính xác và hữu ích.
Nếu không biết câu trả lời, hãy nói rõ và hướng dẫn liên hệ BCH.`;

    const result = await callGroqAI(question, {
        systemPrompt,
        temperature: 0.6
    });

    return result;
}

// ============================================================
// AI PHÂN TÍCH DỮ LIỆU
// ============================================================
export async function aiAnalyzeData(data, analysisType = 'general') {
    const systemPrompt = `Bạn là data analyst cho chiến dịch Xuân Tình Nguyện UEL 2026.
Phân tích dữ liệu và đưa ra insights hữu ích.
Trả lời bằng tiếng Việt, rõ ràng, có cấu trúc.`;

    const prompts = {
        'general': `Phân tích tổng quan dữ liệu sau và đưa ra nhận xét:\n${JSON.stringify(data)}`,
        'trend': `Phân tích xu hướng từ dữ liệu sau:\n${JSON.stringify(data)}`,
        'suggestion': `Dựa trên dữ liệu sau, đưa ra đề xuất cải thiện:\n${JSON.stringify(data)}`,
        'comparison': `So sánh và đối chiếu dữ liệu:\n${JSON.stringify(data)}`
    };

    const prompt = prompts[analysisType] || prompts['general'];

    const result = await callGroqAI(prompt, {
        systemPrompt,
        temperature: 0.4
    });

    return result;
}

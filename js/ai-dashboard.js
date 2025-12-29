/**
 * ai-dashboard.js - AI Integration for Dashboard
 * Xử lý các chức năng AI trong dashboard: Báo cáo, etc.
 */

import { setApiKey, callGroqAPI, generateReport } from './ai-service.js';
import { db } from './firebase.js';
import { collection, getDocs, query, where, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ============================================================
// INIT
// ============================================================
export function initAIDashboard() {
    console.log('[AI Dashboard] Initializing...');

    // Load saved API key
    const savedKey = localStorage.getItem('groq_api_key');
    if (savedKey) {
        setApiKey(savedKey);
        console.log('[AI Dashboard] API Key loaded from localStorage');
    }

    // Bind buttons
    const btnReport = document.getElementById('btn-ai-report');
    if (btnReport) {
        btnReport.addEventListener('click', openAIReportModal);
    }

    const btnGenerateReport = document.getElementById('btn-ai-generate-report');
    if (btnGenerateReport) {
        btnGenerateReport.addEventListener('click', generateAIReport);
    }

    const btnCopyReport = document.getElementById('btn-copy-report');
    if (btnCopyReport) {
        btnCopyReport.addEventListener('click', copyReportContent);
    }

    console.log('[AI Dashboard] Initialized');
}

// ============================================================
// MODAL CONTROL
// ============================================================
function openAIReportModal() {
    // Check API key
    const savedKey = localStorage.getItem('groq_api_key');
    if (!savedKey) {
        Swal.fire({
            title: 'Nhập Groq API Key',
            input: 'password',
            inputPlaceholder: 'gsk_xxxxxxxxxxxxx',
            showCancelButton: true,
            confirmButtonText: 'Lưu',
            cancelButtonText: 'Hủy',
            confirmButtonColor: '#667eea',
            inputValidator: (value) => {
                if (!value) return 'Vui lòng nhập API Key';
            }
        }).then((result) => {
            if (result.isConfirmed) {
                localStorage.setItem('groq_api_key', result.value);
                setApiKey(result.value);
                showToast('Đã lưu API Key!', 'success');
                showReportModal();
            }
        });
    } else {
        showReportModal();
    }
}

function showReportModal() {
    const modal = document.getElementById('modal-ai-report');
    if (modal) {
        modal.style.display = 'flex';
        // Reset result
        document.getElementById('ai-report-result').style.display = 'none';
        document.getElementById('ai-report-content').textContent = '';
    }
}

window.closeAIReportModal = function () {
    const modal = document.getElementById('modal-ai-report');
    if (modal) {
        modal.style.display = 'none';
    }
};

// ============================================================
// GENERATE REPORT
// ============================================================
async function generateAIReport() {
    const reportType = document.getElementById('ai-report-type')?.value || 'summary';
    const reportRange = document.getElementById('ai-report-range')?.value || 'all';

    const btn = document.getElementById('btn-ai-generate-report');
    const originalText = btn.innerHTML;

    try {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Đang tạo...';

        // Load activities from Firebase
        const activities = await loadActivitiesForReport(reportRange);

        if (activities.length === 0) {
            Swal.fire({
                icon: 'warning',
                title: 'Không có hoạt động',
                text: 'Không tìm thấy hoạt động nào trong khoảng thời gian đã chọn.',
                confirmButtonColor: '#667eea'
            });
            return;
        }

        // Generate report with AI
        const report = await generateReportWithAI(activities, reportType, reportRange);

        // Display result
        document.getElementById('ai-report-content').textContent = report;
        document.getElementById('ai-report-result').style.display = 'block';

        showToast('Đã tạo báo cáo thành công!', 'success');

    } catch (error) {
        console.error('[AI Dashboard] Error:', error);
        Swal.fire({
            icon: 'error',
            title: 'Lỗi',
            text: error.message || 'Không thể tạo báo cáo. Vui lòng thử lại.',
            confirmButtonColor: '#667eea'
        });
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// ============================================================
// LOAD ACTIVITIES
// ============================================================
async function loadActivitiesForReport(range) {
    try {
        let q = collection(db, 'xtn_activities');
        const now = new Date();

        if (range === 'week') {
            const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            q = query(q, where('date', '>=', weekAgo.toISOString().split('T')[0]));
        } else if (range === 'month') {
            const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            q = query(q, where('date', '>=', monthAgo.toISOString().split('T')[0]));
        }

        const snapshot = await getDocs(q);
        const activities = [];

        snapshot.forEach(doc => {
            const data = doc.data();
            activities.push({
                id: doc.id,
                name: data.name || data.title || 'Không tên',
                date: data.date || 'N/A',
                location: data.location || data.address || 'N/A',
                participants: data.participants || data.participant_count || 0,
                team: data.team || data.team_name || 'N/A',
                description: data.description || ''
            });
        });

        return activities;
    } catch (error) {
        console.error('[AI Dashboard] Error loading activities:', error);
        throw new Error('Không thể tải danh sách hoạt động');
    }
}

// ============================================================
// AI REPORT GENERATION
// ============================================================
async function generateReportWithAI(activities, type, range) {
    const rangeText = {
        'all': 'toàn bộ',
        'week': 'tuần này',
        'month': 'tháng này'
    }[range] || 'toàn bộ';

    const typePrompt = {
        'summary': 'Viết báo cáo tóm tắt ngắn gọn, súc tích.',
        'detailed': 'Viết báo cáo chi tiết, đầy đủ thông tin về từng hoạt động.',
        'statistics': 'Viết báo cáo thống kê với các con số cụ thể, phân tích số liệu.'
    }[type] || 'Viết báo cáo tóm tắt.';

    const systemPrompt = `Bạn là trợ lý AI của chiến dịch Xuân Tình Nguyện UEL 2026.
${typePrompt}

Format báo cáo:
📋 BÁO CÁO HOẠT ĐỘNG ${rangeText.toUpperCase()}
Ngày tạo: ${new Date().toLocaleDateString('vi-VN')}

1. TỔNG QUAN
   - Tổng số hoạt động: [số]
   - Tổng lượt tham gia: [số] chiến sĩ
   
2. CHI TIẾT HOẠT ĐỘNG
   [Liệt kê từng hoạt động với thông tin cơ bản]

3. NHẬN XÉT
   [Nhận xét tổng quan về các hoạt động]

Lưu ý: Viết bằng tiếng Việt, giọng văn chuyên nghiệp, súc tích.`;

    const activitiesText = activities.map((a, i) =>
        `${i + 1}. ${a.name}
   - Ngày: ${a.date}
   - Địa điểm: ${a.location}
   - Đội hình: ${a.team}
   - Số người: ${a.participants}`
    ).join('\n\n');

    const prompt = `Danh sách ${activities.length} hoạt động ${rangeText}:

${activitiesText}

Hãy tạo báo cáo theo format đã cho.`;

    return await callGroqAPI(prompt, systemPrompt);
}

// ============================================================
// COPY REPORT
// ============================================================
function copyReportContent() {
    const content = document.getElementById('ai-report-content')?.textContent || '';
    navigator.clipboard.writeText(content).then(() => {
        showToast('Đã copy báo cáo!', 'success');
    }).catch(err => {
        console.error('Copy failed:', err);
        showToast('Không thể copy', 'error');
    });
}

// ============================================================
// TOAST HELPER
// ============================================================
function showToast(message, type = 'info') {
    if (typeof window.showToast === 'function') {
        window.showToast(message, type);
    } else {
        console.log(`[Toast] ${type}: ${message}`);
    }
}

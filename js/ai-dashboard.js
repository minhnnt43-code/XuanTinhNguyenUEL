/**
 * ai-dashboard.js - AI Dashboard Features
 * XTN 2026 - AI Integration for Dashboard
 */

import { db } from './firebase.js';
import { collection, getDocs, query, where, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { callGroqAI } from './groq-api.js';

// ============================================================
// STATE
// ============================================================
let dashboardData = {
    members: [],
    teams: [],
    activities: [],
    reports: []
};
let isLoading = false;

// ============================================================
// INIT AI DASHBOARD
// ============================================================
export async function initAIDashboard() {
    console.log('[AI Dashboard] Initializing...');

    // Setup event listeners
    document.getElementById('btn-refresh-insights')?.addEventListener('click', refreshInsights);
    document.getElementById('btn-ai-detail-report')?.addEventListener('click', generateDetailReport);
    document.getElementById('btn-ai-auto-report')?.addEventListener('click', generateAutoReport);
    document.getElementById('btn-ai-team-analysis')?.addEventListener('click', openTeamAnalysisModal);

    // Load initial insights
    await refreshInsights();
}

// ============================================================
// LOAD DASHBOARD DATA
// ============================================================
async function loadDashboardData() {
    try {
        // Load members count
        const membersSnap = await getDocs(collection(db, 'xtn_users'));
        dashboardData.members = [];
        membersSnap.forEach(doc => {
            dashboardData.members.push({ id: doc.id, ...doc.data() });
        });

        // Load teams
        const teamsSnap = await getDocs(collection(db, 'xtn_teams'));
        dashboardData.teams = [];
        teamsSnap.forEach(doc => {
            dashboardData.teams.push({ id: doc.id, ...doc.data() });
        });

        // Load recent activities (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const activitiesSnap = await getDocs(collection(db, 'xtn_activities'));
        dashboardData.activities = [];
        activitiesSnap.forEach(doc => {
            dashboardData.activities.push({ id: doc.id, ...doc.data() });
        });

        // Load recent reports
        const reportsSnap = await getDocs(collection(db, 'xtn_reports'));
        dashboardData.reports = [];
        reportsSnap.forEach(doc => {
            dashboardData.reports.push({ id: doc.id, ...doc.data() });
        });

        console.log('[AI Dashboard] Data loaded:', {
            members: dashboardData.members.length,
            teams: dashboardData.teams.length,
            activities: dashboardData.activities.length,
            reports: dashboardData.reports.length
        });

        return true;
    } catch (error) {
        console.error('[AI Dashboard] Error loading data:', error);
        return false;
    }
}

// ============================================================
// GENERATE INSIGHTS
// ============================================================
export async function refreshInsights() {
    const container = document.getElementById('ai-insights-content');
    const actionsDiv = document.getElementById('ai-insights-actions');

    if (!container) return;
    if (isLoading) return;

    isLoading = true;

    // Show loading
    container.innerHTML = `
        <div class="ai-loading">
            <i class="fa-solid fa-circle-notch fa-spin"></i>
            <span>Đang phân tích dữ liệu...</span>
        </div>
    `;

    try {
        // Load fresh data
        await loadDashboardData();

        // Prepare summary for AI
        const summary = prepareSummaryForAI();

        // Call AI
        const result = await callGroqAI(summary.prompt, {
            systemPrompt: summary.systemPrompt,
            temperature: 0.4,
            maxTokens: 1024
        });

        if (result.success) {
            // Parse and display insights
            displayInsights(result.content);
            if (actionsDiv) actionsDiv.style.display = 'block';
        } else {
            throw new Error(result.error || 'Không thể lấy insights');
        }

    } catch (error) {
        console.error('[AI Dashboard] Insights error:', error);
        container.innerHTML = `
            <div class="ai-error">
                <i class="fa-solid fa-coffee"></i>
                <p style="margin: 10px 0;">AI đang nghỉ ngơi một chút! ☕</p>
                <small style="color:#888; display:block; margin-bottom:10px;">Hệ thống sẽ sẵn sàng trong vài phút nữa.</small>
                <button class="btn btn-sm btn-secondary" onclick="document.getElementById('btn-refresh-insights').click()">
                    <i class="fa-solid fa-sync"></i> Thử lại
                </button>
            </div>
        `;
        if (actionsDiv) actionsDiv.style.display = 'none';
    } finally {
        isLoading = false;
    }
}

// ============================================================
// PREPARE SUMMARY FOR AI
// ============================================================
function prepareSummaryForAI() {
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    // Calculate stats
    const totalMembers = dashboardData.members.filter(m => m.role === 'member').length;
    const pendingMembers = dashboardData.members.filter(m => m.role === 'pending').length;
    const totalTeams = dashboardData.teams.length;
    const totalActivities = dashboardData.activities.length;

    // Recent activities (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentActivities = dashboardData.activities.filter(a => {
        if (!a.date) return false;
        return new Date(a.date) >= sevenDaysAgo;
    }).length;

    // Activities today
    const activitiesToday = dashboardData.activities.filter(a =>
        a.date === today
    ).length;

    // Team stats
    const teamStats = dashboardData.teams.map(team => {
        const memberCount = dashboardData.members.filter(m => m.team_id === team.id).length;
        const teamActivities = dashboardData.activities.filter(a => a.team_id === team.id).length;
        return {
            name: team.team_name || team.id,
            members: memberCount,
            target: team.stats?.target_members || 40,
            activities: teamActivities
        };
    });

    // Find teams below quota
    const teamsNeedingMembers = teamStats.filter(t => t.members < t.target * 0.8);

    const systemPrompt = `Bạn là trợ lý AI phân tích dữ liệu cho chiến dịch Xuân Tình Nguyện UEL 2026.
Nhiệm vụ: Tạo insights ngắn gọn, hữu ích dựa trên dữ liệu thống kê.

Quy tắc:
- Viết tiếng Việt, súc tích, dễ hiểu
- Tối đa 5 bullet points
- Mỗi bullet point bắt đầu bằng emoji phù hợp
- Ưu tiên thông tin quan trọng và khẩn cấp
- Đưa ra đề xuất hành động cụ thể nếu cần
- KHÔNG bịa đặt dữ liệu, chỉ dùng số liệu được cung cấp`;

    const prompt = `Dữ liệu thống kê hôm nay (${today}):

📊 TỔNG QUAN:
- Tổng chiến sĩ: ${totalMembers}
- Đang chờ duyệt: ${pendingMembers}
- Số đội hình: ${totalTeams}
- Tổng hoạt động: ${totalActivities}

📅 HOẠT ĐỘNG:
- Hoạt động 7 ngày qua: ${recentActivities}
- Hoạt động hôm nay: ${activitiesToday}

🏆 TÌNH TRẠNG ĐỘI HÌNH:
${teamStats.map(t => `- ${t.name}: ${t.members}/${t.target} thành viên, ${t.activities} hoạt động`).join('\n')}

${teamsNeedingMembers.length > 0 ? `
⚠️ ĐỘI CẦN BỔ SUNG:
${teamsNeedingMembers.map(t => `- ${t.name}: còn thiếu ${t.target - t.members} người`).join('\n')}
` : ''}

Hãy đưa ra 3-5 insights quan trọng nhất.`;

    return { systemPrompt, prompt };
}

// ============================================================
// DISPLAY INSIGHTS
// ============================================================
function displayInsights(content) {
    const container = document.getElementById('ai-insights-content');
    if (!container) return;

    // Parse content - chuyển thành HTML list
    const lines = content.split('\n').filter(line => line.trim());
    const insights = lines.map(line => {
        // Xác định loại insight
        let type = '';
        if (line.includes('⚠️') || line.includes('cần') || line.includes('thiếu')) {
            type = 'warning';
        } else if (line.includes('🚨') || line.includes('khẩn') || line.includes('ngay')) {
            type = 'danger';
        } else if (line.includes('💡') || line.includes('gợi ý') || line.includes('nên')) {
            type = 'suggestion';
        }

        // Xác định icon
        let icon = 'fa-circle-info';
        if (line.startsWith('📊') || line.includes('tổng') || line.includes('thống kê')) {
            icon = 'fa-chart-pie';
        } else if (line.startsWith('📅') || line.includes('hoạt động')) {
            icon = 'fa-calendar-check';
        } else if (line.startsWith('👥') || line.includes('thành viên') || line.includes('chiến sĩ')) {
            icon = 'fa-users';
        } else if (line.startsWith('⚠️') || line.includes('cảnh báo')) {
            icon = 'fa-exclamation-triangle';
        } else if (line.startsWith('💡')) {
            icon = 'fa-lightbulb';
        } else if (line.startsWith('✅')) {
            icon = 'fa-check-circle';
        } else if (line.startsWith('🏆') || line.includes('đội')) {
            icon = 'fa-trophy';
        }

        // Clean text (remove emoji at start)
        const text = line.replace(/^[^\w\sÀ-ỹ]+/, '').trim();

        return { type, icon, text };
    }).filter(item => item.text.length > 5);

    if (insights.length === 0) {
        container.innerHTML = `
            <ul class="ai-insights-list">
                <li>
                    <i class="fa-solid fa-info-circle"></i>
                    <span>${content}</span>
                </li>
            </ul>
        `;
        return;
    }

    container.innerHTML = `
        <ul class="ai-insights-list">
            ${insights.map(item => `
                <li class="${item.type}">
                    <i class="fa-solid ${item.icon}"></i>
                    <span>${item.text}</span>
                </li>
            `).join('')}
        </ul>
    `;
}

// ============================================================
// GENERATE DETAIL REPORT
// ============================================================
async function generateDetailReport() {
    const btn = document.getElementById('btn-ai-detail-report');
    if (!btn) return;

    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang tạo...';
    btn.disabled = true;

    try {
        const summary = prepareSummaryForAI();

        const systemPrompt = `Bạn là trợ lý AI tạo báo cáo cho chiến dịch Xuân Tình Nguyện UEL 2026.
Nhiệm vụ: Tạo báo cáo tổng quan chi tiết từ dữ liệu thống kê.

Yêu cầu:
- Viết tiếng Việt, văn phong trang trọng
- Có cấu trúc rõ ràng: Tiêu đề, Tổng quan, Chi tiết, Đề xuất
- Dùng bullet points và headers
- Format markdown`;

        const result = await callGroqAI(summary.prompt + '\n\nTạo báo cáo tổng quan chi tiết.', {
            systemPrompt,
            temperature: 0.5,
            maxTokens: 2048
        });

        if (result.success) {
            // Show in Swal modal
            if (window.Swal) {
                Swal.fire({
                    title: 'Báo cáo AI',
                    html: `<div style="text-align:left; max-height:60vh; overflow-y:auto; white-space:pre-wrap; font-size:0.9rem;">${result.content.replace(/\n/g, '<br>')}</div>`,
                    width: '700px',
                    showCancelButton: true,
                    confirmButtonText: '<i class="fa-solid fa-copy"></i> Sao chép',
                    cancelButtonText: 'Đóng',
                    confirmButtonColor: '#22c55e'
                }).then((res) => {
                    if (res.isConfirmed) {
                        navigator.clipboard.writeText(result.content);
                        Swal.fire('Đã sao chép!', '', 'success');
                    }
                });
            } else {
                showToast(result.content, 'info', 8000);
            }
        } else {
            throw new Error(result.error);
        }

    } catch (error) {
        console.error('[AI Dashboard] Report error:', error);
        if (window.Swal) {
            Swal.fire('Lỗi', 'Không thể tạo báo cáo: ' + error.message, 'error');
        } else {
            showToast('Lỗi: ' + error.message, 'error');
        }
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// ============================================================
// AI ANALYZE TEAM (for future use)
// ============================================================
export async function analyzeTeam(teamId) {
    const team = dashboardData.teams.find(t => t.id === teamId);
    if (!team) return { success: false, error: 'Không tìm thấy đội' };

    const members = dashboardData.members.filter(m => m.team_id === teamId);
    const activities = dashboardData.activities.filter(a => a.team_id === teamId);

    const systemPrompt = `Bạn là trợ lý AI phân tích hiệu suất đội cho chiến dịch Xuân Tình Nguyện UEL 2026.
Nhiệm vụ: Phân tích điểm mạnh, điểm yếu và đề xuất cải thiện cho đội.

Quy tắc:
- Viết tiếng Việt
- KHÔNG so sánh với đội khác
- Tập trung vào điểm mạnh, điểm cần cải thiện, đề xuất hành động
- Tone tích cực, khuyến khích`;

    const prompt = `Phân tích đội: ${team.team_name || teamId}

THÔNG TIN ĐỘI:
- Số thành viên: ${members.length}
- Mục tiêu: ${team.stats?.target_members || 40} người
- Số hoạt động đã tổ chức: ${activities.length}

CHI TIẾT THÀNH VIÊN:
- Đội trưởng/Đội phó: ${members.filter(m => ['team_lead', 'team_deputy'].includes(m.position)).length}
- Chiến sĩ: ${members.filter(m => m.position === 'member' || !m.position).length}

Hãy đưa ra:
1. 3 điểm mạnh
2. 3 điểm cần cải thiện  
3. 3 đề xuất hành động cụ thể`;

    return await callGroqAI(prompt, {
        systemPrompt,
        temperature: 0.5
    });
}

// ============================================================
// GENERATE AUTO REPORT (from Report Tab)
// ============================================================
export async function generateAutoReport() {
    const btn = document.getElementById('btn-ai-auto-report');
    if (!btn) return;

    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang tạo...';
    btn.disabled = true;

    try {
        // Load data if needed
        if (dashboardData.activities.length === 0) {
            await loadDashboardData();
        }

        // Get filter values from Report tab
        const teamFilter = document.getElementById('report-team-select')?.value || '';
        const dateFilter = document.getElementById('report-date-filter')?.value || '';

        // Filter activities
        let filteredActivities = [...dashboardData.activities];

        console.log('[AI Dashboard] Before filter:', filteredActivities.length, 'activities');
        console.log('[AI Dashboard] Filters:', { teamFilter, dateFilter });
        console.log('[AI Dashboard] Activity team values:', filteredActivities.map(a => ({
            id: a.id,
            team: a.team,
            team_id: a.team_id,
            team_name: a.team_name
        })));

        // Filter by team if selected
        if (teamFilter) {
            const beforeCount = filteredActivities.length;
            filteredActivities = filteredActivities.filter(a => {
                const actTeam = (a.team || a.team_name || a.team_id || '').toLowerCase();
                const filterLower = teamFilter.toLowerCase();
                return actTeam === filterLower ||
                    actTeam.includes(filterLower) ||
                    filterLower.includes(actTeam);
            });
            console.log('[AI Dashboard] After team filter:', filteredActivities.length);

            // Fallback: nếu filter không match, dùng tất cả activities
            if (filteredActivities.length === 0 && beforeCount > 0) {
                console.log('[AI Dashboard] Team filter not matching, using all activities');
                filteredActivities = [...dashboardData.activities];
            }
        }

        // Filter by date if selected
        if (dateFilter) {
            filteredActivities = filteredActivities.filter(a => a.date === dateFilter);
            console.log('[AI Dashboard] After date filter:', filteredActivities.length);
        }

        // If no filters and no activities, try loading again directly
        if (filteredActivities.length === 0 && !teamFilter && !dateFilter) {
            // Load all activities without cache
            const activitiesSnap = await getDocs(collection(db, 'xtn_activities'));
            filteredActivities = [];
            activitiesSnap.forEach(doc => {
                filteredActivities.push({ id: doc.id, ...doc.data() });
            });
            console.log('[AI Dashboard] Reloaded activities:', filteredActivities.length);
        }

        if (filteredActivities.length === 0) {
            if (window.Swal) {
                Swal.fire('Thông báo', 'Không có hoạt động nào để tạo báo cáo. Vui lòng điều chỉnh bộ lọc hoặc thêm hoạt động.', 'info');
            }
            return;
        }

        // Format activities for AI
        const activitiesSummary = filteredActivities.slice(0, 20).map(a => ({
            team: a.team || a.team_name || 'N/A',
            date: a.date || 'N/A',
            time: `${a.startTime || '??'} - ${a.endTime || '??'}`,
            location: a.location || 'N/A',
            content: a.content || a.description || 'N/A',
            participants: a.participants?.length || a.expectedParticipants || 0
        }));

        const systemPrompt = `Bạn là trợ lý AI tạo báo cáo hoạt động cho chiến dịch Xuân Tình Nguyện UEL 2026.
Nhiệm vụ: Tạo báo cáo chi tiết về các hoạt động đã diễn ra.

Yêu cầu:
- Viết tiếng Việt, văn phong trang trọng, chuyên nghiệp
- Có tiêu đề, mở đầu, nội dung chi tiết, kết luận
- Liệt kê các hoạt động theo thứ tự thời gian
- Tổng hợp số liệu (số hoạt động, số người tham gia...)
- Đánh giá chung và đề xuất (nếu có)
- Format markdown`;

        const prompt = `Dữ liệu hoạt động ${teamFilter ? `của đội ${teamFilter}` : ''}${dateFilter ? ` ngày ${dateFilter}` : ''}:

Tổng số hoạt động: ${filteredActivities.length}

CHI TIẾT HOẠT ĐỘNG:
${JSON.stringify(activitiesSummary, null, 2)}

Hãy tạo báo cáo tổng hợp chuyên nghiệp.`;

        const result = await callGroqAI(prompt, {
            systemPrompt,
            temperature: 0.5,
            maxTokens: 3000
        });

        if (result.success) {
            if (window.Swal) {
                Swal.fire({
                    title: '📋 Báo cáo AI Tự động',
                    html: `<div style="text-align:left; max-height:60vh; overflow-y:auto; white-space:pre-wrap; font-size:0.9rem; line-height:1.6;">${result.content.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</div>`,
                    width: '750px',
                    showCancelButton: true,
                    confirmButtonText: '<i class="fa-solid fa-copy"></i> Sao chép',
                    cancelButtonText: 'Đóng',
                    confirmButtonColor: '#22c55e'
                }).then((res) => {
                    if (res.isConfirmed) {
                        navigator.clipboard.writeText(result.content);
                        Swal.fire('Đã sao chép!', '', 'success');
                    }
                });
            } else {
                showToast(result.content, 'info', 8000);
            }
        } else {
            throw new Error(result.error);
        }

    } catch (error) {
        console.error('[AI Dashboard] Auto report error:', error);
        if (window.Swal) {
            Swal.fire('Lỗi', 'Không thể tạo báo cáo: ' + error.message, 'error');
        } else {
            showToast('Lỗi: ' + error.message, 'error');
        }
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// ============================================================
// AI TEAM ANALYSIS MODAL
// ============================================================
async function openTeamAnalysisModal() {
    console.log('[AI Dashboard] Opening team analysis modal...');

    // Load data if not loaded
    if (dashboardData.teams.length === 0) {
        await loadDashboardData();
    }

    // Populate team dropdown
    const select = document.getElementById('select-team-analysis');
    if (select) {
        select.innerHTML = '<option value="">-- Chọn đội --</option>';
        dashboardData.teams.forEach(team => {
            const option = document.createElement('option');
            option.value = team.id;
            option.textContent = team.team_name || team.id;
            select.appendChild(option);
        });
    }

    // Reset result
    document.getElementById('team-analysis-result').style.display = 'none';
    document.getElementById('team-analysis-content').innerHTML = '';

    // Show modal
    document.getElementById('modal-team-analysis').style.display = 'flex';
}

window.closeTeamAnalysisModal = function () {
    document.getElementById('modal-team-analysis').style.display = 'none';
};

window.runTeamAnalysis = async function () {
    const teamId = document.getElementById('select-team-analysis').value;
    if (!teamId) {
        if (window.Swal) {
            Swal.fire('Thông báo', 'Vui lòng chọn đội hình cần phân tích!', 'warning');
        } else {
            showToast('Vui lòng chọn đội hình cần phân tích!', 'warning');
        }
        return;
    }

    const btn = document.getElementById('btn-run-team-analysis');
    const resultDiv = document.getElementById('team-analysis-result');
    const contentDiv = document.getElementById('team-analysis-content');

    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang phân tích...';
    btn.disabled = true;

    try {
        const result = await analyzeTeam(teamId);

        if (result.success) {
            // Format and display result
            const formattedContent = result.content
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\n/g, '<br>');

            contentDiv.innerHTML = `
                <div style="background: linear-gradient(135deg, #f5f3ff, #ede9fe); padding: 20px; border-radius: 12px; border-left: 4px solid #8b5cf6;">
                    ${formattedContent}
                </div>
            `;
            resultDiv.style.display = 'block';
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        console.error('[AI Dashboard] Team analysis error:', error);
        contentDiv.innerHTML = `
            <div style="background: #fef2f2; padding: 15px; border-radius: 8px; color: #dc2626;">
                <i class="fa-solid fa-exclamation-triangle"></i> Lỗi: ${error.message}
            </div>
        `;
        resultDiv.style.display = 'block';
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};

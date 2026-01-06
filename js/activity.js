/**
 * Activity Management Module for XTN 2026
 * Tương tự MHX - Quản lý lịch hoạt động, thống kê, báo cáo
 * 
 * Thời gian chiến dịch: 15/12/2025 - 15/02/2026
 */

import { db, auth } from './firebase.js';
import { isSuperAdmin, getUserData } from './auth.js';
import {
    collection,
    doc,
    addDoc,
    updateDoc,
    deleteDoc,
    getDocs,
    query,
    where,
    orderBy,
    onSnapshot,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ===== CONFIGURATION =====
const CONFIG = {
    startDate: new Date('2025-12-15'),
    endDate: new Date('2026-02-15'),
    teams: [], // Sẽ load từ Firebase xtn_teams
    itemsPerPage: 10
};

// ===== STATE =====
let activities = [];
let reports = [];
let historyLogs = [];
// Mặc định là thứ 2 của tuần hiện tại (để hiện ngày hôm nay)
function getCurrentWeekMonday() {
    const today = new Date();
    const day = today.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day; // CN = 0 → lùi 6, còn lại tính từ T2
    const monday = new Date(today);
    monday.setDate(today.getDate() + mondayOffset);
    monday.setHours(0, 0, 0, 0);
    return monday;
}
let currentWeekStart = getCurrentWeekMonday();
let currentPage = 1;
let unsubscribeActivities = null;
let unsubscribeReports = null;
let unsubscribeLogs = null;
let isInitialized = false;
let currentUserTeam = null; // Team của user hiện tại (team_name)
let currentUserRole = null; // Role của user hiện tại
let tempParticipants = []; // Danh sách tham gia tạm thời khi edit activity
let canEditActivities = false; // Quyền chỉnh sửa hoạt động (super_admin, kysutet_admin)

// ===== RATE LIMIT / PERFORMANCE OPTIMIZATION =====
// Debounce utility để giảm số lần render liên tục
const debounceTimers = {};
function debounce(key, fn, delay = 300) {
    if (debounceTimers[key]) clearTimeout(debounceTimers[key]);
    debounceTimers[key] = setTimeout(fn, delay);
}

// Throttle renders để không gọi quá nhanh (cho 400 users)
let lastRenderTime = { calendar: 0, stats: 0, reports: 0 };
const RENDER_THROTTLE_MS = 500; // Tối thiểu 500ms giữa các lần render

function throttledRender(type, renderFn) {
    const now = Date.now();
    if (now - lastRenderTime[type] < RENDER_THROTTLE_MS) {
        debounce(`render_${type}`, renderFn, RENDER_THROTTLE_MS);
        return;
    }
    lastRenderTime[type] = now;
    renderFn();
}

// ===== DOM ELEMENTS =====
const elements = {};

// ===== UTILITY FUNCTIONS =====
function formatDate(date, format = 'dd/mm') {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();

    if (format === 'yyyy-mm-dd') return `${year}-${month}-${day}`;
    if (format === 'full') return `${day}/${month}/${year}`;
    return `${day}/${month}`;
}

function getDayName(date) {
    const days = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    return days[new Date(date).getDay()];
}

function getWeekNumber(date) {
    const d = new Date(date);
    const start = new Date(CONFIG.startDate);
    const diffTime = d - start;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return Math.floor(diffDays / 7) + 1;
}

function getWeekDates(weekStart) {
    const dates = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + i);
        dates.push(d);
    }
    return dates;
}

function isToday(date) {
    const today = new Date();
    const d = new Date(date);
    return d.toDateString() === today.toDateString();
}

function isWeekend(date) {
    const d = new Date(date).getDay();
    return d === 0 || d === 6;
}

function calculateHours(startTime, endTime) {
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    return ((eh * 60 + em) - (sh * 60 + sm)) / 60;
}

// ===== STATIC TEAMS LIST (tiết kiệm quota Firebase) =====
function loadTeamsFromStatic() {
    // Danh sách 12 đội hình cố định theo thứ tự chuẩn - TẤT CẢ có prefix "Đội hình "
    CONFIG.teams = [
        'Ban Chỉ huy Chiến dịch',
        'Đội hình Xuân tự hào',
        'Đội hình Xuân bản sắc',
        'Đội hình Xuân sẻ chia',
        'Đội hình Xuân gắn kết',
        'Đội hình Xuân chiến sĩ',
        'Đội hình Tết văn minh',
        'Đội hình Tư vấn và giảng dạy pháp luật cộng đồng',
        'Đội hình Giai điệu mùa xuân',
        'Đội hình Viên chức trẻ',
        'Đội hình Hậu cần',
        'Đội hình Ký sự Tết'
    ];

}

// Map slug → tên đúng (cho hoạt động cũ lưu với slug)
const TEAM_SLUG_MAP = {
    'ban-chi-huy-chien-dich': 'Ban Chỉ huy Chiến dịch',
    'xuan-tu-hao': 'Đội hình Xuân tự hào',
    'xuan-ban-sac': 'Đội hình Xuân bản sắc',
    'xuan-se-chia': 'Đội hình Xuân sẻ chia',
    'xuan-gan-ket': 'Đội hình Xuân gắn kết',
    'xuan-chien-si': 'Đội hình Xuân chiến sĩ',
    'tet-van-minh': 'Đội hình Tết văn minh',
    'tu-van-giang-day-phap-luat': 'Đội hình Tư vấn và giảng dạy pháp luật cộng đồng',
    'giai-dieu-mua-xuan': 'Đội hình Giai điệu mùa xuân',
    'vien-chuc-tre': 'Đội hình Viên chức trẻ',
    'hau-can': 'Đội hình Hậu cần',
    'ky-su-tet': 'Đội hình Ký sự Tết'
};

// Normalize team name - Đảm bảo TẤT CẢ đều có prefix "Đội hình " (trừ Ban Chỉ huy)
function normalizeTeamName(team) {
    if (!team) return '';

    // Trim
    let normalized = team.toString().trim();

    // Check nếu là slug → convert sang tên đầy đủ
    if (TEAM_SLUG_MAP[normalized]) {
        return TEAM_SLUG_MAP[normalized];
    }
    if (TEAM_SLUG_MAP[normalized.toLowerCase()]) {
        return TEAM_SLUG_MAP[normalized.toLowerCase()];
    }

    // Nếu đã có prefix "Đội hình " → giữ nguyên
    if (normalized.startsWith('Đội hình ')) {
        // Verify nếu tên này có trong CONFIG.teams
        if (CONFIG.teams.includes(normalized)) {
            return normalized;
        }
    }

    // Nếu là "Ban Chỉ huy..." → không thêm prefix
    if (normalized.toLowerCase().includes('ban chỉ huy')) {
        return 'Ban Chỉ huy Chiến dịch';
    }

    // Thêm prefix "Đội hình " nếu chưa có
    const withPrefix = 'Đội hình ' + normalized;

    // Check xem có match với CONFIG.teams không
    if (CONFIG.teams.includes(withPrefix)) {
        return withPrefix;
    }

    // Check exact match (case insensitive) trong CONFIG.teams
    const exactMatch = CONFIG.teams.find(t => t.toLowerCase() === normalized.toLowerCase());
    if (exactMatch) {
        return exactMatch;
    }

    // Check partial match
    const partialMatch = CONFIG.teams.find(t => t.toLowerCase().includes(normalized.toLowerCase()));
    if (partialMatch) {
        return partialMatch;
    }

    // Return với prefix mặc định
    return withPrefix;
}

// ===== INITIALIZATION =====
export async function initActivityModule(teamName = null, userRole = null) {
    // Override from dashboard-core (bypass duplicate doc issue)
    if (teamName) {
        currentUserTeam = teamName;
        console.log('[Activity] Initialized with team:', currentUserTeam);
    }
    if (userRole) {
        currentUserRole = userRole;
        console.log('[Activity] Initialized with role:', currentUserRole);
    }

    // Prevent multiple initializations
    if (isInitialized) {
        // Update team/role even if initialized
        if (teamName) currentUserTeam = teamName;
        if (userRole) currentUserRole = userRole;
        renderCalendar();
        return;
    }



    cacheElements();
    setupTabs();
    setupEventListeners();

    // Load đội hình từ danh sách cố định (tiết kiệm Firebase quota)
    loadTeamsFromStatic();

    // Load team của user - CHỈ khi chưa có từ Dashboard
    if (!currentUserTeam) {
        await loadCurrentUserTeam();
    }

    // Lấy role của user - CHỈ khi chưa có từ Dashboard
    if (!currentUserRole) {
        const userData = await getUserData(auth.currentUser?.uid);
        currentUserRole = userData?.role || 'member';
    }
    console.log('[Activity] Final role:', currentUserRole);

    // Kiểm tra quyền chỉnh sửa:
    // - super_admin, kysutet_admin: chỉnh sửa TẤT CẢ
    // - doihinh_admin: chỉ chỉnh sửa hoạt động của đội mình
    // LƯU Ý: Không dùng isSuperAdmin() vì nó check userRole từ auth.js chưa sync
    const isAdminRole = currentUserRole === 'super_admin' || currentUserRole === 'kysutet_admin';
    canEditActivities = isAdminRole || currentUserRole === 'doihinh_admin';


    populateTeamSelects();
    populateWeekSelects();

    // Set default date filter to last 1 week
    setDefaultDateFilters();

    subscribeToData();
    renderCalendar();

    isInitialized = true;

}

/**
 * Kiểm tra user có quyền chỉnh sửa hoạt động của team cụ thể không
 * @param {string} teamName - Tên đội hình của activity
 * @returns {boolean}
 */
function canEditTeamActivity(teamName) {
    // super_admin hoặc kysutet_admin: chỉnh sửa TẤT CẢ
    // LƯU Ý: Dùng currentUserRole trực tiếp thay vì isSuperAdmin()
    // Database có thể lưu 'super' hoặc 'super_admin'
    const isFullAdmin = currentUserRole === 'super_admin' || currentUserRole === 'super' || currentUserRole === 'kysutet_admin';
    if (isFullAdmin) {
        return true;
    }

    // doihinh_admin: chỉ chỉnh sửa hoạt động đội mình
    if (currentUserRole === 'doihinh_admin') {
        // Normalize cả 2 bên để so sánh (handle cả slug và full name)
        const normalizedTeamName = normalizeTeamName(teamName);
        const normalizedCurrentTeam = normalizeTeamName(currentUserTeam);
        return currentUserTeam && normalizedTeamName === normalizedCurrentTeam;
    }

    // Member: không được chỉnh sửa
    return false;
}

// Set default date filters to last 1 week
function setDefaultDateFilters() {
    const today = new Date();
    const oneWeekAgo = new Date(today);
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    if (elements.statsDateFrom) {
        elements.statsDateFrom.value = formatDate(oneWeekAgo, 'yyyy-mm-dd');
    }
    if (elements.statsDateTo) {
        elements.statsDateTo.value = formatDate(today, 'yyyy-mm-dd');
    }

    // Không cần set default cho Export - dùng chung filter toolbar
}

// Navigate stats week: direction = -1 (tuần trước), 0 (tuần này), 1 (tuần sau)
function navigateStatsWeek(direction) {
    let fromDate, toDate;
    const today = new Date();

    // Lấy ngày đầu tuần (Thứ 2) và cuối tuần (Chủ nhật)
    const getWeekDays = (baseDate) => {
        const day = baseDate.getDay();
        const mondayOffset = day === 0 ? -6 : 1 - day; // Nếu CN thì lùi 6 ngày, còn lại tính từ T2
        const monday = new Date(baseDate);
        monday.setDate(baseDate.getDate() + mondayOffset);
        monday.setHours(0, 0, 0, 0);

        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);

        return { monday, sunday };
    };

    if (direction === 0) {
        // Tuần này
        const thisWeek = getWeekDays(today);
        fromDate = thisWeek.monday;
        toDate = thisWeek.sunday;
    } else {
        // Lấy ngày hiện tại từ date picker
        const currentFrom = elements.statsDateFrom?.value ? new Date(elements.statsDateFrom.value) : today;
        const shiftedDate = new Date(currentFrom);
        shiftedDate.setDate(currentFrom.getDate() + (direction * 7));

        const targetWeek = getWeekDays(shiftedDate);
        fromDate = targetWeek.monday;
        toDate = targetWeek.sunday;
    }

    // Cập nhật date pickers
    if (elements.statsDateFrom) {
        elements.statsDateFrom.value = formatDate(fromDate, 'yyyy-mm-dd');
    }
    if (elements.statsDateTo) {
        elements.statsDateTo.value = formatDate(toDate, 'yyyy-mm-dd');
    }

    // Refresh stats
    renderStats();


}

// Lấy team_name của user hiện tại
async function loadCurrentUserTeam() {
    try {
        if (!auth.currentUser) return;

        const userData = await getUserData(auth.currentUser.uid);
        if (!userData) {
            console.log('[Activity] No userData found for current user');
            return;
        }

        console.log('[Activity] User data for team:', userData.team_id, userData.team_name, userData.team);

        // Fallback 1: Nếu user có team_name trực tiếp (từ xtn_users)
        if (userData.team_name) {
            currentUserTeam = userData.team_name;
            console.log('[Activity] Team from team_name:', currentUserTeam);
            return;
        }

        // Fallback 2: Nếu user có team field (có thể là tên đội)
        if (userData.team) {
            currentUserTeam = userData.team;
            console.log('[Activity] Team from team field:', currentUserTeam);
            return;
        }

        // Fallback 3: Nếu có team_id, tra cứu
        if (userData.team_id) {
            const teamId = userData.team_id;
            console.log('[Activity] Looking up team_id:', teamId);

            // 3a. Check trong TEAM_SLUG_MAP (vien-chuc-tre → Đội hình Viên chức trẻ)
            if (TEAM_SLUG_MAP[teamId]) {
                currentUserTeam = TEAM_SLUG_MAP[teamId];
                console.log('[Activity] Found in TEAM_SLUG_MAP:', currentUserTeam);
                return;
            }

            // 3b. Check trong CONFIG.teams (partial match)
            const matchedTeam = CONFIG.teams.find(t =>
                t.toLowerCase().includes(teamId.toLowerCase().replace(/-/g, ' '))
            );
            if (matchedTeam) {
                currentUserTeam = matchedTeam;
                console.log('[Activity] Found in CONFIG.teams:', currentUserTeam);
                return;
            }

            // 3c. Tra cứu trong xtn_teams collection
            const teamsSnap = await getDocs(collection(db, 'xtn_teams'));
            teamsSnap.forEach(docSnap => {
                const team = docSnap.data();
                if (docSnap.id === teamId || team.team_id === teamId) {
                    currentUserTeam = team.team_name || docSnap.id;
                    console.log('[Activity] Found in xtn_teams:', currentUserTeam);
                }
            });
        }

        console.log('[Activity] Final currentUserTeam:', currentUserTeam);
    } catch (e) {
        console.warn('[Activity] Could not load user team:', e);
    }
}

function cacheElements() {
    // Tabs
    elements.tabs = document.querySelectorAll('.activity-tab');
    elements.tabContents = document.querySelectorAll('.activity-tab-content');

    // Calendar
    elements.calendarGrid = document.getElementById('calendar-grid');
    elements.weekLabel = document.getElementById('calendar-week-label');
    elements.btnPrevWeek = document.getElementById('btn-prev-week');
    elements.btnNextWeek = document.getElementById('btn-next-week');
    elements.btnAddActivity = document.getElementById('btn-add-activity');

    // Stats
    elements.statsTeamFilter = document.getElementById('stats-team-filter');
    elements.statsDateFrom = document.getElementById('stats-date-from');
    elements.statsDateTo = document.getElementById('stats-date-to');
    elements.btnStatsFilter = document.getElementById('btn-stats-filter');
    elements.btnExportCsv = document.getElementById('btn-export-csv');
    elements.statsTotal = document.getElementById('stats-total');
    elements.statsHours = document.getElementById('stats-hours');
    elements.statsTeams = document.getElementById('stats-teams');
    elements.statsTbody = document.getElementById('stats-tbody');
    elements.statsPagination = document.getElementById('stats-pagination');

    // Stats Week Navigation
    elements.btnStatsPrevWeek = document.getElementById('btn-stats-prev-week');
    elements.btnStatsThisWeek = document.getElementById('btn-stats-this-week');
    elements.btnStatsNextWeek = document.getElementById('btn-stats-next-week');

    // Report
    elements.reportTeamSelect = document.getElementById('report-team-select');
    elements.btnNewReport = document.getElementById('btn-new-report');
    elements.reportsList = document.getElementById('reports-list');
    elements.reportSearch = document.getElementById('report-search');
    elements.reportDateFilter = document.getElementById('report-date-filter');
    elements.activitiesReportStatus = document.getElementById('activities-report-status');

    // Export Report - dùng chung filter với toolbar
    elements.btnExportReport = document.getElementById('btn-export-report');

    // History
    elements.historySearch = document.getElementById('history-search');
    elements.historyActionFilter = document.getElementById('history-action-filter');
    elements.historyList = document.getElementById('history-list');
}

function setupTabs() {
    elements.tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabId = tab.dataset.tab;

            // Update active tab
            elements.tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Update content
            elements.tabContents.forEach(c => c.classList.remove('active'));
            document.getElementById(`tab-${tabId}`).classList.add('active');

            // Refresh content
            if (tabId === 'stats') renderStats();
            if (tabId === 'report') renderReports();
            if (tabId === 'history') renderHistory();
        });
    });
}

function setupEventListeners() {
    // Calendar navigation
    elements.btnPrevWeek?.addEventListener('click', () => navigateWeek(-1));
    elements.btnNextWeek?.addEventListener('click', () => navigateWeek(1));
    elements.btnAddActivity?.addEventListener('click', () => openActivityModal());

    // Stats - Auto filter on change
    elements.btnStatsFilter?.addEventListener('click', () => renderStats());
    elements.statsTeamFilter?.addEventListener('change', () => renderStats());
    elements.statsDateFrom?.addEventListener('change', () => renderStats());
    elements.statsDateTo?.addEventListener('change', () => renderStats());
    elements.btnExportCsv?.addEventListener('click', exportToCSV);

    // Stats Week Navigation
    elements.btnStatsPrevWeek?.addEventListener('click', () => navigateStatsWeek(-1));
    elements.btnStatsThisWeek?.addEventListener('click', () => navigateStatsWeek(0));
    elements.btnStatsNextWeek?.addEventListener('click', () => navigateStatsWeek(1));

    // Report - Hiện modal chọn hoạt động trước khi tạo báo cáo
    elements.btnNewReport?.addEventListener('click', () => showActivitySelector());
    elements.btnExportReport?.addEventListener('click', exportReports);
    elements.reportSearch?.addEventListener('input', renderReports);
    elements.reportDateFilter?.addEventListener('change', renderReports);
    elements.reportTeamSelect?.addEventListener('change', renderReports);

    // History
    elements.historySearch?.addEventListener('input', renderHistory);
    elements.historyActionFilter?.addEventListener('change', renderHistory);
}

function populateTeamSelects() {
    const selects = [
        elements.statsTeamFilter,
        elements.reportTeamSelect,
        elements.exportTeamSelect  // Thêm export dropdown
    ];

    selects.forEach(select => {
        if (!select) return;
        CONFIG.teams.forEach(team => {
            const opt = document.createElement('option');
            opt.value = team;
            opt.textContent = team;
            select.appendChild(opt);
        });
    });
}

function populateWeekSelects() {
    if (!elements.reportWeekSelect) return;

    const totalWeeks = Math.ceil(
        (CONFIG.endDate - CONFIG.startDate) / (1000 * 60 * 60 * 24 * 7)
    );

    for (let i = 1; i <= totalWeeks; i++) {
        const weekStart = new Date(CONFIG.startDate);
        weekStart.setDate(weekStart.getDate() + (i - 1) * 7);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);

        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = `Tuần ${i} (${formatDate(weekStart)} - ${formatDate(weekEnd)})`;
        elements.reportWeekSelect.appendChild(opt);
    }
}

// ===== FIREBASE SUBSCRIPTIONS =====
function subscribeToData() {
    try {
        // Subscribe to activities
        const activitiesRef = collection(db, 'xtn_activities');
        unsubscribeActivities = onSnapshot(activitiesRef, (snapshot) => {
            activities = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            // Throttle để không render quá nhanh khi nhiều user đang hoạt động
            throttledRender('calendar', renderCalendar);
            throttledRender('stats', renderStats);
        }, (error) => {
            console.error('[Activity] Activities subscription error:', error);
            activities = [];
            renderCalendar();
        });

        // Subscribe to reports
        const reportsRef = collection(db, 'xtn_reports');
        unsubscribeReports = onSnapshot(reportsRef, (snapshot) => {
            reports = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            throttledRender('reports', renderReports);
        }, (error) => {
            console.error('[Activity] Reports subscription error:', error);
            reports = [];
            renderReports();
        });

        // Subscribe to activity logs - Giới hạn 100 logs gần nhất để giảm Firebase reads
        const logsRef = collection(db, 'xtn_activity_logs');
        unsubscribeLogs = onSnapshot(logsRef, (snapshot) => {
            historyLogs = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            // Sort client-side và giới hạn 100 logs
            historyLogs.sort((a, b) => {
                const aTime = a.timestamp?.toMillis?.() || 0;
                const bTime = b.timestamp?.toMillis?.() || 0;
                return bTime - aTime;
            });
            historyLogs = historyLogs.slice(0, 100); // Chỉ giữ 100 logs gần nhất
            debounce('history', renderHistory, 1000); // Debounce 1s cho history
        }, (error) => {
            console.error('[Activity] Logs subscription error:', error);
            historyLogs = [];
            renderHistory();
        });


    } catch (error) {
        console.error('[Activity] subscribeToData error:', error);
    }
}

export function cleanupActivityModule() {
    if (unsubscribeActivities) unsubscribeActivities();
    if (unsubscribeReports) unsubscribeReports();
    if (unsubscribeLogs) unsubscribeLogs();
}

// ===== CALENDAR FUNCTIONS =====
function navigateWeek(direction) {
    const newStart = new Date(currentWeekStart);
    newStart.setDate(newStart.getDate() + direction * 7);

    // Check bounds
    if (newStart < CONFIG.startDate || newStart > CONFIG.endDate) return;

    currentWeekStart = newStart;
    renderCalendar();
}

function renderCalendar() {
    if (!elements.calendarGrid) {
        console.warn('[Activity] calendarGrid element not found!');
        return;
    }



    const weekDates = getWeekDates(currentWeekStart);
    const weekNum = getWeekNumber(currentWeekStart);
    const weekEnd = weekDates[6];

    // Update label
    if (elements.weekLabel) {
        elements.weekLabel.textContent = `Tuần ${weekNum} (${formatDate(currentWeekStart)} - ${formatDate(weekEnd)})`;
    }

    // Build grid
    let html = '';

    // Header row
    html += '<div class="calendar-header">Đội hình</div>';
    weekDates.forEach(date => {
        const todayClass = isToday(date) ? ' today-header' : '';
        const todayBadge = isToday(date) ? '<span class="today-badge">📍 Hôm nay</span>' : '';
        html += `
            <div class="calendar-header${todayClass}">
                ${getDayName(date)}<br>
                <small>${formatDate(date)}</small>
                ${todayBadge}
            </div>
        `;
    });

    // Team rows
    CONFIG.teams.forEach(team => {
        html += `<div class="calendar-team">${team}</div>`;

        weekDates.forEach(date => {
            const dateStr = formatDate(date, 'yyyy-mm-dd');

            // Dùng normalizeTeamName để match cả slug và tên đúng
            const cellActivities = activities.filter(a =>
                a.date === dateStr && normalizeTeamName(a.team) === team
            );

            const classes = ['calendar-cell'];
            if (isToday(date)) classes.push('today');
            if (isWeekend(date)) classes.push('weekend');

            // Nếu có hoạt động, hiển thị mini cards
            let cellContent = '';
            if (cellActivities.length > 0) {
                // Hiện tối đa 2 hoạt động, còn lại hiện "+N more"
                const maxShow = 2;
                const visibleActivities = cellActivities.slice(0, maxShow);
                const remaining = cellActivities.length - maxShow;

                const miniCards = visibleActivities.map(a => `
                    <div class="activity-mini-card" data-id="${a.id}" style="
                        background: white;
                        border-left: 3px solid #16a34a;
                        padding: 4px 8px;
                        margin-bottom: 4px;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 11px;
                        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                        transition: all 0.2s;
                    "
                    onmouseenter="this.style.transform='translateX(2px)'; this.style.borderLeftColor='#22c55e';"
                    onmouseleave="this.style.transform=''; this.style.borderLeftColor='#16a34a';">
                        <div style="font-weight:600; color:#1f2937; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100px;">
                            ${a.title || 'Hoạt động'}
                        </div>
                        <div style="color:#6b7280; font-size:10px;">
                            <i class="fa-solid fa-clock"></i> ${a.startTime || '--:--'}
                        </div>
                    </div>
                `).join('');

                const moreIndicator = remaining > 0 ? `
                    <div class="activity-more-indicator" style="
                        text-align: center;
                        font-size: 10px;
                        color: #16a34a;
                        cursor: pointer;
                        padding: 2px;
                        font-weight: 600;
                    ">+${remaining} hoạt động khác</div>
                ` : '';

                cellContent = `
                    <div class="activity-count-badge" style="width:100%;">
                        ${miniCards}
                        ${moreIndicator}
                    </div>
                `;
            }

            html += `
                <div class="${classes.join(' ')}" data-date="${dateStr}" data-team="${team}" data-activity-count="${cellActivities.length}">
                    ${cellContent}
                    ${canEditTeamActivity(team) ? `
                        <button class="cell-add-btn" title="Thêm hoạt động">
                            <i class="fa-solid fa-plus"></i>
                        </button>
                    ` : ''}
                </div>
            `;
        });
    });

    elements.calendarGrid.innerHTML = html;

    // Click vào mini card → mở modal sửa hoạt động
    elements.calendarGrid.querySelectorAll('.activity-mini-card').forEach(card => {
        card.addEventListener('click', (e) => {
            e.stopPropagation();
            const activityId = card.dataset.id;
            const activity = activities.find(a => a.id === activityId);
            if (activity) openActivityModal(activity);
        });
    });

    // Click vào "+N more" indicator → hiện popup danh sách
    elements.calendarGrid.querySelectorAll('.activity-more-indicator').forEach(indicator => {
        indicator.addEventListener('click', (e) => {
            e.stopPropagation();
            const cell = indicator.closest('.calendar-cell');
            const date = cell.dataset.date;
            const team = cell.dataset.team;
            showActivitiesPopup(date, team);
        });
    });

    // Click vào ô trống để thêm hoạt động
    elements.calendarGrid.querySelectorAll('.calendar-cell').forEach(cell => {
        cell.addEventListener('click', (e) => {
            // Không mở modal nếu click vào badge hoặc nút +
            if (e.target.closest('.activity-count-badge') || e.target.closest('.cell-add-btn')) {
                return;
            }

            // Cho phép thêm hoạt động vào bất kỳ ô nào (kể cả đã có hoạt động)
            openActivityModal(null, cell.dataset.date, cell.dataset.team);
        });
    });

    elements.calendarGrid.querySelectorAll('.cell-add-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const cell = btn.closest('.calendar-cell');
            openActivityModal(null, cell.dataset.date, cell.dataset.team);
        });
    });
}

// Hiện popup danh sách hoạt động
function showActivitiesPopup(date, team) {
    // Lọc hoạt động
    const dayActivities = activities.filter(a =>
        a.date === date && normalizeTeamName(a.team) === team
    );

    if (dayActivities.length === 0) {
        showToast('Không có hoạt động nào!', 'info');
        return;
    }

    // Remove existing popup
    document.getElementById('activities-popup')?.remove();

    const popupHtml = `
        <div class="activity-modal active" id="activities-popup">
            <div class="activity-modal-content" style="max-width:500px;">
                <div class="activity-modal-header" style="background:linear-gradient(135deg,#2563eb,#3b82f6);">
                    <h3 style="color:white;">
                        <i class="fa-solid fa-list"></i> ${dayActivities.length} hoạt động - ${formatDate(date, 'full')}
                    </h3>
                    <button class="close-btn" id="popup-close" style="color:white;">&times;</button>
                </div>
                <div class="activity-modal-body" style="max-height:400px; overflow-y:auto;">
                    ${dayActivities.map((a, i) => `
                        <div class="activity-popup-item" data-id="${a.id}" style="
                            padding: 12px 15px;
                            border: 2px solid #e5e7eb;
                            border-radius: 8px;
                            margin-bottom: 10px;
                            cursor: pointer;
                            transition: all 0.2s;
                        ">
                            <div style="display:flex; justify-content:space-between; align-items:start;">
                                <div>
                                    <strong style="color:#2563eb; font-size:1.05rem;">${a.title || 'Hoạt động ' + (i + 1)}</strong>
                                    <p style="margin:5px 0; color:#6b7280; font-size:0.9rem;">
                                        <i class="fa-solid fa-clock"></i> ${a.startTime} - ${a.endTime}
                                        ${a.location ? ` | <i class="fa-solid fa-location-dot"></i> ${a.location}` : ''}
                                    </p>
                                    ${a.content ? `<p style="margin:5px 0; font-size:0.9rem;">${a.content.substring(0, 80)}${a.content.length > 80 ? '...' : ''}</p>` : ''}
                                </div>
                                <i class="fa-solid fa-chevron-right" style="color:#9ca3af;"></i>
                            </div>
                        </div>
                    `).join('')}
                </div>
                <div class="activity-modal-footer">
                    <button class="btn btn-secondary" id="popup-cancel">Đóng</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', popupHtml);

    const modal = document.getElementById('activities-popup');
    const closeModal = () => modal.remove();

    document.getElementById('popup-close').addEventListener('click', closeModal);
    document.getElementById('popup-cancel').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    // Click vào hoạt động → mở modal sửa
    modal.querySelectorAll('.activity-popup-item').forEach(item => {
        item.addEventListener('click', () => {
            const id = item.dataset.id;
            const activity = activities.find(a => a.id === id);
            closeModal();
            if (activity) openActivityModal(activity);
        });

        // Hover effect
        item.addEventListener('mouseenter', () => {
            item.style.borderColor = '#2563eb';
            item.style.background = '#eff6ff';
        });
        item.addEventListener('mouseleave', () => {
            item.style.borderColor = '#e5e7eb';
            item.style.background = 'white';
        });
    });
}

// ===== ACTIVITY MODAL =====
function openActivityModal(activity = null, date = null, team = null) {
    // Remove existing modal
    document.getElementById('activity-modal')?.remove();

    const isEdit = !!activity;

    // Với doihinh_admin: nếu không có team được chỉ định, tự động dùng team của user
    const isFullAdmin = currentUserRole === 'super_admin' || currentUserRole === 'kysutet_admin';
    const defaultTeam = isFullAdmin ? '' : currentUserTeam;
    const activityTeam = activity?.team || team || defaultTeam || '';

    console.log('[Activity Modal] Opening modal with:', {
        currentUserRole,
        currentUserTeam,
        isFullAdmin,
        activityTeam
    });

    const canEditThisActivity = canEditTeamActivity(activityTeam);
    console.log('[Activity Modal] canEditThisActivity:', canEditThisActivity);

    // Dropdown options: doihinh_admin chỉ thấy team của mình, admin thấy tất cả
    let teamOptions = '';
    if (isFullAdmin) {
        // Super admin / kysutet_admin: thấy tất cả đội
        // Sử dụng normalizeTeamName() để so sánh, đảm bảo match cả khi format khác nhau
        const normalizedActivityTeam = normalizeTeamName(activityTeam);
        teamOptions = `<option value="">-- Chọn đội hình --</option>` +
            CONFIG.teams.map(t => `
                <option value="${t}" ${normalizeTeamName(t) === normalizedActivityTeam ? 'selected' : ''}>${normalizeTeamName(t)}</option>
            `).join('');
    } else {
        // doihinh_admin: chỉ thấy đội của mình
        teamOptions = `<option value="${currentUserTeam}" selected>${normalizeTeamName(currentUserTeam)}</option>`;
    }

    const modalHtml = `
        <div class="activity-modal active" id="activity-modal">
            <div class="activity-modal-content">
                <div class="activity-modal-header">
                    <h3><i class="fa-solid fa-${isEdit ? 'edit' : 'plus'}"></i> ${isEdit ? 'Sửa' : 'Thêm'} Hoạt động</h3>
                    <button class="close-btn" id="modal-close">&times;</button>
                </div>
                <div class="activity-modal-body">
                    <div class="form-group">
                        <label>Đội hình <span class="required">*</span></label>
                        <select id="modal-team" required ${!isFullAdmin ? 'disabled style="background:#f3f4f6;"' : ''}>
                            ${teamOptions}
                        </select>
                        ${!isFullAdmin ? '<small style="color:#666;">Bạn chỉ có thể tạo hoạt động cho đội của mình</small>' : ''}
                    </div>
                    <div class="form-group">
                        <label>Ngày <span class="required">*</span></label>
                        <input type="date" id="modal-date" value="${activity?.date || date || formatDate(currentWeekStart, 'yyyy-mm-dd')}" 
                               min="${formatDate(CONFIG.startDate, 'yyyy-mm-dd')}" 
                               max="${formatDate(CONFIG.endDate, 'yyyy-mm-dd')}" required>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Giờ bắt đầu <span class="required">*</span></label>
                            <input type="text" id="modal-start-time" value="${activity?.startTime || '08:00'}" 
                                   placeholder="08:00" pattern="([01]?[0-9]|2[0-3]):[0-5][0-9]" maxlength="5" required>
                        </div>
                        <div class="form-group">
                            <label>Giờ kết thúc <span class="required">*</span></label>
                            <input type="text" id="modal-end-time" value="${activity?.endTime || '11:00'}" 
                                   placeholder="11:00" pattern="([01]?[0-9]|2[0-3]):[0-5][0-9]" maxlength="5" required>
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Tên hoạt động <span class="required">*</span></label>
                        <input type="text" id="modal-title" value="${activity?.title || ''}" placeholder="VD: Tuyên truyền pháp luật cộng đồng" required maxlength="100">
                    </div>
                    <div class="form-group">
                        <label>Địa điểm</label>
                        <input type="text" id="modal-location" value="${activity?.location || ''}" placeholder="Nhập địa điểm hoạt động">
                    </div>
                    <div class="form-group">
                        <label>Nội dung hoạt động</label>
                        <textarea id="modal-content" placeholder="Mô tả chi tiết hoạt động...">${activity?.content || ''}</textarea>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Số lượng tham gia dự kiến</label>
                            <input type="number" id="modal-participants" value="${activity?.expectedParticipants || ''}" placeholder="VD: 20" min="0">
                        </div>
                        <div class="form-group">
                            <label>Đề xuất BCH Trường tham dự</label>
                            <select id="modal-bch-suggestion">
                                <option value="Không" ${(activity?.bchSuggestion || 'Không') === 'Không' ? 'selected' : ''}>Không</option>
                                <option value="Có" ${activity?.bchSuggestion === 'Có' ? 'selected' : ''}>Có</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Đề xuất Ký sự Tết lấy tin</label>
                            <select id="modal-kysutet-news">
                                <option value="Không" ${(activity?.kysutetNews || 'Không') === 'Không' ? 'selected' : ''}>Không</option>
                                <option value="Có" ${activity?.kysutetNews === 'Có' ? 'selected' : ''}>Có</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Danh sách tham gia thực tế</label>
                        <button type="button" class="btn btn-info btn-block" id="btn-participants-list" style="margin-top:5px;">
                            <i class="fa-solid fa-users"></i> 
                            Quản lý danh sách (<span id="participants-count">${activity?.participants?.length || 0}</span> chiến sĩ)
                        </button>
                    </div>
                </div>
                <div class="activity-modal-footer">
                    ${canEditThisActivity ? `
                        ${isEdit ? `<button class="btn btn-danger" id="modal-delete"><i class="fa-solid fa-trash"></i> Xóa</button>` : ''}
                        <button class="btn btn-secondary" id="modal-cancel">Hủy</button>
                        <button class="btn btn-primary" id="modal-save"><i class="fa-solid fa-save"></i> ${isEdit ? 'Cập nhật' : 'Thêm mới'}</button>
                    ` : `
                        <button class="btn btn-secondary" id="modal-cancel">Đóng</button>
                        <p style="font-size:0.85rem; color:#888; margin:0;"><i class="fa-solid fa-lock"></i> Bạn không có quyền chỉnh sửa hoạt động này</p>
                    `}
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const modal = document.getElementById('activity-modal');
    const closeModal = () => modal.remove();

    // Initialize tempParticipants from activity
    tempParticipants = activity?.participants ? [...activity.participants] : [];

    document.getElementById('modal-close').addEventListener('click', closeModal);
    document.getElementById('modal-cancel').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    // Button danh sách tham gia (chỉ hiện cho user có quyền)
    if (canEditThisActivity) {
        document.getElementById('btn-participants-list')?.addEventListener('click', () => {
            openParticipantsModal();
        });
    }

    // Chỉ user có quyền mới có nút Save
    document.getElementById('modal-save')?.addEventListener('click', async () => {
        const titleInput = document.getElementById('modal-title')?.value;

        await saveActivity(activity?.id);
        closeModal();
    });

    // Chỉ user có quyền với activity đang edit mới có nút Delete
    if (isEdit && canEditThisActivity) {
        document.getElementById('modal-delete')?.addEventListener('click', async () => {
            const confirmed = await showConfirmModal('Bạn có chắc chắn muốn xóa hoạt động này?', { title: 'Xóa hoạt động', type: 'danger', confirmText: 'Xóa' });
            if (confirmed) {
                await deleteActivity(activity.id);
                closeModal();
            }
        });
    }
}

async function saveActivity(id = null) {
    const data = {
        team: document.getElementById('modal-team').value,
        date: document.getElementById('modal-date').value,
        startTime: document.getElementById('modal-start-time').value,
        endTime: document.getElementById('modal-end-time').value,
        title: document.getElementById('modal-title').value.trim(),
        location: document.getElementById('modal-location').value,
        content: document.getElementById('modal-content').value,
        expectedParticipants: parseInt(document.getElementById('modal-participants').value) || 0,
        bchSuggestion: document.getElementById('modal-bch-suggestion').value || 'Không',
        kysutetNews: document.getElementById('modal-kysutet-news').value || 'Không',
        participants: tempParticipants, // Danh sách tham gia thực tế
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.email || 'unknown'
    };

    if (!data.team || !data.date || !data.startTime || !data.endTime || !data.title) {
        showToast('Vui lòng điền đầy đủ thông tin bắt buộc!', 'warning');
        return;
    }

    // KIỂM TRA THỜI GIAN: Giờ kết thúc phải sau giờ bắt đầu
    if (data.startTime >= data.endTime) {
        showToast('⚠️ Giờ kết thúc phải SAU giờ bắt đầu! (VD: 08:00 - 11:00)', 'error');
        return;
    }

    // KIỂM TRA DANH SÁCH THAM GIA: Phải có ít nhất 1 chiến sĩ
    if (!data.participants || data.participants.length === 0) {
        showToast('⚠️ Vui lòng thêm ít nhất 1 chiến sĩ vào danh sách tham gia!', 'warning');
        return;
    }

    // KIỂM TRA QUYỀN THEO TEAM
    console.log('[Activity] Saving activity for team:', data.team);
    console.log('[Activity] Current role:', currentUserRole);
    console.log('[Activity] Current user team:', currentUserTeam);

    if (!canEditTeamActivity(data.team)) {
        console.error('[Activity] Permission denied!', {
            targetTeam: data.team,
            userRole: currentUserRole,
            userTeam: currentUserTeam,
            normalizedTarget: normalizeTeamName(data.team),
            normalizedUserTeam: normalizeTeamName(currentUserTeam)
        });
        showToast(`Bạn không có quyền tạo/sửa hoạt động cho đội "${data.team}"!`, 'error');
        return;
    }

    console.log('[Activity] Permission granted. Saving...');

    try {
        if (id) {
            // Update

            await updateDoc(doc(db, 'xtn_activities', id), data);
            await logAction('update', 'activity', id, data);
            showToast('Đã cập nhật hoạt động thành công!', 'success');
        } else {
            // Create
            data.createdAt = serverTimestamp();
            data.createdBy = auth.currentUser?.email || 'unknown';
            const docRef = await addDoc(collection(db, 'xtn_activities'), data);
            await logAction('create', 'activity', docRef.id, data);
            showToast('Đã tạo hoạt động mới thành công!', 'success');
        }
    } catch (error) {
        console.error('[Activity] Save error:', error);
        showToast('Có lỗi xảy ra khi lưu hoạt động!', 'error');
    }
}

async function deleteActivity(id) {
    try {
        const activity = activities.find(a => a.id === id);

        // KIỂM TRA QUYỀN THEO TEAM
        if (activity && !canEditTeamActivity(activity.team)) {
            showToast(`Bạn không có quyền xóa hoạt động của đội "${activity.team}"!`, 'error');
            return;
        }

        await deleteDoc(doc(db, 'xtn_activities', id));
        await logAction('delete', 'activity', id, activity);
    } catch (error) {
        console.error('[Activity] Delete error:', error);
        showToast('Có lỗi xảy ra khi xóa hoạt động!', 'error');
    }
}

// ===== PARTICIPANTS MODAL =====
function openParticipantsModal() {
    // Remove existing modal if any
    document.getElementById('participants-modal')?.remove();

    const modalHtml = `
        <div class="activity-modal participants-modal active" id="participants-modal" style="z-index:10001;">
            <div class="activity-modal-content">
                <div class="activity-modal-header">
                    <h3><i class="fa-solid fa-users"></i> Danh sách tham gia</h3>
                    <button class="close-btn" id="participants-close">&times;</button>
                </div>
                <div class="activity-modal-body">
                    <div style="margin-bottom:15px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;">
                        <button class="btn btn-success btn-sm" id="btn-add-participant">
                            <i class="fa-solid fa-plus"></i> Thêm người
                        </button>
                        <button class="btn btn-info btn-sm" id="btn-import-participants">
                            <i class="fa-solid fa-file-excel"></i> Import
                        </button>
                        <button class="btn btn-warning btn-sm" id="btn-export-participants">
                            <i class="fa-solid fa-file-export"></i> Xuất Excel
                        </button>
                        <button class="btn btn-secondary btn-sm" id="btn-download-participant-template">
                            <i class="fa-solid fa-download"></i> Mẫu
                        </button>
                        <input type="file" id="participants-file-input" accept=".xlsx,.xls" style="display:none;">
                        <span style="margin-left:auto;color:#666;">
                            Tổng: <strong id="total-participants">${tempParticipants.length}</strong> chiến sĩ
                        </span>
                    </div>
                    <div style="overflow-x:auto;">
                        <table class="data-table" style="min-width:100%;">
                            <thead>
                                <tr>
                                    <th style="width:40px;">STT</th>
                                    <th>Họ và Tên</th>
                                    <th>MSSV</th>
                                    <th>Email</th>
                                    <th>Đội hình</th>
                                    <th>Vai trò</th>
                                    <th style="width:70px;">Xóa</th>
                                </tr>
                            </thead>
                            <tbody id="participants-tbody">
                                ${renderParticipantsRows()}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div class="activity-modal-footer">
                    <button class="btn btn-secondary" id="participants-cancel">Đóng</button>
                    <button class="btn btn-primary" id="participants-save">
                        <i class="fa-solid fa-save"></i> Lưu danh sách
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const modal = document.getElementById('participants-modal');
    const closeModal = () => {
        modal.remove();
        // Update count on main modal
        const countEl = document.getElementById('participants-count');
        if (countEl) countEl.textContent = tempParticipants.length;
    };

    document.getElementById('participants-close').addEventListener('click', closeModal);
    document.getElementById('participants-cancel').addEventListener('click', closeModal);

    document.getElementById('participants-save').addEventListener('click', closeModal);

    document.getElementById('btn-add-participant').addEventListener('click', () => {
        addParticipantRow();
    });

    // Import Excel button -> trigger file input
    document.getElementById('btn-import-participants')?.addEventListener('click', () => {
        document.getElementById('participants-file-input')?.click();
    });

    // File input change handler
    document.getElementById('participants-file-input')?.addEventListener('change', handleParticipantsExcelImport);

    // Download Template button
    document.getElementById('btn-download-participant-template')?.addEventListener('click', downloadParticipantsTemplate);

    // Export Excel button
    document.getElementById('btn-export-participants')?.addEventListener('click', exportParticipantsExcel);

    // Attach event listeners for existing rows
    attachParticipantRowEvents();
}

// ===== PARTICIPANTS MODAL FOR REPORT (giống openParticipantsModal nhưng cập nhật về report modal) =====
function openParticipantsModalForReport(activityId) {
    // Remove existing modal if any
    document.getElementById('participants-modal')?.remove();

    const modalHtml = `
        <div class="activity-modal participants-modal active" id="participants-modal" style="z-index:10001;">
            <div class="activity-modal-content">
                <div class="activity-modal-header">
                    <h3><i class="fa-solid fa-users"></i> Danh sách tham gia</h3>
                    <button class="close-btn" id="participants-close">&times;</button>
                </div>
                <div class="activity-modal-body">
                    <div style="margin-bottom:15px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;">
                        <button class="btn btn-success btn-sm" id="btn-add-participant">
                            <i class="fa-solid fa-plus"></i> Thêm người
                        </button>
                        <button class="btn btn-info btn-sm" id="btn-import-participants">
                            <i class="fa-solid fa-file-excel"></i> Import
                        </button>
                        <button class="btn btn-warning btn-sm" id="btn-export-participants">
                            <i class="fa-solid fa-file-export"></i> Xuất Excel
                        </button>
                        <button class="btn btn-secondary btn-sm" id="btn-download-participant-template">
                            <i class="fa-solid fa-download"></i> Mẫu
                        </button>
                        <input type="file" id="participants-file-input" accept=".xlsx,.xls" style="display:none;">
                        <span style="margin-left:auto;color:#666;">
                            Tổng: <strong id="total-participants">${tempParticipants.length}</strong> chiến sĩ
                        </span>
                    </div>
                    <div style="overflow-x:auto;">
                        <table class="data-table" style="min-width:100%;">
                            <thead>
                                <tr>
                                    <th style="width:40px;">STT</th>
                                    <th>Họ và Tên</th>
                                    <th>MSSV</th>
                                    <th>Email</th>
                                    <th>Đội hình</th>
                                    <th>Vai trò</th>
                                    <th style="width:70px;">Xóa</th>
                                </tr>
                            </thead>
                            <tbody id="participants-tbody">
                                ${renderParticipantsRows()}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div class="activity-modal-footer">
                    <button class="btn btn-secondary" id="participants-cancel">Đóng</button>
                    <button class="btn btn-primary" id="participants-save">
                        <i class="fa-solid fa-save"></i> Lưu danh sách
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const modal = document.getElementById('participants-modal');
    const closeModal = async () => {
        modal.remove();
        // Update count on REPORT modal
        const countEl = document.getElementById('report-participants-count');
        if (countEl) countEl.textContent = tempParticipants.length;

        // Lưu participants vào activity trong Firebase
        if (activityId) {
            try {
                await updateDoc(doc(db, 'xtn_activities', activityId), {
                    participants: tempParticipants,
                    updatedAt: serverTimestamp()
                });
                // Cập nhật local array
                const activityIndex = activities.findIndex(a => a.id === activityId);
                if (activityIndex !== -1) {
                    activities[activityIndex].participants = [...tempParticipants];
                }
            } catch (error) {
                console.error('[Participants] Save error:', error);
            }
        }
    };

    document.getElementById('participants-close').addEventListener('click', closeModal);
    document.getElementById('participants-cancel').addEventListener('click', closeModal);
    document.getElementById('participants-save').addEventListener('click', closeModal);

    document.getElementById('btn-add-participant').addEventListener('click', () => {
        addParticipantRow();
    });

    document.getElementById('btn-import-participants')?.addEventListener('click', () => {
        document.getElementById('participants-file-input')?.click();
    });

    document.getElementById('participants-file-input')?.addEventListener('change', handleParticipantsExcelImport);
    document.getElementById('btn-download-participant-template')?.addEventListener('click', downloadParticipantsTemplate);
    document.getElementById('btn-export-participants')?.addEventListener('click', exportParticipantsExcel);

    attachParticipantRowEvents();
}

function renderParticipantsRows() {
    if (tempParticipants.length === 0) {
        return '<tr><td colspan="7" style="text-align:center;color:#999;padding:20px;">Chưa có người tham gia</td></tr>';
    }

    return tempParticipants.map((p, i) => `
        <tr data-index="${i}">
            <td>${i + 1}</td>
            <td><input type="text" class="p-name" value="${p.name || ''}" placeholder="Họ và tên"></td>
            <td><input type="text" class="p-mssv" value="${p.mssv || ''}" placeholder="MSSV"></td>
            <td><input type="text" class="p-email" value="${p.email || ''}" placeholder="email@st.uel.edu.vn"></td>
            <td>
                <select class="p-team">
                    <option value="">-- Chọn --</option>
                    ${CONFIG.teams.map(t => `<option value="${t}" ${p.team === t ? 'selected' : ''}>${t}</option>`).join('')}
                </select>
            </td>
            <td>
                <select class="p-role">
                    <option value="Chiến sĩ" ${p.role === 'Chiến sĩ' || !p.role ? 'selected' : ''}>Chiến sĩ</option>
                    <option value="Đội trưởng" ${p.role === 'Đội trưởng' ? 'selected' : ''}>Đội trưởng</option>
                    <option value="Đội phó" ${p.role === 'Đội phó' ? 'selected' : ''}>Đội phó</option>
                    <option value="BCH" ${p.role === 'BCH' ? 'selected' : ''}>BCH</option>
                </select>
            </td>
            <td>
                <button class="btn-delete-row delete-participant" data-index="${i}" title="Xóa">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function addParticipantRow() {
    tempParticipants.push({ name: '', mssv: '', email: '', team: '', role: 'Chiến sĩ' });
    refreshParticipantsTable();
}

function refreshParticipantsTable() {
    const tbody = document.getElementById('participants-tbody');
    if (tbody) {
        tbody.innerHTML = renderParticipantsRows();
        attachParticipantRowEvents();
    }
    const totalEl = document.getElementById('total-participants');
    if (totalEl) totalEl.textContent = tempParticipants.length;
}

function attachParticipantRowEvents() {
    const tbody = document.getElementById('participants-tbody');
    if (!tbody) return;

    // Delete buttons
    tbody.querySelectorAll('.delete-participant').forEach(btn => {
        btn.addEventListener('click', () => {
            const index = parseInt(btn.dataset.index);
            tempParticipants.splice(index, 1);
            refreshParticipantsTable();
        });
    });

    // Input changes - update tempParticipants in real-time
    tbody.querySelectorAll('tr[data-index]').forEach(row => {
        const index = parseInt(row.dataset.index);

        row.querySelector('.p-name')?.addEventListener('input', (e) => {
            tempParticipants[index].name = e.target.value;
        });
        row.querySelector('.p-mssv')?.addEventListener('input', (e) => {
            tempParticipants[index].mssv = e.target.value;
        });
        row.querySelector('.p-email')?.addEventListener('input', (e) => {
            tempParticipants[index].email = e.target.value;
        });
        row.querySelector('.p-team')?.addEventListener('change', (e) => {
            tempParticipants[index].team = e.target.value;
        });
        row.querySelector('.p-role')?.addEventListener('change', (e) => {
            tempParticipants[index].role = e.target.value;
        });
    });
}

// ===== IMPORT EXCEL FOR PARTICIPANTS =====
async function handleParticipantsExcelImport(e) {
    const file = e.target.files[0];
    if (!file) return;

    // Reset input để có thể chọn lại cùng file
    e.target.value = '';

    try {
        // Ensure XLSX is loaded
        if (!window.XLSX) {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js';
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });
        }

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const data = new Uint8Array(evt.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

                // Parse and add to tempParticipants
                let addedCount = 0;
                jsonData.forEach(row => {
                    const name = row['Họ và Tên'] || row['Họ và tên'] || row['name'] || row['Name'] || '';
                    if (!name.trim()) return; // Skip empty rows

                    tempParticipants.push({
                        name: name.trim(),
                        mssv: String(row['MSSV'] || row['mssv'] || '').trim(),
                        email: String(row['Email'] || row['email'] || '').trim(),
                        team: String(row['Đội hình'] || row['team'] || '').trim(),
                        role: String(row['Vai trò'] || row['Chức vụ'] || row['role'] || 'Chiến sĩ').trim()
                    });
                    addedCount++;
                });


                refreshParticipantsTable();
                showToast(`Đã import ${addedCount} người tham gia!`, 'success');
            } catch (parseError) {
                console.error('[Activity] Excel parse error:', parseError);
                showToast('Lỗi đọc file Excel! Vui lòng kiểm tra định dạng file.', 'error');
            }
        };
        reader.readAsArrayBuffer(file);
    } catch (error) {
        console.error('[Activity] Import error:', error);
        showToast('Lỗi import: ' + error.message, 'error');
    }
}

// ===== DOWNLOAD TEMPLATE FOR PARTICIPANTS =====
async function downloadParticipantsTemplate() {
    try {
        // Ensure XLSX is loaded
        if (!window.XLSX) {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js';
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });
        }

        // Create template data with headers and example row
        const templateData = [
            {
                'Họ và Tên': 'Nguyễn Văn A',
                'MSSV': 'K22501111',
                'Email': 'nguyenvana@st.uel.edu.vn',
                'Đội hình': 'Đội hình 1',
                'Vai trò': 'Chiến sĩ'
            },
            {
                'Họ và Tên': 'Trần Thị B',
                'MSSV': 'K22502222',
                'Email': 'tranthib@st.uel.edu.vn',
                'Đội hình': 'Đội hình 1',
                'Vai trò': 'Đội trưởng'
            }
        ];

        const worksheet = XLSX.utils.json_to_sheet(templateData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Danh sách tham gia');

        // Set column widths
        worksheet['!cols'] = [
            { wch: 25 },  // Họ và Tên
            { wch: 15 },  // MSSV
            { wch: 30 },  // Email
            { wch: 15 },  // Đội hình
            { wch: 12 }   // Vai trò
        ];

        XLSX.writeFile(workbook, 'Mau_DanhSachThamGia.xlsx');

    } catch (error) {
        console.error('[Activity] Template download error:', error);
        showToast('Lỗi tạo file mẫu: ' + error.message, 'error');
    }
}

// ===== EXPORT PARTICIPANTS TO EXCEL =====
async function exportParticipantsExcel() {
    try {
        if (tempParticipants.length === 0) {
            showToast('Chưa có người tham gia để xuất!', 'warning');
            return;
        }

        // Ensure XLSX is loaded
        if (!window.XLSX) {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js';
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });
        }

        // Prepare data for export
        const exportData = tempParticipants.map((p, i) => ({
            'STT': i + 1,
            'Họ và Tên': p.name || '',
            'MSSV': p.mssv || '',
            'Email': p.email || '',
            'Đội hình': p.team || '',
            'Vai trò': p.role || 'Chiến sĩ'
        }));

        const worksheet = XLSX.utils.json_to_sheet(exportData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Danh sách tham gia');

        // Set column widths
        worksheet['!cols'] = [
            { wch: 5 },   // STT
            { wch: 25 },  // Họ và Tên
            { wch: 15 },  // MSSV
            { wch: 30 },  // Email
            { wch: 20 },  // Đội hình
            { wch: 12 }   // Vai trò
        ];

        // Generate filename with current date
        const now = new Date();
        const dateStr = `${now.getDate()}-${now.getMonth() + 1}-${now.getFullYear()}`;
        const filename = `DanhSachThamGia_${dateStr}.xlsx`;

        XLSX.writeFile(workbook, filename);

        showToast(`Đã xuất ${tempParticipants.length} người ra file Excel!`, 'success');
    } catch (error) {
        console.error('[Activity] Export error:', error);
        showToast('Lỗi xuất Excel: ' + error.message, 'error');
    }
}

// ===== STATS FUNCTIONS =====
function getFilteredActivities() {
    let filtered = [...activities];

    const teamFilter = elements.statsTeamFilter?.value;

    // Chỉ filter theo đội, hiển thị toàn bộ chiến dịch
    if (teamFilter) {
        filtered = filtered.filter(a => a.team === teamFilter);
    }

    return filtered.sort((a, b) => b.date.localeCompare(a.date));
}

function renderStats() {
    const filtered = getFilteredActivities();

    // Summary
    const totalHours = filtered.reduce((sum, a) => {
        return sum + calculateHours(a.startTime, a.endTime);
    }, 0);

    const uniqueTeams = new Set(filtered.map(a => a.team)).size;

    if (elements.statsTotal) elements.statsTotal.textContent = filtered.length;
    if (elements.statsHours) elements.statsHours.textContent = totalHours.toFixed(1);
    if (elements.statsTeams) elements.statsTeams.textContent = uniqueTeams;

    // Render team stats grid
    renderTeamStats(filtered);

    // Table
    renderStatsTable(filtered);
}

// Render thống kê từng đội hình - Bảng compact với progress bars
function renderTeamStats(filteredActivities) {
    const container = document.getElementById('team-stats-grid');
    if (!container) return;

    // Group activities by team
    const teamStats = {};
    filteredActivities.forEach(a => {
        const team = a.team || 'Chưa phân đội';
        if (!teamStats[team]) {
            teamStats[team] = { count: 0, hours: 0 };
        }
        teamStats[team].count++;
        teamStats[team].hours += calculateHours(a.startTime, a.endTime);
    });

    // If no activities, show message
    if (Object.keys(teamStats).length === 0) {
        container.innerHTML = '<p style="color:#999; text-align:center; padding: 20px;">Chưa có hoạt động nào</p>';
        return;
    }

    // Find max count for progress bar calculation
    const maxCount = Math.max(...Object.values(teamStats).map(s => s.count));

    // Render table with progress bars
    let html = `
        <table class="team-stats-table">
            <thead>
                <tr>
                    <th style="width:40%;">Đội hình</th>
                    <th style="width:35%;">Số hoạt động</th>
                    <th style="width:25%;">Tổng giờ</th>
                </tr>
            </thead>
            <tbody>
    `;

    // Sort by count descending
    const sortedTeams = Object.entries(teamStats).sort((a, b) => b[1].count - a[1].count);

    sortedTeams.forEach(([team, stats]) => {
        const percentage = (stats.count / maxCount) * 100;
        // Shorten team name
        const shortName = team.replace('Đội hình ', '').replace('Ban Chỉ huy ', 'BCH ');

        html += `
            <tr>
                <td title="${team}">${shortName}</td>
                <td>
                    <div class="progress-bar-wrapper">
                        <div class="progress-bar-fill" style="width:${percentage}%;"></div>
                        <span class="progress-bar-text">${stats.count}</span>
                    </div>
                </td>
                <td class="hours-cell"><span>${stats.hours.toFixed(1)}</span> giờ</td>
            </tr>
        `;
    });

    html += '</tbody></table>';
    container.innerHTML = html;
}

function renderStatsTable(data) {
    if (!elements.statsTbody) return;

    const start = (currentPage - 1) * CONFIG.itemsPerPage;
    const end = start + CONFIG.itemsPerPage;
    const pageData = data.slice(start, end);

    if (pageData.length === 0) {
        elements.statsTbody.innerHTML = `
            <tr><td colspan="12" style="text-align:center;padding:40px;color:#999;">
                Không có dữ liệu
            </td></tr>
        `;
    } else {
        elements.statsTbody.innerHTML = pageData.map((a, i) => {
            // Format updatedAt
            let updatedTime = '-';
            if (a.updatedAt) {
                const d = a.updatedAt.toDate ? a.updatedAt.toDate() : new Date(a.updatedAt);
                updatedTime = d.toLocaleString('vi-VN', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric'
                });
            }

            // BCH badge
            const bchBadge = a.bchSuggestion === 'Có'
                ? '<span class="badge badge-success" style="background:#d1fae5;color:#065f46;font-size:12px;">Có</span>'
                : '<span class="badge" style="background:#f3f4f6;color:#6b7280;font-size:12px;">Không</span>';

            // Ký sự Tết badge
            const kstBadge = a.kysutetNews === 'Có'
                ? '<span class="badge badge-success" style="background:#dbeafe;color:#1e40af;font-size:12px;">Có</span>'
                : '<span class="badge" style="background:#f3f4f6;color:#6b7280;font-size:12px;">Không</span>';

            // Kiểm tra thời gian không hợp lệ (kết thúc <= bắt đầu)
            const isInvalidTime = a.startTime && a.endTime && a.startTime >= a.endTime;
            const timeStyle = isInvalidTime
                ? 'background:#fee2e2; color:#dc2626; font-weight:700; padding:4px 8px; border-radius:4px;'
                : '';
            const timeWarning = isInvalidTime ? ' ⚠️' : '';


            // Kiểm tra quá hạn báo cáo: hoạt động đã kết thúc > 4 tiếng và chưa có báo cáo
            const now = new Date();
            const activityEndDateTime = new Date(`${a.date}T${a.endTime || '23:59'}`);
            const hoursAfterEnd = (now - activityEndDateTime) / (1000 * 60 * 60);
            // Kiểm tra báo cáo: CHỈ theo linkedActivityId (fix bug: ko còn match date+team gây đánh dấu sai nhiều hoạt động)
            const hasReport = reports.some(r => r.linkedActivityId === a.id);
            const isOverdueReport = !hasReport && hoursAfterEnd > 12 && activityEndDateTime < now;

            // Xác định style cho row
            let rowStyle = '';
            let rowClass = '';
            if (isInvalidTime) {
                rowStyle = 'background:#fff5f5;';
            } else if (isOverdueReport) {
                rowStyle = 'background:#fef2f2; border-left:3px solid #dc2626;';
                rowClass = 'overdue-report';
            }

            return `
            <tr style="${rowStyle}" class="${rowClass}"${isOverdueReport ? ' title="⚠️ Chưa báo cáo sau 4 tiếng!"' : ''}>
                <td>${start + i + 1}</td>
                <td>${formatDate(a.date, 'full')}</td>
                <td>${isInvalidTime
                    ? `<span class="time-error" style="${timeStyle} cursor:pointer;" data-id="${a.id}" title="Click để xem lỗi">${a.startTime} - ${a.endTime}${timeWarning}</span>`
                    : `<span>${a.startTime} - ${a.endTime}</span>`}</td>
                <td>
                    <strong>${a.title || '-'}</strong>
                    ${isOverdueReport ? '<span style="background:#dc2626; color:white; padding:2px 6px; border-radius:4px; font-size:10px; margin-left:6px;">⚠️ Chưa báo cáo</span>' : ''}
                </td>
                <td>${normalizeTeamName(a.team)}</td>
                <td>${a.location || '-'}</td>
                <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${a.content || ''}">${a.content || '-'}</td>
                <td>${bchBadge}</td>
                <td>${kstBadge}</td>
                <td>${updatedTime}</td>
                <td>${a.updatedBy || a.createdBy || '-'}</td>
                <td class="actions">
                    <button class="btn-icon edit" data-id="${a.id}" title="Sửa">
                        <i class="fa-solid fa-edit"></i>
                    </button>
                    <button class="btn-icon delete" data-id="${a.id}" title="Xóa">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
        }).join('');

        // Add handlers
        elements.statsTbody.querySelectorAll('.btn-icon.edit').forEach(btn => {
            btn.addEventListener('click', () => {
                const activity = activities.find(a => a.id === btn.dataset.id);
                if (activity) openActivityModal(activity);
            });
        });

        elements.statsTbody.querySelectorAll('.btn-icon.delete').forEach(btn => {
            btn.addEventListener('click', async () => {
                const confirmed = await showConfirmModal('Xóa hoạt động này?', { title: 'Xóa hoạt động', type: 'danger', confirmText: 'Xóa' });
                if (confirmed) {
                    await deleteActivity(btn.dataset.id);
                }
            });
        });

        // Click vào thời gian lỗi để xem chi tiết
        elements.statsTbody.querySelectorAll('.time-error').forEach(span => {
            span.addEventListener('click', () => {
                const activity = activities.find(a => a.id === span.dataset.id);
                if (activity) {
                    showToast(`⚠️ LỖI THỜI GIAN: Giờ kết thúc (${activity.endTime}) phải SAU giờ bắt đầu (${activity.startTime})! Vui lòng sửa lại.`, 'error', 5000);
                }
            });
        });
    }

    // Pagination
    renderPagination(data.length);
}

function renderPagination(total) {
    if (!elements.statsPagination) return;

    const totalPages = Math.ceil(total / CONFIG.itemsPerPage);

    if (totalPages <= 1) {
        elements.statsPagination.innerHTML = '';
        return;
    }

    let html = '';

    for (let i = 1; i <= totalPages; i++) {
        html += `<button class="${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
    }

    elements.statsPagination.innerHTML = html;

    elements.statsPagination.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
            currentPage = parseInt(btn.dataset.page);
            renderStats();
        });
    });
}

function exportToCSV() {
    const filtered = getFilteredActivities();

    if (filtered.length === 0) {
        showToast('Không có dữ liệu để xuất!', 'warning');
        return;
    }

    const headers = ['STT', 'Ngày', 'Đội hình', 'Giờ BĐ', 'Giờ KT', 'Địa điểm', 'Nội dung', 'Số tham gia', 'Đề xuất BCH', 'Đề xuất KST', 'Người cập nhật', 'TG Cập nhật'];
    const rows = filtered.map((a, i) => {
        let updatedTime = '';
        if (a.updatedAt) {
            const d = a.updatedAt.toDate ? a.updatedAt.toDate() : new Date(a.updatedAt);
            updatedTime = d.toLocaleString('vi-VN');
        }
        return [
            i + 1,
            formatDate(a.date, 'full'),
            normalizeTeamName(a.team),
            a.startTime,
            a.endTime,
            a.location || '',
            a.content || '',
            a.expectedParticipants || 0,
            a.bchSuggestion || 'Không',
            a.kysutetNews || 'Không',
            a.updatedBy || a.createdBy || '',
            updatedTime
        ];
    });

    // Sử dụng SheetJS để xuất Excel
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

    // Định dạng cột
    ws['!cols'] = [
        { wch: 5 },   // STT
        { wch: 15 },  // Ngày
        { wch: 25 },  // Đội hình
        { wch: 8 },   // Giờ BĐ
        { wch: 8 },   // Giờ KT
        { wch: 20 },  // Địa điểm
        { wch: 40 },  // Nội dung
        { wch: 10 },  // Số tham gia
        { wch: 12 },  // Đề xuất BCH
        { wch: 12 },  // Đề xuất KST
        { wch: 25 },  // Người cập nhật
        { wch: 18 }   // TG Cập nhật
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Hoạt động');
    XLSX.writeFile(wb, `XTN2026_HoatDong_${formatDate(new Date(), 'yyyy-mm-dd')}.xlsx`);
    showToast('Đã xuất file Excel thành công!', 'success');
}

// Export Reports to CSV
function exportReports() {
    // Sử dụng filter từ toolbar thống nhất
    const dateFilter = elements.reportDateFilter?.value || '';
    const teamFilter = elements.reportTeamSelect?.value || '';

    let filtered = [...reports];

    // Filter by date (single date from unified toolbar)
    if (dateFilter) {
        filtered = filtered.filter(r => r.date === dateFilter);
    }

    // Filter by team
    if (teamFilter) {
        filtered = filtered.filter(r => r.team === teamFilter);
    }

    if (filtered.length === 0) {
        showToast('Không có báo cáo nào trong khoảng thời gian này!', 'warning');
        return;
    }

    // Build Excel data
    const headers = ['STT', 'Ngày', 'Đội hình', 'Số tham gia', 'Nội dung hoạt động', 'Nội dung báo cáo', 'Minh chứng', 'Người tạo', 'Ngày tạo'];
    const rows = filtered.map((r, i) => {
        const createdDate = r.createdAt?.toDate?.()?.toLocaleString('vi-VN') || '';
        const evidenceStr = (r.evidence || []).join(' | ');
        return [
            i + 1,
            r.date || '',
            normalizeTeamName(r.team) || '',
            r.participants || '',
            r.activityContent || '',
            r.reportContent || '',
            evidenceStr,
            r.createdBy || '',
            createdDate
        ];
    });

    // Sử dụng SheetJS để xuất Excel
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

    // Định dạng cột
    ws['!cols'] = [
        { wch: 5 },   // STT
        { wch: 12 },  // Ngày
        { wch: 25 },  // Đội hình
        { wch: 12 },  // Số tham gia
        { wch: 40 },  // Nội dung hoạt động
        { wch: 50 },  // Nội dung báo cáo
        { wch: 40 },  // Minh chứng
        { wch: 25 },  // Người tạo
        { wch: 18 }   // Ngày tạo
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Báo cáo');

    const fileName = dateFilter
        ? `XTN2026_BaoCao_${dateFilter}.xlsx`
        : `XTN2026_BaoCao_${formatDate(new Date(), 'yyyy-mm-dd')}.xlsx`;

    XLSX.writeFile(wb, fileName);
    showToast(`Đã xuất ${filtered.length} báo cáo thành công!`, 'success');
}

// ===== REPORT FUNCTIONS =====
// State cho filter
let activityStatusFilter = 'all'; // 'all', 'reported', 'not-reported'

// Render danh sách hoạt động với trạng thái báo cáo
function renderActivitiesStatus() {
    if (!elements.activitiesReportStatus) return;

    const teamFilter = elements.reportTeamSelect?.value || '';

    // Lọc activities theo team (nếu có)
    let filteredActivities = [...activities];
    if (teamFilter) {
        filteredActivities = filteredActivities.filter(a =>
            normalizeTeamName(a.team) === teamFilter || a.team === teamFilter
        );
    }

    // Sắp xếp theo ngày mới nhất
    filteredActivities.sort((a, b) => {
        const dateA = new Date(a.date || 0);
        const dateB = new Date(b.date || 0);
        return dateB - dateA;
    });

    // Tính toán thống kê
    const activityStats = filteredActivities.map(a => {
        // CHỈ check linkedActivityId (fix bug: ko còn match date+team gây đánh dấu sai nhiều hoạt động)
        const hasReport = reports.some(r => r.linkedActivityId === a.id);
        return { ...a, hasReport };
    });

    const reportedList = activityStats.filter(a => a.hasReport);
    const notReportedList = activityStats.filter(a => !a.hasReport);
    const total = activityStats.length;

    if (total === 0) {
        elements.activitiesReportStatus.innerHTML = `
            <div style="text-align:center; padding:30px; color:#9ca3af;">
                <i class="fa-solid fa-calendar-xmark" style="font-size:2rem; margin-bottom:10px; display:block;"></i>
                Chưa có hoạt động nào${teamFilter ? ' cho đội hình này' : ''}
            </div>
        `;
        return;
    }

    // Lọc theo filter hiện tại
    let displayActivities = activityStats;
    let filterTitle = 'Tất cả hoạt động';
    if (activityStatusFilter === 'reported') {
        displayActivities = reportedList;
        filterTitle = '✓ Đã báo cáo';
    } else if (activityStatusFilter === 'not-reported') {
        displayActivities = notReportedList;
        filterTitle = '⏳ Chưa báo cáo';
    }

    // Lấy 20 hoạt động
    const recentActivities = displayActivities.slice(0, 20);

    // Build HTML với clickable stats
    let html = `
        <!-- Thống kê - CLICK ĐỂ LỌC -->
        <div style="display:flex; gap:15px; margin-bottom:18px; flex-wrap:wrap;">
            <div class="stats-box" data-filter="reported"
                 style="flex:1; min-width:140px; background:linear-gradient(135deg, #ecfdf5, #d1fae5); 
                        padding:15px 18px; border-radius:12px; text-align:center; cursor:pointer;
                        border:3px solid ${activityStatusFilter === 'reported' ? '#059669' : 'transparent'};">
                <div style="font-size:1.8rem; font-weight:700; color:#059669;">${reportedList.length}</div>
                <div style="font-size:0.85rem; color:#047857;">✓ Đã báo cáo</div>
            </div>
            <div class="stats-box" data-filter="not-reported"
                 style="flex:1; min-width:140px; background:linear-gradient(135deg, #fffbeb, #fef3c7); 
                        padding:15px 18px; border-radius:12px; text-align:center; cursor:pointer;
                        border:3px solid ${activityStatusFilter === 'not-reported' ? '#d97706' : 'transparent'};">
                <div style="font-size:1.8rem; font-weight:700; color:#d97706;">${notReportedList.length}</div>
                <div style="font-size:0.85rem; color:#b45309;">⏳ Chưa báo cáo</div>
            </div>
            <div class="stats-box" data-filter="all"
                 style="flex:1; min-width:140px; background:linear-gradient(135deg, #f0f9ff, #e0f2fe); 
                        padding:15px 18px; border-radius:12px; text-align:center; cursor:pointer;
                        border:3px solid ${activityStatusFilter === 'all' ? '#0284c7' : 'transparent'};">
                <div style="font-size:1.8rem; font-weight:700; color:#0284c7;">${total}</div>
                <div style="font-size:0.85rem; color:#0369a1;">📋 Tất cả</div>
            </div>
        </div>
        
        <!-- Hướng dẫn -->
        <p style="text-align:center; font-size:0.85rem; color:#6b7280; margin:0;">
            <i class="fa-solid fa-hand-pointer"></i> Click vào ô để xem danh sách chi tiết
        </p>
    `;

    elements.activitiesReportStatus.innerHTML = html;

    // Event listener cho stats boxes (click mở modal)
    elements.activitiesReportStatus.querySelectorAll('.stats-box').forEach(box => {
        box.addEventListener('click', () => {
            const filter = box.dataset.filter;
            // Lấy danh sách đúng theo filter
            let listToShow = activityStats;
            let modalTitle = '📋 Tất cả hoạt động';

            if (filter === 'reported') {
                listToShow = reportedList;
                modalTitle = '✓ Hoạt động Đã báo cáo';
            } else if (filter === 'not-reported') {
                listToShow = notReportedList;
                modalTitle = '⏳ Hoạt động Chưa báo cáo';
            }

            openActivitiesModal(listToShow, modalTitle);
        });
    });
}

// Modal popup hiển thị danh sách hoạt động
function openActivitiesModal(activitiesList, title) {
    document.getElementById('activities-status-modal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'activities-status-modal';
    modal.style.cssText = 'display:flex; position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:9999; align-items:center; justify-content:center;';

    const listHTML = activitiesList.length === 0
        ? '<p style="text-align:center; color:#9ca3af; padding:30px;">Không có hoạt động nào</p>'
        : activitiesList.map(a => {
            const dateStr = a.date ? formatDate(a.date, 'full') : 'Chưa có ngày';
            const teamName = normalizeTeamName(a.team);
            const timeStr = (a.startTime && a.endTime) ? `${a.startTime} - ${a.endTime}` : '';

            // Tên hoạt động - ưu tiên title, fallback content
            let displayTitle = a.title;
            if (!displayTitle || displayTitle === '1' || displayTitle.length < 3) {
                displayTitle = a.content ? a.content.substring(0, 50) + '...' : 'Hoạt động';
            }
            const participantsCount = Array.isArray(a.participants) ? a.participants.length : 0;

            return `
                <div style="background:#fff; border:1px solid #e5e7eb; border-radius:10px; padding:12px 15px; margin-bottom:10px;">
                    <h5 style="margin:0 0 5px; font-size:0.95rem; color:#1f2937;">
                        ${displayTitle}
                        ${timeStr ? `<span style="font-weight:400; color:#6b7280; font-size:0.85rem;"> (${timeStr})</span>` : ''}
                    </h5>
                    <div style="font-size:0.85rem; color:#6b7280; display:flex; gap:12px; flex-wrap:wrap;">
                        <span><i class="fa-solid fa-users"></i> ${teamName}</span>
                        <span><i class="fa-solid fa-calendar"></i> ${dateStr}</span>
                        ${participantsCount > 0 ? `<span><i class="fa-solid fa-user-group"></i> ${participantsCount}</span>` : ''}
                    </div>
                    <div style="display:flex; align-items:center; gap:8px; margin-top:8px; justify-content:flex-end;">
                        ${!a.hasReport ? `
                            <button class="btn btn-sm btn-success btn-create-report-modal" 
                                    data-activity-id="${a.id}" data-team="${a.team}" data-date="${a.date}"
                                    style="padding:5px 10px; font-size:11px;">
                                <i class="fa-solid fa-plus"></i> Báo cáo
                            </button>
                        ` : ''}
                        <span style="padding:4px 10px; border-radius:15px; font-size:0.75rem; font-weight:600;
                                     background:${a.hasReport ? '#d1fae5' : '#fef3c7'}; 
                                     color:${a.hasReport ? '#065f46' : '#92400e'};">
                            ${a.hasReport ? '✓ Đã BC' : '⏳ Chưa BC'}
                        </span>
                    </div>
                </div>
            `;
        }).join('');

    modal.innerHTML = `
        <div style="background:white; border-radius:16px; width:95%; max-width:600px; max-height:80vh; overflow:hidden; box-shadow:0 15px 50px rgba(0,0,0,0.25);">
            <div style="padding:18px 20px; background:linear-gradient(135deg, #16a34a, #22c55e); display:flex; justify-content:space-between; align-items:center;">
                <h3 style="margin:0; font-size:1.1rem; color:white; font-weight:600;">${title} (${activitiesList.length})</h3>
                <button id="close-activities-modal" style="background:rgba(255,255,255,0.2); border:none; width:30px; height:30px; border-radius:50%; font-size:1.2rem; cursor:pointer; color:white; line-height:1;">&times;</button>
            </div>
            <div style="padding:15px 20px; overflow-y:auto; max-height:60vh; background:#fafafa;">
                ${listHTML}
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector('#close-activities-modal').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    modal.querySelectorAll('.btn-create-report-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            modal.remove();
            openReportModal(null, btn.dataset.team, btn.dataset.date, btn.dataset.activityId);
        });
    });
}

function renderReports() {
    if (!elements.reportsList) return;

    // Render activities status overview
    renderActivitiesStatus();

    const searchFilter = elements.reportSearch?.value?.toLowerCase() || '';
    const dateFilter = elements.reportDateFilter?.value || '';
    const teamFilter = elements.reportTeamSelect?.value || '';

    let filtered = [...reports];

    // Filter by search text
    if (searchFilter) {
        filtered = filtered.filter(r =>
            (r.team || '').toLowerCase().includes(searchFilter) ||
            (r.activityContent || '').toLowerCase().includes(searchFilter) ||
            (r.reportContent || '').toLowerCase().includes(searchFilter)
        );
    }

    // Filter by date
    if (dateFilter) {
        filtered = filtered.filter(r => r.date === dateFilter);
    }

    // Filter by team
    if (teamFilter) {
        filtered = filtered.filter(r => r.team === teamFilter);
    }

    if (filtered.length === 0) {
        elements.reportsList.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-file-circle-question fa-3x"></i>
                <p>Chưa có báo cáo nào. Chọn đội hình và nhấn "Thêm báo cáo mới".</p>
            </div>
        `;
        return;
    }

    elements.reportsList.innerHTML = filtered.map(r => {
        // Format ngày theo chuẩn Việt Nam (dd/mm/yyyy)
        const formatVNDate = (dateStr) => {
            if (!dateStr) return 'N/A';
            const parts = dateStr.split('-');
            if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
            return dateStr;
        };
        const reportDate = formatVNDate(r.date) || `Tuần ${r.week}`;
        const createdDate = r.createdAt?.toDate?.()?.toLocaleDateString('vi-VN') || 'N/A';

        // Lấy title từ hoạt động liên kết (nếu có)
        let activityTitle = '';
        let activityContent = '';
        if (r.linkedActivityId) {
            const linkedActivity = activities.find(a => a.id === r.linkedActivityId);
            if (linkedActivity?.title) {
                activityTitle = linkedActivity.title;
            }
            if (linkedActivity?.content) {
                activityContent = linkedActivity.content;
            }
        }

        // Nội dung hoạt động (từ activity liên kết hoặc field riêng)
        const activityDesc = activityContent || r.activityContent || '';

        // Nội dung báo cáo
        const reportContent = r.content || r.reportContent || r.summary || '';

        // Format timestamp cập nhật
        const updatedTime = r.updatedAt?.toDate?.()?.toLocaleString('vi-VN') || createdDate;

        // Lấy số lượng tham gia: ưu tiên từ report, fallback từ activity liên kết
        const linkedActivity = r.linkedActivityId ? activities.find(a => a.id === r.linkedActivityId) : null;
        const displayParticipantsCount = r.participantsCount || linkedActivity?.participants?.length || 0;

        return `
        <div class="report-card" data-id="${r.id}">
            <!-- Header: Đội hình + Ngày + Buttons -->
            <div class="report-card-header">
                <div class="report-card-title">
                    <h4>${normalizeTeamName(r.team)}</h4>
                    <span class="report-date">Báo cáo cho: <strong>Ngày ${reportDate}</strong></span>
                </div>
                <div class="report-card-actions">
                    <button class="btn btn-sm btn-outline btn-history" data-id="${r.id}">
                        <i class="fa-solid fa-clock-rotate-left"></i> Lịch sử
                    </button>
                    <button class="btn btn-sm btn-warning btn-edit" data-id="${r.id}">
                        <i class="fa-solid fa-edit"></i> Sửa
                    </button>
                    <button class="btn btn-sm btn-danger btn-delete" data-id="${r.id}">
                        <i class="fa-solid fa-trash"></i> Xóa
                    </button>
                </div>
            </div>
            
            <!-- Body: Nội dung chi tiết -->
            <div class="report-card-body">
                <p class="report-field"><strong>Số lượng tham gia:</strong> ${displayParticipantsCount} chiến sĩ</p>
                
                <p class="report-field"><strong>Nội dung hoạt động:</strong></p>
                <p class="report-value">${activityDesc || 'Không có'}</p>
                
                <p class="report-field"><strong>Nội dung báo cáo:</strong></p>
                <p class="report-value">${reportContent || 'Không có'}</p>
                
                <p class="report-field"><strong>Minh chứng:</strong></p>
                <p class="report-value">${r.evidence && r.evidence.length > 0
                ? r.evidence.map(e => `<a href="${e}" target="_blank" rel="noopener">${e}</a>`).join('<br>')
                : 'Không có'}</p>
            </div>
            
            <!-- Footer: Người cập nhật + Thời gian -->
            <div class="report-card-footer">
                <small>Cập nhật bởi: ${r.updatedBy || r.createdBy || 'N/A'} lúc ${updatedTime}</small>
            </div>
        </div>
    `;
    }).join('');

    // Edit buttons
    elements.reportsList.querySelectorAll('.btn-edit').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const report = reports.find(r => r.id === btn.dataset.id);
            if (!report) return;

            // Kiểm tra quyền: chỉ admin hoặc cùng đội mới được sửa
            const isAdmin = currentUserRole === 'super_admin' || currentUserRole === 'kysutet_admin';
            if (!isAdmin && currentUserTeam) {
                const normalizedUserTeam = normalizeTeamName(currentUserTeam);
                const normalizedReportTeam = normalizeTeamName(report.team);
                if (normalizedUserTeam !== normalizedReportTeam) {
                    showToast(`Bạn không có quyền sửa báo cáo của đội "${normalizedReportTeam}"!`, 'warning');
                    return;
                }
            }

            openReportModal(report);
        });
    });

    // Delete buttons
    elements.reportsList.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const report = reports.find(r => r.id === btn.dataset.id);

            // Kiểm tra quyền: chỉ admin hoặc cùng đội mới được xóa
            // Dùng currentUserRole trực tiếp thay vì isSuperAdmin() để đảm bảo sync
            const isAdmin = currentUserRole === 'super_admin' || currentUserRole === 'kysutet_admin';
            if (!isAdmin && currentUserTeam && report) {
                const normalizedUserTeam = normalizeTeamName(currentUserTeam);
                const normalizedReportTeam = normalizeTeamName(report.team);
                if (normalizedUserTeam !== normalizedReportTeam) {
                    showToast(`Bạn không có quyền xóa báo cáo của đội "${normalizedReportTeam}"!`, 'warning');
                    return;
                }
            }

            const confirmed = await showConfirmModal('Xóa báo cáo này?', { title: 'Xóa báo cáo', type: 'danger', confirmText: 'Xóa' });
            if (confirmed) {
                try {
                    await deleteDoc(doc(db, 'xtn_reports', btn.dataset.id));
                    await logAction('delete', 'report', btn.dataset.id, {});

                    // Xóa khỏi array local và refresh UI
                    const idx = reports.findIndex(r => r.id === btn.dataset.id);
                    if (idx > -1) reports.splice(idx, 1);
                    renderReports();
                    renderActivitiesStatus();
                    showToast('Đã xóa báo cáo!', 'success');
                } catch (error) {
                    console.error('[Report] Delete error:', error);
                    showToast('Có lỗi khi xóa báo cáo!', 'error');
                }
            }
        });
    });

    // History buttons
    elements.reportsList.querySelectorAll('.btn-history').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            showReportHistory(btn.dataset.id);
        });
    });
}

// ===== ACTIVITY SELECTOR FOR REPORT =====
function showActivitySelector() {
    // Xác định quyền: super_admin thấy tất cả, còn lại chỉ thấy đội mình
    const isFullAdmin = currentUserRole === 'super_admin' || currentUserRole === 'kysutet_admin';

    // Lọc hoạt động theo quyền
    let filteredActivities = [...activities];
    if (!isFullAdmin && currentUserTeam) {
        const normalizedCurrentTeam = normalizeTeamName(currentUserTeam);
        filteredActivities = activities.filter(a =>
            normalizeTeamName(a.team) === normalizedCurrentTeam
        );
    }

    // Sắp xếp theo ngày gần nhất
    filteredActivities.sort((a, b) => b.date.localeCompare(a.date));

    // Mặc định hiện 5 hoạt động
    let showCount = 5;

    // Remove existing modal
    document.getElementById('activity-selector-modal')?.remove();

    const renderActivityList = (count) => {
        const displayActivities = filteredActivities.slice(0, count);

        if (displayActivities.length === 0) {
            return `
                <div class="empty-state" style="padding:30px; text-align:center; color:#999;">
                    <i class="fa-solid fa-calendar-xmark fa-3x"></i>
                    <p>Chưa có hoạt động nào ${!isFullAdmin ? 'của đội bạn' : ''}.</p>
                    <p style="font-size:0.9rem;">Hãy tạo hoạt động trong tab "Lịch hoạt động" trước.</p>
                </div>
            `;
        }

        return displayActivities.map(a => `
            <div class="activity-select-item" data-id="${a.id}" style="
                padding: 12px 15px;
                border: 2px solid #e5e7eb;
                border-radius: 8px;
                margin-bottom: 8px;
                cursor: pointer;
                transition: all 0.2s;
                display: flex;
                justify-content: space-between;
                align-items: center;
            ">
                <div>
                    <strong style="color:#16a34a;">${formatDate(a.date, 'full')}</strong>
                    <span style="margin-left:10px; color:#6b7280;">${normalizeTeamName(a.team)}</span>
                    <p style="margin:5px 0 0 0; font-size:0.9rem; color:#374151;">${a.content || 'Hoạt động'}</p>
                    <small style="color:#9ca3af;">${a.startTime} - ${a.endTime} | ${a.location || 'Chưa có địa điểm'}</small>
                </div>
                <i class="fa-solid fa-chevron-right" style="color:#9ca3af;"></i>
            </div>
        `).join('') +
            (filteredActivities.length > count ? `
            <button class="btn btn-secondary btn-block" id="btn-show-more-activities" style="margin-top:10px;">
                <i class="fa-solid fa-plus"></i> Xem thêm (còn ${filteredActivities.length - count} hoạt động)
            </button>
        ` : '');
    };

    const modalHtml = `
        <div class="activity-modal active" id="activity-selector-modal">
            <div class="activity-modal-content" style="max-width:550px;">
                <div class="activity-modal-header" style="background:linear-gradient(135deg,#16a34a,#22c55e);">
                    <h3 style="color:white;"><i class="fa-solid fa-list-check"></i> Chọn hoạt động để báo cáo</h3>
                    <button class="close-btn" id="selector-close" style="color:white;">&times;</button>
                </div>
                <div class="activity-modal-body" id="activity-list-container" style="max-height:400px; overflow-y:auto;">
                    ${renderActivityList(showCount)}
                </div>
                <div class="activity-modal-footer">
                    <button class="btn btn-secondary" id="selector-cancel">Hủy</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const modal = document.getElementById('activity-selector-modal');
    const closeModal = () => modal.remove();

    document.getElementById('selector-close').addEventListener('click', closeModal);
    document.getElementById('selector-cancel').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    // Click vào hoạt động → mở form báo cáo
    const attachItemEvents = () => {
        modal.querySelectorAll('.activity-select-item').forEach(item => {
            item.addEventListener('click', () => {
                const activityId = item.dataset.id;
                const selectedActivity = activities.find(a => a.id === activityId);
                closeModal();
                if (selectedActivity) {
                    openReportModalWithActivity(selectedActivity);
                }
            });

            // Hover effect
            item.addEventListener('mouseenter', () => {
                item.style.borderColor = '#16a34a';
                item.style.background = '#f0fdf4';
            });
            item.addEventListener('mouseleave', () => {
                item.style.borderColor = '#e5e7eb';
                item.style.background = 'white';
            });
        });

        // Xem thêm
        document.getElementById('btn-show-more-activities')?.addEventListener('click', () => {
            showCount += 5;
            document.getElementById('activity-list-container').innerHTML = renderActivityList(showCount);
            attachItemEvents();
        });
    };

    attachItemEvents();
}

// Mở form báo cáo với dữ liệu từ hoạt động đã chọn
function openReportModalWithActivity(activity) {
    // Remove existing modal
    document.getElementById('report-modal')?.remove();

    const team = normalizeTeamName(activity.team);
    const isFullAdmin = currentUserRole === 'super_admin' || currentUserRole === 'kysutet_admin';

    // Evidence links
    const evidenceLinks = '';

    const modalHtml = `
        <div class="activity-modal active" id="report-modal">
            <div class="activity-modal-content" style="max-width:600px;">
                <div class="activity-modal-header" style="background:linear-gradient(135deg,#dc2626,#ef4444);">
                    <h3 style="color:white;"><i class="fa-solid fa-file-alt"></i> Báo cáo hoạt động</h3>
                    <button class="close-btn" id="report-modal-close" style="color:white;">&times;</button>
                </div>
                <div class="activity-modal-body">
                    <!-- Thông tin hoạt động (readonly) -->
                    <div style="background:#f0fdf4; padding:15px; border-radius:8px; margin-bottom:15px; border:1px solid #86efac;">
                        <h4 style="margin:0 0 10px 0; color:#16a34a;"><i class="fa-solid fa-calendar-check"></i> Hoạt động được báo cáo</h4>
                        <p style="margin:5px 0; font-size:1.1rem;"><strong style="color:#dc2626; font-size:1.15rem;">${activity.title || 'Chưa có tên hoạt động'}</strong></p>
                        <p style="margin:5px 0;"><strong>Ngày:</strong> ${formatDate(activity.date, 'full')}</p>
                        <p style="margin:5px 0;"><strong>Đội hình:</strong> ${team}</p>
                        <p style="margin:5px 0;"><strong>Thời gian:</strong> ${activity.startTime} - ${activity.endTime}</p>
                        <p style="margin:5px 0;"><strong>Địa điểm:</strong> ${activity.location || 'Chưa có'}</p>
                        <p style="margin:5px 0;"><strong>Nội dung:</strong> ${activity.content || 'Chưa có'}</p>
                        <input type="hidden" id="report-linked-activity" value="${activity.id}">
                        <input type="hidden" id="report-team-hidden" value="${team}">
                        <input type="hidden" id="report-date-hidden" value="${activity.date}">
                    </div>
                    
                    <!-- Danh sách tham gia - GIỐNG MODAL HOẠT ĐỘNG -->
                    <div class="form-group">
                        <label>Danh sách tham gia thực tế</label>
                        <button type="button" class="btn btn-info btn-block" id="btn-report-participants-list" style="margin-top:5px;">
                            <i class="fa-solid fa-users"></i> 
                            Quản lý danh sách (<span id="report-participants-count">${activity.participants?.length || 0}</span> chiến sĩ)
                        </button>
                        <input type="hidden" id="report-activity-id" value="${activity.id}">
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Tổng giờ hoạt động</label>
                            <input type="text" id="report-hours" value="${calculateHours(activity.startTime, activity.endTime).toFixed(1)} giờ" readonly style="background:#f3f4f6; font-weight:bold;">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Nội dung báo cáo <span class="required">*</span></label>
                        <textarea id="report-content" rows="4" placeholder="Tóm tắt kết quả hoạt động...">${activity.content || ''}</textarea>
                    </div>
                    <div class="form-group">
                        <label>Link minh chứng (mỗi link 1 dòng)</label>
                        <textarea id="report-evidence" rows="3" placeholder="https://drive.google.com/...&#10;https://facebook.com/...">${evidenceLinks}</textarea>
                    </div>
                    <div class="form-group">
                        <label>Ghi chú / Nhận xét</label>
                        <textarea id="report-notes" rows="2" placeholder="Nhận xét, đề xuất..."></textarea>
                    </div>
                </div>
                <div class="activity-modal-footer">
                    <button class="btn btn-secondary" id="report-cancel">Hủy</button>
                    <button class="btn btn-primary" id="report-save"><i class="fa-solid fa-save"></i> Lưu báo cáo</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const modal = document.getElementById('report-modal');
    const closeModal = () => modal.remove();

    document.getElementById('report-modal-close').addEventListener('click', closeModal);
    document.getElementById('report-cancel').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    // Nút Quản lý danh sách tham gia
    document.getElementById('btn-report-participants-list')?.addEventListener('click', () => {
        const activityId = document.getElementById('report-activity-id')?.value || activity.id;
        // Lưu tempParticipants từ activity
        tempParticipants = activity.participants ? [...activity.participants] : [];
        // Mở modal quản lý danh sách
        openParticipantsModalForReport(activityId);
    });

    // Save report
    document.getElementById('report-save').addEventListener('click', async () => {
        const content = document.getElementById('report-content').value.trim();

        if (!content) {
            showToast('Vui lòng điền nội dung báo cáo!', 'warning');
            return;
        }

        const reportData = {
            team: document.getElementById('report-team-hidden').value,
            date: document.getElementById('report-date-hidden').value,
            linkedActivityId: document.getElementById('report-linked-activity').value,
            participantsCount: parseInt(document.getElementById('report-participants-count')?.textContent) || 0,
            totalHours: parseFloat(document.getElementById('report-hours').value) || 0,
            activityContent: content,
            evidence: document.getElementById('report-evidence').value.split('\n').filter(l => l.trim()),
            notes: document.getElementById('report-notes').value.trim(),
            submitted: false,
            createdAt: serverTimestamp(),
            createdBy: auth.currentUser?.email || 'unknown',
            updatedAt: serverTimestamp(),
            updatedBy: auth.currentUser?.email || 'unknown'
        };

        try {
            const docRef = await addDoc(collection(db, 'xtn_reports'), reportData);
            await logAction('create', 'report', docRef.id, reportData);
            showToast('Đã lưu báo cáo thành công!', 'success');
            closeModal();
        } catch (error) {
            console.error('[Report] Save error:', error);
            showToast('Có lỗi xảy ra khi lưu báo cáo!', 'error');
        }
    });
}

function openReportModal(report = null, prefillTeam = '', prefillDate = '', prefillActivityId = '') {
    // Debug log


    // Ưu tiên team từ: 1) report.team, 2) prefillTeam từ activity, 3) currentUserTeam, 4) dropdown filter
    const selectedTeam = prefillTeam || elements.reportTeamSelect?.value || '';

    if (!report && !selectedTeam && !currentUserTeam) {
        showToast('Vui lòng chọn đội hình trước!', 'warning');
        return;
    }

    // Remove existing modal
    document.getElementById('report-modal')?.remove();

    const isEdit = !!report;
    const isAdmin = currentUserRole === 'super_admin' || currentUserRole === 'kysutet_admin';

    // Default team: ưu tiên prefillTeam (từ activity) trước currentUserTeam
    const defaultTeam = report?.team || prefillTeam || currentUserTeam || selectedTeam || CONFIG.teams[0];


    // KIỂM TRA QUYỀN: Nếu không phải admin và prefillTeam là của đội khác → không cho phép
    if (!isAdmin && currentUserTeam && prefillTeam) {
        const normalizedUserTeam = normalizeTeamName(currentUserTeam);
        const normalizedPrefillTeam = normalizeTeamName(prefillTeam);
        if (normalizedUserTeam !== normalizedPrefillTeam) {
            showToast(`Bạn chỉ được tạo báo cáo cho đội "${normalizedUserTeam}"! Hoạt động này thuộc đội "${normalizedPrefillTeam}".`, 'warning');
            return;
        }
    }

    // Nếu không có team và không phải admin, báo lỗi
    if (!defaultTeam && !isAdmin) {
        showToast('Tài khoản của bạn chưa được gán đội hình. Vui lòng liên hệ BCH Trường!', 'warning');
        return;
    }

    // Get activities for this team to auto-fill content (normalize để so sánh chính xác)
    const normalizedDefaultTeam = normalizeTeamName(defaultTeam);
    const teamActivities = activities
        .filter(a => normalizeTeamName(a.team) === normalizedDefaultTeam)
        .sort((a, b) => b.date.localeCompare(a.date));

    // Mặc định: prefillActivityId, report.linkedActivityId (edit), hoặc tìm bằng date+team
    let defaultActivity = null;
    if (prefillActivityId) {
        // Tìm từ activities gốc để đảm bảo lấy đầy đủ participants
        defaultActivity = activities.find(a => a.id === prefillActivityId);
    } else if (isEdit && report?.linkedActivityId) {
        // Khi SỬA BÁO CÁO: lấy activity từ linkedActivityId của report
        defaultActivity = activities.find(a => a.id === report.linkedActivityId);
    } else if (isEdit && report?.date && report?.team) {
        // FALLBACK: Tìm activity bằng date + team (cho report cũ không có linkedActivityId)
        defaultActivity = activities.find(a =>
            a.date === report.date &&
            normalizeTeamName(a.team) === normalizeTeamName(report.team)
        );
        console.log('[Report] Fallback tìm bằng date+team:', report.date, report.team, '→', defaultActivity?.id);
    } else if (!isEdit && teamActivities.length > 0) {
        defaultActivity = teamActivities[0];
    }

    // Debug log
    console.log('[Report] isEdit:', isEdit, 'report:', report);
    console.log('[Report] defaultActivity:', defaultActivity?.id, 'title:', defaultActivity?.title, 'participants:', defaultActivity?.participants?.length);

    const activityOptions = teamActivities.map((a, i) => {
        // Ưu tiên: 1) report.linkedActivityId (edit), 2) prefillActivityId, 3) đầu tiên
        const isSelected = report?.linkedActivityId === a.id ||
            (prefillActivityId && a.id === prefillActivityId) ||
            (!isEdit && !prefillActivityId && i === 0);
        return `<option value="${a.id}" data-date="${a.date}" data-content="${a.content || ''}" ${isSelected ? 'selected' : ''}>
            ${formatDate(a.date, 'full')} - ${a.title || a.content || 'Hoạt động'}
        </option>`;
    }).join('');

    // Evidence links
    const evidenceLinks = (report?.evidence || []).join('\n');

    // Team select disabled nếu: edit mode HOẶC (có currentUserTeam VÀ không phải admin)
    const disableTeamSelect = isEdit || (currentUserTeam && !isAdmin);

    const modalHtml = `
        <div class="activity-modal active" id="report-modal">
            <div class="activity-modal-content" style="max-width:600px;">
                <div class="activity-modal-header" style="background:linear-gradient(135deg,#dc2626,#ef4444);">
                    <h3 style="color:white;"><i class="fa-solid fa-file-alt"></i> ${isEdit ? 'Sửa' : 'Thêm'} Báo cáo</h3>
                    <button class="close-btn" id="report-modal-close" style="color:white;">&times;</button>
                </div>
                <div class="activity-modal-body">
                    ${defaultActivity ? `
                    <!-- Thông tin hoạt động được chọn -->
                    <div style="background:#f0fdf4; padding:12px 15px; border-radius:8px; margin-bottom:15px; border:1px solid #86efac; position:relative;">
                        <button type="button" id="edit-linked-activity" data-activity-id="${defaultActivity.id}" 
                            style="position:absolute; top:8px; right:8px; background:#16a34a; color:white; border:none; border-radius:4px; padding:4px 8px; font-size:11px; cursor:pointer;"
                            title="Sửa hoạt động này">
                            <i class="fa-solid fa-pen"></i> Sửa
                        </button>
                        <h4 style="margin:0 0 8px 0; color:#16a34a; font-size:0.95rem;"><i class="fa-solid fa-calendar-check"></i> Hoạt động được báo cáo</h4>
                        <p style="margin:3px 0; font-size:1.1rem;"><strong style="color:#dc2626;">${defaultActivity.title || 'Chưa có tên'}</strong></p>
                        <p style="margin:3px 0; font-size:0.9rem; color:#374151;">
                            <i class="fa-solid fa-calendar"></i> ${formatDate(defaultActivity.date, 'full')} &nbsp;|&nbsp; 
                            <i class="fa-solid fa-clock"></i> ${defaultActivity.startTime || '?'} - ${defaultActivity.endTime || '?'}
                        </p>
                        <p style="margin:3px 0; font-size:0.9rem; color:#374151;">
                            <i class="fa-solid fa-location-dot"></i> ${defaultActivity.location || 'Chưa có địa điểm'}
                        </p>
                        ${defaultActivity.content ? `<p style="margin:5px 0 0 0; font-size:0.85rem; color:#6b7280; font-style:italic;">${defaultActivity.content.substring(0, 100)}${defaultActivity.content.length > 100 ? '...' : ''}</p>` : ''}
                    </div>
                    ` : ''}
                    <div class="form-row">
                        <div class="form-group">
                            <label>Đội hình ${!isAdmin && currentUserTeam ? '<small class="text-muted">(Đã được gán)</small>' : ''}</label>
                            <select id="report-team" ${disableTeamSelect ? 'disabled' : ''}>
                                ${CONFIG.teams.map(t => {
        // Normalize cả 2 về dạng tên đẹp để so sánh
        const normalizedDefault = normalizeTeamName(defaultTeam);
        const normalizedT = normalizeTeamName(t);
        const isSelected = (defaultTeam === t) || (normalizedDefault === normalizedT);
        return `<option value="${t}" ${isSelected ? 'selected' : ''}>${normalizedT}</option>`;
    }).join('')}
                            </select>
                            ${disableTeamSelect && !isEdit ? '<input type="hidden" id="report-team-hidden" value="' + defaultTeam + '">' : ''}
                        </div>
                        <div class="form-group">
                            <label>Báo cáo cho ngày <span class="required">*</span></label>
                            <input type="date" id="report-date" value="${report?.date || formatDate(new Date(), 'yyyy-mm-dd')}" required>
                        </div>
                    </div>
                    <!-- Danh sách chiến sĩ tham gia - GIỐNG MODAL HOẠT ĐỘNG -->
                    <div class="form-group">
                        <label>Danh sách tham gia thực tế</label>
                        <button type="button" class="btn btn-info btn-block" id="btn-report-participants-list" style="margin-top:5px;">
                            <i class="fa-solid fa-users"></i> 
                            Quản lý danh sách (<span id="report-participants-count">${defaultActivity?.participants?.length || 0}</span> chiến sĩ)
                        </button>
                        <input type="hidden" id="report-activity-id" value="${defaultActivity?.id || report?.linkedActivityId || ''}">
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Tổng giờ hoạt động</label>
                            <input type="text" id="report-total-hours" 
                                value="${defaultActivity ? calculateHours(defaultActivity.startTime, defaultActivity.endTime).toFixed(1) : (report?.totalHours || '0')} giờ" 
                                readonly style="background:#f3f4f6; font-weight:bold; font-size:16px;">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Nội dung báo cáo <small>(Kết quả, kinh phí, ý nghĩa, khó khăn, đề xuất...)</small></label>
                        <textarea id="report-content" rows="5" placeholder="- Kết quả thực hiện:
- Kinh phí thực hiện (nếu có):
- Số lượng người dân/thanh thiếu nhi tham gia/hưởng lợi:
- Thành tựu đáng ghi nhận:
- Ý nghĩa của hoạt động:
- Khó khăn, hạn chế gặp phải:
- Đề xuất, kiến nghị/tiếp cận:">${report?.reportContent || report?.summary || ''}</textarea>
                    </div>
                    <div class="form-group">
                        <label>Minh chứng <small>(Link Drive, Ảnh... mỗi link 1 dòng)</small></label>
                        <textarea id="report-evidence" rows="3" placeholder="Dán các đường link vào đây...">${evidenceLinks}</textarea>
                    </div>
                    
                    <!-- Custom Fields Section - CHỈ BCH Cấp trường mới thấy -->
                    ${isAdmin ? `
                    <div class="custom-fields-section">
                        <div class="custom-fields-header">
                            <label><i class="fa-solid fa-layer-group"></i> Mục bổ sung <small>(BCH Cấp trường tạo thêm)</small></label>
                            <button type="button" class="btn btn-sm btn-success" id="add-custom-field" title="Thêm mục mới">
                                <i class="fa-solid fa-plus"></i> Thêm mục
                            </button>
                        </div>
                        <div id="custom-fields-container">
                            ${(report?.customFields || []).map((cf, idx) => `
                                <div class="custom-field-item" data-index="${idx}">
                                    <div class="custom-field-row">
                                        <input type="text" class="custom-field-label" placeholder="Tên mục (VD: Kinh phí)" value="${cf.label || ''}">
                                        <button type="button" class="btn btn-sm btn-danger remove-custom-field" title="Xóa mục">
                                            <i class="fa-solid fa-times"></i>
                                        </button>
                                    </div>
                                    <textarea class="custom-field-value" placeholder="Nội dung..." rows="2">${cf.value || ''}</textarea>
                                </div>
                            `).join('')}
                        </div>
                        <p class="custom-fields-hint"><small><i class="fa-solid fa-info-circle"></i> Sử dụng nút "+" để thêm các mục thông tin chưa có sẵn trong form.</small></p>
                    </div>
                    ` : ''}
                </div>
                <div class="activity-modal-footer">
                    <button class="btn btn-secondary" id="report-cancel">Hủy bỏ</button>
                    <button class="btn btn-primary" id="report-save"><i class="fa-solid fa-arrow-right"></i> Lưu báo cáo</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const modal = document.getElementById('report-modal');
    const closeModal = () => modal.remove();

    document.getElementById('report-modal-close').addEventListener('click', closeModal);
    document.getElementById('report-cancel').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });


    // Nút Quản lý danh sách tham gia - GIỐNG MODAL HOẠT ĐỘNG
    document.getElementById('btn-report-participants-list')?.addEventListener('click', () => {
        // Lấy activityId từ hidden input (có thể từ defaultActivity hoặc report.linkedActivityId)
        const activityId = document.getElementById('report-activity-id')?.value;

        if (!activityId) {
            showToast('Chưa có hoạt động liên kết!', 'warning');
            return;
        }

        const activity = activities.find(a => a.id === activityId);
        if (activity) {
            // Lưu tempParticipants từ activity
            tempParticipants = activity.participants ? [...activity.participants] : [];
            // Mở modal quản lý danh sách
            openParticipantsModalForReport(activityId);
        } else {
            showToast('Không tìm thấy hoạt động trong danh sách!', 'error');
        }
    });

    // Nút Sửa hoạt động liên kết
    document.getElementById('edit-linked-activity')?.addEventListener('click', () => {
        const activityId = document.getElementById('edit-linked-activity').dataset.activityId;
        const activity = activities.find(a => a.id === activityId);
        if (activity) {
            closeModal(); // Đóng modal báo cáo
            openActivityModal(activity); // Mở modal sửa hoạt động
            showToast('Sau khi lưu, thông tin sẽ tự động cập nhật!', 'info');
        }
    });

    // Custom Fields: Add new field (CHỈ tồn tại cho admin)
    let customFieldIndex = (report?.customFields || []).length;
    document.getElementById('add-custom-field')?.addEventListener('click', () => {
        const container = document.getElementById('custom-fields-container');
        const newField = document.createElement('div');
        newField.className = 'custom-field-item';
        newField.dataset.index = customFieldIndex++;
        newField.innerHTML = `
            <div class="custom-field-row">
                <input type="text" class="custom-field-label" placeholder="Tên mục (VD: Kinh phí, Số lượng TNTN hưởng lợi...)">
                <button type="button" class="btn btn-sm btn-danger remove-custom-field" title="Xóa mục">
                    <i class="fa-solid fa-times"></i>
                </button>
            </div>
            <textarea class="custom-field-value" placeholder="Nội dung..." rows="2"></textarea>
        `;
        container.appendChild(newField);

        // Focus to the new field
        newField.querySelector('.custom-field-label').focus();

        // Add remove handler
        newField.querySelector('.remove-custom-field').addEventListener('click', () => {
            newField.remove();
        });
    });

    // Custom Fields: Remove existing fields
    document.querySelectorAll('.remove-custom-field').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.closest('.custom-field-item').remove();
        });
    });


    document.getElementById('report-save').addEventListener('click', async () => {
        const evidenceText = document.getElementById('report-evidence').value;
        const evidenceArray = evidenceText.split('\n').filter(line => line.trim() !== '');

        // Collect custom fields
        const customFields = [];
        document.querySelectorAll('#custom-fields-container .custom-field-item').forEach(item => {
            const label = item.querySelector('.custom-field-label').value.trim();
            const value = item.querySelector('.custom-field-value').value.trim();
            if (label || value) {
                customFields.push({ label, value });
            }
        });

        // Lấy team - ưu tiên hidden input nếu select bị disabled
        const teamHidden = document.getElementById('report-team-hidden');
        const teamSelect = document.getElementById('report-team');
        const selectedTeamValue = teamHidden ? teamHidden.value : teamSelect.value;

        // Lấy activityId từ hidden input (đã được set khi mở modal)
        const activityId = document.getElementById('report-activity-id')?.value ||
            document.getElementById('edit-linked-activity')?.dataset?.activityId || '';

        // Lấy số lượng thực tế từ activity (nếu có)
        const linkedActivity = activities.find(a => a.id === activityId);
        const participantsCount = linkedActivity?.participants?.length ||
            parseInt(document.getElementById('report-participants-count')?.textContent) || 0;

        const data = {
            team: selectedTeamValue,
            date: document.getElementById('report-date').value,
            participantsCount: participantsCount,
            totalHours: parseFloat(document.getElementById('report-total-hours')?.value) || 0,
            linkedActivityId: activityId, // Luôn lưu để lần sau không phải fallback
            reportContent: document.getElementById('report-content').value,
            evidence: evidenceArray,
            customFields: customFields,
            submitted: false,
            updatedAt: serverTimestamp(),
            updatedBy: auth.currentUser?.email || 'unknown'
        };

        if (!data.date) {
            showToast('Vui lòng chọn ngày báo cáo!', 'warning');
            return;
        }

        try {
            if (report?.id) {
                await updateDoc(doc(db, 'xtn_reports', report.id), data);
                await logAction('update', 'report', report.id, data);
            } else {
                data.createdAt = serverTimestamp();
                data.createdBy = auth.currentUser?.email || 'unknown';
                const docRef = await addDoc(collection(db, 'xtn_reports'), data);
                await logAction('create', 'report', docRef.id, data);
            }
            closeModal();
        } catch (error) {
            console.error('[Report] Save error:', error);
            showToast('Có lỗi khi lưu lịch trình!', 'error');
        }
    });
}

// Show report history modal
function showReportHistory(reportId) {
    const report = reports.find(r => r.id === reportId);
    if (!report) {
        showToast('Không tìm thấy báo cáo!', 'error');
        return;
    }

    // Tìm activity liên quan
    const linkedActivity = activities.find(a => a.id === report.linkedActivityId);

    document.getElementById('report-history-modal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'report-history-modal';
    modal.style.cssText = 'display:flex; position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:9999; align-items:center; justify-content:center;';

    const teamDisplay = normalizeTeamName(report.team);
    const dateDisplay = report.date ? formatDate(report.date, 'full') : 'N/A';
    const createdAt = report.createdAt ? new Date(report.createdAt.toDate()).toLocaleString('vi-VN') : 'N/A';
    const updatedAt = report.updatedAt ? new Date(report.updatedAt.toDate()).toLocaleString('vi-VN') : 'N/A';

    modal.innerHTML = `
        <div style="background:white; border-radius:16px; width:95%; max-width:600px; max-height:85vh; overflow:hidden; box-shadow:0 15px 50px rgba(0,0,0,0.25);">
            <div style="padding:18px 20px; background:linear-gradient(135deg, #0ea5e9, #38bdf8); display:flex; justify-content:space-between; align-items:center;">
                <h3 style="margin:0; font-size:1.1rem; color:white; font-weight:600;">
                    <i class="fa-solid fa-file-lines"></i> Chi tiết Báo cáo
                </h3>
                <button id="close-history-modal" style="background:rgba(255,255,255,0.2); border:none; width:30px; height:30px; border-radius:50%; font-size:1.2rem; cursor:pointer; color:white;">&times;</button>
            </div>
            <div style="padding:20px; overflow-y:auto; max-height:70vh;">
                <!-- Info rows -->
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:16px;">
                    <div style="background:#f0f9ff; padding:12px; border-radius:10px;">
                        <div style="font-size:0.8rem; color:#0369a1; margin-bottom:4px;"><i class="fa-solid fa-users"></i> Đội hình</div>
                        <div style="font-weight:600; color:#1e3a5f;">${teamDisplay}</div>
                    </div>
                    <div style="background:#f0fdf4; padding:12px; border-radius:10px;">
                        <div style="font-size:0.8rem; color:#16a34a; margin-bottom:4px;"><i class="fa-solid fa-calendar"></i> Ngày</div>
                        <div style="font-weight:600; color:#166534;">${dateDisplay}</div>
                    </div>
                </div>
                
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:16px;">
                    <div style="background:#fefce8; padding:12px; border-radius:10px;">
                        <div style="font-size:0.8rem; color:#a16207; margin-bottom:4px;"><i class="fa-solid fa-user-group"></i> Tham gia</div>
                        <div style="font-weight:600; color:#854d0e;">${report.participants || 'N/A'}</div>
                    </div>
                    <div style="background:#faf5ff; padding:12px; border-radius:10px;">
                        <div style="font-size:0.8rem; color:#7c3aed; margin-bottom:4px;"><i class="fa-solid fa-clock"></i> Thời gian tạo</div>
                        <div style="font-weight:600; color:#5b21b6; font-size:0.9rem;">${createdAt}</div>
                    </div>
                </div>
                
                <!-- Nội dung -->
                <div style="background:#f9fafb; padding:15px; border-radius:10px; margin-bottom:12px;">
                    <div style="font-size:0.85rem; color:#4b5563; margin-bottom:8px; font-weight:600;">
                        <i class="fa-solid fa-align-left"></i> Nội dung báo cáo
                    </div>
                    <p style="margin:0; color:#1f2937; white-space:pre-wrap;">${report.content || 'Không có nội dung'}</p>
                </div>
                
                ${report.evidence && report.evidence.length > 0 ? `
                    <div style="background:#fff7ed; padding:15px; border-radius:10px; margin-bottom:12px;">
                        <div style="font-size:0.85rem; color:#c2410c; margin-bottom:8px; font-weight:600;">
                            <i class="fa-solid fa-link"></i> Minh chứng (${report.evidence.length})
                        </div>
                        ${report.evidence.map((link, i) => `
                            <a href="${link}" target="_blank" style="display:block; color:#ea580c; font-size:0.9rem; margin-bottom:4px; word-break:break-all;">
                                ${i + 1}. ${link}
                            </a>
                        `).join('')}
                    </div>
                ` : ''}
                
                ${linkedActivity ? `
                    <div style="background:#ecfdf5; padding:15px; border-radius:10px; border:1px solid #86efac;">
                        <div style="font-size:0.85rem; color:#16a34a; margin-bottom:6px; font-weight:600;">
                            <i class="fa-solid fa-link"></i> Hoạt động liên kết
                        </div>
                        <p style="margin:0; color:#166534;">
                            ${linkedActivity.title || linkedActivity.content || 'Hoạt động'} 
                            <span style="color:#4ade80;">(${formatDate(linkedActivity.date, 'full')})</span>
                        </p>
                    </div>
                ` : ''}
                
                <!-- Meta info -->
                <div style="margin-top:16px; padding-top:12px; border-top:1px solid #e5e7eb; font-size:0.8rem; color:#9ca3af;">
                    <p style="margin:4px 0;"><strong>ID:</strong> ${reportId}</p>
                    <p style="margin:4px 0;"><strong>Người tạo:</strong> ${report.createdBy || 'N/A'}</p>
                    <p style="margin:4px 0;"><strong>Cập nhật lần cuối:</strong> ${updatedAt}</p>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector('#close-history-modal').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}

// ===== HISTORY FUNCTIONS =====
async function logAction(action, type, itemId, data) {
    try {
        await addDoc(collection(db, 'xtn_activity_logs'), {
            action,
            type,
            itemId,
            data: JSON.stringify(data),
            user: auth.currentUser?.email || 'unknown',
            timestamp: serverTimestamp()
        });
    } catch (error) {
        console.error('[Log] Error:', error);
    }
}

function renderHistory() {
    if (!elements.historyList) return;

    const searchQuery = elements.historySearch?.value?.toLowerCase() || '';
    const actionFilter = elements.historyActionFilter?.value || '';

    let filtered = [...historyLogs];

    if (actionFilter) {
        filtered = filtered.filter(log => log.action === actionFilter);
    }

    if (searchQuery) {
        filtered = filtered.filter(log => {
            const data = JSON.parse(log.data || '{}');
            return (
                log.user?.toLowerCase().includes(searchQuery) ||
                data.team?.toLowerCase().includes(searchQuery) ||
                data.content?.toLowerCase().includes(searchQuery)
            );
        });
    }

    if (filtered.length === 0) {
        elements.historyList.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-clock-rotate-left fa-3x"></i>
                <p>Chưa có lịch sử thay đổi.</p>
            </div>
        `;
        return;
    }

    elements.historyList.innerHTML = filtered.slice(0, 50).map(log => {
        const data = JSON.parse(log.data || '{}');
        const actionText = {
            create: 'Tạo mới',
            update: 'Cập nhật',
            delete: 'Xóa',
            login: 'Đăng nhập',
            section_view: 'Xem trang'
        }[log.action] || log.action || 'Thao tác';

        const typeText = {
            activity: 'hoạt động',
            report: 'báo cáo'
        }[log.type] || log.type || '';

        const timeStr = log.timestamp?.toDate?.()?.toLocaleString('vi-VN') || 'N/A';
        // Format user name - lấy phần trước @ nếu là email
        let userName = log.user || 'Ẩn danh';
        if (userName.includes('@')) {
            userName = userName.split('@')[0];
        }

        return `
            <div class="history-item">
                <div class="history-icon ${log.action || 'default'}">
                    <i class="fa-solid fa-${log.action === 'create' ? 'plus' : log.action === 'update' ? 'edit' : log.action === 'delete' ? 'trash' : log.action === 'login' ? 'right-to-bracket' : 'eye'}"></i>
                </div>
                <div class="history-content">
                    <strong>${userName}</strong> đã ${actionText.toLowerCase()} ${typeText}
                    <p>${data.team ? `Đội: ${normalizeTeamName(data.team)}` : ''} ${data.date ? `| Ngày: ${formatDate(data.date, 'full')}` : ''}</p>
                </div>
                <div class="history-time">${timeStr}</div>
            </div>
        `;
    }).join('');
}

// Export for use in dashboard.js
export default {
    init: initActivityModule,
    cleanup: cleanupActivityModule
};

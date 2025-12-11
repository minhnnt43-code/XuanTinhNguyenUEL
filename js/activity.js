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
let currentWeekStart = new Date(CONFIG.startDate);
let currentPage = 1;
let unsubscribeActivities = null;
let unsubscribeReports = null;
let unsubscribeLogs = null;
let isInitialized = false;
let currentUserTeam = null; // Team của user hiện tại (team_name)
let tempParticipants = []; // Danh sách tham gia tạm thời khi edit activity

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

// ===== LOAD TEAMS FROM FIREBASE =====
async function loadTeamsFromFirebase() {
    try {
        const teamsSnap = await getDocs(collection(db, 'xtn_teams'));
        CONFIG.teams = [];
        teamsSnap.forEach(doc => {
            const team = doc.data();
            CONFIG.teams.push(team.team_name || doc.id);
        });
        // Sắp xếp theo tên
        CONFIG.teams.sort((a, b) => a.localeCompare(b, 'vi'));
        console.log('[Activity] Loaded teams from Firebase:', CONFIG.teams.length);
    } catch (e) {
        console.warn('[Activity] Could not load teams from Firebase:', e);
        CONFIG.teams = ['Ban Chỉ huy', 'Đội hình 1', 'Đội hình 2'];
    }
}

// ===== INITIALIZATION =====
export async function initActivityModule() {
    // Prevent multiple initializations
    if (isInitialized) {
        console.log('[Activity] Already initialized, just refreshing calendar...');
        renderCalendar();
        return;
    }

    console.log('[Activity] Initializing module...');

    cacheElements();
    setupTabs();
    setupEventListeners();

    // Load đội hình từ Firebase
    await loadTeamsFromFirebase();

    // Load team của user hiện tại
    await loadCurrentUserTeam();

    populateTeamSelects();
    populateWeekSelects();

    // Set default date filter to last 1 week
    setDefaultDateFilters();

    subscribeToData();
    renderCalendar();

    isInitialized = true;
    console.log('[Activity] Module initialized successfully');
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
}

// Lấy team_name của user hiện tại từ xtn_teams
async function loadCurrentUserTeam() {
    try {
        if (!auth.currentUser) return;

        const userData = await getUserData(auth.currentUser.uid);
        if (userData && userData.team_id) {
            // Lấy team_name từ xtn_teams collection
            const teamsSnap = await getDocs(collection(db, 'xtn_teams'));
            teamsSnap.forEach(docSnap => {
                const team = docSnap.data();
                if (docSnap.id === userData.team_id || team.team_id === userData.team_id) {
                    currentUserTeam = team.team_name || docSnap.id;
                }
            });
            console.log('[Activity] Current user team:', currentUserTeam);
        }
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

    // Report
    elements.reportTeamSelect = document.getElementById('report-team-select');
    elements.btnNewReport = document.getElementById('btn-new-report');
    elements.reportsList = document.getElementById('reports-list');
    elements.reportSearch = document.getElementById('report-search');
    elements.reportDateFilter = document.getElementById('report-date-filter');

    // Export Report
    elements.exportDateFrom = document.getElementById('export-date-from');
    elements.exportDateTo = document.getElementById('export-date-to');
    elements.exportTeamSelect = document.getElementById('export-team-select');
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

    // Report
    elements.btnNewReport?.addEventListener('click', () => openReportModal());
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
        elements.reportTeamSelect
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
            renderCalendar();
            renderStats();
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
            renderReports();
        }, (error) => {
            console.error('[Activity] Reports subscription error:', error);
            reports = [];
            renderReports();
        });

        // Subscribe to activity logs (without orderBy to avoid index requirement)
        const logsRef = collection(db, 'xtn_activity_logs');
        unsubscribeLogs = onSnapshot(logsRef, (snapshot) => {
            historyLogs = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            // Sort client-side instead
            historyLogs.sort((a, b) => {
                const aTime = a.timestamp?.toMillis?.() || 0;
                const bTime = b.timestamp?.toMillis?.() || 0;
                return bTime - aTime;
            });
            renderHistory();
        }, (error) => {
            console.error('[Activity] Logs subscription error:', error);
            historyLogs = [];
            renderHistory();
        });

        console.log('[Activity] Subscribed to Firebase data');
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

    console.log('[Activity] renderCalendar - CONFIG.teams count:', CONFIG.teams.length);

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
        html += `
            <div class="calendar-header">
                ${getDayName(date)}<br>
                <small>${formatDate(date)}</small>
            </div>
        `;
    });

    // Team rows
    CONFIG.teams.forEach(team => {
        html += `<div class="calendar-team">${team}</div>`;

        weekDates.forEach(date => {
            const dateStr = formatDate(date, 'yyyy-mm-dd');
            const cellActivities = activities.filter(a =>
                a.date === dateStr && a.team === team
            );

            const classes = ['calendar-cell'];
            if (isToday(date)) classes.push('today');
            if (isWeekend(date)) classes.push('weekend');

            html += `
                <div class="${classes.join(' ')}" data-date="${dateStr}" data-team="${team}">
                    ${cellActivities.map(a => `
                        <div class="activity-card" data-id="${a.id}">
                            <span class="time">${a.startTime} - ${a.endTime}</span>
                            <span class="content">${a.content || ''}</span>
                        </div>
                    `).join('')}
                    <button class="cell-add-btn" title="Thêm hoạt động">
                        <i class="fa-solid fa-plus"></i>
                    </button>
                </div>
            `;
        });
    });

    elements.calendarGrid.innerHTML = html;

    // Add click handlers
    elements.calendarGrid.querySelectorAll('.activity-card').forEach(card => {
        card.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = card.dataset.id;
            const activity = activities.find(a => a.id === id);
            if (activity) openActivityModal(activity);
        });
    });

    // Click vào ô để thêm hoạt động (không cần nhấn nút +)
    elements.calendarGrid.querySelectorAll('.calendar-cell').forEach(cell => {
        cell.addEventListener('click', (e) => {
            // Không mở modal nếu click vào activity-card hoặc nút +
            if (e.target.closest('.activity-card') || e.target.closest('.cell-add-btn')) return;
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

// ===== ACTIVITY MODAL =====
function openActivityModal(activity = null, date = null, team = null) {
    // Remove existing modal
    document.getElementById('activity-modal')?.remove();

    const isEdit = !!activity;
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
                        <select id="modal-team" required>
                            <option value="">-- Chọn đội hình --</option>
                            ${CONFIG.teams.map(t => `
                                <option value="${t}" ${(activity?.team || team) === t ? 'selected' : ''}>${t}</option>
                            `).join('')}
                        </select>
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
                            <input type="time" id="modal-start-time" value="${activity?.startTime || '08:00'}" required>
                        </div>
                        <div class="form-group">
                            <label>Giờ kết thúc <span class="required">*</span></label>
                            <input type="time" id="modal-end-time" value="${activity?.endTime || '11:00'}" required>
                        </div>
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
                    <div class="form-group">
                        <label>Danh sách tham gia thực tế</label>
                        <button type="button" class="btn btn-info btn-block" id="btn-participants-list" style="margin-top:5px;">
                            <i class="fa-solid fa-users"></i> 
                            Quản lý danh sách (<span id="participants-count">${activity?.participants?.length || 0}</span> người)
                        </button>
                    </div>
                </div>
                <div class="activity-modal-footer">
                    ${isEdit ? `<button class="btn btn-danger" id="modal-delete"><i class="fa-solid fa-trash"></i> Xóa</button>` : ''}
                    <button class="btn btn-secondary" id="modal-cancel">Hủy</button>
                    <button class="btn btn-primary" id="modal-save"><i class="fa-solid fa-save"></i> ${isEdit ? 'Cập nhật' : 'Thêm mới'}</button>
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

    // Button danh sách tham gia
    document.getElementById('btn-participants-list')?.addEventListener('click', () => {
        openParticipantsModal();
    });

    document.getElementById('modal-save').addEventListener('click', async () => {
        await saveActivity(activity?.id);
        closeModal();
    });

    if (isEdit) {
        document.getElementById('modal-delete').addEventListener('click', async () => {
            if (confirm('Bạn có chắc chắn muốn xóa hoạt động này?')) {
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
        location: document.getElementById('modal-location').value,
        content: document.getElementById('modal-content').value,
        expectedParticipants: parseInt(document.getElementById('modal-participants').value) || 0,
        bchSuggestion: document.getElementById('modal-bch-suggestion').value || 'Không',
        participants: tempParticipants, // Danh sách tham gia thực tế
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.email || 'unknown'
    };

    if (!data.team || !data.date || !data.startTime || !data.endTime) {
        alert('Vui lòng điền đầy đủ thông tin bắt buộc!');
        return;
    }

    try {
        if (id) {
            // Update
            await updateDoc(doc(db, 'xtn_activities', id), data);
            await logAction('update', 'activity', id, data);
        } else {
            // Create
            data.createdAt = serverTimestamp();
            data.createdBy = auth.currentUser?.email || 'unknown';
            const docRef = await addDoc(collection(db, 'xtn_activities'), data);
            await logAction('create', 'activity', docRef.id, data);
        }
    } catch (error) {
        console.error('[Activity] Save error:', error);
        alert('Có lỗi xảy ra khi lưu hoạt động!');
    }
}

async function deleteActivity(id) {
    try {
        const activity = activities.find(a => a.id === id);
        await deleteDoc(doc(db, 'xtn_activities', id));
        await logAction('delete', 'activity', id, activity);
    } catch (error) {
        console.error('[Activity] Delete error:', error);
        alert('Có lỗi xảy ra khi xóa hoạt động!');
    }
}

// ===== PARTICIPANTS MODAL =====
function openParticipantsModal() {
    // Remove existing modal if any
    document.getElementById('participants-modal')?.remove();

    const modalHtml = `
        <div class="activity-modal active" id="participants-modal" style="z-index:10001;">
            <div class="activity-modal-content" style="max-width:800px;max-height:90vh;overflow-y:auto;">
                <div class="activity-modal-header">
                    <h3><i class="fa-solid fa-users"></i> Danh sách tham gia</h3>
                    <button class="close-btn" id="participants-close">&times;</button>
                </div>
                <div class="activity-modal-body">
                    <div style="margin-bottom:15px;">
                        <button class="btn btn-success btn-sm" id="btn-add-participant">
                            <i class="fa-solid fa-plus"></i> Thêm người
                        </button>
                        <span style="margin-left:15px;color:#666;">
                            Tổng: <strong id="total-participants">${tempParticipants.length}</strong> người
                        </span>
                    </div>
                    <div style="overflow-x:auto;">
                        <table class="data-table" style="min-width:100%;">
                            <thead>
                                <tr>
                                    <th style="width:40px;">STT</th>
                                    <th>Họ và Tên</th>
                                    <th>MSSV</th>
                                    <th>Đội hình</th>
                                    <th>Vai trò</th>
                                    <th style="width:80px;">Thao tác</th>
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

    // Attach event listeners for existing rows
    attachParticipantRowEvents();
}

function renderParticipantsRows() {
    if (tempParticipants.length === 0) {
        return '<tr><td colspan="6" style="text-align:center;color:#999;padding:20px;">Chưa có người tham gia</td></tr>';
    }

    return tempParticipants.map((p, i) => `
        <tr data-index="${i}">
            <td>${i + 1}</td>
            <td><input type="text" class="p-name" value="${p.name || ''}" placeholder="Họ và tên" style="width:100%;padding:5px;border:1px solid #ddd;border-radius:4px;"></td>
            <td><input type="text" class="p-mssv" value="${p.mssv || ''}" placeholder="MSSV" style="width:100%;padding:5px;border:1px solid #ddd;border-radius:4px;"></td>
            <td>
                <select class="p-team" style="width:100%;padding:5px;border:1px solid #ddd;border-radius:4px;">
                    <option value="">-- Chọn --</option>
                    ${CONFIG.teams.map(t => `<option value="${t}" ${p.team === t ? 'selected' : ''}>${t}</option>`).join('')}
                </select>
            </td>
            <td>
                <select class="p-role" style="width:100%;padding:5px;border:1px solid #ddd;border-radius:4px;">
                    <option value="Chiến sĩ" ${p.role === 'Chiến sĩ' || !p.role ? 'selected' : ''}>Chiến sĩ</option>
                    <option value="Đội trưởng" ${p.role === 'Đội trưởng' ? 'selected' : ''}>Đội trưởng</option>
                    <option value="Đội phó" ${p.role === 'Đội phó' ? 'selected' : ''}>Đội phó</option>
                    <option value="BCH" ${p.role === 'BCH' ? 'selected' : ''}>BCH</option>
                </select>
            </td>
            <td>
                <button class="btn-icon delete-participant" data-index="${i}" title="Xóa" style="color:#dc2626;">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function addParticipantRow() {
    tempParticipants.push({ name: '', mssv: '', team: '', role: 'Chiến sĩ' });
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
        row.querySelector('.p-team')?.addEventListener('change', (e) => {
            tempParticipants[index].team = e.target.value;
        });
        row.querySelector('.p-role')?.addEventListener('change', (e) => {
            tempParticipants[index].role = e.target.value;
        });
    });
}

// ===== STATS FUNCTIONS =====
function getFilteredActivities() {
    let filtered = [...activities];

    const teamFilter = elements.statsTeamFilter?.value;
    const dateFrom = elements.statsDateFrom?.value;
    const dateTo = elements.statsDateTo?.value;

    if (teamFilter) {
        filtered = filtered.filter(a => a.team === teamFilter);
    }

    if (dateFrom) {
        filtered = filtered.filter(a => a.date >= dateFrom);
    }

    if (dateTo) {
        filtered = filtered.filter(a => a.date <= dateTo);
    }

    return filtered.sort((a, b) => a.date.localeCompare(b.date));
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

    // Table
    renderStatsTable(filtered);
}

function renderStatsTable(data) {
    if (!elements.statsTbody) return;

    const start = (currentPage - 1) * CONFIG.itemsPerPage;
    const end = start + CONFIG.itemsPerPage;
    const pageData = data.slice(start, end);

    if (pageData.length === 0) {
        elements.statsTbody.innerHTML = `
            <tr><td colspan="10" style="text-align:center;padding:40px;color:#999;">
                Không có dữ liệu
            </td></tr>
        `;
    } else {
        elements.statsTbody.innerHTML = pageData.map((a, i) => {
            // Format updatedAt
            let updatedTime = '-';
            if (a.updatedAt) {
                const d = a.updatedAt.toDate ? a.updatedAt.toDate() : new Date(a.updatedAt);
                updatedTime = d.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
            }

            // BCH badge
            const bchBadge = a.bchSuggestion === 'Có'
                ? '<span class="badge badge-success" style="background:#d1fae5;color:#065f46;">Có</span>'
                : '<span class="badge" style="background:#f3f4f6;color:#6b7280;">Không</span>';

            return `
            <tr>
                <td>${start + i + 1}</td>
                <td>${formatDate(a.date, 'full')}</td>
                <td>${a.startTime} - ${a.endTime}</td>
                <td>${a.team}</td>
                <td>${a.location || '-'}</td>
                <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${a.content || ''}">${a.content || '-'}</td>
                <td>${bchBadge}</td>
                <td>${updatedTime}</td>
                <td style="font-size:12px;">${a.updatedBy || a.createdBy || '-'}</td>
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
                if (confirm('Xóa hoạt động này?')) {
                    await deleteActivity(btn.dataset.id);
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
        alert('Không có dữ liệu để xuất!');
        return;
    }

    const headers = ['STT', 'Ngày', 'Đội hình', 'Giờ BĐ', 'Giờ KT', 'Địa điểm', 'Nội dung', 'Số tham gia', 'Đề xuất BCH', 'Người cập nhật', 'TG Cập nhật'];
    const rows = filtered.map((a, i) => {
        let updatedTime = '';
        if (a.updatedAt) {
            const d = a.updatedAt.toDate ? a.updatedAt.toDate() : new Date(a.updatedAt);
            updatedTime = d.toLocaleString('vi-VN');
        }
        return [
            i + 1,
            formatDate(a.date, 'full'),
            a.team,
            a.startTime,
            a.endTime,
            a.location || '',
            a.content || '',
            a.expectedParticipants || 0,
            a.bchSuggestion || 'Không',
            a.updatedBy || a.createdBy || '',
            updatedTime
        ];
    });

    const csvContent = [headers, ...rows]
        .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `XTN2026_HoatDong_${formatDate(new Date(), 'yyyy-mm-dd')}.csv`;
    link.click();
}

// Export Reports to CSV
function exportReports() {
    const dateFrom = elements.exportDateFrom?.value || '';
    const dateTo = elements.exportDateTo?.value || '';
    const teamFilter = elements.exportTeamSelect?.value || '';

    let filtered = [...reports];

    // Filter by date range
    if (dateFrom) {
        filtered = filtered.filter(r => r.date >= dateFrom);
    }
    if (dateTo) {
        filtered = filtered.filter(r => r.date <= dateTo);
    }

    // Filter by team
    if (teamFilter) {
        filtered = filtered.filter(r => r.team === teamFilter);
    }

    if (filtered.length === 0) {
        alert('Không có báo cáo nào trong khoảng thời gian này!');
        return;
    }

    // Build CSV
    const headers = ['STT', 'Ngày', 'Đội hình', 'Số tham gia', 'Nội dung hoạt động', 'Nội dung báo cáo', 'Minh chứng', 'Người tạo', 'Ngày tạo'];
    const rows = filtered.map((r, i) => {
        const createdDate = r.createdAt?.toDate?.()?.toLocaleString('vi-VN') || '';
        const evidenceStr = (r.evidence || []).join(' | ');
        return [
            i + 1,
            r.date || '',
            r.team || '',
            r.participants || '',
            r.activityContent || '',
            r.reportContent || '',
            evidenceStr,
            r.createdBy || '',
            createdDate
        ];
    });

    const csvContent = [headers, ...rows]
        .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);

    const fileName = dateFrom && dateTo
        ? `XTN2026_BaoCao_${dateFrom}_${dateTo}.csv`
        : `XTN2026_BaoCao_${formatDate(new Date(), 'yyyy-mm-dd')}.csv`;
    link.download = fileName;
    link.click();

    alert(`Đã xuất ${filtered.length} báo cáo thành công!`);
}

// ===== REPORT FUNCTIONS =====
function renderReports() {
    if (!elements.reportsList) return;

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
        const reportDate = r.date || `Tuần ${r.week}`;
        const createdDate = r.createdAt?.toDate?.()?.toLocaleDateString('vi-VN') || 'N/A';

        return `
        <div class="report-card" data-id="${r.id}">
            <div class="report-card-header">
                <h4>${r.team} - ${reportDate}</h4>
                <div class="report-card-actions">
                    <button class="btn btn-sm btn-secondary btn-history" data-id="${r.id}" title="Lịch sử">
                        <i class="fa-solid fa-clock-rotate-left"></i> Lịch sử
                    </button>
                    <button class="btn btn-sm btn-warning btn-edit" data-id="${r.id}" title="Sửa">
                        <i class="fa-solid fa-edit"></i> Sửa
                    </button>
                    <button class="btn btn-sm btn-danger btn-delete" data-id="${r.id}" title="Xóa">
                        <i class="fa-solid fa-trash"></i> Xóa
                    </button>
                </div>
            </div>
            <div class="report-card-meta">
                <span><i class="fa-solid fa-users"></i> ${r.participants || 0} người</span>
                <span><i class="fa-solid fa-clock"></i> ${r.totalHours || 0} giờ</span>
                <span><i class="fa-solid fa-calendar"></i> ${createdDate}</span>
                <span class="status ${r.submitted ? 'submitted' : 'pending'}">
                    ${r.submitted ? 'Đã nộp' : 'Chưa nộp'}
                </span>
            </div>
            <div class="report-card-content">
                <p><strong>Nội dung:</strong> ${r.activityContent || r.summary || 'Chưa có nội dung'}</p>
                ${r.evidence && r.evidence.length > 0 ? `
                    <p><strong>Minh chứng:</strong> 
                        ${r.evidence.map((e, i) => `<a href="${e}" target="_blank" rel="noopener">Link ${i + 1}</a>`).join(', ')}
                    </p>
                ` : ''}
                ${r.customFields && r.customFields.length > 0 ? `
                    <div class="report-custom-fields">
                        <p><strong><i class="fa-solid fa-layer-group"></i> Mục bổ sung:</strong></p>
                        <ul class="custom-fields-list">
                            ${r.customFields.map(cf => `<li><strong>${cf.label}:</strong> ${cf.value}</li>`).join('')}
                        </ul>
                    </div>
                ` : ''}
            </div>
            <div class="report-card-footer">
                <small>Cập nhật bởi: ${r.updatedBy || r.createdBy || 'N/A'}</small>
            </div>
        </div>
    `;
    }).join('');

    // Edit buttons
    elements.reportsList.querySelectorAll('.btn-edit').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const report = reports.find(r => r.id === btn.dataset.id);
            if (report) openReportModal(report);
        });
    });

    // Delete buttons
    elements.reportsList.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (confirm('Xóa báo cáo này?')) {
                try {
                    await deleteDoc(doc(db, 'xtn_reports', btn.dataset.id));
                    await logAction('delete', 'report', btn.dataset.id, {});
                } catch (error) {
                    console.error('[Report] Delete error:', error);
                    alert('Có lỗi xảy ra!');
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

function openReportModal(report = null) {
    const selectedTeam = elements.reportTeamSelect?.value || '';

    if (!report && !selectedTeam) {
        alert('Vui lòng chọn đội hình trước!');
        return;
    }

    // Remove existing modal
    document.getElementById('report-modal')?.remove();

    const isEdit = !!report;
    const isAdmin = isSuperAdmin();

    // Default team: 1) report.team (khi edit), 2) currentUserTeam, 3) selectedTeam từ filter
    const defaultTeam = report?.team || currentUserTeam || selectedTeam || CONFIG.teams[0];

    // Nếu không có team và không phải admin, báo lỗi
    if (!defaultTeam && !isAdmin) {
        alert('Tài khoản của bạn chưa được gán đội hình. Vui lòng liên hệ BCH Trường!');
        return;
    }

    // Get activities for this team to auto-fill content (sắp xếp theo ngày gần nhất)
    const teamActivities = activities
        .filter(a => a.team === defaultTeam)
        .sort((a, b) => b.date.localeCompare(a.date)); // Sort descending (gần nhất trước)

    // Mặc định chọn hoạt động gần nhất nếu tạo mới
    const defaultActivity = !isEdit && teamActivities.length > 0 ? teamActivities[0] : null;

    const activityOptions = teamActivities.map((a, i) => {
        const isSelected = report?.linkedActivityId === a.id || (!isEdit && i === 0);
        return `<option value="${a.id}" data-date="${a.date}" data-content="${a.content || ''}" ${isSelected ? 'selected' : ''}>
            ${formatDate(a.date, 'full')} - ${a.content || 'Hoạt động'}
        </option>`;
    }).join('');

    // Evidence links
    const evidenceLinks = (report?.evidence || []).join('\n');

    // Team select disabled nếu: edit mode HOẶC (có currentUserTeam VÀ không phải admin)
    const disableTeamSelect = isEdit || (currentUserTeam && !isAdmin);

    const modalHtml = `
        <div class="activity-modal active" id="report-modal">
            <div class="activity-modal-content" style="max-width:600px;">
                <div class="activity-modal-header">
                    <h3><i class="fa-solid fa-file-alt"></i> ${isEdit ? 'Sửa' : 'Thêm'} Báo cáo mới</h3>
                    <button class="close-btn" id="report-modal-close">&times;</button>
                </div>
                <div class="activity-modal-body">
                    <div class="form-row">
                        <div class="form-group">
                            <label>Đội hình ${!isAdmin && currentUserTeam ? '<small class="text-muted">(Đã được gán)</small>' : ''}</label>
                            <select id="report-team" ${disableTeamSelect ? 'disabled' : ''}>
                                ${CONFIG.teams.map(t => `
                                    <option value="${t}" ${defaultTeam === t ? 'selected' : ''}>${t}</option>
                                `).join('')}
                            </select>
                            ${disableTeamSelect && !isEdit ? '<input type="hidden" id="report-team-hidden" value="' + defaultTeam + '">' : ''}
                        </div>
                        <div class="form-group">
                            <label>Báo cáo cho ngày <span class="required">*</span></label>
                            <input type="date" id="report-date" value="${report?.date || formatDate(new Date(), 'yyyy-mm-dd')}" required>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Số lượng chiến sĩ tham gia <span class="required">*</span></label>
                            <input type="text" id="report-participants" value="${report?.participants || ''}" placeholder="VD: 25/30 (tham gia/tổng số)">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Nội dung hoạt động <small>(sẽ tự động điền theo lịch)</small></label>
                        <select id="report-activity-select" style="margin-bottom:8px;">
                            <option value="">-- Chọn từ lịch hoạt động --</option>
                            ${activityOptions}
                        </select>
                        <textarea id="report-activity-content" placeholder="Chọn ngày để tự động điền nội dung đã đăng ký...">${report?.activityContent || ''}</textarea>
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
                    
                    <!-- Custom Fields Section - BCH Cấp trường có thể thêm mục mới -->
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

    // Auto-fill activity content when selecting from dropdown
    document.getElementById('report-activity-select').addEventListener('change', (e) => {
        if (e.target.value) {
            document.getElementById('report-activity-content').value = e.target.value;
        }
    });

    // Custom Fields: Add new field
    let customFieldIndex = (report?.customFields || []).length;
    document.getElementById('add-custom-field').addEventListener('click', () => {
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

        const data = {
            team: selectedTeamValue,
            date: document.getElementById('report-date').value,
            participants: document.getElementById('report-participants').value,
            linkedActivityId: document.getElementById('report-activity-select')?.value || '', // Liên kết hoạt động
            activityContent: document.getElementById('report-activity-content').value,
            reportContent: document.getElementById('report-content').value,
            evidence: evidenceArray,
            customFields: customFields,
            submitted: false,
            updatedAt: serverTimestamp(),
            updatedBy: auth.currentUser?.email || 'unknown'
        };

        if (!data.date || !data.participants) {
            alert('Vui lòng điền đầy đủ thông tin bắt buộc!');
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
            alert('Có lỗi xảy ra!');
        }
    });
}

// Show report history modal
function showReportHistory(reportId) {
    alert('Tính năng đang phát triển! Xem lịch sử báo cáo ID: ' + reportId);
    // TODO: Implement full history view
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
            delete: 'Xóa'
        }[log.action] || log.action;

        const typeText = {
            activity: 'hoạt động',
            report: 'báo cáo'
        }[log.type] || log.type;

        const timeStr = log.timestamp?.toDate?.()?.toLocaleString('vi-VN') || 'N/A';

        return `
            <div class="history-item">
                <div class="history-icon ${log.action}">
                    <i class="fa-solid fa-${log.action === 'create' ? 'plus' : log.action === 'update' ? 'edit' : 'trash'}"></i>
                </div>
                <div class="history-content">
                    <strong>${log.user}</strong> đã ${actionText.toLowerCase()} ${typeText}
                    <p>${data.team ? `Đội: ${data.team}` : ''} ${data.date ? `| Ngày: ${formatDate(data.date, 'full')}` : ''}</p>
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

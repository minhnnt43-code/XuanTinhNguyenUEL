/**
 * Dashboard Cards Admin Module
 * Quản trị thẻ chiến sĩ - tương tự MHX
 */

import { db } from './firebase.js';
import { collection, getDocs, query, where, deleteDoc, doc, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import STATIC_MEMBERS from './members-static.js';
// google-drive.js đã bị xóa

// ============================================================
// STATE
// ============================================================
let allCards = [];
let allMembers = [];
let teamsMap = {};
let currentView = 'table';  // Mặc định dạng bảng
let currentPage = 1;
let itemsPerPage = 24;
let searchTerm = '';
let filterTeam = '';
let filterStatus = '';
let filterCityCard = '';
let showAlertFn = null;
let showConfirmFn = null;
let selectedForMark = new Set(); // Track selected members for bulk marking

// Google Drive folders for each team
const TEAM_DRIVE_FOLDERS = {
    'ban-chi-huy-chien-dich': 'https://drive.google.com/drive/folders/15RZ5yVit5bT-9pqRvyVidEpMynHOM3_u?usp=drive_link',
    'xuan-tu-hao': 'https://drive.google.com/drive/folders/1ABHp32MTgC0n9KuAt4QmsGE3PKEagzqj?usp=drive_link',
    'xuan-ban-sac': 'https://drive.google.com/drive/folders/1HN86i9iP_VDpBkf8X9tJdXQsIBUBVlw0?usp=sharing',
    'xuan-se-chia': 'https://drive.google.com/drive/folders/1vn0nIeXi0QqjaoMqIeNvyOjS8faEfl1p?usp=drive_link',
    'xuan-gan-ket': 'https://drive.google.com/drive/folders/19wcheLmz2FxxCUvyulmdeNPUOQMvyc_N?usp=sharing',
    'xuan-chien-si': 'https://drive.google.com/drive/folders/1HROXFRAFA17kRP4P1VsJrdtJQBlb7NHf?usp=drive_link',
    'tet-van-minh': 'https://drive.google.com/drive/folders/1xrKAcPRAZJ-amIqNDEKt7ARZFONhpGIT?usp=drive_link',
    'tu-van-giang-day-phap-luat': 'https://drive.google.com/drive/folders/16Aca-AF3i9epFEt_pFD59Pqo_AlRumAB?usp=drive_link',
    'giai-dieu-mua-xuan': 'https://drive.google.com/drive/folders/1_H69b3P16TmIV3xIiMyaKIpl-zdVlpbj?usp=drive_link',
    'vien-chuc-tre': 'https://drive.google.com/drive/folders/1tgY3MC7wM5ZAdzhdYW5TilxcLoL6U6UY?usp=drive_link',
    'hau-can': 'https://drive.google.com/drive/folders/1iL1C-NLtCSUo1CD9KbbwNn-e9R4GYwQ5?usp=drive_link',
    'ky-su-tet': 'https://drive.google.com/drive/folders/14RTGgXSSppvF3MBORgrinSDNQif9yqHq?usp=drive_link'
};

// Current user data (passed from dashboard-core)
let currentUserData = null;

// ============================================================
// INIT
// ============================================================
export function initCardsAdmin() {
    console.log('[CardsAdmin] Initializing...');

    // Auto-filter for doihinh_admin - chỉ thấy đội của họ
    if (currentUserData && currentUserData.role === 'doihinh_admin' && currentUserData.team_id) {
        filterTeam = currentUserData.team_id;
        console.log('[CardsAdmin] Auto-filter for doihinh_admin:', filterTeam);

        // Ẩn dropdown chọn đội
        const teamFilter = document.getElementById('cards-filter-team');
        if (teamFilter) {
            teamFilter.style.display = 'none';
        }
    }

    loadCardsData();
    setupEventListeners();
}

export function setHelpers(alertFn, confirmFn) {
    showAlertFn = alertFn;
    showConfirmFn = confirmFn;
}

// Set current user data (called from dashboard-core)
export function setCurrentUser(userData) {
    currentUserData = userData;
    console.log('[CardsAdmin] User set:', userData?.name, '| Role:', userData?.role, '| Team:', userData?.team_id);
}

function setupEventListeners() {
    // Tabs
    document.querySelectorAll('.cards-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            currentView = tab.dataset.view;
            currentPage = 1;
            document.querySelectorAll('.cards-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById('cards-grid-view').classList.toggle('active', currentView === 'grid');
            document.getElementById('cards-table-view').classList.toggle('active', currentView === 'table');
            render();
        });
    });

    // Search
    document.getElementById('cards-search')?.addEventListener('input', (e) => {
        searchTerm = e.target.value.trim().toLowerCase();
        currentPage = 1;
        render();
    });

    // Filter Team
    document.getElementById('cards-filter-team')?.addEventListener('change', (e) => {
        filterTeam = e.target.value;
        currentPage = 1;
        render();
    });

    // Filter Status
    document.getElementById('cards-filter-status')?.addEventListener('change', (e) => {
        filterStatus = e.target.value;
        currentPage = 1;
        render();
    });

    // Filter City Card
    document.getElementById('cards-filter-city')?.addEventListener('change', (e) => {
        filterCityCard = e.target.value;
        currentPage = 1;
        render();
    });

    // Pagination
    document.getElementById('cards-prev-page')?.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            render();
        }
    });

    document.getElementById('cards-next-page')?.addEventListener('click', () => {
        const filtered = getFilteredData();
        const totalPages = Math.ceil(filtered.length / itemsPerPage);
        if (currentPage < totalPages) {
            currentPage++;
            render();
        }
    });

    // Export
    document.getElementById('btn-export-cards')?.addEventListener('click', exportToExcel);
}

// ============================================================
// DATA LOADING
// ============================================================
async function loadCardsData() {
    try {
        // Load teams
        const teamsSnap = await getDocs(collection(db, 'xtn_teams'));
        teamsMap = {};
        teamsSnap.forEach(d => {
            teamsMap[d.id] = d.data().team_name || d.id;
        });

        // Static mapping fallback (nếu xtn_teams rỗng hoặc thiếu)
        const STATIC_TEAM_MAP = {
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


        // Merge static vào teamsMap nếu chưa có
        Object.keys(STATIC_TEAM_MAP).forEach(id => {
            if (!teamsMap[id]) {
                teamsMap[id] = STATIC_TEAM_MAP[id];
            }
        });

        // Thứ tự đội hình chuẩn (same as dashboard-core.js)
        const TEAM_ORDER = {
            'ban-chi-huy-chien-dich': 0,
            'xuan-tu-hao': 1,
            'xuan-ban-sac': 2,
            'xuan-se-chia': 3,
            'xuan-gan-ket': 4,
            'xuan-chien-si': 5,
            'tet-van-minh': 6,
            'tu-van-giang-day-phap-luat': 7,
            'giai-dieu-mua-xuan': 8,
            'vien-chuc-tre': 9,
            'hau-can': 10,
            'ky-su-tet': 11
        };

        // Load team filter options - CHỈ DÙNG STATIC LIST để tránh duplicate
        const filterSelect = document.getElementById('cards-filter-team');
        if (filterSelect) {
            filterSelect.innerHTML = '<option value="">-- Tất cả đội --</option>';

            // Dùng STATIC_TEAM_MAP đã sắp xếp theo TEAM_ORDER
            Object.entries(STATIC_TEAM_MAP)
                .sort((a, b) => (TEAM_ORDER[a[0]] ?? 999) - (TEAM_ORDER[b[0]] ?? 999))
                .forEach(([id, name]) => {
                    filterSelect.innerHTML += `<option value="${id}">${name}</option>`;
                });
        }

        // Load registrations (để lấy preferred_team nếu team_id trống)
        const regsSnap = await getDocs(collection(db, 'xtn_registrations'));
        const regsMap = {};
        regsSnap.forEach(d => {
            const r = d.data();
            regsMap[r.user_id] = r;
        });

        // ⚠️ QUAN TRỌNG: Dùng STATIC_MEMBERS làm base, merge với Firebase
        // Giống hệt logic của dashboard-core.js để đảm bảo team_id được lấy từ static list
        console.log('[CardsAdmin] 📋 Loading from STATIC_MEMBERS:', STATIC_MEMBERS.length, 'records');

        // Create static map by email
        const staticMap = new Map();
        STATIC_MEMBERS.forEach(member => {
            if (member.email) {
                staticMap.set(member.email.toLowerCase().trim(), { ...member });
            }
        });

        // Get Firebase data for updates/deletions
        const allUsersSnap = await getDocs(collection(db, 'xtn_users'));
        const firebaseMap = new Map();
        const firebaseDeletes = new Set();

        allUsersSnap.forEach(d => {
            const data = d.data();
            const email = data.email?.toLowerCase().trim();
            if (!email) return;

            if (data.deleted) {
                firebaseDeletes.add(email);
                return;
            }

            // Skip pending
            if (data.role === 'pending') return;

            firebaseMap.set(email, { id: d.id, ...data });
        });

        // MERGE: Static base + Firebase updates - Firebase deletions
        allMembers = [];

        // Add static members (with Firebase updates if available)
        STATIC_MEMBERS.forEach(member => {
            const email = member.email?.toLowerCase().trim();
            if (!email || firebaseDeletes.has(email)) return;

            let finalMember;
            if (firebaseMap.has(email)) {
                // Use Firebase version (has updates)
                const fbData = firebaseMap.get(email);
                // Merge: Firebase data priority, but fallback to static for missing fields
                finalMember = {
                    id: fbData.id,
                    name: fbData.name || member.name || '',
                    mssv: fbData.mssv || member.mssv || '',
                    email: email,
                    team_id: fbData.team_id || member.team_id || '',
                    team_name: STATIC_TEAM_MAP[fbData.team_id || member.team_id] || teamsMap[fbData.team_id || member.team_id] || 'Chưa phân đội',
                    city_card_link: fbData.city_card_link || '',
                    role: fbData.role || member.role || 'member',
                    position: fbData.position || member.position || 'Chiến sĩ'
                };
                firebaseMap.delete(email); // Mark as processed
            } else {
                // Use static version
                finalMember = {
                    id: member.email, // Use email as ID for static-only members
                    name: member.name || '',
                    mssv: member.mssv || '',
                    email: email,
                    team_id: member.team_id || '',
                    team_name: STATIC_TEAM_MAP[member.team_id] || teamsMap[member.team_id] || 'Chưa phân đội',
                    city_card_link: '',
                    role: member.role || 'member',
                    position: member.position || 'Chiến sĩ'
                };
            }

            allMembers.push(finalMember);
        });

        // Add new members from Firebase only (not in static)
        firebaseMap.forEach((fbData, email) => {
            const teamId = fbData.team_id || '';
            allMembers.push({
                id: fbData.id,
                name: fbData.name || '',
                mssv: fbData.mssv || '',
                email: email,
                team_id: teamId,
                team_name: STATIC_TEAM_MAP[teamId] || teamsMap[teamId] || 'Chưa phân đội',
                city_card_link: fbData.city_card_link || '',
                role: fbData.role || 'member',
                position: fbData.position || 'Chiến sĩ'
            });
        });

        console.log('[CardsAdmin] ✅ Merged members:', allMembers.length);

        // Sắp xếp theo thứ tự đội hình + chức vụ (giống Danh sách Chiến sĩ)
        const positionOrder = {
            'Chỉ huy Trưởng': 1,
            'Chỉ huy Phó Thường trực': 2,
            'Chỉ huy Phó': 3,
            'Thành viên Thường trực Ban Chỉ huy': 4,
            'Thành viên Ban Chỉ huy': 5,
            'Đội trưởng': 6,
            'Đội phó': 7,
            'Chiến sĩ': 8
        };

        allMembers.sort((a, b) => {
            // 1. Theo đội hình
            const orderA = TEAM_ORDER[a.team_id] ?? 999;
            const orderB = TEAM_ORDER[b.team_id] ?? 999;
            if (orderA !== orderB) return orderA - orderB;

            // 2. Theo chức vụ
            const posA = positionOrder[a.position] ?? 99;
            const posB = positionOrder[b.position] ?? 99;
            if (posA !== posB) return posA - posB;

            // 3. Theo tên
            return (a.name || '').localeCompare(b.name || '', 'vi');
        });

        console.log('[CardsAdmin] Members loaded:', allMembers.length);
        console.log('[CardsAdmin] TeamsMap:', teamsMap);
        console.log('[CardsAdmin] Sample member team_id:', allMembers[0]?.team_id);

        // DEBUG: Dump chi tiết để so sánh
        window.debugCardsData = function () {
            console.log('=== DEBUG QUẢN TRỊ THẺ ===');
            console.log('Total members:', allMembers.length);
            console.log('All members:', allMembers);

            // Group by team
            const byTeam = {};
            allMembers.forEach(m => {
                const team = m.team_name || 'Chưa phân đội';
                if (!byTeam[team]) byTeam[team] = [];
                byTeam[team].push(m.name);
            });
            console.log('By team:', byTeam);

            // List BCH CD specifically
            const bchcd = allMembers.filter(m => m.team_name && m.team_name.includes('Chỉ huy'));
            console.log('BCH CD members:', bchcd.map(m => m.name));

            return { total: allMembers.length, byTeam, bchcd };
        };
        console.log('[CardsAdmin] Run debugCardsData() in console to see all data');
        if (allMembers.length > 0) {
            console.log('[CardsAdmin] Sample member:', allMembers[0]);
        }

        // Bây giờ mới setup onSnapshot cho cards (sau khi members đã load xong)
        if (window.cardsAdminUnsubscribe) {
            window.cardsAdminUnsubscribe();
        }
        window.cardsAdminUnsubscribe = onSnapshot(collection(db, 'xtn_cards'), (snapshot) => {
            allCards = [];
            snapshot.forEach(d => {
                allCards.push({ id: d.id, ...d.data() });
            });
            console.log('[CardsAdmin] Cards updated (real-time):', allCards.length);
            render();
        }, (error) => {
            console.error('[CardsAdmin] Cards listener error:', error);
        });
    } catch (error) {
        console.error('[CardsAdmin] Load error:', error);
        const tbody = document.getElementById('cards-table-body');
        if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:red;">Lỗi tải dữ liệu</td></tr>';
    }
}

// ============================================================
// FILTER & SEARCH
// ============================================================
function getFilteredData() {
    // Merge members with cards
    const cardsMap = {};
    allCards.forEach(card => {
        cardsMap[card.user_id] = card;
    });

    let data = allMembers.map(member => {
        const card = cardsMap[member.id] || null;
        return {
            ...member,
            card: card,
            hasCard: !!card,
            // city_card_link được lưu trong xtn_cards (từ saveCityCardLink)
            city_card_link: card?.city_card_link || member.city_card_link || ''
        };
    });

    // Filter by team
    if (filterTeam) {
        console.log('[CardsAdmin] Filtering by team:', filterTeam, '| Sample team_id:', data[0]?.team_id, '| Sample team_name:', data[0]?.team_name);
        // Check both team_id AND team_name to ensure correct filtering
        data = data.filter(d => d.team_id === filterTeam || d.team_name === filterTeam);
    }

    // Filter by status
    if (filterStatus === 'created') {
        data = data.filter(d => d.hasCard);
    } else if (filterStatus === 'not-created') {
        data = data.filter(d => !d.hasCard);
    }

    // Filter by city card
    if (filterCityCard === 'has-city') {
        data = data.filter(d => d.city_card_link && d.city_card_link.trim() !== '');
    } else if (filterCityCard === 'no-city') {
        data = data.filter(d => !d.city_card_link || d.city_card_link.trim() === '');
    }

    // Search
    if (searchTerm) {
        data = data.filter(d =>
            d.name.toLowerCase().includes(searchTerm) ||
            d.mssv.toLowerCase().includes(searchTerm) ||
            d.team_name.toLowerCase().includes(searchTerm)
        );
    }

    return data;
}

// ============================================================
// RENDER
// ============================================================
function render() {
    // Render team header if filtering by team
    renderTeamHeader();
    // Chỉ dùng table view (grid view đã bị xóa)
    renderTable();
    updatePagination();
}

// Render team-specific header with progress and Drive button
function renderTeamHeader() {
    const headerContainer = document.getElementById('team-cards-header');

    // Nếu không có container hoặc không lọc theo đội thì ẩn/xóa
    if (!headerContainer) return;

    if (!filterTeam) {
        headerContainer.innerHTML = '';
        headerContainer.style.display = 'none';
        return;
    }

    // Lấy data của team đang filter
    const allData = getFilteredData();
    const totalMembers = allData.length;
    const createdCards = allData.filter(d => d.hasCard).length;
    const pendingCards = totalMembers - createdCards;
    const progress = totalMembers > 0 ? Math.round((createdCards / totalMembers) * 100) : 0;

    // Team name mapping
    const TEAM_ID_TO_NAME = {
        'ban-chi-huy-chien-dich': 'Ban Chỉ huy Chiến dịch',
        'xuan-tu-hao': 'Đội hình Xuân tự hào',
        'xuan-ban-sac': 'Đội hình Xuân bản sắc',
        'xuan-se-chia': 'Đội hình Xuân sẻ chia',
        'xuan-gan-ket': 'Đội hình Xuân gắn kết',
        'xuan-chien-si': 'Đội hình Xuân chiến sĩ',
        'tet-van-minh': 'Đội hình Tết văn minh',
        'tu-van-giang-day-phap-luat': 'Đội hình Tư vấn và giảng dạy pháp luật',
        'giai-dieu-mua-xuan': 'Đội hình Giai điệu mùa xuân',
        'vien-chuc-tre': 'Đội hình Viên chức trẻ',
        'hau-can': 'Đội hình Hậu cần',
        'ky-su-tet': 'Đội hình Ký sự Tết'
    };

    const teamName = TEAM_ID_TO_NAME[filterTeam] || filterTeam;
    const driveLink = TEAM_DRIVE_FOLDERS[filterTeam] || '#';

    headerContainer.style.display = 'block';
    headerContainer.innerHTML = `
        <div class="team-cards-header">
            <h2><i class="fa-solid fa-users"></i> ${teamName}</h2>
            <p class="team-subtitle">Quản lý tiến độ tạo thẻ chiến sĩ</p>
            
            <div class="team-progress-wrapper">
                <div class="team-progress-info">
                    <span class="team-progress-label">Tiến độ tạo thẻ</span>
                    <span class="team-progress-count">${createdCards}/${totalMembers} (${progress}%)</span>
                </div>
                <div class="team-progress-bar">
                    <div class="team-progress-fill" style="width: ${progress}%"></div>
                </div>
            </div>
            
            <a href="${driveLink}" target="_blank" class="team-drive-btn">
                <i class="fa-brands fa-google-drive"></i>
                Mở thư mục Drive của đội
            </a>
        </div>
        
        <div class="team-stats-grid">
            <div class="team-stat-card">
                <div class="team-stat-icon total"><i class="fa-solid fa-users"></i></div>
                <div class="team-stat-number">${totalMembers}</div>
                <div class="team-stat-label">Tổng thành viên</div>
            </div>
            <div class="team-stat-card">
                <div class="team-stat-icon done"><i class="fa-solid fa-check-circle"></i></div>
                <div class="team-stat-number">${createdCards}</div>
                <div class="team-stat-label">Đã tạo thẻ</div>
            </div>
            <div class="team-stat-card">
                <div class="team-stat-icon pending"><i class="fa-solid fa-clock"></i></div>
                <div class="team-stat-number">${pendingCards}</div>
                <div class="team-stat-label">Chưa tạo</div>
            </div>
        </div>
    `;
}

function renderGrid() {
    const container = document.getElementById('cards-grid-container');
    if (!container) return;

    const filtered = getFilteredData();
    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    currentPage = Math.min(currentPage, totalPages || 1);

    const startIdx = (currentPage - 1) * itemsPerPage;
    const paged = filtered.slice(startIdx, startIdx + itemsPerPage);

    if (paged.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:#888;grid-column:1/-1;">Không có dữ liệu</p>';
        return;
    }

    container.innerHTML = paged.map(item => {
        if (item.hasCard) {
            const card = item.card;
            const thumbnail = card.thumbnail_url || `https://drive.google.com/thumbnail?id=${card.drive_file_id}&sz=w300`;
            return `
                <div class="card-item" data-card-id="${card.id}">
                    <div class="card-item-actions">
                        <button class="btn-card-delete" onclick="deleteCard('${card.id}', '${card.drive_file_id}')" title="Xóa thẻ">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                    <a href="${card.drive_link || '#'}" target="_blank">
                        <div class="card-item-image">
                            <img src="${thumbnail}" alt="${item.name}" loading="lazy">
                        </div>
                    </a>
                    <div class="card-item-info">
                        <h4>${item.name}</h4>
                        <p>${item.team_name}</p>
                        <div class="card-badges">
                            ${item.city_card_link ? '<span class="badge badge-info" title="Có Thẻ Cấp Thành"><i class="fa-solid fa-city"></i></span>' : '<span class="badge badge-secondary" title="Chưa có Thẻ Cấp Thành"><i class="fa-regular fa-city"></i></span>'}
                        </div>
                        <small>${formatDate(card.created_at)}</small>
                    </div>
                </div>
            `;
        } else {
            return `
                <div class="card-item card-item-empty">
                    <div class="card-item-image">
                        <div class="card-placeholder">
                            <i class="fa-solid fa-id-card"></i>
                            <span>Chưa tạo</span>
                        </div>
                    </div>
                    <div class="card-item-info">
                        <h4>${item.name}</h4>
                        <p>${item.team_name}</p>
                        <div class="card-badges">
                            ${item.city_card_link ? '<span class="badge badge-info" title="Có Thẻ Cấp Thành"><i class="fa-solid fa-city"></i></span>' : '<span class="badge badge-secondary" title="Chưa có Thẻ Cấp Thành"><i class="fa-regular fa-city"></i></span>'}
                        </div>
                    </div>
                </div>
            `;
        }
    }).join('');
}

function renderTable() {
    const tbody = document.getElementById('cards-table-body');
    if (!tbody) return;

    const filtered = getFilteredData();
    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    currentPage = Math.min(currentPage, totalPages || 1);

    const startIdx = (currentPage - 1) * itemsPerPage;
    const paged = filtered.slice(startIdx, startIdx + itemsPerPage);

    if (paged.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#888;">Không có dữ liệu</td></tr>';
        return;
    }

    tbody.innerHTML = paged.map((item, idx) => {
        const stt = startIdx + idx + 1;
        const statusBadge = item.hasCard
            ? '<span class="badge badge-success">Đã tạo</span>'
            : '<span class="badge badge-warning">Chưa tạo</span>';
        const cityBadge = item.city_card_link
            ? `<a href="${item.city_card_link}" target="_blank" class="badge badge-info" title="Xem Thẻ Cấp Thành"><i class="fa-solid fa-external-link"></i> Có</a>`
            : '<span class="badge badge-secondary">Chưa có</span>';
        const createdAt = item.card ? formatDate(item.card.created_at) : '-';

        // Checkbox for bulk selection (only for those without card)
        const checkboxCell = !item.hasCard
            ? `<input type="checkbox" class="bulk-mark-checkbox" data-id="${item.id}" data-name="${item.name}" data-email="${item.email || ''}" data-team="${item.team_id || ''}" onchange="toggleBulkMarkSelection(this)" ${selectedForMark.has(item.id) ? 'checked' : ''}>`
            : '';

        // Actions with manual mark button for those without card
        let actions = '';
        if (item.hasCard) {
            actions = `<a href="${item.card.drive_link || '#'}" target="_blank" class="btn btn-sm btn-secondary" title="Xem thẻ"><i class="fa-solid fa-eye"></i></a>
               <button class="btn btn-sm btn-danger" onclick="deleteCard('${item.card.id}', '${item.card.drive_file_id}')" title="Xóa thẻ"><i class="fa-solid fa-trash"></i></button>`;
        } else {
            // Button to manually mark as created
            actions = `<button class="btn btn-sm btn-success" onclick="manualMarkCardCreated('${item.id}', '${item.name}', '${item.email}', '${item.team_id}')" title="Đánh dấu đã tạo thẻ">
                <i class="fa-solid fa-check"></i>
            </button>`;
        }

        // Team color badge giống Danh sách Chiến sĩ
        const teamColor = getTeamColor(item.team_id);

        // BACKUP: Map team_id to name if team_name is missing or still showing ID
        const TEAM_ID_TO_NAME = {
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

        const displayTeamName = TEAM_ID_TO_NAME[item.team_id] || item.team_name || 'Chưa phân đội';
        const teamBadge = `<span class="badge" style="background:${teamColor}; color:white; padding:4px 10px; border-radius:12px; font-size:12px; white-space:nowrap;">${displayTeamName}</span>`;

        return `<tr>
            <td>${checkboxCell} ${stt}</td>
            <td><strong>${item.name}</strong></td>
            <td>${item.mssv || '-'}</td>
            <td>${teamBadge}</td>
            <td>${statusBadge}</td>
            <td>${cityBadge}</td>
            <td>${createdAt}</td>
            <td>${actions}</td>
        </tr>`;
    }).join('');
}

function updatePagination() {
    const filtered = getFilteredData();
    const totalPages = Math.ceil(filtered.length / itemsPerPage) || 1;

    document.getElementById('cards-page-info').textContent = `Trang ${currentPage} / ${totalPages}`;
    document.getElementById('cards-prev-page').disabled = currentPage <= 1;
    document.getElementById('cards-next-page').disabled = currentPage >= totalPages;
}

// ============================================================
// MANUAL MARK CARD CREATED
// ============================================================
window.manualMarkCardCreated = async function (userId, name, email, teamId) {
    // Custom styled confirm dialog
    const result = await Swal.fire({
        title: 'Xác nhận',
        html: `<div style="font-size: 1.1rem; color: #374151; margin: 16px 0;">
                 Đánh dấu <strong style="color: #00723F;">${name}</strong> đã tạo thẻ?
               </div>`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: '<i class="fa-solid fa-check"></i> Đồng ý',
        cancelButtonText: '<i class="fa-solid fa-times"></i> Hủy',
        confirmButtonColor: '#00723F',
        cancelButtonColor: '#6b7280',
        reverseButtons: true,
        customClass: {
            popup: 'swal-custom-popup',
            title: 'swal-custom-title',
            htmlContainer: 'swal-custom-html',
            confirmButton: 'swal-custom-confirm',
            cancelButton: 'swal-custom-cancel'
        },
        buttonsStyling: true,
        width: '450px',
        padding: '2rem'
    });

    if (!result.isConfirmed) return;

    try {
        // Create card record in xtn_cards
        const { setDoc, doc, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");

        await setDoc(doc(db, 'xtn_cards', userId), {
            user_id: userId,
            email: email || '',
            name: name || '',
            team_id: teamId || '',
            confirmed: true,
            confirmed_at: serverTimestamp(),
            manual_mark: true,  // Flag to indicate this was manually marked
            created_at: serverTimestamp(),
            source: 'manual_admin_mark'
        });

        console.log('[CardsAdmin] Manually marked as created:', userId, name);

        if (showAlertFn) {
            await showAlertFn(`Đã đánh dấu "${name}" tạo thẻ thành công!`, 'success', 'Hoàn thành');
        } else if (window.showToast) {
            window.showToast(`Đã đánh dấu "${name}" tạo thẻ!`, 'success');
        }

        // Refresh data
        await loadCardsData();
    } catch (error) {
        console.error('[CardsAdmin] Manual mark error:', error);
        if (showAlertFn) {
            await showAlertFn('Có lỗi xảy ra: ' + error.message, 'error', 'Lỗi');
        } else if (window.showToast) {
            window.showToast('Lỗi: ' + error.message, 'error');
        }
    }
};

// ============================================================
// BULK MARK FUNCTIONS
// ============================================================
window.toggleBulkMarkSelection = function (checkbox) {
    const id = checkbox.dataset.id;
    const name = checkbox.dataset.name;
    const email = checkbox.dataset.email;
    const team = checkbox.dataset.team;

    if (checkbox.checked) {
        selectedForMark.add(id);
    } else {
        selectedForMark.delete(id);
    }

    // Update bulk action button visibility
    updateBulkActionButton();
};

window.selectAllForMark = function (selectAll) {
    const checkboxes = document.querySelectorAll('.bulk-mark-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = selectAll;
        if (selectAll) {
            selectedForMark.add(cb.dataset.id);
        } else {
            selectedForMark.delete(cb.dataset.id);
        }
    });
    updateBulkActionButton();
};

function updateBulkActionButton() {
    let btn = document.getElementById('btn-bulk-mark');
    if (!btn) {
        // Create button if not exists
        const toolbar = document.querySelector('#section-cards-admin .section-header');
        if (toolbar) {
            btn = document.createElement('button');
            btn.id = 'btn-bulk-mark';
            btn.className = 'btn btn-success';
            btn.style.cssText = 'margin-left: 10px; display: none;';
            btn.innerHTML = '<i class="fa-solid fa-check-double"></i> Đánh dấu đã chọn (<span id="bulk-mark-count">0</span>)';
            btn.onclick = bulkMarkCardsCreated;
            toolbar.appendChild(btn);
        }
    }

    if (btn) {
        const count = selectedForMark.size;
        btn.style.display = count > 0 ? 'inline-block' : 'none';
        const countSpan = document.getElementById('bulk-mark-count');
        if (countSpan) countSpan.textContent = count;
    }
}

async function bulkMarkCardsCreated() {
    if (selectedForMark.size === 0) return;

    const count = selectedForMark.size;

    // Custom styled confirm dialog for bulk mark
    const result = await Swal.fire({
        title: 'Xác nhận',
        html: `<div style="font-size: 1.1rem; color: #374151; margin: 16px 0;">
                 Đánh dấu <strong style="color: #00723F;">${count} người</strong> đã tạo thẻ?
               </div>`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: `<i class="fa-solid fa-check-double"></i> Đồng ý (${count})`,
        cancelButtonText: '<i class="fa-solid fa-times"></i> Hủy',
        confirmButtonColor: '#00723F',
        cancelButtonColor: '#6b7280',
        reverseButtons: true,
        customClass: {
            popup: 'swal-custom-popup',
            title: 'swal-custom-title',
            htmlContainer: 'swal-custom-html',
            confirmButton: 'swal-custom-confirm',
            cancelButton: 'swal-custom-cancel'
        },
        buttonsStyling: true,
        width: '450px',
        padding: '2rem'
    });

    if (!result.isConfirmed) return;

    try {
        const { setDoc, doc, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");

        // Get all checkbox data
        const checkboxes = document.querySelectorAll('.bulk-mark-checkbox:checked');
        let successCount = 0;

        for (const cb of checkboxes) {
            const userId = cb.dataset.id;
            const name = cb.dataset.name;
            const email = cb.dataset.email;
            const teamId = cb.dataset.team;

            try {
                await setDoc(doc(db, 'xtn_cards', userId), {
                    user_id: userId,
                    email: email || '',
                    name: name || '',
                    team_id: teamId || '',
                    confirmed: true,
                    confirmed_at: serverTimestamp(),
                    manual_mark: true,
                    created_at: serverTimestamp(),
                    source: 'bulk_admin_mark'
                });
                successCount++;
                console.log(`✅ Marked: ${name}`);
            } catch (err) {
                console.error(`❌ Error marking ${name}:`, err);
            }
        }

        // Clear selection
        selectedForMark.clear();

        if (showAlertFn) {
            await showAlertFn(`Đã đánh dấu ${successCount}/${count} người thành công!`, 'success', 'Hoàn thành');
        } else if (window.showToast) {
            window.showToast(`Đã đánh dấu ${successCount} người!`, 'success');
        }

        // Refresh data
        await loadCardsData();
    } catch (error) {
        console.error('[CardsAdmin] Bulk mark error:', error);
        if (showAlertFn) {
            await showAlertFn('Có lỗi xảy ra: ' + error.message, 'error', 'Lỗi');
        }
    }
}

// ============================================================
// DELETE CARD
// ============================================================
window.deleteCard = async function (cardId, driveFileId) {
    const confirmed = showConfirmFn
        ? await showConfirmFn('Xóa thẻ này?', 'Xác nhận xóa')
        : await showConfirmModal('Xóa thẻ này?', { title: 'Xác nhận xóa', type: 'danger', confirmText: 'Xóa' });

    if (!confirmed) return;

    try {
        // Delete from Firestore
        await deleteDoc(doc(db, 'xtn_cards', cardId));

        // Delete from Drive - ĐÃ BỎ TÍNH NĂNG
        // if (driveFileId) {
        //     try {
        //         await deleteFileFromDrive(driveFileId);
        //     } catch (e) {
        //         console.warn('[CardsAdmin] Could not delete from Drive:', e);
        //     }
        // }

        // Refresh
        await loadCardsData();

        if (showAlertFn) {
            await showAlertFn('Đã xóa thẻ!', 'success', 'Hoàn thành');
        }
    } catch (error) {
        console.error('[CardsAdmin] Delete error:', error);
        if (showAlertFn) {
            await showAlertFn('Lỗi xóa thẻ!', 'error', 'Lỗi');
        }
    }
};

// ============================================================
// EXPORT EXCEL
// ============================================================
async function exportToExcel() {
    try {
        // Load SheetJS if not loaded
        if (!window.XLSX) {
            await loadScript('https://cdn.jsdelivr.net/npm/xlsx/dist/xlsx.full.min.js');
        }

        const data = getFilteredData();
        const exportData = data.map((item, idx) => ({
            'STT': idx + 1,
            'Họ và Tên': item.name,
            'MSSV': item.mssv || '',
            'Đội hình': item.team_name,
            'Trạng thái Thẻ': item.hasCard ? 'Đã tạo' : 'Chưa tạo',
            'Link Thẻ Cấp Thành': item.city_card_link || '',
            'Trạng thái Cấp Thành': item.city_card_link ? 'Có' : 'Chưa có',
            'Thời gian tạo': item.card ? formatDate(item.card.created_at) : ''
        }));

        const worksheet = XLSX.utils.json_to_sheet(exportData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Thống kê thẻ');
        XLSX.writeFile(workbook, `ThongKe_TheChienSi_${new Date().toISOString().slice(0, 10)}.xlsx`);

        if (showAlertFn) {
            await showAlertFn('Xuất Excel thành công!', 'success', 'Hoàn thành');
        }
    } catch (error) {
        console.error('[CardsAdmin] Export error:', error);
        if (showAlertFn) {
            await showAlertFn('Lỗi xuất Excel!', 'error', 'Lỗi');
        }
    }
}

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

// ============================================================
// UTILITIES
// ============================================================
function formatDate(timestamp) {
    if (!timestamp) return '-';
    let date;
    if (timestamp.toDate) {
        date = timestamp.toDate();
    } else if (typeof timestamp === 'string') {
        date = new Date(timestamp);
    } else {
        date = timestamp;
    }
    return date.toLocaleString('vi-VN');
}

// Team color generator (giống Danh sách Chiến sĩ)
function getTeamColor(teamId) {
    if (!teamId) return '#6b7280';  // Gray for no team

    const colors = [
        '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b',
        '#10b981', '#06b6d4', '#6366f1', '#84cc16',
        '#f43f5e', '#14b8a6', '#a855f7', '#eab308'
    ];

    // Simple hash
    let hash = 0;
    for (let i = 0; i < teamId.length; i++) {
        hash = teamId.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
}

// ============================================================
// CLEAR ALL CARDS
// ============================================================
window.clearAllCards = async function () {
    const confirmed = showConfirmFn
        ? await showConfirmFn('XÓA TẤT CẢ THẺ? Không thể khôi phục!', 'Xác nhận xóa tất cả')
        : await showConfirmModal('XÓA TẤT CẢ THẺ? Không thể khôi phục!', { title: 'Xác nhận xóa tất cả', type: 'danger', confirmText: 'Xóa tất cả' });

    if (!confirmed) return;

    try {
        const cardsSnap = await getDocs(collection(db, 'xtn_cards'));

        if (cardsSnap.empty) {
            if (showAlertFn) showAlertFn('Không có thẻ nào để xóa!', 'info', 'Thông báo');
            else showToast('Không có thẻ nào để xóa!', 'info');
            return;
        }

        let count = 0;
        const deletePromises = [];
        cardsSnap.forEach(docSnap => {
            deletePromises.push(deleteDoc(doc(db, 'xtn_cards', docSnap.id)));
            count++;
        });

        await Promise.all(deletePromises);

        console.log('[CardsAdmin] Deleted all cards:', count);
        if (showAlertFn) showAlertFn(`Đã xóa ${count} thẻ thành công!`, 'success', 'Thành công');
        else showToast(`Đã xóa ${count} thẻ thành công!`, 'success');

        // Reload data
        loadCardsData();
    } catch (error) {
        console.error('[CardsAdmin] Clear all error:', error);
        if (showAlertFn) showAlertFn('Lỗi: ' + error.message, 'error', 'Lỗi');
        else showToast('Lỗi: ' + error.message, 'error');
    }
};

// ============================================================
// EXPORTS
// ============================================================
export { loadCardsData };

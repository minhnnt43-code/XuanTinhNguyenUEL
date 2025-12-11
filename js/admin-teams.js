/**
 * admin-teams.js - Quản lý Đội hình
 * XTN 2026
 */

import { db } from './firebase.js';
import { collection, getDocs, doc, setDoc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Danh sách 20 đội hình mặc định
const DEFAULT_TEAMS = [
    { id: 'doi-1', name: 'Đội hình 1' },
    { id: 'doi-2', name: 'Đội hình 2' },
    { id: 'doi-3', name: 'Đội hình 3' },
    { id: 'doi-4', name: 'Đội hình 4' },
    { id: 'doi-5', name: 'Đội hình 5' },
    { id: 'doi-6', name: 'Đội hình 6' },
    { id: 'doi-7', name: 'Đội hình 7' },
    { id: 'doi-8', name: 'Đội hình 8' },
    { id: 'doi-9', name: 'Đội hình 9' },
    { id: 'doi-10', name: 'Đội hình 10' },
    { id: 'doi-11', name: 'Đội hình 11' },
    { id: 'doi-12', name: 'Đội hình 12' },
    { id: 'doi-13', name: 'Đội hình 13' },
    { id: 'doi-14', name: 'Đội hình 14' },
    { id: 'doi-15', name: 'Đội hình 15' },
    { id: 'doi-16', name: 'Đội hình 16' },
    { id: 'doi-17', name: 'Đội hình 17' },
    { id: 'doi-18', name: 'Đội hình 18' },
    { id: 'doi-19', name: 'Đội hình 19' },
    { id: 'doi-20', name: 'Đội hình 20' }
];

// Khởi tạo 20 đội hình (chỉ chạy 1 lần)
export async function initializeTeams() {
    for (const team of DEFAULT_TEAMS) {
        await setDoc(doc(db, 'xtn_teams', team.id), {
            team_id: team.id,
            team_name: team.name,
            admins: {
                truong: null,
                pho_1: null,
                pho_2: null
            },
            members: [],
            stats: {
                total_members: 0,
                registered_cards: 0
            },
            created_at: new Date().toISOString()
        }, { merge: true });
    }
    console.log('✅ Đã khởi tạo 20 đội hình!');
}

// Lấy danh sách đội
export async function getTeams() {
    const snapshot = await getDocs(collection(db, 'xtn_teams'));
    const teams = [];
    snapshot.forEach(doc => {
        teams.push({ id: doc.id, ...doc.data() });
    });
    return teams.sort((a, b) => {
        const numA = parseInt(a.team_id.replace('doi-', ''));
        const numB = parseInt(b.team_id.replace('doi-', ''));
        return numA - numB;
    });
}

// Cập nhật đội
export async function updateTeam(teamId, data) {
    await updateDoc(doc(db, 'xtn_teams', teamId), data);
}

// Phân công BCH đội
export async function assignTeamAdmin(teamId, position, userId) {
    const updateData = {};
    updateData[`admins.${position}`] = userId;
    await updateDoc(doc(db, 'xtn_teams', teamId), updateData);

    // Cập nhật role của user
    await updateDoc(doc(db, 'xtn_users', userId), {
        role: 'doihinh_admin',
        team_id: teamId,
        team_position: position
    });
}

// Thêm chiến sĩ vào đội
export async function addMemberToTeam(teamId, userId) {
    await updateDoc(doc(db, 'xtn_users', userId), {
        team_id: teamId
    });
}

// Render danh sách đội
export async function renderTeamsTable() {
    const teams = await getTeams();

    let html = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Đội</th>
                    <th>Tên đội</th>
                    <th>Đội trưởng</th>
                    <th>Số chiến sĩ</th>
                    <th>Thao tác</th>
                </tr>
            </thead>
            <tbody>
    `;

    for (const team of teams) {
        html += `
            <tr>
                <td>${team.team_id}</td>
                <td>${team.team_name}</td>
                <td>${team.admins?.truong || '(Chưa có)'}</td>
                <td>${team.stats?.total_members || 0}</td>
                <td>
                    <button class="btn btn-sm btn-secondary" onclick="editTeam('${team.team_id}')">
                        <i class="fa-solid fa-edit"></i>
                    </button>
                </td>
            </tr>
        `;
    }

    html += '</tbody></table>';
    return html;
}

// Export for global access
window.initializeTeams = initializeTeams;

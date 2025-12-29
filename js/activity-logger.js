/**
 * activity-logger.js - Lightweight Activity Logging System
 * XTN 2026
 * 
 * Ghi log hoạt động người dùng - Tiết kiệm nhất
 * - Không track IP
 * - Không detect DevTools
 * - Retention: 90 ngày
 * - Chỉ super_admin xem được
 */

import { db, auth } from './firebase.js';
import { collection, addDoc, serverTimestamp, query, where, getDocs, deleteDoc, doc, orderBy, limit, startAfter, Timestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ============================================================
// CONSTANTS
// ============================================================
const COLLECTION_NAME = 'xtn_activity_logs';
const RETENTION_DAYS = 90;

// Action types - chỉ track những gì quan trọng
export const ACTION_TYPES = {
    // Auth
    LOGIN: 'login',
    LOGOUT: 'logout',

    // Navigation
    SECTION_VIEW: 'section_view',

    // Search
    SEARCH: 'search',

    // CRUD
    CREATE: 'create',
    UPDATE: 'update',
    DELETE: 'delete',

    // Data
    EXPORT: 'export',
    IMPORT: 'import'
};

// Target types
export const TARGETS = {
    USER: 'user',
    TEAM: 'team',
    ACTIVITY: 'activity',
    REPORT: 'report',
    CARD: 'card',
    REGISTRATION: 'registration',
    QUESTION: 'question',
    GALLERY: 'gallery',
    MESSAGE: 'message'
};

// Session ID - tạo 1 lần khi load page
let sessionId = null;

// ============================================================
// HELPER FUNCTIONS
// ============================================================
function getSessionId() {
    if (!sessionId) {
        sessionId = 'sess_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
    }
    return sessionId;
}

function getDeviceType() {
    const ua = navigator.userAgent;
    if (/mobile/i.test(ua)) return 'mobile';
    if (/tablet/i.test(ua)) return 'tablet';
    return 'desktop';
}

// ============================================================
// MAIN LOGGING FUNCTION
// ============================================================
/**
 * Log an activity
 * @param {string} action - Action type từ ACTION_TYPES
 * @param {string} target - Target type từ TARGETS (optional)
 * @param {object} details - Chi tiết bổ sung (tối giản)
 */
export async function logActivity(action, target = null, details = null) {
    try {
        const user = auth.currentUser;

        // Không log nếu không có user (trừ search công khai)
        const isPublicAction = action === ACTION_TYPES.SEARCH && !user;

        // Tạo log entry tối giản
        const logEntry = {
            // User info - chỉ những gì cần thiết
            uid: user?.uid || 'anonymous',
            email: user?.email || null,

            // Action
            action: action,
            target: target,

            // Details - giới hạn size
            details: details ? JSON.stringify(details).substring(0, 500) : null,

            // Meta - tối giản
            device: getDeviceType(),
            session: getSessionId(),

            // Timestamp
            timestamp: serverTimestamp()
        };

        // Không log nếu không cần thiết
        if (!isPublicAction && !user) {
            return false;
        }

        await addDoc(collection(db, COLLECTION_NAME), logEntry);
        console.log('[ActivityLog]', action, target || '');
        return true;
    } catch (error) {
        // Fail silently - không ảnh hưởng UX
        console.warn('[ActivityLog] Error:', error.message);
        return false;
    }
}

// ============================================================
// CLEANUP OLD LOGS (chạy khi super_admin xem logs)
// ============================================================
export async function cleanupOldLogs() {
    try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);
        const cutoffTimestamp = Timestamp.fromDate(cutoffDate);

        const q = query(
            collection(db, COLLECTION_NAME),
            where('timestamp', '<', cutoffTimestamp),
            limit(100) // Xóa batch 100 để không quá tải
        );

        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            console.log('[ActivityLog] No old logs to cleanup');
            return 0;
        }

        let deleted = 0;
        for (const docSnap of snapshot.docs) {
            await deleteDoc(doc(db, COLLECTION_NAME, docSnap.id));
            deleted++;
        }

        console.log('[ActivityLog] Cleaned up', deleted, 'old logs');
        return deleted;
    } catch (error) {
        console.warn('[ActivityLog] Cleanup error:', error.message);
        return 0;
    }
}

// ============================================================
// QUERY LOGS (chỉ super_admin)
// ============================================================
export async function queryLogs(filters = {}, pageSize = 50, lastDoc = null) {
    try {
        let constraints = [orderBy('timestamp', 'desc')];

        // Filter by action
        if (filters.action) {
            constraints.push(where('action', '==', filters.action));
        }

        // Filter by user email
        if (filters.email) {
            constraints.push(where('email', '==', filters.email));
        }

        // Pagination
        if (lastDoc) {
            constraints.push(startAfter(lastDoc));
        }
        constraints.push(limit(pageSize));

        const q = query(collection(db, COLLECTION_NAME), ...constraints);
        const snapshot = await getDocs(q);

        const logs = [];
        snapshot.forEach(docSnap => {
            logs.push({
                id: docSnap.id,
                ...docSnap.data()
            });
        });

        return {
            logs,
            lastDoc: snapshot.docs[snapshot.docs.length - 1] || null,
            hasMore: snapshot.docs.length === pageSize
        };
    } catch (error) {
        console.error('[ActivityLog] Query error:', error);
        return { logs: [], lastDoc: null, hasMore: false };
    }
}

// ============================================================
// GET STATS (for dashboard)
// ============================================================
export async function getLogStats() {
    try {
        // Đếm logs 24h qua
        const oneDayAgo = new Date();
        oneDayAgo.setDate(oneDayAgo.getDate() - 1);

        const q24h = query(
            collection(db, COLLECTION_NAME),
            where('timestamp', '>=', Timestamp.fromDate(oneDayAgo))
        );
        const snapshot24h = await getDocs(q24h);

        // Đếm theo action type
        const actionCounts = {};
        snapshot24h.forEach(doc => {
            const action = doc.data().action;
            actionCounts[action] = (actionCounts[action] || 0) + 1;
        });

        return {
            total24h: snapshot24h.size,
            byAction: actionCounts
        };
    } catch (error) {
        console.warn('[ActivityLog] Stats error:', error.message);
        return { total24h: 0, byAction: {} };
    }
}

// ============================================================
// SHORTHAND FUNCTIONS
// ============================================================
export const log = {
    login: () => logActivity(ACTION_TYPES.LOGIN),
    logout: () => logActivity(ACTION_TYPES.LOGOUT),
    view: (section) => logActivity(ACTION_TYPES.SECTION_VIEW, null, { section }),
    search: (query, result) => logActivity(ACTION_TYPES.SEARCH, null, { query, found: result }),
    create: (target, id) => logActivity(ACTION_TYPES.CREATE, target, { id }),
    update: (target, id) => logActivity(ACTION_TYPES.UPDATE, target, { id }),
    delete: (target, id) => logActivity(ACTION_TYPES.DELETE, target, { id }),
    export: (target, count) => logActivity(ACTION_TYPES.EXPORT, target, { count })
};

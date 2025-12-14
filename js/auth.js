/**
 * auth.js - Hệ thống xác thực và phân quyền
 * Xuân Tình Nguyện UEL 2026
 */

import { auth, provider, db } from './firebase.js';
import {
    signInWithCredential,
    GoogleAuthProvider,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
    doc, getDoc, setDoc, collection, getDocs
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ============================================================
// CONSTANTS
// ============================================================
const ALLOWED_DOMAINS = ['st.uel.edu.vn', 'uel.edu.vn'];
const ROLES = {
    SUPER_ADMIN: 'super_admin',
    KYSUTET_ADMIN: 'kysutet_admin',  // Đội trưởng/Đội phó Ký sự Tết - ngang quyền super_admin
    DOIHINH_ADMIN: 'doihinh_admin',
    MEMBER: 'member',
    PENDING: 'pending'
};

// Danh sách 21 đội hình (placeholder - sẽ được cập nhật sau)
const TEAMS = [
    { id: 'bch', name: 'Ban Chỉ huy Chiến dịch' },
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

// ============================================================
// AUTH STATE
// ============================================================
let currentUser = null;
let userRole = null;
let userTeam = null;

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Kiểm tra email có thuộc domain được phép không
 */
function isAllowedDomain(email) {
    if (!email) return false;
    const domain = email.split('@')[1];
    return ALLOWED_DOMAINS.includes(domain);
}

// ============================================================
// NAME CONVERSION - Google format → Vietnamese format
// ============================================================

// Danh sách họ Việt Nam phổ biến (để detect tên đã chuẩn chưa)
const VIETNAMESE_FAMILY_NAMES = [
    'Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Võ',
    'Đặng', 'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương', 'Lý', 'Đoàn', 'Đinh',
    'Lương', 'Trương', 'Chu', 'Mai', 'Tô', 'Cao', 'Lưu', 'Hà', 'Tạ',
    'Từ', 'La', 'Thái', 'Tăng', 'Đào', 'Quách', 'Triệu', 'Lâm', 'Phùng',
    'Văn', 'Diệp', 'Kiều', 'Thiều', 'Tống', 'Ông', 'Trịnh', 'Nghiêm',
    'Mạc', 'Khổng', 'Quang', 'Vương', 'Chung', 'Trang', 'Bạch', 'Hứa',
    'Sơn', 'Đàm', 'Giang', 'An', 'Âu', 'Biện', 'Cù', 'Đậu', 'Gia',
    'Giáp', 'Hàn', 'Khuất', 'Liêu', 'Lục', 'Mã', 'Ngọc', 'Nhâm', 'Ninh',
    'Nông', 'Ôn', 'Phi', 'Phó', 'Quản', 'Sử', 'Tần', 'Thạch', 'Thân',
    'Tiêu', 'Tôn', 'Trầm', 'Vi', 'Viên', 'Vưu', 'Doãn', 'Đường', 'Kha'
];

/**
 * Kiểm tra xem từ có phải họ Việt Nam không
 */
function isVietnameseFamilyName(word) {
    if (!word) return false;
    // Normalize và so sánh không dấu + có dấu
    const normalized = word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    return VIETNAMESE_FAMILY_NAMES.some(name =>
        name.toLowerCase() === word.toLowerCase() ||
        removeVietnameseTones(name).toLowerCase() === removeVietnameseTones(word).toLowerCase()
    );
}

/**
 * Xóa dấu tiếng Việt để so sánh
 */
function removeVietnameseTones(str) {
    return str.normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D');
}

/**
 * Chuyển tên từ format Google (First Middle Last) sang format Việt Nam (Last Middle First)
 * Ví dụ: "My Nhật Nguyễn" → "Nguyễn Nhật My"
 */
function convertToVietnameseName(googleName) {
    if (!googleName || typeof googleName !== 'string') return googleName;

    const parts = googleName.trim().split(/\s+/);
    if (parts.length <= 1) return googleName;

    // Check if already Vietnamese format (first word is common family name)
    if (isVietnameseFamilyName(parts[0])) {
        console.log('[NameConvert] Name already in Vietnamese format:', googleName);
        return googleName;
    }

    // Check if last word is family name (needs conversion)
    if (isVietnameseFamilyName(parts[parts.length - 1])) {
        // Move last word (family name) to front
        const familyName = parts.pop();
        const convertedName = familyName + ' ' + parts.join(' ');
        console.log('[NameConvert] Converted:', googleName, '→', convertedName);
        return convertedName;
    }

    // Can't detect - return original
    console.log('[NameConvert] Could not detect family name, keeping original:', googleName);
    return googleName;
}

/**
 * Lấy thông tin user từ Firestore
 */
async function getUserData(uid) {
    try {
        const userDoc = await getDoc(doc(db, "xtn_users", uid));
        if (userDoc.exists()) {
            return userDoc.data();
        }
        return null;
    } catch (error) {
        console.error("Lỗi lấy thông tin user:", error);
        return null;
    }
}

/**
 * Tạo/cập nhật thông tin user trong Firestore
 * Ưu tiên tìm record theo EMAIL để giữ role/position admin đã set
 */
async function saveUserData(user, additionalData = {}) {
    try {
        // Convert tên từ Google format sang Vietnamese format
        const originalName = user.displayName || user.email.split('@')[0];
        const convertedName = convertToVietnameseName(originalName);

        const userData = {
            email: user.email,
            name: convertedName,
            original_google_name: originalName, // Giữ lại tên gốc để tham khảo
            avatar_url: null,  // Không lấy ảnh từ Google
            last_login: new Date().toISOString(),
        };

        // Kiểm tra xem user đã tồn tại theo UID chưa
        const existingDataByUid = await getUserData(user.uid);

        // QUAN TRỌNG: Tìm record theo EMAIL (trường hợp admin đã tạo trước)
        let existingDataByEmail = null;
        let existingDocIdByEmail = null;
        try {
            const { query, where, getDocs } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
            const emailQuery = query(collection(db, 'xtn_users'), where('email', '==', user.email));
            const emailSnap = await getDocs(emailQuery);

            emailSnap.forEach(docSnap => {
                // Tìm record có email trùng nhưng UID khác
                if (docSnap.id !== user.uid) {
                    existingDataByEmail = docSnap.data();
                    existingDocIdByEmail = docSnap.id;
                    console.log('🔍 [Auth] Found existing record by email:', user.email, '| Old UID:', docSnap.id);
                }
            });
        } catch (e) {
            console.warn('[Auth] Could not search by email:', e);
        }

        // Quyết định nguồn dữ liệu: ưu tiên record admin đã tạo (by email)
        const existingData = existingDataByEmail || existingDataByUid;

        if (existingData) {
            // Giữ lại team nếu đã có
            userData.team_id = existingData.team_id || null;

            // Giữ lại position nếu admin đã set
            if (existingData.position) {
                userData.position = existingData.position;
            }

            // Nếu user đã có tên (đã được convert hoặc tự sửa), không ghi đè
            if (existingData.name && existingData.name !== existingData.original_google_name) {
                userData.name = existingData.name;
            }

            // Ưu tiên role từ additionalData (super_admin check) > existingData > MEMBER
            if (additionalData.role) {
                userData.role = additionalData.role;
            } else {
                userData.role = existingData.role || ROLES.MEMBER;
                console.log('✅ [Auth] Using existing role from admin:', userData.role);
            }

            // Giữ các field khác từ record cũ
            if (existingData.mssv) userData.mssv = existingData.mssv;
            if (existingData.phone) userData.phone = existingData.phone;
            if (existingData.faculty) userData.faculty = existingData.faculty;
        } else {
            // User mới hoàn toàn
            userData.team_id = null;
            userData.created_at = new Date().toISOString();

            // Ưu tiên role từ additionalData (super_admin check) > PENDING
            if (additionalData.role) {
                userData.role = additionalData.role;
            } else {
                userData.role = ROLES.PENDING;
            }
        }

        // Merge các data khác (trừ role đã xử lý riêng)
        const { role, ...otherData } = additionalData;
        Object.assign(userData, otherData);

        // Lưu vào record với UID thật
        await setDoc(doc(db, "xtn_users", user.uid), userData, { merge: true });

        // XÓA record cũ (theo email) nếu tồn tại và UID khác
        if (existingDocIdByEmail && existingDocIdByEmail !== user.uid) {
            try {
                const { deleteDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
                await deleteDoc(doc(db, 'xtn_users', existingDocIdByEmail));
                console.log('🗑️ [Auth] Deleted duplicate record:', existingDocIdByEmail);
            } catch (e) {
                console.warn('[Auth] Could not delete old record:', e);
            }
        }

        return userData;
    } catch (error) {
        console.error("Lỗi lưu thông tin user:", error);
        throw error;
    }
}


/**
 * Kiểm tra user có phải Super Admin không
 */

// Danh sách Super Admin (hardcode để test)
const SUPER_ADMIN_EMAILS = [
    'minhlq23504b@st.uel.edu.vn',  // Web Admin
    // Thêm 7 BCH Trường sau
];

async function checkSuperAdmin(email) {
    // Kiểm tra hardcode trước
    if (SUPER_ADMIN_EMAILS.includes(email)) {
        return true;
    }

    // Kiểm tra từ Firestore
    try {
        const adminDoc = await getDoc(doc(db, "xtn_admins", email));
        return adminDoc.exists();
    } catch (error) {
        console.error("Lỗi kiểm tra admin:", error);
        return false;
    }
}

// Firebase config - cần lấy client ID từ Google Cloud Console
const GOOGLE_CLIENT_ID = '426220182406-9j5292b0n77r6q4lm9jfbvag01sfpb4s.apps.googleusercontent.com';

/**
 * Đăng nhập bằng Google OAuth 2.0 Redirect
 * Redirect thẳng đến accounts.google.com, không dùng One Tap (bị lỗi FedCM)
 * Không cần kết nối đến firebaseapp.com
 */
async function loginWithGoogle() {
    try {
        console.log('🔐 [Auth] Starting Google OAuth redirect...');

        // Xóa cache cũ
        clearUserCache();

        // Tạo nonce để bảo mật
        const nonce = Math.random().toString(36).substring(2) + Date.now().toString(36);

        // Lưu nonce vào sessionStorage để verify sau
        sessionStorage.setItem('oauth_nonce', nonce);

        // Redirect trực tiếp đến Google OAuth (không dùng One Tap)
        const oauth2Url = `https://accounts.google.com/o/oauth2/v2/auth?` +
            `client_id=${GOOGLE_CLIENT_ID}&` +
            `redirect_uri=${encodeURIComponent(window.location.origin + '/login.html')}&` +
            `response_type=id_token&` +
            `scope=openid email profile&` +
            `nonce=${nonce}&` +
            `prompt=select_account`;

        console.log('🔐 [Auth] Redirecting to:', oauth2Url);
        window.location.href = oauth2Url;

        return { user: null, success: false, redirecting: true };

    } catch (error) {
        console.error("❌ Lỗi redirect OAuth:", error);
        throw error;
    }
}


/**
 * Xử lý kết quả OAuth redirect (nếu One Tap không hoạt động)
 */
async function handleRedirectResult() {
    try {
        console.log('🔐 [Auth] Checking for OAuth redirect result...');

        // Kiểm tra URL có chứa access_token không (implicit flow)
        const hash = window.location.hash;
        if (hash && hash.includes('id_token')) {
            const params = new URLSearchParams(hash.substring(1));
            const idToken = params.get('id_token');

            if (idToken) {
                console.log('🔐 [Auth] Found id_token in URL');

                // Tạo credential và đăng nhập Firebase
                const credential = GoogleAuthProvider.credential(idToken);
                const result = await signInWithCredential(auth, credential);
                const user = result.user;

                console.log('🔐 [Auth] OAuth redirect login success:', user.email);

                // Xóa token khỏi URL
                history.replaceState(null, '', window.location.pathname);

                // Xóa cache và lưu user data
                clearUserCache();

                const isSuperAdminCheck = await checkSuperAdmin(user.email);
                await saveUserData(user, {
                    role: isSuperAdminCheck ? ROLES.SUPER_ADMIN : undefined
                });

                return { user, success: true };
            }
        }

        console.log('🔐 [Auth] No OAuth redirect result found');
        return { user: null, success: false };

    } catch (error) {
        console.error("❌ Lỗi xử lý OAuth redirect:", error);
        throw error;
    }
}



/**
 * Xóa cache user cũ khi đăng nhập mới
 */
function clearUserCache() {
    try {
        console.log('🧹 [Auth] Clearing user cache...');

        // Xóa localStorage (trừ Firebase auth)
        const keysToKeep = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('firebase:')) {
                keysToKeep.push(key);
            }
        }
        const firebaseData = {};
        keysToKeep.forEach(key => {
            firebaseData[key] = localStorage.getItem(key);
        });
        localStorage.clear();
        Object.keys(firebaseData).forEach(key => {
            localStorage.setItem(key, firebaseData[key]);
        });

        // Xóa sessionStorage
        sessionStorage.clear();

        // Xóa cache API nếu có
        if ('caches' in window) {
            caches.keys().then(names => {
                names.forEach(name => {
                    caches.delete(name);
                });
            });
        }

        console.log('✅ [Auth] Cache cleared successfully');
    } catch (error) {
        console.warn('⚠️ [Auth] Error clearing cache:', error);
    }
}

/**
 * Đăng xuất
 */
async function logout() {
    try {
        await signOut(auth);
        currentUser = null;
        userRole = null;
        userTeam = null;
        console.log("✅ Đã đăng xuất");
    } catch (error) {
        console.error("❌ Lỗi đăng xuất:", error);
        throw error;
    }
}

/**
 * Lắng nghe trạng thái đăng nhập
 */
function onAuthChange(callback) {
    return onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser = user;
            console.log("🔐 [Auth] User logged in:", user.email);

            let userData = await getUserData(user.uid);
            console.log("🔐 [Auth] userData from Firestore:", userData);

            // Kiểm tra và cập nhật Super Admin role nếu cần
            const shouldBeSuperAdmin = await checkSuperAdmin(user.email);
            console.log("🔐 [Auth] shouldBeSuperAdmin:", shouldBeSuperAdmin, "| current role:", userData?.role);

            if (shouldBeSuperAdmin && userData && userData.role !== ROLES.SUPER_ADMIN) {
                // Cập nhật role lên super_admin
                console.log("🔐 [Auth] Upgrading to super_admin...");
                await setDoc(doc(db, "xtn_users", user.uid), { role: ROLES.SUPER_ADMIN }, { merge: true });
                userData.role = ROLES.SUPER_ADMIN;
                console.log("✅ Auto-upgraded to super_admin:", user.email);
            } else if (shouldBeSuperAdmin && !userData) {
                // User chưa có trong database - tạo mới với role super_admin
                console.log("🔐 [Auth] Creating new super_admin user...");
                userData = {
                    email: user.email,
                    name: user.displayName || user.email.split('@')[0],
                    role: ROLES.SUPER_ADMIN,
                    created_at: new Date().toISOString()
                };
                await setDoc(doc(db, "xtn_users", user.uid), userData);
                console.log("✅ Created new super_admin:", user.email);
            }
            // ĐÃ XÓA logic auto-downgrade: Giữ nguyên role từ Firestore
            // Role do super_admin phân sẽ được tôn trọng

            if (userData) {
                userRole = userData.role;
                userTeam = userData.team_id;
            }
            callback(user, userData);
        } else {
            currentUser = null;
            userRole = null;
            userTeam = null;
            callback(null, null);
        }
    });
}

// ============================================================
// PERMISSION CHECKING
// ============================================================

/**
 * Kiểm tra quyền truy cập
 */
function hasPermission(requiredRole) {
    if (!userRole) return false;

    const roleHierarchy = {
        [ROLES.SUPER_ADMIN]: 4,
        [ROLES.KYSUTET_ADMIN]: 4,  // Ngang quyền super_admin
        [ROLES.DOIHINH_ADMIN]: 2,
        [ROLES.MEMBER]: 1
    };

    const requiredLevel = roleHierarchy[requiredRole] || 0;
    const userLevel = roleHierarchy[userRole] || 0;

    return userLevel >= requiredLevel;
}

/**
 * Kiểm tra có phải Super Admin không
 */
function isSuperAdmin() {
    // KYSUTET_ADMIN cũng có quyền ngang super_admin
    return userRole === ROLES.SUPER_ADMIN || userRole === ROLES.KYSUTET_ADMIN;
}

/**
 * Kiểm tra có phải Team Admin không
 */
function isTeamAdmin() {
    return userRole === ROLES.DOIHINH_ADMIN || userRole === ROLES.SUPER_ADMIN || userRole === ROLES.KYSUTET_ADMIN;
}

/**
 * Kiểm tra có quyền quản lý team cụ thể không
 */
function canManageTeam(teamId) {
    if (userRole === ROLES.SUPER_ADMIN || userRole === ROLES.KYSUTET_ADMIN) return true;
    if (userRole === ROLES.DOIHINH_ADMIN && userTeam === teamId) return true;
    return false;
}

// ============================================================
// USER MANAGEMENT (Admin functions)
// ============================================================

/**
 * Cập nhật role cho user (chỉ Super Admin)
 */
async function updateUserRole(uid, newRole, teamId = null) {
    if (!isSuperAdmin()) {
        throw new Error('Bạn không có quyền thực hiện thao tác này!');
    }

    try {
        await setDoc(doc(db, "xtn_users", uid), {
            role: newRole,
            team_id: teamId,
            updated_at: new Date().toISOString()
        }, { merge: true });

        console.log(`✅ Đã cập nhật role cho user ${uid}`);
        return true;
    } catch (error) {
        console.error("❌ Lỗi cập nhật role:", error);
        throw error;
    }
}

/**
 * Lấy danh sách tất cả users (chỉ Super Admin)
 */
async function getAllUsers() {
    if (!isSuperAdmin()) {
        throw new Error('Bạn không có quyền xem danh sách này!');
    }

    try {
        const snapshot = await getDocs(collection(db, "xtn_users"));
        const users = [];
        snapshot.forEach(doc => {
            users.push({ id: doc.id, ...doc.data() });
        });
        return users;
    } catch (error) {
        console.error("❌ Lỗi lấy danh sách users:", error);
        throw error;
    }
}

// ============================================================
// EXPORTS
// ============================================================

export {
    // Constants
    ROLES,
    TEAMS,
    ALLOWED_DOMAINS,

    // Auth functions
    loginWithGoogle,
    handleRedirectResult,
    logout,
    onAuthChange,

    // Permission functions
    hasPermission,
    isSuperAdmin,
    isTeamAdmin,
    canManageTeam,

    // User management
    updateUserRole,
    getAllUsers,
    getUserData,

    // State getters
    currentUser,
    userRole,
    userTeam
};

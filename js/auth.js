/**
 * auth.js - Hệ thống xác thực và phân quyền
 * Xuân Tình Nguyện UEL 2026
 */

import { auth, provider, db } from './firebase.js';
import {
    signInWithRedirect,
    getRedirectResult,
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
 */
async function saveUserData(user, additionalData = {}) {
    try {
        const userData = {
            email: user.email,
            name: user.displayName || user.email.split('@')[0],
            avatar_url: null,  // Không lấy ảnh từ Google
            last_login: new Date().toISOString(),
        };

        // Kiểm tra xem user đã tồn tại chưa
        const existingData = await getUserData(user.uid);
        if (existingData) {
            // Giữ lại team nếu đã có
            userData.team_id = existingData.team_id || null;

            // Ưu tiên role từ additionalData (super_admin check) > existingData > MEMBER
            if (additionalData.role) {
                userData.role = additionalData.role;
            } else {
                userData.role = existingData.role || ROLES.MEMBER;
            }
        } else {
            // User mới
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

        await setDoc(doc(db, "xtn_users", user.uid), userData, { merge: true });
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

// ============================================================
// MAIN AUTH FUNCTIONS
// ============================================================

/**
 * Đăng nhập bằng Google (dùng Redirect thay vì Popup để tránh lỗi COOP)
 */
async function loginWithGoogle() {
    try {
        // Sử dụng Redirect thay vì Popup để tránh lỗi Cross-Origin-Opener-Policy
        await signInWithRedirect(auth, provider);
        // Sau khi redirect về, kết quả sẽ được xử lý bởi onAuthStateChanged
    } catch (error) {
        console.error("❌ Lỗi đăng nhập:", error);
        throw error;
    }
}

/**
 * Xử lý kết quả redirect sau khi đăng nhập Google
 * Gọi function này khi page load để check redirect result
 */
async function handleRedirectResult() {
    try {
        console.log('🔐 [Auth] Checking for redirect result...');
        const result = await getRedirectResult(auth);

        if (result) {
            const user = result.user;
            console.log('🔐 [Auth] Redirect result found:', user.email);

            // Kiểm tra Super Admin
            const isSuperAdmin = await checkSuperAdmin(user.email);

            // Lưu thông tin user
            await saveUserData(user, {
                role: isSuperAdmin ? ROLES.SUPER_ADMIN : undefined
            });

            console.log("✅ Đăng nhập thành công qua redirect:", user.email);
            return { user, success: true };
        } else {
            console.log('🔐 [Auth] No redirect result (user may already be logged in or not redirected)');
            return { user: null, success: false };
        }
    } catch (error) {
        console.error("❌ Lỗi xử lý redirect:", error);
        throw error;
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

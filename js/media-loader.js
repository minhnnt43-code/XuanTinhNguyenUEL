/**
 * Media Loader - Load images from Firebase for public pages
 * Used by index.html and job-description.html
 */

import { db } from './firebase.js';
import { collection, getDocs, doc, getDoc, query, orderBy, where } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

// Collection names (same as dashboard-media.js)
const COLLECTIONS = {
    HERO: 'xtn_media_hero',
    JD_BG: 'xtn_media_jd_background',
    GALLERY: 'xtn_media_gallery',
    TEAM_GALLERY: 'xtn_media_teams'
};

// Default fallback images
const FALLBACK_IMAGES = {
    hero: [
        'https://lh3.googleusercontent.com/d/103QZz5TUDdLDlIEP3pjjo2oSzFKZI-dx',
        'https://lh3.googleusercontent.com/d/1Lidw_zXd8kH8Y1Q0BSlZdT4P3LJWprA7',
        'https://lh3.googleusercontent.com/d/1_80XttkbXqmqA5HywMOq3JKebJ_skoCS',
        'https://lh3.googleusercontent.com/d/1zQdksoC_Odz9CILbSdUV7npDTdx0-piJ'
    ],
    jd: [
        'https://lh3.googleusercontent.com/d/103QZz5TUDdLDlIEP3pjjo2oSzFKZI-dx',
        'https://lh3.googleusercontent.com/d/1Lidw_zXd8kH8Y1Q0BSlZdT4P3LJWprA7',
        'https://lh3.googleusercontent.com/d/1_80XttkbXqmqA5HywMOq3JKebJ_skoCS',
        'https://lh3.googleusercontent.com/d/1zQdksoC_Odz9CILbSdUV7npDTdx0-piJ'
    ],
    gallery: [] // No fallback - uses text message instead
};

// ============================================================
// LOAD HERO SLIDESHOW (for index.html)
// ============================================================
export async function loadHeroSlideshow(containerId = 'hero-slideshow') {
    const container = document.getElementById(containerId);
    if (!container) {
        console.warn('[MediaLoader] Hero slideshow container not found');
        return;
    }

    try {
        const snapshot = await getDocs(
            query(collection(db, COLLECTIONS.HERO), orderBy('order'))
        );

        let images = snapshot.docs
            .map(doc => doc.data())
            .filter(img => img.active !== false)
            .map(img => img.url);

        // Use fallback if no images
        if (images.length === 0) {
            console.log('[MediaLoader] No hero images in DB, using fallback');
            images = FALLBACK_IMAGES.hero;
        }

        // Render slides
        container.innerHTML = images.map((url, idx) => `
            <div class="slide ${idx === 0 ? 'active' : ''}" 
                 style="background-image: url('${url}');">
            </div>
        `).join('');

        // Update dots if they exist
        updateDots('hero-dots', images.length);

        console.log(`[MediaLoader] Loaded ${images.length} hero images`);

        // Re-init slideshow animation if needed
        if (window.initHeroSlideshow) {
            window.initHeroSlideshow();
        }

    } catch (error) {
        console.error('[MediaLoader] Error loading hero:', error);
        // Use fallback on error
        container.innerHTML = FALLBACK_IMAGES.hero.map((url, idx) => `
            <div class="slide ${idx === 0 ? 'active' : ''}" 
                 style="background-image: url('${url}');">
            </div>
        `).join('');
    }
}

// ============================================================
// LOAD JD BACKGROUND (for job-description.html)
// ============================================================
export async function loadJDBackground(containerId = 'bg-slideshow') {
    const container = document.getElementById(containerId);
    if (!container) {
        console.warn('[MediaLoader] JD background container not found');
        return;
    }

    try {
        const snapshot = await getDocs(
            query(collection(db, COLLECTIONS.JD_BG), orderBy('order'))
        );

        let images = snapshot.docs
            .map(doc => doc.data())
            .filter(img => img.active !== false)
            .map(img => img.url);

        // Use fallback if no images
        if (images.length === 0) {
            console.log('[MediaLoader] No JD images in DB, using fallback');
            images = FALLBACK_IMAGES.jd;
        }

        // Render slides
        container.innerHTML = images.map(url => `
            <div class="slide" style="background-image: url('${url}');"></div>
        `).join('');

        // Update CSS animation timing based on number of images
        updateSlideshowTiming(images.length);

        console.log(`[MediaLoader] Loaded ${images.length} JD background images`);

    } catch (error) {
        console.error('[MediaLoader] Error loading JD background:', error);
        // Use fallback on error
        container.innerHTML = FALLBACK_IMAGES.jd.map(url => `
            <div class="slide" style="background-image: url('${url}');"></div>
        `).join('');
    }
}

// ============================================================
// LOAD GALLERY CAROUSEL (Gieo sắc Xuân sang)
// ============================================================
export async function loadGalleryCarousel(containerId = 'galleryTrack') {
    const container = document.getElementById(containerId);
    if (!container) return;

    try {
        const snapshot = await getDocs(
            query(collection(db, COLLECTIONS.GALLERY), orderBy('order'))
        );

        let images = snapshot.docs
            .map(doc => doc.data())
            .filter(img => img.active !== false)
            .map(img => img.url);

        if (images.length === 0) {
            container.innerHTML = '<div class="carousel-item" style="width:100%; text-align:center; display:flex; justify-content:center; align-items:center; height:300px;"><p>Chưa có hình ảnh nào được tải lên.</p></div>';
            return;
        }

        container.innerHTML = images.map(url => `
            <div class="carousel-item"><img src="${url}" alt="XTN Gallery" loading="lazy"></div>
        `).join('');

        console.log(`[MediaLoader] Loaded ${images.length} gallery images`);

    } catch (error) {
        console.error('[MediaLoader] Error loading gallery:', error);
        container.innerHTML = '<div class="carousel-item" style="width:100%; text-align:center;"><p>Không thể tải hình ảnh.</p></div>';
    }
}

// ============================================================
// LOAD TEAM GALLERY (for job-description.html modals)
// Returns { images: [], description: '' }
// ============================================================
export async function loadTeamGallery(teamId) {
    try {
        const docRef = doc(db, COLLECTIONS.TEAM_GALLERY, teamId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            return {
                images: data.images || [],
                description: data.description || ''
            };
        }

        console.log(`[MediaLoader] No gallery for team ${teamId}`);
        return { images: [], description: '' };

    } catch (error) {
        console.error('[MediaLoader] Error loading team gallery:', error);
        return { images: [], description: '' };
    }
}

// ============================================================
// LOAD ALL TEAM GALLERIES (for job-description.html)
// Returns { teamId: { images: [], description: '' }, ... }
// ============================================================
export async function loadAllTeamGalleries() {
    try {
        const snapshot = await getDocs(collection(db, COLLECTIONS.TEAM_GALLERY));
        const galleries = {};

        snapshot.docs.forEach(doc => {
            const data = doc.data();
            galleries[doc.id] = {
                images: data.images || [],
                description: data.description || ''
            };
        });

        console.log(`[MediaLoader] Loaded galleries for ${Object.keys(galleries).length} teams`);
        return galleries;

    } catch (error) {
        console.error('[MediaLoader] Error loading team galleries:', error);
        return {};
    }
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================
function updateDots(containerId, count) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = Array(count).fill(0).map((_, idx) => `
        <span class="dot ${idx === 0 ? 'active' : ''}" data-slide="${idx}"></span>
    `).join('');
}

function updateSlideshowTiming(imageCount) {
    if (imageCount <= 1) return;

    const totalDuration = imageCount * 6; // 6 seconds per image
    const fadePercent = 4 / totalDuration * 100;
    const showPercent = (100 / imageCount) - fadePercent;

    // Create dynamic CSS for slideshow animation
    const style = document.createElement('style');
    style.textContent = `
        .bg-slideshow .slide {
            animation: slideshow ${totalDuration}s infinite;
        }
        ${Array(imageCount).fill(0).map((_, idx) => `
            .bg-slideshow .slide:nth-child(${idx + 1}) {
                animation-delay: ${idx * 6}s;
            }
        `).join('')}
    `;
    document.head.appendChild(style);
}

// ============================================================
// AUTO-INIT (called when imported)
// ============================================================
export function autoInit() {
    // Detect which page we're on
    const isIndex = window.location.pathname.includes('index.html') || window.location.pathname === '/';
    const isJD = window.location.pathname.includes('job-description');

    if (isIndex) {
        // Wait for DOM and then load
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => loadHeroSlideshow());
        } else {
            loadHeroSlideshow();
        }
    }

    if (isJD) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => loadJDBackground());
        } else {
            loadJDBackground();
        }
    }
}

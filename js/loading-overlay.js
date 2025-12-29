/**
 * Loading Overlay - XTN 2026
 * Full-screen loading overlay với màu vàng theme
 */

class LoadingOverlay {
    constructor() {
        this.overlay = null;
        this.progressBar = null;
        this.progressText = null;
        this.messageText = null;
        this.currentProgress = 0;
        this.init();
    }

    init() {
        // Create overlay HTML
        this.overlay = document.createElement('div');
        this.overlay.id = 'xtn-loading-overlay';
        this.overlay.innerHTML = `
            <div class="loading-content">
                <div class="loading-logo">
                    <i class="fa-solid fa-flower-daffodil fa-3x"></i>
                </div>
                <h2 class="loading-title">XTN 2026</h2>
                <div class="loading-progress-container">
                    <div class="loading-progress-bar" id="loading-progress-bar"></div>
                </div>
                <p class="loading-progress-text" id="loading-progress-text">0%</p>
                <p class="loading-message" id="loading-message">Đang khởi tạo...</p>
            </div>
        `;

        // Inject CSS
        this.injectStyles();

        // Add to body
        document.body.appendChild(this.overlay);

        // Get references
        this.progressBar = document.getElementById('loading-progress-bar');
        this.progressText = document.getElementById('loading-progress-text');
        this.messageText = document.getElementById('loading-message');
    }

    injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            #xtn-loading-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: linear-gradient(135deg, #FFFEF5 0%, #FFF9E6 100%);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 999999;
                opacity: 1;
                transition: opacity 0.5s ease;
            }

            #xtn-loading-overlay.fade-out {
                opacity: 0;
                pointer-events: none;
            }

            .loading-content {
                text-align: center;
                max-width: 400px;
                padding: 40px;
            }

            .loading-logo {
                margin-bottom: 20px;
                animation: pulse 2s ease-in-out infinite;
            }

            .loading-logo i {
                background: linear-gradient(135deg, #FFD700, #FFA500);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
                filter: drop-shadow(0 4px 12px rgba(255, 215, 0, 0.3));
            }

            .loading-title {
                font-family: 'Montserrat', sans-serif;
                font-size: 2rem;
                font-weight: 800;
                background: linear-gradient(135deg, #FFD700, #FF8C00);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
                margin-bottom: 30px;
                letter-spacing: 2px;
            }

            .loading-progress-container {
                width: 100%;
                height: 8px;
                background: rgba(255, 215, 0, 0.2);
                border-radius: 10px;
                overflow: hidden;
                margin-bottom: 15px;
                box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.1);
            }

            .loading-progress-bar {
                height: 100%;
                width: 0%;
                background: linear-gradient(90deg, #FFD700, #FFA500, #FF8C00);
                background-size: 200% 100%;
                border-radius: 10px;
                transition: width 0.3s ease;
                animation: shimmer 2s linear infinite;
                box-shadow: 0 0 10px rgba(255, 215, 0, 0.5);
            }

            .loading-progress-text {
                font-size: 1.5rem;
                font-weight: 700;
                color: #FF8C00;
                margin-bottom: 10px;
            }

            .loading-message {
                font-size: 1rem;
                color: #666;
                font-weight: 500;
            }

            @keyframes pulse {
                0%, 100% {
                    transform: scale(1);
                }
                50% {
                    transform: scale(1.1);
                }
            }

            @keyframes shimmer {
                0% {
                    background-position: 200% 0;
                }
                100% {
                    background-position: -200% 0;
                }
            }

            /* Mobile responsive */
            @media (max-width: 480px) {
                .loading-content {
                    padding: 20px;
                }
                .loading-title {
                    font-size: 1.5rem;
                }
                .loading-logo i {
                    font-size: 2rem !important;
                }
            }
        `;
        document.head.appendChild(style);
    }

    show() {
        this.overlay.classList.remove('fade-out');
        this.overlay.style.display = 'flex';
    }

    hide() {
        this.overlay.classList.add('fade-out');
        setTimeout(() => {
            this.overlay.style.display = 'none';
        }, 500);
    }

    setProgress(percent, message = '') {
        this.currentProgress = Math.min(100, Math.max(0, percent));
        this.progressBar.style.width = `${this.currentProgress}%`;
        this.progressText.textContent = `${Math.round(this.currentProgress)}%`;

        if (message) {
            this.messageText.textContent = message;
        }
    }

    updateMessage(message) {
        this.messageText.textContent = message;
    }
}

// Create global instance
window.loadingOverlay = new LoadingOverlay();

// Auto-hide on page load complete
window.addEventListener('load', () => {
    setTimeout(() => {
        window.loadingOverlay.hide();
    }, 500);
});

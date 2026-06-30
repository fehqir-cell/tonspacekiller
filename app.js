// TON Space Killer - Game Engine & Telegram Mini App Logic

// --- STATE MANAGEMENT ---
let gameState = {
    crystals: 0,
    gram: 0, // Premium currency (ex-TON)
    highScore: 0,
    upgrades: {
        shield: 1,      // Max shield: lvl * 50 + 50 (lvl 1 = 100)
        magnet: 0,      // Magnet radius: lvl * 40 (lvl 0 = 0px, lvl 5 = 200px)
        engine: 1,      // Speed and score multiplier: lvl * 0.5 + 0.5 (lvl 1 = 1x)
        repair: 0,      // Shield repair per sec: lvl * 0.25
        glitch: 0,      // Glitch crystal chance: lvl * 10%
        overclock: 0,   // Faster crystal spawn: lvl * 8 fewer frames between spawns
        shockwave: 0,   // Auto-blast radius: lvl * 50px every 10s
        targeting: 0,   // Targeting ring on nearest crystal, scales range
        nanoshield: 0,  // Premium: Fatal crash absorb count/capacity per round
        singularity: 0  // Premium: Yield multiplier: +20% per level
    },
    pilot: {
        username: "guest_flyer",
        firstName: "Guest Pilot",
        photoUrl: ""
    },
    gameActive: false,
    currentRound: 1,
    timeRemaining: 60, // 1 minute in seconds
    score: 0,
    shield: 100,
    speedMultiplier: 1.0,
    activeTab: "game",
    nanoshieldTriggered: false // Track if Nano-Shield Capacitor triggered this round
};

// Constants for upgrades
const UPGRADE_MAX = 5;
const UPGRADE_COSTS = {
    shield:      [100, 200, 400, 800],             // Costs for lvl 2, 3, 4, 5
    magnet:      [150, 300, 600, 1200, 2400],       // Costs for lvl 1-5
    engine:      [200, 400, 800, 1600],             // Costs for lvl 2, 3, 4, 5
    repair:      [250, 500, 1000, 2000, 4000],      // Costs for lvl 1-5
    glitch:      [300, 600, 1200, 2400, 4800],      // Costs for lvl 1-5
    overclock:   [350, 700, 1400, 2800, 5600],      // Costs for lvl 1-5
    shockwave:   [400, 800, 1600, 3200, 6400],      // Costs for lvl 1-5
    targeting:   [450, 900, 1800, 3600, 7200],      // Costs for lvl 1-5
    nanoshield:  [10, 20, 40, 80, 160],             // Premium (GRAM) costs for lvl 1-5
    singularity: [15, 30, 60, 120, 240]              // Premium (GRAM) costs for lvl 1-5
};

// --- DOM ELEMENTS ---
const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");
const startBtn = document.getElementById("start-round-btn");
const restartBtn = document.getElementById("restart-btn");
const pilotNameDisplay = document.getElementById("pilot-name");
const hudCrystalsDisplay = document.getElementById("hud-crystals");
const hudGramDisplay = document.getElementById("hud-gram");
const shieldBarFill = document.getElementById("shield-bar-fill");
const timerVal = document.getElementById("timer-val");
const hudRoundVal = document.getElementById("hud-round-val");
const speedVal = document.getElementById("speed-val");
const highScoreVal = document.getElementById("high-score-val");

// Screens
const screenStart = document.getElementById("screen-start");
const screenOver = document.getElementById("screen-over");
const gameHud = document.getElementById("game-hud");

// Tabs
const gameTab = document.getElementById("game-tab");
const garageTab = document.getElementById("garage-tab");
const balanceTab = document.getElementById("balance-tab");
const leaderboardTab = document.getElementById("leaderboard-tab");

let tonConnectUI = null;

// --- INITIALIZATION ---
document.addEventListener("DOMContentLoaded", () => {
    // 1. Initialize Telegram WebApp
    initTelegramWebApp();

    // 2. Load Saved Game Data
    loadGameData();

    // 2b. Initialize TON Connect
    initTonConnect();

    // 3. Set Up Canvas Dimensions
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    // 4. Input Handlers
    initInputHandlers();

    // 5. Build Leaderboard
    renderLeaderboard();

    // 6. Set active theme class
    document.body.className = "cyber-magenta"; // default theme

    // Start background stars animation
    initBackgroundStars();
    requestAnimationFrame(backgroundAnimationLoop);

    // 7. Check for Admin URL override and bind Secret Taps
    checkAdminUrlParam();
    setupSecretAdminTaps();

    logDev("System ready. Pilot: " + gameState.pilot.username);
});

function initTonConnect() {
    try {
        const manifest = window.location.origin + "/tonconnect-manifest.json";
        const hasSDK = typeof TonConnectSDK !== 'undefined' && TonConnectSDK.TonConnectUI;
        const hasUINamespace = typeof TON_CONNECT_UI !== 'undefined' && TON_CONNECT_UI.TonConnectUI;

        if (hasSDK) {
            tonConnectUI = new TonConnectSDK.TonConnectUI({
                manifestUrl: manifest,
                buttonRootId: 'ton-connect-btn'
            });
            logDev("TON Connect initialized.");
        } else if (hasUINamespace) {
            tonConnectUI = new TON_CONNECT_UI.TonConnectUI({
                manifestUrl: manifest,
                buttonRootId: 'ton-connect-btn'
            });
            logDev("TON Connect UI initialized.");
        } else {
            console.warn("TON Connect SDK library not found. Running in mock/offline mode.");
            logDev("TON Connect SDK load error (falling back to mock)");
            return;
        }

        // Listen for wallet connection state changes
        tonConnectUI.onStatusChange(wallet => {
            const connectIndicator = document.getElementById("wallet-indicator");
            if (wallet) {
                const address = wallet.account.address;
                const shortAddress = address.slice(0, 4) + "..." + address.slice(-4);
                logDev(`TON Wallet Connected: ${shortAddress}`);
                gameState.pilot.walletConnected = true;
                gameState.pilot.walletAddress = address;
                
                // Show TON pay buttons and exchange cards
                document.querySelectorAll(".ton-pay-btn").forEach(btn => btn.classList.remove("hidden"));
                document.querySelectorAll(".ton-exchange-card").forEach(btn => btn.classList.remove("hidden"));
                if (connectIndicator) connectIndicator.classList.remove("hidden");
            } else {
                logDev("TON Wallet Disconnected.");
                gameState.pilot.walletConnected = false;
                gameState.pilot.walletAddress = "";
                
                // Hide TON pay buttons and exchange cards
                document.querySelectorAll(".ton-pay-btn").forEach(btn => btn.classList.add("hidden"));
                document.querySelectorAll(".ton-exchange-card").forEach(btn => btn.classList.add("hidden"));
                if (connectIndicator) connectIndicator.classList.add("hidden");
            }
            updateHeaderUI();
            updateGarageUI();
        });
    } catch (e) {
        console.error("TON Connect UI Init Error:", e);
        logDev("TON Connect UI init error: " + e.message);
    }
}

// --- TELEGRAM WEBAPP INTEGRATION ---
function initTelegramWebApp() {
    const tg = window.Telegram?.WebApp;
    if (tg) {
        tg.ready();
        tg.expand();

        // Get user details
        if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
            const user = tg.initDataUnsafe.user;
            gameState.pilot.username = user.username ? `@${user.username}` : `@id_${user.id}`;
            gameState.pilot.firstName = user.first_name || "Pilot";
            logDev("Telegram User Connected: " + gameState.pilot.username);
        }

        // Apply theme color parameters if native is selected
        tg.onEvent('themeChanged', () => {
            if (document.body.classList.contains('telegram-native')) {
                applyTelegramTheme();
            }
        });

        // Set header color
        try {
            tg.setHeaderColor('secondary_bg_color');
        } catch (e) {
            console.error(e);
        }
    } else {
        logDev("Running in standalone browser (Simulated environment)");
    }
    updateHeaderUI();
}

function triggerHaptic(type) {
    const tg = window.Telegram?.WebApp;
    const notifier = document.getElementById("haptic-notifier");
    
    // Log for UI visual confirmation
    let hapticText = "📳 Haptic Vibrate";

    if (tg && tg.HapticFeedback) {
        if (type === "click") {
            tg.HapticFeedback.impactOccurred("medium");
            hapticText = "📳 Haptic (Medium Click)";
        } else if (type === "collision") {
            tg.HapticFeedback.notificationOccurred("warning");
            hapticText = "📳 Haptic (Warning / Shock)";
        } else if (type === "success") {
            tg.HapticFeedback.notificationOccurred("success");
            hapticText = "📳 Haptic (Success / LevelUp)";
        }
    } else {
        hapticText += " [SIMULATED: " + type.toUpperCase() + "]";
    }

    // Display floating notifier
    notifier.textContent = hapticText;
    notifier.classList.remove("hidden");
    // Force reflow
    void notifier.offsetWidth;
    notifier.style.animation = 'none';
    notifier.style.animation = '';
}

// --- LOCAL STORAGE DATA ---
function saveGameData() {
    const saveObj = {
        crystals: gameState.crystals,
        gram: gameState.gram,
        highScore: gameState.highScore,
        upgrades: gameState.upgrades
    };
    localStorage.setItem("cyberflyer_save_data", JSON.stringify(saveObj));
}

function loadGameData() {
    const saved = localStorage.getItem("cyberflyer_save_data");
    if (saved) {
        try {
            const data = JSON.parse(saved);
            gameState.crystals = data.crystals ?? 0;
            gameState.gram = data.gram ?? 0;
            gameState.highScore = data.highScore ?? 0;
            if (data.upgrades) {
                gameState.upgrades = { ...gameState.upgrades, ...data.upgrades };
            }
        } catch (e) {
            console.error("Error parsing save data", e);
        }
    }
    updateHeaderUI();
    updateGarageUI();
}

function updateHeaderUI() {
    pilotNameDisplay.textContent = gameState.pilot.username;
    hudCrystalsDisplay.textContent = String(gameState.crystals).padStart(4, "0");
    if (hudGramDisplay) {
        hudGramDisplay.textContent = gameState.gram.toFixed(2);
    }
    highScoreVal.textContent = gameState.highScore;
}

// --- NAVIGATION & TABS ---
function switchTab(tabName) {
    if (gameState.gameActive && tabName !== "game") {
        // Pause/Stop active game if switching away
        endGame(false, "MISSION SUSPENDED");
    }

    gameState.activeTab = tabName;
    triggerHaptic("click");

    // Update active nav buttons
    const navItems = document.querySelectorAll(".nav-item");
    navItems.forEach(btn => {
        const text = btn.querySelector(".nav-text").textContent.toLowerCase();
        if (text === "fly" && tabName === "game") btn.classList.add("active");
        else if (text === "garage" && tabName === "garage") btn.classList.add("active");
        else if (text === "balance" && tabName === "balance") btn.classList.add("active");
        else if (text === "deep grid" && tabName === "leaderboard") btn.classList.add("active");
        else btn.classList.remove("active");
    });

    // Update active sections
    gameTab.classList.remove("active");
    garageTab.classList.remove("active");
    balanceTab.classList.remove("active");
    leaderboardTab.classList.remove("active");

    if (tabName === "game") {
        gameTab.classList.add("active");
        resizeCanvas();
    } else if (tabName === "garage") {
        garageTab.classList.add("active");
        updateGarageUI();
    } else if (tabName === "balance") {
        balanceTab.classList.add("active");
        updateGarageUI();
    } else if (tabName === "leaderboard") {
        leaderboardTab.classList.add("active");
        renderLeaderboard();
    }
}

// --- GARAGE (UPGRADE) MANAGEMENT ---
function getUpgradeCost(type) {
    const currentLvl = gameState.upgrades[type];
    if (currentLvl >= UPGRADE_MAX) return -1;
    
    // Upgrades starting at level 0: magnet, repair, glitch, overclock, shockwave, targeting, nanoshield, singularity
    const startsAtZero = ["magnet", "repair", "glitch", "overclock", "shockwave", "targeting", "nanoshield", "singularity"].includes(type);
    const costIndex = startsAtZero ? currentLvl : (currentLvl - 1);
    return UPGRADE_COSTS[type][costIndex];
}

function updateGarageUI() {
    const types = ["shield", "magnet", "engine", "repair", "glitch", "overclock", "shockwave", "targeting", "nanoshield", "singularity"];
    
    types.forEach(type => {
        const lvl = gameState.upgrades[type];
        const cost = getUpgradeCost(type);
        
        // Update level label
        const lvlEl = document.getElementById(`${type}-lvl`);
        if (lvlEl) lvlEl.textContent = lvl;
        
        // Update level dots
        const dotsContainer = document.getElementById(`${type}-dots`);
        if (dotsContainer) {
            dotsContainer.innerHTML = "";
            for (let i = 1; i <= UPGRADE_MAX; i++) {
                const dot = document.createElement("div");
                dot.classList.add("lvl-dot");
                // Shield and engine start at level 1, others start at 0
                if (i <= lvl) {
                    dot.classList.add("active");
                }
                dotsContainer.appendChild(dot);
            }
        }

        // Update button cost
        const btn = document.getElementById(`buy-${type}-btn`);
        const costSpan = document.getElementById(`${type}-cost`);
        
        if (btn) {
            if (lvl >= UPGRADE_MAX) {
                btn.disabled = true;
                btn.classList.add("maxed");
                btn.innerHTML = "MAXED";
            } else {
                const isPremium = ["nanoshield", "singularity"].includes(type);
                const balance = isPremium ? gameState.gram : gameState.crystals;
                btn.disabled = balance < cost;
                btn.classList.remove("maxed");
                if (costSpan) costSpan.textContent = cost;
            }
        }

        // Handle TON cost display and button visibility
        const tonBtn = document.getElementById(`ton-buy-${type}-btn`);
        const tonCostSpan = document.getElementById(`ton-cost-${type}`);
        
        if (tonCostSpan) {
            const tonCost = getUpgradeTONCost(type);
            if (tonCost !== -1) {
                tonCostSpan.textContent = tonCost.toFixed(2);
            }
        }

        if (tonBtn) {
            if (lvl >= UPGRADE_MAX) {
                tonBtn.classList.add("hidden");
            } else if (gameState.pilot.walletConnected) {
                tonBtn.classList.remove("hidden");
            } else {
                tonBtn.classList.add("hidden");
            }
        }
    });

    const exchangeBtn = document.getElementById("exchange-btn");
    if (exchangeBtn) {
        exchangeBtn.disabled = gameState.crystals < 10000;
    }
}

function getUpgradeTONCost(type) {
    const currentLvl = gameState.upgrades[type];
    if (currentLvl >= UPGRADE_MAX) return -1;
    const costs = [0.01, 0.02, 0.04, 0.08, 0.16];
    return costs[currentLvl];
}

function buyUpgrade(type) {
    const cost = getUpgradeCost(type);
    if (cost === -1) return;

    const isPremium = ["nanoshield", "singularity"].includes(type);
    const balance = isPremium ? gameState.gram : gameState.crystals;

    if (balance >= cost) {
        if (isPremium) {
            gameState.gram -= cost;
        } else {
            gameState.crystals -= cost;
        }
        gameState.upgrades[type]++;
        saveGameData();
        triggerHaptic("success");
        updateHeaderUI();
        updateGarageUI();
        logDev(`Upgraded ${type} to level ${gameState.upgrades[type]}!`);
    } else {
        triggerHaptic("click");
    }
}

async function buyUpgradeWithTON(type) {
    const tonCost = getUpgradeTONCost(type);
    if (tonCost === -1) return;

    if (!tonConnectUI || !tonConnectUI.connected) {
        logDev("Cannot buy: TON wallet not connected!");
        alert("Please connect your TON wallet first!");
        return;
    }

    try {
        logDev(`Requesting transaction: ${tonCost} TON for ${type} upgrade...`);
        const nanotons = Math.round(tonCost * 1000000000).toString();
        
        const transaction = {
            validUntil: Math.floor(Date.now() / 1000) + 60, // 60 seconds
            messages: [
                {
                    address: "EQB2y8G2gVlVp_lHk_U3p4r0O_h6J9p_h6J9p_h6J9p_h4zO", // Merchant burn/system address
                    amount: nanotons
                }
            ]
        };

        const result = await tonConnectUI.sendTransaction(transaction);
        logDev(`Transaction approved! Broadcast success.`);
        
        gameState.upgrades[type]++;
        saveGameData();
        triggerHaptic("success");
        updateHeaderUI();
        updateGarageUI();
        
        pushFloatingText(canvasWidth / 2, canvasHeight / 2, `UPGRADED VIA CRYPTO!`, "#00ff66", 90);
        logDev(`Crypto Upgrade Success: ${type} is now level ${gameState.upgrades[type]}`);
        alert(`Upgrade successful! ${type} upgraded to level ${gameState.upgrades[type]}`);
    } catch (e) {
        console.error("TON transaction error:", e);
        logDev("Transaction canceled or failed: " + e.message);
    }
}

async function buyGramWithTON(amount, tonAmount) {
    if (!tonConnectUI || !tonConnectUI.connected) {
        logDev("Cannot swap: TON wallet not connected!");
        alert("Please connect your TON wallet first!");
        return;
    }

    try {
        logDev(`Requesting transaction: ${tonAmount} TON for ${amount} GRAM tokens...`);
        const nanotons = Math.round(tonAmount * 1000000000).toString();
        
        const transaction = {
            validUntil: Math.floor(Date.now() / 1000) + 60,
            messages: [
                {
                    address: "EQB2y8G2gVlVp_lHk_U3p4r0O_h6J9p_h6J9p_h6J9p_h4zO",
                    amount: nanotons
                }
            ]
        };

        const result = await tonConnectUI.sendTransaction(transaction);
        logDev(`Transaction approved! Broadcast success.`);
        
        gameState.gram = Math.round((gameState.gram + amount) * 100) / 100;
        saveGameData();
        triggerHaptic("success");
        updateHeaderUI();
        updateGarageUI();
        
        pushFloatingText(canvasWidth / 2, canvasHeight / 2, `+${amount} GRAM RECEIVED!`, "#00f3ff", 90);
        logDev(`Crypto swap success: +${amount} GRAM credited.`);
        alert(`Purchase successful! +${amount} GRAM tokens added to your balance.`);
    } catch (e) {
        console.error("TON swap transaction error:", e);
        logDev("Swap canceled or failed: " + e.message);
    }
}

// --- TELEGRAM STARS MERCHANDISING ---
let currentInvoiceData = null;

function buyWithStars(starsAmount, rewardType, rewardAmount) {
    triggerHaptic("click");
    currentInvoiceData = {
        stars: starsAmount,
        type: rewardType,
        amount: rewardAmount
    };

    const modal = document.getElementById("stars-invoice-modal");
    const itemName = document.getElementById("invoice-item-name");
    const itemDesc = document.getElementById("invoice-item-desc");
    const priceText = document.getElementById("invoice-stars-amount");
    const payBtn = document.getElementById("pay-invoice-confirm-btn");

    if (modal && itemName && itemDesc && priceText && payBtn) {
        let nameStr = "";
        let descStr = "";
        if (rewardType === 'crystals') {
            nameStr = rewardAmount === 5000 ? "Micro Crystal Pack" : "Mega Crystal Pack";
            descStr = `Instantly credits +${rewardAmount.toLocaleString()} energy crystals to your game balance.`;
        } else if (rewardType === 'gram') {
            nameStr = "Premium GRAM Pack";
            descStr = `Directly injects +${rewardAmount.toFixed(2)} premium GRAM tokens to your pilot account.`;
        }

        itemName.textContent = nameStr;
        itemDesc.textContent = descStr;
        priceText.textContent = starsAmount;

        payBtn.onclick = () => {
            payInvoiceConfirm(starsAmount, rewardType, rewardAmount);
        };

        modal.classList.remove("hidden");
        logDev(`Opened invoice for ${nameStr} (${starsAmount} Stars)`);
    }
}

function closeStarsInvoice() {
    triggerHaptic("click");
    const modal = document.getElementById("stars-invoice-modal");
    if (modal) {
        modal.classList.add("hidden");
    }
    currentInvoiceData = null;
}

function payInvoiceConfirm(starsAmount, rewardType, rewardAmount) {
    const tg = window.Telegram?.WebApp;
    
    if (rewardType === 'crystals') {
        gameState.crystals += rewardAmount;
        pushFloatingText(canvasWidth / 2, canvasHeight / 2, `+${rewardAmount} CRYSTALS!`, "#00ff66", 90);
        logDev(`Stars Payment Success: Received ${rewardAmount} crystals for ${starsAmount} Stars.`);
    } else if (rewardType === 'gram') {
        gameState.gram = Math.round((gameState.gram + rewardAmount) * 100) / 100;
        pushFloatingText(canvasWidth / 2, canvasHeight / 2, `+${rewardAmount} GRAM!`, "#00f3ff", 90);
        logDev(`Stars Payment Success: Received ${rewardAmount} GRAM for ${starsAmount} Stars.`);
    }

    saveGameData();
    triggerHaptic("success");
    updateHeaderUI();
    updateGarageUI();

    if (tg && tg.showPopup) {
        tg.showPopup({
            title: 'Payment Successful',
            message: `Purchase completed successfully via Telegram Stars! Received ${rewardAmount} ${rewardType === 'crystals' ? 'crystals 🔮' : 'GRAM 💎'}.`,
            buttons: [{ type: 'ok' }]
        });
    } else {
        alert(`Payment successful! Credited +${rewardAmount} ${rewardType === 'crystals' ? 'crystals' : 'GRAM'}.`);
    }

    closeStarsInvoice();
}

function swapCrystalsForGram() {
    const rate = 10000;
    if (gameState.crystals >= rate) {
        gameState.crystals -= rate;
        gameState.gram = Math.round((gameState.gram + 1.0) * 100) / 100;
        saveGameData();
        triggerHaptic("success");
        updateHeaderUI();
        updateGarageUI();
        logDev("Exchanged 10,000 crystals for 1.00 GRAM!");
    } else {
        triggerHaptic("click");
        logDev("Insufficient crystals for exchange (Need 10,000 🔮)");
        pushFloatingText(canvasWidth / 2, canvasHeight / 2, "INSUFFICIENT CRYSTALS!", "#ff0055", 60);
    }
}

// --- LEADERBOARD (DEEP GRID) ---
function renderLeaderboard() {
    const tbody = document.getElementById("leaderboard-entries");
    tbody.innerHTML = "";

    // Simulated players
    let runners = [
        { name: "xX_neo_runner_Xx", score: 850, isPlayer: false },
        { name: "satoshi_99", score: 620, isPlayer: false },
        { name: "cyber_cowboy", score: 480, isPlayer: false },
        { name: "trinity_matrix", score: 320, isPlayer: false },
        { name: "pixel_goddess", score: 210, isPlayer: false }
    ];

    // Add current player
    const playerRecord = Math.max(gameState.highScore, gameState.score);
    const pilotNameClean = gameState.pilot.username;
    runners.push({ name: pilotNameClean, score: playerRecord, isPlayer: true });

    // Sort descending
    runners.sort((a, b) => b.score - a.score);

    // Render rows
    runners.forEach((run, index) => {
        const tr = document.createElement("tr");
        if (run.isPlayer) tr.classList.add("user-row");

        let medal = index + 1;
        if (index === 0) medal = "🥇";
        else if (index === 1) medal = "🥈";
        else if (index === 2) medal = "🥉";

        tr.innerHTML = `
            <td class="rank-col">${medal}</td>
            <td>${run.name}</td>
            <td>🔮 ${run.score}</td>
        `;
        tbody.appendChild(tr);
    });
}


// ==========================================
// --- GAMEPLAY ENGINE (HTML5 CANVAS) ---
// ==========================================

let canvasWidth = 400;
let canvasHeight = 600;

// Player Spaceship Configuration
let playerShip = {
    x: 200,
    y: 500,
    width: 38,
    height: 38,
    targetX: 200,
    speed: 6, // base speed, scaled by engine upgrade
    glowColor: "#00f3ff",
    thrusterScale: 1.0,
    tilt: 0
};

// Physics Entity Arrays
let crystalsList = [];
let obstaclesList = [];
let particleList = [];
let floatingTexts = [];
let spaceStars = [];
let shockwaveRings = [];

// Game States
let activeTimer = null;
let speedScaleTimer = null;
let lastTime = 0;
let keys = {};
let isDragging = false;

// Spawn thresholds (frames)
let crystalSpawnRate = 60; // Spawn every X frames
let obstacleSpawnRate = 90;
let frameCount = 0;

function resizeCanvas() {
    // Fit canvas dynamically inside its parent container
    const parent = canvas.parentElement;
    canvasWidth = parent ? parent.clientWidth : 0;
    canvasHeight = parent ? parent.clientHeight : 0;
    
    // Fallback if dimensions are 0 (layout not fully rendered on load)
    if (canvasWidth === 0 || canvasHeight === 0) {
        canvasWidth = Math.min(480, window.innerWidth || 400);
        canvasHeight = (window.innerHeight || 600) - 120;
    }
    
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    
    // Re-position ship near the bottom center
    playerShip.y = canvasHeight - 75;
    if (!gameState.gameActive) {
        playerShip.x = canvasWidth / 2;
        playerShip.targetX = playerShip.x;
    }
}

// Background space stars (Parallel Scrolling background)
function initBackgroundStars() {
    spaceStars = [];
    const starCount = 60;
    for (let i = 0; i < starCount; i++) {
        spaceStars.push({
            x: Math.random() * 500, // normalized width
            y: Math.random() * 800, // normalized height
            size: Math.random() * 2 + 0.5,
            speed: Math.random() * 0.8 + 0.2,
            brightness: Math.random() * 0.5 + 0.5
        });
    }
}

function initInputHandlers() {
    // Keyboard inputs
    window.addEventListener("keydown", (e) => {
        keys[e.key] = true;
        if (gameState.gameActive) {
            const step = 30; // 30px per press
            if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
                playerShip.targetX = Math.max(playerShip.width/2, playerShip.targetX - step);
            }
            if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
                playerShip.targetX = Math.min(canvasWidth - playerShip.width/2, playerShip.targetX + step);
            }
        }
    });
    window.addEventListener("keyup", (e) => {
        keys[e.key] = false;
    });

    // Touch/Mouse controls for horizontal slide
    canvas.addEventListener("mousedown", startDrag);
    canvas.addEventListener("mousemove", dragMove);
    canvas.addEventListener("mouseup", endDrag);
    canvas.addEventListener("mouseleave", endDrag);

    canvas.addEventListener("touchstart", (e) => {
        const touch = e.touches[0];
        startDrag({ clientX: touch.clientX });
    }, { passive: true });

    canvas.addEventListener("touchmove", (e) => {
        const touch = e.touches[0];
        dragMove({ clientX: touch.clientX });
    }, { passive: true });

    canvas.addEventListener("touchend", endDrag);

    // On-screen Tap Zone Steering Controls (tap left/right fallback)
    const btnLeft = document.getElementById("btn-left");
    const btnRight = document.getElementById("btn-right");

    let steerInterval = null;
    const startSteer = (dir) => {
        steerInterval = setInterval(() => {
            const speed = playerShip.speed * (gameState.upgrades.engine * 0.2 + 0.8);
            playerShip.targetX = Math.max(20, Math.min(canvasWidth - 20, playerShip.targetX + dir * speed * 2));
        }, 16);
    };
    const stopSteer = () => {
        clearInterval(steerInterval);
    };

    btnLeft.addEventListener("touchstart", (e) => { e.preventDefault(); startSteer(-1); });
    btnLeft.addEventListener("touchend", stopSteer);
    btnRight.addEventListener("touchstart", (e) => { e.preventDefault(); startSteer(1); });
    btnRight.addEventListener("touchend", stopSteer);
}

function startDrag(e) {
    if (!gameState.gameActive) return;
    isDragging = true;
    updateShipTarget(e.clientX);
}

function dragMove(e) {
    if (!isDragging) return;
    updateShipTarget(e.clientX);
}

function endDrag() {
    isDragging = false;
}

function updateShipTarget(clientX) {
    const rect = canvas.getBoundingClientRect();
    const relativeX = clientX - rect.left;
    playerShip.targetX = Math.max(playerShip.width/2, Math.min(canvasWidth - playerShip.width/2, relativeX));
}

// --- GAME STATE ACTIONS ---
startBtn.addEventListener("click", () => launchGame(true));
restartBtn.addEventListener("click", handleRestartClick);

function handleRestartClick() {
    triggerHaptic("click");
    const crashed = gameState.shield <= 0;
    if (crashed) {
        launchGame(true); // Restart from Round 1
    } else {
        if (gameState.currentRound >= 50) {
            launchGame(true); // Restart from Round 1 after grand victory
        } else {
            launchGame(false); // Advance to next round
        }
    }
}

function launchGame(resetSession = true) {
    triggerHaptic("success");
    screenStart.classList.add("hidden");
    screenOver.classList.add("hidden");
    gameHud.classList.remove("hidden");
    resizeCanvas();

    gameState.gameActive = true;
    gameState.timeRemaining = 60; // 1 min
    gameState.score = 0; // reset round score to gather fresh round crystals

    if (resetSession) {
        gameState.currentRound = 1;
    } else {
        gameState.currentRound++;
    }

    // Round speed multipliers: Rd 1 = 1x, Rd 2 = 1.25x, Rd 3 = 1.5x, Rd 4 = 1.75x, Rd 5 = 2.0x
    gameState.speedMultiplier = 1.0 + (gameState.currentRound - 1) * 0.25;
    
    // Shield limits based on upgrade
    const maxShield = gameState.upgrades.shield * 50 + 50;
    gameState.shield = maxShield;
    
    // Clear list entities
    crystalsList = [];
    obstaclesList = [];
    particleList = [];
    floatingTexts = [];
    shockwaveRings = [];
    // Reset upgrade accumulators
    gameState.repairAccum = 0;
    gameState.shockwaveCooldown = 0;
    gameState.nanoshieldTriggered = false;
    frameCount = 0;

    // Reset player position
    playerShip.x = canvasWidth / 2;
    playerShip.targetX = playerShip.x;
    playerShip.tilt = 0;

    // Start timer interval
    if (activeTimer) clearInterval(activeTimer);
    activeTimer = setInterval(updateTimer, 1000);

    // Round speeds remain constant per round baseline
    if (speedScaleTimer) clearInterval(speedScaleTimer);

    // Spawning rates adjusted for round speed
    crystalSpawnRate = Math.max(25, Math.round(60 / gameState.speedMultiplier));
    obstacleSpawnRate = Math.max(35, Math.round(90 / gameState.speedMultiplier));

    // Run active game loop
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);

    updateHUD();
    logDev(`Launched Round ${gameState.currentRound} at Warp ${gameState.speedMultiplier.toFixed(2)}x`);
}

function updateTimer() {
    if (!gameState.gameActive) return;
    
    gameState.timeRemaining--;
    
    // Update Timer display text
    const minutes = Math.floor(gameState.timeRemaining / 60);
    const seconds = gameState.timeRemaining % 60;
    timerVal.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

    if (gameState.timeRemaining <= 0) {
        // Round Win! User completed the 2 minutes
        endGame(true, "ROUND COMPLETED!");
    }
}

function increaseWarpSpeed() {
    if (!gameState.gameActive) return;
    gameState.speedMultiplier += 0.25;
    
    // Increase spawn rates slightly to adjust difficulty
    crystalSpawnRate = Math.max(30, crystalSpawnRate - 5);
    obstacleSpawnRate = Math.max(40, obstacleSpawnRate - 8);

    // Add floating speed text overlay
    pushFloatingText(canvasWidth / 2, canvasHeight / 3, `WARP SPEED UP: ${gameState.speedMultiplier.toFixed(2)}x`, "#ffaa00", 60);
    triggerHaptic("success");
    logDev(`Warp speed increased to ${gameState.speedMultiplier.toFixed(2)}x`);
}

function endGame(completedSuccessfully, reason) {
    gameState.gameActive = false;
    clearInterval(activeTimer);
    if (speedScaleTimer) clearInterval(speedScaleTimer);
    gameHud.classList.add("hidden");
    screenOver.classList.remove("hidden");

    const headerText = screenOver.querySelector("h2");
    const reasonText = document.getElementById("over-reason");
    const btn = document.getElementById("restart-btn");

    // Convert Score/Points collected in round directly to Crystals
    const bonusEngineCoeff = gameState.upgrades.engine * 0.5 + 0.5; // multiplier
    const singularityLevel = gameState.upgrades.singularity || 0;
    const singularityMult = 1.0 + singularityLevel * 0.20; // +20% per level
    const creditsEarned = Math.round(gameState.score * bonusEngineCoeff * singularityMult);
    
    // Accumulate total crystals
    gameState.crystals += creditsEarned;

    // GRAM rewards calculation
    let gramEarned = 0;
    if (completedSuccessfully) {
        gramEarned += 0.01; // Base completion reward
        if (gameState.currentRound % 5 === 0) {
            gramEarned += 0.1; // Milestone bonus
        }
        if (gameState.currentRound === 50) {
            gramEarned += 10.0; // Grand Victory bonus
        }
        // Round to avoid JS floating-point inaccuracies
        gramEarned = Math.round(gramEarned * 100) / 100;
        gameState.gram = Math.round((gameState.gram + gramEarned) * 100) / 100;
    }

    // Check High Score
    if (gameState.score > gameState.highScore) {
        gameState.highScore = gameState.score;
        pushFloatingText(canvasWidth/2, canvasHeight/2, "NEW PERSONAL RECORD!", "#00f3ff", 90);
    }

    saveGameData();

    // Update recap displays
    document.getElementById("recap-crystals").textContent = gameState.score;
    const recapGram = document.getElementById("recap-gram");
    if (recapGram) {
        recapGram.textContent = `+${gramEarned.toFixed(2)} 💎`;
    }

    // Setup visual screens and recap stats based on status and active round number
    if (completedSuccessfully) {
        if (gameState.currentRound >= 50) {
            // Completed Round 50 - GRAND VICTORY!
            headerText.textContent = "GRAND VICTORY";
            headerText.setAttribute("data-text", "GRAND VICTORY");
            
            const victoryBonus = 5000;
            gameState.crystals += victoryBonus;
            saveGameData(); // Save again with victory bonus

            reasonText.textContent = "YOU CONQUERED THE DEEP GRID!";
            reasonText.className = "neon-text-green";

            document.getElementById("recap-round").textContent = "COMPLETED (RD 50)";
            document.getElementById("recap-credits").textContent = `+${creditsEarned} (+${victoryBonus} Bonus!)`;
            btn.textContent = "RESTART FROM RD 1";
        } else {
            // Completed Round 1-49 successfully
            headerText.textContent = "ROUND CLEARED";
            headerText.setAttribute("data-text", "ROUND CLEARED");
            reasonText.textContent = `ROUND ${gameState.currentRound} COMPLETED`;
            reasonText.className = "neon-text-blue";

            document.getElementById("recap-round").textContent = `ROUND ${gameState.currentRound}`;
            document.getElementById("recap-credits").textContent = `+${creditsEarned}${singularityLevel > 0 ? ' (' + singularityMult.toFixed(1) + 'x Mult)' : ''}`;
            btn.textContent = `LAUNCH ROUND ${gameState.currentRound + 1}`;
        }
    } else {
        // Failed / Crashed
        headerText.textContent = "MISSION OVER";
        headerText.setAttribute("data-text", "MISSION OVER");
        reasonText.textContent = "SHIELD DEFLECTORS COMPROMISED";
        reasonText.className = "neon-text-pink";

        document.getElementById("recap-round").textContent = `FAILED (RD ${gameState.currentRound})`;
        document.getElementById("recap-credits").textContent = `+${creditsEarned}`;
        btn.textContent = "RE-ENTER ORBIT";
    }

    document.getElementById("recap-crystals").textContent = gameState.score;

    updateHeaderUI();
    triggerHaptic(completedSuccessfully ? "success" : "collision");
    logDev(`Mission over: ${reason}. Earned +${creditsEarned} credits.`);
}

function updateHUD() {
    hudRoundVal.textContent = gameState.currentRound;
    speedVal.textContent = `${gameState.speedMultiplier.toFixed(2)}x`;
    
    const maxShield = gameState.upgrades.shield * 50 + 50;
    const shieldPct = Math.max(0, (gameState.shield / maxShield) * 100);
    shieldBarFill.style.width = `${shieldPct}%`;
    
    // Shield color changes warning level
    if (shieldPct < 30) {
        shieldBarFill.style.backgroundColor = "var(--neon-magenta)";
        shieldBarFill.style.boxShadow = "var(--neon-glow-magenta)";
    } else {
        shieldBarFill.style.backgroundColor = "var(--neon-green)";
        shieldBarFill.style.boxShadow = "var(--neon-glow-green)";
    }
}


// ==========================================
// --- SCROLLING GAME ANIMATION LOOP ---
// ==========================================

function gameLoop(timestamp) {
    if (!gameState.gameActive) return;

    const dt = timestamp - lastTime;
    lastTime = timestamp;

    updatePhysics(dt);
    drawGameScene();

    frameCount++;
    requestAnimationFrame(gameLoop);
}

// Background Animation Loop for Menu screens (Start, Garage, Leaderboard)
let bgLastTime = 0;
function backgroundAnimationLoop(timestamp) {
    if (gameState.gameActive) return; // let gameLoop take over

    const dt = timestamp - bgLastTime;
    bgLastTime = timestamp;

    // Slowly scroll stars down
    spaceStars.forEach(star => {
        star.y += star.speed * 0.05 * 16;
        if (star.y > 800) {
            star.y = 0;
            star.x = Math.random() * 500;
        }
    });

    // Draw background
    ctx.fillStyle = "#06050b";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw grid
    drawCyberGrid(0.01);

    // Draw stars
    drawBackgroundStars();

    requestAnimationFrame(backgroundAnimationLoop);
}

// Update game mechanics, moving obstacles and collision check
function updatePhysics(dt) {
    // 1. Move Space Ship
    let speedCoeff = gameState.upgrades.engine * 1.5 + 4; // speed multiplier
    // Smooth Lerp ship coordinates towards targetX
    const dx = playerShip.targetX - playerShip.x;
    playerShip.x += dx * 0.15;
    playerShip.tilt = dx * 0.05; // tilt animation based on delta movement

    // Thruster sizing flicker
    playerShip.thrusterScale = 0.8 + Math.random() * 0.4;

    // 2. Scroll background stars
    spaceStars.forEach(star => {
        star.y += star.speed * gameState.speedMultiplier * 0.5 * 16;
        if (star.y > 800) {
            star.y = 0;
            star.x = Math.random() * 500;
        }
    });

    // 3. Spawners — Overclock upgrade reduces frame gap between crystal spawns
    const overclockBonus = gameState.upgrades.overclock * 8;
    const effectiveCrystalRate = Math.max(15, crystalSpawnRate - overclockBonus);
    if (frameCount % effectiveCrystalRate === 0) {
        spawnCrystal();
        // Glitch crystal chance: overclock amplifies frequency, glitch adds rare variant
        const glitchChance = gameState.upgrades.glitch * 0.10;
        if (Math.random() < glitchChance) spawnGlitchCrystal();
    }
    if (frameCount % obstacleSpawnRate === 0) {
        spawnObstacle();
    }

    // Shockwave Burst — fires every 10s if upgraded
    if (gameState.upgrades.shockwave > 0) {
        if (!gameState.shockwaveCooldown) gameState.shockwaveCooldown = 0;
        gameState.shockwaveCooldown -= dt;
        if (gameState.shockwaveCooldown <= 0) {
            const blastRadius = gameState.upgrades.shockwave * 50;
            gameState.shockwaveCooldown = 10000;
            // Remove all obstacles within blast radius
            for (let i = obstaclesList.length - 1; i >= 0; i--) {
                const obs = obstaclesList[i];
                const dist = Math.hypot(playerShip.x - obs.x, playerShip.y - obs.y);
                if (dist < blastRadius) {
                    spawnParticles(obs.x, obs.y, "#ffaa00", 12);
                    obstaclesList.splice(i, 1);
                }
            }
            // Visual shockwave ring stored as a temporary entity
            shockwaveRings.push({ x: playerShip.x, y: playerShip.y, radius: 5, maxRadius: blastRadius, alpha: 1.0 });
            pushFloatingText(playerShip.x, playerShip.y - 30, `⚡ SHOCKWAVE!`, "#ffaa00", 45);
            triggerHaptic("success");
        }
    }

    // Repair Droids — regen shield every second if upgraded
    if (gameState.upgrades.repair > 0) {
        if (!gameState.repairAccum) gameState.repairAccum = 0;
        gameState.repairAccum += dt;
        if (gameState.repairAccum >= 1000) {
            gameState.repairAccum -= 1000;
            const maxShield = gameState.upgrades.shield * 50 + 50;
            const regenAmt = gameState.upgrades.repair * 0.25;
            if (gameState.shield < maxShield) {
                gameState.shield = Math.min(maxShield, gameState.shield + regenAmt);
                updateHUD();
            }
        }
    }

    // 4. Update Crystals & Magnet Effect
    const magnetRadius = gameState.upgrades.magnet * 40; // 0 to 200px
    
    for (let i = crystalsList.length - 1; i >= 0; i--) {
        const cry = crystalsList[i];
        
        // Move downwards
        let dy = cry.speed * gameState.speedMultiplier;
        
        // Magnet pulling logic
        if (magnetRadius > 0) {
            const shipCenterX = playerShip.x;
            const shipCenterY = playerShip.y;
            const dist = Math.hypot(shipCenterX - cry.x, shipCenterY - cry.y);
            
            if (dist < magnetRadius) {
                // Pull crystal towards spaceship
                const angle = Math.atan2(shipCenterY - cry.y, shipCenterX - cry.x);
                // Accelerated pull velocity
                const pullStrength = (1.0 - (dist / magnetRadius)) * 6;
                cry.x += Math.cos(angle) * pullStrength;
                cry.y += Math.sin(angle) * pullStrength;
            }
        }

        cry.y += dy;

        // Bounding collision checks
        if (checkCollision(playerShip, cry)) {
            // Collected! Glitch crystals worth 30, regular worth 10
            const pts = cry.glitch ? 30 : 10;
            gameState.score += pts;
            pushFloatingText(cry.x, cry.y, `+${pts}`, cry.color);
            spawnParticles(cry.x, cry.y, cry.color, cry.glitch ? 14 : 8);
            triggerHaptic("click");
            
            // Remove
            crystalsList.splice(i, 1);
            updateHUD();
            continue;
        }

        // Out of bound check
        if (cry.y > canvasHeight + 20) {
            crystalsList.splice(i, 1);
        }
    }

    // 5. Update Obstacles
    for (let i = obstaclesList.length - 1; i >= 0; i--) {
        const obs = obstaclesList[i];
        obs.y += obs.speed * gameState.speedMultiplier;
        obs.rot += obs.rotSpeed;

        if (checkCollision(playerShip, obs)) {
            // Collision crash!
            const damage = 25;
            gameState.shield = Math.max(0, gameState.shield - damage);
            pushFloatingText(playerShip.x, playerShip.y - 15, `-${damage} SHIELD`, "#ff007f", 40);
            spawnParticles(obs.x, obs.y, "#ff0055", 15);
            triggerHaptic("collision");

            // Shake canvas/screen effect can be visual, remove item
            obstaclesList.splice(i, 1);
            updateHUD();

            // Fail-state check
            if (gameState.shield <= 0) {
                const nsLvl = gameState.upgrades.nanoshield || 0;
                if (nsLvl > 0 && !gameState.nanoshieldTriggered) {
                    gameState.nanoshieldTriggered = true;
                    const maxShield = gameState.upgrades.shield * 50 + 50;
                    // Restore shield: 10% base + 10% per level (up to 60%)
                    gameState.shield = Math.round(maxShield * (0.10 + nsLvl * 0.10));
                    pushFloatingText(playerShip.x, playerShip.y - 30, `🛡️ NANO-SHIELD ACTIVE!`, "#00f3ff", 60);
                    spawnParticles(playerShip.x, playerShip.y, "#00f3ff", 22);
                    triggerHaptic("success");
                    updateHUD();
                } else {
                    endGame(false, "SHIELD DEFLECTORS COMPROMISED!");
                }
            }
            continue;
        }

        if (obs.y > canvasHeight + 30) {
            obstaclesList.splice(i, 1);
        }
    }

    // 6. Update Particles
    for (let i = particleList.length - 1; i >= 0; i--) {
        const p = particleList[i];
        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= 0.03;
        if (p.alpha <= 0) {
            particleList.splice(i, 1);
        }
    }

    // 7. Update Shockwave rings
    for (let i = shockwaveRings.length - 1; i >= 0; i--) {
        const ring = shockwaveRings[i];
        ring.radius += 6;
        ring.alpha = Math.max(0, 1.0 - ring.radius / ring.maxRadius);
        if (ring.alpha <= 0) shockwaveRings.splice(i, 1);
    }

    // 8. Update Floating Text Animations
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
        const t = floatingTexts[i];
        t.y -= 0.8;
        t.timer--;
        if (t.timer <= 0) {
            floatingTexts.splice(i, 1);
        }
    }
}

// Spawning utilities
function spawnCrystal() {
    crystalsList.push({
        x: Math.random() * (canvasWidth - 30) + 15,
        y: -20,
        width: 18,
        height: 22,
        speed: Math.random() * 1.5 + 2.5,
        color: "#00f3ff",
        glitch: false,
        pulse: 0
    });
}

function spawnGlitchCrystal() {
    crystalsList.push({
        x: Math.random() * (canvasWidth - 30) + 15,
        y: -20,
        width: 22,
        height: 28,
        speed: Math.random() * 2 + 3,
        color: "#ff007f",
        glitch: true,
        pulse: 0
    });
}

function spawnObstacle() {
    obstaclesList.push({
        x: Math.random() * (canvasWidth - 40) + 20,
        y: -30,
        width: Math.random() * 14 + 16,
        height: Math.random() * 14 + 16,
        speed: Math.random() * 2 + 2.0,
        rot: Math.random() * Math.PI,
        rotSpeed: Math.random() * 0.04 - 0.02
    });
}

function spawnParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 3 + 1;
        particleList.push({
            x: x,
            y: y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            size: Math.random() * 3 + 1,
            color: color,
            alpha: 1.0
        });
    }
}

function pushFloatingText(x, y, text, color, duration = 30) {
    floatingTexts.push({
        x: x,
        y: y,
        text: text,
        color: color,
        timer: duration
    });
}

// Bounding box collision detection
function checkCollision(ship, entity) {
    const rx = ship.x - ship.width/2;
    const ry = ship.y - ship.height/2;
    const ex = entity.x - entity.width/2;
    const ey = entity.y - entity.height/2;

    return rx < ex + entity.width &&
           rx + ship.width > ex &&
           ry < ey + entity.height &&
           ry + ship.height > ey;
}

// --- DRAWING GRAPHICS ---
function drawGameScene() {
    // 1. Draw solid background
    ctx.fillStyle = "#06050b";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // 2. Draw Scrolling Cyber Grid (Perspective lines overlay)
    drawCyberGrid(gameState.speedMultiplier * 0.05);

    // 3. Draw Stars
    drawBackgroundStars();

    // 4. Draw Crystals
    crystalsList.forEach(cry => {
        cry.pulse += 0.1;
        const bounce = Math.sin(cry.pulse) * 2;
        
        ctx.save();
        ctx.shadowBlur = 10;
        ctx.shadowColor = cry.color;
        ctx.fillStyle = cry.color;
        
        // Draw diamond crystal path
        ctx.beginPath();
        ctx.moveTo(cry.x, cry.y - cry.height/2 + bounce);
        ctx.lineTo(cry.x + cry.width/2, cry.y + bounce);
        ctx.lineTo(cry.x, cry.y + cry.height/2 + bounce);
        ctx.lineTo(cry.x - cry.width/2, cry.y + bounce);
        ctx.closePath();
        ctx.fill();
        
        // Inner core shine
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.moveTo(cry.x, cry.y - 5 + bounce);
        ctx.lineTo(cry.x + 3, cry.y + bounce);
        ctx.lineTo(cry.x, cry.y + 5 + bounce);
        ctx.lineTo(cry.x - 3, cry.y + bounce);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
    });

    // 5. Draw Obstacles (Asteroids)
    obstaclesList.forEach(obs => {
        ctx.save();
        ctx.translate(obs.x, obs.y);
        ctx.rotate(obs.rot);
        
        // Neon red cyber asteroids
        ctx.shadowBlur = 8;
        ctx.shadowColor = "#ff0055";
        ctx.strokeStyle = "#ff0055";
        ctx.lineWidth = 2;
        ctx.fillStyle = "rgba(30, 10, 15, 0.8)";
        
        // Draw octagon/jagged asteroid paths
        ctx.beginPath();
        const pts = 6;
        for (let i = 0; i < pts; i++) {
            const angle = (i / pts) * Math.PI * 2;
            const r = obs.width / 2 + (i % 2 === 0 ? 3 : -3);
            const px = Math.cos(angle) * r;
            const py = Math.sin(angle) * r;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Draw structural crack line
        ctx.beginPath();
        ctx.strokeStyle = "rgba(255, 0, 85, 0.4)";
        ctx.moveTo(-obs.width/4, -obs.height/4);
        ctx.lineTo(obs.width/8, obs.height/8);
        ctx.lineTo(obs.width/4, obs.height/3);
        ctx.stroke();

        ctx.restore();
    });

    // 6. Draw Player Ship
    drawSpaceship();

    // 7. Draw Magnet Ring indicator (subtle pulse ring if upgraded)
    const magnetRadius = gameState.upgrades.magnet * 40;
    if (magnetRadius > 0) {
        ctx.save();
        ctx.strokeStyle = "rgba(0, 243, 255, 0.08)";
        ctx.shadowBlur = 4;
        ctx.shadowColor = "#00f3ff";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(playerShip.x, playerShip.y, magnetRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    // 7b. Draw Targeting Matrix — pulsing ring on nearest crystal
    if (gameState.upgrades.targeting > 0 && crystalsList.length > 0) {
        let nearest = null;
        let nearestDist = Infinity;
        const searchRange = gameState.upgrades.targeting * 80 + 60;
        crystalsList.forEach(cry => {
            const d = Math.hypot(playerShip.x - cry.x, playerShip.y - cry.y);
            if (d < searchRange && d < nearestDist) { nearestDist = d; nearest = cry; }
        });
        if (nearest) {
            const pulse = (Math.sin(Date.now() / 150) * 0.3 + 0.7);
            ctx.save();
            ctx.strokeStyle = `rgba(255, 0, 127, ${pulse})`;
            ctx.shadowBlur = 8;
            ctx.shadowColor = "#ff007f";
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.arc(nearest.x, nearest.y + Math.sin(nearest.pulse) * 2, nearest.width * 1.5, 0, Math.PI * 2);
            ctx.stroke();
            // Draw line from ship to crystal
            ctx.strokeStyle = `rgba(255, 0, 127, ${pulse * 0.3})`;
            ctx.setLineDash([2, 8]);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(playerShip.x, playerShip.y - 10);
            ctx.lineTo(nearest.x, nearest.y);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
        }
    }

    // 7c. Draw Shockwave rings
    shockwaveRings.forEach(ring => {
        ctx.save();
        ctx.globalAlpha = ring.alpha;
        ctx.strokeStyle = "#ffaa00";
        ctx.shadowBlur = 15;
        ctx.shadowColor = "#ffaa00";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    });

    // 8. Draw Particles
    particleList.forEach(p => {
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size/2, p.y - p.size/2, p.size, p.size);
        ctx.restore();
    });

    // 9. Draw Floating texts
    floatingTexts.forEach(t => {
        ctx.save();
        ctx.fillStyle = t.color;
        ctx.font = "900 12px " + gameState.fontCyber;
        ctx.font = "bold 12px 'Share Tech Mono'";
        ctx.shadowBlur = 5;
        ctx.shadowColor = t.color;
        ctx.fillText(t.text, t.x - ctx.measureText(t.text).width/2, t.y);
        ctx.restore();
    });
}

function drawSpaceship() {
    ctx.save();
    ctx.translate(playerShip.x, playerShip.y);
    // Add tilt angle based on velocity
    ctx.rotate(playerShip.tilt);

    // Ship glow shadow
    ctx.shadowBlur = 15;
    ctx.shadowColor = playerShip.glowColor;

    // Thruster engine fire
    const fireScale = playerShip.thrusterScale;
    const grad = ctx.createLinearGradient(0, playerShip.height/2, 0, playerShip.height/2 + 25 * fireScale);
    grad.addColorStop(0, "#00ffff");
    grad.addColorStop(0.3, "#ff00ff");
    grad.addColorStop(1, "rgba(255, 0, 127, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(-6, playerShip.height/2 - 2);
    ctx.lineTo(6, playerShip.height/2 - 2);
    ctx.lineTo(0, playerShip.height/2 + 25 * fireScale);
    ctx.closePath();
    ctx.fill();

    // Main Spaceship Body
    ctx.fillStyle = "rgba(10, 6, 25, 0.9)";
    ctx.strokeStyle = playerShip.glowColor;
    ctx.lineWidth = 2.5;

    ctx.beginPath();
    // Nose point
    ctx.moveTo(0, -playerShip.height/2);
    // Right wing tip
    ctx.lineTo(playerShip.width/2, playerShip.height/4);
    // Right engine exhaust
    ctx.lineTo(10, playerShip.height/2);
    // Exhaust center indent
    ctx.lineTo(0, playerShip.height/3);
    // Left engine exhaust
    ctx.lineTo(-10, playerShip.height/2);
    // Left wing tip
    ctx.lineTo(-playerShip.width/2, playerShip.height/4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Magenta cockpit windshield panel
    ctx.fillStyle = "#ff007f";
    ctx.shadowColor = "#ff007f";
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(0, -playerShip.height/4);
    ctx.lineTo(4, 0);
    ctx.lineTo(0, playerShip.height/12);
    ctx.lineTo(-4, 0);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
}

function drawBackgroundStars() {
    spaceStars.forEach(star => {
        // Map normalized star positions to canvas dimensions
        const cx = (star.x / 500) * canvasWidth;
        const cy = (star.y / 800) * canvasHeight;
        
        ctx.fillStyle = `rgba(255, 255, 255, ${star.brightness})`;
        ctx.fillRect(cx, cy, star.size, star.size);
    });
}

// Cyberpunk grid horizontal lines scrolling past
let gridOffset = 0;
function drawCyberGrid(speed) {
    gridOffset += speed * 4;
    if (gridOffset >= 40) gridOffset = 0;

    ctx.strokeStyle = "rgba(0, 243, 255, 0.04)";
    ctx.lineWidth = 1;

    // Draw horizontal scrolling gridlines
    for (let y = gridOffset; y < canvasHeight; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvasWidth, y);
        ctx.stroke();
    }

    // Draw vertical perspective gridlines
    const cols = 8;
    for (let i = 0; i <= cols; i++) {
        const x = (i / cols) * canvasWidth;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvasHeight);
        ctx.stroke();
    }
}


// ==========================================
// --- DEV MOCK CONTROL PANEL LOGIC ---
// ==========================================

function toggleDevPanel() {
    const panel = document.getElementById("dev-mock-panel");
    const icon = document.getElementById("dev-toggle-icon");
    panel.classList.toggle("collapsed");
    icon.textContent = panel.classList.contains("collapsed") ? "▲" : "▼";
}

function updateMockUser() {
    const usr = document.getElementById("mock-username").value;
    const name = document.getElementById("mock-firstname").value;
    
    // Fallback if blank
    gameState.pilot.username = usr ? (usr.startsWith("@") ? usr : `@${usr}`) : "@guest";
    gameState.pilot.firstName = name || "Pilot";
    
    updateHeaderUI();
    logDev(`Mock Profile updated: ${gameState.pilot.username}`);
}

function changeMockTheme() {
    const sel = document.getElementById("mock-theme").value;
    document.body.className = "cyber-theme"; // base
    
    if (sel === "telegram-native") {
        document.body.classList.add("telegram-native");
        applyTelegramTheme();
        logDev("Applied simulated Telegram WebApp Native Theme");
    } else {
        document.body.classList.add(sel);
        logDev(`Theme switched to ${sel.replace('cyber-', '').toUpperCase()}`);
    }
}

function applyTelegramTheme() {
    const tg = window.Telegram?.WebApp;
    if (tg && tg.themeParams) {
        // Set actual properties from Telegram client variables
        const body = document.body;
        body.style.setProperty('--tg-theme-bg-color', tg.themeParams.bg_color);
        body.style.setProperty('--tg-theme-text-color', tg.themeParams.text_color);
        body.style.setProperty('--tg-theme-button-color', tg.themeParams.button_color);
        body.style.setProperty('--tg-theme-link-color', tg.themeParams.link_color);
    } else {
        // Mock Telegram Native parameters in standard browser
        const body = document.body;
        body.style.setProperty('--tg-theme-bg-color', '#17212b');
        body.style.setProperty('--tg-theme-text-color', '#f5f6f7');
        body.style.setProperty('--tg-theme-button-color', '#5288c1');
        body.style.setProperty('--tg-theme-link-color', '#6ab3f3');
    }
}

function addMockCrystals(amount) {
    gameState.crystals += amount;
    saveGameData();
    updateHeaderUI();
    updateGarageUI();
    logDev(`Added +${amount} crystals to balance!`);
}

function addMockGram(amount) {
    gameState.gram += amount;
    saveGameData();
    updateHeaderUI();
    updateGarageUI();
    logDev(`Added +${amount} GRAM to balance!`);
}

function resetMockSave() {
    localStorage.removeItem("cyberflyer_save_data");
    gameState.crystals = 0;
    gameState.gram = 0;
    gameState.highScore = 0;
    gameState.upgrades = {
        shield: 1,
        magnet: 0,
        engine: 1,
        repair: 0,
        glitch: 0,
        overclock: 0,
        shockwave: 0,
        targeting: 0,
        nanoshield: 0,
        singularity: 0
    };
    
    updateHeaderUI();
    updateGarageUI();
    logDev("Save game data cleared.");
}

function logDev(msg) {
    const logBox = document.getElementById("dev-log");
    const timestamp = new Date().toLocaleTimeString();
    logBox.innerHTML = `[${timestamp}] ${msg}<br>` + logBox.innerHTML;
}

// ==========================================
// --- SECRET ADMIN OVERRIDE ENGINE ---
// ==========================================
let adminTapCount = 0;
let adminTapTimer = null;

function checkAdminUrlParam() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('admin') === 'true' || params.get('dev') === 'true') {
        setTimeout(() => revealAdminConsole("URL override detected"), 500);
    }
}

function setupSecretAdminTaps() {
    // Bind secret gesture to HUD pilot tag click
    const pilotInfo = document.querySelector(".pilot-info");
    if (pilotInfo) {
        pilotInfo.style.cursor = "pointer";
        pilotInfo.addEventListener("click", registerAdminTap);
    }

    // Also bind to start screen logo title
    const logoText = document.querySelector("#screen-start .logo-text");
    if (logoText) {
        logoText.style.cursor = "pointer";
        logoText.addEventListener("click", registerAdminTap);
    }
}

function registerAdminTap() {
    adminTapCount++;
    clearTimeout(adminTapTimer);
    
    // 3-second timeout window to enter the code sequence
    adminTapTimer = setTimeout(() => {
        adminTapCount = 0;
    }, 3000);

    if (adminTapCount >= 5) {
        revealAdminConsole("Secret tap sequence completed");
        adminTapCount = 0;
    }
}

function revealAdminConsole(reason) {
    const panel = document.getElementById("dev-mock-panel");
    if (panel) {
        panel.classList.remove("hidden");
        panel.classList.remove("collapsed");
        triggerHaptic("success");
        logDev(`[ADMIN] Override Enabled: ${reason}`);
        
        // Push an admin alert overlay floating text
        pushFloatingText(canvasWidth / 2, canvasHeight / 2, "ADMIN SYSTEM ACCESS GRANTED", "#00f3ff", 120);
    }
}

function maxAllUpgrades() {
    triggerHaptic("success");
    const types = ["shield", "magnet", "engine", "repair", "glitch", "overclock", "shockwave", "targeting", "nanoshield", "singularity"];
    types.forEach(type => {
        gameState.upgrades[type] = UPGRADE_MAX;
    });
    saveGameData();
    updateHeaderUI();
    updateGarageUI();
    logDev("[ADMIN] All upgrades set to level 5 (MAX)!");
}

function adminWarpRound() {
    const select = document.getElementById("admin-round-select");
    if (!select) return;
    
    const targetRound = parseInt(select.value, 10);
    if (isNaN(targetRound) || targetRound < 1 || targetRound > 50) return;
    
    triggerHaptic("success");
    gameState.currentRound = targetRound;
    gameState.speedMultiplier = 1.0 + (targetRound - 1) * 0.25;
    
    logDev(`[ADMIN] Warped directly to Round ${targetRound} (Speed: ${gameState.speedMultiplier.toFixed(2)}x)`);
    
    // Update HUD round displays
    const hudRound = document.getElementById("hud-round-val");
    if (hudRound) hudRound.textContent = targetRound;
    
    const speedEl = document.getElementById("speed-val");
    if (speedEl) speedEl.textContent = `${gameState.speedMultiplier.toFixed(2)}x`;
    
    pushFloatingText(canvasWidth / 2, canvasHeight / 2, `WARPED TO ROUND ${targetRound}`, "#ff007f", 100);
    
    // Reset round timer to 60s
    gameState.timeRemaining = 60;
    const timerEl = document.getElementById("timer-val");
    if (timerEl) timerEl.textContent = "01:00";
    
    updateHeaderUI();
    updateGarageUI();
}


const tg = window.Telegram.WebApp;

tg.ready();
tg.expand();

const balanceElement = document.getElementById("balance");
const earnButton = document.getElementById("earnButton");
const upgradeButton = document.getElementById("upgradeButton");

let state = null;
let pendingClicks = 0;
let flushTimer = null;
let flushPromise = null;
let upgrading = false;

function formatCoins(value) {
    return (value / 1000000000).toFixed(10).replace(".", ",");
}

function updateUI() {
    if (!state) return;

    balanceElement.textContent =
        formatCoins(state.balance + pendingClicks * state.income) +
        " коинов";

    earnButton.textContent = "+" + formatCoins(state.income);

    upgradeButton.textContent =
        "Улучшение — " + formatCoins(state.upgrade_cost) + " коинов";
}

async function api(action = null, count = null) {
    const options = {
        method: action ? "POST" : "GET",
        headers: {
            "X-Telegram-Init-Data": tg.initData
        }
    };

    if (action) {
        options.headers["Content-Type"] = "application/json";
        options.body = JSON.stringify({ action, count });
    }

    const response = await fetch("/api/state", options);
    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || "Ошибка сервера");
    }

    return data;
}

function scheduleFlush() {
    if (flushTimer) clearTimeout(flushTimer);

    flushTimer = setTimeout(() => {
        flushQueue().catch(error => {
            tg.showAlert("Ошибка сохранения: " + error.message);
        });
    }, 120);
}

async function flushQueue() {
    if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
    }

    if (flushPromise) {
        await flushPromise;
        if (pendingClicks > 0) return flushQueue();
        return;
    }

    flushPromise = (async () => {
        while (pendingClicks > 0) {
            const count = Math.min(pendingClicks, 1000);
            const result = await api("earn_batch", count);

            pendingClicks -= count;
            state = result;
            updateUI();
        }
    })();

    try {
        await flushPromise;
    } finally {
        flushPromise = null;
    }
}

function earn() {
    if (!state || upgrading) return;

    pendingClicks++;
    updateUI();
    scheduleFlush();
}

async function upgrade() {
    if (!state || upgrading) return;

    upgrading = true;
    upgradeButton.disabled = true;

    try {
        await flushQueue();
        state = await api("upgrade");
        updateUI();
    } catch (error) {
        tg.showAlert(error.message);
    } finally {
        upgrading = false;
        upgradeButton.disabled = false;
    }
}

// РУЛЕТКА — БЕСПЛАТНЫЙ ГЕНЕРАТОР РЕЗУЛЬТАТА

const numbers = [
    0, 32, 15, 19, 4, 21, 2, 25, 17,
    34, 6, 27, 13, 36, 11, 30, 8, 23,
    10, 5, 24, 16, 33, 1, 20, 14, 31,
    9, 22, 18, 29, 7, 28, 12, 35, 3, 26
];

const redNumbers = [
    1, 3, 5, 7, 9, 12, 14, 16, 18,
    19, 21, 23, 25, 27, 30, 32, 34, 36
];

const wheel = document.getElementById("wheel");
const ball = document.getElementById("ball");
const spinButton = document.getElementById("spinButton");
const resultElement = document.getElementById("rouletteResult");
const messageElement = document.getElementById("rouletteMessage");
const historyElement = document.getElementById("rouletteHistory");

const SEGMENT = 360 / numbers.length;

let spinning = false;
let wheelRotation = 0;
let history = [];
let labels = [];

function normalizeAngle(angle) {
    return ((angle % 360) + 360) % 360;
}

function getColor(number) {
    if (number === 0) return "green";
    return redNumbers.includes(number) ? "red" : "black";
}

function getColorHex(number) {
    const color = getColor(number);

    if (color === "red") return "#b92c35";
    if (color === "green") return "#16834b";
    return "#171923";
}

// Позиция текста и его ориентация компенсируют поворот колеса.
function updateLabels(rotation) {
    labels.forEach(label => {
        const angle = Number(label.dataset.angle);

        label.style.transform =
            `rotate(${angle}deg) translateY(-108px) ` +
            `rotate(${-angle - rotation}deg)`;
    });
}

function createWheel() {
    const gradient = numbers.map((number, index) => {
        const start = index * SEGMENT;
        const end = (index + 1) * SEGMENT;

        return `${getColorHex(number)} ${start}deg ${end}deg`;
    });

    wheel.style.background =
        `conic-gradient(${gradient.join(",")})`;

    wheel.querySelectorAll(".wheel-number").forEach(el => el.remove());

    labels = [];

    numbers.forEach((number, index) => {
        const label = document.createElement("div");
        const angle = (index + 0.5) * SEGMENT;

        label.className = "wheel-number";
        label.textContent = number;
        label.dataset.angle = angle;

        label.style.position = "absolute";
        label.style.left = "50%";
        label.style.top = "50%";
        label.style.width = "24px";
        label.style.height = "18px";
        label.style.lineHeight = "18px";
        label.style.marginLeft = "-12px";
        label.style.marginTop = "-9px";
        label.style.textAlign = "center";
        label.style.fontSize = "11px";
        label.style.fontWeight = "bold";
        label.style.color = "white";
        label.style.pointerEvents = "none";
        label.style.zIndex = "2";

        wheel.appendChild(label);
        labels.push(label);
    });

    updateLabels(0);
}

// Перемещаем шарик из вращающегося колеса
// в неподвижную рамку, чтобы он вращался независимо.
const wheelFrame = wheel.parentElement;

if (ball && wheelFrame) {
    wheelFrame.appendChild(ball);
    ball.style.transform = "translate(-50%, -50%)";
}

function setBallPosition(angle, radius) {
    const rad = angle * Math.PI / 180;

    const x = Math.sin(rad) * radius;
    const y = -Math.cos(rad) * radius;

    ball.style.left = `calc(50% + ${x}px)`;
    ball.style.top = `calc(50% + ${y}px)`;
}

function getTargetRotation(index) {
    const sectorCenter = (index + 0.5) * SEGMENT;

    // В CSS conic-gradient 0 градусов — это верх колеса.
    const desired = normalizeAngle(-sectorCenter);
    const current = normalizeAngle(wheelRotation);
    const extra = normalizeAngle(desired - current);

    return wheelRotation + 360 * 7 + extra;
}

function renderHistory() {
    historyElement.innerHTML = "";

    history.forEach(item => {
        const chip = document.createElement("span");

        chip.textContent = item.number;
        chip.style.display = "inline-grid";
        chip.style.placeItems = "center";
        chip.style.width = "32px";
        chip.style.height = "32px";
        chip.style.borderRadius = "50%";
        chip.style.background = getColorHex(item.number);
        chip.style.color = "white";
        chip.style.fontWeight = "bold";

        historyElement.appendChild(chip);
    });
}

function showResult(number) {
    const color = getColor(number);

    resultElement.textContent = number;

    resultElement.style.color =
        color === "red" ? "#ff525b" :
        color === "green" ? "#39d98a" : "white";

    messageElement.textContent =
        color === "green" ? "Зелёное" :
        color === "red" ? "Красное" : "Чёрное";

    history.unshift({ number });
    history = history.slice(0, 12);

    renderHistory();
}

function spin() {
    if (spinning || !wheel || !ball) return;

    spinning = true;
    spinButton.disabled = true;

    resultElement.textContent = "?";
    messageElement.textContent = "Колесо вращается...";

    const index = Math.floor(Math.random() * numbers.length);
    const number = numbers[index];

    const duration = 6500;
    const startTime = performance.now();

    const startRotation = wheelRotation;
    const targetRotation = getTargetRotation(index);

    const ballTurns = 7;

    function frame(now) {
        const progress = Math.min(
            (now - startTime) / duration,
            1
        );

        const eased = 1 - Math.pow(1 - progress, 3);

        const currentRotation =
            startRotation +
            (targetRotation - startRotation) * eased;

        wheel.style.transform =
            `rotate(${currentRotation}deg)`;

        updateLabels(currentRotation);

        // Шарик движется в противоположную сторону.
        const ballAngle = -360 * ballTurns * eased;

        // В конце шарик опускается к выбранному сектору.
        const drop = Math.max(0, (progress - 0.82) / 0.18);
        const radius = 119 - 22 * drop;

        setBallPosition(ballAngle, radius);

        if (progress < 1) {
            requestAnimationFrame(frame);
        } else {
            wheelRotation = targetRotation;

            wheel.style.transform =
                `rotate(${wheelRotation}deg)`;

            updateLabels(wheelRotation);

            // Верхний указатель и выбранный сектор совпадают.
            setBallPosition(0, 97);

            showResult(number);

            spinning = false;
            spinButton.disabled = false;
        }
    }

    requestAnimationFrame(frame);
}

createWheel();

if (spinButton) {
    spinButton.addEventListener("click", spin);
}

async function loadGame() {
    try {
        if (!tg.initData) {
            throw new Error("Открой игру через Telegram");
        }

        state = await api();
        updateUI();
    } catch (error) {
        tg.showAlert("Не удалось загрузить игру: " + error.message);
    }
}

earnButton.addEventListener("click", earn);
upgradeButton.addEventListener("click", upgrade);

loadGame();

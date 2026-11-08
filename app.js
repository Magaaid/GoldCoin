
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

        if (pendingClicks > 0 && !flushTimer) {
            scheduleFlush();
        }
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

// РУЛЕТКА

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

let spinning = false;
let wheelRotation = 0;
let history = [];

const SEGMENT = 360 / numbers.length;
const POINTER_ANGLE = -90;

function getColor(number) {
    if (number === 0) return "green";
    return redNumbers.includes(number) ? "red" : "black";
}

function getColorHex(number) {
    const color = getColor(number);

    return color === "red" ? "#b92c35" :
        color === "green" ? "#16834b" : "#171923";
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

    numbers.forEach((number, index) => {
        const label = document.createElement("div");
        const angle = (index + 0.5) * SEGMENT;

        label.className = "wheel-number";
        label.textContent = number;
        label.style.position = "absolute";
        label.style.left = "50%";
        label.style.top = "50%";
        label.style.width = "24px";
        label.style.marginLeft = "-12px";
        label.style.textAlign = "center";
        label.style.fontSize = "11px";
        label.style.fontWeight = "bold";
        label.style.color = "white";
        label.style.pointerEvents = "none";
        label.style.transform =
            `rotate(${angle}deg) translateY(-108px) rotate(-${angle}deg)`;
        label.style.zIndex = "2";

        wheel.appendChild(label);
    });
}

function normalizeAngle(angle) {
    return ((angle % 360) + 360) % 360;
}

function getTargetRotation(index) {
    const sectorCenter = (index + 0.5) * SEGMENT;

    const current = normalizeAngle(wheelRotation);

    const desired = normalizeAngle(
        POINTER_ANGLE - sectorCenter
    );

    const extra = normalizeAngle(desired - current);

    return wheelRotation + 360 * 7 + extra;
}

function animateBall(targetAngle, duration) {
    const start = performance.now();

    const startAngle = -90;
    const rotations = 7;

    const totalAngle =
        startAngle - rotations * 360 +
        (targetAngle - startAngle);

    function frame(now) {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);

        const angle =
            startAngle + (totalAngle - startAngle) * eased;

        const radius =
            progress < 0.82
                ? 119
                : 119 - 22 * ((progress - 0.82) / 0.18);

        const rad = angle * Math.PI / 180;

        ball.style.left =
            `calc(50% + ${Math.cos(rad) * radius}px)`;

        ball.style.top =
            `calc(50% + ${Math.sin(rad) * radius}px)`;

        if (progress < 1) {
            requestAnimationFrame(frame);
        } else {
            const finalRad = targetAngle * Math.PI / 180;

            ball.style.left =
                `calc(50% + ${Math.cos(finalRad) * 97}px)`;

            ball.style.top =
                `calc(50% + ${Math.sin(finalRad) * 97}px)`;
        }
    }

    requestAnimationFrame(frame);
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
        color === "green" ? "Зелёный" :
        color === "red" ? "Красное" : "Чёрное";

    history.unshift({ number });
    history = history.slice(0, 12);

    renderHistory();
}

function spin() {
    if (spinning) return;

    spinning = true;
    spinButton.disabled = true;

    resultElement.textContent = "?";
    messageElement.textContent = "Колесо вращается...";

    const index = Math.floor(Math.random() * numbers.length);
    const number = numbers[index];

    const duration = 6000;

    const sectorCenter = (index + 0.5) * SEGMENT;

    // После вращения центр выбранного сектора окажется наверху.
    const targetRotation = getTargetRotation(index);

    // Финальная позиция шарика относительно центра колеса.
    // Угол считается с учётом поворота самого колеса.
    const ballAngle = normalizeAngle(
        POINTER_ANGLE - targetRotation
    );

    wheelRotation = targetRotation;

    wheel.style.transition =
        `transform ${duration}ms cubic-bezier(0.12, 0.65, 0.12, 1)`;

    wheel.style.transform =
        `rotate(${targetRotation}deg)`;

    animateBall(ballAngle, duration);

    setTimeout(() => {
        showResult(number);

        spinning = false;
        spinButton.disabled = false;
    }, duration + 100);
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

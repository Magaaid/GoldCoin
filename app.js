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

async function api(action = null, extra = {}) {
    const options = {
        method: action ? "POST" : "GET",
        headers: {
            "X-Telegram-Init-Data": tg.initData
        }
    };

    if (action) {
        options.headers["Content-Type"] = "application/json";
        options.body = JSON.stringify({ action, ...extra });
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
            const result = await api("earn_batch", { count });

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
    if (!state || upgrading || spinning) return;

    pendingClicks++;
    updateUI();
    scheduleFlush();
}

async function upgrade() {
    if (!state || upgrading || spinning) return;

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

function animateSpin(number, onDone) {
    const index = numbers.indexOf(number);

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

            onDone();
        }
    }

    requestAnimationFrame(frame);
}

async function spin() {
    if (spinning || upgrading || !wheel || !ball || !state) return;

    if (!selectedPrediction) {
        tg.showAlert("Сначала выбери прогноз");
        return;
    }

    const amount = parseBet();

    if (!betAll && !amount) {
        tg.showAlert("Введи сумму ставки");
        return;
    }

    spinning = true;
    spinButton.disabled = true;

    resultElement.textContent = "?";
    messageElement.textContent = "Колесо вращается...";

    let result;

    try {
        // Сначала сохраняем накликанное, потом крутим на сервере
        await flushQueue();

        result = await api("spin", {
            choice: selectedPrediction,
            amount: amount,
            all: betAll
        });
    } catch (error) {
        tg.showAlert(error.message);
        messageElement.textContent = "Нажми, чтобы запустить колесо";
        spinning = false;
        spinButton.disabled = false;
        return;
    }

    const balanceBefore = state.balance;
    const choiceName = predictionNames[selectedPrediction];

    animateSpin(result.number, () => {
        // Баланс обновляем только после анимации
        state = {
            balance: result.balance,
            income: result.income,
            upgrade_cost: result.upgrade_cost
        };
        updateUI();

        showResult(result.number);

        const delta = Math.abs(result.balance - balanceBefore);

        predictionStatus.textContent = result.win
            ? `Победа! ${choiceName}. Выпало ${result.number}. +${formatCoins(delta)} коинов`
            : `Проигрыш. ${choiceName}. Выпало ${result.number}. −${formatCoins(delta)} коинов`;

        selectedPrediction = null;
        predictionButtons.forEach(item => item.classList.remove("selected"));

        spinning = false;
        spinButton.disabled = false;
    });
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

// СИСТЕМА ПРОГНОЗОВ И СТАВОК

let selectedPrediction = null;
let betAll = false;

const predictionStatus =
    document.getElementById("predictionStatus");

const predictionButtons =
    document.querySelectorAll(".prediction-option[data-choice]");

const quickButtons =
    document.querySelectorAll(".prediction-option[data-fraction]");

const betInput = document.getElementById("betInput");

const predictionMultipliers = {
    red: 1.9,
    black: 1.9,
    even: 1.9,
    odd: 1.9,
    zero: 36
};

const predictionNames = {
    red: "Красное",
    black: "Чёрное",
    even: "Чётное",
    odd: "Нечётное",
    zero: "Ноль"
};

// Введённые коины -> внутренние единицы баланса
function parseBet() {
    const raw = betInput.value.trim().replace(",", ".");
    const coins = Number(raw);

    if (!raw || !Number.isFinite(coins) || coins <= 0) return null;

    return Math.round(coins * 1000000000);
}

function updateSelectionStatus() {
    if (!selectedPrediction) {
        predictionStatus.textContent = "Прогноз не выбран";
        return;
    }

    predictionStatus.textContent =
        "Прогноз: " + predictionNames[selectedPrediction] +
        " ×" + predictionMultipliers[selectedPrediction];
}

predictionButtons.forEach(button => {
    button.addEventListener("click", () => {
        if (spinning) return;

        predictionButtons.forEach(item => {
            item.classList.remove("selected");
        });

        button.classList.add("selected");
        selectedPrediction = button.dataset.choice;

        updateSelectionStatus();
    });
});

// Ручной ввод сбрасывает режим «Всё»
betInput.addEventListener("input", () => {
    betAll = false;
    quickButtons.forEach(item => item.classList.remove("selected"));
});

quickButtons.forEach(button => {
    button.addEventListener("click", () => {
        if (spinning || !state) return;

        const fraction = Number(button.dataset.fraction);

        quickButtons.forEach(item => item.classList.remove("selected"));
        button.classList.add("selected");

        betAll = fraction === 1;
        betInput.value = formatCoins(Math.floor(state.balance * fraction));
    });
});

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
        " байтов";

    earnButton.textContent = "+" + formatCoins(state.income);
    upgradeButton.textContent =
        "Улучшение — " + formatCoins(state.upgrade_cost) + " байтов";
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
const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];

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

function updateLabels(rotation) {
    labels.forEach(label => {
        const angle = Number(label.dataset.angle);
        label.style.transform = `rotate(${angle}deg) translateY(-108px) rotate(${-angle - rotation}deg)`;
    });
}

function createWheel() {
    const gradient = numbers.map((number, index) => {
        const start = index * SEGMENT;
        const end = (index + 1) * SEGMENT;
        return `${getColorHex(number)} ${start}deg ${end}deg`;
    });

    wheel.style.background = `conic-gradient(${gradient.join(",")})`;
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
    resultElement.style.color = color === "red" ? "#ff525b" : color === "green" ? "#39d98a" : "white";
    messageElement.textContent = color === "green" ? "Зелёное" : color === "red" ? "Красное" : "Чёрное";

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
        const progress = Math.min((now - startTime) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const currentRotation = startRotation + (targetRotation - startRotation) * eased;

        wheel.style.transform = `rotate(${currentRotation}deg)`;
        updateLabels(currentRotation);

        const ballAngle = -360 * ballTurns * eased;
        const drop = Math.max(0, (progress - 0.82) / 0.18);
        const radius = 119 - 22 * drop;

        setBallPosition(ballAngle, radius);

        if (progress < 1) {
            requestAnimationFrame(frame);
        } else {
            wheelRotation = targetRotation;
            wheel.style.transform = `rotate(${wheelRotation}deg)`;
            updateLabels(wheelRotation);
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
        tg.showAlert("Введи сумму ставки (мин. 100 байтов)");
        return;
    }

    spinning = true;
    spinButton.disabled = true;
    resultElement.textContent = "?";
    messageElement.textContent = "Колесо вращается...";

    let result;
    try {
        await flushQueue();
        result = await api("spin", { choice: selectedPrediction, amount: amount, all: betAll });
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
        state = { balance: result.balance, income: result.income, upgrade_cost: result.upgrade_cost };
        updateUI();
        showResult(result.number);

        const delta = Math.abs(result.balance - balanceBefore);
        predictionStatus.textContent = result.win
            ? `Победа! ${choiceName}. Выпало ${result.number}. +${formatCoins(delta)} байтов`
            : `Проигрыш. ${choiceName}. Выпало ${result.number}. −${formatCoins(delta)} байтов`;

        selectedPrediction = null;
        predictionButtons.forEach(item => item.classList.remove("selected"));
        spinning = false;
        spinButton.disabled = false;
    });
}

createWheel();
if (spinButton) spinButton.addEventListener("click", spin);

async function loadGame() {
    try {
        if (!tg.initData) throw new Error("Открой игру через Telegram");
        state = await api();
        updateUI();
    } catch (error) {
        tg.showAlert("Не удалось загрузить игру: " + error.message);
    }
}

earnButton.addEventListener("click", earn);
upgradeButton.addEventListener("click", upgrade);
loadGame();

// СТАВКА
let betAll = false;
const betInput = document.getElementById("betInput");
const quickButtons = document.querySelectorAll(".prediction-option[data-fraction]");

function parseBet() {
    const raw = betInput.value.trim().replace(",", ".");
    const coins = Number(raw);
    if (!raw || !Number.isFinite(coins) || coins < 0.0000001) return null;
    return Math.round(coins * 1000000000);
}

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

// ПРОГНОЗЫ РУЛЕТКИ
let selectedPrediction = null;
const predictionStatus = document.getElementById("predictionStatus");
const predictionButtons = document.querySelectorAll(".prediction-option[data-choice]");
const predictionMultipliers = { red: 1.9, black: 1.9, even: 1.9, odd: 1.9, zero: 36 };
const predictionNames = { red: "Красное", black: "Чёрное", even: "Чётное", odd: "Нечётное", zero: "Ноль" };

predictionButtons.forEach(button => {
    button.addEventListener("click", () => {
        if (spinning) return;
        predictionButtons.forEach(item => item.classList.remove("selected"));
        button.classList.add("selected");
        selectedPrediction = button.dataset.choice;
        predictionStatus.textContent = "Прогноз: " + predictionNames[selectedPrediction] + " ×" + predictionMultipliers[selectedPrediction];
    });
});

// МОНЕТКА
let selectedCoin = null;
let coinRotation = 0;
const coinElement = document.getElementById("coin");
const coinButton = document.getElementById("coinButton");
const coinStatus = document.getElementById("coinStatus");
const coinChoiceButtons = document.querySelectorAll(".prediction-option[data-coin]");
const coinNames = { heads: "Орёл", tails: "Решка" };

coinChoiceButtons.forEach(button => {
    button.addEventListener("click", () => {
        if (spinning) return;
        coinChoiceButtons.forEach(item => item.classList.remove("selected"));
        button.classList.add("selected");
        selectedCoin = button.dataset.coin;
        coinStatus.textContent = "Выбрано: " + coinNames[selectedCoin] + " ×1.9";
    });
});

function animateCoin(side, onDone) {
    const needed = side === "heads" ? 0 : 180;
    const current = normalizeAngle(coinRotation);
    const extra = normalizeAngle(needed - current);
    coinRotation = coinRotation + 360 * 5 + extra;
    coinElement.style.transform = `rotateY(${coinRotation}deg)`;
    setTimeout(onDone, 2100);
}

async function flipCoin() {
    if (spinning || upgrading || !state) return;
    if (!selectedCoin) {
        tg.showAlert("Сначала выбери орла или решку");
        return;
    }

    const amount = parseBet();
    if (!betAll && !amount) {
        tg.showAlert("Введи сумму ставки (мин. 100 байтов)");
        return;
    }

    spinning = true;
    coinButton.disabled = true;
    coinStatus.textContent = "Монета в воздухе...";

    let result;
    try {
        await flushQueue();
        result = await api("coin", { choice: selectedCoin, amount: amount, all: betAll });
    } catch (error) {
        tg.showAlert(error.message);
        coinStatus.textContent = "Выбери сторону и сумму ставки";
        spinning = false;
        coinButton.disabled = false;
        return;
    }

    const balanceBefore = state.balance;
    const choiceName = coinNames[selectedCoin];

    animateCoin(result.side, () => {
        state = { balance: result.balance, income: result.income, upgrade_cost: result.upgrade_cost };
        updateUI();

        const delta = Math.abs(result.balance - balanceBefore);
        const sideName = coinNames[result.side];

        coinStatus.textContent = result.win
            ? `Победа! Выпал ${sideName}. +${formatCoins(delta)} байтов`
            : `Проигрыш. Выпал ${sideName} (ты ставил на ${choiceName.toLowerCase()}). −${formatCoins(delta)} байтов`;

        selectedCoin = null;
        coinChoiceButtons.forEach(item => item.classList.remove("selected"));
        spinning = false;
        coinButton.disabled = false;
    });
}
if (coinButton) coinButton.addEventListener("click", flipCoin);

// СЛОТЫ И БОНУСЫ (GATES OF OLYMPUS REALISTIC)
const slotGridElement = document.getElementById("slotGrid");
const slotButton = document.getElementById("slotButton");
const buyBonusButton = document.getElementById("buyBonusButton");
const slotStatus = document.getElementById("slotStatus");
const zeusBadge = document.getElementById("zeusMultiplierBadge");

// Тематические иконки (сокровища Олимпа)
const symbolData = {
    1: { icon: "💎", name: "Синий кристалл" },
    2: { icon: "🟢", name: "Зеленый кристалл" },
    3: { icon: "🟡", name: "Желтый кристалл" },
    4: { icon: "🟠", name: "Оранжевый кристалл" },
    5: { icon: "🟣", name: "Фиолетовый кристалл" },
    6: { icon: "🏆", name: "Золотая чаша" },
    7: { icon: "💍", name: "Рубиновое кольцо" },
    8: { icon: "⏳", name: "Песочные часы" },
    9: { icon: "👑", name: "Золотая корона" },
    10: { icon: "⚡", name: "Зевс (Scatter)" }
};

function renderSlotGrid(grid) {
    if (!slotGridElement) return;
    slotGridElement.innerHTML = "";
    
    grid.forEach(row => {
        row.forEach(sym => {
            const cell = document.createElement("div");
            cell.className = "slot-cell";
            if (sym === 10) cell.classList.add("scatter-cell");
            if (sym >= 8) cell.classList.add("high-cell");
            
            cell.textContent = symbolData[sym]?.icon || "💎";
            slotGridElement.appendChild(cell);
        });
    });
}

async function requestSlotSpin(isBonus = false) {
    if (spinning || upgrading || !state) return;

    let amount = parseBet();
    if (betAll) {
        amount = state.balance;
    }

    if (isBonus) {
        // Стоимость бонуски — ровно в 100 раз больше текущей ставки (или мин. 100 байтов)
        amount = Math.max(100, (amount || 1000) * 100);
        if (amount > 10000000000) {
            tg.showAlert("Максимальная стоимость бонуски — 10 000 000 байтов");
            return;
        }
    }

    if (!amount || amount < 100) {
        tg.showAlert("Минимальная ставка или стоимость бонуски — 100 байтов");
        return;
    }

    spinning = true;
    slotButton.disabled = true;
    buyBonusButton.disabled = true;
    slotStatus.textContent = isBonus ? "🎁 Зевс активирует бонусные фриспины!" : "⚡ Молния Зевса бьет по барабанам...";
    zeusBadge.textContent = "⚡ ×1";

    let result;
    try {
        await flushQueue();
        result = await api("slot", { amount: amount, all: betAll, isBonus: isBonus });
    } catch (error) {
        tg.showAlert(error.message);
        slotStatus.textContent = "Ошибка запуска слотов";
        spinning = false;
        slotButton.disabled = false;
        buyBonusButton.disabled = false;
        return;
    }

    const balanceBefore = state.balance;

    // Анимация падения символов (каскад)
    let counter = 0;
    const interval = setInterval(() => {
        renderSlotGrid(
            Array.from({ length: 5 }, () =>
                Array.from({ length: 6 }, () => Math.floor(Math.random() * 9) + 1)
            )
        );
        counter++;
        if (counter > 12) {
            clearInterval(interval);
            renderSlotGrid(result.grid);

            state = { balance: result.balance, income: result.income, upgrade_cost: result.upgrade_cost };
            updateUI();

            const delta = Math.abs(result.balance - balanceBefore);
            if (result.zeus > 0) {
                zeusBadge.textContent = `⚡ ×${result.zeus}`;
            }

            if (result.win) {
                slotStatus.textContent = isBonus
                    ? `🎉 БОНУСКА ОКУПИЛАСЬ! Множитель ×${result.slotMultiplier}! Выигрыш: +${formatCoins(delta)} байтов`
                    : `⚡ Победа! Множитель ×${result.slotMultiplier}! +${formatCoins(delta)} байтов`;
            } else {
                slotStatus.textContent = `Манна богов исчерпана. Попробуй еще! −${formatCoins(amount)} байтов`;
            }

            spinning = false;
            slotButton.disabled = false;
            buyBonusButton.disabled = false;
        }
    }, 90);
}

if (slotButton) slotButton.addEventListener("click", () => requestSlotSpin(false));
if (buyBonusButton) buyBonusButton.addEventListener("click", () => requestSlotSpin(true));

// Первичная отрисовка сетки
renderSlotGrid(
    Array.from({ length: 5 }, () =>
        Array.from({ length: 6 }, () => Math.floor(Math.random() * 9) + 1)
    )
);

// ВКЛАДКИ
const tabButtons = document.querySelectorAll(".tab-button");
const gameViews = document.querySelectorAll(".game-view");

tabButtons.forEach(button => {
    button.addEventListener("click", () => {
        if (spinning) return;
        tabButtons.forEach(item => item.classList.remove("active"));
        button.classList.add("active");

        gameViews.forEach(view => {
            view.classList.toggle("hidden", view.id !== "game-" + button.dataset.game);
        });
    });
});

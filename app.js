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
    
    updateBonusButtonCost();
}

async function api(action = null, extra = {}) {
    const options = {
        method: action ? "POST" : "GET",
        headers: { "X-Telegram-Init-Data": tg.initData }
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

const wheelFrame = wheel ? wheel.parentElement : null;
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

if (wheel) createWheel();
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

// СТАВКА И БОНУСКА
let betAll = false;
const betInput = document.getElementById("betInput");
const quickButtons = document.querySelectorAll(".prediction-option[data-fraction]");
const buyBonusButton = document.getElementById("buyBonusButton");

function parseBet() {
    const raw = betInput.value.trim().replace(",", ".");
    const coins = Number(raw);
    if (!raw || !Number.isFinite(coins) || coins < 1) return null;
    return Math.round(coins * 1000000000);
}

function updateBonusButtonCost() {
    if (!buyBonusButton) return;
    let amount = parseBet();
    if (betAll && state) {
        amount = state.balance;
    }
    
    if (amount && amount > 0) {
        const bonusCost = amount * 100;
        buyBonusButton.textContent = `🎁 КУПИТЬ БОНУСКУ — ${formatCoins(bonusCost)}`;
    } else {
        buyBonusButton.textContent = `🎁 КУПИТЬ БОНУСКУ (×100)`;
    }
}

betInput.addEventListener("input", () => {
    betAll = false;
    quickButtons.forEach(item => item.classList.remove("selected"));
    updateBonusButtonCost();
});

quickButtons.forEach(button => {
    button.addEventListener("click", () => {
        if (spinning || !state) return;
        const fraction = Number(button.dataset.fraction);
        quickButtons.forEach(item => item.classList.remove("selected"));
        button.classList.add("selected");
        betAll = fraction === 1;
        betInput.value = formatCoins(Math.floor(state.balance * fraction));
        updateBonusButtonCost();
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

// СЛОТЫ И БОНУСКА (ЧИСТОЕ ПЛАВНОЕ ПАДЕНИЕ ПО КОЛОНКАМ С 1 ПО 6)
const slotGridElement = document.getElementById("slotGrid");
const slotButton = document.getElementById("slotButton");
const slotStatus = document.getElementById("slotStatus");
const zeusBadge = document.getElementById("zeusMultiplierBadge");

const symbolData = {
    1: { icon: "💎" }, 2: { icon: "🟢" }, 3: { icon: "🟡" },
    4: { icon: "🟠" }, 5: { icon: "🟣" }, 6: { icon: "🏆" },
    7: { icon: "💍" }, 8: { icon: "⏳" }, 9: { icon: "👑" },
    10: { icon: "⚡" }
};

function renderSlotGrid(grid, animate = true) {
    if (!slotGridElement) return;
    slotGridElement.innerHTML = "";
    
    grid.forEach((row, rIndex) => {
        row.forEach((sym, cIndex) => {
            const cell = document.createElement("div");
            cell.className = "slot-cell";
            if (animate) {
                cell.classList.add("animate-drop");
                cell.style.animationDelay = `${cIndex * 70}ms`;
            }
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
    if (betAll) amount = state.balance;
    if (!amount) amount = 1000000000;

    spinning = true;
    slotButton.disabled = true;
    buyBonusButton.disabled = true;

    let result;
    try {
        await flushQueue();
        result = await api("slot", { amount: amount, all: betAll, isBonus: isBonus });
    } catch (error) {
        tg.showAlert(error.message);
        slotStatus.textContent = error.message;
        spinning = false;
        slotButton.disabled = false;
        buyBonusButton.disabled = false;
        return;
    }

    if (isBonus) {
        let currentSpin = 1;
        slotStatus.textContent = `🎁 БОНУСКА АКТИВИРОВАНА! Спин 1 из 15...`;
        zeusBadge.textContent = `⚡ ×1`;

        const bonusInterval = setInterval(() => {
            renderSlotGrid(
                Array.from({ length: 5 }, () =>
                    Array.from({ length: 6 }, () => Math.floor(Math.random() * 9) + 1)
                ),
                false
            );

            currentSpin++;
            if (currentSpin <= 15) {
                slotStatus.textContent = `🎁 Бесплатное вращение ${currentSpin} из 15...`;
            } else {
                clearInterval(bonusInterval);
                renderSlotGrid(result.grid, true);

                state = { balance: result.balance, income: result.income, upgrade_cost: result.upgrade_cost };
                updateUI();

                zeusBadge.textContent = `⚡ ×${result.zeus}`;
                if (result.zeus > 0) {
                    const frame = document.querySelector(".olympus-frame");
                    if (frame) {
                        frame.classList.remove("zeus-flash");
                        void frame.offsetWidth;
                        frame.classList.add("zeus-flash");
                    }
                }

                const bonusCost = amount * 100;
                const netProfit = (amount * result.slotMultiplier) - bonusCost;
                const formattedDelta = formatCoins(Math.abs(netProfit));

                if (netProfit >= 0) {
                    slotStatus.textContent = `🎉 БОНУСКА ЗАВЕРШЕНА! Множитель ×${result.slotMultiplier}! Выигрыш: +${formattedDelta} байтов`;
                } else {
                    slotStatus.textContent = `💀 БОНУСКА ЗАВЕРШЕНА! Множитель ×${result.slotMultiplier}. В минус: −${formattedDelta} байтов`;
                }

                spinning = false;
                slotButton.disabled = false;
                buyBonusButton.disabled = false;
            }
        }, 300);

    } else {
        slotStatus.textContent = `⚡ Барабаны крутятся...`;
        let counter = 0;
        const interval = setInterval(() => {
            renderSlotGrid(
                Array.from({ length: 5 }, () =>
                    Array.from({ length: 6 }, () => Math.floor(Math.random() * 9) + 1)
                ),
                false
            );
            counter++;
            if (counter > 10) {
                clearInterval(interval);
                renderSlotGrid(result.grid, true);

                state = { balance: result.balance, income: result.income, upgrade_cost: result.upgrade_cost };
                updateUI();

                zeusBadge.textContent = `⚡ ×${result.zeus}`;
                if (result.zeus > 0) {
                    const frame = document.querySelector(".olympus-frame");
                    if (frame) {
                        frame.classList.remove("zeus-flash");
                        void frame.offsetWidth;
                        frame.classList.add("zeus-flash");
                    }
                }

                if (result.win) {
                    slotStatus.textContent = `⚡ Победа! Множитель ×${result.slotMultiplier}! +${formatCoins(Math.abs(amount * result.slotMultiplier - amount))} байтов`;
                } else {
                    slotStatus.textContent = `Манна богов исчерпана. Попробуй еще!`;
                }

                spinning = false;
                slotButton.disabled = false;
                buyBonusButton.disabled = false;
            }
        }, 80);
    }
}

if (slotButton) slotButton.addEventListener("click", () => requestSlotSpin(false));
if (buyBonusButton) buyBonusButton.addEventListener("click", () => requestSlotSpin(true));

renderSlotGrid(
    Array.from({ length: 5 }, () =>
        Array.from({ length: 6 }, () => Math.floor(Math.random() * 9) + 1)
    ),
    false
);

// ПРОМОКОДЫ
const promoInput = document.getElementById("promoInput");
const promoButton = document.getElementById("promoButton");
const promoStatus = document.getElementById("promoStatus");

async function redeemPromo() {
    const code = promoInput.value.trim();
    if (!code) {
        promoStatus.textContent = "Введите промокод!";
        promoStatus.style.color = "#ff525b";
        return;
    }

    promoButton.disabled = true;
    promoStatus.textContent = "Проверка...";
    promoStatus.style.color = "#aab1c0";

    try {
        await flushQueue();
        const result = await api("redeem_promo", { code });

        state = { balance: result.balance, income: result.income, upgrade_cost: result.upgrade_cost };
        updateUI();

        promoStatus.textContent = `🎉 Промокод активирован! Награда зачислена.`;
        promoStatus.style.color = "#39d98a";
        promoInput.value = "";
    } catch (error) {
        promoStatus.textContent = error.message;
        promoStatus.style.color = "#ff525b";
    } finally {
        promoButton.disabled = false;
    }
}

if (promoButton) promoButton.addEventListener("click", redeemPromo);

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

// AVIAMASTERS (Рандомный полет с генерацией секторов и шансом победы 15%)
const aviaButton = document.getElementById("aviaButton");
const aviaMultiplierElement = document.getElementById("aviaMultiplier");
const aviaStatus = document.getElementById("aviaStatus");
const planeContainer = document.getElementById("planeContainer");

async function playAviamasters() {
    if (spinning || upgrading || !state) return;

    let amount = parseBet();
    if (betAll) amount = state.balance;
    if (!amount) {
        tg.showAlert("Введи сумму ставки!");
        return;
    }

    spinning = true;
    aviaButton.disabled = true;
    if (buyBonusButton) buyBonusButton.disabled = true;

    aviaStatus.textContent = "✈️ Самолет заходит на взлетную полосу...";
    
    // Возможные типы секторов для случайного выпадения
    const possibleSteps = [
        { type: "add", val: 0.3, text: "📈 Набор высоты (+0.3)" },
        { type: "add", val: 0.6, text: "📈 Отличный подъем (+0.6)" },
        { type: "sub", val: 0.4, text: "⚠️ Потеря высоты (−0.4)" },
        { type: "sub", val: 0.8, text: "⚠️ Сильный снос (−0.8)" },
        { type: "mult", val: 1.5, text: "🚀 Ускорение (×1.5)" },
        { type: "mult", val: 2.0, text: "🔥 Супер-ускорение (×2)" },
        { type: "div", val: 1.3, text: "💨 Турбулентность (÷1.3)" },
        { type: "div", val: 1.8, text: "🌪️ Мощный вихрь (÷1.8)" }
    ];

    // Генерируем случайную длину пути (от 6 до 10 шагов) и выбираем сектора рандомно
    const totalSteps = Math.floor(Math.random() * 5) + 6;
    const pathSteps = [];
    for (let i = 0; i < totalSteps; i++) {
        const randomStep = possibleSteps[Math.floor(Math.random() * possibleSteps.length)];
        pathSteps.push({ ...randomStep });
    }

    let currentStep = 0;
    let finalMultiplier = 1.00;

    const flightInterval = setInterval(async () => {
        if (currentStep < pathSteps.length) {
            const step = pathSteps[currentStep];
            
            if (step.type === "add") finalMultiplier += step.val;
            else if (step.type === "mult") finalMultiplier *= step.val;
            else if (step.type === "div") finalMultiplier /= step.val;
            else if (step.type === "sub") finalMultiplier = Math.max(0.1, finalMultiplier - step.val);

            finalMultiplier = Math.max(0.05, Number(finalMultiplier.toFixed(2)));
            
            aviaMultiplierElement.textContent = `×${finalMultiplier}`;
            aviaStatus.textContent = step.text;
            
            aviaMultiplierElement.style.color = (step.type === "div" || step.type === "sub") ? "#ff525b" : "#38bdf8";

            if (planeContainer) {
                const yOffset = (step.type === "div" || step.type === "sub") ? 12 : -12;
                planeContainer.style.transform = `translate(${currentStep * 8}px, ${yOffset}px) rotate(${(step.type === "div" || step.type === "sub") ? -15 : 15}deg)`;
            }

            currentStep++;
        } else {
            clearInterval(flightInterval);

            // Жесткий шанс на краш: 85% проигрыша, 15% победы
            const isCrashed = Math.random() < 0.85;

            if (isCrashed) {
                finalMultiplier = 0;
                aviaMultiplierElement.textContent = "0.00";
                aviaMultiplierElement.style.color = "#ff525b";
                aviaStatus.textContent = "💥 Ракета сбила самолет! Ставка сгорела.";
            } else {
                aviaMultiplierElement.style.color = "#38bdf8";
                aviaStatus.textContent = `🎉 Эпический пролет! Итоговый множитель: ×${finalMultiplier.toFixed(2)}`;
            }

            try {
                await flushQueue();
                const result = await api("spin", { choice: isCrashed ? "zero" : "red", amount: amount, all: betAll });
                state = { balance: result.balance, income: result.income, upgrade_cost: result.upgrade_cost };
                updateUI();
            } catch (e) {
                if (isCrashed) {
                    state.balance = Math.max(0, state.balance - amount);
                } else {
                    state.balance += Math.floor(amount * finalMultiplier);
                }
                updateUI();
            }

            setTimeout(() => {
                aviaMultiplierElement.style.color = "#38bdf8";
                if (planeContainer) planeContainer.style.transform = "none";
                aviaButton.disabled = false;
                spinning = false;
                aviaMultiplierElement.textContent = "×1.00";
                aviaStatus.textContent = "Сделай ставку и взлетай!";
            }, 2500);
        }
    }, 550);
}

if (aviaButton) {
    aviaButton.addEventListener("click", playAviamasters);
}

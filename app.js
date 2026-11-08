Const tg = window.Telegram.WebApp;

tg.ready();
tg.expand();

Const balanceElement = document.getElementById("balance");
Const earnButton = document.getElementById("earnButton");
Const upgradeButton = document.getElementById("upgradeButton");

Let state = null;
Let pendingClicks = 0;
Let flushTimer = null;
Let flushPromise = null;
Let upgrading = false;

Function formatCoins(value) {
    Return (value / 1000000000).toFixed(10).replace(".", ",");
}

Function updateUI() {
    If (!state) return;

    BalanceElement.textContent =
        FormatCoins(state.balance + pendingClicks * state.income) +
        " байтов";

    EarnButton.textContent = "+" + formatCoins(state.income);
    UpgradeButton.textContent =
        "Улучшение — " + formatCoins(state.upgrade_cost) + " байтов";
    
    UpdateBonusButtonCost();
}

Async function api(action = null, extra = {}) {
    Const options = {
        Method: action ? "POST" : "GET",
        Headers: { "X-Telegram-Init-Data": tg.initData }
    };

    If (action) {
        Options.headers["Content-Type"] = "application/json";
        Options.body = JSON.stringify({ action, ...extra });
    }

    Const response = await fetch("/api/state", options);
    Const data = await response.json();

    If (!response.ok) {
        Throw new Error(data.error || "Ошибка сервера");
    }

    Return data;
}

Function scheduleFlush() {
    If (flushTimer) clearTimeout(flushTimer);
    FlushTimer = setTimeout(() => {
        FlushQueue().catch(error => {
            Tg.showAlert("Ошибка сохранения: " + error.message);
        });
    }, 120);
}

Async function flushQueue() {
    If (flushTimer) {
        ClearTimeout(flushTimer);
        FlushTimer = null;
    }

    If (flushPromise) {
        Await flushPromise;
        If (pendingClicks > 0) return flushQueue();
        Return;
    }

    FlushPromise = (async () => {
        While (pendingClicks > 0) {
            Const count = Math.min(pendingClicks, 1000);
            Const result = await api("earn_batch", { count });
            PendingClicks -= count;
            State = result;
            UpdateUI();
        }
    })();

    Try {
        Await flushPromise;
    } finally {
        FlushPromise = null;
    }
}

Function earn() {
    If (!state || upgrading || spinning) return;
    PendingClicks++;
    UpdateUI();
    ScheduleFlush();
}

Async function upgrade() {
    If (!state || upgrading || spinning) return;
    Upgrading = true;
    UpgradeButton.disabled = true;

    Try {
        Await flushQueue();
        State = await api("upgrade");
        UpdateUI();
    } catch (error) {
        Tg.showAlert(error.message);
    } finally {
        Upgrading = false;
        UpgradeButton.disabled = false;
    }
}

// РУЛЕТКА
Const numbers = [
    0, 32, 15, 19, 4, 21, 2, 25, 17,
    34, 6, 27, 13, 36, 11, 30, 8, 23,
    10, 5, 24, 16, 33, 1, 20, 14, 31,
    9, 22, 18, 29, 7, 28, 12, 35, 3, 26
];
Const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];

Const wheel = document.getElementById("wheel");
Const ball = document.getElementById("ball");
Const spinButton = document.getElementById("spinButton");
Const resultElement = document.getElementById("rouletteResult");
Const messageElement = document.getElementById("rouletteMessage");
Const historyElement = document.getElementById("rouletteHistory");

Const SEGMENT = 360 / numbers.length;
Let spinning = false;
Let wheelRotation = 0;
Let history = [];
Let labels = [];

Function normalizeAngle(angle) {
    Return ((angle % 360) + 360) % 360;
}

Function getColor(number) {
    If (number === 0) return "green";
    Return redNumbers.includes(number) ? "red" : "black";
}

Function getColorHex(number) {
    Const color = getColor(number);
    If (color === "red") return "#b92c35";
    If (color === "green") return "#16834b";
    Return "#171923";
}

Function updateLabels(rotation) {
    Labels.forEach(label => {
        Const angle = Number(label.dataset.angle);
        Label.style.transform = `rotate(${angle}deg) translateY(-108px) rotate(${-angle - rotation}deg)`;
    });
}

Function createWheel() {
    Const gradient = numbers.map((number, index) => {
        Const start = index * SEGMENT;
        Const end = (index + 1) * SEGMENT;
        Return `${getColorHex(number)} ${start}deg ${end}deg`;
    });

    Wheel.style.background = `conic-gradient(${gradient.join(",")})`;
    Wheel.querySelectorAll(".wheel-number").forEach(el => el.remove());
    Labels = [];

    Numbers.forEach((number, index) => {
        Const label = document.createElement("div");
        Const angle = (index + 0.5) * SEGMENT;

        Label.className = "wheel-number";
        Label.textContent = number;
        Label.dataset.angle = angle;

        Label.style.position = "absolute";
        Label.style.left = "50%";
        Label.style.top = "50%";
        Label.style.width = "24px";
        Label.style.height = "18px";
        Label.style.lineHeight = "18px";
        Label.style.marginLeft = "-12px";
        Label.style.marginTop = "-9px";
        Label.style.textAlign = "center";
        Label.style.fontSize = "11px";
        Label.style.fontWeight = "bold";
        Label.style.color = "white";
        Label.style.pointerEvents = "none";
        Label.style.zIndex = "2";

        Wheel.appendChild(label);
        Labels.push(label);
    });

    UpdateLabels(0);
}

Const wheelFrame = wheel.parentElement;
If (ball && wheelFrame) {
    WheelFrame.appendChild(ball);
    Ball.style.transform = "translate(-50%, -50%)";
}

Function setBallPosition(angle, radius) {
    Const rad = angle * Math.PI / 180;
    Const x = Math.sin(rad) * radius;
    Const y = -Math.cos(rad) * radius;
    Ball.style.left = `calc(50% + ${x}px)`;
    Ball.style.top = `calc(50% + ${y}px)`;
}

Function getTargetRotation(index) {
    Const sectorCenter = (index + 0.5) * SEGMENT;
    Const desired = normalizeAngle(-sectorCenter);
    Const current = normalizeAngle(wheelRotation);
    Const extra = normalizeAngle(desired - current);
    Return wheelRotation + 360 * 7 + extra;
}

Function renderHistory() {
    HistoryElement.innerHTML = "";
    History.forEach(item => {
        Const chip = document.createElement("span");
        Chip.textContent = item.number;
        Chip.style.display = "inline-grid";
        Chip.style.placeItems = "center";
        Chip.style.width = "32px";
        Chip.style.height = "32px";
        Chip.style.borderRadius = "50%";
        Chip.style.background = getColorHex(item.number);
        Chip.style.color = "white";
        Chip.style.fontWeight = "bold";
        HistoryElement.appendChild(chip);
    });
}

Function showResult(number) {
    Const color = getColor(number);
    ResultElement.textContent = number;
    ResultElement.style.color = color === "red" ? "#ff525b" : color === "green" ? "#39d98a" : "white";
    MessageElement.textContent = color === "green" ? "Зелёное" : color === "red" ? "Красное" : "Чёрное";

    History.unshift({ number });
    History = history.slice(0, 12);
    RenderHistory();
}

Function animateSpin(number, onDone) {
    Const index = numbers.indexOf(number);
    Const duration = 6500;
    Const startTime = performance.now();
    Const startRotation = wheelRotation;
    Const targetRotation = getTargetRotation(index);
    Const ballTurns = 7;

    Function frame(now) {
        Const progress = Math.min((now - startTime) / duration, 1);
        Const eased = 1 - Math.pow(1 - progress, 3);
        Const currentRotation = startRotation + (targetRotation - startRotation) * eased;

        Wheel.style.transform = `rotate(${currentRotation}deg)`;
        UpdateLabels(currentRotation);

        Const ballAngle = -360 * ballTurns * eased;
        Const drop = Math.max(0, (progress - 0.82) / 0.18);
        Const radius = 119 - 22 * drop;

        SetBallPosition(ballAngle, radius);

        If (progress < 1) {
            RequestAnimationFrame(frame);
        } else {
            WheelRotation = targetRotation;
            Wheel.style.transform = `rotate(${wheelRotation}deg)`;
            UpdateLabels(wheelRotation);
            SetBallPosition(0, 97);
            OnDone();
        }
    }
    RequestAnimationFrame(frame);
}

Async function spin() {
    If (spinning || upgrading || !wheel || !ball || !state) return;
    If (!selectedPrediction) {
        Tg.showAlert("Сначала выбери прогноз");
        Return;
    }

    Const amount = parseBet();
    If (!betAll && !amount) {
        Tg.showAlert("Введи сумму ставки (мин. 100 байтов)");
        Return;
    }

    Spinning = true;
    SpinButton.disabled = true;
    ResultElement.textContent = "?";
    MessageElement.textContent = "Колесо вращается...";

    Let result;
    Try {
        Await flushQueue();
        Result = await api("spin", { choice: selectedPrediction, amount: amount, all: betAll });
    } catch (error) {
        Tg.showAlert(error.message);
        MessageElement.textContent = "Нажми, чтобы запустить колесо";
        Spinning = false;
        SpinButton.disabled = false;
        Return;
    }

    Const balanceBefore = state.balance;
    Const choiceName = predictionNames[selectedPrediction];

    AnimateSpin(result.number, () => {
        State = { balance: result.balance, income: result.income, upgrade_cost: result.upgrade_cost };
        UpdateUI();
        ShowResult(result.number);

        Const delta = Math.abs(result.balance - balanceBefore);
        PredictionStatus.textContent = result.win
            ? `Победа! ${choiceName}. Выпало ${result.number}. +${formatCoins(delta)} байтов`
            : `Проигрыш. ${choiceName}. Выпало ${result.number}. −${formatCoins(delta)} байтов`;

        SelectedPrediction = null;
        PredictionButtons.forEach(item => item.classList.remove("selected"));
        Spinning = false;
        SpinButton.disabled = false;
    });
}

CreateWheel();
If (spinButton) spinButton.addEventListener("click", spin);

Async function loadGame() {
    Try {
        If (!tg.initData) throw new Error("Открой игру через Telegram");
        State = await api();
        UpdateUI();
    } catch (error) {
        Tg.showAlert("Не удалось загрузить игру: " + error.message);
    }
}

EarnButton.addEventListener("click", earn);
UpgradeButton.addEventListener("click", upgrade);
LoadGame();

// СТАВКА И БОНУСКА
Let betAll = false;
Const betInput = document.getElementById("betInput");
Const quickButtons = document.querySelectorAll(".prediction-option[data-fraction]");
Const buyBonusButton = document.getElementById("buyBonusButton");

Function parseBet() {
    Const raw = betInput.value.trim().replace(",", ".");
    Const coins = Number(raw);
    If (!raw || !Number.isFinite(coins) || coins < 1) return null;
    Return Math.round(coins * 1000000000);
}

Function updateBonusButtonCost() {
    If (!buyBonusButton) return;
    Let amount = parseBet();
    If (betAll && state) {
        Amount = state.balance;
    }
    
    If (amount && amount > 0) {
        Const bonusCost = amount * 100;
        BuyBonusButton.textContent = `🎁 КУПИТЬ БОНУСКУ — ${formatCoins(bonusCost)}`;
    } else {
        BuyBonusButton.textContent = `🎁 КУПИТЬ БОНУСКУ (×100)`;
    }
}

BetInput.addEventListener("input", () => {
    BetAll = false;
    QuickButtons.forEach(item => item.classList.remove("selected"));
    UpdateBonusButtonCost();
});

QuickButtons.forEach(button => {
    Button.addEventListener("click", () => {
        If (spinning || !state) return;
        Const fraction = Number(button.dataset.fraction);
        QuickButtons.forEach(item => item.classList.remove("selected"));
        Button.classList.add("selected");
        BetAll = fraction === 1;
        BetInput.value = formatCoins(Math.floor(state.balance * fraction));
        UpdateBonusButtonCost();
    });
});

// ПРОГНОЗЫ РУЛЕТКИ
Let selectedPrediction = null;
Const predictionStatus = document.getElementById("predictionStatus");
Const predictionButtons = document.querySelectorAll(".prediction-option[data-choice]");
Const predictionMultipliers = { red: 1.9, black: 1.9, even: 1.9, odd: 1.9, zero: 36 };
Const predictionNames = { red: "Красное", black: "Чёрное", even: "Чётное", odd: "Нечётное", zero: "Ноль" };

PredictionButtons.forEach(button => {
    Button.addEventListener("click", () => {
        If (spinning) return;
        PredictionButtons.forEach(item => item.classList.remove("selected"));
        Button.classList.add("selected");
        SelectedPrediction = button.dataset.choice;
        PredictionStatus.textContent = "Прогноз: " + predictionNames[selectedPrediction] + " ×" + predictionMultipliers[selectedPrediction];
    });
});

// МОНЕТКА
Let selectedCoin = null;
Let coinRotation = 0;
Const coinElement = document.getElementById("coin");
Const coinButton = document.getElementById("coinButton");
Const coinStatus = document.getElementById("coinStatus");
Const coinChoiceButtons = document.querySelectorAll(".prediction-option[data-coin]");
Const coinNames = { heads: "Орёл", tails: "Решка" };

CoinChoiceButtons.forEach(button => {
    Button.addEventListener("click", () => {
        If (spinning) return;
        CoinChoiceButtons.forEach(item => item.classList.remove("selected"));
        Button.classList.add("selected");
        SelectedCoin = button.dataset.coin;
        CoinStatus.textContent = "Выбрано: " + coinNames[selectedCoin] + " ×1.9";
    });
});

Function animateCoin(side, onDone) {
    Const needed = side === "heads" ? 0 : 180;
    Const current = normalizeAngle(coinRotation);
    Const extra = normalizeAngle(needed - current);
    CoinRotation = coinRotation + 360 * 5 + extra;
    CoinElement.style.transform = `rotateY(${coinRotation}deg)`;
    SetTimeout(onDone, 2100);
}

Async function flipCoin() {
    If (spinning || upgrading || !state) return;
    If (!selectedCoin) {
        Tg.showAlert("Сначала выбери орла или решку");
        Return;
    }

    Const amount = parseBet();
    If (!betAll && !amount) {
        Tg.showAlert("Введи сумму ставки (мин. 100 байтов)");
        Return;
    }

    Spinning = true;
    CoinButton.disabled = true;
    CoinStatus.textContent = "Монета в воздухе...";

    Let result;
    Try {
        Await flushQueue();
        Result = await api("coin", { choice: selectedCoin, amount: amount, all: betAll });
    } catch (error) {
        Tg.showAlert(error.message);
        CoinStatus.textContent = "Выбери сторону и сумму ставки";
        Spinning = false;
        CoinButton.disabled = false;
        Return;
    }

    Const balanceBefore = state.balance;
    Const choiceName = coinNames[selectedCoin];

    AnimateCoin(result.side, () => {
        State = { balance: result.balance, income: result.income, upgrade_cost: result.upgrade_cost };
        UpdateUI();

        Const delta = Math.abs(result.balance - balanceBefore);
        Const sideName = coinNames[result.side];

        CoinStatus.textContent = result.win
            ? `Победа! Выпал ${sideName}. +${formatCoins(delta)} байтов`
            : `Проигрыш. Выпал ${sideName} (ты ставил на ${choiceName.toLowerCase()}). −${formatCoins(delta)} байтов`;

        SelectedCoin = null;
        CoinChoiceButtons.forEach(item => item.classList.remove("selected"));
        Spinning = false;
        CoinButton.disabled = false;
    });
}
If (coinButton) coinButton.addEventListener("click", flipCoin);

// СЛОТЫ И БОНУСКА (С КАСКАДНЫМ ПАДЕНИЕМ И ВСПЫШКОЙ ЗЕВСА)
Const slotGridElement = document.getElementById("slotGrid");
Const slotButton = document.getElementById("slotButton");
Const slotStatus = document.getElementById("slotStatus");
Const zeusBadge = document.getElementById("zeusMultiplierBadge");

Const symbolData = {
    1: { icon: "💎" }, 2: { icon: "🟢" }, 3: { icon: "🟡" },
    4: { icon: "🟠" }, 5: { icon: "🟣" }, 6: { icon: "🏆" },
    7: { icon: "💍" }, 8: { icon: "⏳" }, 9: { icon: "👑" },
    10: { icon: "⚡" }
};

Function renderSlotGrid(grid, animate = true) {
    If (!slotGridElement) return;
    SlotGridElement.innerHTML = "";
    
    Grid.forEach((row, rIndex) => {
        Row.forEach((sym, cIndex) => {
            Const cell = document.createElement("div");
            Cell.className = "slot-cell";
            If (animate) {
                Cell.classList.add("animate-drop");
                Cell.style.animationDelay = `${(cIndex * 35) + (rIndex * 15)}ms`;
            }
            If (sym === 10) cell.classList.add("scatter-cell");
            If (sym >= 8) cell.classList.add("high-cell");
            Cell.textContent = symbolData[sym]?.icon || "💎";
            SlotGridElement.appendChild(cell);
        });
    });
}

Async function requestSlotSpin(isBonus = false) {
    If (spinning || upgrading || !state) return;

    Let amount = parseBet();
    If (betAll) amount = state.balance;
    If (!amount) amount = 1000000000;

    Spinning = true;
    SlotButton.disabled = true;
    BuyBonusButton.disabled = true;

    Let result;
    Try {
        Await flushQueue();
        Result = await api("slot", { amount: amount, all: betAll, isBonus: isBonus });
    } catch (error) {
        Tg.showAlert(error.message);
        SlotStatus.textContent = error.message;
        Spinning = false;
        SlotButton.disabled = false;
        BuyBonusButton.disabled = false;
        Return;
    }

    If (isBonus) {
        Let currentSpin = 1;
        SlotStatus.textContent = `🎁 БОНУСКА АКТИВИРОВАНА! Спин 1 из 15...`;
        ZeusBadge.textContent = `⚡ ×1`;

        Const bonusInterval = setInterval(() => {
            RenderSlotGrid(
                Array.from({ length: 5 }, () =>
                    Array.from({ length: 6 }, () => Math.floor(Math.random() * 9) + 1)
                ),
                True
            );

            CurrentSpin++;
            If (currentSpin <= 15) {
                SlotStatus.textContent = `🎁 Бесплатное вращение ${currentSpin} из 15...`;
            } else {
                ClearInterval(bonusInterval);
                RenderSlotGrid(result.grid, true);

                State = { balance: result.balance, income: result.income, upgrade_cost: result.upgrade_cost };
                UpdateUI();

                ZeusBadge.textContent = `⚡ ×${result.zeus}`;
                If (result.zeus > 0) {
                    Const frame = document.querySelector(".olympus-frame");
                    If (frame) {
                        Frame.classList.remove("zeus-flash");
                        Void frame.offsetWidth;
                        Frame.classList.add("zeus-flash");
                    }
                }

                Const bonusCost = amount * 100;
                Const netProfit = (amount * result.slotMultiplier) - bonusCost;
                Const formattedDelta = formatCoins(Math.abs(netProfit));

                If (netProfit >= 0) {
                    SlotStatus.textContent = `🎉 БОНУСКА ЗАВЕРШЕНА! Множитель ×${result.slotMultiplier}! Выигрыш: +${formattedDelta} байтов`;
                } else {
                    SlotStatus.textContent = `💀 БОНУСКА ЗАВЕРШЕНА! Множитель ×${result.slotMultiplier}. В минус: −${formattedDelta} байтов`;
                }

                Spinning = false;
                SlotButton.disabled = false;
                BuyBonusButton.disabled = false;
            }
        }, 300);

    } else {
        SlotStatus.textContent = `⚡ Барабаны крутятся...`;
        Let counter = 0;
        Const interval = setInterval(() => {
            RenderSlotGrid(
                Array.from({ length: 5 }, () =>
                    Array.from({ length: 6 }, () => Math.floor(Math.random() * 9) + 1)
                ),
                True
            );
            Counter++;
            If (counter > 14) {
                ClearInterval(interval);
                RenderSlotGrid(result.grid, true);

                State = { balance: result.balance, income: result.income, upgrade_cost: result.upgrade_cost };
                UpdateUI();

                ZeusBadge.textContent = `⚡ ×${result.zeus}`;
                If (result.zeus > 0) {
                    Const frame = document.querySelector(".olympus-frame");
                    If (frame) {
                        Frame.classList.remove("zeus-flash");
                        Void frame.offsetWidth;
                        Frame.classList.add("zeus-flash");
                    }
                }

                If (result.win) {
                    SlotStatus.textContent = `⚡ Победа! Множитель ×${result.slotMultiplier}! +${formatCoins(Math.abs(amount * result.slotMultiplier - amount))} байтов`;
                } else {
                    SlotStatus.textContent = `Манна богов исчерпана. Попробуй еще!`;
                }

                Spinning = false;
                SlotButton.disabled = false;
                BuyBonusButton.disabled = false;
            }
        }, 100);
    }
}

If (slotButton) slotButton.addEventListener("click", () => requestSlotSpin(false));
If (buyBonusButton) buyBonusButton.addEventListener("click", () => requestSlotSpin(true));

RenderSlotGrid(
    Array.from({ length: 5 }, () =>
        Array.from({ length: 6 }, () => Math.floor(Math.random() * 9) + 1)
    ),
    False
);

// ПРОМОКОДЫ
Const promoInput = document.getElementById("promoInput");
Const promoButton = document.getElementById("promoButton");
Const promoStatus = document.getElementById("promoStatus");

Async function redeemPromo() {
    Const code = promoInput.value.trim();
    If (!code) {
        PromoStatus.textContent = "Введите промокод!";
        PromoStatus.style.color = "#ff525b";
        Return;
    }

    PromoButton.disabled = true;
    PromoStatus.textContent = "Проверка...";
    PromoStatus.style.color = "#aab1c0";

    Try {
        Await flushQueue();
        Const result = await api("redeem_promo", { code });

        State = { balance: result.balance, income: result.income, upgrade_cost: result.upgrade_cost };
        UpdateUI();

        PromoStatus.textContent = `🎉 Промокод активирован! Награда зачислена.`;
        PromoStatus.style.color = "#39d98a";
        PromoInput.value = "";
    } catch (error) {
        PromoStatus.textContent = error.message;
        PromoStatus.style.color = "#ff525b";
    } finally {
        PromoButton.disabled = false;
    }
}

If (promoButton) promoButton.addEventListener("click", redeemPromo);

// ВКЛАДКИ
Const tabButtons = document.querySelectorAll(".tab-button");
Const gameViews = document.querySelectorAll(".game-view");

TabButtons.forEach(button => {
    Button.addEventListener("click", () => {
        If (spinning) return;
        TabButtons.forEach(item => item.classList.remove("active"));
        Button.classList.add("active");

        GameViews.forEach(view => {
            View.classList.toggle("hidden", view.id !== "game-" + button.dataset.game);
        });
    });
});

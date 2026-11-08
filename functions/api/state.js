function response(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store"
        }
    });
}

async function verifyTelegram(initData, botToken) {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");

    if (!hash) return null;
    params.delete("hash");

    const authDate = Number(params.get("auth_date"));
    const now = Math.floor(Date.now() / 1000);

    if (!authDate || now - authDate > 86400 || authDate > now + 60) {
        return null;
    }

    const dataCheckString = [...params.entries()]
        .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
        .map(([key, value]) => `${key}=${value}`)
        .join("\n");

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode("WebAppData"),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );

    const secret = await crypto.subtle.sign("HMAC", key, encoder.encode(botToken));
    const validationKey = await crypto.subtle.importKey(
        "raw",
        secret,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );

    const signature = await crypto.subtle.sign("HMAC", validationKey, encoder.encode(dataCheckString));
    const calculatedHash = [...new Uint8Array(signature)]
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");

    if (calculatedHash !== hash) return null;

    try {
        const userData = params.get("user");
        return userData ? JSON.parse(userData) : null;
    } catch {
        return null;
    }
}

async function authenticate(request, env) {
    const initData = request.headers.get("X-Telegram-Init-Data");
    if (!initData) return { error: "initData missing" };
    if (!env.BOT_TOKEN) return { error: "BOT_TOKEN missing" };

    try {
        const user = await verifyTelegram(initData, env.BOT_TOKEN);
        if (!user || !user.id) return { error: "initData validation failed" };
        return { user };
    } catch (error) {
        return { error: "Verification error: " + error.message };
    }
}

async function getUser(env, id) {
    await env.DB.prepare(`
        INSERT OR IGNORE INTO users
        (telegram_id, balance, income, upgrade_cost)
        VALUES (?, 0, 0.5, 1024)
    `).bind(String(id)).run();

    return await env.DB.prepare(`
        SELECT balance, income, upgrade_cost
        FROM users
        WHERE telegram_id = ?
    `).bind(String(id)).first();
}

// РУЛЕТКА И МОНЕТКА
const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
const MULTIPLIERS = { red: 1.9, black: 1.9, even: 1.9, odd: 1.9, zero: 36 };
const COIN_MULTIPLIER = 1.9;

function randomRouletteNumber() {
    const buf = new Uint32Array(1);
    const limit = Math.floor(0x100000000 / 37) * 37;
    do {
        crypto.getRandomValues(buf);
    } while (buf[0] >= limit);
    return buf[0] % 37;
}

function isWin(choice, number) {
    switch (choice) {
        case "zero": return number === 0;
        case "red": return RED_NUMBERS.includes(number);
        case "black": return number !== 0 && !RED_NUMBERS.includes(number);
        case "even": return number !== 0 && number % 2 === 0;
        case "odd": return number % 2 === 1;
        default: return false;
    }
}

// СЛОТЫ И БОНУСКИ (Gates of Olympus)
const MULTIFIER_VALUES = [2, 3, 4, 5, 10, 15, 20, 25, 50, 100, 500];

function getRandomSymbol(forceScatter = false) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    const rand = buf[0] / 0x100000000;

    if (forceScatter || rand < 0.04) return 10; // Scatter (Зевс)
    if (rand < 0.14) return 9;  // Корона
    if (rand < 0.27) return 8;  // Песочные часы
    if (rand < 0.42) return 7;  // Кольцо
    if (rand < 0.58) return 6;  // Чаша
    const lowSymbols = [1, 2, 3, 4, 5]; // Драгоценные камни
    return lowSymbols[Math.floor(rand * lowSymbols.length) % lowSymbols.length];
}

function spinSlotsGrid(isBonus = false) {
    const rows = 5;
    const cols = 6;
    let grid = [];
    
    // Если это бонусная игра, гарантированно подкидываем от 4 до 6 скаттеров (10)
    let scatterCountToForce = isBonus ? (4 + Math.floor(Math.random() * 3)) : 0;
    
    for (let r = 0; r < rows; r++) {
        let row = [];
        for (let c = 0; c < cols; c++) {
            let force = false;
            if (scatterCountToForce > 0 && Math.random() < 0.3) {
                force = true;
                scatterCountToForce--;
            }
            row.push(getRandomSymbol(force));
        }
        grid.push(row);
    }
    
    // Подсчет совпадений ( Pay Anywhere от 8 штук )
    const counts = {};
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const sym = grid[r][c];
            if (sym !== 10) {
                counts[sym] = (counts[sym] || 0) + 1;
            } else {
                counts[10] = (counts[10] || 0) + 1;
            }
        }
    }

    let winMultiplier = 0;
    for (const [sym, count] of Object.entries(counts)) {
        const s = Number(sym);
        if (s !== 10 && count >= 8) {
            let baseMult = 1;
            if (s >= 8) baseMult = 8;      // Корона и часы
            else if (s >= 6) baseMult = 3; // Кольцо и чаша
            else baseMult = 1;             // Камни
            
            winMultiplier += baseMult * (count / 8);
        }
    }

    // Скаттеры дают отдельный крупный выигрыш при выпадении 4+ штук
    const scatters = counts[10] || 0;
    if (scatters >= 4) {
        winMultiplier += scatters * 5;
    }

    let zeusMultiplier = 0;
    if (winMultiplier > 0 || isBonus) {
        const buf = new Uint32Array(1);
        crypto.getRandomValues(buf);
        if (isBonus || buf[0] / 0x100000000 < 0.3) {
            const mIdx = Math.floor(Math.random() * MULTIFIER_VALUES.length);
            zeusMultiplier = MULTIFIER_VALUES[mIdx];
        }
    }

    let totalWinMultiplier = winMultiplier > 0 
        ? Math.max(1, Number((winMultiplier * (zeusMultiplier > 0 ? zeusMultiplier : 1)).toFixed(2))) 
        : 0;

    if (isBonus && totalWinMultiplier === 0) {
        totalWinMultiplier = 3.5; // Гарантия минимального профита в бонуске
    }

    return {
        grid,
        win: totalWinMultiplier > 0,
        multiplier: totalWinMultiplier,
        zeusMultiplier,
        scatters
    };
}

async function settleBet(env, id, body, multiplier, play) {
    const current = await getUser(env, id);
    const amount = body.all === true ? current.balance : Number(body.amount);

    if (!Number.isFinite(amount) || amount < 100) {
        return response({ error: "Минимальная ставка или стоимость бонуски — 100 байтов" }, 400);
    }
    if (amount > 10000000000 && body.isBonus) {
        return response({ error: "Максимальная стоимость бонуски — 10 000 000 байтов" }, 400);
    }
    if (amount > current.balance) {
        return response({ error: "Недостаточно байтов на балансе" }, 400);
    }

    const outcome = play(); 
    const delta = outcome.win ? Math.floor(amount * (outcome.multiplier - 1)) : -amount;

    const result = await env.DB.prepare(`
        UPDATE users
        SET balance = balance + ?
        WHERE telegram_id = ?
        AND balance >= ?
    `).bind(delta, id, amount).run();

    if (result.meta.changes === 0) {
        return response({ error: "Ошибка списания баланса" }, 400);
    }

    const user = await getUser(env, id);
    return response({ ...user, ...outcome });
}

export async function onRequestGet({ request, env }) {
    try {
        if (!env.DB) return response({ error: "Database not configured" }, 500);
        const auth = await authenticate(request, env);
        if (auth.error) return response({ error: auth.error }, 401);
        return response(await getUser(env, auth.user.id));
    } catch (error) {
        return response({ error: error.message }, 500);
    }
}

export async function onRequestPost({ request, env }) {
    try {
        if (!env.DB) return response({ error: "Database not configured" }, 500);
        const auth = await authenticate(request, env);
        if (auth.error) return response({ error: auth.error }, 401);

        const body = await request.json();
        const id = String(auth.user.id);
        await getUser(env, id);

        if (body.action === "earn_batch") {
            const count = Number(body.count);
            if (!Number.isSafeInteger(count) || count < 1 || count > 1000) {
                return response({ error: "Invalid click count" }, 400);
            }
            await env.DB.prepare(`
                UPDATE users SET balance = balance + income * ? WHERE telegram_id = ?
            `).bind(count, id).run();

        } else if (body.action === "earn") {
            await env.DB.prepare(`
                UPDATE users SET balance = balance + income WHERE telegram_id = ?
            `).bind(id).run();

        } else if (body.action === "upgrade") {
            const result = await env.DB.prepare(`
                UPDATE users
                SET balance = balance - upgrade_cost, income = income * 2, upgrade_cost = upgrade_cost * 2
                WHERE telegram_id = ? AND balance >= upgrade_cost
            `).bind(id).run();
            if (result.meta.changes === 0) return response({ error: "Недостаточно байтов" }, 400);

        } else if (body.action === "spin") {
            const choice = String(body.choice);
            if (!(choice in MULTIPLIERS)) return response({ error: "Неизвестный прогноз" }, 400);
            return await settleBet(env, id, body, MULTIPLIERS[choice], () => {
                const number = randomRouletteNumber();
                return { number, win: isWin(choice, number) };
            });

        } else if (body.action === "coin") {
            const choice = String(body.choice);
            if (choice !== "heads" && choice !== "tails") return response({ error: "Неизвестная сторона" }, 400);
            return await settleBet(env, id, body, COIN_MULTIPLIER, () => {
                const side = Math.random() < 0.5 ? "heads" : "tails";
                return { side, win: side === choice };
            });

        } else if (body.action === "slot") {
            const isBonus = Boolean(body.isBonus);
            return await settleBet(env, id, body, isBonus ? 25 : 1, () => {
                const outcome = spinSlotsGrid(isBonus);
                return {
                    win: outcome.win,
                    grid: outcome.grid,
                    slotMultiplier: outcome.multiplier,
                    zeus: outcome.zeusMultiplier,
                    scatters: outcome.scatters,
                    isBonus: isBonus
                };
            });

        } else {
            return response({ error: "Unknown action" }, 400);
        }

        return response(await getUser(env, id));
    } catch (error) {
        return response({ error: error.message }, 500);
    }
}

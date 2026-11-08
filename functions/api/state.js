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

async function initDatabase(env) {
    await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS users (
            telegram_id TEXT PRIMARY KEY,
            balance REAL DEFAULT 0,
            income REAL DEFAULT 0.5,
            upgrade_cost REAL DEFAULT 1024
        )
    `).run();

    await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS promos (
            code TEXT PRIMARY KEY,
            reward REAL NOT NULL
        )
    `).run();

    await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS used_promos (
            telegram_id TEXT,
            code TEXT,
            PRIMARY KEY (telegram_id, code)
        )
    `).run();

    await env.DB.prepare(`INSERT OR IGNORE INTO promos (code, reward) VALUES ('ZEUS', 10000000000000)`).run();
    await env.DB.prepare(`INSERT OR IGNORE INTO promos (code, reward) VALUES ('BONUS', 5000000000000)`).run();
}

async function getUser(env, id) {
    await initDatabase(env);
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

// --- РЕАЛИСТИЧНАЯ МАТЕМАТИКА GATES OF OLYMPUS ---

// Веса и номиналы иксов Зевса (как в оригинале)
function getRandomZeusMultiplier(isBonus = false) {
    const rand = Math.random();
    // В бонусне шанс выпадения жирных иксов выше
    const chanceMultiplier = isBonus ? 1.5 : 1;

    if (rand < 0.70 / chanceMultiplier) return 0; // 70% спинов без сферы
    if (rand < 0.85) return 2;   // x2
    if (rand < 0.93) return 5;   // x5
    if (rand < 0.97) return 10;  // x10
    if (rand < 0.99) return 25;  // x25
    if (rand < 0.997) return 50; // x50
    if (rand < 0.9995) return 100;// x100
    return 500;                  // ДЖЕКПОТ x500 (редчайший шанс)
}

function getRandomSymbol() {
    const rand = Math.random();
    if (rand < 0.03) return 10; // Scatter (Зевс) - 3%
    if (rand < 0.12) return 9;  // Корона (самый дорогой)
    if (rand < 0.25) return 8;  // Часы
    if (rand < 0.40) return 7;  // Кольцо
    if (rand < 0.58) return 6;  // Чаша
    const lowSymbols = [1, 2, 3, 4, 5]; // Камни
    return lowSymbols[Math.floor(Math.random() * lowSymbols.length)];
}

// Симуляция одного спина сетки 6х5
function calculateSingleSpin(isBonus = false) {
    const rows = 5;
    const cols = 6;
    let grid = [];
    
    for (let r = 0; r < rows; r++) {
        let row = [];
        for (let c = 0; c < cols; c++) {
            row.push(getRandomSymbol());
        }
        grid.push(row);
    }
    
    const counts = {};
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const sym = grid[r][c];
            counts[sym] = (counts[sym] || 0) + 1;
        }
    }

    let baseWinMult = 0;
    // Pay Anywhere: от 8 одинаковых символов
    for (const [sym, count] of Object.entries(counts)) {
        const s = Number(sym);
        if (s !== 10 && count >= 8) {
            let mult = 0.5; // Базовый дешевый
            if (s >= 9) mult = 12;      // Корона
            else if (s >= 8) mult = 8;  // Часы
            else if (s >= 7) mult = 5;  // Кольцо
            else if (s >= 6) mult = 2;  // Чаша
            else if (s >= 4) mult = 1;  // Камни

            // Больше символов на поле = больше выплаты (как каскад)
            baseWinMult += mult * (count / 8);
        }
    }

    let zeusBall = getRandomZeusMultiplier(isBonus);
    
    return {
        grid,
        baseWin: baseWinMult,
        zeus: zeusBall
    };
}

export async function onRequestGet({ request, env }) {
    try {
        const auth = await authenticate(request, env);
        if (auth.error) return response({ error: auth.error }, 401);
        return response(await getUser(env, auth.user.id));
    } catch (error) {
        return response({ error: error.message }, 500);
    }
}

export async function onRequestPost({ request, env }) {
    try {
        const auth = await authenticate(request, env);
        if (auth.error) return response({ error: auth.error }, 401);

        const body = await request.json();
        const id = String(auth.user.id);
        const currentUser = await getUser(env, id);

        if (body.action === "earn_batch") {
            const count = Number(body.count);
            if (!Number.isSafeInteger(count) || count < 1 || count > 1000) {
                return response({ error: "Invalid click count" }, 400);
            }
            await env.DB.prepare(`UPDATE users SET balance = balance + income * ? WHERE telegram_id = ?`).bind(count, id).run();

        } else if (body.action === "earn") {
            await env.DB.prepare(`UPDATE users SET balance = balance + income WHERE telegram_id = ?`).bind(id).run();

        } else if (body.action === "upgrade") {
            const result = await env.DB.prepare(`
                UPDATE users SET balance = balance - upgrade_cost, income = income * 2, upgrade_cost = upgrade_cost * 2
                WHERE telegram_id = ? AND balance >= upgrade_cost
            `).bind(id).run();
            if (result.meta.changes === 0) return response({ error: "Недостаточно байтов" }, 400);

        } else if (body.action === "spin") {
            const choice = String(body.choice);
            const amount = body.all === true ? currentUser.balance : Number(body.amount);
            if (!Number.isFinite(amount) || amount < 100) return response({ error: "Минимальная ставка — 100 байтов" }, 400);
            if (amount > currentUser.balance) return response({ error: "Недостаточно байтов" }, 400);

            const number = randomRouletteNumber();
            const win = isWin(choice, number);
            const delta = win ? amount * (MULTIPLIERS[choice] - 1) : -amount;

            await env.DB.prepare(`UPDATE users SET balance = balance + ? WHERE telegram_id = ?`).bind(delta, id).run();
            const updated = await getUser(env, id);
            return response({ ...updated, number, win });

        } else if (body.action === "coin") {
            const choice = String(body.choice);
            const amount = body.all === true ? currentUser.balance : Number(body.amount);
            if (!Number.isFinite(amount) || amount < 100) return response({ error: "Минимальная ставка — 100 байтов" }, 400);
            if (amount > currentUser.balance) return response({ error: "Недостаточно байтов" }, 400);

            const side = Math.random() < 0.5 ? "heads" : "tails";
            const win = side === choice;
            const delta = win ? amount * (COIN_MULTIPLIER - 1) : -amount;

            await env.DB.prepare(`UPDATE users SET balance = balance + ? WHERE telegram_id = ?`).bind(delta, id).run();
            const updated = await getUser(env, id);
            return response({ ...updated, side, win });

        } else if (body.action === "slot") {
            const isBonus = Boolean(body.isBonus);
            let baseAmount = body.all === true ? currentUser.balance : Number(body.amount);

            if (!Number.isFinite(baseAmount) || baseAmount < 100) {
                return response({ error: "Минимальная ставка — 100 байтов" }, 400);
            }

            // Покупка бонуски = ставка * 100
            const totalCost = isBonus ? baseAmount * 100 : baseAmount;

            if (totalCost > currentUser.balance) {
                return response({ error: "Недостаточно байтов для ставки/покупки бонуски" }, 400);
            }

            let finalMultiplier = 0;
            let lastGrid = [];
            let maxZeusHit = 0;

            if (isBonus) {
                // БОНУСКА (15 вращений с накоплением глобального множителя)
                let globalMultiplierAccumulator = 0;
                
                for (let i = 0; i < 15; i++) {
                    const spin = calculateSingleSpin(true);
                    lastGrid = spin.grid;

                    if (spin.zeus > 0) {
                        globalMultiplierAccumulator += spin.zeus;
                        if (spin.zeus > maxZeusHit) maxZeusHit = spin.zeus;
                    }

                    if (spin.baseWin > 0) {
                        // Если выпал множитель Зевса, умножаем выигрыш спина на общую сумму накопившихся иксов
                        const currentMult = spin.baseWin * Math.max(1, globalMultiplierAccumulator);
                        finalMultiplier += currentMult;
                    }
                }
                // Если бонуска совсем пустая, даем утешительный х2-х3
                if (finalMultiplier === 0) finalMultiplier = 2.5;

            } else {
                // ОБЫЧНЫЙ СПИН
                const spin = calculateSingleSpin(false);
                lastGrid = spin.grid;
                maxZeusHit = spin.zeus;

                if (spin.baseWin > 0) {
                    finalMultiplier = spin.baseWin * Math.max(1, spin.zeus);
                }
            }

            const cleanMult = Number(finalMultiplier.toFixed(2));
            const winAmount = Math.floor(baseAmount * cleanMult);
            const delta = winAmount - totalCost;

            await env.DB.prepare(`UPDATE users SET balance = balance + ? WHERE telegram_id = ?`).bind(delta, id).run();
            const updated = await getUser(env, id);

            return response({
                ...updated,
                win: cleanMult > 0,
                grid: lastGrid,
                slotMultiplier: cleanMult,
                zeus: maxZeusHit,
                isBonus: isBonus
            });

        } else if (body.action === "redeem_promo") {
            const code = String(body.code || "").trim().toUpperCase();
            if (!code) return response({ error: "Введите промокод" }, 400);

            const promo = await env.DB.prepare(`SELECT reward FROM promos WHERE code = ?`).bind(code).first();
            if (!promo) return response({ error: "Промокод не найден или устарел" }, 400);

            const used = await env.DB.prepare(`SELECT 1 FROM used_promos WHERE telegram_id = ? AND code = ?`).bind(id, code).first();
            if (used) return response({ error: "Вы уже активировали этот промокод" }, 400);

            await env.DB.prepare(`INSERT INTO used_promos (telegram_id, code) VALUES (?, ?)`).bind(id, code).run();
            await env.DB.prepare(`UPDATE users SET balance = balance + ? WHERE telegram_id = ?`).bind(promo.reward, id).run();

            const updated = await getUser(env, id);
            return response(updated);

        } else {
            return response({ error: "Unknown action" }, 400);
        }

    } catch (error) {
        return response({ error: error.message }, 500);
    }
}

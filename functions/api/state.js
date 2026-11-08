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

    const secret = await crypto.subtle.sign(
        "HMAC",
        key,
        encoder.encode(botToken)
    );

    const validationKey = await crypto.subtle.importKey(
        "raw",
        secret,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );

    const signature = await crypto.subtle.sign(
        "HMAC",
        validationKey,
        encoder.encode(dataCheckString)
    );

    const calculatedHash = [...new Uint8Array(signature)]
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");

    if (calculatedHash !== hash) return null;

    try {
        const userData = params.get("user");
        if (!userData) return null;

        return JSON.parse(userData);
    } catch {
        return null;
    }
}

async function authenticate(request, env) {
    const initData = request.headers.get("X-Telegram-Init-Data");

    if (!initData) {
        return { error: "initData missing" };
    }

    if (!env.BOT_TOKEN) {
        return { error: "BOT_TOKEN missing" };
    }

    try {
        const user = await verifyTelegram(initData, env.BOT_TOKEN);

        if (!user || !user.id) {
            return { error: "initData validation failed" };
        }

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

// ---------- ИГРЫ (всё считается на сервере) ----------

const RED_NUMBERS = [
    1, 3, 5, 7, 9, 12, 14, 16, 18,
    19, 21, 23, 25, 27, 30, 32, 34, 36
];

const MULTIPLIERS = {
    red: 1.9,
    black: 1.9,
    even: 1.9,
    odd: 1.9,
    zero: 36
};

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

// ---------- СЛОТЫ (Gates of Olympus style) ----------

const MULTIFIER_VALUES = [2, 3, 4, 5, 10, 15, 20, 25, 50, 100, 500];

function getRandomSymbol() {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    const rand = buf[0] / 0x100000000;
    
    if (rand < 0.05) return 10; // Scatter (Зевс)
    if (rand < 0.15) return 9;  // Корона
    if (rand < 0.28) return 8;  // Песочные часы
    if (rand < 0.43) return 7;  // Кольцо
    if (rand < 0.60) return 6;  // Чаша
    const lowSymbols = [1, 2, 3, 4, 5];
    return lowSymbols[Math.floor(rand * lowSymbols.length) % lowSymbols.length];
}

function getRandomMultiplier() {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    if (buf[0] / 0x100000000 > 0.15) return 0;
    return MULTIFIER_VALUES[Math.floor(buf[0] % MULTIFIER_VALUES.length)];
}

function spinSlotsGrid() {
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
            if (sym !== 10) {
                counts[sym] = (counts[sym] || 0) + 1;
            }
        }
    }

    let winMultiplier = 0;
    for (const [sym, count] of Object.entries(counts)) {
        if (count >= 8) {
            let baseMult = 1;
            const s = Number(sym);
            if (s >= 8) baseMult = 5;
            else if (s >= 6) baseMult = 2;
            else baseMult = 0.5;
            
            winMultiplier += baseMult * (count / 8);
        }
    }

    let zeusMultiplier = 0;
    if (winMultiplier > 0) {
        const m = getRandomMultiplier();
        if (m > 0) zeusMultiplier = m;
    }

    const totalWinMultiplier = winMultiplier > 0 
        ? Math.max(0.5, Number((winMultiplier * (zeusMultiplier > 0 ? zeusMultiplier : 1)).toFixed(2))) 
        : 0;

    return {
        grid,
        win: totalWinMultiplier > 0,
        multiplier: totalWinMultiplier,
        zeusMultiplier
    };
}

async function settleBet(env, id, body, multiplier, play) {
    const current = await getUser(env, id);

    const amount = body.all === true
        ? current.balance
        : Number(body.amount);

    if (!Number.isFinite(amount) || amount < 1) {
        return response({ error: "Слишком маленькая ставка" }, 400);
    }

    if (amount > current.balance) {
        return response({ error: "Недостаточно коинов" }, 400);
    }

    const outcome = play(); 
    const delta = outcome.win ? amount * (multiplier - 1) : -amount;

    const result = await env.DB.prepare(`
        UPDATE users
        SET balance = balance + ?
        WHERE telegram_id = ?
        AND balance >= ?
    `).bind(delta, id, amount).run();

    if (result.meta.changes === 0) {
        return response({ error: "Недостаточно коинов" }, 400);
    }

    const user = await getUser(env, id);

    return response({ ...user, ...outcome });
}

export async function onRequestGet({ request, env }) {
    try {
        if (!env.DB) {
            return response({ error: "Database not configured" }, 500);
        }

        const auth = await authenticate(request, env);

        if (auth.error) {
            return response({ error: auth.error }, 401);
        }

        return response(await getUser(env, auth.user.id));

    } catch (error) {
        return response({ error: error.message }, 500);
    }
}

export async function onRequestPost({ request, env }) {
    try {
        if (!env.DB) {
            return response({ error: "Database not configured" }, 500);
        }

        const auth = await authenticate(request, env);

        if (auth.error) {
            return response({ error: auth.error }, 401);
        }

        const body = await request.json();
        const id = String(auth.user.id);

        await getUser(env, id);

        if (body.action === "earn_batch") {
            const count = Number(body.count);

            if (!Number.isSafeInteger(count) || count < 1 || count > 1000) {
                return response({ error: "Invalid click count" }, 400);
            }

            await env.DB.prepare(`
                UPDATE users
                SET balance = balance + income * ?
                WHERE telegram_id = ?
            `).bind(count, id).run();

        } else if (body.action === "earn") {
            await env.DB.prepare(`
                UPDATE users
                SET balance = balance + income
                WHERE telegram_id = ?
            `).bind(id).run();

        } else if (body.action === "upgrade") {
            const result = await env.DB.prepare(`
                UPDATE users
                SET balance = balance - upgrade_cost,
                    income = income * 2,
                    upgrade_cost = upgrade_cost * 2
                WHERE telegram_id = ?
                AND balance >= upgrade_cost
            `).bind(id).run();

            if (result.meta.changes === 0) {
                return response({ error: "Недостаточно коинов" }, 400);
            }

        } else if (body.action === "spin") {
            const choice = String(body.choice);

            if (!(choice in MULTIPLIERS)) {
                return response({ error: "Неизвестный прогноз" }, 400);
            }

            return await settleBet(env, id, body, MULTIPLIERS[choice], () => {
                const number = randomRouletteNumber();
                return { number, win: isWin(choice, number) };
            });

        } else if (body.action === "coin") {
            const choice = String(body.choice);

            if (choice !== "heads" && choice !== "tails") {
                return response({ error: "Неизвестная сторона" }, 400);
            }

            return await settleBet(env, id, body, COIN_MULTIPLIER, () => {
                const side = (Math.random() < 0.5) ? "heads" : "tails";
                return { side, win: side === choice };
            });

        } else if (body.action === "slot") {
            const current = await getUser(env, id);
            const amount = body.all === true ? current.balance : Number(body.amount);

            if (!Number.isFinite(amount) || amount < 1) {
                return response({ error: "Слишком маленькая ставка" }, 400);
            }
            if (amount > current.balance) {
                return response({ error: "Недостаточно коинов" }, 400);
            }

            const outcome = spinSlotsGrid();
            const delta = outcome.win
                ? Math.floor(amount * (outcome.multiplier - 1))
                : -amount;

            const result = await env.DB.prepare(`
                UPDATE users
                SET balance = balance + ?
                WHERE telegram_id = ?
                AND balance >= ?
            `).bind(delta, id, amount).run();

            if (result.meta.changes === 0) {
                return response({ error: "Недостаточно коинов" }, 400);
            }

            const user = await getUser(env, id);
            return response({
                ...user,
                win: outcome.win,
                grid: outcome.grid,
                slotMultiplier: outcome.multiplier,
                zeus: outcome.zeusMultiplier
            });

        } else {
            return response({ error: "Unknown action" }, 400);
        }

        return response(await getUser(env, id));

    } catch (error) {
        return response({ error: error.message }, 500);
    }
}

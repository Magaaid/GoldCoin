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

// ---------- РУЛЕТКА (всё считается на сервере) ----------

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

// Честное случайное число 0..36 без перекоса
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

            const current = await getUser(env, id);

            // «Всё» берём с сервера, остальное — сумма от игрока
            const amount = body.all === true
                ? current.balance
                : Number(body.amount);

            if (!Number.isFinite(amount) || amount < 1) {
                return response({ error: "Слишком маленькая ставка" }, 400);
            }

            if (amount > current.balance) {
                return response({ error: "Недостаточно коинов" }, 400);
            }

            const multiplier = MULTIPLIERS[choice];
            const number = randomRouletteNumber();
            const win = isWin(choice, number);

            // Выигрыш: + ставка × (множитель − 1), проигрыш: − ставка
            const delta = win ? amount * (multiplier - 1) : -amount;

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

            return response({ ...user, number, win });

        } else {
            return response({ error: "Unknown action" }, 400);
        }

        return response(await getUser(env, id));

    } catch (error) {
        return response({ error: error.message }, 500);
    }
}

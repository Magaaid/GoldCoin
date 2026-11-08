
function response(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store"
        }
    });
}

export async function onRequestGet({ request, env }) {
    try {
        const initData = request.headers.get("X-Telegram-Init-Data");

        return response({
            status: "diagnostic",
            initDataReceived: Boolean(initData),
            initDataLength: initData ? initData.length : 0,
            botTokenConfigured: Boolean(env?.BOT_TOKEN),
            databaseConfigured: Boolean(env?.DB)
        });
    } catch (error) {
        return response({
            error: error.message
        }, 500);
    }
}

export async function onRequestPost({ request, env }) {
    return response({ status: "diagnostic" });
}

export async function onRequestGet({ request, env }) {
    const initData = request.headers.get("X-Telegram-Init-Data");

    return response({
        initDataReceived: !!initData,
        initDataLength: initData?.length || 0,
        botTokenConfigured: !!env.BOT_TOKEN,
        databaseConfigured: !!env.DB
    });
}

import { ChatRoom } from "./chatroom.js";
export { ChatRoom };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (path === "/api/upload" && request.method === "POST") return handleUpload(request, env);
    if (path.startsWith("/api/image/")) {
      const key = decodeURIComponent(path.slice(11));
      const obj = await env.chat_images.get(key);
      if (!obj) return new Response("Not found", { status: 404 });
      const h = new Headers();
      h.set("Content-Type", obj.httpMetadata?.contentType || "image/jpeg");
      h.set("Cache-Control", "public, max-age=604800");
      return new Response(obj.body, { headers: h });
    }
    if (path.startsWith("/api/")) {
      const id = env.CHATROOM.idFromName("global-room");
      const obj = env.CHATROOM.get(id);
      return obj.fetch(request);
    }
    if (path === "/admin") {
      return env.ASSETS.fetch(new Request(new URL("/admin.html", request.url).toString(), request));
    }
    return env.ASSETS.fetch(request);
  },
};

async function handleUpload(request, env) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!file || !file.size) return resp({ success: false, error: "\u6CA1\u6709\u6587\u4EF6" }, 400);
    if (file.size > 2 * 1024 * 1024) return resp({ success: false, error: "\u56FE\u7247\u4E0D\u80FD\u8D85\u8FC72MB" }, 400);
    if (!file.type.startsWith("image/")) return resp({ success: false, error: "\u53EA\u80FD\u4E0A\u4F20\u56FE\u7247" }, 400);
    const ext = (file.name || "jpg").split(".").pop() || "jpg";
    const key = Date.now() + "-" + Math.random().toString(36).slice(2, 8) + "." + ext;
    await env.chat_images.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
    return resp({ success: true, key });
  } catch (e) {
    return resp({ success: false, error: "\u4E0A\u4F20\u5931\u8D25" }, 500);
  }
}

function resp(d, s) {
  return new Response(JSON.stringify(d), { status: s || 200, headers: { "Content-Type": "application/json" } });
}

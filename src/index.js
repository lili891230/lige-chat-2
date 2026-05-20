import { ChatRoom } from "./chatroom.js";
export { ChatRoom };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/api/clear" || path === "/api/mute" || path === "/api/announcement") {
      if (request.method === "POST") {
        const rawBody = await request.text();
        let data = {};
        try { data = JSON.parse(rawBody); } catch (e) {}
        if (data.password !== env.ADMIN_PASSWORD) {
          return new Response(JSON.stringify({ success: false, error: "\u5BC6\u7801\u9519\u8BEF" }), {
            status: 403,
            headers: { "Content-Type": "application/json" },
          });
        }
        const headers = new Headers();
        headers.set("x-admin-auth", "ok");
        headers.set("Content-Type", "application/json");
        const newReq = new Request(request.url, {
          method: "POST",
          headers: headers,
          body: rawBody,
        });
        const id = env.CHATROOM.idFromName("global-room");
        const obj = env.CHATROOM.get(id);
        return obj.fetch(newReq);
      }
    }

    if (path.startsWith("/api/")) {
      const id = env.CHATROOM.idFromName("global-room");
      const obj = env.CHATROOM.get(id);
      return obj.fetch(request);
    }

    if (path === "/admin") {
      const adminReq = new Request(new URL("/admin.html", request.url).toString(), request);
      return env.ASSETS.fetch(adminReq);
    }

    return env.ASSETS.fetch(request);
  },
};

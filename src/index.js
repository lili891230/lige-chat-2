import { ChatRoom } from "./chatroom.js";
export { ChatRoom };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
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
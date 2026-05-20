export class ChatRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.clients = new Set();
    this.maxMessages = 1500;
    this.initialized = false;
    this.isMuted = false;
    this.announcement = "";
  }

  async init() {
    if (this.initialized) return;
    this.initialized = true;
    try {
      this.state.storage.sql.exec(
        "CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, type TEXT NOT NULL DEFAULT 'message', username TEXT DEFAULT '', content TEXT DEFAULT '', timestamp INTEGER DEFAULT 0)"
      );
      this.state.storage.sql.exec(
        "CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)"
      );
      var c1 = this.state.storage.sql.exec("SELECT value FROM settings WHERE key = 'muted'");
      for (var r1 of c1) { this.isMuted = r1.value === 'true'; }
      var c2 = this.state.storage.sql.exec("SELECT value FROM settings WHERE key = 'announcement'");
      for (var r2 of c2) { this.announcement = r2.value || ""; }
    } catch (e) { console.error("Init error:", e); }
  }

  async fetch(request) {
    await this.init();
    var url = new URL(request.url);
    var path = url.pathname;

    if (request.headers.get("Upgrade") === "websocket") {
      var pair = new WebSocketPair();
      this.handleSession(pair[1]);
      return new Response(null, { status: 101, webSocket: pair[0] });
    }

    if (path === "/api/clear") return await this.handleClear(request);
    if (path === "/api/mute") return await this.handleMute(request);
    if (path === "/api/announcement") return await this.handleAnnouncement(request);

    if (path === "/api/history") {
      return this.json(this.getMessages());
    }

    if (path === "/api/status") {
      return this.json({
        muted: this.isMuted,
        messageCount: this.getMessageCount(),
        onlineCount: this.clients.size,
        announcement: this.announcement,
      });
    }

    return new Response("ChatRoom", { status: 200 });
  }

  json(data) {
    return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
  }

  checkAuth(request) {
    return request.headers.get("x-admin-auth") === "ok";
  }

  getMessages() {
    try {
      var cur = this.state.storage.sql.exec("SELECT * FROM messages ORDER BY timestamp ASC");
      var res = [];
      for (var row of cur) { res.push({ id: row.id, type: row.type, username: row.username, content: row.content, timestamp: row.timestamp }); }
      return res;
    } catch (e) { return []; }
  }

  getMessageCount() {
    try {
      var cur = this.state.storage.sql.exec("SELECT COUNT(*) as cnt FROM messages");
      for (var row of cur) return Number(row.cnt) || 0;
    } catch (e) {}
    return 0;
  }

  insertMessage(msg) {
    try {
      this.state.storage.sql.exec(
        "INSERT INTO messages (id, type, username, content, timestamp) VALUES (?1, ?2, ?3, ?4, ?5)",
        msg.id, msg.type, msg.username, msg.content, msg.timestamp
      );
      this.state.storage.sql.exec(
        "DELETE FROM messages WHERE id NOT IN (SELECT id FROM messages ORDER BY timestamp DESC LIMIT ?1)",
        this.maxMessages
      );
    } catch (e) { console.error("Insert error:", e); }
  }

  async handleAnnouncement(request) {
    if (request.method === "GET") {
      return this.json({ content: this.announcement });
    }
    if (!this.checkAuth(request)) {
      return this.json({ success: false, error: "\u672A\u6388\u6743" });
    }
    var data = {};
    try { data = await request.json(); } catch (e) {}
    this.announcement = typeof data.content === "string" ? data.content : "";
    try {
      this.state.storage.sql.exec("INSERT OR REPLACE INTO settings (key, value) VALUES ('announcement', ?1)", this.announcement);
    } catch (e) {}
    this.broadcast({ type: "announcement", content: this.announcement });
    return this.json({ success: true, content: this.announcement });
  }

  async handleClear(request) {
    if (!this.checkAuth(request)) return this.json({ success: false, error: "\u672A\u6388\u6743" });
    try { this.state.storage.sql.exec("DELETE FROM messages"); } catch (e) {}
    this.broadcast({ type: "system", content: "\u7BA1\u7406\u5458\u5DF2\u6E05\u7A7A\u6240\u6709\u804A\u5929\u8BB0\u5F55", timestamp: Date.now() });
    return this.json({ success: true });
  }

  async handleMute(request) {
    if (!this.checkAuth(request)) return this.json({ success: false, error: "\u672A\u6388\u6743" });
    var data = {};
    try { data = await request.json(); } catch (e) {}
    this.isMuted = typeof data.muted === "boolean" ? data.muted : !this.isMuted;
    try {
      this.state.storage.sql.exec("INSERT OR REPLACE INTO settings (key, value) VALUES ('muted', ?1)", String(this.isMuted));
    } catch (e) {}
    this.broadcast({ type: "muted", muted: this.isMuted });
    this.broadcast({ type: "system", content: this.isMuted ? "\u7BA1\u7406\u5458\u5DF2\u7981\u8A00\u6240\u6709\u4EBA" : "\u7BA1\u7406\u5458\u5DF2\u89E3\u9664\u7981\u8A00", timestamp: Date.now() });
    return this.json({ success: true, muted: this.isMuted });
  }

  handleSession(ws) {
    ws.accept();
    this.clients.add(ws);
    var self = this;
    var username = this.generateUsername();
    ws.username = username;
    ws.lastMsgTime = 0;

    ws.send(JSON.stringify({ type: "system", content: "\u6B22\u8FCE\u6765\u5230\u804A\u5929\u5BA4\uFF01\u4F60\u7684\u6635\u79F0\u662F " + username, timestamp: Date.now() }));
    ws.send(JSON.stringify({ type: "muted", muted: this.isMuted }));
    if (this.announcement) ws.send(JSON.stringify({ type: "announcement", content: this.announcement }));

    var history = this.getMessages();
    if (history.length > 0) ws.send(JSON.stringify({ type: "history", messages: history.slice(-50) }));

    this.broadcastOnlineCount();

    ws.addEventListener("message", async function(event) {
      try {
        var data = JSON.parse(event.data);
        if (data.type === "message" && data.content && data.content.trim()) {
          if (self.isMuted) {
            ws.send(JSON.stringify({ type: "system", content: "\u5F53\u524D\u5DF2\u88AB\u7981\u8A00\uFF0C\u65E0\u6CD5\u53D1\u9001\u6D88\u606F", timestamp: Date.now() }));
            return;
          }
          var now = Date.now();
          if (now - ws.lastMsgTime < 2500) {
            ws.send(JSON.stringify({ type: "rate_limit" }));
            return;
          }
          ws.lastMsgTime = now;
          var msg = {
            id: crypto.randomUUID(),
            type: "message",
            username: ws.username,
            content: self.sanitize(data.content.trim()),
            timestamp: now,
          };
          self.insertMessage(msg);
          self.broadcast(msg);
        }
        if (data.type === "setname" && data.name && data.name.trim()) {
          var oldName = ws.username;
          ws.username = self.sanitize(data.name.trim().slice(0, 20));
          self.broadcast({ type: "system", content: oldName + " \u6539\u540D\u4E3A " + ws.username, timestamp: Date.now() });
        }
      } catch (e) {}
    });

    ws.addEventListener("close", function() {
      self.clients.delete(ws);
      self.broadcast({ type: "system", content: ws.username + " \u79BB\u5F00\u4E86\u804A\u5929\u5BA4", timestamp: Date.now() });
      self.broadcastOnlineCount();
    });

    ws.addEventListener("error", function() { self.clients.delete(ws); });
  }

  broadcast(msg) {
    var payload = JSON.stringify(msg);
    for (var c of this.clients) {
      try { c.send(payload); } catch (e) { this.clients.delete(c); }
    }
  }

  broadcastOnlineCount() { this.broadcast({ type: "online", count: this.clients.size }); }

  generateUsername() {
    var a = ["\u5FEB\u4E50\u7684","\u806A\u660E\u7684","\u52C7\u6562\u7684","\u4F18\u96C5\u7684","\u795E\u79D8\u7684","\u5E78\u8FD0\u7684","\u6E29\u67D4\u7684","\u6D3B\u6CFC\u7684","\u51B7\u9759\u7684","\u673A\u667A\u7684"];
    var n = ["\u5C0F\u732B","\u6D77\u8C5A","\u72D0\u72F8","\u718A\u732B","\u677E\u9F20","\u5154\u5B50","\u8774\u8776","\u9CB8\u9C7C","\u9E7F","\u5929\u9E45"];
    return a[Math.floor(Math.random() * a.length)] + n[Math.floor(Math.random() * n.length)] + Math.floor(Math.random() * 100);
  }

  sanitize(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
}

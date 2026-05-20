const fs = require('fs');

// Fix chatroom.js
let src = fs.readFileSync('src/chatroom.js', 'utf8');
if (!src.includes('handleLogin')) {
  src = src.replace(
    '  async handleMute(request) {',
    '  async handleLogin(request) {\n    var data = {};\n    try { data = await request.json(); } catch (e) {}\n    if (this.verifyPassword(data.password)) return this.json({ success: true });\n    return this.json({ success: false, error: "\\u5BC6\\u7801\\u9519\\u8BEF" });\n  }\n\n  async handleMute(request) {'
  );
  src = src.replace(
    'if (path === "/api/change-password") return await this.handleChangePassword(request);',
    'if (path === "/api/change-password") return await this.handleChangePassword(request);\n    if (path === "/api/login") return await this.handleLogin(request);'
  );
  fs.writeFileSync('src/chatroom.js', src);
  console.log('chatroom.js: handleLogin added');
} else {
  console.log('chatroom.js: already has handleLogin');
}

// Fix admin.html
let html = fs.readFileSync('public/admin.html', 'utf8');
if (!html.includes('/api/login')) {
  const oldLogin = "loginBtn.addEventListener('click',function(){var v=pwdInput.value.trim();if(!v){showToast('\u8BF7\u8F93\u5165\u5BC6\u7801','err');return;}adminPassword=v;loginCard.style.display='none';adminPanel.style.display='block';showToast('\u767B\u5F55\u6210\u529F','ok');loadStatus();loadAnnouncement();loadTitle();});";
  const newLogin = "loginBtn.addEventListener('click',function(){var v=pwdInput.value.trim();if(!v){showToast('\u8BF7\u8F93\u5165\u5BC6\u7801','err');return;}loginBtn.disabled=true;loginBtn.textContent='\u9A8C\u8BC1\u4E2D...';fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:v})}).then(function(r){return r.json();}).then(function(d){if(d.success){adminPassword=v;loginCard.style.display='none';adminPanel.style.display='block';showToast('\u767B\u5F55\u6210\u529F','ok');loadStatus();loadAnnouncement();loadTitle();}else{showToast(d.error||'\u5BC6\u7801\u9519\u8BEF','err');}}).catch(function(){showToast('\u8BF7\u6C42\u5931\u8D25','err');}).finally(function(){loginBtn.disabled=false;loginBtn.textContent='\u767B\u5F55';});});";
  html = html.replace(oldLogin, newLogin);
  fs.writeFileSync('public/admin.html', html);
  console.log('admin.html: /api/login added');
} else {
  console.log('admin.html: already has /api/login');
}

console.log('done');

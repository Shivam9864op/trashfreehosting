'use strict';
/* ═══════════════════════════════════════════
   Trash Hosting — Dashboard Script
   ═══════════════════════════════════════════ */

const API_BASE   = 'https://hosting.trashmcpe.com/backend/api';
const SOCKET_URL = 'https://hosting.trashmcpe.com';
const CAPTCHA_TOKEN = document.querySelector('meta[name="captcha-token"]')?.getAttribute('content') || 'trash-hosting';

/* ─── QUIZ QUESTIONS ─── */
const QUIZ_QUESTIONS = [
  { q:"What material is used to make a crafting table?", opts:["Oak Wood","Iron","Stone","Obsidian"], a:0 },
  { q:"Which mob drops gunpowder?", opts:["Skeleton","Creeper","Zombie","Spider"], a:1 },
  { q:"What's the max level for enchantments?", opts:["30","50","100","20"], a:0 },
  { q:"Which biome has no rainfall?", opts:["Jungle","Desert","Taiga","Savanna"], a:1 },
  { q:"How many blocks tall is the Nether?", opts:["128","256","512","64"], a:0 },
  { q:"What do you need to enter The End?", opts:["Nether Star","Eye of Ender","Blaze Rod","Dragon Egg"], a:1 },
  { q:"Which wood can't burn?", opts:["Oak","Birch","Mangrove","Warped"], a:3 },
  { q:"What does a Beacon require as a base?", opts:["Gold blocks","Diamond blocks","Iron/Gold/Emerald/Diamond blocks","Netherite"], a:2 },
  { q:"How many hearts does an Ender Dragon have?", opts:["100","150","200","50"], a:2 },
  { q:"What is the hunger bar maximum?", opts:["10","20","12","8"], a:1 },
  { q:"Which item lets you breathe underwater?", opts:["Helmet","Turtle Shell","Potion only","Lantern"], a:1 },
  { q:"What material makes the strongest sword?", opts:["Diamond","Iron","Netherite","Gold"], a:2 },
  { q:"How do you tame a wolf?", opts:["Bone","Meat","Fish","Bread"], a:0 },
  { q:"Which biome spawns polar bears?", opts:["Tundra","Ice Spikes","Both","Plains"], a:2 },
  { q:"What do you throw to teleport in The End?", opts:["Ender Pearl","Chorus Fruit","Eye of Ender","Endermite"], a:0 },
];

/* ─── SPIN WHEEL SEGMENTS ─── */
const SPIN_SEGMENTS = [
  { label:"+10 🪙", coins:10,  color:'#22c55e' },
  { label:"+50 🪙", coins:50,  color:'#16a34a' },
  { label:"+20 🪙", coins:20,  color:'#4ade80' },
  { label:"Nothing",coins:0,   color:'#374151' },
  { label:"+5 🪙",  coins:5,   color:'#6ee7b7' },
  { label:"+100 🪙",coins:100, color:'#f59e0b' },
  { label:"+30 🪙", coins:30,  color:'#22c55e' },
  { label:"Nothing",coins:0,   color:'#374151' },
  { label:"+200 🪙",coins:200, color:'#a855f7' },
  { label:"+15 🪙", coins:15,  color:'#4ade80' },
];

/* ─── PRESET INFO ─── */
const PRESET_INFO = {
  survival:  "🌲 Classic Survival with PvP enabled. Perfect for friends.",
  pvp:       "⚔️ High-performance PvP. 1.8.9 recommended for best latency.",
  skyblock:  "🏝️ Island survival — start with nothing and grow!",
  creative:  "🎨 Creative mode. Unlimited blocks, no hunger. Build freely.",
  minigames: "🎯 Minigame lobby. Needs 2+ GB RAM for smooth performance.",
  custom:    "🔧 Full control. Set your own config and plugins.",
};

/* ─── DAILY TASKS CONFIG ─── */
const TASKS_CONFIG = [
  { id:'login',      name:'Daily Login',       desc:'Log in today',                   reward:20,  type:'auto',  target:1 },
  { id:'create',     name:'Create a Server',   desc:'Launch any server',              reward:30,  type:'manual',target:1 },
  { id:'start',      name:'Start a Server',    desc:'Boot up your server',            reward:15,  type:'manual',target:1 },
  { id:'console',    name:'Use Console',       desc:'Send any command via console',   reward:20,  type:'manual',target:1 },
  { id:'game',       name:'Play Mini Game',    desc:'Play any mini game',             reward:25,  type:'manual',target:1 },
  { id:'watch_ad',   name:'Watch an Ad',       desc:'Watch a short ad',               reward:20,  type:'manual',target:1 },
  { id:'spin',       name:'Spin the Wheel',    desc:'Use the spin wheel',             reward:10,  type:'manual',target:1 },
  { id:'share',      name:'Share Referral',    desc:'Copy your referral link',        reward:30,  type:'manual',target:1 },
];

/* ════════════════════════════
   STATE
════════════════════════════ */
const S = {
  user:        null,   // { name, coins, streak, lastLogin, tasks, spinLastUsed, adLastUsed, referralCode }
  admin:       null,   // { username, authHeader }
  adminMetrics:null,
  servers:     [],
  selectedSrv: null,
  socket:      null,
  connected:   false,
  cmdHistory:  [],
  cmdIdx:      -1,
  autoScroll:  true,
  currentPage: 'home',
  currentGame: 'miner',
  currentLB:   'coins',
  preset:      'survival',
  // miner game
  minerActive:    false,
  minerScore:     0,
  minerTimeLeft:  30,
  minerTimer:     null,
  minerCombo:     0,
  blockHp:        100,
  blockMaxHp:     100,
  // quiz game
  quizQuestions:  [],
  quizIdx:        0,
  quizScore:      0,
  quizTimer:      null,
  quizTimeLeft:   30,
  // spin
  spinAnimating:  false,
  spinAngle:      0,
  // queue
  queuePos:       0,
  queueTotal:     0,
  queueServer:    null,
  // leaderboard (mock)
  leaderboard: {
    coins:  [],
    streak: [],
    games:  [],
  },
};

/* ════════════════════════════
   STORAGE
════════════════════════════ */
const Store = {
  get: k => { try { return JSON.parse(localStorage.getItem('bp_'+k)); } catch(e){return null;} },
  set: (k,v) => localStorage.setItem('bp_'+k, JSON.stringify(v)),
  del: k => localStorage.removeItem('bp_'+k),
};

function saveUser() { if(S.user) Store.set('user', S.user); }

function loadUser() {
  const u = Store.get('user');
  if (u && u.name) { S.user = u; return true; }
  return false;
}

/* ════════════════════════════
   UTILITIES
════════════════════════════ */
const $ = id => document.getElementById(id);
const qs = s => document.querySelector(s);
const qsa = s => [...document.querySelectorAll(s)];
const el = (tag, cls='') => { const e=document.createElement(tag); if(cls) e.className=cls; return e; };

function toast(msg, type='info', dur=3500) {
  const w = $('toastWrap');
  const t = el('div', `toast ${type}`);
  t.innerHTML = `<span style="flex:1">${msg}</span><button class="toast-close">✕</button>`;
  t.querySelector('.toast-close').onclick = () => t.remove();
  w.appendChild(t);
  setTimeout(() => t.remove(), dur);
}

function showLoading(txt='Loading…') { $('loadingScreen').classList.remove('hidden'); $('lsText').textContent=txt; }
function hideLoading() { $('loadingScreen').classList.add('hidden'); }
function showModal(html) { $('modal').querySelector('#modalBody').innerHTML=html; $('modalOverlay').classList.remove('hidden'); }
function hideModal() { $('modalOverlay').classList.add('hidden'); }

function formatCoins(n) { return n.toLocaleString(); }
function formatDate(d) {
  const dt=new Date(d);
  if(Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleString();
}

function todayKey() { return new Date().toISOString().slice(0,10); }

function isToday(dateStr) { return dateStr === todayKey(); }

/* ════════════════════════════
   API
════════════════════════════ */
async function apiFetch(path, opts={}, attempt=0) {
  const url = API_BASE + path;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const method = (opts.method||'GET').toUpperCase();
    const headers = {'Content-Type':'application/json', ...(opts.headers||{})};
    if(['POST','PUT','PATCH','DELETE'].includes(method) && !headers['x-captcha-token']) {
      headers['x-captcha-token'] = CAPTCHA_TOKEN;
    }
    const r = await fetch(url, {
      method,
      signal: ctrl.signal,
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const ct = r.headers.get('content-type')||'';
    const data = ct.includes('json') ? await r.json() : await r.text();
    if (!r.ok) throw Object.assign(new Error(data?.error||data?.message||`HTTP ${r.status}`), {status:r.status});
    return data;
  } catch(e) {
    if (e.name==='AbortError') throw new Error('Request timed out');
    if (e.status>=400 && e.status<500) throw e;
    if (attempt < 2) { await new Promise(r=>setTimeout(r, 800*(attempt+1))); return apiFetch(path, opts, attempt+1); }
    throw e;
  } finally { clearTimeout(timer); }
}

async function sendAuthEvent(type, username) {
  try { await apiFetch('/events/auth', { method:'POST', body:{ type, username } }); }
  catch(e) { console.warn('Auth event log failed:', e.message); }
}

/* ════════════════════════════
   SOCKET
════════════════════════════ */
function initSocket() {
  if (typeof io === 'undefined') { console.warn('Socket.IO not loaded'); return; }
  S.socket = io(SOCKET_URL, { path:'/socket.io', transports:['websocket','polling'], reconnection:true });
  S.socket.on('connect', () => {
    S.connected = true; updateConnStatus();
    consoleLog('✓ Connected to Trash Hosting', 'success');
    if (S.selectedSrv) S.socket.emit('console:subscribe', S.selectedSrv.id);
  });
  S.socket.on('disconnect', reason => {
    S.connected = false; updateConnStatus();
    consoleLog(`✕ Disconnected: ${reason}`, 'error');
  });
  S.socket.on('console:line', ({line,type}={}) => { if(line) consoleLog(line, type||'info'); });
  S.socket.on('console:output', d => { if(typeof d==='string') consoleLog(d); else if(d?.line) consoleLog(d.line); });
}

function updateConnStatus() {
  const dot=$('connDot'), txt=$('connText');
  if(dot) { dot.className='conn-dot '+(S.connected?'on':'off'); }
  if(txt) txt.textContent = S.connected ? 'Connected' : 'Disconnected';
}

/* ════════════════════════════
   USER / COINS
════════════════════════════ */
function addCoins(n, reason='') {
  S.user.coins = (S.user.coins||0) + n;
  saveUser();
  updateCoinUI();
  if(reason) toast(`+${n} 🪙 ${reason}`, 'success');
}

function spendCoins(n, reason='') {
  if((S.user.coins||0) < n) { toast(`Not enough coins! Need ${n} 🪙`, 'error'); return false; }
  S.user.coins -= n;
  saveUser();
  updateCoinUI();
  if(reason) toast(`-${n} 🪙 ${reason}`, 'info');
  return true;
}

function updateCoinUI() {
  const c = S.user?.coins||0;
  $('sbCoins').textContent = `🪙 ${formatCoins(c)} coins`;
  $('mobileCoins').textContent = `🪙 ${formatCoins(c)}`;
  if($('bigCoinCount')) $('bigCoinCount').textContent = formatCoins(c);
  if($('stCoins')) $('stCoins').textContent = formatCoins(c);
  if($('statCoins')) $('statCoins').textContent = formatCoins(c);
}

function handleDailyLogin() {
  if (!S.user.lastLogin || !isToday(S.user.lastLogin)) {
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate()-1);
    const yk = yesterday.toISOString().slice(0,10);
    if (S.user.lastLogin === yk) { S.user.streak = (S.user.streak||0)+1; }
    else if (!isToday(S.user.lastLogin||'')) { S.user.streak = 1; }
    S.user.lastLogin = todayKey();
    saveUser();
    // Mark login task done
    completeTask('login');
    // Show banner
    const banner=$('dailyBanner');
    if(banner) banner.style.display='flex';
  } else {
    const banner=$('dailyBanner');
    if(banner) banner.style.display='none';
  }
  updateStreakUI();
}

function claimDaily() {
  if (S.user.lastClaim && isToday(S.user.lastClaim)) { toast('Already claimed today!', 'info'); return; }
  S.user.lastClaim = todayKey();
  saveUser();
  addCoins(50, 'Daily Login Bonus!');
  const banner=$('dailyBanner');
  if(banner) banner.style.display='none';
  confettiPop();
}

function updateStreakUI() {
  const s = S.user.streak||0;
  if($('stStreak')) $('stStreak').textContent = s;
  const dots=$('streakDots');
  if(!dots) return;
  dots.innerHTML='';
  for(let i=0;i<7;i++){
    const d=el('div',`s-dot${i<s?' done':''}`);
    d.textContent = i<s?'✓':(i+1);
    dots.appendChild(d);
  }
}

/* ════════════════════════════
   TASKS
════════════════════════════ */
function initTasks() {
  if (!S.user.tasks || !isToday(S.user.tasks.date)) {
    S.user.tasks = { date:todayKey(), done:{}, progress:{} };
    saveUser();
  }
  renderTasks();
}

function completeTask(id) {
  if(!S.user.tasks) initTasks();
  if(S.user.tasks.done[id]) return;
  const task = TASKS_CONFIG.find(t=>t.id===id);
  if(!task) return;
  S.user.tasks.done[id] = true;
  saveUser();
  addCoins(task.reward, `Task: ${task.name}`);
  renderTasks();
}

function renderTasks() {
  const el_=list=>list;
  const cont=$('tasksList');
  if(!cont) return;
  cont.innerHTML='';
  let earned=0, done=0;
  TASKS_CONFIG.forEach(task=>{
    const isDone = S.user.tasks?.done?.[task.id]||false;
    if(isDone) earned+=task.reward;
    done += isDone?1:0;
    const row=el('div',`task-item${isDone?' done':''}`);
    row.innerHTML=`
      <div class="ti-icon">${isDone?'✅':getTaskIcon(task.id)}</div>
      <div class="ti-info">
        <div class="ti-name">${task.name}</div>
        <div class="ti-desc">${task.desc}</div>
      </div>
      <div class="ti-reward">+${task.reward} 🪙</div>
      ${!isDone && task.type==='manual'?`<button class="btn-sm" data-task="${task.id}">Claim</button>`:'<div class="ti-check">✓</div>'}
    `;
    if(!isDone && task.type==='manual') {
      row.querySelector('button').onclick=()=>{ completeTask(task.id); };
    }
    cont.appendChild(row);
  });
  if($('taskEarned')) $('taskEarned').textContent=`${earned} 🪙`;
  if($('taskDone')) $('taskDone').textContent=`${done}/${TASKS_CONFIG.length}`;
}

function getTaskIcon(id) {
  const icons={login:'📅',create:'🚀',start:'▶️',console:'📟',game:'🎮',watch_ad:'📺',spin:'🎰',share:'🔗'};
  return icons[id]||'⚡';
}

/* ════════════════════════════
   SERVERS
════════════════════════════ */
async function loadServers() {
  try {
    const data = await apiFetch('/servers');
    S.servers = (Array.isArray(data)?data:[]).map(normalizeServer);
    renderServers();
    updateServerStats();
    updateQueueServerSelect();
  } catch(e) {
    console.warn('Server load failed:', e.message);
  }
}

function normalizeServer(raw) {
  const a = raw.attributes||raw;
  return {
    id:       a.identifier||String(a.id),
    numId:    a.id,
    name:     a.name||'Unknown',
    status:   a.is_suspended?'suspended':(a.status||'offline'),
    ram:      a.limits?.memory||1024,
    disk:     a.limits?.disk||6144,
    cpu:      a.limits?.cpu||100,
    suspended:!!a.is_suspended,
  };
}

function renderServers() {
  renderServerGrid(S.servers, 'serverGrid');
  renderServerGrid(S.servers, 'homeServerList', true);
}

function renderServerGrid(servers, containerId, mini=false) {
  const cont=$(containerId);
  if(!cont) return;
  if(!servers.length) { cont.innerHTML='<div class="empty-msg">No servers yet — create one free! ⚡</div>'; return; }
  cont.innerHTML='';
  servers.forEach(s=>{ cont.appendChild(buildServerCard(s, mini)); });
}

function buildServerCard(s, mini=false) {
  const online = s.status==='running'||s.status==='online';
  const card=el('div','server-card');
  if(s.id===S.selectedSrv?.id) card.classList.add('selected');
  const statusClass=online?'online':s.suspended?'suspended':'offline';
  const statusLabel=online?'ONLINE':s.suspended?'SUSPENDED':'OFFLINE';
  card.innerHTML=`
    <div class="srv-hdr">
      <div>
        <div class="srv-name">${esc(s.name)}</div>
        <div class="srv-id">${esc(s.id)}</div>
      </div>
      <div class="srv-status ${statusClass}">
        <span class="srv-dot ${online?'on':''}"></span>${statusLabel}
      </div>
    </div>
    ${!mini?`
    <div class="srv-stats">
      <div class="srv-stat"><div class="srv-sl">RAM</div><div class="srv-sv">${s.ram} MB</div></div>
      <div class="srv-stat"><div class="srv-sl">Disk</div><div class="srv-sv">${s.disk} MB</div></div>
    </div>`:''}
    <div class="srv-actions">
      <button class="srv-btn ${online?'stop':'start'}" data-action="${online?'stop':'start'}" data-id="${esc(s.id)}">${online?'⏹ Stop':'▶ Start'}</button>
      <button class="srv-btn console" data-console data-id="${esc(s.id)}" data-name="${esc(s.name)}">📟 Console</button>
    </div>
  `;
  card.querySelectorAll('[data-action]').forEach(btn=>{
    btn.onclick=e=>{e.stopPropagation(); powerAction(s.id, btn.dataset.action);};
  });
  card.querySelectorAll('[data-console]').forEach(btn=>{
    btn.onclick=e=>{e.stopPropagation(); selectServer(s); navigateTo('console');};
  });
  return card;
}

async function powerAction(id, action) {
  const ep = action==='start'?`/start-server/${id}`:`/stop-server/${id}`;
  showLoading(`${action==='start'?'Starting':'Stopping'} server…`);
  try {
    await apiFetch(ep, {method:'POST',body:{}});
    toast(`Server ${action} signal sent!`, 'success');
    consoleLog(`[power] ${action} signal sent to ${id}`, 'info');
    completeTask(action==='start'?'start':'start');
    setTimeout(loadServers, 1500);
  } catch(e) { toast(e.message, 'error'); }
  finally { hideLoading(); }
}

async function createServer() {
  const name = $('srvName')?.value?.trim();
  const ram  = parseInt($('srvRam')?.value||'1024');
  if(!name) { toast('Enter a server name!', 'error'); return; }
  if(ram<1024||ram>3072) { toast('RAM must be 1024–3072 MB', 'error'); return; }
  showLoading(`🚀 Launching "${name}"…`);
  try {
    const r = await apiFetch('/create-server', {method:'POST',body:{name,ramMb:ram,preset:S.preset}});
    const newId = r.attributes?.identifier||r.identifier;
    const newName = r.attributes?.name||name;
    toast(`🎉 "${newName}" is live!`, 'success');
    consoleLog(`Server created: ${newName}`, 'success');
    completeTask('create');
    if(newId) selectServer({id:newId, name:newName});
    await loadServers();
    navigateTo('servers');
    confettiPop();
  } catch(e) { toast(e.message,'error'); }
  finally { hideLoading(); }
}

function selectServer(s) {
  S.selectedSrv = s;
  $('consoleSrvName').textContent = `📟 ${s.name}`;
  if(S.socket?.connected) S.socket.emit('console:subscribe', s.id);
  consoleLog(`→ Connected to: ${s.name}`, 'success');
  completeTask('console');
}

function updateServerStats() {
  const n=S.servers.length;
  if($('stServers')) $('stServers').textContent=n;
  if($('statServers')) $('statServers').textContent=n;
}

function updateQueueServerSelect() {
  const sel=$('qSrvSelect');
  if(!sel) return;
  sel.innerHTML='<option value="">Select server…</option>';
  S.servers.forEach(s=>{
    const o=document.createElement('option');
    o.value=s.id; o.textContent=s.name;
    sel.appendChild(o);
  });
}

/* ════════════════════════════
   CONSOLE
════════════════════════════ */
function consoleLog(text, type='info') {
  const out=$('consoleOut');
  if(!out) return;
  // remove placeholder on first real line
  const ph=out.querySelector('.cw-line');
  if(ph) ph.parentElement?.querySelectorAll('.cw-line').forEach(e=>e.remove());
  const line=el('div',`c-line ${type}`);
  line.textContent=text;
  out.appendChild(line);
  if(S.autoScroll) out.scrollTop=out.scrollHeight;
}

async function sendConsoleCmd() {
  const inp=$('consoleInput');
  const cmd=inp?.value?.trim();
  if(!cmd) return;
  if(!S.selectedSrv) { toast('Select a server first!', 'error'); return; }
  consoleLog(`❯ ${cmd}`, 'cmd');
  S.cmdHistory.unshift(cmd); S.cmdIdx=-1;
  inp.value='';
  completeTask('console');
  try { await apiFetch(`/console/${S.selectedSrv.id}`, {method:'POST',body:{command:cmd}}); }
  catch(e) { consoleLog(`Error: ${e.message}`, 'error'); }
}

/* ════════════════════════════
   MINI GAMES — BLOCKMINER
════════════════════════════ */
const BLOCKS=[{emoji:'🪨',hp:100,pts:1},{emoji:'🪵',hp:60,pts:2},{emoji:'💎',hp:200,pts:5},{emoji:'🔥',hp:150,pts:3},{emoji:'🟫',hp:80,pts:2}];

function startMiner() {
  if(S.minerActive) return;
  S.minerActive=true; S.minerScore=0; S.minerTimeLeft=30; S.minerCombo=0;
  updateMinerUI();
  const blk=$('minerBlock'); if(blk) blk.disabled=false;
  $('minerStart').textContent='Mining…';
  $('minerStart').disabled=true;
  spawnBlock();
  S.minerTimer=setInterval(()=>{
    S.minerTimeLeft--;
    if($('minerTime')) $('minerTime').textContent=S.minerTimeLeft;
    if(S.minerTimeLeft<=0) endMiner();
  },1000);
  completeTask('game');
}

function spawnBlock() {
  const b=BLOCKS[Math.floor(Math.random()*BLOCKS.length)];
  S.blockHp=b.hp; S.blockMaxHp=b.hp; S.currentBlock=b;
  if($('blockEmoji')) $('blockEmoji').textContent=b.emoji;
  updateBlockBar();
}

function hitBlock() {
  if(!S.minerActive) return;
  S.minerCombo++; S.blockHp-=10;
  S.minerScore += S.currentBlock.pts * (S.minerCombo>=5?2:1);
  updateMinerUI();
  updateBlockBar();
  const blk=$('minerBlock');
  if(blk){blk.style.transform='scale(.9)'; setTimeout(()=>{blk.style.transform='';},80);}
  if(S.minerCombo>=5) { $('comboText').textContent=`🔥 ${S.minerCombo}x COMBO!`; }
  else { $('comboText').textContent=''; }
  if(S.blockHp<=0) { S.minerCombo=0; $('comboText').textContent=''; spawnBlock(); }
}

function updateBlockBar() {
  const bar=$('blockBar');
  if(bar) bar.style.width=`${Math.max(0,(S.blockHp/S.blockMaxHp)*100)}%`;
}

function updateMinerUI() {
  if($('minerScore')) $('minerScore').textContent=S.minerScore;
  const reward=Math.floor(S.minerScore/10);
  if($('minerReward')) $('minerReward').textContent=reward;
}

function endMiner() {
  clearInterval(S.minerTimer); S.minerActive=false;
  const blk=$('minerBlock'); if(blk) blk.disabled=true;
  $('minerStart').textContent='⛏ Play Again!';
  $('minerStart').disabled=false;
  const reward=Math.floor(S.minerScore/10);
  if(reward>0) addCoins(reward, 'BlockMiner reward!');
  else toast('Better luck next time! Earn points to get coins.','info');
  $('comboText').textContent='';
}

/* ════════════════════════════
   MINI GAMES — SPIN WHEEL
════════════════════════════ */
function drawWheel() {
  const canvas=$('spinWheel'); if(!canvas) return;
  const ctx=canvas.getContext('2d');
  const n=SPIN_SEGMENTS.length, arc=(2*Math.PI)/n;
  ctx.clearRect(0,0,300,300);
  SPIN_SEGMENTS.forEach((seg,i)=>{
    const start=S.spinAngle+(i*arc), end=start+arc;
    ctx.beginPath(); ctx.moveTo(150,150);
    ctx.arc(150,150,145,start,end);
    ctx.fillStyle=seg.color; ctx.fill();
    ctx.strokeStyle='#080b14'; ctx.lineWidth=2; ctx.stroke();
    ctx.save(); ctx.translate(150,150);
    ctx.rotate(start+arc/2);
    ctx.textAlign='right'; ctx.fillStyle='#fff';
    ctx.font='bold 13px DM Sans'; ctx.fillText(seg.label,135,5);
    ctx.restore();
  });
}

function spinWheel() {
  if(S.spinAnimating) return;
  const last=S.user.spinLastUsed;
  const cooldown=4*60*60*1000;
  const free = !last || (Date.now()-last>cooldown);
  if(!free) {
    if(!spendCoins(20, 'Extra Spin')) return;
  }
  S.user.spinLastUsed=Date.now(); saveUser();
  S.spinAnimating=true;
  const winIdx=Math.floor(Math.random()*SPIN_SEGMENTS.length);
  const n=SPIN_SEGMENTS.length, arc=(2*Math.PI)/n;
  const targetAngle=(2*Math.PI*5)+(winIdx*arc)+arc/2;
  const dur=4000; const start=performance.now();
  const startAngle=S.spinAngle;
  function animate(now){
    const t=Math.min((now-start)/dur,1);
    const ease=1-Math.pow(1-t,4);
    S.spinAngle=startAngle+targetAngle*ease;
    drawWheel();
    if(t<1){ requestAnimationFrame(animate); }
    else {
      S.spinAnimating=false;
      const seg=SPIN_SEGMENTS[winIdx];
      const res=$('spinResult');
      if(res){
        res.innerHTML=`<span style="color:${seg.color}">${seg.label}</span>`;
        res.style.animation='comboPop .4s ease';
      }
      if(seg.coins>0) addCoins(seg.coins,'Spin Wheel!');
      else toast('No coins this time! Try again 😄','info');
      completeTask('spin');
      updateSpinCooldown();
    }
  }
  requestAnimationFrame(animate);
}

function updateSpinCooldown() {
  const el_=$('spinCooldown'); if(!el_) return;
  const last=S.user.spinLastUsed;
  if(!last){el_.textContent=''; return;}
  const left=4*60*60*1000-(Date.now()-last);
  if(left<=0){el_.textContent='Free spin available!'; return;}
  const h=Math.floor(left/3600000), m=Math.floor((left%3600000)/60000);
  el_.textContent=`Next free spin in ${h}h ${m}m`;
}

/* ════════════════════════════
   MINI GAMES — QUIZ
════════════════════════════ */
function startQuiz() {
  // Pick 10 random questions
  const shuffled=[...QUIZ_QUESTIONS].sort(()=>Math.random()-.5);
  S.quizQuestions=shuffled.slice(0,10);
  S.quizIdx=0; S.quizScore=0;
  $('quizIntro').classList.add('hidden');
  $('quizResult').classList.add('hidden');
  $('quizGame').classList.remove('hidden');
  showQuizQuestion();
  completeTask('game');
}

function showQuizQuestion() {
  const q=S.quizQuestions[S.quizIdx];
  if(!q) { endQuiz(); return; }
  $('qProg').textContent=`Q ${S.quizIdx+1}/10`;
  $('qLive').textContent=S.quizScore;
  $('qText').textContent=q.q;
  const opts=$('qOpts'); opts.innerHTML='';
  q.opts.forEach((opt,i)=>{
    const b=el('button','qopt');
    b.textContent=opt;
    b.onclick=()=>answerQuiz(i,q.a);
    opts.appendChild(b);
  });
  S.quizTimeLeft=30;
  $('qTimer').textContent=30;
  clearInterval(S.quizTimer);
  S.quizTimer=setInterval(()=>{
    S.quizTimeLeft--;
    $('qTimer').textContent=S.quizTimeLeft;
    if(S.quizTimeLeft<=0){ clearInterval(S.quizTimer); answerQuiz(-1,q.a); }
  },1000);
}

function answerQuiz(chosen, correct) {
  clearInterval(S.quizTimer);
  const opts=$('qOpts').children;
  [...opts].forEach((b,i)=>{
    b.disabled=true;
    if(i===correct) b.classList.add('correct');
    else if(i===chosen&&chosen!==correct) b.classList.add('wrong');
  });
  if(chosen===correct) { S.quizScore+=10; toast('+10 🪙 Correct!','success',1500); }
  setTimeout(()=>{ S.quizIdx++; showQuizQuestion(); }, 1200);
}

function endQuiz() {
  clearInterval(S.quizTimer);
  $('quizGame').classList.add('hidden');
  $('quizResult').classList.remove('hidden');
  $('qrCoins').textContent=S.quizScore;
  $('qrCorrect').textContent=S.quizScore/10;
  if(S.quizScore>0) addCoins(S.quizScore,'MC Quiz reward!');
}

/* ════════════════════════════
   LEADERBOARD (Mock + real)
════════════════════════════ */
function generateLeaderboard() {
  const names=['CoolMiner','Steve_Pro','DiamondKid','CreepyGuy','NotchFan2','BlockBoss','PVP_Goat','SkyWalker','EnderLord','CraftMaster','NetherKing','RespawnGod'];
  S.leaderboard.coins=names.map((n,i)=>({name:n,val:Math.floor(5000-(i*400)+Math.random()*200)})).sort((a,b)=>b.val-a.val);
  S.leaderboard.streak=names.map((n,i)=>({name:n,val:30-i+Math.floor(Math.random()*5)})).sort((a,b)=>b.val-a.val);
  S.leaderboard.games=names.map((n,i)=>({name:n,val:100-i*7+Math.floor(Math.random()*10)})).sort((a,b)=>b.val-a.val);
  // insert current user
  const us={name:S.user.name, val:S.user.coins||0, me:true};
  S.leaderboard.coins.push(us); S.leaderboard.coins.sort((a,b)=>b.val-a.val);
}

function renderLeaderboard() {
  const data=S.leaderboard[S.currentLB]||[];
  const cont=$('lbTable');
  if(!cont) return;
  cont.innerHTML='';
  data.slice(0,15).forEach((row,i)=>{
    const div=el('div',`lb-row${row.me?' me':''}`);
    const rankClass=i===0?'gold':i===1?'silver':i===2?'bronze':'';
    const suffix=S.currentLB==='coins'?'🪙':S.currentLB==='streak'?'🔥':'🎮';
    div.innerHTML=`
      <div class="lb-rank ${rankClass}">${i===0?'🥇':i===1?'🥈':i===2?'🥉':`#${i+1}`}</div>
      <div class="lb-avatar">${row.name[0].toUpperCase()}</div>
      <div class="lb-name">${esc(row.name)}${row.me?' (You)':''}</div>
      <div class="lb-val">${row.val.toLocaleString()} ${suffix}</div>
    `;
    cont.appendChild(div);
  });
  const myIdx=data.findIndex(r=>r.me);
  const myRank=$('lbMyRank');
  if(myRank) myRank.textContent=myIdx>=0?`Your rank: #${myIdx+1}`:'Your rank: Not ranked yet';
}

/* ════════════════════════════
   QUEUE
════════════════════════════ */
function updateQueueUI() {
  S.queuePos = Math.max(1, Math.floor(Math.random()*20)+1);
  S.queueTotal = S.queuePos + Math.floor(Math.random()*30);
  if($('qPos')) $('qPos').textContent = S.queuePos;
  if($('qTotal')) $('qTotal').textContent = S.queueTotal;
  const eta = S.queuePos*3;
  if($('qEta')) $('qEta').textContent = eta<60?`${eta}m`:`${Math.floor(eta/60)}h`;
  const pct = Math.min(100, (1-(S.queuePos/S.queueTotal))*100);
  const fill=$('qbFill'); if(fill) fill.style.width=`${pct}%`;
  const lbl=$('qbLbl'); if(lbl) lbl.textContent=`Position ${S.queuePos} of ${S.queueTotal} · ~${eta} min wait`;
}

function joinQueue() {
  const sel=$('qSrvSelect'); const srvId=sel?.value;
  if(!srvId){toast('Select a server first!','error'); return;}
  if(S.user.coins<10){toast('Need at least 10 coins to join queue!','error'); return;}
  showModal(`
    <h3 style="margin-bottom:12px">🔋 Join 24/7 Queue</h3>
    <p style="color:var(--c-muted2);margin-bottom:16px">Your server will stay online. Costs 10 🪙/hour from your balance.</p>
    <p style="margin-bottom:20px">Current balance: <b style="color:var(--c-yellow)">${formatCoins(S.user.coins)} 🪙</b></p>
    <button class="btn-main w100" id="confirmJoin">Confirm — Join Queue</button>
  `);
  setTimeout(()=>{
    $('confirmJoin')?.addEventListener('click',()=>{
      spendCoins(10,'Queue entry fee');
      hideModal();
      toast('✅ Joined 24/7 queue! Server will stay online.','success');
      updateQueueUI();
    });
  },50);
}

function skipQueue() {
  if(!spendCoins(50,'Skip queue')) return;
  toast('⚡ Skipped queue! Server is going online now!','success');
  confettiPop();
  updateQueueUI();
}

/* ════════════════════════════
   AD SYSTEM
════════════════════════════ */
function watchAd() {
  const last=S.user.adLastUsed;
  const cd=30*60*1000; // 30 min cooldown
  if(last && Date.now()-last<cd) {
    const left=Math.ceil((cd-(Date.now()-last))/60000);
    toast(`Ad available in ${left} min`, 'info'); return;
  }
  // Simulate ad watch
  showLoading('Loading ad…');
  setTimeout(()=>{
    hideLoading();
    showModal(`
      <h3 style="margin-bottom:12px">📺 Watch Ad</h3>
      <p style="color:var(--c-muted2);margin-bottom:16px">Watch this short ad to earn BlockCoins!</p>
      <div style="background:rgba(255,255,255,.05);border-radius:12px;padding:40px;text-align:center;margin-bottom:20px;border:1px dashed var(--c-border)">
        <!-- Google AdSense: Replace with your ad unit -->
        <div style="font-size:2rem;margin-bottom:8px">📢</div>
        <div style="color:var(--c-muted2);font-size:.9rem">Ad playing… (5 seconds)</div>
      </div>
      <button class="btn-main w100" id="adDone" disabled>Watching… (5s)</button>
    `);
    let t=5;
    const i=setInterval(()=>{
      t--;
      const b=$('adDone');
      if(b) {
        if(t<=0){ clearInterval(i); b.textContent='Claim +20 🪙!'; b.disabled=false; b.onclick=()=>{ S.user.adLastUsed=Date.now(); saveUser(); addCoins(20,'Ad reward!'); completeTask('watch_ad'); hideModal(); updateAdCooldown(); }; }
        else { b.textContent=`Watching… (${t}s)`; }
      }
    },1000);
  },800);
}

function updateAdCooldown() {
  const last=S.user.adLastUsed;
  const el_=$('adCooldown'); if(!el_) return;
  if(!last) {el_.textContent=''; return;}
  const left=30*60*1000-(Date.now()-last);
  if(left<=0){el_.textContent=''; return;}
  const m=Math.ceil(left/60000);
  el_.textContent=`Next ad in ${m} min`;
}

/* ════════════════════════════
   REFERRAL
════════════════════════════ */
function copyReferral() {
  if(!S.user.referralCode) S.user.referralCode='BP'+S.user.name.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6)+Math.random().toString(36).slice(2,5).toUpperCase();
  saveUser();
  const link=`${location.origin}${location.pathname}?ref=${S.user.referralCode}`;
  navigator.clipboard?.writeText(link).then(()=>{ toast('Referral link copied! Share with friends 🎉','success'); });
  completeTask('share');
}

/* ════════════════════════════
   CONFETTI
════════════════════════════ */
function confettiPop() {
  const colors=['#4ade80','#22d3ee','#a855f7','#fbbf24','#f87171'];
  for(let i=0;i<60;i++){
    const p=document.createElement('div');
    p.style.cssText=`position:fixed;top:50%;left:50%;width:8px;height:8px;border-radius:2px;background:${colors[i%colors.length]};pointer-events:none;z-index:9999;animation:confetti .8s ease-out forwards`;
    const a=Math.random()*Math.PI*2, d=100+Math.random()*200;
    p.style.setProperty('--tx', `${Math.cos(a)*d}px`);
    p.style.setProperty('--ty', `${Math.sin(a)*d}px`);
    document.body.appendChild(p);
    setTimeout(()=>p.remove(), 900);
  }
  if(!document.querySelector('#confettiStyle')){
    const s=document.createElement('style');
    s.id='confettiStyle';
    s.textContent='@keyframes confetti{from{transform:translate(-50%,-50%) scale(1);opacity:1;}to{transform:translate(calc(-50% + var(--tx)),calc(-50% + var(--ty))) scale(0);opacity:0;}}';
    document.head.appendChild(s);
  }
}

/* ════════════════════════════
   NAVIGATION
════════════════════════════ */
function navigateTo(page) {
  S.currentPage=page;
  qsa('.dash-page').forEach(p=>p.classList.remove('active'));
  const target=$(`page-${page}`); if(target) target.classList.add('active');
  qsa('.sb-item').forEach(b=>b.classList.toggle('active', b.dataset.page===page));
  // Close mobile sidebar
  $('sidebar')?.classList.remove('open');
  // Page-specific logic
  if(page==='servers') loadServers();
  if(page==='home') { updateCoinUI(); loadServers(); }
  if(page==='leaderboard') { generateLeaderboard(); renderLeaderboard(); }
  if(page==='queue') updateQueueUI();
  if(page==='coins') { updateAdCooldown(); updateStreakUI(); }
  if(page==='games') { drawWheel(); updateSpinCooldown(); }
  if(page==='tasks') renderTasks();
}

function showLanding() { $('landingPage').classList.add('active'); $('loginPage').classList.remove('active'); $('dashboardPage').classList.remove('active'); $('adminPage')?.classList.remove('active'); }
function showLogin()   { $('landingPage').classList.remove('active'); $('loginPage').classList.add('active'); $('dashboardPage').classList.remove('active'); $('adminPage')?.classList.remove('active'); }
function showDashboard(){ $('landingPage').classList.remove('active'); $('loginPage').classList.remove('active'); $('dashboardPage').classList.add('active'); $('adminPage')?.classList.remove('active'); }
function showAdmin()   { $('landingPage').classList.remove('active'); $('loginPage').classList.remove('active'); $('dashboardPage').classList.remove('active'); $('adminPage')?.classList.add('active'); }

/* ════════════════════════════
   LOGIN / LOGOUT
════════════════════════════ */
function tryLogin() {
  const username=$('loginUsername').value.trim();
  if(!/^[a-zA-Z0-9_]{3,20}$/.test(username)){ toast('Username must be 3–20 chars: letters, numbers, underscores','error'); return; }
  const existing=Store.get('user');
  const isNew = !existing || existing.name !== username;
  // Load or create user
  if(!S.user || S.user.name!==username) {
    if(existing&&existing.name===username) { S.user=existing; }
    else {
      S.user={name:username, coins:100, streak:0, lastLogin:null, lastClaim:null, spinLastUsed:null, adLastUsed:null, tasks:null};
      toast('🎉 Welcome! +100 BlockCoins added!','success',5000);
    }
    saveUser();
  }
  sendAuthEvent(isNew?'register':'login', username);
  bootDashboard();
}

function logout() {
  S.user=null; S.selectedSrv=null; S.servers=[];
  if(S.socket) S.socket.disconnect();
  showLanding();
}

function bootDashboard() {
  showDashboard();
  $('sbName').textContent=S.user.name;
  $('sbAvatar').textContent=S.user.name[0].toUpperCase();
  $('homeGreeting').textContent=`Hey, ${S.user.name} 👋`;
  updateCoinUI();
  handleDailyLogin();
  initTasks();
  loadServers();
  initSocket();
  drawWheel();
  updateSpinCooldown();
  updateAdCooldown();
  navigateTo('home');
  // Rank
  if($('stRank')) $('stRank').textContent='#'+Math.floor(Math.random()*100+1);
}

function openAdminLogin() {
  showModal(`
    <h3 style="margin-bottom:12px">🔐 Admin Access</h3>
    <p style="color:var(--c-muted2);margin-bottom:16px">Sign in to view all servers, logins, and registrations.</p>
    <label class="fl">Admin Username</label>
    <input id="adminUsername" type="text" class="fi" placeholder="admin" autocomplete="off"/>
    <label class="fl" style="margin-top:12px">Admin Password</label>
    <input id="adminPassword" type="password" class="fi" placeholder="••••••••" autocomplete="current-password"/>
    <button class="btn-main w100" id="adminLoginSubmit" style="margin-top:16px">Unlock Admin →</button>
  `);
  $('adminLoginSubmit')?.addEventListener('click', adminLogin);
  $('adminPassword')?.addEventListener('keydown', e=>{ if(e.key==='Enter') adminLogin(); });
}

async function adminLogin() {
  const username=$('adminUsername')?.value?.trim();
  const password=$('adminPassword')?.value||'';
  if(!username||!password) { toast('Enter admin username & password','error'); return; }
  const authHeader='Basic '+btoa(`${username}:${password}`);
  showLoading('Verifying admin…');
  try {
    const data = await apiFetch('/admin/metrics', { headers: { Authorization: authHeader } });
    S.admin={ username, authHeader };
    S.adminMetrics=data;
    hideModal();
    showAdmin();
    renderAdminMetrics(data);
  } catch(e) { toast(e.message||'Admin login failed','error'); }
  finally { hideLoading(); }
}

function adminLogout() {
  S.admin=null; S.adminMetrics=null;
  showLanding();
}

async function loadAdminMetrics() {
  if(!S.admin) return;
  showLoading('Refreshing admin metrics…');
  try {
    const data = await apiFetch('/admin/metrics', { headers: { Authorization: S.admin.authHeader } });
    S.adminMetrics=data;
    renderAdminMetrics(data);
  } catch(e) { toast(e.message||'Failed to load metrics','error'); }
  finally { hideLoading(); }
}

function renderAdminMetrics(data) {
  if(!data) return;
  if($('admTotalServers')) $('admTotalServers').textContent=data.totals?.servers ?? 0;
  if($('admTotalUsers')) $('admTotalUsers').textContent=data.totals?.users ?? 0;
  if($('admTotalLogins')) $('admTotalLogins').textContent=data.totals?.logins ?? 0;
  if($('admTotalRegisters')) $('admTotalRegisters').textContent=data.totals?.registrations ?? 0;

  const events=$('adminEventsTable');
  if(events) {
    if(!data.recentEvents?.length) {
      events.innerHTML='<tr><td colspan="4" class="empty-msg">No login activity yet.</td></tr>';
    } else {
      events.innerHTML=data.recentEvents.map(ev=>`
        <tr>
          <td>${esc(ev.username||'—')}</td>
          <td>${esc(ev.type||'—')}</td>
          <td>${esc(ev.ip||'—')}</td>
          <td>${formatDate(ev.createdAt)}</td>
        </tr>
      `).join('');
    }
  }

  const servers=$('adminServersTable');
  if(servers) {
    if(!data.servers?.length) {
      servers.innerHTML='<tr><td colspan="4" class="empty-msg">No servers yet.</td></tr>';
    } else {
      servers.innerHTML=data.servers.map(raw=>{
        const s=normalizeServer(raw);
        return `
          <tr>
            <td>${esc(s.name)}</td>
            <td>${esc(s.id)}</td>
            <td>${esc(s.status)}</td>
            <td>${s.ram} MB</td>
          </tr>
        `;
      }).join('');
    }
  }
}

/* ════════════════════════════
   HELPERS
════════════════════════════ */
function esc(s) { return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

/* ════════════════════════════
   EVENTS
════════════════════════════ */
function bindEvents() {
  // Landing
  $('heroGetStarted')?.addEventListener('click',showLogin);
  $('loginNavBtn')?.addEventListener('click',showLogin);
  $('loginBtn')?.addEventListener('click',tryLogin);
  $('loginBack')?.addEventListener('click',showLanding);
  $('adminLoginLink')?.addEventListener('click',openAdminLogin);
  $('loginUsername')?.addEventListener('keydown',e=>{if(e.key==='Enter') tryLogin();});
  $('logoutBtn')?.addEventListener('click',logout);
  $('adminLogoutBtn')?.addEventListener('click',adminLogout);
  $('adminRefresh')?.addEventListener('click',loadAdminMetrics);

  // Sidebar navigation
  qsa('.sb-item').forEach(b=>{ b.addEventListener('click',()=>navigateTo(b.dataset.page)); });

  // Quick action buttons
  qsa('.qa-btn[data-page]').forEach(b=>{ b.addEventListener('click',()=>navigateTo(b.dataset.page)); });

  // Earn page buttons with data-page
  qsa('[data-page]').forEach(b=>{
    if(!b.classList.contains('sb-item')&&!b.classList.contains('qa-btn')) {
      b.addEventListener('click',()=>navigateTo(b.dataset.page));
    }
  });

  // Mobile hamburger
  $('hamburger')?.addEventListener('click',()=>$('sidebar')?.classList.toggle('open'));

  // Modal close
  $('modalClose')?.addEventListener('click',hideModal);
  $('modalOverlay')?.addEventListener('click',e=>{ if(e.target===$('modalOverlay')) hideModal(); });

  // Dashboard home
  $('homeRefresh')?.addEventListener('click',loadServers);
  $('newServerBtn')?.addEventListener('click',()=>navigateTo('create'));

  // Create server
  $('createServerBtn')?.addEventListener('click',createServer);
  qsa('.preset').forEach(p=>{ p.addEventListener('click',()=>{
    qsa('.preset').forEach(x=>x.classList.remove('active'));
    p.classList.add('active'); S.preset=p.dataset.p;
    const info=$('presetInfo'); if(info) info.textContent=PRESET_INFO[S.preset]||'';
  });});

  // Console
  $('consoleSend')?.addEventListener('click',sendConsoleCmd);
  $('consoleInput')?.addEventListener('keydown',e=>{
    if(e.key==='Enter') { sendConsoleCmd(); }
    else if(e.key==='ArrowUp') { S.cmdIdx=Math.min(S.cmdIdx+1,S.cmdHistory.length-1); $('consoleInput').value=S.cmdHistory[S.cmdIdx]||''; }
    else if(e.key==='ArrowDown') { S.cmdIdx=Math.max(S.cmdIdx-1,-1); $('consoleInput').value=S.cmdHistory[S.cmdIdx]||''; }
  });
  $('consoleClear')?.addEventListener('click',()=>{ $('consoleOut').innerHTML=''; });
  $('consoleCopy')?.addEventListener('click',()=>{ navigator.clipboard?.writeText($('consoleOut').innerText).then(()=>toast('Copied!','success')); });
  $('autoScroll')?.addEventListener('change',e=>{S.autoScroll=e.target.checked;});

  // Daily claim
  $('claimDailyBtn')?.addEventListener('click',claimDaily);
  $('claimDailyBtn2')?.addEventListener('click',claimDaily);

  // Earn
  $('watchAdBtn')?.addEventListener('click',watchAd);
  $('copyReferralBtn')?.addEventListener('click',copyReferral);

  // Games
  qsa('.gtab').forEach(t=>{ t.addEventListener('click',()=>{
    qsa('.gtab').forEach(x=>x.classList.remove('active')); t.classList.add('active');
    S.currentGame=t.dataset.game;
    qsa('.game-panel').forEach(p=>p.classList.remove('active'));
    $(`game-${S.currentGame}`)?.classList.add('active');
    if(S.currentGame==='spin') { drawWheel(); updateSpinCooldown(); }
  });});
  $('minerStart')?.addEventListener('click',startMiner);
  $('minerBlock')?.addEventListener('click',hitBlock);
  $('spinBtn')?.addEventListener('click',spinWheel);
  $('startQuiz')?.addEventListener('click',startQuiz);
  $('quizRetry')?.addEventListener('click',startQuiz);

  // Leaderboard
  qsa('.lbt').forEach(t=>{ t.addEventListener('click',()=>{
    qsa('.lbt').forEach(x=>x.classList.remove('active')); t.classList.add('active');
    S.currentLB=t.dataset.lb; renderLeaderboard();
  });});

  // Queue
  $('joinQueueBtn')?.addEventListener('click',joinQueue);
  $('skipQueueBtn')?.addEventListener('click',skipQueue);
}

/* ════════════════════════════
   LATENCY MONITOR
════════════════════════════ */
function startLatencyMonitor() {
  setInterval(async()=>{
    try {
      const t=performance.now();
      await apiFetch('/health');
      const ms=Math.round(performance.now()-t);
      const chip=$('latencyChip'); if(chip) { chip.textContent=`${ms}ms`; chip.className=`chip cyan${ms>300?' text-red':''}`; }
    } catch(e){}
  }, 15000);
}

/* ════════════════════════════
   BOOT
════════════════════════════ */
function boot() {
  // Check for saved user session
  if(loadUser()) {
    sendAuthEvent('login', S.user.name);
    bootDashboard();
  }
  bindEvents();
  startLatencyMonitor();
  // Auto-refresh coins/streak every minute
  setInterval(()=>{
    if(S.user) { updateCoinUI(); updateAdCooldown(); updateSpinCooldown(); }
  }, 60000);
}

if(document.readyState==='loading') { document.addEventListener('DOMContentLoaded',boot); }
else { boot(); }

window.addEventListener('error',e=>console.error('[BP]',e.message));
window.addEventListener('unhandledrejection',e=>console.error('[BP]',e.reason));

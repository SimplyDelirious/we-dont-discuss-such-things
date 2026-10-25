// WDDST Build 19 — authenticated Firebase room gateway.
// Room presence + test messages ONLY. Godot multiplayer sync is not connected yet.
const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const admin = require('firebase-admin');

const PORT = Number(process.env.PORT || 10000);
const DATABASE_URL = 'https://wddst-ed444-default-rtdb.firebaseio.com';
const PROJECT_ID = 'wddst-ed444';
if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  console.error('Missing FIREBASE_SERVICE_ACCOUNT_JSON. Set it in Render > Environment.');
  process.exit(1);
}
let credentials;
try {
  credentials = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
} catch (error) {
  console.error('FIREBASE_SERVICE_ACCOUNT_JSON must contain valid JSON.');
  process.exit(1);
}
if (credentials.project_id !== PROJECT_ID) {
  console.error('Service account belongs to the wrong Firebase project.');
  process.exit(1);
}
admin.initializeApp({
  credential: admin.credential.cert(credentials),
  databaseURL: DATABASE_URL,
});

// Connections tracked per room. Only authenticated members can enter.
const clients = new Map();
function send(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}
function roster(room) {
  const people = clients.get(room) || new Set();
  const names = [...people].map(ws => ({ uid: ws.uid, name: ws.displayName }));
  for (const ws of people) send(ws, { type: 'roster', room, players: names });
}
function detach(ws) {
  if (!ws.room) return;
  const room = ws.room;
  clients.get(room)?.delete(ws);
  if (clients.get(room)?.size === 0) clients.delete(room);
  ws.room = null;
  roster(room);
}
const page = `<!doctype html><html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>WDDST · The Guest Book</title><style>
body{background:#17120e;color:#ebd8b9;font:16px Georgia,serif;max-width:650px;margin:60px auto;padding:16px}
h1{color:#e7a357}input,button{padding:12px;background:#2b221c;color:#f5dcbc;border:1px solid #ab8356}
input{width:160px;text-transform:uppercase}button{cursor:pointer;margin:4px}pre{white-space:pre-wrap;background:#211b17;padding:15px;min-height:110px}
small{color:#bca88b}</style></head><body>
<h1>we don't discuss such things.</h1><p>Maple Court / The Guest Book</p>
<p><input id="code" maxlength="6" placeholder="ROOM CODE" /><button id="join">JOIN + TEST</button></p>
<pre id="out">Ready. Use an existing WDDST Firebase room code.</pre>
<small>This checks Firebase identity, lobby membership, and Render WebSockets. No 3D gameplay yet.</small>
<script src="https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.5/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.5/firebase-database-compat.js"></script>
<script>
firebase.initializeApp({
 apiKey:'AIzaSyBsbPfe0HuJ7bq0NPt9VoO0jwrDdaJ9hiU',
 authDomain:'wddst-ed444.firebaseapp.com',
 databaseURL:'https://wddst-ed444-default-rtdb.firebaseio.com',
 projectId:'wddst-ed444',
 appId:'1:396527803772:web:4dede2551827b37e3458f9'
});
let socket;
const output=document.getElementById('out');
const log=(s)=>{output.textContent+='\\n'+s;};
document.getElementById('join').onclick=async()=>{
 output.textContent='Signing in as a Firebase guest...';
 const room=document.getElementById('code').value.trim().toUpperCase();
 if(!/^[A-Z0-9]{6}$/.test(room)){log('Enter a six-character room code.');return;}
 try{
  const auth=firebase.auth();
  if(!auth.currentUser) await auth.signInAnonymously();
  const uid=auth.currentUser.uid;
  const ref=firebase.database().ref('rooms/'+room);
  const snap=await ref.once('value');
  if(!snap.exists()){log('Room not found.');return;}
  const data=snap.val();
  if(data.status!=='waiting'){log('Room is not accepting guests.');return;}
  if(!data.members?.[uid]){
    await ref.child('members/'+uid).set({name:'Browser Guest',joined:Date.now()});
  }
  log('Firebase member recognized. Connecting to Render...');
  const token=await auth.currentUser.getIdToken();
  if(socket) socket.close();
  socket=new WebSocket('wss://'+location.host+'/room');
  socket.onopen=()=>socket.send(JSON.stringify({type:'join',room,token}));
  socket.onmessage=e=>{
    const m=JSON.parse(e.data);
    if(m.type==='joined'){
      log('SUCCESS: authenticated WebSocket joined room '+m.room);
      socket.send(JSON.stringify({type:'ping'}));
    } else if(m.type==='pong') log('SUCCESS: room message exchanged.');
    else if(m.type==='roster') log('Connected peers: '+m.players.length);
    else if(m.type==='error') log('SERVER ERROR: '+m.message);
  };
  socket.onerror=()=>log('WebSocket connection error.');
  socket.onclose=()=>log('Socket disconnected.');
 }catch(e){log('FAILED: '+e.message+' (check Firebase rules / Render settings)');}
};
</script></body></html>`;

const server = http.createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.url === '/health') {
    res.writeHead(200, {'Content-Type':'application/json'});
    return res.end(JSON.stringify({ok:true,service:'WDDST authenticated room gateway',gameplayReady:false}));
  }
  if (req.url !== '/') {res.writeHead(404);return res.end('Not found');}
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
  res.end(page);
});
const wss = new WebSocketServer({server,path:'/room',maxPayload:8192});
wss.on('connection', ws => {
  ws.room=null;
  const deadline=setTimeout(()=>{if(!ws.room)ws.close(1008,'Authentication required');},10000);
  ws.on('message', async raw => {
    let msg;
    try {msg=JSON.parse(raw.toString());} catch {return send(ws,{type:'error',message:'Invalid JSON'});}
    if (!ws.room) {
      if (msg.type !== 'join' || !/^[A-Z0-9]{6}$/.test(msg.room||'') || typeof msg.token !== 'string') {
        send(ws,{type:'error',message:'Room code and Firebase ID token required'});
        return ws.close(1008,'Unauthorized');
      }
      try {
        const decoded=await admin.auth().verifyIdToken(msg.token);
        const roomSnap=await admin.database().ref('rooms/'+msg.room).get();
        const room=roomSnap.val();
        if (!room || room.status !== 'waiting' || !room.members?.[decoded.uid]) throw Error('Not an active room member');
        const group=clients.get(msg.room)||new Set();
        if (group.size >= 8) throw Error('Room full');
        ws.uid=decoded.uid;
        ws.displayName=String(room.members[decoded.uid].name||'Guest').slice(0,24);
        ws.room=msg.room;
        clearTimeout(deadline);
        group.add(ws);
        clients.set(ws.room,group);
        send(ws,{type:'joined',room:ws.room,uid:ws.uid});
        roster(ws.room);
      }catch(err){send(ws,{type:'error',message:'Join rejected: '+err.message});ws.close(1008,'Unauthorized');}
      return;
    }
    if (msg.type === 'ping') send(ws,{type:'pong',room:ws.room});
    else send(ws,{type:'error',message:'Gameplay protocol not implemented yet'});
  });
  ws.on('close',()=>{clearTimeout(deadline);detach(ws);});
  ws.on('error',()=>{});
});
server.listen(PORT,'0.0.0.0',()=>console.log('WDDST room gateway listening on '+PORT));

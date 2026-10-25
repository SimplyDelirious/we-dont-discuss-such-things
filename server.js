// WDDST hosted WebSocket connection test.
// Does NOT implement room admission, Firebase, or live Godot gameplay.
const http = require('http');
const WebSocket = require('ws');
const port = Number(process.env.PORT || 10000);
const server = http.createServer((req, res) => {
  res.writeHead(200, {'content-type':'application/json', 'cache-control':'no-store'});
  res.end(JSON.stringify({service:'WDDST connection test',ok:true,gameplayReady:false}));
});
const wss = new WebSocket.Server({server, path:'/test', maxPayload:4096});
wss.on('connection', ws => {
  ws.send(JSON.stringify({type:'connected',note:'Connection test only; gameplay is not connected.'}));
  ws.on('message', data => {
    if (data.length > 4096) return ws.close(1009,'Message too large');
    ws.send(JSON.stringify({type:'echo',message:String(data)}));
  });
});
server.listen(port, '0.0.0.0', () => console.log(`WDDST test server listening on ${port}`));

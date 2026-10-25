
 // WDDST Render WebSocket Connection Test
 // This is a connection test, NOT the finished multiplayer game server.

const http = require("http");
const WebSocket = require("ws");

const port = Number(process.env.PORT || 10000);

const html = `
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>WDDST — Connection Check</title>
<style>
body {
  background: #16120f;
  color: #e9d5b1;
  font: 16px Georgia, serif;
  max-width: 600px;
  padding: 50px 22px;
  margin: auto;
}
h1 { color: #e8a556; }
button {
  padding: 14px 22px;
  background: #513927;
  color: #ffe2bb;
  border: 1px solid #b48753;
  cursor: pointer;
}
pre {
  white-space: pre-wrap;
  background: #211b18;
  padding: 14px;
}
small { color: #b9a18a; }
</style>
</head>
<body>
<h1>we don't discuss such things.</h1>
<p>Maple Court · Server connection check</p>

<button id="test">TEST WEBSOCKET</button>
<pre id="result">Server page loaded. Click to test the connection.</pre>

<small>
This checks Render + WebSockets only.
Firebase rooms and live Godot gameplay are not connected yet.
</small>

<script>
document.getElementById("test").onclick = () => {
  const out = document.getElementById("result");
  out.textContent = "Connecting...";

  const scheme = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(scheme + "://" + location.host + "/test");

  let finished = false;

  ws.onmessage = (event) => {
    let msg;

    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }

    if (msg.type === "connected") {
      ws.send(JSON.stringify({ type: "ping" }));
    } else if (msg.type === "pong") {
      finished = true;
      out.textContent = "SUCCESS — Render WebSocket works!";
      ws.close();
    }
  };

  ws.onerror = () => {
    out.textContent = "Connection failed. Check Render logs.";
  };

  ws.onclose = () => {
    if (!finished && out.textContent === "Connecting...") {
      out.textContent = "Connection closed before test completed.";
    }
  };
};
</script>
</body>
</html>
`;

const server = http.createServer((req, res) => {
  res.setHeader("Cache-Control", "no-store");

  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      service: "WDDST transport smoke test",
      ok: true,
      gameplayReady: false
    }));
  }

  if (req.url !== "/") {
    res.writeHead(404);
    return res.end("Not found");
  }

  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8"
  });

  res.end(html);
});

const wss = new WebSocket.Server({
  server,
  path: "/test",
  maxPayload: 4096
});

wss.on("connection", (ws) => {
  ws.send(JSON.stringify({
    type: "connected",
    note: "WDDST WebSocket smoke test"
  }));

  ws.on("message", (raw) => {
    if (raw.length > 4096) {
      return ws.close(1009, "Too large");
    }

    try {
      const msg = JSON.parse(raw.toString());

      if (msg.type === "ping") {
        ws.send(JSON.stringify({ type: "pong" }));
      } else {
        ws.send(JSON.stringify({
          type: "error",
          message: "Only ping supported"
        }));
      }
    } catch {
      ws.send(JSON.stringify({
        type: "error",
        message: "Invalid JSON"
      }));
    }
  });
});

server.listen(port, "0.0.0.0", () => {
  console.log("WDDST test server listening on " + port);
});

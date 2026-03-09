import http from "node:http";

const port = Number.parseInt(process.env.PORT || "8080", 10);

const server = http.createServer((req, res) => {
  if (req.url === "/api/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        timestamp: new Date().toISOString(),
      })
    );
    return;
  }

  res.writeHead(200, { "content-type": "text/plain" });
  res.end("OK");
});

server.listen(port, "0.0.0.0", () => {
  // eslint-disable-next-line no-console
  console.log(`Listening on ${port}`);
});

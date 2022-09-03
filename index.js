import { createServer } from "http";
import { Radio } from "./Radio.js";
import { onExit } from "./onExit.js";
import config from "./config.js";

if (!Object.keys(config.sources).length) throw new Error("No sources found, define them in `config.js`.");

const radios = Object.entries(config.sources).reduce((obj, [key, path]) => {
  obj[key.toLowerCase()] = new Radio(key, path);
  return obj;
}, {});

/**
 * @param req {import("http").IncomingMessage}
 * @param res {import("http").ServerResponse}
 */
function processRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const radioName = (url.pathname.split("/").find((v) => v) || "default").toLowerCase();
  const radio = radios[radioName];

  if (!radio) return res.writeHead(404, { "Content-Type": "text/plain" }).end(`Radio '${radioName}' not found.`);

  res.writeHead(200, {
    "Content-Type": "audio/mp3",
    "Transfer-Encoding": "chunked",
    Expires: "-1",
    Pragma: "no-cache",
    "Cache-Control": "no-cache, no-store",
  });
  const destroy = () => req.destroy();

  radio.output.pipe(res, { end: true });
  radio.output.on("close", destroy);

  res.on("close", () => {
    radio.output.unpipe(res);
    radio.output.off("close", destroy);
  });
}

const server = createServer((req, res) => {
  try {
    processRequest(req, res);
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/plain" }).end(err.toString());
  }
});

server.addListener("listening", () => {
  console.log(`Listening on http://localhost:${server.address().port}/`);
});

server.listen(config.port ?? 9099);

onExit(() => {
  if (!server.listening) return;
  server.close();
  console.log("Exitting...");
});

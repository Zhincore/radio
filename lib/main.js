import { createServer } from "http";
import { Radio } from "./Radio.js";
import config from "../config.js";

if (!Object.keys(config.sources).length) throw new Error("No sources found, define them in `config.js`.");

const radios = Object.entries(config.sources).reduce((obj, [key, path]) => {
  obj[key.toLowerCase()] = new Radio(path);
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
    "Content-Type": "audio/mpeg; codecs=opus",
    "Transfer-Encoding": "chunked",
    Expires: "-1",
    Pragma: "no-cache",
    "Cache-Control": "no-cache, no-store",
  });

  console.log(res._writableState);
  radio.connect(res);
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

function env(key, fallback) {
  return process.env[key] ? process.env[key] : fallback;
}

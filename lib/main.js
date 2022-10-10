import { createServer } from "http";
import { Radio } from "./Radio.js";
import config from "../config.js";

const radio = new Radio(config.music, config.ads, config.musicCount, config.adCount);

/**
 * @param req {import("http").IncomingMessage}
 * @param res {import("http").ServerResponse}
 */
function processRequest(_req, res) {
  if (!radio) return res.writeHead(404, { "Content-Type": "text/plain" }).end(`Radio '${radioName}' not found.`);

  radio.connect(
    res.writeHead(200, {
      "Content-Type": "audio/mp3",
      "Transfer-Encoding": "chunked",
      Expires: "-1",
      Pragma: "no-cache",
      "Cache-Control": "no-cache, no-store",
    }),
  );
}

const server = createServer({ noDelay: true }, (req, res) => {
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

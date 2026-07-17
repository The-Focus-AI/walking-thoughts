// PROTOTYPE — throw away after the recording interaction is decided.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const indexPath = fileURLToPath(new URL("./index.html", import.meta.url));
const port = Number(process.env.PORT ?? 4173);

createServer(async (_request, response) => {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(await readFile(indexPath));
}).listen(port, "127.0.0.1", () => {
  console.log(`Recording UI prototype: http://127.0.0.1:${port}/?variant=A`);
});

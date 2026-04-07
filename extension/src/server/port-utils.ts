/**
 * 在 [base, base+attempts) 内探测可绑定端口（避免与 LocalServer.listen 冲突的竞态窗口尽量小）。
 * primary_doc: docs/ARCHITECTURE.md §4.2, docs/IMPLEMENTATION_GUIDE.md Phase 5.2
 */
import * as net from "node:net";

export function findAvailablePort(
  base: number,
  attempts: number
): Promise<number> {
  return new Promise((resolve, reject) => {
    const tryAt = (offset: number): void => {
      if (offset >= attempts) {
        reject(
          new Error(
            `Observatory: no free port in range ${base}..${base + attempts - 1}`
          )
        );
        return;
      }
      const port = base + offset;
      const s = net.createServer();
      s.once("error", () => {
        s.close();
        tryAt(offset + 1);
      });
      s.listen(port, "127.0.0.1", () => {
        s.close(() => resolve(port));
      });
    };
    tryAt(0);
  });
}

import { createHash } from 'node:crypto';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function frame(op: number, payload: any): any {
  const len = payload.length;
  const head = len < 126 ? Buffer.from([0x80 | op, len]) : len < 65536
    ? Buffer.from([0x80 | op, 126, len >> 8, len & 255])
    : (() => { const b = Buffer.alloc(10); b[0] = 0x80 | op; b[1] = 127; b.writeUInt32BE(len, 6); return b; })();
  return Buffer.concat([head, payload]);
}

/** WebSocket (RFC 6455) mínimo del lado servidor: texto, ping/pong, cierre, fragmentación y límite de tamaño. */
export class WsConnection {
  isAlive = true;
  closed = false;
  onMessage: (text: string) => void = () => {};
  onClose: () => void = () => {};
  private buf: any = Buffer.alloc(0);
  private frag: any[] = [];
  private fragLen = 0;

  constructor(private socket: any, private maxPayload = 16 * 1024) {
    socket.setNoDelay(true);
    socket.on('data', (d: any) => this.onData(d));
    socket.on('close', () => this.finish());
    socket.on('error', () => this.finish());
  }

  /** Valida la petición de upgrade y completa el handshake; devuelve null (y cierra) si no es válida. */
  static accept(req: any, socket: any, allowedOrigin?: string, maxPayload?: number): WsConnection | null {
    const key = req.headers['sec-websocket-key'];
    const bad = (code: string) => { socket.write(`HTTP/1.1 ${code}\r\nConnection: close\r\n\r\n`); socket.destroy(); return null; };
    if (String(req.headers.upgrade ?? '').toLowerCase() !== 'websocket') return bad('400 Bad Request');
    if (req.headers['sec-websocket-version'] !== '13' || typeof key !== 'string' || key.length > 64) return bad('400 Bad Request');
    const origin = req.headers.origin as string | undefined;
    if (allowedOrigin && allowedOrigin !== '*') { if (origin !== allowedOrigin) return bad('403 Forbidden'); }
    else if (!allowedOrigin && origin) { // defensa contra CSWSH: un navegador solo puede conectar desde el mismo host
      let host = ''; try { host = new URL(origin).host; } catch { /* origen inválido */ }
      if (host !== req.headers.host) return bad('403 Forbidden');
    }
    const accept = createHash('sha1').update(key + GUID).digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    return new WsConnection(socket, maxPayload);
  }

  send(text: string): void { if (!this.closed) this.socket.write(frame(1, Buffer.from(text, 'utf8'))); }
  ping(): void { if (!this.closed) this.socket.write(frame(9, Buffer.alloc(0))); }
  close(code = 1000): void {
    if (this.closed) return;
    try { this.socket.write(frame(8, Buffer.from([code >> 8, code & 255]))); this.socket.end(); } catch { /* socket ya roto */ }
    this.finish();
  }
  private finish(): void {
    const was = this.closed; this.closed = true; this.buf = null;
    if (was) return;
    try { this.socket.destroy(); } catch { /* noop */ }
    this.onClose();
  }

  private onData(d: any): void {
    if (this.closed) return;
    this.buf = Buffer.concat([this.buf, d]);
    if (this.buf.length > this.maxPayload * 2 + 16) return this.close(1009);
    for (;;) {
      const b = this.buf;
      if (!b || b.length < 2) return;
      const fin = !!(b[0] & 0x80), op = b[0] & 0x0f, masked = !!(b[1] & 0x80);
      let len = b[1] & 0x7f, off = 2;
      if (!masked || (b[0] & 0x70) !== 0) return this.close(1002); // cliente→servidor SIEMPRE enmascarado; sin extensiones
      if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (b.length < 10) return; if (b.readUInt32BE(2) !== 0) return this.close(1009); len = b.readUInt32BE(6); off = 10; }
      if (len > this.maxPayload || (op >= 8 && (len > 125 || !fin))) return this.close(len > this.maxPayload ? 1009 : 1002);
      if (b.length < off + 4 + len) return;
      const mask = b.subarray(off, off + 4);
      const payload = Buffer.from(b.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < len; i++) payload[i] ^= mask[i % 4];
      this.buf = b.subarray(off + 4 + len);
      if (op === 8) return this.close(1000);
      if (op === 9) { this.socket.write(frame(10, payload)); continue; }
      if (op === 10) { this.isAlive = true; continue; }
      if (op === 2) return this.close(1003);
      if (op === 1 && this.frag.length) return this.close(1002);
      if (op === 0 && !this.frag.length) return this.close(1002);
      if (op !== 0 && op !== 1) return this.close(1002);
      this.fragLen += len;
      if (this.fragLen > this.maxPayload) return this.close(1009);
      this.frag.push(payload);
      if (fin) {
        const text = Buffer.concat(this.frag).toString('utf8');
        this.frag = []; this.fragLen = 0;
        this.isAlive = true;
        this.onMessage(text);
        if (this.closed) return;
      }
    }
  }
}

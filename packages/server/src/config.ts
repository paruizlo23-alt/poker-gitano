export interface SiteConfig { siteUrl: string; ownerName: string; ownerAddress: string; ownerEmail: string; ownerNif: string; hosting: string; deckCredit: string; adsClient?: string }
export interface Config { port: number; dataDir: string; allowedOrigin?: string; trustProxy: boolean; actionMs: number; maxRooms: number; botDelayMs: number; gameResultMs: number; site: SiteConfig }
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const int = (v: string | undefined, d: number) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.floor(n) : d; };
  return { port: int(env.PORT, 8080), dataDir: env.DATA_DIR ?? './data', allowedOrigin: env.ALLOWED_ORIGIN || (env.SITE_URL ? new URL(env.SITE_URL).origin : undefined),
    trustProxy: env.TRUST_PROXY === '1', actionMs: int(env.ACTION_MS, 60_000), maxRooms: int(env.MAX_ROOMS, 500),
    botDelayMs: int(env.BOT_DELAY_MS, 1200), gameResultMs: int(env.RESULT_MS, 7000),
    site: {
      siteUrl: (env.SITE_URL ?? `http://localhost:${int(env.PORT, 8080)}`).replace(/\/+$/, ''),
      ownerName: env.OWNER_NAME ?? '', ownerAddress: env.OWNER_ADDRESS ?? '', ownerEmail: env.OWNER_EMAIL ?? '', ownerNif: env.OWNER_NIF ?? '',
      hosting: env.HOSTING_PROVIDER ?? 'el proveedor de alojamiento contratado', deckCredit: env.DECK_CREDIT ?? 'una baraja española libre (autoría y licencia indicadas en el repositorio)',
      adsClient: !(env.OWNER_NIF ?? '').trim() ? undefined : /^(ca-)?pub-\d{10,20}$/.test(env.ADSENSE_CLIENT ?? '') ? (env.ADSENSE_CLIENT as string).replace(/^pub-/, 'ca-pub-') : undefined,
    } };
}

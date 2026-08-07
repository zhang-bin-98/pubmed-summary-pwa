const NCBI_BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const TOOL_NAME = 'pubmed_summary_pwa';
const RETRY_DELAYS = [500, 1000, 2000] as const;

export interface NcbiSearchResult {
  count: number;
  ids: string[];
  webEnv: string;
  queryKey: string;
}

export class NcbiError extends Error {
  constructor(public readonly code: string, message: string, public readonly status?: number) {
    super(message);
    this.name = 'NcbiError';
  }
}

const sleep = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

async function requestWithRetry(fetcher: typeof fetch, input: RequestInfo | URL, init: RequestInit, signal: AbortSignal): Promise<Response> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await fetcher(input, { ...init, signal });
      if (response.ok) return response;
      if ((response.status === 429 || response.status >= 500) && attempt < RETRY_DELAYS.length) {
        await sleep(RETRY_DELAYS[attempt] + Math.floor(Math.random() * 201));
        continue;
      }
      throw new NcbiError(response.status === 429 ? 'ncbi-rate-limit' : 'ncbi-response', `NCBI request failed (${response.status})`, response.status);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      if (error instanceof NcbiError) throw error;
      throw new NcbiError('ncbi-network', error instanceof Error ? error.message : 'NCBI network request failed');
    }
  }
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    return await response.json() as Record<string, unknown>;
  } catch {
    throw new NcbiError('ncbi-response', 'NCBI returned invalid JSON');
  }
}

export class NcbiClient {
  constructor(private readonly apiKey: string, private readonly fetcher: typeof fetch = fetch) {}

  async search(term: string, maxResults: number, signal: AbortSignal): Promise<NcbiSearchResult> {
    const body = new URLSearchParams({
      db: 'pubmed',
      retmode: 'json',
      retmax: String(maxResults),
      usehistory: 'y',
      term,
      api_key: this.apiKey,
      tool: TOOL_NAME,
    });
    const response = await requestWithRetry(this.fetcher, `${NCBI_BASE}/esearch.fcgi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    }, signal);
    const payload = await readJson(response);
    const result = payload.esearchresult as Record<string, unknown> | undefined;
    if (!result) throw new NcbiError('ncbi-response', 'NCBI ESearch response is missing esearchresult');
    return {
      count: Number(result.count ?? 0),
      ids: Array.isArray(result.idlist) ? result.idlist.map(String) : [],
      webEnv: String(result.webenv ?? ''),
      queryKey: String(result.querykey ?? ''),
    };
  }

  async count(term: string, signal: AbortSignal): Promise<number> {
    const body = new URLSearchParams({ db: 'pubmed', retmode: 'json', retmax: '0', term, api_key: this.apiKey, tool: TOOL_NAME });
    const response = await requestWithRetry(this.fetcher, `${NCBI_BASE}/esearch.fcgi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    }, signal);
    const payload = await readJson(response);
    const result = payload.esearchresult as Record<string, unknown> | undefined;
    if (!result) throw new NcbiError('ncbi-response', 'NCBI ESearch response is missing esearchresult');
    return Number(result.count ?? 0);
  }

  async fetchAbstractPages(history: Pick<NcbiSearchResult, 'webEnv' | 'queryKey'>, total: number, signal: AbortSignal, pageSize = 100): Promise<string[]> {
    const pages: string[] = [];
    for (let start = 0; start < total; start += pageSize) {
      const body = new URLSearchParams({
        db: 'pubmed',
        rettype: 'abstract',
        retmode: 'xml',
        WebEnv: history.webEnv,
        query_key: history.queryKey,
        retstart: String(start),
        retmax: String(Math.min(pageSize, total - start)),
        api_key: this.apiKey,
        tool: TOOL_NAME,
      });
      const response = await requestWithRetry(this.fetcher, `${NCBI_BASE}/efetch.fcgi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      }, signal);
      pages.push(await response.text());
    }
    return pages;
  }
}

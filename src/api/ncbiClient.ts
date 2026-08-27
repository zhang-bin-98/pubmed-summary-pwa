const NCBI_BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const TOOL_NAME = 'pubmed_summary_pwa';
const RETRY_DELAYS = [500, 1000, 2000] as const;
const ANONYMOUS_REQUEST_INTERVAL = 350;

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

const abortError = () => new DOMException('The operation was aborted', 'AbortError');

const isAbortError = (error: unknown): boolean =>
  (error instanceof DOMException || error instanceof Error) && error.name === 'AbortError';

const sleep = (milliseconds: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal.aborted) {
    reject(abortError());
    return;
  }

  const timeout = setTimeout(() => {
    signal.removeEventListener('abort', onAbort);
    resolve();
  }, milliseconds);
  const onAbort = () => {
    clearTimeout(timeout);
    reject(abortError());
  };
  signal.addEventListener('abort', onAbort, { once: true });
});

let anonymousRequestQueue: Promise<unknown> = Promise.resolve();
let lastAnonymousRequestAt = 0;

function scheduleAnonymousRequest<T>(signal: AbortSignal, request: () => Promise<T>): Promise<T> {
  if (signal.aborted) return Promise.reject(abortError());
  const scheduled = anonymousRequestQueue.then(async () => {
    const delay = Math.max(0, lastAnonymousRequestAt + ANONYMOUS_REQUEST_INTERVAL - Date.now());
    if (delay > 0) await sleep(delay, signal);
    if (signal.aborted) throw abortError();
    lastAnonymousRequestAt = Date.now();
    return request();
  });
  anonymousRequestQueue = scheduled.catch(() => undefined);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener('abort', onAbort, { once: true });
    void scheduled.then(
      (value) => { signal.removeEventListener('abort', onAbort); resolve(value); },
      (error) => { signal.removeEventListener('abort', onAbort); reject(error); },
    );
  });
}

const createRequestBody = (values: Record<string, string>, apiKey: string): URLSearchParams => {
  const body = new URLSearchParams(values);
  if (apiKey) body.set('api_key', apiKey);
  return body;
};

async function requestWithRetry(
  sendRequest: () => Promise<Response>,
  signal: AbortSignal,
): Promise<Response> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await sendRequest();
      if (response.ok) return response;
      if ((response.status === 429 || response.status >= 500) && attempt < RETRY_DELAYS.length) {
        await sleep(RETRY_DELAYS[attempt] + Math.floor(Math.random() * 201), signal);
        continue;
      }
      throw new NcbiError(response.status === 429 ? 'ncbi-rate-limit' : 'ncbi-response', `NCBI request failed (${response.status})`, response.status);
    } catch (error) {
      if (isAbortError(error)) throw error;
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
  private readonly apiKey: string;

  constructor(apiKey: string, private readonly fetcher: typeof fetch = fetch) {
    this.apiKey = apiKey.trim();
  }

  private request(input: RequestInfo | URL, init: RequestInit, signal: AbortSignal): Promise<Response> {
    const fetcher = this.fetcher;
    const sendRequest = () => fetcher(input, { ...init, signal });
    return requestWithRetry(
      this.apiKey ? sendRequest : () => scheduleAnonymousRequest(signal, sendRequest),
      signal,
    );
  }

  async search(term: string, maxResults: number, signal: AbortSignal): Promise<NcbiSearchResult> {
    const body = createRequestBody({
      db: 'pubmed',
      retmode: 'json',
      retmax: String(maxResults),
      usehistory: 'y',
      term,
      tool: TOOL_NAME,
    }, this.apiKey);
    const response = await this.request(`${NCBI_BASE}/esearch.fcgi`, {
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
    const body = createRequestBody({ db: 'pubmed', retmode: 'json', retmax: '0', term, tool: TOOL_NAME }, this.apiKey);
    const response = await this.request(`${NCBI_BASE}/esearch.fcgi`, {
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
      const body = createRequestBody({
        db: 'pubmed',
        rettype: 'abstract',
        retmode: 'xml',
        WebEnv: history.webEnv,
        query_key: history.queryKey,
        retstart: String(start),
        retmax: String(Math.min(pageSize, total - start)),
        tool: TOOL_NAME,
      }, this.apiKey);
      const response = await this.request(`${NCBI_BASE}/efetch.fcgi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      }, signal);
      pages.push(await response.text());
    }
    return pages;
  }
}

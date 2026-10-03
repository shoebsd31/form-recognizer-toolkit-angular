/**
 * Thin client for the Azure AI Content Understanding (CU) REST API.
 *
 * Docs: https://learn.microsoft.com/azure/ai-services/content-understanding/
 *       REST reference (GA 2025-11-01):
 *       https://learn.microsoft.com/rest/api/contentunderstanding/content-analyzers
 *
 * All configuration (endpoint, key, api-version, default analyzer, results dir)
 * is read from environment variables — see `sample.env`. Nothing is hard-coded.
 *
 * The three operations the toolkit needs:
 *   - createOrReplaceAnalyzer(..)  -> PUT  /analyzers/{id}            ("train"/build)
 *   - analyzeBinary(..)            -> POST /analyzers/{id}:analyzeBinary  (upload a file)
 *   - getAnalyzer(..) / deleteAnalyzer(..)
 * Create + analyze are asynchronous: they return an `Operation-Location` that is
 * polled until the operation reaches a terminal state.
 */

/** Resolved CU configuration from environment variables. */
export interface CuConfig {
    endpoint: string; // e.g. https://my-resource.services.ai.azure.com
    apiKey: string;
    apiVersion: string; // e.g. 2025-11-01
    defaultAnalyzerId: string;
    resultsDir: string; // where <filename>.result.json is written
    pollIntervalMs: number;
    pollTimeoutMs: number;
}

/** Error carrying an HTTP status so the Express error middleware can surface it. */
export class CuError extends Error {
    statusCode: number;
    details?: unknown;
    constructor(message: string, statusCode = 502, details?: unknown) {
        super(message);
        this.name = "CuError";
        this.statusCode = statusCode;
        this.details = details;
    }
}

/**
 * Read and validate CU configuration from the environment. Throws a 500 if the
 * endpoint or key is missing so the caller gets an actionable message instead of
 * a confusing network error.
 */
export const getCuConfig = (): CuConfig => {
    const endpoint = (process.env.CU_ENDPOINT || "").trim().replace(/\/+$/, "");
    const apiKey = (process.env.CU_API_KEY || "").trim();
    if (!endpoint || !apiKey) {
        throw new CuError(
            "Content Understanding is not configured. Set CU_ENDPOINT and CU_API_KEY in your .env (see sample.env).",
            500
        );
    }
    return {
        endpoint,
        apiKey,
        apiVersion: (process.env.CU_API_VERSION || "2025-11-01").trim(),
        defaultAnalyzerId: (process.env.CU_ANALYZER_ID || "").trim(),
        resultsDir: (process.env.CU_RESULTS_DIR || "Server/data").trim(),
        pollIntervalMs: Number(process.env.CU_POLL_INTERVAL_MS) || 2000,
        pollTimeoutMs: Number(process.env.CU_POLL_TIMEOUT_MS) || 300000,
    };
};

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Append the api-version query parameter to a CU path or absolute URL. */
const withApiVersion = (url: string, apiVersion: string): string =>
    url.includes("api-version=") ? url : `${url}${url.includes("?") ? "&" : "?"}api-version=${apiVersion}`;

/** Build an absolute URL under the resource's /contentunderstanding root. */
const cuUrl = (cfg: CuConfig, path: string): string =>
    withApiVersion(`${cfg.endpoint}/contentunderstanding${path}`, cfg.apiVersion);

/** Issue a CU request with the subscription-key header; throws CuError on non-2xx. */
const cuRequest = async (
    cfg: CuConfig,
    url: string,
    init: { method: string; body?: BodyInit; contentType?: string }
): Promise<Response> => {
    const headers: Record<string, string> = { "Ocp-Apim-Subscription-Key": cfg.apiKey };
    if (init.contentType) headers["Content-Type"] = init.contentType;
    const res = await fetch(withApiVersion(url, cfg.apiVersion), {
        method: init.method,
        headers,
        body: init.body,
    });
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        let details: unknown = text;
        try {
            details = text ? JSON.parse(text) : undefined;
        } catch {
            /* keep raw text */
        }
        throw new CuError(`Content Understanding API error (${res.status} ${res.statusText}).`, res.status, details);
    }
    return res;
};

/** True once an async operation/result has reached a terminal state. */
const isTerminal = (status: string | undefined): boolean =>
    ["succeeded", "failed", "canceled", "cancelled", "completed"].includes((status || "").toLowerCase());

/**
 * Poll an operation/result URL until it reaches a terminal state (or times out).
 * Works for both the create-analyzer operation and the analyze result, which both
 * expose a top-level `status` field.
 */
const pollUntilDone = async (cfg: CuConfig, url: string): Promise<any> => {
    const deadline = Date.now() + cfg.pollTimeoutMs;
    let last: any;
    while (Date.now() < deadline) {
        const res = await cuRequest(cfg, url, { method: "GET" });
        last = await res.json().catch(() => ({}));
        if (isTerminal(last?.status)) return last;
        await sleep(cfg.pollIntervalMs);
    }
    throw new CuError(`Content Understanding operation timed out after ${cfg.pollTimeoutMs} ms.`, 504, last);
};

// ---------------------------------------------------------------------------
// Analyzer lifecycle: create/build ("train"), get, delete
// ---------------------------------------------------------------------------

/**
 * Create or replace (build) a custom analyzer, then wait for the build to finish.
 * This is the "train"/build step: PUT the analyzer definition, then poll the
 * Operation-Location until the analyzer is ready.
 */
export const createOrReplaceAnalyzer = async (
    cfg: CuConfig,
    analyzerId: string,
    definition: unknown
): Promise<{ status: string; analyzer: any }> => {
    const res = await cuRequest(cfg, cuUrl(cfg, `/analyzers/${encodeURIComponent(analyzerId)}`), {
        method: "PUT",
        contentType: "application/json",
        body: JSON.stringify(definition ?? {}),
    });
    const operationLocation = res.headers.get("operation-location");
    const created = await res.json().catch(() => ({}));
    // If the build is asynchronous, poll the operation to completion.
    const final = operationLocation ? await pollUntilDone(cfg, operationLocation) : created;
    if ((final?.status || "").toLowerCase() === "failed") {
        throw new CuError("Content Understanding analyzer build failed.", 502, final);
    }
    return { status: final?.status ?? "succeeded", analyzer: final?.result ?? final ?? created };
};

/** Fetch an analyzer's definition / build status. */
export const getAnalyzer = async (cfg: CuConfig, analyzerId: string): Promise<any> => {
    const res = await cuRequest(cfg, cuUrl(cfg, `/analyzers/${encodeURIComponent(analyzerId)}`), { method: "GET" });
    return res.json();
};

/** Delete a custom analyzer. */
export const deleteAnalyzer = async (cfg: CuConfig, analyzerId: string): Promise<void> => {
    await cuRequest(cfg, cuUrl(cfg, `/analyzers/${encodeURIComponent(analyzerId)}`), { method: "DELETE" });
};

// ---------------------------------------------------------------------------
// Analyze: upload file bytes and retrieve the structured result
// ---------------------------------------------------------------------------

/**
 * Analyze a file by uploading its raw bytes to the `:analyzeBinary` operation,
 * then poll for and return the full analyze result object.
 *
 * @param contentType MIME type of the upload (defaults to application/octet-stream;
 *                     the service infers the format when the default is used).
 */
export const analyzeBinary = async (
    cfg: CuConfig,
    analyzerId: string,
    bytes: Buffer | Uint8Array,
    contentType = "application/octet-stream"
): Promise<any> => {
    const res = await cuRequest(cfg, cuUrl(cfg, `/analyzers/${encodeURIComponent(analyzerId)}:analyzeBinary`), {
        method: "POST",
        contentType,
        body: bytes as unknown as BodyInit,
    });
    const operationLocation = res.headers.get("operation-location");
    const accepted = await res.json().catch(() => ({}));
    // Prefer the Operation-Location header; fall back to the analyzerResults URL
    // built from the returned result id.
    const resultUrl =
        operationLocation ||
        (accepted?.id ? cuUrl(cfg, `/analyzerResults/${encodeURIComponent(accepted.id)}`) : undefined);
    if (!resultUrl) {
        throw new CuError("Content Understanding did not return a result location for the analyze request.", 502, accepted);
    }
    const final = await pollUntilDone(cfg, resultUrl);
    if ((final?.status || "").toLowerCase() === "failed") {
        throw new CuError("Content Understanding analysis failed.", 502, final);
    }
    return final;
};

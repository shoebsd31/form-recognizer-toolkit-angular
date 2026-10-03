/**
 * Express handlers that drive the Azure AI Content Understanding (CU) REST API.
 *
 * Endpoints (mounted under /cu — see routes/contentUnderstanding.ts):
 *   POST   /cu/analyze/:filename            Analyze a file and store <filename>.result.json
 *   POST   /cu/analyzers/:analyzerId/train  Create/build ("train") an analyzer from a definition
 *   POST   /cu/analyzers/:analyzerId/test   Analyze a file with an analyzer, return result (not stored)
 *   GET    /cu/analyzers/:analyzerId        Get an analyzer's definition / build status
 *   DELETE /cu/analyzers/:analyzerId        Delete an analyzer
 *
 * Endpoint, key, api-version, default analyzer id and the results directory are
 * all read from environment variables (see sample.env / utils/contentUnderstandingClient).
 */
import { Request, Response, NextFunction } from "express";
import { readFile, writeFile, mkdir, copyFile, readFile as readFileAsync } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import catchAsyncError from "../middlewares/catchAsyncError";
import {
    analyzeBinary,
    createOrReplaceAnalyzer,
    deleteAnalyzer,
    getAnalyzer,
    getCuConfig,
    CuError,
} from "../utils/contentUnderstandingClient";
import { resultToCufLabels, CufFieldSchema } from "../utils/resultToLabels";

/** Source directory for files referenced by name (overridable via CU_DATA_DIR). */
const dataDir = (): string => (process.env.CU_DATA_DIR || "Server/data").trim();

/** Best-effort MIME type for an upload, from the file extension. */
const mimeTypeFor = (filename: string): string => {
    switch ((filename.split(".").pop() || "").toLowerCase()) {
        case "jpg":
        case "jpeg":
            return "image/jpeg";
        case "png":
            return "image/png";
        case "bmp":
            return "image/bmp";
        case "tif":
        case "tiff":
            return "image/tiff";
        case "pdf":
            return "application/pdf";
        case "heif":
            return "image/heif";
        default:
            return "application/octet-stream";
    }
};

/**
 * Resolve the file bytes for an analyze/test request: prefer the raw request body
 * (an uploaded file), otherwise read `:filename` from the data directory.
 */
const resolveBytes = async (req: Request): Promise<Buffer> => {
    const body = req.body;
    if (Buffer.isBuffer(body) && body.length > 0) return body;
    const filename = req.params.filename || (req.query.filename as string | undefined);
    if (!filename) {
        throw new CuError(
            "No file provided. Send the file bytes as the request body (Content-Type: application/octet-stream) or reference an existing file by name.",
            400
        );
    }
    try {
        return await readFile(path.join(dataDir(), filename));
    } catch {
        throw new CuError(`File not found: ${filename}`, 404);
    }
};

/** POST /cu/analyze/:filename — analyze a file and persist <filename>.result.json. */
export const analyzeFile = catchAsyncError(async (req: Request, res: Response, _next: NextFunction) => {
    const cfg = getCuConfig();
    const filename = req.params.filename;
    const analyzerId = (req.query.analyzerId as string) || cfg.defaultAnalyzerId;
    if (!analyzerId) {
        throw new CuError("No analyzerId provided and CU_ANALYZER_ID is not set.", 400);
    }

    const bytes = await resolveBytes(req);
    const contentType = req.get("content-type")?.startsWith("application/octet-stream")
        ? "application/octet-stream"
        : mimeTypeFor(filename);

    const result = await analyzeBinary(cfg, analyzerId, bytes, contentType);

    // Persist the result as <filename>.result.json in the configured results dir.
    await mkdir(cfg.resultsDir, { recursive: true });
    const resultPath = path.join(cfg.resultsDir, `${filename}.result.json`);
    await writeFile(resultPath, JSON.stringify(result, null, 2));

    res.status(200).json({
        success: true,
        analyzerId,
        resultFile: resultPath,
        status: result?.status,
        result,
    });
});

/**
 * POST /cu/analyzers/:analyzerId/train — create/build ("train") a custom analyzer.
 * The analyzer definition comes from the JSON request body, or from the file at
 * CU_ANALYZER_DEFINITION_FILE when the body is empty.
 */
export const trainAnalyzer = catchAsyncError(async (req: Request, res: Response, _next: NextFunction) => {
    const cfg = getCuConfig();
    const analyzerId = req.params.analyzerId;

    let definition: unknown = req.body;
    const hasBody = definition && typeof definition === "object" && Object.keys(definition as object).length > 0;
    if (!hasBody) {
        const defFile = (process.env.CU_ANALYZER_DEFINITION_FILE || "").trim();
        if (!defFile) {
            throw new CuError(
                "No analyzer definition provided. POST the definition JSON as the body, or set CU_ANALYZER_DEFINITION_FILE.",
                400
            );
        }
        definition = JSON.parse(await readFileAsync(defFile, "utf-8"));
    }

    const built = await createOrReplaceAnalyzer(cfg, analyzerId, definition);
    res.status(201).json({ success: true, analyzerId, status: built.status, analyzer: built.analyzer });
});

/**
 * POST /cu/analyzers/:analyzerId/test — run a file through an analyzer and return
 * the result inline WITHOUT persisting it (quick verification of a built analyzer).
 */
export const testAnalyzer = catchAsyncError(async (req: Request, res: Response, _next: NextFunction) => {
    const cfg = getCuConfig();
    const analyzerId = req.params.analyzerId;
    const bytes = await resolveBytes(req);
    const filename = req.params.filename || (req.query.filename as string) || "upload";
    const contentType = req.get("content-type")?.startsWith("application/octet-stream")
        ? "application/octet-stream"
        : mimeTypeFor(filename);

    const result = await analyzeBinary(cfg, analyzerId, bytes, contentType);
    res.status(200).json({ success: true, analyzerId, status: result?.status, result });
});

/**
 * Resolve an analyzer `fieldSchema` for labels generation, best-effort:
 *   1. the local CU_ANALYZER_DEFINITION_FILE, if set;
 *   2. otherwise the live analyzer fetched from CU (needs CU_ENDPOINT/CU_API_KEY);
 *   3. otherwise undefined — the converter then derives fields from the result itself.
 */
const resolveFieldSchema = async (analyzerId?: string): Promise<CufFieldSchema | undefined> => {
    const defFile = (process.env.CU_ANALYZER_DEFINITION_FILE || "").trim();
    if (defFile) {
        try {
            const def = JSON.parse(await readFileAsync(defFile, "utf-8"));
            if (def?.fieldSchema) return def.fieldSchema as CufFieldSchema;
        } catch {
            /* fall through to live fetch / derive */
        }
    }
    if (analyzerId) {
        try {
            const cfg = getCuConfig();
            const analyzer = await getAnalyzer(cfg, analyzerId);
            if (analyzer?.fieldSchema) return analyzer.fieldSchema as CufFieldSchema;
        } catch {
            /* CU not configured or analyzer unavailable — derive from result */
        }
    }
    return undefined;
};

/**
 * POST /cu/labels/:filename — generate a CUF <filename>.labels.json from a stored
 * <filename>.result.json. Reads the result from CU_RESULTS_DIR (falls back to
 * CU_DATA_DIR) and writes the labels file beside it in CU_RESULTS_DIR.
 *
 * Field order/completeness come from the analyzer schema when available
 * (?analyzerId=, the result's analyzerId, CU_ANALYZER_ID, or CU_ANALYZER_DEFINITION_FILE).
 */
export const generateLabels = catchAsyncError(async (req: Request, res: Response, _next: NextFunction) => {
    const filename = req.params.filename;
    const resultsDir = (process.env.CU_RESULTS_DIR || "Server/data").trim();

    // Load <filename>.result.json (results dir first, then data dir).
    const resultName = `${filename}.result.json`;
    let raw: string | undefined;
    for (const dir of [resultsDir, dataDir()]) {
        try {
            raw = await readFile(path.join(dir, resultName), "utf-8");
            break;
        } catch {
            /* try next */
        }
    }
    if (!raw) throw new CuError(`Result file not found: ${resultName}`, 404);
    const resultJson = JSON.parse(raw);

    const analyzerId =
        (req.query.analyzerId as string) ||
        resultJson?.result?.analyzerId ||
        (process.env.CU_ANALYZER_ID || "").trim() ||
        undefined;
    const fieldSchema = await resolveFieldSchema(analyzerId);

    const labels = resultToCufLabels(resultJson, {
        fieldSchema,
        displayName: filename,
        mimeType: mimeTypeFor(filename),
    });

    // studio=true -> emit a GUID-named, extension-less trio ready to drop into a
    // Content Understanding Studio labeling container. Studio derives the labelId
    // from the blob base name and requires it to be extension-less (a GUID), so a
    // file named "<name>.jpg.labels.json" is rejected with "labelId is invalid".
    const studio = /^(1|true|yes)$/i.test((req.query.studio as string) || "");
    if (studio) {
        const studioDir = (process.env.CU_STUDIO_DIR || path.join(resultsDir, "studio")).trim();
        const labelId = (req.query.labelId as string) || randomUUID();
        await mkdir(studioDir, { recursive: true });

        // labels + result keyed by the GUID; the original filename stays in displayName.
        await writeFile(path.join(studioDir, `${labelId}.labels.json`), JSON.stringify(labels, null, 2));
        await writeFile(path.join(studioDir, `${labelId}.result.json`), JSON.stringify(resultJson, null, 2));

        // Copy the source image to the extension-less GUID blob name (Studio fetches
        // it at .../labels/{labelId}/document). Best-effort: skip if not found locally.
        let documentWritten = false;
        try {
            await copyFile(path.join(dataDir(), filename), path.join(studioDir, labelId));
            documentWritten = true;
        } catch {
            /* source image not available locally — upload it yourself as the GUID blob */
        }

        res.status(200).json({
            success: true,
            studio: true,
            labelId,
            studioDir,
            files: {
                document: documentWritten ? labelId : null,
                labels: `${labelId}.labels.json`,
                result: `${labelId}.result.json`,
            },
            documentWritten,
            usedFieldSchema: !!fieldSchema,
            fieldCount: Object.keys(labels.fieldLabels).length,
        });
        return;
    }

    await mkdir(resultsDir, { recursive: true });
    const labelsPath = path.join(resultsDir, `${filename}.labels.json`);
    await writeFile(labelsPath, JSON.stringify(labels, null, 2));

    res.status(200).json({
        success: true,
        labelsFile: labelsPath,
        usedFieldSchema: !!fieldSchema,
        fieldCount: Object.keys(labels.fieldLabels).length,
        labels,
    });
});

/** GET /cu/analyzers/:analyzerId — analyzer definition / build status. */
export const getAnalyzerStatus = catchAsyncError(async (req: Request, res: Response, _next: NextFunction) => {
    const cfg = getCuConfig();
    const analyzer = await getAnalyzer(cfg, req.params.analyzerId);
    res.status(200).json({ success: true, analyzer });
});

/** DELETE /cu/analyzers/:analyzerId — delete an analyzer. */
export const removeAnalyzer = catchAsyncError(async (req: Request, res: Response, _next: NextFunction) => {
    const cfg = getCuConfig();
    await deleteAnalyzer(cfg, req.params.analyzerId);
    res.status(204).send();
});

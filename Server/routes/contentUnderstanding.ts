import express from "express";
import {
    analyzeFile,
    trainAnalyzer,
    testAnalyzer,
    getAnalyzerStatus,
    removeAnalyzer,
    generateLabels,
} from "../controllers/contentUnderstandingController";

const router = express.Router();

// Raw body parser for file uploads. Accepts any content-type so callers can send
// the file bytes directly (ideally Content-Type: application/octet-stream). The
// limit is configurable via CU_MAX_UPLOAD (default 100mb).
const rawUpload = express.raw({ type: () => true, limit: process.env.CU_MAX_UPLOAD || "100mb" });

// Analyze a file and store <filename>.result.json (upload bytes, or reference an existing file by name).
router.route("/analyze/:filename").post(rawUpload, analyzeFile);

// Generate <filename>.labels.json (CUF format) from a stored <filename>.result.json.
router.route("/labels/:filename").post(generateLabels);

// Train (create/build) an analyzer from a JSON definition (parsed by the global express.json()).
router.route("/analyzers/:analyzerId/train").post(trainAnalyzer);

// Test an analyzer against an uploaded file; returns the result without storing it.
router.route("/analyzers/:analyzerId/test").post(rawUpload, testAnalyzer);

// Analyzer status + delete.
router.route("/analyzers/:analyzerId").get(getAnalyzerStatus).delete(removeAnalyzer);

export default router;

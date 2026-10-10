import { Request, Response, NextFunction } from "express";
import catchAsyncError from "../middlewares/catchAsyncError";
import { readFile, readdir, writeFile, unlink, stat, mkdir } from "node:fs/promises";

const dataLocation = "Server/data";

// Get file => /files/:fileName
export const getFile = catchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
    try {
        const file = await readFile(`${dataLocation}/${req.params.filename}`);
        res.send(file);
    } catch (err: any) {
        err.statusCode = 404;
        throw err;
    }
});

// Get file => /files
export const listFiles = catchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
    try {
        const files = await readdir(dataLocation);
        res.send(files.filter((f) => !f.startsWith(".")));
    } catch (err: any) {
        err.statusCode = 404;
        throw err;
    }
});

// Put file => /files/:fileName
export const uploadFile = catchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
    const { params, body } = req;
    try {
        await writeFile(`${dataLocation}/${params.filename}`, body.content);
        res.status(201).send({
            success: true,
        });
    } catch (err: any) {
        err.statusCode = 404;
        throw err;
    }
});

// Put metadata => /files/:fileName/metadata  (local stand-in for blob metadata:
// stored as a sidecar in Server/data/.meta/<fileName>.json, same layout the workbench uses)
export const setMetadata = catchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
    const { params, body } = req;
    try {
        await stat(`${dataLocation}/${params.filename}`);
    } catch {
        res.status(404).send({ success: false });
        return;
    }
    await mkdir(`${dataLocation}/.meta`, { recursive: true });
    const metaFile = `${dataLocation}/.meta/${params.filename}.json`;
    let existing = {};
    try {
        existing = JSON.parse(await readFile(metaFile, "utf8"));
    } catch {
        /* no sidecar yet */
    }
    await writeFile(metaFile, JSON.stringify({ ...existing, ...(body.metadata ?? {}) }, null, 2));
    res.status(200).send({ success: true });
});

// Delete file => /files/:fileName
export const deleteFile = catchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
    try {
        await unlink(`${dataLocation}/${req.params.filename}`);
        res.status(204).send();
    } catch (err: any) {
        err.statusCode = 404;
        throw err;
    }
});

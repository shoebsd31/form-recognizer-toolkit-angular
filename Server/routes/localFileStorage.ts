import express from "express";
const router = express.Router();

import { getFile, uploadFile, deleteFile, listFiles, setMetadata } from "../controllers/localFileStorageController";

router.route("/:filename/metadata").put(setMetadata);

router.route("/:filename").get(getFile);
router.route("/:filename").put(uploadFile);
router.route("/:filename").delete(deleteFile);
router.route("/").get(listFiles);

export default router;

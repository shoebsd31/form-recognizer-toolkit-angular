import { Injectable } from "@angular/core";
import { StorageProviderService } from "../providers/storage-provider.service";
import { constants } from "../consts/constants";

/**
 * Tracks the per-document "marked for training" flag.
 *
 * The flag lives in `<doc>.labels.json` (`metadata.fortraining`) and is mirrored
 * as storage metadata (`fortraining` = "true" | "false") on the document, its
 * `.labels.json` and its `.result.json` through `StorageProviderService.setMetadata`.
 * Only metadata is set on `.result.json`; its content is never rewritten.
 */
@Injectable({ providedIn: "root" })
export class TrainingFlagService {
    private flags = new Map<string, boolean>();

    constructor(private storageProvider: StorageProviderService) {}

    get(documentName: string): boolean | undefined {
        return this.flags.get(documentName);
    }

    /** Load the flag from a document's labels file (false when absent). */
    async load(documentName: string): Promise<boolean> {
        const raw = await this.storageProvider.readText(`${documentName}${constants.labelFileExtension}`, true);
        let value = false;
        try {
            value = raw ? JSON.parse(raw)?.metadata?.[constants.forTrainingKey] === true : false;
        } catch {
            value = false;
        }
        this.flags.set(documentName, value);
        return value;
    }

    /** Persist the flag: patch labels.json, then mirror it as metadata on all three files. */
    async set(documentName: string, value: boolean): Promise<void> {
        this.flags.set(documentName, value);
        const labelFile = `${documentName}${constants.labelFileExtension}`;
        const raw = await this.storageProvider.readText(labelFile, true);
        const file = raw
            ? JSON.parse(raw)
            : {
                  $schema: constants.cufLabelsSchema,
                  fileId: "",
                  fieldLabels: {},
                  metadata: { displayName: documentName, createdOn: Date.now().toString() },
              };
        file.metadata = { ...file.metadata, [constants.forTrainingKey]: value };
        await this.storageProvider.writeText(labelFile, JSON.stringify(file, null, 2));
        await this.applyMetadata(labelFile, documentName);
    }

    /** Mirror the current flag as metadata on the labels file, result file and document. */
    async applyMetadata(labelFile: string, documentName: string): Promise<void> {
        const value = this.flags.get(documentName);
        if (value === undefined) return;
        const metadata = { [constants.forTrainingKey]: String(value) };
        await Promise.all(
            [labelFile, `${documentName}${constants.resultFileExtension}`, documentName].map((f) =>
                this.storageProvider.setMetadata(f, metadata)
            )
        );
    }
}

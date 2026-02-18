import { Injectable } from "@angular/core";
import { Labels, Field, Definitions, Label } from "../../models/custom-models";
import { IDocument } from "../../store/documents/documents.types";
import { StorageProviderService } from "../../providers/storage-provider.service";
import { constants } from "../../consts/constants";
import { IAssetService } from "./asset-service.interface";

@Injectable({ providedIn: "root" })
export class CustomModelAssetService implements IAssetService {
    constructor(private storageProvider: StorageProviderService) {}

    async fetchAllDocumentLabels(labels: Labels, documents: IDocument[]): Promise<Labels> {
        const allLabels: Labels = { ...labels };
        const documentsWithoutLabels = documents.filter((doc) => !labels[doc.name]);

        await Promise.all(
            documentsWithoutLabels.map(async (doc) => {
                try {
                    const labelFile = `${doc.name}${constants.labelFileExtension}`;
                    const rawLabels = await this.storageProvider.readText(labelFile, true);
                    if (rawLabels) {
                        allLabels[doc.name] = JSON.parse(rawLabels).labels || [];
                    } else {
                        allLabels[doc.name] = [];
                    }
                } catch {
                    allLabels[doc.name] = [];
                }
            })
        );

        return allLabels;
    }

    async updateFields(fields: Field[], definitions: Definitions): Promise<void> {
        const content = JSON.stringify({ fields, definitions }, null, 2);
        await this.storageProvider.writeText(constants.fieldsFile, content);
    }

    async updateDocumentLabels(updatedLabels: { [documentName: string]: Label[] }): Promise<void> {
        await Promise.all(
            Object.entries(updatedLabels).map(async ([documentName, labels]) => {
                const labelFile = `${documentName}${constants.labelFileExtension}`;
                const content = JSON.stringify(
                    {
                        $schema: constants.labelsSchema,
                        document: documentName,
                        labels,
                    },
                    null,
                    2
                );
                await this.storageProvider.writeText(labelFile, content);
            })
        );
    }
}

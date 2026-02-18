import { Labels, Field, Definitions } from "../../models/custom-models";

export interface IAssetService {
    fetchAllDocumentLabels(
        labels: Labels,
        documents: any[],
    ): Promise<Labels>;

    updateFields(fields: Field[], definitions: Definitions): Promise<void>;

    updateDocumentLabels(updatedLabels: { [documentName: string]: any[] }): Promise<void>;
}

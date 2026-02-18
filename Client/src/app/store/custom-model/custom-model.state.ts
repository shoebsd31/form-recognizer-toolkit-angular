import { Labels, Field, Definitions, LabelValueCandidate } from "../../models/custom-models";

export interface ICustomModelError {
    name: string;
    message: string;
    messageArguments?: { [name: string]: string };
}

export enum FieldLocation {
    field,
    definition,
}

export interface CustomModelState {
    definitions: Definitions;
    fields: Field[];
    colorForFields: Record<string, string>[];
    labels: Labels;
    orders: { [documentName: string]: { [orderId: string]: number } };
    labelValueCandidates: LabelValueCandidate[];
    labelError: ICustomModelError | null;
    hideInlineLabelMenu: boolean;
}

export const initialCustomModelState: CustomModelState = {
    definitions: {},
    fields: [],
    colorForFields: [],
    labels: {},
    orders: {},
    labelValueCandidates: [],
    labelError: null,
    hideInlineLabelMenu: false,
};

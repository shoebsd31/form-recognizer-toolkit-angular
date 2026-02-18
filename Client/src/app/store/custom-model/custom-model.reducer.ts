import { createReducer, on } from "@ngrx/store";
import { initialCustomModelState } from "./custom-model.state";
import * as CustomModelActions from "./custom-model.actions";
import * as PredictionsActions from "../predictions/predictions.actions";
import { buildRegionOrders } from "../../utils/custom-model";

export const customModelReducer = createReducer(
    initialCustomModelState,
    // Sync reducers
    on(CustomModelActions.setHideInlineLabelMenu, (state, { hide }) => ({
        ...state,
        hideInlineLabelMenu: hide,
    })),
    on(CustomModelActions.setDefinitions, (state, { definitions }) => ({
        ...state,
        definitions,
    })),
    on(CustomModelActions.setFields, (state, { fields }) => ({
        ...state,
        fields,
    })),
    on(CustomModelActions.setColorForFields, (state, { colorForFields }) => ({
        ...state,
        colorForFields,
    })),
    on(CustomModelActions.setColorForFieldsByName, (state, { fieldName, newFieldName }) => {
        const getDynamicKey = (obj: Record<string, string>) => Object.keys(obj)[0];
        const colorForFieldsCopy = [...state.colorForFields];
        const originalFieldIndex = colorForFieldsCopy.findIndex(
            (colorMap) => getDynamicKey(colorMap) === fieldName
        );
        if (originalFieldIndex >= 0) {
            const originalFieldColor = colorForFieldsCopy[originalFieldIndex][fieldName];
            colorForFieldsCopy.splice(originalFieldIndex, 1, { [newFieldName]: originalFieldColor });
        }
        return { ...state, colorForFields: colorForFieldsCopy };
    }),
    on(CustomModelActions.setLabelsByName, (state, { name, labels }) => ({
        ...state,
        labels: { ...state.labels, [name]: labels },
    })),
    on(CustomModelActions.setLabelValueCandidates, (state, { candidates }) => ({
        ...state,
        labelValueCandidates: candidates,
    })),
    on(CustomModelActions.deleteLabelByName, (state, { name }) => {
        const labels = { ...state.labels };
        delete labels[name];
        return { ...state, labels };
    }),
    on(CustomModelActions.clearLabelError, (state) => ({
        ...state,
        labelError: null,
    })),
    // Async success reducers
    on(CustomModelActions.addFieldSuccess, (state, { field }) => ({
        ...state,
        fields: [...state.fields, field],
    })),
    on(CustomModelActions.updateFieldsOrderSuccess, (state, { fields }) => ({
        ...state,
        fields,
    })),
    on(CustomModelActions.switchSubTypeSuccess, (state, { index, field }) => {
        const fields = [...state.fields];
        fields[index] = field;
        return { ...state, fields };
    }),
    on(CustomModelActions.switchTableFieldsSubTypeSuccess, (state, { definitions }) => ({
        ...state,
        definitions,
    })),
    on(CustomModelActions.addTableFieldSuccess, CustomModelActions.insertTableFieldSuccess, (state, { fields, definitions }) => ({
        ...state,
        fields,
        definitions,
    })),
    on(
        CustomModelActions.assignLabelSuccess,
        CustomModelActions.updateLabelSuccess,
        CustomModelActions.deleteLabelByFieldSuccess,
        CustomModelActions.deleteLabelByLabelSuccess,
        CustomModelActions.updateTableLabelSuccess,
        (state, { labels }) => ({
            ...state,
            labels,
        })
    ),
    on(
        CustomModelActions.renameFieldSuccess,
        CustomModelActions.renameTableFieldSuccess,
        CustomModelActions.deleteFieldSuccess,
        CustomModelActions.deleteTableFieldSuccess,
        (state, { fields, labels, definitions }) => ({
            ...state,
            fields,
            labels,
            definitions,
        })
    ),
    on(CustomModelActions.customModelOperationFailure, (state, { error }) => ({
        ...state,
        labelError: error,
    })),
    // Cross-slice
    on(PredictionsActions.setDocumentPrediction, (state, { name, analyzeResponse }) => ({
        ...state,
        orders: {
            ...state.orders,
            [name]: buildRegionOrders(analyzeResponse.analyzeResult),
        },
    }))
);

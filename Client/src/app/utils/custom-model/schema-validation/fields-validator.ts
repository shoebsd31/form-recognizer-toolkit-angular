export const isLabelFieldWithCorrectFormat = (parsedFields: any): boolean => {
    if (!parsedFields) {
        return false;
    }
    if (!parsedFields.fields || !Array.isArray(parsedFields.fields)) {
        return false;
    }
    for (const field of parsedFields.fields) {
        if (!field.fieldKey || !field.fieldType) {
            return false;
        }
    }
    return true;
};

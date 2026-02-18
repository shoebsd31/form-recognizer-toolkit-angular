export enum FeatureCategory {
    Checkbox = "checkbox",
    DrawnRegion = "region",
    Label = "label",
    Text = "text",
}

export enum RegionType {
    Point = "POINT",
    Polygon = "POLYGON",
    Polyline = "POLYLINE",
    Rectangle = "RECTANGLE",
    Square = "SQUARE",
}

export interface IRegion {
    id: string;
    type: RegionType;
    category: FeatureCategory;
    tags: string[];
    points?: IPoint[];
    boundingBox?: IBoundingBox;
    value?: string;
    pageNumber: number;
    isTableRegion?: boolean;
    changed?: boolean;
}

export interface IBoundingBox {
    left: number;
    top: number;
    width: number;
    height: number;
}

export interface IPoint {
    x: number;
    y: number;
}

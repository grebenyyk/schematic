export interface StyleSheet {
  bondLengthPt: number;        // ACS: 14.4
  lineWidthPt: number;         // ACS: 0.6
  boldWidthPt: number;         // ACS: 2.0
  marginPt: number;            // ACS: 1.6 — clearance around atom labels
  hashSpacingPt: number;       // ACS: 2.5
  doubleBondSpacing: number;   // fraction of bond length; ACS: 0.18
  chainAngleDeg: number;       // ACS: 120
  labelFont: string;
  labelSizePt: number;         // ACS: 10
  labelColorMode: 'mono' | 'hetero-color';
  aromaticStyle: 'circle' | 'kekule' | 'dashed';
  wedgeTaper: 'sharp' | 'narrow';
  colors: { bond: string; selection: string; hover: string; background: string };
  atomColors?: Record<string, string>;
}

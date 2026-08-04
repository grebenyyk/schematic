import type { StyleSheet } from './stylesheet';

/** ACS Document 1996 — the default look. */
export const ACS1996: StyleSheet = {
  bondLengthPt: 14.4,
  lineWidthPt: 0.6,
  boldWidthPt: 2.0,
  marginPt: 1.6,
  hashSpacingPt: 2.5,
  doubleBondSpacing: 0.18,
  chainAngleDeg: 120,
  labelFont: 'Helvetica, Arial, sans-serif',
  labelSizePt: 10,
  labelColorMode: 'mono',
  aromaticStyle: 'kekule',
  wedgeTaper: 'sharp',
  colors: { bond: '#000', selection: '#3a7bd5', hover: '#9fc3ee', background: '#fff' },
};

/** Modern colored variant. */
export const FLAT: StyleSheet = {
  ...ACS1996,
  labelColorMode: 'hetero-color',
  aromaticStyle: 'circle',
  colors: { bond: '#222', selection: '#3a7bd5', hover: '#9fc3ee', background: '#fff' },
  atomColors: { O: '#e33e3e', N: '#2f6fd0', S: '#c8a017', Cl: '#2d9d52', F: '#2d9d52', Br: '#a14517', I: '#7b2fbf', P: '#e07b1f' },
};

/** Dark mode. */
export const DARK: StyleSheet = {
  ...FLAT,
  colors: { bond: '#e8e8e8', selection: '#6aa2e8', hover: '#4a6a8a', background: '#1a1a1a' },
};

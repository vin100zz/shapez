export type MachineType = 'extractor' | 'cutter' | 'rotator' | 'assembler' | 'splitter' | 'trash';
export type BuildingType = 'belt' | MachineType | 'hub';
export type ToolType = Exclude<BuildingType, 'hub'>;

export const TOOL_TYPES: readonly ToolType[] = ['belt', 'extractor', 'cutter', 'rotator', 'assembler', 'splitter', 'trash'];
export const isToolType = (v: unknown): v is ToolType => TOOL_TYPES.includes(v as ToolType);

/** Ports en côtés locaux : 0 = avant, 1 = droite, 2 = arrière, 3 = gauche. */
export const PORTS: Readonly<Record<BuildingType, { inputs: readonly number[]; outputs: readonly number[] }>> = {
  belt: { inputs: [1, 2, 3], outputs: [0] },
  extractor: { inputs: [], outputs: [0] },
  cutter: { inputs: [2], outputs: [1, 3] },
  rotator: { inputs: [2], outputs: [0] },
  assembler: { inputs: [1, 3], outputs: [0] },
  splitter: { inputs: [2], outputs: [0, 1, 3] },
  trash: { inputs: [0, 1, 2, 3], outputs: [] },
  hub: { inputs: [0, 1, 2, 3], outputs: [] },
};

/** Durée de traitement de base, en secondes. */
export const DURATION: Readonly<Record<MachineType, number>> = {
  extractor: 1.0,
  cutter: 0.5,
  rotator: 0.35,
  assembler: 0.7,
  splitter: 0,
  trash: 0,
};

/** Vitesse de base des convoyeurs, en cases par seconde. */
export const BELT_SPEED = 2.2;
/** Écart minimal entre deux pièces sur un convoyeur, en cases. */
export const ITEM_SPACING = 0.5;
/** Pas de simulation fixe. */
export const TICK_RATE = 60;
export const TICK_DT = 1 / TICK_RATE;

/** La rosace occupe 3 × 3 cases centrées sur l'origine. */
export const HUB_MIN = -1;
export const HUB_SIZE = 3;

export const TOOL_INFO: Readonly<Record<ToolType, { name: string; desc: string }>> = {
  belt: { name: 'Convoyeur', desc: 'Transporte les pièces. Cliquez-glissez pour tracer un chemin : il tourne tout seul. Entrées par l\'arrière et les côtés.' },
  extractor: { name: 'Extracteur', desc: 'À poser sur un gisement de sable coloré : produit une vitre pleine de cette couleur.' },
  cutter: { name: 'Découpeuse', desc: 'Coupe en diagonale : la moitié avant-droite sort à droite, l\'autre à gauche. Une sortie non raccordée est recyclée.' },
  rotator: { name: 'Pivot', desc: 'Tourne la pièce d\'un quart de tour dans le sens horaire.' },
  assembler: { name: 'Sertisseuse', desc: 'Assemble les pièces venues de gauche et de droite. Deux verres superposés mélangent leurs teintes.' },
  splitter: { name: 'Répartiteur', desc: 'Distribue les pièces en alternance vers l\'avant, la gauche et la droite.' },
  trash: { name: 'Recycleur', desc: 'Accepte et refond tout ce qu\'on lui donne, de tous les côtés.' },
};

/** Résultat d'une remise de pièce à une case voisine. */
export const OFFER_NONE = 0; // rien de raccordé de ce côté
export const OFFER_BLOCKED = 1; // raccordé mais plein
export const OFFER_OK = 2; // pièce acceptée
export type OfferResult = typeof OFFER_NONE | typeof OFFER_BLOCKED | typeof OFFER_OK;

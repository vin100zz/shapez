# Rosace : prototype vertical, notes techniques

Ce document décrit le socle du prototype vertical (phase 1 de la feuille de route) : ce qui est fait, comment c'est construit, ce qui a été mesuré et ce qui reste à faire.

## État d'avancement

| Élément de la phase 1 | État |
|---|---|
| Noyau de simulation pur (sans navigateur), testé | Fait : 22 tests Vitest |
| Convoyeurs regroupés en « chemins » | Fait |
| Carte infinie par blocs de 32×32 cases, gisements générés à partir d'une graine | Fait |
| Sauvegarde automatique, export et import, format versionné | Fait |
| Annuler / rétablir | Fait |
| Déblocages progressifs : 7 médaillons scénarisés, 12 générés, puis commandes libres | Fait |
| Rendu à trois niveaux de détail | Fait |
| Session de test avec 5 à 10 joueurs (critère de sortie de la phase) | **À organiser** |

## Organisation du code

```
src/core/      simulation pure, sans dépendance au navigateur
  geometry     directions, coordonnées, blocs
  piece        pièces de verre : découpe, pivot, superposition, mélange des teintes
  defs         bâtiments, ports, durées, vitesses
  deposits     gisements procéduraux, mis en cache par bloc
  world        stockage des bâtiments (index par case et par bloc)
  belts        système de convoyeurs en chemins
  machines     extracteur, découpeuse, pivot, sertisseuse, répartiteur, recycleur
  progress     commandes, médaillons, déblocages, améliorations
  history      annuler / rétablir
  save         sérialisation versionnée et validation
  game         partie : remise des pièces, pas de simulation, construction
  scenarios    usine de démonstration (tests et menu)
src/render/    rendu Canvas 2D : primitives, cache d'images, caméra, rendu
src/ui/        application, panneaux, entrées, son
tests/         tests Vitest
bench/         banc de performance (npm run bench)
```

Le noyau ne connaît ni le DOM ni le canvas. On pourra remplacer le rendu, par exemple par du WebGL, sans toucher à la simulation.

## Convoyeurs en chemins

- À chaque modification de la carte, les convoyeurs qui se suivent sont regroupés en **chemins**. Un convoyeur a au plus un amont : celui qui l'alimente par l'arrière, ou par un côté s'il fait un virage. Les composantes sont donc des chaînes simples ou des boucles.
- Un chemin stocke ses pièces de la plus avancée à la plus en retrait. Pour chacune, il ne garde que **l'écart** avec la précédente, jamais de position absolue.
- **Avancer**, c'est réduire le premier écart compressible : toutes les pièces derrière avancent d'un coup. Un chemin fluide coûte une seule soustraction par tic, quel que soit son nombre de pièces. Un indice mémorise la première pièce encore mobile, pour qu'un chemin bloqué ne soit pas reparcouru à chaque tic.
- Une **arrivée par le côté** (convoyeur ou machine) insère la pièce au milieu du chemin, s'il y a la place (écart minimal de 0,5 case).
- Lors d'un regroupement, les pièces sont d'abord rangées par convoyeur, puis replacées dans les nouveaux chemins. Prolonger, couper ou réorienter une ligne conserve donc les pièces, sauf celles du convoyeur supprimé.

## Déterminisme

La simulation avance par pas fixes de 1/60 s. Les bâtiments sont parcourus dans un ordre stable, et toute génération aléatoire part d'une graine. Un test vérifie que *sauvegarder, recharger et continuer* donne exactement le même état qu'une partie jouée sans interruption.

## Sauvegarde

- **Format :** JSON avec `format: "rosace"` et `v: 1`. Il contient la graine, le nombre de tics, la progression (médaillon, compteur, outils débloqués, améliorations, bac à sable), les bâtiments, avec le contenu des machines et les pièces posées sur chaque convoyeur, et la position de la caméra.
- **Versions :** une fonction `migrate` est prévue pour convertir les anciennes versions.
- **Validation :** toute entrée est validée. Une sauvegarde invalide est refusée avec un message en français, et n'est jamais chargée à moitié.
- **Dans le navigateur :** sauvegarde automatique toutes les 30 s et à la fermeture de l'onglet (`localStorage`, clé `rosace.partie.v1`). Le menu permet d'exporter ou d'importer un fichier, ou de copier et coller un code.

## Rendu

- **Cache d'images :** pièces, machines et convoyeurs sont pré-dessinés, à une échelle arrondie au quart d'octave, puis posés d'un seul `drawImage`.
- **Trois niveaux de détail, selon la taille d'une case à l'écran :**
  - au moins 22 px : rendu complet et animé ;
  - de 14 à 22 px : chaque bloc de 32×32 cases est une seule image, refaite seulement quand le bloc change, et les pièces deviennent des carrés de couleur dessinés en un lot ;
  - moins de 14 px : rectangles simples.
- **Gisements :** rendus une fois par bloc, en basse résolution floutée. Les cristaux ne sont dessinés que de près.

## Mesures

Simulation (`npm run bench`, Node 22) :

| Usine de test | Mesure |
|---|---|
| 25 250 bâtiments, 50 000 pièces en mouvement | **0,07 ms par tic** (budget d'une image à 60 i/s : 16 ms) |
| Regroupement des chemins après une modification | 35 ms |

Rendu, sur une usine synthétique très dense : 10 100 bâtiments, toutes les cases visibles sont des convoyeurs chargés. Mesuré dans Chromium sans carte graphique (rendu logiciel), en 1440×900. Sur une machine équipée d'une carte graphique, les chiffres devraient être meilleurs, mais ce n'est pas encore vérifié.

| Zoom | Niveau | Temps d'une image |
|---|---|---|
| 1 | complet | 5 ms |
| 0,75 | complet | 37 ms |
| 0,56 | complet | 48 ms |
| 0,5 | intermédiaire | 2,2 ms |
| 0,36 (toute l'usine) | intermédiaire | 3,2 ms |
| 0,3 | simplifié | 1,8 ms |

## Limites connues et suites

1. **Regroupement global des chemins.** Il prend 35 ms pour 25 000 convoyeurs, donc un léger à-coup à chaque modification d'une très grande usine. La suite : ne regrouper que les chemins touchés par la modification.
2. **Rendu complet d'une usine très dense entre les zooms 0,55 et 0,8.** On tombe à 20 à 30 i/s en rendu logiciel. À mesurer sur de vraies machines. Si c'est confirmé, passer le niveau complet en WebGL (PixiJS), ce que l'architecture permet sans toucher au noyau.
3. **Annuler ne restaure que les bâtiments**, pas les pièces qu'ils contenaient.
4. **Réorienter une machine la vide.** Réorienter un convoyeur conserve en revanche ses pièces.
5. **Prévu pour l'Alpha :** ponts, plans réutilisables (copier-coller), sélection rectangulaire, options (touches, motifs pour daltoniens), musique, tutoriel guidé.
6. **Test joueurs.** Le critère de sortie de la phase demande une version en ligne : publier `dist/` sur GitHub Pages ou itch.io.
7. **Installation npm.** Le fichier `.npmrc` active `legacy-peer-deps`, pour contourner un bogue de npm 10.9 lors de la résolution des dépendances (`Cannot read properties of null (reading 'edgesOut')`).

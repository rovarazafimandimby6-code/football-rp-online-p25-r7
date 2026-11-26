# P27 — Référentiel statistique DLS 26

## Décision de conception

Les joueurs fictifs générés par P27 utilisent désormais une fiche de référence issue d'une carte **normale** DLS 26 v13.430. Le générateur sélectionne un profil selon le rôle et l'archétype, puis adapte ses statistiques au niveau de la division P27.

## Données conservées

- Note de base de la carte DLS 26, conservée dans `dls26Reference.baseOverall`.
- Huit attributs de terrain : SPE, ACC, STA, STR, CON, PAS, SHO et TAC.
- Pour les gardiens, GKR et GKH remplacent les attributs de terrain correspondants.
- Taille de référence, avec une variation limitée de ±2 cm.
- Pied préféré uniquement lorsqu'il est disponible dans la source.
- Type de carte, version et URL de provenance.

## Adaptation P27

- La note finale reste déterminée par les limites de niveau de la division P27.
- Les attributs DLS sont transposés à cette note en conservant leur forme relative, avec un ajustement individuel de ±2 points.
- Les six attributs historiques du gameplay sont alimentés par la carte : vitesse moyenne SPE/ACC, tir, passe, défense/tacle, endurance et contrôle.
- Les statistiques DLS complètes restent disponibles dans `dls26Stats`; la provenance est stockée dans `dls26Reference`.

## Identité fictive

Les noms, nationalités, clubs, numéros, contrats, historique et apparence restent générés par P27. Aucune identité réelle, photo, tenue, emblème ou donnée de club réel n'est copiée. La carte DLS sert de modèle statistique, pas de personnage à reproduire.

## Portée actuelle

Le premier catalogue embarqué contient 24 profils normaux couvrant gardiens, défenseurs, milieux et attaquants. Il s'agit d'un premier lot de profils représentatifs, pas encore d'un import exhaustif des milliers de cartes DLS 26. Le catalogue pourra être enrichi par lots à partir de fiches vérifiées, sans changer le format de données.

## Sources de référence

- https://sakibpro.com/players/ — base indépendante DLS 26, version 13.430.
- https://sakibpro.com/players/team/arsenal/squad/
- https://sakibpro.com/players/team/paris-saint-germain/squad/
- https://sakibpro.com/players/team/morocco/squad
- https://sakibpro.com/players/team/africa-all-stars/squad/
- https://sakibpro.com/players/normal/bruno-fernandes/12434/statistics/
- https://sakibpro.com/players/normal/gianluigi-donnarumma/14078/

Cette base est indépendante et n'est pas une source officielle First Touch Games.

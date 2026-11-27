# P27 — Référentiel de profils statistiques DLS

## Décision de conception

Les joueurs fictifs générés par P27 prennent en priorité des cartes **normales DLS 26 vérifiées individuellement**, version v13.430 (16 septembre 2026). Quand la bibliothèque DLS 26 ne suffit pas à varier les profils, le générateur peut utiliser des cartes d'éditions antérieures, actuellement DLS 23 v10.20. DLS 19 est ajouté comme format de référence historique à importer lorsque des fiches archivées fiables sont disponibles. Le choix reste guidé par le rôle et l'archétype, puis les caractéristiques sont adaptées au niveau de la division P27. DLS 26 reste prioritaire ; les anciennes éditions interviennent comme complément de diversité.

## Catalogue embarqué

La bibliothèque embarquée contient actuellement **36 profils statistiques anonymisés** : 21 cartes DLS 26 vérifiées individuellement et 15 profils DLS 23 issus d'une base communautaire.
- DLS 26 : 7 profils d'attaquants, 5 profils de milieux, 6 profils de défenseurs et 3 profils de gardiens
- DLS 23 : 5 profils d'attaquants, 5 profils de milieux et 5 profils de défenseurs
- Total : 12 profils d'attaquants, 10 profils de milieux, 11 profils de défenseurs et 3 profils de gardiens

Les 21 profils DLS 26 conservent une URL de fiche individuelle et le statut `individual-player-card`. Les 15 profils DLS 23 conservent la version `10.20`, l'identifiant de ligne source et le statut `community-dataset-record` ; ils ne sont pas présentés comme des cartes vérifiées individuellement. Les statistiques de terrain sont les valeurs entières enregistrées dans la source. Pour les gardiens, GKR et GKH remplacent SHO et TAC dans le jeu de référence.

## Compatibilité DLS 19

Le format de carte DLS 19 possède dix attributs de terrain : les huit statistiques communes, plus CRO (centres) et HEA (jeu de tête). Le badge de poste WF est normalisé en SS pour le moteur de rôle P27, tandis que la source d'origine reste tracée. Un adaptateur strict a été ajouté dans `src/p27-dls19-reference.js` : il refuse les données manquantes, les notes/tailles invalides, les postes inconnus et les références sans URL, version ou identifiant source. Une fois un profil DLS 19 validé ajouté à `DLS19_REFERENCE_PROFILES`, il rejoint automatiquement le catalogue multi-éditions et le sélecteur le classe selon son poste (GK, DEF, MID ou FWD), sans modification manuelle de la liste DLS 26.

**Aucun profil DLS 19 n'est encore intégré au pool actif.** La recherche a confirmé l'existence du format DLS 19, mais la base accessible via le créateur de cartes indique que ses données joueurs proviennent du dernier jeu de données DLS 23 ; ce n'est donc pas une archive exacte des notes DLS 19. Nous ne convertirons pas ces données en « DLS 19 » ni n'inventerons CRO/HEA. Le catalogue DLS 19 sera alimenté lorsque des fiches historiques/versionnées seront vérifiables.

## Données conservées

- Note générale de la carte source, conservée dans `playerReference.baseOverall` (alias historique `dls26Reference`).
- SPE, ACC, STA, STR, CON, PAS, SHO et TAC (ou GKR/GKH pour les gardiens).
- Taille de référence, avec une variation P27 limitée à ±2 cm.
- Pied préféré lorsqu'il est publié sur la fiche source.
- Type de carte, version, URL et statut de vérification.

## Adaptation P27

- La note finale reste déterminée par les limites de niveau de la division P27.
- L'écart de note est appliqué à 72 % sur les statistiques, puis chaque caractéristique reçoit un ajustement individuel de ±2 points. Cela conserve la signature du profil sans transformer brutalement toutes ses qualités.
- Les six attributs historiques du gameplay sont alimentés par les statistiques de la fiche : vitesse moyenne SPE/ACC, tir, passe, défense/tacle, endurance et contrôle.
- Pour une future carte DLS 19, CRO et HEA sont conservés en plus dans les attributs du joueur (`crossing`, `heading`) ; ils ne sont pas écrasés ni confondus avec PAS/TAC. La bibliothèque reste vide tant que des archives authentiques ne sont pas confirmées.
- Les statistiques de référence complètes restent disponibles dans `playerReferenceStats`; la provenance multi-éditions est stockée dans `playerReference`. Le générateur évite aussi de réutiliser deux fois la même carte dans un même effectif lorsqu'il dispose d'assez de profils pour le poste.

## Identité fictive et personnalisation

La référence DLS ne devient jamais le personnage P27. Les noms, nationalités, clubs, numéros, contrats, historique, âge et apparences restent générés séparément par P27. Le code n'embarque aucun nom de joueur réel dans les profils DLS 23 ; il conserve seulement un identifiant source technique, la version, les attributs, la taille et le pied préféré. La référence sert à transmettre une signature footballistique (vitesse, puissance, finition, créativité, défense, etc.), pas à reproduire une personne réelle.

Chaque joueur fictif reçoit donc une identité propre et une personnalisation indépendante : nom adapté à sa nationalité, poste et archétype, taille légèrement ajustée, pied préféré, morphologie, teint, coupe et couleur de cheveux, forme du visage, numéro, potentiel, loyauté et contrats. La provenance interne (`playerReference`) permet de retrouver le profil statistique d'inspiration sans afficher le joueur réel dans le jeu. Les anciens champs `dls26Stats` et `dls26Reference` sont conservés comme alias de compatibilité.

## Limites et suite

Les 36 profils actifs sont un catalogue de modèles diversifiés, pas un import exhaustif des bases DLS. L'adaptateur DLS 19 est préparé mais son pool reste vide tant que des cartes archivées authentiques ne sont pas vérifiées. La source DLS 23 est une base communautaire non officielle ; ses valeurs sont identifiées comme telles et ne remplacent jamais une fiche DLS 26 vérifiée. Les profils de gardiens restent actuellement issus de DLS 26, car la source DLS 23 consultée ne fournit pas toutes les valeurs nécessaires de manière cohérente. La suite consiste à élargir les profils par poste et archétype, puis à vérifier individuellement les nouvelles références DLS 26 ou à documenter clairement leur édition d'origine. Les profils provisoires précédemment utilisés avec des sources génériques d'équipes ont été retirés.

## Sources de référence

- https://sakibpro.com/players/normal/kylian-mbappe/14756/statistics/
- https://sakibpro.com/players/normal/erling-haaland/17196/changelog/
- https://sakibpro.com/players/normal/vinicius-junior/16320/statistics/
- https://sakibpro.com/players/normal/lautaro-martinez/16329/statistics/
- https://sakibpro.com/players/normal/dusan-vlahovic/17816/changelog/
- https://sakibpro.com/players/normal/pedro-gonzalez-lopez/17763/changelog/
- https://sakibpro.com/players/normal/henrikh-mkhitaryan/10806/changelog/
- https://sakibpro.com/players/normal/rodri/16327/statistics/
- https://sakibpro.com/players/normal/achraf-hakimi/15932/statistics/
- https://sakibpro.com/players/normal/federico-dimarco/18130/statistics/
- https://sakibpro.com/players/normal/virgil-van-dijk/7307/statistics/
- https://sakibpro.com/players/normal/nikola-milenkovic/15551/changelog/
- https://sakibpro.com/players/normal/sergino-dest/17190/changelog/
- https://sakibpro.com/players/normal/gianluigi-donnarumma/14078/

- https://sakibpro.com/players/normal/mohamed-salah/12027/statistics/
- https://sakibpro.com/players/normal/harry-kane/10159/statistics/
- https://sakibpro.com/players/normal/jude-bellingham/17799/
- https://sakibpro.com/players/normal/kevin-de-bruyne/7957/changelog/
- https://sakibpro.com/players/normal/william-saliba/17387/statistics/
- https://sakibpro.com/players/normal/alisson/14939/changelog/
- https://sakibpro.com/players/normal/thibaut-courtois/7458/statistics/

SakibPro est une base indépendante et non une source officielle First Touch Games. Les pages de statistiques détaillées permettent de vérifier les données DLS 26 utilisées. Le jeu de données DLS 23 est également communautaire et non officiel ; il est publié dans le dépôt CodeModeYT/DLS-Player-search et sa version de données est `v10.20`.

- https://github.com/CodeModeYT/DLS-Player-search/blob/main/Data/json/players_23.json

- DLS 19 card structure and stats: https://sakibpro.com/dls-card-creator/dls19/
- Historical player data source caveat: https://sakibpro.com/dls-card-creator/dls19/
- Community DLS 23 dataset: https://github.com/CodeModeYT/DLS-Player-search/blob/main/Data/json/players_23.json
- DLS-Files community player records: https://github.com/theshinramen/DLS-Files/blob/main/data/playerData.json

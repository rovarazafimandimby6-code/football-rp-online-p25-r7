# Audit fonctionnel DLS 2026 → adaptation Football RP Online P27

Date : 26 novembre 2026  
Branche : `p27-dls26-global-adaptation`  
Référence : Dream League Soccer 2026 (First Touch Games)

## 1. Méthode et limites

Audit fondé sur la fiche officielle DLS 2026 (Google Play et App Store), les communications officielles First Touch Games et des captures publiques des menus et écrans de jeu. Il décrit les systèmes documentés et les parcours visibles ; il ne prétend pas accéder au code source privé de DLS ni vérifier des mécanismes internes non publiés.

Sources :
- Google Play : https://play.google.com/store/apps/details?id=com.firsttouchgames.dls7
- App Store : https://apps.apple.com/us/app/dream-league-soccer-2026/id1462911602
- Annonce officielle Summer Spotlight : https://www.youtube.com/watch?v=wArDvVrEEmc
- Capture publique du hub carrière : https://i0.wp.com/gamingonphone.com/wp-content/uploads/2026/01/Career-Mode-home-in-Dream-League-Soccer-2026.jpeg
- Capture publique du hub principal : https://cdn-icon.bluestacks.com/zch8Ej8I06RJvHv9WBz8JeZYppkfxY-6ilBvYMlgG542kjqWzYfYb5IoDMFbkyDPFKIDveDZP6cp-CdJS__znCU%3Ds0

## 2. Audit fonctionnel de DLS 26

### A. Hub et navigation
- Le hub fonctionne comme un centre de commande de jeu composé de panneaux fonctionnels de tailles et de priorités différentes.
- La carrière et le prochain match bénéficient d'une place dominante.
- L'équipe, le marché, le club, les événements et les modes en ligne restent accessibles sans transformer l'accueil en liste de liens.
- Les panneaux affichent un état utile et conduisent à des sous-écrans dédiés.
- Le système de navigation est intégré à l'expérience du jeu ; il ne repose pas sur une barre de site persistante.

### B. Carrière et compétitions
- Progression annoncée sur huit divisions.
- Plus de dix compétitions de coupe annoncées.
- Suivi de saison, matchs à jouer, étapes de coupe et progression sportive.
- Le hub met en avant les prochaines rencontres et les compétitions actives.
- Les classements et les résultats donnent un contexte aux prochains matchs.

### C. Construction et gestion de l'équipe
- Recrutement de joueurs sous licence FIFPRO et de joueurs classiques.
- Cartes joueurs présentant portrait, poste, note globale et attributs.
- Constitution et amélioration de l'équipe.
- Développement technique et physique par l'intermédiaire de coaches.
- Personnalisation de l'équipe et du manager.

### D. Marché des transferts
- Marché de joueurs avec propositions et renouvellement des joueurs disponibles.
- Agents et recruteurs pour identifier des profils.
- Recrutement connecté à l'économie du jeu et à la construction de l'équipe.
- Le marché est un espace d'action et de décision, pas seulement une bibliothèque.

### E. Club et infrastructures
- Le club comprend un stade et des infrastructures évolutives.
- Installations annoncées : médical, commercial et entraînement ; les mises à jour récentes ajoutent la Fanzone.
- Les infrastructures participent à la progression du club.
- Les maillots et le logo peuvent être personnalisés.

### F. Multijoueur, événements et défis
- Dream League Live : matchs contre d'autres joueurs, progression compétitive et classements mondiaux.
- Événements saisonniers et récompenses.
- Défis quotidiens, scénarios et Dream Draft.
- Clans : objectifs collectifs et récompenses.
- Des événements spéciaux introduisent des contenus temporaires.

### G. Match et présentation sportive
- Matchs 3D avec commandes tactiles.
- Animations de mouvements, frappes, tacles, célébrations et arrêts.
- IA améliorée et commentaires de match annoncés.
- Interface de match dédiée, distincte du hub.

### H. Économie et progression
- Monnaies et récompenses de progression.
- Récompenses de match, objectifs, événements et saisons.
- Contenus saisonniers et pass de saison visibles dans les captures publiques.
- DLS annonce aussi des achats intégrés et des éléments aléatoires ; ce modèle commercial n'est pas à reproduire automatiquement dans P27.

## 3. État réel de P27 relevé dans le dépôt

| Domaine | État P27 constaté | Adaptation retenue |
|---|---|---|
| Hub | Hub paysage 3 × 3 intégré ; carrière et match amical prioritaires | Carrière sur deux colonnes, six accès secondaires, navigation interne dédiée |
| En-tête | Barre compacte intégrée ; titre de page et raccourci profil masqués | Paramètres, progression/niveau et pièces ; hauteur cible 25 px en paysage compact |
| Carrière joueur | Profil local, niveau, XP, crédits et points d'entraînement | Utiliser les données réelles pour la progression |
| Clubs | Catalogue, notes, stades, réputation et effectifs | Conserver les fiches et renforcer l'espace club |
| Monde compétitif | Périmètre serveur audité : cinq divisions, neuf groupes, 156 clubs, calendriers, classements, coupes et résultats | Placer la saison et ses rendez-vous au centre du hub |
| Joueurs | Bibliothèque, profils, notes, attributs, potentiel et effectifs | Harmoniser les cartes et parcours de consultation |
| Mercato | Contrats du joueur, fenêtres, offres, salaires et historique ; raccourcis vers les bibliothèques | Distinguer contrats du joueur et futurs transferts de joueurs entre clubs |
| Développement | Entraînement par crédits/points, attributs et XP | Centre de progression lisible |
| Personnalisation | Identité, apparence, pied préféré, couleurs et écussons de clubs | Regrouper les réglages existants sans inventer d'éditeur |
| Match local | Moteur 3D, match 5 contre 5, commandes, IA, caméra et HUD | Préserver le moteur et harmoniser avant/après-match |
| Multijoueur | Salons en ligne, Club RP, défis inter-clubs, discussion privée, saisons et classements communautaires | Garder les fonctions collectives séparées du club de championnat ; synchroniser les discussions et protéger les accès |
| Résultats | Statistiques locales et archives serveur selon le mode | Afficher uniquement les résultats enregistrés |
| Installations | Stade et données de club existent ; améliorations d'infrastructures non confirmées | Ne pas afficher de niveaux d'infrastructure factices |
| Agents/recruteurs | Système DLS équivalent non confirmé dans le marché actuel | À concevoir, pas à simuler |
| Événements/Défis/Draft/Clans/Fanzone | Système P27 complet non confirmé | À planifier après le socle carrière, sans boutons vides |

## 4. Architecture fonctionnelle cible

1. **Hub principal** : carrière dominante, match amical, joueurs, compétitions, mercato, club et résultats. Pas de huit tuiles identiques.
2. **Carrière** : progression, niveau, XP, club, contrat, historique et action de reprise.
3. **Équipe / joueurs** : bibliothèque compacte, fiches, notes globales, attributs, postes et effectifs. La gestion tactique/formation doit être un vrai système si elle est ajoutée.
4. **Mercato** : offres, contrats, fenêtres et accès aux bibliothèques. Les contrats du footballeur humain restent distincts des transferts de joueurs entre clubs.
5. **Mon club** : identité, écusson, stade, effectif, réputation et données de saison ; distinguer le club de championnat du Club RP communautaire.
6. **Compétitions** : divisions, groupes, calendriers, coupes, classements et résultats reliés dans des vues internes.
7. **Progression** : entraînement, attributs, points, XP et récompenses sans double comptabilisation.
8. **Multijoueur** : salons et matchs en ligne réellement pris en charge ; Club RP avec recrutement, gouvernance, discussion privée, défis et saisons ; événements seulement avec données serveur.
9. **Match** : continuité visuelle avec les menus, sans altérer commandes, caméra, HUD ou moteur.
10. **Paramètres** : options de jeu et caméra accessibles depuis l'en-tête compact.

## 5. Principes UI à appliquer partout

- Paysage prioritaire ; aucune navigation web persistante.
- En-tête très compact : paramètres, barre XP fine, niveau et pièces ; aucun raccourci profil dans la barre.
- Arrière-plans profonds, éclairage, textures et motifs inspirés de DLS, avec identité P27.
- Panneaux de tailles hiérarchisées, compositions asymétriques et visuels sportifs.
- Cartes joueurs horizontales, compactes, note globale et informations essentielles.
- Une action principale claire par écran ; détails dans l'espace fonctionnel concerné.
- Aucun scroll global sur les écrans de jeu ; scroll interne seulement pour bibliothèques et tableaux.
- Aucun faux compteur, résultat, événement, joueur transférable ou bouton.
- Profil, club, compétitions et résultats doivent lire les mêmes données de référence.

## 6. Lots d'intégration

- **Lot A — Hub et shell** : nouvel accueil, en-tête compact, suppression des raccourcis redondants.
- **Lot B — Carrière et saison** : relier prochain match, compétition active, calendrier, résultats et progression.
- **Lot C — Équipe et mercato** : harmoniser cartes, fiches, effectifs, contrats et offres ; concevoir les fonctions manquantes.
- **Lot D — Club** : fiche club et infrastructures seulement si coûts et effets sont implémentés.
- **Lot E — Événements et online** : objectifs, événements, classements et fonctions collectives selon les capacités serveur.
- **Lot F — Validation** : tests, build Android, contrôle visuel et tactile sur l'appareil cible.

## 7. Garde-fous

- Ne pas fusionner cette branche dans `main` ou P25 R7.
- Ne pas fusionner les PR précédentes sans validation.
- Ne pas modifier le moteur de match pour une refonte des menus.
- Ne pas prétendre que P27 possède déjà les fonctions DLS absentes.
- Reprendre les principes d'expérience, pas les marques, cartes licenciées, visuels protégés ou code de DLS.


## 8. Clarification de direction : adaptation, pas redémarrage

P27 conserve ses fondations, ses systèmes déjà développés et ses choix validés. La référence DLS sert à compléter, réorganiser et améliorer l'existant ; elle ne justifie ni une réécriture totale ni la suppression du travail RP27. Chaque intégration commence par repérer les données, écrans, services et comportements déjà présents, puis les réutilise ou les étend.

L'objectif de conception est de reprendre environ 45 % des grands principes/systèmes fonctionnels de DLS, adaptés au rôle-play. Ce chiffre est une cible de couverture fonctionnelle, pas une promesse de réutilisation de code, de ressources ou d'actifs propriétaires.

### A. Compte, identité et sauvegarde

DLS est également une référence pour le cycle de compte et la continuité de progression. P27 doit donc traiter ces éléments comme un socle transversal :
- Compte utilisateur : création/connexion, identité persistante et récupération d'accès selon les mécanismes déjà présents dans P27.
- Profil RP : identité du joueur humain, distincte du footballeur fictif qu'il incarne.
- Sauvegarde persistante : carrière, personnalisation, contrats, club RP, progression, inventaire/équipement, historique et statistiques.
- Synchronisation : serveur comme source de vérité pour les données en ligne ; cache local contrôlé pour la continuité et les écrans hors ligne.
- Résolution des conflits : horodatage/version des données, validation des écritures et prévention des doubles récompenses ou pertes de progression.
- Reprise : après reconnexion ou réinstallation, retrouver la progression liée au compte plutôt que créer un nouvel état.
- Migration : faire évoluer les formats de sauvegarde sans effacer les données des versions P27 précédentes.

Ne pas remplacer le système de compte/sauvegarde déjà fonctionnel avant d'avoir audité son architecture et ses données. L'adaptation doit renforcer la persistance existante et préserver la compatibilité.

### B. Personnalisation du footballeur — référence DLS 19

La personnalisation DLS 19 sert de référence fonctionnelle pour donner au joueur RP une apparence qui lui appartient. P27 doit réutiliser son éditeur existant et l'étendre par étapes :
- Apparence générale et morphologie dans les limites du moteur 3D existant.
- Visage, coiffure et pilosité si les modèles/ressources le permettent.
- Taille, corpulence et proportions si le rig et les animations peuvent les supporter sans casser le gameplay.
- Équipement : maillot, short, chaussettes, chaussures, accessoires autorisés.
- Identité sportive : nom affiché, numéro, poste, pied préféré et nationalité fictive/choisie selon les règles RP.
- Aperçu 3D immédiat, rotation/inspection et validation avant sauvegarde.
- Séparation entre attributs sportifs (qui influencent le jeu) et apparence (cosmétique), pour éviter les avantages cachés.

L'éditeur doit rester compatible avec le modèle 3D, le rig, les animations, les performances Android et les commandes actuelles. Aucun écran de personnalisation ne doit promettre une option que les assets ou le moteur ne savent pas afficher.

### C. Deux identités à ne jamais confondre

1. **Compte / utilisateur** : la personne qui se connecte et sauvegarde sa progression.
2. **Footballeur RP** : personnage fictif créé ou contrôlé par cet utilisateur, avec carrière, poste, attributs, contrat et apparence.
3. **Club RP** : groupement social de plusieurs utilisateurs/footballeurs, inspiré du Clan DLS. Il possède fondateur/président, rôles, adhésions, invitations, recrutement, activité, objectifs collectifs, matchs et classement lorsque les services correspondants existent.
4. **Club de football / équipe de compétition** : entité sportive fictive déjà présente dans les divisions, groupes, calendriers et compétitions P27. Elle possède un effectif sportif, un staff et des résultats.
5. **Relation entre les deux** : un Club RP peut rassembler des utilisateurs dont les footballeurs évoluent dans différentes équipes de compétition. Une adhésion à un Club RP ne doit donc pas automatiquement transférer le footballeur dans une équipe sportive.

Dans l'interface, employer « Club RP » pour le groupe de joueurs et « Équipe » ou « club de championnat » pour l'entité sportive. Dans les données, séparer clairement les identifiants et relations (par exemple `rpClubId` et `footballClubId`) afin d'éviter les collisions.

### D. Bibliothèque et cartes des joueurs fictifs

- Les joueurs professionnels licenciés de DLS deviennent des footballeurs entièrement fictifs, avec noms, portraits, nationalités, attributs, potentiel et historique propres à P27.
- La bibliothèque est un catalogue navigable, filtrable et consultable ; le mercato est un parcours d'offre, de négociation, de contrat et de transfert. Ces deux fonctions restent liées mais distinctes.
- La carte horizontale compacte affiche portrait, nom, note globale, poste, club/équipe et championnat ; les attributs détaillés et l'historique apparaissent dans la fiche.
- Les effectifs, cartes, contrats, statistiques et classements doivent référencer la même fiche joueur afin d'éviter les doublons.
- Le système de note globale doit être calculé à partir des attributs et du poste selon une règle stable et testée, jamais saisie arbitrairement dans plusieurs écrans.

### E. Club RP inspiré des Clans DLS

Le Club RP est une communauté structurée, pas un simple nom d'équipe :
- création, nom, emblème, couleurs, description et règles ;
- fondateur, président, responsables, membres et permissions ;
- demandes d'adhésion, invitations, départ, exclusion et transfert de responsabilité ;
- liste des membres reliée aux comptes et à leurs footballeurs RP ;
- objectifs collectifs, activité, défis, rencontres inter-clubs et classement ;
- récompenses communes uniquement si elles sont persistées et calculées côté serveur ;
- journal d'activité et garde-fous contre les abus, doublons et modifications non autorisées.

### F. Ordre d'adaptation

1. Auditer et protéger compte, sauvegarde, profil et personnalisation déjà présents.
2. Relier le hub aux données réelles de carrière, joueur, équipe, compétitions et compte.
3. Stabiliser bibliothèque, cartes, fiches et modèle de footballeur fictif.
4. Distinguer définitivement Club RP et équipe/club de championnat.
5. Construire les fonctions de Club RP au-dessus des comptes et profils existants.
6. Étendre la personnalisation 3D sans modifier le moteur de match.
7. Ajouter progressivement événements, infrastructures et fonctions en ligne, uniquement quand le backend les prend réellement en charge.

Chaque lot doit être livré avec tests de non-régression, compatibilité des sauvegardes et vérification de la build Android. Le travail existant P27 reste la base de départ.


## 9. Inventaire confirmé des fondations P27 à préserver

L'inspection des modules et tests existants confirme les éléments suivants sur la branche de travail :

- **Compte local** : P27 peut démarrer sans Google ni inscription obligatoire. Le profil local est créé sur l'appareil.
- **Compte cloud facultatif** : association Google et identité P27 séparée du nom affiché ; les règles de propriété et de transfert de compte sont documentées dans `docs/P27-GOOGLE-ACCOUNT-OWNERSHIP.md`.
- **Synchronisation** : client de compte, synchronisation de carrière, file d'attente/outbox et coordination du profil sont déjà présents. Conserver le serveur comme source de vérité des données synchronisées.
- **Sauvegardes** : les stores comptes, identités, profils, progression, carrières, transferts et effectifs de clubs sont inclus dans le système de sauvegarde vérifiée. Ne pas remplacer ce circuit par une sauvegarde locale naïve.
- **Profil footballeur** : identité, numéro, pied préféré, poste, tenue, teint, coiffure, couleur des cheveux, morphologie, progression et attributs sont déjà modélisés.
- **Studio visuel** : l'écran joueur contient déjà un aperçu 3D manipulable et des choix d'apparence ; le modèle 3D prend en charge plusieurs coiffures et morphologies. L'adaptation DLS 19 doit étendre cette base, pas créer un second éditeur parallèle.
- **Bibliothèque** : `src/p27-player-library.js` construit déjà un répertoire depuis les effectifs des clubs et les joueurs libérés, avec filtres et états actif/libre/prêté.
- **Clubs sportifs** : le catalogue serveur des 156 clubs fictifs et les compétitions P27 sont déjà établis. Ils restent des entités sportives et ne deviennent pas les Clubs RP communautaires.

Conséquence : les prochains changements doivent prioritairement porter sur la cohérence des parcours, la présentation, les relations entre données et les fonctionnalités manquantes. Toute extension de schéma doit inclure validation, migration rétrocompatible, sauvegarde et tests.


## 10. Première brique fonctionnelle du Club RP — intégrée

Le Club RP est désormais séparé du catalogue des 156 clubs de football et des effectifs de championnat. Une première brique serveur dédiée existe dans `server/rp-club-store.js`, avec persistance JSON atomique dans `data/rp-clubs/rp-clubs.json` (chemin configurable par `RP_CLUBS_DIR`).

### Parcours déjà codé
- Création d'un Club RP par un compte authentifié associé à une identité joueur P27 réservée (`FRP-xxxxxx`).
- Fondateur enregistré comme premier membre avec rôle `founder`.
- Nom, tag et description contrôlés ; unicité du nom normalisé et du tag.
- Annuaire public paginé, recherche par nom/tag et fiche publique.
- Demande d'adhésion, détection des demandes en doublon et limite initiale de 30 membres.
- Acceptation/refus des demandes par fondateur, président ou recruteur.
- Départ volontaire des membres ; protection du fondateur tant que la présidence n'a pas été transférée.
- Un compte ne peut appartenir qu'à un seul Club RP à la fois.
- Les identifiants de compte ne sont jamais exposés dans l'annuaire public ; les routes de mutation exigent une session authentifiée et une identité joueur liée au compte.

### API initiale
- `GET /api/rp-clubs` : annuaire public avec recherche et pagination.
- `GET /api/rp-clubs/:id` : fiche publique du Club RP.
- `GET /api/rp-clubs/me` : appartenance et demandes en attente accessibles au responsable.
- `POST /api/rp-clubs` : création authentifiée.
- `POST /api/rp-clubs/:id/join-requests` : demande d'adhésion authentifiée.
- `POST /api/rp-clubs/:id/join-requests/:requestId/decision` : décision d'un responsable.
- `POST /api/rp-clubs/:id/leave` : départ d'un membre.

### Périmètre volontairement non prétendu
Cette première brique est un socle serveur et des parcours API testables, pas encore l'interface complète du Club RP. Elle n'implémente pas encore les invitations, la délégation de rôles, les transferts de présidence, les objectifs/XP collectifs, les matchs inter-clubs, les classements, le chat, les récompenses ni l'intégration visuelle au hub. Ces fonctions seront ajoutées au-dessus de ce modèle après validation de cette fondation. Le Club RP n'affecte pas automatiquement le footballeur à un club de championnat et ne modifie pas le moteur de match.


### Interface Club RP — premier raccordement au hub P27

L'entrée **CLUB RP** est maintenant intégrée au hub principal sans ajouter un panneau supplémentaire : le panneau communautaire remplace l'ancien raccourci ambigu « Mon club ». Dans le hub Carrière, l'accès aux clubs de championnat est explicitement nommé **Mon équipe / Équipe de championnat**. Cette séparation évite de confondre le collectif social avec l'équipe sportive du joueur.

L'écran Club RP est relié aux routes serveur :
- état du compte et de l'appartenance ;
- création avec nom, sigle et description ;
- annuaire public et demandes d'adhésion ;
- consultation des membres et des rôles ;
- validation/refus des demandes par les responsables ;
- départ du Club RP.

L'interface utilise les composants visuels du jeu et conserve le format paysage. Les mutations nécessitent un compte P27 authentifié et une identité joueur réservée. L'annuaire reste consultable sans compte ; les actions de création et d'adhésion sont verrouillées tant que l'identité n'est pas disponible.

Les invitations privées, leur acceptation/refus et l'attribution de rôles sont désormais reliées au serveur. Le tableau d'activité hebdomadaire utilise les matchs de carrière réels. Le chat, la cession de présidence, les objectifs/XP collectifs et les rencontres inter-clubs restent à construire.


### Activité collective calculée depuis les carrières P27

Le Club RP dispose maintenant d'un tableau hebdomadaire de contribution. Il est calculé côté serveur à partir des matchs de carrière réellement enregistrés pour chaque compte membre : apparitions, victoires, buts et passes décisives. L'accès est réservé aux membres du Club RP concerné ; aucun identifiant de compte privé n'est exposé au client.

Ce tableau constitue la première base de futurs objectifs collectifs. Il ne distribue pas encore de récompenses ni d'XP : ces mécaniques ne seront activées qu'après définition de règles de saison, de plafonds et de contrôles anti-abus. L'équipe de championnat et le Club RP restent deux entités distinctes.


### Bibliothèque joueurs raccordée aux statuts contractuels

L'écran Bibliothèque ne se limite plus à un aplatissement des effectifs actifs. Il consomme désormais le répertoire central `listP27Players` et récupère les joueurs par pages pour ne pas tronquer le catalogue à la première centaine. Les statuts actifs, libres et prêtés sont affichés et filtrables ; l'origine distingue les joueurs RP des joueurs du monde P27.

Les cartes restent horizontales et compactes, en quatre colonnes en paysage. Un appui développe la carte pour afficher les attributs, et l'accès à la fiche complète conserve le détail du parcours. Les joueurs transférés ne sont pas reclassés comme libres à partir d'une ancienne archive. Les fiches de joueurs libres indiquent leur dernier club connu au lieu d'inventer un club actuel.


### Studio 3D du footballeur — enrichissement DLS19

Le studio P27 existant est conservé : aperçu 3D manipulable, tenue, teint, coiffure, couleur des cheveux, morphologie, identité et poste. Le modèle de profil prend maintenant aussi en charge les formes de visage (ovale, rond, anguleux, allongé, carré) et les formes d'yeux (amande, ronds, tombants), déjà interprétées par le rendu 3D. Le pied préféré accepte droit, gauche ou ambidextre.

Ces choix sont persistés dans le profil local via la validation centralisée. Les anciennes sauvegardes restent compatibles : les nouveaux champs reçoivent des valeurs par défaut sans réinitialiser les autres personnalisations. Il s'agit d'un enrichissement du studio existant, pas d'un second éditeur.


### Objectifs collectifs hebdomadaires — première intégration

Le tableau Club RP expose maintenant quatre défis calculés à partir des mêmes statistiques serveur que le classement de contribution :
- jouer 10 matchs ;
- remporter 5 matchs ;
- inscrire 20 buts ;
- délivrer 10 passes décisives.

Chaque défi expose sa valeur réelle, sa cible, son pourcentage et son état atteint/non atteint. La période est la semaine UTC en cours (lundi 00:00 à lundi suivant). Les valeurs sont recalculées depuis les matchs de carrière finalisés des membres ; elles ne sont pas saisies par le client et ne sont pas ajoutées à une progression parallèle.

**Périmètre de cette livraison :** affichage et suivi des objectifs uniquement. Aucun XP, niveau, monnaie ou récompense n'est distribué. Les seuils sont une première configuration de défis, à équilibrer après les essais de jeu. Les objectifs n'altèrent ni les effectifs de championnat ni les résultats du moteur de match.


### Défis et planification inter-Club RP — première étape

Les responsables (fondateur, président, vice-président ou recruteur) peuvent lancer un défi à un autre Club RP. Les membres responsables du club ciblé peuvent accepter en choisissant une date et une heure, ou refuser. Les demandes sont persistées côté serveur et visibles par tous les membres des deux clubs concernés ; seules les personnes disposant d'un rôle responsable peuvent répondre. Chaque action est protégée par vérification d'appartenance et de rôle.

La date doit être située entre 30 minutes et 30 jours après l'acceptation. Un seul défi actif est autorisé entre une même paire de clubs afin d'éviter les doublons.

**Limite volontaire :** l'acceptation crée une rencontre planifiée, pas un résultat sportif. Aucun score, victoire, classement ou statistique n'est généré par ce module. La validation du résultat et le classement inter-Club attendent le raccordement à une vraie session de match P27 ; le moteur 3D et les matchs de championnat restent inchangés.


### Salons de match dédiés aux défis Club RP — raccordement serveur initial

Un défi accepté peut maintenant être converti en salon P27 via `POST /api/rp-clubs/challenges/:challengeId/match`. Seul un membre du Club RP challenger peut ouvrir ce salon, et uniquement dans la fenêtre prévue : 15 minutes avant l'horaire convenu jusqu'à 2 heures après. Le salon est lié au défi et son identifiant est conservé dans l'enregistrement du défi.

Les salons liés à un défi exigent une session authentifiée et une identité de footballeur P27 valide. Le serveur vérifie que le compte appartient à l'un des deux Clubs RP mémorisés au moment du défi, puis impose le camp : Club challenger en bleu, Club ciblé en rouge. Un compte extérieur ne peut pas rejoindre par l'API standard des salons ; le choix de camp envoyé par le client ne remplace pas l'affectation serveur. Les cinq places humaines par camp sont contrôlées avant l'entrée.

**Limites actuelles :** cette livraison raccorde la création et l'accès sécurisé au salon, pas encore le cycle complet du défi. Le résultat final n'est pas encore associé automatiquement au défi, et aucun classement, récompense ou objectif inter-Club n'est calculé. L'interface doit encore exposer l'action « Ouvrir le match » et l'accès au salon. Les tests ajoutés couvrent l'autorisation des participants, l'affectation des camps et la fenêtre horaire ; CI et APK restent à confirmer.


### Résultats officiels et classement inter-Club RP — première intégration

Les salons issus d'un défi conservent une référence au défi dans la session et dans l'archive du résultat final. Quand le moteur P27 finalise réellement le match, le service Club RP récupère le score bleu/rouge archivé et clôt le défi correspondant. Le lien est idempotent : un même résultat de salon ne peut pas être compté deux fois, et un identifiant de salon différent est rejeté.

Le classement est dérivé des seuls défis terminés : victoire = 3 points, nul = 1 point, défaite = 0 ; départage par différence de buts puis buts marqués. L'interface Club RP expose ce classement et affiche le score final dans la ligne du défi. Si la liaison de résultat échoue momentanément après l'archivage du match, l'ouverture ultérieure de la boîte des défis tente de réconcilier le résultat depuis l'archive serveur.

**Limites actuelles :** il s'agit d'un classement global de tous les défis terminés, sans saison, récompenses, sanctions ni arbitrage manuel. Le résultat est celui du moteur P27 ; aucune saisie de score par les joueurs n'est acceptée. Les tests et le build Android de cette livraison restent à exécuter/confirmer.


## 10. Saisons et historique compétitif du Club RP

Le Club RP dispose désormais d'un store saisonnier distinct du classement général :
- saisons persistées avec identifiant, nom, dates et états planifiée / active / terminée ;
- activation et clôture réservées à l'administration via le jeton serveur ;
- une seule saison active à la fois et périodes qui ne se chevauchent pas ;
- rattachement automatique des résultats de défis inter-clubs finalisés par le moteur P27 à la saison active ;
- classements saisonniers calculés avec 3 points pour une victoire, 1 pour un nul, 0 pour une défaite, puis différence de buts et buts marqués ;
- idempotence par défi et salon : le même résultat n'est jamais compté deux fois ;
- aucun résultat manuel, récompense, XP ou crédit artificiel.

Routes disponibles :
- `GET /api/rp-clubs/seasons` (historique des saisons)
- `GET /api/rp-clubs/seasons/current`
- `GET /api/rp-clubs/seasons/:seasonId/leaderboard`
- `POST /api/admin/rp-club-seasons`
- `POST /api/admin/rp-club-seasons/:seasonId/activate`
- `POST /api/admin/rp-club-seasons/:seasonId/close`

La création admin attend `id`, `name`, `startsAt` et `endsAt` (dates ISO 8601). L'activation doit intervenir pendant la période définie. Les résultats finalisés hors de cette période ne sont pas ajoutés à la saison. Le classement général inter-clubs reste indépendant et conserve l'ensemble des résultats validés. L'interface Club RP affiche l'état de la saison active, l'historique sélectionnable et le classement propre à chaque saison. Pour une saison terminée, le premier du classement est présenté comme champion ; pendant une saison active, il est explicitement indiqué comme leader provisoire. Une réconciliation peut être retentée même après clôture du défi si l'archivage du match existe mais qu'une écriture saisonnière a échoué temporairement.


### Classement hebdomadaire des contributions individuelles — précision

Le tableau d’activité du Club RP distingue maintenant les performances de chaque membre sur la semaine UTC. Le classement applique un ordre transparent : matchs joués, victoires, buts, passes décisives, puis nom en cas d’égalité complète. Chaque ligne expose les quatre statistiques et le rôle communautaire du membre. Les données restent calculées côté serveur depuis les matchs de carrière enregistrés ; l’interface ne peut pas modifier ces valeurs.

Cette amélioration ne crée ni score de contribution arbitraire, ni portefeuille de Club RP, ni récompense. La trésorerie collective reste séparée de l’économie du footballeur et attend une définition explicite de ses règles de financement, de dépense et de contrôle.


### Discussion privée du Club RP

Chaque Club RP dispose d'un fil de discussion persistant réservé à ses membres actuels. Les messages sont enregistrés dans le stockage du Club RP, limités à 300 caractères et les 200 derniers sont conservés. L'API exige une session, une identité de joueur valide et l'appartenance actuelle au club ; un délai anti-spam de deux secondes est appliqué par compte. Le panneau affiche les 60 derniers messages aux membres connectés. Le texte est rendu comme texte échappé, jamais comme HTML. Les anciens membres perdent l'accès à la discussion dès leur départ.

Cette première version ne comprend pas encore les messages privés, pièces jointes, notifications push ou outils de modération avancée.


### Gouvernance du Club RP — présidence, exclusions et journal des décisions

Le modèle de gouvernance distingue maintenant le **fondateur historique** du **président en exercice**. `presidentAccountId` identifie le détenteur actuel de la présidence ; les anciennes sauvegardes sans ce champ sont migrées en prenant le membre déjà marqué président, ou à défaut le fondateur. Le transfert ne modifie pas l'identité historique du fondateur, mais lui retire les permissions qui dépendent de la présidence.

- Seul le président en exercice peut transférer la présidence à un autre membre, modifier les rôles ou exclure un membre.
- Le fondateur historique et le président en exercice sont protégés contre l'exclusion. Le fondateur peut quitter volontairement le groupe après avoir transféré la présidence ; son identifiant historique reste conservé dans les données du Club RP sans lui imposer de rester membre. Le président en exercice doit transférer sa fonction avant de quitter le groupe.
- Les responsables de recrutement (vice-président et recruteur) conservent les actions de recrutement et de défi, mais ne peuvent pas transférer la présidence ni modifier les rôles.
- Les décisions d'adhésion, d'invitation, de changement de rôle, de transfert de présidence, d'exclusion et de départ sont consignées dans un journal persistant plafonné à 100 événements.
- Le journal visible aux membres ne divulgue aucun identifiant de compte privé. Le serveur demeure l'autorité pour les permissions ; l'interface ne fait qu'exposer les actions autorisées.

Routes ajoutées : `POST /api/rp-clubs/:clubId/presidency/transfer` avec `playerId`, et `POST /api/rp-clubs/:clubId/members/:playerId/remove`. Les contrôles API couvrent le transfert, la perte des permissions de l'ancien président, l'acceptation par le nouveau président, l'exclusion et la lecture du journal.

Aucun portefeuille, crédit, XP ou récompense collective n'est ajouté dans ce lot. Les résultats sportifs et le moteur de match restent inchangés.

## 11. Lot d'alignement UI — 27 novembre 2026

Le hub principal est maintenant organisé selon la direction P27 validée :
- grille paysage de trois colonnes et trois rangées, sans barre de navigation persistante ;
- carrière sur deux colonnes et match amical comme deux accès prioritaires ;
- six accès secondaires : Mon joueur, Compétitions, Mercato, Classements, Clubs (Club RP) et Résultats ;
- les bibliothèques des joueurs et des clubs restent accessibles depuis le Mercato, sans multiplier les tuiles ;
- en-tête réduit à Paramètres, progression/niveau et pièces ; le raccourci profil et le titre de page ont été retirés de la barre visible ;
- hauteur de référence de l'en-tête : 25 px sur le profil paysage compact, avec retour uniquement dans les sous-écrans.

Cette intégration réutilise les routes et les données déjà présentes. Elle ne crée pas de faux modes, d'événements, de transferts entre clubs ou de classements fictifs. Le Club RP reste distinct des clubs de championnat. Le contrôle visuel et tactile sur appareil Android demeure une étape séparée ; l'APK est volontairement en pause et n'est pas déclaré validé.
### Discussion Club RP — actualisation automatique

La discussion privée du Club RP dispose maintenant d'une route de lecture dédiée `GET /api/rp-clubs/:clubId/messages`. Le serveur vérifie la session et l'appartenance actuelle avant de retourner les 60 derniers messages ; les identifiants de compte privés ne sont jamais exposés. Le panneau actualise son historique toutes les 10 secondes, suspend les requêtes lorsque l'onglet est masqué et arrête le polling lorsqu'on quitte la page ou lorsque l'accès est révoqué. La position de lecture est conservée si le membre consulte d'anciens messages. L'envoi fonctionne également avec la touche Entrée ; le champ n'est vidé qu'après confirmation du serveur.

Tests ajoutés : lecture autorisée pour un membre, refus HTTP 403 pour un non-membre, protection du stockage contre la lecture hors club, actualisation automatique, arrêt du polling et envoi au clavier. Cela ne remplace pas encore une messagerie temps réel WebSocket : la synchronisation actuelle est un polling léger de 10 secondes.
### Hub carrière — forme et statistiques réelles

L'écran Carrière affiche désormais les cinq derniers résultats réellement enregistrés, les totaux de saison (matchs, buts et passes décisives) et la note moyenne issue du récapitulatif de saison. La note globale du joueur reste calculée depuis ses attributs de profil. Les accès Derniers matchs et Fiche joueur conduisent aux écrans existants. En l'absence de matchs validés, l'interface indique explicitement qu'aucun match n'a été enregistré au lieu de fabriquer une forme ou des statistiques.

## 10. Harmonisation transversale de l'interface — lot UI global

Le passage transversal applique désormais une base commune à tous les écrans internes sans remplacer leurs composants métier :
- retours tactiles cohérents, états désactivés lisibles et focus clavier visible ;
- formulaires en thème sombre, médias limités à la largeur disponible et contenus longs autorisés à revenir à la ligne ;
- hiérarchie typographique et surfaces des panneaux mieux unifiées ;
- tableaux avec en-têtes persistants dans leurs zones de défilement ;
- comportement adaptatif des vues carrière/compétitions et des actions du Mercato en portrait ;
- défilement contenu maîtrisé sur les écrans paysage courts ;
- respect de la préférence système de réduction des animations.

Ce lot est une harmonisation CSS transversale : il ne prétend pas ajouter les fonctions métier absentes, ne modifie pas les règles économiques ou sportives et ne change pas le moteur 3D du match.


## 10. Lot UI — bibliothèque joueurs et espace mercato

- Les cartes de la bibliothèque reçoivent une hiérarchie sportive plus nette : fond contrasté, liseré latéral, portrait cadré et note globale mise en évidence.
- L'état développé conserve l'accès aux attributs et au potentiel sans transformer chaque carte en fiche longue.
- Les raccourcis du mercato sont traités comme deux accès fonctionnels distincts vers les bibliothèques joueurs et clubs.
- Les panneaux de budget et de fenêtre de transfert sont visuellement différenciés ; les informations de contrat et l'historique restent lisibles sur écran mobile.
- Les règles métier ne changent pas : portefeuille de transfert, salaire hebdomadaire et crédits d'entraînement restent distincts ; les fenêtres de transfert continuent de contrôler les actions existantes. Aucun transfert entre joueurs ou vente entre clubs n'est ajouté par cette passe UI.
- Les vues restent compactes en paysage et basculent vers une composition à deux colonnes sur les petits écrans portrait.
- Cette passe améliore la présentation ; elle n'ajoute pas de moteur de transfert de joueurs entre clubs ni d'agents/recruteurs non implémentés.


### Clarification fonctionnelle Mercato / catalogues — lot UI

Le centre Mercato est explicitement présenté comme l'espace des contrats, fenêtres, offres et négociations. Les catalogues joueurs et clubs sont des espaces de consultation séparés, accessibles par deux raccourcis descriptifs depuis le Mercato. Le texte de l'interface précise désormais que les offres du prototype sont simulées localement : il ne les présente pas comme des propositions provenant d'un serveur ou de clubs connectés. Le décor CSS superposé aux portraits a été retiré pour éviter de masquer les images/avatars existants. Aucun mécanisme de transfert ni aucune règle économique n'a été modifié.


### Navigation contextuelle des fiches joueur — lot UI

L’ouverture d’une fiche depuis la bibliothèque générale ou depuis l’effectif d’un club mémorise maintenant son origine. Le retour de la fiche restaure le catalogue correspondant, au lieu de renvoyer systématiquement à la bibliothèque joueurs. Cette correction est limitée à la navigation et ne change pas les données ni les actions de carrière.


### Effectif club : ouverture accessible des fiches joueur

Les lignes de l’effectif sont désormais des points d’entrée fonctionnels vers la fiche joueur : clic, Entrée et Espace déclenchent la même action. Le contexte de retour est conservé vers le détail du club. Le comportement d’expansion des cartes de la bibliothèque générale reste séparé. Aucun statut, attribut ou mécanisme de transfert n’est modifié.


### Fiche joueur — retour contextuel

Le bouton de retour de la fiche joueur adapte désormais son libellé à la provenance : « Retour à l’effectif » depuis un club, « Retour à la bibliothèque » depuis le catalogue. La destination était déjà conservée ; ce correctif rend le parcours immédiatement compréhensible. Un test vérifie le libellé et le retour vers la page mémorisée.

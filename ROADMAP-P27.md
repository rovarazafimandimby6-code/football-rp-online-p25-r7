# Football RP Online — feuille de route P27

## Référence et méthode
- Branche de travail : `p27-dev`.
- Base exacte : `p26-base` (P26.0.0), importée depuis l'archive Release et vérifiée par le workflow d'import.
- P26 reste une base de référence immuable ; `main`, P25 R7 et la Release P26 ne sont pas des branches de développement.
- P27 sera livrée en une seule version majeure consolidée, avec un ZIP unique et une suite de tests complète.

## Socle à préserver
- Multijoueur RP autoritaire côté serveur : un humain contrôle uniquement son avatar ; tous les autres joueurs restent pilotés par l'IA.
- Synchronisation réseau, séquences d'entrée, reconnexion, physique du ballon, arbitrage, résultats et sauvegardes.
- Clubs, joueurs, compétitions et identités entièrement fictifs et originaux ; aucun élément protégé ni ressemblance reconnaissable sans licence.
- Joueurs humanoïdes masculins uniquement dans cette phase.
- Priorité aux appareils Android modestes et aux ressources 3D gratuites dont les licences sont vérifiées.

## Axes P27 à consolider

### 1. Gameplay et simulation
- Améliorer les décisions collectives de l'IA : occupation des espaces, lignes de passe, pressing coordonné, replis, transitions, couverture et comportement du gardien.
- Pondérer les décisions par les attributs, le rôle, la fatigue, la situation du match et les erreurs individuelles ; éviter une IA parfaite.
- Renforcer les duels, contrôles, passes, tirs, tacles, interceptions, arrêts, fautes et arbitrage.
- Vérifier la cohérence temporelle et physique côté serveur, sans introduire de commande globale qui retire le contrôle individuel aux humains.

### 2. Joueurs 3D, animations et caméra
- Auditer le pipeline humanoïde existant, les matériaux, proportions, silhouettes, visages, cheveux, morphologies et équipements.
- Faire évoluer le rendu vers des footballeurs crédibles et lisibles à distance, avec tenues de football distinctes des vêtements génériques.
- Étendre les animations contextuelles : course, accélération, décélération, changements d'appui, conduite, passe, tir, duel, tacle, chute, célébration et gardien.
- Revoir terrain, stade, éclairage, ombres, ambiance et plusieurs caméras sélectionnables.
- Garder un profil bas coût pour Android ; mesurer les performances avant d'activer des effets coûteux.

### 3. Joueurs, effectifs et bibliothèque de cartes
- Construire une bibliothèque centrale filtrable : joueurs libres, effectifs de chaque club, joueurs humains, joueurs IA, jeunes, transférables, prêtables, favoris et récemment consultés.
- Ajouter recherche multicritère, filtres combinables, tri, pagination/chargement progressif, comparaison et fiches détaillées.
- Afficher rôles, postes, attributs, potentiel, nationalité, âge, forme, condition, contrat et statut de transfert.
- Maintenir des identités fictives originales, avec diversité internationale et forte présence malgache.

### 4. Clubs, compétitions et résultats
- Renforcer l'identité persistante des clubs IA : nom, écusson original, couleurs, maillots, stade, effectif, histoire et évolution sportive.
- Ajouter les métadonnées de clubs aux résultats archivés afin de ne plus afficher seulement Équipe bleue/Équipe rouge.
- Faire évoluer calendrier, classements, saisons, feuilles de match, statistiques et historique sans perdre les résultats existants.
- Préserver la distinction entre données locales et données réellement confirmées par le serveur.

### 5. Carrières, contrats et mercato
- Consolider contrats, salaires, durée, renouvellement, résiliation, prêts, transferts, fenêtres officielles, offres et historique.
- Relier les mouvements de joueurs aux effectifs des clubs et aux budgets ; empêcher les doubles inscriptions et états contractuels incohérents.
- Préparer une progression de carrière persistante et cohérente pour les joueurs humains et les clubs IA.

### 6. Multijoueur et persistance
- Tester les salons, arrivées/départs, reconnexion, déconnexion, limites d'effectif, synchronisation et résultats finaux.
- Prévoir une persistance robuste des salons/matchs en cours si nécessaire, et une stratégie compatible avec plusieurs instances serveur.
- Ne jamais exposer les jetons de joueurs dans les résultats ou les journaux publics.
- Vérifier la configuration de stockage persistant du déploiement avant toute promesse de conservation après redéploiement.

### 7. Interface et expérience mobile
- Unifier navigation, tableau de bord, cartes, écrans de match, profils, carrière, effectifs et résultats dans une interface mobile professionnelle.
- Améliorer lisibilité, hiérarchie visuelle, commandes tactiles, retours d'action, états de chargement et gestion hors ligne/réseau faible.
- Éviter les écrans surchargés et les interactions qui masquent le terrain ou les informations utiles.

## Audit initial P26 — constats vérifiés
- Le dépôt contient 179 fichiers dans l'arbre P26, dont 33 modules dans `src/`, 4 fichiers serveur et une suite de tests couvrant les versions antérieures.
- P26 documente 220 tests réussis et 71 fichiers JS/MJS passés à `node --check`. Ces contrôles sont ceux consignés dans `AUDIT-P26.txt`, pas une réexécution locale dans cette étape.
- Le résultat final est stocké dans un fichier JSON atomique local au processus ; les salons et matchs actifs restent en mémoire.
- Le résultat archivé contient score, joueurs et statistiques, mais pas les identifiants/noms des clubs.
- Le modèle 3D actuel repose sur un seul humanoïde masculin de base, une bibliothèque d'animations et quelques coiffures CC0 ; ce n'est pas encore une bibliothèque de modèles de footballeurs variés.
- Aucun test Android physique, multi-appareils réel, test Render de production ni mesure FPS n'est consigné dans l'audit P26.

## Ordre d'exécution recommandé
1. Verrouiller les contrats de données et tests de non-régression du multijoueur, des résultats, clubs et carrières.
2. Corriger les limites structurelles des données : identifiants de clubs dans les résultats, persistance et relations joueur/club/contrat.
3. Améliorer l'IA et la simulation par scénarios testables.
4. Refaire le pipeline joueur/équipement/animation/caméra avec budget de performance Android.
5. Déployer la bibliothèque de cartes et les interfaces effectifs/carrière.
6. Faire les essais intégrés, Android et réseau réel ; corriger avant l'archive finale.

## Critères de livraison P27
- Suite complète de tests automatisés réussie ; contrôles de syntaxe et d'intégrité des ressources.
- Aucun recul sur les scénarios multijoueurs, résultats, sauvegardes, clubs, carrières et gameplay.
- Vérification mobile sur appareil réel et mesures de performance documentées.
- Une archive ZIP P27 unique, empreinte SHA-256 publiée et rapport d'audit associé.
- Aucun changement destructif sur `main`, P25 R7, `p26-base` ou la Release P26.

## Journal d'intégration

### Lot 1 — identité des clubs dans les matchs (intégré)
- [x] Résoudre les clubs à partir du catalogue fictif officiel du jeu côté serveur ; les noms et couleurs ne sont jamais acceptés librement depuis le client.
- [x] Associer les identités bleu/rouge aux états publics des salons.
- [x] Archiver les identités des clubs dans les résultats finalisés, tout en conservant la lecture des anciens résultats sans métadonnées.
- [x] Transmettre au serveur l'affiche domicile/extérieur réellement sélectionnée dans l'écran de préparation du match.
- [x] Afficher les noms des clubs dans la feuille de match.
- [x] Corriger un défaut découvert par les tests : un salon vide était supprimé dès le premier tick car `Array.every()` retourne vrai sur une liste vide. Les salons vides restent désormais joignables jusqu'à leur TTL.
- [x] Ajouter des tests de validation des identifiants, d'archivage, de compatibilité, d'affichage et de conservation des salons vides.
- Validation GitHub Actions : run [P27 validation](https://github.com/rovarazafimandimby6-code/football-rp-online-p25-r7/actions/runs/45159608964), **225/225 tests réussis**, contrôle de syntaxe réussi.

Limite assumée : les salons créés sans affiche de clubs valide restent neutres ; aucune affiliation fictive n'est attribuée au joueur.

### Lot 2 — identité visuelle des clubs sur le terrain (intégré)
- [x] Transmettre la palette primaire/secondaire/accent de chaque club aux modèles 3D de tous les joueurs, sans écraser l'apparence personnelle du joueur humain contrôlé.
- [x] Utiliser les palettes des clubs dans les maillots des joueurs de champ et les variantes prévues pour les gardiens.
- [x] Remplacer les écussons génériques du tableau de match par les écussons SVG générés à partir de l'identité des clubs.
- [x] Pour les salons en ligne, utiliser les identifiants de clubs renvoyés dans l'état serveur du salon afin que les joueurs voient la même affiche.
- [x] Ajouter des styles responsives pour les écussons et les noms longs dans le tableau de score.
- [x] Ajouter des tests de non-régression sur la transmission des palettes, l'affichage des écussons et la conservation de l'apparence du profil.
- Validation GitHub Actions : run [P27 validation](https://github.com/rovarazafimandimby6-code/football-rp-online-p25-r7/actions/runs/45160108472), **227/227 tests réussis**, contrôle de syntaxe réussi.

Limite de validation : la suite automatisée confirme le câblage des palettes et des écussons ; le rendu réel sur téléphone Android et les performances GPU restent à vérifier sur appareil.

### Lot 3 — pressing collectif et couverture défensive IA (intégré)
- [x] Identifier le joueur IA de champ le plus proche du ballon et lui attribuer le pressing principal.
- [x] Identifier le deuxième joueur IA le plus proche et lui attribuer une position de couverture de la ligne de passe.
- [x] Éviter que plusieurs joueurs IA convergent systématiquement sur le porteur ; les autres conservent leur structure de ligne.
- [x] Réserver le déclenchement du tacle opportuniste au premier défenseur, pour limiter les duels redondants.
- [x] Conserver les facteurs de spécialité, de vitesse, d'endurance et de style de pressing.
- [x] Ajouter un scénario automatisé vérifiant le poursuivant, le couvreur et le maintien de la ligne défensive.
- Validation GitHub Actions : run [P27 validation](https://github.com/rovarazafimandimby6-code/football-rp-online-p25-r7/actions/runs/45160346982), **228/228 tests réussis**, contrôle de syntaxe réussi.

Périmètre : ce lot améliore l'IA locale de match. La simulation en ligne reste autoritaire côté serveur et n'a pas été remplacée par cette logique client.

### Lot 4 — appels offensifs et occupation des couloirs IA (intégré)
- [x] Ajouter un calcul de cible de soutien qui tient compte du rôle tactique et de la position du porteur.
- [x] Faire attaquer la profondeur aux profils coureurs et finisseurs, avec une cible différente pour les meneurs en soutien derrière le ballon.
- [x] Adapter le couloir de course à l'espace disponible face aux défenseurs adverses, en conservant une préférence de position liée au poste.
- [x] Maintenir les profils de couverture dans leur ligne plutôt que de les envoyer systématiquement devant le ballon.
- [x] Borner les courses aux limites jouables du terrain.
- [x] Ajouter des tests ciblés sur les appels en profondeur, le choix d'un couloir libre et les positions de soutien.
- Validation GitHub Actions : run [P27 validation](https://github.com/rovarazafimandimby6-code/football-rp-online-p25-r7/actions/runs/45161152708), **230/230 tests réussis**, contrôle de syntaxe réussi.

Périmètre : les appels concernent les joueurs IA locaux et les soutiens autour d'un porteur humain ou IA. La simulation en ligne autoritaire côté serveur reste distincte.

### Lot 5 — décisions offensives pondérées par les attributs (intégré)
- [x] Pondérer l'évaluation des lignes de passe par la qualité de passe et la vision du porteur.
- [x] Tenir compte du contrôle du receveur dans la valeur d'une option de passe.
- [x] Ajuster la propension à tirer selon la finition et le sang-froid, et la propension à passer selon la passe et la vision.
- [x] Borner les facteurs d'attributs pour conserver des décisions imparfaites et éviter les probabilités extrêmes.
- [x] Ajouter des tests comparatifs entre profils faibles et élevés et vérifier les bornes des facteurs.
- Validation automatisée : en attente du workflow GitHub Actions sur le commit consolidé.

Périmètre : ce lot modifie la prise de décision de l'IA locale. Il ne modifie ni le contrôle des joueurs humains ni l'autorité de simulation des salons en ligne.

### Lot 6 — accélération, freinage et changements d'appui visuels (intégré)
- [x] Étendre le profil de foulée avec une réponse bornée à l'accélération et au freinage.
- [x] Calculer la variation de vitesse visuelle sans modifier la vélocité ni les collisions du joueur.
- [x] Ajouter une inclinaison de changement de direction amortie et bornée.
- [x] Conserver les paramètres historiques de marche/course lorsque les nouvelles entrées sont nulles.
- [x] Ajouter des tests unitaires sur accélération, freinage, virage, fatigue et compatibilité.
- Validation automatisée : en attente du workflow GitHub Actions sur le commit consolidé.

Périmètre : amélioration procédurale du rig Three.js existant ; aucun modèle externe ni coût géométrique supplémentaire. La vérification visuelle sur appareil Android reste nécessaire.

### Lot 7 — compacité et protection de la profondeur défensive (intégré)
- [x] Ajouter une cible défensive qui tient compte du porteur adverse, des menaces proches et du côté du but à protéger.
- [x] Conserver une partie de la position de référence du joueur pour éviter les déplacements collectifs désordonnés.
- [x] Faire varier le repli selon la mentalité tactique sans modifier le contrôle des joueurs humains.
- [x] Remplacer le simple glissement vers le ballon des joueurs défensifs éloignés par une protection de l'axe et des couloirs.
- [x] Ajouter des tests sur la position côté but, la conservation du couloir et le repli prudent.
- Validation automatisée : en attente du workflow GitHub Actions sur le commit consolidé.

Périmètre : IA locale de match. Le pressing principal et la couverture rapprochée restent attribués à leurs rôles dédiés.

### Lot 8 — cycle de vie des contrats de carrière (intégré)
- [x] Calculer l'état réel d'un contrat et le nombre de jours restants.
- [x] Faire expirer les contrats à échéance, libérer le joueur et annuler les offres pendantes associées.
- [x] Permettre le renouvellement avec salaire et nouvelle durée contrôlés.
- [x] Permettre la résiliation explicite et conserver les événements dans l'historique.
- [x] Bloquer les transferts lorsque le joueur n'est plus sous contrat actif.
- [x] Ajouter les actions de renouvellement et de résiliation à l'écran Mercato & contrats.
- [x] Ajouter des tests sur renouvellement, expiration, résiliation et transferts après expiration.
- Validation automatisée : en attente du workflow GitHub Actions sur le commit consolidé.

Périmètre : gestion de carrière locale sur l'appareil. Ce système n'est pas encore une base de contrats autoritaire synchronisée entre plusieurs joueurs.


### Lot 9 — accueil carrière et shell d'interface paysage (intégré)
- [x] Remplacer l'accueil promotionnel simple par un tableau de bord carrière : identité du joueur, niveau, club/contrat, statistiques de saison et dernière performance réellement enregistrée.
- [x] Ajouter des accès directs vers joueur, clubs/effectifs, compétitions et mercato, en plus des entrées match local et multijoueur.
- [x] Recomposer le menu principal en navigation horizontale et panneaux fixes adaptés au format paysage.
- [x] Verrouiller l'expérience menu en paysage, avec écran d'orientation dédié en portrait et sans défilement vertical global.
- [x] Mettre à jour les métadonnées, le manifeste npm et les libellés de version du shell vers P27.
- Validation automatisée : en attente du workflow GitHub Actions sur le commit consolidé.
- Limite : ce lot refond le shell et l'accueil. Les pages secondaires et la présentation détaillée du HUD restent à harmoniser dans les lots UI suivants ; essai visuel Android réel requis.


### Lot 10 — HUD de match et panneaux de contrôle paysage (intégré)
- [x] Hiérarchiser le tableau de score, les écussons, les noms de clubs et l'horloge dans un HUD de type retransmission.
- [x] Harmoniser le bouton pause, le statut de match, la mini-carte, l'endurance et les commandes tactiles.
- [x] Renforcer les états actifs et focus des commandes, avec libellés accessibles pour joystick et actions.
- [x] Compacter les panneaux statistiques et pause pour le format paysage sans défilement vertical interne.
- [x] Aligner le libellé du menu de pause et des réglages caméra sur P27.
- Validation automatisée : en attente du workflow GitHub Actions sur le commit consolidé.
- Limite : le style et les attributs d'accessibilité sont testés par inspection automatisée ; la lisibilité réelle, la précision tactile et le rendu FPS doivent être contrôlés sur Android.


### Lot 11 — système visuel unifié et centre de découverte des clubs (intégré)
- [x] Créer des tokens visuels partagés pour les panneaux, bordures, textes, accents et états de focus.
- [x] Corriger le conteneur central : les pages longues ne sont plus tronquées ; elles disposent d'un défilement interne maîtrisé sans faire défiler le shell complet.
- [x] Recomposer les cartes clubs en fiches compactes avec écusson, ville, stade, niveau, réputation et aperçu d'effectif.
- [x] Ajouter recherche par nom/ville/stade, filtres par division et pays, tri par niveau, nom, taille d'effectif et réputation.
- [x] Ajouter un compteur dynamique et masquer les divisions sans résultat.
- [x] Améliorer la lisibilité des tableaux d'effectifs avec en-tête fixe et panneau défilant.
- Validation automatisée : en attente du workflow GitHub Actions sur le commit consolidé.
- Limite : l'interface des clubs est désormais exploratoire et filtrable ; les interactions avancées sur les cartes joueurs et les écrans de préparation de match restent à approfondir.

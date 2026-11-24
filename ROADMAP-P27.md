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


### Lot 12 — centre de préparation avant-match (intégré)
- [x] Remplacer le simple choix domicile/extérieur par un centre de préparation immersif.
- [x] Afficher les écussons, noms, villes, pays, stades et notes réelles des deux clubs sélectionnés.
- [x] Présenter les trois joueurs les mieux notés de chaque effectif, sans inventer de statistiques.
- [x] Ajouter un terrain tactique 5 contre 5 avec représentation des deux équipes et formation.
- [x] Mettre à jour instantanément les fiches lors du changement de club et empêcher une affiche avec le même club deux fois.
- Validation automatisée : en attente du workflow GitHub Actions sur le commit consolidé.
- Limite : la présentation tactique reste un aperçu de formation ; l'éditeur de composition, les remplacements et les consignes tactiques détaillées sont à développer.


### Lot 13 — bibliothèque centrale de cartes joueurs (intégrée)
- [x] Ajouter une entrée dédiée Joueurs dans la navigation et les accès rapides de l'accueil.
- [x] Centraliser les joueurs présents dans les effectifs locaux connus, en conservant le club source et les données réelles du catalogue.
- [x] Créer des cartes avec note générale, poste, âge, nationalité, potentiel, archétype et six attributs.
- [x] Ajouter recherche par nom/archétype, filtres club/poste/note minimale, tri et chargement progressif par lots de 24.
- [x] Ajouter un panneau de détails extensible par carte et des indicateurs de volume réels.
- Limite : les joueurs libres, humains en ligne, jeunes de centre, transférables, prêtables, favoris et récemment consultés nécessitent des registres dédiés ; ils ne sont pas présentés comme s'ils existaient déjà.
- Validation automatisée : en attente du workflow GitHub Actions.


### Lot 14 — caméra personnelle RP adaptée au poste (intégré)
- [x] Ajouter un mode « Immersion joueur » distinct des caméras de retransmission, tactique et latérale.
- [x] Ancrer la caméra sur le footballeur humain contrôlé : position arrière/épaule, orientation liée à son corps et suivi amorti.
- [x] Adapter hauteur, distance, champ de vision et anticipation selon les rôles gardien, défenseur, milieu et attaquant.
- [x] Limiter l'influence du ballon à une aide de regard lorsque celui-ci se trouve dans le champ avant du joueur ; aucun recentrage omniscient lorsque le ballon est derrière lui.
- [x] Conserver les caméras de retransmission et le zoom réglable ; faire de la caméra personnelle le réglage initial des nouveaux profils.
- [x] Ajouter des tests unitaires sur les profils de poste, l'ancrage au joueur, le champ de vision directionnel et le zoom.
- Validation GitHub Actions : réussie, 256/256 tests au run de compatibilité caméra, puis 260/260 après le lot HUD ; contrôle syntaxique réussi.
- Limite : les profils de poste correspondent actuellement aux quatre familles de rôles existantes (GK/DEF/MID/FWD). Les rôles fins (latéral, défenseur central, sentinelle, relayeur, ailier, avant-centre) et la perception périphérique avec indices directionnels seront affinés dans les lots suivants. Essai visuel et ergonomique Android requis.


### Lot 15 — conseils contextuels de jeu selon le poste et la phase (intégré)
- [x] Ajouter un indicateur HUD discret qui explique la responsabilité immédiate du footballeur humain.
- [x] Distinguer possession personnelle, soutien à un coéquipier, phase défensive et ballon libre.
- [x] Adapter le conseil au rôle gardien, défenseur, milieu ou attaquant, sans automatiser les déplacements ni les actions.
- [x] Conserver le conseil dans une zone compacte du HUD paysage, sans recouvrir le terrain ni les commandes tactiles.
- [x] Ajouter des tests sur les quatre rôles et les quatre états de possession.
- Validation GitHub Actions : réussie, 260/260 tests, contrôle syntaxique réussi (run 45218805749).
- Limite : ces conseils sont une première assistance de lecture du jeu. Les indications directionnelles spatiales, appels de balle et perception périphérique seront ajoutés après validation de leur cohérence avec la simulation solo et autoritaire en ligne.


### Lot 16 — appel de balle et réponse mesurée des coéquipiers IA (intégré)
- [x] Ajouter un appel de balle sans créer une commande tactile supplémentaire : maintien du bouton B pendant 480 ms, ou touche Q au clavier.
- [x] Différencier clairement l'appui court (passe/pression) du maintien (appel), avec annulation propre des états d'entrée.
- [x] Afficher brièvement l'appel actif dans le HUD et limiter les demandes par un délai de récupération.
- [x] Donner une préférence pondérée au joueur demandeur dans l'évaluation des options de passe de ses coéquipiers IA.
- [x] Conserver les critères de qualité de ligne de passe, d'espace, de rôle et d'attributs : l'appel ne force jamais une passe dangereuse.
- Validation GitHub Actions : réussie, 264/264 tests, contrôle syntaxique réussi (run 45219577113).
- Limite : le premier comportement s'applique aux coéquipiers IA contrôlés par la simulation locale ; la propagation explicite des appels dans le protocole de match en ligne reste à concevoir pour respecter l'autorité serveur.


### Lot 17 — affichage plein écran mobile et occupation de toute la dalle (intégré)
- [x] Ajouter une commande plein écran accessible depuis le menu et le match, activée par geste utilisateur pour respecter les navigateurs mobiles.
- [x] Demander la dissimulation de l'interface navigateur avec navigationUI=hide lorsque le navigateur le permet.
- [x] Tenter le verrouillage paysage après l'entrée en plein écran, sans bloquer les appareils/navigateurs qui ne le prennent pas en charge.
- [x] Utiliser la hauteur dynamique du viewport et empêcher le défilement/overscroll du document pendant le jeu.
- [x] Garder le terrain WebGL bord à bord et les commandes accessibles dans les limites de la dalle.
- [x] Ajouter des tests de présence et de comportement du mode plein écran.
- Validation GitHub Actions : en attente sur le commit de ce lot.
- Limite : la disparition des barres système dépend du navigateur et de son mode plein écran ; certains navigateurs iOS ne proposent pas la même API. Le test final doit être effectué sur Android en ouvrant le site dans Chrome puis en activant le plein écran.


### Lot 18 — synchronisation du viewport et HUD paysage compact (intégré)
- [x] Observer les dimensions réelles du conteneur WebGL avec `ResizeObserver`, y compris quand le shell de match devient visible.
- [x] Recalculer la projection et la taille du canvas lors des changements de taille, de l'orientation et du viewport visuel mobile.
- [x] Nettoyer les observateurs et écouteurs au démontage du moteur pour éviter les fuites lors des redémarrages.
- [x] Ignorer les mesures transitoires nulles pendant les changements d'écran.
- [x] Adapter le HUD et les commandes tactiles aux téléphones paysage de faible hauteur, en conservant des cibles tactiles utilisables.
- [ ] Vérifier le plein écran, le cadrage et les zones tactiles sur un véritable appareil Android ; les tests automatisés ne remplacent pas cet essai.


### Lot 19 — cadrage personnel et lisibilité du footballeur (intégré)
- [x] Rapprocher le cadrage Immersion joueur pour rendre l'avatar contrôlé plus lisible sur téléphone.
- [x] Réduire légèrement le champ vertical par poste, sans supprimer les différences gardien/défenseur/milieu/attaquant.
- [x] Conserver un zoom utilisateur borné et un recul spécifique au rôle.
- [x] Adapter très légèrement le recul aux écrans paysage très larges et préserver le facteur de sécurité sur les écrans étroits.
- [x] Ajouter des tests de distance, de champ et de cohérence du zoom pour les quatre rôles.
- [ ] Valider visuellement le compromis lisibilité/vision du jeu sur Android lors de la phase de test finale.


### Lot 20 — appel de balle relié au multijoueur autoritaire (intégré)
- [x] Transmettre l'appel de balle depuis les commandes tactiles au pont réseau sans le confondre avec une passe ou un tacle.
- [x] Valider et temporiser la demande côté serveur, sans accepter de commande de déplacement supplémentaire.
- [x] Faire réagir les coéquipiers bots à une demande humaine lorsqu'ils sont porteurs.
- [x] Vérifier la distance, la disponibilité de la cible et la sécurité de la ligne de passe avant de servir.
- [x] Préserver la priorité d'une occasion de tir franche et la logique de passe habituelle en l'absence de demande.
- [x] Ajouter des tests réseau et serveur sur la transmission, la réponse IA et l'anti-spam.
- [ ] Vérifier le comportement avec deux vrais appareils connectés au même salon lors des essais finaux.


### Lot 21 — fiabilité du cycle de vie des appels de balle en ligne (intégré)
- [x] Invalider immédiatement une demande active lorsqu'un joueur quitte le salon.
- [x] Invalider également la demande lors d'une déconnexion détectée par expiration du heartbeat.
- [x] Vérifier qu'une demande expirée ne déclenche aucune passe différée.
- [x] Vérifier qu'un adversaire placé sur la ligne bloque la passe vers le demandeur.
- [x] Ajouter un test de non-régression sur la sortie du salon pendant une demande active.
- [ ] Vérifier ces scénarios avec deux appareils Android connectés lors des essais finaux.

### Lot 22 — synchronisation des performances en ligne avec la carrière personnelle (intégré)
- [x] Récupérer le rapport final du serveur autoritaire après le coup de sifflet final.
- [x] Identifier le joueur humain avec son identifiant de session, sans utiliser les statistiques d'un bot ou d'un autre participant.
- [x] Calculer victoire/nul/défaite et clean sheet selon l'équipe réellement contrôlée.
- [x] Alimenter l'historique de saison, la note et les statistiques individuelles avec les données du rapport serveur.
- [x] Attribuer les récompenses de carrière en tenant compte des buts et passes décisives réellement enregistrés.
- [x] Ajouter des tests sur les deux équipes, le nul, les identités absentes et les statistiques invalides.
- [ ] Vérifier la synchronisation sur deux appareils Android connectés à un même salon.


### Lot 23 — récupération des sauvegardes de carrière après corruption locale (intégré)
- [x] Ajouter un instantané de secours pour le profil, la progression, les contrats et les statistiques de saison.
- [x] Ne remplacer la sauvegarde de secours qu'à partir d'un état primaire valide.
- [x] Restaurer automatiquement le dernier instantané cohérent si le stockage principal est corrompu ou incompatible.
- [x] Normaliser les données restaurées et borner les historiques et ressources.
- [x] Couvrir la récupération après corruption JSON et après schéma invalide par des tests.
- [ ] Vérifier la récupération après fermeture forcée et redémarrage sur Android.


### Lot 24 — idempotence des résultats de match (intégré)
- [x] Associer les récompenses et statistiques d'un match en ligne à l'identifiant stable du salon.
- [x] Empêcher un rapport serveur répété de créditer deux fois expérience et monnaie.
- [x] Empêcher les doublons dans les statistiques de saison, y compris après rechargement.
- [x] Conserver un registre borné d'identifiants déjà traités dans les sauvegardes récupérables.
- [x] Tester les répétitions de rapport et la reconnexion après traitement initial.
- [ ] Vérifier le scénario de reconnexion sur deux appareils Android.


### Lot 25 — identifiants uniques des matchs locaux (intégré)
- [x] Générer un identifiant distinct à chaque initialisation/réinitialisation d'un match hors ligne.
- [x] Inclure cet identifiant dans le résultat final du match.
- [x] Utiliser l'identifiant pour protéger les récompenses et statistiques hors ligne contre les doubles traitements.
- [x] Couvrir la rotation des identifiants et le traitement idempotent par tests.
- [ ] Vérifier le cycle de plusieurs matchs locaux sur Android.


### Lot 26 — cycle de vie automatique des contrats et offres (intégré)
- [x] Actualiser le statut du contrat à l'ouverture du tableau de bord, pas uniquement dans l'écran mercato.
- [x] Libérer le joueur du club et annuler les offres en attente lorsque le contrat expire.
- [x] Expirer automatiquement les offres arrivées à échéance lors de l'ouverture du mercato.
- [x] Persister les changements d'état et tester la restauration après expiration.
- [ ] Vérifier le passage du temps et les écrans carrière sur Android.


### Lot 27 — centre d'entraînement relié à la progression (intégré)
- [x] Exposer dans l'interface les deux voies de progression déjà prises en charge par le profil.
- [x] Permettre d'utiliser les points d'entraînement gagnés en montant de niveau.
- [x] Distinguer clairement le coût en crédits, l'expérience gagnée et les points consommés.
- [x] Afficher les erreurs de ressources et le plafond d'attribut sans modifier le profil.
- [x] Ajouter les tests de consommation, d'insuffisance et de plafond.
- [ ] Vérifier le centre d'entraînement et les valeurs sur Android.


### Lot 28 — rémunération hebdomadaire des contrats (intégré)
- [x] Calculer les échéances de salaire à partir de la date de signature ou de renouvellement.
- [x] Verser automatiquement les périodes acquises lors de l'actualisation de la carrière.
- [x] Limiter le dernier paiement à la date d'expiration du contrat.
- [x] Éviter les doubles paiements après plusieurs ouvertures ou rechargements.
- [x] Régler les périodes acquises avant un renouvellement, transfert ou une résiliation.
- [x] Ajouter les versements au journal de carrière.
- [x] Couvrir les échéances, la restauration et l'expiration par tests.
- [ ] Vérifier le cycle de paie sur Android après plusieurs jours simulés.


### Lot 29 — visibilité des échéances salariales (intégré)
- [x] Exposer la prochaine échéance à partir de la dernière période déjà réglée.
- [x] Afficher la date estimée du prochain salaire et le délai restant dans la fiche du contrat.
- [x] Ne pas annoncer de versement hebdomadaire qui tomberait après l'expiration du contrat.
- [x] Garder cette consultation sans effet de bord : elle ne crédite pas le portefeuille.
- [x] Ajouter des tests sur la veille de l'échéance, le jour d'échéance et les contrats trop courts.


### Lot 30 — récupération des récompenses après interruption (intégré)
- [x] Conserver un registre borné des récompenses exactes associées aux identifiants de match déjà traités.
- [x] Lorsqu'un rapport est retraité après une interruption, restituer la récompense initiale au lieu de renvoyer zéro.
- [x] Rendre l'application des récompenses au profil idempotente par identifiant de match.
- [x] Permettre de réparer le cas où la carrière a été sauvegardée mais où le profil n'a pas encore reçu son XP et ses crédits.
- [x] Ajouter des tests de reprise après interruption et de double application.
- [ ] Vérifier la récupération après fermeture forcée et redémarrage sur Android.
- Limite : cela fiabilise la reprise locale sur un appareil ; ce n'est pas une synchronisation de compte entre appareils. Une authentification persistante et une autorité serveur sur la carrière restent nécessaires avant toute synchronisation multi-appareils.


### Lot 31 — identité persistante et sessions de compte (socle serveur)
- [x] Créer un registre de comptes persistant séparé des jetons temporaires de salon.
- [x] Hacher les mots de passe avec scrypt et un sel aléatoire individuel.
- [x] Stocker uniquement les empreintes SHA-256 des jetons de session, jamais les jetons en clair côté serveur.
- [x] Ajouter inscription, connexion, consultation de session et révocation de session.
- [x] Ajouter une limitation initiale des tentatives d'inscription/connexion par adresse IP.
- [x] Ajouter un client de compte distinct du client de match et des tests de redémarrage/expiration/révocation.
- [x] Tester les routes HTTP réelles inscription/connexion/profil/déconnexion et rejeter les corps JSON non objets.
- [x] Borner le nettoyage de la table de limitation des tentatives pour éviter une croissance mémoire illimitée.
- [ ] Ajouter une interface de compte dans le jeu et lier explicitement une carrière à un compte authentifié.
- [ ] Ajouter validation d'origine/HTTPS, politique de récupération de compte et tests multi-processus avant déploiement public.
- Limite : cette étape crée l'identité et les sessions persistantes ; elle ne synchronise pas encore les données de carrière entre appareils.

### Lot 33 — cohérence des contrats et des effectifs de clubs (intégré)
- [x] Enregistrer le footballeur de carrière dans l'effectif du club à la signature du premier contrat.
- [x] Conserver un identifiant stable pour le joueur de carrière dans les registres d'effectifs.
- [x] Déplacer le même joueur entre les effectifs lors d'un transfert, sans duplication ni perte de données.
- [x] Mettre à jour nom, numéro, poste, note et attributs de la carte du joueur depuis son profil.
- [x] Retirer le joueur de l'effectif à la résiliation ou à l'expiration du contrat.
- [x] Bloquer la signature ou le transfert lorsque l'effectif cible est complet.
- [x] Ajouter des tests sur signature, transfert, libération, mise à jour du profil et capacité d'effectif.
- Limite : cohérence des effectifs locaux de la carrière personnelle ; aucune connexion Google, synchronisation cloud ou autorité économique multijoueur n'est ajoutée dans ce lot.


### Lot 34 — intégrité des numéros de maillot et des transferts d'effectif (intégré)
- [x] Empêcher deux joueurs d'un même club de porter le même numéro.
- [x] Attribuer automatiquement un numéro libre lors de l'inscription si le numéro demandé est déjà occupé.
- [x] Refuser une modification qui créerait un doublon de numéro.
- [x] Réattribuer automatiquement un numéro libre lors d'un transfert si le numéro du joueur est déjà utilisé dans le club cible.
- [x] Préserver l'effectif source si aucun numéro ne peut être attribué dans la destination.
- [x] Ajouter des tests d'inscription, de modification et de transfert.
- Limite : règles locales de numérotation d'effectif ; pas de synchronisation cloud ni d'authentification Google.


### Lot 35 — présence garantie du footballeur personnel dans le match de carrière (intégré)
- [x] Transmettre l'identifiant stable du footballeur de carrière au moteur de match.
- [x] Réserver un slot du onze au joueur personnel même si sa note est inférieure aux joueurs IA.
- [x] Choisir en priorité un slot correspondant à son poste ; utiliser le slot de repli de la formation si le poste n'existe pas.
- [x] Contrôler directement le bon avatar à partir de son identifiant, et non seulement du premier joueur correspondant au poste.
- [x] Préserver la sélection par note des équipes qui ne possèdent pas de joueur prioritaire.
- [x] Ajouter des tests de présence, poste, numéro et sélection compétitive de repli.
- Limite : garantit la présence dans le onze du club passé au match ; la sélection du club adverse ou d'une équipe hors club reste inchangée.



### Lot 36 — profondeur d'effectif et banc de remplaçants avant-match (intégré)
- [x] Séparer explicitement les cinq titulaires de la réserve issue de l'effectif réel du club.
- [x] Construire un banc stable à partir des joueurs non retenus dans le onze, sans générer de faux remplaçants.
- [x] Préserver la priorité du footballeur de carrière dans les titulaires et éviter sa duplication sur le banc.
- [x] Limiter l'affichage du banc à cinq remplaçants pour le format 5 contre 5, avec un effectif disponible compté à partir des données réelles.
- [x] Présenter les remplaçants et le volume d'effectif dans le centre avant-match, pour les deux clubs.
- [x] Couvrir les effectifs incomplets, les identifiants dupliqués, l'absence de banc et la priorité du joueur de carrière par tests.
- Limite : les réservistes sont identifiés et affichés avant le match ; leur entrée effective en jeu, les changements tactiques et la gestion de fatigue restent à connecter au moteur de match dans les lots suivants.


### Lot 37 — remplacements locaux pendant le match (intégré)
- [x] Conserver sur le banc les joueurs réels non retenus dans le onze de départ.
- [x] Ajouter un écran « Remplacements » au menu pause, avec les changements compatibles par poste.
- [x] Autoriser jusqu'à trois remplacements locaux par équipe bleue et par match.
- [x] Interdire le remplacement du footballeur personnel contrôlé.
- [x] Remplacer proprement l'objet joueur, le modèle 3D, les étiquettes et le point de mini-carte.
- [x] Préserver le poste, le slot tactique et la position de l'équipe ; transférer la possession si le joueur sortant a le ballon.
- [x] Enregistrer les changements dans les événements du match et remettre le joueur sortant sur le banc.
- [x] Bloquer les changements hors pause et en match en ligne (protocole serveur non encore étendu).
- Limite : l'interface de remplacement est locale. Les remplacements automatiques de l'IA adverse et la synchronisation des changements en ligne restent à développer.


### Lot 38 — remplacements automatiques des équipes IA (intégré)
- [x] Construire un banc réel et distinct pour chaque équipe à partir des effectifs transmis au match.
- [x] Déclencher l'évaluation des remplacements après 40 % du temps réglementaire, à intervalle limité pour préserver les performances mobiles.
- [x] Remplacer prioritairement les joueurs IA les plus fatigués, sans jamais remplacer le footballeur contrôlé.
- [x] Choisir un remplaçant réellement inscrit au banc et compatible avec le poste ; privilégier la meilleure note/potentiel.
- [x] Appliquer la limite de trois changements par équipe, remettre le joueur sortant sur le banc et enregistrer l'événement.
- [x] Garder les remplacements automatiques désactivés en multijoueur tant que le protocole autoritaire ne les prend pas en charge.
- [x] Ajouter des tests sur le timing, la fatigue, le poste, le banc vide, la protection du joueur personnel et la limite.
- Validation GitHub Actions : réussie sur le commit `a46863d9a26d03fa9837fe86ac036f0abd31ab4a` (tests automatisés et contrôle syntaxique réussis).
- [ ] Vérifier les changements IA, la fatigue et le banc sur Android en conditions de match ; la CI ne remplace pas l'essai réel.


### Lot 42 — banc réel et rotations en ligne côté serveur (intégré)
- [x] Feuille de match serveur : cinq joueurs actifs et au moins deux réservistes IA par équipe.
- [x] Capacité de vingt joueurs par match (cinq titulaires + jusqu'à cinq réservistes par équipe à terme).
- [x] Exclure les joueurs sur le banc de l'IA de terrain, des collisions et du ballon.
- [x] Bloquer les commandes d'un humain tant qu'il est remplaçant.
- [x] Route authentifiée de rotation, validée côté serveur aux arrêts de jeu / à la mi-temps.
- [x] Rotations sans quota, poste tactique conservé et délai de dix minutes avant le retour.
- [x] Temps de jeu cumulé uniquement lorsque le joueur est sur le terrain.
- [ ] Caméra spectateur du banc et commandes tactiles dynamiques côté client.
- [ ] Gestion complète de deux à cinq réservistes humains par équipe.

### Lot 41 — effectif actif 5 contre 5 et temps de jeu individuel (intégré)
- [x] Compléter chaque équipe à cinq joueurs actifs côté serveur, sans démarrer un match en 3 contre 3.
- [x] Répartir les postes IA de base sur les cinq slots (gardien, défenseur, milieu et deux attaquants).
- [x] Conserver cinq avatars actifs par équipe lorsqu'un humain est déconnecté et que son avatar passe sous contrôle IA.
- [x] Cumuler le temps de jeu de chaque joueur pendant les périodes jouées, sans compter la mi-temps.
- [x] Inclure le cumul individuel en millisecondes dans le rapport final du match.
- [x] Ajouter des tests sur le 5 contre 5, la déconnexion et le temps de jeu.
- Limite : ce lot ne crée pas encore les réservistes 2–5 ni les rotations en ligne ; le banc et les changements restent la prochaine intégration serveur.

### Lot 40 bis — niveau réellement moyen de l'IA de remplacement (en cours de validation)
- [x] Réduire le déplacement du même avatar contrôlé par l'IA à une allure modérée, sans sprint automatique.
- [x] Introduire une petite dérive de déplacement pour éviter une conduite robotique parfaite.
- [x] Rendre les décisions de passe, de tir et de tacle probabilistes : l'IA peut hésiter ou ne pas choisir l'action optimale.
- [x] Ajouter une imprécision contrôlée sur l'orientation des passes et des tirs.
- [x] Garder les règles et actions fondamentales : se déplacer, conserver/jouer le ballon, passer, tirer et défendre.
- [ ] Vérifier la difficulté ressentie en match réel et ajuster les probabilités après essais Android.

- Ajustement complémentaire : profil de remplacement encore moins performant (déplacement à 70 % de la décision de base, dérive mesurée, visée jusqu'à environ 23°, probabilité d'exécution réduite pour passes/tirs/tacles). Les bots standards ne reçoivent pas ces pénalités.
- Test complémentaire : vérification statistique sur un échantillon déterministe que les actions de l'IA moyenne restent hésitantes, sans basculer vers une exécution parfaite ou quasi nulle.


### Lot 43 — catalogue complet des clubs et structure des compétitions (intégré, validation serveur)
- [x] Corriger la nomenclature : D4 « Challenger League » (32 clubs, Nord/Sud) et D5 « Regional League » (64 clubs, Nord/Sud/Est/Ouest).
- [x] Conserver les 16 clubs historiques et les 140 clubs fictifs d'expansion dans `DEFAULT_CLUBS`, soit 156 identités uniques réparties selon les quotas D1–D5.
- [x] Vérifier que le catalogue serveur des matchs résout aussi les clubs d'expansion, et pas seulement les 16 clubs historiques.
- [x] Renforcer les contrôles du tableau de la Coupe des Clubs : 156 inscrits, 56 clubs en tour préliminaire, 100 exemptions, puis 128 qualifiés.
- [x] Tester le parcours complet de la coupe : 155 rencontres, progression des vainqueurs, finale et attribution unique du trophée.
- [x] Validation GitHub Actions sur le commit `814732e34f8ae6f448810aab631917feeba86dcc` : 420/420 tests réussis, 0 échec ; vérification syntaxique JavaScript réussie.
- Limite : le tableau et son moteur de progression sont testés côté serveur ; l'automatisation du calendrier réel, les dates des rencontres et la présentation complète des compétitions dans l'interface restent à développer.


### Lot 44 — fondations éditoriales des identités de clubs (intégré, contenu à valider)
- [x] Générer pour chacun des 156 clubs une fiche éditoriale stable : origine fictive, année de fondation indicative, archétype identitaire, philosophie sportive et culture des supporters.
- [x] Distinguer six archétypes et quatre types d'origine, dont les clubs issus d'une fusion fictive.
- [x] Marquer explicitement toutes les fiches générées comme brouillons éditoriaux afin de ne pas présenter des histoires non validées comme un canon officiel.
- [x] Ne créer aucune rivalité active automatiquement ; le statut reste « non attribué » tant qu'une relation n'est pas renseignée explicitement.
- [x] Préserver et cloner les métadonnées de lore dans le gestionnaire de clubs.
- [x] Ajouter des tests sur la couverture des 156 clubs, la stabilité des données, les statuts provisoires et la conservation des rivalités explicites.
- Limite : les biographies, les fusions nommées, les dates historiques définitives et les rivalités restent à écrire/valider club par club ; les champs générés constituent une base de travail, pas une histoire officielle.


### Lot 45 — registre contrôlé des rivalités fictives (moteur prêt, contenu non validé)
- [x] Créer un registre de rivalités explicitement renseignées, indépendant des profils générés.
- [x] Prendre en charge les motifs géographiques, historiques, sportifs, régionaux et liés aux promotions.
- [x] Empêcher les auto-rivalités, clubs inconnus, doublons et relations mal classées.
- [x] Limiter à cinq rivalités actives par division ; auditer la cible de deux à cinq rivalités principales par division.
- [x] Conserver les nouvelles relations en statut proposé par défaut ; l'activation exige une déclaration explicite.
- [x] Ajouter des tests prouvant qu'aucune rivalité n'est automatiquement inventée pour les 156 clubs.
- Limite : le registre reste vide tant que les affiches et leur histoire ne sont pas choisies et validées ; l'audit signale les divisions sous la cible sans inventer de contenu.


### Lot 46 — clôture, archivage et transition des saisons (intégré, tests serveur)
- [x] Bloquer la clôture tant qu'une compétition de la saison n'est pas terminée.
- [x] Archiver les saisons terminées, leurs trophées et leurs mouvements de division.
- [x] Préparer une nouvelle saison à partir du catalogue de clubs mis à jour.
- [x] Accepter uniquement des mouvements explicites entre divisions adjacentes, sans inventer les règles de promotion/relégation.
- [x] Contrôler les quotas exacts D1–D5 et les seize clubs par conférence en D4/D5 avant toute transition.
- [x] Persister et restaurer le cycle de saisons.
- Limite : le nombre de promus/relégués et les critères de classement des barrages restent à décider ; aucune promotion automatique n'est appliquée.

- Correctif de persistance : les affectations de division et de conférence sont sauvegardées dans le catalogue et restaurées au redémarrage pour que les saisons successives conservent les mouvements précédents.

- Extension de l'archive : conserver pour chaque compétition le classement final complet et les résultats de toutes les rencontres terminées, en plus du champion et du trophée.



### Lot 47 — interface de compte persistant et liaison sécurisée aux salons (intégré)
- [x] Ajouter un écran Compte joueur dans la navigation principale.
- [x] Permettre l'inscription et la connexion avec le client de compte persistant déjà existant.
- [x] Restaurer la session de compte locale et permettre son actualisation/révocation depuis l'interface.
- [x] Transmettre le jeton de compte uniquement à la route de jonction du salon ; le serveur résout lui-même l'identifiant du compte.
- [x] Conserver le jeton temporaire du salon séparé du jeton de compte persistant.
- [x] Garder le mode invité fonctionnel sans transmettre de jeton de compte.
- [x] Ajouter des tests couvrant la liaison de compte et le chemin invité.
- Validation GitHub Actions sur le commit `65302007d418d842d2c8763b96a92cc478b1cd65` : 547/547 tests réussis, 0 échec ; contrôle syntaxique réussi.
- Limite : le compte authentifie les prochains matchs en ligne ; la synchronisation complète du profil local, de l'apparence et de la progression d'entraînement n'est pas incluse.

### Lot 48 — consultation de la carrière liée au compte (intégré)
- [x] Afficher dans l'écran Compte les statistiques de carrière conservées par le serveur.
- [x] Récupérer les données via la route authentifiée `GET /api/career`, sans accepter de statistiques soumises par le client.
- [x] Présenter matchs, victoires, buts, passes décisives, distinctions et minutes jouées.
- [x] Gérer proprement l'absence de session valide ou l'indisponibilité du serveur.
- Validation GitHub Actions sur le commit `50697bc6e6b7d06d2a0b52e6a170f68b345e469f` : 547/547 tests réussis, 0 échec ; contrôle syntaxique réussi.
- Limite : le tableau de bord serveur expose les statistiques des matchs en ligne liés au compte. Les sauvegardes locales de profil, d'attributs et d'entraînement ne sont pas encore migrées vers un stockage cloud.


### Lot 49 — synchronisation du profil joueur lié au compte (intégré)
- [x] Ajouter un stockage serveur séparé, indexé par compte, pour l'identité sportive et l'apparence.
- [x] Ajouter les routes authentifiées `GET /api/profile` et `PUT /api/profile`.
- [x] Ajouter les actions client d'enregistrement et de restauration du profil en ligne.
- [x] Restaurer uniquement identité et apparence ; préserver localement progression, attributs, monnaie et points d'entraînement.
- [x] Valider/filtrer les champs côté serveur et exclure les données de progression envoyées par le client.
- [x] Ajouter tests de persistance après redémarrage, séparation entre comptes, filtrage, API protégée et client.
- Limite : les données de progression compétitives restent locales et ne sont pas encore migrées ; elles nécessitent une autorité serveur anti-triche avant synchronisation.

### Lot 50 — tableau de bord de forme et historique récent (intégré)
- [x] Enrichir l'écran Compte avec les cinq derniers matchs en ligne.
- [x] Présenter résultat, adversaire, note et buts, avec la note moyenne de carrière.
- [x] Lire uniquement les rapports conservés par le serveur authentifié ; ne pas accepter de statistiques saisies dans l'interface.
- [x] Prévoir un état vide lorsque le compte n'a pas encore de match.
- Limite : l'historique affiché correspond aux matchs en ligne archivés sur le serveur ; les matchs locaux ne sont pas mélangés à ces statistiques officielles.

### Lot 51 — validation des rotations 5v5 autoritaires (intégré, tests serveur)
- [x] Tester l'entrée effective d'un réserviste de la même équipe à la mi-temps via le gestionnaire serveur.
- [x] Vérifier la conservation des cinq joueurs actifs et du slot tactique.
- [x] Vérifier le refus d'un jeton invalide et d'un remplaçant appartenant à l'équipe adverse.
- [x] Conserver les règles existantes de disponibilité, de temps de retour et d'authentification sans les réécrire.
- Limite : ces tests valident le moteur de rotation serveur existant ; l'interface spectateur du banc et les commandes tactiles dynamiques restent à réaliser et à vérifier sur Android.

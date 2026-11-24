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
- Validation GitHub Actions sur le commit `d456f66adb8ca8c6d26da03b3620bfef2fa0a478` : 553/553 tests réussis, 0 échec ; contrôle syntaxique JavaScript réussi.


### Lot 52 — progression compétitive autoritaire côté serveur (intégré)
- [x] Ajouter un stockage de progression indexé par compte, séparé du profil cosmétique.
- [x] Calculer les récompenses XP/crédits à partir du résultat final du serveur, du temps de jeu et de la note calculée.
- [x] Créditer uniquement les joueurs humains authentifiés ayant joué au moins 15 secondes.
- [x] Rendre le crédit idempotent par identifiant de match et persistant après redémarrage.
- [x] Ne jamais accepter un niveau, un solde ou une récompense librement soumis par le client.
- [x] Conserver le résultat final en attente tant que la progression n'a pas été enregistrée ; les nouvelles tentatives restent idempotentes.
- Limite : les récompenses concernent les matchs en ligne finalisés par ce serveur ; les anciennes progressions locales ne sont pas automatiquement converties en soldes officiels.

### Lot 53 — entraînement et amélioration des attributs côté serveur (intégré)
- [x] Déplacer les actions d'entraînement encadré et de pratique vers le stockage serveur.
- [x] Contrôler les ressources, les coûts, les plafonds d'attributs et les identifiants d'attribut côté serveur.
- [x] Refuser les actions non autorisées et les demandes de modification arbitraire de progression.
- [x] Exposer des routes authentifiées de lecture et d'action ; les réponses retournent le nouvel état officiel.
- [x] Ajouter dans l'écran Compte les commandes connectées +1 PT et pratique +1/80 crédits, désactivées si les ressources sont insuffisantes ; afficher le retour serveur après chaque action.
- Limite : le client local conserve encore ses anciens outils d'entraînement hors ligne ; la bascule complète des sessions invitées vers le mode connecté reste à finaliser.

### Lot 54 — tableau de bord de progression officielle (intégré)
- [x] Ajouter au compte le niveau, l'expérience, les crédits et les points d'entraînement serveur.
- [x] Afficher les six attributs officiels avec leur plafond de 99.
- [x] Charger l'état depuis la route authentifiée ; ne pas afficher les valeurs locales comme progression compétitive officielle.
- [x] Couvrir les récompenses, la persistance, les actions d'entraînement et la protection API par des tests.
- [x] Relier les boutons d'amélioration de chaque attribut aux routes d'entraînement autoritaires et actualiser le tableau de bord après réponse serveur.
- Limite : la transition guidée depuis les sauvegardes locales reste à intégrer ; aucune ancienne monnaie ou progression locale n'est importée automatiquement.


### Lot 55 — caméra spectateur et bascule en match en ligne (intégré)
- [x] Ajouter un mode panoramique spectateur distinct des quatre préréglages TV historiques.
- [x] Exposer une commande de bascule rapide en match en ligne entre vue joueur, diffusion TV et spectateur.
- [x] Conserver le mode caméra choisi lors des transitions terrain/banc ; la caméra de banc reste prioritaire pendant le remplacement.
- [x] Ajouter le mode spectateur aux préférences persistantes et aux réglages de pause.
- [x] Couvrir la résolution du mode et les transitions caméra/banc par des tests.
- Limite : la vue spectateur est une caméra d'observation d'un match auquel le compte a déjà rejoint une équipe ; elle ne constitue pas encore un mode spectateur autonome sans joueur dans le salon.

### Lot 56 — banc connecté et remplacements d'équipe (intégré)
- [x] Afficher l'effectif de l'équipe, les titulaires et les réservistes dans le HUD en ligne.
- [x] Permettre à un joueur sur le terrain de choisir un bot sortant et un bot entrant pendant une fenêtre de remplacement autorisée par le serveur.
- [x] Publier explicitement l'état d'autorisation des remplacements depuis le serveur.
- [x] Appliquer les changements via l'API de rotation existante et réconcilier immédiatement l'état de match.
- [x] Empêcher un joueur de remplacer de force un coéquipier humain : le joueur humain concerné doit être lui-même demandeur.
- [x] Conserver la demande personnelle d'entrée pour un joueur humain sur le banc.
- Limite : les rotations manuelles exposées dans le HUD concernent les réservistes IA ; les changements entre humains passent par leur propre demande d'entrée.

### Lot 57 — migration guidée des anciennes sauvegardes locales (intégré)
- [x] Créer une sauvegarde locale intégrale avant toute migration, sans écraser la première sauvegarde de sécurité.
- [x] Synchroniser uniquement l'identité et l'apparence vers le profil du compte.
- [x] Préserver localement la progression, les attributs, les crédits et les identifiants de matchs historiques.
- [x] Ne jamais importer les anciennes valeurs compétitives client dans la progression serveur autoritaire.
- [x] Couvrir la sauvegarde, la non-réécriture et le filtrage des données migrées par des tests.
- Limite : la migration n'importe pas les anciennes récompenses ni les statistiques locales dans le classement officiel ; celles-ci restent dans la sauvegarde locale de sécurité.


### Lot 58 — transactions atomiques de progression (intégré, tests de panne)
- [x] Exécuter les récompenses de match, l'entraînement et la pratique sur une copie de travail de l'état.
- [x] Ne publier l'état en mémoire qu'après l'écriture atomique réussie sur disque.
- [x] Annuler la mutation mémoire si la persistance échoue, afin qu'une nouvelle tentative ne soit jamais considérée comme un doublon déjà enregistré.
- [x] Préserver l'idempotence des récompenses par identifiant de match et les réponses sans mutation lorsque les ressources sont insuffisantes.
- [x] Ajouter des tests de panne disque et de reprise pour les récompenses et l'entraînement.

### Lot 59 — transactions atomiques de carrière (intégré, tests de panne)
- [x] Rendre transactionnels les enregistrements de carrière des comptes et les historiques sportifs individuels.
- [x] Restaurer l'état mémoire antérieur si l'écriture de carrière échoue.
- [x] Garder le traitement idempotent des matchs et éviter les statistiques dupliquées lors d'une nouvelle tentative.
- [x] Ajouter des tests de panne disque, relecture et reprise pour les deux types d'historique.

### Lot 60 — publication du résultat après validation des récompenses (intégré, tests serveur)
- [x] Enregistrer les carrières et récompenses avant de publier l'archive officielle du résultat.
- [x] Ne pas exposer un résultat archivé tant que le salon en mémoire est encore en finalisation.
- [x] Conserver le salon en attente et permettre une nouvelle tentative après une panne de persistance.
- [x] Vérifier que l'archive et le résultat officiel n'apparaissent qu'après la réussite de la progression du compte.


### Lot 61 — sauvegarde transactionnelle du profil cloud (intégré)
- [x] Construire la nouvelle version du profil sur une copie de l'état courant.
- [x] Restaurer l'état précédent si l'écriture atomique échoue.
- [x] Garantir qu'une réponse d'échec ne laisse pas un profil modifié uniquement en mémoire.
- [x] Ajouter un test de panne disque, de redémarrage et de nouvelle sauvegarde.

### Lot 62 — transactions des comptes et des sessions (intégré)
- [x] Rendre atomiques l'inscription et la création initiale de session.
- [x] Rendre atomiques l'ouverture de session et la révocation des jetons.
- [x] Annuler les changements mémoire en cas d'échec de persistance, sans créer de compte fantôme ni révoquer un jeton non enregistré.
- [x] Conserver uniquement les empreintes des jetons en stockage et le hachage salé des mots de passe.
- [x] Ajouter des tests de panne disque sur inscription, connexion et révocation.


### Lot 66 — réconciliation des indemnités de transfert dans les finances (intégré)
- [x] Lire les événements de transfert validés depuis le journal du mercato.
- [x] Débiter le club cédant dans son grand livre avec un identifiant d'écriture déterministe.
- [x] Créditer le club acquéreur avec un identifiant d'écriture déterministe.
- [x] Rendre la synchronisation rejouable : si le débit passe mais que le crédit échoue, une nouvelle tentative ne débite pas une seconde fois.
- [x] Signaler les indemnités non réconciliées dans le résultat du règlement financier global.
- [x] Ajouter des tests de succès, d'idempotence et de reprise après trésorerie insuffisante.

Limite : les deux grands livres restent deux fichiers distincts. L'idempotence rend la reprise sûre, mais ce mécanisme n'est pas une transaction ACID multi-fichiers ; un journal transactionnel commun reste à construire au lot 65.

### Lot 63 — transactions atomiques du mercato et des contrats (intégré)
- [x] Exécuter signatures, offres, acceptations, refus, renouvellements, résiliations et actualisations sur une copie de l'état.
- [x] Annuler ensemble le changement de club, le contrat, les événements et les budgets des deux clubs si l'écriture échoue.
- [x] Garder l'offre en attente après un échec d'acceptation afin de permettre une nouvelle tentative sûre.
- [x] Ajouter des tests de panne disque, de restauration des budgets et de reprise du transfert.


## Phase 1 — fiabilité des données (lots 64 à 68)

### Lot 64 — audit transversal de l’intégrité du monde (en cours)
- [x] Ajouter un audit en lecture seule des identifiants de clubs et joueurs, des effectifs, des numéros, des contrats, des comptes financiers, des écritures et des rencontres archivées.
- [x] Détecter les contrats de carrière liés à un club inconnu ou incohérent.
- [x] Détecter les soldes de grand livre qui ne correspondent pas aux écritures.
- [x] Exposer le diagnostic via `GET /api/admin/world-integrity`, protégé par le jeton administrateur.
- [x] Ajouter des tests ciblés sur un monde cohérent et plusieurs corruptions de données.
- [x] Refuser les synchronisations d’affectations si le catalogue officiel est incomplet ou contient des identifiants dupliqués.
- [x] Contrôler les identifiants et budgets du catalogue mercato, les contrats actifs (salaire et dates), les comptes financiers dupliqués et les identifiants de saison/compétition.
- [x] Comparer les 156 affectations officielles du catalogue compétitions avec le catalogue des effectifs (division et conférence).
- [x] Détecter les clubs absents ou surnuméraires dans le catalogue persistant du mercato.
- [x] Signaler les écarts de cardinalité du grand livre par rapport au catalogue des clubs.
- [ ] Auditer les budgets croisés et les soldes économiques attendus entre les trois domaines sans confondre budget de mercato et trésorerie comptable.

### Lot 65 — fiabilité des transactions multi-stockages (en cours)
- [x] Rendre atomiques en une seule sauvegarde les écritures de revenus sponsors et leurs compteurs d’échéances.
- [x] Restaurer l’état mémoire des sponsors si l’écriture échoue.
- [x] Rendre transactionnels les résultats de rencontres, l’avancement des tableaux et la clôture de saison dans le stockage des compétitions.
- [x] Préserver l’identité des objets de compétition pendant les transactions réussies pour ne pas invalider les références actives.
- [x] Ajouter un journal durable de coordination/récupération pour les indemnités de transfert entre les deux grands livres : intention persistée avant exécution, checkpoints débit/crédit, reprise après redémarrage et identifiants d’écriture déterministes.
- [x] Tester une panne entre l’écriture du débit et son checkpoint, puis vérifier la reprise sans double débit.
- [x] Étendre le journal durable aux salaires humains enregistrés dans le mercato, avec intention persistée, écriture déterministe, checkpoint et reprise après redémarrage.
- [x] Tester la panne après écriture du salaire et avant checkpoint, puis vérifier la reprise sans double dépense.
- [ ] Étendre ce coordinateur aux opérations qui modifient réellement plusieurs domaines indépendants (transfert, effectif, grand livre et contrat) ; les deux flux financiers (indemnités et salaires humains) sont désormais journalisés, mais pas encore l'ensemble du transfert contractuel multi-stockages.

### Lot 66 — cohérence des finances et de la masse salariale (en cours)
- [x] Refuser de réinitialiser silencieusement un calendrier de paie corrompu ; le serveur échoue explicitement plutôt que d’effacer les arriérés.
- [x] Ne faire avancer le calendrier de paie en mémoire qu’après sa persistance.
- [x] Garder les écritures de salaires idempotentes lorsqu’une écriture du calendrier échoue et qu’une nouvelle tentative est nécessaire.
- [x] Ajouter des tests de panne, de reprise et de refus d’un calendrier corrompu.
- [ ] Consolider les flux financiers des transferts humains et des contrats de joueurs dans le grand livre des clubs.
- [ ] Finaliser les règles économiques : budgets, masse salariale, dépenses récurrentes et seuils de soutenabilité.

### Lot 67 — fiabilité des compétitions et des résultats (en cours)
- [x] Annuler les mutations en mémoire si la sauvegarde d’un résultat ou d’une transition échoue.
- [x] Couvrir le rollback du classement, du tableau et des affectations de clubs par des tests de panne.
- [x] Recalculer les statistiques (matchs, victoires, nuls, défaites, buts, points) à partir des rencontres terminées et comparer chaque ligne du classement.
- [x] Refuser les scores de championnat supérieurs à 99 buts dans l’audit du calendrier.
- [x] Ajouter des tests qui détectent un classement altéré et un score hors limites.
- [x] Rapprocher les archives officielles des fixtures terminées : identifiant de rencontre, compétition, salle, score et état final.
- [x] Détecter les archives dupliquées, les références de fixture inconnues et les divergences de score entre archive et compétition.
- [x] Exposer ces contrôles dans l’audit administrateur `/api/admin/world-integrity`.
- [ ] Ajouter une réparation contrôlée des archives manquantes, sans reconstruire ni inventer de résultats.

### Lot 68 — cohérence des saisons et des affectations de clubs (en cours)
- [x] Synchroniser au démarrage les divisions et conférences du gestionnaire d’effectifs depuis les affectations officielles du stockage des compétitions.
- [x] Resynchroniser les affectations après une clôture de saison réussie.
- [x] Signaler explicitement une persistance d’affectations en attente sans masquer l’état en mémoire.
- [x] Vérifier que la synchronisation des affectations n'accepte que des catalogues complets et à identifiants uniques.
- [x] Ne pas bloquer le démarrage sur une panne temporaire de sauvegarde des affectations lorsque le catalogue officiel est valide et déjà appliqué en mémoire.
- [x] Réessayer la persistance des affectations en attente toutes les 60 secondes ; une nouvelle tentative persiste aussi les états déjà alignés en mémoire.
- [x] Ajouter un test de reprise après panne temporaire de sauvegarde.
- [x] Valider trois transitions de saison consécutives avec stockage JSON réel, rechargement après chaque transition, 156 clubs, quotas 20/20, 9 ligues et coupe complète.


### Lot 64 — audit croisé des relations joueur, club et transferts (renforcé)
- [x] Détecter les identifiants de carrière joueur dupliqués.
- [x] Vérifier la cohérence entre l'identité joueur de carrière et l'identité portée par le contrat actif.
- [x] Vérifier les identifiants uniques des événements du mercato.
- [x] Détecter les transferts qui référencent un club inconnu, le même club comme vendeur et acheteur, ou une indemnité invalide.
- [x] Détecter les rencontres d'un club contre lui-même et les fixtures rattachées à une mauvaise compétition.
- [x] Ajouter des tests négatifs sur ces incohérences.

### Lot 67 — audit du calendrier et des résultats de championnat (renforcé)
- [x] Vérifier le rattachement de chaque fixture à sa compétition.
- [x] Refuser les statuts de fixture non reconnus dans un calendrier de championnat.
- [x] Refuser un résultat déjà présent sur une fixture encore planifiée.
- [x] Vérifier le format des scores des rencontres terminées.
- [x] Ajouter des tests de non-régression sur les références et états incohérents.

### Lot 68 — atomicité de la clôture et transition de saison (validée par test de panne)
- [x] Confirmer que la clôture utilise la transaction du magasin de compétitions.
- [x] Simuler une panne au moment de la persistance finale.
- [x] Vérifier le rollback des divisions, conférences, saison active et archives en mémoire.
- [x] Recharger le magasin après l'échec et confirmer que l'ancienne saison reste la seule saison active.
- [x] Exécuter la suite CI complète sur le commit consolidé : 611/611 tests réussis, 0 échec ; contrôle syntaxique JavaScript réussi (run 45439960796).



## Clôture technique de la phase 1 — audit final renforcé
- [x] Vérifier les catégories comptables autorisées, les montants plafonnés et les horodatages des écritures.
- [x] Détecter les comptes financiers manquants pour les clubs du catalogue lorsque le grand livre est initialisé.
- [x] Détecter les identifiants de fixture dupliqués entre plusieurs saisons, pas uniquement à l'intérieur d'une saison.
- [x] Contrôler la structure du championnat d'une saison P27 : 9 groupes de ligue et 1 892 rencontres de ligue.
- [x] Dernière validation CI de la branche consolidée : 611/611 tests réussis, 0 échec ; contrôle syntaxique réussi (commit `9ff75d7a436e4c24ea26042eebb7b3d3a8fcfdf6`, run `45439960796`).\n- [x] Clarifier les limites restantes : pas d'ACID multi-fichiers sur les JSON ; les flux financiers transférés sont rejouables et journalisés, mais la saga complète transfert/effectif/contrat reste une extension séparée ; l'audit ne reconstitue jamais un résultat manquant ; les règles économiques non définies ne sont pas inventées ; les essais Android et la configuration `P27_ADMIN_TOKEN` restent à faire.


## Décision de clôture — phase 1
La validation automatisée de la phase 1 est consolidée. Les contrôles d'intégrité, les transactions locales par stockage, la réconciliation financière rejouable, les audits de calendrier/résultats et les transitions pluri-saisons sont couverts par la suite de tests. Les sujets explicitement listés comme limites ne sont pas déclarés terminés : ils exigent soit une décision économique produit, soit une évolution de coordination multi-stockages, soit des vérifications d'exploitation/appareil réel.


### Lot 69 — audit croisé du journal financier et des événements mercato (intégré)
- [x] Comparer chaque événement de transfert accepté au journal financier durable.
- [x] Vérifier les checkpoints débit/crédit avec les écritures réellement présentes dans les comptes concernés.
- [x] Détecter les événements non journalisés, les règlements incomplets et les checkpoints incohérents sans bloquer artificiellement les transferts légitimes en attente.
- [x] Appliquer le même contrôle aux salaires humains enregistrés dans le journal.
- [x] Exposer les compteurs de règlements en attente dans l'audit monde administrateur.
- [x] Ajouter un scénario de bout en bout : acceptation d'un transfert, débit/crédit, redémarrage des deux stockages et audit sans doublon.
- [ ] Exécuter et valider la CI consolidée après intégration.


### Lot 70 — identité stable et audit des liens carrière/effectif (en cours)
- [x] Inscrire l'identifiant stable playerId de la carrière dans les contrats humains nouvellement signés ou transférés.
- [x] Compléter à la lecture les contrats actifs historiques qui ne possèdent pas encore cet identifiant, sans changer leur identité.
- [x] Construire un rapprochement en lecture seule entre les carrières du mercato et les identifiants des joueurs présents dans les effectifs.
- [x] Détecter les inscriptions multiples, les affectations au mauvais club, les identités de type système et les joueurs encore inscrits après résiliation/expiration.
- [x] Maintenir en avertissement les carrières actives absentes des effectifs afin de ne pas rendre les mondes historiques artificiellement invalides avant la synchronisation effective.
- [ ] Mettre en place une opération serveur coordonnée qui inscrit/déplace/libère le joueur dans l'effectif lors d'une signature, d'un transfert ou d'une résiliation ; prévoir une reprise journalisée entre les stockages indépendants.
- [ ] Ajouter les tests de panne et de redémarrage de cette coordination multi-stockages avant d'activer les invariants bloquants.


### Lot 70 — saga de synchronisation carrière/effectif (intégré, CI validée)
- [x] Écrire une commande outbox durable dans la même transaction que la signature, le transfert, le renouvellement, la résiliation ou l'expiration du contrat humain.
- [x] Préserver les événements métier historiques du mercato ; l'outbox ne remplace pas les événements de signature/transfert/renouvellement/libération.
- [x] Appliquer les commandes à l'effectif avec une opération idempotente : inscription, mise à jour, transfert et libération d'un joueur humain.
- [x] Restaurer l'état mémoire de l'effectif si sa sauvegarde locale échoue.
- [x] Rejouer les commandes en attente au démarrage, après les opérations API et périodiquement ; une panne entre la sauvegarde du roster et le checkpoint outbox ne crée pas de doublon.
- [x] Ajouter des tests de signature, transfert, résiliation, expiration, panne du stockage effectif et reprise après checkpoint manquant.
- [x] Ajouter les contrôles d'intégrité du journal outbox : identifiants uniques, statuts/actions autorisés, cohérence des liens joueur/contrat/club et compteur de commandes en attente.
- Limite : saga rejouable et idempotente entre deux stockages JSON ; ce n'est pas une transaction ACID distribuée. Une opération de mercato peut être acceptée tandis que sa synchronisation d'effectif reste temporairement en attente, visible dans la réponse API et récupérée automatiquement.

- [x] CI consolidée après la saga d'effectif et son audit : 629/629 tests réussis, 0 échec ; contrôle syntaxique JavaScript réussi (run `45443695649`, commit testé `0bc7c11e4ac298a847e4719d676b7baa99822799`).


### Lot 71 — précontrôle d'admission humaine au mercato (intégré)
- [x] Vérifier l'existence du club cible et l'identité stable du joueur humain avant signature ou demande d'offre.
- [x] Refuser un club réservé au système, un effectif déjà complet, une limite de 7 joueurs humains atteinte, un numéro indisponible ou un identifiant déjà détenu par un joueur système.
- [x] Réévaluer l'admission au moment de l'acceptation d'une offre, même si le club était admissible lors de la demande initiale.
- [x] Conserver le comportement idempotent lorsqu'un joueur est déjà inscrit dans le club cible.
- [x] Ajouter les tests du seuil de 7 joueurs humains, de la capacité maximale et des clubs fermés.
- [x] CI de la branche p27-dev : 631/631 tests réussis, 0 échec ; contrôle syntaxique JavaScript réussi (run 45443989876, commit testé 9bdcada209a30188823f6bf316acb9208bc2eb94).


### Lot 72 — durcissement de la reprise outbox (en cours)
- [x] Vérifier que le service ne considère pas une commande traitée si le checkpoint de clôture retourne explicitement un échec.
- [x] Relier les commandes outbox à l'événement métier source avec un eventId stable.
- [x] Auditer l'existence de la carrière correspondante, l'unicité des références d'événement, le lien ID/événement, les dates de création/clôture et les commandes encore en attente.
- [x] Exposer le nombre de commandes terminées et en attente dans le rapport d'intégrité.
- [x] Ajouter les tests de liens de carrière manquants, d'événement source absent, de checkpoint explicitement refusé et de reprise sans doublon.
- [ ] Valider la suite complète de tests et contrôler les cas historiques sans eventId.


### Lot 73 — validation du redémarrage complet de la saga (en cours)
- [x] Simuler l'arrêt du serveur avant l'application d'une commande d'inscription, puis reconstruire les deux stockages et reprendre la commande.
- [x] Simuler l'arrêt après sauvegarde de l'effectif mais avant checkpoint outbox, reconstruire les deux stockages et vérifier l'idempotence de la reprise.
- [x] Valider la CI consolidée : 635/635 tests réussis, 0 échec ; contrôle syntaxique JavaScript réussi (run `45445615266`, commit testé `4b4f85d36607ed2a8afbad297b34da92bb42a341`).


### Lots 74 à 76 — cohérence contrats, effectifs et paie humaine (intégration en validation)
- [x] Étendre l'audit monde pour comparer, lorsqu'un joueur humain est inscrit avec un contrat actif, l'identifiant joueur, le club, le salaire hebdomadaire et l'échéance avec le contrat autoritaire de sa carrière.
- [x] Ajouter un scénario positif et des corruptions contrôlées de salaire et d'échéance pour l'audit des contrats.
- [x] Vérifier qu'un renouvellement met à jour le salaire et l'échéance de l'effectif après reprise des deux stockages.
- [x] Vérifier qu'une résiliation dont la commande outbox est encore en attente libère le joueur après redémarrage complet.
- [x] Vérifier qu'une échéance de salaire antérieure à un transfert reste imputée à l'ancien club et que l'échéance suivante est imputée au nouveau club.
- [x] Valider la suite CI complète : **639/639 tests réussis, 0 échec**, contrôle de syntaxe JavaScript réussi ; commit testé `86adf37d749d97db89c84a9fa9892f46d4bd720b`, run [45447220340](https://github.com/rovarazafimandimby6-code/football-rp-online-p25-r7/actions/runs/45447220340).
- Limite : la paie humaine conserve son modèle actuel d'événements de carrière et de réconciliation idempotente ; les budgets du mercato et les soldes des grands livres comptables restent séparés. La saga carrière/effectif est rejouable, mais n'est pas une transaction ACID distribuée.


### Lots 77–80 — audit paie, transferts et intégrité financière (en cours d'intégration)
- [x] Lot 77 : contrôle des événements de salaire humain — carrière source, club de paiement, montant, nombre de périodes et horodatage.
- [x] Lot 78 : contrôle des écritures du journal de paie — rejet des références sans événement métier source.
- [x] Lot 79 : tests de non-régression couvrant les événements de paie orphelins, les clubs inconnus et les montants/dates invalides.
- [ ] Lot 80 : validation CI complète sur la branche P27 et audit des résultats.


### Lots 81–83 — intégrité des carrières humaines
- [x] Lot 81 : distinguer un joueur humain réellement orphelin d'une synchronisation d'effectif encore en attente.
- [x] Lot 82 : élever en erreur l'absence d'effectif lorsqu'aucune commande outbox valide n'explique l'écart.
- [x] Lot 83 : tests de non-régression pour l'orphelin contractuel et la fenêtre de reprise saga.
- [x] Lot 84 : CI complète réussie — 643/643 tests, 0 échec, contrôle syntaxique réussi (run 45449493916, commit 7682af3f6499621a2da4ed485e4e000335addb09).


### Lots 85–90 — mercato IA, prêts et bibliothèque centrale (en cours)

#### Lot 85 — mouvements de mercato des joueurs IA (en cours d'intégration)
- [x] Ajouter une saga durable dédiée aux transferts IA, avec identifiant idempotent, reprise après redémarrage et détection du déplacement déjà effectué.
- [x] Annuler en mémoire un déplacement d'effectif lorsque sa sauvegarde échoue, puis laisser l'outbox rejouer l'opération.
- [x] Exposer une route administrateur authentifiée `POST /api/admin/system-transfers`.
- [x] Vérifier le type système, le contrat actif, les clubs, les divisions D1–D5, l'unicité du joueur et la capacité de l'effectif.
- [x] Relier le règlement au journal financier existant : le club acheteur est débité et le club vendeur crédité ; les identifiants comptables restent déterministes.
- [x] Préserver la séparation entre budgets mercato et soldes comptables.
- [x] Ajouter des tests de règlement avec le véritable grand livre, reprise financière après redémarrage et rollback en cas d'échec de persistance du roster.
- [x] Ajouter une simulation déterministe du marché IA, fondée sur les besoins de poste, les effectifs, la proximité de division et la capacité financière comptable ; fenêtre identifiée et plafond de transferts.
- [x] Exposer la simulation par route administrateur authentifiée `POST /api/admin/system-transfers/simulate`.
- [ ] Valider l'ensemble en CI et compléter les scénarios de panne entre chaque checkpoint du journal comptable.


#### Lot 86 — prêts humains persistants (intégré, CI validée)
- [x] Ajouter des offres de prêt avec fenêtre de mercato, durée bornée et expiration de l'offre.
- [x] Conserver le contrat parent et son échéance ; le prêt ne peut jamais dépasser la durée restante du contrat.
- [x] Synchroniser le joueur vers le club emprunteur par l'outbox existante.
- [x] Retourner automatiquement le joueur au club parent à la fin du prêt, ou le libérer si le contrat parent expire avant.
- [x] Restaurer les prêts après redémarrage et rendre les événements d'historique uniques.
- [x] Exposer les opérations de prêt via les routes authentifiées /api/loan/offers.
- [x] Ajouter des tests sur acceptation, retour après redémarrage, expiration du contrat parent et refus des durées invalides.

#### Lot 87 — cycle de vie des contrats IA (socle existant, extension à compléter)
- [x] Réutiliser les fonctions existantes de renouvellement, expiration, refus selon budget salarial et recrutement de remplacement.
- [x] Enregistrer explicitement les refus sportifs de renouvellement dans le contrat IA, les conserver après rechargement, libérer le joueur à échéance et recruter un remplaçant pour restaurer l'effectif cible.
- [x] Auditer les contrats IA actifs dont l'échéance est dépassée et les archives de fin de contrat qui conservent à tort un contrat actif.
- [x] Ajouter les tests négatifs correspondants ; conserver les tests existants de refus sportif, expiration, archivage et recrutement d'un remplaçant.
- [x] Ajouter un scénario persistant complet de recrutement d'un joueur libre IA suivi d'un redémarrage et d'un nouvel audit d'intégrité.

#### Lot 88 — registre et recrutement des joueurs IA libres (intégré)
- [x] Construire le recrutement à partir des archives de joueurs libérés, en choisissant le dernier état connu et en évitant les doublons d'effectif.
- [x] Créer un nouveau contrat rattaché au club recruteur, avec trace du club précédent et de la date de signature.
- [x] Bloquer les identifiants déjà inscrits et exclure les carrières humaines de ce flux.

#### Lot 89 — bibliothèque centrale des joueurs (intégré, API)
- [x] Agréger les joueurs des effectifs et les joueurs libres archivés sans doublons.
- [x] Filtrer par club, division, poste, type humain/IA, statut actif/libre/prêté, âge et note.
- [x] Ajouter recherche insensible aux accents, tri et pagination bornée.
- [x] Exposer le répertoire en lecture seule via GET /api/players/library, avec facettes de clubs, divisions et statuts.

#### Lot 90 — audit transversal mercato/effectifs/contrats (intégré)
- [x] Compter les joueurs libres uniques et signaler les archives de joueurs libres dupliquées sans confondre les archives de transfert.
- [x] Vérifier les liens du prêt actif : club parent, contrat parent, échéances et inscription du joueur dans le club emprunteur.
- [x] Ajouter des tests positifs et négatifs sur les prêts et les doublons d'archives libres.

- [x] Validation CI consolidée de cette étape : **654/654 tests réussis, 0 échec**, contrôle syntaxique JavaScript réussi ; commit testé 3b2f0315a72ebc0da3ec032f16850f79a903feef, run https://github.com/rovarazafimandimby6-code/football-rp-online-p25-r7/actions/runs/45454346081.
- État consolidé après les lots 85–92 : le moteur de simulation du mercato IA et l'audit de son outbox sont désormais intégrés sur `p27-dev`, sous réserve de validation CI. Le cycle des contrats IA et le recrutement des joueurs libres disposent des contrôles ajoutés au lot 87. Les prêts restent limités aux carrières humaines ; aucun système de prêts IA n'est déclaré. Aucun déploiement ni test Android physique n'a été effectué.


- [x] Extension lot 87 : validation CI complète après traçage des refus de renouvellement IA et recrutement du remplaçant : **655/655 tests réussis, 0 échec**, contrôle syntaxique réussi ; commit testé 80c67bc3ef0e008f57c8c306178b8ea5c981bec6, run https://github.com/rovarazafimandimby6-code/football-rp-online-p25-r7/actions/runs/45454925657.


### Lots 91–92 — fiabilité du mercato IA et audit de sa saga (en cours de validation)

#### Lot 91 — déterminisme temporel et profondeur d'effectif
- [x] Faire utiliser à la validation du contrat l'horodatage explicite de la simulation, et non l'horloge réelle du serveur.
- [x] Ne compter que les joueurs IA dans le seuil minimal de réserve du club vendeur ; les joueurs humains ne doivent pas artificiellement autoriser le départ d'un joueur IA.
- [x] Ajouter des tests de non-régression sur l'horloge de fenêtre et le calcul de profondeur IA.
- [ ] Valider la suite complète en CI.

#### Lot 92 — audit transversal de l'outbox de transferts IA
- [x] Injecter l'état durable des transferts IA dans l'audit administrateur du monde.
- [x] Contrôler le schéma, l'unicité des identifiants, les liens joueur/clubs et la présence unique du joueur dans un effectif.
- [x] Distinguer un transfert en attente encore au vendeur ou déjà déplacé, sans le déclarer terminé prématurément.
- [x] Exiger pour un transfert terminé la présence du joueur chez l'acheteur et un règlement financier complet avec les rôles comptables inversés (acheteur débité, vendeur crédité).
- [x] Ajouter les tests d'attente légitime, de clôture incohérente et d'identifiant dupliqué.
- [ ] Valider la suite complète en CI et compléter les scénarios de panne entre checkpoints.


#### Lot 93 — réconciliation des écritures du mercato IA
- [x] Détecter les écritures du journal de transferts qui ne correspondent ni à un événement de transfert humain ni à une commande outbox IA.
- [x] Ajouter un test de non-régression pour une écriture financière IA orpheline.
- [ ] Valider la suite complète en CI.


### Lot 94 — protection de la profondeur de poste pendant une vague IA
- [x] Recalculer la profondeur du poste chez le vendeur après chaque transfert effectivement accepté.
- [x] Interdire toute nouvelle vente qui ferait descendre le vendeur sous deux joueurs IA au même poste.
- [x] Couvrir une simulation à plusieurs acheteurs et candidats, avec contrôle du nombre de joueurs restants.
- [ ] Valider la suite complète en CI.

### Lot 95 — cohérence bidirectionnelle des checkpoints financiers
- [x] Détecter une écriture de débit présente alors que le checkpoint débit est encore déclaré non effectué.
- [x] Détecter une écriture de crédit présente alors que le checkpoint crédit est encore déclaré non effectué.
- [x] Ajouter un test couvrant les deux cas avec soldes de comptes recalculés et commandes outbox en attente.
- [ ] Valider la suite complète en CI et exécuter les scénarios de panne sur le grand livre réel.


### Lot 96 — calcul du besoin IA indépendant des joueurs humains
- [x] Ne compter que les joueurs IA du poste ciblé dans le besoin d'effectif IA du club acheteur.
- [x] Éviter qu'un effectif rempli de joueurs humains masque un poste encore dépourvu de renforts IA.
- [x] Ajouter un scénario avec plusieurs clubs acheteurs dont les postes sont occupés par des joueurs humains.
- [ ] Valider la suite complète en CI.

### Lot 97 — reprise des checkpoints financiers et provenance contractuelle
- [x] Simuler une panne lors de la préparation du journal financier, après le débit et avant son checkpoint, puis avant le checkpoint final.
- [x] Rejouer chaque scénario avec le grand livre réel et vérifier l'absence de double débit/crédit.
- [x] Contrôler que le contrat IA déplacé référence le nouveau club, le joueur, le club précédent et une date de transfert valide.
- [x] Ajouter un test d'intégrité négatif sur un contrat déplacé sans provenance cohérente.
- [ ] Valider la suite complète en CI.

### Lot 98 — simulation de marché à l'échelle des 156 clubs
- [x] Construire un scénario déterministe de 156 clubs répartis sur D1–D5.
- [x] Vérifier l'évaluation des candidats dans la division du vendeur et les divisions immédiatement adjacentes.
- [x] Vérifier le plafond de transferts, l'unicité des mouvements et la réserve minimale de deux joueurs IA.
- [x] Garder les villes et coordonnées hors de toute logique de sélection ou de classement.
- [ ] Exécuter et valider la suite complète en CI ; comparer ensuite le scénario aux données réelles du monde P27.


### Lot 99 — chaîne historique des transferts IA
- [x] Distinguer les transferts successifs légitimes d'un même joueur des conflits d'effectif.
- [x] Vérifier la continuité chronologique : le club vendeur du mouvement suivant doit être le club acheteur du mouvement précédent.
- [x] Comparer le roster et la provenance du contrat uniquement au dernier mouvement connu, sans exiger qu'un joueur reste dans un ancien club acheteur.
- [x] Détecter plusieurs commandes IA simultanément en attente pour un même joueur.
- [x] Ajouter des tests de chaîne séquentielle valide et de double commande en attente.
- [ ] Valider en CI.

### Lot 100 — exclusion des transferts concurrents
- [x] Refuser un nouveau mouvement d'un joueur tant qu'une saga antérieure de ce joueur reste en attente.
- [x] Autoriser un mouvement séquentiel une fois la saga précédente terminée.
- [x] Vérifier que le refus expose l'identifiant de la commande qui bloque le joueur.
- [x] Ajouter un test de panne financière, reprise, puis nouveau transfert.
- [ ] Valider en CI.

### Lot 101 — historique et reprise après transferts successifs
- [x] Effectuer deux transferts successifs du même joueur avec deux identifiants métier distincts.
- [x] Recharger le service d'outbox après les deux mouvements.
- [x] Vérifier que les deux commandes restent terminées et rejouables sans double mouvement.
- [x] Contrôler la présence unique des écritures financières déterministes.
- [ ] Valider en CI et compléter l'audit croisé de la chaîne sur un monde réel de 156 clubs.


### Lot 102 — validation stricte du cycle de vie de l'outbox IA
- [x] Vérifier au chargement les compteurs de tentatives, les erreurs mémorisées et les horodatages optionnels.
- [x] Exiger une date de clôture valide pour toute commande déclarée terminée.
- [x] Étendre l'audit monde aux métadonnées de reprise et de clôture.
- [x] Préserver la lecture d'anciens snapshots d'audit où les compteurs de tentative n'étaient pas exposés.
- [x] Ajouter des tests négatifs sur les tentatives invalides et les clôtures sans date.
- [ ] Valider la CI complète et vérifier les snapshots historiques réels avant toute migration de stockage.


### Lot 103 — checkpoint explicite des tentatives en échec
- [x] Ne plus retourner le motif métier d'échec si la sauvegarde des métadonnées de reprise a elle-même échoué.
- [x] Retourner `outbox-persistence-failed` et conserver l'état durable précédemment connu lorsque le checkpoint ne peut pas être écrit.
- [x] Ajouter un test ciblé de ce chemin de panne.
- [x] Exécuter la suite complète et valider en CI.

### Lot 104 — protection contre la perte silencieuse d'un outbox corrompu
- [x] Vérifier qu'un JSON d'outbox invalide provoque une erreur explicite au démarrage.
- [x] Vérifier que le contenu brut corrompu reste intact et n'est pas remplacé par un outbox vide.
- [x] Ne pas automatiser de restauration ou de quarantaine sans stratégie de sauvegarde vérifiée.
- [ ] Tester la récupération opérationnelle à partir d'une sauvegarde réelle avant d'ajouter une procédure automatique.

### Lot 105 — rapprochement des soldes après mouvements successifs
- [x] Tester deux transferts successifs du même joueur avec le grand livre JSON réel.
- [x] Vérifier les soldes nets attendus et l'unicité de chacune des quatre écritures de débit/crédit.
- [x] Exécuter les tests et la CI complète.


### Lot 106 — audit de la pyramide officielle des 156 clubs
- [x] Contrôler la répartition nationale réelle : D1 16, D2 20, D3 24, D4 32 et D5 64.
- [x] Contrôler D4 Challenger League : 16 clubs en conférence A et 16 en B.
- [x] Contrôler D5 Regional League : 16 clubs dans chacune des conférences A, B, C et D.
- [x] Interdire les conférences en D1–D3 et les identifiants hors nomenclature en D4–D5.
- [x] Limiter la vérification stricte à un catalogue complet de 156 clubs afin de préserver les audits partiels.
- [x] Ajouter les tests positifs et négatifs de la structure.
- [ ] Comparer au catalogue réel de bootstrap P27 et exécuter la suite complète en CI.


### Lot 107 — alignement des tris de catalogue sur les conférences approuvées
- [x] Remplacer les anciennes clés de tri cardinales par les identifiants D4 A/B et D5 A/B/C/D.
- [x] Ajouter un test de tri du catalogue public vérifiant l'ordre explicite des groupes.
- [x] Remplacer un ancien scénario de test utilisant « Nord » par l'identifiant A.
- [x] Fonder le contrôle d'intégrité des quotas sur les 156 entrées réelles de `DEFAULT_CLUBS`, sans fabriquer un catalogue parallèle.
- [ ] Exécuter la suite complète et valider en CI.


### Validation automatisée consolidée — lots 103 à 107
- [x] Workflow GitHub Actions `P27 validation` réussi : [run 45465605388](https://github.com/rovarazafimandimby6-code/football-rp-online-p25-r7/actions/runs/45465605388).
- [x] `npm test` terminé avec succès.
- [x] Contrôle `node --check` réussi sur les fichiers JavaScript et MJS de `src`, `server` et `tests`.
- [x] Contrôle des quotas du monde exécuté contre `DEFAULT_CLUBS`, la source canonique des 156 clubs.
- Limite restante du lot 104 : aucune restauration automatique n'est activée ; une procédure basée sur une sauvegarde réelle doit être vérifiée avant d'en créer une.


### Lot 108 — cohérence du statut des championnats
- [x] Un championnat terminé doit avoir toutes ses rencontres terminées.
- [x] Le champion archivé doit correspondre au premier du classement recalculé.
- [x] Un calendrier intégralement joué ne peut pas rester actif.
- [x] Tests des états terminés incomplets, actifs complets et champion incohérent.

### Lot 109 — audit de chronologie des saisons
- [x] Vérifier l'unicité des identifiants de saison.
- [x] Exiger une seule saison active, placée en dernière position.
- [x] Exiger une date de clôture entière, sûre et positive ou nulle pour chaque archive terminée.
- [x] Exposer `timelineAudit` dans le snapshot et tester après rechargement.

### Lot 110 — cohérence de clôture de la Coupe
- [x] Interdire une Coupe marquée terminée tant que toutes ses rencontres ne sont pas terminées.
- [x] Interdire un champion ou un état actif après achèvement intégral du tableau.
- [x] Conserver les contrôles de progression des 28 matchs préliminaires et des 100 exemptions.

### Lot 111 — validation stricte de la transition de saison
- [x] Refuser les dates de clôture négatives, décimales ou non sûres.
- [x] Refuser une transition si la saison courante n'est pas active.
- [x] Conserver la transaction atomique et le contrôle des 20 montées / 20 descentes.
- [x] Validation complète GitHub Actions : 688/688 tests réussis, contrôle syntaxique réussi (workflow 45466633422).


### Validation automatisée — lots 108 à 111
- [x] Workflow [P27 validation — run 45466633422](https://github.com/rovarazafimandimby6-code/football-rp-online-p25-r7/actions/runs/45466633422) réussi.
- [x] Suite complète : **688/688 tests réussis**.
- [x] Contrôle syntaxique JavaScript/MJS réussi.
- [x] Une régression de compatibilité de code d'erreur dans l'audit de Coupe a été détectée par CI, corrigée, puis revalidée.
- [x] Les tests de chronologie couvrent le rechargement d'une archive sur deux saisons et la détection d'un identifiant dupliqué.


### Lot 112 — audit d'attribution des trophées archivés
- [x] Vérifier que chaque trophée référence une compétition de la même saison.
- [x] Vérifier que le club récompensé est le champion déclaré et un participant de la compétition.
- [x] Refuser les trophées dupliqués et les dates d'attribution invalides.
- [x] Exiger le trophée d'une compétition terminée lorsqu'un champion est déclaré.

### Lot 113 — cohérence des mouvements historiques
- [x] Vérifier l'unicité des clubs dans les mouvements archivés.
- [x] Vérifier la contiguïté des divisions et la cohérence montée/relégation.
- [x] Contrôler les quotas historiques de 20 promotions et 20 relégations.
- [x] Tester les agrégats cumulés sur trois transitions successives.

### Lot 114 — exposition de l'audit des archives
- [x] Ajouter `archiveAudit` au snapshot du store de compétitions.
- [x] Conserver les données archivées existantes sans réécriture automatique.
- [x] Ajouter un test négatif sur l'attribution d'un trophée au mauvais club.

### Lot 115 — rechargement pluri-saisons
- [x] Étendre le scénario de trois renouvellements avec rechargement du store.
- [x] Vérifier 156 clubs et les capacités D1–D5 et conférences après chaque saison.
- [x] Vérifier les 40 mouvements par saison et les cumuls de 60 montées / 60 descentes.
- [x] Vérifier les audits d'archives après trois saisons terminées.

### Validation automatisée — lots 112 à 115
- [x] Workflow [P27 validation — run 45467520264](https://github.com/rovarazafimandimby6-code/football-rp-online-p25-r7/actions/runs/45467520264) réussi sur le commit de code.
- [x] Suite complète : **689/689 tests réussis**.
- [x] Contrôle syntaxique JavaScript/MJS réussi.
- [ ] Revalider le commit de documentation consolidé.


### Lot 116 — audit des classements archivés
- [x] Vérifier l'unicité des compétitions, des membres et des lignes de classement.
- [x] Vérifier l'appartenance de chaque ligne de classement aux participants.
- [x] Vérifier les compteurs de matchs et la formule de points (3/1/0).
- [x] Refuser les classements historiques incomplets ou arithmétiquement incohérents.

### Lot 117 — intégrité des résultats archivés
- [x] Vérifier l'unicité des identifiants de rencontres par compétition.
- [x] Vérifier les scores des rencontres terminées.
- [x] Vérifier que les deux clubs d'un résultat appartiennent à la compétition source.

### Lot 118 — identité historique des clubs
- [x] Rapprocher les mouvements avec les participants des compétitions sources.
- [x] Contrôler division, conférence d'origine et nom historique du club.
- [x] Ajouter un test de falsification du nom dans un mouvement archivé.

### Lot 119 — statistiques cumulées des clubs
- [x] Ajouter un audit des 156 fiches historiques.
- [x] Contrôler la cohérence matchs/victoires/nuls/défaites et des compteurs.
- [x] Vérifier les références des trophées et des saisons.
- [x] Tester les agrégats après rechargement pluri-saisons et les données altérées.

### Validation automatisée — lots 116 à 119
- [x] Workflow [P27 validation — run 45468605705](https://github.com/rovarazafimandimby6-code/football-rp-online-p25-r7/actions/runs/45468605705) réussi.
- [x] Suite complète : **691/691 tests réussis**.
- [x] Contrôle syntaxique JavaScript/MJS réussi.


### Lots 120 à 123 — rapprochement des statistiques historiques
- [x] Lot 120 : recalculer les compteurs historiques des clubs depuis les saisons, compétitions et rencontres archivées ; comparer les valeurs fournies aux valeurs sources.
- [x] Lot 121 : vérifier les meilleures positions en championnat, les saisons participées et l'ordre chronologique des références.
- [x] Lot 122 : vérifier la provenance exacte des trophées historiques, au-delà du simple nombre de titres.
- [x] Lot 123 : ajouter des tests de falsification plausible après rechargement du store, sans modifier les archives sources.
- [ ] Validation CI complète et contrôle syntaxique sur le commit consolidé.
- Limite : les statistiques sont recalculées depuis les archives actuellement disponibles ; aucune statistique absente des résultats sources n'est inventée.


### Lots 124 à 127 — historiques par compétition et confrontations directes
- [x] Lot 124 : produire les bilans historiques distincts pour chaque groupe de championnat et chaque compétition.
- [x] Lot 125 : recalculer les matchs, victoires, nuls, défaites et buts par club et compétition.
- [x] Lot 126 : auditer les agrégats par compétition contre les rencontres archivées et exposer le résultat dans le snapshot.
- [x] Lot 127 : renforcer les tests de confrontations directes, d'ordre des clubs et de persistance après rechargement.
- [ ] Validation CI complète et contrôle syntaxique sur le commit documentaire consolidé.


### Lots 128 à 131 — audit de carrière individuelle et continuité des mouvements
- [x] Lot 128 : ajouter un audit en lecture seule des statistiques individuelles, des identifiants de matchs et des totaux cumulés, en tenant compte du fait que l'historique visible peut être plafonné.
- [x] Lot 129 : rapprocher l'historique des clubs observés dans les matchs avec les apparitions par club, sans déduire de transfert à partir d'une simple apparition.
- [x] Lot 130 : contrôler la chronologie et la continuité des événements de transfert fournis par le registre mercato ; signaler séparément un écart avec le club courant.
- [x] Lot 131 : ajouter des scénarios de rechargement multi-saisons, de falsification statistique, de doublon et de rupture de chaîne de transferts.
- [ ] Validation CI complète et contrôle syntaxique du commit consolidé.
- Limite : cet audit vérifie les historiques et événements déjà persistés ; il ne crée pas de statistiques de match ni de mouvements absents des sources.


### Lots 132 à 136 — audit transversal carrières, contrats et mouvements
- [x] Lot 132 : intégrer au contrôle d'intégrité du monde les carrières individuelles persistées et leurs identifiants de joueur.
- [x] Lot 133 : rapprocher les contrats actifs, les identifiants joueur/club et les prêts avec les carrières individuelles.
- [x] Lot 134 : recalculer une borne minimale des statistiques cumulées depuis les matchs conservés, sans confondre historique plafonné et total de carrière.
- [x] Lot 135 : vérifier l'ordre chronologique et la continuité des mouvements de club, y compris début et retour de prêt.
- [x] Lot 136 : ajouter un scénario d'intégration qui recharge réellement les stores carrière et mercato avant l'audit transversal.
- [ ] Validation CI complète et contrôle syntaxique du commit consolidé.
- Limite : les statistiques globales ne sont pas reconstruites à partir des seuls matchs conservés si l'historique est plafonné ; le contrôle compare uniquement les bornes vérifiables.


### Lots 137 à 140 — cohérence de l'outbox de synchronisation des effectifs
- [x] Lot 137 : relier chaque commande outbox portant un eventId à son événement source lorsqu'il est encore conservé ; distinguer événement absent en attente et événement archivé après clôture.
- [x] Lot 138 : vérifier l'identité du joueur et le type d'action (upsert/libération) entre l'événement métier et la commande de synchronisation.
- [x] Lot 139 : vérifier les clubs source et cible lorsqu'ils sont présents dans l'événement, avec test après rechargement d'une commande terminée.
- [x] Lot 140 : tester la persistance des échecs, du nombre de tentatives et la clôture idempotente après plusieurs redémarrages.
- [ ] Validation CI complète et contrôle syntaxique du commit consolidé.
- Limite : l'audit ne suppose pas que l'effet externe d'une commande est distribué atomiquement ; il contrôle la trace métier, la commande persistée et son état de reprise.


### Lots 141 à 144 — projection effective des prêts dans les effectifs
- [x] Lot 141 : tester l'inscription unique du joueur au club emprunteur puis son retour au club parent à l'échéance du prêt.
- [x] Lot 142 : tester l'expiration du contrat parent avant le terme du prêt et la libération depuis le club emprunteur.
- [x] Lot 143 : simuler une panne du stockage d'effectif au moment du retour de prêt, puis reprendre la commande après redémarrage des deux stockages.
- [x] Lot 144 : tester un cycle transfert → prêt → retour avec rechargement persistant et unicité finale de l'inscription.
- [ ] Validation CI complète et contrôle syntaxique du commit consolidé.
- Limite : ces tests valident le replay de l'outbox entre les deux stores ; ils ne prétendent pas fournir une transaction distribuée atomique.

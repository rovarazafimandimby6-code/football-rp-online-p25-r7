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

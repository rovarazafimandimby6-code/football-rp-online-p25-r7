FOOTBALL RP ONLINE — P23 CONSOLIDÉE, STABILISÉE ET ÉTENDUE — RÉVISION TECHNIQUE
Version majeure : consolidation du prototype 3D mobile et première base serveur multijoueur.

BASE
- Reprise de P23 consolidée (archive P23 antérieure : 159 326 octets).
- Conservation des systèmes carrière, clubs, profils, statistiques, caméras, commandes individuelles, IA locale, terrain et présentation.

CORRECTIONS P23 CONSERVÉES
- Cadence de rendu cible 30/60 FPS selon le profil matériel.
- Temps réglementaire séparé du delta physique plafonné.
- Nettoyage des écouteurs tactiles/HUD et minuteries à la fermeture du match.
- Profil d'apparence, attributs et pied préféré transmis au personnage contrôlé.
- Contrôles de syntaxe et tests de non-régression historiques.

NOUVEAU : BASE SERVEUR MULTIJOUEUR (NODE.JS)
- Serveur HTTP sans dépendance externe, démarrable avec `npm start`.
- Sert aussi l'application statique et expose `/health`.
- API de création/rejoindre/quitter un salon, état de match, heartbeat et commandes joueur.
- Salons limités à 10 joueurs, équipes de 5 maximum ; lancement dès 3 joueurs connectés par équipe.
- Chaque jeton autorise les commandes d'un seul personnage ; jetons exclus des états publics.
- Séquences d'entrée anti-rejeu, validation des valeurs, bornes de terrain et limitation du corps HTTP.
- Matchs configurables à 3 ou 5 minutes ; horloge serveur autoritaire pour la durée.
- Client HTTP `src/online-client.js` avec authentification par jeton, séquences et heartbeat.
- Aucun framework ou paquet tiers requis côté serveur.

DÉMARRAGE SERVEUR
1. Installer Node.js 20 ou plus récent.
2. Depuis le dossier du projet, exécuter `npm start`.
3. Ouvrir `http://localhost:8080` pour le client et `http://localhost:8080/health` pour l'état du serveur.
4. Le port peut être changé avec la variable d'environnement `PORT`.

LIMITES QUI RESTENT RÉELLES
- Le serveur est une première infrastructure de salons et d'entrées/snapshots HTTP. Il n'est PAS encore relié au moteur de match 3D pour remplacer l'IA locale par des avatars distants en temps réel. La physique du ballon, les buts, les fautes, l'arbitrage et les résultats restent simulés dans le client local.
- Il n'y a pas encore de base de données persistante, compte utilisateur, chiffrement TLS intégré, modération, anti-triche avancé, matchmaking public, reprise après redémarrage ni supervision de production. Le serveur doit être déployé derrière HTTPS/reverse proxy avant tout usage public.
- Les modèles humanoïdes sont toujours procéduraux/stylisés. Aucun pack professionnel GLB/GLTF, textures PBR de studio ou capture de mouvement n'est fourni.
- Three.js 0.170.0 est importé depuis jsDelivr. Le chargement initial requiert une connexion ; l'application n'est pas entièrement autonome hors ligne.
- Aucun test navigateur WebGL interactif ni test sur téléphone Android physique n'a été exécuté dans cet environnement. Les tests Node.js ne certifient ni FPS GPU, ni latence tactile, ni température, ni rendu réel.

RÈGLES DE JEU PRÉSERVÉES
- Contrôle humain individuel uniquement : aucune commande d'équipe et aucun changement automatique de personnage.
- Format 5v5 ; organisation possible de 3v3 à 5v5 dans les règles de présence.
- Matchs de 3 ou 5 minutes réelles maximum, deux périodes et horloge virtuelle 00:00–90:00.
- Progression, carrière, clubs et statistiques locales conservés.

STATUT
- P23 reste la version majeure en cours de perfectionnement.
- Cette archive consolide le client local et ajoute une base serveur testée, sans prétendre que le multijoueur complet, les assets professionnels ou la validation Android sont terminés.
- P24 n'est ni commencée ni nécessaire pour poursuivre ces corrections.

CONSOLIDATION TECHNIQUE SUPPLÉMENTAIRE
Le serveur possède maintenant une simulation autoritaire de base : déplacements bornés, collisions entre joueurs, portage et récupération du ballon, passes, tirs, tacles orientés, physique simplifiée du ballon, buts, score, événements et inversion des côtés à la seconde période. Les snapshots publics n'exposent pas les jetons, entrées brutes ou métadonnées de présence internes. Le client HTTP sait transmettre une action et détecter un nouveau snapshot.

IMPORTANT — INTÉGRATION NON TERMINÉE
La scène Three.js et ses dix avatars ne consomment pas encore les snapshots du serveur. Le match actuellement lancé depuis l'interface reste local contre l'IA. La persistance de comptes/carrières en base de données, le déploiement HTTPS, le matchmaking public, les assets humanoïdes professionnels, le bundle Three.js hors ligne et les tests Android physiques restent à réaliser. La simulation serveur actuelle ne doit pas être présentée comme une version multijoueur prête à publier.

PERFECTIONNEMENT AVATAR 3D — P23 (AJOUT)
- Le personnage joueur est un humanoïde procédural articulé : bassin, torse anatomique profilé, cou, tête avec mâchoire et détails faciaux, épaules, bras, coudes, mains, hanches, genoux, jambes et chaussures.
- Le torse utilise un profil de sections pour différencier taille, cage thoracique et épaules ; trois gabarits sont disponibles : fin, athlétique et puissant.
- Personnalisation étendue : cinq coiffures (courte, bouclée, afro, dégradé, rasée), trois teints, trois couleurs de cheveux et cinq palettes de maillot.
- Les transitions de poses sont amorties pour réduire les changements articulaires instantanés.
- La page « Mon joueur » possède un aperçu 3D animé construit avec le même personnage que celui du match ; il est détruit proprement lors du changement de page.
- Les options de morphologie et de coiffure sont validées, sauvegardées localement et réutilisées au lancement du match.
- Cette amélioration reste un modèle procédural stylisé : elle ne prétend pas remplacer des personnages scannés, un squelette skinné professionnel, des textures PBR de studio ou des animations mocap. Aucun asset GLB externe n'est inclus.


APERÇU AVATAR — MANIPULATION P23
Dans « Mon joueur », faites glisser horizontalement sur l’aperçu 3D pour faire tourner le footballeur. La rotation automatique reprend après une courte pause. La taille du rendu s’adapte aux changements de dimensions de l’écran. Cette interaction est couverte par des tests de code, mais reste à valider sur navigateur graphique et appareil Android physiques.

CONSOLIDATION CLUBS P23 — IDENTITÉS ET EFFECTIFS IA
- Catalogue initial de 16 clubs fictifs internationaux et malgaches, répartis en quatre divisions initiales : D1, D2, D3 et Amateur (4 clubs par division).
- Conservation des identifiants historiques des cinq clubs initiaux pour limiter les ruptures avec les sauvegardes locales.
- Identité de club : pays, ville(s), couleurs, écusson procédural, stade, réputation, budget de départ, niveau et statut de gestion IA/ouvert.
- Effectif IA initial de 12 joueurs par club : noms fictifs issus de pools nationaux, nationalité, âge, poste, numéro, note, potentiel, pied fort, archétype et paramètres d'apparence.
- Génération déterministe par identifiant de club ; mêmes joueurs et apparences au rechargement. Les données restent locales au prototype.
- Injection des cinq titulaires de chaque club choisi dans la simulation locale 5v5 : noms, postes, notes, apparences et couleurs de maillot du club sont transmis aux avatars 3D.
- Les commandes humaines restent limitées au footballeur contrôlé ; les autres joueurs restent pilotés par l'IA.
- La clé de sauvegarde historique de saison est conservée pour lire les anciennes données locales ; les rosters vides hérités sont remplacés par les effectifs initiaux déterministes.
LIMITES : les divisions sont une répartition initiale fixe, pas encore un championnat saisonnier avec promotion/relégation. Les budgets, réputations et potentiels sont des données de départ, pas encore reliés à une économie simulée. Les sauvegardes restent locales et ne sont pas synchronisées sur le serveur. La validation visuelle WebGL sur navigateur/Android reste à faire.

MISE À JOUR EFFECTIFS ET NATIONALITÉS — P23
- 12 nationalités disponibles : Madagascar, France, Sénégal, Brésil, Espagne, Argentine, Portugal, Japon, Nigeria, Italie, Royaume-Uni et Kenya.
- Répartition par quotas propres à chaque club : les effectifs ne sont plus composés au hasard à partir d'un seul pays principal.
- 85 joueurs malgaches sur les 192 joueurs IA du catalogue (44,3 %), avec au moins trois nationalités par club.
- 12 joueurs par club : 2 gardiens, 4 défenseurs, 4 milieux et 2 attaquants ; âges répartis entre jeunes, joueurs confirmés et joueurs expérimentés.
- Noms générés uniques à l'échelle du catalogue initial ; suppression du nom réel « Thiago Silva » et exclusion de plusieurs noms de vedettes connus. Une vérification juridique complète reste nécessaire avant diffusion publique.
- Migration automatique des sauvegardes locales antérieures : les identités générées sont actualisées sans effacer les notes sportives déjà sauvegardées.


FICHE CLUB ET EFFECTIF COMPLET — P23
Depuis l’écran « Clubs », ouvrez « Voir l’effectif complet » pour consulter la fiche du club. Elle affiche les joueurs avec nationalité, âge, poste, note, potentiel et archétype. La recherche par nom et le filtre par poste permettent de parcourir l’effectif. Sur mobile, le tableau reste consultable par défilement horizontal.

COMPATIBILITÉ DES SAUVEGARDES
Le format de sauvegarde des clubs est maintenant versionné en v5. À la première ouverture d’une sauvegarde antérieure, les identités générées des joueurs IA sont actualisées ; les notes, âges, postes et données de progression sportives sauvegardées sont conservés. Les identités IA sont ensuite persistées normalement.

Rééquilibrage complémentaire : les quotas de trois clubs internationaux ont été ajustés pour renforcer la représentation de l’Italie, de l’Argentine et du Kenya. Chacune des 12 nationalités supportées compte au moins cinq joueurs dans le catalogue initial.

ATTRIBUTS IA ET MATCHS 5v5
Les joueurs IA ont six attributs individuels calculés selon leur note, leur poste et leur archétype. Ils sont affichés dans la fiche d’effectif. Les compositions 5v5 sélectionnent les meilleurs profils disponibles pour chaque poste de la formation. La vitesse et l’endurance ont un effet sur le déplacement et la stamina des joueurs ; la défense et le contrôle influencent légèrement la récupération du ballon ; la passe et le tir influencent la précision. Les spécialités tactiques restent liées aux archétypes.

Avant le coup d’envoi, la présentation des équipes affiche les cinq joueurs réellement sélectionnés pour chaque club, avec leur nom, numéro, poste et note générale. Cette prévisualisation utilise le même sélecteur de composition que le match local.

P23 — Diversité des apparences (consolidation)
- Les apparences des joueurs IA utilisent des distributions probabilistes et déterministes par nationalité, sans assignation raciale rigide.
- Les profils malgaches et brésiliens couvrent un éventail étendu de carnations ; les profils européens, africains, maghrébins et est-asiatiques comportent également des variations individuelles.
- Ajout de nationalités maghrébines (Maroc, Algérie, Tunisie) et de palettes de carnations plus nuancées (clair, olive, hâlé, moyen, brun, foncé, profond).
- Variations supplémentaires de coiffures, formes de visage et formes d'yeux ; les caractéristiques faciales influencent maintenant les volumes du modèle 3D procédural.
- Migration de sauvegarde P23 version 6 : actualise les identités générées et préserve les notes sportives.
- Limite : ces profils restent une stylisation procédurale ; ils ne prétendent pas représenter toutes les diversités individuelles ou nationales.

CLÔTURE DE VERSION — P23 (22/11/2026)
P23 est clôturée comme version majeure de prototype jouable local 3D contre l'IA, avec catalogue de clubs/effectifs, personnalisation procédurale, progression locale, interface mobile et socle serveur multijoueur expérimental.

Périmètre validé dans cette archive :
- 16 clubs fictifs et 192 profils IA répartis en quatre divisions initiales.
- Match local 5v5, contrôle humain limité à son propre footballeur.
- Modèles joueurs/stade procéduraux, tenues de clubs, profils d'apparence et personnalisation.
- Carrière/progression et sauvegardes locales.
- API de salons et simulation serveur autoritaire couvertes par tests automatisés.
- Suite automatisée : 158 tests réussis, 0 échec.

Limites connues de cette clôture : le parcours de match de l'interface reste local contre l'IA. Les snapshots réseau du serveur ne sont pas encore raccordés aux avatars de la scène 3D et l'interface ne permet pas encore de créer/rejoindre un salon en match complet. P23 ne doit donc pas être présentée comme un jeu multijoueur Internet de bout en bout. Les comptes/carrières ne sont pas persistés dans une base serveur. Le rendu WebGL, les commandes tactiles et les performances doivent encore être validés sur un appareil Android physique. Three.js est chargé depuis un CDN, donc le jeu n'est pas autonome hors ligne.

Cette clôture fixe la base P23. Les éléments multijoueur bout en bout, persistance distante et validation matérielle devront être planifiés explicitement dans une version ultérieure ; ils ne sont pas déclarés terminés par cette archive.

FOOTBALL RP ONLINE — P8.1 R1
RÉVISION DE FIABILITÉ — CORRECTIONS APRÈS AUDIT

LOTS AJOUTÉS

LOT B — PROFIL ET PERSONNALISATION
- Profil joueur structuré : identité, numéro, poste préféré et pied fort.
- Paramètres d'apparence : palette de maillot, teint, coiffure et couleur des cheveux.
- Validation stricte des champs, limites numériques et nettoyage des textes.
- Sauvegarde locale versionnée via localStorage, avec repli sur un profil par défaut.

LOT B/D — PROGRESSION ET ENTRAÎNEMENT
- Expérience et niveaux jusqu'au niveau 99.
- Attribution de deux points d'entraînement et 50 pièces à chaque niveau gagné.
- Six attributs sportifs plafonnés à 99 : vitesse, tir, passe, défense, endurance et contrôle.
- Entraînement consommant des points et de la monnaie virtuelle.
- Les achats/ressources ne donnent pas de raccourci sans limite : les plafonds d'attributs restent actifs.

LOT C — CLUBS ET COMPÉTITIONS (SOCLE LOCAL)
- Clubs préinstallés avec deux statuts : gérés par IA durablement ou ouverts à une reprise.
- Reprise exclusive d'un club ouvert, effectif avec capacité maximale et contrôle des doublons.
- Calendrier de rencontres et gestion des présences.
- Match officiel prêt si au moins trois joueurs sont présents de chaque côté ; format réduit automatiquement de 3v3 à 5v5.
- Forfait si une équipe présente moins de trois joueurs ; double forfait si les deux équipes sont sous le minimum.
- Classement calculé à partir des résultats.

LOT D — CONTRATS ET MERCATO (SOCLE LOCAL)
- Signature de contrat avec salaire et durée.
- Offres de transfert, contre-propositions et acceptation/rejet.
- Transfert autorisé uniquement pendant une fenêtre de mercato configurée.
- Contrôle du portefeuille et frais de transfert.
- Historique des signatures, transferts et performances de match.

CORRECTIONS DE L’AUDIT R1
- Mercato : identifiants d’offres désormais uniques même après rejet ; validation des dates, expirations, salaires et frais ; refus des transferts vers le club actuel.
- Clubs : validation des présences et scores ; identifiants de rencontre obligatoires ; double forfait sans attribution de points ; un joueur ne peut pas être inscrit dans deux clubs ; copies de roster protégées contre les modifications externes.
- Progression : le niveau 99 ne conserve plus d’expérience inutilisable ; palette emerald corrigée en vert.
- Match : le chronomètre continue pendant les célébrations de but et ne comptabilise pas de temps au-delà du temps restant.
- Commandes : un second doigt ne peut plus voler le contrôle du joystick ; un pointercancel étranger ne réinitialise plus le doigt actif.

VALIDATION R1
- 28 tests automatisés couvrent les règles de match, profils, progression, clubs, présence, forfaits, classement, contrats et mercato.
- Vérification syntaxique de tous les modules JavaScript.
- Vérification statique des identifiants DOM utilisés par le code : aucune référence manquante.
- Exécuter : npm test (Node.js requis).

LIMITES IMPORTANTES
- La personnalisation est enregistrée localement ; elle n'est pas encore visible sur le modèle 3D du match.
- Les attributs et récompenses sont des systèmes de données ; leur influence complète sur la physique et les animations sera intégrée dans un lot gameplay ultérieur.
- Les clubs, calendriers, classements et transferts fonctionnent en mémoire dans le prototype ; aucune persistance serveur n'est encore configurée.
- Aucun multijoueur en ligne réel n'est inclus dans P8.1. Il faudra un backend autoritaire, authentification, synchronisation, anti-triche et déploiement.
- Les matchs restent plafonnés à 300 secondes, deux périodes de 150 secondes.

LIMITES DE VALIDATION R1
- Audit statique et tests Node.js effectués ; aucun test de rendu WebGL réel, de navigateur Android physique ou de réseau en conditions réelles n’a été exécuté.
- Les modules profil, clubs et carrière restent des fondations locales non intégrées à l’interface de match ni à un backend.

BASE TECHNIQUE
- Three.js 0.170.0 chargé depuis jsDelivr (connexion Internet nécessaire).
- Lancement via serveur HTTP/HTTPS, en mode paysage sur téléphone.

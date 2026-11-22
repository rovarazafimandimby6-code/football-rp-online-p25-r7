FOOTBALL RP ONLINE — P22
Version majeure consolidée : refonte de présentation et choix de caméra

BASE
- Reprise de l'archive P21 réellement récupérée depuis la Library.
- Conservation des systèmes antérieurs : match, clubs, carrière, mercato,
  progression, statistiques, IA, contrôles individuels et physique du ballon.
- Contrôle humain strictement individuel ; aucun transfert automatique du contrôle.
- Match 5v5 et durée réelle de 3 à 5 minutes maximum inchangés.

TRAVAUX P22 INTÉGRÉS
- Quatre préréglages caméra sélectionnables : ligne de touche, retransmission,
  rapprochée et tactique.
- Réglage caméra accessible dans les paramètres généraux et le menu pause.
- Caméra rapprochée pour augmenter la taille apparente des joueurs et du ballon.
- Caméra tactique plus haute et plus éloignée pour lire les espaces.
- Lissage conservé pour éviter les changements brusques ; cadrage adapté au format
  d'écran et au poste du personnage.
- Amélioration du rendu de terrain : texture de pelouse agrandie, bandes plus fines,
  micro-variations de surface et matériau PBR plus mat.
- Modèles procéduraux de joueurs adoucis : volumes corporels moins cylindriques,
  géométries plus lisses et matériaux standard à rugosité réaliste.
- Ajustement du brouillard, du tonemapping et des paramètres de caméra.

VALIDATION
- Tests automatisés P22 dédiés aux préréglages et à leur intégration UI.
- Suite complète Node.js exécutée ; résultat détaillé dans AUDIT-P22.txt.
- Syntaxe des modules modifiés contrôlée.

LIMITES IMPORTANTES
- Les footballeurs restent des modèles procéduraux construits avec des primitives
  3D améliorées. Aucun modèle humain professionnel GLB/GLTF, rig facial détaillé,
  capture de mouvement ou pack d'animations AAA n'est inclus.
- Le stade et ses spectateurs n'ont pas encore reçu une refonte complète.
- Aucun rendu navigateur/WebGL interactif ni test sur téléphone Android physique
  n'a été effectué pour cette livraison.
- Les performances visuelles et la lisibilité à distance doivent être validées
  sur appareil réel ; les tests Node ne peuvent pas confirmer le rendu graphique.

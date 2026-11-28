FOOTBALL RP ONLINE — P11 CONSOLIDÉ
=================================

BASE
- Reprise de football-rp-online-p10.1.zip (base P10.0 + IA tactique P10.1).
- P11 regroupe maintenant les systèmes P10.1 à P10.5 décrits ci-dessous.

P10.1 — IA ET COORDINATION
- Logique de choix de passe, couverture, appels et soutien tactique conservée.
- Le contrôle humain reste attaché à son propre avatar ; aucune prise de contrôle
  automatique d'un coéquipier n'est ajoutée.

P10.2 — PHYSIQUE DU BALLON ET TECHNIQUE
- Amorti de première touche influencé par l'attribut contrôle, la vitesse et
  l'angle d'arrivée.
- Conduite de balle avec avance du ballon ajustée à la vitesse et au contrôle.
- Précision des passes et tirs influencée par les attributs et la pression adverse.
- Pied de frappe estimé selon la position latérale du ballon ; pénalité au pied faible.
- Ces paramètres sont des modèles gameplay déterministes, pas une simulation
  biomécanique complète.

P10.3 — ANIMATIONS PROCÉDURALES
- Foulée articulée existante conservée et réglée selon vitesse, fatigue et
  déplacement latéral.
- Inclinaison corporelle et amplitude des bras/jambes modulées.
- Aucun pack de modèles externes GLB/GLTF n'est ajouté : le rendu reste un rig
  humanoïde procédural construit en Three.js.

P10.4 — GARDIEN, ENDURANCE ET ARBITRAGE
- Endurance commune aux joueurs humains et IA avec récupération au repos.
- Gardien IA utilisant une prédiction bornée de l'interception latérale.
- Classification des contacts arrière et des charges excessives ; les duels
  réguliers ne sont pas automatiquement sifflés.
- Arbitrage encore partiel : pas de VAR, hors-jeu complet ni simulation de
  toutes les fautes réglementaires.

P10.5 — OPTIMISATION ET SYNCHRONISATION CLIENT
- Tampon de snapshots, rejet des séquences anciennes et interpolation spatiale
  et angulaire (module client existant).
- Profils de rendu adaptatifs, limitation du pixel ratio et désactivation des
  ombres sur appareils modestes.
- Il ne s'agit pas d'un serveur multijoueur : transport réseau, serveur
  autoritaire, prédiction/réconciliation et anti-triche restent à construire.

REGLES CONSERVEES
- Football RP multijoueur : un humain contrôle uniquement son footballeur.
- Matchs de 3 ou 5 minutes réelles maximum, deux périodes ; horloge virtuelle
  synchronisée sur 90 minutes.
- Format de départ 5 contre 5 ; aucun contrôle d'équipe ni changement automatique.

VALIDATION TECHNIQUE
- Tests automatisés Node : voir `npm test`.
- Syntaxe : `node --check` sur tous les fichiers JavaScript du dossier src.
- L'application Three.js doit encore être testée visuellement sur Android.

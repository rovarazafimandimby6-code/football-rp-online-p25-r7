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
| Hub | Ancien accueil à huit tuiles ; seconde version carrière déjà présente | Hub modulaire à hiérarchie visuelle inégale |
| En-tête | Trop haut et affiche encore des libellés de page/profil | Barre compacte : paramètres, progression XP, crédits, avatar/niveau |
| Carrière joueur | Profil local, niveau, XP, crédits et points d'entraînement | Utiliser les données réelles pour la progression |
| Clubs | Catalogue, notes, stades, réputation et effectifs | Conserver les fiches et renforcer l'espace club |
| Monde compétitif | Périmètre serveur audité : cinq divisions, neuf groupes, 156 clubs, calendriers, classements, coupes et résultats | Placer la saison et ses rendez-vous au centre du hub |
| Joueurs | Bibliothèque, profils, notes, attributs, potentiel et effectifs | Harmoniser les cartes et parcours de consultation |
| Mercato | Contrats du joueur, fenêtres, offres, salaires et historique ; raccourcis vers les bibliothèques | Distinguer contrats du joueur et futurs transferts de joueurs entre clubs |
| Développement | Entraînement par crédits/points, attributs et XP | Centre de progression lisible |
| Personnalisation | Identité, apparence, pied préféré, couleurs et écussons de clubs | Regrouper les réglages existants sans inventer d'éditeur |
| Match local | Moteur 3D, match 5 contre 5, commandes, IA, caméra et HUD | Préserver le moteur et harmoniser avant/après-match |
| Multijoueur | Client et salons en ligne présents ; mode APK de test local pouvant les désactiver | N'afficher que les fonctions disponibles dans la build courante |
| Résultats | Statistiques locales et archives serveur selon le mode | Afficher uniquement les résultats enregistrés |
| Installations | Stade et données de club existent ; améliorations d'infrastructures non confirmées | Ne pas afficher de niveaux d'infrastructure factices |
| Agents/recruteurs | Système DLS équivalent non confirmé dans le marché actuel | À concevoir, pas à simuler |
| Événements/Défis/Draft/Clans/Fanzone | Système P27 complet non confirmé | À planifier après le socle carrière, sans boutons vides |

## 4. Architecture fonctionnelle cible

1. **Hub principal** : carrière dominante, match amical, joueurs, compétitions, mercato, club et résultats. Pas de huit tuiles identiques.
2. **Carrière** : progression, niveau, XP, club, contrat, historique et action de reprise.
3. **Équipe / joueurs** : bibliothèque compacte, fiches, notes globales, attributs, postes et effectifs. La gestion tactique/formation doit être un vrai système si elle est ajoutée.
4. **Mercato** : offres, contrats, fenêtres et accès aux bibliothèques. Les contrats du footballeur humain restent distincts des transferts de joueurs entre clubs.
5. **Mon club** : identité, écusson, stade, effectif, réputation et données de saison ; infrastructures uniquement avec coûts et effets réels.
6. **Compétitions** : divisions, groupes, calendriers, coupes, classements et résultats reliés dans des vues internes.
7. **Progression** : entraînement, attributs, points, XP et récompenses sans double comptabilisation.
8. **Multijoueur** : salons et matchs en ligne réellement pris en charge ; classements et événements seulement avec données serveur.
9. **Match** : continuité visuelle avec les menus, sans altérer commandes, caméra, HUD ou moteur.
10. **Paramètres** : options de jeu et caméra accessibles depuis l'en-tête compact.

## 5. Principes UI à appliquer partout

- Paysage prioritaire ; aucune navigation web persistante.
- En-tête très compact : paramètres, barre XP fine, crédits, avatar et niveau.
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

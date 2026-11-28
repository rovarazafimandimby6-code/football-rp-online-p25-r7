# P27 — configuration et validation de pré-livraison

Ce document distingue les vérifications exécutées automatiquement des opérations qui exigent l'environnement d'hébergement et un appareil Android réel.

## 1. Secret administrateur

Le serveur lit exclusivement la variable d'environnement `P27_ADMIN_TOKEN`. Il refuse les appels administrateur si elle est absente ou contient moins de 32 octets.

Générer un secret sur une machine de confiance :

```sh
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Configurer la valeur générée dans le gestionnaire de variables/secrets de l'hébergeur, sous le nom exact `P27_ADMIN_TOKEN`, puis redémarrer le service. Ne jamais :
- inscrire la valeur dans Git, un fichier de configuration versionné ou une capture d'écran ;
- la placer dans le code client, le navigateur ou une URL ;
- la transmettre dans un ticket ou un journal public.

Vérifier ensuite :
- sans en-tête `Authorization`, `GET /api/admin/world-integrity` doit répondre 401 ;
- avec un secret valide, l'endpoint doit répondre 200 si l'audit est propre, ou 409 s'il détecte des erreurs ;
- si la variable n'est pas configurée, l'endpoint doit répondre 503.

Exemple de requête locale (la variable est lue depuis l'environnement du terminal) :

```sh
curl -i -H "Authorization: Bearer $P27_ADMIN_TOKEN" http://127.0.0.1:3000/api/admin/world-integrity
```

Ne pas utiliser le secret de test présent dans les tests automatisés en production.

## 2. Contrôles serveur automatisés

Depuis la racine du dépôt :

```sh
npm test
npm run preflight
```

La commande `npm run preflight` vérifie que `P27_ADMIN_TOKEN` est présent et fait au moins 32 octets, puis crée et supprime un fichier temporaire privé dans chacun des 11 répertoires de stockage utilisés par le serveur. Elle n'affiche jamais le secret. Elle échoue si un répertoire n'est pas inscriptible. Elle ne peut toutefois pas prouver que le volume est durable après remplacement de conteneur ou panne de l'hébergeur : cette propriété doit être confirmée dans le panneau et la documentation de l'hébergeur.

Variables de stockage prises en charge : `RESULTS_DIR`, `CAREERS_DIR`, `PLAYER_PROGRESSION_DIR`, `PLAYER_PROFILES_DIR`, `COMPETITIONS_DIR`, `TRANSFERS_DIR`, `FINANCES_DIR`, `CLUB_ROSTERS_DIR`, `SYSTEM_TRANSFERS_DIR`, `ROOMS_DIR` et `ACCOUNTS_DIR`. En leur absence, les sous-répertoires correspondants de `data/` sont utilisés.

Les workflows GitHub Actions exécutent aussi les tests et `node --check` sur les fichiers JavaScript/MJS. Une validation verte ne remplace pas le contrôle des variables d'environnement, des permissions du système de fichiers, du proxy HTTPS, des sauvegardes ni de la persistance de l'hébergeur.

## 3. Parcours manuel Android

Effectuer ces essais sur le téléphone cible, dans Chrome ou le navigateur prévu, après déploiement sur un environnement de test HTTPS.

1. Ouvrir l'accueil et vérifier l'absence d'erreur de chargement ; appeler `/health` (liveness du processus) et vérifier `status: live`, puis `/readyz` et vérifier HTTP 200, `status: ready` et les 11 stockages inscriptibles. `/readyz` répond 503 si le secret manque ou si un stockage n'est pas accessible ; sa réponse ne contient jamais le secret.
2. Créer un compte avec un identifiant de test, se déconnecter, se reconnecter, puis vérifier que la session révoquée ne donne plus accès aux routes protégées.
3. Modifier le profil (nom, numéro, poste et apparence), actualiser la page puis vérifier la persistance.
4. Vérifier la progression initiale, terminer un match, vérifier que la récompense n'est accordée qu'une fois, puis tester entraînement et pratique sans dépasser les plafonds.
5. Créer/rejoindre un salon avec deux appareils ou deux sessions distinctes ; contrôler l'équilibrage, le déplacement, les actions, les remplacements et le retour au lobby/résultat.
6. Couper brièvement le réseau pendant un match, rétablir la connexion et vérifier la reprise sans doublon de joueur ni duplication de récompense.
7. Vérifier le résultat, l'historique de carrière, puis redémarrer le serveur de test et contrôler la conservation des comptes, profils, progression et résultats.
8. Tester l'orientation paysage, les zones tactiles, le clavier virtuel, les menus, le défilement et les résolutions étroites.
9. Appeler l'audit administrateur depuis un environnement de confiance et vérifier qu'il ne publie aucun secret ; conserver le statut et les avertissements pour analyse.

Noter pour chaque anomalie : modèle Android, version Android, navigateur, taille d'écran, étape, résultat attendu, résultat observé et capture expurgée de toute donnée personnelle.

## 4. Critères de clôture

La configuration du secret n'est considérée terminée qu'après vérification sur l'hébergeur réel. Les essais Android ne sont considérés terminés qu'après exécution sur le téléphone cible. Ne pas déclarer la pré-livraison validée sur la seule base de CI.


## 5. Persistance et reprise des salons actifs

Le serveur utilise `JsonRoomStore` pour checkpoint les salons et matchs non terminés dans `data/rooms/active-rooms.json`. Le chemin peut être remplacé par la variable `ROOMS_DIR`.

Avant un déploiement :
- vérifier que le répertoire désigné par `ROOMS_DIR` est inscriptible par le processus Node et situé sur un volume réellement persistant ;
- conserver les permissions privées du fichier de checkpoint (création en mode `0600`) ; il contient les jetons nécessaires à la reconnexion et ne doit jamais être exposé, copié dans un artefact public ou ajouté à Git ;
- inclure ce répertoire dans une politique de sauvegarde/restauration privée, cohérente avec les sauvegardes des autres données serveur ;
- ne pas considérer un disque éphémère de conteneur/hébergement comme une persistance garantie.

Après redémarrage, vérifier qu'un match actif revient avec le même identifiant, le score, les positions, les statistiques et le chronomètre du dernier checkpoint. Les joueurs humains sont temporairement contrôlés par l'IA et doivent pouvoir se reconnecter avec leur jeton. Le temps d'indisponibilité du serveur est suspendu ; les actions intervenues depuis le dernier checkpoint (fenêtre nominale d'environ une seconde) peuvent être rejouées. Un JSON de checkpoint corrompu doit bloquer explicitement le démarrage plutôt que créer des salons vides.

Les checkpoints locaux ne constituent ni une réplication multi-instance ni une transaction distribuée. Ne pas lancer plusieurs instances serveur partageant ce fichier sans mécanisme de verrouillage/coordination dédié.


## 6. Arrêt propre et disponibilité

- `GET /health` est un contrôle de vie (liveness) : il indique seulement que le processus HTTP répond.
- `GET /readyz` est un contrôle de disponibilité (readiness) : il vérifie `P27_ADMIN_TOKEN` et l'écriture réelle dans les 11 répertoires de stockage. Il renvoie 200 si tout est prêt, sinon 503 avec les noms des contrôles en échec, sans chemin ni valeur secrète.
- À la réception de `SIGTERM` ou `SIGINT`, le serveur cesse d'accepter de nouvelles requêtes, attend la fermeture HTTP, sauvegarde les checkpoints des salons encore actifs et arrête ses minuteries. Si une sauvegarde échoue, le processus termine avec un code d'erreur plutôt que de signaler un arrêt propre.
- L'hébergeur doit laisser un délai d'arrêt supérieur au temps nécessaire à la fermeture HTTP et à l'écriture des checkpoints. Le mécanisme ne protège pas d'un arrêt brutal `SIGKILL`, d'une coupure électrique ou d'une perte du volume ; les checkpoints périodiques restent nécessaires.
- Les sondes de plateforme doivent utiliser `/health` pour redémarrer un processus bloqué et `/readyz` pour éviter d'envoyer du trafic vers un processus dont la configuration ou les stockages ne sont pas prêts.

### Optimisation des checkpoints multi-salons

Les échéances de checkpoint atteintes pendant un même tick sont maintenant regroupées par `RoomManager.persistRooms()` puis écrites avec un seul `JsonRoomStore.saveMany()`. La méthode valide tous les snapshots et le plafond de capacité avant de remplacer atomiquement le fichier commun. Le flush d'arrêt utilise également ce chemin groupé. Les sauvegardes immédiates déclenchées par les mutations critiques restent en place.

Cette réduction du nombre d'écritures évite de réécrire le fichier complet une fois par salon lors d'un tick. Elle ne constitue pas un benchmark de charge et ne change pas les limites de déploiement : une seule instance, un stockage persistant requis et aucune coordination multi-processus.
## 7. Limites HTTP configurées

Le serveur Node limite la taille des en-têtes HTTP à 16 Kio, applique un délai de réception des en-têtes de 15 secondes, un délai de réception complet de requête de 30 secondes, une conservation keep-alive de 5 secondes et une limite de 1 000 requêtes par socket. Les corps de requête JSON restent limités à 8 Kio ; un corps trop volumineux renvoie HTTP 413 et un JSON invalide renvoie HTTP 400.

Lors du déploiement, aligner les timeouts du proxy inverse et de la plateforme avec ces limites. Ces réglages réduisent l'exposition aux connexions lentes et aux requêtes excessives, mais ne constituent pas à eux seuls une protection contre un déni de service distribué.
## 8. Simulation concurrente et travail de l'IA

Lors de chaque mise à jour IA d'un salon, le serveur forme une liste des joueurs actifs et deux groupes d'équipe ; le joueur le plus proche du ballon est déterminé une fois par équipe et réutilisé par les bots. Cela évite les filtres complets et le tri de proximité répétés pour chaque bot. Les autres décisions tactiques (pression, appel de passe, choix de cible) restent conservées.

Le test de charge déterministe couvre 30 salons, 14 joueurs chacun, sur 20 ticks. Il vérifie que les séquences progressent, que les effectifs ne disparaissent pas et que les positions restent numériques. Ce n'est pas un benchmark réseau/CPU : la capacité réelle, les latences p95/p99 et la mémoire doivent être mesurées sur l'hébergement cible.
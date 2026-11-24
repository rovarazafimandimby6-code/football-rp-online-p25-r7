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
```

Les workflows GitHub Actions exécutent aussi les tests et `node --check` sur les fichiers JavaScript/MJS. Une validation verte ne remplace pas le contrôle des variables d'environnement, des permissions du système de fichiers, du proxy HTTPS, des sauvegardes ni de la persistance de l'hébergeur.

## 3. Parcours manuel Android

Effectuer ces essais sur le téléphone cible, dans Chrome ou le navigateur prévu, après déploiement sur un environnement de test HTTPS.

1. Ouvrir l'accueil et vérifier l'absence d'erreur de chargement ; appeler `/health` et vérifier `ok: true`.
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

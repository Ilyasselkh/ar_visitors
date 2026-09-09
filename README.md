# AR - Visitors — Odoo 19

## État de l’intégration

Le module ne dépend plus du moteur local face-recognition/dlib/NumPy.
La reconnaissance externe sera raccordée lorsque la documentation ou un exemple
de requête/réponse sera fourni. Aucun format fournisseur n’est supposé.

L’adaptateur interne `ar.visitor.recognition.provider._recognize(photo, terminal)`
doit retourner une personne Odoo identifiée ou un ensemble vide pour un inconnu.
Il doit lever une erreur en cas de panne, jamais transformer une panne en inconnu.
Le transport, l’authentification et la correspondance des identifiants restent à implémenter.

La route existante `POST /api/ar_visitors/v1/facial/check` conserve son authentification
par terminal (`X-AR-Terminal`, `X-AR-Secret`). En attendant, elle retourne HTTP 503
avec `recognition_not_configured`, sans créer de visite. Ce contrat de réception
existant pourra être adapté à votre système ; ce n’est pas le contrat de votre API.

## Installation et paramétrage

Copier ce dossier dans les addons et installer ou mettre à jour `ar_visitors`.
Dépendances Odoo : base, mail, hr, survey et web. Aucune bibliothèque faciale à installer.

- Attribuer les rôles Accueil / Responsable / Administrateur selon les utilisateurs.
- Configuration > Quiz par langue : associer un sondage français,
  anglais et espagnol, chacun rédigé dans sa langue. Le choix de langue ouvre directement le quiz.
  Configurer de vraies questions et désactiver l’obligation de connexion au sondage
  pour que les visiteurs puissent répondre sans compte Odoo.
- Paramètres : durée de validité du quiz (3 mois), durée de session de la borne,
  mise à jour des fiches existantes. Les scores servent uniquement aux analyses.
- Renseigner les e-mails professionnels des employés et le serveur sortant Odoo.
- Terminaux faciaux : conserver le code et le secret pour le futur raccordement.

## Tester maintenant, sans API

1. Visites > Toutes les visites > Nouveau.
2. Pour une nouvelle personne, saisir sa photo (facultative en test manuel), puis
   cliquer sur « Ouvrir le parcours visiteur » et compléter nom, prénom et CIN.
   Pour une personne connue, sélectionner sa fiche ou renseigner sa CIN.
3. Choisir FR / EN / ES dans la fenêtre. Le quiz s’ouvre dans une fenêtre intégrée.
4. Terminer le quiz, même avec un score nul : l’entrée s’enregistre et le parcours
   passe automatiquement au choix de la personne à visiter.
5. Confirmer l’hôte : sa notification est envoyée. Les erreurs d’envoi sont visibles
   sur la visite, avec un bouton de renvoi.
6. Dans la fiche de visite, cliquer sur « Marquer la sortie et signer ».
   La validation de la signature enregistre automatiquement la sortie.

Une personne connue ayant terminé son quiz il y a 3 mois ou moins passe directement
au choix de l’hôte. Une visite ne prolonge jamais la validité du quiz. Sans quiz ou
après expiration, le parcours linguistique est requis.

Une session borne expirée doit être rouverte depuis la fiche si la visite est encore
en cours de saisie ; une visite annulée nécessite une nouvelle visite.

## Stockage

Les personnes (nom, prénom, CIN, référence externe), quiz et visites sont enregistrés
dans la base Odoo. Les photos et signatures utilisent les pièces jointes Odoo et son
stockage configuré. Sauvegarder ensemble PostgreSQL et le filestore. Le dossier du
module ne contient pas les données des visiteurs. Les anciennes données ne sont
pas purgées par le nettoyage des fichiers sources.

## Vérification

Les tests métier sont dans `tests/` : parcours nouveaux/connus, expiration,
score nul, entrée, notification simulée, signature et adaptateur non connecté.
Exécuter sur une base isolée avec `--test-enable --test-tags /ar_visitors`.

Le nettoyage retire les scripts de démonstration, l’ancien générateur de guide,
le moteur facial local, son Dockerfile et ses dépendances. Les bibliothèques déjà
installées dans le serveur ne sont pas désinstallées par cette opération.

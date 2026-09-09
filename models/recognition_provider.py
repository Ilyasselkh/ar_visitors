from odoo import api, models, _
from odoo.exceptions import UserError


class RecognitionNotConfigured(UserError):
    pass


class VisitorRecognitionProvider(models.AbstractModel):
    _name = 'ar.visitor.recognition.provider'
    _description = 'Adaptateur de reconnaissance faciale externe'

    @api.model
    def _recognize(self, photo, terminal):
        """
        Reconnaître un visiteur à partir d'une photo et d'un terminal.
        """
        raise RecognitionNotConfigured(_(
            "API de reconnaissance non connectée. Utilisez le parcours manuel en attendant son intégration."
        ))

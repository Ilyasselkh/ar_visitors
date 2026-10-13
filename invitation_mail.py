"""Invitation HTML with inline styles and tables for email clients."""
from markupsafe import Markup


def invitation_body(text, company, planned_date, url, language='fr'):
    return Markup('''
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">%(intro)s</div>
<table role="presentation" width="100%%" cellspacing="0" cellpadding="0" border="0" bgcolor="#eef3f6" style="width:100%%;background-color:#eef3f6;font-family:Arial,Helvetica,sans-serif;color:#18334d;">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff" dir="%(direction)s" style="width:100%%;max-width:600px;background-color:#ffffff;border:1px solid #dce5eb;border-radius:16px;">
      <tr><td bgcolor="#18334d" style="padding:30px 32px;background-color:#18334d;border-radius:16px 16px 0 0;">
        <p style="margin:0;color:#ffffff;font-size:29px;font-weight:bold;letter-spacing:-1px;">ARaymond<span style="color:#52c69a;">.</span></p>
        <p style="margin:8px 0 0;color:#d9e5ef;font-size:13px;">%(reception)s</p>
      </td></tr>
      <tr><td style="padding:32px;">
        <p style="margin:0 0 10px;color:#198754;font-size:13px;font-weight:bold;">%(welcome)s</p>
        <h1 style="margin:0 0 18px;font-size:28px;line-height:1.25;color:#18334d;">%(title)s</h1>
        <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#526779;">%(intro)s</p>
        <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f1f6f8" style="width:100%%;background-color:#f1f6f8;border-radius:10px;">
          <tr><td style="padding:18px 20px;border-left:4px solid #198754;">
            <p style="margin:0 0 6px;font-size:12px;color:#526779;">%(date_label)s</p>
            <p style="margin:0;font-size:21px;font-weight:bold;color:#18334d;">%(date)s</p>
          </td></tr>
        </table>
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:28px 0;">
          <tr><td align="center" bgcolor="#198754" style="background-color:#198754;border-radius:8px;mso-padding-alt:16px 26px;">
            <a href="%(url)s" style="display:inline-block;padding:16px 26px;color:#ffffff;text-decoration:none;font-size:16px;font-weight:bold;">%(button)s &#8594;</a>
          </td></tr>
        </table>
        <p style="margin:0;padding:16px 0;border-top:1px solid #e2e9ee;font-size:12px;line-height:1.7;color:#667b8b;">%(personal)s</p>
        <p style="margin:8px 0 0;font-size:14px;line-height:1.6;color:#18334d;">%(closing)s</p>
      </td></tr>
      <tr><td bgcolor="#f8fafb" style="padding:20px 32px;background-color:#f8fafb;border-top:1px solid #e2e9ee;border-radius:0 0 16px 16px;">
        <p style="margin:0;font-size:12px;line-height:1.6;color:#667b8b;">%(company)s<br/>%(reception)s</p>
      </td></tr>
    </table>
  </td></tr>
</table>
''') % {
        'direction': 'rtl' if language == 'ar' else 'ltr',
        'reception': text['reception'], 'welcome': text['welcome'],
        'title': text['title'], 'intro': text['intro'],
        'date_label': text['date'], 'date': planned_date, 'url': url,
        'button': text['start'], 'personal': text['invite_body'],
        'closing': text['closing'], 'company': company,
    }

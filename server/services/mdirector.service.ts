/**
 * Servicio de integración con mDirector (mdirector.com)
 * Documentación: https://developers.mdirector.com
 *
 * Configura en .env:
 *   MDIRECTOR_API_KEY=tu_api_key
 *   MDIRECTOR_API_SECRET=tu_api_secret
 *   MDIRECTOR_FROM_EMAIL=noreply@tuempresa.com
 *   MDIRECTOR_FROM_NAME=CanTrack Staffing
 */

export interface SendEmailPayload {
  toEmail: string;
  toName?: string;
  subject: string;
  htmlBody: string;
  textBody?: string;
  // Para tracking interno
  companyId: string;
  employeeTypeId: string;
  sentByUserId: string;
}

export interface MDirectorResult {
  success: boolean;
  messageId?: string;
  error?: string;
  rawResponse?: any;
}

export class MDirectorService {
  private static readonly BASE_URL = 'https://api.mdirector.com';

  static get apiKey() {
    return process.env.MDIRECTOR_API_KEY;
  }

  static get apiSecret() {
    return process.env.MDIRECTOR_API_SECRET;
  }

  static get fromEmail() {
    return process.env.MDIRECTOR_FROM_EMAIL;
  }

  static get fromName() {
    return process.env.MDIRECTOR_FROM_NAME || 'CanTrack Staffing';
  }

  static isConfigured(): boolean {
    return !!(this.apiKey && this.apiSecret && this.fromEmail);
  }

  /**
   * Envía un email transaccional a través de la API de mDirector.
   * Ref: https://developers.mdirector.com/#api-Email-SendEmail
   */
  static async sendEmail(payload: SendEmailPayload): Promise<MDirectorResult> {
    if (!this.isConfigured()) {
      console.error('[mDirector] Credenciales no configuradas. Revisa MDIRECTOR_API_KEY, MDIRECTOR_API_SECRET y MDIRECTOR_FROM_EMAIL en .env');
      return { success: false, error: 'Servicio de email no configurado. Contacta al administrador.' };
    }

    const body = {
      api_key:    this.apiKey,
      api_secret: this.apiSecret,
      toEmail:    payload.toEmail,
      toName:     payload.toName || payload.toEmail,
      fromEmail:  this.fromEmail,
      fromName:   this.fromName,
      subject:    payload.subject,
      html:       payload.htmlBody,
      text:       payload.textBody || this.stripHtml(payload.htmlBody),
    };

    try {
      const response = await fetch(`${this.BASE_URL}/api_email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        console.error('[mDirector] Error HTTP:', response.status, data);
        return {
          success: false,
          error: data?.message || `Error ${response.status} al enviar email.`,
          rawResponse: data,
        };
      }

      // mDirector devuelve { status: 'ok', id: '...' } en caso de éxito
      if (data.status === 'ok' || data.success || response.status === 200) {
        return { success: true, messageId: data.id || data.messageId, rawResponse: data };
      }

      return { success: false, error: data?.message || 'Respuesta inesperada de mDirector.', rawResponse: data };
    } catch (err: any) {
      console.error('[mDirector] Error de red:', err.message);
      return { success: false, error: `Error de conectividad: ${err.message}` };
    }
  }

  /**
   * Construye el HTML del correo de oferta de personal.
   */
  static buildOfferEmailHtml(opts: {
    companyName: string;
    contactName?: string;
    employeeTypeName: string;
    employeeTypeDescription: string;
    customMessage?: string;
    senderName: string;
  }): string {
    const greeting = opts.contactName ? `Estimado/a ${opts.contactName}` : `Estimado/a equipo de ${opts.companyName}`;

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Oferta de Personal — ${opts.employeeTypeName}</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:'Segoe UI',Arial,sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.07);">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%);padding:32px 40px;">
            <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">
              CanTrack Staffing
            </h1>
            <p style="margin:4px 0 0;color:#bfdbfe;font-size:13px;">Soluciones de Personal Especializado</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:40px;">
            <p style="margin:0 0 20px;color:#1e293b;font-size:16px;">${greeting},</p>

            <p style="margin:0 0 20px;color:#475569;font-size:15px;line-height:1.7;">
              Nos ponemos en contacto con ustedes para presentarles nuestro perfil de
              <strong style="color:#2563eb;">${opts.employeeTypeName}</strong>,
              disponible para vinculación inmediata bajo modalidad de outsourcing, contrato temporal o nómina directa.
            </p>

            <!-- Profile Card -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;margin:24px 0;">
              <tr>
                <td style="padding:24px;">
                  <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#3b82f6;text-transform:uppercase;letter-spacing:0.8px;">Perfil Ofrecido</p>
                  <h2 style="margin:0 0 12px;font-size:20px;color:#1e3a5f;font-weight:700;">${opts.employeeTypeName}</h2>
                  <p style="margin:0;color:#334155;font-size:14px;line-height:1.6;">${opts.employeeTypeDescription}</p>
                </td>
              </tr>
            </table>

            ${opts.customMessage ? `
            <p style="margin:0 0 20px;color:#475569;font-size:15px;line-height:1.7;">${opts.customMessage.replace(/\n/g, '<br>')}</p>
            ` : ''}

            <p style="margin:0 0 20px;color:#475569;font-size:15px;line-height:1.7;">
              Si están interesados en conocer más detalles sobre este perfil, con gusto coordinamos una reunión
              para presentarles candidatos preseleccionados y hablar sobre condiciones de vinculación.
            </p>

            <!-- CTA -->
            <table cellpadding="0" cellspacing="0" style="margin:32px 0;">
              <tr>
                <td style="background:#2563eb;border-radius:8px;padding:14px 32px;">
                  <a href="mailto:${opts.senderName}" style="color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">
                    Solicitar información →
                  </a>
                </td>
              </tr>
            </table>

            <p style="margin:0;color:#64748b;font-size:14px;line-height:1.7;">
              Cordialmente,<br>
              <strong style="color:#1e293b;">${opts.senderName}</strong><br>
              <span style="color:#94a3b8;font-size:13px;">CanTrack Staffing</span>
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f1f5f9;padding:20px 40px;border-top:1px solid #e2e8f0;">
            <p style="margin:0;color:#94a3b8;font-size:11px;text-align:center;line-height:1.6;">
              Este correo fue enviado a <strong>${opts.companyName}</strong> a través de CanTrack CRM.<br>
              Si no desea recibir más comunicaciones, por favor responda con "No contactar".
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>

</body>
</html>`;
  }

  private static stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }
}
